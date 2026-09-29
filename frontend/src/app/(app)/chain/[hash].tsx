import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Block } from '@/api/types';
import { Banner, Button, Card, ErrorState, KeyValue, Loading, Screen, Section } from '@/components/ui';
import { font, spacing } from '@/theme';
import { errorMessage, formatDate } from '@/utils/format';

export default function BlockScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['block', hash],
    queryFn: async () => (await api.get<{ block: Block; verified: boolean; problems: string[] }>(`/chain/blocks/${hash}`)).data,
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const { block, verified, problems } = query.data;

  return (
    <Screen>
      <Text style={[font.h1, { marginBottom: spacing.xs }]}>#{block.index}</Text>
      <Text style={[font.small, { marginBottom: spacing.lg }]}>
        {t(`blockType.${block.type}`)} · {formatDate(block.timestamp, true)}
      </Text>
      <Banner
        tone={verified ? 'success' : 'danger'}
        icon={verified ? 'shield-checkmark' : 'warning'}
        text={verified ? t('history.verified') : `${t('history.tampered')}: ${problems.join(', ')}`}
      />
      <Card>
        <KeyValue label={t('history.hash')} value={block.hash} mono />
        <KeyValue label={t('history.previousHash')} value={block.previousHash} mono />
        <KeyValue label={t('history.dataHash')} value={block.dataHash} mono />
        <KeyValue label={t('history.nonce')} value={String(block.nonce)} mono />
        <KeyValue label={t('history.signature')} value={block.signature} mono />
        {block.signer ? <KeyValue label={t('history.signedBy')} value={`${block.signer.firstName} ${block.signer.lastName}`} /> : null}
        {block.anchorTxHash ? <KeyValue label={t('history.anchored')} value={block.anchorTxHash} mono /> : null}
      </Card>
      <Section title={t('history.rawData')}>
        <Card>
          <Text style={font.mono} selectable>
            {JSON.stringify(block.data, null, 2)}
          </Text>
        </Card>
      </Section>
      {block.land ? (
        <Button title={`${t('chain.land')}: ${block.land.reference}`} variant="secondary" onPress={() => router.push(`/land/${block.land!.id}`)} />
      ) : null}
    </Screen>
  );
}
