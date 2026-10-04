import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

// iPhone 推播：App 開著時也顯示橫幅；App 圖示上的數字由伺服器的推播帶過來
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

let registeredToken: string | null = null;

// 登入後呼叫：詢問通知權限、取得 Expo 推播位址並登記到後端。失敗不影響使用 App。
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.info('[推播] 還沒有 EAS projectId，略過推播。請在 mobile 資料夾執行一次 `npx eas-cli@latest init`。');
    return;
  }
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/api/push-tokens', { method: 'POST', body: { token } });
    registeredToken = token;
  } catch (err) {
    console.warn('[推播] 登記失敗', err);
  }
}

// 登出前呼叫：這台手機不再收到這個帳號的推播
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await api('/api/push-tokens', { method: 'DELETE', body: { token } }).catch(() => {});
}

export async function setAppBadge(count: number) {
  if (Platform.OS === 'web') return;
  await Notifications.setBadgeCountAsync(count).catch(() => false);
}
