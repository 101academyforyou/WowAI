import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, uploadAvatar, type Profile, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CONTACT_FIELDS, type ContactType } from '../lib/contacts';
import { fonts, useColors } from '../lib/theme';
import { Avatar, Button, Loading, chooseOption, confirmAction, notify } from '../components/ui';
import { siteDoc, tr } from '../lib/i18n';
import { fetchProviders, startOAuth, PROVIDER_LABEL, type OAuthProvider, type Providers } from '../lib/oauth';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function SettingsScreen() {
  const c = useColors();
  const { user, setUser, logout, deleteAccount, refresh } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [contacts, setContacts] = useState<Partial<Record<ContactType, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [linking, setLinking] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    fetchProviders().then(setProviders).catch(() => {});
  }, []);

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
    const source = Platform.OS === 'web' ? 0 : await chooseOption(tr('更換大頭貼', 'Change avatar'), [tr('從相簿選擇', 'Choose from library'), tr('拍照', 'Take photo')]);
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
      if (!permission.granted) return notify(tr('需要相機權限', 'Camera access needed'), tr('請到「設定」>「YourWowAI」開啟相機權限。', 'Turn on camera access in Settings > YourWowAI.'));
    }
    const result = source === 1 ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > MAX_AVATAR_BYTES) return notify(tr('圖片太大', 'Image too large'), tr('大頭貼需在 5MB 以內。', 'Avatars must be under 5 MB.'));
    setAvatarBusy(true);
    try {
      const updated = await uploadAvatar({
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setUser({ ...user!, ...updated });
    } catch (err) {
      notify(tr('上傳失敗', 'Upload failed'), (err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!(await confirmAction(tr('移除大頭貼？', 'Remove avatar?'), tr('會改回顯示名稱的第一個字。', 'Your profile will show the first letter of your name instead.'), tr('移除', 'Remove')))) return;
    try {
      const res = await api<{ user: User }>('/api/me/avatar', { method: 'DELETE' });
      setUser({ ...user!, ...res.user });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  // 綁定 GitHub／Google：之後也能用它登入這個帳號（網頁版會跳轉，回來時由 /auth 頁處理）
  async function connect(provider: OAuthProvider) {
    setLinking(provider);
    try {
      const result = await startOAuth(provider, { link: true });
      if (!result || result.cancelled) return;
      if (result.error) return notify(result.error);
      await refresh();
      notify(tr(`已綁定 ${PROVIDER_LABEL[provider]}`, `${PROVIDER_LABEL[provider]} connected`), tr(`之後也可以用 ${PROVIDER_LABEL[provider]} 登入這個帳號。`, `You can now sign in to this account with ${PROVIDER_LABEL[provider]}.`));
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setLinking(null);
    }
  }

  // 有密碼的帳號輸入密碼確認；用 GitHub／Google／Apple 建立的帳號輸入自己的帳號名稱
  const hasPassword = user.hasPassword !== false;

  // App Store 規定：可以註冊帳號的 App 必須能在 App 內刪除帳號
  async function removeAccount() {
    const ok = await confirmAction(tr('永久刪除帳號？', 'Permanently delete account?'), tr('你的所有作品、留言、追蹤、投票與大頭貼都會永久刪除，無法復原。', "All your posts, comments, follows, votes and avatar will be permanently deleted. This can't be undone."), tr('刪除帳號', 'Delete account'));
    if (!ok) return;
    try {
      await deleteAccount(hasPassword ? { password } : { confirm: password });
      router.dismissAll();
      notify(tr('帳號已刪除', 'Account deleted'));
    } catch (err) {
      notify((err as Error).message);
    }
  }

  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }];

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.avatarSection}>
        <Pressable onPress={changeAvatar} disabled={avatarBusy} accessibilityRole="button" accessibilityLabel={tr('更換大頭貼', 'Change avatar')}>
          <Avatar user={user} size={96} />
          <View style={[styles.avatarBadge, { backgroundColor: c.accent, borderColor: c.bg }]}>
            {avatarBusy ? <ActivityIndicator size="small" color={c.accentText} /> : <Ionicons name="camera" size={16} color={c.accentText} />}
          </View>
        </Pressable>
        <View style={styles.avatarButtons}>
          <Button title={user.avatarUrl ? tr('更換大頭貼', 'Change avatar') : tr('上傳大頭貼', 'Upload avatar')} onPress={changeAvatar} loading={avatarBusy} />
          {user.avatarUrl ? <Button title={tr('移除', 'Remove')} variant="danger" onPress={removeAvatar} disabled={avatarBusy} /> : null}
        </View>
      </View>

      <Text style={[styles.label, { color: c.text }]}>{tr('名稱', 'Name')}</Text>
      <TextInput style={inputStyle} value={displayName} onChangeText={setDisplayName} maxLength={50} />
      <Text style={[styles.label, { color: c.text }]}>{tr('自我介紹', 'Bio')}</Text>
      <TextInput
        style={[inputStyle, { minHeight: 100, textAlignVertical: 'top' }]}
        value={bio}
        onChangeText={setBio}
        maxLength={300}
        multiline
        placeholder={tr('介紹一下你自己、擅長用哪些 AI 工具…', 'Tell people about yourself and the AI tools you use…')}
        placeholderTextColor={c.muted}
      />

      <Text style={[styles.label, { color: c.text, marginTop: 20 }]}>{tr('聯繫我', 'Contact me')}</Text>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{tr('填了的才會出現在你的個人頁，所有人都看得到。可以填帳號或貼上網址。', 'Only what you fill in shows on your profile, and everyone can see it. Enter a username or paste a link.')}</Text>
      {CONTACT_FIELDS.map((f) => (
        <View key={f.type} style={[styles.contactInput, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name={f.icon} size={20} color={f.color} style={styles.contactIcon} />
          <TextInput
            style={[styles.contactText, { color: c.text }]}
            value={contacts[f.type] ?? ''}
            onChangeText={(v) => setContacts((prev) => ({ ...prev, [f.type]: v }))}
            placeholder={`${f.label}${tr('：', ': ')}${f.placeholder}`}
            placeholderTextColor={c.muted}
            keyboardType={f.keyboardType}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            accessibilityLabel={f.label}
          />
        </View>
      ))}

      <Button title={tr('儲存', 'Save')} variant="primary" onPress={save} loading={saving} style={{ marginTop: 8 }} />

      {providers && (providers.github || providers.google || user.identities?.length) ? (
        <View style={[styles.section, { borderColor: c.border }]}>
          <Text style={[styles.label, { color: c.text, marginTop: 0 }]}>{tr('登入方式', 'Sign-in methods')}</Text>
          {hasPassword ? <Text style={{ color: c.muted }}>{tr(`帳號密碼（@${user.username}）`, `Username and password (@${user.username})`)}</Text> : null}
          {(['github', 'google', 'apple'] as const).map((p) => {
            const connected = user.identities?.includes(p);
            if (!connected && (p === 'apple' || !providers[p])) return null;
            return (
              <View key={p} style={[styles.identity, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Ionicons name={p === 'github' ? 'logo-github' : p === 'google' ? 'logo-google' : 'logo-apple'} size={20} color={c.text} />
                <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{PROVIDER_LABEL[p]}</Text>
                {connected ? (
                  <Text style={{ color: c.accent, fontFamily: fonts.mono, fontSize: 13 }}>{tr('已綁定 ✓', 'Connected ✓')}</Text>
                ) : (
                  <Button title={tr('綁定', 'Connect')} onPress={() => connect(p as OAuthProvider)} loading={linking === p} disabled={linking !== null} />
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.section, { borderColor: c.border }]}>
        <Button title={tr('使用條款', 'Terms of Use')} onPress={() => Linking.openURL(siteDoc('terms'))} />
        <Button title={tr('隱私權政策', 'Privacy Policy')} onPress={() => Linking.openURL(siteDoc('privacy'))} />
        <Button title={tr('登出', 'Sign out')} onPress={async () => { await logout(); router.dismissAll(); }} />
      </View>

      <View style={[styles.section, { borderColor: c.border }]}>
        <Text style={[styles.label, { color: c.danger }]}>{tr('刪除帳號', 'Delete account')}</Text>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          {hasPassword
            ? tr('刪除後，你的所有作品、留言與追蹤都會永久刪除。請輸入密碼確認。', 'All your posts, comments and follows will be permanently deleted. Enter your password to confirm.')
            : tr(`刪除後，你的所有作品、留言與追蹤都會永久刪除。請輸入你的帳號 ${user.username} 確認。`, `All your posts, comments and follows will be permanently deleted. Type your username ${user.username} to confirm.`)}
        </Text>
        <TextInput
          style={inputStyle}
          value={password}
          onChangeText={setPassword}
          placeholder={hasPassword ? tr('目前的密碼', 'Current password') : user.username}
          placeholderTextColor={c.muted}
          secureTextEntry={hasPassword}
          textContentType={hasPassword ? 'password' : 'none'}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button title={tr('永久刪除帳號', 'Permanently delete account')} variant="danger" onPress={removeAccount} disabled={!password} />
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, minHeight: 50 },
  section: { marginTop: 28, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
});
