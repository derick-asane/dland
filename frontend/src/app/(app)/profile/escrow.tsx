import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { User } from '@/api/types';
import { useAuth } from '@/store/auth';
import { Banner, Button, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/** Notary's escrow account: shown to buyers as payment instructions. DLand never holds funds. */
export default function EscrowScreen() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [form, setForm] = useState({
    escrowBankName: user?.escrowBankName ?? '',
    escrowAccountName: user?.escrowAccountName ?? '',
    escrowAccountNumber: user?.escrowAccountNumber ?? '',
    escrowMobileMoney: user?.escrowMobileMoney ?? '',
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch<{ user: User }>('/notary/escrow', {
          escrowBankName: form.escrowBankName.trim(),
          escrowAccountName: form.escrowAccountName.trim(),
          escrowAccountNumber: form.escrowAccountNumber.trim(),
          escrowMobileMoney: form.escrowMobileMoney.trim() || null,
        })
      ).data.user,
    onSuccess: (u) => {
      setUser(u);
      showAlert(t('common.success'), t('escrow.saved'));
      router.back();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const valid =
    form.escrowBankName.trim().length >= 2 && form.escrowAccountName.trim().length >= 2 && form.escrowAccountNumber.trim().length >= 4;

  return (
    <Screen edges={['bottom']}>
      <Banner tone="info" icon="shield-checkmark" text={t('escrow.intro')} />
      <TextField label={t('escrow.bankName')} value={form.escrowBankName} onChangeText={set('escrowBankName')} />
      <TextField label={t('escrow.accountName')} value={form.escrowAccountName} onChangeText={set('escrowAccountName')} />
      <TextField label={t('escrow.accountNumber')} value={form.escrowAccountNumber} onChangeText={set('escrowAccountNumber')} autoCapitalize="characters" />
      <TextField label={t('escrow.mobileMoney')} value={form.escrowMobileMoney} onChangeText={set('escrowMobileMoney')} keyboardType="phone-pad" />
      <Button title={t('common.save')} onPress={() => save.mutate()} loading={save.isPending} disabled={!valid} />
    </Screen>
  );
}
