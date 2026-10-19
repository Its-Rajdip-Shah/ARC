"""
URL configuration for arc_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
"""
from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def health_check(request):
    return JsonResponse({"status": "healthy", "message": "ARC Backend is connected!"})


urlpatterns = [
    path('api/health/', health_check),
    path('api/auth/', include('accounts.urls')),
    path('api/planning/', include('planning.urls')),
    path('api/canvas/', include('canvas_integration.urls')),
    path('api/admin/', include('analytics.urls')),
]

# Django's session admin is password-only (no TOTP). Keep it off unless an
# operator explicitly opts in for local debugging (FR-15).
if settings.ENABLE_DJANGO_ADMIN:
    urlpatterns.insert(0, path('admin/', admin.site.urls))

if settings.ENABLE_API_DOCS:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path(
            'api/docs/',
            SpectacularSwaggerView.as_view(url_name='schema'),
            name='swagger-ui',
        ),
        path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    ]
