import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, type Post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useColors } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { Button, Empty, Loading, notify } from '../../components/ui';

type Feed = 'all' | 'following';

export default function HomeScreen() {
  const c = useColors();
  const { user } = useAuth();
  const [selectedFeed, setFeed] = useState<Feed>('all');
  // 登出後自動回到「最新分享」
  const feed: Feed = user ? selectedFeed : 'all';
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async (reset: boolean, before?: number | null) => {
    const qs = new URLSearchParams({ feed });
    if (!reset && before) qs.set('before', String(before));
    try {
      const data = await api<{ posts: Post[]; nextBefore: number | null }>(`/api/posts?${qs}`);
      setPosts((prev) => (reset || !prev ? data.posts : [...prev, ...data.posts]));
      setNextBefore(data.nextBefore);
    } catch (err) {
      setPosts((prev) => prev ?? []);
      notify((err as Error).message);
    }
  }, [feed]);

  // 回到首頁（例如剛分享完、或登入狀態改變）時重新整理
  useFocusEffect(useCallback(() => {
    load(true);
  }, [load]));

  function selectFeed(f: Feed) {
    if (f === 'following' && !user) return router.push('/login');
    setPosts(null);
    setFeed(f);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.tabs, { borderColor: c.border }]}>
        {(['all', 'following'] as const).map((f) => (
          <Pressable key={f} onPress={() => selectFeed(f)} style={[styles.tab, feed === f && { borderColor: c.text }]}>
            <Text style={{ color: feed === f ? c.text : c.muted, fontWeight: '700' }}>{f === 'all' ? '最新分享' : '追蹤中'}</Text>
          </Pressable>
        ))}
      </View>
      {posts === null ? (
        <Loading />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item }) => (
            <PostCard post={item} onRemoved={() => setPosts((ps) => ps?.filter((p) => p.id !== item.id) ?? null)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} />}
          onEndReachedThreshold={0.5}
          onEndReached={async () => {
            if (!nextBefore || loadingMore.current) return;
            loadingMore.current = true;
            await load(false, nextBefore);
            loadingMore.current = false;
          }}
          ListEmptyComponent={
            <Empty
              title={feed === 'following' ? '追蹤的人還沒有分享' : '還沒有人分享'}
              message="用 AI 做了什麼好玩的工具嗎？附上截圖或影片秀給大家看！"
            >
              <Button title="分享我的 AI 工具" variant="primary" onPress={() => router.push('/new')} />
            </Empty>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderColor: 'transparent' },
});
