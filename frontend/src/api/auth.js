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
