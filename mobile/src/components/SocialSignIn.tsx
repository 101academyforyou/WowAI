import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchProviders, startOAuth, exchangeCode, PROVIDER_LABEL, type OAuthProvider, type Providers } from '../lib/oauth';
import type { User } from '../lib/api';
import { fonts, useColors } from '../lib/theme';
import { siteDoc, tr } from '../lib/i18n';
import { AppleSignInButton } from './AppleSignInButton';
import { notify } from './ui';

const STYLE: Record<OAuthProvider, { icon: 'logo-github' | 'logo-google'; bg: string; fg: string; border: string }> = {
  github: { icon: 'logo-github', bg: '#0d1117', fg: '#ffffff', border: '#3d444d' },
  google: { icon: 'logo-google', bg: '#ffffff', fg: '#1f1f1f', border: '#dadce0' },
};

// 登入畫面上方：Apple（iPhone）、GitHub、Google
export function SocialSignIn({ onSignedIn }: { onSignedIn: (res: { user: User; token: string }) => Promise<void> }) {
  const c = useColors();
  const [providers, setProviders] = useState<Providers | null>(null);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    fetchProviders().then(setProviders).catch(() => setProviders(null));
  }, []);

  async function signIn(provider: OAuthProvider) {
    setBusy(provider);
    try {
      const result = await startOAuth(provider);
      if (!result || result.cancelled) return;
      if (result.error) return notify(result.error);
      if (result.code) await onSignedIn(await exchangeCode(result.code));
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!providers) return null;
  const oauth = (['github', 'google'] as const).filter((p) => providers[p]);
  const apple = providers.apple && Platform.OS === 'ios';
  // 伺服器還沒設定 GitHub／Google（網頁版也沒有 Apple）時，不顯示條款與分隔線
  if (!oauth.length && !apple) return null;

  return (
    <View style={styles.wrap}>
      {apple ? <AppleSignInButton onSignedIn={(res) => { onSignedIn(res).catch((err) => notify(err.message)); }} onError={(m) => notify(m)} /> : null}
      {oauth.map((p) => (
        <Pressable
          key={p}
          onPress={() => signIn(p)}
          disabled={busy !== null}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: STYLE[p].bg, borderColor: STYLE[p].border, opacity: busy && busy !== p ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          <Ionicons name={STYLE[p].icon} size={20} color={STYLE[p].fg} />
          <Text style={[styles.label, { color: STYLE[p].fg }]}>
            {busy === p ? tr('連線中…', 'Connecting…') : tr(`使用 ${PROVIDER_LABEL[p]} 繼續`, `Continue with ${PROVIDER_LABEL[p]}`)}
          </Text>
        </Pressable>
      ))}
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
        {tr('繼續即表示你同意', 'By continuing, you agree to the')}
        <Text style={{ color: c.accent, fontWeight: '700' }} onPress={() => Linking.openURL(siteDoc('terms'))}>{tr(' 使用條款', ' Terms of Use')}</Text>
        {tr('，YourWowAI 不容許任何令人反感的內容或騷擾行為。', '. YourWowAI has zero tolerance for objectionable content or abusive users.')}
      </Text>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: c.border }]} />
        <Text style={{ color: c.muted, fontFamily: fonts.mono, fontSize: 12 }}>{tr('或用帳號密碼', 'or use a username')}</Text>
        <View style={[styles.line, { backgroundColor: c.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48, borderRadius: 8, borderWidth: 1 },
  label: { fontWeight: '700', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
