import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land, PublicUser, Review } from '@/api/types';
import { LandCard } from '@/components/LandCard';
import { Avatar, Badge, Card, ErrorState, Loading, Row, Screen, Section, Stat } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';

interface ProfileResponse {
  user: PublicUser;
  stats: { averageRating: number | null; reviewCount: number; completedSales: number };
  lands: Land[];
}

/** Public seller profile: trust signals (rating, completed sales) and active listings. */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const profile = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await api.get<ProfileResponse>(`/users/${id}`)).data,
  });
  const reviews = useQuery({
    queryKey: ['user', id, 'reviews'],
    queryFn: async () => (await api.get<{ items: Review[] }>(`/users/${id}/reviews`)).data.items,
  });

  if (profile.isLoading) return <Loading />;
  if (profile.isError || !profile.data) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;
  const { user, stats, lands } = profile.data;

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={() => profile.refetch()}>
      <Stack.Screen options={{ title: fullName(user) }} />
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Avatar url={user.avatarUrl} name={fullName(user)} size={88} />
        <Text style={[font.h2, { marginTop: spacing.md }]}>{fullName(user)}</Text>
        <View style={{ marginTop: spacing.xs }}>
          <Badge label={t(`roles.${user.role}`)} tone="success" />
        </View>
        {user.city || user.country ? <Text style={[font.small, { marginTop: spacing.xs }]}>{[user.city, user.country].filter(Boolean).join(', ')}</Text> : null}
        <Text style={font.small}>{t('profile.memberSince', { date: formatDate(user.createdAt) })}</Text>
        {user.bio ? <Text style={[font.body, { textAlign: 'center', marginTop: spacing.md }]}>{user.bio}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <Stat icon="star" label={t('profile.rating')} value={stats.averageRating ? stats.averageRating.toFixed(1) : '—'} />
        <Stat icon="chatbox-ellipses" label={t('profile.reviews', { count: stats.reviewCount })} value={stats.reviewCount} />
        <Stat icon="checkmark-done" label={t('profile.completedSales')} value={stats.completedSales} />
      </View>

      <Section title={t('profile.listings')}>
        {lands.length === 0 ? <Text style={font.small}>{t('profile.noListings')}</Text> : lands.map((l) => <LandCard key={l.id} land={l} />)}
      </Section>

      <Section title={t('profile.reviews', { count: reviews.data?.length ?? 0 })}>
        {reviews.data?.length === 0 ? <Text style={font.small}>{t('profile.noReviews')}</Text> : null}
        {reviews.data?.map((r) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={font.h3}>{r.author ? fullName(r.author) : ''}</Text>
              <Row style={{ gap: 2 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={14} color={colors.accent} />
                ))}
              </Row>
            </Row>
            {r.comment ? <Text style={[font.body, { marginTop: spacing.xs }]}>{r.comment}</Text> : null}
            <Text style={[font.small, { marginTop: spacing.xs }]}>{formatDate(r.createdAt)}</Text>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
