import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, Text, type ColorValue } from 'react-native';
import { fonts, useColors } from '../../lib/theme';
import { chooseOption, Logo } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useNotifications } from '../../lib/notifications';
import { lang, setWebLang, tr } from '../../lib/i18n';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, activeName: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? activeName : name} size={27} color={color} />
  );
}

// 網頁版右上角的語言切換（iPhone 跟著手機語言，不需要）
function LangToggle() {
  const c = useColors();
  const next = lang === 'zh' ? 'en' : 'zh';
  return (
    <Pressable
      onPress={() => setWebLang(next)}
      accessibilityRole="button"
      accessibilityLabel={next === 'zh' ? '切換成中文' : 'Switch to English'}
      style={({ pressed }) => ({ marginRight: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{next === 'zh' ? '中文' : 'EN'}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const { unreadCount } = useNotifications();
  const { user, logout } = useAuth();
  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.mono, fontWeight: '700' },
        headerShadowVisible: false,
        headerRight: Platform.OS === 'web' ? () => <LangToggle /> : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tr('首頁', 'Home'),
          headerTitleAlign: 'left',
          headerTitle: () => <Logo size={24} />,
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen name="explore" options={{ title: tr('探索', 'Explore'), tabBarIcon: tabIcon('search-outline', 'search') }} />
      <Tabs.Screen
        name="new"
        options={{
          title: tr('分享你的 AI 工具', 'Share your AI tool'),
          tabBarIcon: ({ focused }) => <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={32} color={c.accent} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: tr('通知', 'Notifications'),
          tabBarIcon: tabIcon('notifications-outline', 'notifications'),
          tabBarAccessibilityLabel: unreadCount ? tr(`通知，${unreadCount} 則未讀`, `Notifications, ${unreadCount} unread`) : tr('通知', 'Notifications'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: c.notCool, color: '#fff', fontFamily: fonts.mono, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: tr('個人', 'Me'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
        // 已經在「個人」頁時再點一次分頁按鈕：跳出登出選項
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (!user || !navigation.isFocused()) return;
            e.preventDefault();
            chooseOption(`@${user.username}`, [tr('登出', 'Log out')], { destructiveIndex: 0 }).then((i) => {
              if (i === 0) logout();
            });
          },
        })}
      />
    </Tabs>
  );
}
