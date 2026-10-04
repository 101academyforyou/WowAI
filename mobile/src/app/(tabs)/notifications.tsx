import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, mediaUri, timeAgo, type AppNotification } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useNotifications } from '../../lib/notifications';
import { fonts, useColors } from '../../lib/theme';
import { Avatar, Button, Empty, Loading } from '../../components/ui';

const TYPE_ICON = {
  cool: 'flash',
  comment: 'chatbubble',
  follow: 'person-add',
  new_post: 'sparkles',
} as const;

type Page = { notifications: AppNotification[]; nextBefore: number | null };

export default function NotificationsScreen() {
  const c = useColors();
  const { user } = useAuth();
  const { markAllRead } = useNotifications();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api<Page>('/api/notifications');
      setItems(data.notifications);
      setNextBefore(data.nextBefore);
      // 看過就算已讀；列表上仍保留這次的未讀標示，方便看出哪些是新的
      if (data.notifications.some((n) => !n.read)) markAllRead();
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, [markAllRead]);

  useFocusEffect(useCallback(() => {
    if (user) load();
  }, [user, load]));

  if (!user) {
    return (
      <Empty title="通知" message="登入後，有人 Cool 你的作品、留言或追蹤你時，會在這裡通知你。">
        <Button title="登入或註冊" variant="primary" onPress={() => router.push('/login')} />
      </Empty>
    );
  }
  if (!items) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={items}
      keyExtractor={(n) => String(n.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      onEndReachedThreshold={0.5}
      onEndReached={async () => {
        if (!nextBefore || loadingMore.current) return;
        loadingMore.current = true;
        try {
          const data = await api<Page>(`/api/notifications?before=${nextBefore}`);
          setItems((prev) => [...(prev ?? []), ...data.notifications]);
          setNextBefore(data.nextBefore);
        } finally {
          loadingMore.current = false;
        }
      }}
      ListEmptyComponent={<Empty title="還沒有通知" message="分享作品、追蹤其他 Cooler，就會開始收到通知。" />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(item.link)}
          accessibilityRole="button"
          accessibilityLabel={`${item.read ? '' : '未讀，'}${item.message}`}
          style={({ pressed }) => [
            styles.row,
            { borderColor: c.border, backgroundColor: item.read ? c.bg : `${c.accent}0d`, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {!item.read ? <View style={[styles.unreadBar, { backgroundColor: c.accent }]} /> : null}
          <View>
            <Avatar user={item.actor} size={44} />
            <View style={[styles.typeBadge, { backgroundColor: c.surface2, borderColor: c.bg }]}>
              <Ionicons name={TYPE_ICON[item.type]} size={11} color={item.type === 'cool' ? c.cool : c.accent} />
            </View>
          </View>
          <View style={styles.body}>
            <Text style={{ color: c.text, lineHeight: 20 }} numberOfLines={3}>{item.message}</Text>
            <Text style={[styles.time, { color: c.muted }]}>{timeAgo(item.createdAt)}</Text>
          </View>
          {item.thumbnailUrl ? (
            <Image source={{ uri: mediaUri(item.thumbnailUrl) }} style={[styles.thumb, { borderColor: c.border }]} contentFit="cover" />
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  typeBadge: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  time: { fontSize: 12, fontFamily: fonts.mono },
  thumb: { width: 46, height: 46, borderRadius: 6, borderWidth: 1 },
});
