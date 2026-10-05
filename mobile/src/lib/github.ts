// 連動 GitHub：貼上專案（owner/repo 或網址），從 GitHub 公開 API 讀取專案資訊，自動填好分享內容。
// 規則與後端 server/github.js 一致。

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
  gemini: 'Gemini', cursor: 'Cursor', v0: 'v0', copilot: 'GitHub Copilot', 'github-copilot': 'GitHub Copilot',
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
    throw new Error('無法連線到 GitHub，請檢查網路');
  }
  if (res.status === 404) throw new Error('找不到這個 GitHub 專案，或它不是公開專案');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub 暫時限制查詢次數，請稍後再試');
  if (!res.ok) throw new Error('讀取 GitHub 專案失敗，請稍後再試');
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
