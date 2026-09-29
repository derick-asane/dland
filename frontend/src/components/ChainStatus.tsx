import { useMutation } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { ChainVerification } from '@/api/types';
import { colors, font, spacing } from '@/theme';
import { formatDate, shortHash } from '@/utils/format';
import { Banner, Button, Card } from './ui';

/** Runs a full-chain integrity check on demand and shows the verdict. */
export function ChainStatus() {
  const { t } = useTranslation();
  const verify = useMutation({
    mutationFn: async () => (await api.get<ChainVerification>('/chain/verify')).data,
  });
  const result = verify.data;
  return (
    <Card>
      {result ? (
        <>
          <Banner
            tone={result.valid ? 'success' : 'danger'}
            icon={result.valid ? 'shield-checkmark' : 'warning'}
            text={`${result.valid ? t('chain.valid') : t('chain.invalid')} · ${t('chain.blocks', { count: result.blocks })}`}
          />
          <Text style={font.small}>{t('chain.checkedAt', { date: formatDate(result.checkedAt, true) })}</Text>
          <Text style={[font.mono, { color: colors.textMuted, marginTop: 4 }]}>{shortHash(result.lastHash, 16)}</Text>
          {result.issues.slice(0, 5).map((i) => (
            <Text key={`${i.index}-${i.problem}`} style={{ color: colors.danger, marginTop: 4 }}>
              #{i.index} · {i.problem}
            </Text>
          ))}
        </>
      ) : null}
      <View style={{ marginTop: result ? spacing.md : 0 }}>
        <Button title={t('chain.verifyNow')} icon="shield-checkmark-outline" variant="secondary" loading={verify.isPending} onPress={() => verify.mutate()} />
      </View>
    </Card>
  );
}
