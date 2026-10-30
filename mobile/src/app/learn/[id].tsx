import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, type Post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fonts, useColors, useContentWidth } from '../../lib/theme';
import { youtubeThumbnail } from '../../lib/youtube';
import { YouTubePlayer } from '../../components/YouTubePlayer';
import { Avatar, Button, Empty, Loading, notify } from '../../components/ui';
import { tr } from '../../lib/i18n';

const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// 先顯示縮圖，點了才載入播放器（避免一進頁面就開始播）
// 不是 YouTube 的影片（Vimeo、Loom…）：顯示一個打開連結的按鈕
function Video({ video, label }: { video: { id: string | null; url: string }; label: string }) {
  const c = useColors();
  const width = useContentWidth() - 32;
  const size = { width, height: Math.round((width * 9) / 16) };
  const [playing, setPlaying] = useState(false);
  const id = video.id;
  if (!id) {
    let host = video.url;
    try {
      host = new URL(video.url).hostname.replace(/^www\./, '');
    } catch {
      // 保留原本的網址
    }
    return (
      <Pressable
        onPress={() => Linking.openURL(video.url)}
        style={[styles.link, { borderColor: c.accent, backgroundColor: c.surface }]}
        accessibilityRole="link"
        accessibilityLabel={label}
      >
        <Ionicons name="play-circle" size={28} color={c.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700' }}>{label}</Text>
          <Text style={{ color: c.muted }} numberOfLines={1}>{host}</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={c.muted} />
      </Pressable>
    );
  }
  if (playing) return <View style={[styles.video, size]}><YouTubePlayer id={id} size={size} /></View>;
  return (
    <Pressable onPress={() => setPlaying(true)} style={[styles.video, size]} accessibilityRole="button" accessibilityLabel={label}>
      <Image source={{ uri: youtubeThumbnail(id) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.play}><Ionicons name="play" size={26} color="#fff" /></View>
    </Pressable>
  );
}

// Learn it：試看影片、解鎖完整教學（Beta 免費）、AI 家教（還沒接上 AI，先收集問題）
export default function LearnScreen() {
  const c = useColors();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setPost((await api<{ post: Post }>(`/api/posts/${id}`)).post);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  if (error && !post) return <Empty title={tr('糟糕', 'Oops')} message={error} />;
  if (!post) return <Loading />;
  const learn = post.learn;
  const isAuthor = user?.id === post.author.id;

  async function unlock() {
    if (!user) return router.push('/login');
    setUnlocking(true);
    try {
      setPost((await api<{ post: Post }>(`/api/posts/${id}/learn/unlock`, { method: 'POST' })).post);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setUnlocking(false);
    }
  }

  async function ask() {
    if (!user) return router.push('/login');
    const text = question.trim();
    if (!text) return;
    setAsking(true);
    try {
      await api(`/api/posts/${id}/learn/tutor`, { method: 'POST', body: { question: text } });
      setAsked((list) => [...list, text]);
      setQuestion('');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setAsking(false);
    }
  }

  const sectionTitle = (icon: React.ComponentProps<typeof Ionicons>['name'], text: string) => (
    <View style={styles.sectionHead}>
      <Ionicons name={icon} size={18} color={c.accent} />
      <Text style={[styles.sectionTitle, { color: c.text, fontFamily: fonts.mono }]}>{text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `Learn it · ${post.title}` }} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Pressable onPress={() => router.push(`/post/${post.id}`)} style={styles.head} accessibilityRole="link">
          <Text style={[styles.title, { color: c.text }]}>{post.title}</Text>
          <Pressable onPress={() => router.push(`/user/${post.author.username}`)} style={styles.author} accessibilityRole="link">
            <Avatar user={post.author} size={24} />
            <Text style={{ color: c.muted }}>{tr(`@${post.author.username} 教你做`, `Taught by @${post.author.username}`)}</Text>
          </Pressable>
        </Pressable>

        {!learn && !post.learnUrl ? <Empty message={tr('這則貼文還沒有教學', "This post doesn't have a tutorial yet")} /> : null}

        {learn?.preview ? (
          <View style={styles.section}>
            {sectionTitle('play-circle-outline', tr('免費試看', 'Free preview'))}
            <Video video={learn.preview} label={tr('播放試看影片', 'Play preview video')} />
          </View>
        ) : null}

        {learn?.hasFull ? (
          <View style={styles.section}>
            {sectionTitle(learn.unlocked ? 'lock-open-outline' : 'lock-closed-outline', tr('完整教學', 'Full tutorial'))}
            {isAuthor ? (
              <Text style={{ color: c.muted }}>
                {tr(`${learn.unlockCount ?? 0} 人解鎖 · ${learn.questionCount ?? 0} 個 AI 家教提問`, `${learn.unlockCount ?? 0} unlocked · ${learn.questionCount ?? 0} AI tutor questions`)}
              </Text>
            ) : null}
            {learn.unlocked ? (
              <>
                {learn.video ? <Video video={learn.video} label={tr('播放完整教學影片', 'Play full tutorial video')} /> : null}
                {learn.notes ? (
                  <Text selectable style={[styles.notes, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}>{learn.notes}</Text>
                ) : null}
              </>
            ) : (
              <View style={[styles.locked, { borderColor: c.accent, backgroundColor: c.surface }]}>
                <Ionicons name="lock-closed" size={28} color={c.accent} />
                <Text style={[styles.lockedTitle, { color: c.text }]}>
                  {[learn.hasVideo ? tr('完整教學影片', 'Full tutorial video') : null, learn.hasNotes ? tr('prompt 和步驟', 'prompts and steps') : null].filter(Boolean).join(tr('＋', ' + '))}
                </Text>
                <View style={styles.priceRow}>
                  {learn.price ? <Text style={[styles.oldPrice, { color: c.muted }]}>{price(learn.price)}</Text> : null}
                  <Text style={[styles.free, { color: c.accent, fontFamily: fonts.mono }]}>{tr('Beta 期間免費', 'Free during beta')}</Text>
                </View>
                <Button title={user ? tr('免費解鎖', 'Unlock for free') : tr('登入後解鎖', 'Log in to unlock')} variant="primary" onPress={unlock} loading={unlocking} style={styles.unlock} />
              </View>
            )}
          </View>
        ) : null}

        {post.learnUrl ? (
          <Pressable
            onPress={() => Linking.openURL(post.learnUrl!)}
            style={[styles.link, { borderColor: c.border, backgroundColor: c.surface }]}
            accessibilityRole="link"
          >
            <Ionicons name="book-outline" size={18} color={c.accent} />
            <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>{tr('作者的教學連結', "Creator's tutorial link")}</Text>
            <Ionicons name="open-outline" size={16} color={c.muted} />
          </Pressable>
        ) : null}

        {learn ? (
          <View style={styles.section}>
            {sectionTitle('sparkles-outline', tr('AI 家教', 'AI tutor'))}
            <Text style={{ color: c.muted, lineHeight: 20 }}>
              {tr('卡住了？問 AI 家教，它會根據這個作品的教學內容回答你。', 'Stuck? Ask the AI tutor. It answers from this project’s tutorial.')}
            </Text>
            {asked.map((q, i) => (
              <View key={i} style={styles.chat}>
                <Text style={[styles.bubble, styles.mine, { backgroundColor: c.accent, color: '#000' }]}>{q}</Text>
                <Text style={[styles.bubble, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}>
                  {tr('AI 家教即將推出！已經記下你的問題，也會讓作者知道大家想學什麼。', "The AI tutor is coming soon! We saved your question and we'll let the creator know what people want to learn.")}
                </Text>
              </View>
            ))}
            <View style={styles.askRow}>
              <TextInput
                style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
                value={question}
                onChangeText={setQuestion}
                maxLength={1000}
                placeholder={tr('例如：一開始用的 prompt 是什麼？', 'e.g. What prompt did you start with?')}
                placeholderTextColor={c.muted}
                onSubmitEditing={ask}
                accessibilityLabel={tr('問 AI 家教', 'Ask the AI tutor')}
              />
              <Button title={tr('發問', 'Ask')} variant="primary" onPress={ask} loading={asking} disabled={!question.trim()} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 18, paddingBottom: 48 },
  head: { gap: 6 },
  title: { fontSize: 22, fontWeight: '800' },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  video: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  play: { width: 64, height: 44, borderRadius: 12, backgroundColor: '#ff0033', alignItems: 'center', justifyContent: 'center' },
  notes: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 15, lineHeight: 23 },
  locked: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 20 },
  lockedTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  oldPrice: { fontSize: 15, textDecorationLine: 'line-through' },
  free: { fontSize: 15, fontWeight: '800' },
  unlock: { alignSelf: 'stretch', marginTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 14 },
  chat: { gap: 8 },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, lineHeight: 21, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', overflow: 'hidden' },
  mine: { alignSelf: 'flex-end' },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
});
