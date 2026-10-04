import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, type ColorValue } from 'react-native';
import { useColors } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, activeName: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? activeName : name} size={27} color={color} />
  );
}

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首頁',
          headerTitleAlign: 'left',
          headerTitle: () => (
            <Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>
              Wow<Text style={{ color: c.accent2 }}>AI</Text>
            </Text>
          ),
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen name="explore" options={{ title: '探索', tabBarIcon: tabIcon('search-outline', 'search') }} />
      <Tabs.Screen
        name="new"
        options={{
          title: '分享你的 AI 工具',
          tabBarIcon: ({ focused }) => <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={30} color={c.accent2} />,
        }}
      />
      <Tabs.Screen name="me" options={{ title: '個人', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
