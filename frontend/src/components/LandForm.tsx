import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Land, LandType } from '@/api/types';
import { font, spacing } from '@/theme';
import { Banner, Button, ChipGroup, Section, TextField } from './ui';

const LAND_TYPES: LandType[] = ['RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL', 'MIXED'];
const CURRENCIES = ['USD', 'EUR', 'XAF', 'XOF', 'NGN', 'GHS', 'KES'];

export interface LandFormValues {
  title: string;
  description: string;
  price: string;
  currency: string;
  areaSqm: string;
  landType: LandType;
  address: string;
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
  parcelNumber: string;
  titleDeedNumber: string;
}

export const toFormValues = (land?: Land): LandFormValues => ({
  title: land?.title ?? '',
  description: land?.description ?? '',
  price: land ? String(Number(land.price)) : '',
  currency: land?.currency ?? 'USD',
  areaSqm: land ? String(land.areaSqm) : '',
  landType: land?.landType ?? 'RESIDENTIAL',
  address: land?.address ?? '',
  city: land?.city ?? '',
  region: land?.region ?? '',
  country: land?.country ?? '',
  latitude: land?.latitude != null ? String(land.latitude) : '',
  longitude: land?.longitude != null ? String(land.longitude) : '',
  parcelNumber: land?.parcelNumber ?? '',
  titleDeedNumber: land?.titleDeedNumber ?? '',
});

/** Converts form strings into the API payload. */
export function toPayload(v: LandFormValues, onlyLiveFields = false) {
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const live = { title: v.title.trim(), description: v.description.trim(), price: num(v.price), currency: v.currency };
  if (onlyLiveFields) return live;
  return {
    ...live,
    areaSqm: num(v.areaSqm),
    landType: v.landType,
    address: v.address.trim(),
    city: v.city.trim(),
    region: v.region.trim() || null,
    country: v.country.trim(),
    latitude: num(v.latitude),
    longitude: num(v.longitude),
    parcelNumber: v.parcelNumber.trim(),
    titleDeedNumber: v.titleDeedNumber.trim(),
  };
}

interface Props {
  initial?: Land;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (values: LandFormValues) => void;
}

export function LandForm({ initial, submitLabel, loading, onSubmit }: Props) {
  const { t } = useTranslation();
  const [v, setV] = useState<LandFormValues>(() => toFormValues(initial));
  const set = (key: keyof LandFormValues) => (value: string) => setV((prev) => ({ ...prev, [key]: value }));

  const live = initial?.status === 'PUBLISHED';
  const registryLocked = Boolean(initial?.registeredOnChain);
  const positive = (s: string) => s.trim() !== '' && Number(s.replace(',', '.')) > 0;
  const errors = {
    price: v.price && !positive(v.price) ? t('validation.positive') : undefined,
    areaSqm: v.areaSqm && !positive(v.areaSqm) ? t('validation.positive') : undefined,
  };
  const valid =
    v.title.trim().length >= 3 &&
    v.description.trim().length >= 10 &&
    positive(v.price) &&
    (live ||
      (positive(v.areaSqm) &&
        v.address.trim().length >= 3 &&
        v.city.trim() &&
        v.country.trim().length >= 2 &&
        v.parcelNumber.trim() &&
        v.titleDeedNumber.trim()));

  return (
    <View>
      {live ? <Banner text={t('landForm.liveHint')} tone="info" /> : null}
      <Section title={t('landForm.general')}>
        <TextField label={t('landForm.title')} value={v.title} onChangeText={set('title')} maxLength={120} />
        <TextField label={t('landForm.description')} value={v.description} onChangeText={set('description')} multiline maxLength={5000} />
        <TextField label={t('landForm.price')} value={v.price} onChangeText={set('price')} keyboardType="numeric" error={errors.price} />
        <ChipGroup label={t('landForm.currency')} value={v.currency} onChange={set('currency')} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        {!live ? (
          <>
            <TextField
              label={t('landForm.area')}
              value={v.areaSqm}
              onChangeText={set('areaSqm')}
              keyboardType="numeric"
              error={errors.areaSqm}
              editable={!registryLocked}
            />
            <ChipGroup
              label={t('landForm.landType')}
              value={v.landType}
              onChange={(x) => setV((p) => ({ ...p, landType: x }))}
              options={LAND_TYPES.map((x) => ({ value: x, label: t(`landType.${x}`) }))}
            />
          </>
        ) : null}
      </Section>

      {!live ? (
        <>
          <Section title={t('landForm.location')}>
            <TextField label={t('landForm.address')} value={v.address} onChangeText={set('address')} />
            <TextField label={t('landForm.city')} value={v.city} onChangeText={set('city')} />
            <TextField label={`${t('landForm.region')} (${t('common.optional')})`} value={v.region} onChangeText={set('region')} />
            <TextField label={t('landForm.country')} value={v.country} onChangeText={set('country')} editable={!registryLocked} />
            {initial?.boundary ? null : (
              <>
            <Text style={[font.small, { marginBottom: spacing.sm }]}>{t('landForm.useMyLocation')}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <TextField label={t('landForm.latitude')} value={v.latitude} onChangeText={set('latitude')} keyboardType="numbers-and-punctuation" containerStyle={{ flex: 1 }} />
              <TextField label={t('landForm.longitude')} value={v.longitude} onChangeText={set('longitude')} keyboardType="numbers-and-punctuation" containerStyle={{ flex: 1 }} />
            </View>
              </>
            )}
          </Section>

          <Section title={t('landForm.registry')}>
            <Text style={[font.small, { marginBottom: spacing.md }]}>{t('landForm.registryHint')}</Text>
            <TextField label={t('landForm.parcelNumber')} value={v.parcelNumber} onChangeText={set('parcelNumber')} autoCapitalize="characters" editable={!registryLocked} />
            <TextField label={t('landForm.titleDeedNumber')} value={v.titleDeedNumber} onChangeText={set('titleDeedNumber')} autoCapitalize="characters" editable={!registryLocked} />
          </Section>
        </>
      ) : null}

      <Button title={submitLabel} onPress={() => onSubmit(v)} disabled={!valid} loading={loading} />
    </View>
  );
}
