import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land } from '@/api/types';
import { LandForm, toPayload } from '@/components/LandForm';
import { Stepper } from '@/components/land/Stepper';
import { Screen } from '@/components/ui';
import { colors } from '@/theme';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

const STEPS = ['details', 'photos', 'boundary', 'documents', 'review'] as const;

/** Step 1 of the guided listing: the details. The draft is created here, then the wizard continues. */
export default function NewLandScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (payload: ReturnType<typeof toPayload>) => (await api.post<{ land: Land }>('/lands', payload)).data.land,
    onSuccess: (land) => {
      void queryClient.invalidateQueries({ queryKey: ['lands', 'mine'] });
      router.replace({ pathname: '/land/[id]/setup', params: { id: land.id, step: 'photos' } });
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stepper steps={STEPS.map((key) => ({ key, label: t(`wizard.step.${key}`), done: false }))} current="details" />
      <Screen edges={['bottom']}>
        <LandForm submitLabel={t('wizard.saveAndContinue')} loading={create.isPending} onSubmit={(v) => create.mutate(toPayload(v))} />
      </Screen>
    </View>
  );
}
