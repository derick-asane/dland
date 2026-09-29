import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Button, Card, Screen, Section, TextField } from '@/components/ui';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      showAlert(t('common.success'), t('profile.passwordChanged'));
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  return (
    <Screen edges={['bottom']}>
      <Section title={t('profile.language')}>
        <Card>
          <LanguagePicker />
        </Card>
      </Section>
      <Section title={t('profile.changePassword')}>
        <TextField label={t('profile.currentPassword')} value={current} onChangeText={setCurrent} secureTextEntry />
        <TextField
          label={t('profile.newPassword')}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          error={next && next.length < 8 ? t('validation.passwordLength') : undefined}
        />
        <Button title={t('common.save')} onPress={() => change.mutate()} loading={change.isPending} disabled={!current || next.length < 8} />
      </Section>
    </Screen>
  );
}
