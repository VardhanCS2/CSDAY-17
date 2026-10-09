import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCart } from '@/hooks/use-cart'
import { useAuthStore } from '@/stores/auth-store'
import { useCartStore } from '@/stores/cart-store'
import type { ReactNode } from 'react'

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  useCart()

  useEffect(() => {
    void useAuthStore.getState().initialize()
  }, [])

  useEffect(() => {
    const expireSession = () => {
      useAuthStore.getState().expireSession()
      queryClient.removeQueries({ queryKey: ['cart'] })
    }
    const updateAccessToken = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        useAuthStore.getState().updateToken(event.detail)
      }
    }
    window.addEventListener('session-expired', expireSession)
    window.addEventListener('access-token-refreshed', updateAccessToken)
    return () => {
      window.removeEventListener('session-expired', expireSession)
      window.removeEventListener('access-token-refreshed', updateAccessToken)
    }
  }, [queryClient])

  useEffect(() => {
    if (!user) useCartStore.getState().clear()
  }, [user])

  return children
}
