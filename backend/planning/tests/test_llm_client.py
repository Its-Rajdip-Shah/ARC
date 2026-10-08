"""Fake-session coverage for the study-plan model client."""

import json

import pytest
import requests

from planning.services.llm import FailoverLLMClient, LLMClient, LLMError

KEY = 'sk-test-secret-do-not-leak'


class _Response:
    def __init__(self, payload, ok=True, broken=False, status=200):
        self._payload = payload
        self.ok = ok
        self.status_code = status
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


def test_busy_provider_is_named_as_temporary():
    session = _Session(_Response(
        {'error': {'message': f'high demand for {KEY}', 'status': 'UNAVAILABLE'}},
        ok=False,
        status=503,
    ))

    with pytest.raises(LLMError) as caught:
        _client(session).complete([])

    assert caught.value.code == 'unavailable'
    assert 'busy' in str(caught.value).lower()
    assert KEY not in str(caught.value)
    assert session.calls == 1


def test_failover_uses_the_second_provider_when_the_first_is_busy():
    busy = _Session(_Response(
        {'error': {'status': 'UNAVAILABLE'}},
        ok=False,
        status=503,
    ))
    ok = _Session(_completion(json.dumps({
        'sessions': [{'item_id': 2, 'order': 1}],
    })))
    chain = FailoverLLMClient([
        LLMClient('https://a.test/v1', 'key-a', 'model-a', session=busy),
        LLMClient('https://b.test/v1', 'key-b', 'model-b', session=ok),
    ])

    plan = chain.complete([])

    assert plan['sessions'][0]['item_id'] == 2
    assert busy.calls == 1
    assert ok.calls == 1


def test_failover_with_no_keys_is_not_configured():
    with pytest.raises(LLMError) as caught:
        FailoverLLMClient([]).complete([])

    assert caught.value.code == 'not_configured'


def test_failover_stops_when_the_shared_budget_is_spent(monkeypatch):
    clock = {'now': 100.0}

    def monotonic():
        return clock['now']

    monkeypatch.setattr('planning.services.llm.time.monotonic', monotonic)

    class _Hung:
        def __init__(self):
            self.timeout = 45
            self.calls = 0

        def complete(self, messages):
            self.calls += 1
            clock['now'] += self.timeout
            raise LLMError('The study plan service did not respond.', code='timeout')

    first = _Hung()
    second = _Hung()
    chain = FailoverLLMClient([first, second], timeout_budget=45)

    with pytest.raises(LLMError) as caught:
        chain.complete([])

    assert caught.value.code == 'timeout'
    assert first.calls == 1
    assert second.calls == 0
