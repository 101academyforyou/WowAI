// 讓 iPhone App 不用重新送審也能拿到新版（EAS Update）。
// 其他設定都在 app.json；這裡只在有 EAS projectId 時加上更新網址。
// runtimeVersion 跟著 App 版本號（expo.version）：只改 JavaScript 時用 `npm run update:ios` 推送；
// 改了原生套件或設定就要把版本號往上加，再重新 eas build + eas submit。
module.exports = ({ config }) => {
  const projectId = config.extra?.eas?.projectId;
  return {
    ...config,
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : { enabled: false }),
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
  };
};
