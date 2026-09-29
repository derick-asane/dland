import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HeaderBack } from '@/components/HeaderBack';
import { colors } from '@/theme';

/** Signed-in area: the tab bar plus every detail screen pushed on top of it. */
export default function AppLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
        headerBackButtonDisplayMode: 'minimal',
        // Always show a back arrow, even after a page refresh (no history on web).
        headerLeft: ({ tintColor }) => <HeaderBack tintColor={tintColor} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="land/new" options={{ title: t('landForm.newTitle') }} />
      <Stack.Screen name="land/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="land/[id]/edit" options={{ title: t('landForm.editTitle') }} />
      <Stack.Screen name="land/[id]/offer" options={{ title: t('offer.title'), presentation: 'modal' }} />
      <Stack.Screen name="land/[id]/history" options={{ title: t('history.title') }} />
      <Stack.Screen name="land/[id]/certificate" options={{ title: t('certificate.title') }} />
      <Stack.Screen name="land/[id]/setup" options={{ title: t('wizard.title') }} />
      <Stack.Screen name="offers" options={{ title: t('offer.myOffers') }} />
      <Stack.Screen name="transfers" options={{ title: t('transfers.title') }} />
      <Stack.Screen name="transfer/[id]" options={{ title: t('sale.title') }} />
      <Stack.Screen name="profile/escrow" options={{ title: t('escrow.title') }} />
      <Stack.Screen name="notifications" options={{ title: t('notifications.title') }} />
      <Stack.Screen name="chat/[id]" options={{ title: '' }} />
      <Stack.Screen name="user/[id]" options={{ title: '' }} />
      <Stack.Screen name="profile/edit" options={{ title: t('profile.edit') }} />
      <Stack.Screen name="profile/settings" options={{ title: t('profile.settings') }} />
      <Stack.Screen name="chain/index" options={{ title: t('chain.explorer') }} />
      <Stack.Screen name="chain/[hash]" options={{ title: t('chain.block') }} />
      <Stack.Screen name="notary/land/[id]" options={{ title: t('notary.reviewTitle') }} />
      <Stack.Screen name="admin/users" options={{ title: t('admin.users') }} />
      <Stack.Screen name="admin/user/[id]" options={{ title: '' }} />
      <Stack.Screen name="admin/create-user" options={{ title: t('admin.createUser') }} />
      <Stack.Screen name="admin/reports" options={{ title: t('admin.reports') }} />
      <Stack.Screen name="admin/lands" options={{ title: t('admin.listings') }} />
      <Stack.Screen name="admin/transfers" options={{ title: t('admin.transfers') }} />
      <Stack.Screen name="admin/audit" options={{ title: t('admin.audit') }} />
    </Stack>
  );
}
