import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { API_URL, api, type Profile, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fonts, useColors } from '../lib/theme';
import { Button, Loading, confirmAction, notify } from '../components/ui';

export default function SettingsScreen() {
  const c = useColors();
  const { user, setUser, logout, deleteAccount } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    api<{ user: Profile }>(`/api/users/${encodeURIComponent(user.username)}`).then(({ user: p }) => {
      setDisplayName(p.displayName);
      setBio(p.bio);
      setLoaded(true);
    }).catch((err) => notify(err.message));
  }, [user]);

  if (!user) return null;
  if (!loaded) return <Loading />;

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ user: User }>('/api/me', { method: 'PATCH', body: { displayName, bio } });
      setUser({ ...user!, ...res.user });
      router.back();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // App Store 規定：可以註冊帳號的 App 必須能在 App 內刪除帳號
  async function removeAccount() {
    const ok = await confirmAction('永久刪除帳號？', '你的所有作品、留言、追蹤與按讚都會永久刪除，無法復原。', '刪除帳號');
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
      <Button title="儲存" variant="primary" onPress={save} loading={saving} style={{ marginTop: 8 }} />

      <View style={[styles.section, { borderColor: c.border }]}>
        <Button title="使用條款" onPress={() => Linking.openURL(`${API_URL}/terms.html`)} />
        <Button title="隱私權政策" onPress={() => Linking.openURL(`${API_URL}/privacy.html`)} />
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
  label: { fontWeight: '700', marginTop: 8, fontFamily: fonts.mono, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  section: { marginTop: 28, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
});
