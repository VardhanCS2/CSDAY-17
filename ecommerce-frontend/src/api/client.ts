import axios from 'axios'
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiEnvelope, Session } from '@/types/models'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { Accept: 'application/json' },
  timeout: 15000,
})

let refreshPromise: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) {
      const error = new Error('Your session has expired. Please sign in again.')
      window.dispatchEvent(new Event('session-expired'))
      return Promise.reject(error)
    }

    refreshPromise = axios.post<ApiEnvelope<Session>>(
      `${api.defaults.baseURL}/auth/refresh`,
      { refresh_token: refreshToken },
      { timeout: api.defaults.timeout },
    ).then((response) => {
      const session = response.data.data
      localStorage.setItem('access_token', session.access_token)
      localStorage.setItem('refresh_token', session.refresh_token)
      window.dispatchEvent(new CustomEvent('access-token-refreshed', { detail: session.access_token }))
      return session.access_token
    }).catch((error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.dispatchEvent(new Event('session-expired'))
      }
      throw error
    }).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: unknown; message?: string }>) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (error.response?.status === 401 && request && !request._retry && !request.url?.includes('/auth/refresh')) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        request._retry = true
        refreshPromise ??= axios.post<ApiEnvelope<Session>>(
          `${api.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: api.defaults.timeout },
        ).then((response) => {
          const session = response.data.data
          localStorage.setItem('access_token', session.access_token)
          localStorage.setItem('refresh_token', session.refresh_token)
          window.dispatchEvent(new CustomEvent('access-token-refreshed', { detail: session.access_token }))
          return session.access_token
        }).finally(() => {
          refreshPromise = null
        })

        try {
          const accessToken = await refreshPromise
          request.headers.Authorization = `Bearer ${accessToken}`
          return api(request)
        } catch (refreshError) {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.dispatchEvent(new Event('session-expired'))
          return Promise.reject(refreshError)
        }
      }

      if (localStorage.getItem('access_token')) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.dispatchEvent(new Event('session-expired'))
      }
    }
    return Promise.reject(error)
  },
)

export function responseData<T>(response: AxiosResponse<ApiEnvelope<T>>): T {
  return response.data.data
}

export function errorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Something went wrong.'
  }
  const responseError = error as AxiosError<{ detail?: unknown; message?: string }>
  const detail = responseError.response?.data?.detail
  if (Array.isArray(detail)) {
    return detail.map((item: unknown) => {
      if (typeof item === 'object' && item !== null && 'msg' in item && typeof item.msg === 'string') return item.msg
      return 'Invalid request.'
    }).join(', ')
  }
  if (typeof detail === 'string') return detail
  return responseError.response?.data?.message || responseError.message || 'Something went wrong.'
}