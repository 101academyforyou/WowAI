import { useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { REPORT_REASONS, api, siteUrl, timeAgo, type Post, type Vote } from '../lib/api';
import { useAuth } from '../lib/auth';
import { repoName } from '../lib/github';
import { AiToolBadges, CategoryBadges } from './CategoryChips';
import { fonts, glow, useColors } from '../lib/theme';
import { MediaCarousel } from './MediaCarousel';
import { Avatar, chooseOption, confirmAction, notify } from './ui';
import { plural, tr } from '../lib/i18n';

// onRemoved：貼文被刪除、檢舉或作者被封鎖時，讓列表把它拿掉
export function PostCard({ post: initial, full = false, onRemoved }: { post: Post; full?: boolean; onRemoved?: () => void }) {
  const c = useColors();
  const { user } = useAuth();
  const [post, setPost] = useState(initial);
  // 列表重新載入（例如編輯完回來）時，換成最新的貼文內容
  const [source, setSource] = useState(initial);
  if (initial !== source) {
    setSource(initial);
    setPost(initial);
  }
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
      // 作者可以編輯、釘選；管理員只能刪除別人的貼文
      const pinLabel = post.pinned ? tr('取消釘選', 'Unpin from profile') : tr('釘選到個人頁', 'Pin to profile');
      const options = isMine ? [tr('編輯貼文', 'Edit post'), pinLabel, tr('刪除貼文', 'Delete post')] : [tr('刪除貼文', 'Delete post')];
      const choice = await chooseOption(tr('貼文選項', 'Post options'), options, { destructiveIndex: options.length - 1 });
      if (choice === null) return;
      if (isMine && choice === 0) {
        router.push(`/edit/${post.id}`);
        return;
      }
      if (isMine && choice === 1) {
        try {
          const res = await api<{ pinned: boolean }>(`/api/posts/${post.id}/pin`, { method: post.pinned ? 'DELETE' : 'PUT' });
          setPost({ ...post, pinned: res.pinned });
          notify(res.pinned ? tr('已釘選到個人頁', 'Pinned to your profile') : tr('已取消釘選', 'Unpinned'));
        } catch (err) {
          notify((err as Error).message);
        }
        return;
      }
      if (!(await confirmAction(tr('刪除這則分享？', 'Delete this post?'), tr('刪除後無法復原。', "This can't be undone."), tr('刪除', 'Delete')))) return;
      try {
        await api(`/api/posts/${post.id}`, { method: 'DELETE' });
        onRemoved?.();
      } catch (err) {
        notify((err as Error).message);
      }
      return;
    }
    if (!requireLogin()) return;
    const choice = await chooseOption(tr('貼文選項', 'Post options'), [tr('檢舉貼文', 'Report post'), tr(`封鎖 @${post.author.username}`, `Block @${post.author.username}`)], { destructiveIndex: 1 });
    if (choice === 0) {
      const r = await chooseOption(tr('為什麼要檢舉這則貼文？', 'Why are you reporting this post?'), REPORT_REASONS.map((x) => x.label));
      if (r === null) return;
      try {
        await api(`/api/posts/${post.id}/report`, { method: 'POST', body: { reason: REPORT_REASONS[r].value } });
        notify(tr('感謝你的檢舉', 'Thanks for reporting'), tr('我們會在 24 小時內審查。這則貼文將不再顯示給你。', "We'll review it within 24 hours. You won't see this post anymore."));
        onRemoved?.();
      } catch (err) {
        notify((err as Error).message);
      }
    } else if (choice === 1) {
      const ok = await confirmAction(tr(`封鎖 @${post.author.username}？`, `Block @${post.author.username}?`), tr('你將不會再看到對方的貼文和留言，並會互相取消追蹤。', "You won't see their posts or comments, and you'll unfollow each other."), tr('封鎖', 'Block'));
      if (!ok) return;
      try {
        await api(`/api/users/${encodeURIComponent(post.author.username)}/block`, { method: 'POST' });
        notify(tr('已封鎖', 'Blocked'));
        onRemoved?.();
      } catch (err) {
        notify((err as Error).message);
      }
    }
  }

  const openPost = () => router.push(`/post/${post.id}`);

  // 紙飛機：在 YourWowAI 裡分享到自己的個人頁，或把連結分享到其他地方
  async function openShare() {
    const options = isMine
      ? [tr('分享連結', 'Share link')]
      : [post.repostedByMe ? tr('從我的分享移除', 'Remove from my shares') : tr('分享到我的 YourWowAI', 'Share to my YourWowAI'), tr('分享連結', 'Share link')];
    const choice = await chooseOption(tr('分享', 'Share'), options, { destructiveIndex: !isMine && post.repostedByMe ? 0 : undefined });
    if (choice === null) return;
    if (choice === options.length - 1) return shareLink();
    if (!requireLogin()) return;
    const next = !post.repostedByMe;
    const prev = post;
    setPost({ ...post, repostedByMe: next, repostCount: post.repostCount + (next ? 1 : -1) });
    try {
      const res = await api<Pick<Post, 'repostCount' | 'repostedByMe'>>(`/api/posts/${post.id}/repost`, { method: next ? 'PUT' : 'DELETE' });
      setPost((p) => ({ ...p, ...res }));
      if (next) notify(tr('已分享到你的個人頁', 'Shared to your profile'), tr('可以在「個人」的分享分頁看到。', 'Find it under the Shared tab on your profile.'));
    } catch (err) {
      setPost(prev);
      notify((err as Error).message);
    }
  }

  async function shareLink() {
    const url = siteUrl(`/post/${post.id}`);
    if (Platform.OS !== 'web') {
      Share.share({ message: tr(`${post.title} — 在 YourWowAI 上看這個 AI 工具：${url}`, `${post.title} — check out this AI tool on YourWowAI: ${url}`) });
      return;
    }
    // 網頁版：手機瀏覽器用系統分享，電腦則複製連結
    const nav = globalThis.navigator;
    try {
      if (nav?.share) await nav.share({ title: post.title, url });
      else {
        await nav?.clipboard?.writeText(url);
        notify(tr('已複製連結', 'Link copied'), url);
      }
    } catch {
      // 使用者取消分享
    }
  }

  return (
    <View style={[styles.card, { borderColor: c.border }]}>
      <View style={styles.header}>
        <Pressable style={styles.author} onPress={() => router.push(`/user/${encodeURIComponent(post.author.username)}`)}>
          <Avatar user={post.author} />
          <Text style={[styles.username, { color: c.text }]}>{post.author.username}</Text>
        </Pressable>
        <Text style={{ color: c.muted, fontSize: 13 }}>{timeAgo(post.createdAt)}</Text>
        <Pressable hitSlop={12} onPress={openMenu} accessibilityLabel={tr('更多選項', 'More options')}>
          <Ionicons name="ellipsis-horizontal" size={20} color={c.text} />
        </Pressable>
      </View>

      <MediaCarousel media={post.media} youtube={post.youtube} onDoubleTap={() => vote('cool')} />

      <View style={styles.actions}>
        <VoteButton kind="cool" count={post.coolCount} active={post.myVote === 'cool'} onPress={() => vote(post.myVote === 'cool' ? null : 'cool')} />
        <VoteButton kind="notcool" count={post.notCoolCount} active={post.myVote === 'notcool'} onPress={() => vote(post.myVote === 'notcool' ? null : 'notcool')} />
        <View style={{ flex: 1 }} />
        {post.githubUrl ? (
          <Pressable
            hitSlop={8}
            onPress={() => Linking.openURL(post.githubUrl)}
            style={styles.countButton}
            accessibilityRole="link"
            accessibilityLabel={post.githubStars != null
              ? tr(`在 GitHub 按星，目前 ${post.githubStars} 顆星`, `Star on GitHub, ${plural(post.githubStars, 'star')}`)
              : tr('在 GitHub 按星', 'Star on GitHub')}
          >
            <Ionicons name="star-outline" size={23} color={c.text} />
            {post.githubStars ? <Text style={[styles.countText, { color: c.text }]}>{compactCount(post.githubStars)}</Text> : null}
          </Pressable>
        ) : null}
        <Pressable
          hitSlop={8}
          onPress={openPost}
          style={styles.countButton}
          accessibilityLabel={tr(`留言，${post.commentCount} 則`, `Comment, ${plural(post.commentCount, 'comment')}`)}
        >
          <Ionicons name="chatbubble-outline" size={24} color={c.text} />
          {post.commentCount ? <Text style={[styles.countText, { color: c.text }]}>{post.commentCount}</Text> : null}
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={openShare}
          style={styles.countButton}
          accessibilityLabel={tr(`分享，${post.repostCount} 次`, `Share, ${plural(post.repostCount, 'share')}`)}
        >
          <Ionicons name={post.repostedByMe ? 'paper-plane' : 'paper-plane-outline'} size={23} color={post.repostedByMe ? c.accent : c.text} />
          {post.repostCount ? <Text style={[styles.countText, { color: post.repostedByMe ? c.accent : c.text }]}>{post.repostCount}</Text> : null}
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]}>{post.title}</Text>
        {post.description ? (
          <Text style={{ color: c.text, lineHeight: 21 }} numberOfLines={full ? undefined : 3}>{post.description}</Text>
        ) : null}
        {post.categories?.length ? (
          <CategoryBadges slugs={post.categories} other={post.categoryOther} onPress={(slug) => router.push({ pathname: '/explore', params: { category: slug, tag: '' } })} />
        ) : null}
        {post.aiTools.length ? (
          <AiToolBadges tools={post.aiTools} onPress={(t) => router.push({ pathname: '/explore', params: { tag: t } })} />
        ) : null}
        {post.toolUrl || post.githubUrl ? (
          <View style={styles.links}>
            {post.toolUrl ? (
              <Pressable style={[styles.tryButton, { borderColor: c.accent, backgroundColor: `${c.accent}12` }]} onPress={() => Linking.openURL(post.toolUrl)}>
                <Text style={[styles.tryText, { color: c.accent }]}>{'>'} {tr('試用工具', 'Try it')}</Text>
                <Ionicons name="open-outline" size={15} color={c.accent} />
              </Pressable>
            ) : null}
            {post.githubUrl ? (
              <Pressable
                style={[styles.tryButton, styles.githubButton, { borderColor: c.border, backgroundColor: c.surface }]}
                onPress={() => Linking.openURL(post.githubUrl)}
                accessibilityLabel={tr(`在 GitHub 查看 ${repoName(post.githubUrl)}`, `View ${repoName(post.githubUrl)} on GitHub`)}
              >
                <Ionicons name="logo-github" size={16} color={c.text} />
                <Text style={[styles.tryText, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>{repoName(post.githubUrl)}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {!full && post.commentCount ? (
          <Pressable onPress={openPost}>
            <Text style={{ color: c.muted, fontFamily: fonts.mono, fontSize: 13 }}>{'//'} {tr(`查看全部 ${post.commentCount} 則留言`, `View ${plural(post.commentCount, 'comment')}`)}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// 1234 → 1.2k、15300 → 15k
function compactCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
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
      accessibilityLabel={tr(`${label}，${count} 票`, `${label}, ${plural(count, 'vote')}`)}
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
  countButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText: { fontWeight: '700', fontSize: 14, fontFamily: fonts.mono },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  tryButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  githubButton: { maxWidth: '100%' },
  tryText: { fontWeight: '800', fontFamily: fonts.mono, fontSize: 13 },
  body: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
  title: { fontSize: 17, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
