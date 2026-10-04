import { useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, REPORT_REASONS, api, timeAgo, type Post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useColors } from '../lib/theme';
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

  async function setLike(like: boolean) {
    if (!requireLogin() || post.likedByMe === like) return;
    const prev = post;
    setPost({ ...post, likedByMe: like, likeCount: post.likeCount + (like ? 1 : -1) });
    try {
      const res = await api<{ likeCount: number; likedByMe: boolean }>(`/api/posts/${post.id}/like`, { method: like ? 'POST' : 'DELETE' });
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

      <MediaCarousel media={post.media} onDoubleTap={() => setLike(true)} />

      <View style={styles.actions}>
        <Pressable hitSlop={8} onPress={() => setLike(!post.likedByMe)} accessibilityLabel="讚">
          <Ionicons name={post.likedByMe ? 'heart' : 'heart-outline'} size={28} color={post.likedByMe ? c.accent2 : c.text} />
        </Pressable>
        <Pressable hitSlop={8} onPress={openPost} accessibilityLabel="留言">
          <Ionicons name="chatbubble-outline" size={25} color={c.text} />
        </Pressable>
        <Pressable
          hitSlop={8}
          accessibilityLabel="分享"
          onPress={() => Share.share({ message: `${post.title} — 在 WowAI 上看這個 AI 工具：${API_URL}/#/p/${post.id}` })}
        >
          <Ionicons name="paper-plane-outline" size={25} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {post.toolUrl ? (
          <Pressable style={[styles.tryButton, { backgroundColor: c.accent }]} onPress={() => Linking.openURL(post.toolUrl)}>
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={styles.tryText}>試用工具</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={[styles.bold, { color: c.text }]}>{post.likeCount} 個讚</Text>
        <Text style={[styles.title, { color: c.text }]}>{post.title}</Text>
        {post.description ? (
          <Text style={{ color: c.text, lineHeight: 21 }} numberOfLines={full ? undefined : 3}>{post.description}</Text>
        ) : null}
        {post.aiTools.length ? (
          <View style={styles.chips}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>用 AI 打造：</Text>
            {post.aiTools.map((t) => (
              <Chip key={t} label={`#${t}`} onPress={() => router.push({ pathname: '/explore', params: { tag: t } })} />
            ))}
          </View>
        ) : null}
        {!full && post.commentCount ? (
          <Pressable onPress={openPost}>
            <Text style={{ color: c.muted }}>查看全部 {post.commentCount} 則留言</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  username: { fontWeight: '700', fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 14, paddingTop: 8 },
  tryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  tryText: { color: '#fff', fontWeight: '700' },
  body: { paddingHorizontal: 14, paddingTop: 8, gap: 6 },
  bold: { fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
