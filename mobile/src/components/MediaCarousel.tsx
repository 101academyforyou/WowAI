import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { mediaUri, type Media } from '../lib/api';
import { youtubeThumbnail } from '../lib/youtube';
import { fonts, glow, useColors, useContentWidth } from '../lib/theme';

function VideoItem({ uri, active, size }: { uri: string; active: boolean; size: { width: number; height: number } }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  // 滑到別張時暫停
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  return <VideoView player={player} style={size} contentFit="contain" nativeControls />;
}

type Slide = Media | { kind: 'youtube'; url: string; id: string };

// 示範影片：顯示 YouTube 縮圖，點一下到 YouTube 觀看
function YouTubeItem({ id, url, size, fill }: { id: string; url: string; size: { width: number; height: number }; fill: boolean }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)} style={[size, styles.black]} accessibilityRole="link" accessibilityLabel="在 YouTube 觀看示範影片">
      <Image source={{ uri: youtubeThumbnail(id) }} style={size} contentFit={fill ? 'cover' : 'contain'} transition={150} />
      <View style={[StyleSheet.absoluteFill, styles.youtubeShade]}>
        <View style={styles.youtubePlay}>
          <Ionicons name="play" size={34} color="#fff" style={{ marginLeft: 4 }} />
        </View>
        <View style={styles.youtubeLabel}>
          <Ionicons name="logo-youtube" size={16} color="#fff" />
          <Text style={styles.youtubeText}>在 YouTube 觀看示範影片</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function MediaCarousel({ media, youtube, onDoubleTap }: { media: Media[]; youtube?: { id: string; url: string } | null; onDoubleTap?: () => void }) {
  const slides: Slide[] = youtube ? [{ kind: 'youtube', ...youtube }, ...media] : media;
  const width = useContentWidth();
  const c = useColors();
  // 只有 YouTube 影片時用 16:9（縮圖 hqdefault 是 4:3 含黑邊，cover 剛好裁掉黑邊）
  const onlyYouTube = media.length === 0 && !!youtube;
  const size = { width, height: Math.round(onlyYouTube ? width * 0.5625 : width * 1.25) };
  const [index, setIndex] = useState(0);
  const lastTap = useRef(0);
  const [burst] = useState(() => new Animated.Value(0));

  // 雙擊圖片 = Cool
  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap?.();
      burst.setValue(0);
      Animated.sequence([
        Animated.spring(burst, { toValue: 1, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 0, duration: 300, delay: 300, useNativeDriver: true }),
      ]).start();
    }
    lastTap.current = now;
  }

  return (
    <View>
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => m.url}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={64}
        renderItem={({ item, index: i }) =>
          item.kind === 'youtube' ? (
            <YouTubeItem id={item.id} url={item.url} size={size} fill={onlyYouTube} />
          ) : item.kind === 'video' ? (
            <View style={[size, styles.black]}>
              <VideoItem uri={mediaUri(item.url)} active={i === index} size={size} />
            </View>
          ) : (
            <Pressable onPress={handleTap} style={[size, styles.black]}>
              <Image source={{ uri: mediaUri(item.url) }} style={size} contentFit="contain" transition={150} />
            </Pressable>
          )
        }
      />
      <Animated.View pointerEvents="none" style={[styles.burst, { opacity: burst, transform: [{ scale: burst }] }]}>
        <View style={[styles.burstBadge, { borderColor: c.cool }, glow(c.cool, 24)]}>
          <Ionicons name="flash" size={64} color={c.cool} />
          <Text style={[styles.burstText, { color: c.cool }]}>COOL</Text>
        </View>
      </Animated.View>
      {slides.length > 1 ? (
        <>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{index + 1}/{slides.length}</Text>
          </View>
          <View style={styles.dots}>
            {slides.map((m, i) => (
              <View key={m.url} style={[styles.dot, { backgroundColor: i === index ? c.accent : c.border }]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  black: { backgroundColor: '#000' },
  youtubeShade: { backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  youtubePlay: { width: 76, height: 54, borderRadius: 14, backgroundColor: '#ff0033', alignItems: 'center', justifyContent: 'center' },
  youtubeLabel: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(5,7,13,0.75)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  youtubeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  burst: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  burstBadge: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(5,7,13,0.75)' },
  burstText: { fontSize: 22, fontWeight: '900', letterSpacing: 4, fontFamily: fonts.mono },
  counter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(5,7,13,0.75)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 8 },
  dot: { width: 14, height: 3, borderRadius: 2 },
});
