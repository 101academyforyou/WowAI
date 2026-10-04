import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { mediaUri, type Media } from '../lib/api';
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

export function MediaCarousel({ media, onDoubleTap }: { media: Media[]; onDoubleTap?: () => void }) {
  const width = useContentWidth();
  const c = useColors();
  const size = { width, height: Math.round(width * 1.25) };
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
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => m.url}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={64}
        renderItem={({ item, index: i }) =>
          item.kind === 'video' ? (
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
      {media.length > 1 ? (
        <>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{index + 1}/{media.length}</Text>
          </View>
          <View style={styles.dots}>
            {media.map((m, i) => (
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
  burst: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  burstBadge: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(5,7,13,0.75)' },
  burstText: { fontSize: 22, fontWeight: '900', letterSpacing: 4, fontFamily: fonts.mono },
  counter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(5,7,13,0.75)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 8 },
  dot: { width: 14, height: 3, borderRadius: 2 },
});
