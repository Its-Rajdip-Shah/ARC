import { apiClient } from '../lib/apiClient'

export function getCanvasConnection() {
  return apiClient.get('canvas/connection/').then((res) => res.data).catch((error) => {
    if (error?.response?.status === 404) return null
    throw error
  })
}

export function saveCanvasConnection(payload) {
  return apiClient.put('canvas/connection/', payload).then((res) => res.data)
}

export function deleteCanvasConnection() {
  return apiClient.delete('canvas/connection/').then((res) => res.data)
}

export function testCanvasConnection() {
  return apiClient.post('canvas/connection/test/').then((res) => res.data)
}

export function syncCanvas() {
  return apiClient.post('canvas/sync/').then((res) => res.data)
}

export function listSyncLogs(params) {
  return apiClient.get('canvas/sync-logs/', { params }).then((res) => res.data)
}

export function getSyncLog(id) {
  return apiClient.get(`canvas/sync-logs/${id}/`).then((res) => res.data)
}
