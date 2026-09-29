import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { LandForm, toPayload } from '@/components/LandForm';
import { ErrorState, Loading, Screen } from '@/components/ui';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/**
 * Edits a live (published) listing: title, description and price only.
 * Drafts are edited through the guided listing steps (land/[id]/setup).
 */
export default function EditLandScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useLand(id);

  const save = useMutation({
    mutationFn: (payload: object) => api.patch<{ land: Land }>(`/lands/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['land', id] });
      void queryClient.invalidateQueries({ queryKey: ['lands'] });
      showAlert(t('common.success'), t('landForm.saved'));
      router.back();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const land = query.data;

  return (
    <Screen edges={['bottom']}>
      <LandForm
        initial={land}
        submitLabel={t('common.save')}
        loading={save.isPending}
        onSubmit={(v) => save.mutate(toPayload(v, land.status === 'PUBLISHED'))}
      />
    </Screen>
  );
}
