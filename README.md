# YourWowAI

像 Instagram 一樣的社群 App，但專注於**分享用 AI 開發的工具**。
每則分享都**必須附上截圖或影片**，讓大家一眼就看到你的作品長什麼樣子。

- **iPhone App**：[`mobile/`](mobile/)（Expo / React Native），上架 App Store 的步驟見 [mobile/README.md](mobile/README.md)
- **網頁版**：[`public/`](public/)，由後端直接提供
- **後端 API**：[`server/`](server/)，App 與網頁共用

## 功能

- **分享 AI 工具**：工具名稱、介紹、試用連結、使用了哪些 AI（例如 Claude、Cursor、v0）
- **一定要有截圖或影片**：每則最多 10 個檔案（JPG／PNG／GIF／WebP／MP4／MOV／WebM，單檔 100MB 內）
  - 前端：沒選檔案時無法按下「分享」
  - 後端：沒有媒體一律拒絕，並用檔案開頭的 magic bytes 驗證真的是圖片或影片（不信任副檔名）
- **動態牆**：「最新分享」與「追蹤中」兩種，左右滑動看多張截圖，雙擊圖片 = Cool
- **探索**：依 AI 工具標籤（#Claude、#Cursor…）瀏覽作品
- **Cool／Not Cool 投票**：每人每則一票，可以改票或取消；取代傳統的「愛心」
- **互動**：留言、追蹤、分享連結
- **科技風介面**：深色底、霓虹青色、等寬字體
- **個人頁**：IG 風格九宮格作品牆、粉絲／追蹤數、編輯個人檔案、大頭貼
- **聯繫我**：在個人頁放上 Facebook、Instagram、Threads、LINE、Email、X、個人網站；填帳號或網址都可以，伺服器會驗證並轉成正確連結
- **社群安全**（App Store 規定）：註冊需同意使用條款、檢舉貼文、封鎖使用者、在 App 內刪除帳號；被 3 人檢舉的貼文自動隱藏，管理員可審查
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
| `ADMIN_USERNAMES` | — | 管理員帳號（逗號分隔），可查看檢舉、刪除或恢復貼文 |

## 專案結構

```
server/
  index.js   啟動伺服器
  app.js     Express 路由與 API
  db.js      SQLite 資料表
  media.js   圖片／影片格式驗證
mobile/      iPhone App（Expo / React Native）
public/      網頁版前端（原生 JavaScript 單頁應用，不需要建置）、使用條款、隱私權政策
test/        API 測試（node:test）
```

## API 一覽

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/api/auth/register`、`/api/auth/login`、`/api/auth/logout` | 註冊（需 `acceptTerms: true`）／登入／登出，回傳 `token` |
| GET / PATCH / DELETE | `/api/me` | 目前登入者／更新名稱、自我介紹與聯繫方式（`contacts`）／刪除帳號（需密碼） |
| PUT / DELETE | `/api/me/avatar` | 上傳或更換大頭貼（multipart `avatar`，5MB 內圖片）／移除 |
| GET | `/api/posts?feed=following&tag=Claude&before=<id>` | 動態牆（分頁） |
| POST | `/api/posts` | 分享（multipart，`media` 欄位至少一個檔案） |
| GET / DELETE | `/api/posts/:id` | 單則貼文／刪除自己的貼文 |
| PUT / DELETE | `/api/posts/:id/vote` | 投票（`vote`: `cool` 或 `notcool`）／取消，回傳 `coolCount`、`notCoolCount`、`myVote` |
| POST | `/api/posts/:id/report` | 檢舉（`reason`: spam、nudity、violence、harassment、ip、other） |
| GET / POST | `/api/posts/:id/comments` | 留言 |
| GET | `/api/users/:username` | 個人頁與作品 |
| POST / DELETE | `/api/users/:username/follow` | 追蹤／取消追蹤 |
| POST / DELETE | `/api/users/:username/block` | 封鎖／解除封鎖 |
| GET | `/api/admin/reports` | 管理員：被檢舉的貼文 |
| POST | `/api/admin/posts/:id/restore` | 管理員：檢舉不成立，恢復貼文 |
| GET | `/api/tags` | 熱門 AI 工具標籤 |

登入方式：網頁用 HttpOnly cookie，iPhone App 用 `Authorization: Bearer <token>`。
