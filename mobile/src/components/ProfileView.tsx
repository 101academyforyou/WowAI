import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api, type Post, type Profile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { contactField } from '../lib/contacts';
import { fonts, useColors } from '../lib/theme';
import { PostGrid } from './PostGrid';
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
                  onPress={() => Linking.openURL(ct.url)}
                  accessibilityRole="link"
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
          <Button title={tr('編輯個人檔案', 'Edit profile')} onPress={() => router.push('/settings')} style={{ flex: 1 }} />
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
      {tab === 'reposts' && !user.blockedByMe ? (
        reposts.length ? (
          <PostGrid posts={reposts} />
        ) : (
          <Empty
            message={isMe
              ? tr('還沒有分享別人的作品。在貼文按紙飛機 → 分享到我的 YourWowAI，就會出現在這裡。', "You haven't shared anyone's projects yet. Tap the paper plane on a post → Share to my YourWowAI, and it shows up here.")
              : tr('還沒有分享的作品', 'No shared projects yet')}
          />
        )
      ) : posts.length ? (
        <PostGrid posts={posts} />
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
  contacts: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  contactsTitle: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  contactLabel: { fontWeight: '700', fontSize: 13, fontFamily: fonts.mono },
});
