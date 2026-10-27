import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api, type User } from '../lib/api';
import { lang } from '../lib/i18n';

// Sign in with Apple（只有 iPhone）。App Store 規定：有 GitHub／Google 登入就要一併提供 Apple 登入
export function AppleSignInButton({ onSignedIn, onError }: { onSignedIn: (res: { user: User; token: string }) => void; onError: (message: string) => void }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);
  if (!available) return null;

  async function signIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      // Apple 只在第一次登入時給名字
      const fullName = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : '';
      onSignedIn(await api<{ user: User; token: string }>('/api/auth/apple', {
        method: 'POST',
        body: { identityToken: credential.identityToken, fullName },
      }));
    } catch (err) {
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      onError((err as Error).message);
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={8}
      style={{ height: 48, width: '100%' }}
      onPress={signIn}
      accessibilityLabel={lang === 'zh' ? '使用 Apple 繼續' : 'Continue with Apple'}
    />
  );
}
