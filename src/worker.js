import { DurableObject } from 'cloudflare:workers';

// Clear Round – Server
// /api/room       WebSocket für Live-Rennen (öffentlicher Raum oder privater Raum per ?r=CODE)
// /api/scores     Allzeit-Bestenliste pro Schwierigkeit
// /api/daily      Tageskurs: Tagesrangliste und Geist des Tagesbesten
// /api/save       Speicher-Code, um Fortschritt auf ein anderes Gerät mitzunehmen
// Alles andere liefert die Spielseite aus /public.

const ROOM_RE = /^[A-Z0-9]{4,8}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/room') {
      let code = (url.searchParams.get('r') || '').toUpperCase();
      if (!ROOM_RE.test(code)) code = 'PUBLIC';
      return env.RACE.get(env.RACE.idFromName('room:' + code)).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      return env.RACE.get(env.RACE.idFromName('main')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// Einfacher Filter, damit in der öffentlichen Bestenliste keine Schimpfwörter stehen.
// Kurze Wörter zählen nur am Wortanfang (damit z. B. «Churer» oder «Marschall» erlaubt bleiben), lange überall.
const BAD_START = ['arsch', 'fick', 'hure', 'spast', 'nazi', 'fuck', 'shit', 'cunt', 'porn', 'slut', 'neger', 'nigga', 'kacke', 'wixer'];
const BAD_ANY = ['fotze', 'nutte', 'wichser', 'schlampe', 'missgeburt', 'hurensohn', 'penis', 'vagina', 'hitler', 'bitch', 'nigger',
  'faggot', 'whore', 'schwuchtel', 'scheiss', 'fucker'];
function cleanName(n) {
  const s = String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  const low = s.toLowerCase().replace(/1/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a').replace(/0/g, 'o').replace(/5|\$/g, 's').replace(/ß/g, 'ss');
  const flat = low.replace(/[^a-zäöü]/g, '');
  const words = low.split(/[^a-zäöü]+/).filter(Boolean);
  if (BAD_ANY.some(b => flat.includes(b)) || words.some(w => BAD_START.some(b => w.startsWith(b)))) return 'Reiter';
  return s || 'Reiter';
}
const COATS = ['fuchs', 'rappe', 'schimmel', 'falbe', 'schecke', 'einhorn', 'nachtstern', 'gold'];
const DIFFS = ['leicht', 'normal', 'profi'];
const STATES = ['start', 'countdown', 'play', 'dying', 'pause', 'over'];
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const riderArr = r => Array.isArray(r) ? r.slice(0, 5).map(x => num(x, 0, 9)) : [0, 1, 1, 0, 0];
const dayStr = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const SAVE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SAVE_TTL = 30 * 86400000;

function cleanPresence(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    st: STATES.includes(p.st) ? p.st : 'start',
    c: COATS.includes(p.c) ? p.c : 'fuchs',
    d: num(p.d, 0, 1e9), y: num(p.y, 0, 500), v: num(p.v, 0, 2000), p: num(p.p, 0, 1e8),
    r: riderArr(p.r), s: p.s === 1 ? 1 : 0, w: p.w === 1 ? 1 : 0
  };
}
const publicRow = r => ({ id: r.id, name: r.name, best: r.best, m: r.m || 0, coat: r.coat });

export class RaceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastRace = 0;
    this.lastPost = new Map();
    this.saveRate = new Map();
    this.lastCleanup = 0;
  }

  limited(key, ms) {
    const now = Date.now();
    if (now - (this.lastPost.get(key) || 0) < ms) return true;
    this.lastPost.set(key, now);
    if (this.lastPost.size > 5000) this.lastPost.clear();
    return false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/room') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
      if (this.ctx.getWebSockets().length >= 60) return new Response('Raum voll', { status: 503 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ id: null, name: 'Reiter', p: cleanPresence(null) });
      return new Response(null, { status: 101, webSocket: client });
    }

    let body = null;
    if (request.method === 'POST') {
      const len = Number(request.headers.get('content-length') || 0);
      if (len > 200000) return json({ error: 'Zu gross' }, 413);
      try { body = await request.json(); } catch { return json({ error: 'Ungültige Daten' }, 400); }
      if (!body || typeof body !== 'object') return json({ error: 'Ungültige Daten' }, 400);
    }

    if (path === '/api/scores') return this.scores(request, url, body);
    if (path === '/api/daily') return this.daily(request, url, body);
    if (path === '/api/save') return this.save(request, url, body);
    return json({ error: 'Nicht gefunden' }, 404);
  }

  // ----- Allzeit-Bestenliste pro Schwierigkeit -----
  async scores(request, url, body) {
    if (request.method === 'GET') {
      const d = DIFFS.includes(url.searchParams.get('d')) ? url.searchParams.get('d') : 'normal';
      const board = (await this.ctx.storage.get('board:' + d)) || [];
      return json(board.slice(0, 10).map(publicRow));
    }
    if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt' }, 405);
    const id = String(body.id || '').slice(0, 64);
    if (!id) return json({ error: 'ID fehlt' }, 400);
    const d = DIFFS.includes(body.d) ? body.d : 'normal';
    const key = 'board:' + d;
    const board = (await this.ctx.storage.get(key)) || [];
    if (this.limited('s:' + id, 3000)) return json(board.slice(0, 10).map(publicRow));
    const score = num(body.score, 0, 10000000), name = cleanName(body.name), coat = COATS.includes(body.coat) ? body.coat : 'fuchs';
    const old = board.find(r => r.id === id);
    if (old) { old.name = name; if (score > old.best) { old.best = score; old.coat = coat; old.at = Date.now(); } }
    else board.push({ id, name, best: score, coat, at: Date.now() });
    board.sort((a, b) => b.best - a.best);
    board.length = Math.min(board.length, 100);
    await this.ctx.storage.put(key, board);
    return json(board.slice(0, 10).map(publicRow));
  }

  // ----- Tageskurs -----
  async daily(request, url, body) {
    const allowed = [dayStr(-1), dayStr(0), dayStr(1)];
    if (request.method === 'GET') {
      const date = url.searchParams.get('date');
      if (!allowed.includes(date)) return json({ board: [], total: 0, ghost: null });
      const board = (await this.ctx.storage.get('daily:' + date)) || [];
      const ghost = (await this.ctx.storage.get('ghost:' + date)) || null;
      return json({ board: board.slice(0, 10).map(publicRow), total: board.length, ghost });
    }
    if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt' }, 405);
    const date = String(body.date || '');
    if (!allowed.includes(date)) return json({ error: 'Falscher Tag' }, 400);
    const id = String(body.id || '').slice(0, 64);
    if (!id) return json({ error: 'ID fehlt' }, 400);
    const bKey = 'daily:' + date, gKey = 'ghost:' + date;
    let board = (await this.ctx.storage.get(bKey)) || [];
    let ghost = (await this.ctx.storage.get(gKey)) || null;
    const limited = this.limited('d:' + id, 3000);
    const score = num(body.score, 0, 10000000), m = num(body.m, 0, 100000);
    const name = cleanName(body.name), coat = COATS.includes(body.coat) ? body.coat : 'fuchs';
    if (!limited) {
      const old = board.find(r => r.id === id);
      if (old) { old.name = name; if (score > old.best) { old.best = score; old.m = m; old.coat = coat; old.at = Date.now(); } }
      else board.push({ id, name, best: score, m, coat, at: Date.now() });
      board.sort((a, b) => b.best - a.best);
      board.length = Math.min(board.length, 500);
      await this.ctx.storage.put(bKey, board);
      if (Array.isArray(body.path) && body.path.length >= 4 && (!ghost || score > ghost.best)) {
        const p = body.path.slice(0, 8000).map(v => num(v, 0, 1e9));
        if (p.length % 2) p.pop();
        ghost = { id, name, coat, r: riderArr(body.r), best: score, m, path: p };
        await this.ctx.storage.put(gKey, ghost);
      }
      this.cleanupOldDays();
    }
    const rank = board.findIndex(r => r.id === id) + 1;
    return json({ board: board.slice(0, 10).map(publicRow), total: board.length, rank: rank || null, ghost });
  }

  async cleanupOldDays() {
    const now = Date.now();
    if (now - this.lastCleanup < 3600000) return;
    this.lastCleanup = now;
    const keep = dayStr(-7);
    for (const prefix of ['daily:', 'ghost:']) {
      const keys = await this.ctx.storage.list({ prefix, limit: 200 });
      const old = [...keys.keys()].filter(k => k.slice(prefix.length) < keep);
      if (old.length) await this.ctx.storage.delete(old);
    }
    const saves = await this.ctx.storage.list({ prefix: 'save:', limit: 500 });
    const expired = [...saves.entries()].filter(([, v]) => !v || now - v.at > SAVE_TTL).map(([k]) => k);
    if (expired.length) await this.ctx.storage.delete(expired);
  }

  // ----- Speicher-Code -----
  async save(request, url, body) {
    if (request.method === 'GET') {
      const code = String(url.searchParams.get('code') || '').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: 'Ungültiger Code' }, 400);
      const v = await this.ctx.storage.get('save:' + code);
      if (!v || Date.now() - v.at > SAVE_TTL) return json({ error: 'Nicht gefunden' }, 404);
      return json({ data: v.data });
    }
    if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt' }, 405);
    const data = typeof body.data === 'string' ? body.data : '';
    if (!data || data.length > 30000) return json({ error: 'Ungültige Daten' }, 400);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const now = Date.now();
    const list = (this.saveRate.get(ip) || []).filter(t => now - t < 3600000);
    if (list.length >= 20) return json({ error: 'Zu viele Anfragen' }, 429);
    list.push(now); this.saveRate.set(ip, list);
    let code = '';
    for (let tries = 0; tries < 6; tries++) {
      const a = new Uint32Array(6); crypto.getRandomValues(a);
      code = [...a].map(v => SAVE_ABC[v % SAVE_ABC.length]).join('');
      if (!(await this.ctx.storage.get('save:' + code))) break;
    }
    await this.ctx.storage.put('save:' + code, { data, at: now });
    this.cleanupOldDays();
    return json({ code });
  }

  // ----- Live-Rennen -----
  peerList() {
    const list = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.id) list.push({ id: a.id, name: a.name, p: a.p });
    }
    return list;
  }

  broadcast(obj, except) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(msg); } catch {}
    }
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 2000) return;
    let m;
    try { m = JSON.parse(message); } catch { return; }
    const a = ws.deserializeAttachment() || {};

    if (m.type === 'hello') {
      a.id = String(m.id || '').slice(0, 64) || crypto.randomUUID();
      a.name = cleanName(m.name);
      ws.serializeAttachment(a);
      this.broadcast({ type: 'peers', peers: this.peerList() });
    } else if (m.type === 'p' && a.id) {
      a.p = cleanPresence(m.p);
      ws.serializeAttachment(a);
      this.broadcast({ type: 'p', id: a.id, name: a.name, p: a.p }, ws);
    } else if (m.type === 'race' && a.id) {
      const now = Date.now();
      if (now - this.lastRace < 5000) return;
      this.lastRace = now;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
      this.broadcast({ type: 'race', seed });
    }
  }

  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    try { ws.close(code === 1005 ? 1000 : code, 'Tschüss'); } catch {}
    if (a && a.id) this.broadcast({ type: 'leave', id: a.id }, ws);
  }

  async webSocketError(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.id) this.broadcast({ type: 'leave', id: a.id }, ws);
  }
}
