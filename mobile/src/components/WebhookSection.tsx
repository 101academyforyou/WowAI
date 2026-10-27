import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { api, timeAgo, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fonts, useColors } from '../lib/theme';
import { Button, confirmAction, notify } from './ui';
import { tr } from '../lib/i18n';

// 交給 AI 的一段話：AI 先 GET 網址讀說明，再 POST 發文
function aiPrompt(url: string) {
  return tr(
    `請幫我把這個作品分享到 YourWowAI。先用 GET 讀取 ${url} 的使用說明，再用 POST 把作品以 JSON 送到同一個網址：工具名稱（title）、介紹（description）、YouTube 示範影片連結（youtubeUrl）或截圖（images，base64）、試用連結（toolUrl）、GitHub 專案（githubUrl）、用到的 AI 工具（aiTools）和分類（categories）。這個網址等同我的帳號，請不要公開。`,
    `Please share this project on YourWowAI for me. First GET ${url} to read the instructions, then POST the project as JSON to the same URL: title, description, a YouTube demo link (youtubeUrl) or screenshots (images, base64), a link to try it (toolUrl), the GitHub repo (githubUrl), the AI tools used (aiTools) and categories. This URL acts as my account, so keep it private.`,
  );
}

// 編輯個人檔案 → AI Webhook：讓 Claude Code、ChatGPT、n8n、GitHub Actions 等工具代你發文
export function WebhookSection() {
  const c = useColors();
  const { user, setUser } = useAuth();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const webhook = user.webhook;

  async function copy(text: string, what: string) {
    await Clipboard.setStringAsync(text);
    notify(tr(`已複製${what}`, `${what} copied`));
  }

  async function create() {
    if (webhook?.active && !(await confirmAction(
      tr('重新產生 Webhook？', 'Regenerate webhook?'),
      tr('舊的網址會立刻失效，用到它的 AI 或自動化工具要換成新網址。', 'The old URL stops working right away. Update any AI or automation that uses it.'),
      tr('重新產生', 'Regenerate'),
    ))) return;
    setBusy(true);
    try {
      const res = await api<{ url: string; webhook: User['webhook'] }>('/api/me/webhook', { method: 'POST' });
      setFreshUrl(res.url);
      setUser({ ...user!, webhook: res.webhook });
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!(await confirmAction(
      tr('關閉 Webhook？', 'Turn off webhook?'),
      tr('網址會立刻失效，AI 就不能再代你發文。之後可以再產生新的。', "The URL stops working right away and AI can no longer post for you. You can create a new one later."),
      tr('關閉', 'Turn off'),
    ))) return;
    try {
      const res = await api<{ webhook: User['webhook'] }>('/api/me/webhook', { method: 'DELETE' });
      setFreshUrl(null);
      setUser({ ...user!, webhook: res.webhook });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <View style={[styles.section, { borderColor: c.border }]}>
      <View style={styles.titleRow}>
        <Ionicons name="git-network-outline" size={18} color={c.accent} />
        <Text style={[styles.title, { color: c.text }]}>AI Webhook</Text>
      </View>
      <Text style={{ color: c.muted, lineHeight: 20 }}>
        {tr(
          '產生一個專屬網址交給 AI（Claude Code、ChatGPT、n8n、GitHub Actions…），它就能代你分享作品或更新貼文。例如請 AI 部署完網站後，順便在 YourWowAI 發一則分享。',
          'Create a private URL and give it to an AI (Claude Code, ChatGPT, n8n, GitHub Actions…) so it can share projects or update posts for you. For example, ask your AI to post on YourWowAI right after it deploys your site.',
        )}
      </Text>

      {freshUrl ? (
        <View style={[styles.urlBox, { borderColor: c.accent, backgroundColor: c.surface }]}>
          <Text style={{ color: c.notCool, fontSize: 12, fontWeight: '700' }}>
            {tr('⚠️ 網址只會顯示這一次，請現在複製。拿到網址的人都能用你的帳號發文，不要公開。', "⚠️ This URL is shown only once, so copy it now. Anyone with it can post as you, so keep it private.")}
          </Text>
          <Text selectable style={{ color: c.text, fontFamily: fonts.mono, fontSize: 12 }}>{freshUrl}</Text>
          <View style={styles.buttons}>
            <Button title={tr('複製網址', 'Copy URL')} variant="primary" onPress={() => copy(freshUrl, tr('網址', 'URL'))} style={{ flex: 1 }} />
            <Button title={tr('複製給 AI 的指示', 'Copy AI prompt')} onPress={() => copy(aiPrompt(freshUrl), tr('給 AI 的指示', 'AI prompt'))} style={{ flex: 1 }} />
          </View>
        </View>
      ) : webhook?.active ? (
        <View style={[styles.status, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Ionicons name="checkmark-circle" size={18} color={c.cool} />
          <Text style={{ color: c.text, flex: 1 }}>
            {tr(`已啟用（結尾 …${webhook.hint}）`, `Active (ends in …${webhook.hint})`)}
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {webhook.lastUsedAt ? tr(` · 上次使用 ${timeAgo(webhook.lastUsedAt)}`, ` · last used ${timeAgo(webhook.lastUsedAt)}`) : tr(' · 還沒用過', ' · not used yet')}
            </Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.buttons}>
        <Button
          title={webhook?.active ? tr('重新產生網址', 'Regenerate URL') : tr('產生 Webhook 網址', 'Create webhook URL')}
          variant={webhook?.active ? 'secondary' : 'primary'}
          onPress={create}
          loading={busy}
          style={{ flex: 1 }}
        />
        {webhook?.active ? <Button title={tr('關閉', 'Turn off')} variant="danger" onPress={turnOff} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '700', fontFamily: fonts.mono, fontSize: 13 },
  urlBox: { gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  buttons: { flexDirection: 'row', gap: 8 },
});
