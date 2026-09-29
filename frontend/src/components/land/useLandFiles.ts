import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/** Runs an upload/delete for a land's photos or documents, then refreshes the land. */
export function useLandFiles(landId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['land', landId] }),
        queryClient.invalidateQueries({ queryKey: ['lands'] }),
      ]);
    } catch (err) {
      showAlert(t('common.error'), errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return { busy, run };
}
