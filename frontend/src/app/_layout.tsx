import { useEffect } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Importing '@/i18n' also initialises i18next before the first render.
import { restoreLanguage } from '@/i18n';
import { useAuth } from '@/store/auth';
import { Loading } from '@/components/ui';
import { colors } from '@/theme';

/**
 * On mobile browsers `height: 100%` includes the area behind the browser's own toolbars, which
 * hides the bottom tab bar. `100dvh` is the visible height (browsers without it ignore the rule).
 */
const webViewport = (Platform.OS === 'web' ? { height: '100dvh', overflow: 'hidden' } : {}) as ViewStyle;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void restoreLanguage().finally(bootstrap);
  }, [bootstrap]);

  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status]);

  return (
    <View style={[{ flex: 1 }, webViewport]}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          {status === 'loading' ? (
            <Loading />
          ) : (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Protected guard={status === 'signedOut'}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
              <Stack.Protected guard={status === 'signedIn'}>
                <Stack.Screen name="(app)" />
              </Stack.Protected>
            </Stack>
          )}
        </QueryClientProvider>
      </SafeAreaProvider>
    </View>
  );
}
