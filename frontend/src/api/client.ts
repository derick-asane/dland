import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from './tokenStorage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** Uploaded files are stored as relative paths (/uploads/...); seed data may use absolute URLs. */
export const fileUrl = (url?: string | null) => (!url ? undefined : /^https?:\/\//.test(url) ? url : `${API_URL}${url}`);

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 20000 });

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export const session = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  getAccessToken: () => accessToken,
  onExpired(handler: () => void) {
    onSessionExpired = handler;
  },
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

/** Exchanges the stored refresh token for a new pair. Concurrent callers share one request. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return null;
      const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
      await tokenStorage.setRefreshToken(data.refreshToken);
      accessToken = data.accessToken;
      return data.accessToken as string;
    } catch {
      await tokenStorage.setRefreshToken(null);
      accessToken = null;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !original.url?.startsWith('/auth/')) {
      original._retried = true;
      const token = await refreshSession();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      onSessionExpired?.();
    }
    if (error.response?.data?.error?.code === 'ACCOUNT_SUSPENDED') onSessionExpired?.();
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  error?: { code: string; message: string; details?: unknown };
}

export function apiErrorCode(err: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    if (!err.response) return 'NETWORK_ERROR';
    return err.response.data?.error?.code ?? 'INTERNAL_ERROR';
  }
  if (err instanceof UploadError) return err.code;
  return 'INTERNAL_ERROR';
}

// ---------------------------------------------------------------------------
// Multipart uploads use fetch: it handles React Native file objects reliably.
// ---------------------------------------------------------------------------

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

export class UploadError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function upload<T>(
  path: string,
  files: Record<string, UploadFile | UploadFile[]>,
  fields: Record<string, string | undefined> = {},
): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') form.append(key, value);
  for (const [key, value] of Object.entries(files)) {
    for (const file of Array.isArray(value) ? value : [value]) {
      if (file.uri.startsWith('blob:') || file.uri.startsWith('data:')) {
        // Web: turn the picked file into a real Blob.
        const blob = await (await fetch(file.uri)).blob();
        form.append(key, blob, file.name);
      } else {
        // React Native accepts { uri, name, type } objects in FormData.
        form.append(key, file as unknown as Blob);
      }
    }
  }
  const send = () =>
    fetch(`${API_URL}/api${path}`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: form,
    });
  let res = await send().catch(() => {
    throw new UploadError('NETWORK_ERROR');
  });
  if (res.status === 401 && (await refreshSession())) res = await send();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadError(body?.error?.code ?? 'UPLOAD_ERROR');
  return body as T;
}
