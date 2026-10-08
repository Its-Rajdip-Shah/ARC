"""Server-only client for OpenAI-compatible chat completions.

Primary and fallback providers are read from Django settings. The API key
never appears in error messages. Callers inject ``session`` in tests.
"""

import json
import time

import requests
from django.conf import settings
from requests import RequestException

TIMEOUT_SECONDS = 20
BUSY_STATUSES = {429, 503}
PROVIDER_SLOTS = (1, 2, 3, 4, 5)


class LLMError(Exception):
    """The model call failed. The message is safe to show to a student."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


class LLMClient:
    def __init__(self, base_url, api_key, model, session=None, timeout=TIMEOUT_SECONDS):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.session = session or requests.Session()
        self.timeout = timeout

    def complete(self, messages):
        if not self.api_key:
            raise LLMError(
                'The study plan service is not configured.',
                code='not_configured',
            )

        # One attempt per provider. FailoverLLMClient owns retries by moving
        # to the next key instead of waiting on a busy Gemini host.
        try:
            response = self.session.post(
                f'{self.base_url}/chat/completions',
                headers={'Authorization': f'Bearer {self.api_key}'},
                json={
                    'model': self.model,
                    'messages': messages,
                    'response_format': {'type': 'json_object'},
                },
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise LLMError(
                'The study plan service did not respond.',
                code='timeout',
            ) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise LLMError(
                'The study plan service returned a response that was not JSON.',
                code='malformed',
            ) from exc

        if response.ok:
            return _parse_plan(payload)

        raise _reject_error(response.status_code)


class FailoverLLMClient:
    """Try each configured provider in order until one returns a plan.

    ``timeout_budget`` is the wall-clock cap for the whole chain, not per
    provider. A hung primary therefore cannot stack a full timeout onto
    every fallback key. Auth and model rejections return immediately and
    the next provider still runs inside whatever budget remains.
    """

    def __init__(self, clients, timeout_budget=None):
        self.clients = list(clients)
        self.timeout_budget = timeout_budget

    def complete(self, messages):
        if not self.clients:
            raise LLMError(
                'The study plan service is not configured.',
                code='not_configured',
            )

        deadline = None
        if self.timeout_budget is not None:
            deadline = time.monotonic() + self.timeout_budget

        last_error = None
        for client in self.clients:
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining < 1:
                    break
                client.timeout = min(client.timeout, remaining)
            try:
                return client.complete(messages)
            except LLMError as exc:
                last_error = exc
                continue

        if last_error is not None:
            raise last_error
        raise LLMError(
            'The study plan service did not respond.',
            code='timeout',
        )


def providers_from_settings():
    """Return (base, key, model) tuples for every non-empty API key slot."""
    rows = []
    for slot in PROVIDER_SLOTS:
        if slot == 1:
            base = settings.LLM_API_BASE
            key = settings.LLM_API_KEY
            model = settings.LLM_MODEL
        else:
            base = getattr(settings, f'LLM_API_BASE_{slot}', '') or settings.LLM_API_BASE
            key = getattr(settings, f'LLM_API_KEY_{slot}', '') or ''
            model = getattr(settings, f'LLM_MODEL_{slot}', '') or settings.LLM_MODEL
        if key:
            rows.append((base, key, model))
    return rows


def client_from_settings():
    timeout = settings.LLM_TIMEOUT_SECONDS
    clients = [
        LLMClient(base, key, model, timeout=timeout)
        for base, key, model in providers_from_settings()
    ]
    return FailoverLLMClient(clients, timeout_budget=timeout)


def _reject_error(status_code):
    if status_code in BUSY_STATUSES:
        return LLMError(
            'The study plan service is busy. Try again in a moment.',
            code='unavailable',
        )
    if status_code in (401, 403):
        return LLMError(
            'The study plan service rejected the API key.',
            code='rejected',
        )
    if status_code == 404:
        return LLMError(
            'The study plan model is not available on that provider.',
            code='rejected',
        )
    return LLMError(
        'The study plan service rejected the request.',
        code='rejected',
    )


def _parse_plan(payload):
    try:
        content = payload['choices'][0]['message']['content']
        parsed = json.loads(content) if isinstance(content, str) else content
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LLMError(
            'The study plan service returned a plan that could not be read.',
            code='malformed',
        ) from exc

    if not isinstance(parsed, dict) or not isinstance(parsed.get('sessions'), list):
        raise LLMError(
            'The study plan service returned a plan that could not be read.',
            code='malformed',
        )
    return parsed
