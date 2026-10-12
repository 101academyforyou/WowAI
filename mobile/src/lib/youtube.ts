// 示範影片用 YouTube 連結分享。規則與後端 server/youtube.js 一致。

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'];

export type YouTubeVideo = { id: string; url: string };

export function parseYouTube(text: string): YouTubeVideo | null {
  let value = text.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id: string | null | undefined = null;
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

export function youtubeThumbnail(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
