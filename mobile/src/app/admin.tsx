import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { REPORT_REASONS, api, mediaUri, timeAgo, type Post, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fonts, useColors } from '../lib/theme';
import { youtubeThumbnail } from '../lib/youtube';
import { Avatar, Button, Empty, Loading, confirmAction, notify } from '../components/ui';
import { tr } from '../lib/i18n';

type Report = {
  post: Post;
  reportCount: number;
  lastReportedAt: string;
  reasons: { reason: string; count: number }[];
  hidden: boolean;
  authorBanned: boolean;
};
type BannedUser = User & { bannedAt: string };

const reasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value;

// 管理員：處理檢舉（恢復、隱藏、刪除貼文）與停權帳號
export default function AdminScreen() {
  const c = useColors();
  const { user } = useAuth();
  const [data, setData] = useState<{ reports: Report[]; banned: BannedUser[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api('/api/admin/reports'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  if (!user?.isAdmin) return <Empty title={tr('需要管理員權限', 'Admins only')} />;
  if (error && !data) return <Empty title={tr('糟糕', 'Oops')} message={error} />;
  if (!data) return <Loading />;

  // 執行一個管理動作，完成後重新載入清單
  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await action();
      await load();
      notify(done);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const restore = (r: Report) => run(`restore-${r.post.id}`, () => api(`/api/admin/posts/${r.post.id}/restore`, { method: 'POST' }), tr('已恢復，檢舉紀錄已清除', 'Restored and reports cleared'));
  const hide = (r: Report) => run(`hide-${r.post.id}`, () => api(`/api/admin/posts/${r.post.id}/hide`, { method: 'POST' }), tr('已隱藏', 'Hidden'));
  async function remove(r: Report) {
    if (!(await confirmAction(tr(`刪除「${r.post.title}」？`, `Delete "${r.post.title}"?`), tr('貼文、截圖和留言都會永久刪除。', 'The post, screenshots and comments are permanently deleted.'), tr('刪除', 'Delete')))) return;
    run(`delete-${r.post.id}`, () => api(`/api/posts/${r.post.id}`, { method: 'DELETE' }), tr('已刪除', 'Deleted'));
  }
  async function ban(username: string) {
    if (!(await confirmAction(tr(`停權 @${username}？`, `Suspend @${username}?`), tr('對方會被登出、不能再登入，貼文和留言對其他人隱藏。之後可以解除。', "They're signed out and can't sign in, and their posts and comments are hidden. You can undo this later."), tr('停權', 'Suspend')))) return;
    run(`ban-${username}`, () => api(`/api/admin/users/${encodeURIComponent(username)}/ban`, { method: 'POST' }), tr(`已停權 @${username}`, `Suspended @${username}`));
  }
  const unban = (username: string) => run(`unban-${username}`, () => api(`/api/admin/users/${encodeURIComponent(username)}/ban`, { method: 'DELETE' }), tr(`已解除 @${username} 的停權`, `Unsuspended @${username}`));

  const pending = data.reports.filter((r) => r.hidden).length;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={[styles.heading, { color: c.text }]}>{tr(`被檢舉的貼文（${data.reports.length}）`, `Reported posts (${data.reports.length})`)}</Text>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
        {tr(`被 3 人檢舉會自動隱藏，目前 ${pending} 則已隱藏。恢復＝檢舉不成立；隱藏＝先下架；刪除＝永久移除。`, `Posts reported by 3 people are hidden automatically (${pending} hidden now). Restore = reports dismissed; Hide = take it down; Delete = remove for good.`)}
      </Text>
      {data.reports.length === 0 ? <Text style={{ color: c.muted, paddingVertical: 12 }}>{tr('目前沒有檢舉 🎉', 'No reports right now 🎉')}</Text> : null}
      {data.reports.map((r) => {
        const image = r.post.media.find((m) => m.kind === 'image');
        const cover = image ? mediaUri(image.url) : r.post.youtube ? youtubeThumbnail(r.post.youtube.id) : null;
        return (
          <View key={r.post.id} style={[styles.card, { borderColor: r.hidden ? c.notCool : c.border, backgroundColor: c.surface }]}>
            <Pressable style={styles.row} onPress={() => router.push(`/post/${r.post.id}`)} accessibilityRole="link">
              <View style={[styles.thumb, { backgroundColor: c.surface2 }]}>
                {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: c.text, fontWeight: '800' }} numberOfLines={2}>{r.post.title}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  @{r.post.author.username}{r.authorBanned ? tr('（已停權）', ' (suspended)') : ''} · {tr(`最近檢舉 ${timeAgo(r.lastReportedAt)}`, `last reported ${timeAgo(r.lastReportedAt)}`)}
                </Text>
                <Text style={{ color: r.hidden ? c.notCool : c.accent, fontSize: 12, fontWeight: '800', fontFamily: fonts.mono }}>
                  {r.hidden ? tr('● 已隱藏', '● Hidden') : tr('● 顯示中', '● Visible')} · {tr(`${r.reportCount} 次檢舉`, `${r.reportCount} report${r.reportCount === 1 ? '' : 's'}`)}
                </Text>
              </View>
            </Pressable>
            <View style={styles.reasons}>
              {r.reasons.map((x) => (
                <Text key={x.reason} style={[styles.reason, { color: c.text, borderColor: c.border }]}>{reasonLabel(x.reason)} ×{x.count}</Text>
              ))}
            </View>
            <View style={styles.actions}>
              <Button title={tr('恢復', 'Restore')} onPress={() => restore(r)} loading={busy === `restore-${r.post.id}`} disabled={busy !== null} style={styles.action} />
              {!r.hidden ? <Button title={tr('隱藏', 'Hide')} onPress={() => hide(r)} loading={busy === `hide-${r.post.id}`} disabled={busy !== null} style={styles.action} /> : null}
              <Button title={tr('刪除貼文', 'Delete post')} variant="danger" onPress={() => remove(r)} loading={busy === `delete-${r.post.id}`} disabled={busy !== null} style={styles.action} />
              {r.authorBanned ? (
                <Button title={tr('解除停權', 'Unsuspend')} onPress={() => unban(r.post.author.username)} disabled={busy !== null} style={styles.action} />
              ) : r.post.author.id !== user.id ? (
                <Button title={tr('停權作者', 'Suspend author')} variant="danger" onPress={() => ban(r.post.author.username)} loading={busy === `ban-${r.post.author.username}`} disabled={busy !== null} style={styles.action} />
              ) : null}
            </View>
          </View>
        );
      })}

      <Text style={[styles.heading, { color: c.text, marginTop: 20 }]}>{tr(`已停權的帳號（${data.banned.length}）`, `Suspended accounts (${data.banned.length})`)}</Text>
      {data.banned.length === 0 ? <Text style={{ color: c.muted, paddingVertical: 8 }}>{tr('沒有停權的帳號', 'No suspended accounts')}</Text> : null}
      {data.banned.map((u) => (
        <View key={u.id} style={[styles.card, styles.row, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Avatar user={u} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>@{u.username}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{tr(`停權於 ${timeAgo(u.bannedAt)}`, `suspended ${timeAgo(u.bannedAt)}`)}</Text>
          </View>
          <Button title={tr('解除停權', 'Unsuspend')} onPress={() => unban(u.username)} loading={busy === `unban-${u.username}`} disabled={busy !== null} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 14, gap: 10, paddingBottom: 40 },
  heading: { fontSize: 16, fontWeight: '800', fontFamily: fonts.mono },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden' },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { fontSize: 12, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 36, paddingHorizontal: 12 },
});
