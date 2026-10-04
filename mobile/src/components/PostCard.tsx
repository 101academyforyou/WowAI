import { useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, REPORT_REASONS, api, timeAgo, type Post, type Vote } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fonts, glow, useColors } from '../lib/theme';
import { MediaCarousel } from './MediaCarousel';
import { Avatar, Chip, chooseOption, confirmAction, notify } from './ui';

// onRemoved：貼文被刪除、檢舉或作者被封鎖時，讓列表把它拿掉
export function PostCard({ post: initial, full = false, onRemoved }: { post: Post; full?: boolean; onRemoved?: () => void }) {
  const c = useColors();
  const { user } = useAuth();
  const [post, setPost] = useState(initial);
  const isMine = user?.id === post.author.id;

  function requireLogin() {
    if (user) return true;
    router.push('/login');
    return false;
  }

  // 投票：再按一次同一個會取消，按另一個會改票。先樂觀更新畫面再送出
  async function vote(next: Vote | null) {
    if (!requireLogin() || post.myVote === next) return;
    const prev = post;
    const count = (v: Vote) => post[v === 'cool' ? 'coolCount' : 'notCoolCount']
      - (post.myVote === v ? 1 : 0) + (next === v ? 1 : 0);
    setPost({ ...post, myVote: next, coolCount: count('cool'), notCoolCount: count('notcool') });
    try {
      const res = await api<Pick<Post, 'coolCount' | 'notCoolCount' | 'myVote'>>(`/api/posts/${post.id}/vote`, {
        method: next ? 'PUT' : 'DELETE',
        body: next ? { vote: next } : undefined,
      });
      setPost((p) => ({ ...p, ...res }));
    } catch (err) {
      setPost(prev);
      notify((err as Error).message);
    }
  }

  async function openMenu() {
    if (isMine || user?.isAdmin) {
      const choice = await chooseOption('貼文選項', ['刪除貼文'], { destructiveIndex: 0 });
      if (choice !== 0) return;
      if (!(await confirmAction('刪除這則分享？', '刪除後無法復原。', '刪除'))) return;
      try {
        await api(`/api/posts/${post.id}`, { method: 'DELETE' });
        onRemoved?.();
      } catch (err) {
        notify((err as Error).message);
      }
      return;
    }
    if (!requireLogin()) return;
    const choice = await chooseOption('貼文選項', ['檢舉貼文', `封鎖 @${post.author.username}`], { destructiveIndex: 1 });
    if (choice === 0) {
      const r = await chooseOption('為什麼要檢舉這則貼文？', REPORT_REASONS.map((x) => x.label));
      if (r === null) return;
      try {
        await api(`/api/posts/${post.id}/report`, { method: 'POST', body: { reason: REPORT_REASONS[r].value } });
        notify('感謝你的檢舉', '我們會在 24 小時內審查。這則貼文將不再顯示給你。');
        onRemoved?.();
      } catch (err) {
        notify((err as Error).message);
      }
    } else if (choice === 1) {
      const ok = await confirmAction(`封鎖 @${post.author.username}？`, '你將不會再看到對方的貼文和留言，並會互相取消追蹤。', '封鎖');
      if (!ok) return;
      try {
        await api(`/api/users/${encodeURIComponent(post.author.username)}/block`, { method: 'POST' });
        notify('已封鎖');
        onRemoved?.();
      } catch (err) {
        notify((err as Error).message);
      }
    }
  }

  const openPost = () => router.push(`/post/${post.id}`);

  return (
    <View style={[styles.card, { borderColor: c.border }]}>
      <View style={styles.header}>
        <Pressable style={styles.author} onPress={() => router.push(`/user/${encodeURIComponent(post.author.username)}`)}>
          <Avatar user={post.author} />
          <Text style={[styles.username, { color: c.text }]}>{post.author.username}</Text>
        </Pressable>
        <Text style={{ color: c.muted, fontSize: 13 }}>{timeAgo(post.createdAt)}</Text>
        <Pressable hitSlop={12} onPress={openMenu} accessibilityLabel="更多選項">
          <Ionicons name="ellipsis-horizontal" size={20} color={c.text} />
        </Pressable>
      </View>

      <MediaCarousel media={post.media} onDoubleTap={() => vote('cool')} />

      <View style={styles.actions}>
        <VoteButton kind="cool" count={post.coolCount} active={post.myVote === 'cool'} onPress={() => vote(post.myVote === 'cool' ? null : 'cool')} />
        <VoteButton kind="notcool" count={post.notCoolCount} active={post.myVote === 'notcool'} onPress={() => vote(post.myVote === 'notcool' ? null : 'notcool')} />
        <View style={{ flex: 1 }} />
        <Pressable hitSlop={8} onPress={openPost} accessibilityLabel="留言">
          <Ionicons name="chatbubble-outline" size={25} color={c.text} />
        </Pressable>
        <Pressable
          hitSlop={8}
          accessibilityLabel="分享"
          onPress={() => Share.share({ message: `${post.title} — 在 YourWowAI 上看這個 AI 工具：${API_URL}/#/p/${post.id}` })}
        >
          <Ionicons name="paper-plane-outline" size={24} color={c.text} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]}>{post.title}</Text>
        {post.description ? (
          <Text style={{ color: c.text, lineHeight: 21 }} numberOfLines={full ? undefined : 3}>{post.description}</Text>
        ) : null}
        {post.aiTools.length ? (
          <View style={styles.chips}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', fontFamily: fonts.mono }}>built_with:</Text>
            {post.aiTools.map((t) => (
              <Chip key={t} label={`#${t}`} onPress={() => router.push({ pathname: '/explore', params: { tag: t } })} />
            ))}
          </View>
        ) : null}
        {post.toolUrl ? (
          <Pressable style={[styles.tryButton, { borderColor: c.accent, backgroundColor: `${c.accent}12` }]} onPress={() => Linking.openURL(post.toolUrl)}>
            <Text style={[styles.tryText, { color: c.accent }]}>{'>'} 試用工具</Text>
            <Ionicons name="open-outline" size={15} color={c.accent} />
          </Pressable>
        ) : null}
        {!full && post.commentCount ? (
          <Pressable onPress={openPost}>
            <Text style={{ color: c.muted, fontFamily: fonts.mono, fontSize: 13 }}>{'//'} 查看全部 {post.commentCount} 則留言</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function VoteButton({ kind, count, active, onPress }: { kind: Vote; count: number; active: boolean; onPress: () => void }) {
  const c = useColors();
  const color = kind === 'cool' ? c.cool : c.notCool;
  const label = kind === 'cool' ? 'Cool' : 'Not Cool';
  const icon = kind === 'cool' ? (active ? 'flash' : 'flash-outline') : (active ? 'flash-off' : 'flash-off-outline');
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${label}，${count} 票`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.vote,
        { borderColor: active ? color : c.border, backgroundColor: active ? `${color}22` : c.surface, opacity: pressed ? 0.7 : 1 },
        active ? glow(color, 8) : null,
      ]}
    >
      <Ionicons name={icon} size={17} color={active ? color : c.muted} />
      <Text style={[styles.voteLabel, { color: active ? color : c.text }]}>{label}</Text>
      <Text style={[styles.voteCount, { color: active ? color : c.muted }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  voteLabel: { fontWeight: '800', fontSize: 14, fontFamily: fonts.mono },
  voteCount: { fontWeight: '700', fontSize: 13, fontFamily: fonts.mono },
  card: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  username: { fontWeight: '700', fontSize: 15, fontFamily: fonts.mono },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  tryButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, marginTop: 2 },
  tryText: { fontWeight: '800', fontFamily: fonts.mono, fontSize: 13 },
  body: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
  title: { fontSize: 17, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
