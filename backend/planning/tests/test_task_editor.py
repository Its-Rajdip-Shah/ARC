"""B2 task editor API regressions."""
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
import pytest
from planning.models import DurationCategory, PlanningDependency, PlanningHistoryEntry, PlanningItem, Tag
from planning.services import dependencies, history, lifecycle
pytestmark = pytest.mark.django_db

@pytest.fixture
def client(api_for, user):
    return api_for(user)

def route(item):
    return f'/api/planning/items/{item.pk}/prerequisites/'


def graph_route(item):
    return f'/api/planning/items/{item.pk}/dependency_graph/'


def test_dependency_graph_returns_transitive_component_in_directional_order(client, user, make_item):
    a = make_item(user, 'Same name')
    b = make_item(user, 'Middle')
    c = make_item(user, 'Same name')
    d = make_item(user, 'Branch')
    isolated = make_item(user, 'Isolated')
    for prerequisite, dependent in ((a, b), (b, c), (a, d)):
        PlanningDependency.objects.create(prerequisite=prerequisite, dependent=dependent)

    response = client.get(graph_route(b))

    assert response.status_code == 200, response.data
    assert {node['id'] for node in response.data['nodes']} == {a.pk, b.pk, c.pk, d.pk}
    assert isolated.pk not in {node['id'] for node in response.data['nodes']}
    assert response.data['edges'] == [
        {'prerequisite_id': a.pk, 'dependent_id': b.pk},
        {'prerequisite_id': a.pk, 'dependent_id': d.pk},
        {'prerequisite_id': b.pk, 'dependent_id': c.pk},
    ]


def test_dependency_graph_is_user_scoped(client, user, other_user, make_item):
    own = make_item(user, 'own')
    foreign = make_item(other_user, 'secret')

    assert client.get(graph_route(foreign)).status_code == 404
    assert client.get(graph_route(own)).data['nodes'] == [{
        'id': own.pk, 'title': 'own', 'description': '', 'item_type': own.item_type,
        'ancestry': [],
    }]


def test_dependency_graph_includes_visible_parent_ancestry_without_n_plus_one(client, user, other_user, make_item, django_assert_num_queries):
    root = make_item(user, 'Project')
    assignment = make_item(user, 'Assignment', parent=root)
    prerequisite = make_item(user, 'Duplicate', parent=assignment)
    dependent = make_item(user, 'Duplicate', description='A detailed task description.')
    foreign_parent = make_item(other_user, 'Private')
    PlanningDependency.objects.create(prerequisite=prerequisite, dependent=dependent)

    # get_object loads its owner for the IsOwner backstop and retains the
    # viewset's tags prefetch (two queries); the component edges and full
    # visible hierarchy add exactly two bulk queries.
    with django_assert_num_queries(4):
        response = client.get(graph_route(dependent))

    assert response.status_code == 200
    nodes = {node['id']: node for node in response.data['nodes']}
    assert nodes[prerequisite.pk]['ancestry'] == [
        {'id': root.pk, 'title': 'Project'}, {'id': assignment.pk, 'title': 'Assignment'},
    ]
    assert nodes[dependent.pk]['ancestry'] == []
    assert nodes[dependent.pk]['description'] == 'A detailed task description.'
    assert foreign_parent.title not in str(response.data)

def test_dependency_lifecycle_history_and_duplicates(client, user, make_item):
    a, b = [make_item(user, title) for title in ('a', 'b')]
    with patch.object(lifecycle, 'finish', wraps=lifecycle.finish) as finish:
        response = client.post(route(b), {'prerequisite_id': a.pk}, format='json')
        assert response.status_code == 200, response.data
        finish.assert_called_once_with(user)
    assert [row['id'] for row in response.data] == [a.pk]
    assert client.get(route(b)).data == response.data
    assert client.post(route(b), {'prerequisite_id': a.pk}, format='json').status_code == 200
    assert PlanningDependency.objects.count() == 1
    assert client.post('/api/planning/items/undo/').status_code == 200
    assert not PlanningDependency.objects.exists()
    assert client.post('/api/planning/items/redo/').status_code == 200
    assert PlanningDependency.objects.count() == 1
    with patch.object(lifecycle, 'finish', wraps=lifecycle.finish) as finish:
        response = client.delete(route(b), {'prerequisite_id': a.pk}, format='json')
        assert response.status_code == 200, response.data
        finish.assert_called_once_with(user)
    assert response.data == []
    assert client.post('/api/planning/items/undo/').status_code == 200
    assert PlanningDependency.objects.count() == 1
    assert client.post('/api/planning/items/redo/').status_code == 200
    assert not PlanningDependency.objects.exists()


@pytest.mark.parametrize('method', ['post', 'delete'])
def test_dependency_noops_skip_services_history_and_lifecycle(client, user, make_item, method):
    a, b = [make_item(user, title) for title in ('a', 'b')]
    if method == 'post':
        assert client.post(route(b), {'prerequisite_id': a.pk}, format='json').status_code == 200
    else:
        # An absent-edge DELETE must also preserve the redo branch.
        assert client.post(route(b), {'prerequisite_id': a.pk}, format='json').status_code == 200
        assert client.post('/api/planning/items/undo/').status_code == 200
    before = list(PlanningHistoryEntry.objects.filter(user=user).values())
    expected = client.get(route(b)).data
    with (
        patch.object(dependencies, 'add') as add,
        patch.object(dependencies, 'remove') as remove,
        patch.object(history, 'record_checkpoint') as checkpoint,
        patch.object(lifecycle, 'finish') as finish,
    ):
        response = getattr(client, method)(route(b), {'prerequisite_id': a.pk}, format='json')
        assert response.status_code == 200, response.data
        assert response.data == expected
        add.assert_not_called()
        remove.assert_not_called()
        checkpoint.assert_not_called()
        finish.assert_not_called()
    assert list(PlanningHistoryEntry.objects.filter(user=user).values()) == before
    assert PlanningDependency.objects.count() == (1 if method == 'post' else 0)
    if method == 'delete':
        assert client.post('/api/planning/items/redo/').status_code == 200
        assert PlanningDependency.objects.count() == 1

def test_dependency_invalid_edges_are_atomic(client, user, make_item):
    a, b = [make_item(user, title) for title in ('a', 'b')]
    assert client.post(route(b), {'prerequisite_id': a.pk}, format='json').status_code == 200
    for dependent, prerequisite in ((a, b), (a, a)):
        response = client.post(route(dependent), {'prerequisite_id': prerequisite.pk}, format='json')
        assert response.status_code == 400, response.data
    assert PlanningDependency.objects.count() == 1
    b.is_completed = True
    b.save(update_fields=['is_completed'])
    c = make_item(user, 'unfinished')
    assert client.post(route(b), {'prerequisite_id': c.pk}, format='json').status_code == 400
    assert PlanningDependency.objects.count() == 1

@pytest.mark.parametrize('method', ['get', 'post', 'delete'])
def test_dependency_isolation(client, api, user, other_user, make_item, method):
    own = make_item(user, 'own')
    foreign = make_item(other_user, 'secret')
    deleted = make_item(user, 'deleted', is_deleted=True)
    data = {'prerequisite_id': own.pk}
    assert getattr(api, method)(route(own), data, format='json').status_code in (401, 403)
    for hidden in (foreign, deleted):
        response = getattr(client, method)(route(hidden), data, format='json')
        assert response.status_code == 404
        assert hidden.title not in str(response.data)
        if method != 'get':
            assert getattr(client, method)(route(own), {'prerequisite_id': hidden.pk}, format='json').status_code == 404
    assert not PlanningDependency.objects.exists()

def test_date_inheritance_and_explicit_clearing(client, user, make_item):
    parent = make_item(user, 'parent', start_date=date(2026, 11, 1), due_date=date(2026, 11, 5))
    response = client.post('/api/planning/items/', {'item_type': 'TASK', 'title': 'child', 'parent': parent.pk}, format='json')
    assert response.status_code == 201, response.data
    assert response.data['start_date'] == '2026-11-01'
    assert response.data['due_date'] == '2026-11-05'
    url = f"/api/planning/items/{response.data['id']}/"
    response = client.patch(url, {'start_date': None, 'due_date': None}, format='json')
    assert response.status_code == 200, response.data
    assert response.data['start_date'] is response.data['due_date'] is None
    response = client.post('/api/planning/items/', {'item_type': 'TASK', 'title': 'clear child', 'parent': parent.pk, 'start_date': None, 'due_date': None}, format='json')
    assert response.status_code == 201, response.data
    assert response.data['start_date'] is response.data['due_date'] is None
    parent.refresh_from_db()
    assert parent.start_date == date(2026, 11, 1)
    assert parent.due_date == date(2026, 11, 5)
    assert client.patch(url, {'start_date': '2026-11-06', 'due_date': '2026-11-05'}, format='json').status_code == 400
    assert client.patch(url, {'start_date': ''}, format='json').status_code == 400


def test_inherited_due_date_tracks_parent_until_the_child_is_explicit(client, user, make_item):
    parent = make_item(user, 'parent', due_date=date(2026, 11, 5))
    created = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'child', 'parent': parent.pk,
    }, format='json')
    assert created.status_code == 201, created.data
    child_url = f"/api/planning/items/{created.data['id']}/"
    assert created.data['due_date_inherited'] is True

    response = client.patch(f'/api/planning/items/{parent.pk}/', {
        'due_date': '2026-11-12',
    }, format='json')
    assert response.status_code == 200, response.data
    assert client.get(child_url).data['due_date'] == '2026-11-12'

    assert client.patch(child_url, {'due_date': None}, format='json').status_code == 200
    assert client.patch(f'/api/planning/items/{parent.pk}/', {
        'due_date': None,
    }, format='json').status_code == 200
    child = client.get(child_url).data
    assert child['due_date'] is None
    assert child['due_date_inherited'] is False


def test_inherited_due_date_propagates_through_multiple_generations(client, user, make_item):
    parent = make_item(user, 'parent')
    child = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'child', 'parent': parent.pk,
    }, format='json').data
    grandchild = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'grandchild', 'parent': child['id'],
    }, format='json').data
    assert child['due_date_inherited'] is grandchild['due_date_inherited'] is True

    assert client.patch(f'/api/planning/items/{parent.pk}/', {
        'due_date': '2026-11-12',
    }, format='json').status_code == 200
    assert client.get(f"/api/planning/items/{child['id']}/").data['due_date'] == '2026-11-12'
    assert client.get(f"/api/planning/items/{grandchild['id']}/").data['due_date'] == '2026-11-12'


def test_existing_parent_due_assignment_updates_inherited_descendants_but_not_explicit_overrides(client, user, make_item):
    parent = make_item(user, 'existing parent')
    inherited_child = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'inherited child', 'parent': parent.pk,
    }, format='json').data
    inherited_grandchild = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'inherited grandchild', 'parent': inherited_child['id'],
    }, format='json').data
    explicit_child = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'explicit child', 'parent': parent.pk,
        'due_date': '2026-11-18',
    }, format='json').data

    response = client.patch(f'/api/planning/items/{parent.pk}/', {
        'due_date': '2026-11-12',
    }, format='json')
    assert response.status_code == 200, response.data
    assert client.get(f"/api/planning/items/{inherited_child['id']}/").data['due_date'] == '2026-11-12'
    assert client.get(f"/api/planning/items/{inherited_grandchild['id']}/").data['due_date'] == '2026-11-12'
    assert client.get(f"/api/planning/items/{explicit_child['id']}/").data['due_date'] == '2026-11-18'

    assert client.patch(f'/api/planning/items/{parent.pk}/', {
        'due_date': '2026-11-15',
    }, format='json').status_code == 200
    assert client.get(f"/api/planning/items/{inherited_grandchild['id']}/").data['due_date'] == '2026-11-15'
    assert client.get(f"/api/planning/items/{explicit_child['id']}/").data['due_date'] == '2026-11-18'


def test_pre_0021_child_dates_are_not_guessed_to_be_inherited(client, user, make_item):
    """The migration default is intentionally conservative for legacy rows."""
    parent = make_item(user, 'legacy parent', due_date=date(2026, 11, 5))
    legacy_child = make_item(
        user,
        'legacy child',
        parent=parent,
        due_date=date(2026, 11, 5),
        due_date_inherited=False,
    )

    response = client.patch(f'/api/planning/items/{parent.pk}/', {
        'due_date': '2026-11-12',
    }, format='json')

    assert response.status_code == 200, response.data
    legacy_child.refresh_from_db()
    assert legacy_child.due_date == date(2026, 11, 5)
    assert legacy_child.due_date_inherited is False


@pytest.fixture
def fixed_today():
    today = date(2026, 10, 12)
    with patch('planning.serializers.user_local_date', return_value=today):
        yield today


@pytest.mark.parametrize('offset, expected_status', [(-1, 400), (0, 201), (1, 201)])
def test_explicit_due_date_on_create(client, user, fixed_today, offset, expected_status):
    due = fixed_today + timedelta(days=offset)
    response = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'explicit due date', 'due_date': due.isoformat(),
    }, format='json')
    assert response.status_code == expected_status, response.data
    if expected_status == 400:
        assert response.data['error']['code'] == 'invalid'
        assert response.data['error']['fields']['due_date'] == ['Due date cannot be earlier than today.']
        assert not PlanningItem.objects.filter(user=user, title='explicit due date').exists()
    else:
        assert response.data['due_date'] == due.isoformat()


@pytest.mark.parametrize('historical', [False, True])
def test_changing_due_date_to_past_is_rejected(client, user, make_item, fixed_today, historical):
    original_due = fixed_today + timedelta(days=-2 if historical else 1)
    item = make_item(user, 'existing', due_date=original_due)
    response = client.patch(f'/api/planning/items/{item.pk}/', {
        'due_date': (fixed_today - timedelta(days=1)).isoformat(),
    }, format='json')
    assert response.status_code == 400, response.data
    assert response.data['error']['code'] == 'invalid'
    assert response.data['error']['fields']['due_date'] == ['Due date cannot be earlier than today.']
    item.refresh_from_db()
    assert item.due_date == original_due


@pytest.mark.parametrize('due_action', ['omit', 'unchanged', 'clear'])
def test_historical_due_date_edits_remain_allowed(client, user, make_item, fixed_today, due_action):
    historical_due = fixed_today - timedelta(days=2)
    item = make_item(user, 'historical', due_date=historical_due)
    payload = {'title': 'updated title'}
    if due_action != 'omit':
        payload['due_date'] = historical_due.isoformat() if due_action == 'unchanged' else None
    response = client.patch(f'/api/planning/items/{item.pk}/', payload, format='json')
    assert response.status_code == 200, response.data
    expected_due = None if due_action == 'clear' else historical_due
    assert response.data['title'] == 'updated title'
    assert response.data['due_date'] == (expected_due.isoformat() if expected_due else None)
    item.refresh_from_db()
    assert item.title == 'updated title'
    assert item.due_date == expected_due


@pytest.mark.parametrize('offset', [-2, 1])
def test_omitted_child_due_date_inherits_even_historical_date(client, user, make_item, fixed_today, offset):
    due = fixed_today + timedelta(days=offset)
    start = due - timedelta(days=2)
    parent = make_item(user, 'parent', start_date=start, due_date=due)
    response = client.post('/api/planning/items/', {
        'item_type': 'TASK', 'title': 'child', 'parent': parent.pk,
    }, format='json')
    assert response.status_code == 201, response.data
    assert response.data['start_date'] == start.isoformat()
    assert response.data['due_date'] == due.isoformat()
    child = PlanningItem.objects.get(pk=response.data['id'])
    assert child.due_date == due
    parent.refresh_from_db()
    assert parent.start_date == start
    assert parent.due_date == due


@pytest.mark.parametrize('method', ['post', 'patch'])
@pytest.mark.parametrize('offset', [-1, 1])
def test_start_after_due_still_rejected_first(client, user, make_item, fixed_today, method, offset):
    due = fixed_today + timedelta(days=offset)
    url = '/api/planning/items/'
    if method == 'patch':
        item = make_item(user, 'existing')
        url = f'{url}{item.pk}/'
    response = getattr(client, method)(url, {
        'item_type': 'TASK', 'title': 'invalid dates',
        'start_date': (due + timedelta(days=1)).isoformat(), 'due_date': due.isoformat(),
    }, format='json')
    assert response.status_code == 400, response.data
    assert response.data['error']['code'] == 'invalid'
    assert response.data['error']['fields']['due_date'] == ['A due date cannot fall before the start date.']


@pytest.mark.parametrize('time_zone, instant, due, expected_status', [
    ('Australia/Sydney', '2026-10-12T13:30:00+00:00', '2026-10-12', 400),
    ('UTC', '2026-10-12T13:30:00+00:00', '2026-10-12', 201),
    ('America/Los_Angeles', '2026-10-12T00:30:00+00:00', '2026-10-11', 201),
    ('UTC', '2026-10-12T00:30:00+00:00', '2026-10-11', 400),
])
def test_account_timezone_due_date_boundary(client, user, time_zone, instant, due, expected_status):
    user.time_zone = time_zone
    user.save(update_fields=['time_zone'])
    with patch('planning.services.calendar_dates.timezone.now', return_value=datetime.fromisoformat(instant)):
        response = client.post('/api/planning/items/', {
            'item_type': 'TASK', 'title': 'timezone boundary', 'due_date': due,
        }, format='json')
    assert response.status_code == expected_status, response.data
    if expected_status == 400:
        assert response.data['error']['code'] == 'invalid'
        assert response.data['error']['fields']['due_date'] == ['Due date cannot be earlier than today.']
    else:
        assert response.data['due_date'] == due

def test_tags_deduplicate_and_enforce_ownership(client, user, other_user):
    tag = Tag.objects.create(user=user, name='Study')
    foreign = Tag.objects.create(user=other_user, name='Secret')
    response = client.post('/api/planning/items/', {'item_type': 'TASK', 'title': 'child', 'tag_ids': [tag.pk, tag.pk]}, format='json')
    assert response.status_code == 201, response.data
    expected = [{'id': tag.pk, 'name': tag.name}]
    assert response.data['tags'] == expected
    url = f"/api/planning/items/{response.data['id']}/"
    assert client.patch(url, {'tag_ids': [foreign.pk]}, format='json').status_code == 400
    assert client.patch(url, {'tag_ids': []}, format='json').data['tags'] == []
    assert client.patch(url, {'tag_ids': [tag.pk, tag.pk]}, format='json').data['tags'] == expected
    assert client.post('/api/planning/tags/', {'name': 'study'}, format='json').status_code == 400

def test_partial_estimate_survives_edit(client, user, make_item):
    item = make_item(user, 'partial', duration_category=DurationCategory.UNDER_8_HOURS, percent_completed=Decimal('25'))
    with patch.object(lifecycle, 'finish', wraps=lifecycle.finish) as finish:
        response = client.patch(f'/api/planning/items/{item.pk}/', {'duration_category': DurationCategory.UNDER_16_HOURS}, format='json')
        assert response.status_code == 200, response.data
        finish.assert_called_once_with(user)
    assert response.data['duration_category'] == DurationCategory.UNDER_16_HOURS
    assert Decimal(str(response.data['percent_completed'])) == 25
    assert Decimal(response.data['remaining_fraction']) == Decimal('0.75')
    tree = client.get('/api/planning/items/tree/').data
    assert Decimal(tree[0]['remaining_fraction']) == Decimal('0.75')
    assert client.post(f'/api/planning/items/{item.pk}/complete/', {}, format='json').status_code == 200
    assert client.get(f'/api/planning/items/{item.pk}/').data['remaining_fraction'] == '0'


def test_residual_eligibility_is_separate_from_original_estimate(user, make_item):
    from planning.services.scheduler_v1 import _structural_candidates, _remaining_fraction
    parent = make_item(user, 'residual', duration_category=DurationCategory.UNDER_8_HOURS, percent_completed=Decimal('25'))
    child = make_item(user, 'child', parent=parent)
    assert not _structural_candidates(user).filter(pk=parent.pk).exists()
    child.is_completed = True
    child.save(update_fields=['is_completed'])
    residual = _structural_candidates(user).get(pk=parent.pk)
    assert residual.is_residual is True
    assert residual.duration_category == DurationCategory.UNDER_8_HOURS
    assert residual.percent_completed == 25
    assert _remaining_fraction(residual) == Decimal('0.75')
    parent.is_completed = True
    parent.save(update_fields=['is_completed'])
    assert not _structural_candidates(user).filter(pk=parent.pk).exists()
