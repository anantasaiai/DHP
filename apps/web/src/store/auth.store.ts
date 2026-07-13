import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Principal } from '@dhp/types';

interface AuthState {
  accessToken: string | null;
  principal: Principal | null;
  isAuthenticated: boolean;
  setTokens: (accessToken: string, principal: Principal) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      principal: null,
      isAuthenticated: false,
      setTokens: (accessToken, principal) =>
        set({ accessToken, principal, isAuthenticated: true }),
      logout: () =>
        set({ accessToken: null, principal: null, isAuthenticated: false }),
    }),
    {
      name: 'dhp-auth',
      partialize: (state) => ({ principal: state.principal }),
    },
  ),
);
