import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { type ColorValue } from 'react-native';
import { fonts, useColors } from '../../lib/theme';
import { Logo } from '../../components/ui';
import { useNotifications } from '../../lib/notifications';
import { tr } from '../../lib/i18n';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, activeName: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? activeName : name} size={27} color={color} />
  );
}

export default function TabsLayout() {
  const c = useColors();
  const { unreadCount } = useNotifications();
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
      <Tabs.Screen name="me" options={{ title: tr('個人', 'Me'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
