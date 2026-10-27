// 網頁版：直接嵌入 YouTube 播放器，在頁面裡播放，不開新分頁。
export function YouTubePlayer({ id, size }: { id: string; size: { width: number; height: number } }) {
  return (
    <iframe
      title="YouTube"
      src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: size.width, height: size.height, border: 0, display: 'block', background: '#000' }}
    />
  );
}
