import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { api } from '@/api/client';
import type { NotificationType } from '@/api/types';
import { notificationTarget } from '@/utils/notifications';

/**
 * Mobile push notifications (iOS / Android). The web version lives in push.web.ts.
 * Requires a development or store build with an EAS project id: Expo Go on Android
 * no longer supports remote push.
 */
export type PushStatus = 'enabled' | 'off' | 'denied' | 'unsupported' | 'needs-build';

// While the app is open, still show the banner (the in-app list updates live too).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

const projectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

/**
 * Registers this device for push. With `ask`, shows the system permission prompt if needed;
 * without it, only registers when permission was already granted (silent, on sign-in).
 */
export async function enablePush(ask: boolean): Promise<PushStatus> {
  if (!Device.isDevice) return 'unsupported';
  const id = projectId();
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (!id || (inExpoGo && Platform.OS === 'android')) return 'needs-build';

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return status === 'denied' ? 'denied' : 'off';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'DLand',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api.post('/users/me/push-tokens', { token, platform: Platform.OS });
  registeredToken = token;
  return 'enabled';
}

/** On sign-out: this device stops receiving the account's notifications. */
export async function disablePush() {
  if (!registeredToken) return;
  await api.delete('/users/me/push-tokens', { data: { token: registeredToken } }).catch(() => undefined);
  registeredToken = null;
}

/** Opens the right screen when the user taps a push notification. */
export function usePushNavigation() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data?.type) return;
    const href = notificationTarget(data.type as NotificationType, data);
    if (href) router.push(href);
  }, [response]);
}

/** Mobile: the push notification itself is the alert, nothing to show from the live connection. */
export function showLiveNotification(_title: string, _body: string, _href: Href | null) {}
