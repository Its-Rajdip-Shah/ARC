"""B2 task editor API regressions."""
from datetime import date
from decimal import Decimal
from unittest.mock import patch
import pytest
from planning.models import DurationCategory, PlanningDependency, PlanningHistoryEntry, Tag
from planning.services import dependencies, history, lifecycle
pytestmark = pytest.mark.django_db

@pytest.fixture
def client(api_for, user):
    return api_for(user)

def route(item):
    return f'/api/planning/items/{item.pk}/prerequisites/'

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
