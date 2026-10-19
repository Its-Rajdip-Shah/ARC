"""The shared error envelope (arc_exception_handler)."""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework.exceptions import NotFound, ValidationError

from core.exceptions import arc_exception_handler


def test_field_errors_keep_the_strings_and_a_generic_message():
    response = arc_exception_handler(ValidationError({'email': ['Already used.']}), {})

    assert response.status_code == 400
    assert response.data['error']['code'] == 'invalid'
    assert response.data['error']['message'] == 'The submitted data is invalid.'
    assert response.data['error']['fields'] == {'email': ['Already used.']}


def test_a_django_validation_error_does_not_become_a_server_error():
    response = arc_exception_handler(DjangoValidationError('Release cannot follow deadline.'), {})

    assert response.status_code == 400
    assert response.data['error']['fields']['non_field_errors'] == ['Release cannot follow deadline.']


def test_a_missing_resource_is_not_found():
    response = arc_exception_handler(Http404(), {})

    assert response.status_code == 404
    assert response.data['error']['code'] == 'not_found'
    assert response.data['error']['message'] == 'The requested resource was not found.'


def test_django_permission_denied_stays_a_403():
    response = arc_exception_handler(DjangoPermissionDenied(), {})

    assert response.status_code == 403
    assert response.data['error']['code'] == 'permission_denied'


def test_a_list_validation_error_is_grouped_under_non_field_errors():
    response = arc_exception_handler(ValidationError(['Too short.']), {})

    assert response.data['error']['fields'] == {'non_field_errors': ['Too short.']}


def test_an_unexpected_exception_is_left_for_django():
    assert arc_exception_handler(RuntimeError('boom'), {}) is None


def test_drf_not_found_uses_its_own_code():
    response = arc_exception_handler(NotFound('Gone.'), {})

    assert response.status_code == 404
    assert response.data['error']['code'] == 'not_found'
    assert response.data['error']['message'] == 'Gone.'
