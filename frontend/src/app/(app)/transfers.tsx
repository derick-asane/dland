import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Transfer } from '@/api/types';
import { useAuth } from '@/store/auth';
import { PromptModal } from '@/components/PromptModal';
import { TransferCard } from '@/components/TransferCard';
import { Badge, Button, EmptyState, ErrorState, Loading, Row, Screen } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate } from '@/utils/format';
import { showAlert } from '@/utils/alert';

export default function TransfersScreen() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<Transfer | null>(null);
  const [rating, setRating] = useState(5);

  const query = useQuery({
    queryKey: ['transfers', 'mine'],
    queryFn: async () => (await api.get<{ items: Transfer[] }>('/transfers/mine')).data.items,
  });

  const review = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => api.post(`/transfers/${id}/review`, { rating, comment: comment || undefined }),
    onSuccess: () => {
      setReviewing(null);
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
      showAlert(t('common.success'), t('transfers.reviewSent'));
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      {query.data?.length === 0 ? <EmptyState icon="swap-horizontal-outline" text={t('transfers.empty')} /> : null}
      {query.data?.map((tr) => {
        const isBuyer = tr.buyerId === me?.id;
        return (
          <View key={tr.id}>
            <Badge label={isBuyer ? t('transfers.purchase') : t('transfers.sale')} tone={isBuyer ? 'info' : 'success'} />
            <View style={{ height: spacing.xs }} />
            <TransferCard transfer={tr}>
              {tr.completedAt ? <Text style={font.small}>{t('transfers.completedOn', { date: formatDate(tr.completedAt) })}</Text> : null}
              {isBuyer && tr.status === 'COMPLETED' ? (
                tr.review ? (
                  <Text style={[font.small, { marginTop: spacing.sm }]}>{t('transfers.reviewed', { rating: tr.review.rating })}</Text>
                ) : (
                  <View style={{ marginTop: spacing.md }}>
                    <Button title={t('transfers.leaveReview')} icon="star-outline" small variant="secondary" onPress={() => setReviewing(tr)} />
                  </View>
                )
              ) : null}
            </TransferCard>
          </View>
        );
      })}
      <PromptModal
        visible={Boolean(reviewing)}
        title={t('transfers.leaveReview')}
        message={t('transfers.reviewTitle')}
        inputLabel={t('transfers.comment')}
        loading={review.isPending}
        onClose={() => setReviewing(null)}
        onConfirm={(comment) => reviewing && review.mutate({ id: reviewing.id, comment })}
      >
        <Row style={{ justifyContent: 'center', marginBottom: spacing.lg }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={34} color={colors.accent} />
            </Pressable>
          ))}
        </Row>
      </PromptModal>
    </Screen>
  );
}
