import { apiClient } from '../lib/apiClient'

export function getAdminStats() {
  return apiClient.get('admin/stats/').then((res) => res.data)
}

export function listAdminUsers(params) {
  return apiClient.get('admin/users/', { params }).then((res) => res.data)
}

export function getAdminUser(id) {
  return apiClient.get(`admin/users/${id}/`).then((res) => res.data)
}

export function lockUser(id) {
  return apiClient.post(`admin/users/${id}/lock/`).then((res) => res.data)
}

export function unlockUser(id) {
  return apiClient.post(`admin/users/${id}/unlock/`).then((res) => res.data)
}
