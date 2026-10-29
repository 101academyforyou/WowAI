import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { fonts, useColors } from '../lib/theme';
import { Button, Logo, notify } from '../components/ui';
import { SocialSignIn } from '../components/SocialSignIn';
import { siteDoc, tr } from '../lib/i18n';
import { api } from '../lib/api';
import { fetchProviders } from '../lib/oauth';

// 登入／註冊完成後回到上一頁；網頁直接打開 /login 時沒有上一頁，就回首頁
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function LoginScreen() {
  const c = useColors();
  const { user, login, register, signIn } = useAuth();
  // reset：忘記密碼，用註冊時驗證的 Email 收驗證碼並設定新密碼
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const isReset = mode === 'reset';
  // 這個畫面自己完成登入後由 leave() 離開，不要再被下面的 Redirect 帶走
  const [finished, setFinished] = useState(false);
  // 伺服器有開啟 Email 驗證時，註冊要填 Email 並輸入寄到信箱的驗證碼
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    fetchProviders().then((p) => setNeedEmail(Boolean(p.emailVerification))).catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function switchMode(next: typeof mode) {
    setMode(next);
    setEmailCode('');
    setCodeSentTo('');
    setPassword('');
  }

  async function sendCode() {
    setSending(true);
    try {
      await api(isReset ? '/api/auth/password-reset/code' : '/api/auth/email-code', { method: 'POST', body: { email: email.trim() } });
      setCodeSentTo(email.trim());
      setCooldown(60);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSending(false);
    }
  }
  const emailReady = !isRegister || !needEmail || (email.trim() && emailCode.trim().length === 6);

  async function resetPassword() {
    setBusy(true);
    try {
      const res = await api<{ user: Parameters<typeof signIn>[0]['user']; token: string }>('/api/auth/password-reset', {
        method: 'POST',
        body: { email: email.trim(), code: emailCode.trim(), password },
      });
      await signIn(res);
      notify(tr('密碼已更新', 'Password updated'), tr(`已經幫你登入 @${res.user.username}，其他裝置上的登入都已登出`, `You're signed in as @${res.user.username}. You've been signed out everywhere else`));
      setFinished(true);
      leave();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (isRegister && !acceptTerms) return notify(tr('請先同意使用條款', 'Please agree to the Terms of Use first'));
    setBusy(true);
    try {
      if (isRegister) {
        await register({ username: username.trim(), password, displayName, acceptTerms, ...(needEmail ? { email: email.trim(), emailCode: emailCode.trim() } : {}) });
        notify(tr('註冊成功！', 'You\'re signed up!'), tr(`歡迎加入 YourWowAI，已經幫你登入 @${username.trim()}`, `Welcome to YourWowAI. You're signed in as @${username.trim()}`));
      } else {
        await login(username.trim(), password);
      }
      setFinished(true);
      leave();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 已經登入（例如註冊完重新整理網頁）就不用再看到登入畫面
  if (user && !busy && !finished) return <Redirect href="/" />;

  const inputStyle = [styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }];

  // Email ＋「寄驗證碼」＋驗證碼欄位（註冊與重設密碼共用）
  const emailFields = (
    <>
      <View style={styles.row}>
        <TextInput
          style={[inputStyle, { flex: 1, minWidth: 0 }]}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
        />
        <Button
          title={cooldown > 0 ? `${cooldown}s` : codeSentTo ? tr('重新寄送', 'Resend') : tr('寄驗證碼', 'Send code')}
          onPress={sendCode}
          loading={sending}
          disabled={!email.trim() || cooldown > 0}
          style={{ alignSelf: 'stretch', minWidth: 104 }}
        />
      </View>
      {codeSentTo ? (
        <>
          <TextInput
            style={[inputStyle, emailCode ? styles.code : null]}
            value={emailCode}
            onChangeText={(t) => setEmailCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder={tr('6 位數驗證碼', '6-digit code')}
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <Text style={{ color: c.muted, fontSize: 12 }}>{tr(`驗證碼已寄到 ${codeSentTo}，沒收到的話看看垃圾郵件`, `We sent a code to ${codeSentTo}. Check spam if you don't see it`)}</Text>
        </>
      ) : null}
    </>
  );

  if (isReset) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}><Logo size={38} /></View>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', fontFamily: fonts.mono, textAlign: 'center', marginTop: 8 }}>{tr('重設密碼', 'Reset password')}</Text>
          <Text style={{ color: c.muted, textAlign: 'center', marginBottom: 8, lineHeight: 20 }}>{tr('輸入註冊時驗證的 Email，我們會寄一組驗證碼給你。', "Enter the email you verified when you signed up and we'll send you a code.")}</Text>
          {emailFields}
          {codeSentTo ? (
            <TextInput
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              placeholder={tr('新密碼（至少 8 個字元）', 'New password (at least 8 characters)')}
              placeholderTextColor={c.muted}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
          ) : null}
          <Button
            title={tr('設定新密碼', 'Set new password')}
            variant="primary"
            onPress={resetPassword}
            loading={busy}
            disabled={!email.trim() || emailCode.length !== 6 || password.length < 8}
            style={{ marginTop: 8, minHeight: 50 }}
          />
          <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{tr('用 GitHub、Google、Apple 登入的帳號沒有密碼，請直接用原本的方式登入。', 'Accounts created with GitHub, Google or Apple have no password. Just sign in the same way.')}</Text>
          <View style={styles.switch}>
            <Pressable onPress={() => switchMode('login')}>
              <Text style={{ color: c.accent, fontWeight: '800' }}>{tr('‹ 回到登入', '‹ Back to sign in')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Logo size={38} /></View>
        <Text style={{ color: c.muted, textAlign: 'center', marginBottom: 20, fontFamily: fonts.mono, fontSize: 13 }}>{tr('// 分享你用 AI 打造的工具', '// share the tools you build with AI')}</Text>

        <SocialSignIn onSignedIn={async (res) => { await signIn(res); setFinished(true); leave(); }} />

        <TextInput
          style={inputStyle}
          value={username}
          onChangeText={setUsername}
          placeholder={tr('帳號', 'Username')}
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
        />
        {isRegister ? (
          <TextInput style={inputStyle} value={displayName} onChangeText={setDisplayName} placeholder={tr('顯示名稱（選填）', 'Display name (optional)')} placeholderTextColor={c.muted} maxLength={50} />
        ) : null}
        <TextInput
          style={inputStyle}
          value={password}
          onChangeText={setPassword}
          placeholder={isRegister ? tr('密碼（至少 8 個字元）', 'Password (at least 8 characters)') : tr('密碼', 'Password')}
          placeholderTextColor={c.muted}
          secureTextEntry
          textContentType={isRegister ? 'newPassword' : 'password'}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
        />

        {isRegister && needEmail ? emailFields : null}

        {isRegister ? (
          <Pressable style={styles.terms} onPress={() => setAcceptTerms(!acceptTerms)} accessibilityRole="checkbox" accessibilityState={{ checked: acceptTerms }}>
            <Ionicons name={acceptTerms ? 'checkbox' : 'square-outline'} size={22} color={acceptTerms ? c.accent : c.muted} />
            <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>
              {tr('我同意', 'I agree to the')}
              <Text style={{ color: c.accent, fontWeight: '700' }} onPress={() => Linking.openURL(siteDoc('terms'))}>{tr(' 使用條款 ', ' Terms of Use ')}</Text>
              {tr('，並了解 YourWowAI 不容許任何令人反感的內容或騷擾行為。', 'and understand that YourWowAI has zero tolerance for objectionable content or abusive users.')}
            </Text>
          </Pressable>
        ) : null}

        <Button title={isRegister ? tr('註冊', 'Sign up') : tr('登入', 'Sign in')} variant="primary" onPress={submit} loading={busy} disabled={!username || !password || !emailReady} style={{ marginTop: 8, minHeight: 50 }} />

        {!isRegister && needEmail ? (
          <Pressable onPress={() => switchMode('reset')} style={{ alignSelf: 'center' }} hitSlop={8}>
            <Text style={{ color: c.muted, fontWeight: '700' }}>{tr('忘記密碼？', 'Forgot password?')}</Text>
          </Pressable>
        ) : null}

        <View style={styles.switch}>
          <Text style={{ color: c.muted }}>{isRegister ? tr('已經有帳號了？', 'Already have an account?') : tr('還沒有帳號？', "Don't have an account?")}</Text>
          <Pressable onPress={() => switchMode(isRegister ? 'login' : 'register')}>
            <Text style={{ color: c.accent, fontWeight: '800' }}>{isRegister ? tr('登入', 'Sign in') : tr('註冊', 'Sign up')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 40, gap: 12 },
  logo: { alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  code: { fontFamily: fonts.mono, fontSize: 20, letterSpacing: 6 },
  terms: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  switch: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
});
