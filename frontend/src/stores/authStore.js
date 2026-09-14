import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const emptySession = {
  accessToken: null,
  refreshToken: null,
  user: null,
}

/**
 * Session store for the JWT pair.
 *
 * The access token lives in memory only, so a stolen localStorage dump is not
 * enough to call the API. The refresh token is persisted so a reload can mint
 * a new access token without sending the user through TOTP again.
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      ...emptySession,

      setSession: ({ access, refresh, user }) =>
        set({
          accessToken: access ?? get().accessToken,
          refreshToken: refresh ?? get().refreshToken,
          user: user ?? get().user,
        }),

      setAccessToken: (accessToken) => set({ accessToken }),

      setUser: (user) => set({ user }),

      clearSession: () => set(emptySession),
    }),
    {
      name: 'arc-auth',
      partialize: (state) => ({ refreshToken: state.refreshToken }),
    },
  ),
)
