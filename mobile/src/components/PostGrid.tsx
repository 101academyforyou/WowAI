import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { mediaUri, type Post } from '../lib/api';
import { youtubeThumbnail } from '../lib/youtube';
import { useColors, useContentWidth } from '../lib/theme';
import { tr } from '../lib/i18n';

// 排列模式：每格出現左右移動按鈕，作品分頁還有釘選按鈕；點格子不會打開貼文
export type ArrangeHandlers = {
  onMove: (index: number, delta: number) => void;
  onTogglePin?: (post: Post) => void;
};

// IG 風格的三欄九宮格
// pinned：顯示釘選圖示（只有個人頁的「作品」分頁用）
export function PostGrid({ posts, pinned = false, arrange }: { posts: Post[]; pinned?: boolean; arrange?: ArrangeHandlers }) {
  // 用格子實際的寬度（網頁版有捲軸、邊框，視窗寬度會多算），取整數避免第三格被擠到下一行
  const fallback = useContentWidth();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? fallback;
  const c = useColors();
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);
  return (
    <View style={styles.grid} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      {posts.map((p, index) => {
        const image = p.media.find((m) => m.kind === 'image');
        const cover = image ? mediaUri(image.url) : p.youtube ? youtubeThumbnail(p.youtube.id) : null;
        const count = p.media.length + (p.youtube ? 1 : 0);
        const badge = count > 1 ? 'copy-outline' : p.youtube || p.media[0]?.kind === 'video' ? 'play' : null;
        return (
          <Pressable
            key={p.id}
            onPress={arrange ? undefined : () => router.push(`/post/${p.id}`)}
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
            {pinned && p.pinned && !arrange ? (
              <View style={styles.pin} accessibilityLabel={tr('已釘選', 'Pinned')}>
                <Ionicons name="pin" size={14} color="#fff" style={{ transform: [{ rotate: '45deg' }] }} />
              </View>
            ) : null}
            {arrange ? (
              <View style={[StyleSheet.absoluteFill, styles.arrange]}>
                {arrange.onTogglePin ? (
                  <Pressable
                    onPress={() => arrange.onTogglePin!(p)}
                    hitSlop={6}
                    style={[styles.control, styles.pinControl, p.pinned && { backgroundColor: c.accent }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: Boolean(p.pinned) }}
                    accessibilityLabel={p.pinned ? tr(`取消釘選「${p.title}」`, `Unpin "${p.title}"`) : tr(`釘選「${p.title}」`, `Pin "${p.title}"`)}
                  >
                    <Ionicons name={p.pinned ? 'pin' : 'pin-outline'} size={16} color={p.pinned ? '#000' : '#fff'} style={{ transform: [{ rotate: '45deg' }] }} />
                  </Pressable>
                ) : null}
                {/* 上下左右：上下一次跨一列（3 格），左右一次一格 */}
                {([
                  ['up', -COLUMNS, 'chevron-up', styles.up, tr('往上移', 'up')],
                  ['left', -1, 'chevron-back', styles.left, tr('往前移', 'earlier')],
                  ['right', 1, 'chevron-forward', styles.right, tr('往後移', 'later')],
                  ['down', COLUMNS, 'chevron-down', styles.down, tr('往下移', 'down')],
                ] as const).map(([key, delta, icon, position, label]) => {
                  const off = index + delta < 0 || index + delta >= posts.length;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => arrange.onMove(index, delta)}
                      disabled={off}
                      hitSlop={4}
                      style={[styles.control, styles.move, position, off && styles.disabled]}
                      accessibilityRole="button"
                      accessibilityLabel={tr(`「${p.title}」${label}`, `Move "${p.title}" ${label}`)}
                    >
                      <Ionicons name={icon} size={18} color="#fff" />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const GAP = 2;
const COLUMNS = 3;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  // 圖片只顯示在自己的格子裡
  tile: { overflow: 'hidden' },
  pin: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  arrange: { backgroundColor: 'rgba(0,0,0,0.35)', padding: 6 },
  control: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  pinControl: { alignSelf: 'flex-start' },
  move: { position: 'absolute' },
  up: { top: 6, left: '50%', marginLeft: -16 },
  down: { bottom: 6, left: '50%', marginLeft: -16 },
  left: { left: 6, top: '50%', marginTop: -16 },
  right: { right: 6, top: '50%', marginTop: -16 },
  disabled: { opacity: 0.25 },
  badge: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  videoTile: { backgroundColor: '#2a1f4a', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
  videoTitle: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
