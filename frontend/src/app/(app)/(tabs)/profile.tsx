import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, upload } from '@/api/client';
import type { MyStats, User } from '@/api/types';
import { can, useAuth } from '@/store/auth';
import { Avatar, Badge, Card, ListItem, Screen, Section, Stat } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';
import { showAlert } from '@/utils/alert';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);

  const stats = useQuery({
    queryKey: ['me', 'stats'],
    queryFn: async () => (await api.get<MyStats>('/users/me/stats')).data,
  });

  if (!user) return null;
  const s = stats.data;
  const listings = s ? Object.values(s.landsByStatus).reduce((a, b) => a + (b ?? 0), 0) : 0;

  const changeAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const data = await upload<{ user: User }>('/users/me/avatar', {
        avatar: { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' },
      });
      setUser(data.user);
    } catch (err) {
      showAlert(t('common.error'), errorMessage(err));
    }
  };

  const onRefresh = async () => {
    await Promise.all([stats.refetch(), useAuth.getState().refreshUser()]);
  };

  return (
    <Screen refreshing={stats.isRefetching} onRefresh={onRefresh}>
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Pressable onPress={changeAvatar}>
          <Avatar url={user.avatarUrl} name={fullName(user)} size={96} />
          <Text style={{ color: colors.primary, textAlign: 'center', marginTop: spacing.sm, fontWeight: '600' }}>{t('profile.changePhoto')}</Text>
        </Pressable>
        <Text style={[font.h2, { marginTop: spacing.md }]}>{fullName(user)}</Text>
        <Text style={font.small}>{user.email}</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Badge label={t(`roles.${user.role}`)} tone={user.role === 'CLIENT' ? 'neutral' : 'success'} icon="shield-checkmark" />
        </View>
        <Text style={[font.small, { marginTop: spacing.sm }]}>{t('profile.memberSince', { date: formatDate(user.createdAt) })}</Text>
      </View>

      {s ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl }}>
          {can.listLand(user) ? <Stat icon="map" label={t('profile.stats.listings')} value={listings} /> : null}
          {can.listLand(user) ? <Stat icon="eye" label={t('profile.stats.views')} value={s.totalViews} /> : null}
          {can.listLand(user) ? <Stat icon="pricetag" label={t('profile.stats.pendingOffers')} value={s.pendingOffersReceived} /> : null}
          <Stat icon="paper-plane" label={t('profile.stats.offersSent')} value={s.offersSent} />
          <Stat icon="heart" label={t('profile.stats.saved')} value={s.favorites} />
          <Stat icon="cube" label={t('profile.stats.onChain')} value={s.ownedOnChain} />
        </View>
      ) : null}

      <Section title={t('profile.wallet')}>
        <Card>
          <Text style={font.mono} selectable>
            {user.walletAddress}
          </Text>
          <Text style={[font.small, { marginTop: spacing.sm }]}>{t('profile.walletHint')}</Text>
        </Card>
      </Section>

      <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        <ListItem icon="create-outline" title={t('profile.edit')} onPress={() => router.push('/profile/edit')} />
        <ListItem icon="person-outline" title={t('profile.publicProfile')} onPress={() => router.push(`/user/${user.id}`)} />
        <ListItem icon="pricetags-outline" title={t('profile.offers')} onPress={() => router.push('/offers')} />
        <ListItem icon="swap-horizontal-outline" title={t('profile.transfers')} onPress={() => router.push('/transfers')} />
        {can.notarize(user) ? (
          <ListItem
            icon="wallet-outline"
            title={t('profile.escrow')}
            subtitle={user.escrowAccountNumber ?? t('sale.escrowMissing')}
            onPress={() => router.push('/profile/escrow')}
          />
        ) : null}
        <ListItem icon="notifications-outline" title={t('profile.notifications')} onPress={() => router.push('/notifications')} />
        <ListItem icon="cube-outline" title={t('profile.chainExplorer')} onPress={() => router.push('/chain')} />
        <ListItem icon="settings-outline" title={t('profile.settings')} onPress={() => router.push('/profile/settings')} />
        <ListItem icon="log-out-outline" title={t('auth.logout')} danger onPress={logout} right={<View />} />
      </View>
    </Screen>
  );
}
