import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Refresh tokens live in the device keychain/keystore (localStorage on web, where SecureStore is unavailable). */
const REFRESH_KEY = 'dland.refreshToken';

export const tokenStorage = {
  async getRefreshToken(): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(REFRESH_KEY) ?? null;
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefreshToken(token: string | null): Promise<void> {
    if (Platform.OS === 'web') {
      if (token) globalThis.localStorage?.setItem(REFRESH_KEY, token);
      else globalThis.localStorage?.removeItem(REFRESH_KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
