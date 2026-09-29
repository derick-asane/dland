import { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Page, Role, User } from '@/api/types';
import { Avatar, Badge, ChipGroup, EmptyState, ErrorState, Loading, Row } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, fullName } from '@/utils/format';

type RoleFilter = Role | 'ALL';

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('ALL');

  const query = useInfiniteQuery({
    queryKey: ['admin', 'users', search, role],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<Page<User>>('/admin/users', {
          params: { page: pageParam, q: search || undefined, role: role === 'ALL' ? undefined : role },
        })
      ).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const users = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <Ionicons name="person-add-outline" size={24} color={colors.primary} onPress={() => router.push('/admin/create-user')} />,
        }}
      />
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg }}
        data={users}
        keyExtractor={(u) => u.id}
        ListHeaderComponent={
          <View>
            <TextInput
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => setSearch(q.trim())}
              placeholder={t('admin.searchUsers')}
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCapitalize="none"
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                fontSize: 16,
                marginBottom: spacing.md,
                color: colors.text,
              }}
            />
            <ChipGroup
              value={role}
              onChange={setRole}
              options={[
                { value: 'ALL' as RoleFilter, label: t('admin.all') },
                ...(['CLIENT', 'NOTARY', 'ADMIN'] as Role[]).map((r) => ({ value: r as RoleFilter, label: t(`roles.${r}`) })),
              ]}
            />
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} /> : <EmptyState text={t('admin.empty')} />
        }
        renderItem={({ item }) => (
          <Row
            style={{
              backgroundColor: colors.surface,
              padding: spacing.md,
              borderRadius: radius.md,
              marginBottom: spacing.sm,
              gap: spacing.md,
            }}
          >
            <Avatar url={item.avatarUrl} name={fullName(item)} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3} onPress={() => router.push(`/admin/user/${item.id}`)}>
                {fullName(item)}
              </Text>
              <Text style={font.small} numberOfLines={1}>
                {item.email}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge label={t(`roles.${item.role}`)} tone={item.role === 'ADMIN' ? 'chain' : item.role === 'NOTARY' ? 'info' : 'neutral'} />
              {!item.isActive ? <Badge label={t('admin.suspended')} tone="danger" /> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} onPress={() => router.push(`/admin/user/${item.id}`)} />
          </Row>
        )}
        onEndReached={() => query.hasNextPage && query.fetchNextPage()}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
      />
    </>
  );
}
