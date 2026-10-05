import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { type ColorValue } from 'react-native';
import { fonts, useColors } from '../../lib/theme';
import { Logo } from '../../components/ui';
import { useNotifications } from '../../lib/notifications';

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
          title: '首頁',
          headerTitleAlign: 'left',
          headerTitle: () => <Logo size={24} />,
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen name="explore" options={{ title: '探索', tabBarIcon: tabIcon('search-outline', 'search') }} />
      <Tabs.Screen
        name="new"
        options={{
          title: '分享你的 AI 工具',
          tabBarIcon: ({ focused }) => <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={32} color={c.accent} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '通知',
          tabBarIcon: tabIcon('notifications-outline', 'notifications'),
          tabBarAccessibilityLabel: unreadCount ? `通知，${unreadCount} 則未讀` : '通知',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: c.notCool, color: '#fff', fontFamily: fonts.mono, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="me" options={{ title: '個人', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
