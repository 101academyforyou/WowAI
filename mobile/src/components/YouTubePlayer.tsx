// iPhone：用 WebView 在 App 內播放 YouTube。
// 用 HTML 包一層 iframe 並設定 baseUrl，YouTube 才拿得到來源網址（否則 iOS 會出現「錯誤 153」無法播放）。
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from '../lib/api';

export function YouTubePlayer({ id, size }: { id: string; size: { width: number; height: number } }) {
  const origin = API_URL.startsWith('https://') ? API_URL : 'https://yourwowai.onepointzeroone.org';
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return (
    <View style={[size, styles.black]}>
      <WebView
        source={{ html, baseUrl: origin }}
        style={styles.black}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  black: { backgroundColor: '#000', flex: 1 },
});
