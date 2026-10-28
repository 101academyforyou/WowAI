import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, type Post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fonts, useColors } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { Button, Empty, Loading, notify } from '../../components/ui';
import { tr } from '../../lib/i18n';
import { CategoryFilter } from '../../components/CategoryChips';

// foryou：打亂順序，每次重新整理都不一樣；top：Cool 排行榜
type Feed = 'foryou' | 'latest' | 'top' | 'following';
type Period = 'week' | 'month' | 'all';

const FEEDS: Feed[] = ['foryou', 'latest', 'top', 'following'];
const feedLabel = (f: Feed) => ({
  foryou: tr('推薦', 'For you'),
  latest: tr('最新', 'Latest'),
  top: tr('排行', 'Top'),
  following: tr('追蹤中', 'Following'),
})[f];
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: tr('本週', 'This week') },
  { value: 'month', label: tr('本月', 'This month') },
  { value: 'all', label: tr('全部', 'All time') },
];
const newSeed = () => Math.floor(Math.random() * 2_000_000_000) + 1;

export default function HomeScreen() {
  const c = useColors();
  const { user } = useAuth();
  const [selectedFeed, setFeed] = useState<Feed>('foryou');
  // 登出後「追蹤中」自動回到「推薦」
  const feed: Feed = !user && selectedFeed === 'following' ? 'foryou' : selectedFeed;
  const [period, setPeriod] = useState<Period>('all');
  const seed = useRef(newSeed());
  const [category, setCategory] = useState('');
  const [posts, setPosts] = useState<Post[] | null>(null);
  // 下一頁從哪裡接：最新／追蹤中用 before，推薦／排行用 offset
  const [next, setNext] = useState<{ before: number | null; offset: number | null }>({ before: null, offset: null });
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async (reset: boolean, cursor?: { before: number | null; offset: number | null }) => {
    const qs = new URLSearchParams();
    if (feed === 'following') qs.set('feed', 'following');
    if (feed === 'foryou') {
      // 每次重新載入換一個順序；載入下一頁時沿用同一個 seed，才不會重複或漏掉
      if (reset) seed.current = newSeed();
      qs.set('sort', 'random');
      qs.set('seed', String(seed.current));
    }
    if (feed === 'top') {
      qs.set('sort', 'top');
      qs.set('period', period);
    }
    if (category) qs.set('category', category);
    if (!reset && cursor?.before) qs.set('before', String(cursor.before));
    if (!reset && cursor?.offset) qs.set('offset', String(cursor.offset));
    try {
      const data = await api<{ posts: Post[]; nextBefore: number | null; nextOffset?: number | null }>(`/api/posts?${qs}`);
      setPosts((prev) => (reset || !prev ? data.posts : [...prev, ...data.posts.filter((p) => !prev.some((q) => q.id === p.id))]));
      setNext({ before: data.nextBefore, offset: data.nextOffset ?? null });
    } catch (err) {
      setPosts((prev) => prev ?? []);
      notify((err as Error).message);
    }
  }, [feed, category, period]);

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
        {FEEDS.map((f) => (
          <Pressable key={f} onPress={() => selectFeed(f)} style={[styles.tab, feed === f && { borderColor: c.accent }]} accessibilityRole="tab" accessibilityState={{ selected: feed === f }}>
            <Text style={{ color: feed === f ? c.accent : c.muted, fontWeight: '700', fontFamily: fonts.mono, fontSize: 13 }} numberOfLines={1}>{feedLabel(f)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.categories, { borderColor: c.border }]}>
        <CategoryFilter
          value={category}
          onChange={(slug) => {
            setPosts(null);
            setCategory(slug);
          }}
        />
      </View>
      {posts === null ? (
        <Loading />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => String(p.id)}
          ListHeaderComponent={feed === 'top' ? (
            <View style={styles.periods}>
              <Text style={{ color: c.muted, fontFamily: fonts.mono, fontSize: 12 }}>{tr('// Cool 排行', '// Cool rank')}</Text>
              <View style={{ flex: 1 }} />
              {PERIODS.map((p) => (
                <Pressable
                  key={p.value}
                  onPress={() => { setPosts(null); setPeriod(p.value); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: period === p.value }}
                  style={[styles.period, { borderColor: period === p.value ? c.accent : c.border, backgroundColor: period === p.value ? `${c.accent}22` : c.surface }]}
                >
                  <Text style={{ color: period === p.value ? c.accent : c.text, fontSize: 12, fontWeight: '700' }}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          renderItem={({ item, index }) => (
            <PostCard post={item} rank={feed === 'top' ? index + 1 : undefined} onRemoved={() => setPosts((ps) => ps?.filter((p) => p.id !== item.id) ?? null)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} />}
          onEndReachedThreshold={0.5}
          onEndReached={async () => {
            if ((!next.before && !next.offset) || loadingMore.current) return;
            loadingMore.current = true;
            await load(false, next);
            loadingMore.current = false;
          }}
          ListEmptyComponent={
            <Empty
              title={category ? tr('這個領域還沒有作品', 'Nothing in this category yet') : feed === 'top' && period !== 'all' ? tr('這段期間還沒有作品', 'Nothing from this period yet') : feed === 'following' ? tr('追蹤的人還沒有分享', 'Nothing from people you follow yet') : tr('還沒有人分享', 'Nothing shared yet')}
              message={tr('用 AI 做了什麼好玩的工具嗎？附上截圖或 YouTube 影片秀給大家看！', 'Built something fun with AI? Show everyone with a screenshot or a YouTube demo!')}
            >
              <Button title={tr('分享我的 AI 工具', 'Share my AI tool')} variant="primary" onPress={() => router.push('/new')} />
            </Empty>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  categories: { borderBottomWidth: StyleSheet.hairlineWidth },
  periods: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  period: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderColor: 'transparent' },
});
