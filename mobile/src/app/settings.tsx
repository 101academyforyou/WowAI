import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, siteUrl, uploadAvatar, type Profile, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CONTACT_FIELDS, type ContactType } from '../lib/contacts';
import { fonts, useColors } from '../lib/theme';
import { Avatar, Button, Loading, chooseOption, confirmAction, notify } from '../components/ui';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function SettingsScreen() {
  const c = useColors();
  const { user, setUser, logout, deleteAccount } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [contacts, setContacts] = useState<Partial<Record<ContactType, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ user: Profile }>(`/api/users/${encodeURIComponent(user.username)}`).then(({ user: p }) => {
      setDisplayName(p.displayName);
      setBio(p.bio);
      setContacts(Object.fromEntries(p.contacts.map((ct) => [ct.type, ct.value])));
      setLoaded(true);
    }).catch((err) => notify(err.message));
  }, [user]);

  if (!user) return null;
  if (!loaded) return <Loading />;

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ user: User }>('/api/me', { method: 'PATCH', body: { displayName, bio, contacts } });
      setUser({ ...user!, ...res.user });
      router.back();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeAvatar() {
    const source = Platform.OS === 'web' ? 0 : await chooseOption('更換大頭貼', ['從相簿選擇', '拍照']);
    if (source === null) return;
    // 裁成正方形、壓縮成 JPEG，上傳很快
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    if (source === 1) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return notify('需要相機權限', '請到「設定」>「YourWowAI」開啟相機權限。');
    }
    const result = source === 1 ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > MAX_AVATAR_BYTES) return notify('圖片太大', '大頭貼需在 5MB 以內。');
    setAvatarBusy(true);
    try {
      const updated = await uploadAvatar({
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setUser({ ...user!, ...updated });
    } catch (err) {
      notify('上傳失敗', (err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!(await confirmAction('移除大頭貼？', '會改回顯示名稱的第一個字。', '移除'))) return;
    try {
      const res = await api<{ user: User }>('/api/me/avatar', { method: 'DELETE' });
      setUser({ ...user!, ...res.user });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  // App Store 規定：可以註冊帳號的 App 必須能在 App 內刪除帳號
  async function removeAccount() {
    const ok = await confirmAction('永久刪除帳號？', '你的所有作品、留言、追蹤、投票與大頭貼都會永久刪除，無法復原。', '刪除帳號');
    if (!ok) return;
    try {
      await deleteAccount(password);
      router.dismissAll();
      notify('帳號已刪除');
    } catch (err) {
      notify((err as Error).message);
    }
  }

  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }];

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.avatarSection}>
        <Pressable onPress={changeAvatar} disabled={avatarBusy} accessibilityRole="button" accessibilityLabel="更換大頭貼">
          <Avatar user={user} size={96} />
          <View style={[styles.avatarBadge, { backgroundColor: c.accent, borderColor: c.bg }]}>
            {avatarBusy ? <ActivityIndicator size="small" color={c.accentText} /> : <Ionicons name="camera" size={16} color={c.accentText} />}
          </View>
        </Pressable>
        <View style={styles.avatarButtons}>
          <Button title={user.avatarUrl ? '更換大頭貼' : '上傳大頭貼'} onPress={changeAvatar} loading={avatarBusy} />
          {user.avatarUrl ? <Button title="移除" variant="danger" onPress={removeAvatar} disabled={avatarBusy} /> : null}
        </View>
      </View>

      <Text style={[styles.label, { color: c.text }]}>名稱</Text>
      <TextInput style={inputStyle} value={displayName} onChangeText={setDisplayName} maxLength={50} />
      <Text style={[styles.label, { color: c.text }]}>自我介紹</Text>
      <TextInput
        style={[inputStyle, { minHeight: 100, textAlignVertical: 'top' }]}
        value={bio}
        onChangeText={setBio}
        maxLength={300}
        multiline
        placeholder="介紹一下你自己、擅長用哪些 AI 工具…"
        placeholderTextColor={c.muted}
      />

      <Text style={[styles.label, { color: c.text, marginTop: 20 }]}>聯繫我</Text>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>填了的才會出現在你的個人頁，所有人都看得到。可以填帳號或貼上網址。</Text>
      {CONTACT_FIELDS.map((f) => (
        <View key={f.type} style={[styles.contactInput, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name={f.icon} size={20} color={f.color} style={styles.contactIcon} />
          <TextInput
            style={[styles.contactText, { color: c.text }]}
            value={contacts[f.type] ?? ''}
            onChangeText={(v) => setContacts((prev) => ({ ...prev, [f.type]: v }))}
            placeholder={`${f.label}：${f.placeholder}`}
            placeholderTextColor={c.muted}
            keyboardType={f.keyboardType}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            accessibilityLabel={f.label}
          />
        </View>
      ))}

      <Button title="儲存" variant="primary" onPress={save} loading={saving} style={{ marginTop: 8 }} />

      <View style={[styles.section, { borderColor: c.border }]}>
        <Button title="使用條款" onPress={() => Linking.openURL(siteUrl('/terms.html'))} />
        <Button title="隱私權政策" onPress={() => Linking.openURL(siteUrl('/privacy.html'))} />
        <Button title="登出" onPress={async () => { await logout(); router.dismissAll(); }} />
      </View>

      <View style={[styles.section, { borderColor: c.border }]}>
        <Text style={[styles.label, { color: c.danger }]}>刪除帳號</Text>
        <Text style={{ color: c.muted, lineHeight: 20 }}>刪除後，你的所有作品、留言與追蹤都會永久刪除。請輸入密碼確認。</Text>
        <TextInput
          style={inputStyle}
          value={password}
          onChangeText={setPassword}
          placeholder="目前的密碼"
          placeholderTextColor={c.muted}
          secureTextEntry
          textContentType="password"
        />
        <Button title="永久刪除帳號" variant="danger" onPress={removeAccount} disabled={!password} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8, paddingBottom: 48 },
  contactInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingLeft: 12 },
  contactIcon: { width: 22 },
  contactText: { flex: 1, paddingHorizontal: 10, paddingVertical: 12, fontSize: 15, outlineWidth: 0 },
  avatarSection: { alignItems: 'center', gap: 14, paddingVertical: 8 },
  avatarBadge: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  avatarButtons: { flexDirection: 'row', gap: 8 },
  label: { fontWeight: '700', marginTop: 8, fontFamily: fonts.mono, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  section: { marginTop: 28, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
});
