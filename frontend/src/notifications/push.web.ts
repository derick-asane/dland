import { router, type Href } from 'expo-router';

/**
 * Web version of push.ts: browser (desktop) notifications while DLand is open in a tab.
 * Mobile push is not available on the web.
 */
export type PushStatus = 'enabled' | 'off' | 'denied' | 'unsupported' | 'needs-build';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function enablePush(ask: boolean): Promise<PushStatus> {
  if (!supported()) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default' && ask) permission = await Notification.requestPermission();
  if (permission === 'granted') return 'enabled';
  return permission === 'denied' ? 'denied' : 'off';
}

export async function disablePush() {}

export function usePushNavigation() {}

/** Shows a desktop notification when the DLand tab is in the background. */
export function showLiveNotification(title: string, body: string, href: Href | null) {
  if (!supported() || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  const n = new Notification(title, { body, icon: '/favicon.ico' });
  n.onclick = () => {
    window.focus();
    if (href) router.push(href);
    n.close();
  };
}
