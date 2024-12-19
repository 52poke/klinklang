import { create } from 'zustand'
import type { User } from '../interfaces'

export interface UserState {
  currentUser: User | null
  fetchCurrentUser: () => Promise<void>
  logout: () => Promise<void>
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  fetchCurrentUser: async () => {
    const response = await fetch('/api/user/me')
    const { user } = await response.json() as { user: User | null }
    set({ currentUser: user })
  },
  logout: async () => {
    await fetch('/oauth/logout', { method: 'POST' })
    set({ currentUser: null })
  }
}))
