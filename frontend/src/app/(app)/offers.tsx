import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, fileUrl } from '@/api/client';
import type { Offer } from '@/api/types';
import { PromptModal } from '@/components/PromptModal';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Row, Screen, Segmented, toneForStatus } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney, fullName } from '@/utils/format';
import { showAlert } from '@/utils/alert';

type Tab = 'received' | 'sent';

export default function OffersScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('received');
  const [accepting, setAccepting] = useState<Offer | null>(null);

  const query = useQuery({
    queryKey: ['offers', tab],
    queryFn: async () => (await api.get<{ items: Offer[] }>(`/offers/${tab}`)).data.items,
  });

  const act = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'accept' | 'reject' | 'withdraw' }) => api.post(`/offers/${id}/${kind}`),
    onSuccess: (_r, { kind }) => {
      setAccepting(null);
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
      void queryClient.invalidateQueries({ queryKey: ['lands'] });
      if (kind === 'accept') showAlert(t('common.success'), t('offer.accepted'));
    },
    onError: (err) => {
      setAccepting(null);
      showAlert(t('common.error'), errorMessage(err));
    },
  });

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'received', label: t('offer.receivedTab') },
          { value: 'sent', label: t('offer.sentTab') },
        ]}
      />
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState icon="pricetags-outline" text={t('offer.empty')} /> : null}
      {query.data?.map((offer) => (
        <Card key={offer.id} onPress={() => router.push(`/land/${offer.landId}`)}>
          <Row>
            <Image source={{ uri: fileUrl(offer.land?.images[0]?.url) }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.border }} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3} numberOfLines={1}>
                {offer.land?.title}
              </Text>
              <Text style={[font.h3, { color: colors.primaryDark }]}>{formatMoney(offer.amount, offer.land?.currency)}</Text>
              <Text style={font.small}>
                {tab === 'received' && offer.buyer ? `${t('offer.from', { name: fullName(offer.buyer) })} · ` : ''}
                {formatDate(offer.createdAt)}
              </Text>
            </View>
            <Badge label={t(`offerStatus.${offer.status}`)} tone={toneForStatus(offer.status)} />
          </Row>
          {offer.message ? <Text style={[font.body, { marginTop: spacing.sm, fontStyle: 'italic' }]}>“{offer.message}”</Text> : null}
          {offer.transfer ? (
            <Button
              title={t('sale.open')}
              icon="briefcase-outline"
              variant="secondary"
              small
              style={{ marginTop: spacing.md }}
              onPress={() => router.push(`/transfer/${offer.transfer!.id}`)}
            />
          ) : null}
          {offer.status === 'PENDING' ? (
            <Row style={{ marginTop: spacing.md }}>
              {tab === 'received' ? (
                <>
                  <Button title={t('offer.reject')} variant="danger" small style={{ flex: 1 }} onPress={() => act.mutate({ id: offer.id, kind: 'reject' })} />
                  <Button title={t('offer.accept')} small style={{ flex: 1 }} onPress={() => setAccepting(offer)} />
                </>
              ) : (
                <Button title={t('offer.withdraw')} variant="ghost" small style={{ flex: 1 }} onPress={() => act.mutate({ id: offer.id, kind: 'withdraw' })} />
              )}
            </Row>
          ) : null}
        </Card>
      ))}
      <PromptModal
        visible={Boolean(accepting)}
        title={t('offer.accept')}
        message={t('offer.acceptConfirm')}
        loading={act.isPending}
        onClose={() => setAccepting(null)}
        onConfirm={() => accepting && act.mutate({ id: accepting.id, kind: 'accept' })}
      />
    </Screen>
  );
}
