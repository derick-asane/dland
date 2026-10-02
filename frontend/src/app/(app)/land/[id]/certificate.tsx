import { Share, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, API_URL } from '@/api/client';
import type { Certificate } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { Banner, Button, Card, ErrorState, KeyValue, Loading, Screen } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, formatNumber, shortHash } from '@/utils/format';

/**
 * Ownership certificate backed by the chain. The QR code points to the public
 * verification endpoint, so a bank, buyer or court can check it without the app.
 */
export default function CertificateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const land = useLand(id);
  const reference = land.data?.reference;
  const query = useQuery({
    queryKey: ['certificate', reference],
    queryFn: async () => (await api.get<Certificate>(`/chain/certificate/${reference}`)).data,
    enabled: Boolean(reference),
  });

  if (land.isLoading || query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error ?? land.error)} onRetry={() => query.refetch()} />;
  const c = query.data;
  const verifyUrl = `${API_URL}/api/chain/certificate/${c.reference}`;
  const ok = c.ownerMatchesChain && c.chainValid;

  return (
    <Screen>
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Text style={[font.small, { letterSpacing: 2, textTransform: 'uppercase' }]}>{t('certificate.title')}</Text>
        <Text style={[font.h2, { textAlign: 'center', marginVertical: spacing.sm }]}>{c.title}</Text>
        <Text style={[font.mono, { marginBottom: spacing.lg }]}>{c.reference}</Text>
        <QRCode value={verifyUrl} size={180} color={colors.text} backgroundColor={colors.surface} />
        <Text style={[font.small, { marginTop: spacing.md, textAlign: 'center' }]}>{t('certificate.scanHint')}</Text>
      </Card>

      <Banner tone={ok ? 'success' : 'danger'} icon={ok ? 'shield-checkmark' : 'warning'} text={ok ? t('certificate.valid') : t('certificate.invalid')} />
      {c.frozen ? <Banner tone="danger" icon="lock-closed" text={t('certificate.frozenWarning')} /> : null}

      <Card>
        <KeyValue label={t('certificate.currentOwner')} value={`${c.owner.firstName} ${c.owner.lastName}`} />
        <KeyValue label={t('profile.wallet')} value={shortHash(c.owner.walletAddress, 12)} mono />
        <KeyValue label={t('certificate.parcel')} value={c.parcelNumber} />
        <KeyValue label={t('land.titleDeedNumber')} value={c.titleDeedNumber} />
        <KeyValue label={t('land.area')} value={t('common.sqm', { value: formatNumber(c.areaSqm) })} />
        <KeyValue label={t('land.location')} value={`${c.city}, ${c.country}`} />
        {c.registration ? (
          <KeyValue label={t('certificate.registration')} value={`#${c.registration.index} · ${formatDate(c.registration.timestamp)}`} />
        ) : null}
        {c.lastTransfer ? (
          <KeyValue label={t('certificate.lastTransfer')} value={`#${c.lastTransfer.index} · ${formatDate(c.lastTransfer.timestamp)}`} />
        ) : null}
        <KeyValue label={t('certificate.transfers')} value={String(c.transfersCount)} />
      </Card>
      <Text style={[font.small, { textAlign: 'center', marginBottom: spacing.lg }]}>
        {t('certificate.issuedAt', { date: formatDate(c.issuedAt, true) })}
      </Text>
      <View>
        <Button
          title={t('certificate.share')}
          icon="share-outline"
          variant="secondary"
          onPress={() => Share.share({ message: `${c.title} (${c.reference})\n${verifyUrl}` }).catch(() => undefined)}
        />
      </View>
    </Screen>
  );
}
