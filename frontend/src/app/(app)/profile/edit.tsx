import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { User } from '@/api/types';
import { useAuth } from '@/store/auth';
import { Button, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    bio: user?.bio ?? '',
    city: user?.city ?? '',
    country: user?.country ?? '',
  });
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch<{ user: User }>('/users/me', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || null,
          bio: form.bio.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
        })
      ).data.user,
    onSuccess: (u) => {
      setUser(u);
      showAlert(t('common.success'), t('profile.saved'));
      router.back();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  return (
    <Screen edges={['bottom']}>
      <TextField label={t('auth.firstName')} value={form.firstName} onChangeText={set('firstName')} />
      <TextField label={t('auth.lastName')} value={form.lastName} onChangeText={set('lastName')} />
      <TextField label={t('profile.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <TextField label={t('profile.city')} value={form.city} onChangeText={set('city')} />
      <TextField label={t('profile.country')} value={form.country} onChangeText={set('country')} />
      <TextField label={t('profile.bio')} value={form.bio} onChangeText={set('bio')} multiline maxLength={1000} />
      <Button title={t('common.save')} onPress={() => save.mutate()} loading={save.isPending} disabled={!form.firstName.trim() || !form.lastName.trim()} />
    </Screen>
  );
}
