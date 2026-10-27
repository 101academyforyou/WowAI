// 伺服器訊息的語言：App 會送 Accept-Language（zh 或 en）。其他情況（舊版 App、`*`）一律用中文。
// 錯誤訊息在程式裡用中文寫，回應前才依語言翻成英文，避免每個 throw 都要寫兩種語言。

export function requestLang(req) {
  const header = String(req.headers['accept-language'] ?? '').trim().toLowerCase();
  return header.startsWith('en') ? 'en' : 'zh';
}

const FIELDS = {
  帳號: 'Username',
  名稱: 'Name',
  工具名稱: 'Tool name',
  介紹: 'Description',
  工具連結: 'Tool link',
  'YouTube 影片連結': 'YouTube link',
  'GitHub 專案': 'GitHub repo',
  留言: 'Comment',
  自我介紹: 'Bio',
  自訂分類: 'Custom category',
};

const MESSAGES = {
  工具連結格式不正確: 'The tool link is not a valid URL',
  '工具連結必須是 http 或 https': 'The tool link must start with http or https',
  'YouTube 影片連結格式不正確，請貼上 youtube.com 或 youtu.be 的影片網址': 'Invalid YouTube link. Paste a youtube.com or youtu.be video URL',
  'GitHub 專案請輸入 owner/repo 或 github.com 的專案網址': 'For the GitHub repo, enter owner/repo or a github.com repo URL',
  'AI 工具標籤最多 10 個': 'Up to 10 AI tool tags',
  找不到這則貼文: 'Post not found',
  找不到這位使用者: 'User not found',
  請先登入: 'Please sign in first',
  '帳號只能使用英數字、底線或句點，長度 3–30': 'Usernames can only use letters, numbers, underscores or periods, 3–30 characters',
  '密碼至少 8 個字元': 'Password must be at least 8 characters',
  請先同意使用條款: 'Please agree to the Terms of Use first',
  這個帳號已經有人使用: 'That username is taken',
  帳號或密碼錯誤: 'Wrong username or password',
  密碼錯誤: 'Wrong password',
  '分享時一定要附上至少一張截圖或一個 YouTube 影片連結': 'Every post needs at least one screenshot or a YouTube link',
  '影片請上傳到 YouTube，再貼上影片連結': 'Please upload videos to YouTube and paste the link instead',
  只能刪除自己的貼文: 'You can only delete your own posts',
  只能編輯自己的貼文: 'You can only edit your own posts',
  截圖資料格式不正確: 'Invalid screenshot data',
  不支援的分類: 'Unsupported category',
  不能檢舉自己的貼文: "You can't report your own post",
  請選擇檢舉原因: 'Please choose a reason',
  '請選擇 Cool 或 Not Cool': 'Choose Cool or Not Cool',
  請選擇一張圖片: 'Please choose an image',
  '大頭貼只能是 JPG、PNG、GIF 或 WebP 圖片': 'Avatars must be JPG, PNG, GIF or WebP images',
  不能追蹤自己: "You can't follow yourself",
  無法追蹤這位使用者: "You can't follow this user",
  不能封鎖自己: "You can't block yourself",
  需要管理員權限: 'Admin access required',
  '推播 token 格式不正確': 'Invalid push token',
  找不到檔案: 'File not found',
  '找不到這個 API': 'API endpoint not found',
  聯繫方式格式不正確: 'Invalid contact links',
  不支援的聯繫方式: 'Unsupported contact type',
  'Email 格式不正確': 'Invalid email address',
  '請輸入 LINE ID 或 line.me 的加好友網址': 'Enter a LINE ID or a line.me add-friend link',
  '個人網站必須是 http 或 https 開頭的網址': 'Website must start with http or https',
  '大頭貼不可超過 5MB': 'Avatars must be under 5 MB',
  一次只能上傳一張大頭貼: 'Upload one avatar at a time',
  '每張圖片不可超過 20MB': 'Each image must be under 20 MB',
  上傳失敗: 'Upload failed',
  伺服器發生錯誤: 'Server error',
};

const PATTERNS = [
  [/^請填寫(.+)$/, (m) => `Please enter ${(FIELDS[m[1]] ?? m[1]).toLowerCase()}`],
  [/^(.+)不可超過 (\d+) 個字$/, (m) => `${FIELDS[m[1]] ?? m[1]} must be ${m[2]} characters or fewer`],
  [/^「(.+)」不是支援的圖片格式（JPG、PNG、GIF、WebP）$/, (m) => `"${m[1]}" isn't a supported image (JPG, PNG, GIF, WebP)`],
  [/^每則分享最多 (\d+) 張截圖$/, (m) => `Up to ${m[1]} screenshots per post`],
  [/^分類最多 (\d+) 個$/, (m) => `Up to ${m[1]} categories`],
  [/^請輸入 (.+) 帳號或 (.+) 的網址$/, (m) => `Enter your ${m[1]} username or a link from ${m[2]}`],
];

export function translate(message, lang) {
  if (lang !== 'en' || typeof message !== 'string') return message;
  if (MESSAGES[message]) return MESSAGES[message];
  for (const [re, fn] of PATTERNS) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}
