import { create } from 'zustand';
import { api, refreshSession, session } from '@/api/client';
import { tokenStorage } from '@/api/tokenStorage';
import type { Language, User } from '@/api/types';
import { changeLanguage } from '@/i18n';

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  language: Language;
}

interface AuthState {
  user: User | null;
  status: 'loading' | 'signedIn' | 'signedOut';
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

async function startSession(data: AuthResponse, set: (s: Partial<AuthState>) => void) {
  session.setAccessToken(data.accessToken);
  await tokenStorage.setRefreshToken(data.refreshToken);
  // The language saved on the profile follows the user across devices.
  await changeLanguage(data.user.language);
  set({ user: data.user, status: 'signedIn' });
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',

  async bootstrap() {
    const token = await refreshSession();
    if (!token) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const { data } = await api.get<{ user: User }>('/auth/me');
      await changeLanguage(data.user.language);
      set({ user: data.user, status: 'signedIn' });
    } catch {
      set({ status: 'signedOut', user: null });
    }
  },

  async login(email, password) {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    await startSession(data, set);
  },

  async register(input) {
    const { data } = await api.post<AuthResponse>('/auth/register', input);
    await startSession(data, set);
  },

  async logout() {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    await tokenStorage.setRefreshToken(null);
    session.setAccessToken(null);
    set({ user: null, status: 'signedOut' });
  },

  setUser(user) {
    set({ user });
  },

  async refreshUser() {
    if (get().status !== 'signedIn') return;
    const { data } = await api.get<{ user: User }>('/auth/me');
    set({ user: data.user });
  },
}));

session.onExpired(() => {
  void tokenStorage.setRefreshToken(null);
  session.setAccessToken(null);
  useAuth.setState({ user: null, status: 'signedOut' });
});

/** Role helpers used to show/hide features. The API enforces the same rules server-side. */
export const can = {
  // Any client can both list land and buy land.
  listLand: (u: User | null) => u?.role === 'CLIENT' || u?.role === 'ADMIN',
  notarize: (u: User | null) => u?.role === 'NOTARY',
  administer: (u: User | null) => u?.role === 'ADMIN',
};
