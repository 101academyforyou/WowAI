import type { User } from '../lib/api';

// 網頁版不提供 Apple 登入（需要另外設定 Apple Services ID）
export function AppleSignInButton(_props: { onSignedIn: (res: { user: User; token: string }) => void; onError: (message: string) => void }) {
  return null;
}
