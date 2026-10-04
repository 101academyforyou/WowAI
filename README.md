# YourWowAI

像 Instagram 一樣的社群 App，但專注於**分享用 AI 開發的工具**。
每則分享都**必須附上截圖或影片**，讓大家一眼就看到你的作品長什麼樣子。

**同一份程式碼，同時是 iPhone App 也是網站。** [`mobile/`](mobile/) 用 Expo（React Native）寫成：

- **iPhone App**：上架 App Store 的步驟見 [mobile/README.md](mobile/README.md)
- **網站**：用 `npm run build:web` 把同一個 App 編譯成網頁（輸出到 `web-dist/`），由後端直接提供；電腦上會置中成一欄
- **後端 API**：[`server/`](server/)，App 與網站共用

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
- **個人頁**：IG 風格九宮格作品牆、粉絲／追蹤數、編輯個人檔案
- **社群安全**（App Store 規定）：註冊需同意使用條款、檢舉貼文、封鎖使用者、在 App 內刪除帳號；被 3 人檢舉的貼文自動隱藏，管理員可審查
- 網站可以在手機瀏覽器「加入主畫面」當成 App 使用；每則貼文都有自己的網址（例如 `/post/12`），可以直接分享

## 快速開始

需要 Node.js 22.5 以上（使用內建的 `node:sqlite`，不必另外安裝資料庫）。

```bash
npm install                 # 後端套件
npm --prefix mobile install # App 套件（網站也是用它編譯）
npm run web                 # 編譯網站並啟動 → http://localhost:3000
```

其他指令：

```bash
npm start            # 只啟動後端（網站要先 build:web 過一次）
npm run build:web    # 重新編譯網站（改了 mobile/src 之後要再跑一次）
npm run dev          # 後端開發模式，修改程式後自動重啟
npm test             # 執行 API 測試
```

開發網站時想要存檔就自動更新畫面：一個終端機跑 `npm run dev`，另一個在 `mobile/` 跑 `npx expo start --web`（網頁開在 8081 埠，會自動連到 3000 埠的後端）。

可用環境變數：

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PORT` | `3000` | 伺服器埠號 |
| `DATA_DIR` | `./data` | SQLite 資料庫與上傳檔案的存放位置 |
| `NODE_ENV` | — | 設為 `production` 時 cookie 會加上 `Secure`，並關閉開發用的跨來源存取 |
| `ADMIN_USERNAMES` | — | 管理員帳號（逗號分隔），可查看檢舉、刪除或恢復貼文 |

## 專案結構

```
server/
  index.js   啟動伺服器
  app.js     Express 路由與 API
  db.js      SQLite 資料表
  media.js   圖片／影片格式驗證
mobile/      iPhone App（Expo / React Native）
mobile/public/  網站的 HTML 範本、PWA 設定與圖示
public/      使用條款、隱私權政策
web-dist/    npm run build:web 的輸出（不進版控）
test/        API 測試（node:test）
```

## API 一覽

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/api/auth/register`、`/api/auth/login`、`/api/auth/logout` | 註冊（需 `acceptTerms: true`）／登入／登出，回傳 `token` |
| GET / PATCH / DELETE | `/api/me` | 目前登入者／更新名稱與自我介紹／刪除帳號（需密碼） |
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

登入方式：App 與網站都用 `Authorization: Bearer <token>`（iPhone 存在鑰匙圈，網站存在瀏覽器）；登入時也會設 HttpOnly cookie。

非 `production` 環境下，後端允許本機與區網網址跨來源呼叫 API，方便 `expo start --web` 開發。
