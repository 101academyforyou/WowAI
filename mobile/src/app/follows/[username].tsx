import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, type User } from '../../lib/api';
import { fonts, useColors } from '../../lib/theme';
import { Avatar, Empty, Loading } from '../../components/ui';
import { tr } from '../../lib/i18n';

// 粉絲／追蹤中名單：點一個人進他的個人頁
export default function FollowsScreen() {
  const c = useColors();
  const { username, type: rawType } = useLocalSearchParams<{ username: string; type?: string }>();
  const type = rawType === 'following' ? 'following' : 'followers';
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: User[] }>(`/api/users/${encodeURIComponent(username)}/${type}`)).users);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [username, type]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const title = type === 'followers' ? tr('粉絲', 'Followers') : tr('追蹤中', 'Following');
  return (
    <>
      <Stack.Screen options={{ title: `${title} · @${username}` }} />
      {error && !users ? (
        <Empty title={tr('糟糕', 'Oops')} message={error} />
      ) : !users ? (
        <Loading />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={
            <Empty message={type === 'followers' ? tr('還沒有人追蹤', 'No followers yet') : tr('還沒有追蹤任何人', 'Not following anyone yet')} />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/user/${item.username}`)}
              style={({ pressed }) => [styles.row, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="link"
              accessibilityLabel={`${item.displayName} @${item.username}`}
            >
              <Avatar user={item} size={44} />
              <View style={styles.names}>
                <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.displayName}</Text>
                <Text style={{ color: c.muted, fontFamily: fonts.mono }} numberOfLines={1}>@{item.username}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  names: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700' },
});
