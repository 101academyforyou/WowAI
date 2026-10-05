// GitHub 專案連結：接受 owner/repo 或 github.com 的網址，統一存成 https://github.com/owner/repo

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function parseGitHubRepo(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || /^(www\.)?github\.com\//i.test(value)) {
    let url;
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
