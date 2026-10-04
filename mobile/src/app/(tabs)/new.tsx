import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { MAX_FILE_BYTES, MAX_MEDIA, uploadPost, type PickedMedia } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useColors } from '../../lib/theme';
import { Button, Empty, chooseOption, notify } from '../../components/ui';

function toPicked(asset: ImagePicker.ImagePickerAsset, i: number): PickedMedia | null {
  const kind = asset.type === 'video' ? 'video' : asset.type === 'image' || !asset.type ? 'image' : null;
  if (!kind) return null;
  const mimeType = asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const ext = mimeType.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
  return { uri: asset.uri, kind, mimeType, name: asset.fileName ?? `media-${Date.now()}-${i}.${ext}` };
}

export default function NewPostScreen() {
  const c = useColors();
  const { user } = useAuth();
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [toolUrl, setToolUrl] = useState('');
  const [aiTools, setAiTools] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  if (!user) {
    return (
      <Empty title="分享你的 AI 工具" message="登入後就能附上截圖或影片，分享你用 AI 打造的作品。">
        <Button title="登入或註冊" variant="primary" onPress={() => router.push('/login')} />
      </Empty>
    );
  }

  function addAssets(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const tooBig = result.assets.filter((a) => (a.fileSize ?? 0) > MAX_FILE_BYTES);
    if (tooBig.length) notify('檔案太大', '每個檔案需在 100MB 以內，已略過過大的檔案。');
    const picked = result.assets
      .filter((a) => (a.fileSize ?? 0) <= MAX_FILE_BYTES)
      .map(toPicked)
      .filter((m): m is PickedMedia => m !== null);
    setMedia((prev) => {
      const next = [...prev, ...picked];
      if (next.length > MAX_MEDIA) notify(`最多 ${MAX_MEDIA} 個檔案`);
      return next.slice(0, MAX_MEDIA);
    });
  }

  async function pickMedia() {
    const remaining = MAX_MEDIA - media.length;
    if (remaining <= 0) return notify(`最多 ${MAX_MEDIA} 個檔案`);
    const source = Platform.OS === 'web' ? 0 : await chooseOption('加入截圖或影片', ['從相簿選擇', '拍照', '錄影']);
    if (source === null) return;
    // Compatible：讓 iPhone 把 HEIC 照片轉成 JPEG、HEVC 影片轉成 H.264，所有裝置都能看
    const common = {
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.9,
    };
    if (source === 0) {
      addAssets(await ImagePicker.launchImageLibraryAsync({
        ...common,
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
      }));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return notify('需要相機權限', '請到「設定」>「WowAI」開啟相機權限。');
    addAssets(await ImagePicker.launchCameraAsync({
      ...common,
      mediaTypes: source === 1 ? ['images'] : ['videos'],
      videoMaxDuration: 180,
    }));
  }

  async function submit() {
    if (!media.length) return notify('請先附上截圖或影片', '分享時一定要附上至少一張截圖或一段影片。');
    if (!title.trim()) return notify('請填寫工具名稱');
    setProgress(0);
    try {
      const post = await uploadPost({ title, description, toolUrl, aiTools }, media, setProgress);
      setMedia([]);
      setTitle('');
      setDescription('');
      setToolUrl('');
      setAiTools('');
      router.push(`/post/${post.id}`);
    } catch (err) {
      notify('分享失敗', (err as Error).message);
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
          style={[styles.picker, { borderColor: hasMedia ? c.border : c.accent, backgroundColor: c.surface }]}
          accessibilityLabel="加入截圖或影片"
        >
          <Ionicons name="images-outline" size={40} color={c.accent} />
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>加入截圖或示範影片</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>必填 · 最多 {MAX_MEDIA} 個 · 每個 100MB 以內</Text>
        </Pressable>

        <Text style={{ color: hasMedia ? c.success : c.accent2, fontWeight: '700', fontSize: 13 }}>
          {hasMedia ? `✓ 已選擇 ${media.length} 個檔案` : '＊分享時一定要附上至少一張截圖或一段影片'}
        </Text>

        {hasMedia ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {media.map((m, i) => (
              <View key={m.uri} style={styles.preview}>
                {m.kind === 'image' ? (
                  <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.videoPreview]}>
                    <Ionicons name="videocam" size={30} color="#fff" />
                  </View>
                )}
                <Text style={styles.kind}>{m.kind === 'video' ? '影片' : `圖片 ${i + 1}`}</Text>
                <Pressable
                  style={styles.remove}
                  hitSlop={8}
                  accessibilityLabel="移除"
                  onPress={() => setMedia((prev) => prev.filter((x) => x.uri !== m.uri))}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <Text style={[styles.label, { color: c.text }]}>工具名稱 *</Text>
        <TextInput style={inputStyle} value={title} onChangeText={setTitle} maxLength={80} placeholder="例如：AI 自動記帳小幫手" placeholderTextColor={c.muted} />

        <Text style={[styles.label, { color: c.text }]}>介紹</Text>
        <TextInput
          style={[inputStyle, { minHeight: 110, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          maxLength={2000}
          multiline
          placeholder="這個工具能做什麼？你是怎麼用 AI 做出來的？"
          placeholderTextColor={c.muted}
        />

        <Text style={[styles.label, { color: c.text }]}>工具連結（選填）</Text>
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

        <Text style={[styles.label, { color: c.text }]}>用了哪些 AI 開發</Text>
        <TextInput
          style={inputStyle}
          value={aiTools}
          onChangeText={setAiTools}
          placeholder="Claude, Cursor, v0"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
        />
        <Text style={{ color: c.muted, fontSize: 12 }}>用逗號分隔，最多 10 個</Text>

        {progress !== null ? (
          <View style={[styles.progress, { backgroundColor: c.surface2 }]}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: c.accent }} />
          </View>
        ) : null}

        <Button
          title={progress !== null ? `上傳中… ${Math.round(progress * 100)}%` : '分享'}
          variant="primary"
          onPress={submit}
          disabled={!hasMedia || !title.trim() || progress !== null}
          style={{ marginTop: 8, minHeight: 50 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8, paddingBottom: 48 },
  picker: { alignItems: 'center', gap: 6, paddingVertical: 28, borderWidth: 2, borderStyle: 'dashed', borderRadius: 14 },
  preview: { width: 104, height: 104, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  videoPreview: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a1f4a' },
  kind: { position: 'absolute', left: 4, bottom: 4, color: '#fff', fontSize: 11, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden' },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '700', marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
});
