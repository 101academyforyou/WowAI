import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { MAX_CONTENT_WIDTH, fonts, useColors } from '../lib/theme';
import { DialogHost, Loading } from '../components/ui';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

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
  const { width } = useWindowDimensions();
  const wide = width > MAX_CONTENT_WIDTH + 2;
  // 科技風固定使用深色主題
  const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, border: c.border, primary: c.accent, text: c.text } };
  return (
    <ThemeProvider value={theme}>
      <AuthProvider>
        {Platform.OS === 'web' ? (
          // 網頁版：電腦上置中成一欄
          <View style={[styles.page, { backgroundColor: c.bg }]}>
            <View style={[styles.column, wide && { borderColor: c.border, borderLeftWidth: 1, borderRightWidth: 1 }]}>
              <RootStack />
            </View>
          </View>
        ) : (
          <RootStack />
        )}
        <DialogHost />
        <StatusBar style="light" />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH + 2 },
});
