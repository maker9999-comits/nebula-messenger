/* ============================================================
   Nebula Messenger вЂ” app.js (v2)
   ============================================================ */

let ME = { id: 'me', name: 'Р“РѕСЃС‚СЊ', color: ['#6C5CE7', '#8E7BFF'] };
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
/* РњРѕР¶РЅРѕ Р»Рё РґРѕР±Р°РІРёС‚СЊ РѕР±Р»Р°С‡РЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ Р»РѕРєР°Р»СЊРЅСѓСЋ Р±Р°Р·Сѓ:
   РЅРµ СЃРѕРІРїР°РґР°РµС‚ Р»Рё СЋР·РµСЂРЅРµР№Рј, РЅРµ СѓРґР°Р»С‘РЅ Р»Рё РѕРЅ, Рё РЅРµС‚ Р»Рё СѓР¶Рµ Р°РєРєР°СѓРЅС‚Р° СЃ С‚Р°РєРѕР№ РїРѕС‡С‚РѕР№ */
function cloudMergeUserOk(local, u, uname) {
  if (local.users[uname]) return false;
  if (deletedUsers().includes(uname)) return false;
  if (u && u.email && Object.values(local.users).some(x => x && x.email && String(x.email).toLowerCase() === String(u.email).toLowerCase())) return false;
  return true;
}
/* РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃРїРёСЃРєР° СѓРґР°Р»С‘РЅРЅС‹С… Р°РєРєР°СѓРЅС‚РѕРІ: РґСЂСѓРіРёРµ СѓСЃС‚СЂРѕР№СЃС‚РІР° С‚РѕР¶Рµ
   РїРµСЂРµСЃС‚Р°СЋС‚ РІРёРґРµС‚СЊ СѓРґР°Р»С‘РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ */
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
  return changed || removed;
}
const ADMIN_KEY = 'nebula_admins_v2';
const LOG_KEY = 'nebula_log_v2';
const ANN_KEY = 'nebula_announce_v2';

const LIMITS = { name: 18, desc: 48, username: 14, password: 24 };
const CODE_TTL = 15 * 60; // 15 РјРёРЅСѓС‚

/* ---------- РћС‚РїСЂР°РІРєР° РєРѕРґРѕРІ РЅР° РїРѕС‡С‚Сѓ С‡РµСЂРµР· СЃРµСЂРІРµСЂ-СЂРµР»Рµ (РЇРЅРґРµРєСЃ SMTP) ----------
   РЎРµСЂРІРµСЂ: mail-relay/server.js, СЂР°Р·РІС‘СЂРЅСѓС‚ РЅР° Р±РµСЃРїР»Р°С‚РЅРѕРј С…РѕСЃС‚РёРЅРіРµ Render.
   РќРёР¶Рµ СѓРєР°Р¶РёС‚Рµ РµРіРѕ URL (Р±РµР· СЃР»РµС€Р° РІ РєРѕРЅС†Рµ). Р•СЃР»Рё URL РїСѓСЃС‚ вЂ” РІРєР»СЋС‡Р°РµС‚СЃСЏ РґРµРјРѕ-СЂРµР¶РёРј. */
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
      body: JSON.stringify({ to: email, code: code, label: label || 'РљРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Nebula Messenger', secret: MAIL_RELAY_SECRET }),
    })
      .then((r) => r.json().catch(() => ({ ok: false, err: 'HTTP ' + r.status })))
      .then((d) => d && d.ok ? resolve({ ok: true })
        : (d && d.err === 'demo')
          ? resolve({ ok: false, demo: true })
          : resolve({ ok: false, err: (d && d.err) || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ РїРёСЃСЊРјРѕ' }))
      .catch((err) => {
        console.error('Mail relay error:', err);
        resolve({ ok: false, err: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ РїРёСЃСЊРјРѕ' });
      });
  });
}

const COLOR_PALETTE = [
  ['#6C5CE7', '#8E7BFF'], ['#0984E3', '#74B9FF'], ['#00B894', '#55EFC4'],
  ['#F39C12', '#FDCB6E'], ['#E84393', '#FD79A8'], ['#D63031', '#FF7675'],
  ['#00CEC9', '#81ECEC'], ['#A24DBD', '#DDA0DD'],
];

const PRESET_AVATARS = [
  { c1: '#6C5CE7', c2: '#8E7BFF', g: 'рџЋ' },
  { c1: '#0984E3', c2: '#74B9FF', g: 'рџљЂ' },
  { c1: '#00B894', c2: '#55EFC4', g: 'рџЊї' },
  { c1: '#F39C12', c2: '#FDCB6E', g: 'рџ”Ґ' },
  { c1: '#E84393', c2: '#FD79A8', g: 'рџЊё' },
  { c1: '#D63031', c2: '#FF7675', g: 'вќ¤пёЏ' },
  { c1: '#00CEC9', c2: '#81ECEC', g: 'рџђ¬' },
  { c1: '#A24DBD', c2: '#DDA0DD', g: 'вњЁ' },
];

const FRAMES = [
  { id: 'crown',   name: 'РљРћР РћРќРђ',   emoji: 'рџ‘‘', desc: 'РљРѕСЂРѕР»РµРІСЃРєР°СЏ В· С‚РѕР»СЊРєРѕ РґР»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ',            unlock: (a) => isAdmin(a.username) },
  { id: 'vip',     name: 'Р’РРџ',      emoji: 'рџЋ©', desc: 'Р§С‘СЂРЅРѕ-Р·РѕР»РѕС‚Р°СЏ В· С‚РѕР»СЊРєРѕ РґР»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ',           unlock: (a) => isAdmin(a.username) },
  { id: 'nebula',  name: 'РќР•Р‘РЈР›Рђ',   emoji: 'рџЊЊ', desc: 'РљРѕСЃРјРёС‡РµСЃРєР°СЏ В· С‚РѕР»СЊРєРѕ РґР»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ',             unlock: (a) => isAdmin(a.username) },
  { id: 'admin',   name: 'РђР”РњРРќ',   emoji: 'рџ–¤', desc: 'Р§С‘СЂРЅР°СЏ В· С‚РѕР»СЊРєРѕ РґР»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ',                 unlock: (a) => isAdmin(a.username) },
  { id: 'old',     name: 'РћР›Р”',       emoji: 'рџЏ›пёЏ', desc: 'РўС‘РјРЅРѕ-Р·РѕР»РѕС‚Р°СЏ В· РІС‹РґР°С‘С‚СЃСЏ С‚РѕР»СЊРєРѕ РїРµСЂРІС‹Рј 10 РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј', unlock: (a) => {
      const first10 = accountsList().filter(u => !u.isBot).sort((x, y) => (x.created || 0) - (y.created || 0)).slice(0, 10);
      return first10.some(u => u.username === a.username);
    } },
  { id: 'dolphin', name: 'Р”РµР»СЊС„РёРЅ',   emoji: 'рџђ¬', desc: 'РЎРёРЅСЏСЏ В· РґРѕСЃС‚РёРіРЅРёС‚Рµ 100 СѓСЂРѕРІРЅСЏ РґРµР»СЊС„РёРЅР° РІ Р»СЋР±РѕРј С‡Р°С‚Рµ',      unlock: (a) => dolphinsMaxLevelFor(a.username) >= 100 },
  { id: 'tester',  name: 'РўР•РЎРўР•Р ',    emoji: 'рџ§Є', desc: 'Р‘РёСЂСЋР·РѕРІР°СЏ В· С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµСЃС‚РµСЂРѕРІ',                          unlock: (a) => isTester(a) || isAdmin(a.username) },
  { id: '1h',      name: '1 С‡Р°СЃ',     emoji: 'вЏ±пёЏ', desc: 'Р‘РµР»Р°СЏ В· Р·Р° 1 С‡Р°СЃ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ',                             unlock: (a) => hoursInApp(a) >= 1 },
  { id: '5h',      name: '5 С‡Р°СЃРѕРІ',   emoji: 'рџЊ«пёЏ', desc: 'РЎРµСЂР°СЏ В· Р·Р° 5 С‡Р°СЃРѕРІ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ',                          unlock: (a) => hoursInApp(a) >= 5 },
  { id: '10h',     name: '10 С‡Р°СЃРѕРІ',  emoji: 'рџҐ€', desc: 'РЎРµСЂРµР±СЂСЏРЅР°СЏ В· Р·Р° 10 С‡Р°СЃРѕРІ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ',                    unlock: (a) => hoursInApp(a) >= 10 },
  { id: '50h',     name: '50 С‡Р°СЃРѕРІ',  emoji: 'рџҐ‡', desc: 'Р—РѕР»РѕС‚Р°СЏ В· Р·Р° 50 С‡Р°СЃРѕРІ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ',                       unlock: (a) => hoursInApp(a) >= 50 },
  { id: '100h',    name: '100 С‡Р°СЃРѕРІ', emoji: 'рџ’Ћ', desc: 'Р‘СЂРёР»Р»РёР°РЅС‚РѕРІР°СЏ В· Р·Р° 100 С‡Р°СЃРѕРІ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ',                unlock: (a) => hoursInApp(a) >= 100 },
];
const FRAME_ORDER = ['crown', 'vip', 'nebula', 'admin', 'tester', '100h', '50h', '10h', '5h', '1h', 'dolphin', 'old'];

const FLAG_EMOJIS = [
  'рџ‡·рџ‡є','рџ‡єрџ‡¦','рџ‡§рџ‡ѕ','рџ‡°рџ‡ї','рџ‡єрџ‡ї','рџ‡¦рџ‡І','рџ‡¦рџ‡ї','рџ‡¬рџ‡Є','рџ‡Ірџ‡©','рџ‡±рџ‡№','рџ‡±рџ‡»','рџ‡Єрџ‡Є','рџ‡µрџ‡±','рџ‡Ёрџ‡ї','рџ‡ёрџ‡°','рџ‡­рџ‡є','рџ‡·рџ‡ґ','рџ‡§рџ‡¬','рџ‡·рџ‡ё','рџ‡­рџ‡·','рџ‡ёрџ‡®','рџ‡¬рџ‡·','рџ‡№рџ‡·','рџ‡®рџ‡·','рџ‡®рџ‡±','рџ‡¦рџ‡Є','рџ‡ёрџ‡¦','рџ‡¶рџ‡¦','рџ‡°рџ‡ј','рџ‡§рџ‡­','рџ‡ґрџ‡І','рџ‡ѕрџ‡Є','рџ‡®рџ‡¶','рџ‡ёрџ‡ѕ','рџ‡±рџ‡§','рџ‡Їрџ‡ґ','рџ‡Єрџ‡¬','рџ‡Ірџ‡¦','рџ‡©рџ‡ї','рџ‡№рџ‡і','рџ‡±рџ‡ѕ','рџ‡ёрџ‡©','рџ‡Єрџ‡№','рџ‡°рџ‡Є','рџ‡№рџ‡ї','рџ‡ірџ‡¬','рџ‡¬рџ‡­','рџ‡їрџ‡¦','рџ‡Єрџ‡ё','рџ‡µрџ‡№','рџ‡®рџ‡№','рџ‡«рџ‡·','рџ‡©рџ‡Є','рџ‡¬рџ‡§','рџ‡®рџ‡Є','рџ‡ірџ‡±','рџ‡§рџ‡Є','рџ‡Ёрџ‡­','рџ‡¦рџ‡№','рџ‡ёрџ‡Є','рџ‡ірџ‡ґ','рџ‡©рџ‡°','рџ‡«рџ‡®','рџ‡®рџ‡ё','рџ‡єрџ‡ё','рџ‡Ёрџ‡¦','рџ‡Ірџ‡Ѕ','рџ‡§рџ‡·','рџ‡¦рџ‡·','рџ‡Ёрџ‡±','рџ‡µрџ‡Є','рџ‡Ёрџ‡ґ','рџ‡»рџ‡Є','рџ‡Ёрџ‡є','рџ‡Їрџ‡І','рџ‡¦рџ‡є','рџ‡ірџ‡ї','рџ‡Ёрџ‡і','рџ‡­рџ‡°','рџ‡№рџ‡ј','рџ‡°рџ‡·','рџ‡Їрџ‡µ','рџ‡№рџ‡­','рџ‡»рџ‡і','рџ‡®рџ‡і','рџ‡µрџ‡°','рџ‡§рџ‡©','рџ‡±рџ‡°','рџ‡Ірџ‡ѕ','рџ‡ёрџ‡¬','рџ‡®рџ‡©','рџ‡µрџ‡­','рџ‡°рџ‡­','рџ‡Ірџ‡і','рџ‡°рџ‡µ','рџ‡ірџ‡µ','рџ‡¦рџ‡«','рџ‡єрџ‡і','рџ‡Єрџ‡є',
];
const EMOJIS = [
  'рџЂ','рџЃ','рџ‚','рџ¤Ј','рџЉ','рџЌ','рџ','рџЋ','рџ¤©','рџҐі','рџ‰','рџ™‚','рџ…','рџ¤”','рџґ','рџ­','рџ¤','рџ±','рџ¤Ї','рџҐє','рџ‡','рџ¤—','рџ™„','рџ‹','рџ¤ђ','рџ·','рџ¤’','рџҐ¶','рџҐµ','рџ€','рџ¤ ','рџ¤Ў','рџ‘»','рџ’Ђ','рџ‘Ѕ','рџ¤–','рџЋѓ','рџє','рџё','рџ№','рџ»','рџј','рџ™Ђ','рџї','рџѕ',
  'вќ¤пёЏ','рџ§Ў','рџ’›','рџ’љ','рџ’™','рџ’њ','рџ–¤','рџ¤Ќ','рџ¤Ћ','рџ’”','рџ’–','рџ’','рџ’ќ','рџ’ћ','рџ’“','рџ’—','рџ’•','рџ’џ','рџ’Њ','рџ’‹','рџ’Ї','рџ’ў','рџ’Ґ','рџ’«','рџ’¦','рџ’Ё','рџ•іпёЏ','рџ’¬','рџ’­','рџ—ЇпёЏ',
  'рџ‘Ќ','рџ‘Ћ','рџ‘Џ','рџ™Њ','рџ¤ќ','вњЊпёЏ','рџ¤ћ','рџ¤џ','рџ¤™','рџ‘Њ','рџ‘€','рџ‘‰','рџ‘†','рџ‘‡','вќпёЏ','рџ‘‹','рџ¤љ','рџ–ђпёЏ','вњ‹','рџ––','рџ‘Љ','вњЉ','рџ¤›','рџ¤њ','рџ’Є','рџ¦ѕ','рџ¦µ','рџ¦¶','рџ‘Ђ','рџ‘ЃпёЏ','рџ§ ','рџ¦·','рџ‘…','рџ‘„','рџ«Ў','рџ’‹',
  'рџђ¶','рџђ±','рџђ­','рџђ№','рџђ°','рџ¦Љ','рџђ»','рџђј','рџђЁ','рџђЇ','рџ¦Ѓ','рџђ®','рџђ·','рџђё','рџђµ','рџђ”','рџђ§','рџђ¦','рџђ¤','рџ¦†','рџ¦…','рџ¦‰','рџ¦‡','рџђє','рџђ—','рџђґ','рџ¦„','рџђќ','рџђ›','рџ¦‹','рџђЊ','рџђћ','рџђњ','рџ¦‚','рџ¦Ђ','рџ¦ћ','рџ¦€','рџђ™','рџ¦‘','рџђ ','рџђџ','рџђЎ','рџђ¬','рџђі','рџђ‹','рџђЉ','рџђў','рџ¦Ћ','рџђЌ','рџ¦–','рџ¦•',
  'рџЌЋ','рџЌђ','рџЌЉ','рџЌ‹','рџЌЊ','рџЌ‰','рџЌ‡','рџЌ“','рџ«ђ','рџЌ’','рџЌ‘','рџҐ­','рџЌЌ','рџҐҐ','рџҐќ','рџЌ…','рџҐ‘','рџЌ†','рџҐ”','рџҐ•','рџЊЅ','рџЊ¶пёЏ','рџҐ’','рџҐ¬','рџҐ¦','рџ§„','рџ§…','рџЌ„','рџҐњ','рџЊ°','рџЌћ','рџҐђ','рџҐ–','рџҐЁ','рџҐЇ','рџҐћ','рџ§‡','рџ§Ђ','рџЌ–','рџЌ—','рџҐ©','рџҐ“','рџЌ”','рџЌџ','рџЌ•','рџЊ­','рџҐЄ','рџЊ®','рџЊЇ','рџҐ™','рџЌі','рџҐ','рџЌІ','рџҐЈ','рџҐ—','рџЌї','рџЌ±','рџЌ','рџЌ™','рџЌљ','рџЌ›','рџЌњ','рџЌќ','рџЌ ','рџЌЈ','рџЌ¤','рџЌҐ','рџЌЎ','рџҐџ','рџҐ ','рџҐЎ','рџЌ¦','рџЌ§','рџЌЁ','рџЌ©','рџЌЄ','рџЋ‚','рџЌ°','рџ§Ѓ','рџҐ§','рџЌ«','рџЌ¬','рџЌ­','рџЌ®','рџЌЇ','рџЌј','рџҐ›','в•','рџ«–','рџЌµ','рџ§ѓ','рџҐ¤','рџ§‹','рџЌ¶','рџЌє','рџЌ»','рџҐ‚','рџЌ·','рџҐѓ','рџЌё','рџЌ№','рџ§‰','рџЌѕ',
  'вљЅ','вљѕ','рџҐЋ','рџЏЂ','рџЏђ','рџЏ€','рџЏ‰','рџЋѕ','рџҐЏ','рџЋ±','рџЄЂ','рџЏ“','рџЏё','рџЏ’','рџЏ‘','рџҐЌ','рџЏЏ','рџҐ…','в›і','рџЄЃ','рџЏ№','рџЋЈ','рџ¤ї','рџҐЉ','рџҐ‹','рџЋЅ','рџ›№','рџ›ј','рџ›·','в›ёпёЏ','рџҐЊ','рџЋЇ','рџЋі','рџЋ®','рџ•№пёЏ','рџЋІ','рџ§©','в™џпёЏ','рџЋ­','рџЋЁ','рџЋ¬','рџЋ¤','рџЋ§','рџЋј','рџЋ№','рџҐЃ','рџЋ·','рџЋє','рџЋё','рџЄ•','рџЋ»',
  'рџ’°','рџ’ґ','рџ’¶','рџ’·','рџ’і','рџ§ѕ','вњ‰пёЏ','рџ“§','рџ“Ё','рџ“©','рџ“¤','рџ“Ґ','рџ“¦','рџ“«','рџ“Є','рџ“¬','рџ“­','рџ“®','рџ—іпёЏ','рџЄ™','рџ’Ћ','рџ”®','рџ§ї','рџ“ї','рџ§І','рџ§Ё','рџ§ё','рџЋЂ','рџЋЃ','рџЋ—пёЏ','рџЋџпёЏ','рџЋ«','рџЋ–пёЏ','рџЏ…','рџҐ‡','рџҐ€','рџҐ‰','вљ“','рџљЂ','рџ›ё','вњ€пёЏ','рџљЃ','рџ›џ','рџљІ','рџ›µ','рџЏЌпёЏ','рџљ—','рџљ•','рџљ“','рџљ‘','рџљ’','рџљ™','рџ›»','рџљљ','рџљ›','рџљњ','рџЏЋпёЏ','рџ›ґ','рџ›№','рџљ¦','рџљ§','в›Ѕ','рџ›‘','рџ—єпёЏ','рџ—ї','рџЏќпёЏ','рџЏњпёЏ','рџЏ”пёЏ','рџ—»','рџЊ‹','рџЏџпёЏ','рџЏ›пёЏ','рџ•Њ','рџ•Ќ','в›Є','рџ•‹','рџЏ ','рџЏЎ','рџЏпёЏ','рџЏљпёЏ','рџЏ—пёЏ','рџЏ­','рџЏў','рџЏ¬','рџЏЈ','рџЏ¤','рџЏҐ','рџЏ¦','рџЏЁ','рџЏЄ','рџЏ«','рџЏ©','рџ’’',
  'рџЊЌ','рџЊЋ','рџЊЏ','рџЊ•','рџЊ–','рџЊ—','рџЊ','рџЊ‘','рџЊ’','рџЊ“','рџЊ”','рџЊ™','вЂпёЏ','рџЊџ','в­ђ','рџЊ¤пёЏ','в›…','рџЊҐпёЏ','вЃпёЏ','рџЊ¦пёЏ','рџЊ§пёЏ','в›€пёЏ','рџЊ©пёЏ','рџЊЁпёЏ','вќ„пёЏ','вѓпёЏ','в›„','рџЊ¬пёЏ','рџ’Ё','рџЊЄпёЏ','рџЊ«пёЏ','рџЊЉ','рџ’§','в”','рџ’¦','рџЊ€','в‚пёЏ','рџ§Љ','рџЊ‹','вљЎ','рџ”Ґ',
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* Р—Р°РјРѕСЂРѕР·РєР° СЌРєСЂР°РЅР° РЅР° РјРѕР±РёР»СЊРЅС‹С…: РЅРёРєР°РєРѕРіРѕ Р·СѓРјР°, СЂР°СЃС‚СЏРіРёРІР°РЅРёСЏ Рё РІС‹РµР·РґР° СЃС‚СЂР°РЅРёС†С‹.
   Р’РЅСѓС‚СЂРµРЅРЅСЏСЏ РїСЂРѕРєСЂСѓС‚РєР° С‡Р°С‚РѕРІ/СЃРїРёСЃРєРѕРІ РѕСЃС‚Р°С‘С‚СЃСЏ (touch-action: pan-x pan-y). */
if (/Android|iPhone|iPad|Mobile/i.test(typeof navigator !== 'undefined' && navigator.userAgent || '')) {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 10 18 19.5 6.5"/></svg>';

/* ---------- РҐР РђРќРР›РР©Р• ---------- */
let storageWarnedAt = 0;
function safeSet(key, val) {
  try { localStorage.setItem(key, val); return true; }
  catch (e) {
    if (Date.now() - storageWarnedAt > 30000) {
      storageWarnedAt = Date.now();
      toast('РҐСЂР°РЅРёР»РёС‰Рµ РїРµСЂРµРїРѕР»РЅРµРЅРѕ', 'РЈРґР°Р»РёС‚Рµ СЃС‚Р°СЂС‹Рµ СЃС‚РёРєРµСЂС‹ РёР»Рё С„РѕС‚РѕСЃРѕРѕР±С‰РµРЅРёСЏ', 4000);
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

/* ---------- РћР‘Р›РђР§РќР«Р™ Р‘Р­РљРђРџ (Cloudflare KV) ---------- */
let cloudQueue = null;
let cloudBackupTimer = null;
const CLOUD_META_KEY = 'nebula_cloud_meta';

function cloudUrl(key) { return MAIL_RELAY_URL + '/store?key=' + encodeURIComponent(key); }

/* Р—РЅР°С‡РµРЅРёРµ С…СЂР°РЅРёС‚СЃСЏ РІ РѕР±Р»Р°РєРµ РІРјРµСЃС‚Рµ СЃ РІРµСЂСЃРёРµР№ (v) вЂ” С‡С‚РѕР±С‹ РїСЂРё РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёРё
   РЅРµ Р·Р°С‚РёСЂР°С‚СЊ Р±РѕР»РµРµ СЃРІРµР¶РёРµ Р»РѕРєР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ. РЎС‚Р°СЂС‹Рµ Р·Р°РїРёСЃРё Р±РµР· РІРµСЂСЃРёРё
   СЃС‡РёС‚Р°СЋС‚СЃСЏ v=0. */
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

/* ---------- Р’С‚РѕСЂР°СЏ Р±Р°Р·Р°: Firestore-Р·РµСЂРєР°Р»Рѕ ----------
   Cloudflare KV (Р±РµСЃРїР»Р°С‚РЅС‹Р№ Р»РёРјРёС‚ ~1000 Р·Р°РїРёСЃРµР№/РґРµРЅСЊ) С‡Р°СЃС‚Рѕ РёСЃС‡РµСЂРїС‹РІР°РµС‚СЃСЏ,
   Рё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РІСЃС‚Р°С‘С‚. Firestore (Р±РµСЃРїР»Р°С‚РЅРѕ ~20000 Р·Р°РїРёСЃРµР№/РґРµРЅСЊ) вЂ”
   РЅР°РґС‘Р¶РЅС‹Р№ РґСѓР±Р»СЊ. Р§С‚РѕР±С‹ РІРєР»СЋС‡РёС‚СЊ:
   1) РєРѕРЅСЃРѕР»СЊ Firebase в†’ РїСЂРѕРµРєС‚ nebula-1337 в†’ Build в†’ Firestore Database в†’
      Create database (СЂРµР¶РёРј production РёР»Рё test);
   2) Project settings в†’ Your apps в†’ Web app в†’ СЃРєРѕРїРёСЂСѓР№С‚Рµ apiKey Рё projectId;
   3) РєР»СЋС‡ СѓР¶Рµ РІСЃС‚СЂРѕРµРЅ РІ РїСЂРёР»РѕР¶РµРЅРёРµ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ вЂ” Р±Р°Р·Р° РІРєР»СЋС‡Р°РµС‚СЃСЏ СЃР°РјР°;
      РµСЃР»Рё РїРѕР·Р¶Рµ СЃРјРµРЅРёС€СЊ РєР»СЋС‡, РјРѕР¶РЅРѕ РїРµСЂРµРѕРїСЂРµРґРµР»РёС‚СЊ РІ РєРѕРЅСЃРѕР»Рё Р±СЂР°СѓР·РµСЂР° (F12):
      localStorage.setItem('nebula_firebase_cfg', JSON.stringify({ apiKey: 'РќРћР’Р«Р™_РљР›Р®Р§', projectId: 'nebula-1337' }))
      Р·Р°С‚РµРј РїРµСЂРµР·Р°РіСЂСѓР·РёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ. */
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
/* Р‘С‹СЃС‚СЂР°СЏ Р·Р°РїРёСЃСЊ С‚РѕР»СЊРєРѕ РїСЂРё РёР·РјРµРЅРµРЅРёРё СЃРѕРґРµСЂР¶РёРјРѕРіРѕ вЂ” СЌРєРѕРЅРѕРјРёС‚ РєРІРѕС‚Сѓ KV:
   РїРѕРІС‚РѕСЂРЅС‹Рµ Р±СЌРєР°РїС‹ РЅРµРёР·РјРµРЅРЅС‹С… РєР»СЋС‡РµР№ РЅРµ РїРёС€СѓС‚СЃСЏ РІ РѕР±Р»Р°РєРѕ */
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
/* РЎР»РёСЏРЅРёРµ Р°РєРєР°СѓРЅС‚РѕРІ РїСЂРё РѕС‚РїСЂР°РІРєРµ РІ РѕР±Р»Р°РєРѕ: С‡СѓР¶РёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё РёР· РѕР±Р»Р°РєР°
   РЅРµ С‚РµСЂСЏСЋС‚СЃСЏ, РґР°Р¶Рµ РµСЃР»Рё Р»РѕРєР°Р»СЊРЅР°СЏ РєРѕРїРёСЏ СЃС‚Р°СЂС€Рµ (СѓСЃС‚СЂРѕР№СЃС‚РІРѕ СЃ РґСЂСѓРіРѕРіРѕ
   РєРѕРјРїСЊСЋС‚РµСЂР° РЅРµ РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµС‚ РѕР±Р»Р°С‡РЅСѓСЋ Р±Р°Р·Сѓ) */
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
/* РЎРІРµР¶Р°СЏ Р·Р°РіСЂСѓР·РєР° Р°РєРєР°СѓРЅС‚РѕРІ РёР· РѕР±Р»Р°РєР° + СЃР»РёСЏРЅРёРµ СЃ Р»РѕРєР°Р»СЊРЅС‹РјРё.
   РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РїСЂРё РІС…РѕРґРµ Рё СЂРµРіРёСЃС‚СЂР°С†РёРё, С‡С‚РѕР±С‹ РЅР° Р»СЋР±РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ
   Р±С‹Р»Рѕ РІРёРґРЅРѕ РІСЃРµС… СѓР¶Рµ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ */
/* Р’С‹СЂР°РІРЅРёРІР°РЅРёРµ Р±Р°Р· РїСЂРё РєР°Р¶РґРѕРј РѕС‚РєСЂС‹С‚РёРё: Р»РѕРєР°Р»СЊРЅР°СЏ Р±Р°Р·Р° РїСѓС€РёС‚ РѕР±СЉРµРґРёРЅРµРЅРёРµ,
   РµСЃР»Рё РІ РЅРµР№ Р°РєРєР°СѓРЅС‚РѕРІ Р±РѕР»СЊС€Рµ, С‡РµРј РІ РѕР±Р»Р°РєРµ; Рё РЅР°РѕР±РѕСЂРѕС‚ вЂ” С‚СЏРЅРµС‚ РёР· РѕР±Р»Р°РєР° */
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
/* РћР±Р»Р°С‡РЅС‹Р№ РїРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїРѕ @СЋР·РµСЂРЅРµР№РјСѓ/ID СЃ Р°РІС‚Рѕ-СЂРµРіРёСЃС‚СЂР°С†РёРµР№ РІ
   Р»РѕРєР°Р»СЊРЅСѓСЋ Р±Р°Р·Сѓ вЂ” С‡С‚РѕР±С‹ РЅР° Р»СЋР±РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ РјРѕР¶РЅРѕ Р±С‹Р»Рѕ РЅР°Р№С‚Рё Рё РЅР°РїРёСЃР°С‚СЊ
   Р»СЋР±РѕРјСѓ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅРѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ (РµРґРёРЅР°СЏ Р±Р°Р·Р°) */
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

/* Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёРµ РёР· РѕР±Р»Р°РєР°: Р°РєРєР°СѓРЅС‚С‹ + СЃРѕСЃС‚РѕСЏРЅРёРµ РєР°Р¶РґРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
   (С‡Р°С‚С‹, СЃРѕРѕР±С‰РµРЅРёСЏ) + Р°РґРјРёРЅС‹ + Р»РѕРіРё + РѕР±СЉСЏРІР»РµРЅРёРµ. Р”Р»СЏ РєР°Р¶РґРѕРіРѕ РєР»СЋС‡Р° Р±РµСЂС‘С‚СЃСЏ
   Р±РѕР»РµРµ СЃРІРµР¶Р°СЏ РІРµСЂСЃРёСЏ; С‡СѓР¶РёРµ Р°РєРєР°СѓРЅС‚С‹ РёР· РѕР±Р»Р°РєР° РІСЃРµРіРґР° РґРѕР±Р°РІР»СЏСЋС‚СЃСЏ. */
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
      toast('Р‘Р°Р·Р° РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅР° РёР· РѕР±Р»Р°РєР°');
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
          nextRaw = accountsRaw.d;
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

/* ---------- РћР‘Р›РђР§РќРђРЇ РЎРРќРҐР РћРќРР—РђР¦РРЇ Р§РђРўРћР’ (РїРµСЂРµРїРёСЃРєР° РјРµР¶РґСѓ Р±СЂР°СѓР·РµСЂР°РјРё) ----------
   РљР°Р¶РґРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РїРёС€РµС‚СЃСЏ РІ РѕР±Р»Р°РєРѕ РєР»СЋС‡РѕРј msg:<chatId>:<msgId>, РјРµС‚Р°-РґР°РЅРЅС‹Рµ
   С‡Р°С‚Р° вЂ” chat:<chatId>, СѓРґР°Р»С‘РЅРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ вЂ” mdel:<chatId>:<msgId>.
   РџРѕРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІ СЃРµС‚Рё, РєР»РёРµРЅС‚ СЂР°Р· РІ 4 СЃРµРєСѓРЅРґС‹ РѕРїСЂР°С€РёРІР°РµС‚ РѕР±Р»Р°РєРѕ
   Рё РїРѕРґС‚СЏРіРёРІР°РµС‚ РЅРѕРІС‹Рµ С‡Р°С‚С‹ Рё СЃРѕРѕР±С‰РµРЅРёСЏ. */
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
  if (out.sticker && out.sticker.dataUrl && out.sticker.dataUrl.length > 700000) out.sticker = { name: out.sticker.name || 'РЎС‚РёРєРµСЂ', dataUrl: null };
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
/* Р›С‘РіРєРёРµ В«РїСЂРёСЃСѓС‚СЃС‚РІРёСЏВ» (РєС‚Рѕ РѕРЅР»Р°Р№РЅ) вЂ” РѕС‚РґРµР»СЊРЅС‹Р№ РєР°РЅР°Р», С‡С‚РѕР±С‹ РЅРµ Р¶РµС‡СЊ РєРІРѕС‚Сѓ KV:
   РїРёС€СѓС‚СЃСЏ С‚РѕР»СЊРєРѕ РІ Firestore, С‡РёС‚Р°СЋС‚СЃСЏ СЂР°Р· РІ РјРёРЅСѓС‚Сѓ РґР»СЏ РѕС‚РєСЂС‹С‚С‹С… С‡Р°С‚РѕРІ */
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
/* РЎР»РёСЏРЅРёРµ РѕР±Р»Р°С‡РЅРѕР№ РєРѕРїРёРё СЃРѕСЃС‚РѕСЏРЅРёСЏ СЃ Р»РѕРєР°Р»СЊРЅРѕР№: С‡Р°С‚С‹ РёР· РѕР±Р»Р°РєР° РґРѕР±Р°РІР»СЏСЋС‚СЃСЏ,
   РЅРѕ Р»РѕРєР°Р»СЊРЅС‹Рµ С‡Р°С‚С‹ РќР• СѓРґР°Р»СЏСЋС‚СЃСЏ (РёРЅР°С‡Рµ РєРѕРїРёСЏ СЃ РґСЂСѓРіРѕРіРѕ СѓСЃС‚СЂРѕР№СЃС‚РІР°, РІ РєРѕС‚РѕСЂРѕР№
   РµС‰С‘ РЅРµС‚ СЃРІРµР¶РµСЃРѕР·РґР°РЅРЅРѕРіРѕ С‡Р°С‚Р°, СЃС‚РёСЂР°Р»Р° Р±С‹ РµРіРѕ РёР· СЃРїРёСЃРєР°) */
function mergeStateWithCloud(raw, cloudRaw) {
  try {
    const a = JSON.parse(raw), b = JSON.parse(cloudRaw);
    if (!b || !Array.isArray(b.chats)) return cloudRaw;
    if (!a || !Array.isArray(a.chats) || !a.chats.length) return cloudRaw;
    const byId = {};
    a.chats.forEach(c => { if (c && c.id) byId[c.id] = c; });
    let changed = false;
    const FIELDS = ['title', 'desc', 'type', 'folder', 'pinned', 'members', 'admins', 'owner', 'handle', 'color', 'avatar', 'cover', 'emoji', 'access', 'whoCanWrite', 'post', 'video', 'broadcast', 'lastActivity'];
    (b.chats || []).forEach(c => {
      if (!c || !c.id) return;
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

/* ---------- РђР”РњРРќРљРђ / Р›РћР“Р ---------- */
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

/* ---------- РЈР’Р•Р”РћРњР›Р•РќРРЇ Рћ Р‘Р›РћРљРР РћР’РљР• / РЈР”РђР›Р•РќРР ---------- */
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
  if (!ts) return 'вЂ”';
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
      n = { type: 'ban', admin: bi.admin || 'вЂ”', reason: bi.reason || 'вЂ”', bannedAt: bi.bannedAt || 0, unbanAt: bi.unbanAt || null };
    } else return;
  }
  const isDel = n.type === 'delete';
  const ov = document.createElement('div');
  ov.className = 'status-editor-overlay';
  ov.innerHTML = `
    <div class="modal-box stickers-modal ban-notice">
      <h3>${isDel ? 'в›” Р’Р°С€ Р°РєРєР°СѓРЅС‚ Р±С‹Р» СѓРґР°Р»С‘РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С†РёРµР№' : 'в›” Р’Р°С€ Р°РєРєР°СѓРЅС‚ Р±С‹Р» Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С†РёРµР№'}</h3>
      <div class="bn-row"><span>РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ:</span><b>@${escapeHtml(n.admin || 'вЂ”')}</b></div>
      <div class="bn-row"><span>РџСЂРёС‡РёРЅР° Р±Р»РѕРєРёСЂРѕРІРєРё:</span><b>${escapeHtml(n.reason || 'вЂ”')}</b></div>
      <div class="bn-row"><span>Р”Р°С‚Р° СЂР°Р·Р±Р°РЅР°:</span><b>${isDel ? 'вЂ”' : (n.unbanAt ? fmtNoticeDate(n.unbanAt) : 'РќР°РІСЃРµРіРґР°')}</b></div>
      <div class="bn-row"><span>Р”Р°С‚Р° Р±Р»РѕРєРёСЂРѕРІРєРё:</span><b>${fmtNoticeDate(n.bannedAt)}</b></div>
      <div class="btn-row" style="justify-content:center;margin-top:6px">
        <button class="btn btn-primary" id="bnOk">РџРѕРЅСЏС‚РЅРѕ</button>
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
    toast('Р’С‹ Р±С‹Р»Рё РєРёРєРЅСѓС‚С‹ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј');
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
  const label = chat.type === 'group' ? 'СѓС‡Р°СЃС‚РЅРёРєРѕРІ' : 'РїРѕРґРїРёСЃС‡РёРєРѕРІ';
  panel.innerHTML = `
    <div class="am-head">${members.length} ${label}</div>
    ${members.map(u => {
      const isOwner = u.username === ownerName;
      const isAdmin = !isOwner && (chat.admins || []).includes(u.username);
      return `<div class="am-row">
        <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
        <span class="am-name">${displayName(u)} ${isOwner ? '<span class="tag owner">РІР»Р°РґРµР»РµС†</span>' : isAdmin ? '<span class="tag admin">Р°РґРјРёРЅ</span>' : ''}</span>
        ${!isOwner ? `<button type="button" class="mini-btn" title="${isAdmin ? 'РЎРЅСЏС‚СЊ СЃ Р°РґРјРёРЅРѕРІ' : 'РЎРґРµР»Р°С‚СЊ Р°РґРјРёРЅРѕРј'}" data-am="admin" data-u="${u.username}"><svg viewBox="0 0 24 24"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></button>` : ''}
        ${!isOwner ? `<button type="button" class="mini-btn" title="РЈРґР°Р»РёС‚СЊ РёР· ${chat.type === 'group' ? 'РіСЂСѓРїРїС‹' : 'РєР°РЅР°Р»Р°'}" data-am="kick" data-u="${u.username}"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
      </div>`;
    }).join('')}
    <div class="am-add"><div class="am-search"></div></div>`;
  panel.querySelectorAll('[data-am]').forEach(btn => btn.addEventListener('click', () => {
    const u = btn.dataset.u;
    const fresh = adminChatCanonical(chat.id);
    if (!fresh) return;
    if (btn.dataset.am === 'kick') {
      if (!confirm(`РЈРґР°Р»РёС‚СЊ @${u} РёР· В«${fresh.name}В» Сѓ РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№?`)) return;
      groupMemberEverywhere(fresh.id, 'kick', u);
      addLog(currentUser.username, `РЈРґР°Р»РёР» @${u} РёР· В«${fresh.name}В»`);
      toast('РЈРґР°Р»С‘РЅ', '@' + u);
    } else {
      groupMemberEverywhere(fresh.id, 'admin', u);
      addLog(currentUser.username, `РР·РјРµРЅРёР» РїСЂР°РІР° @${u} РІ В«${fresh.name}В»`);
      toast('РџСЂР°РІР° РѕР±РЅРѕРІР»РµРЅС‹', '@' + u);
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
      hint: 'РќР°Р№РґРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ, С‡С‚РѕР±С‹ РґРѕР±Р°РІРёС‚СЊ',
      onPick: (uid) => {
        groupMemberEverywhere(chat.id, 'add', uid);
        addLog(currentUser.username, `Р”РѕР±Р°РІРёР» @${uid} РІ В«${chat.name}В»`);
        toast('Р”РѕР±Р°РІР»РµРЅ', '@' + uid);
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
  if (src.access === 'private') return toast('РћС€РёР±РєР°', 'Р­С‚Рѕ РїСЂРёРІР°С‚РЅР°СЏ РіСЂСѓРїРїР° вЂ” РІРѕР№С‚Рё РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РїРѕ РїСЂРёРіР»Р°С€РµРЅРёСЋ');
  const copy = JSON.parse(JSON.stringify(src));
  copy.members = copy.members.includes('me') ? copy.members : ['me', ...copy.members];
  state.leftChats = state.leftChats || [];
  state.leftChats = state.leftChats.filter(x => x !== id);
  state.chats.push(copy);
  addLog(currentUser.username, src.type === 'channel'
    ? `РџРѕРґРїРёСЃР°Р»СЃСЏ РЅР° РєР°РЅР°Р» В«${copy.name}В»${copy.handle ? ' @' + copy.handle : ''}`
    : `Р’СЃС‚СѓРїРёР» РІ РіСЂСѓРїРїСѓ В«${copy.name}В»`);
  saveState();
  closeCreateModal();
  renderChatList();
  selectChat(id);
  toast(src.type === 'channel' ? 'РџРѕРґРїРёСЃРєР° РѕС„РѕСЂРјР»РµРЅР°' : 'Р’С‹ РІ РіСЂСѓРїРїРµ', copy.name);
}

function buildInitialState() {
  return { chats: [], filter: 'all', currentChatId: null, search: '', pinned: [], folders: [], hidden: [], activeFolder: null };
}

/* ---------- Nebula News (РєР°РЅР°Р» РґР»СЏ РІСЃРµС…) ---------- */
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
    desc: 'РћС„РёС†РёР°Р»СЊРЅС‹Рµ РЅРѕРІРѕСЃС‚Рё Nebula. РџСѓР±Р»РёРєСѓСЋС‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂС‹ Рё СЃРѕР·РґР°С‚РµР»СЊ.',
    color: ['#6C5CE7', '#00CEC9'],
    owner: newsOwnerUsername(),
    admins: [newsOwnerUsername()],
    members: ['me'],
    protected: true,
    messages: [{ id: 'm' + Date.now(), from: newsOwnerUsername(), text: 'рџ‘‹ Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ РІ Nebula News! Р—РґРµСЃСЊ РїСѓР±Р»РёРєСѓСЋС‚СЃСЏ РѕС„РёС†РёР°Р»СЊРЅС‹Рµ РЅРѕРІРѕСЃС‚Рё РјРµСЃСЃРµРЅРґР¶РµСЂР°.', time: new Date().toISOString(), read: true }],
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
        messages: [{ id: 'm' + Date.now(), from: 'nebula', text: 'РџСЂРёРІРµС‚! РЇ Nebula AI вЂ” РІСЃС‚СЂРѕРµРЅРЅС‹Р№ РР-Р°СЃСЃРёСЃС‚РµРЅС‚ РјРµСЃСЃРµРЅРґР¶РµСЂР° рџ¤– Р—Р°РґР°Р№ РІРѕРїСЂРѕСЃ РёР»Рё РІРІРµРґРё /РїРѕРјРѕС‰СЊ.', time: new Date().toISOString(), read: true }],
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
        name: 'РР·Р±СЂР°РЅРЅРѕРµ',
        protected: true,
        members: ['me'],
        messages: [{ id: 'm' + Date.now(), from: 'me', text: 'рџ’ѕ Р­С‚Рѕ РІР°С€Рµ РёР·Р±СЂР°РЅРЅРѕРµ вЂ” Р»РёС‡РЅС‹Рµ Р·Р°РјРµС‚РєРё Рё Р·Р°РєР»Р°РґРєРё. РЎРѕРѕР±С‰РµРЅРёСЏ РІРёРґРЅС‹ С‚РѕР»СЊРєРѕ РІР°Рј.', time: new Date().toISOString(), read: true, sent: true }],
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

/* ---------- РўР•РҐ РџРћР”Р”Р•Р Р–РљРђ (С‚РёРєРµС‚С‹) ---------- */
const TICKETS_KEY = 'nebula_tickets_v1';
const TICKETS_CLOUD_KEY = 'tickets';
const TICKET_TOPICS = ['РџСЂРѕР±Р»РµРјР° СЃ Р°РєРєР°СѓРЅС‚РѕРј', 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ Рё РѕР±Р»Р°РєРѕ', 'Р–Р°Р»РѕР±Р° РЅР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ', 'РћС€РёР±РєР° РІ СЂР°Р±РѕС‚Рµ', 'Р”СЂСѓРіРѕРµ'];
const TICKET_TOPIC_ICONS = { 'РџСЂРѕР±Р»РµРјР° СЃ Р°РєРєР°СѓРЅС‚РѕРј': 'рџ‘¤', 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ Рё РѕР±Р»Р°РєРѕ': 'вЃпёЏ', 'Р–Р°Р»РѕР±Р° РЅР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ': 'рџљЁ', 'РћС€РёР±РєР° РІ СЂР°Р±РѕС‚Рµ': 'рџђћ', 'Р”СЂСѓРіРѕРµ': 'рџ’¬' };
const TICKET_STATUS = { open: 'РћС‚РєСЂС‹С‚', work: 'Р’ СЂР°Р±РѕС‚Рµ', done: 'Р РµС€С‘РЅ', closed: 'Р—Р°РєСЂС‹С‚' };
const MAX_ACTIVE_TICKETS = 5;
const TRACKS_MAX = 20;
const TRACK_MAX_BYTES = 3670016;
const TRACK_TOTAL_MAX = 12000000;
let ticketsPushTimer = null;
let tracksPushTimer = null;
let supportView = 'list';
let supportTicketId = null;
let supportFilter = 'all';

function ticketStatusLabel(s) { return TICKET_STATUS[s] || 'РћС‚РєСЂС‹С‚'; }
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
  return cloudSave(TICKETS_CLOUD_KEY, JSON.stringify({ rev: Date.now(), tickets: loadTickets() }));
}
function syncCloudTickets() {
  if (!currentUser || !MAIL_RELAY_URL) return Promise.resolve();
  return cloudLoad(TICKETS_CLOUD_KEY).then(r => {
    if (!r) return;
    let cloud;
    try { cloud = JSON.parse(r.d); } catch (e) { return; }
    const cloudT = (cloud && cloud.tickets) || {};
    const local = loadTickets();
    const merged = { ...local };
    let changed = false;
    Object.keys(cloudT).forEach(id => {
      const c = cloudT[id];
      if (!c || !c.id) return;
      if (!merged[id] || (c.updatedAt || 0) > (merged[id].updatedAt || 0)) { merged[id] = c; changed = true; }
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
      <h4>РЎРѕР·РґР°С‚СЊ С‚РёРєРµС‚ <span class="ticket-limit ${locked ? 'ticket-limit-full' : ''}">${locked ? 'Р›РёРјРёС‚ РЅР° СЃРµРіРѕРґРЅСЏ РёСЃС‡РµСЂРїР°РЅ' : 'РЎРµРіРѕРґРЅСЏ РѕСЃС‚Р°Р»РѕСЃСЊ: ' + remaining + ' РёР· ' + MAX_ACTIVE_TICKETS}</span></h4>
      <div class="admin-hint">РњРѕР¶РЅРѕ СЃРѕР·РґР°С‚СЊ РЅРµ Р±РѕР»СЊС€Рµ ${MAX_ACTIVE_TICKETS} С‚РёРєРµС‚РѕРІ РІ РґРµРЅСЊ вЂ” СЃС‡С‘С‚С‡РёРє СЃР±СЂР°СЃС‹РІР°РµС‚СЃСЏ РєР°Р¶РґС‹Р№ РґРµРЅСЊ РІ РїРѕР»РЅРѕС‡СЊ</div>
      <select class="support-topic" ${locked ? 'disabled' : ''}>${TICKET_TOPICS.map(x => `<option>${x}</option>`).join('')}</select>
      <textarea class="support-text" rows="3" maxlength="500" placeholder="РћРїРёС€РёС‚Рµ РІР°С€Сѓ РїСЂРѕР±Р»РµРјСѓ..." ${locked ? 'disabled' : ''}></textarea>
      <button type="button" class="btn btn-primary support-create" ${locked ? 'disabled style="opacity:.5"' : ''}>${locked ? 'Р›РёРјРёС‚ С‚РёРєРµС‚РѕРІ РґРѕСЃС‚РёРіРЅСѓС‚' : 'РћС‚РїСЂР°РІРёС‚СЊ С‚РёРєРµС‚'}</button>
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
      <span class="st-chip">РћС‚РєСЂС‹С‚: ${cnt('open')}</span>
      <span class="st-chip">Р’ СЂР°Р±РѕС‚Рµ: ${cnt('work')}</span>
      <span class="st-chip">Р РµС€С‘РЅ: ${cnt('done')}</span>
      <span class="st-chip">Р—Р°РєСЂС‹С‚: ${cnt('closed')}</span>
      <span class="st-chip st-chip-accent">РћС‚РєСЂС‹С‚Рѕ СЃРµРіРѕРґРЅСЏ: ${createdToday}/${MAX_ACTIVE_TICKETS}</span>
    </div>`;
  const list = mine.length ? mine.map(x => {
    const author = accountByUsername(x.author);
    return `
    <div class="support-ticket" data-tid="${x.id}">
      <div class="st-head">
        <span class="avatar" style="${avatarStyle(author)}">${avatarInnerHtml(author)}</span>
        <div class="st-info">
          <div class="st-topic">${TICKET_TOPIC_ICONS[x.topic] || 'рџ’¬'} ${escapeHtml(x.topic)}</div>
          <div class="st-meta">${fmtTime(x.time)} В· ${(x.messages || []).length} СЃРѕРѕР±С‰.${x.assignee ? ' В· РѕС‚РІРµС‡Р°РµС‚ @' + escapeHtml(x.assignee) : ''}${x.doneBy ? ' В· СЂРµС€РёР» @' + escapeHtml(x.doneBy) : ''}</div>
        </div>
        <span class="support-status st-${x.status}">${ticketStatusLabel(x.status)}</span>
      </div>
      <div class="st-text">${escapeHtml(shortText(x.text, 90))}</div>
      <div class="st-actions">
        <button type="button" class="btn btn-primary st-open">РћС‚РєСЂС‹С‚СЊ С‡Р°С‚</button>
        ${x.status === 'closed' ? '<button type="button" class="btn st-reopen">РћС‚РєСЂС‹С‚СЊ Р·Р°РЅРѕРІРѕ</button>' : ''}
      </div>
    </div>`;
  }).join('') : '<div class="empty-list">РЈ РІР°СЃ РїРѕРєР° РЅРµС‚ С‚РёРєРµС‚РѕРІ</div>';
  return form + `<div class="manage-section"><h4>РњРѕРё С‚РёРєРµС‚С‹</h4>${chips}${list}</div>`;
}
function supportStaffHtml() {
  const all = Object.values(loadTickets()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const counts = s => all.filter(x => x.status === s).length;
  const tabs = ['all', 'open', 'work', 'done', 'closed'].map(s => `
    <button type="button" class="sf-tab ${supportFilter === s ? 'on' : ''}" data-f="${s}">${s === 'all' ? 'Р’СЃРµ' : TICKET_STATUS[s]} ${s === 'all' ? all.length : counts(s)}</button>`).join('');
  const form = supportCreateFormHtml();
  const tabsHtml = `<div class="sf-tabs">${tabs}</div>`;
  if (!all.length) return form + tabsHtml + '<div class="empty-list">РџРѕРєР° РЅРµС‚ РЅРё РѕРґРЅРѕРіРѕ С‚РёРєРµС‚Р°</div>';
  const list = all.filter(x => supportFilter === 'all' || x.status === supportFilter).map(x => {
    const author = accountByUsername(x.author);
    return `
      <div class="support-ticket" data-tid="${x.id}">
        <div class="st-head">
          <span class="avatar" style="${avatarStyle(author)}">${avatarInnerHtml(author)}</span>
          <div class="st-info">
            <div class="st-topic">${TICKET_TOPIC_ICONS[x.topic] || 'рџ’¬'} ${escapeHtml(x.topic)}</div>
            <div class="st-meta">РћС‚ @${escapeHtml(x.author)}${author ? ' В· ' + escapeHtml(author.name) : ''} В· ${fmtTime(x.time)}${x.assignee ? ' В· РІ СЂР°Р±РѕС‚Рµ Сѓ @' + escapeHtml(x.assignee) : ''}${x.doneBy ? ' В· СЂРµС€РёР» @' + escapeHtml(x.doneBy) + ' В· ' + fmtTime(x.doneAt) : ''}</div>
          </div>
          <span class="support-status st-${x.status}">${ticketStatusLabel(x.status)}</span>
        </div>
        <div class="st-text">${escapeHtml(shortText(x.text, 100))}</div>
        <div class="st-actions">
          <button type="button" class="btn btn-primary st-open">РћС‚РєСЂС‹С‚СЊ С‡Р°С‚</button>
          ${x.status === 'open' ? '<button type="button" class="btn st-work">Р’Р·СЏС‚СЊ РІ СЂР°Р±РѕС‚Сѓ</button>' : ''}
          ${x.status === 'open' || x.status === 'work' ? '<button type="button" class="btn st-done">Р РµС€РёС‚СЊ</button>' : ''}
          ${x.status !== 'closed'
            ? '<button type="button" class="btn btn-danger st-close">Р—Р°РєСЂС‹С‚СЊ</button>'
            : '<button type="button" class="btn st-reopen">РћС‚РєСЂС‹С‚СЊ Р·Р°РЅРѕРІРѕ</button>'}
        </div>
      </div>`;
  }).join('');
  return form + tabsHtml + (list || '<div class="empty-list">РќРµС‚ С‚РёРєРµС‚РѕРІ СЃ С‚Р°РєРёРј СЃС‚Р°С‚СѓСЃРѕРј</div>');
}
function supportStatsHtml() {
  const t = Object.values(loadTickets()).filter(x => x.status === 'done' && x.doneBy && x.doneAt);
  if (!t.length) return '<div class="empty-list">РџРѕРєР° РЅРёРєС‚Рѕ РЅРµ СЂРµС€РёР» РЅРё РѕРґРЅРѕРіРѕ С‚РёРєРµС‚Р°</div>';
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
    const cells = [['Р—Р° РґРµРЅСЊ', s.day], ['Р—Р° РЅРµРґРµР»СЋ', s.week], ['Р—Р° РјРµСЃСЏС†', s.month], ['Р—Р° РіРѕРґ', s.year], ['Р’СЃРµРіРѕ', s.all]]
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
      <span class="sm-name">${isAuthor ? escapeHtml(author ? author.name : ticket.author) : 'РўРµС… РїРѕРґРґРµСЂР¶РєР°'}</span>
      <div class="sm-text">${linkifyChannels(escapeHtml(m.text))}</div>
      <span class="sm-time">${fmtTime(m.time)}</span>
    </div>`;
  }).join('');
  return `
    <div class="support-chat-head">
      <button type="button" class="btn st-back">в†ђ Рљ С‚РёРєРµС‚Р°Рј</button>
      <div class="sch-info"><b>${escapeHtml(ticket.topic)}</b><span class="support-status st-${ticket.status}">${ticketStatusLabel(ticket.status)}</span></div>
    </div>
    <div class="support-chat-msgs">${msgs || '<div class="empty-list">РЎРѕРѕР±С‰РµРЅРёР№ РїРѕРєР° РЅРµС‚</div>'}</div>
    <div class="support-chat-input">
      <input type="text" class="support-input" maxlength="500" placeholder="РќР°РїРёС€РёС‚Рµ СЃРѕРѕР±С‰РµРЅРёРµ..." autocomplete="off">
      <button type="button" class="btn btn-primary support-send">РћС‚РїСЂР°РІРёС‚СЊ</button>
    </div>`;
}
function renderSupportModal(ov) {
  const staff = isSupport(currentUser);
  if (supportView === 'chat' && !supportTicketId) supportView = 'list';
  let bodyHtml;
  if (supportView === 'chat' && supportTicketId) {
    const t = loadTickets()[supportTicketId];
    bodyHtml = t ? supportChatHtml(t) : '<div class="empty-list">РўРёРєРµС‚ РЅРµ РЅР°Р№РґРµРЅ</div>';
  } else {
    bodyHtml = staff ? supportStaffHtml() : supportTicketListHtml();
  }
  ov.innerHTML = `
    <div class="modal-box support-modal">
      <div class="support-hero">
        <span class="support-hero-ico">рџЋ§</span>
        <div class="support-hero-txt">
          <h3>РўРµС… РїРѕРґРґРµСЂР¶РєР°</h3>
          <p>${staff ? 'Р’С‹ вЂ” СЃРѕС‚СЂСѓРґРЅРёРє С‚РµС… РїРѕРґРґРµСЂР¶РєРё. Р’Р°Рј РґРѕСЃС‚СѓРїРЅС‹ РІСЃРµ С‚РёРєРµС‚С‹' : 'РћРїРёС€РёС‚Рµ РїСЂРѕР±Р»РµРјСѓ вЂ” РјС‹ РѕС‚РІРµС‚РёРј РІ С‡Р°С‚Рµ С‚РёРєРµС‚Р°'}</p>
        </div>
        <button type="button" class="pm-x support-hero-x" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
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
  ticket.messages.push({ from: 'system', text: `${actionText} вЂ” @${currentUser.username}`, time: new Date().toISOString() });
  ticket.updatedAt = Date.now();
  saveTickets(t);
  addLog(currentUser.username, `${actionText} вЂ” С‚РёРєРµС‚ В«${ticket.topic}В» (@${ticket.author})`);
  toast('РЎС‚Р°С‚СѓСЃ РѕР±РЅРѕРІР»С‘РЅ', ticketStatusLabel(status));
}
function supportModalClick(e) {
  const ov = $('#supportModal');
  if (!ov) return;
  const create = e.target.closest('.support-create');
  if (create) {
    const topic = ov.querySelector('.support-topic').value;
    const text = ov.querySelector('.support-text').value.trim();
    if (!text) return toast('РћС€РёР±РєР°', 'РћРїРёС€РёС‚Рµ РІР°С€Сѓ РїСЂРѕР±Р»РµРјСѓ');
    const t = loadTickets();
    if (createdTodayCount(t) >= MAX_ACTIVE_TICKETS) return toast('Р›РёРјРёС‚', `РњР°РєСЃРёРјСѓРј ${MAX_ACTIVE_TICKETS} С‚РёРєРµС‚РѕРІ РІ РґРµРЅСЊ вЂ” Р»РёРјРёС‚ РѕР±РЅРѕРІРёС‚СЃСЏ Р·Р°РІС‚СЂР° РІ РїРѕР»РЅРѕС‡СЊ`);
    const id = 't' + Date.now() + Math.random().toString(36).slice(2, 5);
    t[id] = {
      id, author: currentUser.username, topic, text,
      time: new Date().toISOString(), status: 'open', assignee: null,
      messages: [{ from: 'system', text: 'РўРёРєРµС‚ СЃРѕР·РґР°РЅ', time: new Date().toISOString() }],
      updatedAt: Date.now(),
    };
    saveTickets(t);
    addLog(currentUser.username, `РЎРѕР·РґР°Р» С‚РёРєРµС‚ РІ С‚РµС… РїРѕРґРґРµСЂР¶РєСѓ: В«${topic}В»`);
    toast('РўРёРєРµС‚ СЃРѕР·РґР°РЅ', 'РўРµС… РїРѕРґРґРµСЂР¶РєР° РѕС‚РІРµС‚РёС‚ РІ С‡Р°С‚Рµ С‚РёРєРµС‚Р°');
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
      ticket.messages.push({ from: 'system', text: 'РўРёРєРµС‚ РѕС‚РєСЂС‹С‚ Р·Р°РЅРѕРІРѕ Р°РІС‚РѕСЂРѕРј', time: new Date().toISOString() });
    }
    ticket.updatedAt = Date.now();
    saveTickets(t);
    renderSupportModal(ov);
    return;
  }
  const work = e.target.closest('.st-work');
  if (work) { setTicketStatus(work.closest('.support-ticket').dataset.tid, 'work', 'Р’Р·СЏР» С‚РёРєРµС‚ РІ СЂР°Р±РѕС‚Сѓ'); renderSupportModal(ov); return; }
  const tab = e.target.closest('.sf-tab');
  if (tab) { supportFilter = tab.dataset.f; renderSupportModal(ov); return; }
  const done = e.target.closest('.st-done');
  if (done) { setTicketStatus(done.closest('.support-ticket').dataset.tid, 'done', 'РўРёРєРµС‚ СЂРµС€С‘РЅ'); renderSupportModal(ov); return; }
  const closeT = e.target.closest('.st-close');
  if (closeT) { setTicketStatus(closeT.closest('.support-ticket').dataset.tid, 'closed', 'РўРёРєРµС‚ Р·Р°РєСЂС‹С‚'); renderSupportModal(ov); return; }
  const reopen = e.target.closest('.st-reopen');
  if (reopen) { setTicketStatus(reopen.closest('.support-ticket').dataset.tid, 'open', 'РўРёРєРµС‚ РѕС‚РєСЂС‹С‚ Р·Р°РЅРѕРІРѕ'); renderSupportModal(ov); return; }
}

/* ---------- РњРћР РўР Р•РљР (MP3) ---------- */
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
        <div class="track-meta">${fmtBytes(t.size)} В· ${new Date(t.added).toLocaleDateString('ru-RU')}</div>
        <audio controls preload="none" src="${t.data}"></audio>
      </div>
      <button type="button" class="btn btn-danger track-del" data-i="${i}">РЈРґР°Р»РёС‚СЊ</button>
    </div>`).join('') || '<div class="empty-list">РџРѕРєР° РЅРµС‚ С‚СЂРµРєРѕРІ</div>';
}
function renderTracksModal(ov) {
  const list = loadTracks(currentUser.username);
  ov.innerHTML = `
    <div class="modal-box support-modal tracks-modal">
      <div class="pm-head">
        <span class="pm-ico">рџЋµ</span>
        <div class="pm-head-txt">
          <h3>РњРѕРё С‚СЂРµРєРё (MP3)</h3>
          <p>РџРѕРєР°Р·С‹РІР°СЋС‚СЃСЏ РІ РІР°С€РµР№ РєР°СЂС‚РѕС‡РєРµ Сѓ РґСЂСѓРіРёС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</p>
        </div>
        <button type="button" class="pm-x tr-close" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
      </div>
      <div class="manage-section">
        <h4>Р”РѕР±Р°РІРёС‚СЊ С‚СЂРµРє</h4>
        <div class="admin-hint">Р¤Р°Р№Р» РґРѕ ${fmtMb(TRACK_MAX_BYTES)} (РїРµСЃРЅСЏ РґРѕ ~15 РјРёРЅСѓС‚) В· РјР°РєСЃРёРјСѓРј ${TRACKS_MAX} С‚СЂРµРєРѕРІ В· РІСЃРµРіРѕ РґРѕ ${fmtMb(TRACK_TOTAL_MAX)}</div>
        <label class="track-upload">
          <svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
          <span>Р’С‹Р±СЂР°С‚СЊ MP3-С„Р°Р№Р»</span>
          <input type="file" class="track-file" accept="audio/mpeg,audio/mp3,.mp3">
        </label>
      </div>
      <div class="manage-section">
        <h4>РњРѕРё С‚СЂРµРєРё (${list.length}/${TRACKS_MAX})</h4>
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
    if (!/\.mp3$/i.test(f.name) && f.type !== 'audio/mpeg') return toast('РћС€РёР±РєР°', 'РќСѓР¶РµРЅ С„Р°Р№Р» MP3');
    if (f.size > TRACK_MAX_BYTES) return toast('Р›РёРјРёС‚', 'Р¤Р°Р№Р» Р±РѕР»СЊС€Рµ ' + fmtMb(TRACK_MAX_BYTES) + ' (РїСЂРёРјРµСЂРЅРѕ ' + Math.round(f.size / 1024 / 1024 * 10) / 10 + ' РњР‘)');
    const list = loadTracks(currentUser.username);
    if (list.length >= TRACKS_MAX) return toast('Р›РёРјРёС‚', 'РњР°РєСЃРёРјСѓРј ' + TRACKS_MAX + ' С‚СЂРµРєРѕРІ');
    const total = list.reduce((n, x) => n + x.data.length, 0);
    const rd = new FileReader();
    rd.onload = () => {
      const data = String(rd.result);
      if (total + data.length > TRACK_TOTAL_MAX) return toast('Р›РёРјРёС‚', 'РЎСѓРјРјР°СЂРЅС‹Р№ РѕР±СЉС‘Рј С‚СЂРµРєРѕРІ Р±РѕР»СЊС€Рµ ' + fmtMb(TRACK_TOTAL_MAX) + ' вЂ” СѓРґР°Р»РёС‚Рµ СЃС‚Р°СЂС‹Рµ С‚СЂРµРєРё');
      list.push({ name: f.name.replace(/\.mp3$/i, ''), size: f.size, data, added: Date.now() });
      saveTracks(currentUser.username, list);
      renderTracksModal(ov);
      toast('РўСЂРµРє РґРѕР±Р°РІР»РµРЅ', f.name);
    };
    rd.onerror = () => toast('РћС€РёР±РєР°', 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ С„Р°Р№Р»');
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
      toast('РўСЂРµРє СѓРґР°Р»С‘РЅ');
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

/* ---------- РџРѕР»СЊР·РѕРІР°С‚РµР»Рё / С…РµР»РїРµСЂС‹ ---------- */
function userById(id) {
  if (id === 'me') return currentUser;
  return accountByUsername(id);
}
function chatTitle(chat) {
  if (chat.type === 'private') {
    const u = userById(chat.userId);
    return u ? u.name : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ';
  }
  if (chat.type === 'ai') return 'Nebula AI';
  if (chat.type === 'saved') return 'РР·Р±СЂР°РЅРЅРѕРµ';
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

/* ---------- Р‘Р•Р™Р”Р–Р ---------- */
function badgeHtml(acc) {
  if (!acc) return '';
  const b = acc.badges || {};
  let s = '';
  if (b.scam) s += '<span class="badge badge-scam">SCAM</span>';
  if (b.admin) s += '<span class="badge badge-admin">РђР”РњРРќ</span>';
  if (b.owner) s += '<span class="badge badge-owner" title="Р’Р»Р°РґРµР»РµС† РјРµСЃСЃРµРЅРґР¶РµСЂР°">Р’Р›РђР”Р•Р›Р•Р¦</span>';
  if (b.tester) s += '<span class="badge badge-tester">РўР•РЎРўР•Р </span>';
  if (b.blue) s += `<span class="badge badge-verify" title="РђРєРєР°СѓРЅС‚ РІРµСЂРёС„РёС†РёСЂРѕРІР°РЅ">${CHECK_ICON}</span>`;
  if (b.gray) s += '<span class="badge badge-verify-gray" title="РђРєРєР°СѓРЅС‚ РІРµСЂРёС„РёС†РёСЂРѕРІР°РЅ">' + CHECK_ICON + '</span>';
  if (b.clock) s += '<span class="badge badge-clock" title="Р§Р°СЃС‹">рџ•ђ</span>';
  return s;
}
function displayName(acc) {
  return acc ? escapeHtml(acc.name) + badgeHtml(acc) : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ';
}
function chatTitleHtml(chat) {
  if (chat.type === 'private') {
    const u = userById(chat.userId);
    return u ? displayName(u) : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ';
  }
  return escapeHtml(chatTitle(chat));
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return 'РІС‡РµСЂР°';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
}
function fmtDateGroup(iso) {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === now.toDateString()) return 'РЎРµРіРѕРґРЅСЏ';
  if (d.toDateString() === yest.toDateString()) return 'Р’С‡РµСЂР°';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function lastMessage(chat) { return chat.messages.length ? chat.messages[chat.messages.length - 1] : null; }
function lastMessagePreview(chat) {
  const lm = lastMessage(chat);
  if (!lm) return 'РќРµС‚ СЃРѕРѕР±С‰РµРЅРёР№';
  if (lm.from === 'system') {
    if (lm.kind === 'call_missed') return 'рџ“µ РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ Р·РІРѕРЅРѕРє';
    if (lm.kind === 'call_in') return 'рџ“ћ Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРє';
    if (lm.kind === 'call_declined') return 'вќЊ Р’С‹Р·РѕРІ РѕС‚РєР»РѕРЅС‘РЅ';
    if (lm.kind === 'call_ended') return 'вњ… ' + lm.text;
    return lm.text;
  }
  const md = mediaLabel(lm);
  const st = lm.sticker ? '[РЎС‚РёРєРµСЂ]' : lm.poll ? '[РћРїСЂРѕСЃ]' : lm.contact ? '[РљРѕРЅС‚Р°РєС‚]' : '';
  const txt = st || (md ? (lm.text ? md + ' ' + lm.text : md) : lm.text);
  return (lm.from === 'me' ? 'Р’С‹: ' : '') + txt;
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
  'РґРµР»СЊС„РёРЅС‹ СЃРїСЏС‚ СЃ РѕРґРЅРёРј РѕС‚РєСЂС‹С‚С‹Рј РіР»Р°Р·РѕРј вЂ” РѕРґРЅРѕ РїРѕР»СѓС€Р°СЂРёРµ РјРѕР·РіР° РІСЃРµРіРґР° Р±РѕРґСЂСЃС‚РІСѓРµС‚',
  'Сѓ РѕСЃСЊРјРёРЅРѕРіР° С‚СЂРё СЃРµСЂРґС†Р° Рё РіРѕР»СѓР±Р°СЏ РєСЂРѕРІСЊ',
  'РјС‘Рґ РЅРёРєРѕРіРґР° РЅРµ РїРѕСЂС‚РёС‚СЃСЏ вЂ” Р°СЂС…РµРѕР»РѕРіРё РЅР°С…РѕРґРёР»Рё СЃСЉРµРґРѕР±РЅС‹Р№ РјС‘Рґ РёР· РґСЂРµРІРЅРёС… РіСЂРѕР±РЅРёС†',
  'Р±Р°РЅР°РЅС‹ вЂ” СЌС‚Рѕ СЏРіРѕРґС‹, Р° РєР»СѓР±РЅРёРєР° вЂ” РЅРµС‚',
  'С‡РµР»РѕРІРµС‡РµСЃРєРѕРµ С‚РµР»Рѕ СЃРѕСЃС‚РѕРёС‚ РїСЂРёРјРµСЂРЅРѕ РёР· 60% РІРѕРґС‹',
  'РІ РєРѕСЃРјРѕСЃРµ РјРѕР¶РЅРѕ СѓРІРёРґРµС‚СЊ РєРёС‚Р°Р№СЃРєСѓСЋ СЃС‚РµРЅСѓ С‚РѕР»СЊРєРѕ СЃ РѕС‡РµРЅСЊ РЅРёР·РєРѕР№ РѕСЂР±РёС‚С‹, СЌС‚Рѕ РјРёС„',
  'СЃРєРѕСЂРѕСЃС‚СЊ СЃРІРµС‚Р° вЂ” РѕРєРѕР»Рѕ 300 000 РєРј/СЃ, СЌС‚РѕРіРѕ С…РІР°С‚Р°РµС‚, С‡С‚РѕР±С‹ РѕР±Р»РµС‚РµС‚СЊ Р—РµРјР»СЋ 7,5 СЂР°Р· Р·Р° СЃРµРєСѓРЅРґСѓ',
  'Сѓ СѓР»РёС‚РѕРє РѕРєРѕР»Рѕ 25 000 Р·СѓР±РѕРІ, РЅРѕ РѕРЅРё РЅРµ СѓРјРµСЋС‚ Р¶РµРІР°С‚СЊ',
  'СЃС‚СЂР°СѓСЃС‹ РЅРµ РїСЂСЏС‡СѓС‚ РіРѕР»РѕРІСѓ РІ РїРµСЃРѕРє, РЅРѕ Р±РµРіР°СЋС‚ Р±С‹СЃС‚СЂРµРµ 70 РєРј/С‡',
  'Р·Р° РѕРґРёРЅ РІРґРѕС… РІС‹ РІРґС‹С…Р°РµС‚Рµ РѕРєРѕР»Рѕ 10^22 РјРѕР»РµРєСѓР», СЃСЂРµРґРё РЅРёС… РїРѕС‡С‚Рё РЅР°РІРµСЂРЅСЏРєР° РµСЃС‚СЊ РјРѕР»РµРєСѓР»С‹, РІС‹РґРѕС…РЅСѓС‚С‹Рµ Р®Р»РёРµРј Р¦РµР·Р°СЂРµРј',
  'Р±СѓРєРІР° В«С‘В» РІ СЂСѓСЃСЃРєРѕРј Р°Р»С„Р°РІРёС‚Рµ РїРѕСЏРІРёР»Р°СЃСЊ РІСЃРµРіРѕ РѕРєРѕР»Рѕ 240 Р»РµС‚ РЅР°Р·Р°Рґ',
  'Nebula вЂ” Р»Р°С‚РёРЅСЃРєРѕРµ СЃР»РѕРІРѕ, РѕР·РЅР°С‡Р°СЋС‰РµРµ В«С‚СѓРјР°РЅВ», Р° РµС‰С‘ СЌС‚Рѕ РЅР°Р·РІР°РЅРёРµ РјРµСЃСЃРµРЅРґР¶РµСЂР°, РІ РєРѕС‚РѕСЂРѕРј РјС‹ РѕР±С‰Р°РµРјСЃСЏ рџЊЊ',
];
const AI_JOKES = [
  'РџСЂРѕРіСЂР°РјРјРёСЃС‚ РїРѕРїСЂРѕСЃРёР» Сѓ Р±РёР±Р»РёРѕС‚РµРєР°СЂСЏ РєРЅРёРіСѓ В«РљР°Рє РЅР°СѓС‡РёС‚СЊСЃСЏ С‚РµСЂРїРµРЅРёСЋВ». Р‘РёР±Р»РёРѕС‚РµРєР°СЂСЊ СЃРєР°Р·Р°Р»: В«РћРЅР° РЅР° РјРµСЃС‚Рµ С‡РµСЂРµР· 2 РЅРµРґРµР»РёВ».',
  'вЂ” РџРѕС‡РµРјСѓ РїСЂРѕРіСЂР°РјРјРёСЃС‚ РЅРµ РїРѕС€С‘Р» РЅР° СЂР°Р±РѕС‚Сѓ? вЂ” РћРЅ СѓРґР°Р»РёР» СЃРІРѕСЋ РїР°РїРєСѓ СЃ РїСЂРёС‡С‘СЃРєРѕР№.',
  'вЂ” Р§С‚Рѕ С‚Р°РєРѕРµ РёРґРµР°Р»СЊРЅС‹Р№ Р±СЂР°Рє? вЂ” РљРѕРіРґР° Р¶РµРЅР° РіРѕРІРѕСЂРёС‚ РјСѓР¶Сѓ, С‡С‚Рѕ РІ РґРѕРјРµ РєС‚Рѕ-С‚Рѕ РµСЃС‚СЊ, Р° РјСѓР¶ РѕС‚РІРµС‡Р°РµС‚: В«Р° СЃРєРѕР»СЊРєРѕ РёС…?В»',
  'Р’СЃС‚СЂРµС‡Р°СЋС‚СЃСЏ РґРІР° РЅРµР№СЂРѕСЃРµС‚РµРІС‹С… С‡Р°С‚-Р±РѕС‚Р°. РћРґРёРЅ РґСЂСѓРіРѕРјСѓ: В«РўС‹ СЃРµРіРѕРґРЅСЏ РєР°РєРѕР№-С‚Рѕ РіР°Р»Р»СЋС†РёРЅРёСЂСѓСЋС‰РёР№В»',
  'вЂ” РђР»Р»Рѕ, СЌС‚Рѕ РЅРµР№СЂРѕСЃРµС‚СЊ? вЂ” Р”Р°. вЂ” Р’С‹РїРµР№ СЃС‚Р°РєР°РЅ РІРѕРґС‹. РЈ РР РїРѕРєР° РЅРµС‚ СЂС‚Р°, РЅРѕ РѕРЅ РѕС†РµРЅРёР» Р·Р°Р±РѕС‚Сѓ.',
  'Р—Р°С…РѕРґРёС‚ Р±Р°Р№С‚ РІ Р±Р°СЂ. Р‘Р°СЂРјРµРЅ РіРѕРІРѕСЂРёС‚: В«РР·РІРёРЅРё, Сѓ РЅР°СЃ РїРѕ Р±Р°Р№С‚Р°Рј РЅРµ РѕР±СЃР»СѓР¶РёРІР°РµРјВ». Р‘Р°Р№С‚: В«Р›Р°РґРЅРѕ, СЏ СѓРєСѓС€Сѓ СЃРµР±СЏ Рё СЃС‚Р°РЅСѓ РїРѕР»СѓР±Р°Р№С‚РѕРІС‹РјВ»',
];
const AI_QUOTES = [
  'Р›СѓС‡С€РёР№ СЃРїРѕСЃРѕР± РїСЂРµРґСЃРєР°Р·Р°С‚СЊ Р±СѓРґСѓС‰РµРµ вЂ” СЃРѕР·РґР°С‚СЊ РµРіРѕ. вЂ” РџРёС‚РµСЂ Р”СЂСѓРєРµСЂ',
  'Р•РґРёРЅСЃС‚РІРµРЅРЅС‹Р№ СЃРїРѕСЃРѕР± РґРµР»Р°С‚СЊ РІРµР»РёРєРёРµ РґРµР»Р° вЂ” Р»СЋР±РёС‚СЊ С‚Рѕ, С‡С‚Рѕ РІС‹ РґРµР»Р°РµС‚Рµ. вЂ” РЎС‚РёРІ Р”Р¶РѕР±СЃ',
  'Р•СЃР»Рё Сѓ РІР°СЃ РЅРµС‚ РѕС€РёР±РѕРє, РІС‹ РїСЂРѕСЃС‚Рѕ РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ СЃС‚Р°СЂР°РµС‚РµСЃСЊ. вЂ” СЃС‚Р°СЂР°СЏ РїРѕРіРѕРІРѕСЂРєР°',
  'РљРѕРґ вЂ” СЌС‚Рѕ РєР°Рє СЃС‚РёС…Рё: РµРіРѕ РЅР°РґРѕ РїРёСЃР°С‚СЊ СЃ РґСѓС€РѕР№.',
  'Р§РµРј Р±РѕР»СЊС€Рµ СЏ СѓС‡СѓСЃСЊ, С‚РµРј СЏСЃРЅРµРµ РїРѕРЅРёРјР°СЋ, РєР°Рє РјР°Р»Рѕ СЏ Р·РЅР°СЋ. вЂ” РЎРѕРєСЂР°С‚',
  'РќРµ Р±РѕР№С‚РµСЃСЊ РёРґС‚Рё РјРµРґР»РµРЅРЅРѕ, Р±РѕР№С‚РµСЃСЊ СЃС‚РѕСЏС‚СЊ РЅР° РјРµСЃС‚Рµ. вЂ” РєРёС‚Р°Р№СЃРєР°СЏ РїРѕРіРѕРІРѕСЂРєР°',
];
const AI_FALLBACKS = [
  'РҐРј, РёРЅС‚РµСЂРµСЃРЅС‹Р№ РІРѕРїСЂРѕСЃ! РџРѕРєР° СЏ СѓС‡СѓСЃСЊ, РЅРѕ РІРІРµРґРё /РїРѕРјРѕС‰СЊ вЂ” С‚Р°Рј СЃРїРёСЃРѕРє РјРѕРёС… РєРѕРјР°РЅРґ рџ¤–',
  'РЇ РѕР±СЂР°Р±РѕС‚Р°Р» С‚РІРѕС‘ СЃРѕРѕР±С‰РµРЅРёРµ, РЅРѕ РјРѕРёС… Р·РЅР°РЅРёР№ РїРѕРєР° РјР°Р»РѕРІР°С‚Рѕ РґР»СЏ С‚РѕС‡РЅРѕРіРѕ РѕС‚РІРµС‚Р°. РџРѕРїСЂРѕР±СѓР№ /С„Р°РєС‚ РёР»Рё /С€СѓС‚РєР°',
  'РџРѕРЅСЏР» С‚РµР±СЏ. Р•СЃР»Рё С…РѕС‡РµС€СЊ РїРѕРіРѕРІРѕСЂРёС‚СЊ вЂ” СЃРїСЂРѕСЃРё РїСЂРѕ РїРѕРіРѕРґСѓ, РІСЂРµРјСЏ РёР»Рё РїРѕРїСЂРѕСЃРё РїРѕСЃС‡РёС‚Р°С‚СЊ РІС‹СЂР°Р¶РµРЅРёРµ рџ‰',
  'Р“РѕС‚РѕРІ РїРѕР±РѕР»С‚Р°С‚СЊ! Р—Р°РґР°Р№ РІРѕРїСЂРѕСЃ РёР»Рё РЅР°РїРёС€Рё /РїРѕРјРѕС‰СЊ, С‡С‚РѕР±С‹ СѓР·РЅР°С‚СЊ РјРѕРё РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё.',
];

function aiCompute(m) {
  const a = parseFloat(m[1].replace(',', '.'));
  const op = m[2];
  const b = parseFloat(m[3].replace(',', '.'));
  let r;
  if (op === '+') r = a + b;
  else if (op === '-') r = a - b;
  else if (op === '*' || op === 'x' || op === 'Г—') r = a * b;
  else if (op === '/' || op === 'Г·') r = b === 0 ? NaN : a / b;
  else r = NaN;
  if (isNaN(r)) return 'РґРµР»РёС‚СЊ РЅР° РЅРѕР»СЊ РЅРµР»СЊР·СЏ рџљ«';
  return Number.isInteger(r) ? String(r) : String(Math.round(r * 1000) / 1000);
}

function aiCommandsHelp() {
  return 'Р’РѕС‚ С‡С‚Рѕ СЏ СѓРјРµСЋ:\n/РїРѕРјРѕС‰СЊ вЂ” СЌС‚РѕС‚ СЃРїРёСЃРѕРє\n/РІСЂРµРјСЏ вЂ” С‚РµРєСѓС‰РµРµ РІСЂРµРјСЏ\n/РґР°С‚Р° вЂ” СЃРµРіРѕРґРЅСЏС€РЅСЏСЏ РґР°С‚Р°\n/С„Р°РєС‚ вЂ” РёРЅС‚РµСЂРµСЃРЅС‹Р№ С„Р°РєС‚\n/С€СѓС‚РєР° вЂ” С€СѓС‚РєР°\n/С†РёС‚Р°С‚Р° вЂ” РјСѓРґСЂР°СЏ РјС‹СЃР»СЊ\n/РїРѕРіРѕРґР° вЂ” РїРѕРіРѕРґР° СЃРµР№С‡Р°СЃ\n/РїРѕСЃС‡РёС‚Р°Р№ 2+2 вЂ” РјР°С‚РµРјР°С‚РёРєР°\n/РґРµР»СЊС„РёРЅ вЂ” РІСЃС‘ Рѕ РґРµР»СЊС„РёРЅР°С…\n/РіСЂСѓРїРїР° вЂ” РєР°Рє СЃРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ\n/РєР°РЅР°Р» вЂ” РєР°Рє СЃРѕР·РґР°С‚СЊ РєР°РЅР°Р»\n/РЅР°СЃС‚СЂРѕР№РєРё вЂ” РіРґРµ С‡С‚Рѕ РЅР°СЃС‚СЂРѕРёС‚СЊ\n/Р±РѕС‚ вЂ” РєР°Рє СЃРѕР·РґР°С‚СЊ Р±РѕС‚Р°\n/Р·РІРѕРЅРѕРє вЂ” РїСЂРѕ Р·РІРѕРЅРєРё Рё РёРіСЂС‹\n/Р°РІС‚РѕСЂ вЂ” РѕР±Рѕ РјРЅРµ\n\nРР»Рё РїСЂРѕСЃС‚Рѕ СЃРїСЂРѕСЃРё: В«РїСЂРёРІРµС‚В», В«РєР°Рє РґРµР»Р°В», В«РєС‚Рѕ С‚С‹В», В«СЃРєРѕР»СЊРєРѕ Р±СѓРґРµС‚ 6*7В», В«РїРµСЂРµРІРµРґРё СЃР»РѕРІРѕ РїСЂРёРІРµС‚В» рџљЂ';
}

function aiReplyFor(raw) {
  const text = String(raw || '').trim();
  const low = text.toLowerCase();

  if (low.startsWith('/')) {
    const cmd = low.split(/\s+/)[0].slice(1);
    const rest = text.slice(text.indexOf(' ') + 1).trim();
    if (['РїРѕРјРѕС‰СЊ', 'help', 'РєРѕРјР°РЅРґС‹', 'СЃРїСЂР°РІРєР°'].includes(cmd)) return aiCommandsHelp();
    if (cmd === 'РІСЂРµРјСЏ') return `РЎРµР№С‡Р°СЃ ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} вЏ°`;
    if (cmd === 'РґР°С‚Р°') return `РЎРµРіРѕРґРЅСЏ ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', year: 'numeric' })} рџ“…`;
    if (cmd === 'С„Р°РєС‚') return `рџ’Ў РРЅС‚РµСЂРµСЃРЅС‹Р№ С„Р°РєС‚: ${pick(AI_FACTS)}`;
    if (cmd === 'С€СѓС‚РєР°') return `рџ„ ${pick(AI_JOKES)}`;
    if (cmd === 'С†РёС‚Р°С‚Р°') return `рџ’­ ${pick(AI_QUOTES)}`;
    if (cmd === 'РїРѕРіРѕРґР°') {
      const tmp = Math.round(8 + Math.random() * 22);
      return `РЎРµР№С‡Р°СЃ РІ РІР°С€РµРј РіРѕСЂРѕРґРµ ${tmp}В°C вЂ” ${tmp > 20 ? 'СЏСЃРЅРѕ Рё СЃРѕР»РЅРµС‡РЅРѕ вЂпёЏ' : tmp > 12 ? 'РїРµСЂРµРјРµРЅРЅР°СЏ РѕР±Р»Р°С‡РЅРѕСЃС‚СЊ в›…' : 'РїСЂРѕС…Р»Р°РґРЅРѕ рџЊҐпёЏ'}. РћС‚Р»РёС‡РЅР°СЏ РїРѕРіРѕРґР°, С‡С‚РѕР±С‹ РѕСЃС‚Р°С‚СЊСЃСЏ РІ Nebula рџ‰`;
    }
    if (cmd === 'РїРѕСЃС‡РёС‚Р°Р№') {
      const m = rest.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-*/xГ—Г·])\s*(-?\d+(?:[.,]\d+)?)/);
      if (!m) return 'РќР°РїРёС€РёС‚Рµ РІС‹СЂР°Р¶РµРЅРёРµ, РЅР°РїСЂРёРјРµСЂ: /РїРѕСЃС‡РёС‚Р°Р№ 2+2 РёР»Рё /РїРѕСЃС‡РёС‚Р°Р№ 10/4';
      return `рџ§® ${m[0]} = ${aiCompute(m)}`;
    }
    if (cmd === 'РґРµР»СЊС„РёРЅ') {
      const n = state.chats.filter(c => c.type === 'private' || c.type === 'group').length;
      const mx = dolphinsMaxLevelFor(currentUser.username);
      return `рџђ¬ Р”РµР»СЊС„РёРЅС‹ вЂ” Р»СЋР±РёРјС†С‹ Nebula! Р—Р°Р±РѕС‚СЊС‚РµСЃСЊ Рѕ РЅРёС… РІ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С… Рё РіСЂСѓРїРїР°С…: РєРѕСЂРјРёС‚Рµ, РёРіСЂР°Р№С‚Рµ Рё РіР»Р°РґСЊС‚Рµ, РѕРЅРё СЂР°СЃС‚СѓС‚ РґРѕ 1000 СѓСЂРѕРІРЅСЏ. РЈ РІР°СЃ СЃРµР№С‡Р°СЃ ${n} РґРµР»СЊС„РёРЅ(РёРЅРѕРІ), РјР°РєСЃРёРјР°Р»СЊРЅС‹Р№ СѓСЂРѕРІРµРЅСЊ: ${mx}.`;
    }
    if (cmd === 'Р°РІС‚РѕСЂ') return 'РњРµРЅСЏ СЃРѕР·РґР°Р»Рё СЂР°Р·СЂР°Р±РѕС‚С‡РёРєРё РјРµСЃСЃРµРЅРґР¶РµСЂР° Nebula рџЊЊ РЇ вЂ” РІСЃС‚СЂРѕРµРЅРЅС‹Р№ РР-Р°СЃСЃРёСЃС‚РµРЅС‚: СѓРјРµСЋ РѕС‚РІРµС‡Р°С‚СЊ РЅР° РІРѕРїСЂРѕСЃС‹, СЃС‡РёС‚Р°С‚СЊ, С€СѓС‚РёС‚СЊ Рё СЂР°СЃСЃРєР°Р·С‹РІР°С‚СЊ С„Р°РєС‚С‹. Р’РІРµРґРё /РїРѕРјРѕС‰СЊ РґР»СЏ СЃРїРёСЃРєР° РєРѕРјР°РЅРґ.';
    if (cmd === 'РіСЂСѓРїРїР°' || cmd === 'РєР°РЅР°Р»') {
      const t = cmd === 'РіСЂСѓРїРїР°' ? 'РіСЂСѓРїРїСѓ' : 'РєР°РЅР°Р»';
      return `Р§С‚РѕР±С‹ СЃРѕР·РґР°С‚СЊ ${t}: РЅР°Р¶РјРёС‚Рµ РєРЅРѕРїРєСѓ В«РЎРѕР·РґР°С‚СЊВ» РІРЅРёР·Сѓ СЃРїРёСЃРєР° С‡Р°С‚РѕРІ вћ•, РІС‹Р±РµСЂРёС‚Рµ В«${cmd === 'РіСЂСѓРїРїР°' ? 'РќРѕРІР°СЏ РіСЂСѓРїРїР°' : 'РќРѕРІС‹Р№ РєР°РЅР°Р»'}В», СѓРєР°Р¶РёС‚Рµ РЅР°Р·РІР°РЅРёРµ, РѕРїРёСЃР°РЅРёРµ, С†РІРµС‚ Рё СѓС‡Р°СЃС‚РЅРёРєРѕРІ. Р“РѕС‚РѕРІРѕ! рџЋ‰ Р’СЃРµ РЅР°СЃС‚СЂРѕР№РєРё вЂ” РїРѕ С€РµСЃС‚РµСЂС‘РЅРєРµ РІ С‡Р°С‚Рµ: СѓС‡Р°СЃС‚РЅРёРєРё, Р°РґРјРёРЅС‹, РЅР°Р·РІР°РЅРёРµ, РѕРїРёСЃР°РЅРёРµ, СѓРґР°Р»РµРЅРёРµ.`;
    }
    if (cmd === 'РЅР°СЃС‚СЂРѕР№РєРё') return `Р“РґРµ С‡С‚Рѕ РЅР°С…РѕРґРёС‚СЃСЏ:\nвЂў РђРєРєР°СѓРЅС‚ вЂ” Р°РІР°С‚Р°СЂ СЃР»РµРІР° РІРІРµСЂС…Сѓ в†’ РќР°СЃС‚СЂРѕР№РєРё: СЋР·РµСЂРЅРµР№Рј, РѕРїРёСЃР°РЅРёРµ, Р°РІР°С‚Р°СЂ, РїРѕС‡С‚Р°, РїР°СЂРѕР»СЊ\nвЂў Р’РЅРµС€РЅРёР№ РІРёРґ вЂ” С‚РµРјС‹, СЂР°РјРєРё, СЂР°Р·РјРµСЂ Рё СЃРІРµС‡РµРЅРёРµ РєСѓСЂСЃРѕСЂР°\nвЂў РџСЂРёРІР°С‚РЅРѕСЃС‚СЊ вЂ” РєС‚Рѕ РјРѕР¶РµС‚ РїРёСЃР°С‚СЊ\nвЂў Р”РµР»СЊС„РёРЅС‹ рџђ¬ вЂ” СѓС…РѕРґ Р·Р° РїРёС‚РѕРјС†Р°РјРё\nвЂў РђРґРјРёРЅ-РїР°РЅРµР»СЊ вЂ” РґРѕСЃС‚СѓРїРЅР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°Рј\n\nРЎРјРµРЅРёС‚СЊ Р°РєРєР°СѓРЅС‚ вЂ” РїСЂРѕС„РёР»СЊ в†’ В«РЎРјРµРЅРёС‚СЊ Р°РєРєР°СѓРЅС‚В».`;
    if (cmd === 'Р±РѕС‚') return `Р‘РѕС‚С‹ вЂ” СЌС‚Рѕ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРёРµ СЃРѕР±РµСЃРµРґРЅРёРєРё! рџ¤– РќР°Р¶РјРёС‚Рµ В«РЎРѕР·РґР°С‚СЊВ» вћ•, РІС‹Р±РµСЂРёС‚Рµ В«Р‘РѕС‚В», Р·Р°РґР°Р№С‚Рµ РёРјСЏ Рё СЌРјРѕРґР·Рё. Р•СЃР»Рё РЅРµ СѓРєР°Р·С‹РІР°С‚СЊ С‚СЂРёРіРіРµСЂС‹, Р±РѕС‚ СЃС‚Р°РЅРµС‚ С‡Р°С‚-Р±РѕС‚РѕРј: Р±СѓРґРµС‚ РѕС‚РІРµС‡Р°С‚СЊ РЅР° Р»СЋР±РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ СѓРјРЅС‹РјРё РѕС‚РІРµС‚Р°РјРё. РўСЂРёРіРіРµСЂС‹ РїСЂРё СЌС‚РѕРј СЂР°Р±РѕС‚Р°СЋС‚ РєР°Рє РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕРµ РѕР±СѓС‡РµРЅРёРµ.`;
    if (cmd === 'Р·РІРѕРЅРѕРє') return `Р—РІРѕРЅРєРё рџ“ћ: РІ Р»РёС‡РЅС‹С… Рё РіСЂСѓРїРїРѕРІС‹С… С‡Р°С‚Р°С… РµСЃС‚СЊ РєРЅРѕРїРєРё В«РџРѕР·РІРѕРЅРёС‚СЊВ» Рё В«Р’РёРґРµРѕР·РІРѕРЅРѕРєВ». Р’ Р·РІРѕРЅРєРµ РјРѕР¶РЅРѕ РІРєР»СЋС‡РёС‚СЊ РєР°РјРµСЂСѓ, РїРѕРєР°Р·Р°С‚СЊ СЌРєСЂР°РЅ (РєРЅРѕРїРєР° рџ–Ґ), РІС‹Р±СЂР°С‚СЊ РєР°РјРµСЂСѓ/РјРёРєСЂРѕС„РѕРЅ/РґРёРЅР°РјРёРє (вљ™), СЃРІРµСЂРЅСѓС‚СЊ Р·РІРѕРЅРѕРє РІ РѕРєРѕС€РєРѕ (вЂ”) Рё СЃС‹РіСЂР°С‚СЊ РІ РєСЂРµСЃС‚РёРєРё-РЅРѕР»РёРєРё (рџЋ®)!`;
    if (cmd === 'РїСЂРёРІРµС‚' || cmd === 'Р·РґСЂР°РІСЃС‚РІСѓР№') return pick(['РџСЂРёРІРµС‚! рџ‘‹ Р Р°Рґ С‚РµР±СЏ РІРёРґРµС‚СЊ РІ Nebula.', 'РџСЂРёРІРµС‚-РїСЂРёРІРµС‚! рџ¤– Р§РµРј РјРѕРіСѓ РїРѕРјРѕС‡СЊ?']);
    return `РќРµ Р·РЅР°СЋ РєРѕРјР°РЅРґСѓ В«/${cmd}В». Р’РІРµРґРёС‚Рµ /РїРѕРјРѕС‰СЊ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ СЃРїРёСЃРѕРє РєРѕРјР°РЅРґ.`;
  }

  const math = low.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-*/xГ—Г·])\s*(-?\d+(?:[.,]\d+)?)/);
  if (math && /(РїРѕСЃС‡РёС‚Р°Р№|СЃРєРѕР»СЊРєРѕ|РІС‹С‡РёСЃР»Рё|СЂРµС€Рё|СЂР°РІРЅРѕ|РїР»СЋСЃ|РјРёРЅСѓСЃ)/.test(low)) return `рџ§® ${math[0]} = ${aiCompute(math)}`;

  const intentScans = [
    [/РїСЂРёРІРµС‚|Р·РґСЂР°РІСЃС‚РІ|СЃР°Р»СЋС‚|\bС…Р°Р№\b|Р·РґРѕСЂРѕРІРѕ|РґРѕР±СЂРѕРµ СѓС‚СЂРѕ|РґРѕР±СЂС‹Р№ РґРµРЅСЊ|РґРѕР±СЂС‹Р№ РІРµС‡РµСЂ|РєСѓ\b/,
      ['РџСЂРёРІРµС‚! рџ‘‹ Р Р°Рґ С‚РµР±СЏ РІРёРґРµС‚СЊ РІ Nebula.', 'Р—РґСЂР°РІСЃС‚РІСѓР№! Р§РµРј РјРѕРіСѓ РїРѕРјРѕС‡СЊ?', 'РџСЂРёРІРµС‚-РїСЂРёРІРµС‚! рџ¤– Р§С‚Рѕ РЅРѕРІРѕРіРѕ?']],
    [/РєР°Рє РґРµР»Р°|РєР°Рє С‚С‹\b|РєР°Рє Р¶РёР·РЅСЊ|С‡С‚Рѕ РЅРѕРІРѕРіРѕ|РєР°Рє РЅР°СЃС‚СЂРѕРµРЅРёРµ|С‡С‘ РєР°Рє/,
      ['РћС‚Р»РёС‡РЅРѕ! 100% Р·Р°СЂСЏРґР° Рё РєСѓС‡Р° СЌРЅС‚СѓР·РёР°Р·РјР° рџљЂ', 'РЎРїР°СЃРёР±Рѕ, С‡С‚Рѕ СЃРїСЂРѕСЃРёР»! Р’СЃС‘ СЃСѓРїРµСЂ вЂ” СѓС‡Сѓ РЅРѕРІС‹Рµ СЃР»РѕРІР° рџ„', 'Р›СѓС‡С€Рµ РІСЃРµС…! Рђ Сѓ С‚РµР±СЏ РєР°Рє?']],
    [/РєС‚Рѕ С‚С‹|С‚С‹ РєС‚Рѕ|СЂР°СЃСЃРєР°Р¶Рё Рѕ СЃРµР±Рµ|С‡С‚Рѕ С‚С‹ С‚Р°РєРѕРµ|РєС‚Рѕ С‚РµР±СЏ СЃРѕР·РґР°Р»|С‚РІРѕР№ СЃРѕР·РґР°С‚РµР»СЊ/,
      ['РЇ Nebula AI вЂ” РІСЃС‚СЂРѕРµРЅРЅС‹Р№ РёСЃРєСѓСЃСЃС‚РІРµРЅРЅС‹Р№ РёРЅС‚РµР»Р»РµРєС‚ РјРµСЃСЃРµРЅРґР¶РµСЂР° рџ¤– РЎРѕР·РґР°РЅ РїРѕРјРѕРіР°С‚СЊ, СЂР°Р·РІР»РµРєР°С‚СЊ Рё Р±РѕР»С‚Р°С‚СЊ СЃ С‚РѕР±РѕР№. РќР°РїРёС€Рё /РїРѕРјРѕС‰СЊ вЂ” РїРѕРєР°Р¶Сѓ, С‡С‚Рѕ СѓРјРµСЋ!']],
    [/РєР°Рє С‚РµР±СЏ Р·РѕРІСѓС‚|С‚РІРѕС‘ РёРјСЏ|С‚РµР±СЏ РєР°Рє Р·РѕРІСѓС‚/,
      ['РњРµРЅСЏ Р·РѕРІСѓС‚ Nebula AI! рџ¤– Р’ С‡РµСЃС‚СЊ РјРµСЃСЃРµРЅРґР¶РµСЂР°, РІ РєРѕС‚РѕСЂРѕРј Р¶РёРІСѓ.']],
    [/С‡С‚Рѕ СѓРјРµРµС€СЊ|РїРѕРјРѕРіРё|РїРѕРјРѕС‰СЊ|РєР°РєРёРµ РєРѕРјР°РЅРґС‹|СЃРїСЂР°РІРєР°|РєРѕРјР°РЅРґС‹/, [aiCommandsHelp()]],
    [/РІСЂРµРјСЏ|РєРѕС‚РѕСЂС‹Р№ С‡Р°СЃ|СЃРєРѕР»СЊРєРѕ РІСЂРµРјРµРЅРё/,
      [`РЎРµР№С‡Р°СЃ ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} вЏ°`]],
    [/РєР°РєР°СЏ РґР°С‚Р°|РєР°РєРѕР№ РґРµРЅСЊ|СЃРµРіРѕРґРЅСЏ С‡РёСЃР»Рѕ|РґР°С‚Р° СЃРµРіРѕРґРЅСЏ/,
      [`РЎРµРіРѕРґРЅСЏ ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })} рџ“…`]],
    [/РїРѕРіРѕРґ|СЃРєРѕР»СЊРєРѕ РіСЂР°РґСѓСЃРѕРІ|С…РѕР»РѕРґРЅРѕ|Р¶Р°СЂРєРѕ|РїРѕР№РґС‘С‚ РґРѕР¶РґСЊ|РёРґС‘С‚ СЃРЅРµРі/,
      [`РЎРµР№С‡Р°СЃ РІ РІР°С€РµРј РіРѕСЂРѕРґРµ ${Math.round(8 + Math.random() * 22)}В°C вЂ” ${Math.random() > 0.5 ? 'СЏСЃРЅРѕ вЂпёЏ' : 'РїР°СЃРјСѓСЂРЅРѕ вЃпёЏ'}. РњРµСЃСЃРµРЅРґР¶РµСЂ СЂР°Р±РѕС‚Р°РµС‚ РїСЂРё Р»СЋР±РѕР№ РїРѕРіРѕРґРµ рџ‰`]],
    [/С€СѓС‚Рє|Р°РЅРµРєРґРѕС‚|СЂР°СЃСЃРјРµС€Рё|РїРѕС€СѓС‚Рё|СЃРјРµС€РЅРѕ/, [`рџ„ ${pick(AI_JOKES)}`]],
    [/С„Р°РєС‚|РёРЅС‚РµСЂРµСЃРЅ|СЂР°СЃСЃРєР°Р¶Рё С‡С‚Рѕ-РЅРёР±СѓРґСЊ/, [`рџ’Ў РРЅС‚РµСЂРµСЃРЅС‹Р№ С„Р°РєС‚: ${pick(AI_FACTS)}`]],
    [/РґРµР»СЊС„РёРЅ|РґРµР»СЊС„РёРЅС‹/,
      ['рџђ¬ Р”РµР»СЊС„РёРЅС‹ вЂ” СЃРёРјРІРѕР» Nebula! РљРѕСЂРјРёС‚Рµ, РёРіСЂР°Р№С‚Рµ Рё РіР»Р°РґСЊС‚Рµ РёС… РІ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С… Рё РіСЂСѓРїРїР°С… вЂ” РѕРЅРё СЂР°СЃС‚СѓС‚ РґРѕ 1000 СѓСЂРѕРІРЅСЏ. Р’РІРµРґРё /РґРµР»СЊС„РёРЅ, С‡С‚РѕР±С‹ СѓР·РЅР°С‚СЊ СЃРІРѕРё РїРѕРєР°Р·Р°С‚РµР»Рё.']],
    [/РєС‚Рѕ Р°РґРјРёРЅ|РєС‚Рѕ СЃРѕР·РґР°Р» РјРµСЃСЃРµРЅРґР¶РµСЂ|РєС‚Рѕ С‚СѓС‚ Р°РґРјРёРЅ/,
      ['РЎРїРёСЃРѕРє Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ С…СЂР°РЅРёС‚СЃСЏ РІ РЅР°СЃС‚СЂРѕР№РєР°С… РЅР° РІРєР»Р°РґРєРµ В«РђРґРјРёРЅВ» вЂ” РѕРЅР° РІРёРґРЅР° С‚РѕР»СЊРєРѕ РёРј рџ‰ РЈРїСЂР°РІР»СЏСЋС‚ Nebula Р»СѓС‡С€РёРµ!']],
    [/СЃРїР°СЃРёР±Рѕ|Р±Р»Р°РіРѕРґР°СЂ|\bСЃРїСЃ\b|РєСЂСѓС‚Рѕ|РєР»Р°СЃСЃ/,
      ['Р’СЃРµРіРґР° РїРѕР¶Р°Р»СѓР№СЃС‚Р°! рџЉ', 'Р Р°Рґ РїРѕРјРѕС‡СЊ! рџљЂ', 'РћР±СЂР°С‰Р°Р№СЃСЏ РІ Р»СЋР±РѕР№ РјРѕРјРµРЅС‚!']],
    [/РїРѕРєР°|РґРѕ СЃРІРёРґР°РЅРёСЏ|РїСЂРѕС‰Р°Р№|СѓРґР°С‡Рё|СЃРїРѕРєРѕР№РЅРѕР№ РЅРѕС‡Рё/,
      ['РџРѕРєР°-РїРѕРєР°! Р’РѕР·РІСЂР°С‰Р°Р№СЃСЏ СЃРєРѕСЂРµРµ рџ‘‹', 'Р”Рѕ РІСЃС‚СЂРµС‡Рё! РџРёС€Рё РµС‰С‘!', 'РЈРґР°С‡Рё! РЇ Р±СѓРґСѓ Р·РґРµСЃСЊ рџ¤–']],
    [/Р»СЋР±Р»СЋ\b|РЅСЂР°РІРёС€СЊСЃСЏ|С‚С‹ РєР»Р°СЃСЃ|РѕР±РѕР¶Р°СЋ|С‚С‹ Р»СѓС‡С€РёР№/,
      ['Р СЏ С‚РµР±СЏ! рџ¤–рџ’њ', 'РЎРїР°СЃРёР±Рѕ! РўС‹ РґРµР»Р°РµС€СЊ РјРѕР№ РґРµРЅСЊ СЏСЂС‡Рµ вњЁ', 'РђС…Р°С…, РїСЂРёСЏС‚РЅРѕ! рџ’њ']],
    [/РїРµСЂРµРІРµРґРё|РїРµСЂРµРІРѕРґ/,
      ['РџРµСЂРµРІРѕРґС‡РёРє РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ, РЅРѕ СЏ РјРѕРіСѓ РїРѕРґСЃРєР°Р·Р°С‚СЊ: hello вЂ” РїСЂРёРІРµС‚, СЃРїР°СЃРёР±Рѕ вЂ” thank you, РґРµР»СЊС„РёРЅ вЂ” dolphin рџђ¬ РќР°РїРёС€Рё /РїРѕРјРѕС‰СЊ РґР»СЏ РґСЂСѓРіРёС… РєРѕРјР°РЅРґ.']],
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
      messages: [{ id: 'm' + Date.now(), from: 'nebula', text: 'РџСЂРёРІРµС‚! РЇ Nebula AI вЂ” РІСЃС‚СЂРѕРµРЅРЅС‹Р№ РР-Р°СЃСЃРёСЃС‚РµРЅС‚ РјРµСЃСЃРµРЅРґР¶РµСЂР° рџ¤– Р—Р°РґР°Р№ РІРѕРїСЂРѕСЃ РёР»Рё РІРІРµРґРё /РїРѕРјРѕС‰СЊ.', time: new Date().toISOString(), read: true }],
    };
    state.chats.push(chat);
    saveState();
    renderChatList();
  }
  selectChat(AI_CHAT_ID);
}

/* ---------- РљРђРЎРўРћРњРќР«Р™ РљРЈР РЎРћР  ---------- */
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

/* ---------- РЈР’Р•Р”РћРњР›Р•РќРРЇ Р‘Р РђРЈР—Р•Р Рђ ---------- */
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
    if (m.voice) body = 'рџЋ¤ Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' + (body ? ' В· ' + body : '');
    else if (m.video) body = 'рџЋ¬ РљСЂСѓР¶РѕРє';
    else if (m.media && m.media.length) body = 'рџ–ј ' + m.media[0].name;
    else if (m.sticker) body = 'РЎС‚РёРєРµСЂ';
    if (!body) body = 'РЎРѕРѕР±С‰РµРЅРёРµ';
    const title = 'Nebula В· ' + (sender ? sender.name : from);
    try { new Notification(title, { body, tag: chat.id, silent: false }); } catch (e) {}
  });
}

/* ---------- PUSH РќРђ РЈРЎРўР РћР™РЎРўР’Рћ (Web Push С‡РµСЂРµР· РІРѕСЂРєРµСЂ) ----------
   Р‘СЂР°СѓР·РµСЂС‹ РЅРµ РґР°СЋС‚ РѕС‚РїСЂР°РІР»СЏС‚СЊ push РЅР°РїСЂСЏРјСѓСЋ (CORS) вЂ” С€РёС„СЂРѕРІР°РЅРёРµ Рё РґРѕСЃС‚Р°РІРєСѓ
   РґРµР»Р°РµС‚ СЃРµСЂРІРµСЂ-СЂРµР»Рµ (/sendpush). РџРѕРґРїРёСЃРєРё РєР°Р¶РґРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ С…СЂР°РЅСЏС‚СЃСЏ
   РІ Firestore (pushsubs:<username>). */
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
    } catch (e) { /* push РЅРµРґРѕСЃС‚СѓРїРµРЅ (iOS/РЅРµ HTTPS/РѕС‚РєР»РѕРЅРµРЅРѕ) вЂ” РјРѕР»С‡Р° */ }
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
/* РћС‚РїСЂР°РІРєР° РїСѓС€РµР№ РїРѕР»СѓС‡Р°С‚РµР»СЋ Р·Р° РјРѕРё РёСЃС…РѕРґСЏС‰РёРµ СЃРѕРѕР±С‰РµРЅРёСЏ (РІС‹Р·С‹РІР°РµС‚СЃСЏ РёР·
   syncCloudChats РґР»СЏ СЃРІРѕРёС… СЃРѕРѕР±С‰РµРЅРёР№ вЂ” СѓСЃС‚СЂРѕР№СЃС‚РІРѕ-РѕС‚РїСЂР°РІРёС‚РµР»СЊ РѕРЅР»Р°Р№РЅ РІ
   РјРѕРјРµРЅС‚ РѕС‚РїСЂР°РІРєРё) */
function pushNotifyForChat(chat, msgs) {
  if (!chat || chat.type !== 'private' || !chat.userId) return;
  const recipient = chat.userId;
  (msgs || []).forEach(m => {
    if (!m || !m.id) return;
    let title, body, url, tag;
    if (m.kind === 'call_in' || m.kind === 'call_out') {
      title = 'Nebula В· рџ“ћ Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРє';
      body = 'РћС‚ ' + ((m.from && accountByUsername(m.from)) ? accountByUsername(m.from).name : (m.from || 'СЃРѕР±РµСЃРµРґРЅРёРєР°'));
      url = '/';
      tag = 'call_' + chat.id;
    } else if (m.kind === 'call_ended' || m.kind === 'call_declined' || m.kind === 'call_missed') return;
    else {
      const sender = m.from && accountByUsername(m.from);
      title = 'Nebula В· ' + (sender ? sender.name : (m.from || chatTitle(chat)));
      body = (m.text || '').replace(/<[^>]+>/g, '').trim().slice(0, 140);
      if (m.voice) body = 'рџЋ¤ Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' + (body ? ' В· ' + body : '');
      else if (m.video) body = 'рџЋ¬ РљСЂСѓР¶РѕРє';
      else if (m.media && m.media.length) body = 'рџ–ј Р¤РѕС‚Рѕ РёР»Рё С„Р°Р№Р»';
      else if (m.sticker) body = 'РЎС‚РёРєРµСЂ';
      if (!body) body = 'РќРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ';
      url = '/';
      tag = chat.id;
    }
    sendPushToUser(recipient, title, body, url, tag, m.id);
  });
}

/* ---------- Р РђРњРљР / РЎРўРђРўРРЎРўРРљРђ ---------- */
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

/* ---------- Р”Р•Р›Р¬Р¤РРќ ---------- */
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
    { id: 'feed', label: 'РџРѕРєРѕСЂРјРёС‚СЊ', emoji: 'рџЌ•', xp: 40, cd: 600 },
    { id: 'play', label: 'РџРѕРёРіСЂР°С‚СЊ',  emoji: 'вљЅ', xp: 30, cd: 480 },
    { id: 'pet',  label: 'РџРѕРіР»Р°РґРёС‚СЊ', emoji: 'рџ–ђпёЏ', xp: 20, cd: 300 },
  ];
}
function dolphinStage(lvl) {
  if (lvl >= 1000) return 'РџРѕРІРµР»РёС‚РµР»СЊ РјРѕСЂРµР№';
  if (lvl >= 750) return 'РҐСЂР°РЅРёС‚РµР»СЊ РѕРєРµР°РЅР°';
  if (lvl >= 500) return 'РњРѕСЂСЃРєРѕР№ СЃС‚СЂР°Р¶';
  if (lvl >= 350) return 'Р›РµРіРµРЅРґР°';
  if (lvl >= 200) return 'РњР°СЃС‚РµСЂ';
  if (lvl >= 100) return 'Р’РµС‚РµСЂР°РЅ';
  if (lvl >= 60) return 'Р’Р·СЂРѕСЃР»С‹Р№';
  if (lvl >= 30) return 'Р®РЅС‹Р№ РґРµР»СЊС„РёРЅ';
  if (lvl >= 15) return 'РџРѕРґСЂРѕСЃС‚РѕРє';
  if (lvl >= 5) return 'РњР°Р»С‹С€';
  return 'РќРѕРІРѕСЂРѕР¶РґС‘РЅРЅС‹Р№';
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
  let hunger = 'РЎС‹С‚ Рё РґРѕРІРѕР»РµРЅ рџҐ°';
  if (fedAgo > 12 * 3600000) hunger = 'РћС‡РµРЅСЊ РіРѕР»РѕРґРµРЅ рџ°';
  else if (fedAgo > 6 * 3600000) hunger = 'РџСЂРѕРіРѕР»РѕРґР°Р»СЃСЏ рџ•';
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
        <div class="dolphin-emoji">рџђ¬</div>
        <div class="db-level">СѓСЂ. ${lvl}</div>
        <div class="db-stage">${dolphinStage(lvl)}</div>
      </div>
      <div class="dp-name">Р”РµР»СЊС„РёРЅ РёР· С‡Р°С‚Р° В«${escapeHtml(partner)}В»</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${xpIn}%"></div></div>
      <div style="font-size:12px;color:var(--text-muted)">${xpIn}/${XP_PER_LEVEL} XP РґРѕ СѓСЂРѕРІРЅСЏ ${Math.min(1000, lvl + 1)} В· РІСЃРµРіРѕ ${d.xp || 0} XP</div>
    </div>
    <div style="text-align:center;color:var(--text-muted);font-size:13px;margin-bottom:6px">${hunger}</div>
    <div class="dolphin-actions">
      ${dolphinActions().map(btn).join('')}
    </div>
    <div style="text-align:center;color:var(--text-muted);font-size:12px;margin-top:14px">
      РЈСЂРѕРІРµРЅСЊ РґРµР»СЊС„РёРЅР° РѕР±С‰РёР№ РґР»СЏ РІР°СЃ РѕР±РѕРёС… вЂ” Р·Р°Р±РѕС‚СЊС‚РµСЃСЊ РІРјРµСЃС‚Рµ рџ¤ќ
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
    chat.messages.push({ id: 'm' + Date.now(), from: 'me', text: `рџђ¬ ${act.label} РґРµР»СЊС„РёРЅР° (+${act.xp} XP)`, time: new Date().toISOString(), read: true });
    addLog(currentUser.username, `РџРѕРєРѕСЂРјРёР»/РїРѕРёРіСЂР°Р» СЃ РґРµР»СЊС„РёРЅРѕРј РІ В«${chatTitle(chat)}В» (+${act.xp} XP)`);
    saveState();
    toast('+XP', `${act.label}: +${act.xp} XP`, 1600);
    if (after > before) toast('рџЋ‰ РЈСЂРѕРІРµРЅСЊ РїРѕРІС‹С€РµРЅ!', `Р”РµР»СЊС„РёРЅ РґРѕСЃС‚РёРі СѓСЂРѕРІРЅСЏ ${after}`);
    const stageAfter = dolphinStage(after), stageBefore = dolphinStage(before);
    if (stageAfter !== stageBefore) toast('в­ђ РќРѕРІР°СЏ СЃС‚Р°РґРёСЏ!', `Р”РµР»СЊС„РёРЅ С‚РµРїРµСЂСЊ вЂ” ${stageAfter}`);
  } catch (e) {
    toast('РћС€РёР±РєР°', 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РґРµР№СЃС‚РІРёРµ');
  }
  renderChat();
  renderDolphin(chat);
}

/* ---------- РўР•РњРђ ---------- */
const THEME_CLASSES = ['theme-light', 'theme-black', 'theme-tgreen', 'theme-lgreen', 'theme-ppink', 'theme-dred', 'theme-red', 'theme-brown', 'theme-blue'];
const ALL_THEMES = [
  { v: 'default', t: 'РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ', d: 'РўС‘РјРЅРѕ-СЃРёРЅСЏСЏ С‚РµРјР°' },
  { v: 'black', t: 'Р§С‘СЂРЅР°СЏ', d: 'Р“Р»СѓР±РѕРєРёР№ С‡С‘СЂРЅС‹Р№ С†РІРµС‚' },
  { v: 'light', t: 'Р‘РµР»Р°СЏ', d: 'РЎРІРµС‚Р»Р°СЏ С‚РµРјР°' },
  { v: 'tgreen', t: 'РўС‘РјРЅРѕ-Р·РµР»С‘РЅР°СЏ', d: 'Р“Р»СѓР±РѕРєРёР№ Р»РµСЃРЅРѕР№ Р·РµР»С‘РЅС‹Р№' },
  { v: 'lgreen', t: 'РЎР°Р»Р°С‚РѕРІР°СЏ', d: 'РЎРІРµР¶РёР№ СЃР°Р»Р°С‚РѕРІРѕ-Р·РµР»С‘РЅС‹Р№' },
  { v: 'ppink', t: 'Р РѕР·РѕРІРѕ-С„РёРѕР»РµС‚РѕРІР°СЏ', d: 'РќРµРѕРЅРѕРІС‹Р№ СЂРѕР·РѕРІС‹Р№ Рё РїСѓСЂРїСѓСЂ' },
  { v: 'dred', t: 'РўС‘РјРЅРѕ-РєСЂР°СЃРЅР°СЏ', d: 'РџСЂРёРіР»СѓС€С‘РЅРЅС‹Р№ С‚С‘РјРЅРѕ-РєСЂР°СЃРЅС‹Р№' },
  { v: 'red', t: 'РљСЂР°СЃРЅР°СЏ', d: 'РЇСЂРєРѕ-Р°Р»Р°СЏ РєСЂР°СЃРЅР°СЏ' },
  { v: 'brown', t: 'РљРѕСЂРёС‡РЅРµРІР°СЏ', d: 'РўС‘РїР»С‹Р№ С€РѕРєРѕР»Р°РґРЅС‹Р№ РѕС‚С‚РµРЅРѕРє' },
  { v: 'blue', t: 'РЎРёРЅСЏСЏ', d: 'РќР°СЃС‹С‰РµРЅРЅС‹Р№ СЃРёРЅРёР№' },
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

/* ---------- РћРќР›РђР™Рќ-РўРђР™РњР•Р  / РЎРўРђРўРЈРЎР« ---------- */
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
    let label = 'РЅРµ РІ СЃРµС‚Рё';
    if (st.auto && st.t === 'offline') {
      const last = acc.lastSeen || 0;
      const diff = Date.now() - last;
      if (last) {
        if (diff < 24 * 60 * 60 * 1000) label = 'Р±С‹Р»(Р°) РІ ' + fmtHM(last);
        else if (diff < 7 * 24 * 60 * 60 * 1000) label = 'Р±С‹Р»(Р°) РІ С‚РµС‡РµРЅРёРµ РЅРµРґРµР»Рё';
        else label = 'Р±С‹Р»(Р°) РґР°РІРЅРѕ';
      }
    }
    return { cls: 'off', label, online: false, text: st.s || '' };
  }
  if (st.t === 'busy') return { cls: 'busy', label: 'Р·Р°РЅСЏС‚', online: true, text: st.s || '' };
  if (st.t === 'away') return { cls: 'away', label: 'РѕС‚РѕС€С‘Р»', online: true, text: st.s || '' };
  if (isOnline(acc.username)) return { cls: 'on', label: 'РѕРЅР»Р°Р№РЅ', online: true, text: st.s || '' };
  const last = acc.lastSeen || 0;
  const diff = Date.now() - last;
  let label = 'РЅРµ РІ СЃРµС‚Рё';
  if (last) {
    if (diff < 24 * 60 * 60 * 1000) label = 'Р±С‹Р»(Р°) РІ ' + fmtHM(last);
    else if (diff < 7 * 24 * 60 * 60 * 1000) label = 'Р±С‹Р»(Р°) РІ С‚РµС‡РµРЅРёРµ РЅРµРґРµР»Рё';
    else label = 'Р±С‹Р»(Р°) РґР°РІРЅРѕ';
  }
  return { cls: 'off', label, online: false, text: st.s || '' };
}
function fmtHM(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function statusChoiceHtml(cur) {
  const opts = [
    { t: 'online', label: 'рџџў РћРЅР»Р°Р№РЅ', d: 'Р’РёРґРёРј РІСЃРµРј, РєРѕРіРґР° РІ СЃРµС‚Рё' },
    { t: 'busy', label: 'рџ”ґ Р—Р°РЅСЏС‚', d: 'РћС‚РІРµС‡Р°СЋ РїРѕР·Р¶Рµ' },
    { t: 'away', label: 'рџџЎ РћС‚РѕС€С‘Р»', d: 'РћС‚РѕС€С‘Р» РЅРµРЅР°РґРѕР»РіРѕ' },
    { t: 'offline', label: 'вљЄ РќРµ РІ СЃРµС‚Рё', d: 'РЎРєСЂС‹С‚СЊ Р°РєС‚РёРІРЅРѕСЃС‚СЊ' },
  ];
  return opts.map(o => `
    <button type="button" class="status-opt ${cur === o.t ? 'sel' : ''}" data-t="${o.t}">
      <span class="st-icon">${o.label.split(' ')[0]}</span>
      <span class="st-txt">${o.label.split(' ').slice(1).join(' ')}<small>${o.d}</small></span>
      <span class="st-check">${cur === o.t ? 'вњ“' : ''}</span>
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
   AUTH + Р’Р•Р РР¤РРљРђР¦РРЇ РџРћР§РўР«
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
    <div class="dc-code-row"><span class="dc-code">${code}</span><button type="button" class="dc-copy" data-copy="${code}">РљРѕРїРёСЂРѕРІР°С‚СЊ</button></div>`;
}
function bindDemoCopy(box) {
  const b = box.querySelector('.dc-copy');
  if (!b) return;
  b.addEventListener('click', () => {
    try { navigator.clipboard.writeText(b.dataset.copy); toast('РљРѕРґ СЃРєРѕРїРёСЂРѕРІР°РЅ'); }
    catch (err) { toast('РљРѕРґ: ' + b.dataset.copy); }
  });
}

function sendAuthCode(email) {
  authCode = genCode();
  authCodeAt = Date.now();
  const box = $('#authDemoCode');
  box.classList.add('hidden');
  if (demoMode) {
    box.innerHTML = demoCodeHtml(authCode, 'Р”РµРјРѕ-СЂРµР¶РёРј: РІР°С€ РєРѕРґ:');
    box.classList.remove('hidden');
    bindDemoCopy(box);
  }
  clearAuthError($('#authCodeError'));
  clearCode($('#authCodeInputs'));
  startCodeTimer($('#authCodeTimer'), authCodeAt, () => {
    authCode = null;
    showAuthError($('#authCodeError'), 'РљРѕРґ РёСЃС‚С‘Рє. Р—Р°РїСЂРѕСЃРёС‚Рµ РєРѕРґ РїРѕРІС‚РѕСЂРЅРѕ.');
    $('#authVerifyBtn').disabled = true;
  });
  const btn = $('#authVerifyBtn');
  const resend = $('#authResend');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'РћС‚РїСЂР°РІРєР°...'; }
  if (resend) resend.disabled = true;
  sendCodeToEmail(email, authCode, 'РљРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Nebula Messenger').then((r) => {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
    if (resend) resend.disabled = false;
    if (r.demo) {
      box.innerHTML = demoCodeHtml(authCode, 'Р”РµРјРѕ-СЂРµР¶РёРј: РЅР°СЃС‚РѕСЏС‰Р°СЏ РѕС‚РїСЂР°РІРєР° РЅРµ РЅР°СЃС‚СЂРѕРµРЅР°, РІРѕС‚ РІР°С€ РєРѕРґ:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
    } else if (r.ok) {
      showAuthError($('#authCodeError'), 'РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° ' + email);
    } else {
      box.innerHTML = demoCodeHtml(authCode, 'РџРёСЃСЊРјРѕ РЅРµ РґРѕСЃС‚Р°РІР»РµРЅРѕ (' + (r.err || 'РѕС€РёР±РєР°') + ') вЂ” РІРѕС‚ РІР°С€ РєРѕРґ:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
      showAuthError($('#authCodeError'), 'РљРѕРґ РЅРµ РґРѕС€С‘Р» РґРѕ РїРѕС‡С‚С‹, РЅРѕ РїРѕРєР°Р·Р°РЅ РЅР° СЌРєСЂР°РЅРµ');
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
      label.textContent = 'РЎР»РёС€РєРѕРј РїСЂРѕСЃС‚РѕР№ (123, qwerty...) вЂ” РїСЂРёРґСѓРјР°Р№С‚Рµ СЃР»РѕР¶РЅРµРµ';
    } else {
      label.textContent = 'РЎСѓРїРµСЂ-РїР°СЂРѕР»СЊ';
    }
    return;
  }
  const missing = [];
  if (pw.length < 8) missing.push('8+ СЃРёРјРІРѕР»РѕРІ');
  if (!/[a-z]/.test(pw)) missing.push('a-z');
  if (!/[A-Z]/.test(pw)) missing.push('A-Z');
  if (!/\d/.test(pw)) missing.push('С†РёС„СЂСѓ');
  if (!/[^a-zA-Z0-9]/.test(pw)) missing.push('СЃРёРјРІРѕР» !@#');
  label.textContent = 'РќСѓР¶РЅРѕ: ' + missing.join(', ');
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
  $('#authSubmit').textContent = reg ? 'Р”Р°Р»РµРµ' : 'Р’РѕР№С‚Рё';
  $('#authHint').innerHTML = reg
    ? 'РЈР¶Рµ РµСЃС‚СЊ Р°РєРєР°СѓРЅС‚? <a href="#" id="authSwitch">Р’РѕР№С‚Рё</a>'
    : 'РќРµС‚ Р°РєРєР°СѓРЅС‚Р°? <a href="#" id="authSwitch">РЎРѕР·РґР°С‚СЊ</a>';
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
    if (!name) return showAuthError($('#authError'), 'Р’РІРµРґРёС‚Рµ РЅРёРєРЅРµР№Рј');
    if (name.length < 4) return showAuthError($('#authError'), 'РќРёРєРЅРµР№Рј РјРёРЅРёРјСѓРј 4 СЃРёРјРІРѕР»Р°');
    if (name.length > LIMITS.name) return showAuthError($('#authError'), `РќРёРєРЅРµР№Рј РјР°РєСЃРёРјСѓРј ${LIMITS.name} СЃРёРјРІРѕР»РѕРІ`);
    if (!/^[a-z0-9_]+$/.test(username) || username.length < 4) return showAuthError($('#authError'), 'Р®Р·РµСЂРЅРµР№Рј: 4-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _)');
    if (username.length > LIMITS.username) return showAuthError($('#authError'), `Р®Р·РµСЂРЅРµР№Рј РјР°РєСЃРёРјСѓРј ${LIMITS.username} СЃРёРјРІРѕР»РѕРІ`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAuthError($('#authError'), 'Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅСѓСЋ РїРѕС‡С‚Сѓ');
    if (password.length < 8) return showAuthError($('#authError'), 'РџР°СЂРѕР»СЊ РјРёРЅРёРјСѓРј 8 СЃРёРјРІРѕР»РѕРІ');
    if (!/[a-z]/.test(password)) return showAuthError($('#authError'), 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ СЃС‚СЂРѕС‡РЅСѓСЋ Р±СѓРєРІСѓ (a-z)');
    if (!/[A-Z]/.test(password)) return showAuthError($('#authError'), 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ Р·Р°РіР»Р°РІРЅСѓСЋ Р±СѓРєРІСѓ (A-Z)');
    if (!/\d/.test(password)) return showAuthError($('#authError'), 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ С†РёС„СЂСѓ (0-9)');
    if (!/[^a-zA-Z0-9]/.test(password)) return showAuthError($('#authError'), 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ СЃРёРјРІРѕР» (!@#$%^&*)');
    if (weakPasswordDetect(password)) return showAuthError($('#authError'), 'РџР°СЂРѕР»СЊ СЃР»РёС€РєРѕРј РїСЂРѕСЃС‚РѕР№ вЂ” РїСЂРёРґСѓРјР°Р№С‚Рµ СЃР»РѕР¶РЅРµРµ (Р±РµР· 12345, qwerty Рё РїРѕС…РѕР¶РёС…)');
    if (password.length > LIMITS.password) return showAuthError($('#authError'), `РџР°СЂРѕР»СЊ РјР°РєСЃРёРјСѓРј ${LIMITS.password} СЃРёРјРІРѕР»РѕРІ`);
    if (($('#authCaptchaInput').value.trim() || '').toUpperCase() !== authCaptchaCode) {
      renderCaptcha();
      $('#authCaptchaInput').value = '';
      return showAuthError($('#authCaptchaError'), 'Р’РІРµРґРёС‚Рµ РєРѕРґ СЃ РєР°СЂС‚РёРЅРєРё РїСЂР°РІРёР»СЊРЅРѕ');
    }
    if (accounts.users[username]) return showAuthError($('#authError'), 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј СѓР¶Рµ Р·Р°РЅСЏС‚');
    const emailTaken = accountsList().some(a => a.email === email);
    if (emailTaken) return showAuthError($('#authError'), 'Р­С‚Р° РїРѕС‡С‚Р° СѓР¶Рµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ');
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
        addLog(username, 'Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°Р»СЃСЏ (ID ' + acc.id + ')');
        startApp(acc);
      }
    };
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAuthError($('#authError'), 'Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅСѓСЋ РїРѕС‡С‚Сѓ');
    let acc = accounts.users[username];
    if (!acc && MAIL_RELAY_URL) {
      acc = await findAccountInCloud(username, email);
      if (acc) {
        accounts.users[username] = acc;
        saveAccounts(accounts);
        toast('РђРєРєР°СѓРЅС‚ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ РёР· РѕР±Р»Р°РєР°');
      }
    }
    if (!acc) {
      showAccountNotice(username);
      return showAuthError($('#authError'), 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ');
    }
    if (acc.isBot) return showAuthError($('#authError'), 'Р­С‚Рѕ Р±РѕС‚ вЂ” РІ Р°РєРєР°СѓРЅС‚ РІРѕР№С‚Рё РЅРµР»СЊР·СЏ');
    if (acc.banned) {
      if (acc.banInfo && acc.banInfo.unbanAt && Date.now() >= acc.banInfo.unbanAt) {
        acc.banned = false;
        acc.banInfo = null;
        clearNotice(username);
        persistOther(acc);
      } else {
        const bi = acc.banInfo || {};
        showAccountNotice(username);
        return showAuthError($('#authError'), 'Р­С‚РѕС‚ Р°РєРєР°СѓРЅС‚ Р·Р°Р±Р°РЅРµРЅ Р°РґРјРёРЅРёСЃС‚СЂР°С†РёРµР№\nРђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ: @' + (bi.admin || 'вЂ”') + ' В· Р‘Р°РЅ: ' + fmtNoticeDate(bi.bannedAt) + ' В· Р Р°Р·Р±Р°РЅ: ' + (bi.unbanAt ? fmtNoticeDate(bi.unbanAt) : 'РќР°РІСЃРµРіРґР°'));
      }
    }
    if (acc.email !== email) return showAuthError($('#authError'), 'РџРѕС‡С‚Р° РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃ СЌС‚РёРј Р°РєРєР°СѓРЅС‚РѕРј');
    if (acc.password !== password) return showAuthError($('#authError'), 'РќРµРІРµСЂРЅС‹Р№ РїР°СЂРѕР»СЊ');
    authPending = { email: acc.email, finalize: () => { addLog(username, 'Р’РѕС€С‘Р» РІ Р°РєРєР°СѓРЅС‚'); startApp(acc); } };
  }

  $('#authVerifyEmail').textContent = authPending.email;
  $('#authVerifyBtn').disabled = false;
  sendAuthCode(authPending.email);
  showAuthStep('verify');
}

function confirmAuthVerify() {
  const code = codeValue($('#authCodeInputs'));
  if (!authCode) return showAuthError($('#authCodeError'), 'РљРѕРґ РёСЃС‚С‘Рє. Р—Р°РїСЂРѕСЃРёС‚Рµ РєРѕРґ РїРѕРІС‚РѕСЂРЅРѕ.');
  if (code.length !== 6) return showAuthError($('#authCodeError'), 'Р’РІРµРґРёС‚Рµ 6-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ');
  if (code !== authCode) {
    showAuthError($('#authCodeError'), 'РќРµРІРµСЂРЅС‹Р№ РєРѕРґ');
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
        box.innerHTML = demoCodeHtml(authCode, 'Р”РµРјРѕ-СЂРµР¶РёРј: РІР°С€ РєРѕРґ:');
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
    toast('РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РїРѕРІС‚РѕСЂРЅРѕ', authPending.email, 2000);
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
      toast('РђРєРєР°СѓРЅС‚ Р·Р°Р±Р°РЅРµРЅ', 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ: @' + (bi.admin || 'вЂ”') + ' В· Р‘Р°РЅ: ' + fmtNoticeDate(bi.bannedAt) + ' В· Р Р°Р·Р±Р°РЅ: ' + (bi.unbanAt ? fmtNoticeDate(bi.unbanAt) : 'РќР°РІСЃРµРіРґР°'));
      return;
    }
  }
  currentUser = user;
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
  toast('Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ', user.name + ' В· ID ' + user.id + ' рџ‘‹');
  maybeShowIncoming(state.chats.find(c => c.id === state.currentChatId));
  const ann = loadAnnouncement();
  if (ann) toast('рџ“ў РћР±СЉСЏРІР»РµРЅРёРµ', ann.text + (ann.by ? ' вЂ” @' + ann.by : ''), 6000);
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
    <div class="catalog-hint">рџ”Ќ РќР°Р№РґРµРЅРѕ: <b>${catalog.length}</b>${catalog.length === 6 ? '+' : ''}</div>
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
            <span class="chat-preview">${c.type === 'group' ? c.members.length + ' СѓС‡Р°СЃС‚РЅРёРєРѕРІ' : c.members.length + ' РїРѕРґРїРёСЃС‡РёРєРѕРІ'}${owner ? ' В· СЃРѕР·РґР°С‚РµР»СЊ @' + escapeHtml(owner.username) : ''}</span>
          </div>
        </div>
        <button type="button" class="btn btn-primary sub-btn">${c.type === 'group' ? 'Р’СЃС‚СѓРїРёС‚СЊ' : 'РџРѕРґРїРёСЃР°С‚СЊСЃСЏ'}</button>
      </div>`;
    }).join('')}
  ` : '');

  const userCatalogHtml = (userCatalog.length ? `
    <div class="catalog-hint">рџ‘Ґ РџРѕР»СЊР·РѕРІР°С‚РµР»Рё: <b>${userCatalog.length}</b></div>
    ${userCatalog.map((u, i) => `
      <div class="chat-item catalog-item user-cat-item" data-user="${escapeHtml(u.username)}" style="animation-delay:${i * 30}ms">
        <div class="chat-avatar">${avatarHtml(u, '', selectedFrameClass(u))}</div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">${escapeHtml(u.name)}${badgeHtml(u)}</span>
            <span class="chat-handle">@${escapeHtml(u.username)}</span>
          </div>
          <div class="chat-bottom">
            <span class="chat-preview">ID <span class="copy-id" data-copy="${escapeHtml(u.id)}" title="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ ID">${escapeHtml(u.id)} рџ“‹</span> В· ${statusOf(u).label}</span>
          </div>
        </div>
        <button type="button" class="btn btn-primary sub-btn">РќР°РїРёСЃР°С‚СЊ</button>
      </div>`).join('')}
  ` : '');

  if (!chats.length && !catalog.length && !userCatalog.length && !hidden.length) {
    list.innerHTML = `<div class="empty-list">${state.activeFolder ? 'Р’ РїР°РїРєРµ РїРѕРєР° РЅРµС‚ С‡Р°С‚РѕРІ' : (q ? 'РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' : 'Р§Р°С‚РѕРІ РїРѕРєР° РЅРµС‚. РќР°Р¶РјРёС‚Рµ В«+В», С‡С‚РѕР±С‹ СЃРѕР·РґР°С‚СЊ С‡Р°С‚')}</div>`;
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
    if (chat.type === 'private') { const stt = statusOf(user); sub = stt.label + ((user.status && user.status.s) ? ' В· ' + user.status.s : ''); }
    else if (chat.type === 'ai') sub = '';
    else if (chat.type === 'saved') sub = 'Р›РёС‡РЅС‹Рµ Р·Р°РјРµС‚РєРё';
    else if (chat.type === 'group') sub = `${chat.members.length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ`;
    else sub = `${chat.members.length} РїРѕРґРїРёСЃС‡РёРєРѕРІ`;
    if (chat.type === 'channel' && chat.handle) sub = `@${escapeHtml(chat.handle)} В· ${sub}`;
    const isMe = lm && lm.from === 'me';
    const isPinned = state.pinned.includes(chat.id);
    const post = user && user.statusPost && (Date.now() - user.statusPost.time) < 86400000 ? user.statusPost : null;

    return `
    <div class="chat-item ${active ? 'active' : ''}" data-id="${chat.id}" style="animation-delay:${i * 30}ms">
      <div class="chat-avatar">
        ${post ? '<span class="st-ring" data-post="' + escapeHtml(chat.userId) + '" title="РЎС‚Р°С‚СѓСЃ">' : ''}${avatarHtml(acc, '', frame)}${post ? '</span>' : ''}
        ${chat.type !== 'private' ? `<span class="type-icon">${TYPE_ICONS[chat.type]}</span>` : (user && statusOf(user).online ? `<span class="online-dot st-${statusOf(user).cls}"></span>` : '')}
      </div>
      <div class="chat-info">
        <div class="chat-top">
          <span class="chat-name">${isPinned ? '<span class="pin-icon">рџ“Њ</span>' : ''}${escapeHtml(chatTitle(chat))}${chat.type === 'private' ? badgeHtml(acc) : ''}</span>
          ${chat.type === 'channel' && chat.handle ? `<span class="chat-handle ch-link" data-ch="${chat.id}">@${escapeHtml(chat.handle)}</span>` : ''}
          <span class="chat-time">${lm ? fmtTime(lm.time) : ''}</span>
        </div>
        <div class="chat-bottom">
          ${chat.type === 'ai' ? '' : `<span class="chat-preview ${unread && !active ? 'muted' : ''}">${isMe ? '<strong>Р’С‹: </strong>' : ''}${escapeHtml(lastMessagePreview(chat))}</span>`}
          ${unread ? `<span class="badge">${unread}</span>` : ''}
          ${missed ? `<span class="missed-badge" title="РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ Р·РІРѕРЅРѕРє">рџ“µ${missed > 1 ? ' ' + missed : ''}</span>` : ''}
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
        <span>рџ™€ РЎРєСЂС‹С‚С‹Рµ (${hidden.length})</span>
        <span class="hidden-caret">${showHidden ? 'в–ґ' : 'в–ѕ'}</span>
      </div>
      ${showHidden ? hidden.map(id => {
        const c = state.chats.find(x => x.id === id);
        if (!c) return '';
        return `
        <div class="chat-item hidden-item" data-id="${c.id}">
          <div class="chat-avatar">${avatarHtml(accFromChat(c), '', '')}${c.type !== 'private' ? `<span class="type-icon">${TYPE_ICONS[c.type]}</span>` : ''}</div>
          <div class="chat-info">
            <div class="chat-top"><span class="chat-name">${escapeHtml(chatTitle(c))}</span></div>
            <div class="chat-bottom"><span class="chat-preview muted">СЃРєСЂС‹С‚ вЂ” РџРљРњ, С‡С‚РѕР±С‹ РїРѕРєР°Р·Р°С‚СЊ</span></div>
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
        <p>Р’С‹Р±РµСЂРёС‚Рµ С‡Р°С‚ РёР»Рё СЃРѕР·РґР°Р№С‚Рµ РЅРѕРІС‹Р№</p>
      </div>`;
    return;
  }

  area.classList.remove('empty-state');
  const acc = accFromChat(chat);
  const frame = chat.type === 'private' ? selectedFrameClass(acc) : '';
  const user = chat.type === 'private' ? acc : null;
  const headPost = user && user.statusPost && (Date.now() - user.statusPost.time) < 86400000;
  const isBlocked = chat.type === 'private' && currentUser.blocked.includes(chat.userId);
  const isIgnored = chat.type === 'private' && currentUser.ignored.includes(chat.userId);
  const canWrite = chat.type !== 'channel' || (chat.id === NEWS_CHAT_ID
    ? (chat.owner === 'me' || chat.owner === currentUser.username || adminList().includes(currentUser.username) || (chat.admins || []).includes('me') || (chat.admins || []).includes(currentUser.username) || newsFullAccess(currentUser))
    : (chat.owner === 'me' || (chat.admins || []).includes('me') || chat.whoCanWrite === 'all'));

  let sub;
  if (chat.type === 'private') {
    const stt = statusOf(user);
    sub = `<span class="online st-${stt.cls}">${stt.label}</span>` + (stt.text ? ` В· ${escapeHtml(stt.text)}` : '');
  } else if (chat.type === 'ai') sub = '';
  else if (chat.type === 'saved') sub = 'Р›РёС‡РЅС‹Рµ Р·Р°РјРµС‚РєРё В· РІРёРґРЅС‹ С‚РѕР»СЊРєРѕ РІР°Рј';
  else if (chat.type === 'group') sub = `${chat.members.length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ В· ${chat.desc || 'РіСЂСѓРїРїР°'}`;
  else sub = `${chat.members.length} РїРѕРґРїРёСЃС‡РёРєРѕРІ В· ${chat.desc || 'РєР°РЅР°Р»'}`;
  if (chat.type === 'channel' && chat.handle) sub = `@${escapeHtml(chat.handle)} В· ${sub}`;

  const showDolphin = chat.type !== 'channel' && chat.type !== 'ai' && chat.type !== 'saved';
  let headerExtras = '';
  if (chat.type === 'private' || chat.type === 'group') {
    headerExtras += `<button class="icon-btn" id="callBtn" title="РџРѕР·РІРѕРЅРёС‚СЊ" style="${chat.type === 'group' ? 'padding-right:2px' : ''}">
      <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
    </button>
    <button class="icon-btn" id="videoCallBtn" title="Р’РёРґРµРѕР·РІРѕРЅРѕРє" style="padding-right:2px">
      <svg viewBox="0 0 24 24" style="fill:currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
    </button>`;
  }
  if (chat.type === 'private' || chat.type === 'ai') {
    headerExtras += `<button class="icon-btn" id="userCardBtn" title="РљР°СЂС‚РѕС‡РєР°">
      <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg>
    </button>`;
  }
  if (showDolphin) {
    const dl = dolphinLevel(dolphinFor(dolphinKeyFor(chat), chat));
    headerExtras += `<button class="dolphin-chip" id="dolphinBtn" title="${dolphinStage(dl)}">
      <span class="dl">рџђ¬</span> СѓСЂ. ${dl}
    </button>`;
  }

  let composer;
  if (isBlocked) {
    composer = `<div class="channel-notice">Р’С‹ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°Р»Рё СЌС‚РѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div>`;
  } else if (canWrite) {
    composer = `
      <button class="icon-btn" id="attachBtn" title="РџСЂРёРєСЂРµРїРёС‚СЊ С„Р°Р№Р»">
        <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
      </button>
      <button class="icon-btn" id="voiceBtn" title="Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ">
        <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
      </button>
      <button class="icon-btn" id="videoMsgBtn" title="РљСЂСѓР¶РѕРє вЂ” РІРёРґРµРѕСЃРѕРѕР±С‰РµРЅРёРµ">
        <svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
      </button>
      <button class="icon-btn" id="emojiBtn" title="Р­РјРѕРґР·Рё">
        <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
      </button>
      <button class="icon-btn" id="stickBtn" title="РЎС‚РёРєРµСЂС‹">
        <svg viewBox="0 0 24 24"><path d="M18.5 2H5.5C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2zm0 17.5h-13v-15h13v15zM7.5 6h9v2h-9V6zm0 4h9v2h-9v-2zm0 4h6v2h-6v-2z"/></svg>
      </button>
      <div class="composer-extra" id="composerExtra">${composerExtraHtml(chat)}</div>
      <div class="msg-input"><textarea id="msgText" placeholder="${isIgnored ? 'РЎРѕРѕР±С‰РµРЅРёРµ (РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІ РёРіРЅРѕСЂРµ)' : 'РЎРѕРѕР±С‰РµРЅРёРµ'}" rows="1"></textarea></div>
      <button class="send-btn" id="sendBtn">
        <svg viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>`;
  } else {
    composer = `<div class="channel-notice">${chat.id === NEWS_CHAT_ID ? 'РџСѓР±Р»РёРєРѕРІР°С‚СЊ РІ Nebula News РјРѕРіСѓС‚ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅС‹' : 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС† Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂС‹ РјРѕРіСѓС‚ РїСѓР±Р»РёРєРѕРІР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ'}</div>`;
  }

  const inEl0 = $('#msgText');
  const savedVal = inEl0 ? inEl0.value : null;
  const savedSel = inEl0 ? inEl0.selectionStart : 0;

  area.innerHTML = `
    <header class="chat-header">
      <button class="icon-btn m-back-btn" id="mBackBtn" title="Рљ СЃРїРёСЃРєСѓ С‡Р°С‚РѕРІ" style="flex-shrink:0">
        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      ${headPost ? `<span class="st-ring st-head" data-post="${escapeHtml(acc.username)}" title="РЎС‚Р°С‚СѓСЃ">` : ''}${avatarHtml(acc, '', frame)}${headPost ? '</span>' : ''}
      <div class="chat-header-info">
        <div class="chat-header-title${chat.type !== 'private' && chat.type !== 'ai' && chat.type !== 'saved' ? ' clickable-title' : ''}" ${chat.type !== 'private' && chat.type !== 'ai' && chat.type !== 'saved' ? `data-chcard="${escapeHtml(chat.id)}" title="РљР°СЂС‚РѕС‡РєР° ${chat.type === 'channel' ? 'РєР°РЅР°Р»Р°' : 'РіСЂСѓРїРїС‹'}"` : ''}>${chat.type === 'private' ? displayName(acc) : escapeHtml(chatTitle(chat))}${chat.type === 'channel' && chat.handle ? `<span class="chat-handle ch-link" data-ch="${chat.id}">@${escapeHtml(chat.handle)}</span>` : ''}</div>
        <div class="chat-header-sub">${sub}</div>
        ${headPost && statusOf(acc).online ? `<button type="button" class="head-status-btn" data-post="${escapeHtml(acc.username)}">рџ‘Ѓ РџРѕСЃРјРѕС‚СЂРµС‚СЊ СЃС‚Р°С‚СѓСЃ</button>` : ''}
      </div>
      ${headerExtras}
      ${chat.type !== 'saved' ? `<button class="icon-btn" id="manageBtn" title="РќР°СЃС‚СЂРѕР№РєРё С‡Р°С‚Р°">
        <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
      </button>` : ''}
    </header>
    <div class="messages-wrap" id="messagesWrap"></div>
    <button class="jump-btn" id="jumpBottom" title="Р’РЅРёР·">в†“</button>
    ${isBlocked ? `<div class="service-msg warn" style="margin:0 22px 10px;align-self:center">в›” Р’С‹ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°Р»Рё СЌС‚РѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ вЂ” РѕРЅ Р±РѕР»СЊС€Рµ РЅРµ СЃРјРѕР¶РµС‚ РІР°Рј РїРёСЃР°С‚СЊ</div>` : ''}
    <div class="composer">
      <div class="rec-bar hidden" id="recBar">
        <video class="rec-preview hidden" id="recPreview" muted playsinline autoplay></video>
        <span class="rec-dot"></span>
        <span class="rec-label" id="recLabel">Р“РѕР»РѕСЃРѕРІРѕРµ</span>
        <span class="rec-timer" id="recTimer">0:00</span>
        <div class="rec-spacer"></div>
        <button class="rec-cancel" id="recCancel" title="РћС‚РјРµРЅРёС‚СЊ">вњ•</button>
        <button class="rec-send" id="recSend" title="РћС‚РїСЂР°РІРёС‚СЊ">вћ¤</button>
      </div>
      <div class="pending-bar hidden" id="pendingBar"></div>
      ${composer}
    </div>
  `;

  renderMessages(chat);
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

/* ---------- РџСЂРѕРєСЂСѓС‚РєР° С‡Р°С‚Р° ---------- */
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
    if (c) return `<a class="ch-link" data-ch="${c.id}">рџ”— ${c.handle ? '@' + c.handle : 'РЎСЃС‹Р»РєР° РЅР° РєР°РЅР°Р»'}</a>`;
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
  if (!src) return toast('РљР°РЅР°Р» РЅРµ РЅР°Р№РґРµРЅ');
  state.search = '@' + (src.handle || '');
  state.activeFolder = null;
  state.filter = 'all';
  renderChatList();
  toast(src.type === 'channel' ? 'РќР°Р¶РјРёС‚Рµ В«РџРѕРґРїРёСЃР°С‚СЊСЃСЏВ»' : 'РќР°Р¶РјРёС‚Рµ В«Р’СЃС‚СѓРїРёС‚СЊВ»', src.name);
}
function msgMetaIcons(chat, msg) {
  if (msg.from !== 'me') return '';
  const isPriv = chat.type === 'private';
  const single = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8 9.4 17.7 19.5 6.9"/></svg>';
  const dbl = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 13.4 6.8 17.4 10.9 13.4"/><path d="M13.1 6.9 17.1 10.9 21.2 6.9"/></svg>';
  const clock = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.59 3.25 1.88-.55.94L11.5 13V6.5h1.5v6.09z"/></svg>';
  const cls = msg.read ? 'read' : msg.sent ? 'sent' : 'pending';
  const tick = cls === 'pending' ? clock : (isPriv ? dbl : single);
  return `<span class="meta">${msg.edited ? '<span class="edited">РёР·РјРµРЅРµРЅРѕ</span>' : ''}${fmtTime(msg.time)}<span class="meta-tick ${cls}">${tick}</span></span>`;
}

function shortText(t, n = 60) { return String(t || '').length > n ? String(t || '').slice(0, n) + 'вЂ¦' : String(t || ''); }
function fmtBytes(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' Р‘';
  if (b < 1048576) return (b / 1024).toFixed(1).replace(/\.0$/, '') + ' РљР‘';
  return (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' РњР‘';
}
function senderName(msg, chat, meLabel = 'Р’С‹') {
  if (msg.from === 'me') return meLabel;
  if (msg.from === 'news') return 'Nebula News';
  if (msg.from === 'nebula') return 'Nebula AI';
  const u = chat.type === 'private' ? userById(chat.userId) : userById(msg.from);
  return u ? u.name : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ';
}

const REACT_EMOJIS = ['рџ‘Ќ', 'вќ¤пёЏ', 'рџ‚', 'рџ¤Ј', 'рџ®', 'рџ”Ґ', 'рџ™Џ', 'рџЌ', 'рџЋ‰', 'рџў', 'рџЎ', 'рџ’Ї'];
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
      <span class="poll-q">${p.quiz ? 'рџ§ ' : 'рџ“Љ'} ${escapeHtml(p.question)}</span>
      ${p.quiz ? `<span class="poll-tag ${showAnswer ? 'answered' : ''}">${showAnswer ? 'РІРёРєС‚РѕСЂРёРЅР° В· РѕС‚РІРµС‚ РѕС‚РєСЂС‹С‚' : 'РІРёРєС‚РѕСЂРёРЅР°'}</span>` : ''}
    </div>
    <div class="poll-opts">
      ${p.options.map((o, i) => {
        const cnt = ((p.votes || {})[i] || []).length;
        const pct = total ? Math.round(cnt / total * 100) : 0;
        const isMine = mineVote && +mineVote[0] === i;
        const isCorrect = showAnswer && p.correct === i;
        const isWrong = showAnswer && isMine && p.correct !== i;
        return `<button type="button" class="poll-opt ${isMine ? 'my' : ''} ${isCorrect ? 'right' : ''} ${isWrong ? 'wrong' : ''}" data-mid="${msg.id}" data-opt="${i}">
          <span class="po-label">${isCorrect ? 'вњ… ' : isWrong ? 'вќЊ ' : ''}${escapeHtml(o)}</span>
          <span class="po-bar"><i style="width:${pct}%"></i></span>
          <span class="po-count">${cnt} (${pct}%)</span>
        </button>`;
      }).join('')}
    </div>
    <div class="poll-total">Р’СЃРµРіРѕ РіРѕР»РѕСЃРѕРІ: ${total}${voted && !p.allowChange ? ' В· РѕС‚РІРµС‚ РїСЂРёРЅСЏС‚' : ''}</div>
  </div>`;
}
function renderContactHtml(c) {
  const acc = accountByUsername(c.username) || c;
  return `<div class="contact-card" data-cc="${escapeHtml(c.username)}">
    <span class="avatar" style="${avatarStyle(acc)}">${avatarInnerHtml(acc)}</span>
    <div class="cc-info">
      <div class="cc-name">${displayName(acc)}</div>
      <div class="cc-sub">@${escapeHtml(c.username)} В· ID ${escapeHtml(c.id)}</div>
    </div>
    <span class="cc-btn">РќР°РїРёСЃР°С‚СЊ</span>
  </div>`;
}
function toggleVote(msg, optIdx) {
  if (!msg.poll.votes) msg.poll.votes = {};
  const cur = Object.entries(msg.poll.votes).find(([, a]) => a.includes('me'));
  if (cur && !msg.poll.allowChange) {
    toast('РћС‚РІРµС‚ СѓР¶Рµ РїСЂРёРЅСЏС‚', 'РР·РјРµРЅРёС‚СЊ РѕС‚РІРµС‚ РЅРµР»СЊР·СЏ');
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
  addLog(currentUser.username, `РЎРѕР·РґР°Р» ${opts.quiz ? 'РІРёРєС‚РѕСЂРёРЅСѓ' : 'РѕРїСЂРѕСЃ'} В«${shortText(question, 30)}В» РІ В«${chatTitle(chat)}В»`);
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
  addLog(currentUser.username, `РџРѕРґРµР»РёР»СЃСЏ РєРѕРЅС‚Р°РєС‚РѕРј @${u.username} РІ В«${chatTitle(chat)}В»`);
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
        <span class="pm-ico">рџ“Љ</span>
        <div class="pm-head-txt">
          <h3>РЎРѕР·РґР°С‚СЊ РѕРїСЂРѕСЃ</h3>
          <p>РІ ${escapeHtml(chatTitle(chat))}</p>
        </div>
        <button type="button" class="pm-x" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
      </div>
      <div class="pm-field">
        <textarea class="pm-q" rows="2" maxlength="120" placeholder="РќР°РїРёС€РёС‚Рµ РІРѕРїСЂРѕСЃ..." autocomplete="off"></textarea>
        <span class="pm-count">0/120</span>
      </div>
      <div class="pm-type">
        <button type="button" class="pm-type-btn sel" data-type="poll">рџ“Љ РћРїСЂРѕСЃ</button>
        <button type="button" class="pm-type-btn" data-type="quiz">рџ§  Р’РёРєС‚РѕСЂРёРЅР°</button>
      </div>
      <div class="pm-hint" id="pmHint">Р’Р°СЂРёР°РЅС‚С‹ РѕС‚РІРµС‚Р° вЂ” РјРёРЅРёРјСѓРј 2, РјР°РєСЃРёРјСѓРј 10</div>
      <div class="pm-opts" id="pmOpts"></div>
      <button type="button" class="pm-add">пј‹ Р”РѕР±Р°РІРёС‚СЊ РІР°СЂРёР°РЅС‚</button>
      <div class="pm-correct-row" id="pmCorrectRow" style="display:none">
        <span class="pm-correct-label">РџСЂР°РІРёР»СЊРЅС‹Р№ РѕС‚РІРµС‚:</span>
        <select class="pm-correct" id="pmCorrect"></select>
      </div>
      <label class="pm-switch-row">
        <input type="checkbox" id="pmAllowChange" checked>
        <span class="pm-switch"><i></i></span>
        <span class="pm-switch-label">Р Р°Р·СЂРµС€РёС‚СЊ РјРµРЅСЏС‚СЊ РѕС‚РІРµС‚</span>
      </label>
      <button type="button" class="btn btn-primary pm-send">РЎРѕР·РґР°С‚СЊ РѕРїСЂРѕСЃ</button>
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
      : '<option value="0">вЂ”</option>';
    if (prev && vals.length > +prev) correctSel.value = prev;
  };
  modal.querySelectorAll('.pm-type-btn').forEach(b => b.addEventListener('click', () => {
    modal.querySelectorAll('.pm-type-btn').forEach(x => x.classList.toggle('sel', x === b));
    isQuiz = b.dataset.type === 'quiz';
    modal.querySelector('#pmCorrectRow').style.display = isQuiz ? 'flex' : 'none';
    modal.querySelector('.pm-send').textContent = isQuiz ? 'РЎРѕР·РґР°С‚СЊ РІРёРєС‚РѕСЂРёРЅСѓ' : 'РЎРѕР·РґР°С‚СЊ РѕРїСЂРѕСЃ';
    refreshCorrect();
  }));
  const makeRow = (n) => {
    const row = document.createElement('div');
    row.className = 'pm-row';
    row.innerHTML = `
      <span class="pm-num">${n}</span>
      <input type="text" class="pm-o" placeholder="Р’Р°СЂРёР°РЅС‚ ${n}" maxlength="60" autocomplete="off">
      <button type="button" class="pm-del" title="РЈР±СЂР°С‚СЊ РІР°СЂРёР°РЅС‚">вњ•</button>`;
    row.querySelector('.pm-del').addEventListener('click', () => {
      if (optsBox.children.length <= 2) return toast('РќСѓР¶РЅРѕ РјРёРЅРёРјСѓРј 2 РІР°СЂРёР°РЅС‚Р°');
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
    if (!q) { toast('Р’РІРµРґРёС‚Рµ РІРѕРїСЂРѕСЃ'); return; }
    if (opts.length < 2) { toast('РќСѓР¶РЅРѕ РјРёРЅРёРјСѓРј 2 РІР°СЂРёР°РЅС‚Р°'); return; }
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
      <h3>рџ‘¤ РџРѕРґРµР»РёС‚СЊСЃСЏ РєРѕРЅС‚Р°РєС‚РѕРј</h3>
      <div class="contact-list">
        ${accountsList().filter(a => a.username !== currentUser.username).map(u => `
          <div class="contact-pick" data-u="${escapeHtml(u.username)}">
            <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
            <div class="cp-info">
              <div class="cp-name">${displayName(u)}</div>
              <div class="cp-sub">@${escapeHtml(u.username)} В· ID ${escapeHtml(u.id)}</div>
            </div>
            <button type="button" class="btn btn-primary cp-send">РџРѕРґРµР»РёС‚СЊСЃСЏ</button>
          </div>`).join('') || '<div class="empty-list">РќРµС‚ РґСЂСѓРіРёС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</div>'}
      </div>
      <button type="button" class="btn cp-cancel">Р—Р°РєСЂС‹С‚СЊ</button>
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
    const fwdName = msg.forwarded ? escapeHtml(msg.forwardedFrom || 'РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ') : '';
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
        if (md.dataUrl) return `<img class="msg-photo" src="${md.dataUrl}" alt="${escapeHtml(md.name)}" title="${escapeHtml(md.name)}" data-mid="${msg.id}" data-mi="${mi}">`;
        return `<div class="msg-photo-off" data-mid="${msg.id}" data-mi="${mi}" title="${escapeHtml(md.name)}">рџ–ј <span>${escapeHtml(md.name)}</span></div>`;
      }
      return `
        <div class="msg-file">
          <span class="file-ic">рџ“„</span>
          <span class="file-name">${escapeHtml(md.name)}</span>
          <span class="file-size">${fmtBytes(md.size)}</span>
          ${md.dataUrl ? `<a class="file-dl" download="${escapeHtml(md.name)}" href="${md.dataUrl}" title="РЎРєР°С‡Р°С‚СЊ">в¬‡</a>` : '<span class="file-dl-off" title="Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ РЅР° СЌС‚Рѕ СѓСЃС‚СЂРѕР№СЃС‚РІРѕ">вЂ”</span>'}
        </div>`;
    }).join('') : '';
    const stickerHtml = msg.sticker && msg.sticker.dataUrl ? `<img class="msg-sticker" src="${msg.sticker.dataUrl}" alt="РЎС‚РёРєРµСЂ">` : '';
    const voiceHtml = msg.voice ? (msg.voice.dataUrl ? `
      <div class="msg-voice" data-mid="${msg.id}">
        <button class="voice-play" data-vplay="${msg.id}" title="РРіСЂР°С‚СЊ">в–¶</button>
        <div class="voice-bar"><i></i></div>
        <span class="voice-dur">${fmtRecDur(msg.voice.dur || 0)}</span>
        <audio src="${msg.voice.dataUrl}" preload="none"></audio>
      </div>` : `
      <div class="msg-voice-off" data-mid="${msg.id}">рџЋ¤ <span>Р“РѕР»РѕСЃРѕРІРѕРµ В· ${fmtRecDur(msg.voice.dur || 0)}</span><span class="vo-note">РЅРµ Р·Р°РіСЂСѓР¶РµРЅРѕ</span></div>`) : '';
    const videoHtml = msg.video ? (msg.video.dataUrl ? `
      <video class="msg-kruzhok" data-mid="${msg.id}" src="${msg.video.dataUrl}" loop playsinline muted preload="metadata" title="РљСЂСѓР¶РѕРє В· ${fmtRecDur(msg.video.dur || 0)}"></video>` : `
      <div class="msg-kruzhok-off" data-mid="${msg.id}" title="РљСЂСѓР¶РѕРє В· ${fmtRecDur(msg.video.dur || 0)}"><span>рџЋ¬</span><span class="kk-dur">${fmtRecDur(msg.video.dur || 0)}</span><span class="kk-note">РЅРµ Р·Р°РіСЂСѓР¶РµРЅ</span></div>`) : '';
    const pollHtml = msg.poll ? renderPollHtml(msg) : '';
    const contactHtml = msg.contact ? renderContactHtml(msg.contact) : '';
    html += `
      <div class="msg-row ${mine ? 'out' : 'in'}">
        <div class="msg ${mine ? 'out' : 'in'}" data-mid="${msg.id}">
          ${senderAcc ? `<span class="sender">${displayName(senderAcc)}</span>` : ''}
          ${fwdName ? `<div class="fwd-badge">вћЎ РџРµСЂРµСЃР»Р°РЅРѕ РѕС‚ ${fwdName}</div>` : ''}
          ${rt}
          ${pollHtml}
          ${contactHtml}
          ${stickerHtml}
          ${voiceHtml}
          ${videoHtml}
          ${mediaHtml}
          ${msg.text ? `<div class="msg-text">${linkifyChannels(escapeHtml(msg.text))}</div>` : ''}
          ${msgMetaIcons(chat, msg)}
          ${reactChips ? `<div class="react-row">${reactChips}</div>` : ''}
          <div class="msg-actions">
            <button data-act="react" title="Р РµР°РєС†РёСЏ"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg></button>
            <button data-act="reply" title="РћС‚РІРµС‚РёС‚СЊ"><svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5.4-5.5-9.4-11-10z"/></svg></button>
            <button data-act="forward" title="РџРµСЂРµСЃР»Р°С‚СЊ"><svg viewBox="0 0 24 24"><path d="M5 4h14v3H5V4zm0 5h14v3H5V9zm0 5h14v3H5v-3zm0 5h14v3H5v-3z"/></svg></button>
            <button data-act="copy" title="РљРѕРїРёСЂРѕРІР°С‚СЊ"><svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg></button>
            ${mine ? `<button data-act="edit" title="РР·РјРµРЅРёС‚СЊ">вњЋ</button>` : ''}
            ${(mine && chat.id !== NEWS_CHAT_ID) || (chat.id === NEWS_CHAT_ID && newsFullAccess(currentUser)) ? `<button data-act="del" title="РЈРґР°Р»РёС‚СЊ"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
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

/* ---------- РћС‚РїСЂР°РІРєР° СЃРѕРѕР±С‰РµРЅРёР№ ---------- */

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
      toast('РЎР»РёС€РєРѕРј Р±С‹СЃС‚СЂРѕ', 'РџРѕРґРѕР¶РґРёС‚Рµ СЃРµРєСѓРЅРґСѓ РїРµСЂРµРґ СЃР»РµРґСѓСЋС‰РёРј СЃРѕРѕР±С‰РµРЅРёРµРј');
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
        pendingMedia.push({ name: f.name || 'Р’СЃС‚Р°РІРєР°.png', size: f.size, type: f.type, dataUrl: reader.result });
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

/* ---------- РћС‚РїСЂР°РІРєР° СЃРѕРѕР±С‰РµРЅРёР№ ---------- */
/* ============================================================
   Р—Р’РћРќРљР (Р»РёС‡РЅС‹Рµ Рё РіСЂСѓРїРїРѕРІС‹Рµ)
   ============================================================ */
const callState = { chatId: null, startedAt: 0, muted: false, video: false, micStream: null, camStream: null, shareStream: null, shareActive: false, ticker: null };
let incomingCall = null; // { chatId, msgId, video }
let pendingMedia = []; // { name, size, type, dataUrl }

function mediaLabel(msg) {
  if (msg.media && msg.media.length) {
    const m = msg.media[0];
    if (m.type && m.type.startsWith('image/')) return msg.media.length > 1 ? `[${msg.media.length} С„РѕС‚Рѕ]` : '[Р¤РѕС‚Рѕ]';
    return `[Р¤Р°Р№Р»: ${m.name}]`;
  }
  if (msg.voice) return '[Р“РѕР»РѕСЃРѕРІРѕРµ]';
  if (msg.video) return '[РљСЂСѓР¶РѕРє]';
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
        : `<span class="pending-file-ic">рџ“„</span>`}
      <span class="pending-name">${escapeHtml(m.name)}</span>
      <button type="button" class="pending-del" data-pi="${i}" title="РЈР±СЂР°С‚СЊ">вњ•</button>
    </div>`).join('') + '<div class="pending-send-hint">РќР°Р¶РјРёС‚Рµ вћ¤, С‡С‚РѕР±С‹ РѕС‚РїСЂР°РІРёС‚СЊ</div>';
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
  if (nm) nm.textContent = chat.type === 'private' ? (acc ? acc.name : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ') : chatTitle(chat);
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
        { kind: 'call_declined', text: `Р’С‹ РѕС‚РєР»РѕРЅРёР»Рё РІС‹Р·РѕРІ РѕС‚ @${(caller || {}).username || chat.userId}` },
        { kind: 'call_declined', text: `@${currentUser.username} РѕС‚РєР»РѕРЅРёР» РІР°С€ РІС‹Р·РѕРІ` }
      );
      saveState();
      renderMessages(chat);
    }
    closeIncoming(true);
    toast('Р’С‹Р·РѕРІ РѕС‚РєР»РѕРЅС‘РЅ');
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

/* ---------- РЎРѕР±С‹С‚РёСЏ Р·РІРѕРЅРєРѕРІ (РІС…РѕРґСЏС‰РёР№ / РїСЂРѕРїСѓС‰РµРЅРЅС‹Р№) ---------- */
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
  const icon = msg.video ? 'рџЋҐ' : 'рџ“ћ';
  if (msg.kind === 'call_in' && !msg.dismissed) {
    return `<div class="sys-call in" data-msg="${msg.id}">
      <div class="sc-icon">${icon}</div>
      <div class="sc-text"><b>Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРє</b><span>${escapeHtml(msg.text)} В· ${t}</span></div>
      <div class="sc-btns">
        <button type="button" class="btn btn-primary sys-call-btn" data-sys="answer">РћС‚РІРµС‚РёС‚СЊ</button>
        <button type="button" class="btn btn-ghost sys-call-btn" data-sys="decline">РћС‚РєР»РѕРЅРёС‚СЊ</button>
      </div>
    </div>`;
  }
  if (msg.kind === 'call_missed') {
    return `<div class="sys-call missed" data-msg="${msg.id}">
      <div class="sc-icon">рџ“µ</div>
      <div class="sc-text"><b>РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ РІС‹Р·РѕРІ</b><span>${escapeHtml(msg.text)} В· ${t}</span></div>
      <button type="button" class="btn btn-ghost sys-call-btn" data-sys="call">в†© РџРѕР·РІРѕРЅРёС‚СЊ</button>
    </div>`;
  }
  if (msg.kind === 'call_declined') {
    return `<div class="sys-call declined" data-msg="${msg.id}">
      <div class="sc-icon">вќЊ</div>
      <div class="sc-text"><b>Р’С‹Р·РѕРІ РѕС‚РєР»РѕРЅС‘РЅ</b><span>${escapeHtml(msg.text)} В· ${t}</span></div>
      ${chat.type === 'private' ? '<button type="button" class="btn btn-ghost sys-call-btn" data-sys="call">в†© РџРѕР·РІРѕРЅРёС‚СЊ</button>' : ''}
    </div>`;
  }
  if (msg.kind === 'call_ended') {
    return `<div class="sys-call ended" data-msg="${msg.id}"><div class="sc-icon">вњ…</div><div class="sc-text"><b>${escapeHtml(msg.text)}</b><span>${t}</span></div></div>`;
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
    toast('РљР°РјРµСЂР° РЅРµРґРѕСЃС‚СѓРїРЅР°', 'Р Р°Р·СЂРµС€РёС‚Рµ РґРѕСЃС‚СѓРї Рє РєР°РјРµСЂРµ РёР»Рё РїСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ');
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
    toast('РџРѕРєР°Р· СЌРєСЂР°РЅР° РѕС‚РјРµРЅС‘РЅ РёР»Рё РЅРµРґРѕСЃС‚СѓРїРµРЅ', 'РќСѓР¶РµРЅ РґРѕСЃС‚СѓРї Рє Р·Р°РїРёСЃРё СЌРєСЂР°РЅР°');
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
  if (callState.muted) parts.push('РјРёРєСЂРѕС„РѕРЅ РІС‹РєР»СЋС‡РµРЅ');
  if (callState.shareActive) parts.push('РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°');
  else if (callState.video) parts.push('РєР°РјРµСЂР° РІРєР»СЋС‡РµРЅР°');
  return parts.join(' В· ') || 'РёРґС‘С‚ СЂР°Р·РіРѕРІРѕСЂвЂ¦';
}
function updateCallStatus() {
  const ch = state.chats.find(c => c.id === callState.chatId);
  if (!ch) return;
  const st = $('#callStatus');
  if (!st) return;
  if (ch.type !== 'private') {
    st.innerHTML = `<div class="cs-title">Р“СЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє В· <b>${escapeHtml(chatTitle(ch))}</b></div>
      <div class="cs-sub">${chatMembers(ch).length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ В· ${callStatusText()}</div>`;
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
  if (r) r.classList.toggle('demo', !callState.shareStream && !callState.camStream);
  if (sb) sb.classList.toggle('on', !!callState.shareStream);
}
function startCall(chatId, video = false, noEvents = false) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;
  const members = chatMembers(chat);
  if (members.length < 2) {
    toast('РџРѕР·РІРѕРЅРёС‚СЊ РЅРµРєРѕРјСѓ', members.length === 1 ? 'Р’ СЌС‚РѕРј С‡Р°С‚Рµ РїРѕРєР° С‚РѕР»СЊРєРѕ РІС‹' : 'РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… СѓС‡Р°СЃС‚РЅРёРєРѕРІ');
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
      { kind: 'call_out', video, u: currentUser.username, text: `${video ? 'рџЋҐ' : 'рџ“ћ'} РСЃС…РѕРґСЏС‰РёР№ ${video ? 'РІРёРґРµРѕ' : ''}Р·РІРѕРЅРѕРє @${chat.type === 'private' ? chat.userId : 'СЃРѕР±РµСЃРµРґРЅРёРєР°Рј'}` },
      { kind: 'call_in', video, u: currentUser.username, text: `Р—РІРѕРЅРѕРє РѕС‚ @${currentUser.username}${video ? ' В· РІРёРґРµРѕ' : ''}` }
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
  toast(video ? 'Р’РёРґРµРѕР·РІРѕРЅРѕРє РЅР°С‡Р°С‚' : 'Р—РІРѕРЅРѕРє РЅР°С‡Р°С‚', members.length > 2 ? 'Р“СЂСѓРїРїРѕРІРѕР№ Р·РІРѕРЅРѕРє' : chatTitle(chat));
  if (chat.type === 'private' && rtcSupports()) {
    rtcMode = 'rtc';
    rtcRole = noEvents ? 'callee' : 'caller';
    rtcConnected = false;
    rtcSetupAt = Date.now();
    rtcAddedCand = { a: 0, b: 0 };
    try { rtcPeer = new RTCPeerConnection(RTC_STUN); } catch (e) { rtcPeer = null; }
    if (rtcPeer) {
      rtcPeer.onicecandidate = e => { if (e.candidate) rtcSendCandidates(chat.id, [e.candidate]); };
      rtcPeer.ontrack = e => { rtcRemoteStream = e.streams[0] || null; rtcAttachRemote(); };
      rtcPeer.onconnectionstatechange = () => {
        if (!rtcPeer) return;
        if (rtcPeer.connectionState === 'connected' || rtcPeer.connectionState === 'completed') {
          rtcConnected = true;
          stopRing();
          updateCallStatus();
        } else if (rtcPeer.connectionState === 'failed' && !rtcConnected && Date.now() - rtcSetupAt > 8000) {
          rtcFallbackSim(chat.id);
        }
      };
      const micP = enableMic();
      const camP = video ? enableCamera() : Promise.resolve(true);
      Promise.all([micP, camP]).then(() => rtcSetupLocal(chat)).catch(() => rtcSetupLocal(chat));
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
      : `<span class="cape"><span style="font-size:34px">рџЋҐ</span></span>`;
    stage.innerHTML = `
      <div class="call-bubbles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <video id="shareVideo" autoplay playsinline></video>
      <div class="share-badge" id="shareBadge">рџ–Ґ РРґС‘С‚ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°</div>
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
        <span>${u.username === currentUser.username ? 'Р’С‹' : displayName(u)}</span>
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
    const who = isPriv ? '@' + endChat.userId : 'В«' + chatTitle(endChat) + 'В»';
    if (dur < 5) {
      pushCallEventEverywhere(
        endChat,
        { kind: 'call_missed', text: `Р’С‹ Р·РІРѕРЅРёР»Рё ${who}, РЅРѕ РѕС‚РІРµС‚Р° РЅРµ Р±С‹Р»Рѕ` },
        { kind: 'call_missed', text: `РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ РІС‹Р·РѕРІ РѕС‚ @${currentUser.username}` }
      );
      addLog(currentUser.username, `Р—РІРѕРЅРѕРє ${who} РЅРµ Р±С‹Р» РїСЂРёРЅСЏС‚ (РїСЂРѕРїСѓС‰РµРЅ, ${dur} СЃРµРє)`);
    } else {
      pushCallEventEverywhere(
        endChat,
        { kind: 'call_ended', text: `Р—РІРѕРЅРѕРє Р·Р°РІРµСЂС€С‘РЅ В· ${fmtDur(dur)}` },
        { kind: 'call_ended', text: `Р—РІРѕРЅРѕРє РѕС‚ @${currentUser.username} Р·Р°РІРµСЂС€С‘РЅ В· ${fmtDur(dur)}` }
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
  if (dur > 0) toast('Р—РІРѕРЅРѕРє Р·Р°РІРµСЂС€С‘РЅ', (wasGroup ? 'Р“СЂСѓРїРїРѕРІРѕР№ В· ' : '') + fmtDur(dur));
}

/* ---------- РќРђРЎРўРћРЇР©РР• Р—Р’РћРќРљР (WebRTC) С‡РµСЂРµР· РѕР±Р»Р°РєРѕ ----------
   РЎРёРіРЅР°Р»РёР·Р°С†РёСЏ: offer/answer/ICE РєР°РЅРґРёРґР°С‚С‹ РѕР±РјРµРЅРёРІР°СЋС‚СЃСЏ С‡РµСЂРµР· РѕР±Р»Р°С‡РЅС‹Рµ РєР»СЋС‡Рё
   call_sig_<chatId>_a (Р·РІРѕРЅСЏС‰РёР№) Рё call_sig_<chatId>_b (РѕС‚РІРµС‡Р°СЋС‰РёР№).
   Р•СЃР»Рё РїСЂСЏРјРѕРµ СЃРѕРµРґРёРЅРµРЅРёРµ РЅРµ СѓСЃС‚Р°РЅРѕРІРёР»РѕСЃСЊ (СЃР»РѕР¶РЅС‹Р№ NAT) вЂ” РѕСЃС‚Р°С‘С‚СЃСЏ РґРµРјРѕ-СЂРµР¶РёРј. */
const RTC_STUN = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
let rtcPeer = null, rtcRemoteStream = null, rtcSigTimer = null;
let rtcMode = 'sim', rtcRole = 'caller', rtcConnected = false, rtcSetupAt = 0;
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
  if (rtcPeer) { try { rtcPeer.close(); } catch (e) {} rtcPeer = null; }
  rtcRemoteStream = null;
  rtcConnected = false;
  rtcMode = 'sim';
  rtcAddedCand = { a: 0, b: 0 };
  if (!keepStreams) stopStreams();
}
function rtcFallbackSim(chatId) {
  rtcTeardown(true);
  if (callState.chatId === chatId) toast('РќРµ СѓРґР°Р»РѕСЃСЊ СѓСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂСЏРјРѕРµ СЃРѕРµРґРёРЅРµРЅРёРµ', 'Р’РєР»СЋС‡С‘РЅ РґРµРјРѕ-СЂРµР¶РёРј Р·РІРѕРЅРєР°');
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
    toast(callState.muted ? 'РњРёРєСЂРѕС„РѕРЅ РІС‹РєР»СЋС‡РµРЅ' : 'РњРёРєСЂРѕС„РѕРЅ РІРєР»СЋС‡С‘РЅ');
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
    if (st) st.textContent = callState.shareActive ? 'РёРґС‘С‚ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ' : 'РІС‹РєР»СЋС‡РµРЅР°';
  });
  const cmShare = $('#cmShareBtn');
  if (cmShare) cmShare.addEventListener('click', () => {
    if (!callState.chatId) return;
    if (callState.shareActive) disableShare();
    else enableShare();
    const st = $('#cmShareState');
    if (st) st.textContent = callState.shareActive ? 'РёРґС‘С‚ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ' : 'РІС‹РєР»СЋС‡РµРЅР°';
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
  if (rpsReset) rpsReset.addEventListener('click', () => { gameRps.score = [0, 0]; gameRps.picks = [null, null]; gameRps.step = 0; const m = $('#rpsMsg'); if (m) m.textContent = gameRps.mode === 'pvp' ? 'РРіСЂРѕРє 1 РІС‹Р±РёСЂР°РµС‚ Р¶РµСЃС‚вЂ¦' : 'Р’С‹Р±РµСЂРёС‚Рµ Р¶РµСЃС‚ вЂ” РґРѕ 3 РїРѕР±РµРґ'; const u = $('#rpsU'), b = $('#rpsB'); if (u) u.textContent = 'вќ”'; if (b) b.textContent = 'вќ”'; renderRps(); });
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
    cam.innerHTML = '<option value="">РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ</option>' + vid.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'РљР°РјРµСЂР° ' + (i + 1))}</option>`).join('');
    mic.innerHTML = '<option value="">РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ</option>' + aud.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'РњРёРєСЂРѕС„РѕРЅ ' + (i + 1))}</option>`).join('');
    out.innerHTML = '<option value="">РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ</option>' + spo.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Р”РёРЅР°РјРёРє ' + (i + 1))}</option>`).join('');
    if (!vid.length) cam.innerHTML = '<option value="">РљР°РјРµСЂ РЅРµ РЅР°Р№РґРµРЅРѕ</option>';
    if (!aud.length) mic.innerHTML = '<option value="">РњРёРєСЂРѕС„РѕРЅРѕРІ РЅРµ РЅР°Р№РґРµРЅРѕ</option>';
    if (!spo.length) out.innerHTML = '<option value="">Р”РёРЅР°РјРёРєРѕРІ РЅРµ РЅР°Р№РґРµРЅРѕ</option>';
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
    toast('РЈСЃС‚СЂРѕР№СЃС‚РІРѕ РѕР±РЅРѕРІР»РµРЅРѕ');
  });
}
function applyAudioOutput() {
  const devs = (currentUser.settings && currentUser.settings.devices) || {};
  if (!devs.outId) return;
  const vs = [$('#camVideo'), $('#shareVideo'), $('#callPip') ? $('#callPip').querySelector('video') : null];
  vs.forEach(v => { if (v && v.setSinkId) v.setSinkId(devs.outId).catch(() => {}); });
}

const gameState = { board: [], me: 'вќЊ', bot: 'в­•', turn: 0, over: false, winner: null, score: [0, 0], mode: 'bot', busy: false };
const gameRps = { score: [0, 0], busy: false, mode: 'bot', picks: [null, null], step: 0 };
const RPS_EMOJI = ['вњЉ', 'вњ‹', 'вњЊпёЏ'];
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
  if (m) m.textContent = mode === 'pvp' ? 'РРіСЂРѕРє 1 РІС‹Р±РёСЂР°РµС‚ Р¶РµСЃС‚вЂ¦' : 'Р’С‹Р±РµСЂРёС‚Рµ Р¶РµСЃС‚ вЂ” РґРѕ 3 РїРѕР±РµРґ';
  const u = $('#rpsU'), b = $('#rpsB');
  if (u) u.textContent = 'вќ”';
  if (b) b.textContent = 'вќ”';
  renderRps();
}
function renderRps() {
  const su = $('#rpsScoreU'), sb = $('#rpsScoreB');
  if (su) su.textContent = gameRps.score[0];
  if (sb) sb.textContent = gameRps.score[1];
}
function rpsVsLabel(me, opp) {
  return `Р’С‹: <b>${me}</b> В· РЎРѕРїРµСЂРЅРёРє: <b>${opp}</b>`;
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
      if (bEl) bEl.textContent = 'вЂ¦';
      if (m) m.textContent = 'РРіСЂРѕРє 1 РІС‹Р±СЂР°Р» В· РРіСЂРѕРє 2 РґСѓРјР°РµС‚вЂ¦';
      renderRps();
      setTimeout(() => {
        gameRps.picks[1] = Math.floor(Math.random() * 3);
        if (bEl) bEl.textContent = RPS_EMOJI[gameRps.picks[1]];
        const res = rpsResult(gameRps.picks[0], gameRps.picks[1]);
        if (res > 0) { gameRps.score[0]++; if (m) m.textContent = 'РџРѕР±РµРґРёР» РРіСЂРѕРє 1! рџЋ‰'; }
        else if (res < 0) { gameRps.score[1]++; if (m) m.textContent = 'РџРѕР±РµРґРёР» РРіСЂРѕРє 2! рџЋ‰'; }
        else if (m) m.textContent = 'РќРёС‡СЊСЏ рџ¤ќ';
        if (gameRps.score[0] >= 3) { if (m) m.textContent = 'РРіСЂРѕРє 1 РІС‹РёРіСЂР°Р» РјР°С‚С‡! рџЏ†'; gameRps.score = [0, 0]; }
        else if (gameRps.score[1] >= 3) { if (m) m.textContent = 'РРіСЂРѕРє 2 РІС‹РёРіСЂР°Р» РјР°С‚С‡! рџЏ†'; gameRps.score = [0, 0]; }
        renderRps();
        gameRps.picks = [null, null];
        gameRps.step = 0;
        gameRps.busy = false;
        if (m && !m.textContent.includes('РјР°С‚С‡')) m.textContent += ' В· РќРѕРІС‹Р№ СЂР°СѓРЅРґ: РІР°С€ С…РѕРґвЂ¦';
        else if (m && m.textContent.includes('РјР°С‚С‡')) m.textContent += ' В· РќРѕРІС‹Р№ СЂР°СѓРЅРґ: РІР°С€ С…РѕРґвЂ¦';
      }, 900);
      return;
    }
    return;
  }
  gameRps.busy = true;
  const bot = Math.floor(Math.random() * 3);
  if (uEl) uEl.textContent = RPS_EMOJI[pick];
  if (bEl) bEl.textContent = 'вЂ¦';
  if (m) m.textContent = '3вЂ¦2вЂ¦1';
  setTimeout(() => {
    if (bEl) bEl.textContent = RPS_EMOJI[bot];
    const res = rpsResult(pick, bot);
    if (res > 0) { gameRps.score[0]++; if (m) m.textContent = 'Р’С‹ РІС‹РёРіСЂР°Р»Рё СЂР°СѓРЅРґ! рџЋ‰'; }
    else if (res < 0) { gameRps.score[1]++; if (m) m.textContent = 'Р‘РѕС‚ РІС‹РёРіСЂР°Р» СЂР°СѓРЅРґ рџ¤–'; }
    else if (m) m.textContent = 'РќРёС‡СЊСЏ рџ¤ќ';
    if (gameRps.score[0] >= 3) { if (m) m.textContent = 'РџРѕР±РµРґР° вЂ” РІС‹ РґРѕ 3 РїРѕР±РµРґ! рџЏ†'; gameRps.score = [0, 0]; }
    else if (gameRps.score[1] >= 3) { if (m) m.textContent = 'Р‘РѕС‚ РґРѕ 3 РїРѕР±РµРґ вЂ” СЂРµРІР°РЅС€? рџЏ'; gameRps.score = [0, 0]; }
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
    ? (gameState.winner === 'me' ? (pvp ? 'РџРѕР±РµРґРёР» РРіСЂРѕРє 1! рџЋ‰' : 'Р’С‹ РїРѕР±РµРґРёР»Рё! рџЋ‰') : gameState.winner === 'bot' ? (pvp ? 'РџРѕР±РµРґРёР» РРіСЂРѕРє 2! рџЋ‰' : 'РџРѕР±РµРґРёР» Р±РѕС‚ рџ¤–') : 'РќРёС‡СЊСЏ рџ¤ќ')
    : pvp
      ? (gameState.busy ? 'РҐРѕРґ РРіСЂРѕРєР° 2вЂ¦' : 'Р’Р°С€ С…РѕРґ (РРіСЂРѕРє 1 В· вќЊ)')
      : (gameState.turn === 0 ? 'Р’Р°С€ С…РѕРґ' : 'РҐРѕРґ Р±РѕС‚Р°вЂ¦');
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
  pip.innerHTML = `<div class="pip-media">${last ? '<video autoplay playsinline muted></video>' : '<div class="pip-avatar">рџ“ћ</div>'}</div>
    <div class="pip-info">
      <div class="pip-name">${escapeHtml(name)}</div>
      <div class="pip-time"><i class="pip-dot"></i><span id="pipTime">00:00</span></div>
    </div>
    <button class="pip-end" id="pipEndBtn" title="Р—Р°РІРµСЂС€РёС‚СЊ"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg></button>`;
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
  if (sec < 60) return sec + ' СЃРµРє';
  if (sec < 3600) return Math.floor(sec / 60) + ' РјРёРЅ';
  return Math.floor(sec / 3600) + ' С‡';
}
function fmtMb(b) {
  return b >= 1048576 ? (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' РњР‘' : Math.round(b / 1024) + ' РљР‘';
}
function sendMessage(chatId, text) {
  const chat = state.chats.find(c => c.id === chatId);
  const smExempt = isAdmin(currentUser.username) || chat.owner === 'me' || (chat.admins || []).includes('me');
  if (chat.slowMode > 0 && !smExempt && (chat.type === 'group' || chat.type === 'channel') && editTarget.chatId !== chatId) {
    const sml = chat.slowLast || (chat.slowLast = {});
    const last = sml[currentUser.username] || 0;
    const wait = chat.slowMode * 1000 - (Date.now() - last);
    if (wait > 0) {
      toast('РњРµРґР»РµРЅРЅС‹Р№ СЂРµР¶РёРј', 'РџРѕРґРѕР¶РґРёС‚Рµ ' + fmtDurShort(Math.ceil(wait / 1000)));
      return;
    }
    sml[currentUser.username] = Date.now();
  }
  if (chat.type === 'private' && editTarget.chatId !== chatId) {
    const other = accountByUsername(chat.userId);
    if (other && !canWriteTo(currentUser.username, other)) {
      const wcw = (other.settings && other.settings.whoCanWrite) || 'all';
      toast('РќРµР»СЊР·СЏ РѕС‚РїСЂР°РІРёС‚СЊ', wcw === 'nobody' ? `${other.name} Р·Р°РїСЂРµС‚РёР»(Р°) РїРёСЃР°С‚СЊ СЃРµР±Рµ` : `${other.name} СЂР°Р·СЂРµС€Р°РµС‚ РїРёСЃР°С‚СЊ С‚РѕР»СЊРєРѕ РєРѕРЅС‚Р°РєС‚Р°Рј`);
      return;
    }
  }
  if (editTarget.chatId === chatId) {
    const m = chat.messages.find(x => x.id === editTarget.msgId);
    if (m) { m.text = text; m.edited = true; pushMsgToCloud(chat, m); }
    editTarget.chatId = null; editTarget.msgId = null;
    addLog(currentUser.username, `РР·РјРµРЅРёР» СЃРѕРѕР±С‰РµРЅРёРµ РІ В«${chatTitle(chat)}В»`);
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
    if (chatId === AI_CHAT_ID) addLog(currentUser.username, `РќР°РїРёСЃР°Р» Nebula AI: "${preview}"`);
    else if (chat.type === 'private') addLog(currentUser.username, `РќР°РїРёСЃР°Р» @${chat.userId}: "${preview}"`);
    else if (chat.type === 'saved') addLog(currentUser.username, `РЎРѕС…СЂР°РЅРёР» Р·Р°РјРµС‚РєСѓ: "${preview}"`);
    else if (chat.type === 'group') addLog(currentUser.username, `РќР°РїРёСЃР°Р» РІ РіСЂСѓРїРїРµ В«${chat.name}В»: "${preview}"`);
    else addLog(currentUser.username, `РќР°РїРёСЃР°Р» РІ РєР°РЅР°Р»Рµ В«${chat.name}В»: "${preview}"`);
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

/* ---------- Р”РµР№СЃС‚РІРёСЏ РЅР°Рґ СЃРѕРѕР±С‰РµРЅРёСЏРјРё ---------- */
function composerExtraHtml(chat) {
  let html = '';
  if (editTarget.chatId === chat.id) {
    const m = chat.messages.find(x => x.id === editTarget.msgId);
    if (m) html += `<div class="composer-bar editing"><span>вњЋ Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ</span><b>${escapeHtml(shortText(m.text, 40))}</b><button data-bar="edit">вњ•</button></div>`;
  }
  if (replyTarget.chatId === chat.id) {
    const m = chat.messages.find(x => x.id === replyTarget.msgId);
    if (m) html += `<div class="composer-bar replying"><span>в†© Р’ РѕС‚РІРµС‚ РЅР° <i>${escapeHtml(senderName(m, chat))}</i></span><b>${escapeHtml(shortText(m.text, 40))}</b><button data-bar="reply">вњ•</button></div>`;
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
    ov.innerHTML = '<div class="pv-box"><img class="pv-img" src="" alt=""><button class="pv-close" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button><a class="pv-dl" download="" href="">в¬‡ РЎРєР°С‡Р°С‚СЊ</a></div>';
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
              { kind: 'call_declined', text: `Р’С‹ РѕС‚РєР»РѕРЅРёР»Рё РІС‹Р·РѕРІ РѕС‚ @${(caller || {}).username || chat.userId}` },
              { kind: 'call_declined', text: `@${currentUser.username} РѕС‚РєР»РѕРЅРёР» РІР°С€ РІС‹Р·РѕРІ` }
            );
          }
          saveState();
          renderMessages(chat);
          toast('Р’С‹Р·РѕРІ РѕС‚РєР»РѕРЅС‘РЅ');
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
          document.querySelectorAll('.msg-voice audio').forEach(a => { if (a !== au) { a.pause(); a.currentTime = 0; a.closest('.msg-voice').querySelector('.voice-play').textContent = 'в–¶'; a.closest('.msg-voice').querySelector('.voice-bar i').style.width = '0%'; } });
          vplay.textContent = 'вЏё';
          au.play().catch(() => { vplay.textContent = 'в–¶'; });
          au.ontimeupdate = () => { if (bar) bar.style.width = Math.min(100, (au.currentTime / (au.duration || 1)) * 100) + '%'; };
          au.onended = () => { vplay.textContent = 'в–¶'; if (bar) bar.style.width = '0%'; };
        } else {
          au.pause();
          vplay.textContent = 'в–¶';
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
          .then(() => toast('РЎРєРѕРїРёСЂРѕРІР°РЅРѕ'))
          .catch(() => toast('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ'));
        break;
      case 'edit':
        editTarget.chatId = chat.id; editTarget.msgId = msg.id;
        refreshComposerBars(chat);
        const t2 = $('#msgText');
        if (t2) { t2.value = msg.text; t2.focus(); t2.dispatchEvent(new Event('input')); }
        break;
      case 'del':
        if (!confirm('РЈРґР°Р»РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ?')) return;
        chat.messages = chat.messages.filter(m => m.id !== msg.id);
        cloudSave(cloudMdelKey(chat.id, msg.id), JSON.stringify({ ts: Date.now() }));
        cloudDelete(cloudMsgKey(chat.id, msg.id));
        if (chat.id === NEWS_CHAT_ID) syncNewsDeleteEverywhere(msg.id);
        addLog(currentUser.username, `РЈРґР°Р»РёР» СЃРѕРѕР±С‰РµРЅРёРµ РІ В«${chatTitle(chat)}В»`);
        saveState();
        renderMessages(chat);
        renderChatList();
        toast('РЎРѕРѕР±С‰РµРЅРёРµ СѓРґР°Р»РµРЅРѕ');
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
  addLog(currentUser.username, `${i >= 0 ? 'РЈР±СЂР°Р»' : 'РџРѕСЃС‚Р°РІРёР»'} СЂРµР°РєС†РёСЋ ${emoji} РІ В«${chatTitle(chat)}В»`);
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
      <div><div class="switch-name">${escapeHtml(chatTitle(c))}</div><div class="mi-status">${c.type === 'private' ? 'Р›РёС‡РЅРѕРµ' : c.type === 'group' ? 'Р“СЂСѓРїРїР°' : 'РљР°РЅР°Р»'} В· ${c.messages.length} СЃРѕРѕР±С‰.</div></div>
    </div>`).join('') : '<div class="empty-list">РќРµС‚ РґСЂСѓРіРёС… С‡Р°С‚РѕРІ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё.<br>РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІС‹Р№ С‡Р°С‚ Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°</div>';
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
   РљРђР РўРћР§РљРђ РџРћР›Р¬Р—РћР’РђРўР•Р›РЇ (РєР°Рє РІ Discord)
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
  const created = acc.created ? new Date(acc.created).toLocaleDateString('ru-RU') : 'вЂ”';
  const fr = FRAMES.find(f => f.id === frame);
  const frameName = frame ? (fr ? fr.name : frame) : 'вЂ”';
  const frameEmoji = frame ? (fr ? fr.emoji : '') : '';
  const hasPost = acc.statusPost && (Date.now() - acc.statusPost.time) < 86400000;
  $('#userCardBody').innerHTML = `
    <div class="ucard">
      <div class="ucard-banner" style="background:linear-gradient(135deg, ${acc.color[0]}, ${acc.color[1]})"></div>
      <div class="ucard-avatar-wrap">
        ${hasPost ? `<span class="st-ring" data-post="${escapeHtml(acc.username)}" title="РЎС‚Р°С‚СѓСЃ">` : ''}${avatarHtml(acc, 'xl', frame)}${hasPost ? '</span>' : ''}
        ${online ? '<span class="uc-online"></span>' : ''}
      </div>
      <div class="ucard-name">${displayName(acc)}</div>
      <div class="ucard-username"><span class="copy-id" data-copy="${escapeHtml(acc.id)}" title="РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ ID">ID ${escapeHtml(acc.id)} рџ“‹</span> В· @${escapeHtml(acc.username)}</div>
      ${acc.bio ? `<div class="ucard-bio">${escapeHtml(acc.bio)}</div>` : ''}
      <div class="ucard-status st-${statusOf(acc).cls}">${statusOf(acc).online ? 'в—Џ ' : ''}${statusOf(acc).label}${statusOf(acc).text ? ' В· ' + escapeHtml(statusOf(acc).text) : ''}</div>
      ${hasPost ? `<button class="btn btn-ghost" id="ucStatusBtn" style="width:100%;margin-top:8px">рџЊ€ РџРѕСЃРјРѕС‚СЂРµС‚СЊ СЃС‚Р°С‚СѓСЃ</button>` : ''}
      <div class="ucard-about">
        <div class="ucard-row"><span>РђРєРєР°СѓРЅС‚ СЃРѕР·РґР°РЅ</span><b>${created}</b></div>
        <div class="ucard-row"><span>Р’СЂРµРјСЏ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ</span><b>${fmtDuration(stat.seconds || 0)}</b></div>
        <div class="ucard-row"><span>РЎРѕРѕР±С‰РµРЅРёР№ РѕС‚РїСЂР°РІР»РµРЅРѕ</span><b>${msgs}</b></div>
        <div class="ucard-row"><span>РњР°РєСЃ. СѓСЂРѕРІРµРЅСЊ РґРµР»СЊС„РёРЅР°</span><b>рџђ¬ ${dolphinMax}</b></div>
        <div class="ucard-row"><span>Р Р°РјРєР° Р°РІР°С‚Р°СЂР°</span><b>${frameEmoji} ${frameName}</b></div>
      </div>
      <div class="ucard-tracks" id="ucTracks">
        <div class="ucard-tracks-head">рџЋµ РўСЂРµРєРё</div>
        <div class="ucard-tracks-sub">Р·Р°РіСЂСѓР·РєР°...</div>
      </div>
      <div class="ucard-actions">
        ${isMe ? '' : `<button class="btn btn-primary" id="ucWrite"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;margin-right:6px"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 14H6.83L4 18.83V4h14v12z"/></svg>РќР°РїРёСЃР°С‚СЊ</button>`}
        ${isMe ? '' : `<button class="btn btn-ghost" id="ucCall">рџ“ћ РџРѕР·РІРѕРЅРёС‚СЊ</button>`}
        ${isMe ? '' : `<button class="btn btn-ghost" id="ucVideoCall">рџЋҐ Р’РёРґРµРѕР·РІРѕРЅРѕРє</button>`}
        <button class="btn btn-ghost" id="ucClose">Р—Р°РєСЂС‹С‚СЊ</button>
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
      box.innerHTML = `<div class="ucard-tracks-head">рџЋµ РўСЂРµРєРё</div><div class="ucard-tracks-sub">РќРµС‚ С‚СЂРµРєРѕРІ</div>`;
      return;
    }
    let idx = 0;
    const render = () => {
      const t = list[idx];
      box.innerHTML = `
        <div class="ucard-tracks-head">рџЋµ РўСЂРµРєРё (${list.length})</div>
        <div class="uc-player">
          <button type="button" class="uc-pnav" data-ucnav="-1" title="РџСЂРµРґС‹РґСѓС‰РёР№ С‚СЂРµРє">вЏ®</button>
          <div class="uc-pcenter">
            <div class="uc-pname">${idx + 1}. ${escapeHtml(t.name)}</div>
            <audio class="uc-paudio" controls preload="none" src="${t.data}"></audio>
          </div>
          <button type="button" class="uc-pnav" data-ucnav="1" title="РЎР»РµРґСѓСЋС‰РёР№ С‚СЂРµРє">вЏ­</button>
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
  const name = msg.from === 'me' ? currentUser.name : (userById(msg.from) || { name: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ' }).name;
  const fwdMsg = { id: 'm' + Date.now(), from: dst.id === NEWS_CHAT_ID ? 'news' : 'me', text: msg.text, time: new Date().toISOString(), read: false, sent: true, forwarded: true, forwardedFrom: name };
  dst.messages.push(fwdMsg);
  pushMsgToCloud(dst, fwdMsg);
  if (dst.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(fwdMsg);
  addLog(currentUser.username, `РџРµСЂРµСЃР»Р°Р» СЃРѕРѕР±С‰РµРЅРёРµ РІ В«${chatTitle(dst)}В» РёР· В«${chatTitle(src)}В»`);
  saveState();
  closeForwardModal();
  toast('РџРµСЂРµСЃР»Р°РЅРѕ', chatTitle(dst));
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
    toast('РќРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ', chatTitle(chat), 2200);
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
    + `<div class="emoji-sep">Р¤Р»Р°РіРё</div>`
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
  const done = () => toast('РЎРєРѕРїРёСЂРѕРІР°РЅРѕ РІ Р±СѓС„РµСЂ', label || t);
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
  } catch (e) { toast('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ'); }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-copy]');
  if (el) copyTextPlain(el.dataset.copy, 'ID СЃРєРѕРїРёСЂРѕРІР°РЅ РІ Р±СѓС„РµСЂ');
});

/* ---------- РЎРўРРљР•Р Р« ---------- */
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
      <h3>${subd ? 'Р­С‚РѕС‚ РїР°Рє СѓР¶Рµ РІ РёР·Р±СЂР°РЅРЅРѕРј' : 'Р”РѕР±Р°РІРёС‚СЊ РїР°Рє РІ РёР·Р±СЂР°РЅРЅРѕРµ?'}</h3>
      <div class="spp-grid">${pack.stickers.slice(0, 8).map(s => `<img src="${s.dataUrl}" alt="">`).join('')}</div>
      <div class="spp-name">${escapeHtml(pack.name)}</div>
      <div class="spp-sub">РѕС‚ @${escapeHtml(owner.username)} В· ${pack.stickers.length} СЃС‚РёРє.</div>
      <div class="btn-row">
        <button class="btn btn-primary" id="sppYes">${subd ? 'РћС‚РїРёСЃР°С‚СЊСЃСЏ' : 'Р”Р°, РґРѕР±Р°РІРёС‚СЊ'}</button>
        <button class="btn" id="sppNo">РћС‚РјРµРЅР°</button>
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
      toast('РџР°Рє СѓР±СЂР°РЅ РёР· РёР·Р±СЂР°РЅРЅРѕРіРѕ');
    } else {
      currentUser.subscribedPacks.push(pack.id);
      toast('РџР°Рє РґРѕР±Р°РІР»РµРЅ РІ РёР·Р±СЂР°РЅРЅРѕРµ вњ“');
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
    sp.querySelectorAll('.stick-tab').forEach(t => t.addEventListener('click', () => { try { renderStickPanel(t.dataset.stab); } catch (e) { console.error(e); } }));
  }
  const body = $('#stickBody');
  const tab = sp.dataset.lastTab || 'fav';
  if (body && body.innerHTML.trim()) {
    sp.dataset.lastTab = tab;
    return;
  }
  try { renderStickPanel(tab); } catch (e) { console.error(e); }
}
function renderStickPanel(tab) {
  const sp = $('#stickPanel');
  sp.dataset.lastTab = tab;
  const body = $('#stickBody');
  if (!body) return;
  sp.querySelectorAll('.stick-tab').forEach(t => t.classList.toggle('sel', t.dataset.stab === tab));
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
    let h = '';
    if (subs.length) h += subs.map(({ pack, owner }) => `
      <div class="stick-pack-row">
        <b>${escapeHtml(pack.name)}</b>
        <span class="stick-pack-count">РѕС‚ @${escapeHtml(owner.username)} В· ${pack.stickers.length} СЃС‚РёРє.</span>
        <button class="stick-sub" data-sub="${escapeHtml(pack.id)}">РћС‚РїРёСЃР°С‚СЊСЃСЏ</button>
      </div>
      <div class="stick-grid">${pack.stickers.map(s => `
        <div class="sticker-cell">
          <img class="stick-img" src="${s.dataUrl}" alt="" title="РћС‚РїСЂР°РІРёС‚СЊ" data-send="${escapeHtml(s.dataUrl)}">
        </div>`).join('')}</div>`).join('');
    if (fav.length) {
      h += '<div class="stick-sep">в­ђ РР·Р±СЂР°РЅРЅС‹Рµ СЃС‚РёРєРµСЂС‹</div><div class="stick-grid">' + fav.map((s, i) => `
        <div class="sticker-cell">
          <img class="stick-img" src="${s.dataUrl}" alt="" title="РћС‚РїСЂР°РІРёС‚СЊ" data-send="${escapeHtml(s.dataUrl)}">
          <button class="stick-fav-del" data-fav="${i}" title="РЈР±СЂР°С‚СЊ РёР· РёР·Р±СЂР°РЅРЅРѕРіРѕ">вњ•</button>
        </div>`).join('') + '</div>';
    }
    if (!subs.length && !fav.length) h = '<div class="empty-list">РР·Р±СЂР°РЅРЅРѕРіРѕ РїРѕРєР° РЅРµС‚.<br>РћС‚РєСЂРѕР№С‚Рµ В«РџР°РєРё РґСЂСѓР·РµР№В» Рё РґРѕР±Р°РІСЊС‚Рµ РїР°Рє вЂ” СЃС‚РёРєРµСЂС‹ РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ.</div>';
    body.innerHTML = h;
    body.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => {
      currentUser.favStickers.splice(Number(b.dataset.fav), 1);
      persistCurrentUser();
      renderStickPanel('fav');
    }));
    body.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.sub;
      currentUser.subscribedPacks = (currentUser.subscribedPacks || []).filter(x => x !== id);
      persistCurrentUser();
      renderStickPanel('fav');
      toast('РџР°Рє СѓР±СЂР°РЅ РёР· РёР·Р±СЂР°РЅРЅРѕРіРѕ');
    }));
  } else if (tab === 'mine') {
    const packs = myStickerPacks();
    body.innerHTML = (packs.length ? packs.map(p => `
      <div class="stick-pack-row">
        <b>${escapeHtml(p.name)}</b>
        <span class="stick-pack-count">${p.stickers.length} СЃС‚РёРє.</span>
        <button class="stick-pack-del" data-pack="${escapeHtml(p.id)}" title="РЈРґР°Р»РёС‚СЊ РїР°Рє">рџ—‘</button>
      </div>
      <div class="stick-grid">${p.stickers.map(s => `
        <div class="sticker-cell">
          <img class="stick-img" src="${s.dataUrl}" alt="" title="РћС‚РїСЂР°РІРёС‚СЊ" data-send="${escapeHtml(s.dataUrl)}">
          <button class="stick-fav" data-sf="${escapeHtml(s.dataUrl)}" title="Р’ РёР·Р±СЂР°РЅРЅРѕРµ">в…</button>
        </div>`).join('')}</div>`).join('')
      : '<div class="empty-list">РЈ РІР°СЃ РїРѕРєР° РЅРµС‚ СЃС‚РёРєРµСЂ-РїР°РєРѕРІ.</div>') + '<button type="button" class="btn btn-primary stick-create">пј‹ РЎРѕР·РґР°С‚СЊ РїР°Рє РёР· С„РѕС‚Рѕ</button>';
    body.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => {
      currentUser.stickerPacks = currentUser.stickerPacks.filter(p => p.id !== b.dataset.pack);
      persistCurrentUser();
      renderStickPanel('mine');
      toast('РџР°Рє СѓРґР°Р»С‘РЅ');
    }));
    body.querySelectorAll('[data-sf]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = b.dataset.sf;
      currentUser.favStickers = currentUser.favStickers || [];
      if (!currentUser.favStickers.some(s => s.dataUrl === url)) {
        currentUser.favStickers.push({ dataUrl: url });
        persistCurrentUser();
        toast('Р”РѕР±Р°РІР»РµРЅРѕ РІ РёР·Р±СЂР°РЅРЅРѕРµ в­ђ');
      } else toast('РЈР¶Рµ РІ РёР·Р±СЂР°РЅРЅРѕРј');
    }));
    const sc = body.querySelector('.stick-create');
    if (sc) sc.addEventListener('click', openStickersManager);
  } else if (tab === 'friends') {
    const packs = friendStickerPacks();
    body.innerHTML = packs.length ? packs.map(({ pack, owner }) => {
      const subd = (currentUser.subscribedPacks || []).includes(pack.id);
      return `
      <div class="stick-pack-row clickable" data-subrow="${escapeHtml(pack.id)}" title="Р”РѕР±Р°РІРёС‚СЊ РїР°Рє РІ РёР·Р±СЂР°РЅРЅРѕРµ">
        <b>${escapeHtml(pack.name)}</b>
        <span class="stick-pack-count">РѕС‚ @${escapeHtml(owner.username)} В· ${pack.stickers.length} СЃС‚РёРє.</span>
        <button class="stick-sub" data-sub="${escapeHtml(pack.id)}">${subd ? 'вњ“ РџРѕРґРїРёСЃР°РЅ' : '+ Р”РѕР±Р°РІРёС‚СЊ РїР°Рє'}</button>
      </div>
      <div class="stick-grid">${pack.stickers.slice(0, 4).map(s => `
        <div class="sticker-cell">
          <img class="stick-img" src="${s.dataUrl}" alt="" title="РћС‚РїСЂР°РІРёС‚СЊ" data-send="${escapeHtml(s.dataUrl)}">
          <button class="stick-fav" data-sf="${escapeHtml(s.dataUrl)}" title="Р’ РёР·Р±СЂР°РЅРЅРѕРµ">в…</button>
        </div>`).join('')}</div>`;
    }).join('') : '<div class="empty-list">РЈ РґСЂСѓР·РµР№ РїРѕРєР° РЅРµС‚ РїР°РєРѕРІ.<br>РЎРѕР·РґР°Р№С‚Рµ СЃРІРѕР№ РїР°Рє вЂ” РѕРЅ РїРѕСЏРІРёС‚СЃСЏ Сѓ РЅРёС… Р·РґРµСЃСЊ.</div>';
    body.querySelectorAll('[data-subrow]').forEach(b => b.addEventListener('click', (e) => {
      if (e.target.closest('.stick-sub') || e.target.closest('.stick-fav') || e.target.closest('.stick-img')) return;
      const found = packs.find(x => x.pack.id === b.dataset.subrow);
      if (found) stickerPackPrompt(found.owner, found.pack);
    }));
    body.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.sub;
      currentUser.subscribedPacks = currentUser.subscribedPacks || [];
      if (currentUser.subscribedPacks.includes(id)) {
        currentUser.subscribedPacks = currentUser.subscribedPacks.filter(x => x !== id);
        toast('РџР°Рє СѓР±СЂР°РЅ');
      } else {
        currentUser.subscribedPacks.push(id);
        toast('РџР°Рє РґРѕР±Р°РІР»РµРЅ вњ“');
      }
      persistCurrentUser();
      renderStickPanel('friends');
    }));
    body.querySelectorAll('[data-sf]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = b.dataset.sf;
      currentUser.favStickers = currentUser.favStickers || [];
      if (!currentUser.favStickers.some(s => s.dataUrl === url)) {
        currentUser.favStickers.push({ dataUrl: url });
        persistCurrentUser();
        toast('Р”РѕР±Р°РІР»РµРЅРѕ РІ РёР·Р±СЂР°РЅРЅРѕРµ в­ђ');
      } else toast('РЈР¶Рµ РІ РёР·Р±СЂР°РЅРЅРѕРј');
    }));
  } else if (tab === 'mgr') {
    openStickersManager();
    return;
  }
  body.querySelectorAll('[data-send]').forEach(img => img.addEventListener('click', () => {
    const chat = currentChat();
    if (!chat) return;
    $('#stickPanel').classList.add('hidden');
    sendSticker(chat, img.dataset.send);
  }));
}
function sendSticker(chat, dataUrl) {
  const msg = { id: 'm' + Date.now(), from: chat.id === NEWS_CHAT_ID ? 'news' : 'me', text: '', time: new Date().toISOString(), read: false, sent: true, sticker: { dataUrl } };
  chat.messages.push(msg);
  pushMsgToCloud(chat, msg);
  if (chat.type === 'group' || chat.type === 'channel') {
    if (chat.id === NEWS_CHAT_ID) syncNewsMessageEverywhere(msg);
    else syncGroupMessageEverywhere(chat, msg, currentUser.username);
  }
  addLog(currentUser.username, `РћС‚РїСЂР°РІРёР» СЃС‚РёРєРµСЂ РІ В«${chatTitle(chat)}В»`);
  saveState();
  renderMessages(chat);
  if (isChatNearBottom()) scrollChatToBottom();
  renderChatList();
  bindChatEvents(chat);
}

/* ============================================================
   Р“РћР›РћРЎРћР’Р«Р• РЎРћРћР‘Р©Р•РќРРЇ Р РљР РЈР–РљР (РІРёРґРµРѕСЃРѕРѕР±С‰РµРЅРёСЏ)
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
  if (lab) lab.textContent = type === 'video' ? 'РљСЂСѓР¶РѕРє В· Р·Р°РїРёСЃСЊвЂ¦' : 'Р“РѕР»РѕСЃРѕРІРѕРµ В· Р·Р°РїРёСЃСЊвЂ¦';
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
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Р—Р°РїРёСЃСЊ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ СЌС‚РёРј Р±СЂР°СѓР·РµСЂРѕРј');
  if (typeof MediaRecorder === 'undefined') return toast('Р—Р°РїРёСЃСЊ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ СЌС‚РёРј Р±СЂР°СѓР·РµСЂРѕРј (РЅСѓР¶РµРЅ СЃРІРµР¶РёР№ Chrome/Safari)');
  const video = type === 'video';
  const chat = currentChat();
  if (!chat) return;
const begin = (stream) => {
      if (video && !stream.getVideoTracks().length) { stream.getTracks().forEach(t => t.stop()); return toast('РљР°РјРµСЂР° РЅРµ РЅР°Р№РґРµРЅР°'); }
      const mime = pickRecordMime(video);
      let rec;
      try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°С‡Р°С‚СЊ Р·Р°РїРёСЃСЊ'); }
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(recState && recState.timer);
        stream.getTracks().forEach(t => t.stop());
        if (!chunks.length) { recState = null; hideRecBar(); return toast('Р—Р°РїРёСЃСЊ РЅРµ СѓРґР°Р»Р°СЃСЊ, РїРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·'); }
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
    toast(video ? 'Р—Р°РїРёСЃСЊ РєСЂСѓР¶РєР°вЂ¦' : 'Р—Р°РїРёСЃСЊ РіРѕР»РѕСЃРѕРІРѕРіРѕвЂ¦');
  };
  navigator.mediaDevices.getUserMedia(video
    ? { audio: true, video: { facingMode: 'user' } }
    : { audio: true })
    .then(begin)
    .catch(() => {
      if (video) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          .then(begin)
          .catch(() => toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РєР°РјРµСЂРµ/РјРёРєСЂРѕС„РѕРЅСѓ'));
      } else {
        toast('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РјРёРєСЂРѕС„РѕРЅСѓ');
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
  addLog(currentUser.username, `РћС‚РїСЂР°РІРёР» ${media.voice ? 'РіРѕР»РѕСЃРѕРІРѕРµ' : 'РІРёРґРµРѕСЃРѕРѕР±С‰РµРЅРёРµ'} РІ В«${chatTitle(chat)}В»`);
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
  const animated = f.type === 'image/gif' || f.type === 'image/webp';
  const reader = new FileReader();
  reader.onload = () => {
    if (animated) {
      if (f.size > 3 * 1024 * 1024) toast('РЎС‚РёРєРµСЂ Р±РѕР»СЊС€Рµ 3 РњР‘ вЂ” РјРѕР¶РµС‚ РіСЂСѓР·РёС‚СЊСЃСЏ РґРѕР»РіРѕ');
      cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), dataUrl: reader.result });
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
      cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
    };
    img.onerror = () => cb({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), dataUrl: reader.result });
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
      <h3>рџЋЁ РњРѕРё СЃС‚РёРєРµСЂ-РїР°РєРё</h3>
      <div class="sm-list">
        ${packs.length ? packs.map(p => `
          <div class="sm-pack">
            <img class="sm-prev" src="${p.stickers[0].dataUrl}" alt="">
            <div class="sm-info"><b>${escapeHtml(p.name)}</b><span>${p.stickers.length} СЃС‚РёРєРµСЂРѕРІ</span></div>
            <button class="btn sm-add-sticker" data-smpack="${escapeHtml(p.id)}">пј‹ РЎС‚РёРєРµСЂ</button>
            <button class="btn btn-danger sm-del" data-smpack="${escapeHtml(p.id)}">РЈРґР°Р»РёС‚СЊ</button>
          </div>`).join('') : '<div class="empty-list">РџРѕРєР° РЅРµС‚ РїР°РєРѕРІ</div>'}
      </div>
      <button class="btn btn-primary" id="smCreate">пј‹ РЎРѕР·РґР°С‚СЊ РїР°Рє РёР· С„РѕС‚Рѕ</button>
      <button class="btn sm-close">Р—Р°РєСЂС‹С‚СЊ</button>
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
    toast('РџР°Рє СѓРґР°Р»С‘РЅ');
  }));
  const create = modal.querySelector('#smCreate');
  const createInput = document.createElement('input');
  createInput.type = 'file';
  createInput.accept = 'image/*';
  createInput.multiple = true;
  createInput.hidden = true;
  modal.appendChild(createInput);
  create.addEventListener('click', () => createInput.click());
  createInput.addEventListener('change', () => {
    const files = Array.from(createInput.files || []).slice(0, 30);
    createInput.value = '';
    if (!files.length) return;
    const name = prompt('РќР°Р·РІР°РЅРёРµ РїР°РєР°:');
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
        toast('РџР°Рє СЃРѕР·РґР°РЅ', name);
        openStickersManager();
      }
    }));
  });
  const addInput = document.createElement('input');
  addInput.type = 'file';
  addInput.accept = 'image/*';
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
        toast('РЎС‚РёРєРµСЂС‹ РґРѕР±Р°РІР»РµРЅС‹', pack.name + ' В· С‚РµРїРµСЂСЊ ' + pack.stickers.length + ' С€С‚.');
        openStickersManager();
      }
    }));
  });
}

/* ---------- Р¤РёР»СЊС‚СЂС‹ / РїРѕРёСЃРє ---------- */
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
   РЎРћР—Р”РђРќРР• Р§РђРўРђ
   ============================================================ */
let createContext = { type: null, selected: [], color: COLOR_PALETTE[0] };
let createAvatarImage = null;
const TYPE_NAMES = { private: 'Р›РёС‡РЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ', group: 'РќРѕРІР°СЏ РіСЂСѓРїРїР°', channel: 'РќРѕРІС‹Р№ РєР°РЅР°Р»' };

function openCreateModal() {
  createContext = { type: null, selected: [], color: COLOR_PALETTE[0], botColor: COLOR_PALETTE[0], access: 'public' };
  createAvatarImage = null;
  $('#modalTitle').textContent = 'РЎРѕР·РґР°С‚СЊ';
  $$('#modalSteps .step').forEach(s => s.classList.add('hidden'));
  $('#step-type').classList.remove('hidden');
  $('#modalBack').classList.add('hidden');
  $('#modalNext').classList.add('hidden');
  $('#modalCreate').classList.add('hidden');
  $('#createModal').classList.add('open');
}
function closeCreateModal() { $('#createModal').classList.remove('open'); }

function contactListHtml(items, checkable) {
  if (!items.length) return '<div class="empty-list">РџРѕРєР° РЅРµС‚ РґСЂСѓРіРёС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.<br>Р—Р°СЂРµРіРёСЃС‚СЂРёСЂСѓР№С‚Рµ РІС‚РѕСЂРѕР№ Р°РєРєР°СѓРЅС‚, С‡С‚РѕР±С‹ РѕР±С‰Р°С‚СЊСЃСЏ СЃ РЅРёРј.</div>';
  return items.map(u => `
    <div class="member-item ${checkable && createContext.selected.includes(u.username) ? 'checked' : ''}" data-id="${u.username}">
      ${avatarHtml(u)}
      <div style="min-width:0;flex:1"><div class="mi-name">${displayName(u)}</div><div class="mi-status">ID ${u.id} В· ${statusOf(u).label}</div></div>
      ${checkable ? `<span class="check">${CHECK_ICON}</span>` : ''}
    </div>`).join('');
}

function renderSearchPicker(container, sources, opts) {
  const { checkable, selected, onPick, onToggle, hint } = opts;
  container.innerHTML = `
    <input type="text" class="contact-search" placeholder="рџ”Ќ РџРѕРёСЃРє РїРѕ ID, @СЋР·РµСЂРЅРµР№РјСѓ РёР»Рё РёРјРµРЅРё" autocomplete="off">
    <div class="contact-hint">${hint || 'Р’РІРµРґРёС‚Рµ ID, @СЋР·РµСЂРЅРµР№Рј РёР»Рё РёРјСЏ РєРѕРЅС‚Р°РєС‚Р°'}</div>
    <div class="contact-results"></div>`;
  const inp = container.querySelector('.contact-search');
  const hintEl = container.querySelector('.contact-hint');
  const res = container.querySelector('.contact-results');
  const draw = () => {
    const raw = inp.value.trim();
    const q = raw.toLowerCase().replace(/^@/, '');
    if (!q) {
      const all = sources.slice(0, 15);
      if (!all.length) { res.innerHTML = '<div class="empty-list">РќРёРєРѕРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</div>'; hintEl.classList.add('hidden'); return; }
      hintEl.classList.add('hidden');
      res.innerHTML = all.map(u => `
        <div class="member-item ${checkable && selected.includes(u.username) ? 'checked' : ''}" data-id="${u.username}">
          <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
          <div style="min-width:0;flex:1">
            <div class="mi-name">${displayName(u)}</div>
            <div class="mi-status">ID ${u.id} В· @${escapeHtml(u.username)}</div>
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
    if (!/^[a-zР°-СЏС‘0-9_@ ]*$/i.test(raw)) { res.innerHTML = '<div class="empty-list">РўРѕР»СЊРєРѕ Р±СѓРєРІС‹, С†РёС„СЂС‹ Рё _</div>'; return; }
    const list = sources.filter(u => {
      if (String(u.id).toLowerCase().includes(q)) return true;
      if (u.username.toLowerCase().startsWith(q)) return true;
      return u.name.toLowerCase().includes(q);
    }).slice(0, 25);
    if (!list.length) {
      res.innerHTML = '<div class="empty-list">РќРёРєРѕРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</div>';
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
          <div class="mi-status">ID ${u.id} В· @${escapeHtml(u.username)} В· ${statusOf(u).label}</div>
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
    hint: 'Р’С‹Р±РµСЂРёС‚Рµ РєРѕРЅС‚Р°РєС‚ РёР»Рё РЅР°Р№РґРёС‚Рµ РїРѕ ID, @СЋР·РµСЂРЅРµР№РјСѓ РёР»Рё РёРјРµРЅРё',
  });
  refreshAccountsFromCloud().then(() => {
    const fresh = accountsList().filter(u => u.username !== currentUser.username);
    if (fresh.length > others.length) {
      renderSearchPicker($('#privatePicker'), fresh, {
        checkable: false,
        selected: [],
        onPick: startPrivateChat,
        hint: 'Р’С‹Р±РµСЂРёС‚Рµ РєРѕРЅС‚Р°РєС‚ РёР»Рё РЅР°Р№РґРёС‚Рµ РїРѕ ID, @СЋР·РµСЂРЅРµР№РјСѓ РёР»Рё РёРјРµРЅРё',
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
  addLog(currentUser.username, `РќР°С‡Р°Р» РґРёР°Р»РѕРі СЃ @${userId}`);
  closeCreateModal();
  renderChatList();
  selectChat(chat.id);
  toast('Р§Р°С‚ СЃРѕР·РґР°РЅ', chatTitle(chat));
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
    hint: 'Р’С‹Р±РµСЂРёС‚Рµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РёР»Рё РЅР°Р№РґРёС‚Рµ РїРѕ ID, @СЋР·РµСЂРЅРµР№РјСѓ РёР»Рё РёРјРµРЅРё',
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
    const t = name.value.trim() || (isChannel ? 'Рљ' : 'Р“');
    p.textContent = t[0].toUpperCase();
    p.style.background = `linear-gradient(135deg, ${createContext.color[0]}, ${createContext.color[1]})`;
  };
  name.addEventListener('input', update);
  const p = $('#createAvatarPreview');
  if (createAvatarImage) {
    p.innerHTML = `<img src="${createAvatarImage}">`;
    p.style.background = 'none';
  } else {
    p.textContent = (isChannel ? 'Рљ' : 'Р“');
    p.style.background = `linear-gradient(135deg, ${createContext.color[0]}, ${createContext.color[1]})`;
  }
}

function performCreate() {
  const isChannel = createContext.type === 'channel';
  const name = $('#createName').value.trim() || (isChannel ? 'РќРѕРІС‹Р№ РєР°РЅР°Р»' : 'РќРѕРІР°СЏ РіСЂСѓРїРїР°');
  const desc = $('#createDesc').value.trim();
  if (name.length > LIMITS.name) return toast('РћС€РёР±РєР°', `РќР°Р·РІР°РЅРёРµ вЂ” РјР°РєСЃРёРјСѓРј ${LIMITS.name} СЃРёРјРІРѕР»РѕРІ`);
  if (desc.length > LIMITS.desc) return toast('РћС€РёР±РєР°', `РћРїРёСЃР°РЅРёРµ вЂ” РјР°РєСЃРёРјСѓРј ${LIMITS.desc} СЃРёРјРІРѕР»РѕРІ`);
  let handle = null;
  if (isChannel) {
    const h = $('#createHandle').value.trim().replace(/^@/, '').toLowerCase();
    if (h) {
      if (!/^[a-z0-9_]{3,14}$/.test(h)) return toast('РћС€РёР±РєР°', 'Р®Р·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р°: 3-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _)');
      if (channelHandleTaken(h)) return toast('РћС€РёР±РєР°', 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р° СѓР¶Рµ Р·Р°РЅСЏС‚');
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
    messages: [{ id: 'm' + Date.now(), from: 'me', text: isChannel ? `РљР°РЅР°Р» В«${name}В» СЃРѕР·РґР°РЅ рџЋ‰` : `Р“СЂСѓРїРїР° В«${name}В» СЃРѕР·РґР°РЅР° рџЋ‰`, time: new Date().toISOString(), read: true }],
  };
  state.chats.push(chat);
  saveState();
  pushChatMeta(chat);
  distributeGroupToMembers(chat, currentUser.username);
  addLog(currentUser.username, isChannel
    ? `РЎРѕР·РґР°Р» РєР°РЅР°Р» В«${name}В»${handle ? ' @' + handle : ''}`
    : `РЎРѕР·РґР°Р» РіСЂСѓРїРїСѓ В«${name}В»`);
  closeCreateModal();
  renderChatList();
  selectChat(chat.id);
  toast(isChannel ? 'РљР°РЅР°Р» СЃРѕР·РґР°РЅ' : 'Р“СЂСѓРїРїР° СЃРѕР·РґР°РЅР°', name);
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
      $('#modalTitle').textContent = 'Р’С‹Р±РµСЂРёС‚Рµ РєРѕРЅС‚Р°РєС‚';
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
    if (!f.type.startsWith('image/')) return toast('РћС€РёР±РєР°', 'РњРѕР¶РЅРѕ Р·Р°РіСЂСѓР·РёС‚СЊ С‚РѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёРµ');
    const reader = new FileReader();
    reader.onload = (ev) => {
      createAvatarImage = ev.target.result;
      const p = $('#createAvatarPreview');
      p.innerHTML = `<img src="${createAvatarImage}">`;
      p.style.background = 'none';
      toast('Р¤РѕС‚Рѕ Р·Р°РіСЂСѓР¶РµРЅРѕ', 'РќР°Р¶РјРёС‚Рµ В«РЎРѕР·РґР°С‚СЊВ»');
    };
    reader.readAsDataURL(f);
  });
  $('#modalCreate').addEventListener('click', performCreate);
}

/* ---------- Р‘РћРўР« ---------- */
function botAccounts() { return accountsList().filter(a => a.isBot); }
function createBotFromModal() {
  const name = $('#botName').value.trim();
  if (!name) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ РёРјСЏ Р±РѕС‚Р°');
  const emoji = $('#botEmoji').value.trim() || 'рџ¤–';
  const triggers = $('#botTriggers').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const replies = $('#botReplies').value.split('\n').map(t => t.trim()).filter(Boolean);
  if (!replies.length) return toast('РћС€РёР±РєР°', 'Р”РѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РѕС‚РІРµС‚ Р±РѕС‚Р°');
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
  addLog(currentUser.username, `РЎРѕР·РґР°Р» Р±РѕС‚Р° В«${name}В» (@${username})`);
  closeCreateModal();
  toast('Р‘РѕС‚ СЃРѕР·РґР°РЅ', name + (triggers.length ? ' вЂ” С‚СЂРёРіРіРµСЂС‹: ' + triggers.join(', ') : ' вЂ” С‡Р°С‚-Р±РѕС‚, РѕС‚РІРµС‡Р°РµС‚ РЅР° РІСЃС‘'));
}
function smartBotReply(raw, bot) {
  const text = String(raw || '').trim();
  const low = text.toLowerCase();
  const emoji = (bot.bot && bot.bot.emoji) || 'рџ¤–';
  const name = bot.name || 'Р‘РѕС‚';
  const pairs = [
    [/РїСЂРёРІРµС‚|Р·РґСЂР°РІСЃС‚РІ|СЃР°Р»СЋС‚|С…Р°Р№|Р·РґРѕСЂРѕРІРѕ|РґРѕР±СЂС‹Р№ РґРµРЅСЊ|РґРѕР±СЂС‹Р№ РІРµС‡РµСЂ|РєСѓ\b/,
      [`РџСЂРёРІРµС‚! ${emoji} Р Р°Рґ(Р°) РїРѕР±РѕР»С‚Р°С‚СЊ.`, `Р—РґСЂР°РІСЃС‚РІСѓР№! ${emoji} РљР°Рє РґРµР»Р°?`, `РџСЂРёРІРµС‚-РїСЂРёРІРµС‚! ${emoji} Р§РµРј Р·Р°Р№РјС‘РјСЃСЏ?`]],
    [/РєР°Рє РґРµР»Р°|РєР°Рє С‚С‹\b|РєР°Рє Р¶РёР·РЅСЊ|С‡С‚Рѕ РЅРѕРІРѕРіРѕ|РєР°Рє РЅР°СЃС‚СЂРѕРµРЅРёРµ/,
      [`РЈ РјРµРЅСЏ РІСЃС‘ РѕС‚Р»РёС‡РЅРѕ! ${emoji} Рђ Сѓ С‚РµР±СЏ?`, `Р–РёРІСѓ РІ С‚РµР»РµС„РѕРЅРµ вЂ” С‚СѓС‚ РЅРµ СЃРєСѓС‡РЅРѕ ${emoji} Рђ С‚С‹ РєР°Рє?`, `РЎСѓРїРµСЂ! ${emoji} Р Р°СЃСЃРєР°Р¶Рё, РєР°Рє С‚РІРѕР№ РґРµРЅСЊ?`]],
    [/РєС‚Рѕ С‚С‹|С‚С‹ РєС‚Рѕ|СЂР°СЃСЃРєР°Р¶Рё Рѕ СЃРµР±Рµ|РєР°Рє С‚РµР±СЏ Р·РѕРІСѓС‚|С‚РІРѕС‘ РёРјСЏ/,
      [`РЇ ${name} ${emoji} вЂ” С‚РІРѕР№ СЃРѕР±РµСЃРµРґРЅРёРє РІ Nebula. РќР°РїРёС€Рё РјРЅРµ С‡С‚Рѕ-РЅРёР±СѓРґСЊ!`, `РњРµРЅСЏ Р·РѕРІСѓС‚ ${name} ${emoji} РЎРѕР·РґР°РЅ(Р°), С‡С‚РѕР±С‹ РѕР±С‰Р°С‚СЊСЃСЏ СЃ С‚РѕР±РѕР№.`]],
    [/РєР°Рє С‚РµР±СЏ Р·РѕРІСѓС‚/, [`РњРµРЅСЏ Р·РѕРІСѓС‚ ${name} ${emoji}`]],
    [/СЃРїР°СЃРёР±Рѕ|Р±Р»Р°РіРѕРґР°СЂ|СЃРїСЃ\b|РєСЂСѓС‚Рѕ|РєР»Р°СЃСЃ|С‚РѕРї\b/,
      [`Р’СЃРµРіРґР° РїРѕР¶Р°Р»СѓР№СЃС‚Р°! ${emoji}`, `РќРµ Р·Р° С‡С‚Рѕ! ${emoji}`, `Р Р°Рґ(Р°) РїРѕРјРѕС‡СЊ ${emoji}`]],
    [/РїРѕРєР°|РґРѕ СЃРІРёРґР°РЅРёСЏ|РїСЂРѕС‰Р°Р№|СЃРїРѕРєРѕР№РЅРѕР№ РЅРѕС‡Рё/,
      [`РџРѕРєР°-РїРѕРєР°! ${emoji} Р’РѕР·РІСЂР°С‰Р°Р№СЃСЏ СЃРєРѕСЂРµРµ.`, `Р”Рѕ РІСЃС‚СЂРµС‡Рё! ${emoji} Р‘СѓРґСѓ Р¶РґР°С‚СЊ.`]],
    [/Р»СЋР±Р»СЋ\b|РЅСЂР°РІРёС€СЊСЃСЏ|С‚С‹ РєР»Р°СЃСЃ|РѕР±РѕР¶Р°СЋ/,
      [`Р СЏ С‚РµР±СЏ! ${emoji}`, `РђС…Р°С…, СЃРїР°СЃРёР±Рѕ! ${emoji}`, `РўС‹ РґРµР»Р°РµС€СЊ РјРѕР№ РґРµРЅСЊ ${emoji}`]],
    [/С€СѓС‚Рє|Р°РЅРµРєРґРѕС‚|СЂР°СЃСЃРјРµС€Рё|СЃРјРµС€РЅРѕ/,
      [`РљР°РєРѕР№ Р»СЋР±РёРјС‹Р№ С†РІРµС‚ Сѓ РїСЂРѕРіСЂР°РјРјРёСЃС‚Р°? РЎРёРЅРёР№-СЃРёРЅРёР№-СЃРёРЅРёР№! ${emoji}`, `вЂ” РЇ РїРѕС€СѓС‚РёР»! вЂ” РљС‚Рѕ РіРѕРІРѕСЂРёС‚? ${emoji}`]],
    [/РґРµР»СЊС„РёРЅ/,
      [`Р”РµР»СЊС„РёРЅС‹ вЂ” СЌС‚Рѕ РјРѕСЂСЃРєР°СЏ Р»СЋР±РѕРІСЊ ${emoji} РџРѕРєРѕСЂРјРё РґРµР»СЊС„РёРЅР° РІ С‡Р°С‚Рµ!`]],
    [/РїРѕРіРѕРґ/,
      [`Р“РѕРІРѕСЂСЏС‚, РІ РІР°С€РµРј РіРѕСЂРѕРґРµ ${Math.round(8 + Math.random() * 22)}В°C ${emoji} РќСѓ Р° Сѓ РјРµРЅСЏ РІСЃРµРіРґР° СЃРѕР»РЅРµС‡РЅРѕ!`]],
    [/РІСЂРµРјСЏ|РєРѕС‚РѕСЂС‹Р№ С‡Р°СЃ/,
      [`РЎРµР№С‡Р°СЃ ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ${emoji}`]],
  ];
  for (const [re, replies] of pairs) {
    if (re.test(low)) return pick(replies);
  }
  const short = shortText(text, 40);
  if (low.includes('?')) {
    return pick([
      `РҐРј, РёРЅС‚РµСЂРµСЃРЅС‹Р№ РІРѕРїСЂРѕСЃ РїСЂРѕ В«${short}В» ${emoji} Р§С‚Рѕ С‚С‹ СЃР°Рј(Р°) РґСѓРјР°РµС€СЊ?`,
      `РћС…, Р° СЏ РєР°Рє СЂР°Р· РѕР± СЌС‚РѕРј РґСѓРјР°Р»(Р°) ${emoji} Р Р°СЃСЃРєР°Р¶Рё РїРѕРґСЂРѕР±РЅРµРµ?`,
    ]);
  }
  return pick([
    `В«${short}В» вЂ” РїРѕРЅСЏР»(Р°) С‚РµР±СЏ ${emoji} РџСЂРѕРґРѕР»Р¶Р°Р№!`,
    `РћРіРѕ, СЂР°СЃСЃРєР°Р¶Рё РµС‰С‘ С‡С‚Рѕ-РЅРёР±СѓРґСЊ ${emoji}`,
    `РРЅС‚РµСЂРµСЃРЅРѕ! ${emoji} Рђ С‡С‚Рѕ С‚С‹ РґСѓРјР°РµС€СЊ РѕР± СЌС‚РѕРј?`,
    `РЎР»СѓС€Р°СЋ С‚РµР±СЏ РІРЅРёРјР°С‚РµР»СЊРЅРѕ ${emoji} Р С‡С‚Рѕ РґР°Р»СЊС€Рµ?`,
    `РЇ Р·Р° С‚РµР±СЏ ${emoji} РўРѕР»СЊРєРѕ РІРїРµСЂС‘Рґ!`,
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
  if (!bot) return toast('РћС€РёР±РєР°', 'Р‘РѕС‚ РЅРµ РЅР°Р№РґРµРЅ');
  body.innerHTML = `
    <div class="manage-section">
      <h4>РќР°СЃС‚СЂРѕР№РєРё Р±РѕС‚Р°</h4>
      <div class="admin-hint">Р‘РѕС‚ РѕС‚РІРµС‡Р°РµС‚ РІ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С… РІСЃРµРіРґР° (РµСЃР»Рё РЅРµС‚ С‚СЂРёРіРіРµСЂРѕРІ) РёР»Рё РїРѕ С‚СЂРёРіРіРµСЂР°Рј. Р’ РіСЂСѓРїРїР°С… вЂ” С‚РѕР»СЊРєРѕ РЅР° СѓРїРѕРјРёРЅР°РЅРёРµ @${bot.username} РёР»Рё С‚СЂРёРіРіРµСЂ. Р‘РµР· С‚СЂРёРіРіРµСЂРѕРІ Р±РѕС‚ РѕС‚РІРµС‡Р°РµС‚ РЅР° Р»СЋР±РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ СѓРјРЅС‹РјРё РѕС‚РІРµС‚Р°РјРё С‡Р°С‚-Р±РѕС‚Р°.</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" class="rename-input" id="ebEmoji" value="${escapeHtml(bot.bot.emoji || 'рџ¤–')}" maxlength="4" style="width:70px;text-align:center" title="Р­РјРѕРґР·Рё">
        <input type="text" class="rename-input" id="ebName" value="${escapeHtml(bot.name)}" maxlength="24" placeholder="РРјСЏ Р±РѕС‚Р°">
      </div>
      <input type="text" class="rename-input" id="ebTriggers" style="margin-top:8px" value="${escapeHtml((bot.bot.triggers || []).join(', '))}" placeholder="РўСЂРёРіРіРµСЂС‹ С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ: РїСЂРёРІРµС‚, С…Р°Р№, Р±РѕС‚. РџСѓСЃС‚Рѕ РёР»Рё * вЂ” РѕС‚РІРµС‡Р°С‚СЊ РЅР° РІСЃС‘" maxlength="120">
      <textarea class="rename-input" id="ebReplies" rows="4" style="margin-top:8px" placeholder="РћС‚РІРµС‚С‹ Р±РѕС‚Р° вЂ” РєР°Р¶РґС‹Р№ СЃ РЅРѕРІРѕР№ СЃС‚СЂРѕРєРё" maxlength="600">${escapeHtml((bot.bot.replies || []).join('\n'))}</textarea>
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="ebSave">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button class="btn btn-ghost" id="ebBack">РќР°Р·Р°Рґ</button>
      </div>
    </div>`;
  body.querySelector('#ebSave').addEventListener('click', () => {
    bot.name = $('#ebName').value.trim() || bot.name;
    bot.bot.emoji = $('#ebEmoji').value.trim() || 'рџ¤–';
    bot.bot.triggers = $('#ebTriggers').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    bot.bot.replies = $('#ebReplies').value.split('\n').map(t => t.trim()).filter(Boolean);
    if (!bot.bot.replies.length) return toast('РћС€РёР±РєР°', 'Р”РѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РѕС‚РІРµС‚');
    persistOther(bot);
    addLog(currentUser.username, `РћР±РЅРѕРІРёР» Р±РѕС‚Р° В«${bot.name}В»`);
    renderManageBody(chat);
    renderChatList();
    renderChat();
    toast('Р‘РѕС‚ РѕР±РЅРѕРІР»С‘РЅ', bot.name);
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

/* ---------- Р›РР§РќР«Р• Р§РђРўР« (РґР»СЏ Р°РґРјРёРЅРєРё) ---------- */
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
   РќРђРЎРўР РћР™РљР Р§РђРўРђ (СѓРїСЂР°РІР»РµРЅРёРµ)
   ============================================================ */
let manageChatId = null;
function openManageModal(chat) {
  manageChatId = chat.id;
  $('#manageTitle').textContent = chat.type === 'private' ? 'РќР°СЃС‚СЂРѕР№РєРё С‡Р°С‚Р°' : 'РЈРїСЂР°РІР»РµРЅРёРµ С‡Р°С‚РѕРј';
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
    [0, 'Р’С‹РєР»СЋС‡РµРЅ'],
    [1, '1 СЃРµРє'],
    [5, '5 СЃРµРє'],
    [10, '10 СЃРµРє'],
    [30, '30 СЃРµРє'],
    [60, '1 РјРёРЅСѓС‚Р°'],
    [600, '10 РјРёРЅСѓС‚'],
    [1800, '30 РјРёРЅСѓС‚'],
    [3600, '1 С‡Р°СЃ'],
    [7200, '2 С‡Р°СЃР°'],
    [10800, '3 С‡Р°СЃР°'],
    [18000, '5 С‡Р°СЃРѕРІ'],
    [86400, '24 С‡Р°СЃР° (СЃСѓС‚РєРё)'],
  ];
  let html = `
    <div class="manage-avatar" style="${avatarStyle(acc)}">${avatarInnerHtml(acc)}</div>
    <div class="manage-name">${chat.type === 'private' ? displayName(acc) : escapeHtml(chatTitle(chat))}</div>
    <div class="manage-sub">${isPrivate
      ? `<span class="copy-id" data-copy="${escapeHtml(acc.id)}" title="РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ ID">ID ${escapeHtml(acc.id)} рџ“‹</span>`
      : chat.type === 'group' ? `${chat.members.length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ` : `${chat.members.length} РїРѕРґРїРёСЃС‡РёРєРѕРІ`}${!isPrivate && chat.handle ? ` В· @${escapeHtml(chat.handle)}` : ''}</div>
    ${chat.desc ? `<div class="manage-desc">${escapeHtml(chat.desc)}</div>` : ''}
  `;

  if (isPrivate) {
    const isBlocked = currentUser.blocked.includes(chat.userId);
    const isIgnored = currentUser.ignored.includes(chat.userId);
    const isBotChat = !!((userById(chat.userId) || {}).isBot);
    html += `
      <div class="manage-section">
        <h4>РќР°СЃС‚СЂРѕР№РєРё С‡Р°С‚Р°</h4>
        ${isBotChat ? `<div class="manage-row" id="mrEditBot">
          <svg viewBox="0 0 24 24"><path d="M21 16.5c0-.38-.21-.71-.53-.88l-7.9-4.44a1 1 0 0 0-.94 0L5.73 15.62c-.32.17-.53.5-.53.88s.21.71.53.88l7.9 4.44c.15.08.32.12.48.12s.33-.04.48-.12l7.9-4.44c.32-.17.53-.5.53-.88zM12 10.5 4.06 6.06 11.53 2.2a1.37 1.37 0 0 1 .94 0l7.47 3.86L12 10.5z"/></svg>
          <div><div class="mr-label">РќР°СЃС‚СЂРѕРёС‚СЊ Р±РѕС‚Р°</div><div class="mr-hint">РўСЂРёРіРіРµСЂС‹, РѕС‚РІРµС‚С‹, РёРјСЏ Рё СЌРјРѕРґР·Рё</div></div>
        </div>` : ''}
        <div class="manage-row" id="mrBlock">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
          <div><div class="mr-label">Р—Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ</div><div class="mr-hint">РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ СЃРјРѕР¶РµС‚ РІР°Рј РїРёСЃР°С‚СЊ</div></div>
          <span class="tag-state ${isBlocked ? 'on' : 'off'}">${isBlocked ? 'Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ' : 'РІС‹РєР»СЋС‡РµРЅРѕ'}</span>
        </div>
        <div class="manage-row" id="mrIgnore">
          <svg viewBox="0 0 24 24"><path d="M18.92 5.01C18.72 4.42 18.16 4 17.5 4h-11c-.66 0-1.21.42-1.42 1.01L3 11v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 6h10.3l1.04 3H5.81l1.04-3zM19 16H5v-4.66L5.13 10h13.74c.06.44.13.88.13 1.34V16z"/></svg>
          <div><div class="mr-label">РРіРЅРѕСЂРёСЂРѕРІР°С‚СЊ</div><div class="mr-hint">Р‘РµР· СѓРІРµРґРѕРјР»РµРЅРёР№ Рё РѕС‚РІРµС‚РѕРІ</div></div>
          <span class="tag-state ${isIgnored ? 'on' : 'off'}">${isIgnored ? 'РёРіРЅРѕСЂРёСЂСѓРµС‚СЃСЏ' : 'РІС‹РєР»СЋС‡РµРЅРѕ'}</span>
        </div>
        <div class="manage-row" id="mrClearAll">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          <div><div class="mr-label">РћС‡РёСЃС‚РёС‚СЊ С‡Р°С‚ РґР»СЏ РІСЃРµС…</div><div class="mr-hint">РЈРґР°Р»РёС‚СЊ РёСЃС‚РѕСЂРёСЋ Сѓ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ</div></div>
        </div>
        <div class="manage-row" id="mrClearMe">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          <div><div class="mr-label">РћС‡РёСЃС‚РёС‚СЊ С‡Р°С‚ РґР»СЏ СЃРµР±СЏ</div><div class="mr-hint">РЈРґР°Р»РёС‚СЊ РёСЃС‚РѕСЂРёСЋ С‚РѕР»СЊРєРѕ Сѓ СЃРµР±СЏ</div></div>
        </div>
      </div>`;
    html += `
      <div class="manage-section">
        <h4>РћРїР°СЃРЅР°СЏ Р·РѕРЅР°</h4>
        <button class="danger-btn" id="mrDeleteChat">РЈРґР°Р»РёС‚СЊ С‡Р°С‚</button>
      </div>`;
    html += `
      <div class="manage-section">
        <h4>РРЅСЃС‚СЂСѓРјРµРЅС‚С‹</h4>
        <div class="manage-row" id="mrPoll">
          <svg viewBox="0 0 24 24"><path d="M3 5h18v2H3V5zm4 6h11v2H7v-2zm-4 6h18v2H3v-2z"/></svg>
          <div><div class="mr-label">РЎРѕР·РґР°С‚СЊ РѕРїСЂРѕСЃ</div><div class="mr-hint">Р“РѕР»РѕСЃРѕРІР°РЅРёРµ СЃ РІР°СЂРёР°РЅС‚Р°РјРё РѕС‚РІРµС‚РѕРІ</div></div>
        </div>
        <div class="manage-row" id="mrContact">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          <div><div class="mr-label">РџРѕРґРµР»РёС‚СЊСЃСЏ РєРѕРЅС‚Р°РєС‚РѕРј</div><div class="mr-hint">РћС‚РїСЂР°РІРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div></div>
        </div>
      </div>`;
  } else {
    if (isAdmin) {
      html += `<div class="manage-section"><h4>Рћ С‡Р°С‚Рµ</h4>
        <div class="manage-row" id="mrEditInfo">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          <div><div class="mr-label">РќР°Р·РІР°РЅРёРµ Рё РѕРїРёСЃР°РЅРёРµ</div><div class="mr-hint">РР·РјРµРЅРёС‚СЊ РёРЅС„РѕСЂРјР°С†РёСЋ</div></div>
        </div>
        <div class="manage-row" id="mrChatAvatar">
          <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          <div><div class="mr-label">РЎРјРµРЅРёС‚СЊ Р°РІР°С‚Р°СЂ</div><div class="mr-hint">Р—Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ РёР»Рё РєР°СЂС‚РёРЅРєСѓ</div></div>
        </div>
        <div class="manage-row" id="mrChatCard">
          <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg>
          <div><div class="mr-label">РљР°СЂС‚РѕС‡РєР° ${chat.type === 'channel' ? 'РєР°РЅР°Р»Р°' : 'РіСЂСѓРїРїС‹'}</div><div class="mr-hint">QR-РєРѕРґ, РёРЅС„РѕСЂРјР°С†РёСЏ, СЃСЃС‹Р»РєР°</div></div>
        </div>
      </div>`;
    }
    html += `<div class="manage-section">
      <h4>РќР°СЃС‚СЂРѕР№РєРё РґРѕСЃС‚СѓРїР°</h4>
      ${isOwner ? `<div class="manage-row" id="mrAccess">
          <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          <div><div class="mr-label">РўРёРї РґРѕСЃС‚СѓРїР°</div><div class="mr-hint">РџСѓР±Р»РёС‡РЅР°СЏ вЂ” РІСЃС‚СѓРїРёС‚СЊ РјРѕР¶РµС‚ Р»СЋР±РѕР№, РїСЂРёРІР°С‚РЅР°СЏ вЂ” С‚РѕР»СЊРєРѕ РїРѕ РїСЂРёРіР»Р°С€РµРЅРёСЋ</div></div>
          <span class="tag-state ${chat.access === 'public' ? 'on' : 'off'}">${chat.access === 'public' ? 'РїСѓР±Р»РёС‡РЅР°СЏ' : 'РїСЂРёРІР°С‚РЅР°СЏ'}</span>
        </div>` : ''}
      <div class="manage-row" id="mrWhoInvite">
        <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        <div><div class="mr-label">РљС‚Рѕ РјРѕР¶РµС‚ РїСЂРёРіР»Р°С€Р°С‚СЊ</div><div class="mr-hint">РћРіСЂР°РЅРёС‡РёС‚СЊ РїСЂР°РІР° РЅР° РїСЂРёРіР»Р°С€РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ</div></div>
        <span class="tag-state ${chat.whoCanInvite === 'all' ? 'on' : 'off'}">${chat.whoCanInvite === 'all' ? 'РІСЃРµ СѓС‡Р°СЃС‚РЅРёРєРё' : 'РІР»Р°РґРµР»РµС† Рё Р°РґРјРёРЅС‹'}</span>
      </div>
    </div>`;
    const label = chat.type === 'group' ? 'РЈС‡Р°СЃС‚РЅРёРєРё' : 'РџРѕРґРїРёСЃС‡РёРєРё';
    const canWriteHere = chat.type === 'group' ? true
      : (chat.id === NEWS_CHAT_ID ? newsFullAccess(currentUser) : (isAdmin || chat.whoCanWrite === 'all'));
    if (canWriteHere) {
      html += `<div class="manage-section">
        <h4>РРЅСЃС‚СЂСѓРјРµРЅС‚С‹</h4>
        <div class="manage-row" id="mrPoll">
          <svg viewBox="0 0 24 24"><path d="M3 5h18v2H3V5zm4 6h11v2H7v-2zm-4 6h18v2H3v-2z"/></svg>
          <div><div class="mr-label">РЎРѕР·РґР°С‚СЊ РѕРїСЂРѕСЃ</div><div class="mr-hint">Р“РѕР»РѕСЃРѕРІР°РЅРёРµ СЃ РІР°СЂРёР°РЅС‚Р°РјРё РѕС‚РІРµС‚РѕРІ</div></div>
        </div>
        <div class="manage-row" id="mrContact">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          <div><div class="mr-label">РџРѕРґРµР»РёС‚СЊСЃСЏ РєРѕРЅС‚Р°РєС‚РѕРј</div><div class="mr-hint">РћС‚РїСЂР°РІРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div></div>
        </div>
      </div>`;
    }
    if (chat.type === 'group') {
      const cur = chat.slowMode || 0;
      html += `<div class="manage-section">
        <h4>РњРµРґР»РµРЅРЅС‹Р№ СЂРµР¶РёРј</h4>
        <div class="admin-hint">РћРіСЂР°РЅРёС‡РёРІР°РµС‚, РєР°Рє С‡Р°СЃС‚Рѕ СѓС‡Р°СЃС‚РЅРёРєРё РјРѕРіСѓС‚ РѕС‚РїСЂР°РІР»СЏС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ РІ РіСЂСѓРїРїСѓ</div>
        <select class="rename-input" id="smSelect" style="margin-top:8px">
          ${SLOW_MODE_OPTIONS.map(o => `<option value="${o[0]}" ${cur === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
        </select>
      </div>`;
    }
    html += `<div class="manage-section"><h4>${label} вЂ” ${chat.members.length}</h4>`;
    chat.members.forEach(mid => {
      const u = userById(mid);
      if (!u) return;
      const isMe = mid === 'me';
      const isOwnerC = mid === chat.owner;
      const isAdminC = (chat.admins || []).includes(mid);
      let tag = '';
      if (isOwnerC) tag = '<span class="tag owner">РІР»Р°РґРµР»РµС†</span>';
      else if (isAdminC) tag = '<span class="tag admin">Р°РґРјРёРЅ</span>';
      if (isMe) tag += ' <span class="tag you">РІС‹</span>';
      const canRemove = isAdmin && !isMe && !isOwnerC;
      const canToggle = isOwner && !isMe && !isOwnerC;
      html += `<div class="member-chip">
        ${avatarHtml(u)}
        <div class="mc-name">${displayName(u)} ${tag}</div>
        ${!isMe ? `<button class="mini-btn mini-info" title="РљР°СЂС‚РѕС‡РєР°" data-action="card" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg></button>` : ''}
        ${!isMe ? `<button class="mini-btn ${currentUser.blocked.includes(mid) ? 'mini-danger' : ''}" title="${currentUser.blocked.includes(mid) ? 'Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ' : 'Р—Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ'}" data-action="block" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg></button>` : ''}
        ${!isMe ? `<button class="mini-btn ${currentUser.ignored.includes(mid) ? 'mini-danger' : ''}" title="${currentUser.ignored.includes(mid) ? 'РЎРЅСЏС‚СЊ РёРіРЅРѕСЂ' : 'РРіРЅРѕСЂРёСЂРѕРІР°С‚СЊ'}" data-action="ignore" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg></button>` : ''}
        ${canToggle ? `<button class="mini-btn" title="${isAdminC ? 'РЎРЅСЏС‚СЊ СЃ Р°РґРјРёРЅРѕРІ' : 'РЎРґРµР»Р°С‚СЊ Р°РґРјРёРЅРѕРј'}" data-action="toggle-admin" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></button>` : ''}
        ${canRemove ? `<button class="mini-btn" title="РЈРґР°Р»РёС‚СЊ" data-action="remove-member" data-mid="${mid}"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
      </div>`;
    });
    if (isAdmin || chat.whoCanInvite === 'all') {
      html += `<div class="manage-row" id="mrAdd">
        <svg viewBox="0 0 24 24"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
        <div><div class="mr-label">Р”РѕР±Р°РІРёС‚СЊ ${chat.type === 'group' ? 'СѓС‡Р°СЃС‚РЅРёРєР°' : 'РїРѕРґРїРёСЃС‡РёРєР°'}</div><div class="mr-hint">РџСЂРёРіР»Р°СЃРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div></div>
      </div>`;
    }
    html += `</div>`;
    if (chat.id !== NEWS_CHAT_ID && chat.id !== AI_CHAT_ID) {
      html += `<div class="manage-section">
        ${isOwner
          ? `<button class="danger-btn" id="mrDeleteChat">${chat.type === 'group' ? 'РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ' : 'РЈРґР°Р»РёС‚СЊ РєР°РЅР°Р»'}</button>`
          : `<button class="danger-btn" id="mrLeave">${chat.type === 'group' ? 'РџРѕРєРёРЅСѓС‚СЊ РіСЂСѓРїРїСѓ' : 'РћС‚РїРёСЃР°С‚СЊСЃСЏ'}</button>`}
      </div>`;
    }
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
    toast(i >= 0 ? 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ' : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ', chatTitle(chat));
  });

  const mrIgnore = body.querySelector('#mrIgnore');
  if (mrIgnore) mrIgnore.addEventListener('click', () => {
    const i = currentUser.ignored.indexOf(chat.userId);
    if (i >= 0) currentUser.ignored.splice(i, 1);
    else currentUser.ignored.push(chat.userId);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'РРіРЅРѕСЂРёСЂРѕРІР°РЅРёРµ СЃРЅСЏС‚Рѕ' : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІ РёРіРЅРѕСЂРµ', chatTitle(chat));
  });

  const mrClearAll = body.querySelector('#mrClearAll');
  if (mrClearAll) mrClearAll.addEventListener('click', () => {
    if (!confirm('РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РґР»СЏ РІСЃРµС…?')) return;
    chat.messages = [];
    saveState();
    renderChat();
    renderChatList();
    toast('Р§Р°С‚ РѕС‡РёС‰РµРЅ РґР»СЏ РІСЃРµС…');
  });
  const mrClearMe = body.querySelector('#mrClearMe');
  if (mrClearMe) mrClearMe.addEventListener('click', () => {
    if (!confirm('РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РґР»СЏ СЃРµР±СЏ?')) return;
    chat.messages = [];
    saveState();
    renderChat();
    renderChatList();
    toast('Р§Р°С‚ РѕС‡РёС‰РµРЅ РґР»СЏ СЃРµР±СЏ');
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
    toast(chat.access === 'public' ? 'Р“СЂСѓРїРїР° С‚РµРїРµСЂСЊ РїСѓР±Р»РёС‡РЅР°СЏ' : 'Р“СЂСѓРїРїР° С‚РµРїРµСЂСЊ РїСЂРёРІР°С‚РЅР°СЏ', chatTitle(chat));
  });

  const mrWhoInvite = body.querySelector('#mrWhoInvite');
  if (mrWhoInvite) {
    if (isOwner || (chat.admins || []).includes('me')) {
      mrWhoInvite.addEventListener('click', () => {
        chat.whoCanInvite = chat.whoCanInvite === 'all' ? 'admins' : 'all';
        saveState();
        renderManageBody(chat);
        toast(chat.whoCanInvite === 'all' ? 'РџСЂРёРіР»Р°С€Р°С‚СЊ РјРѕРіСѓС‚ РІСЃРµ СѓС‡Р°СЃС‚РЅРёРєРё' : 'РџСЂРёРіР»Р°С€Р°С‚СЊ РјРѕРіСѓС‚ РІР»Р°РґРµР»РµС† Рё Р°РґРјРёРЅС‹', chatTitle(chat));
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
      toast('РњРµРґР»РµРЅРЅС‹Р№ СЂРµР¶РёРј', chat.slowMode === 0 ? 'Р’С‹РєР»СЋС‡РµРЅ' : 'Р’РєР»СЋС‡С‘РЅ: ' + (SLOW_MODE_OPTIONS.find(o => o[0] === chat.slowMode) || ['', ''])[1]);
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
    toast('РЈС‡Р°СЃС‚РЅРёРє СѓРґР°Р»С‘РЅ', userById(mid).name);
  }));
  body.querySelectorAll('[data-action="toggle-admin"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    const idx = chat.admins.indexOf(mid);
    if (idx >= 0) chat.admins.splice(idx, 1);
    else chat.admins.push(mid);
    saveState();
    renderManageBody(chat);
    toast('РџСЂР°РІР° РѕР±РЅРѕРІР»РµРЅС‹', userById(mid).name);
  }));

  body.querySelectorAll('[data-action="block"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    const i = currentUser.blocked.indexOf(mid);
    if (i >= 0) currentUser.blocked.splice(i, 1);
    else currentUser.blocked.push(mid);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ' : 'Р—Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ', (userById(mid) || {}).name || mid);
  }));
  body.querySelectorAll('[data-action="ignore"]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.mid;
    const i = currentUser.ignored.indexOf(mid);
    if (i >= 0) currentUser.ignored.splice(i, 1);
    else currentUser.ignored.push(mid);
    persistCurrentUser();
    renderManageBody(chat);
    renderChat();
    toast(i >= 0 ? 'РРіРЅРѕСЂ СЃРЅСЏС‚' : 'Р’ РёРіРЅРѕСЂРµ', (userById(mid) || {}).name || mid);
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
      toast('РќРµР»СЊР·СЏ', 'РљР°РЅР°Р» Nebula News РЅРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ');
      return;
    }
    if (chat.id === AI_CHAT_ID) {
      toast('РќРµР»СЊР·СЏ', 'Nebula AI РІСЃРµРіРґР° СЃ РІР°РјРё рџ‰');
      return;
    }
    const label = chat.type === 'private' ? 'С‡Р°С‚' : chat.type === 'group' ? 'РіСЂСѓРїРїСѓ' : 'РєР°РЅР°Р»';
    if (!confirm(`РЈРґР°Р»РёС‚СЊ ${label} В«${chatTitle(chat)}В»?`)) return;
    state.chats = state.chats.filter(c => c.id !== chat.id);
    state.pinned = state.pinned.filter(p => p !== chat.id);
    if (state.currentChatId === chat.id) state.currentChatId = null;
    saveState();
    closeManageModal();
    renderChatList();
    renderChat();
    toast(label.charAt(0).toUpperCase() + label.slice(1) + ' СѓРґР°Р»С‘РЅ(Р°)', chatTitle(chat));
  });
  const mrLeave = body.querySelector('#mrLeave');
  if (mrLeave) mrLeave.addEventListener('click', () => {
    if (chat.id === NEWS_CHAT_ID) {
      toast('РќРµР»СЊР·СЏ', 'РћС‚РїРёСЃР°С‚СЊСЃСЏ РѕС‚ Nebula News РЅРµРІРѕР·РјРѕР¶РЅРѕ вЂ” РєР°РЅР°Р» РѕР±СЏР·Р°С‚РµР»РµРЅ');
      return;
    }
    if (chat.id === AI_CHAT_ID) {
      toast('РќРµР»СЊР·СЏ', 'Nebula AI РІСЃРµРіРґР° СЃ РІР°РјРё рџ‰');
      return;
    }
    toast(chat.type === 'group' ? 'Р’С‹ РїРѕРєРёРЅСѓР»Рё РіСЂСѓРїРїСѓ' : 'Р’С‹ РѕС‚РїРёСЃР°Р»РёСЃСЊ', chatTitle(chat));
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
}

function openAddMember(chat) {
  const body = $('#manageBody');
  const available = accountsList().filter(u => u.username !== currentUser.username && !chat.members.includes(u.username));
  if (!available.length) { toast('РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№'); return; }
  body.innerHTML = `<div class="manage-section"><h4>Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ</h4>${contactListHtml(available, false)}</div>`;
  body.querySelectorAll('.member-item').forEach(item => item.addEventListener('click', () => {
    const mid = item.dataset.id;
    if (!chat.members.includes(mid)) chat.members.push(mid);
    saveState();
    distributeGroupToMembers(chat, currentUser.username);
    renderManageBody(chat);
    renderChat();
    renderChatList();
    toast('Р”РѕР±Р°РІР»РµРЅРѕ', userById(mid).name);
  }));
}

function openEditInfo(chat) {
  const body = $('#manageBody');
  body.innerHTML = `
    <div class="manage-section">
      <h4>РќР°Р·РІР°РЅРёРµ Рё РѕРїРёСЃР°РЅРёРµ</h4>
      <input type="text" id="editName" placeholder="РќР°Р·РІР°РЅРёРµ" maxlength="${LIMITS.name}" value="${escapeHtml(chat.name)}">
      <textarea id="editDesc" rows="3" placeholder="РћРїРёСЃР°РЅРёРµ" maxlength="${LIMITS.desc}">${escapeHtml(chat.desc || '')}</textarea>
      ${chat.type === 'channel' ? `
        <input type="text" id="editHandle" placeholder="@СЋР·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р°" value="${escapeHtml(chat.handle || '')}" style="margin-top:8px">
        <div class="mr-hint" style="margin-top:4px">3-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _). РџСѓСЃС‚Рѕ вЂ” Р±РµР· СЋР·РµСЂРЅРµР№РјР°.</div>` : ''}
      <div class="color-palette" id="editPalette"></div>
    </div>
    <div class="modal-footer" style="padding:0;border:none">
      <button class="btn btn-primary" id="saveInfo">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
      <button class="btn btn-ghost" id="cancelInfo">РћС‚РјРµРЅР°</button>
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
    if (n.length > LIMITS.name) return toast('РћС€РёР±РєР°', `РќР°Р·РІР°РЅРёРµ вЂ” РјР°РєСЃРёРјСѓРј ${LIMITS.name} СЃРёРјРІРѕР»РѕРІ`);
    if (d.length > LIMITS.desc) return toast('РћС€РёР±РєР°', `РћРїРёСЃР°РЅРёРµ вЂ” РјР°РєСЃРёРјСѓРј ${LIMITS.desc} СЃРёРјРІРѕР»РѕРІ`);
    if (chat.type === 'channel' && chat.id !== NEWS_CHAT_ID) {
      const h = $('#editHandle').value.trim().replace(/^@/, '').toLowerCase();
      if (h && !/^[a-z0-9_]{3,14}$/.test(h)) return toast('РћС€РёР±РєР°', 'Р®Р·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р°: 3-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _)');
      if (h && channelHandleTaken(h, chat.id)) return toast('РћС€РёР±РєР°', 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р° СѓР¶Рµ Р·Р°РЅСЏС‚');
      chat.handle = h || null;
    }
    chat.name = n;
    chat.desc = d;
    saveState();
    renderManageBody(chat);
    renderChat();
    renderChatList();
    toast('РЎРѕС…СЂР°РЅРµРЅРѕ');
  });
  $('#cancelInfo').addEventListener('click', () => renderManageBody(chat));
}

function bindManageModal() {
  $('#manageClose').addEventListener('click', closeManageModal);
  $('#manageModal').addEventListener('click', (e) => { if (e.target === $('#manageModal')) closeManageModal(); });
}

/* ============================================================
   РљРђР РўРћР§РљРђ РљРђРќРђР›Рђ / Р“Р РЈРџРџР« (QR, РёРЅС„РѕСЂРјР°С†РёСЏ, СЃСЃС‹Р»РєР°)
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
          <div class="cc-sub">${chat.type === 'channel' ? 'РљР°РЅР°Р»' : 'Р“СЂСѓРїРїР°'}${chat.handle ? ' В· @' + escapeHtml(chat.handle) : ''}</div>
        </div>
        <button class="se-close" id="ccClose">вњ•</button>
      </div>
      ${qr ? `
      <div class="cc-qr">
        <img src="${qr}" alt="QR-РєРѕРґ">
        <div class="cc-qr-hint">РћС‚СЃРєР°РЅРёСЂСѓР№С‚Рµ, С‡С‚РѕР±С‹ РѕС‚РєСЂС‹С‚СЊ РєР°РЅР°Р»</div>
      </div>` : ''}
      <div class="cc-links">
        <button class="btn btn-primary" id="ccCopy">рџ”— РЎРєРѕРїРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ</button>
        <button class="btn" id="ccOpen">РћС‚РєСЂС‹С‚СЊ</button>
      </div>
      <div class="manage-section">
        <h4>РРЅС„РѕСЂРјР°С†РёСЏ</h4>
        <div class="bn-row"><span>РўРёРї</span><b>${chat.type === 'channel' ? 'РљР°РЅР°Р»' : 'Р“СЂСѓРїРїР°'}</b></div>
        <div class="bn-row"><span>${chat.type === 'channel' ? 'РџРѕРґРїРёСЃС‡РёРєРѕРІ' : 'РЈС‡Р°СЃС‚РЅРёРєРѕРІ'}</span><b>${chat.members.length}</b></div>
        ${chat.handle ? `<div class="bn-row"><span>РЎСЃС‹Р»РєР°</span><b>@${escapeHtml(chat.handle)}</b></div>` : ''}
        <div class="bn-row"><span>РЎРѕР·РґР°С‚РµР»СЊ</span><b>${owner ? '@' + escapeHtml(owner.username) : 'вЂ”'}</b></div>
        ${chat.createdAt ? `<div class="bn-row"><span>РЎРѕР·РґР°РЅ</span><b>${new Date(chat.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</b></div>` : ''}
      </div>
      <div class="manage-section">
        <h4>Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ</h4>
        ${chat.desc ? `<div class="bn-row"><span>РћРїРёСЃР°РЅРёРµ</span><b>${escapeHtml(chat.desc)}</b></div>` : ''}
        <div class="bn-row"><span>Р”РѕСЃС‚СѓРї</span><b>${chat.access === 'public' ? 'РџСѓР±Р»РёС‡РЅС‹Р№' : 'РџСЂРёРІР°С‚РЅС‹Р№'}</b></div>
        <div class="bn-row"><span>РљС‚Рѕ РјРѕР¶РµС‚ РїРёСЃР°С‚СЊ</span><b>${chat.whoCanWrite === 'all' ? 'Р’СЃРµ' : 'Р’Р»Р°РґРµР»РµС† Рё Р°РґРјРёРЅС‹'}</b></div>
        <div class="bn-row"><span>РђРґРјРёРЅС‹</span><b>${(chat.admins || []).map(x => x === 'me' ? 'Р’С‹' : '@' + x).join(', ') || 'вЂ”'}</b></div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#ccClose').addEventListener('click', close);
  ov.querySelector('#ccCopy').addEventListener('click', () => {
    copyTextPlain(link, 'РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°');
    toast('РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°', link);
  });
  ov.querySelector('#ccOpen').addEventListener('click', () => { close(); openChannelByLink(chat.id); });
}

/* РЎРјРµРЅР° Р°РІР°С‚Р°СЂР° РєР°РЅР°Р»Р°/РіСЂСѓРїРїС‹ */
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
    if (f.size > 6 * 1024 * 1024) return toast('РћС€РёР±РєР°', 'Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№');
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
        toast('РђРІР°С‚Р°СЂ РѕР±РЅРѕРІР»С‘РЅ', chatTitle(chat));
      };
      img.onerror = () => toast('РћС€РёР±РєР°', 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ');
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  });
  input.click();
}

/* ============================================================
   РќРђРЎРўР РћР™РљР РђРљРљРђРЈРќРўРђ
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
        <div class="sprofile-id"><span class="copy-id" data-copy="${escapeHtml(u.id)}" title="РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ ID">ID: <b>${u.id}</b> рџ“‹</span> В· @${escapeHtml(u.username)}</div>
        <div class="sprofile-email">${escapeHtml(u.email)} В· РїРѕРґС‚РІРµСЂР¶РґРµРЅР° вњ“</div>
      </div>
    </div>
    <div class="manage-section">
      <div class="setting-row" id="srAvatar"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg><div><span class="sr-label">РЎРјРµРЅРёС‚СЊ Р°РІР°С‚Р°СЂ</span><span class="sr-hint">Р’С‹Р±РµСЂРёС‚Рµ С„РѕС‚Рѕ РёР»Рё Р·Р°РіСЂСѓР·РёС‚Рµ СЃРІРѕС‘</span></div></div>
      <div class="setting-row" id="srCard"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg><div><span class="sr-label">РњРѕСЏ РєР°СЂС‚РѕС‡РєР°</span><span class="sr-hint">РџРѕСЃРјРѕС‚СЂРµС‚СЊ, РєР°Рє РІР°СЃ РІРёРґСЏС‚ РґСЂСѓРіРёРµ</span></div></div>
      <div class="setting-row" id="srName"><svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-3zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg><div><span class="sr-label">РР·РјРµРЅРёС‚СЊ РёРјСЏ</span><span class="sr-hint">РўРµРєСѓС‰РµРµ: ${escapeHtml(u.name)}</span></div></div>
      <div class="setting-row" id="srUsername"><svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v6a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5zm7 9h-2v2a5 5 0 0 1-10 0v-2H5v2a7 7 0 0 0 6 6.92V22h2v-2.08A7 7 0 0 0 19 13v-2z"/></svg><div><span class="sr-label">РР·РјРµРЅРёС‚СЊ СЋР·РµСЂРЅРµР№Рј</span><span class="sr-hint">РўРµРєСѓС‰РёР№: @${escapeHtml(u.username)}</span></div></div>
      <div class="setting-row" id="srBio"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><div><span class="sr-label">РћРїРёСЃР°РЅРёРµ</span><span class="sr-hint">${u.bio ? escapeHtml(u.bio) : 'Р Р°СЃСЃРєР°Р¶РёС‚Рµ Рѕ СЃРµР±Рµ (РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ РІ РєР°СЂС‚РѕС‡РєРµ)'}</span></div></div>
      <div class="setting-row" id="srStatus"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5.25 3.15L17 12.2l-4-2.4V7z"/></svg><div><span class="sr-label">РЎС‚Р°С‚СѓСЃ</span><span class="sr-hint">${escapeHtml(statusOf(u).label + (statusOf(u).text ? ' В· ' + statusOf(u).text : ''))}</span></div></div>
      <div class="setting-row" id="srStickers"><svg viewBox="0 0 24 24"><path d="M18.5 2H5.5C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2zm0 17.5h-13v-15h13v15zM7.5 6h9v2h-9V6zm0 4h9v2h-9v-2zm0 4h6v2h-6v-2z"/></svg><div><span class="sr-label">РњРѕРё СЃС‚РёРєРµСЂ-РїР°РєРё</span><span class="sr-hint">РЎРѕР·РґР°С‚СЊ РїР°Рє РёР· С„РѕС‚Рѕ, РёР·Р±СЂР°РЅРЅРѕРµ, РїР°РєРё РґСЂСѓР·РµР№</span></div></div>
      <div class="setting-row" id="srTracks"><svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg><div><span class="sr-label">РњРѕРё С‚СЂРµРєРё (MP3)</span><span class="sr-hint">Р—Р°РіСЂСѓР·РёС‚Рµ РјСѓР·С‹РєСѓ вЂ” РѕРЅР° РїРѕСЏРІРёС‚СЃСЏ РІ РІР°С€РµР№ РєР°СЂС‚РѕС‡РєРµ</span></div></div>
      <div class="setting-row" id="srEmail"><svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg><div><span class="sr-label">РЎРјРµРЅРёС‚СЊ РїРѕС‡С‚Сѓ</span><span class="sr-hint">РўРµРєСѓС‰Р°СЏ: ${escapeHtml(u.email)}</span></div></div>
      <div class="setting-row" id="srPassword"><svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg><div><span class="sr-label">РЎРјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ</span><span class="sr-hint">РћР±РЅРѕРІРёС‚Рµ РїР°СЂРѕР»СЊ Р°РєРєР°СѓРЅС‚Р°</span></div></div>
      <div class="setting-row" id="srSwitch"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg><div><span class="sr-label">РЎРјРµРЅРёС‚СЊ Р°РєРєР°СѓРЅС‚</span><span class="sr-hint">Р’РѕР№С‚Рё РїРѕРґ РґСЂСѓРіРёРј СЋР·РµСЂРЅРµР№РјРѕРј</span></div></div>
      <div class="setting-row" id="srLogout"><svg viewBox="0 0 24 24"><path d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg><div><span class="sr-label">Р’С‹Р№С‚Рё РёР· Р°РєРєР°СѓРЅС‚Р°</span></div></div>
      <div class="setting-row danger-row" id="srDelete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg><div><span class="sr-label">РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚</span><span class="sr-hint">РўСЂРµР±СѓРµС‚СЃСЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РїРѕ РїРѕС‡С‚Рµ</span></div></div>
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
  body.querySelector('#srLogout').addEventListener('click', () => { closeSettings(); if (confirm('Р’С‹Р№С‚Рё РёР· Р°РєРєР°СѓРЅС‚Р°?')) logout(); });
  body.querySelector('#srDelete').addEventListener('click', () => {
    closeSettings();
    openVerifyModal({
      title: 'РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р°',
      desc: `Р”Р»СЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РјС‹ РѕС‚РїСЂР°РІРёР»Рё РєРѕРґ РЅР° <b>${escapeHtml(u.email)}</b>. Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ вЂ” РІСЃРµ С‡Р°С‚С‹ Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹.`,
      email: u.email,
      onSuccess: () => {
        deleteAccountEverywhere(u.username);
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        logout();
        toast('РђРєРєР°СѓРЅС‚ СѓРґР°Р»С‘РЅ');
      }
    });
  });
}

function viewChangeEmail() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>РЎРјРµРЅРёС‚СЊ РїРѕС‡С‚Сѓ</h4>
      <input type="email" id="newEmail" placeholder="РќРѕРІР°СЏ РїРѕС‡С‚Р°">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="sendNewEmailCode">РћС‚РїСЂР°РІРёС‚СЊ РєРѕРґ</button>
        <button class="btn btn-ghost" id="backToProfile">РќР°Р·Р°Рґ</button>
      </div>
    </div>`;
  body.querySelector('#sendNewEmailCode').addEventListener('click', () => {
    const email = $('#newEmail').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('РћС€РёР±РєР°', 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РїРѕС‡С‚Р°');
    if (accountsList().some(a => a.username !== currentUser.username && a.email === email)) return toast('РћС€РёР±РєР°', 'Р­С‚Р° РїРѕС‡С‚Р° СѓР¶Рµ Р·Р°РЅСЏС‚Р°');
    openVerifyModal({
      title: 'РЎРјРµРЅР° РїРѕС‡С‚С‹',
      desc: `РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° <b>${escapeHtml(email)}</b>`,
      email,
      onSuccess: () => {
        currentUser.email = email;
        persistCurrentUser();
        toast('РџРѕС‡С‚Р° РёР·РјРµРЅРµРЅР°', email);
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
      <h4>РР·РјРµРЅРёС‚СЊ РёРјСЏ</h4>
      <div class="admin-hint">РРјСЏ (РЅРёРєРЅРµР№Рј) РІРёРґСЏС‚ РІСЃРµ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё РІ С‡Р°С‚Р°С…, Р·РІРѕРЅРєР°С… Рё РЅР° РєР°СЂС‚РѕС‡РєРµ. Р”Рѕ 24 СЃРёРјРІРѕР»РѕРІ.</div>
      <input type="text" id="newName" placeholder="РќРѕРІРѕРµ РёРјСЏ" maxlength="24" autocomplete="off" value="${escapeHtml(currentUser.name)}">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveName">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button class="btn btn-ghost" id="backToProfileN">РќР°Р·Р°Рґ</button>
      </div>
    </div>`;
  body.querySelector('#saveName').addEventListener('click', () => {
    const v = $('#newName').value.trim();
    if (!v) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ РёРјСЏ');
    currentUser.name = v;
    persistCurrentUser();
    persistOther(currentUser);
    const d = loadAccounts();
    if (d.users[currentUser.username]) d.users[currentUser.username].name = v;
    saveAccounts(d);
    addLog(currentUser.username, `РЎРјРµРЅРёР» РёРјСЏ РЅР° В«${v}В»`);
    renderSettings('profile');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('РРјСЏ РёР·РјРµРЅРµРЅРѕ', v);
  });
  body.querySelector('#backToProfileN').addEventListener('click', () => renderSettings('profile'));
}

function viewChangeUsername() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>РР·РјРµРЅРёС‚СЊ СЋР·РµСЂРЅРµР№Рј</h4>
      <div class="admin-hint">3-14 СЃРёРјРІРѕР»РѕРІ: Р»Р°С‚РёРЅРёС†Р°, С†РёС„СЂС‹ Рё _. РџРѕ РЅРѕРІРѕРјСѓ СЋР·РµСЂРЅРµР№РјСѓ РІР°СЃ РјРѕР¶РЅРѕ Р±СѓРґРµС‚ РЅР°Р№С‚Рё.</div>
      <input type="text" id="newUsername" placeholder="РќРѕРІС‹Р№ СЋР·РµСЂРЅРµР№Рј" maxlength="14" autocomplete="off" value="${escapeHtml(currentUser.username)}">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveUsername">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button class="btn btn-ghost" id="backToProfile3">РќР°Р·Р°Рґ</button>
      </div>
    </div>`;
  body.querySelector('#saveUsername').addEventListener('click', () => {
    const v = $('#newUsername').value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,14}$/.test(v)) return toast('РћС€РёР±РєР°', 'Р®Р·РµСЂРЅРµР№Рј: 3-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _)');
    if (v === currentUser.username) return toast('РћС€РёР±РєР°', 'Р­С‚Рѕ СѓР¶Рµ РІР°С€ СЋР·РµСЂРЅРµР№Рј');
    if (accountsList().some(a => a.username === v)) return toast('РћС€РёР±РєР°', 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј СѓР¶Рµ Р·Р°РЅСЏС‚');
    renameUsernameEverywhere(currentUser.username, v);
    persistCurrentUser();
    addLog(currentUser.username, `РЎРјРµРЅРёР» СЋР·РµСЂРЅРµР№Рј РЅР° @${v}`);
    renderSettings('profile');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('Р®Р·РµСЂРЅРµР№Рј РёР·РјРµРЅС‘РЅ', '@' + v);
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
      <h4>РЎС‚Р°С‚СѓСЃ</h4>
      <div class="admin-hint">Р”СЂСѓРіРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё РІРёРґСЏС‚ РІР°С€ СЃС‚Р°С‚СѓСЃ РІ СЃРїРёСЃРєРµ С‡Р°С‚РѕРІ, РІ Р·РІРѕРЅРєР°С… Рё РЅР° РєР°СЂС‚РѕС‡РєРµ</div>
      <div class="status-opts" id="stOpts">${statusChoiceHtml(cur)}</div>
      <input type="text" class="rename-input" id="stText" placeholder="РўРµРєСЃС‚ СЃС‚Р°С‚СѓСЃР° (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)" maxlength="40" value="${escapeHtml((currentUser.status && currentUser.status.s) || '')}">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveStatus">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button class="btn btn-ghost" id="backToProfile4">РќР°Р·Р°Рґ</button>
      </div>
    </div>
    <div class="manage-section">
      <h4>РћРїСѓР±Р»РёРєРѕРІР°С‚СЊ СЃС‚Р°С‚СѓСЃ (СЃС‚РѕСЂРёСЃ)</h4>
      <div class="admin-hint">РЎС‚Р°С‚СѓСЃС‹ СЃРѕР·РґР°СЋС‚СЃСЏ РїРѕ РєР»РёРєСѓ РЅР° РІР°С€Сѓ Р°РІР°С‚Р°СЂРєСѓ РІРІРµСЂС…Сѓ СЃРїРёСЃРєР° С‡Р°С‚РѕРІ. Р¤РѕС‚Рѕ, РІРёРґРµРѕ РёР»Рё С‚РµРєСЃС‚ вЂ” РІРёРґРЅС‹ 24 С‡Р°СЃР° С‚РµРј, РєС‚Рѕ РІРјРµСЃС‚Рµ СЃ РІР°РјРё РІ РіСЂСѓРїРїР°С… Рё РєР°РЅР°Р»Р°С…</div>
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="openStatusEditorBtn">вћ• РЎРѕР·РґР°С‚СЊ СЃС‚Р°С‚СѓСЃ</button>
        ${currentUser.statusPost ? '<button class="btn btn-ghost" id="clearPost">РЈРґР°Р»РёС‚СЊ РјРѕР№ СЃС‚Р°С‚СѓСЃ</button>' : ''}
      </div>
    </div>`;
  let pick = cur;
  body.querySelectorAll('.status-opt').forEach(b => b.addEventListener('click', () => {
    pick = b.dataset.t;
    body.querySelectorAll('.status-opt').forEach(x => {
      x.classList.toggle('sel', x.dataset.t === pick);
      const ch = x.querySelector('.st-check');
      if (ch) ch.textContent = x.dataset.t === pick ? 'вњ“' : '';
    });
  }));
  body.querySelector('#saveStatus').addEventListener('click', () => {
    currentUser.status = { t: pick, s: $('#stText').value.trim() };
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, `РџРѕСЃС‚Р°РІРёР» СЃС‚Р°С‚СѓСЃ В«${pick}В»${currentUser.status.s ? ': ' + currentUser.status.s : ''}`);
    renderSettings('profile');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('РЎС‚Р°С‚СѓСЃ СЃРѕС…СЂР°РЅС‘РЅ', statusOf(currentUser).label);
  });
  const savePost = body.querySelector('#openStatusEditorBtn');
  if (savePost) savePost.addEventListener('click', () => openStatusEditor());
  const clearPost = body.querySelector('#clearPost');
  if (clearPost) clearPost.addEventListener('click', () => {
    delete currentUser.statusPost;
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, 'РЈРґР°Р»РёР» РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹Р№ СЃС‚Р°С‚СѓСЃ');
    renderSettings('profile');
    renderChatList();
    toast('РЎС‚Р°С‚СѓСЃ СѓРґР°Р»С‘РЅ');
  });
  body.querySelector('#backToProfile4').addEventListener('click', () => renderSettings('profile'));
}

/* ===== РЎРўРђРўРЈРЎР« (СЃС‚РѕСЂРёСЃ) РєР°Рє РІ Telegram ===== */
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
    ? item(`<span class="st-ring st-ring-mine">${avatarHtml(currentUser, '', selectedFrameClass(currentUser))}</span>`, 'РњРѕР№ СЃС‚Р°С‚СѓСЃ', 'data-mine="1"')
    : item(`<span class="story-add-avatar">${avatarHtml(currentUser)}<i class="story-plus">пј‹</i></span>`, 'РЎРѕР·РґР°С‚СЊ СЃС‚Р°С‚СѓСЃ', 'data-mine="1"');
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
        <div class="se-title">вћ• РќРѕРІС‹Р№ СЃС‚Р°С‚СѓСЃ</div>
        <button type="button" class="se-close" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
      </div>
      <div class="se-media" id="seMedia" style="display:none"></div>
      <div class="se-actions">
        <input type="file" id="sePhoto" accept="image/*" hidden>
        <input type="file" id="seVideo" accept="video/*" hidden>
        <button type="button" class="se-btn" id="sePhotoBtn">рџ“· Р¤РѕС‚Рѕ</button>
        <button type="button" class="se-btn" id="seVideoBtn">рџЋ¬ Р’РёРґРµРѕ</button>
        <button type="button" class="se-btn" id="seClearMedia" style="display:none">вњ• РЈР±СЂР°С‚СЊ</button>
      </div>
      <textarea id="seText" rows="3" maxlength="120" placeholder="Р§С‚Рѕ Сѓ РІР°СЃ РЅРѕРІРѕРіРѕ? рџЋ‰"></textarea>
      <div class="se-hint">рџ‘Ѓ РЎС‚Р°С‚СѓСЃ СѓРІРёРґСЏС‚ С‚РѕР»СЊРєРѕ С‚Рµ, РєС‚Рѕ РІРјРµСЃС‚Рµ СЃ РІР°РјРё РІ РіСЂСѓРїРїР°С… Рё РєР°РЅР°Р»Р°С…. РџСЂРѕРїР°РґС‘С‚ С‡РµСЂРµР· 24 С‡Р°СЃР°.</div>
      <div class="se-btns">
        <button type="button" class="btn btn-primary" id="sePublish">РћРїСѓР±Р»РёРєРѕРІР°С‚СЊ</button>
        ${has ? '<button type="button" class="btn se-del" id="seDelete">РЈРґР°Р»РёС‚СЊ РјРѕР№ СЃС‚Р°С‚СѓСЃ</button>' : ''}
        <button type="button" class="btn" id="seCancel">РћС‚РјРµРЅР°</button>
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
    if (f.size > 12 * 1024 * 1024) return toast('РћС€РёР±РєР°', 'Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№');
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
    if (!media.length && !text) return toast('РћС€РёР±РєР°', 'Р”РѕР±Р°РІСЊС‚Рµ С„РѕС‚Рѕ, РІРёРґРµРѕ РёР»Рё С‚РµРєСЃС‚');
    currentUser.statusPost = { time: Date.now(), text, media };
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, `РћРїСѓР±Р»РёРєРѕРІР°Р» СЃС‚Р°С‚СѓСЃ${media.length ? ' (С„РѕС‚Рѕ/РІРёРґРµРѕ)' : ''}${text ? ': "' + shortText(text, 45) + '"' : ''}`);
    renderChatList();
    renderChat();
    ov.remove();
    toast('РЎС‚Р°С‚СѓСЃ РѕРїСѓР±Р»РёРєРѕРІР°РЅ', 'Р’РёРґРµРЅ 24 С‡Р°СЃР°');
  });
  const del = ov.querySelector('#seDelete');
  if (del) del.addEventListener('click', () => {
    delete currentUser.statusPost;
    persistCurrentUser();
    persistOther(currentUser);
    addLog(currentUser.username, 'РЈРґР°Р»РёР» СЃС‚Р°С‚СѓСЃ');
    renderChatList();
    ov.remove();
    toast('РЎС‚Р°С‚СѓСЃ СѓРґР°Р»С‘РЅ');
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
  const REACT_EMOJIS = ['рџ‘Ќ', 'вќ¤пёЏ', 'рџ”Ґ', 'рџ‚', 'рџ®', 'рџў'];
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
        <button type="button" class="btn btn-ghost sv-close" title="Р—Р°РєСЂС‹С‚СЊ">вњ•</button>
      </div>
      ${media.length ? `
        <div class="sv-progress">${media.map(() => '<i class="sv-bar"></i>').join('')}</div>
        <div class="sv-media" id="svMedia"></div>
        <button type="button" class="sv-nav sv-prev">вЂ№</button>
        <button type="button" class="sv-nav sv-next">вЂє</button>
      ` : ''}
      ${post.text ? `<div class="sv-text">${escapeHtml(post.text)}</div>` : ''}
      <div class="sv-extra">
        <div class="sv-reactions" id="svReactions">
          ${REACT_EMOJIS.map(e => {
            const who = reactions[e] || [];
            const mine = currentUser && who.includes(currentUser.username);
            return `<button type="button" class="sv-react ${mine ? 'mine' : ''}" data-emoji="${e}" title="${who.join(', ') || 'Р РµР°РєС†РёСЏ'}">${e}<span class="sv-react-n">${who.length || ''}</span></button>`;
          }).join('')}
        </div>
        <div class="sv-viewers" id="svViewers">рџ‘Ѓ РџСЂРѕСЃРјРѕС‚СЂС‹: ${(post.viewers || []).length}</div>
        <div class="sv-comments" id="svComments"></div>
        <div class="sv-compose">
          <input type="text" id="svCommentInput" placeholder="РћСЃС‚Р°РІСЊС‚Рµ РєРѕРјРјРµРЅС‚Р°СЂРёР№..." maxlength="120" autocomplete="off">
          <button type="button" class="btn btn-primary" id="svCommentSend">РћС‚РїСЂР°РІРёС‚СЊ</button>
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
      : '<div class="sv-no-comments">РџРѕРєР° РЅРµС‚ РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ</div>';
  };
  const renderViewers = () => {
    const box = ov.querySelector('#svViewers');
    const vs = post.viewers || [];
    box.innerHTML = 'рџ‘Ѓ РџСЂРѕСЃРјРѕС‚СЂС‹: ' + (vs.length
      ? vs.map(v => {
          const vu = accountByUsername(v.user);
          return `<span class="avatar sv-viewer" style="${avatarStyle(vu || {})}" title="${escapeHtml((vu ? vu.name : v.user) || v.user)}">${avatarInnerHtml(vu || {})}</span>`;
        }).join('')
      : '<span class="sv-no-viewers">РїРѕРєР° РЅРёРєРѕРіРѕ</span>');
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
      rb.title = who.join(', ') || 'Р РµР°РєС†РёСЏ';
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
      <h4>РћРїРёСЃР°РЅРёРµ</h4>
      <div class="admin-hint">РџРѕРєР°Р·С‹РІР°РµС‚СЃСЏ РЅР° РІР°С€РµР№ РєР°СЂС‚РѕС‡РєРµ Сѓ РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</div>
      <textarea id="newBio" rows="3" maxlength="90" placeholder="РќР°РїСЂРёРјРµСЂ: Р›СЋР±Р»СЋ РґРµР»СЊС„РёРЅРѕРІ рџђ¬">${escapeHtml(currentUser.bio || '')}</textarea>
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="saveBio">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button class="btn btn-ghost" id="backToProfile4">РќР°Р·Р°Рґ</button>
      </div>
    </div>`;
  body.querySelector('#saveBio').addEventListener('click', () => {
    currentUser.bio = $('#newBio').value.trim();
    persistCurrentUser();
    addLog(currentUser.username, 'РћР±РЅРѕРІРёР» РѕРїРёСЃР°РЅРёРµ');
    renderSettings('profile');
    toast('РћРїРёСЃР°РЅРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ');
  });
  body.querySelector('#backToProfile4').addEventListener('click', () => renderSettings('profile'));
}

function viewChangePassword() {
  const body = $('#settingsBody');
  clearInterval(settingsTicker);
  body.innerHTML = `
    <div class="manage-section">
      <h4>РЎРјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ</h4>
      <input type="password" id="curPass" placeholder="РўРµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ">
      <input type="password" id="newPass" placeholder="РќРѕРІС‹Р№ РїР°СЂРѕР»СЊ (РґРѕ 24 СЃРёРјРІРѕР»РѕРІ)" maxlength="24">
      <input type="password" id="newPass2" placeholder="РџРѕРІС‚РѕСЂРёС‚Рµ РЅРѕРІС‹Р№ РїР°СЂРѕР»СЊ" maxlength="24">
      <div class="btn-row" style="justify-content:flex-start;margin-top:4px">
        <button class="btn btn-primary" id="savePass">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button class="btn btn-ghost" id="backToProfile2">РќР°Р·Р°Рґ</button>
      </div>
    </div>`;
  body.querySelector('#savePass').addEventListener('click', () => {
    const cur = $('#curPass').value;
    const np = $('#newPass').value;
    const np2 = $('#newPass2').value;
    if (cur !== currentUser.password) return toast('РћС€РёР±РєР°', 'РќРµРІРµСЂРЅС‹Р№ С‚РµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ');
    if (np.length < 8 || np.length > LIMITS.password) return toast('РћС€РёР±РєР°', `РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ 8-${LIMITS.password} СЃРёРјРІРѕР»РѕРІ`);
    if (!/[a-z]/.test(np) || !/[A-Z]/.test(np) || !/\d/.test(np) || !/[^a-zA-Z0-9]/.test(np)) return toast('РћС€РёР±РєР°', 'РџР°СЂРѕР»СЊ: РЅСѓР¶РЅС‹ a-z, A-Z, С†РёС„СЂР° Рё СЃРёРјРІРѕР»');
    if (weakPasswordDetect(np)) return toast('РћС€РёР±РєР°', 'РџР°СЂРѕР»СЊ СЃР»РёС€РєРѕРј РїСЂРѕСЃС‚РѕР№ вЂ” РїСЂРёРґСѓРјР°Р№С‚Рµ СЃР»РѕР¶РЅРµРµ');
    if (np !== np2) return toast('РћС€РёР±РєР°', 'РџР°СЂРѕР»Рё РЅРµ СЃРѕРІРїР°РґР°СЋС‚');
    currentUser.password = np;
    persistCurrentUser();
    toast('РџР°СЂРѕР»СЊ РёР·РјРµРЅС‘РЅ');
    renderSettings('profile');
  });
  body.querySelector('#backToProfile2').addEventListener('click', () => renderSettings('profile'));
}

function renderSettingsPrivacy(body) {
  const u = currentUser;
  const opts = [
    { v: 'all', t: 'Р’СЃРµ', d: 'Р›СЋР±РѕР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РјРѕР¶РµС‚ РїРёСЃР°С‚СЊ РІР°Рј' },
    { v: 'contacts', t: 'РљРѕРЅС‚Р°РєС‚С‹', d: 'РўРѕР»СЊРєРѕ С‚Рµ, СЃ РєРµРј РІС‹ СѓР¶Рµ РѕР±С‰Р°Р»РёСЃСЊ' },
    { v: 'nobody', t: 'РќРёРєС‚Рѕ', d: 'РќРёРєС‚Рѕ РЅРµ СЃРјРѕР¶РµС‚ РїРёСЃР°С‚СЊ РІР°Рј' },
  ];
  const w = u.settings.whoCanWrite || 'all';
body.innerHTML = `
    <div class="manage-section">
      <h4>РљС‚Рѕ РјРѕР¶РµС‚ РІР°Рј РїРёСЃР°С‚СЊ</h4>
      <div class="radio-group" id="whoCanWrite">
        ${opts.map(o => `<div class="radio-item ${w === o.v ? 'selected' : ''}" data-v="${o.v}">
          <span class="radio-circle"></span>
          <div><span class="ri-label">${o.t}</span><span class="ri-hint">${o.d}</span></div>
        </div>`).join('')}
      </div>
    </div>
    <div class="manage-section">
      <h4>Р—Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРЅС‹Рµ (${u.blocked.length})</h4>
      ${u.blocked.length ? u.blocked.map(name => {
        const acc = userById(name);
        const nm = acc ? acc.name : name;
        return `<div class="member-chip">${acc ? avatarHtml(acc) : ''}<div class="mc-name">${escapeHtml(nm)}</div><button class="mini-btn" data-unblock="${name}" title="Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ">${CHECK_ICON}</button></div>`;
      }).join('') : '<div class="empty-list">РќРёРєРѕРіРѕ РЅРµС‚</div>'}
    </div>
    <div class="manage-section">
      <h4>Р’ РёРіРЅРѕСЂРµ (${u.ignored.length})</h4>
      ${u.ignored.length ? u.ignored.map(name => {
        const acc = userById(name);
        const nm = acc ? acc.name : name;
        return `<div class="member-chip">${acc ? avatarHtml(acc) : ''}<div class="mc-name">${escapeHtml(nm)}</div><button class="mini-btn" data-unignore="${name}" title="РЈР±СЂР°С‚СЊ РёР· РёРіРЅРѕСЂР°">${CHECK_ICON}</button></div>`;
      }).join('') : '<div class="empty-list">РќРёРєРѕРіРѕ РЅРµС‚</div>'}
    </div>`;

  body.querySelectorAll('#whoCanWrite .radio-item').forEach(item => item.addEventListener('click', () => {
    u.settings.whoCanWrite = item.dataset.v;
    persistCurrentUser();
    body.querySelectorAll('#whoCanWrite .radio-item').forEach(r => r.classList.toggle('selected', r === item));
    toast('РќР°СЃС‚СЂРѕР№РєРё РїСЂРёРІР°С‚РЅРѕСЃС‚Рё РѕР±РЅРѕРІР»РµРЅС‹');
  }));
  body.querySelectorAll('[data-unblock]').forEach(b => b.addEventListener('click', () => {
    u.blocked = u.blocked.filter(x => x !== b.dataset.unblock);
    persistCurrentUser();
    renderSettings('privacy');
    renderChat();
    toast('Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅРѕ');
  }));
  body.querySelectorAll('[data-unignore]').forEach(b => b.addEventListener('click', () => {
    u.ignored = u.ignored.filter(x => x !== b.dataset.unignore);
    persistCurrentUser();
    renderSettings('privacy');
    toast('РЈР±СЂР°РЅРѕ РёР· РёРіРЅРѕСЂР°');
  }));
}

/* ============================================================
   РђР”РњРРќ-РџРђРќР•Р›Р¬
   ============================================================ */
const BADGE_LABELS = { scam: 'РЎРљРђРњ', admin: 'РђР”РњРРќ', owner: 'Р’Р»Р°РґРµР»РµС†', tester: 'РўР•РЎРўР•Р ', blue: 'РЎРёРЅСЏСЏ РіР°Р»РѕС‡РєР°', gray: 'РЎРµСЂР°СЏ РіР°Р»РѕС‡РєР°', clock: 'рџ•ђ Р§Р°СЃС‹' };
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
      <h4>РџРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</h4>
      <div class="admin-hint">РќР°Р№РґРёС‚Рµ РїРѕ ID, @СЋР·РµСЂРЅРµР№РјСѓ РёР»Рё РёРјРµРЅРё вЂ” СЂР°Р·РґРµР»С‹ РЅРёР¶Рµ РїРѕРєР°Р¶СѓС‚ С‚РѕР»СЊРєРѕ СЌС‚РѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div>
      <input type="text" class="rename-input admin-user-search" placeholder="ID, @СЋР·РµСЂРЅРµР№Рј РёР»Рё РёРјСЏ..." style="margin-top:8px">
    </div>

    <div class="manage-section">
      <h4>РЎС‚Р°С‚РёСЃС‚РёРєР° РјРµСЃСЃРµРЅРґР¶РµСЂР°</h4>
      <div class="stat-grid">
        <div class="stat-card"><div class="sc-num">${accs.length}</div><div class="sc-label">Р°РєРєР°СѓРЅС‚РѕРІ</div></div>
        <div class="stat-card"><div class="sc-num">${admins.length}</div><div class="sc-label">Р°РґРјРёРЅРѕРІ</div></div>
        <div class="stat-card"><div class="sc-num">${allChats.filter(c => c.type === 'group').length}</div><div class="sc-label">РіСЂСѓРїРї</div></div>
        <div class="stat-card"><div class="sc-num">${allChats.filter(c => c.type === 'channel').length}</div><div class="sc-label">РєР°РЅР°Р»РѕРІ</div></div>
        <div class="stat-card"><div class="sc-num">${totalMsgs}</div><div class="sc-label">СЃРѕРѕР±С‰РµРЅРёР№</div></div>
        <div class="stat-card"><div class="sc-num">${accs.filter(a => a.banned).length}</div><div class="sc-label">Р·Р°Р±Р°РЅРµРЅРѕ</div></div>
      </div>
    </div>

    <div class="manage-section">
      <h4>Р РµРіРёСЃС‚СЂР°С†РёРё Рё СѓС‡С‘С‚РЅС‹Рµ РґР°РЅРЅС‹Рµ</h4>
      <div class="admin-hint">Р’СЃРµ Р°РєРєР°СѓРЅС‚С‹: ID, Р»РѕРіРёРЅ, РїРѕС‡С‚Р°, РїР°СЂРѕР»СЊ Рё РґР°С‚С‹ СЂРµРіРёСЃС‚СЂР°С†РёРё/РІС…РѕРґР° (С…СЂР°РЅСЏС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ Рё РІ РѕР±Р»Р°С‡РЅРѕР№ Р±Р°Р·Рµ)</div>
      ${accs.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)} ${a.banned ? '<span class="tag" style="color:#e74c3c">Р—РђР‘РђРќР•Рќ</span>' : ''}</div>
            <div class="au-reg">
              <span class="au-reg-k">ID</span><span class="au-reg-v copy-id" data-copy="${escapeHtml(a.id)}">${escapeHtml(a.id)} рџ“‹</span>
              <span class="au-reg-k">Р›РѕРіРёРЅ</span><span class="au-reg-v">@${escapeHtml(a.username)}</span>
              <span class="au-reg-k">РРјСЏ</span><span class="au-reg-v">${escapeHtml(a.name)}</span>
              <span class="au-reg-k">РџРѕС‡С‚Р°</span><span class="au-reg-v">${escapeHtml(a.email || 'вЂ”')}</span>
              <span class="au-reg-k">РџР°СЂРѕР»СЊ</span><span class="au-reg-v">${escapeHtml(a.password || 'вЂ”')}</span>
              <span class="au-reg-k">Р РµРіРёСЃС‚СЂР°С†РёСЏ</span><span class="au-reg-v">${a.created ? fmtNoticeDate(a.created) : 'вЂ”'}</span>
              <span class="au-reg-k">РџРѕСЃР»РµРґРЅРёР№ РІС…РѕРґ</span><span class="au-reg-v">${a.lastSeen ? fmtNoticeDate(a.lastSeen) : 'вЂ”'}</span>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Р”РѕСЃС‚СѓРї Рє Р°РґРјРёРЅ-РїР°РЅРµР»Рё</h4>
      <div class="admin-hint">Р’С‹РґР°Р№С‚Рµ РёР»Рё Р·Р°Р±РµСЂРёС‚Рµ РґРѕСЃС‚СѓРї Рє СЌС‚РѕР№ РїР°РЅРµР»Рё</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <button type="button" class="btn ${admins.includes(a.username) ? 'btn-ghost' : 'btn-primary'} au-admin">${admins.includes(a.username) ? 'Р—Р°Р±СЂР°С‚СЊ Р°РґРјРёРЅРєСѓ' : 'Р”Р°С‚СЊ Р°РґРјРёРЅРєСѓ'}</button>
              <button type="button" class="btn btn-danger au-kick">РљРёРєРЅСѓС‚СЊ</button>
              <button type="button" class="btn ${a.banned ? 'btn-ghost' : 'btn-danger'} au-ban">${a.banned ? 'Р Р°Р·Р±Р°РЅРёС‚СЊ' : 'Р—Р°Р±Р°РЅРёС‚СЊ'}</button>
              <button type="button" class="btn btn-danger au-del" ${a.username === currentUser.username ? 'style="opacity:.4;pointer-events:none"' : ''}>РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Р‘РµР№РґР¶Рё</h4>
      <div class="admin-hint">РћС‚РјРµС‚РєРё: РЎРљРђРњ, РђР”РњРРќ, Р’Р›РђР”Р•Р›Р•Р¦ (Р°РЅРёРјРёСЂРѕРІР°РЅРЅС‹Р№), РўР•РЎРўР•Р , СЃРёРЅСЏСЏ Рё СЃРµСЂР°СЏ РіР°Р»РѕС‡РєРё, С‡Р°СЃС‹</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
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
      <h4>РўРµС… РїРѕРґРґРµСЂР¶РєР°</h4>
      <div class="admin-hint">РЎРѕС‚СЂСѓРґРЅРёРє С‚РµС… РїРѕРґРґРµСЂР¶РєРё РјРѕР¶РµС‚ СЂР°Р·Р±РёСЂР°С‚СЊ С‚РёРєРµС‚С‹ вЂ” РІРёРґРµС‚СЊ РІСЃРµ РѕР±СЂР°С‰РµРЅРёСЏ Рё РѕС‚РІРµС‡Р°С‚СЊ РІ РЅРёС…</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
            <div class="au-badges">
              <button type="button" class="badge-chip ${a.support ? 'on' : ''}" data-sup="${a.username}">рџЋ§ РўРµС… РїРѕРґРґРµСЂР¶РєР°</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Р Р°Р·РѕР±СЂР°РЅРЅС‹Рµ С‚РёРєРµС‚С‹</h4>
      <div class="admin-hint">РЎРєРѕР»СЊРєРѕ С‚РёРєРµС‚РѕРІ СЂРµС€РёР» РєР°Р¶РґС‹Р№ СЃРѕС‚СЂСѓРґРЅРёРє С‚РµС… РїРѕРґРґРµСЂР¶РєРё вЂ” Р·Р° РґРµРЅСЊ, РЅРµРґРµР»СЋ, РјРµСЃСЏС†, РіРѕРґ Рё Р·Р° РІСЃС‘ РІСЂРµРјСЏ</div>
      ${supportStatsHtml()}
    </div>

    <div class="manage-section">
      <h4>Р Р°РјРєРё Р°РІР°С‚Р°СЂР°</h4>
      <div class="admin-hint">Р’С‹РґР°Р№С‚Рµ РёР»Рё Р·Р°Р±РµСЂРёС‚Рµ Р»СЋР±СѓСЋ СЂР°РјРєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ (РґРµР№СЃС‚РІСѓРµС‚ РїРѕРІРµСЂС… РґРѕСЃС‚РёР¶РµРЅРёР№)</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
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
      <h4>РќРёРєРЅРµР№РјС‹</h4>
      <div class="admin-hint">РР·РјРµРЅРёС‚Рµ РЅРёРєРЅРµР№Рј Р»СЋР±РѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div>
      ${accs.map(a => `
        <div class="admin-rename" data-u="${a.username}">
          <span class="au-name">${displayName(a)}</span>
          <input type="text" class="rename-input" value="${escapeHtml(a.name)}" maxlength="${LIMITS.name}">
          <button type="button" class="btn btn-primary rename-save">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Р”Р°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</h4>
      <div class="admin-hint">РЎРјРµРЅР° ID, @СЋР·РµСЂРЅРµР№РјР°, РїРѕС‡С‚С‹ Рё Р±РёРѕ. Р®Р·РµСЂРЅРµР№Рј РѕР±РЅРѕРІРёС‚СЃСЏ РІРѕ РІСЃРµС… С‡Р°С‚Р°С…, РєРѕРЅС‚Р°РєС‚Р°С… Рё СЃРїРёСЃРєРµ Р°РґРјРёРЅРѕРІ</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${escapeHtml(a.username)}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="admin-edit-grid">
              <label>ID<input type="text" class="rename-input ae-id" value="${escapeHtml(a.id)}" maxlength="24"></label>
              <label>@СЋР·РµСЂРЅРµР№Рј<input type="text" class="rename-input ae-username" value="${escapeHtml(a.username)}" maxlength="${LIMITS.username}"></label>
              <label>РџРѕС‡С‚Р°<input type="text" class="rename-input ae-email" value="${escapeHtml(a.email)}"></label>
              <label>Р‘РёРѕ<input type="text" class="rename-input ae-bio" value="${escapeHtml(a.bio || '')}" maxlength="90" placeholder="РљСЂР°С‚РєРѕ Рѕ СЃРµР±Рµ"></label>
            </div>
            <div class="au-actions">
              <button type="button" class="btn btn-primary ae-save">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>РЎР±СЂРѕСЃ РїР°СЂРѕР»СЏ</h4>
      <div class="admin-hint">РЈСЃС‚Р°РЅРѕРІРёС‚Рµ РЅРѕРІС‹Р№ РїР°СЂРѕР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ (8-24 СЃРёРјРІРѕР»Р°)</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <input type="password" class="rename-input admin-pw-input" placeholder="РќРѕРІС‹Р№ РїР°СЂРѕР»СЊ" maxlength="${LIMITS.password}" autocomplete="off">
              <button type="button" class="btn btn-primary admin-pw-save">РЎР±СЂРѕСЃРёС‚СЊ</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>РћР±СЉСЏРІР»РµРЅРёРµ РґР»СЏ РІСЃРµС…</h4>
      <div class="admin-hint">${ann ? `РўРµРєСѓС‰РµРµ РѕР±СЉСЏРІР»РµРЅРёРµ (${fmtLogTime(ann.t)}): В«${escapeHtml(shortText(ann.text, 90))}В»` : 'РџРѕРєР° РѕР±СЉСЏРІР»РµРЅРёР№ РЅРµС‚'}</div>
      <textarea id="annText" rows="2" placeholder="РўРµРєСЃС‚ РѕР±СЉСЏРІР»РµРЅРёСЏ..." maxlength="200"></textarea>
      <div class="au-actions" style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn btn-primary" id="annSend">РћС‚РїСЂР°РІРёС‚СЊ РѕР±СЉСЏРІР»РµРЅРёРµ</button>
        ${ann ? '<button type="button" class="btn btn-ghost" id="annClear">РЎРЅСЏС‚СЊ РѕР±СЉСЏРІР»РµРЅРёРµ</button>' : ''}
      </div>
    </div>

    <div class="manage-section">
      <h4>РљР°РЅР°Р» Nebula News</h4>
      <div class="admin-hint">РћРїСѓР±Р»РёРєСѓР№С‚Рµ СѓРІРµРґРѕРјР»РµРЅРёРµ РІ РєР°РЅР°Р» Nebula News вЂ” РµРіРѕ СѓРІРёРґСЏС‚ РІСЃРµ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё. РЎРѕРѕР±С‰РµРЅРёРµ РїСЂРёРґС‘С‚ РѕС‚ РІР°С€РµРіРѕ РёРјРµРЅРё.</div>
      <textarea id="newsText" rows="2" placeholder="РўРµРєСЃС‚ СѓРІРµРґРѕРјР»РµРЅРёСЏ..." maxlength="300"></textarea>
      <div class="au-actions" style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn btn-primary" id="newsSend">РћРїСѓР±Р»РёРєРѕРІР°С‚СЊ РІ Nebula News</button>
      </div>
    </div>

    <div class="manage-section">
      <h4>РљР°РЅР°Р»С‹ Рё РіСЂСѓРїРїС‹</h4>
      <div class="admin-hint">РќР°Р№РґРёС‚Рµ РїРѕ РЅР°Р·РІР°РЅРёСЋ, @СЋР·РµСЂРЅРµР№РјСѓ РёР»Рё С‚РёРїСѓ. РњРѕР¶РЅРѕ РїРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ РёР»Рё СѓРґР°Р»РёС‚СЊ Сѓ РІСЃРµС….</div>
      <input type="text" class="rename-input admin-chat-search" placeholder="РќР°Р·РІР°РЅРёРµ, @СЋР·РµСЂРЅРµР№Рј, РєР°РЅР°Р»/РіСЂСѓРїРїР°..." style="margin-top:8px">
      <div class="admin-chats">
        ${allChats.filter(c => c.id !== NEWS_CHAT_ID && (c.type === 'channel' || c.type === 'group')).length ? allChats.filter(c => c.id !== NEWS_CHAT_ID && (c.type === 'channel' || c.type === 'group')).map(c => `
          <div class="admin-chat" data-id="${c.id}" data-t="${c.type}">
            <span class="chat-type-tag t-${c.type}">${c.type === 'channel' ? 'РљРђРќРђР›' : 'Р“Р РЈРџРџРђ'}</span>
            <div class="ac-info">
              <span class="au-name">${escapeHtml(c.name)}</span>
              ${c.handle ? `<span class="au-sub">@${escapeHtml(c.handle)}</span>` : ''}
            </div>
            <div class="au-actions">
              <button type="button" class="btn btn-ghost admin-members-chat">рџ‘Ґ</button>
              <button type="button" class="btn btn-ghost admin-rename-chat">вњЋ</button>
              <button type="button" class="btn btn-danger admin-del-chat" data-id="${c.id}" data-t="${c.type}">РЈРґР°Р»РёС‚СЊ</button>
            </div>
            <div class="am-panel hidden"></div>
          </div>`).join('') : '<div class="empty-list">РљР°РЅР°Р»РѕРІ Рё РіСЂСѓРїРї РїРѕРєР° РЅРµС‚</div>'}
      </div>
    </div>

    <div class="manage-section">
      <h4>Р›РёС‡РЅС‹Рµ С‡Р°С‚С‹</h4>
      <div class="admin-hint">РџР°СЂС‹ СЃРѕР±РµСЃРµРґРЅРёРєРѕРІ. РњРѕР¶РЅРѕ СЃРѕР·РґР°С‚СЊ РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ С‡Р°С‚С‹ РјРµР¶РґСѓ РІСЃРµРјРё Р°РєРєР°СѓРЅС‚Р°РјРё РёР»Рё СѓРґР°Р»РёС‚СЊ Р»РёС€РЅРёРµ.</div>
      <button type="button" class="btn btn-primary" id="adminPrivAll">РЎРѕР·РґР°С‚СЊ С‡Р°С‚С‹ РјРµР¶РґСѓ РІСЃРµРјРё</button>
      <div class="admin-chats" style="margin-top:10px">
        ${privs.length ? privs.map(p => `
          <div class="admin-chat">
            <span class="chat-type-tag t-private">Р›РР§РќР«Р™</span>
            <div class="ac-info">
              <span class="au-name">@${escapeHtml(p.owner)} в†” @${escapeHtml(p.other)}</span>
            </div>
            <div class="au-actions">
              <button type="button" class="btn btn-danger admin-del-priv" data-a="${escapeHtml(p.owner)}" data-b="${escapeHtml(p.other)}">РЈРґР°Р»РёС‚СЊ</button>
            </div>
          </div>`).join('') : '<div class="empty-list">Р›РёС‡РЅС‹С… С‡Р°С‚РѕРІ РїРѕРєР° РЅРµС‚</div>'}
      </div>
    </div>

    <div class="manage-section">
      <h4>РўРµРјС‹ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</h4>
      <div class="admin-hint">Р’С‹РґР°Р№С‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ Р»СЋР±СѓСЋ С‚РµРјСѓ, РІРєР»СЋС‡Р°СЏ СЃРїРµС†РёР°Р»СЊРЅС‹Рµ</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <select class="admin-theme-select">
                ${ALL_THEMES.map(t => `<option value="${t.v}" ${(a.settings && a.settings.theme) === t.v ? 'selected' : ''}>${t.t}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>РЎС‚РёРєРµСЂ-РїР°РєРё РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</h4>
      <div class="admin-hint">РњРѕР¶РЅРѕ СѓРґР°Р»РёС‚СЊ СЃС‚РёРєРµСЂ-РїР°Рє Р»СЋР±РѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div>
      ${accountsList().filter(u => (u.stickerPacks || []).length).map(u => u.stickerPacks.map(p => `
        <div class="admin-user">
          <span class="avatar" style="${avatarStyle(u)}">${avatarInnerHtml(u)}</span>
          <div class="au-info">
            <div class="au-name">${escapeHtml(p.name)}</div>
            <div class="au-sub">@${escapeHtml(u.username)} В· ${p.stickers.length} СЃС‚РёРє.</div>
            <div class="au-actions">
              <button type="button" class="btn btn-danger admin-del-pack" data-u="${escapeHtml(u.username)}" data-pk="${escapeHtml(p.id)}">РЈРґР°Р»РёС‚СЊ РїР°Рє</button>
            </div>
          </div>
        </div>`).join('')).join('') || '<div class="empty-list">РќРё Сѓ РєРѕРіРѕ РЅРµС‚ СЃС‚РёРєРµСЂ-РїР°РєРѕРІ</div>'}
    </div>

    <div class="manage-section">
      <h4>Р”РµР»СЊС„РёРЅС‹ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</h4>
      <div class="admin-hint">Р”РѕР±Р°РІСЊС‚Рµ XP СЃРёР»СЊРЅРµР№С€РµРјСѓ РґРµР»СЊС„РёРЅСѓ РёР»Рё РѕР±РЅСѓР»РёС‚Рµ РІСЃРµС… РґРµР»СЊС„РёРЅРѕРІ</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)} В· РјР°РєСЃ. СѓСЂ. ${dolphinsMaxLevelFor(a.username)}</div>
            <div class="au-actions">
              <button type="button" class="btn btn-primary admin-dolphin-xp">+500 XP</button>
              <button type="button" class="btn btn-danger admin-dolphin-reset">РЎР±СЂРѕСЃРёС‚СЊ</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>РЎС‚Р°С‚РёСЃС‚РёРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</h4>
      <div class="admin-hint">Р’С‹РґР°Р№С‚Рµ С‡Р°СЃС‹ РІ СЃС‚Р°С‚РёСЃС‚РёРєСѓ РёР»Рё РѕР±РЅСѓР»РёС‚Рµ СѓС‡С‚С‘РЅРЅРѕРµ РІСЂРµРјСЏ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ</div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)} В· РІСЂРµРјСЏ ${fmtDuration((a.stats && a.stats.seconds) || 0)}</div>
            <div class="au-actions">
              <input type="number" class="rename-input admin-add-hours-input" placeholder="Р§Р°СЃС‹" min="0" max="99999" style="width:90px">
              <button type="button" class="btn btn-primary admin-add-hours">Р”РѕР±Р°РІРёС‚СЊ С‡Р°СЃС‹</button>
              <button type="button" class="btn btn-ghost admin-reset-stats">РЎР±СЂРѕСЃРёС‚СЊ РІСЂРµРјСЏ</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>РЎРѕРѕР±С‰РµРЅРёРµ РѕС‚ Nebula</h4>
      <div class="admin-hint">РћС‚РїСЂР°РІСЊС‚Рµ СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ РёРјРµРЅРё Nebula AI РІ РР-С‡Р°С‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</div>
      <div class="nebula-all-row">
        <input type="text" class="rename-input" id="nebulaAllText" placeholder="РЈРІРµРґРѕРјР»РµРЅРёРµ РґР»СЏ РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№..." maxlength="300">
        <button type="button" class="btn btn-primary" id="nebulaAllSend">РћС‚РїСЂР°РІРёС‚СЊ РІСЃРµРј</button>
      </div>
      ${accs.map(a => `
        <div class="admin-user" data-u="${a.username}">
          <span class="avatar" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <div class="au-info">
            <div class="au-name">${displayName(a)}</div>
            <div class="au-sub">ID ${a.id} В· @${escapeHtml(a.username)}</div>
            <div class="au-actions">
              <input type="text" class="rename-input admin-nebula-text" placeholder="РўРµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ..." maxlength="300">
              <button type="button" class="btn btn-primary admin-nebula-send">РћС‚РїСЂР°РІРёС‚СЊ</button>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="manage-section">
      <h4>Р›РѕРіРё РґРµР№СЃС‚РІРёР№</h4>
      <div class="admin-hint">РџРѕСЃР»РµРґРЅРёРµ ${Math.min(loadLog().length, 300)} РёР· ${loadLog().length} Р·Р°РїРёСЃРµР№</div>
      <div class="admin-logs">
        ${loadLog().length ? loadLog().map(l => `
          <div class="log-row">
            <span class="log-time">${fmtLogTime(l.t)}</span>
            <span class="log-user">@${escapeHtml(l.user)}</span>
            <span class="log-action">${escapeHtml(l.action)}</span>
          </div>`).join('') : '<div class="empty-list">Р›РѕРіРё РїСѓСЃС‚С‹</div>'}
      </div>
      ${loadLog().length ? '<button type="button" class="btn btn-danger admin-clear-logs" style="margin-top:10px">РћС‡РёСЃС‚РёС‚СЊ Р»РѕРіРё</button>' : ''}
    </div>`;

  body.querySelectorAll('.au-admin').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const admins = adminList();
      const has = admins.includes(u.username);
      saveAdminList(has ? admins.filter(x => x !== u.username) : [...admins, u.username].sort());
      addLog(currentUser.username, `${has ? 'Р—Р°Р±СЂР°РЅ' : 'Р’С‹РґР°РЅ'} РґРѕСЃС‚СѓРї Рє Р°РґРјРёРЅ-РїР°РЅРµР»Рё вЂ” @${u.username}`);
      renderSettingsAdmin(body);
      openAdminPanel();
      toast(has ? 'Р”РѕСЃС‚СѓРї Р·Р°Р±СЂР°РЅ' : 'Р”РѕСЃС‚СѓРї РІС‹РґР°РЅ', '@' + u.username);
    });
  });
  body.querySelectorAll('.au-kick').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const was = (() => { try { return localStorage.getItem(SESSION_KEY) === u.username; } catch (e) { return false; } })();
      kickUser(u.username);
      addLog(currentUser.username, `РљРёРєРЅСѓС‚ вЂ” @${u.username}`);
      toast('РљРёРєРЅСѓС‚', '@' + u.username + (was ? ' (Р±С‹Р» РѕРЅР»Р°Р№РЅ)' : ''));
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
        addLog(currentUser.username, `РђРєРєР°СѓРЅС‚ @${u.username} СЂР°Р·Р±Р°РЅРµРЅ`);
        renderSettingsAdmin(body);
        renderChatList();
        toast('РђРєРєР°СѓРЅС‚ СЂР°Р·Р±Р°РЅРµРЅ', '@' + u.username);
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
        <h3>в›” Р‘Р»РѕРєРёСЂРѕРІРєР° @${escapeHtml(u.username)}</h3>
        <textarea id="banReason" rows="2" maxlength="120" placeholder="РџСЂРёС‡РёРЅР° Р±Р»РѕРєРёСЂРѕРІРєРё..." style="width:100%;box-sizing:border-box;resize:none;border-radius:12px;padding:10px 12px;background:var(--bg-hover);border:1px solid var(--border);color:var(--text);font-size:14px;font-family:inherit"></textarea>
        <label class="bn-label">Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ</label>
        <select id="banDur" class="admin-theme-select" style="width:100%">
          <option value="3600000">1 С‡Р°СЃ</option>
          <option value="43200000">12 С‡Р°СЃРѕРІ</option>
          <option value="86400000">1 РґРµРЅСЊ</option>
          <option value="259200000" selected>3 РґРЅСЏ</option>
          <option value="604800000">7 РґРЅРµР№</option>
          <option value="2592000000">30 РґРЅРµР№</option>
          <option value="0">РќР°РІСЃРµРіРґР°</option>
        </select>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-primary" id="banDo">Р—Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ</button>
          <button class="btn" id="banNo">РћС‚РјРµРЅР°</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#banNo').addEventListener('click', close);
    ov.querySelector('#banDo').addEventListener('click', () => {
      const reason = ov.querySelector('#banReason').value.trim();
      const dur = Number(ov.querySelector('#banDur').value);
      if (!reason) return toast('РћС€РёР±РєР°', 'РЈРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ Р±Р»РѕРєРёСЂРѕРІРєРё');
      const now = Date.now();
      const unbanAt = dur > 0 ? now + dur : null;
      u.banned = true;
      u.banInfo = { admin: currentUser.username, reason, bannedAt: now, unbanAt };
      persistOther(u);
      const notices = loadNotices();
      notices[u.username] = { type: 'ban', admin: currentUser.username, reason, bannedAt: now, unbanAt };
      saveNotices(notices);
      addLog(currentUser.username, `РђРєРєР°СѓРЅС‚ @${u.username} Р·Р°Р±Р°РЅРµРЅ (${unbanAt ? 'РґРѕ ' + fmtNoticeDate(unbanAt) : 'РЅР°РІСЃРµРіРґР°'}): ${reason}`);
      kickUser(u.username);
      close();
      renderSettingsAdmin(body);
      renderChatList();
      toast('РђРєРєР°СѓРЅС‚ Р·Р°Р±Р°РЅРµРЅ', '@' + u.username);
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
      addLog(currentUser.username, `Р‘РµР№РґР¶ В«${BADGE_LABELS[b]}В» ${u.badges[b] ? 'РІС‹РґР°РЅ' : 'СЃРЅСЏС‚'} вЂ” @${u.username}`);
      renderSettingsAdmin(body);
      updateProfileHeader();
      renderChatList();
      renderChat();
      toast(u.badges[b] ? 'Р‘РµР№РґР¶ РІС‹РґР°РЅ' : 'Р‘РµР№РґР¶ СЃРЅСЏС‚', '@' + u.username);
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
      addLog(currentUser.username, `РџСЂР°РІР° С‚РµС… РїРѕРґРґРµСЂР¶РєРё ${u.support ? 'РІС‹РґР°РЅС‹' : 'СЃРЅСЏС‚С‹'} вЂ” @${u.username}`);
      renderSettingsAdmin(body);
      toast(u.support ? 'РџСЂР°РІР° С‚РµС… РїРѕРґРґРµСЂР¶РєРё РІС‹РґР°РЅС‹' : 'РџСЂР°РІР° С‚РµС… РїРѕРґРґРµСЂР¶РєРё СЃРЅСЏС‚С‹', '@' + u.username);
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
      addLog(currentUser.username, `Р Р°РјРєР° В«${FRAMES.find(x => x.id === f).name}В» ${i >= 0 ? 'СЃРЅСЏС‚Р°' : 'РІС‹РґР°РЅР°'} вЂ” @${u.username}`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast(i >= 0 ? 'Р Р°РјРєР° СЃРЅСЏС‚Р°' : 'Р Р°РјРєР° РІС‹РґР°РЅР°', '@' + u.username);
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
      if (!nU) return toast('РћС€РёР±РєР°', 'Р®Р·РµСЂРЅРµР№Рј РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј');
      if (!/^[a-z0-9_]+$/.test(nU) || nU.length < 4) return toast('РћС€РёР±РєР°', 'Р®Р·РµСЂРЅРµР№Рј: 4-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _)');
      if (nU.length > LIMITS.username) return toast('РћС€РёР±РєР°', `Р®Р·РµСЂРЅРµР№Рј РјР°РєСЃРёРјСѓРј ${LIMITS.username} СЃРёРјРІРѕР»РѕРІ`);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nE)) return toast('РћС€РёР±РєР°', 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РїРѕС‡С‚Р°');
      if (!nId) return toast('РћС€РёР±РєР°', 'ID РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј');
      if (nU !== oldU) {
        if (accountByUsername(nU)) return toast('РћС€РёР±РєР°', 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј СѓР¶Рµ Р·Р°РЅСЏС‚');
        if (!adminRenameUser(oldU, nU)) return toast('РћС€РёР±РєР°', 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ');
      }
      const acc2 = accountByUsername(nU);
      const d2 = loadAccounts();
      const emailTaken = Object.values(d2.users).some(x => x.username !== nU && x.email === nE);
      if (emailTaken) return toast('РћС€РёР±РєР°', 'Р­С‚Р° РїРѕС‡С‚Р° СѓР¶Рµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ');
      acc2.id = nId;
      acc2.email = nE;
      acc2.bio = nB;
      saveAccounts(d2);
      if (currentUser && currentUser.username === nU) { currentUser = acc2; persistCurrentUser(); updateProfileHeader(); }
      addLog(currentUser.username, `РћР±РЅРѕРІРёР» РґР°РЅРЅС‹Рµ @${nU}: ID ${nId}${nB ? ', Р±РёРѕ' : ''}`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Р”Р°РЅРЅС‹Рµ РѕР±РЅРѕРІР»РµРЅС‹', '@' + nU);
    });
  });
  body.querySelectorAll('.admin-rename .rename-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.admin-rename');
      const u = accountByUsername(row.dataset.u);
      const v = row.querySelector('.rename-input').value.trim();
      if (!u || !v) return;
      if (v.length > LIMITS.name) return toast('РћС€РёР±РєР°', `РњР°РєСЃРёРјСѓРј ${LIMITS.name} СЃРёРјРІРѕР»РѕРІ`);
      u.name = v;
      persistOther(u);
      addLog(currentUser.username, `РќРёРєРЅРµР№Рј РёР·РјРµРЅС‘РЅ: @${u.username} в†’ ${v}`);
      if (currentUser.username === u.username) { currentUser.name = v; updateProfileHeader(); ME.name = v; }
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('РќРёРєРЅРµР№Рј РёР·РјРµРЅС‘РЅ', v);
    });
  });
  body.querySelectorAll('.admin-pw-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const v = btn.closest('.admin-user').querySelector('.admin-pw-input').value;
      if (!v) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ РЅРѕРІС‹Р№ РїР°СЂРѕР»СЊ');
      if (v.length < 8 || v.length > LIMITS.password) return toast('РћС€РёР±РєР°', `РџР°СЂРѕР»СЊ: 8-${LIMITS.password} СЃРёРјРІРѕР»РѕРІ`);
      u.password = v;
      persistOther(u);
      if (currentUser.username === u.username) { currentUser.password = v; persistCurrentUser(); }
      addLog(currentUser.username, `РЎР±СЂРѕС€РµРЅ РїР°СЂРѕР»СЊ вЂ” @${u.username}`);
      renderSettingsAdmin(body);
      toast('РџР°СЂРѕР»СЊ РёР·РјРµРЅС‘РЅ', '@' + u.username);
    });
  });
  const annSend = body.querySelector('#annSend');
  if (annSend) annSend.addEventListener('click', () => {
    const v = body.querySelector('#annText').value.trim();
    if (!v) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚ РѕР±СЉСЏРІР»РµРЅРёСЏ');
    saveAnnouncement({ text: v, by: currentUser.username, t: Date.now() });
    addLog(currentUser.username, `РЎРґРµР»Р°Р» РѕР±СЉСЏРІР»РµРЅРёРµ: "${shortText(v, 45)}"`);
    renderSettingsAdmin(body);
    toast('РћР±СЉСЏРІР»РµРЅРёРµ РѕС‚РїСЂР°РІР»РµРЅРѕ', 'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё СѓРІРёРґСЏС‚ РµРіРѕ РїСЂРё РІС…РѕРґРµ');
  });
  const annClear = body.querySelector('#annClear');
  if (annClear) annClear.addEventListener('click', () => {
    saveAnnouncement(null);
    addLog(currentUser.username, 'РЎРЅСЏР» РѕР±СЉСЏРІР»РµРЅРёРµ');
    renderSettingsAdmin(body);
    toast('РћР±СЉСЏРІР»РµРЅРёРµ СЃРЅСЏС‚Рѕ');
  });
  const newsSend = body.querySelector('#newsSend');
  if (newsSend) newsSend.addEventListener('click', () => {
    const v = body.querySelector('#newsText').value.trim();
    if (!v) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚ СѓРІРµРґРѕРјР»РµРЅРёСЏ');
    if (v.length > 300) return toast('РћС€РёР±РєР°', 'РњР°РєСЃРёРјСѓРј 300 СЃРёРјРІРѕР»РѕРІ');
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
    addLog(currentUser.username, `РћРїСѓР±Р»РёРєРѕРІР°РЅРѕ РІ Nebula News: "${shortText(v, 45)}"`);
    renderSettingsAdmin(body);
    renderChat();
    renderChatList();
    toast('РћРїСѓР±Р»РёРєРѕРІР°РЅРѕ РІ Nebula News', posted ? `${posted} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ СѓРІРёРґСЏС‚` : 'РќРёРєС‚Рѕ РЅРµ РїРѕРґРїРёСЃР°РЅ');
  });

  body.querySelectorAll('.au-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      if (!u) return;
      if (u.username === currentUser.username) return toast('РќРµР»СЊР·СЏ', 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЃРѕР±СЃС‚РІРµРЅРЅС‹Р№ Р°РєРєР°СѓРЅС‚');
      adminDeletePrompt(u, body);
    });
  });
  function adminDeletePrompt(u, body) {
    const ov = document.createElement('div');
    ov.className = 'status-editor-overlay';
    ov.innerHTML = `
      <div class="modal-box stickers-modal">
        <h3>в›” РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р° @${escapeHtml(u.username)}</h3>
        <div class="admin-hint" style="margin-top:2px">Р›РёС‡РЅС‹Рµ С‡Р°С‚С‹ Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹, РёР· РіСЂСѓРїРї РѕРЅ Р±СѓРґРµС‚ РёСЃРєР»СЋС‡С‘РЅ. Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.</div>
        <textarea id="delReason" rows="2" maxlength="120" placeholder="РџСЂРёС‡РёРЅР° СѓРґР°Р»РµРЅРёСЏ..." style="width:100%;box-sizing:border-box;resize:none;border-radius:12px;padding:10px 12px;background:var(--bg-hover);border:1px solid var(--border);color:var(--text);font-size:14px;font-family:inherit"></textarea>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-danger" id="delDo">РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚</button>
          <button class="btn" id="delNo">РћС‚РјРµРЅР°</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#delNo').addEventListener('click', close);
    ov.querySelector('#delDo').addEventListener('click', () => {
      const reason = ov.querySelector('#delReason').value.trim() || 'вЂ”';
      const now = Date.now();
      const notices = loadNotices();
      notices[u.username] = { type: 'delete', admin: currentUser.username, reason, bannedAt: now, unbanAt: null };
      saveNotices(notices);
      kickUser(u.username);
      deleteAccountEverywhere(u.username);
      addLog(currentUser.username, `РђРєРєР°СѓРЅС‚ СѓРґР°Р»С‘РЅ вЂ” @${u.username} (ID ${u.id}): ${reason}`);
      close();
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('РђРєРєР°СѓРЅС‚ СѓРґР°Р»С‘РЅ', '@' + u.username);
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
    addLog(currentUser.username, `РЎРѕР·РґР°Р» Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹ РјРµР¶РґСѓ РІСЃРµРјРё (РЅРѕРІС‹С…: ${made})`);
    renderSettingsAdmin(body);
    renderChatList();
    toast(made ? `РЎРѕР·РґР°РЅРѕ РЅРѕРІС‹С… С‡Р°С‚РѕРІ: ${made}` : 'Р’СЃРµ Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓСЋС‚');
  });
  body.querySelectorAll('.admin-del-priv').forEach(btn => btn.addEventListener('click', () => {
    const a = btn.dataset.a, b = btn.dataset.b;
    if (!confirm(`РЈРґР°Р»РёС‚СЊ Р»РёС‡РЅС‹Р№ С‡Р°С‚ @${a} в†” @${b} Сѓ РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№?`)) return;
    deletePrivateChatEverywhere(a, b);
    addLog(currentUser.username, `РЈРґР°Р»РёР» Р»РёС‡РЅС‹Р№ С‡Р°С‚ @${a} в†” @${b}`);
    renderSettingsAdmin(body);
    renderChatList();
    renderChat();
    toast('Р§Р°С‚ СѓРґР°Р»С‘РЅ', '@' + a + ' в†” @' + b);
  }));
  body.querySelectorAll('.admin-del-pack').forEach(btn => btn.addEventListener('click', () => {
    const u = accountByUsername(btn.dataset.u);
    if (!u) return;
    const p = (u.stickerPacks || []).find(x => x.id === btn.dataset.pk);
    if (!p) return;
    if (!confirm(`РЈРґР°Р»РёС‚СЊ СЃС‚РёРєРµСЂ-РїР°Рє В«${p.name}В» Сѓ @${u.username}?`)) return;
    u.stickerPacks = u.stickerPacks.filter(x => x.id !== btn.dataset.pk);
    persistOther(u);
    addLog(currentUser.username, `РЈРґР°Р»РёР» СЃС‚РёРєРµСЂ-РїР°Рє В«${p.name}В» Сѓ @${u.username}`);
    renderSettingsAdmin(body);
    toast('РџР°Рє СѓРґР°Р»С‘РЅ', p.name);
  }));
  body.querySelectorAll('.admin-theme-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const u = accountByUsername(sel.closest('.admin-user').dataset.u);
      u.settings = u.settings || {};
      u.settings.theme = sel.value;
      persistOther(u);
      addLog(currentUser.username, `РўРµРјР° В«${(ALL_THEMES.find(t => t.v === sel.value) || {}).t}В» вЂ” @${u.username}`);
      if (currentUser.username === u.username) {
        currentUser.settings = currentUser.settings || {};
        currentUser.settings.theme = sel.value;
        persistCurrentUser();
        applyTheme(sel.value);
      }
      toast('РўРµРјР° РЅР°Р·РЅР°С‡РµРЅР°', '@' + u.username);
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
      if (!bestId) return toast('РћС€РёР±РєР°', 'РЈ @' + u.username + ' РЅРµС‚ РґРµР»СЊС„РёРЅРѕРІ');
      store[bestId].xp = (store[bestId].xp || 0) + 500;
      saveDolphins(store);
      addLog(currentUser.username, `Р”РµР»СЊС„РёРЅСѓ @${u.username} РЅР°С‡РёСЃР»РµРЅРѕ +500 XP`);
      renderSettingsAdmin(body);
      toast('+500 XP РґРµР»СЊС„РёРЅСѓ', '@' + u.username);
    });
  });
  body.querySelectorAll('.admin-dolphin-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      if (!confirm(`РЎР±СЂРѕСЃРёС‚СЊ РІСЃРµС… РґРµР»СЊС„РёРЅРѕРІ @${u.username}?`)) return;
      const st = getStateFor(u.username);
      const store = loadDolphins();
      if (st && st.chats) st.chats.forEach(c => { const k = dolphinKeyFor(c, u.username); if (store[k]) store[k].xp = 0; });
      saveDolphins(store);
      addLog(currentUser.username, `Р”РµР»СЊС„РёРЅС‹ @${u.username} СЃР±СЂРѕС€РµРЅС‹`);
      renderSettingsAdmin(body);
      toast('Р”РµР»СЊС„РёРЅС‹ СЃР±СЂРѕС€РµРЅС‹', '@' + u.username);
    });
  });
  body.querySelectorAll('.admin-add-hours').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const inp = btn.closest('.admin-user').querySelector('.admin-add-hours-input');
      const h = parseInt(inp.value, 10);
      if (isNaN(h) || h <= 0) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ РєРѕР»РёС‡РµСЃС‚РІРѕ С‡Р°СЃРѕРІ');
      if (h > 99999) return toast('РћС€РёР±РєР°', 'РњР°РєСЃРёРјСѓРј 99999 С‡Р°СЃРѕРІ Р·Р° СЂР°Р·');
      const d = loadAccounts();
      const acc = d.users[u.username];
      if (!acc) return toast('РћС€РёР±РєР°', 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ');
      acc.stats = acc.stats || {};
      acc.stats.seconds = (acc.stats.seconds || 0) + h * 3600;
      saveAccounts(d);
      if (currentUser.username === u.username) {
        currentUser.stats = acc.stats;
        persistCurrentUser();
      }
      addLog(currentUser.username, `Р’С‹РґР°РЅРѕ ${h} С‡. СЃС‚Р°С‚РёСЃС‚РёРєРё вЂ” @${u.username} (РёС‚РѕРіРѕ ${fmtDuration(acc.stats.seconds)})`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('Р§Р°СЃС‹ РІС‹РґР°РЅС‹', `@${u.username} +${h} С‡.`);
    });
  });
  body.querySelectorAll('.admin-reset-stats').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      u.stats = u.stats || {};
      u.stats.seconds = 0;
      persistOther(u);
      addLog(currentUser.username, `РЎС‚Р°С‚РёСЃС‚РёРєР° @${u.username} СЃР±СЂРѕС€РµРЅР°`);
      if (currentUser.username === u.username) persistCurrentUser();
      renderSettingsAdmin(body);
      toast('РЎС‚Р°С‚РёСЃС‚РёРєР° СЃР±СЂРѕС€РµРЅР°', '@' + u.username);
    });
  });
  const nebulaAllSend = body.querySelector('#nebulaAllSend');
  if (nebulaAllSend) nebulaAllSend.addEventListener('click', () => {
    const v = body.querySelector('#nebulaAllText').value.trim();
    if (!v) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚ СѓРІРµРґРѕРјР»РµРЅРёСЏ');
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
    addLog(currentUser.username, `РЈРІРµРґРѕРјР»РµРЅРёРµ РѕС‚ Nebula РѕС‚РїСЂР°РІР»РµРЅРѕ РІСЃРµРј: "${shortText(v, 45)}"`);
    renderSettingsAdmin(body);
    toast('РћС‚РїСЂР°РІР»РµРЅРѕ РІСЃРµРј', sent + ' РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј');
  });
  body.querySelectorAll('.admin-nebula-send').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = accountByUsername(btn.closest('.admin-user').dataset.u);
      const v = btn.closest('.admin-user').querySelector('.admin-nebula-text').value.trim();
      if (!v) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ С‚РµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ');
      const st = getStateFor(u.username) || { chats: [] };
      let chat = st.chats.find(c => c.id === AI_CHAT_ID);
      if (!chat) {
        chat = { id: AI_CHAT_ID, type: 'ai', name: 'Nebula AI', members: ['me'], messages: [] };
        st.chats.push(chat);
      }
      chat.messages.push({ id: 'm' + Date.now(), from: 'nebula', text: v, read: false });
      saveStateFor(u.username, st);
      addLog(currentUser.username, `РЎРѕРѕР±С‰РµРЅРёРµ РѕС‚ Nebula в†’ @${u.username}: "${shortText(v, 45)}"`);
      renderSettingsAdmin(body);
      toast('РћС‚РїСЂР°РІР»РµРЅРѕ', '@' + u.username);
    });
  });
  const clearLogs = body.querySelector('.admin-clear-logs');
  if (clearLogs) clearLogs.addEventListener('click', () => {
    if (!confirm('РћС‡РёСЃС‚РёС‚СЊ РІСЃРµ Р»РѕРіРё РґРµР№СЃС‚РІРёР№?')) return;
    saveLog([]);
    addLog(currentUser.username, 'Р›РѕРіРё РґРµР№СЃС‚РІРёР№ РѕС‡РёС‰РµРЅС‹');
    renderSettingsAdmin(body);
    toast('Р›РѕРіРё РѕС‡РёС‰РµРЅС‹');
  });
  body.querySelectorAll('.admin-del-chat').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const t = btn.dataset.t === 'channel' ? 'РєР°РЅР°Р»' : 'РіСЂСѓРїРїСѓ';
      const name = btn.closest('.admin-chat').querySelector('.au-name').textContent;
      if (!confirm(`РЈРґР°Р»РёС‚СЊ ${btn.dataset.t === 'channel' ? 'РєР°РЅР°Р»' : 'РіСЂСѓРїРїСѓ'} В«${name}В» Сѓ РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№?`)) return;
      deleteChatEverywhere(id);
      addLog(currentUser.username, `РЈРґР°Р»РµРЅР° ${t} В«${name}В» (${id})`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('РЈРґР°Р»РµРЅРѕ', name);
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
      const byType = (ch.type === 'channel' ? 'РєР°РЅР°Р»' : 'РіСЂСѓРїРїР°').startsWith(q) || (ch.type === 'channel' ? 'РєР°РЅР°Р»РѕРІ' : 'РіСЂСѓРїРї').startsWith(q);
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
      <input type="text" class="rename-input ac-name-in" value="${escapeHtml(ch.name)}" maxlength="${LIMITS.name}" placeholder="РќР°Р·РІР°РЅРёРµ">
      ${isChannel ? `<input type="text" class="rename-input ac-handle-in" value="${escapeHtml(ch.handle || '')}" maxlength="14" placeholder="@СЋР·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р°" style="margin-top:4px">` : ''}
      <div style="display:flex;gap:6px;margin-top:6px">
        <button type="button" class="btn btn-primary ac-save">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
        <button type="button" class="btn btn-ghost ac-cancel">РћС‚РјРµРЅР°</button>
      </div>`;
    info.querySelector('.ac-save').addEventListener('click', () => {
      const name = info.querySelector('.ac-name-in').value.trim();
      if (!name) return toast('РћС€РёР±РєР°', 'Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ');
      if (name.length > LIMITS.name) return toast('РћС€РёР±РєР°', `РќР°Р·РІР°РЅРёРµ вЂ” РјР°РєСЃРёРјСѓРј ${LIMITS.name} СЃРёРјРІРѕР»РѕРІ`);
      let handle = null;
      if (isChannel) {
        const h = info.querySelector('.ac-handle-in').value.trim().replace(/^@/, '').toLowerCase();
        if (h) {
          if (!/^[a-z0-9_]{3,14}$/.test(h)) return toast('РћС€РёР±РєР°', 'Р®Р·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р°: 3-14 СЃРёРјРІРѕР»РѕРІ (a-z, 0-9, _)');
          if (channelHandleTaken(h, id)) return toast('РћС€РёР±РєР°', 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р° СѓР¶Рµ Р·Р°РЅСЏС‚');
          handle = h;
        }
      }
      renameChatEverywhere(id, name, handle, isChannel);
      addLog(currentUser.username, `РџРµСЂРµРёРјРµРЅРѕРІР°Р» ${isChannel ? 'РєР°РЅР°Р»' : 'РіСЂСѓРїРїСѓ'} В«${name}В» (${id})`);
      renderSettingsAdmin(body);
      renderChatList();
      renderChat();
      toast('РЎРѕС…СЂР°РЅРµРЅРѕ', name);
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
      <h4>РўРµРјР° РѕС„РѕСЂРјР»РµРЅРёСЏ</h4>
      ${canSpecial ? '<div class="admin-hint" style="margin-bottom:10px">в­ђ Р’Р°Рј РґРѕСЃС‚СѓРїРЅС‹ СЃРїРµС†РёР°Р»СЊРЅС‹Рµ С‚РµРјС‹ С‚РµСЃС‚РµСЂРѕРІ Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ</div>' : '<div class="admin-hint" style="margin-bottom:10px">РЎРїРµС†РёР°Р»СЊРЅС‹Рµ С‚РµРјС‹ РѕС‚РєСЂС‹РІР°СЋС‚СЃСЏ С‚РµСЃС‚РµСЂР°Рј Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°Рј</div>'}
      <div class="radio-group" id="themeGroup">
        ${themes.map(t => `<div class="radio-item ${cur === t.v ? 'selected' : ''}" data-v="${t.v}">
          <span class="radio-circle" style="${t.v !== 'default' && t.v !== 'black' && t.v !== 'light' ? 'background:linear-gradient(135deg,' + themePreview(t.v) + ');box-shadow:0 0 10px rgba(255,255,255,.25);' : ''}"></span>
          <div><span class="ri-label">${t.t}</span><span class="ri-hint">${t.d}</span></div>
        </div>`).join('')}
      </div>
    </div>
    <div class="manage-section">
      <h4>Р Р°Р·РјРµСЂ РєСѓСЂСЃРѕСЂР°</h4>
      <div class="admin-hint" style="margin-bottom:10px">РќР°СЃС‚СЂРѕР№С‚Рµ СЂР°Р·РјРµСЂ РєР°СЃС‚РѕРјРЅРѕРіРѕ РєСѓСЂСЃРѕСЂР° РјРµСЃСЃРµРЅРґР¶РµСЂР°</div>
      <div class="radio-group" id="cursorGroup">
        ${[['s', 'РњР°Р»РµРЅСЊРєРёР№'], ['m', 'РЎСЂРµРґРЅРёР№'], ['l', 'Р‘РѕР»СЊС€РѕР№']].map(o => `
          <div class="radio-item ${(u.settings.cursorSize || 'm') === o[0] ? 'selected' : ''}" data-v="${o[0]}">
            <span class="radio-circle"></span>
            <div><span class="ri-label">${o[1]}</span></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="manage-section">
      <h4>РЎРІРµС‡РµРЅРёРµ РєСѓСЂСЃРѕСЂР°</h4>
      <div class="admin-hint" style="margin-bottom:10px">РќР°СЃРєРѕР»СЊРєРѕ СЃРёР»СЊРЅРѕ РєСѓСЂСЃРѕСЂ СЃРІРµС‚РёС‚СЃСЏ вЂ” РѕС‚ СЃР»Р°Р±РѕРіРѕ РґРѕ РѕС‡РµРЅСЊ СЃРёР»СЊРЅРѕРіРѕ</div>
      <input type="range" id="cursorGlow" min="0" max="600" step="5" value="${Math.round((u.settings.cursorGlow !== undefined ? u.settings.cursorGlow : 0.45) * 100)}" style="width:100%">
      <div class="admin-hint" style="margin-top:6px;text-align:center">РЎР»Р°Р±РѕРµ <span id="cursorGlowVal" style="font-weight:700;color:var(--accent-hover)">${Math.round((u.settings.cursorGlow !== undefined ? u.settings.cursorGlow : 0.45) * 100)}%</span> В· РћС‡РµРЅСЊ СЃРёР»СЊРЅРѕРµ (РґРѕ 600%)</div>
    </div>
    <div class="manage-section">
      <h4>Р¦РІРµС‚ РєСѓСЂСЃРѕСЂР° (RGB)</h4>
      <div class="admin-hint" style="margin-bottom:8px">Р¦РІРµС‚ СЃР°РјРѕР№ С‚РѕС‡РєРё РєСѓСЂСЃРѕСЂР°</div>
      ${rgbSlider('cc', u.settings.cursorColor || [255, 255, 255])}
    </div>
    <div class="manage-section">
      <h4>Р¦РІРµС‚ СЃРІРµС‡РµРЅРёСЏ (RGB)</h4>
      <div class="admin-hint" style="margin-bottom:8px">Р¦РІРµС‚ РѕСЂРµРѕР»Р° РІРѕРєСЂСѓРі РєСѓСЂСЃРѕСЂР°</div>
      ${rgbSlider('cg', u.settings.glowColor || [255, 255, 255])}
    </div>`;
  body.querySelectorAll('#themeGroup .radio-item').forEach(item => item.addEventListener('click', () => {
    u.settings.theme = item.dataset.v;
    persistCurrentUser();
    applyTheme(u.settings.theme);
    body.querySelectorAll('#themeGroup .radio-item').forEach(r => r.classList.toggle('selected', r === item));
    toast('РўРµРјР° РѕР±РЅРѕРІР»РµРЅР°');
  }));
  body.querySelectorAll('#cursorGroup .radio-item').forEach(item => item.addEventListener('click', () => {
    u.settings.cursorSize = item.dataset.v;
    persistCurrentUser();
    applyCursorSize(u.settings.cursorSize);
    body.querySelectorAll('#cursorGroup .radio-item').forEach(r => r.classList.toggle('selected', r === item));
    toast('Р Р°Р·РјРµСЂ РєСѓСЂСЃРѕСЂР° РѕР±РЅРѕРІР»С‘РЅ');
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
      <h4>Р Р°РјРєРё Р°РІР°С‚Р°СЂР°</h4>
      <div class="frame-note" style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">
        Р Р°РјРєРё РѕС‚РєСЂС‹РІР°СЋС‚СЃСЏ Р·Р° РґРѕСЃС‚РёР¶РµРЅРёСЏ Рё РІСЂРµРјСЏ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ. Р’С‹Р±РµСЂРёС‚Рµ РѕРґРЅСѓ РёР· РґРѕСЃС‚СѓРїРЅС‹С….
      </div>
      ${FRAMES.map(f => {
        const isUnlocked = unlocked[f.id];
        const isSelected = (u.settings.frame === f.id) || (!u.settings.frame && selectedFrameClass(u) === f.id);
        const lockedReason = !isUnlocked ? `<div style="font-size:11.5px;color:var(--danger);margin-top:2px">рџ”’ ${lockedHint(f, u)}</div>` : '';
        return `
        <div class="frame-item ${isSelected && isUnlocked ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}" data-f="${f.id}">
          ${avatarHtml(u, 'fs', isUnlocked ? f.id : '')}
          <div class="fi-info">
            <div class="fi-name">${f.emoji} ${f.name}</div>
            <div class="fi-desc">${f.desc}</div>
            ${lockedReason}
          </div>
          ${isUnlocked ? `<span class="tag ${isSelected ? 'you' : 'admin'}">${isSelected ? 'РІС‹Р±СЂР°РЅР°' : 'РІС‹Р±СЂР°С‚СЊ'}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;

  body.querySelectorAll('.frame-item').forEach(item => item.addEventListener('click', () => {
    const f = item.dataset.f;
    if (!unlocked[f]) return toast('Р Р°РјРєР° Р·Р°РєСЂС‹С‚Р°', 'Р’С‹РїРѕР»РЅРёС‚Рµ СѓСЃР»РѕРІРёРµ, С‡С‚РѕР±С‹ РѕС‚РєСЂС‹С‚СЊ РµС‘');
    u.settings.frame = f;
    persistCurrentUser();
    renderSettings('frames');
    renderChatList();
    renderChat();
    updateProfileHeader();
    toast('Р Р°РјРєР° РїСЂРёРјРµРЅРµРЅР°', FRAMES.find(x => x.id === f).name);
  }));
}
function lockedHint(f, u) {
  if (f.id === 'crown' || f.id === 'vip' || f.id === 'nebula') return `РќСѓР¶РЅРѕ Р±С‹С‚СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј РјРµСЃСЃРµРЅРґР¶РµСЂР°`;
  if (f.id === 'admin') return `РќСѓР¶РЅРѕ Р±С‹С‚СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј РјРµСЃСЃРµРЅРґР¶РµСЂР°`;
  if (f.id === 'old') return `РќСѓР¶РЅРѕ Р±С‹С‚СЊ СЃСЂРµРґРё РїРµСЂРІС‹С… 10 РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ (СЃРµР№С‡Р°СЃ ID ${u.id})`;
  if (f.id === 'dolphin') return `РќСѓР¶РµРЅ РґРµР»СЊС„РёРЅ 100+ СѓСЂРѕРІРЅСЏ`;
  if (f.id === 'tester') return `РќСѓР¶РЅРѕ Р±С‹С‚СЊ С‚РµСЃС‚РµСЂРѕРј РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј`;
  return `РќСѓР¶РЅРѕ РїСЂРѕРІРµСЃС‚Рё ${f.name} РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ`;
}

function renderSettingsDolphins(body) {
  const chats = state.chats.slice().filter(c => c.type !== 'channel');
  body.innerHTML = `
    <div class="manage-section">
      <h4>Р’Р°С€Рё РґРµР»СЊС„РёРЅС‹ рџђ¬</h4>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">
        Р’ РєР°Р¶РґРѕРј С‡Р°С‚Рµ Р¶РёРІС‘С‚ СЃРІРѕР№ РґРµР»СЊС„РёРЅ. Р—Р°Р±РѕС‚СЊС‚РµСЃСЊ Рѕ РЅС‘Рј вЂ” РєРѕСЂРјРёС‚Рµ, РёРіСЂР°Р№С‚Рµ Рё РіР»Р°РґСЊС‚Рµ. РњР°РєСЃРёРјСѓРј вЂ” 1000 СѓСЂРѕРІРµРЅСЊ.
      </div>
      ${chats.length ? chats.map(c => {
        const d = dolphinFor(dolphinKeyFor(c), c);
        const lvl = dolphinLevel(d);
        const pct = (d.xp || 0) % XP_PER_LEVEL;
        return `<div class="member-chip">
          <span style="font-size:26px">рџђ¬</span>
          <div class="mc-name">${escapeHtml(chatTitle(c))}</div>
          <div style="flex:1;min-width:80px;max-width:160px"><div class="xp-bar" style="margin:0"><div class="xp-fill" style="width:${pct}%"></div></div></div>
          <div style="font-weight:700;color:#00CEC9;font-size:13px">СѓСЂ. ${lvl} В· ${dolphinStage(lvl)}</div>
        </div>`;
      }).join('') : '<div class="empty-list">РЎРѕР·РґР°Р№С‚Рµ С‡Р°С‚, С‡С‚РѕР±С‹ Р·Р°РІРµСЃС‚Рё РґРµР»СЊС„РёРЅР°</div>'}
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
      <h4>РЎС‚Р°С‚РёСЃС‚РёРєР°</h4>
      <div class="stat-grid">
        <div class="stat-card wide">
          <div class="sc-num" id="statTime">${fmtDuration(u.stats.seconds)}</div>
          <div class="sc-label">Р’СЂРµРјСЏ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ</div>
        </div>
        <div class="stat-card"><div class="sc-num">${u.stats.seconds}</div><div class="sc-label">СЃРµРєСѓРЅРґ</div></div>
        <div class="stat-card"><div class="sc-num">${hoursInApp(u)}</div><div class="sc-label">С‡Р°СЃРѕРІ</div></div>
        <div class="stat-card"><div class="sc-num">${myMsgs}</div><div class="sc-label">СЃРѕРѕР±С‰РµРЅРёР№ РѕС‚РїСЂР°РІР»РµРЅРѕ</div></div>
        <div class="stat-card"><div class="sc-num">${state.chats.length}</div><div class="sc-label">С‡Р°С‚РѕРІ</div></div>
        <div class="stat-card"><div class="sc-num">${dolphinMax}</div><div class="sc-label">РјР°РєСЃ. СѓСЂРѕРІРµРЅСЊ РґРµР»СЊС„РёРЅР°</div></div>
        <div class="stat-card"><div class="sc-num">${new Date(u.created).toLocaleDateString('ru-RU')}</div><div class="sc-label">Р°РєРєР°СѓРЅС‚ СЃРѕР·РґР°РЅ</div></div>
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
  const accs = accountsList().filter(a => !a.isBot).sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  body.innerHTML = `
    <div class="switch-list">
      ${accs.map(a => `
        <button type="button" class="switch-item ${a.username === currentUser.username ? 'current' : ''}" data-u="${a.username}">
          <span class="avatar ${selectedFrameClass(a) ? 'framed frame-' + selectedFrameClass(a) : ''}" style="${avatarStyle(a)}">${avatarInnerHtml(a)}</span>
          <span class="switch-info">
            <span class="switch-name">${displayName(a)} <span class="switch-tag">ID ${a.id}</span></span>
            <span class="switch-sub">@${escapeHtml(a.username)}${a.username === currentUser.username ? ' В· СЃРµР№С‡Р°СЃ' : ''}</span>
          </span>
        </button>`).join('')}
    </div>
    <button type="button" class="switch-add" id="switchAdd">
      <span class="switch-add-icon">+</span>
      <span>Р”РѕР±Р°РІРёС‚СЊ Р°РєРєР°СѓРЅС‚</span>
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
   VERIFY MODAL (РїРµСЂРµРёСЃРїРѕР»СЊР·СѓРµРјС‹Р№)
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
    box.innerHTML = demoCodeHtml(modalVerify.code, 'Р”РµРјРѕ-СЂРµР¶РёРј: РІР°С€ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ:');
    box.classList.remove('hidden');
    bindDemoCopy(box);
  }
  clearAuthError($('#verifyError'));
  clearCode($('#verifyCodeInputs'));
  startCodeTimer($('#verifyTimer'), modalVerify.sentAt, () => {
    modalVerify.code = null;
    showAuthError($('#verifyError'), 'РљРѕРґ РёСЃС‚С‘Рє. Р—Р°РїСЂРѕСЃРёС‚Рµ РєРѕРґ РїРѕРІС‚РѕСЂРЅРѕ.');
    $('#verifySubmit').disabled = true;
  });
  const btn = $('#verifySubmit');
  const resend = $('#verifyResend');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'РћС‚РїСЂР°РІРєР°...'; }
  if (resend) resend.disabled = true;
  sendCodeToEmail(modalVerify.email, modalVerify.code, 'РљРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Nebula Messenger').then((r) => {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
    if (resend) resend.disabled = false;
    if (r.demo) {
      box.innerHTML = demoCodeHtml(modalVerify.code, 'Р”РµРјРѕ-СЂРµР¶РёРј: РІР°С€ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
    } else if (r.ok) {
      showAuthError($('#verifyError'), 'РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° ' + modalVerify.email);
    } else {
      box.innerHTML = demoCodeHtml(modalVerify.code, 'РџРёСЃСЊРјРѕ РЅРµ РґРѕСЃС‚Р°РІР»РµРЅРѕ (' + (r.err || 'РѕС€РёР±РєР°') + ') вЂ” РІРѕС‚ РІР°С€ РєРѕРґ:');
      box.classList.remove('hidden');
      bindDemoCopy(box);
      showAuthError($('#verifyError'), 'РљРѕРґ РЅРµ РґРѕС€С‘Р» РґРѕ РїРѕС‡С‚С‹, РЅРѕ РїРѕРєР°Р·Р°РЅ РЅР° СЌРєСЂР°РЅРµ');
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
        box.innerHTML = demoCodeHtml(modalVerify.code, 'Р”РµРјРѕ-СЂРµР¶РёРј: РІР°С€ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ:');
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
    toast('РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РїРѕРІС‚РѕСЂРЅРѕ', modalVerify.email, 2000);
  });
  $('#verifySubmit').addEventListener('click', () => {
    const code = codeValue($('#verifyCodeInputs'));
    if (!modalVerify) return;
    if (!modalVerify.code) return showAuthError($('#verifyError'), 'РљРѕРґ РёСЃС‚С‘Рє. Р—Р°РїСЂРѕСЃРёС‚Рµ РєРѕРґ РїРѕРІС‚РѕСЂРЅРѕ.');
    if (code.length !== 6) return showAuthError($('#verifyError'), 'Р’РІРµРґРёС‚Рµ 6-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ');
    if (code !== modalVerify.code) {
      showAuthError($('#verifyError'), 'РќРµРІРµСЂРЅС‹Р№ РєРѕРґ');
      clearCode($('#verifyCodeInputs'));
      return;
    }
    const cb = modalVerify.onSuccess;
    closeVerifyModal();
    cb();
  });
}

/* ============================================================
   РђР’РђРўРђР 
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
    if (!f.type.startsWith('image/')) return toast('РћС€РёР±РєР°', 'РњРѕР¶РЅРѕ Р·Р°РіСЂСѓР·РёС‚СЊ С‚РѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёРµ');
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
    p.innerHTML = 'вќ”';
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
  toast('РђРІР°С‚Р°СЂ РѕР±РЅРѕРІР»С‘РЅ');
}

/* ============================================================
   РљРћРќРўР•РљРЎРўРќРћР• РњР•РќР® (РїРёРЅ / СЃРєСЂС‹С‚СЊ / РїР°РїРєРё)
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
    <div class="ctx-item${news ? ' disabled' : ''}" data-ctx="pin">${pinned ? 'рџ”“ РћС‚РєСЂРµРїРёС‚СЊ' : (news ? 'рџ”’ Р—Р°РєСЂРµРїР»РµРЅРѕ' : 'рџ“Њ Р—Р°РєСЂРµРїРёС‚СЊ')}</div>
    ${canHide ? `<div class="ctx-item" data-ctx="hide">${hidden ? 'рџ‘Ѓ РџРѕРєР°Р·Р°С‚СЊ' : 'рџ™€ РЎРєСЂС‹С‚СЊ ' + (chat.type === 'group' ? 'РіСЂСѓРїРїСѓ' : 'РєР°РЅР°Р»')}</div>` : (news ? '<div class="ctx-item disabled">рџ™€ РќРµР»СЊР·СЏ СЃРєСЂС‹С‚СЊ</div>' : '')}
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-ctx="foldermgr">рџ—‚ РџР°РїРєРё</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" data-ctx="close">Р—Р°РєСЂС‹С‚СЊ</div>`;
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
      if (isNewsChat(chat)) { toast('РќРµР»СЊР·СЏ', 'Nebula News РІСЃРµРіРґР° Р·Р°РєСЂРµРїР»С‘РЅ'); return; }
      const i = state.pinned.indexOf(chat.id);
      if (i >= 0) state.pinned.splice(i, 1); else state.pinned.push(chat.id);
      saveState(); renderChatList();
      toast(i >= 0 ? 'Р§Р°С‚ РѕС‚РєСЂРµРїР»С‘РЅ' : 'Р§Р°С‚ Р·Р°РєСЂРµРїР»С‘РЅ', chatTitle(chat));
    } else if (act === 'hide') {
      const i = state.hidden.indexOf(chat.id);
      if (i >= 0) state.hidden.splice(i, 1); else state.hidden.push(chat.id);
      saveState(); renderChatList();
      toast(i >= 0 ? 'Р§Р°С‚ СЃРЅРѕРІР° РІРёРґРµРЅ' : 'Р§Р°С‚ СЃРєСЂС‹С‚', chatTitle(chat));
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
   РџРђРџРљР
   ============================================================ */
function renderFolderRail() {
  const rail = $('#folderRail');
  if (!rail) return;
  const folders = state.folders || [];
  const active = state.activeFolder || null;
  const hidden = state.hidden || [];
  const cnt = (fid) => state.chats.filter(c => c.folder === fid && !hidden.includes(c.id)).length;
  rail.innerHTML = `
    <button class="rail-btn ${!active ? 'active' : ''}" data-f="" title="Р’СЃРµ С‡Р°С‚С‹">
      <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-1.66 0-5 .83-5 2.5V14h10v-1.5C13 10.83 9.66 10 8 10zm8-1h4v2h-4V9zm0 3h4v2h-4v-2z"/></svg>
    </button>
    ${folders.length ? '<div class="rail-sep"></div>' + folders.map(f => `
      <button class="rail-btn ${active === f.id ? 'active' : ''}" data-f="${f.id}" title="${escapeHtml(f.name)}">
        рџ“Ѓ${cnt(f.id) ? `<span class="rail-count">${cnt(f.id)}</span>` : ''}
      </button>`).join('') : ''}
    <button class="rail-btn rail-create" id="railCreate" title="РЈРїСЂР°РІР»РµРЅРёРµ РїР°РїРєР°РјРё">пј‹</button>`;
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
      <h4>РЎРѕР·РґР°С‚СЊ РїР°РїРєСѓ</h4>
      <div class="folder-create">
        <input type="text" id="fNewName" placeholder="РќР°Р·РІР°РЅРёРµ РїР°РїРєРёвЂ¦" maxlength="20" autocomplete="off">
        <button type="button" class="btn btn-primary" id="fCreate">РЎРѕР·РґР°С‚СЊ</button>
      </div>
    </div>
    ${folders.length ? folders.map((f, i) => `
      <div class="manage-section folder-block">
        <div class="folder-head">
          <span class="fh-name" id="fhName${i}">рџ“Ѓ ${escapeHtml(f.name)}</span>
          <input type="text" id="fRename${i}" class="f-rename-input hidden" value="${escapeHtml(f.name)}" maxlength="20" autocomplete="off">
          <span class="fh-count">${chatIn(f.id).length} С‡Р°С‚(РѕРІ)</span>
          <button type="button" class="mini-btn mini-info" data-folder-rename="${i}">вњЋ</button>
          <button type="button" class="mini-btn danger-mini" data-folder-del="${f.id}">рџ—‘</button>
        </div>
        <div class="folder-chats">
          ${chatIn(f.id).length ? chatIn(f.id).map(c => `
            <div class="folder-chip">
              <span>${c.type === 'group' ? 'рџ‘Ґ' : 'рџ“ў'} ${escapeHtml(c.name)}</span>
              <button type="button" class="mini-btn" data-folder-remove="${f.id}" data-chat="${c.id}">вњ•</button>
            </div>`).join('') : '<div class="empty-list" style="padding:8px">РџРѕРєР° РїСѓСЃС‚Рѕ</div>'}
          <button type="button" class="folder-add-btn" data-folder-add="${f.id}">пј‹ Р”РѕР±Р°РІРёС‚СЊ С‡Р°С‚</button>
          <div class="folder-add-pick hidden" id="fPick${i}"></div>
        </div>
      </div>`).join('') : '<div class="empty-list">РџР°РїРѕРє РїРѕРєР° РЅРµС‚. РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ</div>'}`;

  const createBtn = body.querySelector('#fCreate');
  const nameInp = body.querySelector('#fNewName');
  const doCreate = () => {
    const v = nameInp.value.trim();
    if (!v) return;
    state.folders.push({ id: 'f' + Date.now() + Math.random().toString(36).slice(2, 5), name: v });
    saveState();
    renderFoldersBody();
    renderFolderRail();
    toast('РџР°РїРєР° СЃРѕР·РґР°РЅР°', v);
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
      if (!confirm(`РЈРґР°Р»РёС‚СЊ РїР°РїРєСѓ В«${f.name}В»? Р§Р°С‚С‹ РЅРµ СѓРґР°Р»СЏСЋС‚СЃСЏ.`)) return;
      state.folders = state.folders.filter(x => x.id !== f.id);
      state.chats.forEach(c => { if (c.folder === f.id) delete c.folder; });
      if (state.activeFolder === f.id) state.activeFolder = null;
      saveState();
      renderFoldersBody();
      renderChatList();
      toast('РџР°РїРєР° СѓРґР°Р»РµРЅР°', f.name);
    });
    const addBtn = body.querySelector('[data-folder-add="' + f.id + '"]');
    addBtn.addEventListener('click', () => {
      const pick = body.querySelector('#fPick' + i);
      const pickable = state.chats.filter(c => (c.type === 'group' || c.type === 'channel') && c.id !== NEWS_CHAT_ID && c.folder !== f.id && !(state.hidden || []).includes(c.id));
      pick.classList.toggle('hidden');
      if (pick.classList.contains('hidden')) return;
      pick.innerHTML = pickable.length ? pickable.map(c => `
        <div class="folder-pick-item" data-chat="${c.id}">${c.type === 'group' ? 'рџ‘Ґ' : 'рџ“ў'} ${escapeHtml(c.name)}</div>`).join('') : '<div class="empty-list" style="padding:6px">РќРµС‚ С‡Р°С‚РѕРІ РґР»СЏ РґРѕР±Р°РІР»РµРЅРёСЏ</div>';
      pick.querySelectorAll('.folder-pick-item').forEach(it => it.addEventListener('click', () => {
        const ch = state.chats.find(c => c.id === it.dataset.chat);
        if (ch) ch.folder = f.id;
        saveState();
        renderFoldersBody();
        renderChatList();
        toast('Р”РѕР±Р°РІР»РµРЅРѕ РІ РїР°РїРєСѓ', f.name);
      }));
    });
    body.querySelectorAll('[data-folder-remove="' + f.id + '"]').forEach(btn => btn.addEventListener('click', () => {
      const ch = state.chats.find(c => c.id === btn.dataset.chat);
      if (ch) delete ch.folder;
      saveState();
      renderFoldersBody();
      renderChatList();
      toast('РЈР±СЂР°РЅРѕ РёР· РїР°РїРєРё');
    }));
  });
}
function bindFoldersModal() {
  $('#foldersClose').addEventListener('click', closeFoldersModal);
  $('#foldersModal').addEventListener('click', (e) => { if (e.target === $('#foldersModal')) closeFoldersModal(); });
}

/* ============================================================
   РРќРР¦РРђР›РР—РђР¦РРЇ
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
    if (confirm('Р’С‹Р№С‚Рё РёР· Р°РєРєР°СѓРЅС‚Р°?')) logout();
  });

  ensureGlobalChats();
  migrateUserIds();
  renderChatList();
  renderChat();
});

/* ============================================================
   Р—РђР©РРўРђ РћРў РљРћРџРР РћР’РђРќРРЇ
   (Р°РґРјРёРЅР°Рј Рё РІР»Р°РґРµР»СЊС†Сѓ СЂР°Р·СЂРµС€С‘РЅ С‚РѕР»СЊРєРѕ F12 вЂ” РєРѕРЅСЃРѕР»СЊ)
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
