import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, type Comment, type Post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fonts, useColors } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { Avatar, Button, Empty, Loading, chooseOption, confirmAction, notify } from '../../components/ui';
import { tr } from '../../lib/i18n';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  // 正在編輯的留言；null 代表輸入框是新增留言
  const [editing, setEditing] = useState<Comment | null>(null);
  // 正在回覆的留言
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const input = useRef<TextInput>(null);

  // 回覆排在被回覆的留言底下（只有一層）；找不到上層的（例如封鎖了留言的人）就當一般留言
  const thread = useMemo(() => {
    const ids = new Set(comments.map((cm) => cm.id));
    const tops = comments.filter((cm) => !cm.parentId || !ids.has(cm.parentId));
    return tops.flatMap((top) => [
      { comment: top, reply: false },
      ...comments.filter((cm) => cm.parentId === top.id).map((cm) => ({ comment: cm, reply: true })),
    ]);
  }, [comments]);

  useFocusEffect(useCallback(() => {
    Promise.all([
      api<{ post: Post }>(`/api/posts/${id}`),
      api<{ comments: Comment[] }>(`/api/posts/${id}/comments`),
    ]).then(([p, cs]) => {
      setPost(p.post);
      setComments(cs.comments);
    }).catch((err) => setError(err.message));
  }, [id]));

  if (error) return <Empty title={tr('糟糕', 'Oops')} message={error} />;
  if (!post) return <Loading />;

  async function send() {
    if (!user) return router.push('/login');
    if (!body.trim()) return;
    setSending(true);
    try {
      if (editing) {
        const { comment } = await api<{ comment: Comment }>(`/api/comments/${editing.id}`, { method: 'PATCH', body: { body } });
        setComments((cs) => cs.map((cm) => (cm.id === comment.id ? { ...cm, ...comment } : cm)));
        setEditing(null);
      } else {
        const { comment } = await api<{ comment: Comment }>(`/api/posts/${id}/comments`, { method: 'POST', body: { body, ...(replyTo ? { parentId: replyTo.id } : {}) } });
        setComments((cs) => [...cs, comment]);
        setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
        setReplyTo(null);
      }
      setBody('');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  // 留言的人可以編輯、刪除；貼文作者與管理員可以刪除
  async function openCommentMenu(item: Comment) {
    const mine = item.author.id === user?.id;
    const options = mine ? [tr('編輯留言', 'Edit comment'), tr('刪除留言', 'Delete comment')] : [tr('刪除留言', 'Delete comment')];
    const choice = await chooseOption(tr('留言選項', 'Comment options'), options, { destructiveIndex: options.length - 1 });
    if (choice === null) return;
    if (mine && choice === 0) {
      setReplyTo(null);
      setEditing(item);
      setBody(item.body);
      return;
    }
    if (!(await confirmAction(tr('刪除這則留言？', 'Delete this comment?'), tr('刪除後無法復原。', "This can't be undone."), tr('刪除', 'Delete')))) return;
    try {
      const { commentCount } = await api<{ commentCount: number }>(`/api/comments/${item.id}`, { method: 'DELETE' });
      // 刪掉留言時，底下的回覆也一起刪
      setComments((cs) => cs.filter((cm) => cm.id !== item.id && cm.parentId !== item.id));
      setPost((p) => (p ? { ...p, commentCount } : p));
      if (editing?.id === item.id || replyTo?.id === item.id) cancelEdit();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setReplyTo(null);
    setBody('');
  }

  function startReply(item: Comment) {
    if (!user) return router.push('/login');
    setEditing(null);
    setReplyTo(item);
    setBody(item.author.id === user.id ? '' : `@${item.author.username} `);
    input.current?.focus();
  }

  // 對留言按 ⚡：先更新畫面，失敗再改回來
  async function toggleCool(item: Comment) {
    if (!user) return router.push('/login');
    const on = !item.cooledByMe;
    const patch = (cooledByMe: boolean, coolCount: number) =>
      setComments((cs) => cs.map((cm) => (cm.id === item.id ? { ...cm, cooledByMe, coolCount } : cm)));
    patch(on, (item.coolCount ?? 0) + (on ? 1 : -1));
    try {
      const res = await api<{ coolCount: number; cooledByMe: boolean }>(`/api/comments/${item.id}/cool`, { method: on ? 'PUT' : 'DELETE' });
      patch(res.cooledByMe, res.coolCount);
    } catch (err) {
      patch(Boolean(item.cooledByMe), item.coolCount ?? 0);
      notify((err as Error).message);
    }
  }

  const canManage = (item: Comment) => Boolean(user && (item.author.id === user.id || post.author.id === user.id || user.isAdmin));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={thread}
        keyExtractor={({ comment }) => String(comment.id)}
        ListHeaderComponent={<PostCard post={post} full onRemoved={() => router.back()} />}
        renderItem={({ item: { comment: item, reply } }) => (
          <View style={[styles.comment, reply && styles.reply]}>
            <Pressable onPress={() => router.push(`/user/${encodeURIComponent(item.author.username)}`)}>
              <Avatar user={item.author} size={reply ? 22 : 28} />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: c.text, lineHeight: 20 }}>
                <Text style={{ fontWeight: '700' }}>{item.author.username}  </Text>
                {item.body}
                {item.edited ? <Text style={{ color: c.muted, fontSize: 12 }}>{tr('  · 已編輯', '  · edited')}</Text> : null}
              </Text>
              <Pressable onPress={() => startReply(item)} hitSlop={6} style={{ alignSelf: 'flex-start' }} accessibilityLabel={tr(`回覆 ${item.author.username}`, `Reply to ${item.author.username}`)}>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{tr('回覆', 'Reply')}</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => toggleCool(item)}
              hitSlop={8}
              style={styles.cool}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(item.cooledByMe) }}
              accessibilityLabel={tr(`Cool，${item.coolCount ?? 0} 票`, `Cool, ${item.coolCount ?? 0} votes`)}
            >
              <Ionicons name={item.cooledByMe ? 'flash' : 'flash-outline'} size={16} color={item.cooledByMe ? c.cool : c.muted} />
              {item.coolCount ? <Text style={{ color: item.cooledByMe ? c.cool : c.muted, fontSize: 11, fontFamily: fonts.mono }}>{item.coolCount}</Text> : null}
            </Pressable>
            {canManage(item) ? (
              <Pressable hitSlop={10} onPress={() => openCommentMenu(item)} accessibilityLabel={tr('留言選項', 'Comment options')}>
                <Ionicons name="ellipsis-horizontal" size={18} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted, padding: 16 }}>{tr('還沒有留言，當第一個留言的人吧！', 'No comments yet. Be the first!')}</Text>}
      />
      {editing || replyTo ? (
        <View style={[styles.editBar, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Text style={{ color: c.muted, fontFamily: fonts.mono, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {editing ? tr('// 編輯留言中', '// editing comment') : tr(`// 回覆 @${replyTo!.author.username}`, `// replying to @${replyTo!.author.username}`)}
          </Text>
          <Pressable onPress={cancelEdit} hitSlop={8}>
            <Text style={{ color: c.accent, fontWeight: '700' }}>{tr('取消', 'Cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.form, { borderColor: c.border, backgroundColor: c.bg }]}>
        <TextInput
          ref={input}
          style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
          value={body}
          onChangeText={setBody}
          placeholder={user ? tr('留言給 Cooler…', 'Comment to the Cooler…') : tr('登入後即可留言', 'Sign in to comment')}
          placeholderTextColor={c.muted}
          maxLength={1000}
          onFocus={() => { if (!user) router.push('/login'); }}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Button title={editing ? tr('儲存', 'Save') : tr('留言', 'Post')} variant="primary" onPress={send} loading={sending} disabled={!body.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  reply: { paddingLeft: 52 },
  cool: { alignItems: 'center', minWidth: 22, paddingTop: 2 },
  editBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  form: { flexDirection: 'row', gap: 8, padding: 10, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
