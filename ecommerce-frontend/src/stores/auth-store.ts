import { create } from 'zustand'
import { api, responseData } from '@/api/client'
import { useCartStore } from '@/stores/cart-store'
import type { Session, User } from '@/types/models'

interface AuthState {
  token: string | null
  user: User | null
  loading: boolean
  updateToken: (token: string) => void
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  logout: () => void
  expireSession: () => void
}

let initialization: Promise<void> | null = null

function clearSession(set: (state: Partial<AuthState>) => void) {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  useCartStore.getState().clear()
  set({ token: null, user: null, loading: false })
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('access_token'),
  user: null,
  loading: Boolean(localStorage.getItem('access_token')),
  updateToken: (token) => set({ token }),
  initialize: async () => {
    if (!get().token) {
      set({ loading: false })
      return
    }
    if (!initialization) {
      initialization = api.get('/auth/me')
        .then((response) => set({ user: responseData<User>(response), loading: false }))
        .catch(() => clearSession(set))
        .finally(() => { initialization = null })
    }
    await initialization
  },
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    const session = responseData<Session>(response)
    localStorage.setItem('access_token', session.access_token)
    localStorage.setItem('refresh_token', session.refresh_token)
    set({ token: session.access_token, loading: true })
    try {
      const profile = await api.get('/auth/me')
      const user = responseData<User>(profile)
      set({ user, loading: false })
      return user
    } catch (error) {
      clearSession(set)
      throw error
    }
  },
  register: async (name, email, password) => {
    await api.post('/auth/register', { name, email, password })
    return get().login(email, password)
  },
  logout: () => clearSession(set),
  expireSession: () => clearSession(set),
}))