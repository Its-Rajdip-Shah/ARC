"""Server-only client for an OpenAI-compatible chat completions endpoint.

The API key is read from Django settings and is never put in an error
message. Callers inject ``session`` in tests.
"""

import json

import requests
from django.conf import settings
from requests import RequestException

TIMEOUT_SECONDS = 20


class LLMError(Exception):
    """The model call failed. The message is safe to show to a student."""


class LLMClient:
    def __init__(self, base_url, api_key, model, session=None, timeout=TIMEOUT_SECONDS):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.session = session or requests.Session()
        self.timeout = timeout

    def complete(self, messages):
        if not self.api_key:
            raise LLMError('The study plan service is not configured.')

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
            raise LLMError('The study plan service did not respond.') from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise LLMError(
                'The study plan service returned a response that was not JSON.'
            ) from exc

        if not response.ok:
            raise LLMError('The study plan service rejected the request.')

        return _parse_plan(payload)


def client_from_settings():
    return LLMClient(
        settings.LLM_API_BASE,
        settings.LLM_API_KEY,
        settings.LLM_MODEL,
        timeout=settings.LLM_TIMEOUT_SECONDS,
    )


def _parse_plan(payload):
    try:
        content = payload['choices'][0]['message']['content']
        parsed = json.loads(content) if isinstance(content, str) else content
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LLMError(
            'The study plan service returned a plan that could not be read.'
        ) from exc

    if not isinstance(parsed, dict) or not isinstance(parsed.get('sessions'), list):
        raise LLMError(
            'The study plan service returned a plan that could not be read.'
        )
    return parsed
