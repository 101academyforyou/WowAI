import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { fetchUserRepos, githubLoginById, type GitHubRepoSummary } from '../lib/github';
import { timeAgo } from '../lib/api';
import { fonts, useColors } from '../lib/theme';
import { Button } from './ui';
import { tr } from '../lib/i18n';

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// 從自己的 GitHub 公開專案挑一個：綁定 GitHub 登入或在「聯繫我」填了 GitHub 的人直接列出，否則先輸入帳號
export function GitHubRepoPicker({ onPick, onClose }: { onPick: (repo: GitHubRepoSummary) => void; onClose: () => void }) {
  const c = useColors();
  const { user } = useAuth();
  const [login, setLogin] = useState(user?.github?.login ?? '');
  const [loaded, setLoaded] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitHubRepoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  async function load(name: string) {
    const value = name.trim().replace(/^@/, '');
    if (!LOGIN.test(value)) return setError(tr('請輸入 GitHub 帳號名稱', 'Enter a GitHub username'));
    setLoading(true);
    setError(null);
    try {
      setRepos(await fetchUserRepos(value));
      setLoaded(value);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // 打開時：知道帳號就直接載入；只知道 GitHub 數字 ID（舊的綁定）就先查帳號名稱
  useEffect(() => {
    const account = user?.github;
    if (!account) return;
    (async () => {
      let name = account.login;
      if (!name && account.id) {
        try {
          name = await githubLoginById(account.id);
          setLogin(name);
        } catch {
          return;
        }
      }
      if (name) load(name);
    })();
    // 只在打開時自動載入一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = filter.trim().toLowerCase();
  const shown = (repos ?? []).filter((r) => !words || `${r.name} ${r.description}`.toLowerCase().includes(words));

  return (
    <View style={[styles.panel, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={styles.head}>
        <Ionicons name="logo-github" size={18} color={c.text} />
        <Text style={{ color: c.text, fontWeight: '800', fontFamily: fonts.mono, flex: 1 }}>
          {loaded ? tr(`@${loaded} 的公開專案`, `@${loaded}'s public repos`) : tr('從我的 GitHub 選擇', 'Pick from my GitHub')}
        </Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={tr('關閉', 'Close')}>
          <Ionicons name="close" size={20} color={c.muted} />
        </Pressable>
      </View>

      {!loaded || error ? (
        <>
          <View style={styles.loginRow}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={login}
              onChangeText={setLogin}
              onSubmitEditing={() => load(login)}
              placeholder={tr('你的 GitHub 帳號，例如 octocat', 'Your GitHub username, e.g. octocat')}
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={tr('GitHub 帳號', 'GitHub username')}
            />
            <Button title={tr('列出專案', 'Show repos')} onPress={() => load(login)} loading={loading} disabled={!login.trim()} />
          </View>
          {!user?.github ? (
            <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
              {tr('小技巧：在「編輯個人檔案」綁定 GitHub 登入，或在「聯繫我」填上 GitHub，下次就會自動列出。', 'Tip: connect GitHub in Edit profile, or add GitHub to your contact links, and your repos will show up automatically next time. ')}
              <Text style={{ color: c.accent, fontWeight: '700' }} onPress={() => router.push('/settings')}>{tr(' 前往設定', 'Open settings')}</Text>
            </Text>
          ) : null}
        </>
      ) : null}

      {error ? <Text style={{ color: c.notCool, fontSize: 13 }}>{error}</Text> : null}
      {loading && !repos ? <ActivityIndicator color={c.accent} style={{ marginVertical: 12 }} /> : null}

      {loaded && repos && !error ? (
        repos.length === 0 ? (
          <Text style={{ color: c.muted }}>{tr('這個帳號還沒有公開的專案。', 'No public repos on this account yet.')}</Text>
        ) : (
          <>
            {repos.length > 6 ? (
              <TextInput
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, flex: 0 }]}
                value={filter}
                onChangeText={setFilter}
                placeholder={tr('搜尋專案名稱', 'Search repos')}
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
            <View style={{ maxHeight: 320 }}>
              {shown.slice(0, 30).map((r) => (
                <Pressable
                  key={r.url}
                  onPress={() => onPick(r)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.repo, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>
                      {r.name}{r.fork ? <Text style={{ color: c.muted, fontWeight: '400', fontSize: 12 }}>{tr('  · fork', '  · fork')}</Text> : null}
                    </Text>
                    {r.description ? <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>{r.description}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {r.stars ? <Text style={{ color: c.muted, fontSize: 12, fontFamily: fonts.mono }}>★ {r.stars}</Text> : null}
                    {r.pushedAt ? <Text style={{ color: c.muted, fontSize: 11 }}>{timeAgo(r.pushedAt.replace('T', ' ').replace(/Z$/, ''))}</Text> : null}
                  </View>
                </Pressable>
              ))}
              {shown.length === 0 ? <Text style={{ color: c.muted, paddingVertical: 8 }}>{tr('沒有符合的專案', 'No matching repos')}</Text> : null}
            </View>
            <Pressable onPress={() => { setLoaded(null); setRepos(null); }} hitSlop={6}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>{tr('換一個 GitHub 帳號', 'Use a different GitHub account')}</Text>
            </Pressable>
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loginRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  repo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
