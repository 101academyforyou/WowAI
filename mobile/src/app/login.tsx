import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useColors } from '../lib/theme';
import { Button, notify } from '../components/ui';

export default function LoginScreen() {
  const c = useColors();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  async function submit() {
    if (isRegister && !acceptTerms) return notify('請先同意使用條款');
    setBusy(true);
    try {
      if (isRegister) await register({ username: username.trim(), password, displayName, acceptTerms });
      else await login(username.trim(), password);
      router.back();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[styles.logo, { color: c.text }]}>Wow<Text style={{ color: c.accent2 }}>AI</Text></Text>
        <Text style={{ color: c.muted, textAlign: 'center', marginBottom: 20 }}>分享你用 AI 打造的工具</Text>

        <TextInput
          style={inputStyle}
          value={username}
          onChangeText={setUsername}
          placeholder="帳號"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
        />
        {isRegister ? (
          <TextInput style={inputStyle} value={displayName} onChangeText={setDisplayName} placeholder="顯示名稱（選填）" placeholderTextColor={c.muted} maxLength={50} />
        ) : null}
        <TextInput
          style={inputStyle}
          value={password}
          onChangeText={setPassword}
          placeholder={isRegister ? '密碼（至少 8 個字元）' : '密碼'}
          placeholderTextColor={c.muted}
          secureTextEntry
          textContentType={isRegister ? 'newPassword' : 'password'}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
        />

        {isRegister ? (
          <Pressable style={styles.terms} onPress={() => setAcceptTerms(!acceptTerms)} accessibilityRole="checkbox" accessibilityState={{ checked: acceptTerms }}>
            <Ionicons name={acceptTerms ? 'checkbox' : 'square-outline'} size={22} color={acceptTerms ? c.accent : c.muted} />
            <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>
              我同意
              <Text style={{ color: c.accent, fontWeight: '700' }} onPress={() => Linking.openURL(`${API_URL}/terms.html`)}> 使用條款 </Text>
              ，並了解 WowAI 不容許任何令人反感的內容或騷擾行為。
            </Text>
          </Pressable>
        ) : null}

        <Button title={isRegister ? '註冊' : '登入'} variant="primary" onPress={submit} loading={busy} disabled={!username || !password} style={{ marginTop: 8, minHeight: 50 }} />

        <View style={styles.switch}>
          <Text style={{ color: c.muted }}>{isRegister ? '已經有帳號了？' : '還沒有帳號？'}</Text>
          <Pressable onPress={() => setMode(isRegister ? 'login' : 'register')}>
            <Text style={{ color: c.accent, fontWeight: '800' }}>{isRegister ? '登入' : '註冊'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 40, gap: 12 },
  logo: { fontSize: 44, fontWeight: '800', textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  terms: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  switch: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
});
