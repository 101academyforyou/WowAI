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

export function ProfileView({ username }: { username: string }) {
  const c = useColors();
  const { user: me } = useAuth();
  const [data, setData] = useState<{ user: Profile; posts: Post[] } | null>(null);
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

  if (error && !data) return <Empty title="糟糕" message={error} />;
  if (!data) return <Loading />;
  const { user, posts } = data;
  const isMe = me?.id === user.id;

  async function toggleFollow() {
    if (!me) return router.push('/login');
    try {
      const res = await api<{ followedByMe: boolean }>(`/api/users/${encodeURIComponent(user.username)}/follow`, {
        method: user.followedByMe ? 'DELETE' : 'POST',
      });
      setData({
        posts,
        user: { ...user, followedByMe: res.followedByMe, followerCount: user.followerCount + (res.followedByMe ? 1 : -1) },
      });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function toggleBlock() {
    if (!me) return router.push('/login');
    const blocking = !user.blockedByMe;
    if (blocking && !(await confirmAction(`封鎖 @${user.username}？`, '你將不會再看到對方的貼文和留言，並會互相取消追蹤。', '封鎖'))) return;
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
            [user.postCount, '作品'],
            [user.followerCount, '粉絲'],
            [user.followingCount, '追蹤中'],
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
          <Text style={[styles.contactsTitle, { color: c.muted }]}>{'// 聯繫我'}</Text>
          <View style={styles.contactRow}>
            {user.contacts.map((ct) => {
              const field = contactField(ct.type);
              return (
                <Pressable
                  key={ct.type}
                  onPress={() => Linking.openURL(ct.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`${ct.label}：${ct.value}`}
                  style={({ pressed }) => [styles.contact, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name={field.icon} size={17} color={field.color} />
                  <Text style={[styles.contactLabel, { color: c.text }]}>{ct.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        {isMe ? (
          <Button title="編輯個人檔案" onPress={() => router.push('/settings')} style={{ flex: 1 }} />
        ) : (
          <>
            {!user.blockedByMe ? (
              <Button
                title={user.followedByMe ? '追蹤中' : '追蹤'}
                variant={user.followedByMe ? 'secondary' : 'primary'}
                onPress={toggleFollow}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button title={user.blockedByMe ? '解除封鎖' : '封鎖'} variant="danger" onPress={toggleBlock} style={{ flex: user.blockedByMe ? 1 : undefined }} />
          </>
        )}
      </View>
      {posts.length ? (
        <PostGrid posts={posts} />
      ) : (
        <Empty message={user.blockedByMe ? '你已封鎖這位使用者' : isMe ? '你還沒有分享任何 AI 工具' : '還沒有作品'}>
          {isMe ? <Button title="分享第一個作品" variant="primary" onPress={() => router.push('/new')} /> : null}
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
  contacts: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  contactsTitle: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  contactLabel: { fontWeight: '700', fontSize: 13, fontFamily: fonts.mono },
});
