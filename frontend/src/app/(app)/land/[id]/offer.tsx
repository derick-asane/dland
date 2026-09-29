import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { useLand } from '@/hooks/useLand';
import { Button, Card, ErrorState, Loading, Screen, TextField } from '@/components/ui';
import { font, spacing } from '@/theme';
import { errorMessage, formatMoney } from '@/utils/format';
import { showAlert } from '@/utils/alert';

export default function MakeOfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useLand(id);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const send = useMutation({
    mutationFn: () => api.post('/offers', { landId: id, amount: Number(amount.replace(',', '.')), message: message.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['land', id] });
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
      showAlert(t('common.success'), t('offer.sent'));
      router.back();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} />;
  const land = query.data;
  const value = Number(amount.replace(',', '.'));

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Text style={font.h3}>{land.title}</Text>
        <Text style={[font.small, { marginTop: spacing.xs }]}>{t('offer.asking', { price: formatMoney(land.price, land.currency) })}</Text>
      </Card>
      <TextField
        label={t('offer.amount', { currency: land.currency })}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        hint={value > 0 ? formatMoney(value, land.currency) : undefined}
      />
      <TextField
        label={t('offer.message')}
        placeholder={t('offer.messagePlaceholder')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={1000}
      />
      <Button title={t('offer.send')} icon="paper-plane-outline" onPress={() => send.mutate()} loading={send.isPending} disabled={!(value > 0)} />
    </Screen>
  );
}
