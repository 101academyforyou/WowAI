import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { mediaUri, type Post } from '../lib/api';
import { useColors, useContentWidth } from '../lib/theme';

// IG 風格的三欄九宮格
export function PostGrid({ posts }: { posts: Post[] }) {
  const width = useContentWidth();
  const c = useColors();
  const size = (width - 4) / 3;
  return (
    <View style={styles.grid}>
      {posts.map((p) => {
        const image = p.media.find((m) => m.kind === 'image');
        const badge = p.media.length > 1 ? 'copy-outline' : p.media[0].kind === 'video' ? 'play' : null;
        return (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/post/${p.id}`)}
            style={{ width: size, height: size, backgroundColor: c.surface2 }}
            accessibilityLabel={p.title}
          >
            {image ? (
              <Image source={{ uri: mediaUri(image.url) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.videoTile]}>
                <Ionicons name="videocam" size={28} color="#fff" />
                <Text style={styles.videoTitle} numberOfLines={2}>{p.title}</Text>
              </View>
            )}
            {badge ? (
              <Ionicons name={badge} size={18} color="#fff" style={styles.badge} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  badge: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  videoTile: { backgroundColor: '#2a1f4a', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
  videoTitle: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
