import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshAccessToken } from '@/api/client'

export type WebSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface WebSocketOptions<T> {
  enabled: boolean
  token: string | null
  onMessage: (message: T) => void
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000
const HEARTBEAT_INTERVAL_MS = 25_000
const HEARTBEAT_TIMEOUT_MS = 10_000

function tokenExpiry(token: string): number | null {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return null
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '='))) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function useWebSocket<T>({ enabled, token, onMessage }: WebSocketOptions<T>) {
  const [status, setStatus] = useState<WebSocketStatus>(enabled && token ? 'connecting' : 'disconnected')
  const socketRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!enabled || !token) {
      return
    }

    const accessToken = token
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined
    let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined
    let retryAttempt = 0
    let socket: WebSocket | undefined

    function scheduleTokenRefresh(expiry: number | null) {
      if (expiry === null) return
      const delay = Math.max(0, expiry - Date.now() - REFRESH_BEFORE_EXPIRY_MS)
      refreshTimer = setTimeout(() => {
        void refreshAccessToken().catch((error: unknown) => {
          if (!disposed) console.error('Unable to refresh the session for the live connection.', error)
        })
      }, delay)
    }

    async function connect() {
      if (disposed) return
      setStatus(retryAttempt === 0 ? 'connecting' : 'reconnecting')

      let connectionToken = accessToken
      const expiry = tokenExpiry(accessToken)
      if (expiry !== null && expiry <= Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
        try {
          connectionToken = await refreshAccessToken()
        } catch (error) {
          if (!disposed) {
            console.error('Unable to prepare the live connection.', error)
            retryAttempt += 1
            const delay = Math.min(1000 * 2 ** (retryAttempt - 1), 30_000)
            retryTimer = setTimeout(() => void connect(), delay)
          }
          return
        }
      }

      if (disposed || connectionToken !== accessToken) return

      const endpoint = new URL('/ws', import.meta.env.VITE_WS_BASE_URL || window.location.origin)
      endpoint.protocol = endpoint.protocol === 'https:' || endpoint.protocol === 'wss:' ? 'wss:' : 'ws:'
      endpoint.searchParams.set('token', connectionToken)
      socket = new WebSocket(endpoint)
      socketRef.current = socket
      scheduleTokenRefresh(expiry)

      socket.onopen = () => {
        retryAttempt = 0
        setStatus('connected')
        heartbeatInterval = setInterval(() => {
          if (socket?.readyState !== WebSocket.OPEN) return
          socket.send(JSON.stringify({ type: 'ping' }))
          heartbeatTimeout = setTimeout(() => socket?.close(), HEARTBEAT_TIMEOUT_MS)
        }, HEARTBEAT_INTERVAL_MS)
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as T & { type?: string }
          if (message.type === 'pong') {
            if (heartbeatTimeout) clearTimeout(heartbeatTimeout)
            heartbeatTimeout = undefined
            return
          }
          onMessageRef.current(message)
        } catch (error) {
          console.error('Unable to process a WebSocket message.', error)
        }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval)
        if (heartbeatTimeout) clearTimeout(heartbeatTimeout)
        if (socketRef.current === socket) socketRef.current = null
        if (disposed) return
        retryAttempt += 1
        setStatus('reconnecting')
        const delay = Math.min(1000 * 2 ** (retryAttempt - 1), 30_000)
        retryTimer = setTimeout(() => void connect(), delay)
      }
    }

    void connect()
    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (refreshTimer) clearTimeout(refreshTimer)
      if (heartbeatInterval) clearInterval(heartbeatInterval)
      if (heartbeatTimeout) clearTimeout(heartbeatTimeout)
      if (socketRef.current === socket) socketRef.current = null
      socket?.close()
    }
  }, [enabled, token])

  const send = useCallback((message: unknown) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [])

  return { status: enabled && token ? status : 'disconnected', send }
}
