# WowAI

像 Instagram 一樣的社群 App，但專注於**分享用 AI 開發的工具**。
每則分享都**必須附上截圖或影片**，讓大家一眼就看到你的作品長什麼樣子。

## 功能

- **分享 AI 工具**：工具名稱、介紹、試用連結、使用了哪些 AI（例如 Claude、Cursor、v0）
- **一定要有截圖或影片**：每則最多 10 個檔案（JPG／PNG／GIF／WebP／MP4／MOV／WebM，單檔 100MB 內）
  - 前端：沒選檔案時無法按下「分享」
  - 後端：沒有媒體一律拒絕，並用檔案開頭的 magic bytes 驗證真的是圖片或影片（不信任副檔名）
- **動態牆**：「最新分享」與「追蹤中」兩種，左右滑動看多張截圖，雙擊圖片按讚
- **探索**：依 AI 工具標籤（#Claude、#Cursor…）瀏覽作品
- **互動**：按讚、留言、追蹤、分享連結
- **個人頁**：IG 風格九宮格作品牆、粉絲／追蹤數、編輯個人檔案
- 手機優先的介面，支援深色模式，可「加入主畫面」當成 App 使用（PWA）

## 快速開始

需要 Node.js 22.5 以上（使用內建的 `node:sqlite`，不必另外安裝資料庫）。

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # 開發模式，修改程式後自動重啟
npm test           # 執行 API 測試
```

可用環境變數：

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PORT` | `3000` | 伺服器埠號 |
| `DATA_DIR` | `./data` | SQLite 資料庫與上傳檔案的存放位置 |
| `NODE_ENV` | — | 設為 `production` 時 cookie 會加上 `Secure` |

## 專案結構

```
server/
  index.js   啟動伺服器
  app.js     Express 路由與 API
  db.js      SQLite 資料表
  media.js   圖片／影片格式驗證
public/      前端（原生 JavaScript 單頁應用，不需要建置）
test/        API 測試（node:test）
```

## API 一覽

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/api/auth/register`、`/api/auth/login`、`/api/auth/logout` | 註冊／登入／登出 |
| GET / PATCH | `/api/me` | 目前登入者／更新名稱與自我介紹 |
| GET | `/api/posts?feed=following&tag=Claude&before=<id>` | 動態牆（分頁） |
| POST | `/api/posts` | 分享（multipart，`media` 欄位至少一個檔案） |
| GET / DELETE | `/api/posts/:id` | 單則貼文／刪除自己的貼文 |
| POST / DELETE | `/api/posts/:id/like` | 按讚／取消讚 |
| GET / POST | `/api/posts/:id/comments` | 留言 |
| GET | `/api/users/:username` | 個人頁與作品 |
| POST / DELETE | `/api/users/:username/follow` | 追蹤／取消追蹤 |
| GET | `/api/tags` | 熱門 AI 工具標籤 |
