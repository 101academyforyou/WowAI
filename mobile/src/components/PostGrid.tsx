import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { mediaUri, type Post } from '../lib/api';
import { youtubeThumbnail } from '../lib/youtube';
import { useColors, useContentWidth } from '../lib/theme';
import { tr } from '../lib/i18n';

// IG 風格的三欄九宮格
// pinned：顯示釘選圖示（只有個人頁的「作品」分頁用）
export function PostGrid({ posts, pinned = false }: { posts: Post[]; pinned?: boolean }) {
  // 用格子實際的寬度（網頁版有捲軸、邊框，視窗寬度會多算），取整數避免第三格被擠到下一行
  const fallback = useContentWidth();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? fallback;
  const c = useColors();
  const size = Math.floor((width - GAP * 2) / 3);
  return (
    <View style={styles.grid} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      {posts.map((p) => {
        const image = p.media.find((m) => m.kind === 'image');
        const cover = image ? mediaUri(image.url) : p.youtube ? youtubeThumbnail(p.youtube.id) : null;
        const count = p.media.length + (p.youtube ? 1 : 0);
        const badge = count > 1 ? 'copy-outline' : p.youtube || p.media[0]?.kind === 'video' ? 'play' : null;
        return (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/post/${p.id}`)}
            style={[styles.tile, { width: size, height: size, backgroundColor: c.surface2 }]}
            accessibilityLabel={p.title}
          >
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.videoTile]}>
                <Ionicons name="videocam" size={28} color="#fff" />
                <Text style={styles.videoTitle} numberOfLines={2}>{p.title}</Text>
              </View>
            )}
            {badge ? (
              <Ionicons name={badge} size={18} color="#fff" style={styles.badge} />
            ) : null}
            {pinned && p.pinned ? (
              <View style={styles.pin} accessibilityLabel={tr('已釘選', 'Pinned')}>
                <Ionicons name="pin" size={14} color="#fff" style={{ transform: [{ rotate: '45deg' }] }} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const GAP = 2;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  // 圖片只顯示在自己的格子裡
  tile: { overflow: 'hidden' },
  pin: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  videoTile: { backgroundColor: '#2a1f4a', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
  videoTitle: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
