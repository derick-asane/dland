import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Role } from '@/api/types';
import { Button, ChipGroup, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/** Admins onboard notaries (and other admins) directly, with their licence number. */
export default function CreateUserScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>('NOTARY');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', licenseNumber: '' });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/users', {
        ...form,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        licenseNumber: form.licenseNumber.trim() || undefined,
        role,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      showAlert(t('common.success'), t('admin.created'));
      router.back();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const valid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.password.length >= 8 &&
    (role !== 'NOTARY' || form.licenseNumber.trim());

  return (
    <Screen edges={['bottom']}>
      <ChipGroup label={t('admin.role')} value={role} onChange={setRole} options={(['NOTARY', 'ADMIN', 'CLIENT'] as Role[]).map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
      <TextField label={t('auth.firstName')} value={form.firstName} onChangeText={set('firstName')} />
      <TextField label={t('auth.lastName')} value={form.lastName} onChangeText={set('lastName')} />
      <TextField label={t('auth.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
      <TextField label={`${t('auth.phone')} (${t('common.optional')})`} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <TextField label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry hint={t('validation.passwordLength')} />
      {role === 'NOTARY' ? <TextField label={t('admin.licenseNumber')} value={form.licenseNumber} onChangeText={set('licenseNumber')} /> : null}
      <Button title={t('admin.createUser')} onPress={() => create.mutate()} loading={create.isPending} disabled={!valid} />
    </Screen>
  );
}
