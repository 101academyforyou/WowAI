import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { api, type Post, type Profile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { contactField } from '../lib/contacts';
import { fonts, useColors } from '../lib/theme';
import { PinIcon, PostGrid } from './PostGrid';
import { Avatar, Button, Empty, Loading, confirmAction, notify } from './ui';
import { tr } from '../lib/i18n';

export function ProfileView({ username }: { username: string }) {
  const c = useColors();
  const { user: me } = useAuth();
  const [data, setData] = useState<{ user: Profile; posts: Post[]; reposts: Post[] } | null>(null);
  // 個人頁下方的分頁：自己的作品，或在 YourWowAI 裡分享的別人作品
  const [tab, setTab] = useState<'posts' | 'reposts'>('posts');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // 排列模式：自己的個人頁可以調整作品／分享的順序，也能直接釘選
  const [arranging, setArranging] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/users/${encodeURIComponent(username)}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [username]);

  // 每次回到這個畫面都重新整理（例如剛分享完）
  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  if (error && !data) return <Empty title={tr('糟糕', 'Oops')} message={error} />;
  if (!data) return <Loading />;
  const { user, posts, reposts } = data;
  const isMe = me?.id === user.id;

  async function toggleFollow() {
    if (!me) return router.push('/login');
    try {
      const res = await api<{ followedByMe: boolean }>(`/api/users/${encodeURIComponent(user.username)}/follow`, {
        method: user.followedByMe ? 'DELETE' : 'POST',
      });
      setData({
        posts,
        reposts,
        user: { ...user, followedByMe: res.followedByMe, followerCount: user.followerCount + (res.followedByMe ? 1 : -1) },
      });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  // 釘選的永遠排在最前面（排序穩定，不會打亂其他順序）
  const pinnedFirst = (list: Post[]) => [...list.filter((p) => p.pinned), ...list.filter((p) => !p.pinned)];

  async function saveOrder(key: 'posts' | 'reposts', list: Post[]) {
    const prev = data;
    setData((d) => (d ? { ...d, [key]: list } : d));
    try {
      await api(`/api/me/${key}/order`, { method: 'PUT', body: { ids: list.map((p) => p.id) } });
    } catch (err) {
      setData(prev);
      notify((err as Error).message);
    }
  }

  // delta：左右 ±1、上下 ±3（跨一列）；和目標位置的那一格互換
  function move(key: 'posts' | 'reposts', index: number, delta: number) {
    const list = [...data![key]];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    // 釘選和沒釘選的各自排，不能互相越過
    if (Boolean(list[index].pinned) !== Boolean(list[target].pinned)) {
      return notify(list[index].pinned ? tr('釘選的會固定在最前面', 'Pinned items always stay first') : tr('先釘選才能移到最前面', 'Pin it to move it to the top'));
    }
    [list[index], list[target]] = [list[target], list[index]];
    saveOrder(key, list);
  }

  // 作品分頁釘選自己的貼文；分享分頁釘選的是「我分享的這則」，各自最多 3 則
  async function togglePin(key: 'posts' | 'reposts', post: Post) {
    try {
      const url = key === 'posts' ? `/api/posts/${post.id}/pin` : `/api/me/reposts/${post.id}/pin`;
      await api(url, { method: post.pinned ? 'DELETE' : 'PUT' });
      const list = pinnedFirst(data![key].map((p) => (p.id === post.id ? { ...p, pinned: !post.pinned } : p)));
      await saveOrder(key, list);
    } catch (err) {
      notify((err as Error).message);
    }
  }

  // Email 直接複製（不一定有設定郵件 App）；其他聯繫方式打開連結
  async function openContact(ct: Profile['contacts'][number]) {
    if (ct.type !== 'email') return Linking.openURL(ct.url);
    try {
      await Clipboard.setStringAsync(ct.value);
      notify(tr('已複製 Email', 'Email copied'), ct.value);
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function toggleBlock() {
    if (!me) return router.push('/login');
    const blocking = !user.blockedByMe;
    if (blocking && !(await confirmAction(tr(`封鎖 @${user.username}？`, `Block @${user.username}?`), tr('你將不會再看到對方的貼文和留言，並會互相取消追蹤。', "You won't see their posts or comments, and you'll unfollow each other."), tr('封鎖', 'Block')))) return;
    try {
      await api(`/api/users/${encodeURIComponent(user.username)}/block`, { method: blocking ? 'POST' : 'DELETE' });
      await load();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.head}>
        <Avatar user={user} size={84} />
        <View style={styles.stats}>
          {[
            [user.postCount, tr('作品', 'Projects')],
            [user.followerCount, tr('粉絲', 'Followers')],
            [user.followingCount, tr('追蹤中', 'Following')],
          ].map(([n, label]) => (
            <View key={label} style={styles.stat}>
              <Text style={[styles.statNumber, { color: c.accent, fontFamily: fonts.mono }]}>{n}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: c.text }]}>{user.displayName}</Text>
        <Text style={{ color: c.muted, fontFamily: fonts.mono }}>@{user.username}</Text>
        {user.bio ? <Text style={{ color: c.text, marginTop: 6, lineHeight: 21 }}>{user.bio}</Text> : null}
      </View>
      {user.contacts.length > 0 && !user.blockedByMe ? (
        <View style={styles.contacts}>
          <Text style={[styles.contactsTitle, { color: c.muted }]}>{tr('// 聯繫我', '// contact me')}</Text>
          <View style={styles.contactRow}>
            {user.contacts.map((ct) => {
              const field = contactField(ct.type);
              return (
                <Pressable
                  key={ct.type}
                  onPress={() => openContact(ct)}
                  accessibilityRole={ct.type === 'email' ? 'button' : 'link'}
                  accessibilityLabel={`${field.label}${tr('：', ': ')}${ct.value}`}
                  style={({ pressed }) => [styles.contact, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name={field.icon} size={17} color={field.color} />
                  <Text style={[styles.contactLabel, { color: c.text }]}>{field.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        {isMe ? (
          <>
            <Button title={tr('編輯個人檔案', 'Edit profile')} onPress={() => router.push('/settings')} style={{ flex: 1 }} />
            {/* 管理員：檢舉處理的入口放在自己的個人頁 */}
            {me?.isAdmin ? <Button title={tr('管理員：檢舉處理', 'Admin: reports')} variant="primary" onPress={() => router.push('/admin')} style={{ flex: 1 }} /> : null}
          </>
        ) : (
          <>
            {!user.blockedByMe ? (
              <Button
                title={user.followedByMe ? tr('追蹤中', 'Following') : tr('追蹤', 'Follow')}
                variant={user.followedByMe ? 'secondary' : 'primary'}
                onPress={toggleFollow}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button title={user.blockedByMe ? tr('解除封鎖', 'Unblock') : tr('封鎖', 'Block')} variant="danger" onPress={toggleBlock} style={{ flex: user.blockedByMe ? 1 : undefined }} />
          </>
        )}
      </View>
      {!user.blockedByMe ? (
        <View style={[styles.tabs, { borderColor: c.border }]}>
          {([
            ['posts', 'grid-outline', 'grid', tr('作品', 'Projects')],
            ['reposts', 'paper-plane-outline', 'paper-plane', tr('分享', 'Shared')],
          ] as const).map(([key, icon, activeIcon, label]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                style={[styles.tab, { borderColor: active ? c.accent : 'transparent' }]}
              >
                <Ionicons name={active ? activeIcon : icon} size={22} color={active ? c.accent : c.muted} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {/* 至少一則就能釘選、複製連結 */}
      {isMe && (tab === 'posts' ? posts : reposts).length > 0 ? (
        <View style={styles.arrangeBar}>
          {/* 說明裡的圖示和格子上的按鈕一樣 */}
          <View style={styles.hint}>
            {arranging ? (
              <>
                <Text style={[styles.hintText, { color: c.muted }]}>{tr('用箭頭移動', 'Arrows move')}</Text>
                <Text style={[styles.hintText, { color: c.muted }]}>{tr('・', ' · ')}</Text>
                <PinIcon size={13} color={c.muted} />
                <Text style={[styles.hintText, { color: c.muted }]}>{tr(' 釘選（最多 3 則）', ' pin (up to 3)')}</Text>
                <Text style={[styles.hintText, { color: c.muted }]}>{tr('・', ' · ')}</Text>
                <Ionicons name="copy-outline" size={13} color={c.muted} />
                <Text style={[styles.hintText, { color: c.muted }]}>{tr(' 複製連結', ' copy link')}</Text>
              </>
            ) : null}
          </View>
          <Pressable
            onPress={() => setArranging(!arranging)}
            style={[styles.arrangeButton, { borderColor: arranging ? c.accent : c.border, backgroundColor: arranging ? c.accent : c.surface }]}
            accessibilityRole="button"
          >
            <Ionicons name={arranging ? 'checkmark' : 'swap-horizontal'} size={15} color={arranging ? '#000' : c.text} />
            <Text style={{ color: arranging ? '#000' : c.text, fontWeight: '800', fontSize: 13 }}>{arranging ? tr('完成', 'Done') : tr('排列', 'Arrange')}</Text>
          </Pressable>
        </View>
      ) : null}
      {tab === 'reposts' && !user.blockedByMe ? (
        reposts.length ? (
          <PostGrid posts={reposts} pinned arrange={isMe && arranging ? { onMove: (i, d) => move('reposts', i, d), onTogglePin: (p) => togglePin('reposts', p) } : undefined} />
        ) : (
          <Empty
            message={isMe
              ? tr('還沒有分享別人的作品。在貼文按紙飛機 → 分享到我的 YourWowAI，就會出現在這裡。', "You haven't shared anyone's projects yet. Tap the paper plane on a post → Share to my YourWowAI, and it shows up here.")
              : tr('還沒有分享的作品', 'No shared projects yet')}
          />
        )
      ) : posts.length ? (
        <PostGrid posts={posts} pinned arrange={isMe && arranging ? { onMove: (i, d) => move('posts', i, d), onTogglePin: (p) => togglePin('posts', p) } : undefined} />
      ) : (
        <Empty message={user.blockedByMe ? tr('你已封鎖這位使用者', "You've blocked this user") : isMe ? tr('你還沒有分享任何 AI 工具', "You haven't shared any AI tools yet") : tr('還沒有作品', 'No projects yet')}>
          {isMe ? <Button title={tr('分享第一個作品', 'Share your first project')} variant="primary" onPress={() => router.push('/new')} /> : null}
        </Empty>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '800' },
  info: { paddingHorizontal: 16, paddingBottom: 14 },
  name: { fontSize: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2 },
  hint: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  hintText: { fontSize: 12 },
  arrangeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  arrangeButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  contacts: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  contactsTitle: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  contactLabel: { fontWeight: '700', fontSize: 13, fontFamily: fonts.mono },
});
