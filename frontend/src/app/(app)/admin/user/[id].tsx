import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { AuditLog, Role, User } from '@/api/types';
import { useAuth } from '@/store/auth';
import { PromptModal } from '@/components/PromptModal';
import { Avatar, Badge, Button, Card, ChipGroup, ErrorState, KeyValue, Loading, Screen, Section, TextField } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';
import { showAlert } from '@/utils/alert';

interface Detail {
  user: User & { _count: Record<CountKey, number> };
  auditTrail: AuditLog[];
}

type CountKey = 'ownedLands' | 'offersMade' | 'transfersAsSeller' | 'transfersAsBuyer' | 'reports';

const ROLES: Role[] = ['CLIENT', 'NOTARY', 'ADMIN'];

export default function AdminUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [roleModal, setRoleModal] = useState(false);
  const [role, setRole] = useState<Role>('CLIENT');
  const [license, setLicense] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: async () => (await api.get<Detail>(`/admin/users/${id}`)).data,
  });

  const update = useMutation({
    mutationFn: (body: object) => api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      setRoleModal(false);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      showAlert(t('common.success'), t('admin.updated'));
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const { user, auditTrail } = query.data;
  const isSelf = me?.id === user.id;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: fullName(user) }} />
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <Avatar url={user.avatarUrl} name={fullName(user)} size={80} />
        <Text style={[font.h2, { marginTop: spacing.sm }]}>{fullName(user)}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <Badge label={t(`roles.${user.role}`)} tone="info" />
          <Badge label={user.isActive ? t('admin.active') : t('admin.suspended')} tone={user.isActive ? 'success' : 'danger'} />
        </View>
      </View>

      <Card>
        <KeyValue label={t('auth.email')} value={user.email} />
        <KeyValue label={t('auth.phone')} value={user.phone ?? '—'} />
        <KeyValue label={t('profile.city')} value={[user.city, user.country].filter(Boolean).join(', ') || '—'} />
        {user.licenseNumber ? <KeyValue label={t('admin.licenseNumber')} value={user.licenseNumber} /> : null}
        <KeyValue label={t('profile.wallet')} value={user.walletAddress} mono />
        <KeyValue label={t('admin.joined')} value={formatDate(user.createdAt)} />
        {(Object.keys(user._count) as CountKey[]).map((k) => (
          <KeyValue key={k} label={t(`admin.counts.${k}`)} value={String(user._count[k])} />
        ))}
      </Card>

      {!isSelf ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
          <Button
            title={t('admin.changeRole')}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              setRole(user.role);
              setLicense(user.licenseNumber ?? '');
              setRoleModal(true);
            }}
          />
          <Button
            title={user.isActive ? t('admin.suspend') : t('admin.activate')}
            variant={user.isActive ? 'danger' : 'primary'}
            style={{ flex: 1 }}
            loading={update.isPending}
            onPress={() => update.mutate({ isActive: !user.isActive })}
          />
        </View>
      ) : null}

      <Section title={t('admin.activity')}>
        {auditTrail.map((a) => (
          <View key={a.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={font.body}>{a.action}</Text>
            <Text style={font.small}>
              {a.entityType} · {formatDate(a.createdAt, true)}
            </Text>
          </View>
        ))}
      </Section>

      <PromptModal
        visible={roleModal}
        title={t('admin.changeRole')}
        loading={update.isPending}
        onClose={() => setRoleModal(false)}
        onConfirm={() => update.mutate({ role, licenseNumber: license.trim() || null })}
      >
        <ChipGroup value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
        {role === 'NOTARY' ? (
          <TextField label={t('admin.licenseNumber')} value={license} onChangeText={setLicense} hint={t('admin.licenseRequired')} />
        ) : null}
      </PromptModal>
    </Screen>
  );
}
