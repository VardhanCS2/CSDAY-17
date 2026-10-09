import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshAccessToken } from '@/api/client'
import { useWebSocket } from '@/hooks/use-web-socket'

vi.mock('@/api/client', () => ({
  refreshAccessToken: vi.fn(),
}))

class MockWebSocket {
  static OPEN = 1
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  readonly url: string

  constructor(url: string | URL) {
    this.url = String(url)
    sockets.push(this)
  }

  send = vi.fn()

  close() {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close'))
  }
}

let sockets: MockWebSocket[] = []

describe('useWebSocket', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    sockets = []
  })

  it('reconnects with exponential delay and sends JSON when connected', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    const onMessage = vi.fn()
    const { result, unmount } = renderHook(() => useWebSocket({
      enabled: true,
      token: 'test-access-token',
      onMessage,
    }))

    expect(result.current.status).toBe('connecting')
    expect(sockets).toHaveLength(1)
    expect(new URL(sockets[0].url).searchParams.get('token')).toBe('test-access-token')

    act(() => {
      sockets[0].readyState = MockWebSocket.OPEN
      sockets[0].onopen?.(new Event('open'))
    })
    expect(result.current.status).toBe('connected')
    act(() => {
      expect(result.current.send({ type: 'ping' })).toBe(true)
    })
    expect(sockets[0].send).toHaveBeenCalledWith('{"type":"ping"}')

    act(() => sockets[0].close())
    expect(result.current.status).toBe('reconnecting')
    act(() => vi.advanceTimersByTime(999))
    expect(sockets).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(sockets).toHaveLength(2)
    expect(result.current.status).toBe('reconnecting')
    unmount()
  })

  it('refreshes the access token before it expires', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    const expiry = Math.floor((Date.now() + 120_000) / 1000)
    const payload = btoa(JSON.stringify({ exp: expiry })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const token = `header.${payload}.signature`
    vi.mocked(refreshAccessToken).mockResolvedValue('refreshed-token')

    const { rerender, unmount } = renderHook(
      ({ accessToken }) => useWebSocket({ enabled: true, token: accessToken, onMessage: vi.fn() }),
      { initialProps: { accessToken: token } },
    )
    expect(sockets).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(refreshAccessToken).toHaveBeenCalledOnce()

    rerender({ accessToken: 'refreshed-token' })
    expect(sockets).toHaveLength(2)
    expect(new URL(sockets[1].url).searchParams.get('token')).toBe('refreshed-token')
    unmount()
  })

  it('keeps a silent connection alive with ping/pong heartbeats', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    const onMessage = vi.fn()
    const { result, unmount } = renderHook(() => useWebSocket({
      enabled: true,
      token: 'test-access-token',
      onMessage,
    }))
    act(() => {
      sockets[0].readyState = MockWebSocket.OPEN
      sockets[0].onopen?.(new Event('open'))
      vi.advanceTimersByTime(25_000)
    })
    expect(sockets[0].send).toHaveBeenCalledWith('{"type":"ping"}')

    act(() => sockets[0].onmessage?.({ data: '{"type":"pong","data":{}}' } as MessageEvent))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.status).toBe('connected')
    expect(onMessage).not.toHaveBeenCalled()
    unmount()
  })

  it('reconnects when a heartbeat does not receive a pong', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    const { result, unmount } = renderHook(() => useWebSocket({
      enabled: true,
      token: 'test-access-token',
      onMessage: vi.fn(),
    }))
    act(() => {
      sockets[0].readyState = MockWebSocket.OPEN
      sockets[0].onopen?.(new Event('open'))
      vi.advanceTimersByTime(35_000)
    })
    expect(result.current.status).toBe('reconnecting')

    act(() => vi.advanceTimersByTime(1_000))
    expect(sockets).toHaveLength(2)
    unmount()
  })
})
