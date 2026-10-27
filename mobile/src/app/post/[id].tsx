import { useCallback, useState } from 'react';
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
        const { comment } = await api<{ comment: Comment }>(`/api/posts/${id}/comments`, { method: 'POST', body: { body } });
        setComments((cs) => [...cs, comment]);
        setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
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
      setEditing(item);
      setBody(item.body);
      return;
    }
    if (!(await confirmAction(tr('刪除這則留言？', 'Delete this comment?'), tr('刪除後無法復原。', "This can't be undone."), tr('刪除', 'Delete')))) return;
    try {
      const { commentCount } = await api<{ commentCount: number }>(`/api/comments/${item.id}`, { method: 'DELETE' });
      setComments((cs) => cs.filter((cm) => cm.id !== item.id));
      setPost((p) => (p ? { ...p, commentCount } : p));
      if (editing?.id === item.id) cancelEdit();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setBody('');
  }

  const canManage = (item: Comment) => Boolean(user && (item.author.id === user.id || post.author.id === user.id || user.isAdmin));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={comments}
        keyExtractor={(cm) => String(cm.id)}
        ListHeaderComponent={<PostCard post={post} full onRemoved={() => router.back()} />}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <Pressable onPress={() => router.push(`/user/${encodeURIComponent(item.author.username)}`)}>
              <Avatar user={item.author} size={28} />
            </Pressable>
            <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>
              <Text style={{ fontWeight: '700' }}>{item.author.username}  </Text>
              {item.body}
              {item.edited ? <Text style={{ color: c.muted, fontSize: 12 }}>{tr('  · 已編輯', '  · edited')}</Text> : null}
            </Text>
            {canManage(item) ? (
              <Pressable hitSlop={10} onPress={() => openCommentMenu(item)} accessibilityLabel={tr('留言選項', 'Comment options')}>
                <Ionicons name="ellipsis-horizontal" size={18} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted, padding: 16 }}>{tr('還沒有留言，當第一個留言的人吧！', 'No comments yet. Be the first!')}</Text>}
      />
      {editing ? (
        <View style={[styles.editBar, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Text style={{ color: c.muted, fontFamily: fonts.mono, fontSize: 12, flex: 1 }}>{tr('// 編輯留言中', '// editing comment')}</Text>
          <Pressable onPress={cancelEdit} hitSlop={8}>
            <Text style={{ color: c.accent, fontWeight: '700' }}>{tr('取消', 'Cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.form, { borderColor: c.border, backgroundColor: c.bg }]}>
        <TextInput
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
  editBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  form: { flexDirection: 'row', gap: 8, padding: 10, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
