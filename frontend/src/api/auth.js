import { apiClient } from '../lib/apiClient'

export function getHealth() {
  return apiClient.get('health/').then((res) => res.data)
}

export function register(payload) {
  return apiClient.post('auth/register/', payload).then((res) => res.data)
}

export function confirmMfaEnrolment(payload) {
  return apiClient.post('auth/mfa/enroll/confirm/', payload).then((res) => res.data)
}

export function login(payload) {
  return apiClient.post('auth/login/', payload).then((res) => res.data)
}

export function verifyMfa(payload) {
  return apiClient.post('auth/login/mfa/', payload).then((res) => res.data)
}

export function adminLogin(payload) {
  return apiClient.post('auth/admin/login/', payload).then((res) => res.data)
}

export function adminVerifyMfa(payload) {
  return apiClient.post('auth/admin/login/mfa/', payload).then((res) => res.data)
}

export function refreshTokens(refresh) {
  return apiClient.post('auth/token/refresh/', { refresh }).then((res) => res.data)
}

export function logout(refresh) {
  return apiClient.post('auth/logout/', { refresh }).then((res) => res.data)
}

export function getMe() {
  return apiClient.get('auth/me/').then((res) => res.data)
}


export function updateTimeZone(time_zone) {
  return apiClient.patch('auth/me/', { time_zone }, { timeout: 10000 }).then((res) => res.data)
}

export function changePassword(payload) {
  return apiClient.post('auth/password/change/', payload).then((res) => res.data)
}

export function requestPasswordReset(payload) {
  return apiClient.post('auth/password-reset/', payload).then((res) => res.data)
}

export function passwordResetStatus(token) {
  return apiClient.get(`auth/password-reset/status/${encodeURIComponent(token)}/`).then((res) => res.data)
}

export function confirmPasswordReset(payload) {
  return apiClient.post('auth/password-reset/confirm/', payload).then((res) => res.data)
}

export function requestAuthenticatorRecovery(payload) {
  return apiClient.post('auth/mfa/recover/', payload).then((res) => res.data)
}

export function confirmAuthenticatorRecovery(payload) {
  return apiClient.post('auth/mfa/recover/confirm/', payload).then((res) => res.data)
}

// Share the attempt across StrictMode effects and repeated hydration of the
// same profile. Failures leave the authenticated session and UTC fallback intact.
const timeZoneAttempts = new WeakMap()

export function initializeTimeZone(profile) {
  if (profile.time_zone != null) return Promise.resolve(profile)
  if (!timeZoneAttempts.has(profile)) {
    const attempt = (async () => {
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (!zone) return profile
        new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date())
        return await updateTimeZone(zone)
      } catch {
        return profile
      }
    })()
    timeZoneAttempts.set(profile, attempt)
  }
  return timeZoneAttempts.get(profile)
}
