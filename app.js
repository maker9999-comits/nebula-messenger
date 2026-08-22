/* ============================================================
   Nebula Messenger — app.js (v2)
   ============================================================ */

let ME = { id: 'me', name: 'Гость', color: ['#6C5CE7', '#8E7BFF'] };
let state = null;
let currentUser = null;

const ACCOUNTS_KEY = 'nebula_accounts_v2';
const SESSION_KEY = 'nebula_session_v2';
const STATE_PREFIX = 'nebula_state_v2_';
const DELETED_USERS_KEY = 'nebula_deleted_users_v1';
function deletedUsers() {
  try { return JSON.parse(localStorage.getItem(DELETED_USERS_KEY)) || []; } catch (e) { return []; }
}
function markUserDeleted(username) {
  const list = deletedUsers();
  if (!list.includes(username)) { list.push(username); safeSet(DELETED_USERS_KEY, JSON.stringify(list)); }
}
/* Можно ли добавить облачного пользователя в локальную базу:
   не совпадает ли юзернейм, не удалён ли он, и нет ли уже аккаунта с такой почтой */
function cloudMergeUserOk(local, u, uname) {
  if (local.users[uname]) return false;
  if (deletedUsers().includes(uname)) return false;
  if (u && u.email && Object.values(local.users).some(x => x && x.email && String(x.email).toLowerCase() === String(u.email).toLowerCase())) return false;
  return true;
}
/* Синхронизация списка удалённых аккаунтов: другие устройства тоже
   перестают видеть удалённого пользователя */
function applyDeletedFromCloud(delList) {
  if (!Array.isArray(delList) || !delList.length) return false;
  const localDel = deletedUsers();
  let changed = false;
  delList.forEach(u => { if (!localDel.includes(u)) { localDel.push(u); changed = true; } });
  if (changed) safeSet(DELETED_USERS_KEY, JSON.stringify(localDel));
  const d = loadAccounts();
  let removed = false;
  localDel.forEach(u => {
    if (d.users[u]) { delete d.users[u]; removed = true; }
    try { localStorage.removeItem(stateKey(u)); } catch (e) {}
  });
  if (removed) saveAccounts(d);
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    const before = s.chats.length;
    s.chats = s.chats.filter(c => {
      if (c.type === 'private') return !localDel.includes(c.userId);
      c.members = (c.members || []).filter(m => !localDel.includes(m));
      c.admins = (c.admins || []).filter(m => !localDel.includes(m));
      if (c.owner && localDel.includes(c.owner)) c.owner = c.members.includes('me') ? 'me' : (c.members[0] || 'me');
      return c.members.length > 0;
    });
    if (s.chats.length !== before) saveStateFor(u.username, s);
  });
  return changed || removed;
}
const ADMIN_KEY = 'nebula_admins_v2';
const LOG_KEY = 'nebula_log_v2';
const ANN_KEY = 'nebula_announce_v2';

const LIMITS = { name: 18, desc: 48, username: 14, password: 24 };
const CODE_TTL = 15 * 60; // 15 минут

/* ---------- Отправка кодов на почту через сервер-реле (Яндекс SMTP) ----------
   Сервер: mail-relay/server.js, развёрнут на бесплатном хостинге Render.
   Ниже укажите его URL (без слеша в конце). Если URL пуст — включается демо-режим. */
const MAIL_RELAY_HOST = 'https://nebula-mail-relay.nebula-mail.workers.dev';
const LOCAL_RELAY_HOST = 'http://127.0.0.1:8000';
const IS_LOCAL = typeof location !== 'undefined' && location
  && (location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost');
const MAIL_RELAY_URL = IS_LOCAL ? LOCAL_RELAY_HOST : MAIL_RELAY_HOST;
const MAIL_RELAY_SECRET = 'nebula-relay-secret-1337';

function sendCodeToEmail(email, code, label) {
  return new Promise((resolve) => {
    if (!MAIL_RELAY_URL) {
      resolve({ ok: false, demo: true });
      return;
    }
    fetch(MAIL_RELAY_URL + '/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, code: code, label: label || 'Код подтверждения Nebula Messenger', secret: MAIL_RELAY_SECRET }),
    })
      .then((r) => r.json().catch(() => ({ ok: false, err: 'HTTP ' + r.status })))
      .then((d) => d && d.ok ? resolve({ ok: true })
        : (d && d.err === 'demo')
          ? resolve({ ok: false, demo: true })
          : resolve({ ok: false, err: (d && d.err) || 'Не удалось отправить письмо' }))
      .catch((err) => {
        console.error('Mail relay error:', err);
        resolve({ ok: false, err: 'Не удалось отправить письмо' });
      });
  });
}

const COLOR_PALETTE = [
  ['#6C5CE7', '#8E7BFF'], ['#0984E3', '#74B9FF'], ['#00B894', '#55EFC4'],
  ['#F39C12', '#FDCB6E'], ['#E84393', '#FD79A8'], ['#D63031', '#FF7675'],
  ['#00CEC9', '#81ECEC'], ['#A24DBD', '#DDA0DD'],
];

const PRESET_AVATARS = [
  { c1: '#6C5CE7', c2: '#8E7BFF', g: '😎' },
  { c1: '#0984E3', c2: '#74B9FF', g: '🚀' },
  { c1: '#00B894', c2: '#55EFC4', g: '🌿' },
  { c1: '#F39C12', c2: '#FDCB6E', g: '🔥' },
  { c1: '#E84393', c2: '#FD79A8', g: '🌸' },
  { c1: '#D63031', c2: '#FF7675', g: '❤️' },
  { c1: '#00CEC9', c2: '#81ECEC', g: '🐬' },
  { c1: '#A24DBD', c2: '#DDA0DD', g: '✨' },
];

const FRAMES = [
  { id: 'crown',   name: 'КОРОНА',   emoji: '👑', desc: 'Королевская · только для администраторов',            unlock: (a) => isAdmin(a.username) },
  { id: 'vip',     name: 'ВИП',      emoji: '🎩', desc: 'Чёрно-золотая · только для администраторов',           unlock: (a) => isAdmin(a.username) },
  { id: 'nebula',  name: 'НЕБУЛА',   emoji: '🌌', desc: 'Космическая · только для администраторов',             unlock: (a) => isAdmin(a.username) },
  { id: 'admin',   name: 'АДМИН',   emoji: '🖤', desc: 'Чёрная · только для администраторов',                 unlock: (a) => isAdmin(a.username) },
  { id: 'old',     name: 'ОЛД',       emoji: '🏛️', desc: 'Тёмно-золотая · выдаётся только первым 10 пользователям', unlock: (a) => {
      const first10 = accountsList().filter(u => !u.isBot).sort((x, y) => (x.created || 0) - (y.created || 0)).slice(0, 10);
      return first10.some(u => u.username === a.username);
    } },
  { id: 'dolphin', name: 'Дельфин',   emoji: '🐬', desc: 'Синяя · достигните 100 уровня дельфина в любом чате',      unlock: (a) => dolphinsMaxLevelFor(a.username) >= 100 },
  { id: 'tester',  name: 'ТЕСТЕР',    emoji: '🧪', desc: 'Бирюзовая · только для тестеров',                          unlock: (a) => isTester(a) || isAdmin(a.username) },
  { id: '1h',      name: '1 час',     emoji: '⏱️', desc: 'Белая · за 1 час в мессенджере',                             unlock: (a) => hoursInApp(a) >= 1 },
  { id: '5h',      name: '5 часов',   emoji: '🌫️', desc: 'Серая · за 5 часов в мессенджере',                          unlock: (a) => hoursInApp(a) >= 5 },
  { id: '10h',     name: '10 часов',  emoji: '🥈', desc: 'Серебряная · за 10 часов в мессенджере',                    unlock: (a) => hoursInApp(a) >= 10 },
  { id: '50h',     name: '50 часов',  emoji: '🥇', desc: 'Золотая · за 50 часов в мессенджере',                       unlock: (a) => hoursInApp(a) >= 50 },
  { id: '100h',    name: '100 часов', emoji: '💎', desc: 'Бриллиантовая · за 100 часов в мессенджере',                unlock: (a) => hoursInApp(a) >= 100 },
];
const FRAME_ORDER = ['crown', 'vip', 'nebula', 'admin', 'tester', '100h', '50h', '10h', '5h', '1h', 'dolphin', 'old'];

const FLAG_EMOJIS = [
  '🇷🇺','🇺🇦','🇧🇾','🇰🇿','🇺🇿','🇦🇲','🇦🇿','🇬🇪','🇲🇩','🇱🇹','🇱🇻','🇪🇪','🇵🇱','🇨🇿','🇸🇰','🇭🇺','🇷🇴','🇧🇬','🇷🇸','🇭🇷','🇸🇮','🇬🇷','🇹🇷','🇮🇷','🇮🇱','🇦🇪','🇸🇦','🇶🇦','🇰🇼','🇧🇭','🇴🇲','🇾🇪','🇮🇶','🇸🇾','🇱🇧','🇯🇴','🇪🇬','🇲🇦','🇩🇿','🇹🇳','🇱🇾','🇸🇩','🇪🇹','🇰🇪','🇹🇿','🇳🇬','🇬🇭','🇿🇦','🇪🇸','🇵🇹','🇮🇹','🇫🇷','🇩🇪','🇬🇧','🇮🇪','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇮🇸','🇺🇸','🇨🇦','🇲🇽','🇧🇷','🇦🇷','🇨🇱','🇵🇪','🇨🇴','🇻🇪','🇨🇺','🇯🇲','🇦🇺','🇳🇿','🇨🇳','🇭🇰','🇹🇼','🇰🇷','🇯🇵','🇹🇭','🇻🇳','🇮🇳','🇵🇰','🇧🇩','🇱🇰','🇲🇾','🇸🇬','🇮🇩','🇵🇭','🇰🇭','🇲🇳','🇰🇵','🇳🇵','🇦🇫','🇺🇳','🇪🇺',
];
const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','😉','🙂','😅','🤔','😴','😭','😤','😱','🤯','🥺','😇','🤗','🙄','😋','🤐','😷','🤒','🥶','🥵','😈','🤠','🤡','👻','💀','👽','🤖','🎃','😺','😸','😹','😻','😼','🙀','😿','😾',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💖','💘','💝','💞','💓','💗','💕','💟','💌','💋','💯','💢','💥','💫','💦','💨','🕳️','💬','💭','🗯️',
  '👍','👎','👏','🙌','🤝','✌️','🤞','🤟','🤙','👌','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👊','✊','🤛','🤜','💪','🦾','🦵','🦶','👀','👁️','🧠','🦷','👅','👄','🫡','💋',
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦂','🦀','🦞','🦈','🐙','🦑','🐠','🐟','🐡','🐬','🐳','🐋','🐊','🐢','🦎','🐍','🦖','🦕',
  '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙','🍳','🥘','🍲','🥣','🥗','🍿','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍣','🍤','🍥','🍡','🥟','🥠','🥡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾',
  '⚽','⚾','🥎','🏀','🏐','🏈','🏉','🎾','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎯','🎳','🎮','🕹️','🎲','🧩','♟️','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻',
  '💰','💴','💶','💷','💳','🧾','✉️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮','🗳️','🪙','💎','🔮','🧿','📿','🧲','🧨','🧸','🎀','🎁','🎗️','🎟️','🎫','🎖️','🏅','🥇','🥈','🥉','⚓','🚀','🛸','✈️','🚁','🛟','🚲','🛵','🏍️','🚗','🚕','🚓','🚑','🚒','🚙','🛻','🚚','🚛','🚜','🏎️','🛴','🛹','🚦','🚧','⛽','🛑','🗺️','🗿','🏝️','🏜️','🏔️','🗻','🌋','🏟️','🏛️','🕌','🕍','⛪','🕋','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒',
  '🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','☀️','🌟','⭐','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','☔','💦','🌈','☂️','🧊','🌋','⚡','🔥',
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* Заморозка экрана на мобильных: никакого зума, растягивания и выезда страницы.
   Внутренняя прокрутка чатов/списков остаётся (touch-action: pan-x pan-y). */
if (/Android|iPhone|iPad|Mobile/i.test(typeof navigator !== 'undefined' && navigator.userAgent || '')) {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 10 18 19.5 6.5"/></svg>';

const STICK_CAP = 24;
function stickerTypeOf(st) { return (st && st.type) || 'image/png'; }
function isAnimatedSticker(st) {
  const t = stickerTypeOf(st);
  return t.indexOf('video/') === 0 || t === 'image/gif' || t === 'image/webp';
}
function stickerMediaHtml(st, cls, attrs) {
  const url = st && (st.dataUrl || st.url);
  const type = stickerTypeOf(st);
  const a = attrs || '';
  if (!url) return '';
  if (type.indexOf('video/') === 0) {
    return `<video class="${cls} loading" onloadeddata="this.classList.remove('loading')" src="${url}" autoplay loop muted playsinline ${a}></video>`;
  }
  return `<img class="${cls} loading" loading="lazy" onload="this.classList.remove('loading')" src="${url}" alt="Стикер" ${a}>`;
}
function stickBadgeHtml(st) {
  const t = stickerTypeOf(st);
  if (t.indexOf('video/') === 0) return '<span class="stick-anim-badge">▶</span>';
  if (t === 'image/gif' || t === 'image/webp') return '<span class="stick-anim-badge">GIF</span>';
  return '';
}
function stickCellHtml(st, opts) {
  opts = opts || {};
  const send = escapeHtml(st.dataUrl);
  const media = stickerMediaHtml(st, 'stick-img', `title="Отправить" data-send="${send}" data-type="${escapeHtml(stickerTypeOf(st))}"`);
  const favBtn = opts.fav ? `<button class="stick-fav" data-sf="${send}" data-type="${escapeHtml(stickerTypeOf(st))}" title="В избранное">★</button>` : '';
  return `<div class="sticker-cell">${media}${stickBadgeHtml(st)}${favBtn}</div>`;
}

/* ---------- ХРАНИЛИЩЕ ---------- */
let storageWarnedAt = 0;
function safeSet(key, val) {
  try { localStorage.setItem(key, val); return true; }
  catch (e) {
    if (Date.now() - storageWarnedAt > 30000) {
      storageWarnedAt = Date.now();
      toast('Хранилище переполнено', 'Удалите старые стикеры или фотосообщения', 4000);
    }
    return false;
  }
}
function loadAccounts() {
  try {
    const d = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
    return { nextId: (d && d.nextId) || 1, users: (d && d.users) || {} };
  } catch (e) { return { nextId: 1, users: {} }; }
}
function saveAccounts(d) { if (safeSet(ACCOUNTS_KEY, JSON.stringify(d))) scheduleCloudBackup(); }
function accountByUsername(u) { return loadAccounts().users[u] || null; }
function accountsList() { return Object.values(loadAccounts().users); }

/* ---------- ОБЛАЧНЫЙ БЭКАП (Cloudflare KV) ---------- */
let cloudQueue = null;
let cloudBackupTimer = null;
const CLOUD_META_KEY = 'nebula_cloud_meta';

function cloudUrl(key) { return MAIL_RELAY_URL + '/store?key=' + encodeURIComponent(key); }

/* Значение хранится в облаке вместе с версией (v) — чтобы при восстановлении
   не затирать более свежие локальные данные. Старые записи без версии
   считаются v=0. */
function cloudWrap(value) {
  return JSON.stringify({ v: Date.now(), d: value });
}
function cloudUnwrap(raw) {
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && typeof p.d === 'string') return { v: p.v || 0, d: p.d };
  } catch (e) {}
  return { v: 0, d: raw };
}
function loadCloudMeta() {
  try { return JSON.parse(localStorage.getItem(CLOUD_META_KEY)) || {}; } catch (e) { return {}; }
}
function saveCloudMeta(m) {
  try { localStorage.setItem(CLOUD_META_KEY, JSON.stringify(m)); } catch (e) {}
}

/* ---------- Вторая база: Firestore-зеркало ----------
   Cloudflare KV (бесплатный лимит ~1000 записей/день) часто исчерпывается,
   и синхронизация встаёт. Firestore (бесплатно ~20000 записей/день) —
   надёжный дубль. Чтобы включить:
   1) консоль Firebase → проект nebula-1337 → Build → Firestore Database →
      Create database (режим production или test);
   2) Project settings → Your apps → Web app → скопируйте apiKey и projectId;
   3) ключ уже встроен в приложение по умолчанию — база включается сама;
      если позже сменишь ключ, можно переопределить в консоли браузера (F12):
      localStorage.setItem('nebula_firebase_cfg', JSON.stringify({ apiKey: 'НОВЫЙ_КЛЮЧ', projectId: 'nebula-1337' }))
      затем перезагрузите страницу. */
const NEBULA_FIREBASE_DEFAULT = { apiKey: 'AIzaSyCTLMsslePFNCp2leerUBx2ascBrITAz6Y', projectId: 'nebula-1337' };
let NEBULA_FIREBASE = NEBULA_FIREBASE_DEFAULT;
try {
  const cfg = JSON.parse(localStorage.getItem('nebula_firebase_cfg') || 'null');
  if (cfg && cfg.apiKey && cfg.projectId) NEBULA_FIREBASE = cfg;
} catch (e) {}
function fsEnabled() { return !!(NEBULA_FIREBASE.apiKey && NEBULA_FIREBASE.projectId); }
function fsDocId(key) {
  try { return btoa(unescape(encodeURIComponent(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  catch (e) { return 'k' + key.length; }
}
function fsBase() { return 'https://firestore.googleapis.com/v1/projects/' + NEBULA_FIREBASE.projectId + '/databases/(default)'; }
function fsUrl(doc) { return fsBase() + '/documents/' + doc + '?key=' + NEBULA_FIREBASE.apiKey; }
function fsRead(key) {
  return fetch(fsUrl('kv/' + fsDocId(key)), { method: 'GET' })
    .then(r => r.json().catch(() => ({ error: true })))
    .then(d => { if (d.error || !d.fields || !d.fields.value) return null; return d.fields.value.stringValue || null; })
    .catch(() => null);
}
function fsList(prefix) {
  return fetch(fsUrl('kv/idx'), { method: 'GET' })
    .then(r => r.json().catch(() => ({ error: true })))
    .then(d => {
      if (d.error || !d.fields || !d.fields.keys || !d.fields.keys.arrayValue) return [];
      const vals = d.fields.keys.arrayValue.values || [];
      return vals.map(x => x.stringValue).filter(k => k && k.startsWith(prefix));
    })
    .catch(() => []);
}
function fsIndexOp(key, op) {
  return fetch(fsBase() + '/documents:commit?key=' + NEBULA_FIREBASE.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: 'projects/' + NEBULA_FIREBASE.projectId + '/databases/(default)/documents/kv/idx',
          fieldTransforms: [{
            fieldPath: 'keys',
            [op === 'add' ? 'appendMissingElements' : 'removeAllFromArray']: { values: [{ stringValue: key }] },
          }],
        },
      }],
    }),
  }).then(r => r.json().catch(() => ({ error: true }))).then(d => !d.error).catch(() => false);
}
function fsWrite(key, value) {
  if (value.length > 900000) return Promise.resolve(false);
  const put = fetch(fsUrl('kv/' + fsDocId(key)) + '&updateMask.fieldPaths=value', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { value: { stringValue: value } } }),
  }).then(r => r.json().catch(() => ({ error: true }))).then(d => !d.error).catch(() => false);
  return Promise.all([put, fsIndexOp(key, 'add')]).then(([a, b]) => a && b);
}
function fsDelete(key) {
  const del = fetch(fsUrl('kv/' + fsDocId(key)), { method: 'DELETE' })
    .then(r => r.json().catch(() => ({ error: true }))).then(d => !d.error).catch(() => false);
  return Promise.all([del, fsIndexOp(key, 'remove')]).then(([a, b]) => a && b);
}

function kvWriteBudgetOk() {
  const m = loadCloudMeta();
  const day = new Date().toISOString().slice(0, 10);
  if (m.kvDay !== day) { m.kvDay = day; m.kvWrites = 0; saveCloudMeta(m); }
  return (m.kvWrites || 0) < 700;
}
function cloudSave(key, value) {
  if (!MAIL_RELAY_URL) return Promise.resolve(false);
  const meta = loadCloudMeta();
  meta[key] = Date.now();
  saveCloudMeta(meta);
  const kv = kvWriteBudgetOk()
    ? fetch(MAIL_RELAY_URL + '/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: cloudWrap(value), secret: MAIL_RELAY_SECRET }),
        keepalive: true,
      }).then(r => r.json().catch(() => ({ ok: false }))).then(d => {
        if (d.ok) { const m2 = loadCloudMeta(); m2.kvWrites = (m2.kvWrites || 0) + 1; saveCloudMeta(m2); }
        return !!d.ok;
      }).catch(() => false)
    : Promise.resolve(false);
  const fsp = fsEnabled() ? fsWrite(key, value) : Promise.resolve(false);
  return Promise.all([kv, fsp]).then(([a, b]) => {
    const ok = !!(a || b);
    if (!ok) { const m = loadCloudMeta(); m.failAt = Date.now(); saveCloudMeta(m); }
    return ok;
  });
}
function cloudFailedRecently(ms) {
  const m = loadCloudMeta();
  return !!(m.failAt && Date.now() - m.failAt < (ms || 20000));
}
/* Быстрая запись только при изменении содержимого — экономит квоту KV:
   повторные бэкапы неизменных ключей не пишутся в облако */
function qhash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
function cloudSaveIfChanged(key, value) {
  const m = loadCloudMeta();
  if (m.pushed && m.pushed[key] === qhash(value)) return Promise.resolve(true);
  return cloudSave(key, value).then(ok => {
    if (ok) {
      const m2 = loadCloudMeta();
      m2.pushed = m2.pushed || {};
      m2.pushed[key] = qhash(value);
      saveCloudMeta(m2);
    }
    return ok;
  });
}
function cloudLoad(key) {
  if (!MAIL_RELAY_URL) return Promise.resolve(null);
  const fsp = fsEnabled() ? fsRead(key).then(r => r ? cloudUnwrap(r) : null) : Promise.resolve(null);
  const kp = fetch(cloudUrl(key), { method: 'GET' })
    .then(r => r.json().catch(() => ({ ok: false })))
    .then(d => (d && d.ok && d.value) ? cloudUnwrap(d.value) : null)
    .catch(() => null);
  return Promise.all([fsp, kp]).then(([f, k]) => {
    if (!f) return k;
    if (!k) return f;
    return k.v > f.v ? k : f;
  });
}
function cloudDelete(key) {
  if (!MAIL_RELAY_URL) return Promise.resolve(false);
  const kv = kvWriteBudgetOk()
    ? fetch(MAIL_RELAY_URL + '/store', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, secret: MAIL_RELAY_SECRET }),
        keepalive: true,
      }).then(r => r.json().catch(() => ({ ok: false }))).then(d => {
        if (d.ok) { const m2 = loadCloudMeta(); m2.kvWrites = (m2.kvWrites || 0) + 1; saveCloudMeta(m2); }
        return !!d.ok;
      }).catch(() => false)
    : Promise.resolve(false);
  const fsp = fsEnabled() ? fsDelete(key) : Promise.resolve(false);
  return Promise.all([kv, fsp]).then(([a, b]) => !!(a || b));
}
function scheduleCloudBackup() {
  if (cloudBackupTimer) clearTimeout(cloudBackupTimer);
  cloudBackupTimer = setTimeout(() => { cloudBackupTimer = null; runCloudBackup(); }, 3000);
}
/* Слияние аккаунтов при отправке в облако: чужие пользователи из облака
   не теряются, даже если локальная копия старше (устройство с другого
   компьютера не перезаписывает облачную базу) */
function mergeAccountsWithCloud(raw) {
  if (!MAIL_RELAY_URL) return Promise.resolve(raw);
  return cloudLoad(ACCOUNTS_KEY).then(cur => {
    if (!cur || !cur.d) return raw;
    try {
      const cl = JSON.parse(cur.d), lc = JSON.parse(raw);
      let changed = false;
      Object.keys(cl.users || {}).forEach(u => {
        if (cloudMergeUserOk(lc, cl.users[u], u)) { lc.users[u] = cl.users[u]; changed = true; }
      });
      return changed ? JSON.stringify(lc) : raw;
    } catch (e) { return raw; }
  }).catch(() => raw);
}
/* Свежая загрузка аккаунтов из облака + слияние с локальными.
   Используется при входе и регистрации, чтобы на любом устройстве
   было видно всех уже зарегистрированных пользователей */
/* Выравнивание баз при каждом открытии: локальная база пушит объединение,
   если в ней аккаунтов больше, чем в облаке; и наоборот — тянет из облака */
function reconcileAccountsNow() {
  if (!MAIL_RELAY_URL) return Promise.resolve();
  return cloudLoad(ACCOUNTS_KEY).then(r => {
    let cloudN = 0;
    try { cloudN = r && r.d ? Object.keys(JSON.parse(r.d).users || {}).length : 0; } catch (e) {}
    const localN = Object.keys(loadAccounts().users || {}).length;
    if (cloudN < localN) return forceCloudBackup();
    if (cloudN > localN) return refreshAccountsFromCloud().then(() => {
      if (currentUser) { renderChatList(); renderChat(); }
    });
    return null;
  }).catch(() => null);
}
function refreshAccountsFromCloud() {
  if (!MAIL_RELAY_URL) return Promise.resolve(loadAccounts());
  return cloudLoad(ACCOUNTS_KEY).then(r => {
    if (!r || !r.d) return loadAccounts();
    try {
      const cl = JSON.parse(r.d);
      const local = loadAccounts();
      let changed = false;
      Object.keys(cl.users || {}).forEach(u => {
        if (cloudMergeUserOk(local, cl.users[u], u)) { local.users[u] = cl.users[u]; changed = true; }
      });
      if (changed) {
        saveAccounts(local);
        const meta = loadCloudMeta();
        meta.seenAccounts = Math.max(meta.seenAccounts || 0, r.v);
        saveCloudMeta(meta);
      }
      return local;
    } catch (e) { return loadAccounts(); }
  }).catch(() => loadAccounts());
}
function forceCloudBackup() {
  if (cloudBackupTimer) { clearTimeout(cloudBackupTimer); cloudBackupTimer = null; }
  runCloudBackup();
}
function findAccountInCloud(username, email) {
  return cloudLoad(ACCOUNTS_KEY).then(r => {
    if (!r || !r.d) return null;
    let cl;
    try { cl = JSON.parse(r.d); } catch (e) { return null; }
    const users = (cl && cl.users) || {};
    const un = String(username || '').toLowerCase();
    const em = String(email || '').toLowerCase();
    const found = Object.values(users).find(u => u && (String(u.username || '').toLowerCase() === un || String(u.email || '').toLowerCase() === em));
    if (!found) return null;
    return cloudLoad(DELETED_USERS_KEY).then(dr => {
      try {
        const del = dr && dr.d ? JSON.parse(dr.d) : [];
        if (Array.isArray(del) && del.includes(found.username)) return null;
      } catch (e) {}
      return found;
    });
  }).catch(() => null);
}
let cloudSearchTimer = null;
/* Облачный поиск пользователя по @юзернейму/ID с авто-регистрацией в
   локальную базу — чтобы на любом устройстве можно было найти и написать
   любому зарегистрированному пользователю (единая база) */
function cloudSearchAndMerge(q) {
  if (!MAIL_RELAY_URL || !currentUser || !q) return Promise.resolve(null);
  if (cloudSearchTimer) clearTimeout(cloudSearchTimer);
  return new Promise(res => {
    cloudSearchTimer = setTimeout(() => {
      cloudSearchTimer = null;
      findAccountInCloud(q, q).then(f => {
        if (!f || !currentUser) return res(null);
        const local = loadAccounts();
        if (cloudMergeUserOk(local, f, f.username)) { local.users[f.username] = f; saveAccounts(local); }
        res(f);
      }).catch(() => res(null));
    }, 300);
  });
}
function runCloudBackup() {
  if (!MAIL_RELAY_URL) return Promise.resolve();
  if (cloudQueue) return cloudQueue;
  cloudQueue = (async () => {
    try {
      if (cloudFailedRecently(60000)) return;
      const tasks = [];
      try {
        let raw = localStorage.getItem(ACCOUNTS_KEY);
        if (raw) {
          const del = deletedUsers();
          if (del.length) {
            try {
              const lc = JSON.parse(raw);
              let changed = false;
              del.forEach(u => { if (lc.users && lc.users[u]) { delete lc.users[u]; changed = true; } });
              if (changed) raw = JSON.stringify(lc);
            } catch (e) {}
          }
          tasks.push(mergeAccountsWithCloud(raw).then(m => cloudSaveIfChanged(ACCOUNTS_KEY, m)));
        }
      } catch (e) {}
      const delList = deletedUsers();
      if (delList.length) tasks.push(cloudSaveIfChanged(DELETED_USERS_KEY, JSON.stringify(delList)));
      const accounts = loadAccounts();
      Object.keys(accounts.users || {}).forEach(u => {
        const raw = localStorage.getItem(stateKey(u));
        if (!raw) return;
        const sk = stateKey(u);
        const sraw = stripStateForCloud(raw);
        if (!sraw) return;
        tasks.push(cloudLoad(sk).then(cur => {
          const m2 = loadCloudMeta();
          if (cur && cur.v > (m2[sk] || 0)) {
            m2[sk] = cur.v;
            saveCloudMeta(m2);
            if (u === (currentUser ? currentUser.username : null) && localStorage.getItem(sk) !== cur.d) {
              try {
                localStorage.setItem(sk, mergeStateWithCloud(localStorage.getItem(sk) || '', cur.d));
                state = loadState() || state;
                ensureGlobalChats();
                saveState();
                renderChatList();
                renderChat();
              } catch (e) {}
            }
            return false;
          }
          return cloudSaveIfChanged(sk, sraw);
        }));
      });
      const admins = localStorage.getItem(ADMIN_KEY);
      if (admins) tasks.push(cloudSaveIfChanged(ADMIN_KEY, admins));
      const logs = localStorage.getItem(LOG_KEY);
      if (logs) tasks.push(cloudSaveIfChanged(LOG_KEY, logs));
      const ann = localStorage.getItem(ANN_KEY);
      if (ann) tasks.push(cloudSaveIfChanged(ANN_KEY, ann));
      const tickets = localStorage.getItem(TICKETS_KEY);
      if (tickets) tasks.push(cloudSaveIfChanged(TICKETS_KEY, tickets));
      const tracksRaw = currentUser ? localStorage.getItem('nebula_tracks_' + currentUser.username) : null;
      if (tracksRaw) tasks.push(cloudSaveIfChanged('tracks:' + currentUser.username, tracksRaw));
      await Promise.all(tasks);
    } finally {
      cloudQueue = null;
    }
  })();
  return cloudQueue;
}

/* Восстановление из облака: аккаунты + состояние каждого пользователя
   (чаты, сообщения) + админы + логи + объявление. Для каждого ключа берётся
   более свежая версия; чужие аккаунты из облака всегда добавляются. */
function restoreMyStateFromCloud(uname) {
  if (!MAIL_RELAY_URL) return;
  const k = stateKey(uname);
  cloudLoad(k).then(r => {
    if (!r || !currentUser || currentUser.username !== uname) return;
    const meta = loadCloudMeta();
    const seen = meta.seenStates || {};
    if ((seen[k] || 0) >= r.v) return;
try {
        localStorage.setItem(k, mergeStateWithCloud(localStorage.getItem(k) || '', r.d));
        seen[k] = r.v;
        meta.seenStates = seen;
        meta[k] = r.v;
        saveCloudMeta(meta);
      state = loadState() || state;
      ensureGlobalChats();
      saveState();
      renderChatList();
      renderChat();
      toast('База восстановлена из облака');
    } catch (e) {}
  }).catch(() => {});
}

function tryRestoreFromCloud() {
  if (!MAIL_RELAY_URL) return;
  const done = (async () => {
    try {
      const accountsRaw = await cloudLoad(ACCOUNTS_KEY);
      let restored = false;
      if (accountsRaw) {
        const meta = loadCloudMeta();
        const localRaw = localStorage.getItem(ACCOUNTS_KEY);
        const localV = meta[ACCOUNTS_KEY] || 0;
        let nextRaw = null;
        if (localRaw && accountsRaw.v < localV) {
          try {
            const lc = JSON.parse(localRaw), cc = JSON.parse(accountsRaw.d);
            let changed = false;
            Object.keys(cc.users || {}).forEach(u => {
              if (cloudMergeUserOk(lc, cc.users[u], u)) { lc.users[u] = cc.users[u]; changed = true; }
            });
            if (changed) nextRaw = JSON.stringify(lc);
          } catch (e) {}
        } else {
          try {
            const lc = localRaw ? JSON.parse(localRaw) : { users: {} };
            const cc = JSON.parse(accountsRaw.d);
            let changed = false;
            Object.keys(cc.users || {}).forEach(u => {
              if (cloudMergeUserOk(lc, cc.users[u], u)) { lc.users[u] = cc.users[u]; changed = true; }
            });
            if (currentUser && currentUser.username && !lc.users[currentUser.username]) { lc.users[currentUser.username] = currentUser; changed = true; }
            if (changed) nextRaw = JSON.stringify(lc);
          } catch (e) {}
          meta.seenAccounts = accountsRaw.v;
          saveCloudMeta(meta);
        }
        if (nextRaw && nextRaw !== localRaw) {
          try { localStorage.setItem(ACCOUNTS_KEY, nextRaw); restored = true; } catch (e) {}
        }
      }
      const accs = loadAccounts();
      const delRaw = await cloudLoad(DELETED_USERS_KEY);
      if (delRaw && delRaw.d) {
        try { applyDeletedFromCloud(JSON.parse(delRaw.d)); } catch (e) {}
      }
      await Promise.all(Object.keys(accs.users || {}).map(async u => {
        const k = stateKey(u);
        const r = await cloudLoad(k);
        if (!r) return;
        const meta = loadCloudMeta();
        if ((meta[k] || 0) < r.v) {
          try {
            localStorage.setItem(k, mergeStateWithCloud(localStorage.getItem(k) || '', r.d));
            meta[k] = r.v;
            meta.seenStates = meta.seenStates || {};
            meta.seenStates[k] = r.v;
            saveCloudMeta(meta);
            restored = true;
          } catch (e) {}
        }
      }));
      for (const k of [ADMIN_KEY, LOG_KEY, ANN_KEY, TICKETS_KEY]) {
        const r = await cloudLoad(k);
        if (!r) continue;
        const meta = loadCloudMeta();
        if ((meta[k] || 0) < r.v) {
          try { localStorage.setItem(k, r.d); meta[k] = r.v; saveCloudMeta(meta); restored = true; } catch (e) {}
        }
      }
      if (restored) {
        tryAutoLogin();
        if (currentUser) {
          const st = loadState();
          if (st) {
            state = st;
            ensureGlobalChats();
            saveState();
            renderChatList();
            renderChat();
          }
        }
      }
    } catch (e) {
      console.error('Cloud restore failed:', e);
    }
  })();
  return Promise.race([done, new Promise(res => setTimeout(res, 4000))]);
}

/* ---------- ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ ЧАТОВ (переписка между браузерами) ----------
   Каждое сообщение пишется в облако ключом msg:<chatId>:<msgId>, мета-данные
   чата — chat:<chatId>, удалённые сообщения — mdel:<chatId>:<msgId>.
   Пока пользователь в сети, клиент раз в 4 секунды опрашивает облако
   и подтягивает новые чаты и сообщения. */
const CLOUD_CHAT_PREFIX = 'chat:';
const CLOUD_MSG_PREFIX = 'msg:';
const CLOUD_MDEL_PREFIX = 'mdel:';
let cloudSyncTimer = null;
let cloudChatMetaTimer = null;
let cloudSyncingNow = false;

function cloudListKeys(prefix) {
  if (!MAIL_RELAY_URL) return Promise.resolve([]);
  const fsp = fsEnabled() ? fsList(prefix) : Promise.resolve([]);
  const kp = fetch(MAIL_RELAY_URL + '/store/keys?prefix=' + encodeURIComponent(prefix))
    .then(r => r.json().catch(() => ({ ok: false })))
    .then(d => (d && d.ok && Array.isArray(d.keys)) ? d.keys : [])
    .catch(() => []);
  return Promise.all([fsp, kp]).then(([a, b]) => Array.from(new Set([...a, ...b])));
}
function cloudChatKey(chatId) { return CLOUD_CHAT_PREFIX + chatId; }
function cloudMsgKey(chatId, msgId) { return CLOUD_MSG_PREFIX + chatId + ':' + msgId; }
function cloudMdelKey(chatId, msgId) { return CLOUD_MDEL_PREFIX + chatId + ':' + msgId; }

function stripMediaForCloud(msg) {
  const out = JSON.parse(JSON.stringify(msg));
  if (out.media && out.media.length) out.media = out.media.map(md => {
    if (md.dataUrl && md.dataUrl.length > 700000) return { type: md.type, name: md.name, size: md.size, dataUrl: null };
    return md;
  });
  if (out.voice && out.voice.dataUrl && out.voice.dataUrl.length > 700000) out.voice = { dur: out.voice.dur || 0, dataUrl: null };
  if (out.video) out.video = { dur: out.video.dur || 0 };
  if (out.sticker && out.sticker.dataUrl && out.sticker.dataUrl.length > 700000) out.sticker = { name: out.sticker.name || 'Стикер', dataUrl: null };
  return out;
}
function sanitizeForCloud(obj) {
  const out = stripMediaForCloud(obj);
  if (out.from === 'me') out.from = currentUser.username;
  if (out.reactions) {
    Object.keys(out.reactions).forEach(e => {
      out.reactions[e] = (out.reactions[e] || []).map(x => x === 'me' ? currentUser.username : x);
    });
  }
  return out;
}
function stripStateForCloud(raw) {
  try {
    const st = JSON.parse(raw);
    if (st.chats && st.chats.length) st.chats.forEach(c => {
      if (c.messages && c.messages.length) c.messages = c.messages.map(stripMediaForCloud);
    });
    const s = JSON.stringify(st);
    return s.length <= 1600000 ? s : null;
  } catch (e) { return null; }
}
function sanitizeFromCloud(msg) {
  if (msg && msg.reactions) {
    Object.keys(msg.reactions).forEach(e => {
      msg.reactions[e] = (msg.reactions[e] || []).map(x => x === currentUser.username ? 'me' : x);
    });
  }
  return msg;
}

function pushChatMeta(chat) {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve(false);
  if (chat.type === 'ai' || chat.type === 'saved') return Promise.resolve(false);
  const users = {};
  const profOf = (un) => {
    if (un === 'me' || un === currentUser.username) return { n: currentUser.name, id: currentUser.id, a: currentUser.avatar || null };
    const a = accountByUsername(un);
    return a ? { n: a.name, id: a.id, a: a.avatar || null } : null;
  };
  const norm = (un) => un === 'me' ? currentUser.username : un;
  const names = new Set([...(chat.members || []).map(norm), norm(chat.owner), norm(chat.userId)].filter(Boolean));
  names.forEach(un => { const p = profOf(un); if (p) users[un] = p; });
  const meta = {
    id: chat.id, type: chat.type, name: chat.name, desc: chat.desc, color: chat.color,
    handle: chat.handle, access: chat.access, whoCanInvite: chat.whoCanInvite,
    avatar: chat.avatar || null,
    owner: chat.owner === 'me' ? currentUser.username : (chat.owner || currentUser.username),
    admins: (chat.admins || []).map(x => x === 'me' ? currentUser.username : x),
    members: (chat.members || []).map(x => x === 'me' ? currentUser.username : x),
    userId: chat.type === 'private' ? chat.userId : undefined,
    createdAt: chat.createdAt || Date.now(),
    users,
  };
  return cloudSave(cloudChatKey(chat.id), JSON.stringify(meta));
}
function pushChatMetas() {
  if (!currentUser || !MAIL_RELAY_URL) return;
  state.chats.forEach(c => pushChatMeta(c));
}
function scheduleChatMetaPush() {
  if (cloudChatMetaTimer) clearTimeout(cloudChatMetaTimer);
  cloudChatMetaTimer = setTimeout(() => { cloudChatMetaTimer = null; pushChatMetas(); }, 1500);
}
function pushMsgToCloud(chat, msg) {
  if (!currentUser || !MAIL_RELAY_URL) return;
  if (chat.type === 'ai' || chat.type === 'saved') return;
  const out = sanitizeForCloud(msg);
  if (currentUser) out.sp = { n: currentUser.name, id: currentUser.id, a: currentUser.avatar || null };
  cloudSave(cloudMsgKey(chat.id, msg.id), JSON.stringify(out));
}

function privateChatId(a, b) { return 'p' + [a, b].sort().join('_'); }
function msgTimeOfId(id) {
  const n = parseInt(String(id).replace(/^m/, ''), 10);
  return isNaN(n) ? 0 : n;
}

function syncCloudChats() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve();
  if (cloudSyncingNow) return Promise.resolve();
  cloudSyncingNow = true;
  const me = currentUser.username;
  return (async () => {
    try {
      const chatKeys = await cloudListKeys(CLOUD_CHAT_PREFIX);
      const metas = [];
      if (chatKeys.length) {
        const raws = await Promise.all(chatKeys.map(k => cloudLoad(k)));
        raws.forEach(r => { if (r) { try { metas.push(JSON.parse(r.d)); } catch (e) {} } });
      }
      let changed = false;
      const leftChats = state.leftChats || [];
      metas.forEach(m => {
        if (!m || !m.id) return;
        if (m.users) {
          Object.keys(m.users).forEach(un => {
            const p = m.users[un];
            if (!p || un === me) return;
            const acc = loadAccounts();
            if (cloudMergeUserOk(acc, p, un)) {
              acc.users[un] = { username: un, name: p.n || un, id: p.id || un, avatar: p.a || null, createdAt: Date.now() };
              saveAccounts(acc);
            }
          });
        }
        if (leftChats.includes(m.id)) return;
        const mine = m.type === 'private'
          ? (m.members || []).includes(me) || m.userId === me || m.owner === me
          : (m.members || []).includes(me) || m.owner === me;
        if (m.deleted) {
          const local = state.chats.find(c => c.id === m.id);
          if (local) {
            state.chats = state.chats.filter(c => c.id !== m.id);
            if (state.currentChatId === m.id) state.currentChatId = null;
            changed = true;
          }
          return;
        }
        if (!mine) return;
        const members = (m.members || []).map(x => x === me ? 'me' : x);
        const admins = (m.admins || []).map(x => x === me ? 'me' : x);
        let otherSide = m.userId;
        if (otherSide === 'me' || otherSide === me) otherSide = m.owner;
        if (m.type === 'private' && (!otherSide || otherSide === me || otherSide === 'me')) return;
        if (m.type === 'private') {
          const dup = state.chats.find(c => c.type === 'private' && c.userId === otherSide && c.id !== m.id);
          if (dup) { dup.id = m.id; changed = true; }
        }
        const local = state.chats.find(c => c.id === m.id);
        if (local) {
          if (local.name !== m.name || local.desc !== m.desc) changed = true;
          local.name = m.name; local.desc = m.desc; local.color = m.color;
          local.handle = m.handle; local.access = m.access; local.whoCanInvite = m.whoCanInvite;
          if (m.avatar) local.avatar = m.avatar;
          local.owner = m.owner === me ? 'me' : m.owner;
          if (((local.members || []).join(',') !== members.join(','))) { local.members = members; changed = true; }
          local.admins = admins;
        } else {
          const nc = {
            id: m.id, type: m.type, name: m.name, desc: m.desc, color: m.color,
            handle: m.handle, access: m.access, whoCanInvite: m.whoCanInvite,
            avatar: m.avatar || null,
            owner: m.owner === me ? 'me' : m.owner,
            admins, members,
            dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
            messages: [], unread: 0,
          };
          if (m.type === 'private') nc.userId = otherSide;
          state.chats.unshift(nc);
          changed = true;
        }
      });
      for (const chat of state.chats) {
        if (chat.type === 'ai' || chat.type === 'saved') continue;
        const mdelKeys = await cloudListKeys(CLOUD_MDEL_PREFIX + chat.id + ':');
        const deletedIds = new Set(mdelKeys.map(k => k.slice(k.lastIndexOf(':') + 1)));
        let hadDeletes = false;
        if (deletedIds.size) {
          const before = chat.messages.length;
          chat.messages = chat.messages.filter(m => !deletedIds.has(m.id));
          hadDeletes = chat.messages.length !== before;
        }
        const msgKeys = await cloudListKeys(CLOUD_MSG_PREFIX + chat.id + ':');
        if (!msgKeys.length) { if (hadDeletes) changed = true; continue; }
        let newestTs = 0;
        chat.messages.forEach(m => { const t = msgTimeOfId(m.id); if (t > newestTs) newestTs = t; });
        const cutoff = newestTs - 30000;
        const toFetch = msgKeys.filter(k => msgTimeOfId(k.slice(k.lastIndexOf(':') + 1)) >= cutoff);
        if (!toFetch.length) { if (hadDeletes) changed = true; continue; }
        const raws = await Promise.all(toFetch.map(k => cloudLoad(k)));
        const known = new Set(chat.messages.map(m => m.id));
        let added = false;
        for (const r of raws) {
          if (!r) continue;
          let m;
          try { m = JSON.parse(r.d); } catch (e) { continue; }
          if (!m || !m.id || deletedIds.has(m.id)) continue;
          sanitizeFromCloud(m);
          if (m.from === me) m.from = 'me';
          if (m.sp && m.from && m.from !== 'me') {
            const acc = loadAccounts();
            if (cloudMergeUserOk(acc, m.sp, m.from)) {
              acc.users[m.from] = { username: m.from, name: m.sp.n || m.from, id: m.sp.id || m.from, avatar: m.sp.a || null, createdAt: Date.now() };
              saveAccounts(acc);
            }
          }
          if (known.has(m.id)) {
            const idx = chat.messages.findIndex(x => x.id === m.id);
            if (idx >= 0) { chat.messages[idx] = m; added = true; }
            continue;
          }
          m.read = false;
          if (chat.type === 'private' && m.from !== me && !canWriteTo(m.from, currentUser)) continue;
          const isMine = m.from === 'me' || m.from === currentUser.username;
          if (chat.id !== state.currentChatId) chat.unread = (chat.unread || 0) + 1;
          chat.messages.push(m);
          if (!isMine) notifyNewMessages(chat, [m]);
          else pushNotifyForChat(chat, [m]);
          added = true;
        }
        if (added || hadDeletes) changed = true;
      }
      if (changed) {
        state.chats.forEach(c => (c.messages || []).sort((a, b) => new Date(a.time) - new Date(b.time)));
        saveState();
        renderChatList();
        renderChat();
        maybeShowIncomingAll();
      }
    } catch (e) {
      console.error('Cloud chat sync failed:', e);
    } finally {
      cloudSyncingNow = false;
    }
  })();
}
function syncCloudUsers() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve();
  const meta0 = loadCloudMeta();
  if (meta0.usersCheckAt && Date.now() - meta0.usersCheckAt < 60000) return Promise.resolve();
  return Promise.all([cloudLoad(ACCOUNTS_KEY), cloudLoad(DELETED_USERS_KEY)]).then(([r, delR]) => {
    const meta = loadCloudMeta();
    meta.usersCheckAt = Date.now();
    saveCloudMeta(meta);
    if (delR && delR.d) {
      try { applyDeletedFromCloud(JSON.parse(delR.d)); } catch (e) {}
    }
    if (!r) return;
    if ((meta.seenAccounts || 0) >= r.v) return;
    let cloud;
    try { cloud = JSON.parse(r.d); } catch (e) { return; }
    if (!cloud || !cloud.users) return;
    const local = loadAccounts();
    let changed = false;
    Object.keys(cloud.users).forEach(u => {
      if (cloudMergeUserOk(local, cloud.users[u], u)) { local.users[u] = cloud.users[u]; changed = true; }
    });
    if (!changed) { meta.seenAccounts = r.v; saveCloudMeta(meta); return; }
    saveAccounts(local);
    meta.seenAccounts = r.v;
    saveCloudMeta(meta);
    Object.keys(cloud.users).forEach(u => {
      cloudLoad(stateKey(u)).then(sr => {
        if (!sr) return;
        const m = loadCloudMeta();
        const seen = m.seenStates || {};
        const k = stateKey(u);
        if ((seen[k] || 0) >= sr.v) return;
        try {
          localStorage.setItem(k, mergeStateWithCloud(localStorage.getItem(k) || '', sr.d));
          seen[k] = sr.v;
          m.seenStates = seen;
          m[k] = sr.v;
          saveCloudMeta(m);
        } catch (e) {}
      });
    });
    const vis = {};
    (state.chats || []).forEach(c => { if (c.type === 'private' && c.userId) vis[c.userId] = true; });
    const visList = Object.keys(vis).filter(u => u !== (currentUser ? currentUser.username : null)).slice(0, 25);
    if (visList.length) {
      Promise.all(visList.map(u => cloudLoad(PRESENCE_KEY + u).then(p => {
        if (!p || !p.d) return null;
        try { return JSON.parse(p.d); } catch (e) { return null; }
      }).catch(() => null))).then(applyPresence);
    }
    ensureGlobalChats();
    if (currentUser) { saveState(); renderChatList(); renderChat(); }
    tryAutoLogin();
  }).catch(e => console.error('Cloud users sync failed:', e));
}
/* Лёгкие «присутствия» (кто онлайн) — отдельный канал, чтобы не жечь квоту KV:
   пишутся только в Firestore, читаются раз в минуту для открытых чатов */
const PRESENCE_KEY = 'presence:';
function pushPresence() {
  if (!currentUser || !fsEnabled()) return;
  const u = currentUser.username;
  const st = currentUser.status || {};
  const t = (st.t === 'busy' || st.t === 'away' || st.t === 'offline' || st.t === 'invisible') ? st.t : 'on';
  fsWrite(PRESENCE_KEY + u, JSON.stringify({ u, t, s: st.s || '', ts: Date.now() }));
}
function applyPresence(list) {
  if (!currentUser) return;
  const local = loadAccounts();
  let ch = false;
  (list || []).forEach(x => {
    if (!x || !x.u) return;
    const acc = local.users[x.u];
    if (!acc) return;
    const t = (x.t === 'busy' || x.t === 'away' || x.t === 'invisible') ? x.t : (x.t === 'off' ? 'offline' : 'on');
    const newSt = t === 'on' ? {} : { t, s: x.s || '' };
    const stSame = JSON.stringify(acc.status || {}) === JSON.stringify(newSt);
    if (!stSame || acc.lastSeen !== x.ts) { acc.lastSeen = x.ts; acc.status = newSt; ch = true; }
  });
  if (ch) {
    safeSet(ACCOUNTS_KEY, JSON.stringify(local));
    renderChatList();
    renderChat();
  }
}
/* Слияние облачной копии состояния с локальной: чаты из облака добавляются,
   но локальные чаты НЕ удаляются (иначе копия с другого устройства, в которой
   ещё нет свежесозданного чата, стирала бы его из списка) */
function mergeStateWithCloud(raw, cloudRaw) {
  try {
    const del = new Set(deletedUsers());
    const keep = (c) => !(c && c.type === 'private' && del.has(c.userId));
    const a = JSON.parse(raw), b = JSON.parse(cloudRaw);
    if (!b || !Array.isArray(b.chats)) return cloudRaw;
    if (!a || !Array.isArray(a.chats) || !a.chats.length) return cloudRaw;
    const byId = {};
    a.chats.forEach(c => { if (c && c.id && keep(c)) byId[c.id] = c; });
    let changed = a.chats.length !== Object.keys(byId).length;
    const FIELDS = ['title', 'desc', 'type', 'folder', 'pinned', 'members', 'admins', 'owner', 'handle', 'color', 'avatar', 'cover', 'emoji', 'access', 'whoCanWrite', 'post', 'video', 'broadcast', 'lastActivity'];
    (b.chats || []).forEach(c => {
      if (!c || !c.id || !keep(c)) return;
      const ex = byId[c.id];
      if (!ex) { byId[c.id] = c; changed = true; return; }
      const have = new Set((ex.messages || []).map(m => m && m.id));
      const add = (c.messages || []).filter(m => m && m.id && !have.has(m.id));
      if (add.length) {
        ex.messages = (ex.messages || []).concat(add).sort((x, y) => String(x.time || '').localeCompare(String(y.time || '')));
        changed = true;
      }
      FIELDS.forEach(f => { if (c[f] !== undefined && ex[f] === undefined) { ex[f] = c[f]; changed = true; } });
      if ((c.unread || 0) > (ex.unread || 0)) { ex.unread = c.unread; changed = true; }
    });
    if (!changed) return raw;
    return JSON.stringify(Object.assign({}, a, { chats: Object.values(byId) }));
  } catch (e) { return cloudRaw; }
}
let cloudSyncInterval = 3000;
function scheduleCloudCycle() {
  const iv = cloudFailedRecently(20000) ? Math.min(60000, cloudSyncInterval * 2) : Math.max(3000, cloudSyncInterval - 500);
  cloudSyncInterval = iv;
  cloudSyncTimer = setTimeout(() => {
    syncCloudChats();
    syncCloudTickets();
    syncCloudUsers();
    syncCloudTracks();
    scheduleCloudCycle();
  }, iv);
}
function startCloudSync() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  syncCloudChats();
  syncCloudTickets();
  syncCloudUsers();
  syncCloudTracks();
  scheduleCloudCycle();
}
function stateKey(u) { return STATE_PREFIX + u; }
function loadState() {
  if (!currentUser) return null;
  try {
    const raw = localStorage.getItem(stateKey(currentUser.username));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.chats) return null;
    return s;
  } catch (e) { return null; }
}
function saveState() {
  if (!currentUser) return;
  if (safeSet(stateKey(currentUser.username), JSON.stringify(state))) {
    scheduleCloudBackup();
    scheduleChatMetaPush();
  }
}
function getStateFor(u) {
  try {
    const raw = localStorage.getItem(stateKey(u));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function ownedAccounts() {
  const k = 'nebula_owned_accounts_v2';
  try {
    const ex = localStorage.getItem(k);
    if (ex === null) {
      const seed = currentUser ? [currentUser.username] : [];
      try { localStorage.setItem(k, JSON.stringify(seed)); } catch (e) {}
      return seed;
    }
    return JSON.parse(ex);
  } catch (e) { return currentUser ? [currentUser.username] : []; }
}
function addOwnedAccount(u) {
  if (!u) return;
  const k = 'nebula_owned_accounts_v2';
  const s = new Set(ownedAccounts());
  s.add(u);
  try { localStorage.setItem(k, JSON.stringify([...s])); } catch (e) {}
}
function persistCurrentUser() {
  const d = loadAccounts();
  if (currentUser && d.users[currentUser.username]) {
    d.users[currentUser.username] = currentUser;
    saveAccounts(d);
  }
}

function saveStateFor(u, s) {
  if (safeSet(stateKey(u), JSON.stringify(s))) scheduleCloudBackup();
}

/* ---------- АДМИНКА / ЛОГИ ---------- */
function adminList() {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY)) || []; } catch (e) { return []; }
}
function saveAdminList(a) { if (safeSet(ADMIN_KEY, JSON.stringify(a))) scheduleCloudBackup(); }
function isAdmin(u) {
  if (!u) return false;
  const uname = typeof u === 'string' ? u : u.username;
  if (adminList().includes(uname)) return true;
  const acc = typeof u === 'string' ? accountByUsername(uname) : u;
  return !!(acc && acc.badges && (acc.badges.owner || acc.badges.admin));
}
function isOwnerAcc(u) {
  return !!(u && (u.id === 'NEBULA-NOOCORD' || u.username === 'noocord' || u.username === 'noocordik'));
}
function isSupport(u) { return !!(u && (u.support || isOwnerAcc(u))); }
function newsFullAccess(u) {
  return !!u && (isAdmin(u.username) || (u.badges && (u.badges.owner || u.badges.admin)) || u.support || isOwnerAcc(u));
}
function ensureDefaultAdmin() {
  const accs = accountsList();
  if (!accs.length) return;
  let admins = adminList();
  const wanted = accs.find(a => a.username === 'NEBULA-TRLLATL9E1J4')
    || accs.find(a => String(a.username || '').toLowerCase() === 'noocord')
    || accs.find(a => String(a.username || '').toLowerCase() === 'noocordik')
    || accs.find(a => String(a.id) === 'NEBULA-NOOCORD');
  if (wanted && !admins.includes(wanted.username)) admins = [...admins, wanted.username];
  const id1 = accs.find(a => a.id === 1);
  if (id1 && !admins.includes(id1.username)) admins = [...admins, id1.username];
  if (!admins.length) admins = [accs.slice().sort((a, b) => (a.username || '').localeCompare(b.username || ''))[0].username];
  saveAdminList(admins.sort());
}
function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { return []; }
}
function saveLog(l) { if (safeSet(LOG_KEY, JSON.stringify(l))) scheduleCloudBackup(); }
function addLog(user, action) {
  const l = loadLog();
  l.unshift({ t: Date.now(), user: user || 'system', action });
  if (l.length > 300) l.length = 300;
  saveLog(l);
}
function fmtLogTime(ts) {
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ---------- УВЕДОМЛЕНИЯ О БЛОКИРОВКЕ / УДАЛЕНИИ ---------- */
const NOTICE_KEY = 'nebula_ban_notices';
function loadNotices() {
  try { return JSON.parse(localStorage.getItem(NOTICE_KEY)) || {}; } catch (e) { return {}; }
}
function saveNotices(n) { safeSet(NOTICE_KEY, JSON.stringify(n)); }
function clearNotice(username) {
  const n = loadNotices();
  if (n[username]) { delete n[username]; saveNotices(n); }
}
function fmtNoticeDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function closeBanNotices() {
  document.querySelectorAll('.ban-notice').forEach(el => {
    const ov = el.closest('.status-editor-overlay');
    if (ov) ov.remove();
  });
}
function showAccountNotice(username) {
  closeBanNotices();
  const notices = loadNotices();
  let n = notices[username];
  if (!n) {
    const acc = accountByUsername(username);
    if (acc && acc.banned) {
      const bi = acc.banInfo || {};
      n = { type: 'ban', admin: bi.admin || '—', reason: bi.reason || '—', bannedAt: bi.bannedAt || 0, unbanAt: bi.unbanAt || null };
    } else return;
  }
  const isDel = n.type === 'delete';
  const ov = document.createElement('div');
  ov.className = 'status-editor-overlay';
  ov.innerHTML = `
    <div class="modal-box stickers-modal ban-notice">
      <h3>${isDel ? '⛔ Ваш аккаунт был удалён администрацией' : '⛔ Ваш аккаунт был заблокирован администрацией'}</h3>
      <div class="bn-row"><span>Администратор:</span><b>@${escapeHtml(n.admin || '—')}</b></div>
      <div class="bn-row"><span>Причина блокировки:</span><b>${escapeHtml(n.reason || '—')}</b></div>
      <div class="bn-row"><span>Дата разбана:</span><b>${isDel ? '—' : (n.unbanAt ? fmtNoticeDate(n.unbanAt) : 'Навсегда')}</b></div>
      <div class="bn-row"><span>Дата блокировки:</span><b>${fmtNoticeDate(n.bannedAt)}</b></div>
      <div class="btn-row" style="justify-content:center;margin-top:6px">
        <button class="btn btn-primary" id="bnOk">Понятно</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#bnOk').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}
function kickUser(username) {
  if (!username) return;
  let kicked = false;
  try {
    if (localStorage.getItem(SESSION_KEY) === username) {
      localStorage.removeItem(SESSION_KEY);
      kicked = true;
    }
  } catch (e) {}
  if (kicked && currentUser && currentUser.username === username) {
    markOffline(username);
    currentUser = null;
    state = buildInitialState();
    clearInterval(onlineTimer);
    closeSettings();
    $('#authForm').reset();
    showAuth('login');
    $('#authOverlay').classList.add('open');
    renderChatList();
    renderChat();
    toast('Вы были кикнуты администратором');
  }
}
function normAcc(acc) {
  if (!acc) return acc;
  if (!acc.badges) acc.badges = {};
  if (acc.banned === undefined) acc.banned = false;
  return acc;
}
function allChatsAcrossUsers() {
  const map = {};
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (s && s.chats) s.chats.forEach(c => { if (c) map[c.id] = c; });
  });
  return Object.values(map);
}
function uniqueChatsAcrossUsers() {
  const map = {};
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (s && s.chats) s.chats.forEach(c => { if (c) map[c.id] = c; });
  });
  return Object.values(map);
}
function deleteAccountEverywhere(username) {
  markUserDeleted(username);
  const d = loadAccounts();
  delete d.users[username];
  saveAccounts(d);
  try { localStorage.removeItem(stateKey(username)); } catch (e) {}
  if (MAIL_RELAY_URL) {
    try { cloudDelete(stateKey(username)); } catch (e) {}
    try { cloudDelete('tracks:' + username); } catch (e) {}
  }
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    const before = s.chats.length;
    s.chats = s.chats.filter(c => {
      if (c.type === 'private') return c.userId !== username;
      c.members = (c.members || []).filter(m => m !== username);
      c.admins = (c.admins || []).filter(m => m !== username);
      if (c.owner === username) c.owner = c.members.includes('me') ? 'me' : (c.members[0] || 'me');
      return c.members.length > 0;
    });
    if (folderHasOnlyDeleted(s)) s.folders = [];
    if (s.chats.length !== before) saveStateFor(u.username, s);
  });
}
function folderHasOnlyDeleted(s) {
  const ids = new Set((s.chats || []).map(c => c.id));
  return (s.folders || []).every(f => !(f.chatIds || []).some(id => ids.has(id)));
}
function deleteChatEverywhere(chatId) {  let removed = false;
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    const before = s.chats.length;
    s.chats = s.chats.filter(c => c.id !== chatId);
    if (s.chats.length !== before) {
      if (s.currentChatId === chatId) s.currentChatId = null;
      saveStateFor(u.username, s);
      removed = true;
    }
  });
  if (removed && MAIL_RELAY_URL) {
    cloudSave(cloudChatKey(chatId), JSON.stringify({ id: chatId, deleted: true, ts: Date.now() }));
  }
  return removed;
}
function renameChatEverywhere(chatId, name, handle, isChannel) {
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    const c = s.chats.find(x => x.id === chatId);
    if (c) {
      c.name = name;
      if (isChannel) c.handle = handle;
      saveStateFor(u.username, s);
    }
  });
}
function channelHandleTaken(handle, excludeId = null) {
  return uniqueChatsAcrossUsers().some(c => c.type === 'channel' && c.id !== excludeId && c.handle && c.handle.toLowerCase() === handle.toLowerCase());
}
function chatOwnerFor(chatId) {
  for (const u of accountsList()) {
    const s = getStateFor(u.username);
    if (s && s.chats && s.chats.some(c => c.id === chatId)) return u;
  }
  return null;
}
function adminChatCanonical(chatId) {
  return uniqueChatsAcrossUsers().find(c => c.id === chatId) || null;
}
function adminChatMembers(chat) {
  const ownerName = (chatOwnerFor(chat.id) || {}).username;
  return (chat.members || []).map(mid => mid === 'me' ? ownerName : mid).filter(Boolean);
}
function groupMemberEverywhere(chatId, action, username) {
  const canon = adminChatCanonical(chatId);
  if (!canon || canon.id === NEWS_CHAT_ID || canon.type === 'ai') return false;
  const ownerName = (chatOwnerFor(chatId) || {}).username;
  const canonMembers = (canon.members || []).map(m => m === 'me' ? ownerName : m).filter(Boolean);
  const canonAdmins = (canon.admins || []).map(m => m === 'me' ? ownerName : m).filter(Boolean);
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    let c = s.chats.find(x => x.id === chatId);
    if (action === 'add') {
      if (!c && u.username === username) {
        c = JSON.parse(JSON.stringify(canon));
        c.members = [username, ...canonMembers.filter(m => m !== username)];
        c.admins = canonAdmins.filter(a => a !== username);
        c.messages = [];
        c.unread = 1;
        s.chats.push(c);
      }
      if (c && !c.members.includes(username)) c.members.push(username);
    } else if (action === 'kick') {
      if (u.username === username) {
        s.chats = s.chats.filter(x => x.id !== chatId);
        s.pinned = (s.pinned || []).filter(p => p !== chatId);
        if (s.currentChatId === chatId) s.currentChatId = null;
      } else if (c) {
        c.members = (c.members || []).filter(m => m !== username);
        c.admins = (c.admins || []).filter(a => a !== username);
      }
    } else if (action === 'admin') {
      if (c && username !== ownerName) {
        c.admins = c.admins || [];
        if (c.admins.includes(username)) c.admins = c.admins.filter(a => a !== username);
        else c.admins.push(username);
      }
    }
    saveStateFor(u.username, s);
  });
  return true;
}
function renderAdminMembersPanel(panel, chat) {
  const members = adminChatMembers(chat).map(mid => accountByUsername(mid)).filter(Boolean);
  const ownerName = (chatOwnerFor(chat.id) || {}).username;
  const label = chat.type === 'group' ? 'участников' : 'подписчиков';
  panel.innerHTML = `
    <div class="am-head">${members.length} ${label}</div>
    ${members.map(u => {
      const isOwner = u.username === ownerName;
      const isAdmin = !isOwner && (chat.admins || []).includes(u.username);
      return `<div class="am-row">
        <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
        <span class="am-name">${displayName(u)} ${isOwner ? '<span class="tag owner">владелец</span>' : isAdmin ? '<span class="tag admin">админ</span>' : ''}</span>
        ${!isOwner ? `<button type="button" class="mini-btn" title="${isAdmin ? 'Снять с админов' : 'Сделать админом'}" data-am="admin" data-u="${u.username}"><svg viewBox="0 0 24 24"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></button>` : ''}
        ${!isOwner ? `<button type="button" class="mini-btn" title="Удалить из ${chat.type === 'group' ? 'группы' : 'канала'}" data-am="kick" data-u="${u.username}"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
      </div>`;
    }).join('')}
    <div class="am-add"><div class="am-search"></div></div>`;
  panel.querySelectorAll('[data-am]').forEach(btn => btn.addEventListener('click', () => {
    const u = btn.dataset.u;
    const fresh = adminChatCanonical(chat.id);
    if (!fresh) return;
    if (btn.dataset.am === 'kick') {
      if (!confirm(`Удалить @${u} из «${fresh.name}» у всех пользователей?`)) return;
      groupMemberEverywhere(fresh.id, 'kick', u);
      addLog(currentUser.username, `Удалил @${u} из «${fresh.name}»`);
      toast('Удалён', '@' + u);
    } else {
      groupMemberEverywhere(fresh.id, 'admin', u);
      addLog(currentUser.username, `Изменил права @${u} в «${fresh.name}»`);
      toast('Права обновлены', '@' + u);
    }
    renderChatList();
    renderChat();
    renderAdminMembersPanel(panel, adminChatCanonical(fresh.id) || fresh);
  }));
  const search = panel.querySelector('.am-search');
  if (search) {
    const beforeCount = accountsList().length;
    const pickerOpts = {
      checkable: false,
      selected: [],
      hint: 'Найдите пользователя, чтобы добавить',
      onPick: (uid) => {
        groupMemberEverywhere(chat.id, 'add', uid);
        addLog(currentUser.username, `Добавил @${uid} в «${chat.name}»`);
        toast('Добавлен', '@' + uid);
        renderChatList();
        renderChat();
        renderAdminMembersPanel(panel, adminChatCanonical(chat.id) || chat);
      },
    };
    renderSearchPicker(search, accountsList().filter(a => !members.some(m => m.username === a.username)), pickerOpts);
    refreshAccountsFromCloud().then(() => {
      if (accountsList().length > beforeCount) {
        const p2 = panel.querySelector('.am-search');
        if (p2) renderSearchPicker(p2, accountsList().filter(a => !members.some(m => m.username === a.username)), pickerOpts);
      }
    });
  }
}
function subscribeChannel(id) {
  const src = uniqueChatsAcrossUsers().find(c => c.id === id);
  if (!src) return;
  if (state.chats.some(c => c.id === id)) { selectChat(id); return; }
  if (src.access === 'private') return toast('Ошибка', 'Это приватная группа — войти можно только по приглашению');
  const copy = JSON.parse(JSON.stringify(src));
  copy.members = copy.members.includes('me') ? copy.members : ['me', ...copy.members];
  state.leftChats = state.leftChats || [];
  state.leftChats = state.leftChats.filter(x => x !== id);
  state.chats.push(copy);
  addLog(currentUser.username, src.type === 'channel'
    ? `Подписался на канал «${copy.name}»${copy.handle ? ' @' + copy.handle : ''}`
    : `Вступил в группу «${copy.name}»`);
  saveState();
  closeCreateModal();
  renderChatList();
  selectChat(id);
  toast(src.type === 'channel' ? 'Подписка оформлена' : 'Вы в группе', copy.name);
}

function buildInitialState() {
  return { chats: [], filter: 'all', currentChatId: null, search: '', pinned: [], folders: [], hidden: [], activeFolder: null };
}

/* ---------- Nebula News (канал для всех) ---------- */
const NEWS_CHAT_ID = 'nebula-news';
const NEWS_ACC = { id: 'NEBULA-NEWS000001', username: 'nebula-news', name: 'Nebula News', color: ['#6C5CE7', '#00CEC9'], avatar: { type: 'preset', index: 7 }, badges: {} };
function newsOwnerUsername() {
  const accs = accountsList();
  const owner = accs.find(a => String(a.username || '').toLowerCase() === 'noocord')
    || accs.find(a => String(a.id) === 'NEBULA-NOOCORD') || accs.find(a => String(a.id) === 'NEBULA-NOOCORDORIG') || accs.find(a => a.id === 1);
  if (owner) return owner.username;
  const admins = adminList();
  const ad = admins.map(u => accountByUsername(u)).filter(Boolean).sort((a, b) => (a.username || '').localeCompare(b.username || ''))[0];
  return ad ? ad.username : (accs[0] ? accs[0].username : 'admin');
}
function newsChannelData() {
  return {
    id: NEWS_CHAT_ID,
    type: 'channel',
    name: 'Nebula News',
    handle: 'nebula-news',
    desc: 'Официальные новости Nebula. Публикуют администраторы и создатель.',
    color: ['#6C5CE7', '#00CEC9'],
    owner: newsOwnerUsername(),
    admins: [newsOwnerUsername()],
    members: ['me'],
    protected: true,
    messages: [{ id: 'm' + Date.now(), from: newsOwnerUsername(), text: '👋 Добро пожаловать в Nebula News! Здесь публикуются официальные новости мессенджера.', time: new Date().toISOString(), read: true }],
  };
}
function ensureGlobalChats() {
  accountsList().forEach(u => {
    const st = (currentUser && currentUser.username === u.username && state) ? state : getStateFor(u.username);
    if (!st) return;
    if (!st.pinned) st.pinned = [];
    if (!st.hidden) st.hidden = [];
    if (!st.folders) st.folders = [];
    st.chats.forEach(c => {
      if (!c.dolphin) c.dolphin = { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 };
      if (c.type === 'private' && c.userId) {
        const want = privateChatId(u.username, c.userId);
        if (c.id && c.id !== want) c.id = want;
      }
    });

    let news = st.chats.find(c => c.id === NEWS_CHAT_ID);
    if (!news) {
      news = newsChannelData();
      news.dolphin = { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 };
      news.messages = news.messages.map(m => ({ ...m, id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6) }));
      st.chats.push(news);
    }
    news.protected = true;
    const newsAcc = u.username === (currentUser && currentUser.username) ? currentUser : accountByUsername(u.username);
    const newsFull = newsFullAccess(newsAcc);
    news.owner = newsFull ? 'me' : newsOwnerUsername();
    news.admins = newsFull ? ['me'] : [newsOwnerUsername()];
    news.type = 'channel';
    if (!news.dolphin) news.dolphin = { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 };
    if (!st.pinned.includes(NEWS_CHAT_ID)) st.pinned.push(NEWS_CHAT_ID);

    let ai = st.chats.find(c => c.id === AI_CHAT_ID);
    if (!ai) {
      ai = {
        id: AI_CHAT_ID,
        type: 'ai',
        name: 'Nebula AI',
        handle: 'nebula-ai',
        protected: true,
        members: ['me'],
        dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
        messages: [{ id: 'm' + Date.now(), from: 'nebula', text: 'Привет! Я Nebula AI — встроенный ИИ-ассистент мессенджера 🤖 Задай вопрос или введи /помощь.', time: new Date().toISOString(), read: true }],
      };
      st.chats.push(ai);
    }
    ai.protected = true;
    ai.type = 'ai';
    if (!ai.dolphin) ai.dolphin = { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 };
    if (!st.pinned.includes(AI_CHAT_ID)) st.pinned.push(AI_CHAT_ID);

    let saved = st.chats.find(c => c.type === 'saved');
    if (!saved) {
      saved = {
        id: 'saved_' + u.username,
        type: 'saved',
        name: 'Избранное',
        protected: true,
        members: ['me'],
        messages: [{ id: 'm' + Date.now(), from: 'me', text: '💾 Это ваше избранное — личные заметки и закладки. Сообщения видны только вам.', time: new Date().toISOString(), read: true, sent: true }],
      };
      st.chats.unshift(saved);
    }
    saved.protected = true;
    saved.type = 'saved';
    if (!st.pinned.includes(saved.id)) st.pinned.push(saved.id);

    (st.chats || []).forEach(c => {
      (c.messages || []).forEach(m => {
        if (m.kind === 'call_in' && !m.dismissed && Date.now() - new Date(m.time).getTime() > 5 * 60000) m.dismissed = true;
      });
    });

    st.hidden = st.hidden.filter(id => id !== NEWS_CHAT_ID && id !== AI_CHAT_ID);
    saveStateFor(u.username, st);
  });
}
function syncNewsMessageEverywhere(msg) {
  accountsList().forEach(u => {
    if (u.username === currentUser.username) return;
    const st = getStateFor(u.username);
    if (!st || !st.chats) return;
    const chat = st.chats.find(c => c.id === NEWS_CHAT_ID);
    if (chat) {
      chat.messages = chat.messages || [];
      const copy = { ...msg, read: false };
      chat.messages.push(copy);
      if (chat.id !== st.currentChatId) chat.unread = (chat.unread || 0) + 1;
      saveStateFor(u.username, st);
    }
  });
}
function syncNewsDeleteEverywhere(msgId) {
  accountsList().forEach(u => {
    if (u.username === currentUser.username) return;
    const st = getStateFor(u.username);
    if (!st || !st.chats) return;
    const chat = st.chats.find(c => c.id === NEWS_CHAT_ID);
    if (chat && chat.messages && chat.messages.some(m => m.id === msgId)) {
      chat.messages = chat.messages.filter(m => m.id !== msgId);
      saveStateFor(u.username, st);
    }
  });
}

/* ---------- ТЕХ ПОДДЕРЖКА (тикеты) ---------- */
const TICKETS_KEY = 'nebula_tickets_v1';
const TICKETS_CLOUD_KEY = 'tickets';
const TICKET_TOPICS = ['Проблема с аккаунтом', 'Синхронизация и облако', 'Жалоба на пользователя', 'Ошибка в работе', 'Другое'];
const TICKET_TOPIC_ICONS = { 'Проблема с аккаунтом': '👤', 'Синхронизация и облако': '☁️', 'Жалоба на пользователя': '🚨', 'Ошибка в работе': '🐞', 'Другое': '💬' };
const TICKET_STATUS = { open: 'Открыт', work: 'В работе', done: 'Решён', closed: 'Закрыт' };
const MAX_ACTIVE_TICKETS = 5;
const TRACKS_MAX = 20;
const TRACK_MAX_BYTES = 3670016;
const TRACK_TOTAL_MAX = 12000000;
let ticketsPushTimer = null;
let tracksPushTimer = null;
let supportView = 'list';
let supportTicketId = null;
let supportFilter = 'all';

function ticketStatusLabel(s) { return TICKET_STATUS[s] || 'Открыт'; }
function loadTickets() {
  try { return JSON.parse(localStorage.getItem(TICKETS_KEY)) || {}; } catch (e) { return {}; }
}
function saveTickets(t) {
  if (safeSet(TICKETS_KEY, JSON.stringify(t))) {
    scheduleCloudBackup();
    scheduleTicketsPush();
  }
}
function scheduleTicketsPush() {
  if (ticketsPushTimer) clearTimeout(ticketsPushTimer);
  ticketsPushTimer = setTimeout(() => { ticketsPushTimer = null; pushTicketsToCloud(); }, 1500);
}
function pushTicketsToCloud() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve(false);
  const local = loadTickets();
  const jobs = Object.keys(local).map(id => {
    const t = local[id];
    if (!t || !t.id) return Promise.resolve(false);
    return cloudSave('ticket:' + id, JSON.stringify(t));
  });
  return Promise.all(jobs).then(() => true).catch(() => false);
}
function syncCloudTickets() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve();
  return cloudListKeys('ticket:').then(keys => {
    if (!keys || !keys.length) return;
    return Promise.all(keys.map(k => cloudLoad(k)));
  }).then(raws => {
    if (!raws) return;
    const local = loadTickets();
    const merged = Object.assign({}, local);
    let changed = false;
    raws.forEach(r => {
      if (!r) return;
      let t; try { t = JSON.parse(r.d); } catch (e) { return; }
      if (!t || !t.id) return;
      if (!merged[t.id] || (t.updatedAt || 0) > (merged[t.id].updatedAt || 0)) { merged[t.id] = t; changed = true; }
    });
    if (changed) saveTickets(merged);
  }).catch(() => {});
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function createdTodayCount(tickets) {
  const st = startOfToday();
  return Object.values(tickets).filter(x => x.author === currentUser.username && (x.createdAt || new Date(x.time).getTime()) >= st).length;
}
function supportCreateFormHtml() {
  const t = loadTickets();
  const createdToday = createdTodayCount(t);
  const remaining = Math.max(0, MAX_ACTIVE_TICKETS - createdToday);
  const locked = remaining === 0;
  return `
    <div class="manage-section">
      <h4>Создать тикет <span class="ticket-limit ${locked ? 'ticket-limit-full' : ''}">${locked ? 'Лимит на сегодня исчерпан' : 'Сегодня осталось: ' + remaining + ' из ' + MAX_ACTIVE_TICKETS}</span></h4>
      <div class="admin-hint">Можно создать не больше ${MAX_ACTIVE_TICKETS} тикетов в день — счётчик сбрасывается каждый день в полночь</div>
      <select class="support-topic" ${locked ? 'disabled' : ''}>${TICKET_TOPICS.map(x => `<option>${x}</option>`).join('')}</select>
      <textarea class="support-text" rows="3" maxlength="500" placeholder="Опишите вашу проблему..." ${locked ? 'disabled' : ''}></textarea>
      <button type="button" class="btn btn-primary support-create" ${locked ? 'disabled style="opacity:.5"' : ''}>${locked ? 'Лимит тикетов достигнут' : 'Отправить тикет'}</button>
    </div>`;
}
function supportTicketListHtml() {
  const t = loadTickets();
  const mine = Object.values(t).filter(x => x.author === currentUser.username)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const createdToday = createdTodayCount(t);
  const cnt = s => mine.filter(x => x.status === s).length;
  const form = supportCreateFormHtml();
  const chips = `
    <div class="st-chips">
      <span class="st-chip">Открыт: ${cnt('open')}</span>
      <span class="st-chip">В работе: ${cnt('work')}</span>
      <span class="st-chip">Решён: ${cnt('done')}</span>
      <span class="st-chip">Закрыт: ${cnt('closed')}</span>
      <span class="st-chip st-chip-accent">Открыто сегодня: ${createdToday}/${MAX_ACTIVE_TICKETS}</span>
    </div>`;
  const list = mine.length ? mine.map(x => {
    const author = accountByUsername(x.author);
    return `
    <div class="support-ticket" data-tid="${x.id}">
      <div class="st-head">
        <span class="avatar" style="${avatarStyle(author)}">${avatarInnerHtml(author)}</span>
        <div class="st-info">
          <div class="st-topic">${TICKET_TOPIC_ICONS[x.topic] || '💬'} ${escapeHtml(x.topic)}</div>
          <div class="st-meta">${fmtTime(x.time)} · ${(x.messages || []).length} сообщ.${x.assignee ? ' · отвечает @' + escapeHtml(x.assignee) : ''}${x.doneBy ? ' · решил @' + escapeHtml(x.doneBy) : ''}</div>
        </div>
        <span class="support-status st-${x.status}">${ticketStatusLabel(x.status)}</span>
      </div>
      <div class="st-text">${escapeHtml(shortText(x.text, 90))}</div>
      <div class="st-actions">
        <button type="button" class="btn btn-primary st-open">Открыть чат</button>
        ${x.status === 'closed' ? '<button type="button" class="btn st-reopen">Открыть заново</button>' : ''}
      </div>
    </div>`;
  }).join('') : '<div class="empty-list">У вас пока нет тикетов</div>';
  return form + `<div class="manage-section"><h4>Мои тикеты</h4>${chips}${list}</div>`;
}
function supportStaffHtml() {
  const all = Object.values(loadTickets()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const counts = s => all.filter(x => x.status === s).length;
  const tabs = ['all', 'open', 'work', 'done', 'closed'].map(s => `
    <button type="button" class="sf-tab ${supportFilter === s ? 'on' : ''}" data-f="${s}">${s === 'all' ? 'Все' : TICKET_STATUS[s]} ${s === 'all' ? all.length : counts(s)}</button>`).join('');
  const form = supportCreateFormHtml();
  const tabsHtml = `<div class="sf-tabs">${tabs}</div>`;
  if (!all.length) return form + tabsHtml + '<div class="empty-list">Пока нет ни одного тикета</div>';
  const list = all.filter(x => supportFilter === 'all' || x.status === supportFilter).map(x => {
    const author = accountByUsername(x.author);
    return `
      <div class="support-ticket" data-tid="${x.id}">
        <div class="st-head">
          <span class="avatar" style="${avatarStyle(author)}">${avatarInnerHtml(author)}</span>
          <div class="st-info">
            <div class="st-topic">${TICKET_TOPIC_ICONS[x.topic] || '💬'} ${escapeHtml(x.topic)}</div>
            <div class="st-meta">От @${escapeHtml(x.author)}${author ? ' · ' + escapeHtml(author.name) : ''} · ${fmtTime(x.time)}${x.assignee ? ' · в работе у @' + escapeHtml(x.assignee) : ''}${x.doneBy ? ' · решил @' + escapeHtml(x.doneBy) + ' · ' + fmtTime(x.doneAt) : ''}</div>
          </div>
          <span class="support-status st-${x.status}">${ticketStatusLabel(x.status)}</span>
        </div>
        <div class="st-text">${escapeHtml(shortText(x.text, 100))}</div>
        <div class="st-actions">
          <button type="button" class="btn btn-primary st-open">Открыть чат</button>
          ${x.status === 'open' ? '<button type="button" class="btn st-work">Взять в работу</button>' : ''}
          ${x.status === 'open' || x.status === 'work' ? '<button type="button" class="btn st-done">Решить</button>' : ''}
          ${x.status !== 'closed'
            ? '<button type="button" class="btn btn-danger st-close">Закрыть</button>'
            : '<button type="button" class="btn st-reopen">Открыть заново</button>'}
        </div>
      </div>`;
  }).join('');
  return form + tabsHtml + (list || '<div class="empty-list">Нет тикетов с таким статусом</div>');
}
function supportStatsHtml() {
  const t = Object.values(loadTickets()).filter(x => x.status === 'done' && x.doneBy && x.doneAt);
  if (!t.length) return '<div class="empty-list">Пока никто не решил ни одного тикета</div>';
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const week0 = day0 - ((now.getDay() + 6) % 7) * 86400000;
  const month0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const year0 = new Date(now.getFullYear(), 0, 1).getTime();
  const st = {};
  t.forEach(x => {
    const u = x.doneBy, at = x.doneAt;
    if (!st[u]) st[u] = { day: 0, week: 0, month: 0, year: 0, all: 0 };
    st[u].all++;
    if (at >= day0) st[u].day++;
    if (at >= week0) st[u].week++;
    if (at >= month0) st[u].month++;
    if (at >= year0) st[u].year++;
  });
  return Object.keys(st).sort((a, b) => st[b].all - st[a].all).map(n => {
    const acc = accountByUsername(n);
    const s = st[n];
    const cells = [['За день', s.day], ['За неделю', s.week], ['За месяц', s.month], ['За год', s.year], ['Всего', s.all]]
      .map(([l, v]) => `<div class="sup-cell"><b>${v}</b><span>${l}</span></div>`).join('');
    return `
      <div class="sup-card">
        <div class="sup-card-head">
          <span class="avatar" style="${avatarStyle(acc)}">${avatarInnerHtml(acc)}</span>
          <div class="sup-card-id">
            <div class="sup-card-name">${escapeHtml(acc ? acc.name : n)}</div>
            <div class="sup-card-sub">@${escapeHtml(n)}</div>
          </div>
        </div>
        <div class="sup-card-cells">${cells}</div>
      </div>`;
  }).join('');
}
function supportChatHtml(ticket) {
  const author = accountByUsername(ticket.author);
  const msgs = (ticket.messages || []).map(m => {
    if (m.from === 'system') return `<div class="support-sys">${escapeHtml(m.text)}</div>`;
    const isAuthor = m.from === ticket.author;
    return `<div class="support-msg ${isAuthor ? 'auth' : 'sup'}">
      <span class="sm-name">${isAuthor ? escapeHtml(author ? author.name : ticket.author) : 'Тех поддержка'}</span>
      <div class="sm-text">${linkifyChannels(escapeHtml(m.text))}</div>
      <span class="sm-time">${fmtTime(m.time)}</span>
    </div>`;
  }).join('');
  return `
    <div class="support-chat-head">
      <button type="button" class="btn st-back">← К тикетам</button>
      <div class="sch-info"><b>${escapeHtml(ticket.topic)}</b><span class="support-status st-${ticket.status}">${ticketStatusLabel(ticket.status)}</span></div>
    </div>
    <div class="support-chat-msgs">${msgs || '<div class="empty-list">Сообщений пока нет</div>'}</div>
    <div class="support-chat-input">
      <input type="text" class="support-input" maxlength="500" placeholder="Напишите сообщение..." autocomplete="off">
      <button type="button" class="btn btn-primary support-send">Отправить</button>
    </div>`;
}
function renderSupportModal(ov) {
  const staff = isSupport(currentUser);
  if (supportView === 'chat' && !supportTicketId) supportView = 'list';
  let bodyHtml;
  if (supportView === 'chat' && supportTicketId) {
    const t = loadTickets()[supportTicketId];
    bodyHtml = t ? supportChatHtml(t) : '<div class="empty-list">Тикет не найден</div>';
  } else {
    bodyHtml = staff ? supportStaffHtml() : supportTicketListHtml();
  }
  ov.innerHTML = `
    <div class="modal-box support-modal">
      <div class="support-hero">
        <span class="support-hero-ico">🎧</span>
        <div class="support-hero-txt">
          <h3>Тех поддержка</h3>
          <p>${staff ? 'Вы — сотрудник тех поддержки. Вам доступны все тикеты' : 'Опишите проблему — мы ответим в чате тикета'}</p>
        </div>
        <button type="button" class="pm-x support-hero-x" title="Закрыть">✕</button>
      </div>
      ${bodyHtml}
    </div>`;
  const closeBtn = ov.querySelector('.support-hero-x');
  if (closeBtn) closeBtn.addEventListener('click', closeSupportModal);
  const inp = ov.querySelector('.support-input');
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const s = ov.querySelector('.support-send'); if (s) s.click(); }
    });
    inp.focus();
  }
}
function openSupportModal() {
  if (!currentUser) return;
  let ov = $('#supportModal');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'supportModal';
  document.body.appendChild(ov);
  renderSupportModal(ov);
  ov.classList.add('open');
  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeSupportModal();
  });
  ov.addEventListener('click', supportModalClick);
}
function closeSupportModal() {
  const ov = $('#supportModal');
  if (ov) ov.remove();
}
function setTicketStatus(id, status, actionText) {
  const t = loadTickets();
  const ticket = t[id];
  if (!ticket) return;
  ticket.status = status;
  if (status === 'work') ticket.assignee = currentUser.username;
  if (status === 'done') { ticket.doneBy = currentUser.username; ticket.doneAt = Date.now(); }
  ticket.messages = ticket.messages || [];
  ticket.messages.push({ from: 'system', text: `${actionText} — @${currentUser.username}`, time: new Date().toISOString() });
  ticket.updatedAt = Date.now();
  saveTickets(t);
  addLog(currentUser.username, `${actionText} — тикет «${ticket.topic}» (@${ticket.author})`);
  toast('Статус обновлён', ticketStatusLabel(status));
}
function supportModalClick(e) {
  const ov = $('#supportModal');
  if (!ov) return;
  const create = e.target.closest('.support-create');
  if (create) {
    const topic = ov.querySelector('.support-topic').value;
    const text = ov.querySelector('.support-text').value.trim();
    if (!text) return toast('Ошибка', 'Опишите вашу проблему');
    const t = loadTickets();
    if (createdTodayCount(t) >= MAX_ACTIVE_TICKETS) return toast('Лимит', `Максимум ${MAX_ACTIVE_TICKETS} тикетов в день — лимит обновится завтра в полночь`);
    const id = 't' + Date.now() + Math.random().toString(36).slice(2, 5);
    t[id] = {
      id, author: currentUser.username, topic, text,
      time: new Date().toISOString(), status: 'open', assignee: null,
      messages: [{ from: 'system', text: 'Тикет создан', time: new Date().toISOString() }],
      updatedAt: Date.now(),
    };
    saveTickets(t);
    addLog(currentUser.username, `Создал тикет в тех поддержку: «${topic}»`);
    toast('Тикет создан', 'Тех поддержка ответит в чате тикета');
    renderSupportModal(ov);
    return;
  }
  const open = e.target.closest('.st-open');
  if (open) {
    const card = open.closest('.support-ticket');
    if (card) { supportTicketId = card.dataset.tid; supportView = 'chat'; renderSupportModal(ov); }
    return;
  }
  const back = e.target.closest('.st-back');
  if (back) { supportView = 'list'; supportTicketId = null; renderSupportModal(ov); return; }
  const send = e.target.closest('.support-send');
  if (send) {
    const inp = ov.querySelector('.support-input');
    const text = inp.value.trim();
    if (!text) return;
    const t = loadTickets();
    const ticket = t[supportTicketId];
    if (!ticket) return;
    ticket.messages = ticket.messages || [];
    ticket.messages.push({ from: currentUser.username, text, time: new Date().toISOString() });
    if (ticket.status === 'closed' && currentUser.username === ticket.author) {
      ticket.status = 'open';
      ticket.messages.push({ from: 'system', text: 'Тикет открыт заново автором', time: new Date().toISOString() });
    }
    ticket.updatedAt = Date.now();
    saveTickets(t);
    renderSupportModal(ov);
    return;
  }
  const work = e.target.closest('.st-work');
  if (work) { setTicketStatus(work.closest('.support-ticket').dataset.tid, 'work', 'Взял тикет в работу'); renderSupportModal(ov); return; }
  const tab = e.target.closest('.sf-tab');
  if (tab) { supportFilter = tab.dataset.f; renderSupportModal(ov); return; }
  const done = e.target.closest('.st-done');
  if (done) { setTicketStatus(done.closest('.support-ticket').dataset.tid, 'done', 'Тикет решён'); renderSupportModal(ov); return; }
  const closeT = e.target.closest('.st-close');
  if (closeT) { setTicketStatus(closeT.closest('.support-ticket').dataset.tid, 'closed', 'Тикет закрыт'); renderSupportModal(ov); return; }
  const reopen = e.target.closest('.st-reopen');
  if (reopen) { setTicketStatus(reopen.closest('.support-ticket').dataset.tid, 'open', 'Тикет открыт заново'); renderSupportModal(ov); return; }
}

/* ---------- МОИ ТРЕКИ (MP3) ---------- */
function loadTracks(u) {
  try { return JSON.parse(localStorage.getItem('nebula_tracks_' + u)) || []; } catch (e) { return []; }
}
function writeTracksLocal(u, list) {
  if (safeSet('nebula_tracks_' + u, JSON.stringify(list)) && u === currentUser.username) scheduleCloudBackup();
}
function saveTracks(u, list) {
  if (safeSet('nebula_tracks_' + u, JSON.stringify(list))) {
    if (u === currentUser.username) scheduleTracksPush();
  }
}
function scheduleTracksPush() {
  if (tracksPushTimer) clearTimeout(tracksPushTimer);
  tracksPushTimer = setTimeout(() => { tracksPushTimer = null; pushTracksToCloud(); }, 1500);
}
function pushTracksToCloud() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve(false);
  return cloudSave('tracks:' + currentUser.username, JSON.stringify(loadTracks(currentUser.username)));
}
function syncCloudTracks() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve();
  return cloudLoad('tracks:' + currentUser.username).then(r => {
    if (!r || !r.d) return;
    try {
      const c = JSON.parse(r.d);
      if (!Array.isArray(c)) return;
      const local = loadTracks(currentUser.username);
      const latest = a => a.reduce((m, x) => Math.max(m, x.added || 0), 0);
      const cLatest = latest(c), lLatest = latest(local);
      if (cLatest > lLatest) {
        if (JSON.stringify(c) !== JSON.stringify(local)) writeTracksLocal(currentUser.username, c);
      } else if (cLatest < lLatest) {
        pushTracksToCloud();
      }
    } catch (e) {}
  }).catch(() => {});
}
function tracksListHtml() {
  const list = loadTracks(currentUser.username);
  return list.map((t, i) => `
    <div class="track-item">
      <span class="track-num">${i + 1}</span>
      <div class="track-info">
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-meta">${fmtBytes(t.size)} · ${new Date(t.added).toLocaleDateString('ru-RU')}</div>
        <audio controls preload="none" src="${t.data}"></audio>
      </div>
      <button type="button" class="btn btn-danger track-del" data-i="${i}">Удалить</button>
    </div>`).join('') || '<div class="empty-list">Пока нет треков</div>';
}
function renderTracksModal(ov) {
  const list = loadTracks(currentUser.username);
  ov.innerHTML = `
    <div class="modal-box support-modal tracks-modal">
      <div class="pm-head">
        <span class="pm-ico">🎵</span>
        <div class="pm-head-txt">
          <h3>Мои треки (MP3)</h3>
          <p>Показываются в вашей карточке у других пользователей</p>
        </div>
        <button type="button" class="pm-x tr-close" title="Закрыть">✕</button>
      </div>
      <div class="manage-section">
        <h4>Добавить трек</h4>
        <div class="admin-hint">Файл до ${fmtMb(TRACK_MAX_BYTES)} (песня до ~15 минут) · максимум ${TRACKS_MAX} треков · всего до ${fmtMb(TRACK_TOTAL_MAX)}</div>
        <label class="track-upload">
          <svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
          <span>Выбрать MP3-файл</span>
          <input type="file" class="track-file" accept="audio/mpeg,audio/mp3,.mp3">
        </label>
      </div>
      <div class="manage-section">
        <h4>Мои треки (${list.length}/${TRACKS_MAX})</h4>
        ${tracksListHtml()}
      </div>
    </div>`;
  const closeBtn = ov.querySelector('.tr-close');
  if (closeBtn) closeBtn.addEventListener('click', () => ov.remove());
  const audios = Array.prototype.slice.call(ov.querySelectorAll('.track-item audio'));
  audios.forEach((a, i) => a.addEventListener('ended', () => {
    const n = audios[i + 1];
    if (n) n.play().catch(() => {});
  }));
  const fileInput = ov.querySelector('.track-file');
  if (fileInput) fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/\.mp3$/i.test(f.name) && f.type !== 'audio/mpeg') return toast('Ошибка', 'Нужен файл MP3');
    if (f.size > TRACK_MAX_BYTES) return toast('Лимит', 'Файл больше ' + fmtMb(TRACK_MAX_BYTES) + ' (примерно ' + Math.round(f.size / 1024 / 1024 * 10) / 10 + ' МБ)');
    const list = loadTracks(currentUser.username);
    if (list.length >= TRACKS_MAX) return toast('Лимит', 'Максимум ' + TRACKS_MAX + ' треков');
    const total = list.reduce((n, x) => n + x.data.length, 0);
    const rd = new FileReader();
    rd.onload = () => {
      const data = String(rd.result);
      if (total + data.length > TRACK_TOTAL_MAX) return toast('Лимит', 'Суммарный объём треков больше ' + fmtMb(TRACK_TOTAL_MAX) + ' — удалите старые треки');
      list.push({ name: f.name.replace(/\.mp3$/i, ''), size: f.size, data, added: Date.now() });
      saveTracks(currentUser.username, list);
      renderTracksModal(ov);
      toast('Трек добавлен', f.name);
    };
    rd.onerror = () => toast('Ошибка', 'Не удалось прочитать файл');
    rd.readAsDataURL(f);
  });
}
function openTracksModal() {
  if (!currentUser) return;
  let ov = $('#tracksModal');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'tracksModal';
  document.body.appendChild(ov);
  renderTracksModal(ov);
  ov.classList.add('open');
  ov.addEventListener('click', (e) => {
    if (e.target === ov) ov.remove();
  });
  ov.addEventListener('click', (e) => {
    const del = e.target.closest('.track-del');
    if (del) {
      const list = loadTracks(currentUser.username);
      list.splice(+del.dataset.i, 1);
      saveTracks(currentUser.username, list);
      renderTracksModal(ov);
      toast('Трек удалён');
    }
  });
}

function groupOwnerName(chat) {
  return chat.owner === 'me' ? currentUser.username : chat.owner;
}
function groupRealMembers(chat) {
  const owner = groupOwnerName(chat);
  return (chat.members || []).map(m => m === 'me' ? owner : m).filter(Boolean);
}
function distributeGroupToMembers(chat, ownerName) {
  const realMembers = groupRealMembers(chat);
  realMembers.forEach(name => {
    if (name === ownerName) return;
    const st = getStateFor(name);
    if (!st || !st.chats) return;
    let c2 = st.chats.find(x => x.id === chat.id);
    if (!c2) {
      c2 = {
        id: chat.id, type: chat.type, name: chat.name, desc: chat.desc, color: chat.color,
        handle: chat.handle, access: chat.access, whoCanInvite: chat.whoCanInvite,
        avatar: chat.avatar ? JSON.parse(JSON.stringify(chat.avatar)) : null,
        owner: ownerName, admins: [ownerName], members: realMembers.slice(),
        dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
        messages: (chat.messages || []).map(m => JSON.parse(JSON.stringify(m))),
      };
      st.chats.unshift(c2);
    } else {
      c2.members = realMembers.slice();
      c2.admins = [ownerName];
      if (c2.owner === 'me') c2.owner = ownerName;
    }
    saveStateFor(name, st);
  });
}
function canWriteTo(sender, recipient) {
  const wcw = (recipient.settings && recipient.settings.whoCanWrite) || 'all';
  if (wcw === 'all') return true;
  if (wcw === 'nobody') return false;
  const senderAcc = accountByUsername(sender);
  const talked = (recipient.receivedFrom || []).includes(sender)
    || (senderAcc && (senderAcc.receivedFrom || []).includes(recipient.username));
  return talked;
}
function syncGroupMessageEverywhere(chat, msg, sender) {
  const realMembers = groupRealMembers(chat);
  realMembers.forEach(name => {
    if (name === sender) return;
    const st = getStateFor(name);
    if (!st || !st.chats) return;
    const c2 = st.chats.find(x => x.id === chat.id);
    if (c2 && !(c2.messages || []).some(m => m.id === msg.id)) {
      c2.messages = c2.messages || [];
      const copy = JSON.parse(JSON.stringify(msg));
      if (copy.from === 'me') copy.from = sender;
      c2.messages.push(copy);
      if (c2.id !== st.currentChatId) c2.unread = (c2.unread || 0) + 1;
      saveStateFor(name, st);
    }
  });
}
function syncPrivateMessageEverywhere(chat, msg, sender) {
  const other = accountByUsername(chat.userId);
  if (!other || other.isBot) return;
  if (!canWriteTo(sender, other)) return;
  const st = getStateFor(other.username);
  if (!st) return;
  if (!st.chats) st.chats = [];
  let c2 = st.chats.find(x => x.type === 'private' && x.userId === sender);
  if (!c2) {
    c2 = {
      id: privateChatId(sender, other.username),
      type: 'private',
      userId: sender,
      dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
      messages: [],
    };
    st.chats.push(c2);
  }
  if (!(c2.messages || []).some(m => m.id === msg.id)) {
    c2.messages = c2.messages || [];
    const copy = JSON.parse(JSON.stringify(msg));
    if (copy.from === 'me') copy.from = sender;
    c2.messages.push(copy);
    if (c2.id !== st.currentChatId) c2.unread = (c2.unread || 0) + 1;
    saveStateFor(other.username, st);
  }
}

/* ---------- Пользователи / хелперы ---------- */
function userById(id) {
  if (id === 'me') return currentUser;
  return accountByUsername(id);
}
function chatTitle(chat) {
  if (chat.type === 'private') {
    const u = userById(chat.userId);
    return u ? u.name : 'Пользователь';
  }
  if (chat.type === 'ai') return 'Nebula AI';
  if (chat.type === 'saved') return 'Избранное';
  return chat.name;
}
function accFromChat(chat) {
  if (chat.type === 'private') return userById(chat.userId);
  if (chat.type === 'ai') return NEBULA_ACC;
  if (chat.type === 'saved') return currentUser;
  return { name: chat.name, color: chat.color, avatar: chat.avatar || null };
}

function avatarStyle(acc) {
  if (acc && acc.avatar && acc.avatar.type === 'preset' && PRESET_AVATARS[acc.avatar.index]) {
    const p = PRESET_AVATARS[acc.avatar.index];
    return `--c1:${p.c1};--c2:${p.c2}`;
  }
  const c = (acc && acc.color) || ['#6C5CE7', '#8E7BFF'];
  return `--c1:${c[0]};--c2:${c[1]}`;
}
function avatarInnerHtml(acc) {
  if (!acc) return '?';
  if (acc.avatar && acc.avatar.type === 'upload' && acc.avatar.dataUrl) {
    return `<img src="${acc.avatar.dataUrl}" alt="">`;
  }
  if (acc.avatar && acc.avatar.type === 'preset' && PRESET_AVATARS[acc.avatar.index]) {
    return PRESET_AVATARS[acc.avatar.index].g;
  }
  if (acc.isBot && acc.bot && acc.bot.emoji) return acc.bot.emoji;
  return escapeHtml((acc.name || '?')[0].toUpperCase());
}
function avatarHtml(acc, cls = '', frame = '') {
  return `<span class="avatar ${cls} ${frame ? 'framed frame-' + frame : ''}" style="${avatarStyle(acc)}">${avatarInnerHtml(acc)}</span>`;
}

/* ---------- БЕЙДЖИ ---------- */
function badgeHtml(acc) {
  if (!acc) return '';
  const b = acc.badges || {};
  let s = '';
  if (b.scam) s += '<span class="badge badge-scam">SCAM</span>';
  if (b.admin) s += '<span class="badge badge-admin">АДМИН</span>';
  if (b.owner) s += '<span class="badge badge-owner" title="Владелец мессенджера">ВЛАДЕЛЕЦ</span>';
  if (b.tester) s += '<span class="badge badge-tester">ТЕСТЕР</span>';
  if (b.blue) s += `<span class="badge badge-verify" title="Аккаунт верифицирован">${CHECK_ICON}</span>`;
  if (b.gray) s += '<span class="badge badge-verify-gray" title="Аккаунт верифицирован">' + CHECK_ICON + '</span>';
  if (b.clock) s += '<span class="badge badge-clock" title="Часы">🕐</span>';
  return s;
}
function displayName(acc) {
  return acc ? escapeHtml(acc.name) + badgeHtml(acc) : 'Пользователь';
}
function chatTitleHtml(chat) {
  if (chat.type === 'private') {
    const u = userById(chat.userId);
    return u ? displayName(u) : 'Пользователь';
  }
  return escapeHtml(chatTitle(chat));
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
}
function fmtDateGroup(iso) {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === yest.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function lastMessage(chat) { return chat.messages.length ? chat.messages[chat.messages.length - 1] : null; }
function lastMessagePreview(chat) {
  const lm = lastMessage(chat);
  if (!lm) return 'Нет сообщений';
  if (lm.from === 'system') {
    if (lm.kind === 'call_missed') return '📵 Пропущенный звонок';
    if (lm.kind === 'call_in') return '📞 Входящий звонок';
    if (lm.kind === 'call_declined') return '❌ Вызов отклонён';
    if (lm.kind === 'call_ended') return '✅ ' + lm.text;
    return lm.text;
  }
  const md = mediaLabel(lm);
  const st = lm.sticker ? '[Стикер]' : lm.poll ? '[Опрос]' : lm.contact ? '[Контакт]' : '';
  const txt = st || (md ? (lm.text ? md + ' ' + lm.text : md) : lm.text);
  return (lm.from === 'me' ? 'Вы: ' : '') + txt;
}
function unreadCount(chat) { return chat.unread || 0; }

const TYPE_ICONS = {
  group: '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
  channel: '<svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S8.33 13 7.5 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/></svg>',
  saved: '<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>',
};

/* ---------- NEBULA AI ---------- */
const AI_CHAT_ID = 'ai';
function aiDelay() { return window.__AI_DELAY || 420; }
const NEBULA_ACC = { id: 'NEBULA-NEBULA000001', username: 'nebula', name: 'Nebula AI', color: ['#6C5CE7', '#8E7BFF'], avatar: { type: 'preset', index: 1 }, badges: {} };

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const AI_FACTS = [
  'дельфины спят с одним открытым глазом — одно полушарие мозга всегда бодрствует',
  'у осьминога три сердца и голубая кровь',
  'мёд никогда не портится — археологи находили съедобный мёд из древних гробниц',
  'бананы — это ягоды, а клубника — нет',
  'человеческое тело состоит примерно из 60% воды',
  'в космосе можно увидеть китайскую стену только с очень низкой орбиты, это миф',
  'скорость света — около 300 000 км/с, этого хватает, чтобы облететь Землю 7,5 раз за секунду',
  'у улиток около 25 000 зубов, но они не умеют жевать',
  'страусы не прячут голову в песок, но бегают быстрее 70 км/ч',
  'за один вдох вы вдыхаете около 10^22 молекул, среди них почти наверняка есть молекулы, выдохнутые Юлием Цезарем',
  'буква «ё» в русском алфавите появилась всего около 240 лет назад',
  'Nebula — латинское слово, означающее «туман», а ещё это название мессенджера, в котором мы общаемся 🌌',
];
const AI_JOKES = [
  'Программист попросил у библиотекаря книгу «Как научиться терпению». Библиотекарь сказал: «Она на месте через 2 недели».',
  '— Почему программист не пошёл на работу? — Он удалил свою папку с причёской.',
  '— Что такое идеальный брак? — Когда жена говорит мужу, что в доме кто-то есть, а муж отвечает: «а сколько их?»',
  'Встречаются два нейросетевых чат-бота. Один другому: «Ты сегодня какой-то галлюцинирующий»',
  '— Алло, это нейросеть? — Да. — Выпей стакан воды. У ИИ пока нет рта, но он оценил заботу.',
  'Заходит байт в бар. Бармен говорит: «Извини, у нас по байтам не обслуживаем». Байт: «Ладно, я укушу себя и стану полубайтовым»',
];
const AI_QUOTES = [
  'Лучший способ предсказать будущее — создать его. — Питер Друкер',
  'Единственный способ делать великие дела — любить то, что вы делаете. — Стив Джобс',
  'Если у вас нет ошибок, вы просто недостаточно стараетесь. — старая поговорка',
  'Код — это как стихи: его надо писать с душой.',
  'Чем больше я учусь, тем яснее понимаю, как мало я знаю. — Сократ',
  'Не бойтесь идти медленно, бойтесь стоять на месте. — китайская поговорка',
];
const AI_FALLBACKS = [
  'Хм, интересный вопрос! Пока я учусь, но введи /помощь — там список моих команд 🤖',
  'Я обработал твоё сообщение, но моих знаний пока маловато для точного ответа. Попробуй /факт или /шутка',
  'Понял тебя. Если хочешь поговорить — спроси про погоду, время или попроси посчитать выражение 😉',
  'Готов поболтать! Задай вопрос или напиши /помощь, чтобы узнать мои возможности.',
];

function aiCompute(m) {
  const a = parseFloat(m[1].replace(',', '.'));
  const op = m[2];
  const b = parseFloat(m[3].replace(',', '.'));
  let r;
  if (op === '+') r = a + b;
  else if (op === '-') r = a - b;
  else if (op === '*' || op === 'x' || op === '×') r = a * b;
  else if (op === '/' || op === '÷') r = b === 0 ? NaN : a / b;
  else r = NaN;
  if (isNaN(r)) return 'делить на ноль нельзя 🚫';
  return Number.isInteger(r) ? String(r) : String(Math.round(r * 1000) / 1000);
}

function aiCommandsHelp() {
  return 'Вот что я умею:\n/помощь — этот список\n/время — текущее время\n/дата — сегодняшняя дата\n/факт — интересный факт\n/шутка — шутка\n/цитата — мудрая мысль\n/погода — погода сейчас\n/посчитай 2+2 — математика\n/дельфин — всё о дельфинах\n/группа — как создать группу\n/канал — как создать канал\n/настройки — где что настроить\n/бот — как создать бота\n/звонок — про звонки и игры\n/автор — обо мне\n\nИли просто спроси: «привет», «как дела», «кто ты», «сколько будет 6*7», «переведи слово привет» 🚀';
}

function aiReplyFor(raw) {
  const text = String(raw || '').trim();
  const low = text.toLowerCase();

  if (low.startsWith('/')) {
    const cmd = low.split(/\s+/)[0].slice(1);
    const rest = text.slice(text.indexOf(' ') + 1).trim();
    if (['помощь', 'help', 'команды', 'справка'].includes(cmd)) return aiCommandsHelp();
    if (cmd === 'время') return `Сейчас ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ⏰`;
    if (cmd === 'дата') return `Сегодня ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', year: 'numeric' })} 📅`;
    if (cmd === 'факт') return `💡 Интересный факт: ${pick(AI_FACTS)}`;
    if (cmd === 'шутка') return `😄 ${pick(AI_JOKES)}`;
    if (cmd === 'цитата') return `💭 ${pick(AI_QUOTES)}`;
    if (cmd === 'погода') {
      const tmp = Math.round(8 + Math.random() * 22);
      return `Сейчас в вашем городе ${tmp}°C — ${tmp > 20 ? 'ясно и солнечно ☀️' : tmp > 12 ? 'переменная облачность ⛅' : 'прохладно 🌥️'}. Отличная погода, чтобы остаться в Nebula 😉`;
    }
    if (cmd === 'посчитай') {
      const m = rest.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:[.,]\d+)?)/);
      if (!m) return 'Напишите выражение, например: /посчитай 2+2 или /посчитай 10/4';
      return `🧮 ${m[0]} = ${aiCompute(m)}`;
    }
    if (cmd === 'дельфин') {
      const n = state.chats.filter(c => c.type === 'private' || c.type === 'group').length;
      const mx = dolphinsMaxLevelFor(currentUser.username);
      return `🐬 Дельфины — любимцы Nebula! Заботьтесь о них в личных чатах и группах: кормите, играйте и гладьте, они растут до 1000 уровня. У вас сейчас ${n} дельфин(инов), максимальный уровень: ${mx}.`;
    }
    if (cmd === 'автор') return 'Меня создали разработчики мессенджера Nebula 🌌 Я — встроенный ИИ-ассистент: умею отвечать на вопросы, считать, шутить и рассказывать факты. Введи /помощь для списка команд.';
    if (cmd === 'группа' || cmd === 'канал') {
      const t = cmd === 'группа' ? 'группу' : 'канал';
      return `Чтобы создать ${t}: нажмите кнопку «Создать» внизу списка чатов ➕, выберите «${cmd === 'группа' ? 'Новая группа' : 'Новый канал'}», укажите название, описание, цвет и участников. Готово! 🎉 Все настройки — по шестерёнке в чате: участники, админы, название, описание, удаление.`;
    }
    if (cmd === 'настройки') return `Где что находится:\n• Аккаунт — аватар слева вверху → Настройки: юзернейм, описание, аватар, почта, пароль\n• Внешний вид — темы, рамки, размер и свечение курсора\n• Приватность — кто может писать\n• Дельфины 🐬 — уход за питомцами\n• Админ-панель — доступна администраторам\n\nСменить аккаунт — профиль → «Сменить аккаунт».`;
    if (cmd === 'бот') return `Боты — это автоматические собеседники! 🤖 Нажмите «Создать» ➕, выберите «Бот», задайте имя и эмодзи. Если не указывать триггеры, бот станет чат-ботом: будет отвечать на любое сообщение умными ответами. Триггеры при этом работают как дополнительное обучение.`;
    if (cmd === 'звонок') return `Звонки 📞: в личных и групповых чатах есть кнопки «Позвонить» и «Видеозвонок». В звонке можно включить камеру, показать экран (кнопка 🖥), выбрать камеру/микрофон/динамик (⚙), свернуть звонок в окошко (—) и сыграть в крестики-нолики (🎮)!`;
    if (cmd === 'привет' || cmd === 'здравствуй') return pick(['Привет! 👋 Рад тебя видеть в Nebula.', 'Привет-привет! 🤖 Чем могу помочь?']);
    return `Не знаю команду «/${cmd}». Введите /помощь, чтобы увидеть список команд.`;
  }

  const math = low.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:[.,]\d+)?)/);
  if (math && /(посчитай|сколько|вычисли|реши|равно|плюс|минус)/.test(low)) return `🧮 ${math[0]} = ${aiCompute(math)}`;

  const intentScans = [
    [/привет|здравств|салют|\bхай\b|здорово|доброе утро|добрый день|добрый вечер|ку\b/,
      ['Привет! 👋 Рад тебя видеть в Nebula.', 'Здравствуй! Чем могу помочь?', 'Привет-привет! 🤖 Что нового?']],
    [/как дела|как ты\b|как жизнь|что нового|как настроение|чё как/,
      ['Отлично! 100% заряда и куча энтузиазма 🚀', 'Спасибо, что спросил! Всё супер — учу новые слова 😄', 'Лучше всех! А у тебя как?']],
    [/кто ты|ты кто|расскажи о себе|что ты такое|кто тебя создал|твой создатель/,
      ['Я Nebula AI — встроенный искусственный интеллект мессенджера 🤖 Создан помогать, развлекать и болтать с тобой. Напиши /помощь — покажу, что умею!']],
    [/как тебя зовут|твоё имя|тебя как зовут/,
      ['Меня зовут Nebula AI! 🤖 В честь мессенджера, в котором живу.']],
    [/что умеешь|помоги|помощь|какие команды|справка|команды/, [aiCommandsHelp()]],
    [/время|который час|сколько времени/,
      [`Сейчас ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ⏰`]],
    [/какая дата|какой день|сегодня число|дата сегодня/,
      [`Сегодня ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })} 📅`]],
    [/погод|сколько градусов|холодно|жарко|пойдёт дождь|идёт снег/,
      [`Сейчас в вашем городе ${Math.round(8 + Math.random() * 22)}°C — ${Math.random() > 0.5 ? 'ясно ☀️' : 'пасмурно ☁️'}. Мессенджер работает при любой погоде 😉`]],
    [/шутк|анекдот|рассмеши|пошути|смешно/, [`😄 ${pick(AI_JOKES)}`]],
    [/факт|интересн|расскажи что-нибудь/, [`💡 Интересный факт: ${pick(AI_FACTS)}`]],
    [/дельфин|дельфины/,
      ['🐬 Дельфины — символ Nebula! Кормите, играйте и гладьте их в личных чатах и группах — они растут до 1000 уровня. Введи /дельфин, чтобы узнать свои показатели.']],
    [/кто админ|кто создал мессенджер|кто тут админ/,
      ['Список администраторов хранится в настройках на вкладке «Админ» — она видна только им 😉 Управляют Nebula лучшие!']],
    [/спасибо|благодар|\bспс\b|круто|класс/,
      ['Всегда пожалуйста! 😊', 'Рад помочь! 🚀', 'Обращайся в любой момент!']],
    [/пока|до свидания|прощай|удачи|спокойной ночи/,
      ['Пока-пока! Возвращайся скорее 👋', 'До встречи! Пиши ещё!', 'Удачи! Я буду здесь 🤖']],
    [/люблю\b|нравишься|ты класс|обожаю|ты лучший/,
      ['И я тебя! 🤖💜', 'Спасибо! Ты делаешь мой день ярче ✨', 'Ахах, приятно! 💜']],
    [/переведи|перевод/,
      ['Переводчик в разработке, но я могу подсказать: hello — привет, спасибо — thank you, дельфин — dolphin 🐬 Напиши /помощь для других команд.']],
  ];
  for (const [re, replies] of intentScans) {
    if (re.test(low)) return pick(replies);
  }
  return pick(AI_FALLBACKS);
}

function aiChat() { return state.chats.find(c => c.id === AI_CHAT_ID); }

function openAiChat() {
  let chat = aiChat();
  if (!chat) {
    chat = {
      id: AI_CHAT_ID,
      type: 'ai',
      name: 'Nebula AI',
      members: ['me'],
      dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
      messages: [{ id: 'm' + Date.now(), from: 'nebula', text: 'Привет! Я Nebula AI — встроенный ИИ-ассистент мессенджера 🤖 Задай вопрос или введи /помощь.', time: new Date().toISOString(), read: true }],
    };
    state.chats.push(chat);
    saveState();
    renderChatList();
  }
  selectChat(AI_CHAT_ID);
}

/* ---------- КАСТОМНЫЙ КУРСОР ---------- */
function initCursor() {
  const dot = $('.cursor-dot');
  const ring = $('.cursor-ring');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, raf = null;
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
    if (!raf) raf = requestAnimationFrame(() => {
      rx += (mx - rx) * .18;
      ry += (my - ry) * .18;
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
      raf = null;
    });
  });
  document.addEventListener('mousedown', () => document.body.classList.add('cursor-press'));
  document.addEventListener('mouseup', () => document.body.classList.remove('cursor-press'));
  document.addEventListener('mouseover', (e) => {
    const i = e.target.closest('button, a, input, textarea, [role="button"], .member-item, .color-swatch, .chat-item, .profile, .create-option, .radio-item, .frame-item, .avatar-opt');
    document.body.classList.toggle('cursor-hover', !!i);
  });
}

/* ---------- RIPPLE ---------- */
function initRipples() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, .member-item, .create-option');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left - d / 2) + 'px';
    s.style.top = (e.clientY - r.top - d / 2) + 'px';
    t.appendChild(s);
    setTimeout(() => s.remove(), 700);
  });
}

/* ---------- TOAST ---------- */
function toast(title, sub, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="t-title">${title}</div>${sub ? `<div class="t-sub">${sub}</div>` : ''}`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

/* ---------- УВЕДОМЛЕНИЯ БРАУЗЕРА ---------- */
let notifyThrottle = {};
function notifyAllowed() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
function ensureNotifyPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  try { Notification.requestPermission().catch(() => {}); } catch (e) {}
}
function notifyNewMessages(chat, msgs) {
  if (!notifyAllowed()) return;
  if (!chat || !chat.id || !(msgs || []).length) return;
  msgs.forEach(m => {
    if (!m || m.from === 'system') return;
    if (m.kind === 'call_in' || m.kind === 'call_out' || m.kind === 'call_ended' || m.kind === 'call_declined' || m.kind === 'call_missed') return;
    if (chat.id === state.currentChatId && !document.hidden) return;
    const now = Date.now();
    if (now - (notifyThrottle[chat.id] || 0) < 8000) return;
    notifyThrottle[chat.id] = now;
    const sender = m.from && accountByUsername(m.from) ? accountByUsername(m.from) : null;
    const from = sender ? sender.name : (chat.type === 'private' ? chatTitle(chat) : chatTitle(chat));
    let body = (m.text || '').replace(/<[^>]+>/g, '').trim().slice(0, 120);
    if (m.voice) body = '🎤 Голосовое сообщение' + (body ? ' · ' + body : '');
    else if (m.video) body = '🎬 Кружок';
    else if (m.media && m.media.length) body = '🖼 ' + m.media[0].name;
    else if (m.sticker) body = 'Стикер';
    if (!body) body = 'Сообщение';
    const title = 'Nebula · ' + (sender ? sender.name : from);
    try { new Notification(title, { body, tag: chat.id, silent: false }); } catch (e) {}
  });
}

/* ---------- PUSH НА УСТРОЙСТВО (Web Push через воркер) ----------
   Браузеры не дают отправлять push напрямую (CORS) — шифрование и доставку
   делает сервер-реле (/sendpush). Подписки каждого пользователя хранятся
   в Firestore (pushsubs:<username>). */
const VAPID_PUB = 'BLTo1NIW4sPrQabFsTNXGw7r_fZ2iG-PFyU__1Hrc2DcyEmK0WgQxEH1TA0x9du0Tsqn1uvKxpqyOLDtLiPkgLY';
let pushSetupPromise = null;
let pushSubsCache = {};
function urlBase64ToUint8Array(b64) {
  const bin = atob(String(b64).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pushSubDocKey(u) { return 'pushsubs:' + u; }
function readPushSubs(u) {
  if (!fsEnabled()) return Promise.resolve([]);
  return fsRead(pushSubDocKey(u)).then(raw => {
    if (!raw) return [];
    try { const l = JSON.parse(raw); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }).catch(() => []);
}
function savePushSubs(u, list) {
  const keep = list.filter(s => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth).slice(-30);
  if (!fsEnabled()) return;
  fsWrite(pushSubDocKey(u), JSON.stringify(keep));
}
function setupPush() {
  if (pushSetupPromise) return pushSetupPromise;
  pushSetupPromise = (async () => {
    try {
      if (!currentUser || !fsEnabled() || !MAIL_RELAY_URL) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.register('sw.js');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUB) });
      const j = sub.toJSON();
      if (!j || !j.keys || !j.keys.p256dh || !j.keys.auth) return;
      const rec = { endpoint: sub.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, ua: (navigator.userAgent || '').slice(0, 120), at: Date.now() };
      const list = await readPushSubs(currentUser.username);
      if (!list.some(s => s.endpoint === rec.endpoint)) {
        list.push(rec);
        savePushSubs(currentUser.username, list);
        try { localStorage.setItem('nebula_push_sub_' + currentUser.username, JSON.stringify(rec)); } catch (e) {}
      }
    } catch (e) { /* push недоступен (iOS/не HTTPS/отклонено) — молча */ }
  })();
  return pushSetupPromise;
}
function pushDedupeOk(u, msgId) {
  try {
    const m = JSON.parse(localStorage.getItem('nebula_push_dedupe')) || {};
    const e = m[u];
    if (e && e.id === msgId && Date.now() - e.at < 600000) return false;
    m[u] = { id: msgId, at: Date.now() };
    safeSet('nebula_push_dedupe', JSON.stringify(m));
    return true;
  } catch (e) { return true; }
}
function cachedPushSubs(u) {
  const c = pushSubsCache[u];
  if (c && Date.now() - c.at < 30000) return Promise.resolve(c.list);
  return readPushSubs(u).then(list => { pushSubsCache[u] = { at: Date.now(), list }; return list; });
}
function sendPushToUser(u, title, body, url, tag, msgId) {
  if (!MAIL_RELAY_URL || !u || !currentUser || u === currentUser.username) return Promise.resolve();
  if (!pushDedupeOk(u, msgId)) return Promise.resolve();
  return cachedPushSubs(u).then(list => {
    if (!list.length) return;
    const payload = { secret: MAIL_RELAY_SECRET, title, body, url, tag };
    list.forEach(sub => {
      fetch(MAIL_RELAY_URL + '/sendpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ sub }, payload)),
        keepalive: true,
      }).catch(() => {});
    });
  }).catch(() => {});
}
/* Отправка пушей получателю за мои исходящие сообщения (вызывается из
   syncCloudChats для своих сообщений — устройство-отправитель онлайн в
   момент отправки) */
function pushNotifyForChat(chat, msgs) {
  if (!chat || chat.type !== 'private' || !chat.userId) return;
  const recipient = chat.userId;
  (msgs || []).forEach(m => {
    if (!m || !m.id) return;
    let title, body, url, tag;
    if (m.kind === 'call_in' || m.kind === 'call_out') {
      title = 'Nebula · 📞 Входящий звонок';
      body = 'От ' + ((m.from && accountByUsername(m.from)) ? accountByUsername(m.from).name : (m.from || 'собеседника'));
      url = '/';
      tag = 'call_' + chat.id;
    } else if (m.kind === 'call_ended' || m.kind === 'call_declined' || m.kind === 'call_missed') return;
    else {
      const sender = m.from && accountByUsername(m.from);
      title = 'Nebula · ' + (sender ? sender.name : (m.from || chatTitle(chat)));
      body = (m.text || '').replace(/<[^>]+>/g, '').trim().slice(0, 140);
      if (m.voice) body = '🎤 Голосовое сообщение' + (body ? ' · ' + body : '');
      else if (m.video) body = '🎬 Кружок';
      else if (m.media && m.media.length) body = '🖼 Фото или файл';
      else if (m.sticker) body = 'Стикер';
      if (!body) body = 'Новое сообщение';
      url = '/';
      tag = chat.id;
    }
    sendPushToUser(recipient, title, body, url, tag, m.id);
  });
}

/* ---------- РАМКИ / СТАТИСТИКА ---------- */
function hoursInApp(acc) { return Math.floor(((acc.stats && acc.stats.seconds) || 0) / 3600); }
function dolphinsMaxLevelFor(u) {
  const st = getStateFor(u);
  if (!st || !st.chats) return 0;
  let mx = 0;
  st.chats.forEach(c => { mx = Math.max(mx, dolphinLevel(dolphinFor(dolphinKeyFor(c, u), c))); });
  return mx;
}
function frameUnlockedMap(acc) {
  const m = {};
  const ov = (acc && acc.frameOverride) || [];
  FRAMES.forEach(f => { m[f.id] = f.unlock(acc) || (acc && acc.id === 1) || ov.includes(f.id); });
  return m;
}
function selectedFrameClass(acc) {
  if (!acc) return '';
  const unlocked = frameUnlockedMap(acc);
  const sel = acc.settings && acc.settings.frame;
  if (sel && unlocked[sel]) return sel;
  for (const id of FRAME_ORDER) if (unlocked[id]) return id;
  return '';
}

/* ---------- ДЕЛЬФИН ---------- */
const XP_PER_LEVEL = 50;
const DOLPHIN_STORE_KEY = 'nebula_dolphins';
function loadDolphins() {
  try { return JSON.parse(localStorage.getItem(DOLPHIN_STORE_KEY)) || {}; } catch (e) { return {}; }
}
function saveDolphins(store) { safeSet(DOLPHIN_STORE_KEY, JSON.stringify(store)); }
function dolphinKeyFor(chat, owner) {
  if (chat.type === 'private') {
    const own = String(owner || currentUser.username || 'me').trim().toLowerCase();
    let other = String(chat.userId || '').trim().toLowerCase();
    if (!other || other === 'me') other = own;
    return 'priv:' + [own, other].sort().join(':');
  }
  return chat.id;
}
function dolphinFor(chatId, chat) {
  const store = loadDolphins();
  let best = null;
  const scan = (c) => {
    if (c && c.dolphin && (c.dolphin.xp || 0) > 0 && (!best || c.dolphin.xp > best.xp)) best = c.dolphin;
  };
  if (chat) scan(chat);
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    s.chats.forEach(c => { if (dolphinKeyFor(c, u.username) === chatId) scan(c); });
  });
  const cur = store[chatId] || { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 };
  if (best && best.xp > (cur.xp || 0)) {
    cur.xp = best.xp;
    cur.lastFeed = Math.max(cur.lastFeed || 0, best.lastFeed || 0);
    cur.lastPlay = Math.max(cur.lastPlay || 0, best.lastPlay || 0);
    cur.lastPet = Math.max(cur.lastPet || 0, best.lastPet || 0);
    store[chatId] = cur;
    saveDolphins(store);
  }
  return store[chatId] || cur;
}
function syncDolphinLegacy(dkey, d) {
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    let changed = false;
    s.chats.forEach(c => {
      if (dolphinKeyFor(c, u.username) === dkey && c.dolphin && c.dolphin.xp !== d.xp) {
        c.dolphin.xp = d.xp;
        changed = true;
      }
    });
    if (changed) saveStateFor(u.username, s);
  });
}
function dolphinLevel(d) {
  d = d || {};
  return Math.min(1000, Math.floor((d.xp || 0) / XP_PER_LEVEL) + 1);
}
function dolphinActions() {
  return [
    { id: 'feed', label: 'Покормить', emoji: '🍕', xp: 40, cd: 600 },
    { id: 'play', label: 'Поиграть',  emoji: '⚽', xp: 30, cd: 480 },
    { id: 'pet',  label: 'Погладить', emoji: '🖐️', xp: 20, cd: 300 },
  ];
}
function dolphinStage(lvl) {
  if (lvl >= 1000) return 'Повелитель морей';
  if (lvl >= 750) return 'Хранитель океана';
  if (lvl >= 500) return 'Морской страж';
  if (lvl >= 350) return 'Легенда';
  if (lvl >= 200) return 'Мастер';
  if (lvl >= 100) return 'Ветеран';
  if (lvl >= 60) return 'Взрослый';
  if (lvl >= 30) return 'Юный дельфин';
  if (lvl >= 15) return 'Подросток';
  if (lvl >= 5) return 'Малыш';
  return 'Новорождённый';
}
function openDolphin(chat) {
  renderDolphin(chat);
  $('#dolphinModal').classList.add('open');
}
function closeDolphin() { $('#dolphinModal').classList.remove('open'); }
function bindDolphinModal() {
  $('#dolphinClose').addEventListener('click', closeDolphin);
  $('#dolphinModal').addEventListener('click', (e) => { if (e.target === $('#dolphinModal')) closeDolphin(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#dolphinModal').classList.contains('open')) closeDolphin();
  });
}
function renderDolphin(chat) {
  const d = dolphinFor(dolphinKeyFor(chat), chat);
  const lvl = dolphinLevel(d);
  const xpIn = (d.xp || 0) % XP_PER_LEVEL;
  const now = Date.now();
  const fedAgo = now - (d.lastFeed || 0);
  let hunger = 'Сыт и доволен 🥰';
  if (fedAgo > 12 * 3600000) hunger = 'Очень голоден 😰';
  else if (fedAgo > 6 * 3600000) hunger = 'Проголодался 😕';
  const partner = chatTitle(chat);

  const btn = (act) => {
    const remain = act.cd * 1000 - (now - (d['last' + act.id[0].toUpperCase() + act.id.slice(1)] || 0));
    const ready = remain <= 0;
    return `<button class="dolphin-action" data-act="${act.id}" ${ready ? '' : 'disabled'}>
      <span class="da-emoji">${act.emoji}</span>${act.label}
      <span class="da-cd">${ready ? `+${act.xp} XP` : cdText(remain)}</span>
    </button>`;
  };

  $('#dolphinBody').innerHTML = `
    <div class="dolphin-pet">
      <div class="db-scene">
        <div class="db-bubbles"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dolphin-emoji">🐬</div>
        <div class="db-level">ур. ${lvl}</div>
        <div class="db-stage">${dolphinStage(lvl)}</div>
      </div>
      <div class="dp-name">Дельфин из чата «${escapeHtml(partner)}»</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${xpIn}%"></div></div>
      <div style="font-size:12px;color:var(--text-muted)">${xpIn}/${XP_PER_LEVEL} XP до уровня ${Math.min(1000, lvl + 1)} · всего ${d.xp || 0} XP</div>
    </div>
    <div style="text-align:center;color:var(--text-muted);font-size:13px;margin-bottom:6px">${hunger}</div>
    <div class="dolphin-actions">
      ${dolphinActions().map(btn).join('')}
    </div>
    <div style="text-align:center;color:var(--text-muted);font-size:12px;margin-top:14px">
      Уровень дельфина общий для вас обоих — заботьтесь вместе 🤝
    </div>`;

  $('#dolphinBody').querySelectorAll('.dolphin-action').forEach(b => {
    b.addEventListener('click', () => dolphinAct(chat, b.dataset.act));
  });
}
function cdText(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function dolphinAct(chat, actId) {
  try {
    const dkey = dolphinKeyFor(chat);
    const store = loadDolphins();
    const d = store[dkey] || (store[dkey] = { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 });
    const act = dolphinActions().find(a => a.id === actId);
    const before = dolphinLevel(d);
    const key = 'last' + actId[0].toUpperCase() + actId.slice(1);
    d[key] = Date.now();
    d.xp = (d.xp || 0) + act.xp;
    saveDolphins(store);
    syncDolphinLegacy(dkey, d);
    const after = dolphinLevel(d);
    chat.messages.push({ id: 'm' + Date.now(), from: 'me', text: `🐬 ${act.label} дельфина (+${act.xp} XP)`, time: new Date().toISOString(), read: true });
    addLog(currentUser.username, `Покормил/поиграл с дельфином в «${chatTitle(chat)}» (+${act.xp} XP)`);
    saveState();
    toast('+XP', `${act.label}: +${act.xp} XP`, 1600);
    if (after > before) toast('🎉 Уровень повышен!', `Дельфин достиг уровня ${after}`);
    const stageAfter = dolphinStage(after), stageBefore = dolphinStage(before);
    if (stageAfter !== stageBefore) toast('⭐ Новая стадия!', `Дельфин теперь — ${stageAfter}`);
  } catch (e) {
    toast('Ошибка', 'Не удалось выполнить действие');
  }
  renderChat();
  renderDolphin(chat);
}

/* ---------- ТЕМА ---------- */
const THEME_CLASSES = ['theme-light', 'theme-black', 'theme-tgreen', 'theme-lgreen', 'theme-ppink', 'theme-dred', 'theme-red', 'theme-brown', 'theme-blue'];
const ALL_THEMES = [
  { v: 'default', t: 'По умолчанию', d: 'Тёмно-синяя тема' },
  { v: 'black', t: 'Чёрная', d: 'Глубокий чёрный цвет' },
  { v: 'light', t: 'Белая', d: 'Светлая тема' },
  { v: 'tgreen', t: 'Тёмно-зелёная', d: 'Глубокий лесной зелёный' },
  { v: 'lgreen', t: 'Салатовая', d: 'Свежий салатово-зелёный' },
  { v: 'ppink', t: 'Розово-фиолетовая', d: 'Неоновый розовый и пурпур' },
  { v: 'dred', t: 'Тёмно-красная', d: 'Приглушённый тёмно-красный' },
  { v: 'red', t: 'Красная', d: 'Ярко-алая красная' },
  { v: 'brown', t: 'Коричневая', d: 'Тёплый шоколадный оттенок' },
  { v: 'blue', t: 'Синяя', d: 'Насыщенный синий' },
];
const BASE_THEME_COUNT = 3;
function themeClass(t) { return t && t !== 'default' ? 'theme-' + t : ''; }
function applyTheme(t) {
  THEME_CLASSES.forEach(c => document.body.classList.remove(c));
  const cls = themeClass(t);
  if (cls) document.body.classList.add(cls);
}
function applyCursorSize(size) {
  const px = { s: 4, m: 5, l: 8 }[size] || 5;
  document.body.style.setProperty('--csize', px + 'px');
}
function applyCursorGlow(g) {
  const v = Math.min(6, Math.max(0, isFinite(g) ? g : 0.45));
  document.body.style.setProperty('--cglow', String(v));
}
function applyCursorColors(dot, glow) {
  if (dot) document.body.style.setProperty('--ccolor', `rgb(${dot[0]},${dot[1]},${dot[2]})`);
  if (glow) {
    const [r, g, b] = glow;
    document.body.style.setProperty('--cdotsh', `rgba(${r},${g},${b},.85)`);
    document.body.style.setProperty('--chovsh', `rgba(${r},${g},${b},.95)`);
    document.body.style.setProperty('--cring', `rgba(${r},${g},${b},.65)`);
    document.body.style.setProperty('--cringsh', `rgba(${r},${g},${b},.35)`);
    document.body.style.setProperty('--chovbg', `rgba(${r},${g},${b},.16)`);
  }
}
function isTester(u) { return !!(u && u.badges && u.badges.tester); }
function canUseSpecialThemes(u) { return isAdmin(u.username) || isTester(u); }

/* ---------- ОНЛАЙН-ТАЙМЕР / СТАТУСЫ ---------- */
let onlineTimer = null;
let lastPresencePush = 0;
const ONLINE_WINDOW = 2 * 60 * 1000;
function startOnlineTimer() {
  if (onlineTimer) clearInterval(onlineTimer);
  onlineTimer = setInterval(() => {
    if (!currentUser) return;
    currentUser.stats.seconds = (currentUser.stats.seconds || 0) + 10;
    currentUser.lastSeen = Date.now();
    persistCurrentUser();
    if (Date.now() - lastPresencePush >= 60000) { lastPresencePush = Date.now(); pushPresence(); }
    if ($('#settingsModal').classList.contains('open') && $('.st.active') && $('.st.active').dataset.tab === 'stats') updateStatsUI();
  }, 10000);
}
let incomingGuardTimer = null;
window.addEventListener('pagehide', () => { if (currentUser) { markOffline(currentUser.username); if (fsEnabled()) fsWrite(PRESENCE_KEY + currentUser.username, JSON.stringify({ u: currentUser.username, t: 'off', s: '', ts: Date.now() })); } });
function isOnline(u) {
  const a = accountByUsername(u);
  if (!a || !a.lastSeen) return false;
  if (a.status && (a.status.t === 'offline' || a.status.t === 'invisible')) return false;
  return Date.now() - a.lastSeen < ONLINE_WINDOW;
}
function markOffline(username) {
  const acc = accountByUsername(username);
  if (!acc) return;
  acc.lastSeen = Date.now();
  acc.status = Object.assign({}, acc.status || {}, { t: 'offline', auto: true });
  persistOther(acc);
}
function statusOf(acc) {
  if (!acc) return { cls: '', label: '', online: false, text: '' };
  const st = acc.status || {};
  if (st.t === 'offline' || st.t === 'invisible') {
    let label = 'не в сети';
    if (st.auto && st.t === 'offline') {
      const last = acc.lastSeen || 0;
      const diff = Date.now() - last;
      if (last) {
        if (diff < 24 * 60 * 60 * 1000) label = 'был(а) в ' + fmtHM(last);
        else if (diff < 7 * 24 * 60 * 60 * 1000) label = 'был(а) в течение недели';
        else label = 'был(а) давно';
      }
    }
    return { cls: 'off', label, online: false, text: st.s || '' };
  }
  if (st.t === 'busy') return { cls: 'busy', label: 'занят', online: true, text: st.s || '' };
  if (st.t === 'away') return { cls: 'away', label: 'отошёл', online: true, text: st.s || '' };
  if (isOnline(acc.username)) return { cls: 'on', label: 'онлайн', online: true, text: st.s || '' };
  const last = acc.lastSeen || 0;
  const diff = Date.now() - last;
  let label = 'не в сети';
  if (last) {
    if (diff < 24 * 60 * 60 * 1000) label = 'был(а) в ' + fmtHM(last);
    else if (diff < 7 * 24 * 60 * 60 * 1000) label = 'был(а) в течение недели';
    else label = 'был(а) давно';
  }
  return { cls: 'off', label, online: false, text: st.s || '' };
}
function fmtHM(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function statusChoiceHtml(cur) {
  const opts = [
    { t: 'online', label: '🟢 Онлайн', d: 'Видим всем, когда в сети' },
    { t: 'busy', label: '🔴 Занят', d: 'Отвечаю позже' },
    { t: 'away', label: '🟡 Отошёл', d: 'Отошёл ненадолго' },
    { t: 'offline', label: '⚪ Не в сети', d: 'Скрыть активность' },
  ];
  return opts.map(o => `
    <button type="button" class="status-opt ${cur === o.t ? 'sel' : ''}" data-t="${o.t}">
      <span class="st-icon">${o.label.split(' ')[0]}</span>
      <span class="st-txt">${o.label.split(' ').slice(1).join(' ')}<small>${o.d}</small></span>
      <span class="st-check">${cur === o.t ? '✓' : ''}</span>
    </button>`).join('');
}
function startIncomingGuard() {
  if (incomingGuardTimer) clearInterval(incomingGuardTimer);
  incomingGuardTimer = setInterval(() => {
    if (!incomingCall || !currentUser) return;
    const chat = state.chats.find(c => c.id === incomingCall.chatId);
    if (!chat) { closeIncoming(); return; }
    const ev = chat.messages.find(m => m.id === incomingCall.msgId);
    if (!ev || ev.dismissed || ev.answered) closeIncoming();
    else {
      const done = (chat.messages || []).some(m => (m.kind === 'call_declined' || m.kind === 'call_ended' || m.kind === 'call_missed') && new Date(m.time) > new Date(ev.time));
      if (done) closeIncoming();
    }
  }, 1200);
}

/* ============================================================
   AUTH + ВЕРИФИКАЦИЯ ПОЧТЫ
   ============================================================ */
let authMode = 'login';
let authCaptchaCode = '';
let authColorIndex = 0;
let authPending = null;   // { email, finalize }
let authCode = null, authCodeAt = 0, authTimerInt = null;
let demoMode = false;
try { demoMode = localStorage.getItem('nebula_demo_mode') === '1'; } catch (e) {}
function setDemoMode(v) {
  demoMode = v;
  try { localStorage.setItem('nebula_demo_mode', v ? '1' : '0'); } catch (e) {}
}

function showAuthError(el, text) {
  el.textContent = text;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
function clearAuthError(el) { el.textContent = ''; el.classList.remove('shake'); }

function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

let ringCtx = null, ringTimer = null, ringOsc = null, ringGain = null;
function getRingCtx() {
  try {
    if (!ringCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ringCtx = new AC();
    }
    if (ringCtx.state === 'suspended') ringCtx.resume();
    return ringCtx;
  } catch (e) { return null; }
}
function startRing(mode) {
  stopRing();
  if (currentUser && currentUser.status && currentUser.status.t === 'busy') return;
  const ctx = getRingCtx();
  if (!ctx) return;
  const pattern = mode === 'in'
    ? [[880, 0.28], [1175, 0.28], [0, 0.12], [988, 0.28], [1319, 0.28]]
    : [[660, 0.4], [0, 0.25], [660, 0.3]];
  const total = pattern.reduce((t, [f, d]) => t + d + 0.05, 0);
  let timer = null;
  const playOnce = () => {
    let t0 = ctx.currentTime + 0.02;
    pattern.forEach(([f, d]) => {
      if (!f) { t0 += d + 0.05; return; }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = f * 2;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g).connect(ctx.destination);
      o2.connect(g2).connect(ctx.destination);
      o.start(t0); o.stop(t0 + d + 0.05);
      o2.start(t0); o2.stop(t0 + d + 0.05);
      t0 += d + 0.05;
    });
  };
  playOnce();
  timer = setInterval(playOnce, Math.max(1800, total * 1000 + 200));
  ringTimer = timer;
}
function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  if (ringOsc) { try { ringOsc.stop(); } catch (e) {} ringOsc = null; }
}
function playDecline() {
  try {
    const ctx = getRingCtx();
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(440, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.25);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

function genUserId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'NEBULA-' + s;
}
function migrateUserIds() {
  const d = loadAccounts();
  let changed = false;
  Object.values(d.users || {}).forEach(u => {
    if (typeof u.id === 'number' || (typeof u.id === 'string' && /^\d+$/.test(u.id))) {
      u.id = genUserId();
      changed = true;
    }
  });
  if (changed) saveAccounts(d);
}

function fmtMMSS(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function bindCodeInputs(container) {
  if (container.dataset.bound) return container;
  container.dataset.bound = '1';
  const inputs = [...container.querySelectorAll('.code-input')];
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      inp.classList.toggle('filled', !!inp.value);
      if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
    });
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      inputs.forEach((el, j) => { el.value = t[j] || ''; el.classList.toggle('filled', !!t[j]); });
      const next = inputs[Math.min(t.length, 5)];
      if (next) next.focus();
    });
  });
  return inputs;
}
function codeValue(container) { return [...container.querySelectorAll('.code-input')].map(i => i.value).join(''); }
function clearCode(container) { container.querySelectorAll('.code-input').forEach(i => { i.value = ''; i.classList.remove('filled'); }); }

function startCodeTimer(el, at, onExpire) {
  clearInterval(el._t);
  el.classList.remove('expired');
  el._t = setInterval(() => {
    const rem = CODE_TTL - Math.floor((Date.now() - at) / 1000);
    if (rem <= 0) {
      el.textContent = '00:00';
      el.classList.add('expired');
      clearInterval(el._t);
      if (onExpire) onExpire();
    } else {
      el.textContent = fmtMMSS(rem);
    }
  }, 500);
}

function demoCodeHtml(code, label) {
  return `<div class="dc-label">${label}</div>
    <div class="dc-code-row"><span class="dc-code">${code}</span><button type="button" class="dc-copy" data-copy="${code}">Копировать</button></div>`;
}
function bindDemoCopy(box) {
  const b = box.querySelector('.dc-copy');
  if (!b) return;
  b.addEventListener('click', () => {
    try { navigator.clipboard.writeText(b.dataset.copy); toast('Код скопирован'); }
    catch (err) { toast('Код: ' + b.dataset.copy); }
  });
}

function sendAuthCode(email) {
  authCode = genCode();
  authCodeAt = Date.now();
  const box = $('#authDemoCode');
  box.classList.add('hidden');
  if (demoMode) {
    box.innerHTML = demoCodeHtml(authCode, 'Демо-режим: ваш код:');
    box.classList.remove('hidden');
    bindDemoCopy(box);
  }
  clearAuthError($('#authCodeError'));
  clearCode($('#authCodeInputs'));
  startCodeTimer($('#authCodeTimer'), authCodeAt, () => {
    authCode = null;
    showAuthError($('#authCodeError'), 'Код истёк. Запросите код повторно.');
    $('#authVerifyBtn').disabled = true;
  });
  const btn = $('#authVerifyBtn');
  const resend = $('#authResend');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }
  if (resend) resend.disabled = true;
  sendCodeToEmail(email, authCode, 'Код подтверждения Nebula Messenger').then((r) => {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
    if (resend) resend.disabled = false;
    if (r.demo) {
      box.innerHTML = demoCodeHtml(authCode, 'Демо-режим: настоящая отправка не настроена, вот ваш код:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
    } else if (r.ok) {
      showAuthError($('#authCodeError'), 'Код отправлен на ' + email);
    } else {
      box.innerHTML = demoCodeHtml(authCode, 'Письмо не доставлено (' + (r.err || 'ошибка') + ') — вот ваш код:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
      showAuthError($('#authCodeError'), 'Код не дошёл до почты, но показан на экране');
    }
  });
}

function moveTabIndicator() {
  const active = document.querySelector('.auth-tab.active');
  const ind = $('#authTabIndicator');
  if (!active || !ind) return;
  ind.style.width = active.offsetWidth + 'px';
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}

function renderAuthColors() {
  const box = $('#authColors');
  box.innerHTML = COLOR_PALETTE.map((c, i) =>
    `<button type="button" class="color-swatch ${i === authColorIndex ? 'selected' : ''}" data-i="${i}" style="background:linear-gradient(135deg,${c[0]},${c[1]})"></button>`
  ).join('');
  box.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      authColorIndex = +sw.dataset.i;
      box.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
  });
}

function bindAuthWaves() {
  [['#authName', 16], ['#authUsername', 14], ['#authEmail', 40], ['#authPassword', 24]].forEach(([sel, max]) => {
    const input = $(sel);
    const field = input.closest('.auth-field');
    const wave = field.querySelector('.auth-wave');
    const count = wave.querySelector('.w-count');
    const update = () => {
      const len = input.value.length;
      const p = Math.min(1, len / max);
      wave.style.setProperty('--p', p);
      count.textContent = `${len}/${max}`;
      wave.classList.toggle('full', len >= max);
    };
    input.addEventListener('input', () => {
      wave.classList.add('waving');
      clearTimeout(wave._t);
      wave._t = setTimeout(() => wave.classList.remove('waving'), 600);
      update();
    });
    update();
  });
}

const CAPTCHA_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function renderCaptcha() {
  const canvas = $('#authCaptchaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#101a2a';
  ctx.fillRect(0, 0, W, H);
  authCaptchaCode = '';
  for (let i = 0; i < 4; i++) authCaptchaCode += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(18 + i * 24, 26);
    ctx.rotate((Math.random() - 0.5) * 0.55);
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = `hsl(${190 + Math.random() * 60},70%,${60 + Math.random() * 25}%)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(authCaptchaCode[i], 0, 0);
    ctx.restore();
  }
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = 'hsla(200,60%,70%,.25)';
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * H);
    ctx.lineTo(W, Math.random() * H);
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'hsla(205,60%,75%,.35)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
  }
}

const WEAK_PW_CHUNKS = [
  '123','234','345','456','567','678','789','890','987','876','765','654','543','432','321','210',
  'abc','bcd','cde','def','efg','xyz','zyx','cba',
  'qwer','wert','erty','rtyu','yui','uio','iop','poi','oiu','asdf','zxcv','qaz','wsx','edc','lkj','jkl',
  'password','qwerty','welcome','letmein','sunshine','iloveyou','monkey','dragon','master','princess','login'
];

function weakPasswordDetect(pw) {
  if (new Set(pw).size <= 3) return true;
  if (/^(.+?)\1+$/.test(pw)) return true;
  const lower = pw.toLowerCase();
  return WEAK_PW_CHUNKS.some(ch => lower.includes(ch));
}

function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

function updatePwStrength() {
  const pw = $('#authPassword').value;
  const box = $('#authPwStrength');
  if (!pw) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const s = passwordScore(pw);
  const bar = $('#authPwMeterBar');
  bar.style.width = (s * 20) + '%';
  bar.style.background = ['var(--accent)', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#00b894'][s];
  const label = $('#authPwStrengthLabel');
  if (s === 5) {
    if (weakPasswordDetect(pw)) {
      bar.style.background = '#e74c3c';
      label.textContent = 'Слишком простой (123, qwerty...) — придумайте сложнее';
    } else {
      label.textContent = 'Супер-пароль';
    }
    return;
  }
  const missing = [];
  if (pw.length < 8) missing.push('8+ символов');
  if (!/[a-z]/.test(pw)) missing.push('a-z');
  if (!/[A-Z]/.test(pw)) missing.push('A-Z');
  if (!/\d/.test(pw)) missing.push('цифру');
  if (!/[^a-zA-Z0-9]/.test(pw)) missing.push('символ !@#');
  label.textContent = 'Нужно: ' + missing.join(', ');
}

function showAuthStep(name) {
  $('#authStepCreds').classList.toggle('hidden', name !== 'creds');
  $('#authStepVerify').classList.toggle('hidden', name !== 'verify');
  if (name === 'verify') {
    $('#authVerifyBtn').disabled = false;
    bindCodeInputs($('#authCodeInputs'));
  }
}

function showAuth(mode) {
  authMode = mode;
  clearAuthError($('#authError'));
  clearAuthError($('#authCodeError'));
  $('#authForm').dataset.mode = mode;
  $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  const reg = mode === 'register';
  $('#authNameField').classList.toggle('hidden', !reg);
  $('#authEmailField').classList.remove('hidden');
  $('#authColors').classList.toggle('hidden', !reg);
  $('#authCaptcha').classList.toggle('hidden', !reg);
  $('#authCaptchaInput').value = '';
  clearAuthError($('#authCaptchaError'));
  if (reg) renderCaptcha();
  $('#authSubmit').textContent = reg ? 'Далее' : 'Войти';
  $('#authHint').innerHTML = reg
    ? 'Уже есть аккаунт? <a href="#" id="authSwitch">Войти</a>'
    : 'Нет аккаунта? <a href="#" id="authSwitch">Создать</a>';
  $('#authSwitch').addEventListener('click', (e) => { e.preventDefault(); showAuth(reg ? 'login' : 'register'); });
  showAuthStep('creds');
  renderAuthColors();
  moveTabIndicator();
}

async function handleAuthSubmit() {
  const form = $('#authForm');
  const mode = form.dataset.mode;
  const name = $('#authName').value.trim();
  const username = $('#authUsername').value.trim().toLowerCase();
  const email = $('#authEmail').value.trim().toLowerCase();
  const password = $('#authPassword').value;
  const accounts = await refreshAccountsFromCloud();

  if (mode === 'register') {
    if (!name) return showAuthError($('#authError'), 'Введите никнейм');
    if (name.length < 4) return showAuthError($('#authError'), 'Никнейм минимум 4 символа');
    if (name.length > LIMITS.name) return showAuthError($('#authError'), `Никнейм максимум ${LIMITS.name} символов`);
    if (!/^[a-z0-9_]+$/.test(username) || username.length < 4) return showAuthError($('#authError'), 'Юзернейм: 4-14 символов (a-z, 0-9, _)');
    if (username.length > LIMITS.username) return showAuthError($('#authError'), `Юзернейм максимум ${LIMITS.username} символов`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAuthError($('#authError'), 'Введите корректную почту');
    if (password.length < 8) return showAuthError($('#authError'), 'Пароль минимум 8 символов');
    if (!/[a-z]/.test(password)) return showAuthError($('#authError'), 'Пароль должен содержать строчную букву (a-z)');
    if (!/[A-Z]/.test(password)) return showAuthError($('#authError'), 'Пароль должен содержать заглавную букву (A-Z)');
    if (!/\d/.test(password)) return showAuthError($('#authError'), 'Пароль должен содержать цифру (0-9)');
    if (!/[^a-zA-Z0-9]/.test(password)) return showAuthError($('#authError'), 'Пароль должен содержать символ (!@#$%^&*)');
    if (weakPasswordDetect(password)) return showAuthError($('#authError'), 'Пароль слишком простой — придумайте сложнее (без 12345, qwerty и похожих)');
    if (password.length > LIMITS.password) return showAuthError($('#authError'), `Пароль максимум ${LIMITS.password} символов`);
    if (($('#authCaptchaInput').value.trim() || '').toUpperCase() !== authCaptchaCode) {
      renderCaptcha();
      $('#authCaptchaInput').value = '';
      return showAuthError($('#authCaptchaError'), 'Введите код с картинки правильно');
    }
    if (accounts.users[username]) return showAuthError($('#authError'), 'Этот юзернейм уже занят');
    const emailTaken = accountsList().some(a => a.email === email);
    if (emailTaken) return showAuthError($('#authError'), 'Эта почта уже используется');
    authPending = {
      email,
      finalize: () => {
        const acc = {
          username, name, email, password,
          id: genUserId(),
          color: COLOR_PALETTE[authColorIndex],
          avatar: { type: 'preset', index: authColorIndex },
          verified: true,
          created: Date.now(),
          lastSeen: Date.now(),
          settings: { theme: 'default', whoCanWrite: 'all', frame: null },
          stats: { seconds: 0 },
          badges: {},
          banned: false,
          contacts: [], blocked: [], ignored: [], receivedFrom: [],
        };
        accounts.nextId++;
        accounts.users[username] = acc;
        saveAccounts(accounts);
        const delL = deletedUsers();
        if (delL.includes(username)) {
          safeSet(DELETED_USERS_KEY, JSON.stringify(delL.filter(x => x !== username)));
          scheduleCloudBackup();
        }
        ensureDefaultAdmin();
        addLog(username, 'Зарегистрировался (ID ' + acc.id + ')');
        startApp(acc);
      }
    };
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAuthError($('#authError'), 'Введите корректную почту');
    let acc = accounts.users[username];
    if (!acc && MAIL_RELAY_URL) {
      acc = await findAccountInCloud(username, email);
      if (acc) {
        if (String(acc.username || '').toLowerCase() !== username) {
          username = acc.username;
          const unIn = $('#authUsername');
          if (unIn) unIn.value = username;
        }
        accounts.users[username] = acc;
        saveAccounts(accounts);
        toast('Аккаунт восстановлен из облака');
      }
    }
    if (!acc) {
      showAccountNotice(username);
      return showAuthError($('#authError'), 'Пользователь не найден');
    }
    if (acc.isBot) return showAuthError($('#authError'), 'Это бот — в аккаунт войти нельзя');
    if (acc.banned) {
      if (acc.banInfo && acc.banInfo.unbanAt && Date.now() >= acc.banInfo.unbanAt) {
        acc.banned = false;
        acc.banInfo = null;
        clearNotice(username);
        persistOther(acc);
      } else {
        const bi = acc.banInfo || {};
        showAccountNotice(username);
        return showAuthError($('#authError'), 'Этот аккаунт забанен администрацией\nАдминистратор: @' + (bi.admin || '—') + ' · Бан: ' + fmtNoticeDate(bi.bannedAt) + ' · Разбан: ' + (bi.unbanAt ? fmtNoticeDate(bi.unbanAt) : 'Навсегда'));
      }
    }
    if (acc.email !== email) return showAuthError($('#authError'), 'Почта не совпадает с этим аккаунтом');
    if (acc.password !== password) return showAuthError($('#authError'), 'Неверный пароль');
    authPending = { email: acc.email, finalize: () => { addLog(username, 'Вошёл в аккаунт'); startApp(acc); } };
  }

  $('#authVerifyEmail').textContent = authPending.email;
  $('#authVerifyBtn').disabled = false;
  sendAuthCode(authPending.email);
  showAuthStep('verify');
}

function confirmAuthVerify() {
  const code = codeValue($('#authCodeInputs'));
  if (!authCode) return showAuthError($('#authCodeError'), 'Код истёк. Запросите код повторно.');
  if (code.length !== 6) return showAuthError($('#authCodeError'), 'Введите 6-значный код');
  if (code !== authCode) {
    showAuthError($('#authCodeError'), 'Неверный код');
    clearCode($('#authCodeInputs'));
    return;
  }
  authCode = null;
  clearInterval($('#authCodeTimer')._t);
  const finalize = authPending.finalize;
  authPending = null;
  finalize();
}

function initAuth() {
  ensureDefaultAdmin();
  bindAuthWaves();
  bindCodeInputs($('#authCodeInputs'));
  renderCaptcha();
  const demoToggle = $('#authDemoToggle');
  if (demoToggle) {
    demoToggle.checked = demoMode;
    demoToggle.addEventListener('change', () => {
      setDemoMode(demoToggle.checked);
      const box = $('#authDemoCode');
      if (!box) return;
      if (demoToggle.checked && authCode) {
        box.innerHTML = demoCodeHtml(authCode, 'Демо-режим: ваш код:');
        box.classList.remove('hidden');
        bindDemoCopy(box);
      } else if (!demoToggle.checked) {
        box.classList.add('hidden');
      }
    });
  }

  const refreshCaptcha = () => {
    renderCaptcha();
    $('#authCaptchaInput').value = '';
    clearAuthError($('#authCaptchaError'));
  };
  $('#authCaptchaRefresh').addEventListener('click', refreshCaptcha);
  $('#authCaptchaCanvas').addEventListener('click', refreshCaptcha);

  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    if ($('#authForm').dataset.mode !== tab.dataset.mode) showAuth(tab.dataset.mode);
  }));

  $('#eyeBtn').addEventListener('click', () => {
    const pw = $('#authPassword');
    pw.type = pw.type === 'password' ? 'text' : 'password';
    $('#eyeBtn').classList.toggle('active');
  });

  $('#authPassword').addEventListener('input', updatePwStrength);

  $('#authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!$('#authStepVerify').classList.contains('hidden')) confirmAuthVerify();
    else handleAuthSubmit();
  });

  $('#authBackToCreds').addEventListener('click', () => {
    clearInterval($('#authCodeTimer')._t);
    authCode = null;
    showAuthStep('creds');
  });

  $('#authResend').addEventListener('click', () => {
    $('#authVerifyBtn').disabled = false;
    sendAuthCode(authPending.email);
    toast('Код отправлен повторно', authPending.email, 2000);
  });

  showAuth('login');
  $('#authOverlay').classList.add('open');

  const saved = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } })();
  if (saved) tryAutoLogin();
  window.addEventListener('resize', moveTabIndicator);
}

function tryAutoLogin() {
  if (currentUser) return;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } })();
  if (!saved) return;
  const savedUsername = typeof saved === 'string' ? saved : saved.username;
  if (savedUsername && accountByUsername(savedUsername)) startApp(accountByUsername(savedUsername));
}

/* ============================================================
   START / EXIT
   ============================================================ */
function updateProfileHeader() {
  if (!currentUser) return;
  $('#profileName').innerHTML = displayName(currentUser);
  const ph = $('#profileAvatar');
  ph.innerHTML = avatarInnerHtml(currentUser);
  ph.setAttribute('style', avatarStyle(currentUser) + ';' + (selectedFrameClass(currentUser) ? 'box-shadow:0 0 0 3px #fff,0 0 16px rgba(255,255,255,.4);' : ''));
}

function startApp(user) {
  normAcc(user);
  closeBanNotices();
  endCallIfActive();
  if (user.banned) {
    if (user.banInfo && user.banInfo.unbanAt && Date.now() >= user.banInfo.unbanAt) {
      user.banned = false;
      user.banInfo = null;
      clearNotice(user.username);
      persistOther(user);
    } else {
      const bi = user.banInfo || {};
      showAccountNotice(user.username);
      logout();
      toast('Аккаунт забанен', 'Администратор: @' + (bi.admin || '—') + ' · Бан: ' + fmtNoticeDate(bi.bannedAt) + ' · Разбан: ' + (bi.unbanAt ? fmtNoticeDate(bi.unbanAt) : 'Навсегда'));
      return;
    }
  }
  currentUser = user;
  addOwnedAccount(user.username);
  currentUser.lastSeen = Date.now();
  if (user.status && user.status.auto) {
    user.status = {};
    persistOther(user);
  }
  safeSet(SESSION_KEY, JSON.stringify(user.username));
  ME.id = 'me';
  ME.name = user.name;
  ME.color = user.color;
  state = loadState() || buildInitialState();
  if (!state.folders) state.folders = [];
  if (!state.hidden) state.hidden = [];
  if (!('activeFolder' in state)) state.activeFolder = null;
  ensureGlobalChats();
  saveState();
  restoreMyStateFromCloud(user.username);
  reconcileAccountsNow();
  applyTheme(user.settings.theme || 'default');
  applyCursorSize((user.settings && user.settings.cursorSize) || 'm');
  applyCursorGlow(user.settings && user.settings.cursorGlow);
  applyCursorColors(user.settings && user.settings.cursorColor, user.settings && user.settings.glowColor);
  updateProfileHeader();
  ensureDefaultAdmin();
  updateAdminBtn();
  $('#authOverlay').classList.remove('open');
  renderChatList();
  renderChat();
  startOnlineTimer();
  startIncomingGuard();
  startCloudSync();
  ensureNotifyPermission();
  setupPush();
  lastPresencePush = 0;
  pushPresence();
  toast('Добро пожаловать', user.name + ' · ID ' + user.id + ' 👋');
  maybeShowIncoming(state.chats.find(c => c.id === state.currentChatId));
  const ann = loadAnnouncement();
  if (ann) toast('📢 Объявление', ann.text + (ann.by ? ' — @' + ann.by : ''), 6000);
  handleDeepLink();
  refreshAccountsFromCloud().then(() => {
    if (!currentUser) return;
    const me = accountByUsername(currentUser.username);
    if (me) { currentUser = me; persistCurrentUser(); }
    ensureDefaultAdmin();
    updateAdminBtn();
    renderChatList();
    renderChat();
  });
}

function handleDeepLink() {
  const q = new URLSearchParams(location.search).get('c');
  if (!q) return;
  setTimeout(() => {
    if (!state || !currentUser) return;
    openChannelByLink(q);
    history.replaceState(null, '', location.pathname + location.hash);
  }, 500);
}

function logout() {
  closeBanNotices();
  endCallIfActive();
  closeIncoming();
  if (currentUser) markOffline(currentUser.username);
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  state = buildInitialState();
  updateAdminBtn();
  clearInterval(onlineTimer);
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  $('#authForm').reset();
  showAuth('login');
  $('#authOverlay').classList.add('open');
  renderChatList();
  renderChat();
}

/* ============================================================
   RENDER CHAT LIST
   ============================================================ */
let lastListSig = null;
function renderChatList() {
  if (!state) return;
  if (!state.folders) state.folders = [];
  if (!state.hidden) state.hidden = [];
  renderFolderRail();
  if (currentUser) {
    const hasNews = state.chats.some(c => c.id === NEWS_CHAT_ID);
    const hasAi = state.chats.some(c => c.id === AI_CHAT_ID);
    if (!hasNews || !hasAi) ensureGlobalChats();
  }
  const list = $('#chatList');
  const q = state.search.trim().toLowerCase();
  const hidden = state.hidden || [];
  let chats = state.chats.slice().filter(c => !hidden.includes(c.id));
  if (state.activeFolder) chats = chats.filter(c => c.folder === state.activeFolder);
  else chats = chats.filter(c => !c.folder);
  if (state.filter !== 'all') chats = chats.filter(c => c.type === state.filter);
  const qh = q.replace(/^@/, '');
  if (q) chats = chats.filter(c => {
    const n = chatTitle(c).toLowerCase();
    const lm = lastMessage(c);
    return n.includes(q) || (lm && lm.text.toLowerCase().includes(q)) || (c.handle && c.handle.includes(qh));
  });

  let catalog = [];
  let userCatalog = [];
  if (q) {
    catalog = uniqueChatsAcrossUsers().filter(c =>
      c.type !== 'private' &&
      c.access !== 'private' &&
      !state.chats.some(x => x.id === c.id) &&
      (chatTitle(c).toLowerCase().includes(qh) || (c.handle && c.handle.startsWith(qh)))
    ).slice(0, 6);
    userCatalog = accountsList().filter(u =>
      u.username !== currentUser.username &&
      (String(u.id).toLowerCase().includes(q) ||
        u.username.toLowerCase().startsWith(qh) ||
        u.name.toLowerCase().includes(q))
    ).slice(0, 5);
    if (!userCatalog.length && qh.length >= 2) {
      cloudSearchAndMerge(qh).then(f => { if (f) renderChatList(); });
    }
  }

  const listSig = (currentUser ? currentUser.username : '') + '|' + (state.filter || '') + '|' + (state.search || '') + '|' + (state.activeFolder || '') + '|' + hidden.join(',') + '|' + chats.map(c => c.id + '|' + unreadCount(c) + '|' + (lastMessage(c) ? lastMessage(c).time + '|' + lastMessage(c).text : '') + '|' + chatTitle(c) + '|' + (c.type === 'private' ? statusOf(accFromChat(c)).cls : '') + '|' + (state.pinned.includes(c.id) ? 1 : 0)).join(';') + '|' + catalog.map(c => c.id).join(',') + '|' + userCatalog.map(u => u.username).join(',');
  if (listSig === lastListSig && lastListSig !== null) return;
  lastListSig = listSig;

  const sortChats = (a, b) => {
    const pa = state.pinned.includes(a.id), pb = state.pinned.includes(b.id);
    if (pa !== pb) return pa ? -1 : 1;
    const ta = lastMessage(a)?.time || a.createdAt || 0;
    const tb = lastMessage(b)?.time || b.createdAt || 0;
    return new Date(tb) - new Date(ta);
  };

  const catalogHtml = (catalog.length ? `
    <div class="catalog-hint">🔍 Найдено: <b>${catalog.length}</b>${catalog.length === 6 ? '+' : ''}</div>
    ${catalog.map((c, i) => {
      const owner = accountByUsername(c.owner);
      return `
      <div class="chat-item catalog-item" data-subscribe="${c.id}" style="animation-delay:${i * 30}ms">
        <div class="chat-avatar">${avatarHtml({ name: c.name, color: c.color, avatar: c.avatar || null }, '', '')}<span class="type-icon">${TYPE_ICONS[c.type]}</span></div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">${escapeHtml(c.name)}</span>
            ${c.handle ? `<span class="chat-handle">@${escapeHtml(c.handle)}</span>` : ''}
          </div>
          <div class="chat-bottom">
            <span class="chat-preview">${c.type === 'group' ? c.members.length + ' участников' : c.members.length + ' подписчиков'}${owner ? ' · создатель @' + escapeHtml(owner.username) : ''}</span>
          </div>
        </div>
        <button type="button" class="btn btn-primary sub-btn">${c.type === 'group' ? 'Вступить' : 'Подписаться'}</button>
      </div>`;
    }).join('')}
  ` : '');

  const userCatalogHtml = (userCatalog.length ? `
    <div class="catalog-hint">👥 Пользователи: <b>${userCatalog.length}</b></div>
    ${userCatalog.map((u, i) => `
      <div class="chat-item catalog-item user-cat-item" data-user="${escapeHtml(u.username)}" style="animation-delay:${i * 30}ms">
        <div class="chat-avatar">${avatarHtml(u, '', selectedFrameClass(u))}</div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">${escapeHtml(u.name)}${badgeHtml(u)}</span>
            <span class="chat-handle">@${escapeHtml(u.username)}</span>
          </div>
          <div class="chat-bottom">
            <span class="chat-preview">ID <span class="copy-id" data-copy="${escapeHtml(u.id)}" title="Скопировать ID">${escapeHtml(u.id)} 📋</span> · ${statusOf(u).label}</span>
          </div>
        </div>
        <button type="button" class="btn btn-primary sub-btn">Написать</button>
      </div>`).join('')}
  ` : '');

  if (!chats.length && !catalog.length && !userCatalog.length && !hidden.length) {
    list.innerHTML = `<div class="empty-list">${state.activeFolder ? 'В папке пока нет чатов' : (q ? 'Ничего не найдено' : 'Чатов пока нет. Нажмите «+», чтобы создать чат')}</div>`;
    return;
  }

  const chatItem = (chat, i) => {
    const acc = accFromChat(chat);
    const frame = chat.type === 'private' ? selectedFrameClass(acc) : '';
    const user = chat.type === 'private' ? acc : null;
    const lm = lastMessage(chat);
    const unread = unreadCount(chat);
    const active = chat.id === state.currentChatId;
    const missed = chat.missedCalls || 0;
    let sub = '';
    if (chat.type === 'private') { const stt = statusOf(user); sub = stt.label + ((user && user.status && user.status.s) ? ' · ' + user.status.s : ''); }
    else if (chat.type === 'ai') sub = '';
    else if (chat.type === 'saved') sub = 'Личные заметки';
    else if (chat.type === 'group') sub = `${chat.members.length} участников`;
    else sub = `${chat.members.length} подписчиков`;
    if (chat.type === 'channel' && chat.handle) sub = `@${escapeHtml(chat.handle)} · ${sub}`;
    const isMe = lm && lm.from === 'me';
    const isPinned = state.pinned.includes(chat.id);
    const post = user && user.statusPost && (Date.now() - user.statusPost.time) < 86400000 ? user.statusPost : null;

    return `
    <div class="chat-item ${active ? 'active' : ''}" data-id="${chat.id}" style="animation-delay:${i * 30}ms">
      <div class="chat-avatar">
        ${post ? '<span class="st-ring" data-post="' + escapeHtml(chat.userId) + '" title="Статус">' : ''}${avatarHtml(acc, '', frame)}${post ? '</span>' : ''}
        ${chat.type !== 'private' ? `<span class="type-icon">${TYPE_ICONS[chat.type]}</span>` : (user && statusOf(user).online ? `<span class="online-dot st-${statusOf(user).cls}"></span>` : '')}
      </div>
      <div class="chat-info">
        <div class="chat-top">
          <span class="chat-name">${isPinned ? '<span class="pin-icon">📌</span>' : ''}${escapeHtml(chatTitle(chat))}${chat.type === 'private' ? badgeHtml(acc) : ''}</span>
          ${chat.type === 'channel' && chat.handle ? `<span class="chat-handle ch-link" data-ch="${chat.id}">@${escapeHtml(chat.handle)}</span>` : ''}
          <span class="chat-time">${lm ? fmtTime(lm.time) : ''}</span>
        </div>
        <div class="chat-bottom">
          ${chat.type === 'ai' ? '' : `<span class="chat-preview ${unread && !active ? 'muted' : ''}">${isMe ? '<strong>Вы: </strong>' : ''}${escapeHtml(lastMessagePreview(chat))}</span>`}
          ${unread ? `<span class="badge">${unread}</span>` : ''}
          ${missed ? `<span class="missed-badge" title="Пропущенный звонок">📵${missed > 1 ? ' ' + missed : ''}</span>` : ''}
        </div>
      </div>
    </div>`;
  };

  let html = statusBarHtml();
  html += catalogHtml;
  html += userCatalogHtml;
  html += chats.sort(sortChats).map((c, i) => chatItem(c, i)).join('');

  if (hidden.length) {
    html += `
      <div class="hidden-row" id="hiddenToggle">
        <span>🙈 Скрытые (${hidden.length})</span>
        <span class="hidden-caret">${showHidden ? '▴' : '▾'}</span>
      </div>
      ${showHidden ? hidden.map(id => {
        const c = state.chats.find(x => x.id === id);
        if (!c) return '';
        return `
        <div class="chat-item hidden-item" data-id="${c.id}">
          <div class="chat-avatar">${avatarHtml(accFromChat(c), '', '')}${c.type !== 'private' ? `<span class="type-icon">${TYPE_ICONS[c.type]}</span>` : ''}</div>
          <div class="chat-info">
            <div class="chat-top"><span class="chat-name">${escapeHtml(chatTitle(c))}</span></div>
            <div class="chat-bottom"><span class="chat-preview muted">скрыт — ПКМ, чтобы показать</span></div>
          </div>
        </div>`;
      }).join('') : ''}`;
  }

  list.innerHTML = html;
  if (!list.classList.contains('settled')) list.classList.add('settled');

  const srow = $('#storiesRow');
  if (srow) srow.addEventListener('click', (e) => {
    const it = e.target.closest('.story-item');
    if (!it) return;
    if (it.dataset.mine !== undefined) { openStatusEditor(); return; }
    if (it.dataset.user) openStatusView(it.dataset.user);
  });

  const hrow = $('#hiddenToggle');
  if (hrow) hrow.addEventListener('click', () => { showHidden = !showHidden; renderChatList(); });

  if (isMobileView() && state.currentChatId) mobileShowChat();
}

/* ============================================================
   RENDER CHAT
   ============================================================ */
function currentChat() { return state.chats.find(c => c.id === state.currentChatId); }

function chatRenderSig(chat) {
  const ms = chat.messages || [];
  const last = ms[ms.length - 1];
  const acc = chat.type === 'private' ? accFromChat(chat) : null;
  return (chat.id || '') + '|' + ms.length + '|' + (last ? last.id + '|' + last.time + '|' + (last.read ? 1 : 0) : '') + '|' + (chat.unread || 0) + '|' + (chat.title || '') + '|' + (chat.muted ? 1 : 0) + '|' + (chat.members ? chat.members.length : 0) + '|' + (chat.type === 'private' ? statusOf(acc).cls + '|' + statusOf(acc).label : '') + '|' + (state.pinned.includes(chat.id) ? 1 : 0);
}
let lastChatSig = null;
const WALL_PRESETS = ['#0e1116', '#16233f', '#3a1b4a', '#163a2e', '#4a1b28', '#2a2616'];
function applyChatWall(chat) {
  const wrap = $('#messagesWrap');
  if (!wrap) return;
  const wall = chat && chat.wall;
  if (!wall || !wall.value) {
    wrap.style.backgroundImage = '';
    wrap.style.backgroundColor = '';
    wrap.classList.remove('has-wall');
    return;
  }
  wrap.classList.add('has-wall');
  if (wall.type === 'color') {
    wrap.style.backgroundImage = 'none';
    wrap.style.backgroundColor = wall.value;
  } else {
    wrap.style.backgroundColor = '';
    wrap.style.backgroundImage = `url("${wall.value}")`;
  }
  wrap.style.backgroundSize = 'cover';
  wrap.style.backgroundPosition = 'center';
  wrap.style.backgroundRepeat = 'no-repeat';
}
function resizeWallImage(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1000;
      let { width, height } = img;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.round(width * scale); height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      cb(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => cb(reader.result);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function sendBgMessage(chat, wall) {
  const msg = { id: 'm' + Date.now(), from: 'me', text: '', time: new Date().toISOString(), read: false, sent: true, bg: { type: wall.type, dataUrl: wall.value } };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
  if (chat.type === 'group' || chat.type === 'channel') {
    if (chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else syncGroupMessageEverywhere(chat, msg, currentUser.username);
  }
  addLog(currentUser.username, `Поделился фоном в «${chatTitle(chat)}»`);
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}
function renderChat() {
  if (!state) return;
  const chat = currentChat();
  const area = $('#chatArea');
  if (chat) {
    const sig = chatRenderSig(chat);
    if (lastChatSig === sig && area && area.querySelector('.messages-wrap')) return;
    lastChatSig = sig;
  }

  if (!chat) {
    area.classList.add('empty-state');
    area.innerHTML = `
      <div class="empty-content">
        <div class="empty-logo"><svg viewBox="0 0 24 24"><g class="lg-ring-still"><ellipse cx="12" cy="12" rx="8.2" ry="2.6" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(-20 12 12)"/></g><circle cx="12" cy="12" r="4.4" fill="#fff"/><path class="lg-star" d="M18.4 2.9l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" fill="#fff"/><g class="lg-orbit"><circle cx="20.2" cy="12" r="1.5" fill="#fff"/></g></svg></div>
        <h2>Nebula Messenger</h2>
        <p>Выберите чат или создайте новый</p>
      </div>`;
    return;
  }

  area.classList.remove('empty-state');
  const acc = accFromChat(chat);
  const frame = chat.type === 'private' ? selectedFrameClass(acc) : '';
  const user = chat.type === 'private' ? acc : null;
  const headPost = user && user.statusPost && (Date.now() - user.statusPost.time) < 86400000;
  const isBlocked = chat.type === 'private' && (currentUser.blocked || []).includes(chat.userId);
  const isIgnored = chat.type === 'private' && (currentUser.ignored || []).includes(chat.userId);
  const canWrite = chat.type !== 'channel' || (chat.id === NEWS_CHAT_ID
    ? (chat.owner === 'me' || chat.owner === currentUser.username || adminList().includes(currentUser.username) || (chat.admins || []).includes('me') || (chat.admins || []).includes(currentUser.username) || newsFullAccess(currentUser))
    : (chat.owner === 'me' || (chat.admins || []).includes('me') || chat.whoCanWrite === 'all'));

  let sub;
  if (chat.type === 'private') {
    const stt = statusOf(user);
    sub = `<span class="online st-${stt.cls}">${stt.label}</span>` + (stt.text ? ` · ${escapeHtml(stt.text)}` : '');
  } else if (chat.type === 'ai') sub = '';
  else if (chat.type === 'saved') sub = 'Личные заметки · видны только вам';
  else if (chat.type === 'group') sub = `${chat.members.length} участников · ${chat.desc || 'группа'}`;
  else sub = `${chat.members.length} подписчиков · ${chat.desc || 'канал'}`;
  if (chat.type === 'channel' && chat.handle) sub = `@${escapeHtml(chat.handle)} · ${sub}`;

  const showDolphin = chat.type !== 'channel' && chat.type !== 'ai' && chat.type !== 'saved';
  let headerExtras = '';
  if (chat.type === 'private' || chat.type === 'group') {
    headerExtras += `<button class="icon-btn" id="callBtn" title="Позвонить" style="${chat.type === 'group' ? 'padding-right:2px' : ''}">
      <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
    </button>
    <button class="icon-btn" id="videoCallBtn" title="Видеозвонок" style="padding-right:2px">
      <svg viewBox="0 0 24 24" style="fill:currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
    </button>`;
  }
  if (chat.type === 'private' || chat.type === 'ai') {
    headerExtras += `<button class="icon-btn" id="userCardBtn" title="Карточка">
      <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg>
    </button>`;
  }
  if (showDolphin) {
    const dl = dolphinLevel(dolphinFor(dolphinKeyFor(chat), chat));
    headerExtras += `<button class="dolphin-chip" id="dolphinBtn" title="${dolphinStage(dl)}">
      <span class="dl">🐬</span> ур. ${dl}
    </button>`;
  }

  let composer;
  if (isBlocked) {
    composer = `<div class="channel-notice">Вы заблокировали этого пользователя</div>`;
  } else if (canWrite) {
    composer = `
      <button class="icon-btn" id="attachBtn" title="Прикрепить файл">
        <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
      </button>
      <button class="icon-btn" id="voiceBtn" title="Голосовое сообщение">
        <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
      </button>
      <button class="icon-btn" id="videoMsgBtn" title="Кружок — видеосообщение">
        <svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
      </button>
      <button class="icon-btn" id="emojiBtn" title="Эмодзи">
        <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
      </button>
      <button class="icon-btn" id="stickBtn" title="Стикеры">
        <svg viewBox="0 0 24 24"><path d="M18.5 2H5.5C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2zm0 17.5h-13v-15h13v15zM7.5 6h9v2h-9V6zm0 4h9v2h-9v-2zm0 4h6v2h-6v-2z"/></svg>
      </button>
      <div class="composer-extra" id="composerExtra">${composerExtraHtml(chat)}</div>
      <div class="msg-input"><textarea id="msgText" placeholder="${isIgnored ? 'Сообщение (пользователь в игноре)' : 'Сообщение'}" rows="1"></textarea></div>
      <button class="send-btn" id="sendBtn">
        <svg viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>`;
  } else {
    composer = `<div class="channel-notice">${chat.id === NEWS_CHAT_ID ? 'Публиковать в Nebula News могут только админы' : 'Только владелец и администраторы могут публиковать сообщения'}</div>`;
  }

  const inEl0 = $('#msgText');
  const savedVal = inEl0 ? inEl0.value : null;
  const savedSel = inEl0 ? inEl0.selectionStart : 0;

  area.innerHTML = `
    <header class="chat-header">
      <button class="icon-btn m-back-btn" id="mBackBtn" title="К списку чатов" style="flex-shrink:0">
        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      ${headPost ? `<span class="st-ring st-head" data-post="${escapeHtml(acc.username)}" title="Статус">` : ''}${avatarHtml(acc, '', frame)}${headPost ? '</span>' : ''}
      <div class="chat-header-info">
        <div class="chat-header-title${chat.type !== 'private' && chat.type !== 'ai' && chat.type !== 'saved' ? ' clickable-title' : ''}" ${chat.type !== 'private' && chat.type !== 'ai' && chat.type !== 'saved' ? `data-chcard="${escapeHtml(chat.id)}" title="Карточка ${chat.type === 'channel' ? 'канала' : 'группы'}"` : ''}>${chat.type === 'private' ? displayName(acc) : escapeHtml(chatTitle(chat))}${chat.type === 'channel' && chat.handle ? `<span class="chat-handle ch-link" data-ch="${chat.id}">@${escapeHtml(chat.handle)}</span>` : ''}</div>
        <div class="chat-header-sub">${sub}</div>
        ${headPost && statusOf(acc).online ? `<button type="button" class="head-status-btn" data-post="${escapeHtml(acc.username)}">👁 Посмотреть статус</button>` : ''}
      </div>
      ${headerExtras}
      ${chat.type !== 'saved' ? `<button class="icon-btn spin" id="manageBtn" title="Настройки чата">
        <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
      </button>` : ''}
    </header>
    <div class="messages-wrap" id="messagesWrap"></div>
    <button class="jump-btn" id="jumpBottom" title="Вниз">↓</button>
    ${isBlocked ? `<div class="service-msg warn" style="margin:0 22px 10px;align-self:center">⛔ Вы заблокировали этого пользователя — он больше не сможет вам писать</div>` : ''}
    <div class="composer">
      <div class="rec-bar hidden" id="recBar">
        <video class="rec-preview hidden" id="recPreview" muted playsinline autoplay></video>
        <span class="rec-dot"></span>
        <span class="rec-label" id="recLabel">Голосовое</span>
        <span class="rec-timer" id="recTimer">0:00</span>
        <div class="rec-spacer"></div>
        <button class="rec-cancel" id="recCancel" title="Отменить">✕</button>
        <button class="rec-send" id="recSend" title="Отправить">➤</button>
      </div>
      <div class="pending-bar hidden" id="pendingBar"></div>
      ${composer}
    </div>
  `;

  renderMessages(chat);
  applyChatWall(chat);
  const ni = $('#msgText');
  if (savedVal !== null && ni) { ni.value = savedVal; ni.selectionStart = ni.selectionEnd = savedSel; }
  requestAnimationFrame(() => {
    const w = $('#messagesWrap');
    const near = !w || w.scrollHeight - w.scrollTop - w.clientHeight < 140;
    if (near) scrollChatToBottom();
  });
  bindChatEvents(chat);
  mobileShowChat();
}

/* ---------- Прокрутка чата ---------- */
function isChatNearBottom() {
  const wrap = $('#messagesWrap');
  if (!wrap) return true;
  return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 140;
}
function scrollChatToBottom(smooth = false) {
  const wrap = $('#messagesWrap');
  if (!wrap) return;
  if (smooth) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
  else wrap.scrollTop = wrap.scrollHeight;
  const jb = $('#jumpBottom');
  if (jb) jb.classList.remove('show');
}
function updateJumpBtn() {
  const jb = $('#jumpBottom');
  if (!jb) return;
  if (isChatNearBottom()) jb.classList.remove('show');
  else jb.classList.add('show');
}
function bindChatScroll() {
  const wrap = $('#messagesWrap');
  if (!wrap) return;
  wrap.addEventListener('scroll', updateJumpBtn, { passive: true });
  const jb = $('#jumpBottom');
  if (jb) jb.addEventListener('click', () => scrollChatToBottom(true));
}

function linkifyChannels(html) {
  if (!html || (!html.includes('@') && !html.includes('nebula://') && !html.includes('?c='))) return html;
  const handles = [];
  html.replace(/@([a-z0-9_]{3,14})/g, (m, h) => { handles.push(h); return m; });
  const all = uniqueChatsAcrossUsers();
  const byHandle = {};
  const byId = {};
  all.forEach(c => {
    if (c.type === 'private' || c.type === 'ai') return;
    if (c.handle) byHandle[c.handle.toLowerCase()] = c;
    byId[c.id] = c;
  });
  let out = html;
  handles.forEach(h => {
    const c = byHandle[h.toLowerCase()];
    if (c && !out.includes('data-ch="' + c.id + '"')) {
      out = out.replace(new RegExp('(?<![\\w])@' + h + '(?![\\w])', 'g'), `<a class="ch-link" data-ch="${c.id}">@${h}</a>`);
    }
  });
  out = out.replace(/(?:nebula:\/\/c\/|https?:\/\/[^\s'"<>]*[?&]c=)([A-Za-z0-9_]+)/g, (m, ref) => {
    const c = byId[ref] || byHandle[String(ref).toLowerCase()];
    if (c) return `<a class="ch-link" data-ch="${c.id}">🔗 ${c.handle ? '@' + c.handle : 'Ссылка на канал'}</a>`;
    return m;
  });
  return out;
}
function openChannelByLink(ref) {
  const id = String(ref);
  const lk = id.toLowerCase();
  const chat = state.chats.find(c => c.id === id || (c.handle && c.handle.toLowerCase() === lk));
  if (chat) { selectChat(chat.id); return; }
  const src = uniqueChatsAcrossUsers().find(c => c.id === id || (c.handle && c.handle.toLowerCase() === lk));
  if (!src) return toast('Канал не найден');
  state.search = '@' + (src.handle || '');
  state.activeFolder = null;
  state.filter = 'all';
  renderChatList();
  toast(src.type === 'channel' ? 'Нажмите «Подписаться»' : 'Нажмите «Вступить»', src.name);
}
function msgMetaIcons(chat, msg) {
  if (msg.from !== 'me') return '';
  const isPriv = chat.type === 'private';
  const single = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8 9.4 17.7 19.5 6.9"/></svg>';
  const dbl = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 13.4 6.8 17.4 10.9 13.4"/><path d="M13.1 6.9 17.1 10.9 21.2 6.9"/></svg>';
  const clock = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.59 3.25 1.88-.55.94L11.5 13V6.5h1.5v6.09z"/></svg>';
  const cls = msg.read ? 'read' : msg.sent ? 'sent' : 'pending';
  const tick = cls === 'pending' ? clock : (isPriv ? dbl : single);
  return `<span class="meta">${msg.edited ? '<span class="edited">изменено</span>' : ''}${fmtTime(msg.time)}<span class="meta-tick ${cls}">${tick}</span></span>`;
}

function shortText(t, n = 60) { return String(t || '').length > n ? String(t || '').slice(0, n) + '…' : String(t || ''); }
function fmtBytes(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b / 1024).toFixed(1).replace(/\.0$/, '') + ' КБ';
  return (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' МБ';
}
function senderName(msg, chat, meLabel = 'Вы') {
  if (msg.from === 'me') return meLabel;
  if (msg.from === 'news') return 'Nebula News';
  if (msg.from === 'nebula') return 'Nebula AI';
  const u = chat.type === 'private' ? userById(chat.userId) : userById(msg.from);
  return u ? u.name : 'Пользователь';
}

const REACT_EMOJIS = ['👍', '❤️', '😂', '🤣', '😮', '🔥', '🙏', '😍', '🎉', '😢', '😡', '💯'];
const replyTarget = { chatId: null, msgId: null };
const editTarget = { chatId: null, msgId: null };
const forwardTarget = { chatId: null, msgId: null };

function renderPollHtml(msg) {
  const p = msg.poll;
  const total = Object.values(p.votes || {}).reduce((n, a) => n + a.length, 0);
  const mineVote = Object.entries(p.votes || {}).find(([, a]) => a.includes('me'));
  const voted = !!mineVote;
  const isAuthor = msg.from === 'me';
  const showAnswer = p.quiz && (isAuthor || voted);
  return `<div class="poll-block">
    <div class="poll-head">
      <span class="poll-q">${p.quiz ? '🧠' : '📊'} ${escapeHtml(p.question)}</span>
      ${p.quiz ? `<span class="poll-tag ${showAnswer ? 'answered' : ''}">${showAnswer ? 'викторина · ответ открыт' : 'викторина'}</span>` : ''}
    </div>
    <div class="poll-opts">
      ${p.options.map((o, i) => {
        const cnt = ((p.votes || {})[i] || []).length;
        const pct = total ? Math.round(cnt / total * 100) : 0;
        const isMine = mineVote && +mineVote[0] === i;
        const isCorrect = showAnswer && p.correct === i;
        const isWrong = showAnswer && isMine && p.correct !== i;
        return `<button type="button" class="poll-opt ${isMine ? 'my' : ''} ${isCorrect ? 'right' : ''} ${isWrong ? 'wrong' : ''}" data-mid="${msg.id}" data-opt="${i}">
          <span class="po-label">${isCorrect ? '✅ ' : isWrong ? '❌ ' : ''}${escapeHtml(o)}</span>
          <span class="po-bar"><i style="width:${pct}%"></i></span>
          <span class="po-count">${cnt} (${pct}%)</span>
        </button>`;
      }).join('')}
    </div>
    <div class="poll-total">Всего голосов: ${total}${voted && !p.allowChange ? ' · ответ принят' : ''}</div>
  </div>`;
}
function renderContactHtml(c) {
  const acc = accountByUsername(c.username) || c;
  return `<div class="contact-card" data-cc="${escapeHtml(c.username)}">
    <span class="avatar" style="${avatarStyle(acc)}">${avatarInnerHtml(acc)}</span>
    <div class="cc-info">
      <div class="cc-name">${displayName(acc)}</div>
      <div class="cc-sub">@${escapeHtml(c.username)} · ID ${escapeHtml(c.id)}</div>
    </div>
    <span class="cc-btn">Написать</span>
  </div>`;
}
function toggleVote(msg, optIdx) {
  if (!msg.poll.votes) msg.poll.votes = {};
  const cur = Object.entries(msg.poll.votes).find(([, a]) => a.includes('me'));
  if (cur && !msg.poll.allowChange) {
    toast('Ответ уже принят', 'Изменить ответ нельзя');
    return;
  }
  if (cur) {
    msg.poll.votes[cur[0]] = msg.poll.votes[cur[0]].filter(x => x !== 'me');
    if (!msg.poll.votes[cur[0]].length) delete msg.poll.votes[cur[0]];
  }
  if (!cur || +cur[0] !== optIdx) {
    msg.poll.votes[optIdx] = msg.poll.votes[optIdx] || [];
    msg.poll.votes[optIdx].push('me');
  }
  saveState();
  const chat = currentChat();
  if (chat) { renderMessages(chat); bindMsgDelegation(); }
}
function sendPollMessage(chat, question, options, opts) {
  opts = opts || {};
  const msg = { id: 'm' + Date.now(), from: chat.id === NEWS_CHAT_ID ? 'news' : 'me', text: '', time: new Date().toISOString(), read: false, sent: true, poll: { question, options: options.map(t => String(t).trim()).filter(Boolean), votes: {}, quiz: !!opts.quiz, correct: opts.quiz ? Number(opts.correct) : -1, allowChange: !!opts.allowChange } };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
  if (chat.type === 'group' || chat.type === 'channel') {
    if (chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else syncGroupMessageEverywhere(chat, msg, currentUser.username);
  }
  addLog(currentUser.username, `Создал ${opts.quiz ? 'викторину' : 'опрос'} «${shortText(question, 30)}» в «${chatTitle(chat)}»`);
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}
function sendContactMessage(chat, u) {
  const msg = { id: 'm' + Date.now(), from: chat.id === NEWS_CHAT_ID ? 'news' : 'me', text: '', time: new Date().toISOString(), read: false, sent: true, contact: { username: u.username, name: u.name, id: u.id, color: u.color, avatar: u.avatar || null } };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
  if (chat.type === 'group' || chat.type === 'channel') {
    if (chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else syncGroupMessageEverywhere(chat, msg, currentUser.username);
  }
  addLog(currentUser.username, `Поделился контактом @${u.username} в «${chatTitle(chat)}»`);
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}
function openPollModal(chat) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'pollModal';
  modal.innerHTML = `
    <div class="modal-box poll-modal">
      <div class="pm-head">
        <span class="pm-ico">📊</span>
        <div class="pm-head-txt">
          <h3>Создать опрос</h3>
          <p>в ${escapeHtml(chatTitle(chat))}</p>
        </div>
        <button type="button" class="pm-x" title="Закрыть">✕</button>
      </div>
      <div class="pm-field">
        <textarea class="pm-q" rows="2" maxlength="120" placeholder="Напишите вопрос..." autocomplete="off"></textarea>
        <span class="pm-count">0/120</span>
      </div>
      <div class="pm-type">
        <button type="button" class="pm-type-btn sel" data-type="poll">📊 Опрос</button>
        <button type="button" class="pm-type-btn" data-type="quiz">🧠 Викторина</button>
      </div>
      <div class="pm-hint" id="pmHint">Варианты ответа — минимум 2, максимум 10</div>
      <div class="pm-opts" id="pmOpts"></div>
      <button type="button" class="pm-add">＋ Добавить вариант</button>
      <div class="pm-correct-row" id="pmCorrectRow" style="display:none">
        <span class="pm-correct-label">Правильный ответ:</span>
        <select class="pm-correct" id="pmCorrect"></select>
      </div>
      <label class="pm-switch-row">
        <input type="checkbox" id="pmAllowChange" checked>
        <span class="pm-switch"><i></i></span>
        <span class="pm-switch-label">Разрешить менять ответ</span>
      </label>
      <button type="button" class="btn btn-primary pm-send">Создать опрос</button>
    </div>`;
  document.body.appendChild(modal);
  modal.classList.add('open');
  let isQuiz = false;
  const optsBox = modal.querySelector('#pmOpts');
  const correctSel = modal.querySelector('#pmCorrect');
  const refreshCorrect = () => {
    const vals = Array.from(optsBox.querySelectorAll('.pm-o')).map(i => i.value.trim()).filter(Boolean);
    const prev = correctSel.value;
    correctSel.innerHTML = vals.length
      ? vals.map((v, i) => `<option value="${i}">${i + 1}. ${escapeHtml(shortText(v, 30))}</option>`).join('')
      : '<option value="0">—</option>';
    if (prev && vals.length > +prev) correctSel.value = prev;
  };
  modal.querySelectorAll('.pm-type-btn').forEach(b => b.addEventListener('click', () => {
    modal.querySelectorAll('.pm-type-btn').forEach(x => x.classList.toggle('sel', x === b));
    isQuiz = b.dataset.type === 'quiz';
    modal.querySelector('#pmCorrectRow').style.display = isQuiz ? 'flex' : 'none';
    modal.querySelector('.pm-send').textContent = isQuiz ? 'Создать викторину' : 'Создать опрос';
    refreshCorrect();
  }));
  const makeRow = (n) => {
    const row = document.createElement('div');
    row.className = 'pm-row';
    row.innerHTML = `
      <span class="pm-num">${n}</span>
      <input type="text" class="pm-o" placeholder="Вариант ${n}" maxlength="60" autocomplete="off">
      <button type="button" class="pm-del" title="Убрать вариант">✕</button>`;
    row.querySelector('.pm-del').addEventListener('click', () => {
      if (optsBox.children.length <= 2) return toast('Нужно минимум 2 варианта');
      row.style.transform = 'scale(.92)';
      row.style.opacity = '0';
      setTimeout(() => { row.remove(); renum(); refreshCorrect(); }, 150);
    });
    row.querySelector('.pm-o').addEventListener('input', refreshCorrect);
    return row;
  };
  const renum = () => {
    Array.from(optsBox.children).forEach((r, i) => { r.querySelector('.pm-num').textContent = i + 1; });
  };
  [1, 2].forEach(n => optsBox.appendChild(makeRow(n)));
  refreshCorrect();
  modal.querySelector('.pm-add').addEventListener('click', () => {
    if (optsBox.children.length >= 10) return;
    optsBox.appendChild(makeRow(optsBox.children.length + 1));
    optsBox.lastChild.querySelector('.pm-o').focus();
    refreshCorrect();
  });
  modal.querySelector('.pm-x').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('.pm-send').addEventListener('click', () => {
    const q = modal.querySelector('.pm-q').value.trim();
    const opts = Array.from(optsBox.querySelectorAll('.pm-o')).map(i => i.value.trim()).filter(Boolean);
    if (!q) { toast('Введите вопрос'); return; }
    if (opts.length < 2) { toast('Нужно минимум 2 варианта'); return; }
    modal.remove();
    sendPollMessage(chat, q, opts, { quiz: isQuiz, correct: correctSel.value, allowChange: modal.querySelector('#pmAllowChange').checked });
  });
  const qInput = modal.querySelector('.pm-q');
  qInput.addEventListener('input', () => {
    modal.querySelector('.pm-count').textContent = qInput.value.length + '/120';
  });
  qInput.focus();
}
function openContactPicker(chat) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'contactModal';
  modal.innerHTML = `
    <div class="modal-box contact-picker">
      <h3>👤 Поделиться контактом</h3>
      <div class="contact-list">
        ${accountsList().filter(a => a.username !== currentUser.username).map(u => `
          <div class="contact-pick" data-u="${escapeHtml(u.username)}">
            <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
            <div class="cp-info">
              <div class="cp-name">${displayName(u)}</div>
              <div class="cp-sub">@${escapeHtml(u.username)} · ID ${escapeHtml(u.id)}</div>
            </div>
            <button type="button" class="btn btn-primary cp-send">Поделиться</button>
          </div>`).join('') || '<div class="empty-list">Нет других пользователей</div>'}
      </div>
      <button type="button" class="btn cp-cancel">Закрыть</button>
    </div>`;
  document.body.appendChild(modal);
  modal.classList.add('open');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
    const pick = e.target.closest('.contact-pick');
    if (pick) {
      const u = accountByUsername(pick.dataset.u);
      if (u) sendContactMessage(chat, u);
      modal.remove();
      closeManageModal();
    }
    if (e.target.closest('.cp-cancel')) modal.remove();
  });
}

function renderMessages(chat) {
  const wrap = $('#messagesWrap');
  const prevScroll = wrap ? wrap.scrollTop : 0;
  const wasNearBottom = wrap ? (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 140) : true;
  let lastDate = '', html = '';
  chat.messages.forEach(msg => {
    const dg = fmtDateGroup(msg.time);
    if (dg !== lastDate) { html += `<div class="date-divider">${dg}</div>`; lastDate = dg; }
    if (msg.from === 'system') { html += sysCallHtml(msg, chat); return; }
    const mine = msg.from === 'me';
    const isNewsMsg = chat.id === NEWS_CHAT_ID;
    const senderAcc = isNewsMsg ? NEWS_ACC : (chat.type === 'ai' && !mine ? NEBULA_ACC : (chat.type !== 'private' && !mine ? userById(msg.from) : null));
    const fwdName = msg.forwarded ? escapeHtml(msg.forwardedFrom || 'пользователя') : '';
    const rt = msg.replyTo ? `
      <div class="reply-block">
        <span>${escapeHtml(msg.replyTo.name)}</span>
        <div>${escapeHtml(shortText(msg.replyTo.text, 60))}</div>
      </div>` : '';
    const reactChips = msg.reactions && Object.keys(msg.reactions).length ? Object.entries(msg.reactions).map(([em, arr]) => {
      const active = arr.includes('me');
      return `<button class="react-chip ${active ? 'on' : ''}" data-mid="${msg.id}" data-react="${em}">${em} ${arr.length}</button>`;
    }).join('') : '';
    const mediaHtml = msg.media && msg.media.length ? msg.media.map((md, mi) => {
      if (md.type && md.type.startsWith('image/')) {
        if (md.dataUrl) return `<img class="msg-photo loading" loading="lazy" onload="this.classList.remove('loading')" src="${md.dataUrl}" alt="${escapeHtml(md.name)}" title="${escapeHtml(md.name)}" data-mid="${msg.id}" data-mi="${mi}">`;
        return `<div class="msg-photo-off" data-mid="${msg.id}" data-mi="${mi}" title="${escapeHtml(md.name)}">🖼 <span>${escapeHtml(md.name)}</span></div>`;
      }
      return `
        <div class="msg-file">
          <span class="file-ic">📄</span>
          <span class="file-name">${escapeHtml(md.name)}</span>
          <span class="file-size">${fmtBytes(md.size)}</span>
          ${md.dataUrl ? `<a class="file-dl" download="${escapeHtml(md.name)}" href="${md.dataUrl}" title="Скачать">⬇</a>` : '<span class="file-dl-off" title="Файл не загружен на это устройство">—</span>'}
        </div>`;
    }).join('') : '';
    const stickerHtml = msg.sticker && msg.sticker.dataUrl ? stickerMediaHtml(msg.sticker, 'msg-sticker', '') : '';
    const voiceHtml = msg.voice ? (msg.voice.dataUrl ? `
      <div class="msg-voice" data-mid="${msg.id}">
        <button class="voice-play" data-vplay="${msg.id}" title="Играть">▶</button>
        <div class="voice-bar"><i></i></div>
        <span class="voice-dur">${fmtRecDur(msg.voice.dur || 0)}</span>
        <audio src="${msg.voice.dataUrl}" preload="none"></audio>
      </div>` : `
      <div class="msg-voice-off" data-mid="${msg.id}">🎤 <span>Голосовое · ${fmtRecDur(msg.voice.dur || 0)}</span><span class="vo-note">не загружено</span></div>`) : '';
    const videoHtml = msg.video ? (msg.video.dataUrl ? `
      <video class="msg-kruzhok" data-mid="${msg.id}" src="${msg.video.dataUrl}" loop playsinline muted preload="metadata" title="Кружок · ${fmtRecDur(msg.video.dur || 0)}"></video>` : `
      <div class="msg-kruzhok-off" data-mid="${msg.id}" title="Кружок · ${fmtRecDur(msg.video.dur || 0)}"><span>🎬</span><span class="kk-dur">${fmtRecDur(msg.video.dur || 0)}</span><span class="kk-note">не загружен</span></div>`) : '';
    const pollHtml = msg.poll ? renderPollHtml(msg) : '';
    const contactHtml = msg.contact ? renderContactHtml(msg.contact) : '';
    const bgHtml = msg.bg && msg.bg.dataUrl ? `
      <div class="msg-bg-card" data-mid="${msg.id}">
        <div class="msg-bg-thumb"><img src="${msg.bg.dataUrl}" alt=""></div>
        <div class="msg-bg-info">
          <div class="msg-bg-title">${mine ? 'Вы' : escapeHtml((senderAcc && displayName(senderAcc)) || 'Пользователь')} предложил(а) фон чата</div>
          <div class="msg-bg-actions">
            <button class="btn btn-primary btn-sm" data-bg-apply="${msg.id}">Применить</button>
            <button class="btn btn-sm" data-bg-dismiss="${msg.id}">Не сейчас</button>
          </div>
        </div>
      </div>` : '';
    html += `
      <div class="msg-row ${mine ? 'out' : 'in'}">
        <div class="msg ${mine ? 'out' : 'in'}" data-mid="${msg.id}">
          ${senderAcc ? `<span class="sender">${displayName(senderAcc)}</span>` : ''}
          ${fwdName ? `<div class="fwd-badge">➡ Переслано от ${fwdName}</div>` : ''}
          ${rt}
          ${pollHtml}
          ${contactHtml}
          ${bgHtml}
          ${stickerHtml}
          ${voiceHtml}
          ${videoHtml}
          ${mediaHtml}
          ${msg.text ? `<div class="msg-text">${linkifyChannels(escapeHtml(msg.text))}</div>` : ''}
          ${msgMetaIcons(chat, msg)}
          ${reactChips ? `<div class="react-row">${reactChips}</div>` : ''}
          <div class="msg-actions">
            <button data-act="react" title="Реакция"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg></button>
            <button data-act="reply" title="Ответить"><svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5.4-5.5-9.4-11-10z"/></svg></button>
            <button data-act="forward" title="Переслать"><svg viewBox="0 0 24 24"><path d="M5 4h14v3H5V4zm0 5h14v3H5V9zm0 5h14v3H5v-3zm0 5h14v3H5v-3z"/></svg></button>
            <button data-act="copy" title="Копировать"><svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg></button>
            ${mine ? `<button data-act="edit" title="Изменить">✎</button>` : ''}
            ${(mine && chat.id !== NEWS_CHAT_ID) || (chat.id === NEWS_CHAT_ID && newsFullAccess(currentUser)) ? `<button data-act="del" title="Удалить"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
          </div>
          <div class="react-picker">
            ${REACT_EMOJIS.map(e => `<button data-mid="${msg.id}" data-emoji="${e}">${e}</button>`).join('')}
          </div>
        </div>
      </div>`;
  });
  wrap.innerHTML = html;
  if (!wasNearBottom && prevScroll > 0) wrap.scrollTop = prevScroll;
  if (incomingCall) {
    const cur = state.chats.find(c => c.id === incomingCall.chatId);
    const ev = cur && [...(cur.messages || [])].reverse().find(m => m.id === incomingCall.msgId);
    if (!ev || ev.dismissed) closeIncoming();
  }
}

/* ---------- Отправка сообщений ---------- */

function bindChatEvents(chat) {
  bindMsgDelegation();
  bindChatScroll();
  const hdrLink = document.querySelector('.chat-header .ch-link');
  if (hdrLink) hdrLink.addEventListener('click', (e) => { e.stopPropagation(); openChannelByLink(hdrLink.dataset.ch); });
  const manageBtn = $('#manageBtn');
  if (manageBtn) manageBtn.addEventListener('click', () => openManageModal(chat));
  const mBack = $('#mBackBtn');
  if (mBack) mBack.addEventListener('click', mobileShowList);
  const callBtn = $('#callBtn');
  if (callBtn) callBtn.addEventListener('click', () => startCall(chat.id, false));
  const vcb = $('#videoCallBtn');
  if (vcb) vcb.addEventListener('click', () => startCall(chat.id, true));
  const dolphinBtn = $('#dolphinBtn');
  if (dolphinBtn) dolphinBtn.addEventListener('click', () => openDolphin(chat));
  const ucb = $('#userCardBtn');
  if (ucb) ucb.addEventListener('click', () => openUserCard(chat.type === 'private' ? chat.userId : 'nebula'));

  const extra = $('#composerExtra');
  if (extra) extra.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-bar]');
    if (!b) return;
    if (b.dataset.bar === 'edit') { editTarget.chatId = null; editTarget.msgId = null; }
    if (b.dataset.bar === 'reply') { replyTarget.chatId = null; replyTarget.msgId = null; }
    refreshComposerBars(chat);
    const t = $('#msgText');
    if (t) t.focus();
  });

  const text = $('#msgText');
  if (!text) return;
  const send = $('#sendBtn');
  const emojiBtn = $('#emojiBtn');
  const autosize = () => {
    const wrap = $('#messagesWrap');
    const prevH = wrap ? wrap.clientHeight : 0;
    const prevST = wrap ? wrap.scrollTop : 0;
    text.style.height = 'auto';
    text.style.height = Math.min(text.scrollHeight, 120) + 'px';
    if (wrap) {
      const dh = prevH - wrap.clientHeight;
      if (dh) {
        if (wrap.scrollHeight - prevST - prevH < 140) wrap.scrollTop = wrap.scrollHeight;
        else wrap.scrollTop = prevST + dh;
      }
    }
  };
  text.addEventListener('input', autosize);
  const doSend = () => {
    const val = text.value.trim();
    if (!val && !pendingMedia.length) return;
    const now = Date.now();
    if (now - lastSendAt < 1000) {
      toast('Слишком быстро', 'Подождите секунду перед следующим сообщением');
      return;
    }
    sendMessage(chat.id, val);
    lastSendAt = now;
    text.value = '';
    clearPendingMedia();
    autosize();
    refreshComposerBars(chat);
  };
  send.addEventListener('click', doSend);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  text.addEventListener('paste', (e) => {
    const items = (e.clipboardData && e.clipboardData.items) ? Array.from(e.clipboardData.items) : [];
    const files = items.map(it => it.getAsFile && it.getAsFile()).filter(Boolean)
      .filter(f => f.type && (f.type.startsWith('image/') || f.type.startsWith('video/')))
      .slice(0, 8);
    if (!files.length) return;
    e.preventDefault();
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        pendingMedia.push({ name: f.name || 'Вставка.png', size: f.size, type: f.type, dataUrl: reader.result });
        renderPendingMedia();
      };
      reader.readAsDataURL(f);
    });
  });
  const attachBtn = $('#attachBtn');
  if (attachBtn) {
    attachBtn.addEventListener('click', (e) => { e.stopPropagation(); $('#attachInput').click(); });
  }
  const attachInput = $('#attachInput');
  if (attachInput) {
    attachInput.addEventListener('change', () => {
      const files = Array.from(attachInput.files || []).slice(0, 8);
      attachInput.value = '';
      if (!files.length) return;
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = () => {
          pendingMedia.push({ name: f.name, size: f.size, type: f.type, dataUrl: reader.result });
          renderPendingMedia();
        };
        reader.readAsDataURL(f);
      });
    });
  }
  if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEmojiPicker(emojiBtn, text); });
  }
  const stickBtn = $('#stickBtn');
  if (stickBtn) {
    stickBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleStickPanel(stickBtn); });
  }
  const voiceBtn = $('#voiceBtn');
  if (voiceBtn) voiceBtn.addEventListener('click', (e) => { e.stopPropagation(); startRecording('voice'); });
  const videoMsgBtn = $('#videoMsgBtn');
  if (videoMsgBtn) videoMsgBtn.addEventListener('click', (e) => { e.stopPropagation(); startRecording('video'); });
  const recSend = $('#recSend');
  if (recSend) recSend.addEventListener('click', (e) => { e.stopPropagation(); stopRecording(); });
  const recCancel = $('#recCancel');
  if (recCancel) recCancel.addEventListener('click', (e) => { e.stopPropagation(); cancelRecording(); });
}

/* ---------- Отправка сообщений ---------- */
/* ============================================================
   ЗВОНКИ (личные и групповые)
   ============================================================ */
const callState = { chatId: null, startedAt: 0, muted: false, video: false, micStream: null, camStream: null, shareStream: null, shareActive: false, ticker: null };
let incomingCall = null; // { chatId, msgId, video }
let pendingMedia = []; // { name, size, type, dataUrl }

function mediaLabel(msg) {
  if (msg.media && msg.media.length) {
    const m = msg.media[0];
    if (m.type && m.type.startsWith('image/')) return msg.media.length > 1 ? `[${msg.media.length} фото]` : '[Фото]';
    return `[Файл: ${m.name}]`;
  }
  if (msg.voice) return '[Голосовое]';
  if (msg.video) return '[Кружок]';
  return '';
}
function renderPendingMedia() {
  const bar = $('#pendingBar');
  if (!bar) return;
  if (!pendingMedia.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = pendingMedia.map((m, i) => `
    <div class="pending-item">
      ${m.type && m.type.startsWith('image/')
        ? `<img src="${m.dataUrl}" alt="">`
        : `<span class="pending-file-ic">📄</span>`}
      <span class="pending-name">${escapeHtml(m.name)}</span>
      <button type="button" class="pending-del" data-pi="${i}" title="Убрать">✕</button>
    </div>`).join('') + '<div class="pending-send-hint">Нажмите ➤, чтобы отправить</div>';
  bar.querySelectorAll('.pending-del').forEach(b => b.addEventListener('click', () => {
    pendingMedia.splice(Number(b.dataset.pi), 1);
    renderPendingMedia();
  }));
}
function clearPendingMedia() {
  pendingMedia = [];
  renderPendingMedia();
}

function maybeShowIncoming(chat) {
  if (!chat || incomingCall) return;
  if (callState.chatId === chat.id) return;
  const ev = [...(chat.messages || [])].reverse().find(m => m.kind === 'call_in' && !m.dismissed);
  if (!ev) return;
  if (Date.now() - new Date(ev.time).getTime() > 5 * 60000) { ev.dismissed = true; saveState(); return; }
  const done = (chat.messages || []).some(m => (m.kind === 'call_declined' || m.kind === 'call_ended' || m.kind === 'call_missed') && new Date(m.time) > new Date(ev.time));
  if (done) { ev.dismissed = true; saveState(); return; }
  incomingCall = { chatId: chat.id, msgId: ev.id, video: !!ev.video };
  const acc = chat.type === 'private' ? accountByUsername(chat.userId) : null;
  const av = $('#incomingAvatar'), nm = $('#incomingName');
  if (av) av.innerHTML = avatarHtml(acc || { name: chatTitle(chat), color: chat.color }, 'big', acc ? selectedFrameClass(acc) : '');
  if (nm) nm.textContent = chat.type === 'private' ? (acc ? acc.name : 'Пользователь') : chatTitle(chat);
  $('#incomingOverlay').classList.remove('hidden');
  startRing('in');
}
function maybeShowIncomingAll() {
  if (incomingCall) return;
  let best = null, bestT = 0;
  (state.chats || []).forEach(c => {
    const ev = [...(c.messages || [])].reverse().find(m => m.kind === 'call_in' && !m.dismissed);
    if (!ev) return;
    const t = new Date(ev.time).getTime();
    if (t > bestT && callState.chatId !== c.id) { best = c; bestT = t; }
  });
  if (best) maybeShowIncoming(best);
}
function closeIncoming(playSound = false) {
  $('#incomingOverlay').classList.add('hidden');
  incomingCall = null;
  stopRing();
  if (playSound) playDecline();
}
function bindIncomingCall() {
  $('#incomingAccept').addEventListener('click', () => {
    if (!incomingCall) return;
    const ic = incomingCall;
    const chat = state.chats.find(c => c.id === ic.chatId);
    const msg = chat && chat.messages.find(m => m.id === ic.msgId);
    if (msg) { msg.answered = true; msg.dismissed = true; saveState(); renderMessages(chat); }
    closeIncoming();
    if (chat) startCall(chat.id, ic.video, true);
  });
  $('#incomingDecline').addEventListener('click', () => {
    if (!incomingCall) return;
    const ic = incomingCall;
    const chat = state.chats.find(c => c.id === ic.chatId);
    const msg = chat && chat.messages.find(m => m.id === ic.msgId);
    if (msg) { msg.dismissed = true; saveState(); renderMessages(chat); }
    if (chat && chat.type === 'private') {
      const caller = accountByUsername(chat.userId);
      pushCallEventEverywhere(chat,
        { kind: 'call_declined', text: `Вы отклонили вызов от @${(caller || {}).username || chat.userId}` },
        { kind: 'call_declined', text: `@${currentUser.username} отклонил ваш вызов` }
      );
      saveState();
      renderMessages(chat);
    }
    closeIncoming(true);
    toast('Вызов отклонён');
  });
}
function endCallIfActive() {
  if (callState.chatId) endCall();
}

function chatMembers(chat) {
  if (chat.type === 'group' || chat.type === 'channel') {
    return chat.members.length ? chat.members.map(m => m === 'me' ? currentUser : accountByUsername(m)).filter(Boolean) : [];
  }
  return [currentUser, userById(chat.userId)].filter(Boolean);
}

/* ---------- События звонков (входящий / пропущенный) ---------- */
function pushCallEvent(chat, ev) {
  const msg = {
    id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
    from: 'system',
    kind: ev.kind,
    video: !!ev.video,
    u: ev.u || '',
    text: ev.text,
    time: new Date().toISOString(),
    read: true,
  };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
}
function pushCallEventEverywhere(chat, mineEv, themEv) {
  pushCallEvent(chat, mineEv);
  if (chat.type === 'private' && themEv) {
    const s = getStateFor(chat.userId);
    if (s && s.chats) {
      const c2 = s.chats.find(x => x.type === 'private' && x.userId === currentUser.username);
      if (c2) {
        if (themEv.kind === 'call_missed' || themEv.kind === 'call_ended') {
          const open = [...(c2.messages || [])].reverse().find(m => m.kind === 'call_in' && !m.dismissed);
          if (open) open.dismissed = true;
        }
        pushCallEvent(c2, themEv);
        if (themEv.kind === 'call_missed') {
          c2.missedCalls = (c2.missedCalls || 0) + 1;
          c2.unread = (c2.unread || 0) + 1;
        }
        saveStateFor(chat.userId, s);
      }
    }
  }
  saveState();
}
function fmtDur(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function sysCallHtml(msg, chat) {
  const t = fmtTime(msg.time);
  const icon = msg.video ? '🎥' : '📞';
  if (msg.kind === 'call_in' && !msg.dismissed) {
    return `<div class="sys-call in" data-msg="${msg.id}">
      <div class="sc-icon">${icon}</div>
      <div class="sc-text"><b>Входящий звонок</b><span>${escapeHtml(msg.text)} · ${t}</span></div>
      <div class="sc-btns">
        <button type="button" class="btn btn-primary sys-call-btn" data-sys="answer">Ответить</button>
        <button type="button" class="btn btn-ghost sys-call-btn" data-sys="decline">Отклонить</button>
      </div>
    </div>`;
  }
  if (msg.kind === 'call_missed') {
    return `<div class="sys-call missed" data-msg="${msg.id}">
      <div class="sc-icon">📵</div>
      <div class="sc-text"><b>Пропущенный вызов</b><span>${escapeHtml(msg.text)} · ${t}</span></div>
      <button type="button" class="btn btn-ghost sys-call-btn" data-sys="call">↩ Позвонить</button>
    </div>`;
  }
  if (msg.kind === 'call_declined') {
    return `<div class="sys-call declined" data-msg="${msg.id}">
      <div class="sc-icon">❌</div>
      <div class="sc-text"><b>Вызов отклонён</b><span>${escapeHtml(msg.text)} · ${t}</span></div>
      ${chat.type === 'private' ? '<button type="button" class="btn btn-ghost sys-call-btn" data-sys="call">↩ Позвонить</button>' : ''}
    </div>`;
  }
  if (msg.kind === 'call_ended') {
    return `<div class="sys-call ended" data-msg="${msg.id}"><div class="sc-icon">✅</div><div class="sc-text"><b>${escapeHtml(msg.text)}</b><span>${t}</span></div></div>`;
  }
  return `<div class="sys-call out" data-msg="${msg.id}"><div class="sc-icon">${icon}</div><div class="sc-text"><b>${escapeHtml(msg.text)}</b><span>${t}</span></div></div>`;
}

function stopStreams() {
  [callState.micStream, callState.camStream, callState.shareStream].forEach(s => { if (s) s.getTracks().forEach(t => t.stop()); });
  callState.micStream = null; callState.camStream = null; callState.shareStream = null;
  callState.shareActive = false;
}
function enableMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
  const devs = (currentUser.settings && currentUser.settings.devices) || {};
  const opts = devs.audioId ? { audio: { deviceId: { exact: devs.audioId } } } : { audio: true };
  return navigator.mediaDevices.getUserMedia(opts)
    .then(s => { callState.micStream = s; rtcAttachLocalTracks(); updateCallStatus(); return true; })
    .catch(() => false);
}
async function enableCamera() {
  const camBtn = $('#callCamBtn');
  try {
    const devs = (currentUser.settings && currentUser.settings.devices) || {};
    const opts = devs.videoId ? { video: { deviceId: { exact: devs.videoId } } } : { video: { facingMode: 'user' } };
    callState.camStream = await navigator.mediaDevices.getUserMedia(opts);
    callState.video = true;
    rtcAttachLocalTracks();
    const v = $('#camVideo');
    if (v) { v.srcObject = callState.camStream; v.play().catch(() => {}); }
    if (camBtn) camBtn.classList.remove('muted');
  } catch (e) {
    callState.video = false;
    if (camBtn) camBtn.classList.add('muted');
    toast('Камера недоступна', 'Разрешите доступ к камере или проверьте подключение');
  }
  updateCallStageUI();
  updateCallStatus();
}
function disableCamera() {
  if (callState.camStream) { callState.camStream.getTracks().forEach(t => t.stop()); callState.camStream = null; }
  callState.video = false;
  const v = $('#camVideo');
  if (v) v.srcObject = null;
  const camBtn = $('#callCamBtn');
  if (camBtn) camBtn.classList.add('muted');
  updateCallStageUI();
  updateCallStatus();
}
async function enableShare() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('unsupported');
    callState.shareStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = callState.shareStream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', disableShare);
    callState.shareActive = true;
    const v = $('#shareVideo');
    if (v) { v.srcObject = callState.shareStream; v.play().catch(() => {}); }
    const btn = $('#callShareBtn');
    if (btn) btn.classList.add('active');
  } catch (e) {
    toast('Показ экрана отменён или недоступен', 'Нужен доступ к записи экрана');
  }
  updateCallStageUI();
  updateCallStatus();
}
function disableShare() {
  if (callState.shareStream) { callState.shareStream.getTracks().forEach(t => t.stop()); callState.shareStream = null; }
  callState.shareActive = false;
  const v = $('#shareVideo');
  if (v) v.srcObject = null;
  const btn = $('#callShareBtn');
  if (btn) btn.classList.remove('active');
  updateCallStageUI();
  updateCallStatus();
}
function callStatusText() {
  const parts = [];
  if (callState.muted) parts.push('микрофон выключен');
  if (callState.shareActive) parts.push('демонстрация экрана');
  else if (callState.video) parts.push('камера включена');
  return parts.join(' · ') || 'идёт разговор…';
}
function updateCallStatus() {
  const ch = state.chats.find(c => c.id === callState.chatId);
  if (!ch) return;
  const st = $('#callStatus');
  if (!st) return;
  if (ch.type !== 'private') {
    st.innerHTML = `<div class="cs-title">Групповой звонок · <b>${escapeHtml(chatTitle(ch))}</b></div>
      <div class="cs-sub">${chatMembers(ch).length} участников · ${callStatusText()}</div>`;
  } else {
    const other = userById(ch.userId);
    st.innerHTML = `<div class="cs-title">${displayName(other)}</div>
      <div class="cs-sub">${callStatusText()}</div>`;
  }
}
function updateCallStageUI() {
  const sv = $('#shareVideo'), cv = $('#camVideo'), r = $('#callRemote'), sb = $('#shareBadge');
  if (sv) sv.classList.toggle('on', !!callState.shareStream);
  if (cv) cv.classList.toggle('on', !!callState.camStream);
  const connectedVideo = rtcConnected && (callState.video || callState.shareStream || callState.camStream);
  if (r) r.classList.toggle('demo', !connectedVideo);
  if (sb) sb.classList.toggle('on', !!callState.shareStream);
}
function startCall(chatId, video = false, noEvents = false) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  const members = chatMembers(chat);
  if (members.length < 2) {
    toast('Позвонить некому', members.length === 1 ? 'В этом чате пока только вы' : 'Нет доступных участников');
    return;
  }
  const oldPip = $('#callPip');
  if (oldPip) oldPip.remove();
  stopStreams();
  callState.chatId = chatId;
  callState.startedAt = Date.now();
  callState.muted = false;
  callState.video = video;
  renderCall(chat);
  $('#callModal').classList.add('open');
  const mb = $('#callMuteBtn'); if (mb) mb.classList.remove('muted');
  const cb = $('#callCamBtn'); if (cb) cb.classList.toggle('muted', !video);
  const sb = $('#callShareBtn'); if (sb) sb.classList.remove('active');
  if (!noEvents) {
    pushCallEventEverywhere(
      chat,
      { kind: 'call_out', video, u: currentUser.username, text: `${video ? '🎥' : '📞'} Исходящий ${video ? 'видео' : ''}звонок @${chat.type === 'private' ? chat.userId : 'собеседникам'}` },
      { kind: 'call_in', video, u: currentUser.username, text: `Звонок от @${currentUser.username}${video ? ' · видео' : ''}` }
    );
    startRing('out');
  }
  callState.ticker = setInterval(() => {
    const ch = state.chats.find(c => c.id === callState.chatId);
    if (!ch) return;
    const dur = Math.floor((Date.now() - callState.startedAt) / 1000);
    const t = $('#callTimer');
    if (t) t.textContent = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    const pt = $('#pipTime');
    if (pt) pt.textContent = t ? t.textContent : `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
  }, 1000);
  toast(video ? 'Видеозвонок начат' : 'Звонок начат', members.length > 2 ? 'Групповой звонок' : chatTitle(chat));
  if (chat.type === 'private' && rtcSupports()) {
    rtcMode = 'rtc';
    rtcRole = noEvents ? 'callee' : 'caller';
    rtcConnected = false;
    rtcSetupAt = Date.now();
    rtcIceRestarted = false;
    rtcAddedCand = { a: 0, b: 0 };
    try { rtcPeer = new RTCPeerConnection(RTC_STUN); } catch (e) { rtcPeer = null; }
    if (rtcPeer) {
      rtcPeer.onicecandidate = e => { if (e.candidate) rtcSendCandidates(chat.id, [e.candidate]); };
      rtcPeer.ontrack = e => { rtcRemoteStream = e.streams[0] || null; rtcAttachRemote(); };
      rtcPeer.onconnectionstatechange = () => {
        if (!rtcPeer) return;
        const st = rtcPeer.connectionState;
        if (st === 'connected' || st === 'completed') {
          rtcConnected = true;
          stopRing();
          updateCallStatus();
        } else if (!rtcConnected && (st === 'failed' || st === 'disconnected')) {
          if (!rtcIceRestarted && rtcRole === 'caller' && Date.now() - rtcSetupAt > 8000) {
            rtcIceRestarted = true;
            if (rtcPeer.restartIce) rtcPeer.restartIce().catch(() => {});
            else rtcFallbackSim(chat.id);
          } else if (Date.now() - rtcSetupAt > 15000) {
            rtcFallbackSim(chat.id);
          }
        }
      };
      const micP = enableMic();
      const camP = video ? enableCamera() : Promise.resolve(true);
      Promise.all([micP, camP]).then(() => rtcSetupLocal(chat)).catch(() => rtcSetupLocal(chat));
      if (rtcFallbackTimer) clearTimeout(rtcFallbackTimer);
      rtcFallbackTimer = setTimeout(() => { if (!rtcConnected && rtcMode === 'rtc') rtcFallbackSim(chat.id); }, 16000);
    } else {
      rtcMode = 'sim';
      enableMic();
      if (video) enableCamera();
    }
  } else {
    rtcMode = 'sim';
    enableMic();
    if (video) enableCamera();
  }
}

function renderCall(chat) {
  const isGroup = chat.type !== 'private';
  const members = chatMembers(chat);
  const dur = Math.floor((Date.now() - callState.startedAt) / 1000);
  const t = $('#callTimer');
  if (t) t.textContent = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
  updateCallStatus();
  const other = !isGroup ? userById(chat.userId) : null;
  const f = other ? selectedFrameClass(other) : '';
  const stage = $('#callStage');
  if (stage) {
    const remoteInner = other
      ? `<span class="cape"><span class="avatar ${f ? 'framed frame-' + f : ''}" style="${avatarStyle(other)}">${avatarInnerHtml(other)}</span></span>`
      : `<span class="cape"><span style="font-size:34px">🎥</span></span>`;
    stage.innerHTML = `
      <div class="call-bubbles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <video id="shareVideo" autoplay playsinline></video>
      <div class="share-badge" id="shareBadge">🖥 Идёт демонстрация экрана</div>
      <div class="call-remote demo" id="callRemote">
        ${remoteInner}
        <div class="cs-sub">${escapeHtml(other ? displayName(other) : chatTitle(chat))}</div>
      </div>
      <video id="rtcRemoteVideo" autoplay playsinline></video>
      <audio id="rtcRemoteAudio" autoplay></audio>
      <video id="camVideo" autoplay playsinline muted></video>`;
    const sv = $('#shareVideo');
    if (sv && callState.shareStream) { sv.srcObject = callState.shareStream; sv.play().catch(() => {}); }
    const cv = $('#camVideo');
    if (cv && callState.camStream) { cv.srcObject = callState.camStream; cv.play().catch(() => {}); }
    rtcAttachRemote();
    updateCallStageUI();
  }
  const part = $('#callParticipants');
  if (part) {
    part.innerHTML = isGroup ? members.map(u => `
      <div class="call-part">
        <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
        <span>${u.username === currentUser.username ? 'Вы' : displayName(u)}</span>
      </div>`).join('') : `
      <div class="call-part">
        <span class="avatar ${f ? 'framed frame-' + f : ''}" style="${avatarStyle(other)}">${avatarInnerHtml(other)}</span>
        <span>${displayName(other)}</span>
      </div>`;
  }
}

function endCall() {
  clearInterval(callState.ticker);
  callState.ticker = null;
  stopRing();
  closeIncoming();
  const pip = $('#callPip');
  if (pip) pip.remove();
  const dur = callState.startedAt ? Math.floor((Date.now() - callState.startedAt) / 1000) : 0;
  const endChat = state.chats.find(c => c.id === callState.chatId);
  if (endChat) {
    const isPriv = endChat.type === 'private';
    const who = isPriv ? '@' + endChat.userId : '«' + chatTitle(endChat) + '»';
    if (dur < 5) {
      pushCallEventEverywhere(
        endChat,
        { kind: 'call_missed', text: `Вы звонили ${who}, но ответа не было` },
        { kind: 'call_missed', text: `Пропущенный вызов от @${currentUser.username}` }
      );
      addLog(currentUser.username, `Звонок ${who} не был принят (пропущен, ${dur} сек)`);
    } else {
      pushCallEventEverywhere(
        endChat,
        { kind: 'call_ended', text: `Звонок завершён · ${fmtDur(dur)}` },
        { kind: 'call_ended', text: `Звонок от @${currentUser.username} завершён · ${fmtDur(dur)}` }
      );
    }
  }
  const wasGroup = !!endChat && endChat.type !== 'private';
  callState.chatId = null;
  callState.startedAt = 0;
  stopStreams();
  const cm = $('#callMenu'); if (cm) cm.classList.add('hidden');
  const gp = $('#gamePanel'); if (gp) gp.classList.add('hidden');
  $('#callModal').classList.remove('open');
  const sigChat = endChat;
  rtcTeardown(false);
  if (sigChat) { cloudDelete(rtcSigKeyFor(sigChat.id) + '_a'); cloudDelete(rtcSigKeyFor(sigChat.id) + '_b'); }
  renderChat();
  renderChatList();
  if (dur > 0) toast('Звонок завершён', (wasGroup ? 'Групповой · ' : '') + fmtDur(dur));
}

/* ---------- НАСТОЯЩИЕ ЗВОНКИ (WebRTC) через облако ----------
   Сигнализация: offer/answer/ICE кандидаты обмениваются через облачные ключи
   call_sig_<chatId>_a (звонящий) и call_sig_<chatId>_b (отвечающий).
   Если прямое соединение не установилось (сложный NAT) — остаётся демо-режим. */
const RTC_TURN = [];
const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] },
    ...RTC_TURN,
  ],
  iceCandidatePoolSize: 4,
};
const RTC_STUN = RTC_CONFIG;
let rtcPeer = null, rtcRemoteStream = null, rtcSigTimer = null, rtcFallbackTimer = null;
let rtcMode = 'sim', rtcRole = 'caller', rtcConnected = false, rtcSetupAt = 0, rtcIceRestarted = false;
let rtcAddedCand = { a: 0, b: 0 };
function rtcSupports() {
  return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
}
function rtcSigKeyFor(chatId) { return 'call_sig_' + chatId; }
function rtcSideName() { return rtcRole === 'caller' ? 'a' : 'b'; }
function rtcSendMine(chatId, doc) {
  return cloudSave(rtcSigKeyFor(chatId) + '_' + rtcSideName(), JSON.stringify(Object.assign({ v: Date.now() }, doc)));
}
function rtcReadSide(chatId, role) {
  return cloudLoad(rtcSigKeyFor(chatId) + '_' + (role === 'caller' ? 'a' : 'b')).then(r => {
    if (!r) return null;
    try { const d = JSON.parse(r.d); d.v = r.v; return d; } catch (e) { return null; }
  });
}
function rtcReadSides(chatId) {
  return Promise.all([rtcReadSide(chatId, 'caller'), rtcReadSide(chatId, 'callee')]).then(([a, b]) => ({ a, b }));
}
function rtcAttachLocalTracks() {
  if (!rtcPeer) return;
  [callState.micStream, callState.camStream].forEach(s => {
    if (!s) return;
    s.getTracks().forEach(t => {
      if (!rtcPeer.getSenders().some(x => x.track === t)) {
        try { rtcPeer.addTrack(t, s); } catch (e) {}
      }
    });
  });
}
function rtcAttachRemote() {
  if (!rtcRemoteStream) return;
  if (callState.video) {
    const rv = $('#rtcRemoteVideo');
    if (rv) { rv.srcObject = rtcRemoteStream; rv.classList.add('on'); rv.play().catch(() => {}); }
  } else {
    const ra = $('#rtcRemoteAudio');
    if (ra) { ra.srcObject = rtcRemoteStream; ra.play().catch(() => {}); }
  }
}
function rtcSetupLocal(chat) {
  if (!rtcPeer) return;
  rtcAttachLocalTracks();
  if (rtcRole === 'callee') {
    rtcPollSig(chat);
    rtcSigTimer = setInterval(() => rtcPollSig(chat), 2000);
  } else {
    rtcPeer.createOffer().then(o => rtcPeer.setLocalDescription(o))
      .then(() => rtcSendMine(chat.id, { offer: rtcPeer.localDescription, from: currentUser.username }))
      .then(() => { rtcPollSig(chat); rtcSigTimer = setInterval(() => rtcPollSig(chat), 2000); })
      .catch(() => {});
  }
}
function rtcPollSig(chat) {
  if (!rtcPeer || rtcMode !== 'rtc') return;
  rtcReadSides(chat.id).then(d => {
    if (!rtcPeer || rtcMode !== 'rtc') return;
    const theirs = rtcRole === 'caller' ? d.b : d.a;
    if (!theirs) return;
    if (theirs.offer && rtcPeer.remoteDescription === null) {
      rtcPeer.setRemoteDescription(theirs.offer)
        .then(() => rtcPeer.createAnswer())
        .then(a => rtcPeer.setLocalDescription(a))
        .then(() => rtcSendMine(chat.id, { answer: rtcPeer.localDescription, from: currentUser.username }))
        .then(() => { if ((theirs.cand || []).length) rtcAddCandidates(theirs.cand); })
        .catch(() => {});
      return;
    }
    if (theirs.answer && rtcPeer.remoteDescription === null) {
      rtcPeer.setRemoteDescription(theirs.answer)
        .then(() => { if ((theirs.cand || []).length) rtcAddCandidates(theirs.cand); })
        .catch(() => {});
      return;
    }
    if (rtcPeer.remoteDescription && theirs.cand && theirs.cand.length) rtcAddCandidates(theirs.cand);
  }).catch(() => {});
}
function rtcSendCandidates(chatId, cands) {
  if (!rtcPeer || rtcMode !== 'rtc' || !cands || !cands.length) return;
  rtcReadSide(chatId, rtcRole).then(mine => {
    if (!rtcPeer || rtcMode !== 'rtc') return;
    const doc = mine || {};
    const cur = (doc.cand || []).filter(c => c && c.sdp);
    const seen = new Set(cur.map(c => c.sdp));
    const add = cands.filter(c => c && c.sdp && !seen.has(c.sdp));
    if (!add.length) return;
    doc.cand = cur.concat(add);
    rtcSendMine(chatId, doc);
  }).catch(() => {});
}
function rtcAddCandidates(cands) {
  if (!rtcPeer || !cands || !cands.length) return;
  const side = rtcRole === 'caller' ? 'b' : 'a';
  const start = rtcAddedCand[side] || 0;
  cands.slice(start).forEach(c => {
    rtcAddedCand[side]++;
    rtcPeer.addIceCandidate(c).catch(() => {});
  });
}
function rtcTeardown(keepStreams) {
  if (rtcSigTimer) { clearInterval(rtcSigTimer); rtcSigTimer = null; }
  if (rtcFallbackTimer) { clearTimeout(rtcFallbackTimer); rtcFallbackTimer = null; }
  if (rtcPeer) { try { rtcPeer.close(); } catch (e) {} rtcPeer = null; }
  rtcRemoteStream = null;
  rtcConnected = false;
  rtcMode = 'sim';
  rtcAddedCand = { a: 0, b: 0 };
  if (!keepStreams) stopStreams();
}
function rtcFallbackSim(chatId) {
  rtcTeardown(true);
  if (callState.chatId === chatId) toast('Не удалось установить прямое соединение', 'Включён демо-режим звонка');
}

function bindCallModal() {
  bindIncomingCall();
  $('#callMuteBtn').addEventListener('click', () => {
    if (!callState.chatId) return;
    callState.muted = !callState.muted;
    $('#callMuteBtn').classList.toggle('muted', callState.muted);
    if (callState.micStream) callState.micStream.getAudioTracks().forEach(t => t.enabled = !callState.muted);
    if (callState.micStream) callState.micStream.getAudioTracks().forEach(t => t.enabled = !callState.muted);
    updateCallStatus();
    toast(callState.muted ? 'Микрофон выключен' : 'Микрофон включён');
  });
  $('#callCamBtn').addEventListener('click', () => {
    if (!callState.chatId) return;
    if (callState.video) disableCamera();
    else enableCamera();
  });
  $('#callShareBtn').addEventListener('click', () => {
    if (!callState.chatId) return;
    if (callState.shareActive) disableShare();
    else enableShare();
  });
  $('#callMinBtn').addEventListener('click', minimizeCall);
  $('#callEndBtn').addEventListener('click', endCall);
  $('#callSettingsBtn').addEventListener('click', () => {
    if (!callState.chatId) return;
    const m = $('#callMenu');
    if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
    $('#gamePanel').classList.add('hidden');
    m.classList.remove('hidden');
    populateCallDevices();
    const st = $('#cmShareState');
    if (st) st.textContent = callState.shareActive ? 'идёт демонстрация' : 'выключена';
  });
  const cmShare = $('#cmShareBtn');
  if (cmShare) cmShare.addEventListener('click', () => {
    if (!callState.chatId) return;
    if (callState.shareActive) disableShare();
    else enableShare();
    const st = $('#cmShareState');
    if (st) st.textContent = callState.shareActive ? 'идёт демонстрация' : 'выключена';
  });
  bindCallDeviceSelect($('#cmCam'), 'videoId', () => {
    if (callState.video) { disableCamera(); enableCamera(); }
  });
  bindCallDeviceSelect($('#cmMic'), 'audioId', () => {
    if (callState.micStream) { callState.micStream.getTracks().forEach(t => t.stop()); callState.micStream = null; enableMic(); }
  });
  bindCallDeviceSelect($('#cmOut'), 'outId', () => applyAudioOutput());
  $('#callGameBtn').addEventListener('click', () => {
    if (!callState.chatId) return;
    const gp = $('#gamePanel');
    if (!gp.classList.contains('hidden')) { gp.classList.add('hidden'); return; }
    $('#callMenu').classList.add('hidden');
    gp.classList.remove('hidden');
    gameReset();
  });
  const gpReset = $('#gpReset');
  if (gpReset) gpReset.addEventListener('click', gameReset);
  const rpsReset = $('#rpsReset');
  if (rpsReset) rpsReset.addEventListener('click', () => { gameRps.score = [0, 0]; gameRps.picks = [null, null]; gameRps.step = 0; const m = $('#rpsMsg'); if (m) m.textContent = gameRps.mode === 'pvp' ? 'Игрок 1 выбирает жест…' : 'Выберите жест — до 3 побед'; const u = $('#rpsU'), b = $('#rpsB'); if (u) u.textContent = '❔'; if (b) b.textContent = '❔'; renderRps(); });
  document.querySelectorAll('.gp-tab').forEach(t => t.addEventListener('click', () => switchGamePanel(t.dataset.g)));
  document.querySelectorAll('.gp-mode-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll(`.gp-mode-btn[data-g="${btn.dataset.g}"]`).forEach(x => x.classList.toggle('sel', x === btn));
    setGameMode(btn.dataset.g, btn.dataset.mode);
  }));
  document.querySelectorAll('.rps-btn').forEach(btn => btn.addEventListener('click', () => playRps(+btn.dataset.p)));
}

function populateCallDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  navigator.mediaDevices.enumerateDevices().then(list => {
    const devs = currentUser.settings.devices = currentUser.settings.devices || {};
    const cam = $('#cmCam'), mic = $('#cmMic'), out = $('#cmOut');
    if (!cam || !mic || !out) return;
    const vid = list.filter(d => d.kind === 'videoinput');
    const aud = list.filter(d => d.kind === 'audioinput');
    const spo = list.filter(d => d.kind === 'audiooutput');
    cam.innerHTML = '<option value="">По умолчанию</option>' + vid.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Камера ' + (i + 1))}</option>`).join('');
    mic.innerHTML = '<option value="">По умолчанию</option>' + aud.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Микрофон ' + (i + 1))}</option>`).join('');
    out.innerHTML = '<option value="">По умолчанию</option>' + spo.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Динамик ' + (i + 1))}</option>`).join('');
    if (!vid.length) cam.innerHTML = '<option value="">Камер не найдено</option>';
    if (!aud.length) mic.innerHTML = '<option value="">Микрофонов не найдено</option>';
    if (!spo.length) out.innerHTML = '<option value="">Динамиков не найдено</option>';
    cam.value = devs.videoId || '';
    mic.value = devs.audioId || '';
    out.value = devs.outId || '';
  }).catch(() => {});
}
function bindCallDeviceSelect(sel, key, onApplied) {
  if (!sel) return;
  sel.addEventListener('change', () => {
    const devs = currentUser.settings.devices = currentUser.settings.devices || {};
    devs[key] = sel.value || null;
    persistCurrentUser();
    if (onApplied) onApplied();
    toast('Устройство обновлено');
  });
}
function applyAudioOutput() {
  const devs = (currentUser.settings && currentUser.settings.devices) || {};
  if (!devs.outId) return;
  const vs = [$('#camVideo'), $('#shareVideo'), $('#callPip') ? $('#callPip').querySelector('video') : null];
  vs.forEach(v => { if (v && v.setSinkId) v.setSinkId(devs.outId).catch(() => {}); });
}

const gameState = { board: [], me: '❌', bot: '⭕', turn: 0, over: false, winner: null, score: [0, 0], mode: 'bot', busy: false };
const gameRps = { score: [0, 0], busy: false, mode: 'bot', picks: [null, null], step: 0 };
const RPS_EMOJI = ['✊', '✋', '✌️'];
function rpsResult(a, b) { if (a === b) return 0; return b === (a + 2) % 3 ? 1 : -1; }
function setGameMode(g, mode) {
  if (g === 'xo') {
    gameState.mode = mode;
    gameReset();
    return;
  }
  gameRps.mode = mode;
  gameRps.picks = [null, null];
  gameRps.step = 0;
  const m = $('#rpsMsg');
  if (m) m.textContent = mode === 'pvp' ? 'Игрок 1 выбирает жест…' : 'Выберите жест — до 3 побед';
  const u = $('#rpsU'), b = $('#rpsB');
  if (u) u.textContent = '❔';
  if (b) b.textContent = '❔';
  renderRps();
}
function renderRps() {
  const su = $('#rpsScoreU'), sb = $('#rpsScoreB');
  if (su) su.textContent = gameRps.score[0];
  if (sb) sb.textContent = gameRps.score[1];
}
function rpsVsLabel(me, opp) {
  return `Вы: <b>${me}</b> · Соперник: <b>${opp}</b>`;
}
function playRps(pick) {
  if (gameRps.busy) return;
  const uEl = $('#rpsU'), bEl = $('#rpsB'), m = $('#rpsMsg');
  if (gameRps.mode === 'pvp') {
    if (gameRps.step === 0) {
      gameRps.picks[0] = pick;
      gameRps.step = 1;
      gameRps.busy = true;
      if (uEl) uEl.textContent = RPS_EMOJI[pick];
      if (bEl) bEl.textContent = '…';
      if (m) m.textContent = 'Игрок 1 выбрал · Игрок 2 думает…';
      renderRps();
      setTimeout(() => {
        gameRps.picks[1] = Math.floor(Math.random() * 3);
        if (bEl) bEl.textContent = RPS_EMOJI[gameRps.picks[1]];
        const res = rpsResult(gameRps.picks[0], gameRps.picks[1]);
        if (res > 0) { gameRps.score[0]++; if (m) m.textContent = 'Победил Игрок 1! 🎉'; }
        else if (res < 0) { gameRps.score[1]++; if (m) m.textContent = 'Победил Игрок 2! 🎉'; }
        else if (m) m.textContent = 'Ничья 🤝';
        if (gameRps.score[0] >= 3) { if (m) m.textContent = 'Игрок 1 выиграл матч! 🏆'; gameRps.score = [0, 0]; }
        else if (gameRps.score[1] >= 3) { if (m) m.textContent = 'Игрок 2 выиграл матч! 🏆'; gameRps.score = [0, 0]; }
        renderRps();
        gameRps.picks = [null, null];
        gameRps.step = 0;
        gameRps.busy = false;
        if (m && !m.textContent.includes('матч')) m.textContent += ' · Новый раунд: ваш ход…';
        else if (m && m.textContent.includes('матч')) m.textContent += ' · Новый раунд: ваш ход…';
      }, 900);
      return;
    }
    return;
  }
  gameRps.busy = true;
  const bot = Math.floor(Math.random() * 3);
  if (uEl) uEl.textContent = RPS_EMOJI[pick];
  if (bEl) bEl.textContent = '…';
  if (m) m.textContent = '3…2…1';
  setTimeout(() => {
    if (bEl) bEl.textContent = RPS_EMOJI[bot];
    const res = rpsResult(pick, bot);
    if (res > 0) { gameRps.score[0]++; if (m) m.textContent = 'Вы выиграли раунд! 🎉'; }
    else if (res < 0) { gameRps.score[1]++; if (m) m.textContent = 'Бот выиграл раунд 🤖'; }
    else if (m) m.textContent = 'Ничья 🤝';
    if (gameRps.score[0] >= 3) { if (m) m.textContent = 'Победа — вы до 3 побед! 🏆'; gameRps.score = [0, 0]; }
    else if (gameRps.score[1] >= 3) { if (m) m.textContent = 'Бот до 3 побед — реванш? 😏'; gameRps.score = [0, 0]; }
    renderRps();
    gameRps.busy = false;
  }, 700);
}
function switchGamePanel(g) {
  const xo = $('#gpXo'), rps = $('#gpRps'), tabs = document.querySelectorAll('.gp-tab');
  if (tabs) tabs.forEach(t => t.classList.toggle('sel', t.dataset.g === g));
  if (xo) xo.classList.toggle('hidden', g !== 'xo');
  if (rps) rps.classList.toggle('hidden', g !== 'rps');
  if (g === 'xo') gameReset();
  else renderRps();
}
const WIN_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function gameReset() {
  gameState.board = Array(9).fill(null);
  gameState.turn = 0;
  gameState.over = false;
  gameState.winner = null;
  gameState.busy = false;
  renderGame();
}
function gameWinner(board) {
  for (const l of WIN_LINES) {
    if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[0]] === board[l[2]]) return board[l[0]];
  }
  return board.every(Boolean) ? 'draw' : null;
}
function renderGame() {
  const b = $('#gpBoard');
  if (!b) return;
  b.classList.toggle('busy', gameState.busy);
  b.innerHTML = gameState.board.map((c, i) => `<div class="gp-cell${c ? ' taken' : ''}" data-i="${i}">${c || ''}</div>`).join('');
  b.querySelectorAll('.gp-cell').forEach(cell => cell.addEventListener('click', () => gameTap(+cell.dataset.i)));
  const su = $('#gpScoreU'), sb = $('#gpScoreB');
  if (su) su.textContent = gameState.score[0];
  if (sb) sb.textContent = gameState.score[1];
  const m = $('#gpMsg');
  const pvp = gameState.mode === 'pvp';
  if (m) m.textContent = gameState.over
    ? (gameState.winner === 'me' ? (pvp ? 'Победил Игрок 1! 🎉' : 'Вы победили! 🎉') : gameState.winner === 'bot' ? (pvp ? 'Победил Игрок 2! 🎉' : 'Победил бот 🤖') : 'Ничья 🤝')
    : pvp
      ? (gameState.busy ? 'Ход Игрока 2…' : 'Ваш ход (Игрок 1 · ❌)')
      : (gameState.turn === 0 ? 'Ваш ход' : 'Ход бота…');
}
function gameTap(i) {
  if (gameState.over || gameState.busy || gameState.board[i]) return;
  const pvp = gameState.mode === 'pvp';
  if (pvp && gameState.turn !== 0) return;
  if (!pvp && gameState.turn !== 0) return;
  const sym = pvp ? (gameState.turn === 0 ? gameState.me : gameState.bot) : gameState.me;
  gameState.board[i] = sym;
  let w = gameWinner(gameState.board);
  if (w) {
    gameState.over = true;
    if (w === gameState.me) { gameState.winner = 'me'; gameState.score[0]++; }
    else if (w === gameState.bot) { gameState.winner = 'bot'; gameState.score[1]++; }
    else if (w === 'draw') gameState.winner = 'draw';
    renderGame();
    return;
  }
  if (pvp) {
    gameState.turn = 1;
    gameState.busy = true;
    renderGame();
    setTimeout(() => {
      if (gameState.over) return;
      const empty = gameState.board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      if (!empty.length) { gameState.over = true; gameState.winner = 'draw'; gameState.busy = false; renderGame(); return; }
      gameState.board[empty[Math.floor(Math.random() * empty.length)]] = gameState.bot;
      const w2 = gameWinner(gameState.board);
      if (w2) {
        gameState.over = true;
        if (w2 === gameState.bot) { gameState.winner = 'bot'; gameState.score[1]++; }
        else if (w2 === 'draw') gameState.winner = 'draw';
      } else {
        gameState.turn = 0;
      }
      gameState.busy = false;
      renderGame();
    }, 600);
    return;
  }
  gameState.turn = 1;
  renderGame();
  setTimeout(() => {
    if (gameState.over) return;
    const empty = gameState.board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
    if (!empty.length) { gameState.over = true; gameState.winner = 'draw'; renderGame(); return; }
    gameState.board[empty[Math.floor(Math.random() * empty.length)]] = gameState.bot;
    const w2 = gameWinner(gameState.board);
    if (w2) {
      gameState.over = true;
      if (w2 === gameState.bot) { gameState.winner = 'bot'; gameState.score[1]++; }
      else if (w2 === 'draw') gameState.winner = 'draw';
    } else {
      gameState.turn = 0;
    }
    renderGame();
  }, 550);
}

function minimizeCall() {
  if (!callState.chatId) return;
  $('#callModal').classList.remove('open');
  const ch = state.chats.find(c => c.id === callState.chatId);
  if (!ch) return;
  let pip = $('#callPip');
  if (pip) pip.remove();
  pip = document.createElement('div');
  pip.className = 'call-pip';
  pip.id = 'callPip';
  const other = ch.type === 'private' ? userById(ch.userId) : null;
  const name = ch.type === 'private' ? (other ? displayName(other) : ch.userId) : chatTitle(ch);
  const last = callState.camStream || callState.shareStream;
  pip.innerHTML = `<div class="pip-media">${last ? '<video autoplay playsinline muted></video>' : '<div class="pip-avatar">📞</div>'}</div>
    <div class="pip-info">
      <div class="pip-name">${escapeHtml(name)}</div>
      <div class="pip-time"><i class="pip-dot"></i><span id="pipTime">00:00</span></div>
    </div>
    <button class="pip-end" id="pipEndBtn" title="Завершить"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg></button>`;
  document.body.appendChild(pip);
  const v = pip.querySelector('video');
  if (v && last) { v.srcObject = last; v.play().catch(() => {}); }
  let drag = null;
  pip.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pip-end')) return;
    const r = pip.getBoundingClientRect();
    pip.style.right = 'auto';
    pip.style.bottom = 'auto';
    pip.style.left = r.left + 'px';
    pip.style.top = r.top + 'px';
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    pip.classList.add('dragging');
    try { pip.setPointerCapture(e.pointerId); } catch (err) {}
  });
  pip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    pip.style.left = Math.max(0, Math.min(innerWidth - pip.offsetWidth, drag.ox + dx)) + 'px';
    pip.style.top = Math.max(0, Math.min(innerHeight - pip.offsetHeight, drag.oy + dy)) + 'px';
  });
  const endDrag = (e) => {
    if (!drag) return;
    if (drag.moved) { pip._justDragged = Date.now(); e.stopPropagation(); }
    drag = null;
    pip.classList.remove('dragging');
  };
  pip.addEventListener('pointerup', endDrag);
  pip.addEventListener('pointercancel', endDrag);
  pip.querySelector('.pip-end').addEventListener('click', (e) => {
    e.stopPropagation();
    endCall();
  });
  pip.addEventListener('click', () => {
    if (!callState.chatId) return;
    if (pip._justDragged && Date.now() - pip._justDragged < 350) return;
    pip.remove();
    const m = $('#callMenu'); if (m) m.classList.add('hidden');
    const g = $('#gamePanel'); if (g) g.classList.add('hidden');
    $('#callModal').classList.add('open');
  });
  const tick = () => {
    if (!callState.chatId) { clearInterval(pip._t); return; }
    const t = pip.querySelector('#pipTime');
    if (t) {
      const dur = Math.floor((Date.now() - callState.startedAt) / 1000);
      t.textContent = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    }
  };
  tick();
  pip._t = setInterval(tick, 1000);
}

let lastSendAt = 0;
function fmtDurShort(sec) {
  if (sec < 60) return sec + ' сек';
  if (sec < 3600) return Math.floor(sec / 60) + ' мин';
  return Math.floor(sec / 3600) + ' ч';
}
function fmtMb(b) {
  return b >= 1048576 ? (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' МБ' : Math.round(b / 1024) + ' КБ';
}
function sendMessage(chatId, text) {
  const chat = state.chats.find(c => c.id === chatId);
  const smExempt = isAdmin(currentUser.username) || chat.owner === 'me' || (chat.admins || []).includes('me');
  if (chat.slowMode > 0 && !smExempt && (chat.type === 'group' || chat.type === 'channel') && editTarget.chatId !== chatId) {
    const sml = chat.slowLast || (chat.slowLast = {});
    const last = sml[currentUser.username] || 0;
    const wait = chat.slowMode * 1000 - (Date.now() - last);
    if (wait > 0) {
      toast('Медленный режим', 'Подождите ' + fmtDurShort(Math.ceil(wait / 1000)));
      return;
    }
    sml[currentUser.username] = Date.now();
  }
  if (chat.type === 'private' && editTarget.chatId !== chatId) {
    const other = accountByUsername(chat.userId);
    if (other && !canWriteTo(currentUser.username, other)) {
      const wcw = (other.settings && other.settings.whoCanWrite) || 'all';
      toast('Нельзя отправить', wcw === 'nobody' ? `${other.name} запретил(а) писать себе` : `${other.name} разрешает писать только контактам`);
      return;
    }
  }
  if (editTarget.chatId === chatId) {
    const m = chat.messages.find(x => x.id === editTarget.msgId);
    if (m) { m.text = text; m.edited = true; pushMsgToCloud(chat, m); }
    editTarget.chatId = null; editTarget.msgId = null;
    addLog(currentUser.username, `Изменил сообщение в «${chatTitle(chat)}»`);
  } else {
    const media = pendingMedia.slice();
    const isNews = chat.id === NEWS_CHAT_ID;
    const msg = { id: 'm' + Date.now(), from: isNews ? 'news' : 'me', text, time: new Date().toISOString(), read: false, sent: true };
    if (media.length) msg.media = media;
    if (replyTarget.chatId === chatId) {
      const rt = chat.messages.find(x => x.id === replyTarget.msgId);
      if (rt) msg.replyTo = { id: rt.id, from: rt.from, name: senderName(rt, chat), text: shortText(rt.text, 60) };
      replyTarget.chatId = null; replyTarget.msgId = null;
    }
    chat.messages.push(msg);
    pushMsgToCloud(chat, msg);
    if (chat.type === 'channel' && chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else if (chat.type === 'group' || chat.type === 'channel') syncGroupMessageEverywhere(chat, msg, currentUser.username);
    else if (chat.type === 'private') syncPrivateMessageEverywhere(chat, msg, currentUser.username);
    const preview = shortText(text || mediaLabel(msg), 45);
    if (chatId === AI_CHAT_ID) addLog(currentUser.username, `Написал Nebula AI: "${preview}"`);
    else if (chat.type === 'private') addLog(currentUser.username, `Написал @${chat.userId}: "${preview}"`);
    else if (chat.type === 'saved') addLog(currentUser.username, `Сохранил заметку: "${preview}"`);
    else if (chat.type === 'group') addLog(currentUser.username, `Написал в группе «${chat.name}»: "${preview}"`);
    else addLog(currentUser.username, `Написал в канале «${chat.name}»: "${preview}"`);
    if (chatId === AI_CHAT_ID) {
      const reply = aiReplyFor(text);
      setTimeout(() => appendMessage(AI_CHAT_ID, { from: 'nebula', text: reply, read: true }), aiDelay());
    } else if (chat.type === 'private') {
      maybeBotReply(chat, text);
    } else if (chat.type === 'group') {
      maybeBotReply(chat, text);
    }
  }
  chat.unread = 0;
  if (chat.type === 'private') {
    const other = accountByUsername(chat.userId);
    if (other) {
      if (!(other.receivedFrom || []).includes(currentUser.username)) {
        other.receivedFrom = other.receivedFrom || [];
        other.receivedFrom.push(currentUser.username);
      }
      persistOther(other);
    }
  }
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}

/* ---------- Действия над сообщениями ---------- */
function composerExtraHtml(chat) {
  let html = '';
  if (editTarget.chatId === chat.id) {
    const m = chat.messages.find(x => x.id === editTarget.msgId);
    if (m) html += `<div class="composer-bar editing"><span>✎ Редактирование</span><b>${escapeHtml(shortText(m.text, 40))}</b><button data-bar="edit">✕</button></div>`;
  }
  if (replyTarget.chatId === chat.id) {
    const m = chat.messages.find(x => x.id === replyTarget.msgId);
    if (m) html += `<div class="composer-bar replying"><span>↩ В ответ на <i>${escapeHtml(senderName(m, chat))}</i></span><b>${escapeHtml(shortText(m.text, 40))}</b><button data-bar="reply">✕</button></div>`;
  }
  return html;
}
function refreshComposerBars(chat) {
  const el = document.getElementById('composerExtra');
  if (!el) return;
  const wrap = $('#messagesWrap');
  const prevH = wrap ? wrap.clientHeight : 0;
  const prevST = wrap ? wrap.scrollTop : 0;
  el.innerHTML = composerExtraHtml(chat);
  if (wrap) {
    const dh = prevH - wrap.clientHeight;
    if (dh) {
      if (wrap.scrollHeight - prevST - prevH < 140) wrap.scrollTop = wrap.scrollHeight;
      else wrap.scrollTop = prevST + dh;
    }
  }
}
function openPhotoViewer(md) {
  let ov = $('#photoViewer');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'photoViewer';
    ov.className = 'photo-viewer';
    ov.innerHTML = '<div class="pv-box"><img class="pv-img" src="" alt=""><button class="pv-close" title="Закрыть">✕</button><a class="pv-dl" download="" href="">⬇ Скачать</a></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.pv-close')) ov.classList.remove('open'); });
  }
  const img = ov.querySelector('.pv-img'), dl = ov.querySelector('.pv-dl');
  img.src = md.dataUrl;
  dl.href = md.dataUrl;
  dl.download = md.name || 'photo';
  ov.classList.add('open');
}

function bindMsgDelegation() {
  if (window._msgDelegBinded) return;
  window._msgDelegBinded = true;
  const root = document.getElementById('chatArea');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const chat = currentChat();
    if (!chat) return;
    const sysBtn = e.target.closest('[data-sys]');
    if (sysBtn) {
      const sAct = sysBtn.dataset.sys;
      if (sAct === 'answer') { closeIncoming(); startCall(chat.id, false, true); }
      else if (sAct === 'call') { closeIncoming(); startCall(chat.id, false); }
      else if (sAct === 'decline') {
        const el = e.target.closest('.sys-call');
        const m = el ? chat.messages.find(x => x.id === el.dataset.msg) : null;
        if (m) {
          m.dismissed = true;
          if (chat.type === 'private') {
            const caller = accountByUsername(chat.userId);
            pushCallEventEverywhere(chat,
              { kind: 'call_declined', text: `Вы отклонили вызов от @${(caller || {}).username || chat.userId}` },
              { kind: 'call_declined', text: `@${currentUser.username} отклонил ваш вызов` }
            );
          }
          saveState();
          renderMessages(chat);
          toast('Вызов отклонён');
        }
        closeIncoming();
      }
      return;
    }
    const chLink = e.target.closest('.ch-link');
    if (chLink) { openChannelByLink(chLink.dataset.ch); return; }
    const pollOpt = e.target.closest('.poll-opt');
    if (pollOpt) {
      const m = chat.messages.find(x => x.id === pollOpt.dataset.mid);
      if (m && m.poll && !m.poll.closed) toggleVote(m, +pollOpt.dataset.opt);
      return;
    }
    const cc = e.target.closest('.contact-card');
    if (cc) { openUserCard(cc.dataset.cc); return; }
    const photo = e.target.closest('.msg-photo');
    if (photo) {
      const msg = chat.messages.find(m => m.id === photo.dataset.mid);
      const md = msg && msg.media ? msg.media[Number(photo.dataset.mi)] : null;
      if (md) openPhotoViewer(md);
      return;
    }
    const vplay = e.target.closest('[data-vplay]');
    if (vplay) {
      const box = vplay.closest('.msg-voice');
      const au = box && box.querySelector('audio');
      if (au) {
        const bar = box.querySelector('.voice-bar i');
        if (au.paused) {
          document.querySelectorAll('.msg-voice audio').forEach(a => { if (a !== au) { a.pause(); a.currentTime = 0; a.closest('.msg-voice').querySelector('.voice-play').textContent = '▶'; a.closest('.msg-voice').querySelector('.voice-bar i').style.width = '0%'; } });
          vplay.textContent = '⏸';
          au.play().catch(() => { vplay.textContent = '▶'; });
          au.ontimeupdate = () => { if (bar) bar.style.width = Math.min(100, (au.currentTime / (au.duration || 1)) * 100) + '%'; };
          au.onended = () => { vplay.textContent = '▶'; if (bar) bar.style.width = '0%'; };
        } else {
          au.pause();
          vplay.textContent = '▶';
        }
      }
      return;
    }
    const kruzhok = e.target.closest('.msg-kruzhok');
    if (kruzhok) {
      if (kruzhok.paused) {
        kruzhok.muted = false;
        const tryPlay = () => { kruzhok.play().catch(() => {}); };
        if (kruzhok.readyState === 0) {
          kruzhok.load();
          kruzhok.addEventListener('loadeddata', tryPlay, { once: true });
          setTimeout(tryPlay, 1500);
        } else tryPlay();
      } else kruzhok.pause();
      return;
    }
    const bgApply = e.target.closest('[data-bg-apply]');
    if (bgApply) {
      const m = chat.messages.find(x => x.id === bgApply.dataset.bgApply);
      if (m && m.bg && m.bg.dataUrl) {
        chat.wall = { type: m.bg.type, value: m.bg.dataUrl };
        persistCurrentUser();
        applyChatWall(chat);
        renderChatList();
        toast('Фон применён');
      }
      return;
    }
    const bgDismiss = e.target.closest('[data-bg-dismiss]');
    if (bgDismiss) {
      const card = bgDismiss.closest('.msg-bg-card');
      if (card) card.style.display = 'none';
      return;
    }
    const msgEl = e.target.closest('.msg');
    if (!msgEl) { $$('.msg .react-picker.open').forEach(p => p.classList.remove('open')); return; }
    const msg = chat.messages.find(m => m.id === msgEl.dataset.mid);
    if (!msg) return;
    const pick = e.target.closest('button[data-emoji]');
    const chip = e.target.closest('button[data-react]');
    const act = e.target.closest('button[data-act]');
    if (pick) {
      toggleReaction(chat.id, msg.id, pick.dataset.emoji);
      renderMessages(chat);
      return;
    }
    if (chip) {
      toggleReaction(chat.id, msg.id, chip.dataset.react);
      renderMessages(chat);
      return;
    }
    if (!act || !e.target.closest('.msg-actions')) return;
    switch (act.dataset.act) {
      case 'react':
        msgEl.querySelector('.react-picker').classList.toggle('open');
        break;
      case 'reply':
        replyTarget.chatId = chat.id; replyTarget.msgId = msg.id;
        refreshComposerBars(chat);
        const t1 = $('#msgText');
        if (t1) t1.focus();
        break;
      case 'forward':
        forwardTarget.chatId = chat.id; forwardTarget.msgId = msg.id;
        renderForwardModal();
        break;
      case 'copy':
        (navigator.clipboard ? navigator.clipboard.writeText(msg.text) : Promise.reject())
          .then(() => toast('Скопировано'))
          .catch(() => toast('Не удалось скопировать'));
        break;
      case 'edit':
        editTarget.chatId = chat.id; editTarget.msgId = msg.id;
        refreshComposerBars(chat);
        const t2 = $('#msgText');
        if (t2) { t2.value = msg.text; t2.focus(); t2.dispatchEvent(new Event('input')); }
        break;
      case 'del':
        if (!confirm('Удалить сообщение?')) return;
        chat.messages = chat.messages.filter(m => m.id !== msg.id);
        cloudSave(cloudMdelKey(chat.id, msg.id), JSON.stringify({ ts: Date.now() }));
        cloudDelete(cloudMsgKey(chat.id, msg.id));
        if (chat.id === NEWS_CHAT_ID) syncNewsDeleteEverywhere(msg.id);
        addLog(currentUser.username, `Удалил сообщение в «${chatTitle(chat)}»`);
        saveState();
        renderMessages(chat);
        renderChatList();
        toast('Сообщение удалено');
        break;
    }
  });
}

function toggleReaction(chatId, msgId, emoji) {
  const chat = state.chats.find(c => c.id === chatId);
  const msg = chat && chat.messages.find(m => m.id === msgId);
  if (!msg) return;
  msg.reactions = msg.reactions || {};
  const arr = msg.reactions[emoji] || (msg.reactions[emoji] = []);
  const i = arr.indexOf('me');
  if (i >= 0) arr.splice(i, 1); else arr.push('me');
  if (!arr.length) delete msg.reactions[emoji];
  addLog(currentUser.username, `${i >= 0 ? 'Убрал' : 'Поставил'} реакцию ${emoji} в «${chatTitle(chat)}»`);
  saveState();
  pushMsgToCloud(chat, msg);
}

function renderForwardModal() {
  const src = state.chats.find(c => c.id === forwardTarget.chatId);
  const msg = src && src.messages.find(m => m.id === forwardTarget.msgId);
  if (!msg) return;
  const targets = state.chats.filter(c => c.id !== forwardTarget.chatId);
  $('#forwardBody').innerHTML = targets.length ? targets.map(c => `
    <div class="fwd-item" data-id="${c.id}">
      ${avatarHtml(accFromChat(c))}
      <div><div class="switch-name">${escapeHtml(chatTitle(c))}</div><div class="mi-status">${c.type === 'private' ? 'Личное' : c.type === 'group' ? 'Группа' : 'Канал'} · ${c.messages.length} сообщ.</div></div>
    </div>`).join('') : '<div class="empty-list">Нет других чатов для пересылки.<br>Создайте новый чат и попробуйте снова</div>';
  $('#forwardBody').querySelectorAll('.fwd-item').forEach(item => {
    item.addEventListener('click', () => forwardMessage(item.dataset.id, msg.id, forwardTarget.chatId));
  });
  $('#forwardModal').classList.add('open');
}
function closeForwardModal() { $('#forwardModal').classList.remove('open'); }
function bindForwardModal() {
  $('#forwardClose').addEventListener('click', closeForwardModal);
  $('#forwardModal').addEventListener('click', (e) => { if (e.target === $('#forwardModal')) closeForwardModal(); });
}

/* ============================================================
   КАРТОЧКА ПОЛЬЗОВАТЕЛЯ (как в Discord)
   ============================================================ */
function openUserCard(username) {
  const acc = username === currentUser.username ? currentUser
    : username === 'nebula' ? NEBULA_ACC
    : accountByUsername(username);
  if (!acc) return;
  renderUserCard(acc);
  $('#userCardModal').classList.add('open');
}
function closeUserCard() { $('#userCardModal').classList.remove('open'); }
function renderUserCard(acc) {
  const isMe = acc.username === currentUser.username;
  const frame = selectedFrameClass(acc);
  const stat = acc.stats || {};
  const online = isOnline(acc.username);
  const dolphinMax = dolphinsMaxLevelFor(acc.username);
  const st = getStateFor(acc.username);
  const msgs = st ? st.chats.reduce((n, c) => n + c.messages.filter(m => m.from === 'me').length, 0) : 0;
  const created = acc.created ? new Date(acc.created).toLocaleDateString('ru-RU') : '—';
  const fr = FRAMES.find(f => f.id === frame);
  const frameName = frame ? (fr ? fr.name : frame) : '—';
  const frameEmoji = frame ? (fr ? fr.emoji : '') : '';
  const hasPost = acc.statusPost && (Date.now() - acc.statusPost.time) < 86400000;
  $('#userCardBody').innerHTML = `
    <div class="ucard">
      <div class="ucard-banner" style="background:linear-gradient(135deg, ${(acc.color||['#6C5CE7','#8E7BFF'])[0]}, ${(acc.color||['#6C5CE7','#8E7BFF'])[1]})"></div>
      <div class="ucard-avatar-wrap">
        ${hasPost ? `<span class="st-ring" data-post="${escapeHtml(acc.username)}" title="Статус">` : ''}${avatarHtml(acc, 'xl', frame)}${hasPost ? '</span>' : ''}
        ${online ? '<span class="uc-online"></span>' : ''}
      </div>
      <div class="ucard-name">${displayName(acc)}</div>
      <div class="ucard-username"><span class="copy-id" data-copy="${escapeHtml(acc.id)}" title="Нажмите, чтобы скопировать ID">ID ${escapeHtml(acc.id)} 📋</span> · @${escapeHtml(acc.username)}</div>
      ${acc.bio ? `<div class="ucard-bio">${escapeHtml(acc.bio)}</div>` : ''}
      <div class="ucard-status st-${statusOf(acc).cls}">${statusOf(acc).online ? '● ' : ''}${statusOf(acc).label}${statusOf(acc).text ? ' · ' + escapeHtml(statusOf(acc).text) : ''}</div>
      ${hasPost ? `<button class="btn btn-ghost" id="ucStatusBtn" style="width:100%;margin-top:8px">🌈 Посмотреть статус</button>` : ''}
      <div class="ucard-about">
        <div class="ucard-row"><span>Аккаунт создан</span><b>${created}</b></div>
        <div class="ucard-row"><span>Время в мессенджере</span><b>${fmtDuration(stat.seconds || 0)}</b></div>
        <div class="ucard-row"><span>Сообщений отправлено</span><b>${msgs}</b></div>
        <div class="ucard-row"><span>Макс. уровень дельфина</span><b>🐬 ${dolphinMax}</b></div>
        <div class="ucard-row"><span>Рамка аватара</span><b>${frameEmoji} ${frameName}</b></div>
      </div>
      <div class="ucard-tracks" id="ucTracks">
        <div class="ucard-tracks-head">🎵 Треки</div>
        <div class="ucard-tracks-sub">загрузка...</div>
      </div>
      <div class="ucard-actions">
        ${isMe ? '' : `<button class="btn btn-primary" id="ucWrite"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;margin-right:6px"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 14H6.83L4 18.83V4h14v12z"/></svg>Написать</button>`}
        ${isMe ? '' : `<button class="btn btn-ghost" id="ucCall">📞 Позвонить</button>`}
        ${isMe ? '' : `<button class="btn btn-ghost" id="ucVideoCall">🎥 Видеозвонок</button>`}
        <button class="btn btn-ghost" id="ucClose">Закрыть</button>
      </div>
    </div>`;
  const w = $('#ucWrite');
  if (w) w.addEventListener('click', () => { closeUserCard(); startPrivateChat(acc.username); });
  const usBtn = $('#ucStatusBtn');
  if (usBtn) usBtn.addEventListener('click', () => openStatusView(acc.username));
  const c = $('#ucCall');
  if (c) c.addEventListener('click', () => {
    let chat = state.chats.find(x => x.type === 'private' && x.userId === acc.username);
    closeUserCard();
    if (chat) startCall(chat.id);
    else { startPrivateChat(acc.username); chat = state.chats.find(x => x.type === 'private' && x.userId === acc.username); if (chat) startCall(chat.id); }
  });
  const vc = $('#ucVideoCall');
  if (vc) vc.addEventListener('click', () => {
    let chat = state.chats.find(x => x.type === 'private' && x.userId === acc.username);
    closeUserCard();
    if (chat) startCall(chat.id, true);
    else { startPrivateChat(acc.username); chat = state.chats.find(x => x.type === 'private' && x.userId === acc.username); if (chat) startCall(chat.id, true); }
  });
  const cc = $('#ucClose');
  if (cc) cc.addEventListener('click', closeUserCard);
  const fillTracks = (list) => {
    const box = $('#ucTracks');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="ucard-tracks-head">🎵 Треки</div><div class="ucard-tracks-sub">Нет треков</div>`;
      return;
    }
    let idx = 0;
    const render = () => {
      const t = list[idx];
      box.innerHTML = `
        <div class="ucard-tracks-head">🎵 Треки (${list.length})</div>
        <div class="uc-player">
          <button type="button" class="uc-pnav" data-ucnav="-1" title="Предыдущий трек">⏮</button>
          <div class="uc-pcenter">
            <div class="uc-pname">${idx + 1}. ${escapeHtml(t.name)}</div>
            <audio class="uc-paudio" controls preload="none" src="${t.data}"></audio>
          </div>
          <button type="button" class="uc-pnav" data-ucnav="1" title="Следующий трек">⏭</button>
        </div>
        <div class="uc-tlist">${list.map((x, i) => `<button type="button" class="uc-titem ${i === idx ? 'on' : ''}" data-uci="${i}">${i + 1}. ${escapeHtml(x.name)}</button>`).join('')}</div>`;
      const audio = box.querySelector('.uc-paudio');
      if (audio) audio.addEventListener('ended', () => { idx = (idx + 1) % list.length; render(); const a = box.querySelector('.uc-paudio'); if (a) a.play().catch(() => {}); });
      box.querySelectorAll('.uc-pnav').forEach(b => b.addEventListener('click', () => {
        idx = (idx + Number(b.dataset.ucnav) + list.length) % list.length;
        render();
        const a = box.querySelector('.uc-paudio');
        if (a) a.play().catch(() => {});
      }));
      box.querySelectorAll('.uc-titem').forEach(b => b.addEventListener('click', () => {
        idx = Number(b.dataset.uci);
        render();
        const a = box.querySelector('.uc-paudio');
        if (a) a.play().catch(() => {});
      }));
    };
    render();
  };
  if (isMe) fillTracks(loadTracks(acc.username));
  else if (MAIL_RELAY_URL) cloudLoad('tracks:' + acc.username)
    .then(r => { try { const t = r && JSON.parse(r.d); fillTracks(Array.isArray(t) ? t : []); } catch (e) { fillTracks([]); } })
    .catch(() => fillTracks([]));
  else fillTracks([]);
}
function bindUserCardModal() {
  $('#userCardClose').addEventListener('click', closeUserCard);
  $('#userCardModal').addEventListener('click', (e) => { if (e.target === $('#userCardModal')) closeUserCard(); });
}

function forwardMessage(targetChatId, msgId, srcChatId) {
  const dst = state.chats.find(c => c.id === targetChatId);
  const src = state.chats.find(c => c.id === srcChatId);
  const msg = src && src.messages.find(m => m.id === msgId);
  if (!dst || !msg) return;
  const name = msg.from === 'me' ? currentUser.name : (userById(msg.from) || { name: 'Пользователь' }).name;
  const fwdMsg = { id: 'm' + Date.now(), from: dst.id === NEWS_CHAT_ID ? 'news' : 'me', text: msg.text, time: new Date().toISOString(), read: false, sent: true, forwarded: true, forwardedFrom: name };
  dst.messages.push(fwdMsg);
  pushMsgToCloud(dst, fwdMsg);
  if (dst.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(fwdMsg);
  addLog(currentUser.username, `Переслал сообщение в «${chatTitle(dst)}» из «${chatTitle(src)}»`);
  saveState();
  closeForwardModal();
  toast('Переслано', chatTitle(dst));
  if (state.currentChatId === targetChatId) renderMessages(dst);
  else renderChatList();
}
function persistOther(other) {
  const d = loadAccounts();
  if (d.users[other.username]) { d.users[other.username] = other; saveAccounts(d); }
}

function adminRenameUser(oldU, newU) {
  const d = loadAccounts();
  const u = d.users[oldU];
  if (!u || d.users[newU]) return false;
  u.username = newU;
  delete d.users[oldU];
  d.users[newU] = u;
  saveAccounts(d);
  const oldKey = stateKey(oldU), newKey = stateKey(newU);
  const raw = localStorage.getItem(oldKey);
  if (raw !== null) { safeSet(newKey, raw); localStorage.removeItem(oldKey); }
  Object.values(d.users).forEach(other => {
    ['contacts', 'blocked', 'ignored', 'receivedFrom'].forEach(k => {
      if (Array.isArray(other[k])) other[k] = other[k].map(x => x === oldU ? newU : x);
    });
    if (other.username === newU && Array.isArray(other.contacts)) other.contacts = other.contacts.filter(x => x !== oldU);
    const sRaw = localStorage.getItem(stateKey(other.username));
    if (sRaw) {
      try {
        const s = JSON.parse(sRaw);
        (s.chats || []).forEach(c => {
          if (c.owner === oldU) c.owner = newU;
          if (c.userId === oldU) c.userId = newU;
          if (Array.isArray(c.members)) c.members = c.members.map(m => m === oldU ? newU : m);
          if (Array.isArray(c.admins)) c.admins = c.admins.map(a => a === oldU ? newU : a);
        });
        safeSet(stateKey(other.username), JSON.stringify(s));
      } catch (e) {}
    }
  });
  const a = adminList();
  if (a.includes(oldU)) { const na = a.filter(x => x !== oldU); na.push(newU); saveAdminList(na); }
  if (currentUser && currentUser.username === oldU) {
    currentUser = u;
    safeSet(SESSION_KEY, JSON.stringify(newU));
    state = loadState() || state;
    ensureGlobalChats();
    saveState();
    updateProfileHeader();
  }
  return true;
}

function appendMessage(chatId, msg) {
  const chat = state.chats.find(c => c.id === chatId);
  const full = { id: 'm' + Date.now(), ...msg, time: new Date().toISOString(), read: false };
  chat.messages.push(full);
  pushMsgToCloud(chat, full);
  if (chat.id !== state.currentChatId) chat.unread = (chat.unread || 0) + 1;
  saveState();
  if (chat.id === state.currentChatId) {
    renderMessages(chat);
    if (isChatNearBottom()) scrollChatToBottom();
    bindChatEvents(chat);
  } else {
    renderChatList();
    toast('Новое сообщение', chatTitle(chat), 2200);
  }
}

function selectChat(id) {
  state.currentChatId = id;
  const chat = state.chats.find(c => c.id === id);
  if (chat) { chat.unread = 0; chat.missedCalls = 0; }
  replyTarget.chatId = null; replyTarget.msgId = null;
  editTarget.chatId = null; editTarget.msgId = null;
  saveState();
  renderChat();
  renderChatList();
  mobileShowChat();
  maybeShowIncoming(chat);
}

function isMobileView() { return window.innerWidth <= 820; }
function mobileShowChat() {
  if (!isMobileView()) return;
  const area = $('#chatArea'), side = $('#sidebar');
  if (!area || !side) return;
  area.classList.add('mobile-open');
  side.classList.add('mobile-hidden');
}
function mobileShowList() {
  const area = $('#chatArea'), side = $('#sidebar');
  if (!area || !side) return;
  area.classList.remove('mobile-open');
  side.classList.remove('mobile-hidden');
}
window.addEventListener('resize', () => {
  if (!isMobileView()) {
    const side = $('#sidebar');
    if (side) side.classList.remove('mobile-hidden');
  }
});

/* ---------- EMOJI ---------- */
function toggleEmojiPicker(btn, textarea) {
  const picker = $('#emojiPicker');
  if (!picker.classList.contains('hidden')) { picker.classList.add('hidden'); return; }
  picker.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  picker.style.right = (innerWidth - r.right) + 'px';
  picker.innerHTML = EMOJIS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')
    + `<div class="emoji-sep">Флаги</div>`
    + FLAG_EMOJIS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('');
  picker.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    textarea.value += b.dataset.e;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
    picker.classList.add('hidden');
  }));
}
document.addEventListener('click', (e) => {
  const picker = $('#emojiPicker');
  if (!picker.classList.contains('hidden') && !e.target.closest('#emojiBtn') && !e.target.closest('#emojiPicker')) picker.classList.add('hidden');
  const sp = $('#stickPanel');
  if (sp && !sp.classList.contains('hidden') && !e.target.closest('#stickBtn') && !e.target.closest('#stickPanel') && !e.target.closest('#stickersModal')) sp.classList.add('hidden');
});

function copyTextPlain(t, label) {
  const done = () => toast('Скопировано в буфер', label || t);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done).catch(() => fallbackCopyPlain(t, done));
  } else fallbackCopyPlain(t, done);
}
function fallbackCopyPlain(t, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch (e) { toast('Не удалось скопировать'); }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-copy]');
  if (el) copyTextPlain(el.dataset.copy, 'ID скопирован в буфер');
});

/* ---------- СТИКЕРЫ ---------- */
function myStickerPacks() { return (currentUser && currentUser.stickerPacks) || []; }
function myFavStickers() { return (currentUser && currentUser.favStickers) || []; }
function friendStickerPacks() {
  const mine = new Set(myStickerPacks().map(p => p.id));
  const res = [];
  accountsList().forEach(u => {
    if (u.username === currentUser.username) return;
    (u.stickerPacks || []).forEach(p => { if (!mine.has(p.id)) res.push({ pack: p, owner: u }); });
  });
  return res;
}
function stickerPackPrompt(owner, pack) {
  const subd = (currentUser.subscribedPacks || []).includes(pack.id);
  const ov = document.createElement('div');
  ov.className = 'status-editor-overlay';
  ov.id = 'stickerPackPrompt';
  ov.innerHTML = `
    <div class="modal-box stickers-modal">
      <h3>${subd ? 'Этот пак уже в избранном' : 'Добавить пак в избранное?'}</h3>
       <div class="spp-grid">${pack.stickers.slice(0, 8).map(s => stickerMediaHtml(s, 'spp-img', '')).join('')}</div>
      <div class="spp-name">${escapeHtml(pack.name)}</div>
      <div class="spp-sub">от @${escapeHtml(owner.username)} · ${pack.stickers.length} стик.</div>
      <div class="btn-row">
        <button class="btn btn-primary" id="sppYes">${subd ? 'Отписаться' : 'Да, добавить'}</button>
        <button class="btn" id="sppNo">Отмена</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#sppNo').addEventListener('click', close);
  ov.querySelector('#sppYes').addEventListener('click', () => {
    currentUser.subscribedPacks = currentUser.subscribedPacks || [];
    if (subd) {
      currentUser.subscribedPacks = currentUser.subscribedPacks.filter(x => x !== pack.id);
      toast('Пак убран из избранного');
    } else {
      currentUser.subscribedPacks.push(pack.id);
      toast('Пак добавлен в избранное ✓');
    }
    persistCurrentUser();
    renderStickPanel('fav');
    renderStickPanel('friends');
    close();
  });
}
function toggleStickPanel(btn) {
  const sp = $('#stickPanel');
  if (!sp.classList.contains('hidden')) { sp.classList.add('hidden'); return; }
  $('#emojiPicker').classList.add('hidden');
  sp.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  sp.style.right = (innerWidth - r.right) + 'px';
  if (!sp.dataset.bound) {
    sp.dataset.bound = '1';
    bindStickPanelDelegation(sp);
    sp.querySelectorAll('.stick-tab').forEach(t => t.addEventListener('click', () => {
      stickExpandedPacks = {};
      stickFavExpanded = false;
      const tab = t.dataset.stab;
      const b = $('#stickBody');
      if (b) b.innerHTML = '<div class="empty-list">Загрузка…</div>';
      const run = () => { try { renderStickPanel(tab); } catch (e) { console.error(e); } };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
    }));
  }
  const body = $('#stickBody');
  const tab = sp.dataset.lastTab || 'fav';
  sp.dataset.lastTab = tab;
  if (body && body.innerHTML.trim()) return;
  if (body) body.innerHTML = '<div class="empty-list">Загрузка…</div>';
  const run = () => { try { renderStickPanel(tab); } catch (e) { console.error(e); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
}
let stickExpandedPacks = {};
let stickFavExpanded = false;
let stickFlushTimer = null;
function flushStickPieces(body, pieces) {
  if (stickFlushTimer) { clearTimeout(stickFlushTimer); stickFlushTimer = null; }
  body.innerHTML = '';
  let i = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const step = () => {
    const t0 = now();
    while (i < pieces.length && now() - t0 < 6) {
      body.insertAdjacentHTML('beforeend', pieces[i++]);
    }
    if (i < pieces.length) stickFlushTimer = setTimeout(step, 0);
  };
  step();
}
function addFavSticker(url, type) {
  currentUser.favStickers = currentUser.favStickers || [];
  if (!currentUser.favStickers.some(s => s.dataUrl === url)) {
    currentUser.favStickers.push(type ? { dataUrl: url, type } : { dataUrl: url });
    persistCurrentUser();
    toast('Добавлено в избранное ⭐');
  } else toast('Уже в избранном');
}
function toggleSubscribe(id) {
  const sp = $('#stickPanel');
  currentUser.subscribedPacks = currentUser.subscribedPacks || [];
  if (currentUser.subscribedPacks.includes(id)) {
    currentUser.subscribedPacks = currentUser.subscribedPacks.filter(x => x !== id);
    toast('Пак убран');
  } else {
    currentUser.subscribedPacks.push(id);
    toast('Пак добавлен ✓');
  }
  persistCurrentUser();
  renderStickPanel(sp && sp.dataset.lastTab ? sp.dataset.lastTab : 'fav');
}
function expandStickPack(id) { stickExpandedPacks[id] = true; const sp = $('#stickPanel'); renderStickPanel(sp && sp.dataset.lastTab ? sp.dataset.lastTab : 'fav'); }
function expandFavStickers() { stickFavExpanded = true; renderStickPanel('fav'); }
function bindStickPanelDelegation(sp) {
  sp.addEventListener('click', (e) => {
    const t = e.target;
    const sendEl = t.closest('[data-send]');
    if (sendEl) {
      const chat = currentChat();
      if (!chat) return;
      $('#stickPanel').classList.add('hidden');
      sendSticker(chat, { dataUrl: sendEl.dataset.send, type: sendEl.dataset.type });
      return;
    }
    const favEl = t.closest('[data-sf]');
    if (favEl) { e.stopPropagation(); addFavSticker(favEl.dataset.sf, favEl.dataset.type); return; }
    const fdEl = t.closest('[data-favdel]');
    if (fdEl) {
      e.stopPropagation();
      const url = fdEl.dataset.favdel;
      currentUser.favStickers = (currentUser.favStickers || []).filter(s => s.dataUrl !== url);
      persistCurrentUser();
      renderStickPanel('fav');
      return;
    }
    const subEl = t.closest('[data-sub]');
    if (subEl) { e.stopPropagation(); toggleSubscribe(subEl.dataset.sub); return; }
    const delEl = t.closest('[data-pack]');
    if (delEl && t.classList.contains('stick-pack-del')) {
      currentUser.stickerPacks = (currentUser.stickerPacks || []).filter(p => p.id !== delEl.dataset.pack);
      persistCurrentUser();
      renderStickPanel('mine');
      toast('Пак удалён');
      return;
    }
    const moreEl = t.closest('.stick-more');
    if (moreEl) { expandStickPack(moreEl.dataset.pack); return; }
    const moreFav = t.closest('.stick-more-fav');
    if (moreFav) { expandFavStickers(); return; }
    const subrow = t.closest('[data-subrow]');
    if (subrow) {
      if (t.closest('.stick-sub') || t.closest('.stick-fav') || t.closest('[data-send]')) return;
      const packs = friendStickerPacks();
      const found = packs.find(x => x.pack.id === subrow.dataset.subrow);
      if (found) stickerPackPrompt(found.owner, found.pack);
      return;
    }
    if (t.closest('.stick-create')) { openStickersManager(); return; }
  });
}
function renderStickPanel(tab) {
  const sp = $('#stickPanel');
  sp.dataset.lastTab = tab;
  const body = $('#stickBody');
  if (!body) return;
  sp.querySelectorAll('.stick-tab').forEach(t => t.classList.toggle('sel', t.dataset.stab === tab));
  const pieces = [];
  if (tab === 'fav') {
    const fav = myFavStickers();
    const friends = friendStickerPacks();
    const alive = new Set(friends.map(x => x.pack.id));
    const subList = (currentUser.subscribedPacks || []).slice();
    const dead = subList.filter(id => !alive.has(id));
    if (dead.length) {
      currentUser.subscribedPacks = subList.filter(id => alive.has(id));
      persistCurrentUser();
    }
    const subs = friends.filter(({ pack }) => alive.has(pack.id) && (currentUser.subscribedPacks || []).includes(pack.id));
    subs.forEach(({ pack, owner }) => {
      pieces.push(`<div class="stick-pack-row"><b>${escapeHtml(pack.name)}</b><span class="stick-pack-count">от @${escapeHtml(owner.username)} · ${pack.stickers.length} стик.</span><button class="stick-sub" data-sub="${escapeHtml(pack.id)}">Отписаться</button></div>`);
      const cap = stickExpandedPacks[pack.id] ? pack.stickers.length : STICK_CAP;
      const shown = pack.stickers.slice(0, cap);
      let g = `<div class="stick-grid">` + shown.map(s => stickCellHtml(s, { fav: true })).join('');
      if (pack.stickers.length > cap) g += `<button class="stick-more" data-pack="${escapeHtml(pack.id)}">Ещё ${pack.stickers.length - cap}…</button>`;
      g += `</div>`;
      pieces.push(g);
    });
    if (fav.length) {
      pieces.push('<div class="stick-sep">⭐ Избранные стикеры</div>');
      const fcap = stickFavExpanded ? fav.length : STICK_CAP * 2;
      const shown = fav.slice(0, fcap);
      let g = '<div class="stick-grid">' + shown.map(s => stickCellHtml(s, { del: true })).join('');
      if (fav.length > fcap) g += `<button class="stick-more-fav">Ещё ${fav.length - fcap}…</button>`;
      g += '</div>';
      pieces.push(g);
    }
    if (!subs.length && !fav.length) pieces.push('<div class="empty-list">Избранного пока нет.<br>Откройте «Паки друзей» и добавьте пак — стикеры появятся здесь.</div>');
  } else if (tab === 'mine') {
    const packs = myStickerPacks();
    if (packs.length) {
      packs.forEach(p => {
        pieces.push(`<div class="stick-pack-row"><b>${escapeHtml(p.name)}</b><span class="stick-pack-count">${p.stickers.length} стик.</span><button class="stick-pack-del" data-pack="${escapeHtml(p.id)}" title="Удалить пак">🗑</button></div>`);
        const cap = stickExpandedPacks[p.id] ? p.stickers.length : STICK_CAP;
        const shown = p.stickers.slice(0, cap);
        let g = `<div class="stick-grid">` + shown.map(s => stickCellHtml(s, { fav: true })).join('');
        if (p.stickers.length > cap) g += `<button class="stick-more" data-pack="${escapeHtml(p.id)}">Ещё ${p.stickers.length - cap}…</button>`;
        g += `</div>`;
        pieces.push(g);
      });
      pieces.push('<button type="button" class="btn btn-primary stick-create">＋ Создать пак из фото</button>');
    } else {
      pieces.push('<div class="empty-list">У вас пока нет стикер-паков.</div><button type="button" class="btn btn-primary stick-create">＋ Создать пак из фото</button>');
    }
  } else if (tab === 'friends') {
    const packs = friendStickerPacks();
    if (packs.length) {
      packs.forEach(({ pack, owner }) => {
        const subd = (currentUser.subscribedPacks || []).includes(pack.id);
        pieces.push(`<div class="stick-pack-row clickable" data-subrow="${escapeHtml(pack.id)}" title="Добавить пак в избранное"><b>${escapeHtml(pack.name)}</b><span class="stick-pack-count">от @${escapeHtml(owner.username)} · ${pack.stickers.length} стик.</span><button class="stick-sub" data-sub="${escapeHtml(pack.id)}">${subd ? '✓ Подписан' : '+ Добавить пак'}</button></div>`);
        const cap = stickExpandedPacks[pack.id] ? pack.stickers.length : 4;
        const shown = pack.stickers.slice(0, cap);
        let g = `<div class="stick-grid">` + shown.map(s => stickCellHtml(s, { fav: true })).join('');
        if (pack.stickers.length > cap) g += `<button class="stick-more" data-pack="${escapeHtml(pack.id)}">Ещё ${pack.stickers.length - cap}…</button>`;
        g += `</div>`;
        pieces.push(g);
      });
    } else {
      pieces.push('<div class="empty-list">У друзей пока нет паков.<br>Создайте свой пак — он появится у них здесь.</div>');
    }
  } else if (tab === 'mgr') {
    openStickersManager();
    return;
  }
  if (!pieces.length) pieces.push('<div class="empty-list">Пусто</div>');
  flushStickPieces(body, pieces);
}
function sendSticker(chat, sticker) {
  const msg = { id: 'm' + Date.now(), from: chat.id === NEWS_CHAT_ID ? 'news' : 'me', text: '', time: new Date().toISOString(), read: false, sent: true, sticker: { dataUrl: sticker.dataUrl, type: sticker.type } };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
  if (chat.type === 'group' || chat.type === 'channel') {
    if (chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else syncGroupMessageEverywhere(chat, msg, currentUser.username);
  }
  addLog(currentUser.username, `Отправил стикер в «${chatTitle(chat)}»`);
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}

/* ============================================================
   ГОЛОСОВЫЕ СООБЩЕНИЯ И КРУЖКИ (видеосообщения)
   ============================================================ */
let recState = null;
const VOICE_MAX_SEC = 120;
const VIDEO_MSG_MAX_SEC = 60;

function pickRecordMime(video) {
  try {
    const cands = video
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
    return cands.find(c => MediaRecorder.isTypeSupported(c)) || '';
  } catch (e) { return ''; }
}
function showRecBar(type) {
  const bar = $('#recBar');
  if (!bar) return;
  const lab = $('#recLabel');
  if (lab) lab.textContent = type === 'video' ? 'Кружок · запись…' : 'Голосовое · запись…';
  bar.classList.remove('hidden');
  const pv = $('#recPreview');
  if (pv) { if (type === 'video') pv.classList.remove('hidden'); else { pv.classList.add('hidden'); pv.srcObject = null; } }
  $('#recTimer').textContent = '0:00';
  const vbtn = $('#voiceBtn'), vbtn2 = $('#videoMsgBtn');
  if (vbtn) vbtn.disabled = true;
  if (vbtn2) vbtn2.disabled = true;
}
function hideRecBar() {
  const bar = $('#recBar');
  if (bar) bar.classList.add('hidden');
  const pv = $('#recPreview');
  if (pv) { pv.classList.add('hidden'); pv.srcObject = null; }
  const vbtn = $('#voiceBtn'), vbtn2 = $('#videoMsgBtn');
  if (vbtn) vbtn.disabled = false;
  if (vbtn2) vbtn2.disabled = false;
}
function updateRecTimer() {
  const t = recState ? Math.floor((Date.now() - recState.t0) / 1000) : 0;
  const el = $('#recTimer');
  if (el) el.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
function startRecording(type) {
  if (recState) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Запись не поддерживается этим браузером');
  if (typeof MediaRecorder === 'undefined') return toast('Запись не поддерживается этим браузером (нужен свежий Chrome/Safari)');
  const video = type === 'video';
  const chat = currentChat();
  if (!chat) return;
const begin = (stream) => {
      if (video && !stream.getVideoTracks().length) { stream.getTracks().forEach(t => t.stop()); return toast('Камера не найдена'); }
      const mime = pickRecordMime(video);
      let rec;
      try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('Не удалось начать запись'); }
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(recState && recState.timer);
        stream.getTracks().forEach(t => t.stop());
        if (!chunks.length) { recState = null; hideRecBar(); return toast('Запись не удалась, попробуйте ещё раз'); }
        const blob = new Blob(chunks, { type: rec.mimeType || (video ? 'video/webm' : 'audio/webm') });
      const dur = Math.max(1, Math.round((Date.now() - recState.t0) / 1000));
      const rd = new FileReader();
      rd.onload = () => {
        const c = currentChat();
        if (c) sendMediaMessage(c, video ? { video: { dataUrl: rd.result, dur } } : { voice: { dataUrl: rd.result, dur } });
      };
      rd.readAsDataURL(blob);
      recState = null;
      hideRecBar();
    };
    rec.start(250);
    recState = { type, stream, rec, t0: Date.now(), timer: setInterval(updateRecTimer, 500) };
    showRecBar(type);
    if (video) {
      const pv = $('#recPreview');
      if (pv) { try { pv.srcObject = stream; } catch (e) {} }
    }
    if (video) setTimeout(() => { if (recState && recState.rec.state === 'recording') stopRecording(); }, VIDEO_MSG_MAX_SEC * 1000);
    else setTimeout(() => { if (recState && recState.rec.state === 'recording') stopRecording(); }, VOICE_MAX_SEC * 1000);
    toast(video ? 'Запись кружка…' : 'Запись голосового…');
  };
  navigator.mediaDevices.getUserMedia(video
    ? { audio: true, video: { facingMode: 'user' } }
    : { audio: true })
    .then(begin)
    .catch(() => {
      if (video) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          .then(begin)
          .catch(() => toast('Нет доступа к камере/микрофону'));
      } else {
        toast('Нет доступа к микрофону');
      }
    });
}
function stopRecording() {
  if (!recState) return;
  try { if (recState.rec.state === 'recording') recState.rec.stop(); } catch (e) {}
}
function cancelRecording() {
  if (!recState) return;
  clearInterval(recState.timer);
  recState.rec.onstop = null;
  try { if (recState.rec.state === 'recording') recState.rec.stop(); } catch (e) {}
  recState.stream.getTracks().forEach(t => t.stop());
  recState = null;
  hideRecBar();
}
function sendMediaMessage(chat, media) {
  const msg = { id: 'm' + Date.now(), from: chat.id === NEWS_CHAT_ID ? 'news' : 'me', text: '', time: new Date().toISOString(), read: false, sent: true, ...media };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
  if (chat.type === 'group' || chat.type === 'channel') {
    if (chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else syncGroupMessageEverywhere(chat, msg, currentUser.username);
  }
  addLog(currentUser.username, `Отправил ${media.voice ? 'голосовое' : 'видеосообщение'} в «${chatTitle(chat)}»`);
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}
function fmtRecDur(sec) {
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function compressStickerFile(f, cb) {
  const isVideo = f.type && f.type.indexOf('video/') === 0;
  const isAnimated = f.type === 'image/gif' || f.type === 'image/webp';
  const reader = new FileReader();
  reader.onload = () => {
    if (isVideo) {
      if (f.size > 8 * 1024 * 1024) toast('Видео-стикер больше 8 МБ — может грузиться долго');
      cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), type: f.type || 'video/mp4', dataUrl: reader.result, name: f.name });
      return;
    }
    if (isAnimated) {
      if (f.size > 4 * 1024 * 1024) toast('Анимированный стикер больше 4 МБ — может грузиться долго');
      cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), type: f.type, dataUrl: reader.result });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const maxSide = 512;
      let { width, height } = img;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const outType = (f.type === 'image/png') ? 'image/png' : 'image/jpeg';
      const q = outType === 'image/png' ? undefined : 0.85;
      cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), type: outType, dataUrl: canvas.toDataURL(outType, q) });
    };
    img.onerror = () => cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), type: f.type || 'image/png', dataUrl: reader.result });
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
}
function openStickersManager() {
  const packs = myStickerPacks();
  const modal = $('#stickersModal');
  modal.classList.add('open');
  modal.innerHTML = `
    <div class="modal-box stickers-modal">
      <h3>🎨 Мои стикер-паки</h3>
      <div class="sm-list">
         ${packs.length ? packs.map(p => `
          <div class="sm-pack">
            <div class="sm-thumbs">${p.stickers.slice(0, 4).map(s => `<div class="sm-thumb">${stickerMediaHtml(s, 'sm-thumb-img', '')}</div>`).join('')}</div>
            <div class="sm-info"><b>${escapeHtml(p.name)}</b><span>${p.stickers.length} стикеров</span></div>
            <div class="sm-actions">
              <button class="btn sm-add-sticker" data-smpack="${escapeHtml(p.id)}">＋ Стикер</button>
              <button class="btn btn-danger sm-del" data-smpack="${escapeHtml(p.id)}">Удалить</button>
            </div>
          </div>`).join('') : '<div class="empty-list">Пока нет паков</div>'}
      </div>
      <button class="btn btn-primary" id="smCreate">＋ Создать пак из фото</button>
      <button class="btn sm-close">Закрыть</button>
    </div>`;
  modal.querySelector('.sm-close').addEventListener('click', () => { modal.classList.remove('open'); renderStickPanel('mine'); });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { modal.classList.remove('open'); renderStickPanel('mine'); }
  });
  modal.querySelectorAll('[data-smpack]').forEach(b => b.addEventListener('click', () => {
    if (!b.classList.contains('sm-del')) return;
    currentUser.stickerPacks = currentUser.stickerPacks.filter(p => p.id !== b.dataset.smpack);
    persistCurrentUser();
    openStickersManager();
    toast('Пак удалён');
  }));
  const create = modal.querySelector('#smCreate');
  const createInput = document.createElement('input');
  createInput.type = 'file';
  createInput.accept = 'image/gif,image/webp,image/png,image/jpeg,video/webm,video/mp4';
  createInput.multiple = true;
  createInput.hidden = true;
  modal.appendChild(createInput);
  create.addEventListener('click', () => createInput.click());
  createInput.addEventListener('change', () => {
    const files = Array.from(createInput.files || []).slice(0, 30);
    createInput.value = '';
    if (!files.length) return;
    const name = prompt('Название пака:');
    if (!name) return;
    let done = 0;
    const stickers = [];
    files.forEach(f => compressStickerFile(f, s => {
      stickers.push(s);
      done++;
      if (done === files.length) {
        currentUser.stickerPacks = currentUser.stickerPacks || [];
        currentUser.stickerPacks.push({ id: 'pk' + Date.now() + Math.random().toString(36).slice(2, 6), name, stickers });
        persistCurrentUser();
        toast('Пак создан', name);
        openStickersManager();
      }
    }));
  });
  const addInput = document.createElement('input');
  addInput.type = 'file';
  addInput.accept = 'image/gif,image/webp,image/png,image/jpeg,video/webm,video/mp4';
  addInput.multiple = true;
  addInput.hidden = true;
  modal.appendChild(addInput);
  let addTarget = null;
  modal.querySelectorAll('.sm-add-sticker').forEach(b => b.addEventListener('click', () => {
    addTarget = b.dataset.smpack;
    addInput.click();
  }));
  addInput.addEventListener('change', () => {
    const files = Array.from(addInput.files || []).slice(0, 30);
    addInput.value = '';
    if (!files.length || !addTarget) return;
    const pack = currentUser.stickerPacks && currentUser.stickerPacks.find(p => p.id === addTarget);
    if (!pack) return;
    let done = 0;
    files.forEach(f => compressStickerFile(f, s => {
      pack.stickers.push(s);
      done++;
      if (done === files.length) {
        persistCurrentUser();
        toast('Стикеры добавлены', pack.name + ' · теперь ' + pack.stickers.length + ' шт.');
        openStickersManager();
      }
    }));
  });
}

/* ---------- Фильтры / поиск ---------- */
function bindFilters() {
  $$('.filter-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.filter = tab.dataset.filter;
    saveState();
    renderChatList();
  }));
  $('#searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderChatList();
  });
}

/* ============================================================
   СОЗДАНИЕ ЧАТА
   ============================================================ */
let createContext = { type: null, selected: [], color: COLOR_PALETTE[0] };
let createAvatarImage = null;
const TYPE_NAMES = { private: 'Личное сообщение', group: 'Новая группа', channel: 'Новый канал' };

function openCreateModal() {
  createContext = { type: null, selected: [], color: COLOR_PALETTE[0], botColor: COLOR_PALETTE[0], access: 'public' };
  createAvatarImage = null;
  $('#modalTitle').textContent = 'Создать';
  $$('#modalSteps .step').forEach(s => s.classList.add('hidden'));
  $('#step-type').classList.remove('hidden');
  $('#modalBack').classList.add('hidden');
  $('#modalNext').classList.add('hidden');
  $('#modalCreate').classList.add('hidden');
  $('#createModal').classList.add('open');
}
function closeCreateModal() { $('#createModal').classList.remove('open'); }

function contactListHtml(items, checkable) {
  if (!items.length) return '<div class="empty-list">Пока нет других пользователей.<br>Зарегистрируйте второй аккаунт, чтобы общаться с ним.</div>';
  return items.map(u => `
    <div class="member-item ${checkable && createContext.selected.includes(u.username) ? 'checked' : ''}" data-id="${u.username}">
      ${avatarHtml(u)}
      <div style="min-width:0;flex:1"><div class="mi-name">${displayName(u)}</div><div class="mi-status">ID ${u.id} · ${statusOf(u).label}</div></div>
      ${checkable ? `<span class="check">${CHECK_ICON}</span>` : ''}
    </div>`).join('');
}

function renderSearchPicker(container, sources, opts) {
  const { checkable, selected, onPick, onToggle, hint } = opts;
  container.innerHTML = `
    <input type="text" class="contact-search" placeholder="🔍 Поиск по ID, @юзернейму или имени" autocomplete="off">
    <div class="contact-hint">${hint || 'Введите ID, @юзернейм или имя контакта'}</div>
    <div class="contact-results"></div>`;
  const inp = container.querySelector('.contact-search');
  const hintEl = container.querySelector('.contact-hint');
  const res = container.querySelector('.contact-results');
  const draw = () => {
    const raw = inp.value.trim();
    const q = raw.toLowerCase().replace(/^@/, '');
    if (!q) {
      const all = sources.slice(0, 15);
      if (!all.length) { res.innerHTML = '<div class="empty-list">Никого не найдено</div>'; hintEl.classList.add('hidden'); return; }
      hintEl.classList.add('hidden');
      res.innerHTML = all.map(u => `
        <div class="member-item ${checkable && selected.includes(u.username) ? 'checked' : ''}" data-id="${u.username}">
          <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
          <div style="min-width:0;flex:1">
            <div class="mi-name">${displayName(u)}</div>
            <div class="mi-status">ID ${u.id} · @${escapeHtml(u.username)}</div>
          </div>
          ${checkable ? `<span class="check">${CHECK_ICON}</span>` : ''}
        </div>`).join('');
      res.querySelectorAll('.member-item').forEach(item => item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (checkable) { onToggle(id); item.classList.toggle('checked'); }
        else onPick(id);
      }));
      return;
    }
    hintEl.classList.add('hidden');
    if (!/^[a-zа-яё0-9_@ ]*$/i.test(raw)) { res.innerHTML = '<div class="empty-list">Только буквы, цифры и _</div>'; return; }
    const list = sources.filter(u => {
      if (String(u.id).toLowerCase().includes(q)) return true;
      if (u.username.toLowerCase().startsWith(q)) return true;
      return u.name.toLowerCase().includes(q);
    }).slice(0, 25);
    if (!list.length) {
      res.innerHTML = '<div class="empty-list">Никого не найдено</div>';
      if (q.length >= 2) {
        cloudSearchAndMerge(q).then(f => {
          if (f && currentUser && !sources.some(x => x && x.username === f.username)) sources.push(f);
          if (f) draw();
        });
      }
      return;
    }
    res.innerHTML = list.map(u => `
      <div class="member-item ${checkable && selected.includes(u.username) ? 'checked' : ''}" data-id="${u.username}">
        <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
        <div style="min-width:0;flex:1">
          <div class="mi-name">${displayName(u)}</div>
          <div class="mi-status">ID ${u.id} · @${escapeHtml(u.username)} · ${statusOf(u).label}</div>
        </div>
        ${checkable ? `<span class="check">${CHECK_ICON}</span>` : ''}
      </div>`).join('');
    res.querySelectorAll('.member-item').forEach(item => item.addEventListener('click', () => {
      const id = item.dataset.id;
      if (checkable) { onToggle(id); item.classList.toggle('checked'); }
      else onPick(id);
    }));
  };
  inp.addEventListener('input', draw);
  draw();
}

function renderPrivatePicker() {
  const others = accountsList().filter(u => u.username !== currentUser.username);
  renderSearchPicker($('#privatePicker'), others, {
    checkable: false,
    selected: [],
    onPick: startPrivateChat,
    hint: 'Выберите контакт или найдите по ID, @юзернейму или имени',
  });
  refreshAccountsFromCloud().then(() => {
    const fresh = accountsList().filter(u => u.username !== currentUser.username);
    if (fresh.length > others.length) {
      renderSearchPicker($('#privatePicker'), fresh, {
        checkable: false,
        selected: [],
        onPick: startPrivateChat,
        hint: 'Выберите контакт или найдите по ID, @юзернейму или имени',
      });
    }
  });
}

function startPrivateChat(userId) {
  const existing = state.chats.find(c => c.type === 'private' && c.userId === userId);
  if (existing) { closeCreateModal(); selectChat(existing.id); return; }
  const chat = {
    id: privateChatId(currentUser.username, userId),
    type: 'private',
    userId,
    dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
    messages: [],
  };
  state.chats.push(chat);
  saveState();
  pushChatMeta(chat);
  addLog(currentUser.username, `Начал диалог с @${userId}`);
  closeCreateModal();
  renderChatList();
  selectChat(chat.id);
  toast('Чат создан', chatTitle(chat));
}

function renderCreateStep() {
  $('#modalTitle').textContent = TYPE_NAMES[createContext.type];
  $('#step-type').classList.add('hidden');
  $('#step-create').classList.remove('hidden');
  $('#createHandle').classList.toggle('hidden', createContext.type !== 'channel');
  $('#createHandle').value = '';
  const wrap = $('#createAccessWrap');
  wrap.classList.toggle('hidden', createContext.type === 'private');
  if (!wrap.classList.contains('hidden')) {
    createContext.access = 'public';
    const accBtns = wrap.querySelectorAll('.acc-btn');
    accBtns.forEach(b => {
      b.classList.toggle('sel', b.dataset.access === 'public');
      b.addEventListener('click', () => {
        createContext.access = b.dataset.access;
        accBtns.forEach(x => x.classList.toggle('sel', x === b));
      });
    });
  }
  const c = createContext.color;
  $('#createAvatarPreview').style.background = `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
  $('#createColorPalette').innerHTML = COLOR_PALETTE.map((p, i) =>
    `<button type="button" class="color-swatch ${createContext.color === p ? 'selected' : ''}" data-i="${i}" style="background:linear-gradient(135deg,${p[0]},${p[1]})"></button>`
  ).join('');
  const picker = $('#memberPicker');
  const beforeCount = accountsList().length;
  const pickerSrc = () => accountsList().filter(u => u.username !== currentUser.username && !u.isBot);
  const renderPicker = () => renderSearchPicker(picker, pickerSrc(), {
    checkable: true,
    selected: createContext.selected,
    onToggle: (id) => {
      const idx = createContext.selected.indexOf(id);
      if (idx >= 0) createContext.selected.splice(idx, 1);
      else createContext.selected.push(id);
    },
    hint: 'Выберите участников или найдите по ID, @юзернейму или имени',
  });
  renderPicker();
  refreshAccountsFromCloud().then(() => {
    if (accountsList().length > beforeCount) renderPicker();
  });
  const name = $('#createName');
  name.value = '';
  $('#createDesc').value = '';
  const isChannel = createContext.type === 'channel';
  const update = () => {
    if (createAvatarImage) return;
    const p = $('#createAvatarPreview');
    const t = name.value.trim() || (isChannel ? 'К' : 'Г');
    p.textContent = t[0].toUpperCase();
    p.style.background = `linear-gradient(135deg, ${createContext.color[0]}, ${createContext.color[1]})`;
  };
  name.addEventListener('input', update);
  const p = $('#createAvatarPreview');
  if (createAvatarImage) {
    p.innerHTML = `<img src="${createAvatarImage}">`;
    p.style.background = 'none';
  } else {
    p.textContent = (isChannel ? 'К' : 'Г');
    p.style.background = `linear-gradient(135deg, ${createContext.color[0]}, ${createContext.color[1]})`;
  }
}

function performCreate() {
  const isChannel = createContext.type === 'channel';
  const name = $('#createName').value.trim() || (isChannel ? 'Новый канал' : 'Новая группа');
  const desc = $('#createDesc').value.trim();
  if (name.length > LIMITS.name) return toast('Ошибка', `Название — максимум ${LIMITS.name} символов`);
  if (desc.length > LIMITS.desc) return toast('Ошибка', `Описание — максимум ${LIMITS.desc} символов`);
  let handle = null;
  if (isChannel) {
    const h = $('#createHandle').value.trim().replace(/^@/, '').toLowerCase();
    if (h) {
      if (!/^[a-z0-9_]{3,14}$/.test(h)) return toast('Ошибка', 'Юзернейм канала: 3-14 символов (a-z, 0-9, _)');
      if (channelHandleTaken(h)) return toast('Ошибка', 'Этот юзернейм канала уже занят');
      handle = h;
    }
  }
  const members = ['me', ...createContext.selected];
  const chat = {
    id: (isChannel ? 'c' : 'g') + Date.now(),
    type: createContext.type,
    name, desc, color: createContext.color,
    handle,
    access: createContext.access === 'private' ? 'private' : 'public',
    whoCanInvite: createContext.access === 'private' ? 'admins' : 'all',
    avatar: createAvatarImage ? { type: 'upload', dataUrl: createAvatarImage } : null,
    owner: 'me', admins: ['me'], members,
    dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
    messages: [{ id: 'm' + Date.now(), from: 'me', text: isChannel ? `Канал «${name}» создан 🎉` : `Группа «${name}» создана 🎉`, time: new Date().toISOString(), read: true }],
  };
  state.chats.push(chat);
  saveState();
  pushChatMeta(chat);
  distributeGroupToMembers(chat, currentUser.username);
  addLog(currentUser.username, isChannel
    ? `Создал канал «${name}»${handle ? ' @' + handle : ''}`
    : `Создал группу «${name}»`);
  closeCreateModal();
  renderChatList();
  selectChat(chat.id);
  toast(isChannel ? 'Канал создан' : 'Группа создана', name);
}

function bindCreateModal() {
  $('#newChatBtn').addEventListener('click', openCreateModal);
  $('#modalClose').addEventListener('click', closeCreateModal);
  $('#createModal').addEventListener('click', (e) => { if (e.target === $('#createModal')) closeCreateModal(); });
  $('#step-type').addEventListener('click', (e) => {
    const opt = e.target.closest('.create-option');
    if (!opt) return;
    createContext.type = opt.dataset.type;
    if (createContext.type === 'ai') {
      closeCreateModal();
      openAiChat();
      return;
    }
    if (createContext.type === 'private') {
      $('#modalTitle').textContent = 'Выберите контакт';
      $('#step-type').classList.add('hidden');
      $('#step-contact').classList.remove('hidden');
      $('#modalBack').classList.remove('hidden');
      renderPrivatePicker();
    } else {
      renderCreateStep();
      $('#modalBack').classList.remove('hidden');
      $('#modalCreate').classList.remove('hidden');
    }
  });
  $('#modalBack').addEventListener('click', () => {
    if (createContext.type === 'private') {
      $('#step-contact').classList.add('hidden');
      $('#step-type').classList.remove('hidden');
    } else {
      $('#step-create').classList.add('hidden');
      $('#step-type').classList.remove('hidden');
      $('#modalCreate').classList.add('hidden');
    }
    $('#modalBack').classList.add('hidden');
  });
  $('#createColorPalette').addEventListener('click', (e) => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    $$('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    createContext.color = COLOR_PALETTE[+sw.dataset.i];
    if (!createAvatarImage) {
      const c = createContext.color;
      $('#createAvatarPreview').style.background = `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
    }
  });
  const createFile = $('#createAvatarFile');
  createFile.addEventListener('change', () => {
    const f = createFile.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Ошибка', 'Можно загрузить только изображение');
    const reader = new FileReader();
    reader.onload = (ev) => {
      createAvatarImage = ev.target.result;
      const p = $('#createAvatarPreview');
      p.innerHTML = `<img src="${createAvatarImage}">`;
      p.style.background = 'none';
      toast('Фото загружено', 'Нажмите «Создать»');
    };
    reader.readAsDataURL(f);
  });
  $('#modalCreate').addEventListener('click', performCreate);
}

/* ---------- БОТЫ ---------- */
function botAccounts() { return accountsList().filter(a => a.isBot); }
function createBotFromModal() {
  const name = $('#botName').value.trim();
  if (!name) return toast('Ошибка', 'Введите имя бота');
  const emoji = $('#botEmoji').value.trim() || '🤖';
  const triggers = $('#botTriggers').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const replies = $('#botReplies').value.split('\n').map(t => t.trim()).filter(Boolean);
  if (!replies.length) return toast('Ошибка', 'Добавьте хотя бы один ответ бота');
  const d = loadAccounts();
  let username = 'bot_' + Math.floor(Math.random() * 900000000);
  while (d.users[username]) {
    username = 'bot_' + Math.floor(Math.random() * 900000000);
  }
  d.users[username] = {
    id: genUserId(), username, email: username + '@nebula.bot', password: '',
    name, color: createContext.botColor, avatar: null,
    badges: { gray: true }, isBot: true, banned: false,
    bot: { emoji, triggers, replies, owner: currentUser.username },
  };
  saveAccounts(d);
  addLog(currentUser.username, `Создал бота «${name}» (@${username})`);
  closeCreateModal();
  toast('Бот создан', name + (triggers.length ? ' — триггеры: ' + triggers.join(', ') : ' — чат-бот, отвечает на всё'));
}
function smartBotReply(raw, bot) {
  const text = String(raw || '').trim();
  const low = text.toLowerCase();
  const emoji = (bot.bot && bot.bot.emoji) || '🤖';
  const name = bot.name || 'Бот';
  const pairs = [
    [/привет|здравств|салют|хай|здорово|добрый день|добрый вечер|ку\b/,
      [`Привет! ${emoji} Рад(а) поболтать.`, `Здравствуй! ${emoji} Как дела?`, `Привет-привет! ${emoji} Чем займёмся?`]],
    [/как дела|как ты\b|как жизнь|что нового|как настроение/,
      [`У меня всё отлично! ${emoji} А у тебя?`, `Живу в телефоне — тут не скучно ${emoji} А ты как?`, `Супер! ${emoji} Расскажи, как твой день?`]],
    [/кто ты|ты кто|расскажи о себе|как тебя зовут|твоё имя/,
      [`Я ${name} ${emoji} — твой собеседник в Nebula. Напиши мне что-нибудь!`, `Меня зовут ${name} ${emoji} Создан(а), чтобы общаться с тобой.`]],
    [/как тебя зовут/, [`Меня зовут ${name} ${emoji}`]],
    [/спасибо|благодар|спс\b|круто|класс|топ\b/,
      [`Всегда пожалуйста! ${emoji}`, `Не за что! ${emoji}`, `Рад(а) помочь ${emoji}`]],
    [/пока|до свидания|прощай|спокойной ночи/,
      [`Пока-пока! ${emoji} Возвращайся скорее.`, `До встречи! ${emoji} Буду ждать.`]],
    [/люблю\b|нравишься|ты класс|обожаю/,
      [`И я тебя! ${emoji}`, `Ахах, спасибо! ${emoji}`, `Ты делаешь мой день ${emoji}`]],
    [/шутк|анекдот|рассмеши|смешно/,
      [`Какой любимый цвет у программиста? Синий-синий-синий! ${emoji}`, `— Я пошутил! — Кто говорит? ${emoji}`]],
    [/дельфин/,
      [`Дельфины — это морская любовь ${emoji} Покорми дельфина в чате!`]],
    [/погод/,
      [`Говорят, в вашем городе ${Math.round(8 + Math.random() * 22)}°C ${emoji} Ну а у меня всегда солнечно!`]],
    [/время|который час/,
      [`Сейчас ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ${emoji}`]],
  ];
  for (const [re, replies] of pairs) {
    if (re.test(low)) return pick(replies);
  }
  const short = shortText(text, 40);
  if (low.includes('?')) {
    return pick([
      `Хм, интересный вопрос про «${short}» ${emoji} Что ты сам(а) думаешь?`,
      `Ох, а я как раз об этом думал(а) ${emoji} Расскажи подробнее?`,
    ]);
  }
  return pick([
    `«${short}» — понял(а) тебя ${emoji} Продолжай!`,
    `Ого, расскажи ещё что-нибудь ${emoji}`,
    `Интересно! ${emoji} А что ты думаешь об этом?`,
    `Слушаю тебя внимательно ${emoji} И что дальше?`,
    `Я за тебя ${emoji} Только вперёд!`,
  ]);
}
function maybeBotReply(chat, text) {
  if (!chat) return;
  const lw = text.toLowerCase();
  let bots = accountsList().filter(a => a.isBot && a.bot);
  if (chat.type === 'private') bots = bots.filter(b => b.username === chat.userId);
  else bots = bots.filter(b => (chat.members || []).includes(b.username));
  bots.forEach(bot => {
    const trig = (bot.bot.triggers || []).map(t => t.trim().toLowerCase()).filter(Boolean);
    const mentioned = chat.type !== 'private' && lw.includes('@' + bot.username.toLowerCase());
    const hit = mentioned || trig.some(t => t !== '*' && truthySubstr(lw, t));
    const catchAll = !trig.length || trig.includes('*');
    const shouldReply = chat.type === 'private'
      ? (catchAll ? true : hit)
      : (mentioned || hit);
    if (!shouldReply) return;
    if (chat.type === 'private' && !catchAll && !hit) return;
    let txt;
    if (catchAll || !hit) txt = smartBotReply(text, bot);
    else txt = (bot.bot.replies && bot.bot.replies.length)
      ? bot.bot.replies[Math.floor(Math.random() * bot.bot.replies.length)]
      : smartBotReply(text, bot);
    setTimeout(() => {
      const b2 = accountsList().find(a => a.isBot && a.username === bot.username);
      if (!b2 || !state.chats.some(c => c.id === chat.id)) return;
      const ch = state.chats.find(c => c.id === chat.id);
      if (ch.type !== 'private' && !(ch.members || []).includes(b2.username)) return;
      appendMessage(chat.id, { from: b2.username, text: txt, read: false });
    }, aiDelay() + 500 + Math.random() * 800);
  });
}
function truthySubstr(hay, needle) { return !!needle && hay.includes(needle); }
function openEditBot(chat) {
  const body = $('#manageBody');
  const bot = accountsList().find(a => a.isBot && a.username === chat.userId);
  if (!bot) return toast('Ошибка', 'Бот не найден');
  body.innerHTML = `
    <div class="manage-section">
      <h4>Настройки бота</h4>
      <div class="admin-hint">Бот отвечает в личных чатах всегда (если нет триггеров) или по триггерам. В группах — только на упоминание @${bot.username} или триггер. Без триггеров бот отвечает на любое сообщение умными ответами чат-бота.</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" class="rename-input" id="ebEmoji" value="${escapeHtml(bot.bot.emoji || '🤖')}" maxlength="4" style="width:70px;text-align:center" title="Эмодзи">
        <input type="text" class="rename-input" id="ebName" value="${escapeHtml(bot.name)}" maxlength="24" placeholder="Имя бота">
      </div>
      <input type="text" class="rename-input" id="ebTriggers" style="margin-top:8px" value="${escapeHtml((bot.bot.triggers || []).join(', '))}" placeholder="Триггеры через запятую: привет, хай, бот. Пусто или * — отвечать на всё" maxlength="120">
      <textarea class="rename-input" id="ebReplies" rows="4" style="margin-top:8px" placeholder="Ответы бота — каждый с новой строки" maxlength="600">${escapeHtml((bot.bot.replies || []).join('\n'))}</textarea>
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="ebSave">Сохранить</button>
        <button class="btn btn-ghost" id="ebBack">Назад</button>
      </div>
    </div>`;
  body.querySelector('#ebSave').addEventListener('click', () => {
    bot.name = $('#ebName').value.trim() || bot.name;
    bot.bot.emoji = $('#ebEmoji').value.trim() || '🤖';
    bot.bot.triggers = $('#ebTriggers').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    bot.bot.replies = $('#ebReplies').value.split('\n').map(t => t.trim()).filter(Boolean);
    if (!bot.bot.replies.length) return toast('Ошибка', 'Добавьте хотя бы один ответ');
    persistOther(bot);
    addLog(currentUser.username, `Обновил бота «${bot.name}»`);
    renderManageBody(chat);
    renderChatList();
    renderChat();
    toast('Бот обновлён', bot.name);
  });
  body.querySelector('#ebBack').addEventListener('click', () => renderManageBody(chat));
}
function deleteBotEverywhere(username) {
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    const before = s.chats.length;
    s.chats = s.chats.filter(c => !(c.type === 'private' && c.userId === username));
    if (s.chats.length !== before) {
      if (s.currentChatId && !s.chats.some(c => c.id === s.currentChatId)) s.currentChatId = null;
      saveStateFor(u.username, s);
    }
  });
  const d = loadAccounts();
  delete d.users[username];
  saveAccounts(d);
}

/* ---------- ЛИЧНЫЕ ЧАТЫ (для админки) ---------- */
function privateChatPairKey(a, b) { return [a, b].sort().join('|'); }
function privateChatExistsEverywhere(a, b) {
  return accountsList().some(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return false;
    return s.chats.some(c => c.type === 'private' && privateChatPairKey(u.username, c.userId) === privateChatPairKey(a, b));
  });
}
function createPrivateChatsEverywhere(username, otherName) {
  const mk = (meName, youName) => {
    const s = getStateFor(meName);
    if (!s || !s.chats) return;
    if (s.chats.some(c => c.type === 'private' && c.userId === youName)) return;
    s.chats.push({
      id: 'p' + Date.now() + Math.floor(Math.random() * 999),
      type: 'private',
      userId: youName,
      dolphin: { xp: 0, lastFeed: 0, lastPlay: 0, lastPet: 0 },
      messages: [],
    });
    saveStateFor(meName, s);
  };
  mk(username, otherName);
  mk(otherName, username);
}
function deletePrivateChatEverywhere(a, b) {
  accountsList().forEach(u => {
    const s = getStateFor(u.username);
    if (!s || !s.chats) return;
    const before = s.chats.length;
    let removedId = null;
    s.chats = s.chats.filter(c => {
      if (c.type === 'private' && privateChatPairKey(u.username, c.userId) === privateChatPairKey(a, b)) { removedId = c.id; return false; }
      return true;
    });
    if (s.chats.length !== before) {
      if (s.currentChatId === removedId) s.currentChatId = null;
      saveStateFor(u.username, s);
    }
  });
}

/* ============================================================
   НАСТРОЙКИ ЧАТА (управление)
   ============================================================ */
let manageChatId = null;
function openManageModal(chat) {
  manageChatId = chat.id;
  $('#manageTitle').textContent = chat.type === 'private' ? 'Настройки чата' : 'Управление чатом';
  renderManageBody(chat);
  $('#manageModal').classList.add('open');
}
function closeManageModal() { $('#manageModal').classList.remove('open'); manageChatId = null; }

function renderManageBody(chat) {
  const body = $('#manageBody');
  const isPrivate = chat.type === 'private';
  const isOwner = chat.owner === 'me';
  const isAdmin = isOwner || (chat.admins || []).includes('me');
  const acc = accFromChat(chat);
  const frame = isPrivate ? selectedFrameClass(acc) : '';
  const SLOW_MODE_OPTIONS = [
    [0, 'Выключен'],
    [1, '1 сек'],
    [5, '5 сек'],
    [10, '10 сек'],
    [30, '30 сек'],
    [60, '1 минута'],
    [600, '10 минут'],
    [1800, '30 минут'],
    [3600, '1 час'],
    [7200, '2 часа'],
    [10800, '3 часа'],
    [18000, '5 часов'],
    [86400, '24 часа (сутки)'],
  ];
  let html = `
    <div class="manage-avatar" style="${avatarStyle(acc)}">${avatarInnerHtml(acc)}</div>
    <div class="manage-name">${chat.type === 'private' ? displayName(acc) : escapeHtml(chatTitle(chat))}</div>
    <div class="manage-sub">${isPrivate
      ? `<span class="copy-id" data-copy="${escapeHtml(acc.id)}" title="Нажмите, чтобы скопировать ID">ID ${escapeHtml(acc.id)} 📋</span>`
      : chat.type === 'group' ? `${chat.members.length} участников` : `${chat.members.length} подписчиков`}${!isPrivate && chat.handle ? ` · @${escapeHtml(chat.handle)}` : ''}</div>
    ${chat.desc ? `<div class="manage-desc">${escapeHtml(chat.desc)}</div>` : ''}
  `;

  if (isPrivate) {
    const isBlocked = (currentUser.blocked || []).includes(chat.userId);
    const isIgnored = (currentUser.ignored || []).includes(chat.userId);
    const isBotChat = !!((userById(chat.userId) || {}).isBot);
    html += `
      <div class="manage-section">
        <h4>Настройки чата</h4>
        ${isBotChat ? `<div class="manage-row" id="mrEditBot">
          <svg viewBox="0 0 24 24"><path d="M21 16.5c0-.38-.21-.71-.53-.88l-7.9-4.44a1 1 0 0 0-.94 0L5.73 15.62c-.32.17-.53.5-.53.88s.21.71.53.88l7.9 4.44c.15.08.32.12.48.12s.33-.04.48-.12l7.9-4.44c.32-.17.53-.5.53-.88zM12 10.5 4.06 6.06 11.53 2.2a1.37 1.37 0 0 1 .94 0l7.47 3.86L12 10.5z"/></svg>
          <div><div class="mr-label">Настроить бота</div><div class="mr-hint">Триггеры, ответы, имя и эмодзи</div></div>
        </div>` : ''}
        <div class="manage-row" id="mrBlock">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
          <div><div class="mr-label">Заблокировать</div><div class="mr-hint">Пользователь не сможет вам писать</div></div>
          <span class="tag-state ${isBlocked ? 'on' : 'off'}">${isBlocked ? 'заблокирован' : 'выключено'}</span>
        </div>
        <div class="manage-row" id="mrIgnore">
          <svg viewBox="0 0 24 24"><path d="M18.92 5.01C18.72 4.42 18.16 4 17.5 4h-11c-.66 0-1.21.42-1.42 1.01L3 11v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 6h10.3l1.04 3H5.81l1.04-3zM19 16H5v-4.66L5.13 10h13.74c.06.44.13.88.13 1.34V16z"/></svg>
          <div><div class="mr-label">Игнорировать</div><div class="mr-hint">Без уведомлений и ответов</div></div>
          <span class="tag-state ${isIgnored ? 'on' : 'off'}">${isIgnored ? 'игнорируется' : 'выключено'}</span>
        </div>
        <div class="manage-row" id="mrClearAll">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          <div><div class="mr-label">Очистить чат для всех</div><div class="mr-hint">Удалить историю у всех участников</div></div>
        </div>
        <div class="manage-row" id="mrClearMe">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          <div><div class="mr-label">Очистить чат для себя</div><div class="mr-hint">Удалить историю только у себя</div></div>
        </div>
      </div>`;
    html += `
      <div class="manage-section">
        <h4>Опасная зона</h4>
        <button class="danger-btn" id="mrDeleteChat">Удалить чат</button>
      </div>`;
    html += `
      <div class="manage-section">
        <h4>Инструменты</h4>
        <div class="manage-row" id="mrPoll">
          <svg viewBox="0 0 24 24"><path d="M3 5h18v2H3V5zm4 6h11v2H7v-2zm-4 6h18v2H3v-2z"/></svg>
          <div><div class="mr-label">Создать опрос</div><div class="mr-hint">Голосование с вариантами ответов</div></div>
        </div>
        <div class="manage-row" id="mrContact">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          <div><div class="mr-label">Поделиться контактом</div><div class="mr-hint">Отправить карточку пользователя</div></div>
        </div>
      </div>`;
  } else {
    if (isAdmin) {
      html += `<div class="manage-section"><h4>О чате</h4>
        <div class="manage-row" id="mrEditInfo">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          <div><div class="mr-label">Название и описание</div><div class="mr-hint">Изменить информацию</div></div>
        </div>
        <div class="manage-row" id="mrChatAvatar">
          <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          <div><div class="mr-label">Сменить аватар</div><div class="mr-hint">Загрузить фото или картинку</div></div>
        </div>
        <div class="manage-row" id="mrChatCard">
          <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg>
          <div><div class="mr-label">Карточка ${chat.type === 'channel' ? 'канала' : 'группы'}</div><div class="mr-hint">QR-код, информация, ссылка</div></div>
        </div>
      </div>`;
    }
    html += `<div class="manage-section">
      <h4>Настройки доступа</h4>
      ${isOwner ? `<div class="manage-row" id="mrAccess">
          <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          <div><div class="mr-label">Тип доступа</div><div class="mr-hint">Публичная — вступить может любой, приватная — только по приглашению</div></div>
          <span class="tag-state ${chat.access === 'public' ? 'on' : 'off'}">${chat.access === 'public' ? 'публичная' : 'приватная'}</span>
        </div>` : ''}
      <div class="manage-row" id="mrWhoInvite">
        <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        <div><div class="mr-label">Кто может приглашать</div><div class="mr-hint">Ограничить права на приглашение участников</div></div>
        <span class="tag-state ${chat.whoCanInvite === 'all' ? 'on' : 'off'}">${chat.whoCanInvite === 'all' ? 'все участники' : 'владелец и админы'}</span>
      </div>
    </div>`;
    const label = chat.type === 'group' ? 'Участники' : 'Подписчики';
    const canWriteHere = chat.type === 'group' ? true
      : (chat.id === NEWS_CHAT_ID ? newsFullAccess(currentUser) : (isAdmin || chat.whoCanWrite === 'all'));
    if (canWriteHere) {
      html += `<div class="manage-section">
        <h4>Инструменты</h4>
        <div class="manage-row" id="mrPoll">
          <svg viewBox="0 0 24 24"><path d="M3 5h18v2H3V5zm4 6h11v2H7v-2zm-4 6h18v2H3v-2z"/></svg>
          <div><div class="mr-label">Создать опрос</div><div class="mr-hint">Голосование с вариантами ответов</div></div>
        </div>
        <div class="manage-row" id="mrContact">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          <div><div class="mr-label">Поделиться контактом</div><div class="mr-hint">Отправить карточку пользователя</div></div>
        </div>
      </div>`;
    }
    if (chat.type === 'group') {
      const cur = chat.slowMode || 0;
      html += `<div class="manage-section">
        <h4>Медленный режим</h4>
        <div class="admin-hint">Ограничивает, как часто участники могут отправлять сообщения в группу</div>
        <select class="rename-input" id="smSelect" style="margin-top:8px">
          ${SLOW_MODE_OPTIONS.map(o => `<option value="${o[0]}" ${cur === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
        </select>
      </div>`;
    }
    html += `<div class="manage-section"><h4>${label} — ${chat.members.length}</h4>`;
    chat.members.forEach(mid => {
      const u = userById(mid);
      if (!u) return;
      const isMe = mid === 'me';
      const isOwnerC = mid === chat.owner;
      const isAdminC = (chat.admins || []).includes(mid);
      let tag = '';
      if (isOwnerC) tag = '<span class="tag owner">владелец</span>';
      else if (isAdminC) tag = '<span class="tag admin">админ</span>';
      if (isMe) tag += ' <span class="tag you">вы</span>';
      const canRemove = isAdmin && !isMe && !isOwnerC;
      const canToggle = isOwner && !isMe && !isOwnerC;
      html += `<div class="member-chip">
        ${avatarHtml(u)}
        <div class="mc-name">${displayName(u)} ${tag}</div>
        ${!isMe ? `<button class="mini-btn mini-info" title="Карточка" data-action="card" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg></button>` : ''}
        ${!isMe ? `<button class="mini-btn ${(currentUser.blocked || []).includes(mid) ? 'mini-danger' : ''}" title="${(currentUser.blocked || []).includes(mid) ? 'Разблокировать' : 'Заблокировать'}" data-action="block" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg></button>` : ''}
        ${!isMe ? `<button class="mini-btn ${(currentUser.ignored || []).includes(mid) ? 'mini-danger' : ''}" title="${(currentUser.ignored || []).includes(mid) ? 'Снять игнор' : 'Игнорировать'}" data-action="ignore" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg></button>` : ''}
        ${canToggle ? `<button class="mini-btn" title="${isAdminC ? 'Снять с админов' : 'Сделать админом'}" data-action="toggle-admin" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></button>` : ''}
        ${canRemove ? `<button class="mini-btn" title="Удалить" data-action="remove-member" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
      </div>`;
    });
    if (isAdmin || chat.whoCanInvite === 'all') {
      html += `<div class="manage-row" id="mrAdd">
        <svg viewBox="0 0 24 24"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
        <div><div class="mr-label">Добавить ${chat.type === 'group' ? 'участника' : 'подписчика'}</div><div class="mr-hint">Пригласить пользователя</div></div>
      </div>`;
    }
    html += `</div>`;
    if (chat.id !== NEWS_CHAT_ID && chat.id !== AI_CHAT_ID) {
      html += `<div class="manage-section">
        ${isOwner
          ? `<button class="danger-btn" id="mrDeleteChat">${chat.type === 'group' ? 'Удалить группу' : 'Удалить канал'}</button>`
          : `<button class="danger-btn" id="mrLeave">${chat.type === 'group' ? 'Покинуть группу' : 'Отписаться'}</button>`}
      </div>`;
    }
  }

  if (chat.type === 'private' || chat.type === 'group') {
    const wall = chat.wall;
    html += `<div class="manage-section wall-section">
      <h4>Фон чата</h4>
      <div class="wall-preview ${wall && wall.value ? 'has' : ''}" id="wallPreview" style="${wall && wall.value ? (wall.type === 'color' ? 'background:' + wall.value : 'background-image:url(\"' + wall.value + '\")') : ''}"></div>
      <div class="admin-hint">Цвета-пресеты (нажмите, чтобы применить):</div>
      <div class="wall-presets">${WALL_PRESETS.map(c => `<button class="wall-swatch" data-wallcolor="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
      <div class="wall-actions">
        <button class="btn btn-sm" id="wallPickImg">🖼 Выбрать картинку</button>
        <button class="btn btn-primary btn-sm" id="wallShare">Поделиться фоном</button>
        <button class="btn btn-sm" id="wallReset">Сбросить</button>
      </div>
      <input type="file" id="wallFile" accept="image/*" hidden>
      <div class="wall-note">Фон виден только вам. «Поделиться фоном» отправит его в чат — собеседник сможет применить к себе.</div>
    </div>`;
  }

  body.innerHTML = html;
  bindManageEvents(chat);
}

function bindManageEvents(chat) {
  const body = $('#manageBody');
  const isOwner = chat.owner === 'me';

  const mrEditBot = body.querySelector('#mrEditBot');
  if (mrEditBot) mrEditBot.addEventListener('click', () => openEditBot(chat));

  const mrBlock = body.querySelector('#mrBlock');
  if (mrBlock) mrBlock.addEventListener('click', () => {
    const i = currentUser.blocked.indexOf(chat.userId);
    if (i >= 0) currentUser.blocked.splice(i, 1);
    else currentUser.blocked.push(chat.userId);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'Пользователь разблокирован' : 'Пользователь заблокирован', chatTitle(chat));
  });

  const mrIgnore = body.querySelector('#mrIgnore');
  if (mrIgnore) mrIgnore.addEventListener('click', () => {
    const i = currentUser.ignored.indexOf(chat.userId);
    if (i >= 0) currentUser.ignored.splice(i, 1);
    else currentUser.ignored.push(chat.userId);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'Игнорирование снято' : 'Пользователь в игноре', chatTitle(chat));
  });

  const mrClearAll = body.querySelector('#mrClearAll');
  if (mrClearAll) mrClearAll.addEventListener('click', () => {
    if (!confirm('Очистить историю для всех?')) return;
    chat.messages = [];
    saveState();
    renderChat();
    renderChatList();
    toast('Чат очищен для всех');
  });
  const mrClearMe = body.querySelector('#mrClearMe');
  if (mrClearMe) mrClearMe.addEventListener('click', () => {
    if (!confirm('Очистить историю для себя?')) return;
    chat.messages = [];
    saveState();
    renderChat();
    renderChatList();
    toast('Чат очищен для себя');
  });

  const mrPoll = body.querySelector('#mrPoll');
  if (mrPoll) mrPoll.addEventListener('click', () => openPollModal(chat));
  const mrContact = body.querySelector('#mrContact');
  if (mrContact) mrContact.addEventListener('click', () => openContactPicker(chat));

  const mrAccess = body.querySelector('#mrAccess');
  if (mrAccess) mrAccess.addEventListener('click', () => {
    chat.access = chat.access === 'public' ? 'private' : 'public';
    if (chat.access === 'private' && chat.whoCanInvite !== 'admins') chat.whoCanInvite = 'admins';
    if (chat.access === 'public') chat.whoCanInvite = 'all';
    saveState();
    renderManageBody(chat);
    renderChatList();
    renderChat();
    toast(chat.access === 'public' ? 'Группа теперь публичная' : 'Группа теперь приватная', chatTitle(chat));
  });

  const mrWhoInvite = body.querySelector('#mrWhoInvite');
  if (mrWhoInvite) {
    if (isOwner || (chat.admins || []).includes('me')) {
      mrWhoInvite.addEventListener('click', () => {
        chat.whoCanInvite = chat.whoCanInvite === 'all' ? 'admins' : 'all';
        saveState();
        renderManageBody(chat);
        toast(chat.whoCanInvite === 'all' ? 'Приглашать могут все участники' : 'Приглашать могут владелец и админы', chatTitle(chat));
      });
    } else {
      mrWhoInvite.style.opacity = .5;
      mrWhoInvite.style.pointerEvents = 'none';
    }
  }

  const smSelect = body.querySelector('#smSelect');
  if (smSelect) {
    smSelect.addEventListener('change', () => {
      chat.slowMode = parseInt(smSelect.value, 10) || 0;
      if (chat.slowMode === 0) delete chat.slowLast;
      saveState();
      pushChatMeta(chat);
      toast('Медленный режим', chat.slowMode === 0 ? 'Выключен' : 'Включён: ' + (SLOW_MODE_OPTIONS.find(o => o[0] === chat.slowMode) || ['', ''])[1]);
    });
  }

  body.querySelectorAll('[data-action="remove-member"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    chat.members = chat.members.filter(m => m !== mid);
    chat.admins = chat.admins.filter(a => a !== mid);
    saveState();
    renderManageBody(chat);
    renderChat();
    renderChatList();
    toast('Участник удалён', userById(mid).name);
  }));
  body.querySelectorAll('[data-action="toggle-admin"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    const idx = chat.admins.indexOf(mid);
    if (idx >= 0) chat.admins.splice(idx, 1);
    else chat.admins.push(mid);
    saveState();
    renderManageBody(chat);
    toast('Права обновлены', userById(mid).name);
  }));

  body.querySelectorAll('[data-action="block"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    const i = currentUser.blocked.indexOf(mid);
    if (i >= 0) currentUser.blocked.splice(i, 1);
    else currentUser.blocked.push(mid);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'Разблокирован' : 'Заблокирован', (userById(mid) || {}).name || mid);
  }));
  body.querySelectorAll('[data-action="ignore"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    const i = currentUser.ignored.indexOf(mid);
    if (i >= 0) currentUser.ignored.splice(i, 1);
    else currentUser.ignored.push(mid);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'Игнор снят' : 'В игноре', (userById(mid) || {}).name || mid);
  }));

  body.querySelectorAll('[data-action="card"]').forEach(btn => btn.addEventListener('click', () => {
    openUserCard(btn.dataset.mid);
  }));
  const mrAdd = body.querySelector('#mrAdd');
  if (mrAdd) mrAdd.addEventListener('click', () => openAddMember(chat));
  const mrEditInfo = body.querySelector('#mrEditInfo');
  if (mrEditInfo) mrEditInfo.addEventListener('click', () => openEditInfo(chat));
  const mrChatAvatar = body.querySelector('#mrChatAvatar');
  if (mrChatAvatar) mrChatAvatar.addEventListener('click', () => changeChatAvatar(chat));
  const mrChatCard = body.querySelector('#mrChatCard');
  if (mrChatCard) mrChatCard.addEventListener('click', () => openChatCard(chat.id));

  const mrDeleteChat = body.querySelector('#mrDeleteChat');
  if (mrDeleteChat) mrDeleteChat.addEventListener('click', () => {
    if (chat.id === NEWS_CHAT_ID) {
      toast('Нельзя', 'Канал Nebula News нельзя удалить');
      return;
    }
    if (chat.id === AI_CHAT_ID) {
      toast('Нельзя', 'Nebula AI всегда с вами 😉');
      return;
    }
    const label = chat.type === 'private' ? 'чат' : chat.type === 'group' ? 'группу' : 'канал';
    if (!confirm(`Удалить ${label} «${chatTitle(chat)}»?`)) return;
    state.chats = state.chats.filter(c => c.id !== chat.id);
    state.pinned = state.pinned.filter(p => p !== chat.id);
    if (state.currentChatId === chat.id) state.currentChatId = null;
    saveState();
    closeManageModal();
    renderChatList();
    renderChat();
    toast(label.charAt(0).toUpperCase() + label.slice(1) + ' удалён(а)', chatTitle(chat));
  });
  const mrLeave = body.querySelector('#mrLeave');
  if (mrLeave) mrLeave.addEventListener('click', () => {
    if (chat.id === NEWS_CHAT_ID) {
      toast('Нельзя', 'Отписаться от Nebula News невозможно — канал обязателен');
      return;
    }
    if (chat.id === AI_CHAT_ID) {
      toast('Нельзя', 'Nebula AI всегда с вами 😉');
      return;
    }
    toast(chat.type === 'group' ? 'Вы покинули группу' : 'Вы отписались', chatTitle(chat));
    state.leftChats = state.leftChats || [];
    if (!state.leftChats.includes(chat.id)) state.leftChats.push(chat.id);
    state.chats = state.chats.filter(c => c.id !== chat.id);
    state.pinned = state.pinned.filter(p => p !== chat.id);
    if (state.currentChatId === chat.id) state.currentChatId = null;
    saveState();
    closeManageModal();
    renderChatList();
    renderChat();
  });

  const wallPreview = body.querySelector('#wallPreview');
  const setWallPreview = (w) => {
    if (!wallPreview) return;
    if (!w || !w.value) { wallPreview.style.backgroundImage = ''; wallPreview.style.backgroundColor = ''; wallPreview.classList.remove('has'); }
    else if (w.type === 'color') { wallPreview.style.backgroundImage = ''; wallPreview.style.backgroundColor = w.value; wallPreview.classList.add('has'); }
    else { wallPreview.style.backgroundColor = ''; wallPreview.style.backgroundImage = 'url("' + w.value + '")'; wallPreview.classList.add('has'); }
  };
  body.querySelectorAll('.wall-swatch').forEach(b => b.addEventListener('click', () => {
    chat.wall = { type: 'color', value: b.dataset.wallcolor };
    persistCurrentUser();
    applyChatWall(chat);
    setWallPreview(chat.wall);
    renderChatList();
    toast('Фон применён');
  }));
  const wallFile = body.querySelector('#wallFile');
  const wallPickImg = body.querySelector('#wallPickImg');
  if (wallPickImg) wallPickImg.addEventListener('click', () => wallFile && wallFile.click());
  if (wallFile) wallFile.addEventListener('change', () => {
    const f = wallFile.files && wallFile.files[0]; wallFile.value = '';
    if (!f) return;
    resizeWallImage(f, dataUrl => {
      chat.wall = { type: 'image', value: dataUrl };
      persistCurrentUser();
      applyChatWall(chat);
      setWallPreview(chat.wall);
      renderChatList();
      toast('Фон применён');
    });
  });
  const wallShare = body.querySelector('#wallShare');
  if (wallShare) wallShare.addEventListener('click', () => {
    if (!chat.wall || !chat.wall.value) { toast('Сначала выберите фон'); return; }
    sendBgMessage(chat, chat.wall);
    closeManageModal();
    toast('Фон отправлен в чат');
  });
  const wallReset = body.querySelector('#wallReset');
  if (wallReset) wallReset.addEventListener('click', () => {
    delete chat.wall;
    persistCurrentUser();
    applyChatWall(chat);
    setWallPreview(null);
    renderChatList();
    toast('Фон сброшен');
  });
}

function openAddMember(chat) {
  const body = $('#manageBody');
  const available = accountsList().filter(u => u.username !== currentUser.username && !chat.members.includes(u.username));
  if (!available.length) { toast('Нет доступных пользователей'); return; }
  body.innerHTML = `<div class="manage-section"><h4>Добавить участников</h4>${contactListHtml(available, false)}</div>`;
  body.querySelectorAll('.member-item').forEach(item => item.addEventListener('click', () => {
    const mid = item.dataset.id;
    if (!chat.members.includes(mid)) chat.members.push(mid);
    saveState();
    distributeGroupToMembers(chat, currentUser.username);
    renderManageBody(chat);
    renderChat();
    renderChatList();
    toast('Добавлено', userById(mid).name);
  }));
}

function openEditInfo(chat) {
  const body = $('#manageBody');
  body.innerHTML = `
    <div class="manage-section">
      <h4>Название и описание</h4>
      <input type="text" id="editName" placeholder="Название" maxlength="${LIMITS.name}" value="${escapeHtml(chat.name)}">
      <textarea id="editDesc" rows="3" placeholder="Описание" maxlength="${LIMITS.desc}">${escapeHtml(chat.desc || '')}</textarea>
      ${chat.type === 'channel' ? `
        <input type="text" id="editHandle" placeholder="@юзернейм канала" value="${escapeHtml(chat.handle || '')}" style="margin-top:8px">
        <div class="mr-hint" style="margin-top:4px">3-14 символов (a-z, 0-9, _). Пусто — без юзернейма.</div>` : ''}
      <div class="color-palette" id="editPalette"></div>
    </div>
    <div class="modal-footer" style="padding:0;border:none">
      <button class="btn btn-primary" id="saveInfo">Сохранить</button>
      <button class="btn btn-ghost" id="cancelInfo">Отмена</button>
    </div>`;
  $('#editPalette').innerHTML = COLOR_PALETTE.map((p, i) =>
    `<button type="button" class="color-swatch ${chat.color && chat.color[0] === p[0] ? 'selected' : ''}" data-i="${i}" style="background:linear-gradient(135deg,${p[0]},${p[1]})"></button>`
  ).join('');
  $('#editPalette').addEventListener('click', (e) => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    $$('#editPalette .color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    chat.color = COLOR_PALETTE[+sw.dataset.i];
  });
  $('#saveInfo').addEventListener('click', () => {
    const n = $('#editName').value.trim() || chat.name;
    const d = $('#editDesc').value.trim();
    if (n.length > LIMITS.name) return toast('Ошибка', `Название — максимум ${LIMITS.name} символов`);
    if (d.length > LIMITS.desc) return toast('Ошибка', `Описание — максимум ${LIMITS.desc} символов`);
    if (chat.type === 'channel' && chat.id !== NEWS_CHAT_ID) {
      const h = $('#editHandle').value.trim().replace(/^@/, '').toLowerCase();
      if (h && !/^[a-z0-9_]{3,14}$/.test(h)) return toast('Ошибка', 'Юзернейм канала: 3-14 символов (a-z, 0-9, _)');
      if (h && channelHandleTaken(h, chat.id)) return toast('Ошибка', 'Этот юзернейм канала уже занят');
      chat.handle = h || null;
    }
    chat.name = n;
    chat.desc = d;
    saveState();
    renderManageBody(chat);
    renderChat();
    renderChatList();
    toast('Сохранено');
  });
  $('#cancelInfo').addEventListener('click', () => renderManageBody(chat));
}

function bindManageModal() {
  $('#manageClose').addEventListener('click', closeManageModal);
  $('#manageModal').addEventListener('click', (e) => { if (e.target === $('#manageModal')) closeManageModal(); });
}

/* ============================================================
   КАРТОЧКА КАНАЛА / ГРУППЫ (QR, информация, ссылка)
   ============================================================ */
function channelLink(chat) {
  const h = chat && chat.handle;
  return location.origin + location.pathname + '?c=' + encodeURIComponent(h || (chat ? chat.id : ''));
}
function qrDataUrl(text) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 2);
  } catch (e) { return null; }
}
function openChatCard(chatId) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat || chat.type === 'private' || chat.type === 'ai' || chat.type === 'saved') return;
  const owner = chatOwnerFor(chat.id);
  const link = channelLink(chat);
  const qr = qrDataUrl(link);
  const ov = document.createElement('div');
  ov.className = 'status-editor-overlay';
  ov.id = 'chatCardOverlay';
  ov.innerHTML = `
    <div class="modal-box stickers-modal chat-card">
      <div class="cc-top">
        <span class="avatar cc-avatar" style="${avatarStyle(accFromChat(chat))}">${avatarInnerHtml(accFromChat(chat))}</span>
        <div class="cc-titles">
          <div class="cc-name">${escapeHtml(chatTitle(chat))}</div>
          <div class="cc-sub">${chat.type === 'channel' ? 'Канал' : 'Группа'}${chat.handle ? ' · @' + escapeHtml(chat.handle) : ''}</div>
        </div>
        <button class="se-close" id="ccClose">✕</button>
      </div>
      ${qr ? `
      <div class="cc-qr">
        <img src="${qr}" alt="QR-код">
        <div class="cc-qr-hint">Отсканируйте, чтобы открыть канал</div>
      </div>` : ''}
      <div class="cc-links">
        <button class="btn btn-primary" id="ccCopy">🔗 Скопировать ссылку</button>
        <button class="btn" id="ccOpen">Открыть</button>
      </div>
      <div class="manage-section">
        <h4>Информация</h4>
        <div class="bn-row"><span>Тип</span><b>${chat.type === 'channel' ? 'Канал' : 'Группа'}</b></div>
        <div class="bn-row"><span>${chat.type === 'channel' ? 'Подписчиков' : 'Участников'}</span><b>${chat.members.length}</b></div>
        ${chat.handle ? `<div class="bn-row"><span>Ссылка</span><b>@${escapeHtml(chat.handle)}</b></div>` : ''}
        <div class="bn-row"><span>Создатель</span><b>${owner ? '@' + escapeHtml(owner.username) : '—'}</b></div>
        ${chat.createdAt ? `<div class="bn-row"><span>Создан</span><b>${new Date(chat.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</b></div>` : ''}
      </div>
      <div class="manage-section">
        <h4>Дополнительная информация</h4>
        ${chat.desc ? `<div class="bn-row"><span>Описание</span><b>${escapeHtml(chat.desc)}</b></div>` : ''}
        <div class="bn-row"><span>Доступ</span><b>${chat.access === 'public' ? 'Публичный' : 'Приватный'}</b></div>
        <div class="bn-row"><span>Кто может писать</span><b>${chat.whoCanWrite === 'all' ? 'Все' : 'Владелец и админы'}</b></div>
        <div class="bn-row"><span>Админы</span><b>${(chat.admins || []).map(x => x === 'me' ? 'Вы' : '@' + x).join(', ') || '—'}</b></div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#ccClose').addEventListener('click', close);
  ov.querySelector('#ccCopy').addEventListener('click', () => {
    copyTextPlain(link, 'Ссылка скопирована');
    toast('Ссылка скопирована', link);
  });
  ov.querySelector('#ccOpen').addEventListener('click', () => { close(); openChannelByLink(chat.id); });
}

/* Смена аватара канала/группы */
function changeChatAvatar(chat) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) return toast('Ошибка', 'Файл слишком большой');
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 256;
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        chat.avatar = { type: 'upload', dataUrl: canvas.toDataURL('image/jpeg', 0.85) };
        saveState();
        renderManageBody(chat);
        renderChat();
        renderChatList();
        toast('Аватар обновлён', chatTitle(chat));
      };
      img.onerror = () => toast('Ошибка', 'Не удалось прочитать изображение');
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  });
  input.click();
}

/* ============================================================
   НАСТРОЙКИ АККАУНТА
   ============================================================ */
function canAdmin() {
  return !!(currentUser && (isAdmin(currentUser.username) || isOwnerAcc(currentUser)));
}
function updateAdminBtn() {
  const b = $('#adminBtn');
  if (b) b.classList.toggle('hidden', !canAdmin());
}
function openAdminPanel() {
  if (!canAdmin()) return;
  renderSettingsAdmin($('#adminBody'));
  $('#adminModal').classList.add('open');
}
function closeAdminPanel() { $('#adminModal').classList.remove('open'); }
function bindAdminPanel() {
  $('#adminClose').addEventListener('click', closeAdminPanel);
  $('#adminModal').addEventListener('click', (e) => { if (e.target === $('#adminModal')) closeAdminPanel(); });
  const b = $('#adminBtn');
  if (b) b.addEventListener('click', openAdminPanel);
}
function openSettings(tab = 'profile') {
  if (tab === 'admin') { openAdminPanel(); return; }
  $$('#settingsTabs .st').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderSettings(tab);
  $('#settingsModal').classList.add('open');
}
function closeSettings() { $('#settingsModal').classList.remove('open'); clearInterval(settingsTicker); }

let settingsTicker = null;
function renderSettings(tab) {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  if (tab === 'profile') renderSettingsProfile(body);
  else if (tab === 'privacy') renderSettingsPrivacy(body);
  else if (tab === 'appearance') renderSettingsAppearance(body);
  else if (tab === 'frames') renderSettingsFrames(body);
  else if (tab === 'dolphins') renderSettingsDolphins(body);
  else if (tab === 'stats') renderSettingsStats(body);
  settingsTicker = tab === 'stats' ? setInterval(() => updateStatsUI(), 1000) : null;
}

function renderSettingsProfile(body) {
  const u = currentUser;
  const frame = selectedFrameClass(u);
  body.innerHTML = `
    <div class="sprofile">
      <div style="position:relative;cursor:pointer" id="spAvatarWrap">
        ${avatarHtml(u, 'big', frame)}
      </div>
      <div>
        <div class="sprofile-name">${displayName(u)}</div>
        <div class="sprofile-id"><span class="copy-id" data-copy="${escapeHtml(u.id)}" title="Нажмите, чтобы скопировать ID">ID: <b>${u.id}</b> 📋</span> · @${escapeHtml(u.username)}</div>
        <div class="sprofile-email">${escapeHtml(u.email)} · подтверждена ✓</div>
      </div>
    </div>
    <div class="manage-section">
      <div class="setting-row" id="srAvatar"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg><div><span class="sr-label">Сменить аватар</span><span class="sr-hint">Выберите фото или загрузите своё</span></div></div>
      <div class="setting-row" id="srCard"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg><div><span class="sr-label">Моя карточка</span><span class="sr-hint">Посмотреть, как вас видят другие</span></div></div>
      <div class="setting-row" id="srName"><svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-3zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg><div><span class="sr-label">Изменить имя</span><span class="sr-hint">Текущее: ${escapeHtml(u.name)}</span></div></div>
      <div class="setting-row" id="srUsername"><svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v6a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5zm7 9h-2v2a5 5 0 0 1-10 0v-2H5v2a7 7 0 0 0 6 6.92V22h2v-2.08A7 7 0 0 0 19 13v-2z"/></svg><div><span class="sr-label">Изменить юзернейм</span><span class="sr-hint">Текущий: @${escapeHtml(u.username)}</span></div></div>
      <div class="setting-row" id="srBio"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><div><span class="sr-label">Описание</span><span class="sr-hint">${u.bio ? escapeHtml(u.bio) : 'Расскажите о себе (показывается в карточке)'}</span></div></div>
      <div class="setting-row" id="srStatus"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5.25 3.15L17 12.2l-4-2.4V7z"/></svg><div><span class="sr-label">Статус</span><span class="sr-hint">${escapeHtml(statusOf(u).label + (statusOf(u).text ? ' · ' + statusOf(u).text : ''))}</span></div></div>
      <div class="setting-row" id="srStickers"><svg viewBox="0 0 24 24"><path d="M18.5 2H5.5C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2zm0 17.5h-13v-15h13v15zM7.5 6h9v2h-9V6zm0 4h9v2h-9v-2zm0 4h6v2h-6v-2z"/></svg><div><span class="sr-label">Мои стикер-паки</span><span class="sr-hint">Создать пак из фото, избранное, паки друзей</span></div></div>
      <div class="setting-row" id="srTracks"><svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg><div><span class="sr-label">Мои треки (MP3)</span><span class="sr-hint">Загрузите музыку — она появится в вашей карточке</span></div></div>
      <div class="setting-row" id="srEmail"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg><div><span class="sr-label">Сменить почту</span><span class="sr-hint">Текущая: ${escapeHtml(u.email)}</span></div></div>
      <div class="setting-row" id="srPassword"><svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg><div><span class="sr-label">Сменить пароль</span><span class="sr-hint">Обновите пароль аккаунта</span></div></div>
      <div class="setting-row" id="srSwitch"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg><div><span class="sr-label">Сменить аккаунт</span><span class="sr-hint">Войти под другим юзернеймом</span></div></div>
      <div class="setting-row" id="srLogout"><svg viewBox="0 0 24 24"><path d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg><div><span class="sr-label">Выйти из аккаунта</span></div></div>
      <div class="setting-row danger-row" id="srDelete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg><div><span class="sr-label">Удалить аккаунт</span><span class="sr-hint">Требуется подтверждение по почте</span></div></div>
    </div>`;

  body.querySelector('#spAvatarWrap').addEventListener('click', openAvatarModal);
  body.querySelector('#srAvatar').addEventListener('click', openAvatarModal);
  body.querySelector('#srCard').addEventListener('click', () => { closeSettings(); openUserCard(currentUser.username); });
  body.querySelector('#srName').addEventListener('click', viewChangeName);
  body.querySelector('#srUsername').addEventListener('click', viewChangeUsername);
  body.querySelector('#srBio').addEventListener('click', viewChangeBio);
  body.querySelector('#srStatus').addEventListener('click', viewChangeStatus);
  const srStickers = body.querySelector('#srStickers');
  if (srStickers) srStickers.addEventListener('click', openStickersManager);
  const srTracks = body.querySelector('#srTracks');
  if (srTracks) srTracks.addEventListener('click', openTracksModal);
  body.querySelector('#srEmail').addEventListener('click', viewChangeEmail);
  body.querySelector('#srPassword').addEventListener('click', viewChangePassword);
  body.querySelector('#srSwitch').addEventListener('click', () => { closeSettings(); openSwitchMenu(); });
  body.querySelector('#srLogout').addEventListener('click', () => { closeSettings(); if (confirm('Выйти из аккаунта?')) logout(); });
  body.querySelector('#srDelete').addEventListener('click', () => {
    closeSettings();
    openVerifyModal({
      title: 'Удаление аккаунта',
      desc: `Для подтверждения мы отправили код на <b>${escapeHtml(u.email)}</b>. Это действие нельзя отменить — все чаты будут удалены.`,
      email: u.email,
      onSuccess: () => {
        deleteAccountEverywhere(u.username);
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        logout();
        toast('Аккаунт удалён');
      }
    });
  });
}

function viewChangeEmail() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Сменить почту</h4>
      <input type="email" id="newEmail" placeholder="Новая почта">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="sendNewEmailCode">Отправить код</button>
        <button class="btn btn-ghost" id="backToProfile">Назад</button>
      </div>
    </div>`;
  body.querySelector('#sendNewEmailCode').addEventListener('click', () => {
    const email = $('#newEmail').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Ошибка', 'Некорректная почта');
    if (accountsList().some(a => a.username !== currentUser.username && a.email === email)) return toast('Ошибка', 'Эта почта уже занята');
    openVerifyModal({
      title: 'Смена почты',
      desc: `Код отправлен на <b>${escapeHtml(email)}</b>`,
      email,
      onSuccess: () => {
        currentUser.email = email;
        persistCurrentUser();
        toast('Почта изменена', email);
        renderSettings('profile');
      }
    });
  });
  body.querySelector('#backToProfile').addEventListener('click', () => renderSettings('profile'));
}

function viewChangeName() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Изменить имя</h4>
      <div class="admin-hint">Имя (никнейм) видят все пользователи в чатах, звонках и на карточке. До 24 символов.</div>
      <input type="text" id="newName" placeholder="Новое имя" maxlength="24" autocomplete="off" value="${escapeHtml(currentUser.name)}">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveName">Сохранить</button>
        <button class="btn btn-ghost" id="backToProfileN">Назад</button>
      </div>
    </div>`;
  body.querySelector('#saveName').addEventListener('click', () => {
    const v = $('#newName').value.trim();
    if (!v) return toast('Ошибка', 'Введите имя');
    currentUser.name = v;
    persistCurrentUser();
    persistOther(currentUser);
    const d = loadAccounts();
    if (d.users[currentUser.username]) d.users[currentUser.username].name = v;
    saveAccounts(d);
    addLog(currentUser.username, `Сменил имя на «${v}»`);
    renderSettings('profile');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('Имя изменено', v);
  });
  body.querySelector('#backToProfileN').addEventListener('click', () => renderSettings('profile'));
}

function viewChangeUsername() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Изменить юзернейм</h4>
      <div class="admin-hint">3-14 символов: латиница, цифры и _. По новому юзернейму вас можно будет найти.</div>
      <input type="text" id="newUsername" placeholder="Новый юзернейм" maxlength="14" autocomplete="off" value="${escapeHtml(currentUser.username)}">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveUsername">Сохранить</button>
        <button class="btn btn-ghost" id="backToProfile3">Назад</button>
      </div>
    </div>`;
  body.querySelector('#saveUsername').addEventListener('click', () => {
    const v = $('#newUsername').value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,14}$/.test(v)) return toast('Ошибка', 'Юзернейм: 3-14 символов (a-z, 0-9, _)');
    if (v === currentUser.username) return toast('Ошибка', 'Это уже ваш юзернейм');
    if (accountsList().some(a => a.username === v)) return toast('Ошибка', 'Этот юзернейм уже занят');
    renameUsernameEverywhere(currentUser.username, v);
    persistCurrentUser();
    addLog(currentUser.username, `Сменил юзернейм на @${v}`);
    renderSettings('profile');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('Юзернейм изменён', '@' + v);
  });
  body.querySelector('#backToProfile3').addEventListener('click', () => renderSettings('profile'));
}

function renameUsernameEverywhere(oldName, newName) {
  if (oldName === newName) return true;
  const d = loadAccounts();
  if (!d.users[oldName]) return false;
  d.users[oldName].username = newName;
  d.users[newName] = d.users[oldName];
  delete d.users[oldName];
  saveAccounts(d);
  const admins = adminList();
  if (admins.includes(oldName)) {
    admins[admins.indexOf(oldName)] = newName;
    saveAdminList(admins.sort());
  }
  if (localStorage.getItem(SESSION_KEY) === oldName) safeSet(SESSION_KEY, newName);
  if (currentUser && currentUser.username === oldName) currentUser.username = newName;
  const oldSt = localStorage.getItem(stateKey(oldName));
  if (oldSt) {
    localStorage.removeItem(stateKey(oldName));
    safeSet(stateKey(newName), oldSt);
  }
  const names = Object.keys(d.users);
  names.forEach(nu => {
    const s = getStateFor(nu);
    if (!s || !s.chats) return;
    let changed = false;
    s.chats.forEach(c => {
      if (c.type === 'private' && c.userId === oldName) { c.userId = newName; changed = true; }
      if (c.owner === oldName) { c.owner = newName; changed = true; }
      if (c.admins && c.admins.includes(oldName)) { c.admins = c.admins.map(a => a === oldName ? newName : a); changed = true; }
      if (c.members && c.members.includes(oldName)) { c.members = c.members.map(m => m === oldName ? newName : m); changed = true; }
      c.messages.forEach(m => { if (m.from === oldName) { m.from = newName; changed = true; } });
    });
    if (changed) saveStateFor(nu, s);
  });
  return true;
}

function viewChangeStatus() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  const cur = (currentUser.status && currentUser.status.t) || 'online';
  body.innerHTML = `
    <div class="manage-section">
      <h4>Статус</h4>
      <div class="admin-hint">Другие пользователи видят ваш статус в списке чатов, в звонках и на карточке</div>
      <div class="status-opts" id="stOpts">${statusChoiceHtml(cur)}</div>
      <input type="text" class="rename-input" id="stText" placeholder="Текст статуса (необязательно)" maxlength="40" value="${escapeHtml((currentUser.status && currentUser.status.s) || '')}">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveStatus">Сохранить</button>
        <button class="btn btn-ghost" id="backToProfile4">Назад</button>
      </div>
    </div>
    <div class="manage-section">
      <h4>Опубликовать статус (сторис)</h4>
      <div class="admin-hint">Статусы создаются по клику на вашу аватарку вверху списка чатов. Фото, видео или текст — видны 24 часа тем, кто вместе с вами в группах и каналах</div>
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="openStatusEditorBtn">➕ Создать статус</button>
        ${currentUser.statusPost ? '<button class="btn btn-ghost" id="clearPost">Удалить мой статус</button>' : ''}
      </div>
    </div>`;
  let pick = cur;
  body.querySelectorAll('.status-opt').forEach(b => b.addEventListener('click', () => {
    pick = b.dataset.t;
    body.querySelectorAll('.status-opt').forEach(x => {
      x.classList.toggle('sel', x.dataset.t === pick);
      const ch = x.querySelector('.st-check');
      if (ch) ch.textContent = x.dataset.t === pick ? '✓' : '';
    });
  }));
  body.querySelector('#saveStatus').addEventListener('click', () => {
    currentUser.status = { t: pick, s: $('#stText').value.trim() };
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, `Поставил статус «${pick}»${currentUser.status.s ? ': ' + currentUser.status.s : ''}`);
    renderSettings('profile');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('Статус сохранён', statusOf(currentUser).label);
  });
  const savePost = body.querySelector('#openStatusEditorBtn');
  if (savePost) savePost.addEventListener('click', () => openStatusEditor());
  const clearPost = body.querySelector('#clearPost');
  if (clearPost) clearPost.addEventListener('click', () => {
    delete currentUser.statusPost;
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, 'Удалил опубликованный статус');
    renderSettings('profile');
    renderChatList();
    toast('Статус удалён');
  });
  body.querySelector('#backToProfile4').addEventListener('click', () => renderSettings('profile'));
}

/* ===== СТАТУСЫ (сторис) как в Telegram ===== */
function statusVisibleFor(u) {
  if (!u || u.username === currentUser.username) return false;
  const me = currentUser.username;
  const uniq = uniqueChatsAcrossUsers();
  for (const c of uniq) {
    if (c.type !== 'group' && c.type !== 'channel') continue;
    if (!c.members || !c.members.length) continue;
    const members = c.members.map(m => m === 'me' ? chatOwnerFor(c.id) : m);
    if (members.includes(me) && members.includes(u.username)) return true;
  }
  return false;
}

function storyUsers() {
  const now = Date.now();
  return accountsList().filter(u =>
    u.username !== currentUser.username &&
    u.statusPost && (now - u.statusPost.time) < 86400000 &&
    statusVisibleFor(u)
  ).sort((a, b) => b.statusPost.time - a.statusPost.time);
}

function statusBarHtml() {
  const mine = currentUser.statusPost && (Date.now() - currentUser.statusPost.time) < 86400000 ? currentUser.statusPost : null;
  const users = storyUsers();
  const item = (avatar, name, extra) => `
    <div class="story-item" ${extra}>
      <div class="story-avatar-wrap">${avatar}</div>
      <span class="story-name">${name}</span>
    </div>`;
  const myHtml = mine
    ? item(`<span class="st-ring st-ring-mine">${avatarHtml(currentUser, '', selectedFrameClass(currentUser))}</span>`, 'Мой статус', 'data-mine="1"')
    : item(`<span class="story-add-avatar">${avatarHtml(currentUser)}<i class="story-plus">＋</i></span>`, 'Создать статус', 'data-mine="1"');
  let h = '<div class="stories-row" id="storiesRow"><div class="stories-scroll">' + myHtml;
  h += users.map(u => item(
    `<span class="st-ring">${avatarHtml(u, '', selectedFrameClass(u))}</span>`,
    shortText(displayName(u), 12),
    `data-user="${escapeHtml(u.username)}"`
  )).join('');
  h += '</div></div>';
  return h;
}

function openStatusEditor() {
  const ov = document.createElement('div');
  ov.className = 'status-editor-overlay';
  ov.id = 'statusEditorOverlay';
  const has = currentUser.statusPost;
  ov.innerHTML = `
    <div class="status-editor-box">
      <div class="se-head">
        <div class="se-title">➕ Новый статус</div>
        <button type="button" class="se-close" title="Закрыть">✕</button>
      </div>
      <div class="se-media" id="seMedia" style="display:none"></div>
      <div class="se-actions">
        <input type="file" id="sePhoto" accept="image/*" hidden>
        <input type="file" id="seVideo" accept="video/*" hidden>
        <button type="button" class="se-btn" id="sePhotoBtn">📷 Фото</button>
        <button type="button" class="se-btn" id="seVideoBtn">🎬 Видео</button>
        <button type="button" class="se-btn" id="seClearMedia" style="display:none">✕ Убрать</button>
      </div>
      <textarea id="seText" rows="3" maxlength="120" placeholder="Что у вас нового? 🎉"></textarea>
      <div class="se-hint">👁 Статус увидят только те, кто вместе с вами в группах и каналах. Пропадёт через 24 часа.</div>
      <div class="se-btns">
        <button type="button" class="btn btn-primary" id="sePublish">Опубликовать</button>
        ${has ? '<button type="button" class="btn se-del" id="seDelete">Удалить мой статус</button>' : ''}
        <button type="button" class="btn" id="seCancel">Отмена</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  let media = [];
  const renderMedia = () => {
    const box = ov.querySelector('#seMedia');
    box.innerHTML = media.map(m => m.type.startsWith('video')
      ? `<video src="${m.dataUrl}" autoplay muted loop playsinline></video>`
      : `<img src="${m.dataUrl}" alt="">`).join('');
    box.style.display = media.length ? 'grid' : 'none';
    ov.querySelector('#seClearMedia').style.display = media.length ? '' : 'none';
  };
  const addFile = (f, type) => {
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) return toast('Ошибка', 'Файл слишком большой');
    if (type === 'video') {
      const rd = new FileReader();
      rd.onload = () => { media.push({ dataUrl: rd.result, type }); renderMedia(); };
      rd.readAsDataURL(f);
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 720;
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        media.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), type });
        renderMedia();
      };
      img.onerror = () => { media.push({ dataUrl: rd.result, type }); renderMedia(); };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  ov.querySelector('#sePhotoBtn').addEventListener('click', () => ov.querySelector('#sePhoto').click());
  ov.querySelector('#seVideoBtn').addEventListener('click', () => ov.querySelector('#seVideo').click());
  ov.querySelector('#sePhoto').addEventListener('change', e => addFile(e.target.files[0], 'image'));
  ov.querySelector('#seVideo').addEventListener('change', e => addFile(e.target.files[0], 'video'));
  ov.querySelector('#seClearMedia').addEventListener('click', () => { media = []; renderMedia(); });
  ov.querySelector('.se-close').addEventListener('click', () => ov.remove());
  ov.querySelector('#seCancel').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('#sePublish').addEventListener('click', () => {
    const text = ov.querySelector('#seText').value.trim();
    if (!media.length && !text) return toast('Ошибка', 'Добавьте фото, видео или текст');
    currentUser.statusPost = { time: Date.now(), text, media };
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, `Опубликовал статус${media.length ? ' (фото/видео)' : ''}${text ? ': "' + shortText(text, 45) + '"' : ''}`);
    renderChatList();
    renderChat();
    ov.remove();
    toast('Статус опубликован', 'Виден 24 часа');
  });
  const del = ov.querySelector('#seDelete');
  if (del) del.addEventListener('click', () => {
    delete currentUser.statusPost;
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, 'Удалил статус');
    renderChatList();
    ov.remove();
    toast('Статус удалён');
  });
  ov.querySelector('#seText').value = has && has.text && !has.media ? has.text : '';
  ov.querySelector('#seText').focus();
}

function persistStatusPost(ownerAcc, p) {
  ownerAcc.statusPost = p;
  if (ownerAcc.username === currentUser.username) persistCurrentUser();
  else persistOther(ownerAcc);
}
function openStatusView(username) {
  const u = accountByUsername(username);
  if (!u || !u.statusPost) return;
  const post = u.statusPost;
  if (Date.now() - post.time > 86400000) return;
  if (currentUser && u.username !== currentUser.username) {
    post.viewers = post.viewers || [];
    const v = post.viewers.find(x => x.user === currentUser.username);
    if (v) v.time = Date.now();
    else post.viewers.push({ user: currentUser.username, time: Date.now() });
    persistStatusPost(u, post);
  }
  const frame = selectedFrameClass(u);
  const media = post.media || [];
  const reactions = post.reactions || {};
  const REACT_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢'];
  let ov = $('#statusViewOverlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.className = 'status-view-overlay';
  ov.id = 'statusViewOverlay';
  ov.innerHTML = `
    <div class="status-view-box ${media.length ? 'with-media' : ''}">
      <div class="sv-head">
        ${avatarHtml(u, 'big', frame)}
        <div class="sv-info">
          <div class="sv-name">${displayName(u)}</div>
          <div class="sv-time">${new Date(post.time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <button type="button" class="btn btn-ghost sv-close" title="Закрыть">✕</button>
      </div>
      ${media.length ? `
        <div class="sv-progress">${media.map(() => '<i class="sv-bar"></i>').join('')}</div>
        <div class="sv-media" id="svMedia"></div>
        <button type="button" class="sv-nav sv-prev">‹</button>
        <button type="button" class="sv-nav sv-next">›</button>
      ` : ''}
      ${post.text ? `<div class="sv-text">${escapeHtml(post.text)}</div>` : ''}
      <div class="sv-extra">
        <div class="sv-reactions" id="svReactions">
          ${REACT_EMOJIS.map(e => {
            const who = reactions[e] || [];
            const mine = currentUser && who.includes(currentUser.username);
            return `<button type="button" class="sv-react ${mine ? 'mine' : ''}" data-emoji="${e}" title="${who.join(', ') || 'Реакция'}">${e}<span class="sv-react-n">${who.length || ''}</span></button>`;
          }).join('')}
        </div>
        <div class="sv-viewers" id="svViewers">👁 Просмотры: ${(post.viewers || []).length}</div>
        <div class="sv-comments" id="svComments"></div>
        <div class="sv-compose">
          <input type="text" id="svCommentInput" placeholder="Оставьте комментарий..." maxlength="120" autocomplete="off">
          <button type="button" class="btn btn-primary" id="svCommentSend">Отправить</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const renderComments = () => {
    const box = ov.querySelector('#svComments');
    const list = (post.comments || []).slice().reverse();
    box.innerHTML = list.length
      ? list.map(c => {
          const cu = accountByUsername(c.user);
          return `<div class="sv-comment"><span class="avatar svc-avatar" style="${avatarStyle(cu || {})}">${avatarInnerHtml(cu || {})}</span><div class="svc-body"><div class="svc-top"><b>${escapeHtml((cu ? cu.name : c.user) || c.user)}</b><span>${new Date(c.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div><div>${escapeHtml(c.text)}</div></div></div>`;
        }).join('')
      : '<div class="sv-no-comments">Пока нет комментариев</div>';
  };
  const renderViewers = () => {
    const box = ov.querySelector('#svViewers');
    const vs = post.viewers || [];
    box.innerHTML = '👁 Просмотры: ' + (vs.length
      ? vs.map(v => {
          const vu = accountByUsername(v.user);
          return `<span class="avatar sv-viewer" style="${avatarStyle(vu || {})}" title="${escapeHtml((vu ? vu.name : v.user) || v.user)}">${avatarInnerHtml(vu || {})}</span>`;
        }).join('')
      : '<span class="sv-no-viewers">пока никого</span>');
  };
  renderComments();
  renderViewers();
  ov.querySelectorAll('.sv-react').forEach(b => b.addEventListener('click', () => {
    const e = b.dataset.emoji;
    reactions[e] = reactions[e] || [];
    const i = reactions[e].indexOf(currentUser.username);
    if (i >= 0) reactions[e].splice(i, 1);
    else reactions[e].push(currentUser.username);
    post.reactions = reactions;
    persistStatusPost(u, post);
    ov.querySelectorAll('.sv-react').forEach(rb => {
      const who = reactions[rb.dataset.emoji] || [];
      const mine = who.includes(currentUser.username);
      rb.classList.toggle('mine', mine);
      rb.querySelector('.sv-react-n').textContent = who.length || '';
      rb.title = who.join(', ') || 'Реакция';
    });
  }));
  const sendComment = () => {
    const inp = ov.querySelector('#svCommentInput');
    const text = inp.value.trim();
    if (!text) return;
    post.comments = post.comments || [];
    post.comments.push({ user: currentUser.username, text, time: Date.now() });
    persistStatusPost(u, post);
    inp.value = '';
    renderComments();
  };
  ov.querySelector('#svCommentSend').addEventListener('click', sendComment);
  ov.querySelector('#svCommentInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });
  let idx = 0, timer = null;
  const show = (i) => {
    if (!media.length) return;
    idx = (i + media.length) % media.length;
    const m = media[idx];
    ov.querySelector('#svMedia').innerHTML = m.type.startsWith('video')
      ? `<video src="${m.dataUrl}" autoplay muted loop playsinline></video>`
      : `<img src="${m.dataUrl}" alt="">`;
    ov.querySelectorAll('.sv-bar').forEach((b, j) => {
      b.classList.toggle('done', j < idx);
      b.classList.toggle('active', j === idx);
    });
    clearTimeout(timer);
    if (media.length > 1) timer = setTimeout(() => show(idx + 1), 5000);
  };
  if (media.length) show(0);
  const next = ov.querySelector('.sv-next');
  if (next) next.addEventListener('click', e => { e.stopPropagation(); show(idx + 1); });
  const prev = ov.querySelector('.sv-prev');
  if (prev) prev.addEventListener('click', e => { e.stopPropagation(); show(idx - 1); });
  ov.querySelector('.sv-close').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

function viewChangeBio() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Описание</h4>
      <div class="admin-hint">Показывается на вашей карточке у всех пользователей</div>
      <textarea id="newBio" rows="3" maxlength="90" placeholder="Например: Люблю дельфинов 🐬">${escapeHtml(currentUser.bio || '')}</textarea>
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveBio">Сохранить</button>
        <button class="btn btn-ghost" id="backToProfile4">Назад</button>
      </div>
    </div>`;
  body.querySelector('#saveBio').addEventListener('click', () => {
    currentUser.bio = $('#newBio').value.trim();
    persistCurrentUser();
    addLog(currentUser.username, 'Обновил описание');
    renderSettings('profile');
    toast('Описание сохранено');
  });
  body.querySelector('#backToProfile4').addEventListener('click', () => renderSettings('profile'));
}

function viewChangePassword() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Сменить пароль</h4>
      <input type="password" id="curPass" placeholder="Текущий пароль">
      <input type="password" id="newPass" placeholder="Новый пароль (до 24 символов)" maxlength="24">
      <input type="password" id="newPass2" placeholder="Повторите новый пароль" maxlength="24">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="savePass">Сохранить</button>
        <button class="btn btn-ghost" id="backToProfile2">Назад</button>
      </div>
    </div>`;
  body.querySelector('#savePass').addEventListener('click', () => {
    const cur = $('#curPass').value;
    const np = $('#newPass').value;
    const np2 = $('#newPass2').value;
    if (cur !== currentUser.password) return toast('Ошибка', 'Неверный текущий пароль');
    if (np.length < 8 || np.length > LIMITS.password) return toast('Ошибка', `Пароль должен быть 8-${LIMITS.password} символов`);
    if (!/[a-z]/.test(np) || !/[A-Z]/.test(np) || !/\d/.test(np) || !/[^a-zA-Z0-9]/.test(np)) return toast('Ошибка', 'Пароль: нужны a-z, A-Z, цифра и символ');
    if (weakPasswordDetect(np)) return toast('Ошибка', 'Пароль слишком простой — придумайте сложнее');
    if (np !== np2) return toast('Ошибка', 'Пароли не совпадают');
    currentUser.password = np;
    persistCurrentUser();
    toast('Пароль изменён');
    renderSettings('profile');
  });
  body.querySelector('#backToProfile2').addEventListener('click', () => renderSettings('profile'));
}

function renderSettingsPrivacy(body) {
  const u = currentUser;
  const opts = [
    { v: 'all', t: 'Все', d: 'Любой пользователь может писать вам' },
    { v: 'contacts', t: 'Контакты', d: 'Только те, с кем вы уже общались' },
    { v: 'nobody', t: 'Никто', d: 'Никто не сможет писать вам' },
  ];
  const w = u.settings.whoCanWrite || 'all';
body.innerHTML = `
    <div class="manage-section">
      <h4>Кто может вам писать</h4>
      <div class="radio-group" id="whoCanWrite">
        ${opts.map(o => `<div class="radio-item ${w === o.v ? 'selected' : ''}" data-v="${o.v}">
          <span class="radio-circle"></span>
          <div><span class="ri-label">${o.t}</span><span class="ri-hint">${o.d}</span></div>
        </div>`).join('')}
      </div>
    </div>
    <div class="manage-section">
      <h4>Заблокированные (${u.blocked.length})</h4>
      ${u.blocked.length ? u.blocked.map(name => {
        const acc = userById(name);
        const nm = acc ? acc.name : name;
        return `<div class="member-chip">${acc ? avatarHtml(acc) : ''}<div class="mc-name">${escapeHtml(nm)}</div><button class="mini-btn" data-unblock="${name}" title="Разблокировать">${CHECK_ICON}</button></div>`;
      }).join('') : '<div class="empty-list">Никого нет</div>'}
    </div>
    <div class="manage-section">
      <h4>В игноре (${u.ignored.length})</h4>
      ${u.ignored.length ? u.ignored.map(name => {
        const acc = userById(name);
        const nm = acc ? acc.name : name;
        return `<div class="member-chip">${acc ? avatarHtml(acc) : ''}<div class="mc-name">${escapeHtml(nm)}</div><button class="mini-btn" data-unignore="${name}" title="Убрать из игнора">${CHECK_ICON}</button></div>`;
      }).join('') : '<div class="empty-list">Никого нет</div>'}
    </div>`;

  body.querySelectorAll('#whoCanWrite .radio-item').forEach(item => item.addEventListener('click', () => {
    u.settings.whoCanWrite = item.dataset.v;
    persistCurrentUser();
    body.querySelectorAll('#whoCanWrite .radio-item').forEach(r => r.classList.toggle('selected', r === item));
    toast('Настройки приватности обновлены');
  }));
  body.querySelectorAll('[data-unblock]').forEach(b => b.addEventListener('click', () => {
    u.blocked = u.blocked.filter(x => x !== b.dataset.unblock);
    persistCurrentUser();
    renderSettings('privacy');
    renderChat();
    toast('Разблокировано');
  }));
  body.querySelectorAll('[data-unignore]').forEach(b => b.addEventListener('click', () => {
    u.ignored = u.ignored.filter(x => x !== b.dataset.unignore);
    persistCurrentUser();
    renderSettings('privacy');
    toast('Убрано из игнора');
  }));
}

/* ============================================================
   АДМИН-ПАНЕЛЬ
   ============================================================ */
const BADGE_LABELS = { scam: 'СКАМ', admin: 'АДМИН', owner: 'Владелец', tester: 'ТЕСТЕР', blue: 'Синяя галочка', gray: 'Серая галочка', clock: '🕐 Часы' };
const TICK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 10 18 19.5 6.5"/></svg>';

function loadAnnouncement() { try { return JSON.parse(localStorage.getItem(ANN_KEY)); } catch (e) { return null; } }
function saveAnnouncement(a) { safeSet(ANN_KEY, JSON.stringify(a)); }

function renderSettingsAdmin(body) {
  const admins = adminList();
  const accs = accountsList().filter(a => !a.isBot).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  const bots = botAccounts();
  const allChats = uniqueChatsAcrossUsers();
  const ann = loadAnnouncement();
  const totalMsgs = allChats.reduce((n, c) => n + c.messages.length, 0);
  const privMap = {};
  allChats.filter(c => c.type === 'private').forEach(c => {
    const owner = (chatOwnerFor(c.id) || {}).username || '?';
    const key = privateChatPairKey(owner, c.userId);
    if (!privMap[key]) privMap[key] = { owner, other: c.userId };
  });
  const privs = Object.values(privMap);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Поиск пользователя</h4>
      <div class="admin-hint">Найдите по ID, @юзернейму или имени — разделы ниже покажут только этого пользователя</div>
      <input type="text" class="rename-input admin-user-search" placeholder="ID, @юзернейм или имя..." style="margin-top:8px">
    </div>

    <div class="manage-section">
      <h4>Статистика мессенджера</h4>
      <div class="stat-grid">
        <div class="stat-card"><div class="sc-num">${accs.length}</div><div class="sc-label">аккаунтов</div></div>
        <div class="stat-card"><div class="sc-num">${admins.length}</div><div class="sc-label">админов</div></div>
        <div class="stat-card"><div class="sc-num">${allChats.filter(c => c.type === 'group').length}</div><div class="sc-label">групп</div></div>
        <div class="stat-card"><div class="sc-num">${allChats.filter(c => c.type === 'channel').length}</div><div class="sc-label">каналов</div></div>
        <div class="stat-card"><div class="sc-num">${totalMsgs}</div><div class="sc-label">сообщений</div></div>
        <div class="stat-card"><div class="sc-num">${accs.filter(a => a.banned).length}</div><div class="sc-label">забанено</div></div>
      </div>
    </div>

    <div class="manage-section">
      <h4>Регистрации и учётные данные</h4>
      <div class="admin-hint">Все аккаунты: ID, логин, почта, пароль и даты регистрации/входа (хранятся локально и в облачной базе)</div>
      ${accs.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)} ${a.banned ? '<span class="tag" style="color:#e74c3c">ЗАБАНЕН</span>' : ''}</div>
            <div class="au-reg">
              <span class="au-reg-k">ID</span><span class="au-reg-v copy-id" data-copy="${escapeHtml(a.id)}">${escapeHtml(a.id)} 📋</span>
              <span class="au-reg-k">Логин</span><span class="au-reg-v">@${escapeHtml(a.username)}</span>
              <span class="au-reg-k">Имя</span><span class="au-reg-v">${escapeHtml(a.name)}</span>
              <span class="au-reg-k">Почта</span><span class="au-reg-v">${escapeHtml(a.email || '—')}</span>
              <span class="au-reg-k">Пароль</span><span class="au-reg-v">${escapeHtml(a.password || '—')}</span>
              <span class="au-reg-k">Регистрация</span><span class="au-reg-v">${a.created ? fmtNoticeDate(a.created) : '—'}</span>
              <span class="au-reg-k">Последний вход</span><span class="au-reg-v">${a.lastSeen ? fmtNoticeDate(a.lastSeen) : '—'}</span>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Доступ к админ-панели</h4>
      <div class="admin-hint">Выдайте или заберите доступ к этой панели</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <button type="button" class="btn ${admins.includes(a.username) ? 'btn-ghost' : 'btn-primary'} au-admin">${admins.includes(a.username) ? 'Забрать админку' : 'Дать админку'}</button>
              <button type="button" class="btn btn-danger au-kick">Кикнуть</button>
              <button type="button" class="btn ${a.banned ? 'btn-ghost' : 'btn-danger'} au-ban">${a.banned ? 'Разбанить' : 'Забанить'}</button>
              <button type="button" class="btn btn-danger au-del" ${a.username === currentUser.username ? 'style="opacity:.4;pointer-events:none"' : ''}>Удалить аккаунт</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Бейджи</h4>
      <div class="admin-hint">Отметки: СКАМ, АДМИН, ВЛАДЕЛЕЦ (анимированный), ТЕСТЕР, синяя и серая галочки, часы</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-badges">
              ${['scam', 'admin', 'owner', 'tester', 'blue', 'gray', 'clock'].map(b => {
                const on = !!(a.badges || {})[b];
                const ico = b === 'blue' ? '<span class="mini-tick mini-tick-blue">' + TICK_ICON + '</span>'
                  : b === 'gray' ? '<span class="mini-tick mini-tick-gray">' + TICK_ICON + '</span>' : '';
                return `<button type="button" class="badge-chip ${on ? 'on' : ''}" data-b="${b}">${ico}${BADGE_LABELS[b]}</button>`;
              }).join('')}
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Тех поддержка</h4>
      <div class="admin-hint">Сотрудник тех поддержки может разбирать тикеты — видеть все обращения и отвечать в них</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-badges">
              <button type="button" class="badge-chip ${a.support ? 'on' : ''}" data-sup="${a.username}">🎧 Тех поддержка</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Разобранные тикеты</h4>
      <div class="admin-hint">Сколько тикетов решил каждый сотрудник тех поддержки — за день, неделю, месяц, год и за всё время</div>
      ${supportStatsHtml()}
    </div>

    <div class="manage-section">
      <h4>Рамки аватара</h4>
      <div class="admin-hint">Выдайте или заберите любую рамку пользователю (действует поверх достижений)</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-badges">
              ${FRAME_ORDER.map(f => {
                const on = !!((a.frameOverride || []).includes(f));
                const ff = FRAMES.find(x => x.id === f);
                return `<button type="button" class="frame-chip ${on ? 'on' : ''}" data-f="${f}">${ff.emoji} ${ff.name}</button>`;
              }).join('')}
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Никнеймы</h4>
      <div class="admin-hint">Измените никнейм любого пользователя</div>
      ${accs.map(a => `
        <div class="admin-rename" data-u="${a.username}">
          <span class="au-name">${displayName(a)}</span>
          <input type="text" class="rename-input" value="${escapeHtml(a.name)}" maxlength="${LIMITS.name}">
          <button type="button" class="btn btn-primary rename-save">Сохранить</button>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Данные пользователя</h4>
      <div class="admin-hint">Смена ID, @юзернейма, почты и био. Юзернейм обновится во всех чатах, контактах и списке админов</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${escapeHtml(a.username)}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="admin-edit-grid">
              <label>ID<input type="text" class="rename-input ae-id" value="${escapeHtml(a.id)}" maxlength="24"></label>
              <label>@юзернейм<input type="text" class="rename-input ae-username" value="${escapeHtml(a.username)}" maxlength="${LIMITS.username}"></label>
              <label>Почта<input type="text" class="rename-input ae-email" value="${escapeHtml(a.email)}"></label>
              <label>Био<input type="text" class="rename-input ae-bio" value="${escapeHtml(a.bio || '')}" maxlength="90" placeholder="Кратко о себе"></label>
            </div>
            <div class="au-actions">
              <button type="button" class="btn btn-primary ae-save">Сохранить</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Сброс пароля</h4>
      <div class="admin-hint">Установите новый пароль пользователю (8-24 символа)</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <input type="password" class="rename-input admin-pw-input" placeholder="Новый пароль" maxlength="${LIMITS.password}" autocomplete="off">
              <button type="button" class="btn btn-primary admin-pw-save">Сбросить</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Объявление для всех</h4>
      <div class="admin-hint">${ann ? `Текущее объявление (${fmtLogTime(ann.t)}): «${escapeHtml(shortText(ann.text, 90))}»` : 'Пока объявлений нет'}</div>
      <textarea id="annText" rows="2" placeholder="Текст объявления..." maxlength="200"></textarea>
      <div class="au-actions" style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn btn-primary" id="annSend">Отправить объявление</button>
        ${ann ? '<button type="button" class="btn btn-ghost" id="annClear">Снять объявление</button>' : ''}
      </div>
    </div>

    <div class="manage-section">
      <h4>Канал Nebula News</h4>
      <div class="admin-hint">Опубликуйте уведомление в канал Nebula News — его увидят все пользователи. Сообщение придёт от вашего имени.</div>
      <textarea id="newsText" rows="2" placeholder="Текст уведомления..." maxlength="300"></textarea>
      <div class="au-actions" style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn btn-primary" id="newsSend">Опубликовать в Nebula News</button>
      </div>
    </div>

    <div class="manage-section">
      <h4>Каналы и группы</h4>
      <div class="admin-hint">Найдите по названию, @юзернейму или типу. Можно переименовать или удалить у всех.</div>
      <input type="text" class="rename-input admin-chat-search" placeholder="Название, @юзернейм, канал/группа..." style="margin-top:8px">
      <div class="admin-chats">
        ${allChats.filter(c => c.id !== NEWS_CHAT_ID && (c.type === 'channel' || c.type === 'group')).length ? allChats.filter(c => c.id !== NEWS_CHAT_ID && (c.type === 'channel' || c.type === 'group')).map(c => `
          <div class="admin-chat" data-id="${c.id}" data-t="${c.type}">
            <span class="chat-type-tag t-${c.type}">${c.type === 'channel' ? 'КАНАЛ' : 'ГРУППА'}</span>
            <div class="ac-info">
              <span class="au-name">${escapeHtml(c.name)}</span>
              ${c.handle ? `<span class="au-sub">@${escapeHtml(c.handle)}</span>` : ''}
            </div>
            <div class="au-actions">
              <button type="button" class="btn btn-ghost admin-members-chat">👥</button>
              <button type="button" class="btn btn-ghost admin-rename-chat">✎</button>
              <button type="button" class="btn btn-danger admin-del-chat" data-id="${c.id}" data-t="${c.type}">Удалить</button>
            </div>
            <div class="am-panel hidden"></div>
          </div>`).join('') : '<div class="empty-list">Каналов и групп пока нет</div>'}
      </div>
    </div>

    <div class="manage-section">
      <h4>Личные чаты</h4>
      <div class="admin-hint">Пары собеседников. Можно создать недостающие чаты между всеми аккаунтами или удалить лишние.</div>
      <button type="button" class="btn btn-primary" id="adminPrivAll">Создать чаты между всеми</button>
      <div class="admin-chats" style="margin-top:10px">
        ${privs.length ? privs.map(p => `
          <div class="admin-chat">
            <span class="chat-type-tag t-private">ЛИЧНЫЙ</span>
            <div class="ac-info">
              <span class="au-name">@${escapeHtml(p.owner)} ↔ @${escapeHtml(p.other)}</span>
            </div>
            <div class="au-actions">
              <button type="button" class="btn btn-danger admin-del-priv" data-a="${escapeHtml(p.owner)}" data-b="${escapeHtml(p.other)}">Удалить</button>
            </div>
          </div>`).join('') : '<div class="empty-list">Личных чатов пока нет</div>'}
      </div>
    </div>

    <div class="manage-section">
      <h4>Темы пользователей</h4>
      <div class="admin-hint">Выдайте пользователю любую тему, включая специальные</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <select class="admin-theme-select">
                ${ALL_THEMES.map(t => `<option value="${t.v}" ${(a.settings && a.settings.theme) === t.v ? 'selected' : ''}>${t.t}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Стикер-паки пользователей</h4>
      <div class="admin-hint">Можно удалить стикер-пак любого пользователя</div>
      ${accountsList().filter(u => (u.stickerPacks || []).length).map(u => u.stickerPacks.map(p => `
        <div class="admin-user">
          <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
          <div class="au-info">
            <div class="au-name">${escapeHtml(p.name)}</div>
            <div class="au-sub">@${escapeHtml(u.username)} · ${p.stickers.length} стик.</div>
            <div class="au-actions">
              <button type="button" class="btn btn-danger admin-del-pack" data-u="${escapeHtml(u.username)}" data-pk="${escapeHtml(p.id)}">Удалить пак</button>
            </div>
          </div>
        </div>`).join('')).join('') || '<div class="empty-list">Ни у кого нет стикер-паков</div>'}
    </div>

    <div class="manage-section">
      <h4>Дельфины пользователей</h4>
      <div class="admin-hint">Добавьте XP сильнейшему дельфину или обнулите всех дельфинов</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)} · макс. ур. ${dolphinsMaxLevelFor(a.username)}</div>
            <div class="au-actions">
              <button type="button" class="btn btn-primary admin-dolphin-xp">+500 XP</button>
              <button type="button" class="btn btn-danger admin-dolphin-reset">Сбросить</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Статистика пользователей</h4>
      <div class="admin-hint">Выдайте часы в статистику или обнулите учтённое время в мессенджере</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)} · время ${fmtDuration((a.stats && a.stats.seconds) || 0)}</div>
            <div class="au-actions">
              <input type="number" class="rename-input admin-add-hours-input" placeholder="Часы" min="0" max="99999" style="width:90px">
              <button type="button" class="btn btn-primary admin-add-hours">Добавить часы</button>
              <button type="button" class="btn btn-ghost admin-reset-stats">Сбросить время</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Сообщение от Nebula</h4>
      <div class="admin-hint">Отправьте сообщение от имени Nebula AI в ИИ-чат пользователя</div>
      <div class="nebula-all-row">
        <input type="text" class="rename-input" id="nebulaAllText" placeholder="Уведомление для всех пользователей..." maxlength="300">
        <button type="button" class="btn btn-primary" id="nebulaAllSend">Отправить всем</button>
      </div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} · @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <input type="text" class="rename-input admin-nebula-text" placeholder="Текст сообщения..." maxlength="300">
              <button type="button" class="btn btn-primary admin-nebula-send">Отправить</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Логи действий</h4>
      <div class="admin-hint">Последние ${Math.min(loadLog().length, 300)} из ${loadLog().length} записей</div>
      <div class="admin-logs">
        ${loadLog().length ? loadLog().map(l => `
          <div class="log-row">
            <span class="log-time">${fmtLogTime(l.t)}</span>
            <span class="log-user">@${escapeHtml(l.user)}</span>
            <span class="log-action">${escapeHtml(l.action)}</span>
          </div>`).join('') : '<div class="empty-list">Логи пусты</div>'}
      </div>
      ${loadLog().length ? '<button type="button" class="btn btn-danger admin-clear-logs" style="margin-top:10px">Очистить логи</button>' : ''}
    </div>`;

  body.querySelectorAll('.au-admin').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const admins = adminList();
      const has = admins.includes(u.username);
      saveAdminList(has ? admins.filter(x => x !== u.username) : [...admins, u.username].sort());
      addLog(currentUser.username, `${has ? 'Забран' : 'Выдан'} доступ к админ-панели — @${u.username}`);
      renderSettingsAdmin(body);
      openAdminPanel();
      toast(has ? 'Доступ забран' : 'Доступ выдан', '@' + u.username);
    });
  });
  body.querySelectorAll('.au-kick').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const was = (() => { try { return localStorage.getItem(SESSION_KEY) === u.username; } catch (e) { return false; } })();
      kickUser(u.username);
      addLog(currentUser.username, `Кикнут — @${u.username}`);
      toast('Кикнут', '@' + u.username + (was ? ' (был онлайн)' : ''));
    });
  });
  body.querySelectorAll('.au-ban').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      if (u.banned) {
        u.banned = false;
        u.banInfo = null;
        clearNotice(u.username);
        persistOther(u);
        addLog(currentUser.username, `Аккаунт @${u.username} разбанен`);
        renderSettingsAdmin(body);
        renderChatList();
        toast('Аккаунт разбанен', '@' + u.username);
        return;
      }
      adminBanPrompt(u, body);
    });
  });
  function adminBanPrompt(u, body) {
    const ov = document.createElement('div');
    ov.className = 'status-editor-overlay';
    ov.innerHTML = `
      <div class="modal-box stickers-modal">
        <h3>⛔ Блокировка @${escapeHtml(u.username)}</h3>
        <textarea id="banReason" rows="2" maxlength="120" placeholder="Причина блокировки..." style="width:100%;box-sizing:border-box;resize:none;border-radius:12px;padding:10px 12px;background:var(--bg-hover);border:1px solid var(--border);color:var(--text);font-size:14px;font-family:inherit"></textarea>
        <label class="bn-label">Длительность</label>
        <select id="banDur" class="admin-theme-select" style="width:100%">
          <option value="3600000">1 час</option>
          <option value="43200000">12 часов</option>
          <option value="86400000">1 день</option>
          <option value="259200000" selected>3 дня</option>
          <option value="604800000">7 дней</option>
          <option value="2592000000">30 дней</option>
          <option value="0">Навсегда</option>
        </select>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-primary" id="banDo">Заблокировать</button>
          <button class="btn" id="banNo">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#banNo').addEventListener('click', close);
    ov.querySelector('#banDo').addEventListener('click', () => {
      const reason = ov.querySelector('#banReason').value.trim();
      const dur = Number(ov.querySelector('#banDur').value);
      if (!reason) return toast('Ошибка', 'Укажите причину блокировки');
      const now = Date.now();
      const unbanAt = dur > 0 ? now + dur : null;
      u.banned = true;
      u.banInfo = { admin: currentUser.username, reason, bannedAt: now, unbanAt };
      persistOther(u);
      const notices = loadNotices();
      notices[u.username] = { type: 'ban', admin: currentUser.username, reason, bannedAt: now, unbanAt };
      saveNotices(notices);
      addLog(currentUser.username, `Аккаунт @${u.username} забанен (${unbanAt ? 'до ' + fmtNoticeDate(unbanAt) : 'навсегда'}): ${reason}`);
      kickUser(u.username);
      close();
      renderSettingsAdmin(body);
      renderChatList();
      toast('Аккаунт забанен', '@' + u.username);
    });
  }
  body.querySelectorAll('.badge-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      const u = accountByUsername(ch.closest('.admin-user').dataset.u);
      const b = ch.dataset.b;
      u.badges = u.badges || {};
      u.badges[b] = !u.badges[b];
      persistOther(u);
      if (currentUser.username === u.username) {
        currentUser.badges = currentUser.badges || {};
        currentUser.badges[b] = u.badges[b];
        persistCurrentUser();
      }
      addLog(currentUser.username, `Бейдж «${BADGE_LABELS[b]}» ${u.badges[b] ? 'выдан' : 'снят'} — @${u.username}`);
      renderSettingsAdmin(body);
      updateProfileHeader();
      renderChatList();
      renderChat();
      toast(u.badges[b] ? 'Бейдж выдан' : 'Бейдж снят', '@' + u.username);
    });
  });
  body.querySelectorAll('.badge-chip[data-sup]').forEach(ch => {
    ch.addEventListener('click', () => {
      const u = accountByUsername(ch.dataset.sup);
      if (!u) return;
      u.support = !u.support;
      persistOther(u);
      if (currentUser.username === u.username) {
        currentUser.support = u.support;
        persistCurrentUser();
      }
      addLog(currentUser.username, `Права тех поддержки ${u.support ? 'выданы' : 'сняты'} — @${u.username}`);
      renderSettingsAdmin(body);
      toast(u.support ? 'Права тех поддержки выданы' : 'Права тех поддержки сняты', '@' + u.username);
    });
  });
  body.querySelectorAll('.frame-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      const u = accountByUsername(ch.closest('.admin-user').dataset.u);
      const f = ch.dataset.f;
      u.frameOverride = u.frameOverride || [];
      const i = u.frameOverride.indexOf(f);
      if (i >= 0) u.frameOverride.splice(i, 1); else u.frameOverride.push(f);
      persistOther(u);
      if (currentUser.username === u.username) {
        currentUser.frameOverride = u.frameOverride.slice();
        persistCurrentUser();
        renderSettingsFrames(body.parentElement === $('#settingsBody') ? $('#settingsBody') : body);
        updateProfileHeader();
      }
      addLog(currentUser.username, `Рамка «${FRAMES.find(x => x.id === f).name}» ${i >= 0 ? 'снята' : 'выдана'} — @${u.username}`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast(i >= 0 ? 'Рамка снята' : 'Рамка выдана', '@' + u.username);
    });
  });
  body.querySelectorAll('.ae-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.admin-user');
      const oldU = row.dataset.u;
      const u = accountByUsername(oldU);
      if (!u) return;
      const nId = row.querySelector('.ae-id').value.trim();
      const nU = row.querySelector('.ae-username').value.trim().toLowerCase();
      const nE = row.querySelector('.ae-email').value.trim();
      const nB = row.querySelector('.ae-bio').value.trim();
      if (!nU) return toast('Ошибка', 'Юзернейм не может быть пустым');
      if (!/^[a-z0-9_]+$/.test(nU) || nU.length < 4) return toast('Ошибка', 'Юзернейм: 4-14 символов (a-z, 0-9, _)');
      if (nU.length > LIMITS.username) return toast('Ошибка', `Юзернейм максимум ${LIMITS.username} символов`);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nE)) return toast('Ошибка', 'Некорректная почта');
      if (!nId) return toast('Ошибка', 'ID не может быть пустым');
      if (nU !== oldU) {
        if (accountByUsername(nU)) return toast('Ошибка', 'Этот юзернейм уже занят');
        if (!adminRenameUser(oldU, nU)) return toast('Ошибка', 'Не удалось переименовать');
      }
      const acc2 = accountByUsername(nU);
      const d2 = loadAccounts();
      const emailTaken = Object.values(d2.users).some(x => x.username !== nU && x.email === nE);
      if (emailTaken) return toast('Ошибка', 'Эта почта уже используется');
      acc2.id = nId;
      acc2.email = nE;
      acc2.bio = nB;
      saveAccounts(d2);
      if (currentUser && currentUser.username === nU) { currentUser = acc2; persistCurrentUser(); updateProfileHeader(); }
      addLog(currentUser.username, `Обновил данные @${nU}: ID ${nId}${nB ? ', био' : ''}`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Данные обновлены', '@' + nU);
    });
  });
  body.querySelectorAll('.admin-rename .rename-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.admin-rename');
      const u = accountByUsername(row.dataset.u);
      const v = row.querySelector('.rename-input').value.trim();
      if (!u || !v) return;
      if (v.length > LIMITS.name) return toast('Ошибка', `Максимум ${LIMITS.name} символов`);
      u.name = v;
      persistOther(u);
      addLog(currentUser.username, `Никнейм изменён: @${u.username} → ${v}`);
      if (currentUser.username === u.username) { currentUser.name = v; updateProfileHeader(); ME.name = v; }
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Никнейм изменён', v);
    });
  });
  body.querySelectorAll('.admin-pw-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const v = btn.closest('.admin-user').querySelector('.admin-pw-input').value;
      if (!v) return toast('Ошибка', 'Введите новый пароль');
      if (v.length < 8 || v.length > LIMITS.password) return toast('Ошибка', `Пароль: 8-${LIMITS.password} символов`);
      u.password = v;
      persistOther(u);
      if (currentUser.username === u.username) { currentUser.password = v; persistCurrentUser(); }
      addLog(currentUser.username, `Сброшен пароль — @${u.username}`);
      renderSettingsAdmin(body);
      toast('Пароль изменён', '@' + u.username);
    });
  });
  const annSend = body.querySelector('#annSend');
  if (annSend) annSend.addEventListener('click', () => {
    const v = body.querySelector('#annText').value.trim();
    if (!v) return toast('Ошибка', 'Введите текст объявления');
    saveAnnouncement({ text: v, by: currentUser.username, t: Date.now() });
    addLog(currentUser.username, `Сделал объявление: "${shortText(v, 45)}"`);
    renderSettingsAdmin(body);
    toast('Объявление отправлено', 'Пользователи увидят его при входе');
  });
  const annClear = body.querySelector('#annClear');
  if (annClear) annClear.addEventListener('click', () => {
    saveAnnouncement(null);
    addLog(currentUser.username, 'Снял объявление');
    renderSettingsAdmin(body);
    toast('Объявление снято');
  });
  const newsSend = body.querySelector('#newsSend');
  if (newsSend) newsSend.addEventListener('click', () => {
    const v = body.querySelector('#newsText').value.trim();
    if (!v) return toast('Ошибка', 'Введите текст уведомления');
    if (v.length > 300) return toast('Ошибка', 'Максимум 300 символов');
    let posted = 0;
    accountsList().filter(a => !a.isBot).forEach(u => {
      const st = getStateFor(u.username);
      if (!st) return;
      const chat = st.chats.find(c => c.id === NEWS_CHAT_ID);
      if (!chat) return;
      chat.messages.push({ id: 'm' + Date.now() + Math.random(), from: currentUser.username, text: v, time: new Date().toISOString(), read: false });
      if (chat.id !== st.currentChatId) chat.unread = (chat.unread || 0) + 1;
      posted++;
      saveStateFor(u.username, st);
    });
    addLog(currentUser.username, `Опубликовано в Nebula News: "${shortText(v, 45)}"`);
    renderSettingsAdmin(body);
    renderChat();
    renderChatList();
    toast('Опубликовано в Nebula News', posted ? `${posted} пользователей увидят` : 'Никто не подписан');
  });

  body.querySelectorAll('.au-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      if (!u) return;
      if (u.username === currentUser.username) return toast('Нельзя', 'Нельзя удалить собственный аккаунт');
      adminDeletePrompt(u, body);
    });
  });
  function adminDeletePrompt(u, body) {
    const ov = document.createElement('div');
    ov.className = 'status-editor-overlay';
    ov.innerHTML = `
      <div class="modal-box stickers-modal">
        <h3>⛔ Удаление аккаунта @${escapeHtml(u.username)}</h3>
        <div class="admin-hint" style="margin-top:2px">Личные чаты будут удалены, из групп он будет исключён. Это действие нельзя отменить.</div>
        <textarea id="delReason" rows="2" maxlength="120" placeholder="Причина удаления..." style="width:100%;box-sizing:border-box;resize:none;border-radius:12px;padding:10px 12px;background:var(--bg-hover);border:1px solid var(--border);color:var(--text);font-size:14px;font-family:inherit"></textarea>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-danger" id="delDo">Удалить аккаунт</button>
          <button class="btn" id="delNo">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#delNo').addEventListener('click', close);
    ov.querySelector('#delDo').addEventListener('click', () => {
      const reason = ov.querySelector('#delReason').value.trim() || '—';
      const now = Date.now();
      const notices = loadNotices();
      notices[u.username] = { type: 'delete', admin: currentUser.username, reason, bannedAt: now, unbanAt: null };
      saveNotices(notices);
      kickUser(u.username);
      deleteAccountEverywhere(u.username);
      addLog(currentUser.username, `Аккаунт удалён — @${u.username} (ID ${u.id}): ${reason}`);
      close();
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Аккаунт удалён', '@' + u.username);
    });
  }

  const privAll = body.querySelector('#adminPrivAll');
  if (privAll) privAll.addEventListener('click', () => {
    const humans = accountsList().filter(a => !a.isBot);
    let made = 0;
    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) {
        if (privateChatExistsEverywhere(humans[i].username, humans[j].username)) continue;
        createPrivateChatsEverywhere(humans[i].username, humans[j].username);
        made++;
      }
    }
    addLog(currentUser.username, `Создал личные чаты между всеми (новых: ${made})`);
    renderSettingsAdmin(body);
    renderChatList();
    toast(made ? `Создано новых чатов: ${made}` : 'Все личные чаты уже существуют');
  });
  body.querySelectorAll('.admin-del-priv').forEach(btn => btn.addEventListener('click', () => {
    const a = btn.dataset.a, b = btn.dataset.b;
    if (!confirm(`Удалить личный чат @${a} ↔ @${b} у всех пользователей?`)) return;
    deletePrivateChatEverywhere(a, b);
    addLog(currentUser.username, `Удалил личный чат @${a} ↔ @${b}`);
    renderSettingsAdmin(body);
    renderChatList();
    renderChat();
    toast('Чат удалён', '@' + a + ' ↔ @' + b);
  }));
  body.querySelectorAll('.admin-del-pack').forEach(btn => btn.addEventListener('click', () => {
    const u = accountByUsername(btn.dataset.u);
    if (!u) return;
    const p = (u.stickerPacks || []).find(x => x.id === btn.dataset.pk);
    if (!p) return;
    if (!confirm(`Удалить стикер-пак «${p.name}» у @${u.username}?`)) return;
    u.stickerPacks = u.stickerPacks.filter(x => x.id !== btn.dataset.pk);
    persistOther(u);
    addLog(currentUser.username, `Удалил стикер-пак «${p.name}» у @${u.username}`);
    renderSettingsAdmin(body);
    toast('Пак удалён', p.name);
  }));
  body.querySelectorAll('.admin-theme-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const u = accountByUsername(sel.closest('.admin-user').dataset.u);
      u.settings = u.settings || {};
      u.settings.theme = sel.value;
      persistOther(u);
      addLog(currentUser.username, `Тема «${(ALL_THEMES.find(t => t.v === sel.value) || {}).t}» — @${u.username}`);
      if (currentUser.username === u.username) {
        currentUser.settings = currentUser.settings || {};
        currentUser.settings.theme = sel.value;
        persistCurrentUser();
        applyTheme(sel.value);
      }
      toast('Тема назначена', '@' + u.username);
    });
  });
  body.querySelectorAll('.admin-dolphin-xp').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const st = getStateFor(u.username);
      const store = loadDolphins();
      let bestId = null, bestXp = -1;
      if (st && st.chats) st.chats.forEach(c => {
        const k = dolphinKeyFor(c, u.username);
        const d = store[k];
        if (d && d.xp > bestXp) { bestXp = d.xp; bestId = k; }
      });
      if (!bestId) return toast('Ошибка', 'У @' + u.username + ' нет дельфинов');
      store[bestId].xp = (store[bestId].xp || 0) + 500;
      saveDolphins(store);
      addLog(currentUser.username, `Дельфину @${u.username} начислено +500 XP`);
      renderSettingsAdmin(body);
      toast('+500 XP дельфину', '@' + u.username);
    });
  });
  body.querySelectorAll('.admin-dolphin-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      if (!confirm(`Сбросить всех дельфинов @${u.username}?`)) return;
      const st = getStateFor(u.username);
      const store = loadDolphins();
      if (st && st.chats) st.chats.forEach(c => { const k = dolphinKeyFor(c, u.username); if (store[k]) store[k].xp = 0; });
      saveDolphins(store);
      addLog(currentUser.username, `Дельфины @${u.username} сброшены`);
      renderSettingsAdmin(body);
      toast('Дельфины сброшены', '@' + u.username);
    });
  });
  body.querySelectorAll('.admin-add-hours').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const inp = btn.closest('.admin-user').querySelector('.admin-add-hours-input');
      const h = parseInt(inp.value, 10);
      if (isNaN(h) || h <= 0) return toast('Ошибка', 'Введите количество часов');
      if (h > 99999) return toast('Ошибка', 'Максимум 99999 часов за раз');
      const d = loadAccounts();
      const acc = d.users[u.username];
      if (!acc) return toast('Ошибка', 'Пользователь не найден');
      acc.stats = acc.stats || {};
      acc.stats.seconds = (acc.stats.seconds || 0) + h * 3600;
      saveAccounts(d);
      if (currentUser.username === u.username) {
        currentUser.stats = acc.stats;
        persistCurrentUser();
      }
      addLog(currentUser.username, `Выдано ${h} ч. статистики — @${u.username} (итого ${fmtDuration(acc.stats.seconds)})`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Часы выданы', `@${u.username} +${h} ч.`);
    });
  });
  body.querySelectorAll('.admin-reset-stats').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      u.stats = u.stats || {};
      u.stats.seconds = 0;
      persistOther(u);
      addLog(currentUser.username, `Статистика @${u.username} сброшена`);
      if (currentUser.username === u.username) persistCurrentUser();
      renderSettingsAdmin(body);
      toast('Статистика сброшена', '@' + u.username);
    });
  });
  const nebulaAllSend = body.querySelector('#nebulaAllSend');
  if (nebulaAllSend) nebulaAllSend.addEventListener('click', () => {
    const v = body.querySelector('#nebulaAllText').value.trim();
    if (!v) return toast('Ошибка', 'Введите текст уведомления');
    const d = loadAccounts();
    let sent = 0;
    Object.values(d.users || {}).forEach(u => {
      if (u.isBot) return;
      const st = getStateFor(u.username) || { chats: [] };
      let chat = st.chats.find(c => c.id === AI_CHAT_ID);
      if (!chat) {
        chat = { id: AI_CHAT_ID, type: 'ai', name: 'Nebula AI', members: ['me'], messages: [] };
        st.chats.push(chat);
      }
      chat.messages.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), from: 'nebula', text: v, read: false });
      if (chat.id !== st.currentChatId) chat.unread = (chat.unread || 0) + 1;
      saveStateFor(u.username, st);
      sent++;
    });
    addLog(currentUser.username, `Уведомление от Nebula отправлено всем: "${shortText(v, 45)}"`);
    renderSettingsAdmin(body);
    toast('Отправлено всем', sent + ' пользователям');
  });
  body.querySelectorAll('.admin-nebula-send').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const v = btn.closest('.admin-user').querySelector('.admin-nebula-text').value.trim();
      if (!v) return toast('Ошибка', 'Введите текст сообщения');
      const st = getStateFor(u.username) || { chats: [] };
      let chat = st.chats.find(c => c.id === AI_CHAT_ID);
      if (!chat) {
        chat = { id: AI_CHAT_ID, type: 'ai', name: 'Nebula AI', members: ['me'], messages: [] };
        st.chats.push(chat);
      }
      chat.messages.push({ id: 'm' + Date.now(), from: 'nebula', text: v, read: false });
      saveStateFor(u.username, st);
      addLog(currentUser.username, `Сообщение от Nebula → @${u.username}: "${shortText(v, 45)}"`);
      renderSettingsAdmin(body);
      toast('Отправлено', '@' + u.username);
    });
  });
  const clearLogs = body.querySelector('.admin-clear-logs');
  if (clearLogs) clearLogs.addEventListener('click', () => {
    if (!confirm('Очистить все логи действий?')) return;
    saveLog([]);
    addLog(currentUser.username, 'Логи действий очищены');
    renderSettingsAdmin(body);
    toast('Логи очищены');
  });
  body.querySelectorAll('.admin-del-chat').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const t = btn.dataset.t === 'channel' ? 'канал' : 'группу';
      const name = btn.closest('.admin-chat').querySelector('.au-name').textContent;
      if (!confirm(`Удалить ${btn.dataset.t === 'channel' ? 'канал' : 'группу'} «${name}» у всех пользователей?`)) return;
      deleteChatEverywhere(id);
      addLog(currentUser.username, `Удалена ${t} «${name}» (${id})`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Удалено', name);
    });
  });
  const chatSearch = body.querySelector('.admin-chat-search');
  if (chatSearch) chatSearch.addEventListener('input', () => {
    const q = chatSearch.value.trim().toLowerCase().replace(/^@/, '');
    body.querySelectorAll('.admin-chat').forEach(row => {
      const ch = uniqueChatsAcrossUsers().find(c => c.id === row.dataset.id);
      if (!ch) { row.classList.toggle('hidden', !!q); return; }
      const byName = ch.name.toLowerCase().includes(q);
      const byHandle = !!ch.handle && ch.handle.includes(q);
      const byType = (ch.type === 'channel' ? 'канал' : 'группа').startsWith(q) || (ch.type === 'channel' ? 'каналов' : 'групп').startsWith(q);
      row.classList.toggle('hidden', !(!q || byName || byHandle || byType));
    });
    const box = body.querySelector('.admin-chats');
    if (box) {
      const rows = box.querySelectorAll('.admin-chat');
      box.classList.toggle('hidden', !!rows.length && !q ? false : rows.length > 0 && [...rows].every(r => r.classList.contains('hidden')));
    }
  });
  body.querySelectorAll('.admin-members-chat').forEach(btn => btn.addEventListener('click', () => {
    const row = btn.closest('.admin-chat');
    const panel = row.querySelector('.am-panel');
    const ch = adminChatCanonical(row.dataset.id);
    if (!ch) return;
    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    renderAdminMembersPanel(panel, ch);
  }));
  body.querySelectorAll('.admin-rename-chat').forEach(btn => btn.addEventListener('click', () => {
    const row = btn.closest('.admin-chat');
    const id = row.dataset.id;
    const isChannel = row.dataset.t === 'channel';
    const ch = uniqueChatsAcrossUsers().find(c => c.id === id);
    if (!ch) return;
    const info = row.querySelector('.ac-info');
    info.innerHTML = `
      <input type="text" class="rename-input ac-name-in" value="${escapeHtml(ch.name)}" maxlength="${LIMITS.name}" placeholder="Название">
      ${isChannel ? `<input type="text" class="rename-input ac-handle-in" value="${escapeHtml(ch.handle || '')}" maxlength="14" placeholder="@юзернейм канала" style="margin-top:4px">` : ''}
      <div style="display:flex;gap:6px;margin-top:6px">
        <button type="button" class="btn btn-primary ac-save">Сохранить</button>
        <button type="button" class="btn btn-ghost ac-cancel">Отмена</button>
      </div>`;
    info.querySelector('.ac-save').addEventListener('click', () => {
      const name = info.querySelector('.ac-name-in').value.trim();
      if (!name) return toast('Ошибка', 'Введите название');
      if (name.length > LIMITS.name) return toast('Ошибка', `Название — максимум ${LIMITS.name} символов`);
      let handle = null;
      if (isChannel) {
        const h = info.querySelector('.ac-handle-in').value.trim().replace(/^@/, '').toLowerCase();
        if (h) {
          if (!/^[a-z0-9_]{3,14}$/.test(h)) return toast('Ошибка', 'Юзернейм канала: 3-14 символов (a-z, 0-9, _)');
          if (channelHandleTaken(h, id)) return toast('Ошибка', 'Этот юзернейм канала уже занят');
          handle = h;
        }
      }
      renameChatEverywhere(id, name, handle, isChannel);
      addLog(currentUser.username, `Переименовал ${isChannel ? 'канал' : 'группу'} «${name}» (${id})`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Сохранено', name);
    });
    info.querySelector('.ac-cancel').addEventListener('click', () => renderSettingsAdmin(body));
  }));
  const userSearch = body.querySelector('.admin-user-search');
  if (userSearch) userSearch.addEventListener('input', () => {
    const q = userSearch.value.trim().toLowerCase().replace(/^@/, '');
    body.querySelectorAll('.admin-user, .admin-rename').forEach(row => {
      const u = row.dataset.u;
      if (!u) return;
      const acc = accountByUsername(u);
      if (!acc) { row.classList.toggle('hidden', !!q); return; }
      const byId = String(acc.id).startsWith(q);
      const byUser = acc.username.startsWith(q);
      const byName = q && acc.name.toLowerCase().includes(q);
      row.classList.toggle('hidden', !(!q || byId || byUser || byName));
    });
    body.querySelectorAll('#adminBody .manage-section').forEach(sec => {
      const rows = sec.querySelectorAll('.admin-user, .admin-rename');
      if (!rows.length) return;
      sec.classList.toggle('hidden', [...rows].every(r => r.classList.contains('hidden')));
    });
  });
}

function renderSettingsAppearance(body) {
  const u = currentUser;
  const canSpecial = canUseSpecialThemes(u);
  const themes = canSpecial ? ALL_THEMES : ALL_THEMES.slice(0, BASE_THEME_COUNT);
  const cur = u.settings.theme || 'default';
  body.innerHTML = `
    <div class="manage-section">
      <h4>Тема оформления</h4>
      ${canSpecial ? '<div class="admin-hint" style="margin-bottom:10px">⭐ Вам доступны специальные темы тестеров и администраторов</div>' : '<div class="admin-hint" style="margin-bottom:10px">Специальные темы открываются тестерам и администраторам</div>'}
      <div class="radio-group" id="themeGroup">
        ${themes.map(t => `<div class="radio-item ${cur === t.v ? 'selected' : ''}" data-v="${t.v}">
          <span class="radio-circle" style="${t.v !== 'default' && t.v !== 'black' && t.v !== 'light' ? 'background:linear-gradient(135deg,' + themePreview(t.v) + ');box-shadow:0 0 10px rgba(255,255,255,.25);' : ''}"></span>
          <div><span class="ri-label">${t.t}</span><span class="ri-hint">${t.d}</span></div>
        </div>`).join('')}
      </div>
    </div>
    <div class="manage-section">
      <h4>Размер курсора</h4>
      <div class="admin-hint" style="margin-bottom:10px">Настройте размер кастомного курсора мессенджера</div>
      <div class="radio-group" id="cursorGroup">
        ${[['s', 'Маленький'], ['m', 'Средний'], ['l', 'Большой']].map(o => `
          <div class="radio-item ${(u.settings.cursorSize || 'm') === o[0] ? 'selected' : ''}" data-v="${o[0]}">
            <span class="radio-circle"></span>
            <div><span class="ri-label">${o[1]}</span></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="manage-section">
      <h4>Свечение курсора</h4>
      <div class="admin-hint" style="margin-bottom:10px">Насколько сильно курсор светится — от слабого до очень сильного</div>
      <input type="range" id="cursorGlow" min="0" max="600" step="5" value="${Math.round((u.settings.cursorGlow !== undefined ? u.settings.cursorGlow : 0.45) * 100)}" style="width:100%">
      <div class="admin-hint" style="margin-top:6px;text-align:center">Слабое <span id="cursorGlowVal" style="font-weight:700;color:var(--accent-hover)">${Math.round((u.settings.cursorGlow !== undefined ? u.settings.cursorGlow : 0.45) * 100)}%</span> · Очень сильное (до 600%)</div>
    </div>
    <div class="manage-section">
      <h4>Цвет курсора (RGB)</h4>
      <div class="admin-hint" style="margin-bottom:8px">Цвет самой точки курсора</div>
      ${rgbSlider('cc', u.settings.cursorColor || [255, 255, 255])}
    </div>
    <div class="manage-section">
      <h4>Цвет свечения (RGB)</h4>
      <div class="admin-hint" style="margin-bottom:8px">Цвет ореола вокруг курсора</div>
      ${rgbSlider('cg', u.settings.glowColor || [255, 255, 255])}
    </div>`;
  body.querySelectorAll('#themeGroup .radio-item').forEach(item => item.addEventListener('click', () => {
    u.settings.theme = item.dataset.v;
    persistCurrentUser();
    applyTheme(u.settings.theme);
    body.querySelectorAll('#themeGroup .radio-item').forEach(r => r.classList.toggle('selected', r === item));
    toast('Тема обновлена');
  }));
  body.querySelectorAll('#cursorGroup .radio-item').forEach(item => item.addEventListener('click', () => {
    u.settings.cursorSize = item.dataset.v;
    persistCurrentUser();
    applyCursorSize(u.settings.cursorSize);
    body.querySelectorAll('#cursorGroup .radio-item').forEach(r => r.classList.toggle('selected', r === item));
    toast('Размер курсора обновлён');
  }));
  const gl = body.querySelector('#cursorGlow');
  if (gl) gl.addEventListener('input', () => {
    const v = (+gl.value) / 100;
    u.settings.cursorGlow = v;
    persistCurrentUser();
    applyCursorGlow(v);
    const val = body.querySelector('#cursorGlowVal');
    if (val) val.textContent = gl.value + '%';
  });
  const bindRgb = (prefix, store) => {
    const r = body.querySelector('#' + prefix + 'R');
    const g = body.querySelector('#' + prefix + 'G');
    const b = body.querySelector('#' + prefix + 'B');
    const prev = body.querySelector('#' + prefix + 'Prev');
    const arr = u.settings[store] || [255, 255, 255];
    const upd = () => {
      arr[0] = +r.value; arr[1] = +g.value; arr[2] = +b.value;
      u.settings[store] = arr;
      if (prev) prev.style.background = `rgb(${arr[0]},${arr[1]},${arr[2]})`;
      persistCurrentUser();
      if (store === 'cursorColor') applyCursorColors(arr, null);
      else applyCursorColors(null, arr);
    };
    [r, g, b].forEach((inp, i) => inp.addEventListener('input', upd));
    if (prev) prev.style.background = `rgb(${arr[0]},${arr[1]},${arr[2]})`;
  };
  bindRgb('cc', 'cursorColor');
  bindRgb('cg', 'glowColor');
}
function rgbSlider(prefix, arr) {
  const n = (i) => Math.max(0, Math.min(255, Math.round(arr[i] || 0)));
  const labels = [['R', '255,60,60'], ['G', '60,255,60'], ['B', '60,120,255']];
  return `
    <div class="rgb-row">
      ${labels.map((l, i) => `
        <label class="rgb-item">
          <span class="rgb-name" style="color:rgb(${l[1]})">${l[0]}</span>
          <input type="range" id="${prefix}${l[0]}" min="0" max="255" step="1" value="${n(i)}">
        </label>`).join('')}
    </div>
    <div class="rgb-preview-row">
      <span class="rgb-prev" id="${prefix}Prev"></span>
      <span class="rgb-hex" id="${prefix}Hex"></span>
    </div>`;
}
function themePreview(v) {
  const map = {
    tgreen: '#2ecc71,#27ae60',
    lgreen: '#9bff57,#2ecc71',
    ppink: '#e84393,#8e44ad',
    dred: '#8e1e1e,#c0392b',
    red: '#ff6b5e,#e74c3c',
    brown: '#e67e22,#a0522d',
    blue: '#3498db,#2980b9',
  };
  return map[v] || '#6C5CE7,#8E7BFF';
}

function renderSettingsFrames(body) {
  const u = currentUser;
  const unlocked = frameUnlockedMap(u);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Рамки аватара</h4>
      <div class="frame-note" style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">
        Рамки открываются за достижения и время в мессенджере. Выберите одну из доступных.
      </div>
      ${FRAMES.map(f => {
        const isUnlocked = unlocked[f.id];
        const isSelected = (u.settings.frame === f.id) || (!u.settings.frame && selectedFrameClass(u) === f.id);
        const lockedReason = !isUnlocked ? `<div style="font-size:11.5px;color:var(--danger);margin-top:2px">🔒 ${lockedHint(f, u)}</div>` : '';
        return `
        <div class="frame-item ${isSelected && isUnlocked ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}" data-f="${f.id}">
          ${avatarHtml(u, 'fs', isUnlocked ? f.id : '')}
          <div class="fi-info">
            <div class="fi-name">${f.emoji} ${f.name}</div>
            <div class="fi-desc">${f.desc}</div>
            ${lockedReason}
          </div>
          ${isUnlocked ? `<span class="tag ${isSelected ? 'you' : 'admin'}">${isSelected ? 'выбрана' : 'выбрать'}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;

  body.querySelectorAll('.frame-item').forEach(item => item.addEventListener('click', () => {
    const f = item.dataset.f;
    if (!unlocked[f]) return toast('Рамка закрыта', 'Выполните условие, чтобы открыть её');
    u.settings.frame = f;
    persistCurrentUser();
    renderSettings('frames');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('Рамка применена', FRAMES.find(x => x.id === f).name);
  }));
}
function lockedHint(f, u) {
  if (f.id === 'crown' || f.id === 'vip' || f.id === 'nebula') return `Нужно быть администратором мессенджера`;
  if (f.id === 'admin') return `Нужно быть администратором мессенджера`;
  if (f.id === 'old') return `Нужно быть среди первых 10 пользователей (сейчас ID ${u.id})`;
  if (f.id === 'dolphin') return `Нужен дельфин 100+ уровня`;
  if (f.id === 'tester') return `Нужно быть тестером или администратором`;
  return `Нужно провести ${f.name} в мессенджере`;
}

function renderSettingsDolphins(body) {
  const chats = state.chats.slice().filter(c => c.type !== 'channel');
  body.innerHTML = `
    <div class="manage-section">
      <h4>Ваши дельфины 🐬</h4>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">
        В каждом чате живёт свой дельфин. Заботьтесь о нём — кормите, играйте и гладьте. Максимум — 1000 уровень.
      </div>
      ${chats.length ? chats.map(c => {
        const d = dolphinFor(dolphinKeyFor(c), c);
        const lvl = dolphinLevel(d);
        const pct = (d.xp || 0) % XP_PER_LEVEL;
        return `<div class="member-chip">
          <span style="font-size:26px">🐬</span>
          <div class="mc-name">${escapeHtml(chatTitle(c))}</div>
          <div style="flex:1;min-width:80px;max-width:160px"><div class="xp-bar" style="margin:0"><div class="xp-fill" style="width:${pct}%"></div></div></div>
          <div style="font-weight:700;color:#00CEC9;font-size:13px">ур. ${lvl} · ${dolphinStage(lvl)}</div>
        </div>`;
      }).join('') : '<div class="empty-list">Создайте чат, чтобы завести дельфина</div>'}
    </div>`;
}

function updateStatsUI() {
  if (!currentUser) return;
  const t = $('#statTime'), t2 = $('#statTimeMs');
  if (t) t.textContent = fmtDuration(currentUser.stats.seconds);
  if (t2) t2.textContent = currentUser.stats.seconds;
}

function fmtDuration(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderSettingsStats(body) {
  const u = currentUser;
  const myMsgs = state.chats.reduce((n, c) => n + c.messages.filter(m => m.from === 'me').length, 0);
  const dolphinMax = Math.max(0, ...state.chats.map(c => dolphinLevel(dolphinFor(dolphinKeyFor(c), c))));
  body.innerHTML = `
    <div class="manage-section">
      <h4>Статистика</h4>
      <div class="stat-grid">
        <div class="stat-card wide">
          <div class="sc-num" id="statTime">${fmtDuration(u.stats.seconds)}</div>
          <div class="sc-label">Время в мессенджере</div>
        </div>
        <div class="stat-card"><div class="sc-num">${u.stats.seconds}</div><div class="sc-label">секунд</div></div>
        <div class="stat-card"><div class="sc-num">${hoursInApp(u)}</div><div class="sc-label">часов</div></div>
        <div class="stat-card"><div class="sc-num">${myMsgs}</div><div class="sc-label">сообщений отправлено</div></div>
        <div class="stat-card"><div class="sc-num">${state.chats.length}</div><div class="sc-label">чатов</div></div>
        <div class="stat-card"><div class="sc-num">${dolphinMax}</div><div class="sc-label">макс. уровень дельфина</div></div>
        <div class="stat-card"><div class="sc-num">${new Date(u.created).toLocaleDateString('ru-RU')}</div><div class="sc-label">аккаунт создан</div></div>
      </div>
    </div>`;
}

function bindSettings() {
  $$('#settingsTabs .st').forEach(b => b.addEventListener('click', () => {
    $$('#settingsTabs .st').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderSettings(b.dataset.tab);
  }));
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsModal').addEventListener('click', (e) => { if (e.target === $('#settingsModal')) closeSettings(); });
  $('#switchClose').addEventListener('click', closeSwitchMenu);
  $('#switchModal').addEventListener('click', (e) => { if (e.target === $('#switchModal')) closeSwitchMenu(); });
  $('#profileBtn').addEventListener('click', () => openSettings('profile'));
}

/* ============================================================
   SWITCH ACCOUNT
   ============================================================ */
function openSwitchMenu() {
  const body = $('#switchBody');
  const meU = currentUser ? currentUser.username : null;
  const owned = ownedAccounts();
  const accs = accountsList().filter(a => !a.isBot && (owned.includes(a.username) || a.username === meU)).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  body.innerHTML = `
    <div class="switch-list">
      ${accs.map(a => `
        <button type="button" class="switch-item ${a.username === currentUser.username ? 'current' : ''}" data-u="${a.username}">
          <span class="avatar ${selectedFrameClass(a) ? 'framed frame-' + selectedFrameClass(a) : ''}" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <span class="switch-info">
            <span class="switch-name">${displayName(a)} <span class="switch-tag">ID ${a.id}</span></span>
            <span class="switch-sub">@${escapeHtml(a.username)}${a.username === currentUser.username ? ' · сейчас' : ''}</span>
          </span>
        </button>`).join('')}
    </div>
    <button type="button" class="switch-add" id="switchAdd">
      <span class="switch-add-icon">+</span>
      <span>Добавить аккаунт</span>
    </button>`;
  body.querySelectorAll('.switch-item').forEach(it => it.addEventListener('click', () => {
    const acc = accountByUsername(it.dataset.u);
    if (acc) {
      if (currentUser && currentUser.username !== acc.username) markOffline(currentUser.username);
      closeSwitchMenu();
      startApp(acc);
    }
  }));
  $('#switchAdd').addEventListener('click', () => {
    closeSwitchMenu();
    if (currentUser) markOffline(currentUser.username);
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    clearInterval(onlineTimer);
    $('#authForm').reset();
    showAuth('register');
    $('#authOverlay').classList.add('open');
    renderChatList();
    renderChat();
  });
  $('#switchModal').classList.add('open');
}

function closeSwitchMenu() { $('#switchModal').classList.remove('open'); }

/* ============================================================
   VERIFY MODAL (переиспользуемый)
   ============================================================ */
let modalVerify = null; // { code, sentAt, email, onSuccess }
let modalTimerInt = null;

function openVerifyModal(ctx) {
  $('#verifyTitle').textContent = ctx.title;
  $('#verifyDesc').innerHTML = ctx.desc;
  modalVerify = { email: ctx.email, onSuccess: ctx.onSuccess, code: null, sentAt: 0 };
  $('#verifyModal').classList.add('open');
  bindCodeInputs($('#verifyCodeInputs'));
  clearCode($('#verifyCodeInputs'));
  clearAuthError($('#verifyError'));
  $('#verifySubmit').disabled = false;
  sendModalCode();
}
function closeVerifyModal() {
  $('#verifyModal').classList.remove('open');
  clearInterval($('#verifyTimer')._t);
  modalVerify = null;
}
function sendModalCode() {
  modalVerify.code = genCode();
  modalVerify.sentAt = Date.now();
  const box = $('#verifyDemoCode');
  box.classList.add('hidden');
  if (demoMode) {
    box.innerHTML = demoCodeHtml(modalVerify.code, 'Демо-режим: ваш код подтверждения:');
    box.classList.remove('hidden');
    bindDemoCopy(box);
  }
  clearAuthError($('#verifyError'));
  clearCode($('#verifyCodeInputs'));
  startCodeTimer($('#verifyTimer'), modalVerify.sentAt, () => {
    modalVerify.code = null;
    showAuthError($('#verifyError'), 'Код истёк. Запросите код повторно.');
    $('#verifySubmit').disabled = true;
  });
  const btn = $('#verifySubmit');
  const resend = $('#verifyResend');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }
  if (resend) resend.disabled = true;
  sendCodeToEmail(modalVerify.email, modalVerify.code, 'Код подтверждения Nebula Messenger').then((r) => {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
    if (resend) resend.disabled = false;
    if (r.demo) {
      box.innerHTML = demoCodeHtml(modalVerify.code, 'Демо-режим: ваш код подтверждения:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
    } else if (r.ok) {
      showAuthError($('#verifyError'), 'Код отправлен на ' + modalVerify.email);
    } else {
      box.innerHTML = demoCodeHtml(modalVerify.code, 'Письмо не доставлено (' + (r.err || 'ошибка') + ') — вот ваш код:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
      showAuthError($('#verifyError'), 'Код не дошёл до почты, но показан на экране');
    }
  });
}
function bindVerifyModal() {
  $('#verifyClose').addEventListener('click', closeVerifyModal);
  $('#verifyModal').addEventListener('click', (e) => { if (e.target === $('#verifyModal')) closeVerifyModal(); });
  const demoToggle = $('#verifyDemoToggle');
  if (demoToggle) {
    demoToggle.checked = demoMode;
    demoToggle.addEventListener('change', () => {
      setDemoMode(demoToggle.checked);
      const box = $('#verifyDemoCode');
      if (!box) return;
      if (demoToggle.checked && modalVerify && modalVerify.code) {
        box.innerHTML = demoCodeHtml(modalVerify.code, 'Демо-режим: ваш код подтверждения:');
        box.classList.remove('hidden');
        bindDemoCopy(box);
      } else if (!demoToggle.checked) {
        box.classList.add('hidden');
      }
    });
  }
  $('#verifyResend').addEventListener('click', () => {
    if (!modalVerify) return;
    $('#verifySubmit').disabled = false;
    sendModalCode();
    toast('Код отправлен повторно', modalVerify.email, 2000);
  });
  $('#verifySubmit').addEventListener('click', () => {
    const code = codeValue($('#verifyCodeInputs'));
    if (!modalVerify) return;
    if (!modalVerify.code) return showAuthError($('#verifyError'), 'Код истёк. Запросите код повторно.');
    if (code.length !== 6) return showAuthError($('#verifyError'), 'Введите 6-значный код');
    if (code !== modalVerify.code) {
      showAuthError($('#verifyError'), 'Неверный код');
      clearCode($('#verifyCodeInputs'));
      return;
    }
    const cb = modalVerify.onSuccess;
    closeVerifyModal();
    cb();
  });
}

/* ============================================================
   АВАТАР
   ============================================================ */
let avatarSel = 0;
let avatarUpload = null;
function openAvatarModal() {
  avatarSel = currentUser.avatar && currentUser.avatar.type === 'preset' ? currentUser.avatar.index : -1;
  avatarUpload = null;
  renderAvatarModal();
  $('#avatarModal').classList.add('open');
}
function renderAvatarModal() {
  const grid = $('#avatarGrid');
  grid.innerHTML = PRESET_AVATARS.map((p, i) =>
    `<div class="avatar-opt ${avatarSel === i && !avatarUpload ? 'selected' : ''}" data-i="${i}" style="background:linear-gradient(135deg,${p.c1},${p.c2})">
      ${p.g}
      ${avatarSel === i && !avatarUpload ? `<span class="a-check">${CHECK_ICON}</span>` : ''}
    </div>`
  ).join('');
  grid.querySelectorAll('.avatar-opt').forEach(o => o.addEventListener('click', () => {
    avatarSel = +o.dataset.i;
    avatarUpload = null;
    renderAvatarModal();
    updateAvatarPreview();
  }));

  const file = $('#avatarFile');
  file.onchange = () => {
    const f = file.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Ошибка', 'Можно загрузить только изображение');
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarUpload = e.target.result;
      renderAvatarModal();
      updateAvatarPreview();
    };
    reader.readAsDataURL(f);
  };
  updateAvatarPreview();
}
function updateAvatarPreview() {
  const p = $('#avatarPreview');
  if (avatarUpload) {
    p.innerHTML = `<img src="${avatarUpload}">`;
    p.style.background = 'none';
  } else if (avatarSel >= 0) {
    const pr = PRESET_AVATARS[avatarSel];
    p.innerHTML = pr.g;
    p.style.background = `linear-gradient(135deg,${pr.c1},${pr.c2})`;
  } else {
    p.innerHTML = '❔';
    p.style.background = 'rgba(255,255,255,.08)';
  }
}
function bindAvatarModal() {
  $('#avatarClose').addEventListener('click', closeAvatarModal);
  $('#avatarModal').addEventListener('click', (e) => { if (e.target === $('#avatarModal')) closeAvatarModal(); });
}
function closeAvatarModal() {
  $('#avatarModal').classList.remove('open');
  if (avatarUpload) {
    currentUser.avatar = { type: 'upload', dataUrl: avatarUpload };
    persistCurrentUser();
  } else if (avatarSel >= 0) {
    currentUser.avatar = { type: 'preset', index: avatarSel };
    persistCurrentUser();
  }
  updateProfileHeader();
  renderChatList();
  renderChat();
  renderSettings('profile');
  toast('Аватар обновлён');
}

/* ============================================================
   КОНТЕКСТНОЕ МЕНЮ (пин / скрыть / папки)
   ============================================================ */
let ctxChatId = null;
let ctxPos = { x: 0, y: 0 };
let showHidden = false;
function isNewsChat(chat) { return chat && chat.id === NEWS_CHAT_ID; }
function closeCtxMenu() {
  const m = $('#ctxMenu');
  if (m) m.classList.add('hidden');
  ctxChatId = null;
}
function openCtxMenu(x, y, chat) {
  ctxChatId = chat.id;
  if (Number.isFinite(x) && Number.isFinite(y)) ctxPos = { x, y };
  const pinned = (state.pinned || []).includes(chat.id);
  const hidden = (state.hidden || []).includes(chat.id);
  const news = isNewsChat(chat);
  const canHide = (chat.type === 'group' || chat.type === 'channel') && !news;
  const m = $('#ctxMenu');
  m.innerHTML = `
    <div class="ctx-item${news ? ' disabled' : ''}" data-ctx="pin">${pinned ? '🔓 Открепить' : (news ? '🔒 Закреплено' : '📌 Закрепить')}</div>
    ${canHide ? `<div class="ctx-item" data-ctx="hide">${hidden ? '👁 Показать' : '🙈 Скрыть ' + (chat.type === 'group' ? 'группу' : 'канал')}</div>` : (news ? '<div class="ctx-item disabled">🙈 Нельзя скрыть</div>' : '')}
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-ctx="foldermgr">🗂 Папки</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" data-ctx="close">Закрыть</div>`;
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}
function initCtxMenuActions() {
  const m = $('#ctxMenu');
  if (!m) return;
  m.addEventListener('click', (e) => {
    const it = e.target.closest('.ctx-item');
    if (!it) return;
    const act = it.dataset.ctx;
    const chat = state.chats.find(c => c.id === ctxChatId);
    if (!chat) return;
    if (act === 'close') { closeCtxMenu(); return; }
    if (act === 'pin') {
      if (isNewsChat(chat)) { toast('Нельзя', 'Nebula News всегда закреплён'); return; }
      const i = state.pinned.indexOf(chat.id);
      if (i >= 0) state.pinned.splice(i, 1); else state.pinned.push(chat.id);
      saveState(); renderChatList();
      toast(i >= 0 ? 'Чат откреплён' : 'Чат закреплён', chatTitle(chat));
    } else if (act === 'hide') {
      const i = state.hidden.indexOf(chat.id);
      if (i >= 0) state.hidden.splice(i, 1); else state.hidden.push(chat.id);
      saveState(); renderChatList();
      toast(i >= 0 ? 'Чат снова виден' : 'Чат скрыт', chatTitle(chat));
    } else if (act === 'foldermgr') {
      closeCtxMenu();
      openFoldersModal();
      return;
    }
    closeCtxMenu();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctxMenu')) closeCtxMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtxMenu(); });
  document.addEventListener('scroll', closeCtxMenu, true);
}
function initContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.chat-item');
    if (!item) return;
    e.preventDefault();
    closeCtxMenu();
    const chat = state.chats.find(c => c.id === item.dataset.id);
    if (!chat) return;
    openCtxMenu(e.clientX, e.clientY, chat);
  });
}

/* ============================================================
   ПАПКИ
   ============================================================ */
function renderFolderRail() {
  const rail = $('#folderRail');
  if (!rail) return;
  const folders = state.folders || [];
  const active = state.activeFolder || null;
  const hidden = state.hidden || [];
  const cnt = (fid) => state.chats.filter(c => c.folder === fid && !hidden.includes(c.id)).length;
  rail.innerHTML = `
    <button class="rail-btn ${!active ? 'active' : ''}" data-f="" title="Все чаты">
      <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg>
    </button>
    ${folders.length ? '<div class="rail-sep"></div>' + folders.map(f => `
      <button class="rail-btn ${active === f.id ? 'active' : ''}" data-f="${f.id}" title="${escapeHtml(f.name)}">
        📁${cnt(f.id) ? `<span class="rail-count">${cnt(f.id)}</span>` : ''}
      </button>`).join('') : ''}
    <button class="rail-btn rail-create" id="railCreate" title="Управление папками">＋</button>`;
  rail.querySelectorAll('.rail-btn[data-f]').forEach(b => b.addEventListener('click', () => {
    const fid = b.dataset.f || null;
    state.activeFolder = fid === state.activeFolder ? null : fid;
    saveState();
    renderFolderRail();
    renderChatList();
  }));
  const rc = $('#railCreate');
  if (rc) rc.addEventListener('click', () => openFoldersModal());
}

function openFoldersModal() {
  renderFoldersBody();
  $('#foldersModal').classList.add('open');
}
function closeFoldersModal() { $('#foldersModal').classList.remove('open'); }
function renderFoldersBody() {
  const body = $('#foldersBody');
  const folders = state.folders || [];
  const chatIn = (fid) => state.chats.filter(c => (c.type === 'group' || c.type === 'channel') && c.folder === fid);
  body.innerHTML = `
    <div class="manage-section">
      <h4>Создать папку</h4>
      <div class="folder-create">
        <input type="text" id="fNewName" placeholder="Название папки…" maxlength="20" autocomplete="off">
        <button type="button" class="btn btn-primary" id="fCreate">Создать</button>
      </div>
    </div>
    ${folders.length ? folders.map((f, i) => `
      <div class="manage-section folder-block">
        <div class="folder-head">
          <span class="fh-name" id="fhName${i}">📁 ${escapeHtml(f.name)}</span>
          <input type="text" id="fRename${i}" class="f-rename-input hidden" value="${escapeHtml(f.name)}" maxlength="20" autocomplete="off">
          <span class="fh-count">${chatIn(f.id).length} чат(ов)</span>
          <button type="button" class="mini-btn mini-info" data-folder-rename="${i}">✎</button>
          <button type="button" class="mini-btn danger-mini" data-folder-del="${f.id}">🗑</button>
        </div>
        <div class="folder-chats">
          ${chatIn(f.id).length ? chatIn(f.id).map(c => `
            <div class="folder-chip">
              <span>${c.type === 'group' ? '👥' : '📢'} ${escapeHtml(c.name)}</span>
              <button type="button" class="mini-btn" data-folder-remove="${f.id}" data-chat="${c.id}">✕</button>
            </div>`).join('') : '<div class="empty-list" style="padding:8px">Пока пусто</div>'}
          <button type="button" class="folder-add-btn" data-folder-add="${f.id}">＋ Добавить чат</button>
          <div class="folder-add-pick hidden" id="fPick${i}"></div>
        </div>
      </div>`).join('') : '<div class="empty-list">Папок пока нет. Создайте первую</div>'}`;

  const createBtn = body.querySelector('#fCreate');
  const nameInp = body.querySelector('#fNewName');
  const doCreate = () => {
    const v = nameInp.value.trim();
    if (!v) return;
    state.folders.push({ id: 'f' + Date.now() + Math.random().toString(36).slice(2, 5), name: v });
    saveState();
    renderFoldersBody();
    renderFolderRail();
    toast('Папка создана', v);
  };
  createBtn.addEventListener('click', doCreate);
  nameInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });

  folders.forEach((f, i) => {
    const renameBtn = body.querySelector('[data-folder-rename="' + i + '"]');
    renameBtn.addEventListener('click', () => {
      const nameEl = body.querySelector('#fhName' + i);
      const inp = body.querySelector('#fRename' + i);
      nameEl.classList.add('hidden');
      inp.classList.remove('hidden');
      inp.focus();
      inp.select();
    });
    const inp = body.querySelector('#fRename' + i);
    const commit = () => {
      const v = inp.value.trim();
      if (v) { f.name = v; saveState(); }
      renderFoldersBody();
      renderFolderRail();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    const delBtn = body.querySelector('[data-folder-del="' + f.id + '"]');
    delBtn.addEventListener('click', () => {
      if (!confirm(`Удалить папку «${f.name}»? Чаты не удаляются.`)) return;
      state.folders = state.folders.filter(x => x.id !== f.id);
      state.chats.forEach(c => { if (c.folder === f.id) delete c.folder; });
      if (state.activeFolder === f.id) state.activeFolder = null;
      saveState();
      renderFoldersBody();
      renderChatList();
      toast('Папка удалена', f.name);
    });
    const addBtn = body.querySelector('[data-folder-add="' + f.id + '"]');
    addBtn.addEventListener('click', () => {
      const pick = body.querySelector('#fPick' + i);
      const pickable = state.chats.filter(c => (c.type === 'group' || c.type === 'channel') && c.id !== NEWS_CHAT_ID && c.folder !== f.id && !(state.hidden || []).includes(c.id));
      pick.classList.toggle('hidden');
      if (pick.classList.contains('hidden')) return;
      pick.innerHTML = pickable.length ? pickable.map(c => `
        <div class="folder-pick-item" data-chat="${c.id}">${c.type === 'group' ? '👥' : '📢'} ${escapeHtml(c.name)}</div>`).join('') : '<div class="empty-list" style="padding:6px">Нет чатов для добавления</div>';
      pick.querySelectorAll('.folder-pick-item').forEach(it => it.addEventListener('click', () => {
        const ch = state.chats.find(c => c.id === it.dataset.chat);
        if (ch) ch.folder = f.id;
        saveState();
        renderFoldersBody();
        renderChatList();
        toast('Добавлено в папку', f.name);
      }));
    });
    body.querySelectorAll('[data-folder-remove="' + f.id + '"]').forEach(btn => btn.addEventListener('click', () => {
      const ch = state.chats.find(c => c.id === btn.dataset.chat);
      if (ch) delete ch.folder;
      saveState();
      renderFoldersBody();
      renderChatList();
      toast('Убрано из папки');
    }));
  });
}
function bindFoldersModal() {
  $('#foldersClose').addEventListener('click', closeFoldersModal);
  $('#foldersModal').addEventListener('click', (e) => { if (e.target === $('#foldersModal')) closeFoldersModal(); });
}

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initRipples();
  tryRestoreFromCloud();
  reconcileAccountsNow();
  initAuth();
  bindFilters();
  bindCreateModal();
  bindManageModal();
  bindSettings();
  bindVerifyModal();
  bindAvatarModal();
  bindCallModal();
  bindForwardModal();
  bindUserCardModal();
  bindDolphinModal();
  bindAdminPanel();
  bindFoldersModal();
  initContextMenu();
  initCtxMenuActions();

  document.body.classList.add('custom-cursor');

  $('#chatList').addEventListener('click', (e) => {
    const sub = e.target.closest('[data-subscribe]');
    if (sub) { subscribeChannel(sub.dataset.subscribe); return; }
    const userItem = e.target.closest('[data-user]');
    if (userItem) { startPrivateChat(userItem.dataset.user); return; }
    const chLink = e.target.closest('.ch-link');
    if (chLink) { openChannelByLink(chLink.dataset.ch); return; }
    const item = e.target.closest('.chat-item');
    if (item) selectChat(item.dataset.id);
  });
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-chcard]');
    if (card) { e.stopPropagation(); openChatCard(card.dataset.chcard); return; }
    const post = e.target.closest('[data-post]');
    if (post) { e.stopPropagation(); openStatusView(post.dataset.post); }
  });
  const aiBtn = $('#aiChatBtn');
  if (aiBtn) aiBtn.addEventListener('click', openAiChat);
  const supBtn = $('#supportBtn');
  if (supBtn) supBtn.addEventListener('click', openSupportModal);
  $('#logoutBtn').addEventListener('click', () => {
    if (confirm('Выйти из аккаунта?')) logout();
  });

  ensureGlobalChats();
  migrateUserIds();
  renderChatList();
  renderChat();
});

/* ============================================================
   ЗАЩИТА ОТ КОПИРОВАНИЯ
   (админам и владельцу разрешён только F12 — консоль)
   ============================================================ */
function devAllowed() { return !!(currentUser && (isAdmin(currentUser) || isOwnerAcc(currentUser))); }
document.addEventListener('contextmenu', (e) => { e.preventDefault(); });
document.addEventListener('selectstart', (e) => { e.preventDefault(); });
document.addEventListener('copy', (e) => { e.preventDefault(); });
document.addEventListener('cut', (e) => { e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') { if (!devAllowed()) e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && ['u', 's', 'c', 'x', 'p', 'a'].includes(String(e.key).toLowerCase())) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(String(e.key).toLowerCase())) {
    e.preventDefault();
  }
});

window.addEventListener('beforeunload', () => { try { saveState(); } catch (e) {} forceCloudBackup(); });
window.addEventListener('pagehide', () => forceCloudBackup());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') forceCloudBackup();
});
