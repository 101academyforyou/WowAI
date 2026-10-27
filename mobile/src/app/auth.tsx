import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { exchangeCode, parseOAuthResult, PROVIDER_LABEL } from '../lib/oauth';
import { Loading, notify } from '../components/ui';
import { tr } from '../lib/i18n';

// 網頁版 GitHub／Google 登入完導回來的頁面（/auth?code=…）。
// iPhone 由登入視窗直接拿結果（lib/oauth.ts），從外部點進 yourwowai://auth 的連結一律忽略，避免被登入別人的帳號
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const { signIn, refresh } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (Platform.OS !== 'web') {
      router.replace('/');
      return;
    }
    const result = parseOAuthResult(params);
    (async () => {
      if (result.code) {
        try {
          await signIn(await exchangeCode(result.code));
        } catch (err) {
          notify((err as Error).message);
        }
        return router.replace('/');
      }
      if (result.linked) {
        await refresh();
        const label = PROVIDER_LABEL[result.linked as keyof typeof PROVIDER_LABEL] ?? result.linked;
        notify(tr(`已綁定 ${label}`, `${label} connected`), tr(`之後也可以用 ${label} 登入這個帳號。`, `You can now sign in to this account with ${label}.`));
        return router.replace('/settings');
      }
      if (result.error) notify(result.error);
      router.replace('/');
    })();
  }, [params, signIn, refresh]);

  return <Loading />;
}
