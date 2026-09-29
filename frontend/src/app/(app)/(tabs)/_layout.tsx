import { Pressable, Text, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { can, useAuth } from '@/store/auth';
import { useConversations, useUnreadNotifications } from '@/hooks/useUnread';
import { colors } from '@/theme';
import type { IconName } from '@/components/ui';

function NotificationBell() {
  const { data: count = 0 } = useUnreadNotifications();
  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={{ marginRight: 16 }}>
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {count > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -6,
            backgroundColor: colors.danger,
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Filled icon for the active tab, outline otherwise. */
const icon = (name: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} color={color} size={24} />;
  };

/** Tabs adapt to the role: sellers get "My lands", notaries the notary desk, admins the admin console. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const { data: conversations } = useConversations();
  const unreadMessages = conversations?.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text,
        tabBarActiveBackgroundColor: colors.primaryLight,
        tabBarStyle: {
          height: 68 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 6 + insets.bottom,
          paddingHorizontal: 4,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarItemStyle: { borderRadius: 12, marginHorizontal: 2 },
        // Fixed icon box so it can't grow and squeeze the label.
        tabBarIconStyle: { flexGrow: 0, flexShrink: 0, height: 26 },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2 },
        tabBarAllowFontScaling: true,
        headerTitleStyle: { color: colors.text },
        headerRight: () => <NotificationBell />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.explore'), tabBarIcon: icon('search') }} />
      <Tabs.Screen name="favorites" options={{ title: t('tabs.favorites'), tabBarIcon: icon('heart') }} />
      <Tabs.Screen
        name="my-lands"
        options={{ title: t('tabs.myLands'), tabBarIcon: icon('map'), href: can.listLand(user) ? undefined : null }}
      />
      <Tabs.Screen
        name="notary"
        options={{ title: t('tabs.notary'), tabBarIcon: icon('ribbon'), href: can.notarize(user) ? undefined : null }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: t('tabs.admin'), tabBarIcon: icon('speedometer'), href: can.administer(user) ? undefined : null }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: icon('chatbubbles'),
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
