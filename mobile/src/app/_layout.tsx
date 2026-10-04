import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { useColors } from '../lib/theme';
import { Loading } from '../components/ui';

function RootStack() {
  const { ready } = useAuth();
  const c = useColors();
  if (!ready) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.text,
        headerStyle: { backgroundColor: c.bg },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ title: '貼文' }} />
      <Stack.Screen name="user/[username]" options={{ title: '' }} />
      <Stack.Screen name="settings" options={{ title: '編輯個人檔案' }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', title: '' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootStack />
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}
