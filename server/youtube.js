// 示範影片用 YouTube 連結分享，不上傳影片檔。
// 接受 youtube.com/watch?v=…、youtu.be/…、/shorts/…、/embed/…、/live/…，統一存成 https://www.youtube.com/watch?v=ID

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'];

export function parseYouTube(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (HOSTS.includes(host)) {
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (first === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(first)) id = second;
  }
  if (!id || !ID.test(id)) return null;
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}
