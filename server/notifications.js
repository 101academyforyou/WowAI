// 通知：存進資料庫（通知分頁），同時即時推送到 iPhone（Expo 推播）和開著的網頁（Server-Sent Events）

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

// 預設的推播送出方式：呼叫 Expo 推播服務，回傳每則訊息的結果（ticket）
export async function expoPushSender(messages) {
  const tickets = [];
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    const json = await res.json();
    tickets.push(...(json.data ?? []));
  }
  return tickets;
}

const excerpt = (text, max = 60) => (text.length > max ? `${text.slice(0, max)}…` : text);

// 通知文字在讀取時才組出來，名稱改了也會跟著更新
export function notificationText({ type, actorName, postTitle, text }) {
  switch (type) {
    case 'cool': return `${actorName} 覺得你的「${postTitle}」很 Cool ⚡`;
    case 'comment': return `${actorName} 留言：${excerpt(text)}`;
    case 'follow': return `${actorName} 開始追蹤你`;
    case 'new_post': return `${actorName} 分享了新作品「${postTitle}」`;
    default: return '';
  }
}

export function notificationLink({ type, actorUsername, postId }) {
  return type === 'follow' ? `/user/${encodeURIComponent(actorUsername)}` : `/post/${postId}`;
}

export function createNotifier({ db, pushSender = expoPushSender, log = console }) {
  const streams = new Map(); // userId → Set<res>

  const q = {
    blockedEither: db.prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    ),
    existing: db.prepare(
      'SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id IS ?',
    ),
    insert: db.prepare(
      'INSERT INTO notifications (user_id, actor_id, type, post_id, text) VALUES (?, ?, ?, ?, ?)',
    ),
    // 封鎖對象之前留下的通知不算未讀
    unread: db.prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL
         AND actor_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)`,
    ),
    actor: db.prepare('SELECT username, display_name FROM users WHERE id = ?'),
    postTitle: db.prepare('SELECT title FROM posts WHERE id = ?'),
    tokens: db.prepare('SELECT token FROM push_tokens WHERE user_id = ?'),
    deleteToken: db.prepare('DELETE FROM push_tokens WHERE token = ?'),
  };

  const unreadCount = (userId) => q.unread.get(userId, userId).n;

  function broadcast(userId) {
    const subscribers = streams.get(userId);
    if (!subscribers?.size) return;
    const payload = `event: notification\ndata: ${JSON.stringify({ unreadCount: unreadCount(userId) })}\n\n`;
    subscribers.forEach((res) => res.write(payload));
  }

  async function push(userId, { type, actorId, postId, text }) {
    const tokens = q.tokens.all(userId).map((t) => t.token);
    if (!tokens.length) return;
    const actor = q.actor.get(actorId);
    const body = notificationText({
      type,
      actorName: actor.display_name || actor.username,
      postTitle: postId ? q.postTitle.get(postId)?.title ?? '' : '',
      text,
    });
    const url = notificationLink({ type, actorUsername: actor.username, postId });
    const badge = unreadCount(userId);
    const messages = tokens.map((to) => ({ to, title: 'YourWowAI', body, sound: 'default', badge, data: { url } }));
    try {
      const tickets = await pushSender(messages);
      // App 被刪除或關掉通知的裝置，Expo 會回 DeviceNotRegistered，把 token 清掉
      tickets.forEach((ticket, i) => {
        if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') q.deleteToken.run(tokens[i]);
      });
    } catch (err) {
      log.error('推播送出失敗', err);
    }
  }

  // 建立一則通知；回傳 Promise（推播送完才 resolve），呼叫端不需要等
  function notify(userId, actorId, type, { postId = null, text = '' } = {}) {
    if (userId === actorId) return Promise.resolve();
    if (q.blockedEither.get(userId, actorId, actorId, userId)) return Promise.resolve();
    // 同一個人重複按 Cool、取消再追蹤，不重複通知
    if ((type === 'cool' || type === 'follow') && q.existing.get(userId, actorId, type, postId)) return Promise.resolve();
    q.insert.run(userId, actorId, type, postId, text);
    broadcast(userId);
    return push(userId, { type, actorId, postId, text });
  }

  function subscribe(userId, res) {
    if (!streams.has(userId)) streams.set(userId, new Set());
    streams.get(userId).add(res);
    res.write(`retry: 5000\nevent: notification\ndata: ${JSON.stringify({ unreadCount: unreadCount(userId) })}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    res.on('close', () => {
      clearInterval(ping);
      streams.get(userId)?.delete(res);
    });
  }

  return { notify, subscribe, broadcast, unreadCount };
}
