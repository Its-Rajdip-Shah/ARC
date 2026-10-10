"""HTTP security headers applied to every response."""


class SecurityHeadersMiddleware:
    """Set a conservative baseline of browser security headers.

    The SPA is served by Vite (or a static host) separately from this API, so
    CSP here only constrains accidental HTML from the Django process (admin,
    browsable API, error pages). The API itself returns JSON.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault('X-Content-Type-Options', 'nosniff')
        response.setdefault('Referrer-Policy', 'same-origin')
        response.setdefault('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
        # Strict CSP on API JSON only — Swagger / Django admin need their own
        # assets when those surfaces are explicitly enabled.
        if request.path.startswith('/api/') and not request.path.startswith(
            ('/api/docs', '/api/redoc', '/api/schema')
        ):
            response.setdefault(
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            )
        return response
