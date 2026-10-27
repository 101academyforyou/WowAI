import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { MAX_FILE_BYTES, MAX_MEDIA, mediaUri, type EditorMedia, type Post, type PostFields } from '../lib/api';
import { aiToolsFromTopics, fetchGitHubRepo, parseGitHubRepo } from '../lib/github';
import { parseYouTube, youtubeThumbnail } from '../lib/youtube';
import { fonts, useColors } from '../lib/theme';
import { Button, chooseOption, notify } from './ui';
import { CategoryPicker } from './CategoryChips';
import { MAX_CATEGORIES } from '../lib/categories';
import { plural, tr } from '../lib/i18n';

// 只收截圖；示範影片請貼 YouTube 連結
function toPicked(asset: ImagePicker.ImagePickerAsset, i: number): EditorMedia | null {
  if (asset.type && asset.type !== 'image') return null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  return { uri: asset.uri, kind: 'image', mimeType, name: asset.fileName ?? `media-${Date.now()}-${i}.${ext}` };
}

// 分享與編輯共用的貼文表單。initial 有值時就是編輯模式，帶入原本的內容與截圖。
export function PostEditor({ initial, submitLabel, onSubmit, onDone }: {
  initial?: Post;
  submitLabel: string;
  onSubmit: (fields: PostFields, media: EditorMedia[], onProgress: (ratio: number) => void) => Promise<Post>;
  onDone: (post: Post) => void;
}) {
  const c = useColors();
  const [media, setMedia] = useState<EditorMedia[]>(() =>
    (initial?.media ?? [])
      .filter((m) => m.kind === 'image')
      .map((m) => ({ uri: mediaUri(m.url), kind: 'image' as const, name: '', mimeType: '', existingUrl: m.url })),
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [toolUrl, setToolUrl] = useState(initial?.toolUrl ?? '');
  const [githubUrl, setGithubUrl] = useState(initial?.githubUrl ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(initial?.youtube?.url ?? '');
  const [importing, setImporting] = useState(false);
  const [aiTools, setAiTools] = useState(initial?.aiTools.join(', ') ?? '');
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [categoryOther, setCategoryOther] = useState(initial?.categoryOther ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const youtube = parseYouTube(youtubeUrl);
  const hasContent = media.length > 0 || youtube !== null;

  function addAssets(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const tooBig = result.assets.filter((a) => (a.fileSize ?? 0) > MAX_FILE_BYTES);
    if (tooBig.length) notify(tr('圖片太大', 'Image too large'), tr('每張圖片需在 20MB 以內，已略過過大的圖片。', 'Each image must be under 20 MB. Larger ones were skipped.'));
    const picked = result.assets
      .filter((a) => (a.fileSize ?? 0) <= MAX_FILE_BYTES)
      .map(toPicked)
      .filter((m): m is EditorMedia => m !== null);
    setMedia((prev) => {
      const next = [...prev, ...picked];
      if (next.length > MAX_MEDIA) notify(tr(`最多 ${MAX_MEDIA} 張截圖`, `Up to ${MAX_MEDIA} screenshots`));
      return next.slice(0, MAX_MEDIA);
    });
  }

  async function pickMedia() {
    const remaining = MAX_MEDIA - media.length;
    if (remaining <= 0) return notify(tr(`最多 ${MAX_MEDIA} 張截圖`, `Up to ${MAX_MEDIA} screenshots`));
    const source = Platform.OS === 'web' ? 0 : await chooseOption(tr('加入截圖', 'Add screenshots'), [tr('從相簿選擇', 'Choose from library'), tr('拍照', 'Take photo')]);
    if (source === null) return;
    // Compatible：讓 iPhone 把 HEIC 照片轉成 JPEG，所有裝置都能看
    const common = {
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.9,
    };
    if (source === 0) {
      addAssets(await ImagePicker.launchImageLibraryAsync({
        ...common,
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
      }));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return notify(tr('需要相機權限', 'Camera access needed'), tr('請到「設定」>「YourWowAI」開啟相機權限。', 'Turn on camera access in Settings > YourWowAI.'));
    addAssets(await ImagePicker.launchCameraAsync({
      ...common,
      mediaTypes: ['images'],
    }));
  }

  // 連動 GitHub：讀取公開專案的名稱、介紹、網站與 topics，只填入還空著的欄位
  async function importFromGitHub() {
    const ref = parseGitHubRepo(githubUrl);
    if (!ref) return notify(tr('GitHub 專案格式不正確', 'Invalid GitHub repo'), tr('請輸入 owner/repo，或貼上 github.com 的專案網址。', 'Enter owner/repo or paste a github.com repo URL.'));
    setImporting(true);
    try {
      const repo = await fetchGitHubRepo(ref);
      setGithubUrl(repo.url);
      if (!title.trim()) setTitle(repo.name.slice(0, 80));
      if (!description.trim() && repo.description) setDescription(repo.description.slice(0, 2000));
      if (!toolUrl.trim() && repo.homepage) setToolUrl(repo.homepage);
      const tools = aiToolsFromTopics(repo.topics);
      if (!aiTools.trim() && tools.length) setAiTools(tools.join(', '));
      notify(tr('已從 GitHub 匯入', 'Imported from GitHub'), hasContent ? tr('已幫你填好空白的欄位。', 'Empty fields are filled in.') : tr('已幫你填好空白的欄位，記得附上截圖或 YouTube 影片。', "Empty fields are filled in. Don't forget a screenshot or YouTube demo."));
    } catch (err) {
      notify(tr('匯入失敗', 'Import failed'), (err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function submit() {
    if (youtubeUrl.trim() && !youtube) return notify(tr('YouTube 連結格式不正確', 'Invalid YouTube link'), tr('請貼上 youtube.com 或 youtu.be 的影片網址。', 'Paste a youtube.com or youtu.be video link.'));
    if (!hasContent) return notify(tr('請先附上截圖或 YouTube 影片', 'Add a screenshot or YouTube demo'), tr('分享時一定要附上至少一張截圖或一個 YouTube 影片連結。', 'Every post needs at least one screenshot or a YouTube link.'));
    if (!title.trim()) return notify(tr('請填寫工具名稱', 'Please enter a tool name'));
    setProgress(0);
    try {
      const post = await onSubmit({ title, description, toolUrl, githubUrl, youtubeUrl: youtube?.url ?? '', aiTools, categories: categories.join(','), categoryOther: categories.includes('other') ? categoryOther : '' }, media, setProgress);
      onDone(post);
    } catch (err) {
      notify(initial ? tr('儲存失敗', "Couldn't save") : tr('分享失敗', "Couldn't share"), (err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const hasMedia = media.length > 0;
  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={pickMedia}
          style={[styles.picker, { borderColor: hasContent ? c.border : c.accent, backgroundColor: c.surface }]}
          accessibilityLabel={tr('加入截圖', 'Add screenshots')}
        >
          <Ionicons name="images-outline" size={40} color={c.accent} />
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 16, fontFamily: fonts.mono }}>{tr('加入截圖', 'Add screenshots')}</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{tr(`最多 ${MAX_MEDIA} 張 · 每張 20MB 以內`, `Up to ${MAX_MEDIA} · 20 MB each`)}</Text>
        </Pressable>

        {hasMedia ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {media.map((m, i) => (
              <View key={m.uri} style={styles.preview}>
                <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Text style={styles.kind}>{tr(`圖片 ${i + 1}`, `Image ${i + 1}`)}</Text>
                <Pressable
                  style={styles.remove}
                  hitSlop={8}
                  accessibilityLabel={tr('移除', 'Remove')}
                  onPress={() => setMedia((prev) => prev.filter((x) => x.uri !== m.uri))}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <Text style={[styles.label, { color: c.text }]}>{tr('YouTube 示範影片', 'YouTube demo')}</Text>
        <View style={[styles.githubInput, { backgroundColor: c.surface, borderColor: youtubeUrl.trim() && !youtube ? c.notCool : c.border }]}>
          <Ionicons name="logo-youtube" size={20} color="#ff0033" />
          <TextInput
            style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 12 }}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder={tr('貼上 YouTube 影片網址', 'Paste a YouTube video link')}
            placeholderTextColor={c.muted}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {youtube ? (
          <View style={styles.youtubePreview}>
            <Image source={{ uri: youtubeThumbnail(youtube.id) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.youtubePlay}>
              <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </View>
        ) : null}
        <Text style={{ color: c.muted, fontSize: 12 }}>{tr('影片請先上傳到 YouTube（可設為「不公開」），再貼上連結', 'Upload your video to YouTube first (unlisted is fine), then paste the link')}</Text>

        <Text style={{ color: hasContent ? c.success : c.notCool, fontWeight: '700', fontSize: 13, fontFamily: fonts.mono, marginTop: 6 }}>
          {hasContent
            ? tr(
              `✓ 已附上 ${[media.length ? `${media.length} 張截圖` : '', youtube ? 'YouTube 影片' : ''].filter(Boolean).join('和')}`,
              `✓ Added ${[media.length ? plural(media.length, 'screenshot') : '', youtube ? 'a YouTube demo' : ''].filter(Boolean).join(' and ')}`,
            )
            : tr('＊分享時一定要附上至少一張截圖或一個 YouTube 影片連結', '* Every post needs at least one screenshot or a YouTube link')}
        </Text>

        <Text style={[styles.label, { color: c.text }]}>{tr('GitHub 專案（選填）', 'GitHub repo (optional)')}</Text>
        <View style={styles.githubRow}>
          <View style={[styles.githubInput, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="logo-github" size={20} color={c.text} />
            <TextInput
              style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 12 }}
              value={githubUrl}
              onChangeText={setGithubUrl}
              onSubmitEditing={importFromGitHub}
              placeholder={tr('owner/repo 或 github.com/… 網址', 'owner/repo or github.com/… link')}
              placeholderTextColor={c.muted}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
            />
          </View>
          <Button title={tr('匯入', 'Import')} onPress={importFromGitHub} loading={importing} disabled={!githubUrl.trim()} style={{ minHeight: 48 }} />
        </View>
        <Text style={{ color: c.muted, fontSize: 12 }}>{tr('連動公開的 GitHub 專案：自動帶入名稱、介紹與網站，貼文也會附上原始碼連結', 'Link a public repo: we fill in the name, description and website, and your post links to the source code')}</Text>

        <Text style={[styles.label, { color: c.text }]}>{tr('工具名稱 *', 'Tool name *')}</Text>
        <TextInput style={inputStyle} value={title} onChangeText={setTitle} maxLength={80} placeholder={tr('例如：AI 自動記帳小幫手', 'e.g. AI expense tracker')} placeholderTextColor={c.muted} />

        <Text style={[styles.label, { color: c.text }]}>{tr('介紹', 'Description')}</Text>
        <TextInput
          style={[inputStyle, { minHeight: 110, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          maxLength={2000}
          multiline
          placeholder={tr('這個工具能做什麼？你是怎麼用 AI 做出來的？', 'What does it do? How did you build it with AI?')}
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.label, { color: c.text }]}>{tr(`應用領域（最多 ${MAX_CATEGORIES} 個）`, `Category (up to ${MAX_CATEGORIES})`)}</Text>
        <CategoryPicker value={categories} max={MAX_CATEGORIES} onChange={setCategories} />
        {categories.includes('other') ? (
          <TextInput
            style={inputStyle}
            value={categoryOther}
            onChangeText={setCategoryOther}
            maxLength={30}
            placeholder={tr('「其他」是什麼領域？例如：烹飪料理、旅遊', 'Name your category, e.g. Cooking, Travel')}
            placeholderTextColor={c.muted}
            accessibilityLabel={tr('自訂分類名稱', 'Custom category name')}
          />
        ) : null}
        <Text style={{ color: c.muted, fontSize: 12 }}>{tr('選對分類，對這個領域有興趣的人更容易找到你的作品', 'Pick a category so people interested in it can find your project')}</Text>

        <Text style={[styles.label, { color: c.text }]}>{tr('工具連結（選填）', 'Link to try it (optional)')}</Text>
        <TextInput
          style={inputStyle}
          value={toolUrl}
          onChangeText={setToolUrl}
          placeholder="https://…"
          placeholderTextColor={c.muted}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: c.text }]}>{tr('用了哪些 AI 開發', 'AI tools used')}</Text>
        <TextInput
          style={inputStyle}
          value={aiTools}
          onChangeText={setAiTools}
          placeholder="Claude, Cursor, v0"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
        />
        <Text style={{ color: c.muted, fontSize: 12 }}>{tr('用逗號分隔，最多 10 個', 'Comma-separated, up to 10')}</Text>

        {progress !== null ? (
          <View style={[styles.progress, { backgroundColor: c.surface2 }]}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: c.accent }} />
          </View>
        ) : null}

        <Button
          title={progress !== null ? tr(`上傳中… ${Math.round(progress * 100)}%`, `Uploading… ${Math.round(progress * 100)}%`) : submitLabel}
          variant="primary"
          onPress={submit}
          disabled={!hasContent || !title.trim() || progress !== null}
          style={{ marginTop: 8, minHeight: 50 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8, paddingBottom: 48 },
  picker: { alignItems: 'center', gap: 6, paddingVertical: 28, borderWidth: 2, borderStyle: 'dashed', borderRadius: 10 },
  preview: { width: 104, height: 104, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  kind: { position: 'absolute', left: 4, bottom: 4, color: '#fff', fontSize: 11, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden' },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '700', marginTop: 10, fontFamily: fonts.mono, fontSize: 13 },
  youtubePreview: { width: 160, height: 90, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  youtubePlay: { width: 40, height: 28, borderRadius: 8, backgroundColor: '#ff0033', alignItems: 'center', justifyContent: 'center' },
  githubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  githubInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
});
