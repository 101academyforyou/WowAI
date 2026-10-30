import { useEffect } from 'react';
import { DarkTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { NotificationsProvider } from '../lib/notifications';
import { MAX_CONTENT_WIDTH, fonts, useColors } from '../lib/theme';
import { DialogHost, Loading } from '../components/ui';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tr } from '../lib/i18n';

// 點 iPhone 推播 → 打開對應的貼文或個人頁（App 沒開時點進來也一樣）
function useOpenPushTarget(ready: boolean) {
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) setTimeout(() => router.push(url), 0);
    };
    Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready]);
}

// 直接打開貼文、個人頁等網址（例如別人分享的連結）時沒有上一頁，左上角改成回首頁
function HomeButton() {
  const c = useColors();
  return (
    <Pressable onPress={() => router.replace('/')} hitSlop={10} style={styles.home} accessibilityRole="button" accessibilityLabel={tr('回到首頁', 'Back to home')}>
      <Ionicons name="chevron-back" size={22} color={c.text} />
      <Ionicons name="home-outline" size={20} color={c.text} />
      <Text style={{ color: c.text, fontFamily: fonts.mono, fontWeight: '700', fontSize: 14 }}>{tr('首頁', 'Home')}</Text>
    </Pressable>
  );
}

function RootStack() {
  const { ready } = useAuth();
  const c = useColors();
  useOpenPushTarget(ready);
  if (!ready) return <Loading />;
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.text,
        headerStyle: { backgroundColor: c.bg },
        headerTitleStyle: { fontFamily: fonts.mono, fontWeight: '700' },
        contentStyle: { backgroundColor: c.bg },
        headerLeft: navigation.canGoBack() ? undefined : () => <HomeButton />,
      })}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ title: tr('貼文', 'Post') }} />
      <Stack.Screen name="edit/[id]" options={{ title: tr('編輯貼文', 'Edit post') }} />
      <Stack.Screen name="user/[username]" options={{ title: '' }} />
      <Stack.Screen name="follows/[username]" options={{ title: '' }} />
      <Stack.Screen name="learn/[id]" options={{ title: 'Learn it' }} />
      <Stack.Screen name="settings" options={{ title: tr('編輯個人檔案', 'Edit profile') }} />
      <Stack.Screen name="admin" options={{ title: tr('管理員：檢舉處理', 'Admin: reports') }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
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
        <NotificationsProvider>
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
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH + 2 },
  home: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
});
