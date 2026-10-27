// 連動 GitHub：貼上專案（owner/repo 或網址），從 GitHub 公開 API 讀取專案資訊，自動填好分享內容。
// 規則與後端 server/github.js 一致。

import { tr } from './i18n';

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export type GitHubRepoRef = { owner: string; repo: string; url: string };

export function parseGitHubRepo(text: string): GitHubRepoRef | null {
  let value = text.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || /^(www\.)?github\.com\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return null;
    }
    if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'github.com') return null;
    value = url.pathname.replace(/^\/+/, '');
  }
  const [owner, rawRepo] = value.split('/');
  const repo = rawRepo?.replace(/\.git$/i, '');
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

// https://github.com/amy/ai-ledger → amy/ai-ledger
export function repoName(url: string) {
  return parseGitHubRepo(url)?.url.replace('https://github.com/', '') ?? url;
}

export type GitHubRepo = {
  url: string;
  name: string;
  description: string;
  homepage: string;
  topics: string[];
};

// AI 工具常見的 topic → 顯示名稱，匯入時自動帶進「用了哪些 AI 開發」
const AI_TOPICS: Record<string, string> = {
  claude: 'Claude', 'claude-code': 'Claude Code', anthropic: 'Claude',
  openai: 'OpenAI', chatgpt: 'ChatGPT', gpt: 'ChatGPT', 'gpt-4': 'ChatGPT', codex: 'Codex',
  gemini: 'Gemini', grok: 'Grok', xai: 'Grok', cursor: 'Cursor', v0: 'v0', copilot: 'GitHub Copilot', 'github-copilot': 'GitHub Copilot',
  bolt: 'Bolt', lovable: 'Lovable', replit: 'Replit', windsurf: 'Windsurf', llama: 'Llama', mistral: 'Mistral',
};

export function aiToolsFromTopics(topics: string[]) {
  return [...new Set(topics.map((t) => AI_TOPICS[t.toLowerCase()]).filter(Boolean))];
}

export async function fetchGitHubRepo(ref: GitHubRepoRef): Promise<GitHubRepo> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch {
    throw new Error(tr('無法連線到 GitHub，請檢查網路', "Can't reach GitHub. Check your connection."));
  }
  if (res.status === 404) throw new Error(tr('找不到這個 GitHub 專案，或它不是公開專案', "That GitHub repo doesn't exist or isn't public."));
  if (res.status === 403 || res.status === 429) throw new Error(tr('GitHub 暫時限制查詢次數，請稍後再試', 'GitHub is rate-limiting requests. Try again in a bit.'));
  if (!res.ok) throw new Error(tr('讀取 GitHub 專案失敗，請稍後再試', "Couldn't read that GitHub repo. Try again later."));
  const data = await res.json();
  const homepage = typeof data.homepage === 'string' && /^https?:\/\//i.test(data.homepage) ? data.homepage : '';
  return {
    url: typeof data.html_url === 'string' ? data.html_url : ref.url,
    name: String(data.name ?? ref.repo),
    description: typeof data.description === 'string' ? data.description : '',
    homepage,
    topics: Array.isArray(data.topics) ? data.topics.filter((t: unknown) => typeof t === 'string') : [],
  };
}

// 自己 GitHub 上的公開專案（分享時從清單挑選）
export type GitHubRepoSummary = GitHubRepo & { fullName: string; stars: number; fork: boolean; pushedAt: string };

async function githubGet(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new Error(tr('無法連線到 GitHub，請檢查網路', "Can't reach GitHub. Check your connection."));
  }
  if (res.status === 404) throw new Error(tr('找不到這個 GitHub 帳號', "That GitHub account doesn't exist."));
  if (res.status === 403 || res.status === 429) throw new Error(tr('GitHub 暫時限制查詢次數，請稍後再試', 'GitHub is rate-limiting requests. Try again in a bit.'));
  if (!res.ok) throw new Error(tr('讀取 GitHub 失敗，請稍後再試', "Couldn't read from GitHub. Try again later."));
  return res.json();
}

// 只知道 GitHub 數字 ID 時，查出帳號名稱
export async function githubLoginById(id: string): Promise<string> {
  const data = await githubGet(`https://api.github.com/user/${encodeURIComponent(id)}`);
  return String(data.login ?? '');
}

export async function fetchUserRepos(login: string): Promise<GitHubRepoSummary[]> {
  const data = await githubGet(`https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`);
  if (!Array.isArray(data)) return [];
  return data
    .filter((r) => r && typeof r.html_url === 'string' && !r.private)
    .map((r) => ({
      url: r.html_url,
      fullName: String(r.full_name ?? ''),
      name: String(r.name ?? ''),
      description: typeof r.description === 'string' ? r.description : '',
      homepage: typeof r.homepage === 'string' && /^https?:\/\//i.test(r.homepage) ? r.homepage : '',
      topics: Array.isArray(r.topics) ? r.topics.filter((t: unknown) => typeof t === 'string') : [],
      stars: Number(r.stargazers_count) || 0,
      fork: Boolean(r.fork),
      pushedAt: String(r.pushed_at ?? ''),
    }))
    // 自己的專案在前、fork 在後；同一類照最近更新排序（GitHub 已排好）
    .sort((a, b) => Number(a.fork) - Number(b.fork));
}
