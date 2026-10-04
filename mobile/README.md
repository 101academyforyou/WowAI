# YourWowAI iPhone App

用 [Expo](https://expo.dev)（React Native）寫的原生 iPhone App，連到同一個 YourWowAI 後端（`../server`）。
不需要 Mac：用 Expo 的雲端服務 EAS 就能編譯、簽章並上傳到 App Store。

## 在 iPhone 上試玩（開發）

1. 在電腦上啟動後端（專案根目錄）：`npm install && npm start`
2. 查出電腦在區網的 IP（例如 `192.168.1.10`），iPhone 和電腦要連同一個 Wi-Fi
3. 啟動 App：

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_API_URL=http://192.168.1.10:3000 npx expo start
   ```

4. iPhone 安裝 App Store 上的 **Expo Go**，用相機掃終端機上的 QR code 即可開啟

其他指令：`npm run typecheck`、`npm run lint`、`npm run web`（在瀏覽器預覽）。

## App 功能

- 首頁動態牆：「最新分享」／「追蹤中」、下拉重新整理、無限捲動、左右滑多張截圖、**Cool／Not Cool 投票**（雙擊圖片 = Cool）
- 科技風深色介面：霓虹青色、等寬字體、App 圖示與啟動畫面
- 分享：從相簿選（可多選）、拍照或錄影；**沒有截圖或影片就不能分享**；顯示上傳進度
  - iPhone 的 HEIC 照片與 HEVC 影片會自動轉成 JPEG／H.264，所有裝置都能看
- 探索：依 AI 工具標籤（#Claude、#Cursor…）瀏覽
- 貼文頁：留言、分享連結、「試用工具」按鈕
- 個人頁：九宮格作品牆、追蹤、編輯個人檔案
- 登入權杖存在 iOS 鑰匙圈（SecureStore）
- 深色模式

### App Store 審查必備功能（已內建）

Apple 對「使用者可發佈內容」的 App 有額外規定（審查準則 1.2、5.1.1(v)），以下都已完成：

| 規定 | YourWowAI 的做法 |
| --- | --- |
| 使用者必須同意條款，且條款明示不容許令人反感的內容 | 註冊時必須勾選同意[使用條款](../public/terms.html) |
| 可以檢舉不當內容 | 每則貼文右上角「⋯」→ 檢舉，選擇原因 |
| 可以封鎖濫用的使用者 | 貼文「⋯」或個人頁 → 封鎖，立即看不到對方的貼文與留言 |
| 開發者需在 24 小時內處理檢舉 | 3 人檢舉的貼文自動隱藏；管理員可用 `GET /api/admin/reports` 查看、刪除或恢復 |
| 可以在 App 內刪除帳號 | 編輯個人檔案 → 永久刪除帳號 |
| 提供隱私權政策 | `https://你的網域/privacy.html` |

## 上架 App Store 步驟

### 1. 準備帳號
- 加入 [Apple Developer Program](https://developer.apple.com/programs/)（每年 US$99）
- 註冊 [Expo 帳號](https://expo.dev/signup)（免費）

### 2. 把後端部署到正式環境（必須是 HTTPS）
iPhone App 只能連 HTTPS。後端可以部署到 Render、Railway、Fly.io 或任何 VPS，注意：
- 需要**持久磁碟**存放 SQLite 資料庫與上傳的檔案，把 `DATA_DIR` 指到那個磁碟
- 設定 `NODE_ENV=production`
- 設定 `ADMIN_USERNAMES=你的帳號`，才能處理檢舉

### 3. 修改 App 設定（`mobile/app.json`）
- `expo.extra.apiUrl`：改成後端網址，例如 `https://api.yourwowai.app`
- `expo.ios.bundleIdentifier`：改成你自己的，例如 `com.你的名字.yourwowai`（上架後不能改）
- 圖示 `assets/icon.png`（1024×1024、不可透明）已經是 YourWowAI 標誌，想換可以直接覆蓋
- 修改 `public/terms.html` 和 `public/privacy.html` 裡的聯絡信箱

### 4. 用 EAS 雲端編譯並上傳

```bash
cd mobile
npm install -g eas-cli
eas login
eas init                               # 建立 Expo 專案並寫入 projectId
eas build --platform ios --profile production
eas submit --platform ios --latest     # 上傳到 App Store Connect
```

第一次 build 時 EAS 會引導你登入 Apple 帳號，並自動建立憑證與 Provisioning Profile。

### 5. 在 App Store Connect 填寫資料
到 [App Store Connect](https://appstoreconnect.apple.com)：
- **TestFlight**：先自己裝起來測試，確認沒問題再送審
- **截圖**：至少 6.9 吋 iPhone 的截圖（可以用 TestFlight 版本在 iPhone 上截圖）
- **隱私權政策網址**：`https://你的網域/privacy.html`
- **App 隱私（營養標示）**：收集「使用者內容（相片或影片、其他使用者內容）」和「使用者 ID」，用途為「App 功能」，與使用者身分連結，**不用於追蹤**
- **年齡分級**：問卷中「使用者生成內容」選「是」
- **審查備註**：提供一組測試帳號密碼，並說明檢舉（貼文 ⋯ → 檢舉）、封鎖、刪除帳號的位置

### 6. 之後更新
- 只改 JavaScript：`eas update` 可以直接推送更新（需先設定 [EAS Update](https://docs.expo.dev/eas-update/introduction/)）
- 改了原生設定或套件：重新 `eas build` + `eas submit`，版本號由 EAS 自動遞增

## 專案結構

```
src/
  app/                 畫面（Expo Router，檔案即路由）
    (tabs)/            底部分頁：首頁、探索、分享、個人
    post/[id].tsx      貼文與留言
    user/[username].tsx
    login.tsx          登入／註冊（同意條款）
    settings.tsx       編輯個人檔案、登出、刪除帳號
  components/          PostCard、MediaCarousel、PostGrid、ProfileView…
  lib/                 API、登入狀態、主題色
```
