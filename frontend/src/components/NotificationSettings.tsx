import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { enablePush, type PushStatus } from '@/notifications/push';
import { colors, font, spacing } from '@/theme';
import { Banner, Button, Card } from './ui';

/** Shows whether this device receives notifications, with a button to turn them on. */
export function NotificationSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  // Current state without prompting.
  useEffect(() => {
    let alive = true;
    void enablePush(false)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      setStatus(await enablePush(true));
    } catch {
      setStatus('unsupported');
    } finally {
      setBusy(false);
    }
  };

  const message: Record<PushStatus, { text: string; tone: 'success' | 'warning' | 'neutral' }> = {
    enabled: { text: t('push.enabled'), tone: 'success' },
    off: { text: Platform.OS === 'web' ? t('push.webHint') : t('push.enable'), tone: 'neutral' },
    denied: { text: t('push.denied'), tone: 'warning' },
    unsupported: { text: t('push.unsupported'), tone: 'neutral' },
    'needs-build': { text: t('push.needsBuild'), tone: 'neutral' },
  };

  return (
    <Card>
      {status ? <Banner tone={message[status].tone} icon="notifications-outline" text={message[status].text} /> : null}
      {status === 'off' ? <Button title={t('push.enable')} icon="notifications" loading={busy} onPress={turnOn} /> : null}
      {Platform.OS === 'web' && status !== 'off' ? (
        <Text style={[font.small, { color: colors.textMuted, marginTop: spacing.xs }]}>{t('push.webHint')}</Text>
      ) : null}
    </Card>
  );
}
