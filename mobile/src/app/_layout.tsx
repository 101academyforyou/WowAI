import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { fonts, useColors } from '../lib/theme';
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
        headerTitleStyle: { fontFamily: fonts.mono, fontWeight: '700' },
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
  const c = useColors();
  // 科技風固定使用深色主題
  const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, border: c.border, primary: c.accent, text: c.text } };
  return (
    <ThemeProvider value={theme}>
      <AuthProvider>
        <RootStack />
        <StatusBar style="light" />
      </AuthProvider>
    </ThemeProvider>
  );
}
