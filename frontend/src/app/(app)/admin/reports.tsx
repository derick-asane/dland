import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Report, ReportStatus } from '@/api/types';
import { PromptModal } from '@/components/PromptModal';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Row, Screen, Segmented, toneForStatus } from '@/components/ui';
import { font, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/** Fraud & abuse reports on listings. Admins can take a listing down; its chain history is never altered. */
export default function ReportsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>('OPEN');
  const [suspending, setSuspending] = useState<Report | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: async () => (await api.get<{ items: Report[] }>('/admin/reports', { params: { status } })).data.items,
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin'] });

  const resolve = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'RESOLVED' | 'DISMISSED' }) => api.patch(`/admin/reports/${id}`, { status: next }),
    onSuccess: invalidate,
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const suspend = useMutation({
    mutationFn: async ({ report, reason }: { report: Report; reason: string }) => {
      await api.post(`/admin/lands/${report.land.id}/block`, { reason });
      await api.patch(`/admin/reports/${report.id}`, { status: 'RESOLVED' });
    },
    onSuccess: () => {
      setSuspending(null);
      invalidate();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Segmented
        value={status}
        onChange={setStatus}
        options={(['OPEN', 'RESOLVED', 'DISMISSED'] as ReportStatus[]).map((s) => ({
          value: s,
          label: t(`reportStatus.${s}`),
        }))}
      />
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState icon="flag-outline" text={t('admin.empty')} /> : null}
      {query.data?.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/land/${r.land.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Badge label={t(`reportReason.${r.reason as 'OTHER'}`)} tone="danger" icon="flag" />
            <Badge label={t(`status.${r.land.status}`)} tone={toneForStatus(r.land.status)} />
          </Row>
          <Text style={[font.h3, { marginTop: spacing.sm }]}>{r.land.title}</Text>
          <Text style={font.small}>
            {r.land.reference} · {t('admin.reportedBy', { name: fullName(r.reporter) })} · {formatDate(r.createdAt)}
          </Text>
          {r.details ? <Text style={[font.body, { marginTop: spacing.xs }]}>{r.details}</Text> : null}
          {r.status === 'OPEN' ? (
            <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }}>
              <Button title={t('admin.dismiss')} variant="ghost" small onPress={() => resolve.mutate({ id: r.id, next: 'DISMISSED' })} />
              <Button title={t('admin.resolve')} variant="secondary" small onPress={() => resolve.mutate({ id: r.id, next: 'RESOLVED' })} />
              {r.land.blockedAt ? (
                <Badge label={t('block.badge')} tone="danger" icon="ban" />
              ) : (
                <Button title={t('block.action')} variant="danger" small onPress={() => setSuspending(r)} />
              )}
            </Row>
          ) : null}
        </Card>
      ))}
      <PromptModal
        visible={Boolean(suspending)}
        title={t('block.action')}
        message={t('block.confirm')}
        inputLabel={t('block.reason')}
        inputRequired
        destructive
        loading={suspend.isPending}
        onClose={() => setSuspending(null)}
        onConfirm={(reason) => suspending && suspend.mutate({ report: suspending, reason })}
      />
    </Screen>
  );
}
