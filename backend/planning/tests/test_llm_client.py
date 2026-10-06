"""Fake-session coverage for the study-plan model client."""

import json

import pytest
import requests

from planning.services.llm import LLMClient, LLMError

KEY = 'sk-test-secret-do-not-leak'


class _Response:
    def __init__(self, payload, ok=True, broken=False):
        self._payload = payload
        self.ok = ok
        self.broken = broken

    def json(self):
        if self.broken:
            raise ValueError('not json')
        return self._payload


class _Session:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = 0

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls += 1
        if self.error:
            raise self.error
        return self.response


def _completion(content):
    return _Response({'choices': [{'message': {'content': content}}]})


def _client(session):
    return LLMClient(
        'https://llm.test/v1',
        KEY,
        'test-model',
        session=session,
    )


def test_happy_path_returns_the_parsed_plan():
    body = json.dumps({'sessions': [{'item_id': 1, 'order': 1}]})
    session = _Session(_completion(body))

    plan = _client(session).complete([{'role': 'user', 'content': 'plan'}])

    assert plan == {'sessions': [{'item_id': 1, 'order': 1}]}
    assert session.calls == 1


def test_malformed_payload_raises_without_the_api_key():
    session = _Session(_completion('not-json'))

    with pytest.raises(LLMError) as caught:
        _client(session).complete([])

    assert KEY not in str(caught.value)


def test_body_without_sessions_is_malformed():
    session = _Session(_completion(json.dumps({'note': 'hi'})))

    with pytest.raises(LLMError):
        _client(session).complete([])


def test_timeout_raises_without_the_api_key():
    session = _Session(error=requests.Timeout(f'timed out with {KEY}'))

    with pytest.raises(LLMError) as caught:
        _client(session).complete([])

    assert KEY not in str(caught.value)


def test_missing_api_key_does_not_call_the_network():
    session = _Session(_completion('{}'))
    client = LLMClient('https://llm.test/v1', '', 'test-model', session=session)

    with pytest.raises(LLMError) as caught:
        client.complete([])

    assert session.calls == 0
    assert KEY not in str(caught.value)
