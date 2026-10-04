// WowAI 前端：無需建置的單頁應用（hash 路由）
const view = document.getElementById('view');
const state = { me: null };

// ---------- 小工具 ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // 只用於本檔案內寫死的 SVG
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9.2C1.6 7.2 4 4 7.4 4c2 0 3.6 1.1 4.6 2.7C13 5.1 14.6 4 16.6 4 20 4 22.4 7.2 21 10.8 19 15.6 12 20 12 20z"/></svg>',
  comment: '<svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="fill"><path d="M7 4v16l13-8z"/></svg>',
  stack: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>',
};

function icon(name) {
  return h('span', { html: ICONS[name], style: 'display:contents' });
}

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '發生錯誤，請再試一次'), { status: res.status });
  return data;
}

let toastTimer;
function toast(message, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = error ? 'toast error' : 'toast';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

function timeAgo(sqlDate) {
  const then = new Date(`${sqlDate.replace(' ', 'T')}Z`);
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return then.toLocaleDateString('zh-TW');
}

function avatar(user, cls = '') {
  return h('span', { class: `avatar ${cls}` }, (user.displayName || user.username).slice(0, 1));
}

function requireLogin() {
  if (state.me) return true;
  location.hash = `#/login?next=${encodeURIComponent(location.hash || '#/')}`;
  return false;
}

// ---------- 貼文元件 ----------
function mediaEl(m, { thumb = false } = {}) {
  if (m.kind === 'video') {
    return thumb
      ? h('video', { src: `${m.url}#t=0.1`, muted: true, playsinline: true, preload: 'metadata' })
      : h('video', { src: m.url, controls: true, playsinline: true, preload: 'metadata', loop: true });
  }
  return h('img', { src: m.url, alt: '', loading: 'lazy' });
}

function carousel(media, onDoubleTap) {
  const track = h('div', { class: 'carousel-track' },
    media.map((m) => h('div', { class: 'carousel-item' }, mediaEl(m))));
  const wrap = h('div', { class: 'carousel' }, track);
  const parts = [wrap];

  if (media.length > 1) {
    const count = h('span', { class: 'carousel-count' }, `1/${media.length}`);
    const dots = h('div', { class: 'carousel-dots' }, media.map((_, i) => h('span', { class: i === 0 ? 'on' : '' })));
    wrap.append(count);
    parts.push(dots);
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      count.textContent = `${i + 1}/${media.length}`;
      [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j));
      track.querySelectorAll('video').forEach((v, j) => { if (j !== i) v.pause(); });
    }, { passive: true });
  }

  // 像 IG 一樣，雙擊圖片按讚
  track.addEventListener('dblclick', (e) => {
    if (e.target.tagName === 'VIDEO') return;
    wrap.append(h('div', { class: 'heart-burst', html: ICONS.heart, onanimationend: (ev) => ev.currentTarget.remove() }));
    onDoubleTap();
  });
  return parts;
}

function postCard(post, { full = false, onDeleted } = {}) {
  const likeBtn = h('button', { 'aria-label': '讚', class: post.likedByMe ? 'liked' : '' }, icon('heart'));
  const likes = h('div', { class: 'post-likes' });
  const renderLikes = () => {
    likeBtn.classList.toggle('liked', post.likedByMe);
    likes.textContent = `${post.likeCount} 個讚`;
  };
  renderLikes();

  async function setLike(like) {
    if (!requireLogin()) return;
    if (post.likedByMe === like) return;
    post.likedByMe = like;
    post.likeCount += like ? 1 : -1;
    renderLikes();
    try {
      const res = await api(`/api/posts/${post.id}/like`, { method: like ? 'POST' : 'DELETE' });
      Object.assign(post, res);
      renderLikes();
    } catch (err) {
      post.likedByMe = !like;
      post.likeCount += like ? -1 : 1;
      renderLikes();
      toast(err.message, { error: true });
    }
  }
  likeBtn.addEventListener('click', () => setLike(!post.likedByMe));

  const shareBtn = h('button', {
    'aria-label': '分享',
    onclick: async () => {
      const url = `${location.origin}/#/p/${post.id}`;
      try {
        if (navigator.share) await navigator.share({ title: post.title, url });
        else { await navigator.clipboard.writeText(url); toast('已複製連結'); }
      } catch { /* 使用者取消 */ }
    },
  }, icon('share'));

  const isMine = state.me && state.me.id === post.author.id;
  const header = h('div', { class: 'post-header' },
    h('a', { href: `#/u/${encodeURIComponent(post.author.username)}`, style: 'display:flex;gap:10px;align-items:center' },
      avatar(post.author), h('span', { class: 'name' }, post.author.username)),
    h('span', { class: 'time' }, timeAgo(post.createdAt)),
    isMine && full ? h('button', {
      class: 'btn-link', 'aria-label': '刪除貼文',
      onclick: async () => {
        if (!confirm('確定要刪除這則分享嗎？')) return;
        try {
          await api(`/api/posts/${post.id}`, { method: 'DELETE' });
          toast('已刪除');
          onDeleted?.();
        } catch (err) { toast(err.message, { error: true }); }
      },
    }, icon('trash')) : null,
  );

  const desc = post.description
    ? h('p', { class: full ? 'post-desc' : 'post-desc clamp' }, post.description)
    : null;

  return h('article', { class: 'post' },
    header,
    carousel(post.media, () => setLike(true)),
    h('div', { class: 'post-actions' },
      likeBtn,
      h('a', { href: `#/p/${post.id}`, 'aria-label': '留言', style: 'display:grid;padding:4px' }, icon('comment')),
      shareBtn,
      post.toolUrl ? h('a', { class: 'btn btn-primary try', href: post.toolUrl, target: '_blank', rel: 'noopener noreferrer nofollow' },
        icon('link'), '試用工具') : null,
    ),
    h('div', { class: 'post-body' },
      likes,
      h('h2', { class: 'post-title' }, post.title),
      desc,
      post.aiTools.length ? h('div', { class: 'chips' },
        h('span', { class: 'ai-label' }, '用 AI 打造：'),
        post.aiTools.map((t) => h('a', { class: 'chip', href: `#/explore?tag=${encodeURIComponent(t)}` }, `#${t}`))) : null,
      !full && post.commentCount
        ? h('a', { class: 'post-meta', href: `#/p/${post.id}` }, `查看全部 ${post.commentCount} 則留言`)
        : null,
    ),
  );
}

function postGrid(posts) {
  return h('div', { class: 'grid' }, posts.map((p) => {
    const first = p.media[0];
    const badge = p.media.length > 1 ? 'stack' : first.kind === 'video' ? 'play' : null;
    return h('a', { href: `#/p/${p.id}`, 'aria-label': p.title },
      mediaEl(first, { thumb: true }),
      badge ? h('span', { class: 'badge', html: ICONS[badge] }) : null);
  }));
}

// ---------- 頁面 ----------
async function homePage(params) {
  const feed = params.get('feed') === 'following' && state.me ? 'following' : 'all';
  const tabs = h('div', { class: 'segmented' },
    h('button', { class: feed === 'all' ? 'active' : '', onclick: () => { location.hash = '#/'; } }, '最新分享'),
    h('button', {
      class: feed === 'following' ? 'active' : '',
      onclick: () => { if (requireLogin()) location.hash = '#/?feed=following'; },
    }, '追蹤中'),
  );
  const list = h('div');
  const more = h('button', { class: 'btn load-more', hidden: true }, '載入更多');
  view.replaceChildren(tabs, list, more);

  let nextBefore = null;
  async function load() {
    const qs = new URLSearchParams({ feed });
    if (nextBefore) qs.set('before', nextBefore);
    const data = await api(`/api/posts?${qs}`);
    list.append(...data.posts.map((p) => postCard(p)));
    nextBefore = data.nextBefore;
    more.hidden = !nextBefore;
    if (!list.children.length) {
      list.append(h('div', { class: 'empty' },
        h('h2', {}, feed === 'following' ? '追蹤的人還沒有分享' : '還沒有人分享'),
        h('p', {}, '用 AI 做了什麼好玩的工具嗎？附上截圖或影片秀給大家看！'),
        h('a', { class: 'btn btn-primary', href: '#/new' }, '分享我的 AI 工具')));
    }
  }
  more.addEventListener('click', () => load().catch((e) => toast(e.message, { error: true })));
  await load();
}

async function explorePage(params) {
  const tag = params.get('tag') || '';
  const [{ tags }, { posts }] = await Promise.all([
    api('/api/tags'),
    api(`/api/posts?${new URLSearchParams(tag ? { tag } : {})}`),
  ]);
  view.replaceChildren(
    h('div', { class: 'page' },
      h('h1', { class: 'page-title' }, tag ? `#${tag}` : '探索 AI 工具'),
      h('div', { class: 'chips' },
        h('a', { class: `chip ${tag ? '' : 'active'}`, href: '#/explore' }, '全部'),
        tags.map((t) => h('a', {
          class: `chip ${t.name.toLowerCase() === tag.toLowerCase() ? 'active' : ''}`,
          href: `#/explore?tag=${encodeURIComponent(t.name)}`,
        }, `#${t.name} · ${t.count}`)))),
    posts.length ? postGrid(posts) : h('div', { class: 'empty' }, h('p', {}, '這個分類還沒有作品')),
  );
}

async function postPage(id) {
  const [{ post }, { comments }] = await Promise.all([
    api(`/api/posts/${id}`),
    api(`/api/posts/${id}/comments`),
  ]);
  const list = h('div', { class: 'comments' });
  const renderComment = (c) => h('div', { class: 'comment' }, avatar(c.author),
    h('p', {}, h('a', { href: `#/u/${encodeURIComponent(c.author.username)}` }, h('b', {}, c.author.username)), c.body));
  list.append(...comments.map(renderComment));

  const input = h('input', { class: 'input', placeholder: state.me ? '留言給作者…' : '登入後即可留言', maxlength: 1000 });
  const form = h('form', {
    class: 'comment-form',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!requireLogin()) return;
      const body = input.value.trim();
      if (!body) return;
      try {
        const { comment } = await api(`/api/posts/${id}/comments`, { method: 'POST', body: { body } });
        list.append(renderComment(comment));
        input.value = '';
      } catch (err) { toast(err.message, { error: true }); }
    },
  }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, '發佈'));

  view.replaceChildren(
    postCard(post, { full: true, onDeleted: () => { location.hash = '#/me'; } }),
    list,
    form,
  );
}

async function profilePage(username) {
  const { user, posts } = await api(`/api/users/${encodeURIComponent(username)}`);
  const isMe = state.me && state.me.id === user.id;
  const followers = h('b', {}, user.followerCount);

  let actions;
  if (isMe) {
    actions = h('div', { class: 'profile-actions' },
      h('a', { class: 'btn', href: '#/settings' }, '編輯個人檔案'),
      h('button', {
        class: 'btn',
        onclick: async () => {
          await api('/api/auth/logout', { method: 'POST' });
          state.me = null;
          location.hash = '#/';
        },
      }, '登出'));
  } else {
    const followBtn = h('button', { class: 'btn' });
    const render = () => {
      followBtn.textContent = user.followedByMe ? '追蹤中' : '追蹤';
      followBtn.className = user.followedByMe ? 'btn' : 'btn btn-primary';
      followers.textContent = user.followerCount;
    };
    followBtn.addEventListener('click', async () => {
      if (!requireLogin()) return;
      try {
        const res = await api(`/api/users/${encodeURIComponent(user.username)}/follow`, {
          method: user.followedByMe ? 'DELETE' : 'POST',
        });
        user.followerCount += res.followedByMe ? 1 : -1;
        user.followedByMe = res.followedByMe;
        render();
      } catch (err) { toast(err.message, { error: true }); }
    });
    render();
    actions = h('div', { class: 'profile-actions' }, followBtn);
  }

  view.replaceChildren(
    h('div', { class: 'profile-head' },
      avatar(user, 'lg'),
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, user.postCount), h('span', {}, '作品')),
        h('div', {}, followers, h('span', {}, '粉絲')),
        h('div', {}, h('b', {}, user.followingCount), h('span', {}, '追蹤中')))),
    h('div', { class: 'profile-info' },
      h('h1', {}, user.displayName),
      h('div', { class: 'handle' }, `@${user.username}`),
      user.bio ? h('p', {}, user.bio) : null),
    actions,
    posts.length ? postGrid(posts) : h('div', { class: 'empty' },
      h('p', {}, isMe ? '你還沒有分享任何 AI 工具' : '還沒有作品'),
      isMe ? h('a', { class: 'btn btn-primary', href: '#/new' }, '分享第一個作品') : null),
  );
}

async function settingsPage() {
  if (!requireLogin()) return;
  const { user } = await api(`/api/users/${encodeURIComponent(state.me.username)}`);
  const displayName = h('input', { class: 'input', value: user.displayName, maxlength: 50, required: true });
  const bio = h('textarea', { class: 'input', maxlength: 300, placeholder: '介紹一下你自己、擅長用哪些 AI 工具…' });
  bio.value = user.bio;
  view.replaceChildren(h('form', {
    class: 'page',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const res = await api('/api/me', { method: 'PATCH', body: { displayName: displayName.value, bio: bio.value } });
        state.me = res.user;
        toast('已更新');
        location.hash = '#/me';
      } catch (err) { toast(err.message, { error: true }); }
    },
  },
  h('h1', { class: 'page-title' }, '編輯個人檔案'),
  h('div', { class: 'field' }, h('label', {}, '名稱'), displayName),
  h('div', { class: 'field' }, h('label', {}, '自我介紹'), bio),
  h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, '儲存')));
}

function newPostPage() {
  if (!requireLogin()) return;
  const MAX = 10;
  const files = [];

  const fileInput = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
  const previews = h('div', { class: 'previews' });
  const requirement = h('div', { class: 'media-required' });
  const title = h('input', { class: 'input', name: 'title', maxlength: 80, required: true, placeholder: '例如：AI 自動記帳小幫手' });
  const description = h('textarea', { class: 'input', name: 'description', maxlength: 2000, placeholder: '這個工具能做什麼？你是怎麼用 AI 做出來的？' });
  const toolUrl = h('input', { class: 'input', name: 'toolUrl', type: 'url', placeholder: 'https://…' });
  const aiTools = h('input', { class: 'input', name: 'aiTools', placeholder: 'Claude, Cursor, v0' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, '分享');
  const progress = h('div', { class: 'progress', hidden: true }, h('div'));

  const picker = h('label', { class: 'media-picker', tabindex: 0 },
    icon('upload'),
    h('strong', {}, '上傳截圖或示範影片'),
    h('span', {}, `必填 · 最多 ${MAX} 個 · 圖片或影片（每個 100MB 內）`),
    fileInput);

  function refresh() {
    previews.replaceChildren(...files.map((f, i) => {
      const url = URL.createObjectURL(f);
      const isVideo = f.type.startsWith('video/');
      return h('div', { class: 'preview' },
        isVideo ? h('video', { src: url, muted: true, playsinline: true }) : h('img', { src: url, alt: '' }),
        h('span', { class: 'kind' }, isVideo ? '影片' : `圖片 ${i + 1}`),
        h('button', { type: 'button', 'aria-label': '移除', onclick: () => { files.splice(i, 1); refresh(); } }, '×'));
    }));
    const ok = files.length > 0;
    requirement.textContent = ok ? `✓ 已選擇 ${files.length} 個檔案` : '＊分享時一定要附上至少一張截圖或一段影片';
    requirement.classList.toggle('ok', ok);
    submit.disabled = !ok;
  }

  function addFiles(list) {
    for (const f of list) {
      if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
        toast(`「${f.name}」不是圖片或影片`, { error: true });
        continue;
      }
      if (f.size > 100 * 1024 * 1024) {
        toast(`「${f.name}」超過 100MB`, { error: true });
        continue;
      }
      if (files.length >= MAX) {
        toast(`最多 ${MAX} 個檔案`, { error: true });
        break;
      }
      files.push(f);
    }
    refresh();
  }

  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  picker.addEventListener('dragover', (e) => { e.preventDefault(); picker.classList.add('dragover'); });
  picker.addEventListener('dragleave', () => picker.classList.remove('dragover'));
  picker.addEventListener('drop', (e) => { e.preventDefault(); picker.classList.remove('dragover'); addFiles(e.dataTransfer.files); });

  const form = h('form', {
    class: 'page',
    onsubmit: (e) => {
      e.preventDefault();
      if (!files.length) {
        toast('請先附上截圖或影片', { error: true });
        return;
      }
      const data = new FormData();
      data.append('title', title.value);
      data.append('description', description.value);
      data.append('toolUrl', toolUrl.value);
      data.append('aiTools', aiTools.value);
      files.forEach((f) => data.append('media', f, f.name));

      // 用 XHR 才能顯示上傳進度（影片可能很大）
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/posts');
      submit.disabled = true;
      submit.textContent = '上傳中…';
      progress.hidden = false;
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) progress.firstChild.style.width = `${(ev.loaded / ev.total) * 100}%`;
      };
      xhr.onloadend = () => {
        let res = {};
        try { res = JSON.parse(xhr.responseText); } catch { /* 非 JSON 回應 */ }
        if (xhr.status === 201) {
          toast('分享成功！');
          location.hash = `#/p/${res.post.id}`;
          return;
        }
        toast(res.error || '上傳失敗，請再試一次', { error: true });
        submit.disabled = false;
        submit.textContent = '分享';
        progress.hidden = true;
        progress.firstChild.style.width = '0';
      };
      xhr.send(data);
    },
  },
  h('h1', { class: 'page-title' }, '分享你的 AI 工具'),
  picker,
  requirement,
  previews,
  h('div', { class: 'field' }, h('label', {}, '工具名稱 *'), title),
  h('div', { class: 'field' }, h('label', {}, '介紹'), description),
  h('div', { class: 'field' }, h('label', {}, '工具連結'), toolUrl, h('small', {}, '讓大家可以直接試用（選填）')),
  h('div', { class: 'field' }, h('label', {}, '用了哪些 AI 開發'), aiTools, h('small', {}, '用逗號分隔，最多 10 個')),
  progress,
  submit);

  refresh();
  view.replaceChildren(form);
}

function loginPage(params) {
  if (state.me) { location.hash = '#/'; return; }
  let mode = 'login';
  const next = params.get('next') || '#/';
  const username = h('input', { class: 'input', autocomplete: 'username', required: true, placeholder: '帳號' });
  const displayName = h('input', { class: 'input', maxlength: 50, placeholder: '顯示名稱（選填）' });
  const password = h('input', { class: 'input', type: 'password', required: true, placeholder: '密碼' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' });
  const nameField = h('div', { class: 'field' }, displayName);
  const switchText = h('span');
  const switchBtn = h('button', { type: 'button' });

  function render() {
    const reg = mode === 'register';
    submit.textContent = reg ? '註冊' : '登入';
    nameField.hidden = !reg;
    password.autocomplete = reg ? 'new-password' : 'current-password';
    password.placeholder = reg ? '密碼（至少 8 個字元）' : '密碼';
    switchText.textContent = reg ? '已經有帳號了？' : '還沒有帳號？';
    switchBtn.textContent = reg ? '登入' : '註冊';
  }
  switchBtn.addEventListener('click', () => { mode = mode === 'login' ? 'register' : 'login'; render(); });

  const form = h('form', {
    class: 'auth',
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const { user } = await api(`/api/auth/${mode}`, {
          method: 'POST',
          body: { username: username.value.trim(), password: password.value, displayName: displayName.value },
        });
        state.me = user;
        location.hash = next;
      } catch (err) {
        toast(err.message, { error: true });
      } finally {
        submit.disabled = false;
      }
    },
  },
  h('span', { class: 'logo' }, 'Wow', h('span', {}, 'AI')),
  h('p', { class: 'tagline' }, '分享你用 AI 打造的工具'),
  h('div', { class: 'field' }, username),
  nameField,
  h('div', { class: 'field' }, password),
  submit,
  h('p', { class: 'switch' }, switchText, switchBtn));

  render();
  view.replaceChildren(form);
}

// ---------- 路由 ----------
function setActiveTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  const actions = document.getElementById('topbar-actions');
  actions.replaceChildren(state.me ? '' : h('a', { class: 'btn', href: '#/login' }, '登入'));
}

async function route() {
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);

  try {
    switch (parts[0]) {
      case undefined: setActiveTab('home'); await homePage(params); break;
      case 'explore': setActiveTab('explore'); await explorePage(params); break;
      case 'new': setActiveTab('new'); newPostPage(); break;
      case 'p': setActiveTab(''); await postPage(parts[1]); break;
      case 'u': setActiveTab(state.me?.username === parts[1] ? 'me' : ''); await profilePage(parts[1]); break;
      case 'me':
        if (requireLogin()) location.hash = `#/u/${encodeURIComponent(state.me.username)}`;
        break;
      case 'settings': setActiveTab('me'); await settingsPage(); break;
      case 'login': setActiveTab(''); loginPage(params); break;
      default: view.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, '找不到頁面')));
    }
  } catch (err) {
    view.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, '糟糕'), h('p', {}, err.message)));
  }
}

window.addEventListener('hashchange', route);
api('/api/me').then(({ user }) => { state.me = user; }).catch(() => {}).finally(route);
