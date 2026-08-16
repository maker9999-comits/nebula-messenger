/* Nebula Mail Relay + Cloud Storage вЂ” Cloudflare Worker (SMTP С‡РµСЂРµР· РЇРЅРґРµРєСЃ.РџРѕС‡С‚Сѓ + KV backup) */

const SMTP_HOST = 'smtp.yandex.ru';
const SMTP_PORT = 465;

function b64(s) { return btoa(unescape(encodeURIComponent(s))); }

async function sendMail(to, subject, code) {
  const socket = connect({ hostname: SMTP_HOST, port: SMTP_PORT });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let pending = '';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const write = (s) => writer.write(encoder.encode(s + '\r\n'));
  const nextLine = async () => {
    while (true) {
      const i = pending.indexOf('\n');
      if (i >= 0) {
        const line = pending.slice(0, i);
        pending = pending.slice(i + 1);
        return line.replace(/\r$/, '');
      }
      const { done, value } = await reader.read();
      if (done) throw new Error('SMTP connection closed');
      pending += decoder.decode(value, { stream: true });
    }
  };
  const expect = async (code) => {
    while (true) {
      const line = await nextLine();
      const m = /^(\d{3})([ -])/.exec(line);
      if (m && m[2] === ' ') {
        if (+m[1] !== code) throw new Error('SMTP ' + line);
        return;
      }
    }
  };

  await expect(220);
  await write('EHLO nebula');
  await expect(250);
  await write('AUTH LOGIN');
  await expect(334);
  await write(b64(SMTP_USER));
  await expect(334);
  await write(b64(SMTP_PASS));
  await expect(235);
  await write('MAIL FROM:<' + SMTP_USER + '>');
  await expect(250);
  await write('RCPT TO:<' + to + '>');
  await expect(250);
  await write('DATA');
  await expect(354);
  const body =
    'From: "Nebula Messenger" <' + SMTP_USER + '>\r\n' +
    'To: <' + to + '>\r\n' +
    'Subject: =?UTF-8?B?' + b64(subject) + '?=\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n' +
    'Content-Transfer-Encoding: 8bit\r\n' +
    'MIME-Version: 1.0\r\n' +
    '\r\n' +
    'Р—РґСЂР°РІСЃС‚РІСѓР№С‚Рµ!\r\n\r\n' +
    'Р’Р°С€ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Nebula Messenger:\r\n\r\n' +
    code + '\r\n\r\n' +
    'РљРѕРґ РґРµР№СЃС‚РІРёС‚РµР»РµРЅ 15 РјРёРЅСѓС‚. Р•СЃР»Рё РІС‹ РЅРµ Р·Р°РїСЂР°С€РёРІР°Р»Рё РµРіРѕ вЂ” РїСЂРѕСЃС‚Рѕ РїСЂРѕРёРіРЅРѕСЂРёСЂСѓР№С‚Рµ СЌС‚Рѕ РїРёСЃСЊРјРѕ.\r\n';
  await write(body.replace(/\r?\n/g, '\r\n').replace(/\r\n\./g, '\r\n..') + '.');
  await expect(250);
  await write('QUIT');
  try { await writer.close(); } catch (e) {}
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

const MAX_BODY = 25_000_000; // ~25 РњР‘ РЅР° Р·Р°РїРёСЃСЊ (Р»РёРјРёС‚ Р·РЅР°С‡РµРЅРёСЏ KV) вЂ” РіРѕР»РѕСЃРѕРІС‹Рµ/РєСЂСѓР¶РєРё/С„РѕС‚Рѕ РІ dataURL

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/mail' && request.method === 'POST') {
        const data = await request.json();
        const to = String(data.to || '').trim();
        const code = String(data.code || '').trim();
        const label = String(data.label || 'РљРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Nebula Messenger').slice(0, 80);
        if (data.secret !== env.SECRET) return json({ ok: false, err: 'bad secret' }, 403, cors);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !/^\d{6}$/.test(code)) {
          return json({ ok: false, err: 'invalid to/code' }, 400, cors);
        }
        await sendMail(to, label, code);
        return json({ ok: true }, 200, cors);
      }

      if (path === '/store/keys' || path === '/keys') {
        if (request.method !== 'GET') return json({ ok: false, err: 'method not allowed' }, 405, cors);
        const prefix = url.searchParams.get('prefix') || '';
        const list = await env.NEBULA_KV.list({ prefix: 'nebula:' + prefix, limit: 1000 });
        return json({ ok: true, keys: list.keys.map(k => k.name.slice('nebula:'.length)) }, 200, cors);
      }

      if (path === '/store' || path.startsWith('/store/')) {
        if (request.method === 'GET') {
          const key = url.searchParams.get('key') || decodeURIComponent(path.slice(7));
          if (!key) return json({ ok: false, err: 'key required' }, 400, cors);
          const v = await env.NEBULA_KV.get('nebula:' + key);
          return json({ ok: true, value: v || null }, 200, cors);
        }
        if (request.method === 'DELETE') {
          const data = await request.json().catch(() => ({}));
          const key = data.key;
          if (data.secret !== env.SECRET || !key) return json({ ok: false, err: 'bad secret/key' }, 403, cors);
          await env.NEBULA_KV.delete('nebula:' + key);
          return json({ ok: true }, 200, cors);
        }
        if (request.method === 'POST') {
          const data = await request.json();
          const key = data.key;
          const value = data.value;
          if (data.secret !== env.SECRET) return json({ ok: false, err: 'bad secret' }, 403, cors);
          if (!key || typeof value !== 'string') return json({ ok: false, err: 'key/value required' }, 400, cors);
          if (value.length > MAX_BODY) return json({ ok: false, err: 'value too large' }, 413, cors);
          await env.NEBULA_KV.put('nebula:' + key, value);
          return json({ ok: true }, 200, cors);
        }
        return json({ ok: false, err: 'method not allowed' }, 405, cors);
      }

      return json({ ok: false, err: 'not found' }, 404, cors);
    } catch (e) {
      return json({ ok: false, err: String(e.message || e) }, 500, cors);
    }
  },
};