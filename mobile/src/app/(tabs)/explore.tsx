import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, type Post } from '../../lib/api';
import { useColors } from '../../lib/theme';
import { PostGrid } from '../../components/PostGrid';
import { Chip, Empty, Loading, notify } from '../../components/ui';

export default function ExploreScreen() {
  const c = useColors();
  const { tag = '' } = useLocalSearchParams<{ tag?: string }>();
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api<{ tags: { name: string; count: number }[] }>('/api/tags'),
        api<{ posts: Post[] }>(`/api/posts?${new URLSearchParams(tag ? { tag } : {})}`),
      ]);
      setTags(t.tags);
      setPosts(p.posts);
    } catch (err) {
      setPosts((prev) => prev ?? []);
      notify((err as Error).message);
    }
  }, [tag]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>{tag ? `#${tag}` : '探索 AI 工具'}</Text>
        <View style={styles.chips}>
          <Chip label="全部" active={!tag} onPress={() => router.setParams({ tag: '' })} />
          {tags.map((t) => (
            <Chip
              key={t.name}
              label={`#${t.name} · ${t.count}`}
              active={t.name.toLowerCase() === tag.toLowerCase()}
              onPress={() => router.setParams({ tag: t.name })}
            />
          ))}
        </View>
      </View>
      {posts === null ? <Loading /> : posts.length ? <PostGrid posts={posts} /> : <Empty message="這個分類還沒有作品" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
