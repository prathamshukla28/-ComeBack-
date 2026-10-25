import '@/lib/polyfills';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { EnvBanner } from '@/components/EnvBanner';
import { useColorScheme } from '@/components/useColorScheme';
import LoginScreen from './login';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SubscriptionProvider } from '@/lib/subscription';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  useEffect(() => {
    if (error) throw error;
  }, [error]);
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
          <RootLayoutNav />
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  const scheme = useColorScheme();
  const { session, loading } = useAuth();

  // Replay any habit logs captured offline once we're signed in.
  useEffect(() => {
    if (!session) return;
    import('@/lib/outbox')
      .then((m) => m.flushOutbox())
      .then((n) => {
        if (n > 0) queryClient.invalidateQueries({ queryKey: ['habit'] });
      })
      .catch((e) => console.warn('[ComeBack] outbox flush failed', e));
  }, [session]);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <EnvBanner />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : !session ? (
        <LoginScreen />
      ) : (
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'ComeBack Pro' }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}
