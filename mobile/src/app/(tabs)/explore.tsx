import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, type Post, type User } from '../../lib/api';
import { fonts, useColors } from '../../lib/theme';
import { PostGrid } from '../../components/PostGrid';
import { Avatar, Chip, Empty, Loading, notify } from '../../components/ui';

type Tag = { name: string; count: number };

export default function ExploreScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ tag?: string; q?: string }>();
  const tag = params.tag ?? '';
  const [input, setInput] = useState(params.q ?? '');
  const [query, setQuery] = useState(params.q?.trim() ?? '');
  const [tags, setTags] = useState<Tag[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  // 打字停 0.3 秒才搜尋，不用每打一個字就送出
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const qs = new URLSearchParams();
    if (tag) qs.set('tag', tag);
    if (query) qs.set('q', query);
    try {
      const [t, p, u] = await Promise.all([
        api<{ tags: Tag[] }>('/api/tags'),
        api<{ posts: Post[] }>(`/api/posts?${qs}`),
        query ? api<{ users: User[] }>(`/api/users?${new URLSearchParams({ q: query })}`) : Promise.resolve({ users: [] }),
      ]);
      if (id !== requestId.current) return; // 已經有更新的搜尋，丟掉舊結果
      setTags(t.tags);
      setPosts(p.posts);
      setUsers(u.users);
    } catch (err) {
      if (id !== requestId.current) return;
      setPosts((prev) => prev ?? []);
      notify((err as Error).message);
    }
  }, [tag, query]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const title = query ? `搜尋「${query}」` : tag ? `#${tag}` : '探索別人用 AI 做了什麼酷工具';
  const emptyMessage = query
    ? `找不到${tag ? ` #${tag} 裡` : ''}和「${query}」有關的作品`
    : '這個分類還沒有作品';

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.header}>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: input ? c.accent : c.border }]}>
          <Ionicons name="search" size={18} color={input ? c.accent : c.muted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => setQuery(input.trim())}
            placeholder="搜尋 AI 工具、標籤或 Cooler"
            placeholderTextColor={c.muted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={50}
            accessibilityLabel="搜尋"
          />
          {input ? (
            <Pressable onPress={() => { setInput(''); setQuery(''); }} hitSlop={10} accessibilityLabel="清除搜尋">
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* iPhone 小螢幕（例如 SE）自動縮小字體，維持一行 */}
        <Text
          style={[styles.title, { color: c.text }]}
          numberOfLines={Platform.OS === 'web' ? undefined : 1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {title}
        </Text>
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

      {query && users.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.muted }]}>{`// Cooler · ${users.length}`}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.users}>
            {users.map((u) => (
              <Pressable
                key={u.id}
                style={styles.user}
                onPress={() => router.push(`/user/${encodeURIComponent(u.username)}`)}
                accessibilityRole="button"
                accessibilityLabel={`${u.displayName} @${u.username}`}
              >
                <Avatar user={u} size={56} />
                <Text style={[styles.userName, { color: c.text }]} numberOfLines={1}>{u.displayName}</Text>
                <Text style={[styles.userHandle, { color: c.muted }]} numberOfLines={1}>@{u.username}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {query && posts?.length ? (
        <Text style={[styles.sectionTitle, styles.postsTitle, { color: c.muted }]}>{`// 作品 · ${posts.length}`}</Text>
      ) : null}
      {posts === null ? <Loading /> : posts.length ? <PostGrid posts={posts} /> : <Empty message={emptyMessage} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  // 外框已經會在輸入時變成青色，網頁版不需要瀏覽器自己的 focus 外框
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, outlineWidth: 0 },
  title: { fontSize: 22, fontWeight: '800', fontFamily: fonts.mono },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { paddingBottom: 12, gap: 8 },
  sectionTitle: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', paddingHorizontal: 16 },
  postsTitle: { paddingBottom: 8 },
  users: { paddingHorizontal: 16, gap: 14 },
  user: { width: 72, alignItems: 'center', gap: 4 },
  userName: { fontSize: 12, fontWeight: '700' },
  userHandle: { fontSize: 11, fontFamily: fonts.mono },
});
