"""Frontend contract for scheduler flavour configuration."""

import pytest

from planning.models import SchedulingState


pytestmark = pytest.mark.django_db


def test_scheduler_settings_initially_unconfigured(api_for, user):
    response = api_for(user).get(
        "/api/planning/scheduler/settings/"
    )

    assert response.status_code == 200
    assert response.json() == {
        "flavour": None,
        "configured": False,
    }


def test_scheduler_settings_can_select_lock_in(api_for, user):
    response = api_for(user).put(
        "/api/planning/scheduler/settings/",
        {"flavour": "lock-in"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "flavour": "lock-in",
        "configured": True,
    }

    state = SchedulingState.objects.get(user=user)

    assert state.scheduler_flavour == "lock-in"


def test_scheduler_settings_can_select_monk(api_for, user):
    response = api_for(user).put(
        "/api/planning/scheduler/settings/",
        {"flavour": "monk"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "flavour": "monk",
        "configured": True,
    }

    assert (
        SchedulingState.objects.get(
            user=user,
        ).scheduler_flavour
        == "monk"
    )


def test_scheduler_settings_can_be_cleared(api_for, user):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    response = api_for(user).put(
        "/api/planning/scheduler/settings/",
        {"flavour": None},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "flavour": None,
        "configured": False,
    }

    state = SchedulingState.objects.get(user=user)

    assert state.scheduler_flavour is None


def test_scheduler_settings_reject_unknown_flavour(api_for, user):
    response = api_for(user).put(
        "/api/planning/scheduler/settings/",
        {"flavour": "whatever"},
        format="json",
    )

    assert response.status_code == 400

    assert not SchedulingState.objects.filter(
        user=user,
    ).exists()


def test_scheduler_settings_are_user_scoped(
    api_for,
    user,
    other_user,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    SchedulingState.objects.create(
        user=other_user,
        scheduler_flavour="monk",
    )

    response = api_for(user).get(
        "/api/planning/scheduler/settings/"
    )

    assert response.status_code == 200
    assert response.json()["flavour"] == "lock-in"

    response = api_for(other_user).get(
        "/api/planning/scheduler/settings/"
    )

    assert response.status_code == 200
    assert response.json()["flavour"] == "monk"


def test_flavour_change_keeps_saved_study_plan(api_for, user):
    """A flavour change clears scheduler_runtime. The study plan must stay."""
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="monk",
        scheduler_runtime={"sessions": [{"item_id": 1}]},
        study_plan={"sessions": [{"item_id": 9, "order": 1}]},
        study_preferences={"availability": [{"weekday": 0}]},
    )

    response = api_for(user).put(
        "/api/planning/scheduler/settings/",
        {"flavour": "lock-in"},
        format="json",
    )

    assert response.status_code == 200
    state = SchedulingState.objects.get(user=user)
    assert state.scheduler_runtime == {}
    assert state.study_plan == {"sessions": [{"item_id": 9, "order": 1}]}
    assert state.study_preferences == {"availability": [{"weekday": 0}]}
