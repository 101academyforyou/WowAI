# YourWowAI

像 Instagram 一樣的社群 App，但專注於**分享用 AI 開發的工具**。
每則分享都**必須附上截圖或 YouTube 示範影片**，讓大家一眼就看到你的作品長什麼樣子。

**同一份程式碼，同時是 iPhone App 也是網站。** [`mobile/`](mobile/) 用 Expo（React Native）寫成：

- **iPhone App**：上架 App Store 的步驟見 [mobile/README.md](mobile/README.md)
- **網站**：用 `npm run build:web` 把同一個 App 編譯成網頁（輸出到 `web-dist/`），由後端直接提供；電腦上會置中成一欄
- **後端 API**：[`server/`](server/)，App 與網站共用

## 功能

- **分享 AI 工具**：工具名稱、介紹、試用連結、使用了哪些 AI（例如 Claude、Cursor、v0）
- **連動 GitHub**：分享時貼上 GitHub 專案（`owner/repo` 或網址）按「匯入」，App 從 GitHub 公開 API 自動帶入名稱、介紹、網站與 AI 相關 topics；貼文會顯示原始碼按鈕和 GitHub 星星數（伺服器每 6 小時更新一次，點了到 GitHub 按星），也能用專案名稱搜尋；也可以按「從我的 GitHub 專案選擇」直接列出自己的公開專案（用綁定的 GitHub 登入或「聯繫我」填的 GitHub，否則輸入帳號）
- **一定要有截圖或 YouTube 影片**：截圖每則最多 10 張（JPG／PNG／GIF／WebP，單張 20MB 內）；示範影片貼 YouTube 連結（watch、youtu.be、Shorts 都可以），不在伺服器存影片檔
  - 前端：沒選檔案時無法按下「分享」
  - 後端：沒有媒體一律拒絕，並用檔案開頭的 magic bytes 驗證真的是圖片（不信任副檔名）；影片檔一律拒絕，請改貼 YouTube 連結
- **動態牆**：「推薦」（每次打開順序都不同）、「最新」、「排行」（Cool 排行榜，可看本週／本月／全部）與「追蹤中」，左右滑動看多張截圖，雙擊圖片 = Cool
- **探索與搜尋**：依 AI 工具標籤（#Claude、#Cursor…）瀏覽；用關鍵字搜尋作品名稱、介紹、AI 標籤與作者，也能找到其他 Cooler
- **Cool／Not Cool 投票**：每人每則一票，可以改票或取消；取代傳統的「愛心」
- **互動**：留言（可以編輯、刪除；貼文作者也能刪除自己貼文下的留言）、追蹤、在 YourWowAI 裡分享到自己個人頁的「分享」分頁、分享連結
- **AI Webhook**：在「編輯個人檔案」產生專屬網址交給 AI（Claude Code、ChatGPT、n8n、GitHub Actions…），AI 就能代你分享作品或更新貼文；網址用 GET 打開會回傳給 AI 看的使用說明
- **多種登入方式**：GitHub、Google、Sign in with Apple（iPhone）或帳號密碼；第一次用第三方登入會自動建立帳號並帶入大頭貼，已有帳號的人可以在「編輯個人檔案 → 登入方式」綁定
- **科技風介面**：深色底、霓虹青色、等寬字體
- **個人頁**：IG 風格九宮格作品牆、粉絲／追蹤數、編輯個人檔案、大頭貼
- **通知與推播**：有人 Cool 你的作品、留言、追蹤你，或你追蹤的人發新作品時，「通知」分頁會亮紅點；iPhone 會跳出推播（點了直接打開那則貼文），網站開著時即時更新
- **聯繫我**：在個人頁放上 Facebook、Instagram、Threads、LINE、Email、X、GitHub、個人網站；填帳號或網址都可以，伺服器會驗證並轉成正確連結
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
| `HOST` | 全部網路介面 | 設為 `127.0.0.1` 時只接受本機連線（前面有 Caddy 等反向代理時使用） |
| `NODE_ENV` | — | 設為 `production` 時 cookie 會加上 `Secure`，並關閉開發用的跨來源存取 |
| `ADMIN_USERNAMES` | — | 管理員帳號（逗號分隔），可查看檢舉、刪除或恢復貼文 |
| `EXPO_ACCESS_TOKEN` | — | 選填。在 Expo 開啟「推播加強安全」時才需要 |

## 部署到 Oracle Cloud（永久免費）

正式網址：**https://yourwowai.onepointzeroone.org**（網頁版 App、API、使用條款與隱私權政策都在這裡；iPhone App 也連這個網址）。

`deploy/oracle/install.sh` 會一次裝好 Node.js 22、Caddy（自動 HTTPS）、編譯網頁版、設定開機自動啟動、打開防火牆，並每天備份資料庫。

### 1. 建立免費主機
1. 到 [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) 註冊（需要信用卡驗證身分，Always Free 資源不會收費）。Home Region 選離你近的，例如 Japan East (Tokyo)，**之後不能改**
2. 主選單 → **Compute → Instances → Create instance**
   - **Image**：Canonical Ubuntu 24.04
   - **Shape**：Ampere **VM.Standard.A1.Flex**，2 OCPU、12 GB 記憶體（在免費額度內）。若顯示容量不足，可稍後再試或換 AMD **VM.Standard.E2.1.Micro**
   - **Networking**：建立新的 VCN 與公用子網路，勾選 **Assign a public IPv4 address**
   - **SSH keys**：選 **Generate a key pair**，下載私鑰（例如 `ssh-key.key`）
3. 建好後記下 **Public IP address**

### 2. 打開網路的 80 / 443 埠
Instance 頁面 → **Primary VNIC 的 Subnet** → **Security Lists** → Default Security List → **Add Ingress Rules**，加兩條：

| Source CIDR | IP Protocol | Destination Port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

### 3. 設定 DNS
到 onepointzeroone.org 的 DNS 管理後台新增：

| 類型 | 名稱 | 值 |
| --- | --- | --- |
| A | `yourwowai` | 主機的 Public IP |

如果 DNS 在 Cloudflare，這筆請設成「DNS only」（灰色雲朵），讓 Caddy 自己申請 HTTPS 憑證。

### 4. 登入主機並安裝
Mac 的「終端機」：

```bash
chmod 400 ~/Downloads/ssh-key.key
ssh -i ~/Downloads/ssh-key.key ubuntu@主機的PublicIP
```

登入後執行（`你的帳號` 換成你在 YourWowAI 的帳號，會成為管理員，可處理檢舉）：

```bash
curl -fsSL https://raw.githubusercontent.com/101academyforyou/WowAI/main/deploy/oracle/install.sh | sudo ADMIN_USERNAMES=你的帳號 bash
```

第一次約 5–10 分鐘。DNS 生效後打開 https://yourwowai.onepointzeroone.org/api/health，看到 `{"ok":true}` 就完成了。

### 開啟 GitHub／Google 登入（選用）
登入畫面只會顯示已經設定好的服務。Sign in with Apple 不需要設定伺服器，iPhone App 一律提供（App Store 規定有第三方登入就要提供 Apple 登入）。

1. **GitHub**：到 GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
   - Homepage URL：`https://yourwowai.onepointzeroone.org`
   - Authorization callback URL：`https://yourwowai.onepointzeroone.org/api/auth/oauth/github/callback`
   - 建立後複製 **Client ID**，再按 **Generate a new client secret** 複製 secret
2. **Google**：到 Google Cloud Console → APIs & Services → **OAuth consent screen** 設定好 App 名稱，再到 **Credentials → Create credentials → OAuth client ID**（類型選 Web application）
   - Authorized redirect URI：`https://yourwowai.onepointzeroone.org/api/auth/oauth/google/callback`
3. 在主機上 `sudo nano /etc/yourwowai.env`，填入（拿掉行首的 `#`）：
   ```
   GITHUB_CLIENT_ID=…
   GITHUB_CLIENT_SECRET=…
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   ```
   存檔後 `sudo systemctl restart yourwowai`

### 註冊驗證 Email（選用）
填了 `RESEND_API_KEY` 後，用帳號密碼註冊要先收 Email 驗證碼（6 位數、10 分鐘有效、同一個 Email 只能註冊一個帳號），登入畫面也會出現「忘記密碼？」，用註冊時驗證的 Email 收驗證碼重設密碼（重設後其他裝置會被登出）。沒填就不需要驗證，也沒有忘記密碼。

1. 到 [resend.com](https://resend.com) 註冊 → **Domains → Add Domain** 輸入 `onepointzeroone.org`，照畫面把 DNS 記錄加到網域後台，等狀態變成 Verified
2. **API Keys → Create API Key**（權限選 Sending access）
3. 在主機上 `sudo nano /etc/yourwowai.env`，拿掉行首的 `#` 並填入：
   ```
   RESEND_API_KEY=re_…
   MAIL_FROM=YourWowAI <no-reply@onepointzeroone.org>
   ```
   存檔後 `sudo systemctl restart yourwowai`

iPhone App 1.0 的註冊畫面沒有 Email 欄位，所以暫時只有網站與新版 App 會要求驗證。App 1.1 上架後，再加上 `REQUIRE_EMAIL_FOR_APP=1`，舊版 App 註冊時會提示更新。

### 之後
- **更新到最新版**：再執行一次上面的安裝指令（設定與資料都會保留）
- **查看紀錄**：`journalctl -u yourwowai -f`
- **備份**：每天凌晨 3 點自動備份資料庫到 `/var/backups/yourwowai`（保留 14 天）。上傳的截圖在 `/var/lib/yourwowai/uploads`。建議也在 Oracle 主控台替開機磁碟設定備份（Always Free 含 5 份）
- **注意**：Oracle 可能回收長時間幾乎沒有使用量的 Always Free 主機。若擔心，可把帳號升級為 Pay As You Go（免費額度內仍然不收費）

## 部署到 Railway（另一個選擇，需付費）

正式網址：**https://yourwowai.onepointzeroone.org**（網頁版 App、API、使用條款與隱私權政策都在這裡；iPhone App 也連這個網址）。

專案已附上 `railway.json`：編譯時會一併打包網頁版，啟動後 Railway 會用 `/api/health` 確認伺服器正常。

1. 到 [railway.com](https://railway.com) 用 GitHub 登入 → **New Project** → **Deploy from GitHub repo** → 選 `101academyforyou/WowAI`
2. 在服務上按右鍵 **Attach Volume**，掛載路徑填 `/data`（資料庫與上傳的截圖都存在這裡，重新部署不會不見）
3. **Variables** 加上：

   | 變數 | 值 |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATA_DIR` | `/data` |
   | `ADMIN_USERNAMES` | 你的帳號（可處理檢舉） |

4. **Settings → Networking → Custom Domain** 輸入 `yourwowai.onepointzeroone.org`，Railway 會給你一筆 CNAME 目標
5. 到 onepointzeroone.org 的 DNS 管理後台新增：

   | 類型 | 名稱 | 值 |
   | --- | --- | --- |
   | CNAME | `yourwowai` | Railway 給的目標（例如 `xxxx.up.railway.app`） |

   如果 DNS 在 Cloudflare，這筆請設成「DNS only」（灰色雲朵），讓 Railway 自動申請 HTTPS 憑證。
6. 等 DNS 生效（幾分鐘到一小時），打開 https://yourwowai.onepointzeroone.org/api/health 看到 `{"ok":true}` 就完成了

之後每次合併到 `main`，Railway 都會自動重新部署。記得定期備份 Volume（資料庫是 `/data/wowai.db`）。

## 專案結構

```
server/
  index.js   啟動伺服器
  app.js     Express 路由與 API
  db.js      SQLite 資料表
  media.js   圖片格式驗證
  youtube.js YouTube 連結解析
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
| GET / PATCH / DELETE | `/api/me` | 目前登入者（含 `hasPassword`、已綁定的 `identities`、自己的 GitHub 帳號 `github: { login, id }`）／更新名稱、自我介紹與聯繫方式（`contacts`）／刪除帳號（有密碼送 `password`，第三方登入的帳號送 `confirm`: 自己的帳號名稱） |
| POST / DELETE | `/api/me/webhook` | 產生（或重新產生）自己的 AI Webhook 網址，完整網址只回傳這一次／關閉 |
| GET | `/api/hooks/:token` | AI Webhook：回傳給 AI 讀的使用說明（欄位、分類、範例） |
| POST | `/api/hooks/:token` | AI Webhook 發文：JSON（截圖用 `images`: base64 或 data URL 陣列）或 multipart（`media` 檔案），欄位同分享；回傳 `{ post, url }`。每小時最多 20 則，錯誤訊息預設英文 |
| PATCH | `/api/hooks/:token/posts/:id` | AI Webhook 更新自己的貼文：只改有送的欄位，送 `images` 會換掉全部截圖 |
| GET | `/api/auth/providers` | 可用的登入方式 `{ github, google, apple }` |
| POST | `/api/auth/oauth/:provider/start` | GitHub／Google 登入或綁定（`client`: `web` 或 `app`，`link: true` 代表綁定到目前帳號），回傳要打開的 `url`；完成後導回 `/auth?code=…`（網站）或 `yourwowai://auth?code=…`（App） |
| POST | `/api/auth/oauth/exchange` | 用一次性 `code`（5 分鐘內有效）換登入 `token` |
| POST | `/api/auth/apple` | Sign in with Apple：送 iPhone 拿到的 `identityToken`（伺服器用 Apple 公開金鑰驗證）與第一次登入時的 `fullName` |
| PUT / DELETE | `/api/me/avatar` | 上傳或更換大頭貼（multipart `avatar`，5MB 內圖片）／移除 |
| GET | `/api/categories` | 應用領域分類與公開作品數（教育、效率、職場、理財、健康、生活、行銷、設計、開發、資料、遊戲、其他）；`/api/posts?category=<slug>` 依分類瀏覽，分享／編輯時用 `categories`（逗號分隔，最多 10 個） |
| GET | `/api/stats` | 公開統計 `{ users, posts }`（註冊人數、公開作品數），允許任何網站讀取，官方介紹網站用來顯示人數 |
| GET | `/api/health` | 健康檢查，回傳 `{ ok: true }` |
| GET | `/api/posts?feed=following&tag=Claude&q=發票&before=<id>` | 動態牆（分頁）；`sort=random&seed=<數字>&offset=` 打亂順序（同一個 seed 順序固定，App 每次重新整理換 seed），`sort=top&period=week|month|all&offset=` 是 Cool 排行榜；不帶 `sort` 是新到舊；`q` 搜尋作品名稱、介紹、GitHub 專案、AI 標籤與作者，空白分隔的關鍵字要全部符合 |
| GET | `/api/users?q=<關鍵字>` | 搜尋 Cooler（帳號或名稱，最多 10 位） |
| POST | `/api/posts` | 分享（multipart，`media` 圖片或 `youtubeUrl` 至少要有一個；選填 `githubUrl`，接受 `owner/repo` 或 github.com 網址） |
| GET / DELETE | `/api/posts/:id` | 單則貼文／刪除自己的貼文 |
| PATCH | `/api/posts/:id` | 編輯自己的貼文（multipart：文字欄位同分享；`layout` 是 JSON 陣列，依順序列出截圖，舊圖寫網址、新圖寫 `new:0`… 對應 `media` 檔案） |
| PUT / DELETE | `/api/posts/:id/vote` | 投票（`vote`: `cool` 或 `notcool`）／取消，回傳 `coolCount`、`notCoolCount`、`myVote` |
| POST | `/api/posts/:id/report` | 檢舉（`reason`: spam、nudity、violence、harassment、ip、other） |
| GET / POST | `/api/posts/:id/comments` | 留言 |
| PATCH / DELETE | `/api/comments/:id` | 編輯自己的留言（`body`）／刪除留言（留言者、貼文作者或管理員），回傳最新 `commentCount` |
| POST | `/api/posts/:id/github-stars` | 立刻向 GitHub 重新查詢這則貼文專案的星星數（同一個專案 5 秒內只查一次），回傳 `githubStars`；App 在使用者從 GitHub 按星回來時呼叫 |
| PUT / DELETE | `/api/posts/:id/pin` | 把自己的貼文釘選到個人頁最上方（最多 3 則，最近釘選的在前）／取消；貼文的 `pinned` 表示是否釘選 |
| PUT / DELETE | `/api/posts/:id/repost` | 在 YourWowAI 裡分享到自己的個人頁／取消，回傳 `repostCount`、`repostedByMe` |
| GET | `/api/users/:username` | 個人頁與作品 |
| POST / DELETE | `/api/users/:username/follow` | 追蹤／取消追蹤 |
| POST / DELETE | `/api/users/:username/block` | 封鎖／解除封鎖 |
| GET | `/api/admin/reports` | 管理員：被檢舉的貼文（各原因次數、是否隱藏、作者是否停權）與已停權的帳號；App 裡在「編輯個人檔案」→「管理員：檢舉處理」 |
| POST | `/api/admin/posts/:id/restore` | 管理員：檢舉不成立，清掉檢舉並恢復貼文 |
| POST | `/api/admin/posts/:id/hide` | 管理員：先把貼文下架（隱藏） |
| POST / DELETE | `/api/admin/users/:username/ban` | 管理員：停權（登出所有裝置、不能登入、貼文與留言對別人隱藏）／解除停權 |
| GET | `/api/tags` | 熱門 AI 工具標籤 |
| GET | `/api/notifications?before=<id>` | 通知列表（含未讀數） |
| GET | `/api/notifications/unread-count` | 未讀通知數 |
| POST | `/api/notifications/read` | 全部標為已讀 |
| GET | `/api/notifications/stream` | 即時通知（Server-Sent Events，網站用） |
| POST / DELETE | `/api/push-tokens` | 登記／移除 iPhone 的 Expo 推播位址 |

登入方式：App 與網站都用 `Authorization: Bearer <token>`（iPhone 存在鑰匙圈，網站存在瀏覽器）；登入時也會設 HttpOnly cookie。

非 `production` 環境下，後端允許本機與區網網址跨來源呼叫 API，方便 `expo start --web` 開發。
