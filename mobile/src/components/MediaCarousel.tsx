import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { mediaUri, type Media } from '../lib/api';
import { useColors } from '../lib/theme';

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
  const { width } = useWindowDimensions();
  const c = useColors();
  const size = { width, height: Math.round(width * 1.25) };
  const [index, setIndex] = useState(0);
  const lastTap = useRef(0);
  const [heart] = useState(() => new Animated.Value(0));

  // 像 IG 一樣雙擊圖片按讚
  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap?.();
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, { toValue: 1, useNativeDriver: true }),
        Animated.timing(heart, { toValue: 0, duration: 300, delay: 300, useNativeDriver: true }),
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
      <Animated.View pointerEvents="none" style={[styles.heart, { opacity: heart, transform: [{ scale: heart }] }]}>
        <Ionicons name="heart" size={96} color="#fff" />
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
  heart: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
