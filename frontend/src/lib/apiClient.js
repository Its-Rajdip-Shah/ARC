import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

/**
 * Vite substitutes VITE_* at build time. A markdown-shaped value (the
 * accidental `[url](url)` form) is tolerated so a mistyped .env.local still
 * points at the backend instead of at a 404.
 */
function readBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'
  const match = String(raw).match(/https?:\/\/[^\s\]]+/)
  return (match ? match[0] : String(raw)).replace(/\/+$/, '')
}

export const API_BASE_URL = readBaseUrl()

const LOGIN_PATH = '/login'
const ADMIN_LOGIN_PATH = '/admin/login'

/**
 * Paths that return 401 as a legitimate business response (wrong password,
 * spent TOTP, expired enrolment token). Refreshing those would either loop
 * or redeem a leftover session against the wrong endpoint.
 */
const NO_REFRESH = /(?:^|\/)(?:health|auth\/(?:admin\/login|login|register|mfa|token\/refresh))(?:\/|$)/

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Bare client used only for the refresh call, so a 401 from SimpleJWT cannot
 * re-enter the interceptor and spin.
 */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else if (config.headers) {
    delete config.headers.Authorization
  }
  return config
})

let inflightRefresh = null

function redirectToLogin() {
  useAuthStore.getState().clearSession()
  const dest = window.location.pathname.startsWith('/admin')
    ? ADMIN_LOGIN_PATH
    : LOGIN_PATH
  if (window.location.pathname !== dest) {
    window.location.assign(dest)
  }
}

async function refreshSession() {
  const refresh = useAuthStore.getState().refreshToken
  if (!refresh) {
    throw new Error('No refresh token')
  }
  const { data } = await refreshClient.post('auth/token/refresh/', { refresh })
  useAuthStore.getState().setSession({
    access: data.access,
    refresh: data.refresh,
  })
  return data.access
}

function singleFlightRefresh() {
  if (!inflightRefresh) {
    inflightRefresh = refreshSession().finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error
    const status = response?.status
    const url = config?.url || ''

    if (
      status !== 401 ||
      !config ||
      config._retry ||
      NO_REFRESH.test(url) ||
      !useAuthStore.getState().refreshToken
    ) {
      return Promise.reject(error)
    }

    config._retry = true

    try {
      const access = await singleFlightRefresh()
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${access}`
      return apiClient(config)
    } catch {
      redirectToLogin()
      return Promise.reject(error)
    }
  },
)

export default apiClient
