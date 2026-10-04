import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, type Comment, type Post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useColors } from '../../lib/theme';
import { PostCard } from '../../components/PostCard';
import { Avatar, Button, Empty, Loading, notify } from '../../components/ui';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([
      api<{ post: Post }>(`/api/posts/${id}`),
      api<{ comments: Comment[] }>(`/api/posts/${id}/comments`),
    ]).then(([p, cs]) => {
      setPost(p.post);
      setComments(cs.comments);
    }).catch((err) => setError(err.message));
  }, [id]));

  if (error) return <Empty title="糟糕" message={error} />;
  if (!post) return <Loading />;

  async function send() {
    if (!user) return router.push('/login');
    if (!body.trim()) return;
    setSending(true);
    try {
      const { comment } = await api<{ comment: Comment }>(`/api/posts/${id}/comments`, { method: 'POST', body: { body } });
      setComments((cs) => [...cs, comment]);
      setBody('');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSending(false);
    }
  }

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
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted, padding: 16 }}>還沒有留言，當第一個留言的人吧！</Text>}
      />
      <View style={[styles.form, { borderColor: c.border, backgroundColor: c.bg }]}>
        <TextInput
          style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
          value={body}
          onChangeText={setBody}
          placeholder={user ? '留言給 Cooler…' : '登入後即可留言'}
          placeholderTextColor={c.muted}
          maxLength={1000}
          onFocus={() => { if (!user) router.push('/login'); }}
        />
        <Button title="留言" variant="primary" onPress={send} loading={sending} disabled={!body.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  form: { flexDirection: 'row', gap: 8, padding: 10, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
