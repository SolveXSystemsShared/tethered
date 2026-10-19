// Networking: transports (PeerJS/WebRTC, or BroadcastChannel for local two-tab
// testing) behind one small interface, plus host/guest sessions that add
// heartbeats, drop detection and rejoin.
//
// Link interface: send(msg) [reliable, ordered], sendFast(msg) [unreliable],
//   onmessage(msg), onclose(), close()
import { CONFIG } from './config.js';

const NET = CONFIG.net;
const now = () => performance.now() / 1000;

export function makeCode() {
  const a = NET.alphabet;
  let s = '';
  const rnd = crypto.getRandomValues(new Uint32Array(NET.codeLength));
  for (let i = 0; i < NET.codeLength; i++) s += a[rnd[i] % a.length];
  return s;
}

export function normaliseCode(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
    .split('').filter((c) => NET.alphabet.includes(c)).join('').slice(0, NET.codeLength);
}

export function roomUrl(code) {
  return location.origin + location.pathname + location.search + '#join=' + code;
}

function makeToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------- lazy script loading ----------------
const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

// ---------------- PeerJS transport ----------------
class PeerLink {
  constructor(conn) {
    this.conn = conn; this.closed = false; this.fast = null;
    this.onmessage = null; this.onclose = null;
    try {
      // PeerJS's reliable:false is still retransmitted, so add a truly lossy
      // pre-negotiated channel on the same RTCPeerConnection (both sides do this).
      this.fast = conn.peerConnection.createDataChannel('fast', { negotiated: true, id: 100, ordered: false, maxRetransmits: 0 });
      this.fast.onmessage = (e) => { try { this.onmessage?.(JSON.parse(e.data)); } catch { /* */ } };
    } catch { this.fast = null; }
    conn.on('data', (d) => this.onmessage?.(d));
    conn.on('close', () => this.handleClose());
    conn.on('error', () => this.handleClose());
    const pc = conn.peerConnection;
    if (pc) pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.handleClose(); });
  }
  handleClose() { if (this.closed) return; this.closed = true; this.onclose?.(); }
  send(m) { if (!this.closed && this.conn.open) { try { this.conn.send(m); } catch { /* */ } } }
  sendFast(m) {
    if (this.fast && this.fast.readyState === 'open') { try { this.fast.send(JSON.stringify(m)); return; } catch { /* fall through */ } }
    this.send(m);
  }
  close() { this.closed = true; try { this.fast?.close(); } catch { /* */ } try { this.conn.close(); } catch { /* */ } }
  // test hook: kill the underlying WebRTC connection without a goodbye
  kill() { try { this.conn.peerConnection.close(); } catch { /* */ } }
}

function brokerOptions() {
  const p = new URLSearchParams(location.search).get('peer');
  const base = { debug: 1, config: { iceServers: NET.iceServers } };
  if (!p) return base;
  const [host, port] = p.split(':');
  return { ...base, host, port: +(port || 9000), path: '/', secure: location.protocol === 'https:' && host !== 'localhost' };
}

class PeerTransport {
  constructor() { this.peer = null; this.kind = 'peer'; }
  async ready() {
    await loadScript('vendor/peerjs.min.js');
    this.Peer = window.Peer || window.peerjs?.Peer;
    if (!this.Peer) throw new Error('PeerJS missing');
  }

  host(code, cb) {
    const id = NET.prefix + code.toLowerCase();
    const peer = new this.Peer(id, brokerOptions());
    this.peer = peer;
    let opened = false;
    const to = setTimeout(() => { if (!opened) { cb.onError('broker'); } }, NET.openTimeout * 1000);
    peer.on('open', () => { opened = true; clearTimeout(to); cb.onReady(); });
    peer.on('connection', (conn) => {
      conn.on('open', () => cb.onConnection(new PeerLink(conn), conn.metadata || {}));
    });
    peer.on('disconnected', () => {
      // only the broker link dropped; live games continue. Re-register so new joins work.
      setTimeout(() => { if (!peer.destroyed) { try { peer.reconnect(); } catch { /* */ } } }, 1500);
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { clearTimeout(to); cb.onError('taken'); }
      else if (!opened) { clearTimeout(to); cb.onError('broker', e.type); }
    });
  }

  join(code, meta, cb) {
    const hostId = NET.prefix + code.toLowerCase();
    let done = false;
    const fail = (kind) => { if (done) return; done = true; clearTimeout(this.iceTimer); cb.onError(kind); };
    const go = () => {
      const conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: meta });
      this.iceTimer = setTimeout(() => { if (!conn.open) { try { conn.close(); } catch { /* */ } fail('ice'); } }, NET.iceTimeout * 1000);
      conn.on('open', () => { if (done) return; done = true; clearTimeout(this.iceTimer); cb.onOpen(new PeerLink(conn)); });
      conn.on('iceStateChanged', (s) => { if (s === 'failed') fail('ice'); });
    };
    if (this.peer && !this.peer.destroyed && this.peer.open) { this.peerErr = fail; go(); return; }
    try { this.peer?.destroy(); } catch { /* */ }
    const peer = new this.Peer(brokerOptions());
    this.peer = peer;
    this.peerErr = fail;
    const to = setTimeout(() => fail('broker'), NET.openTimeout * 1000);
    peer.on('open', () => { clearTimeout(to); go(); }); // never connect() before open (PeerJS #1373)
    peer.on('disconnected', () => { setTimeout(() => { if (!peer.destroyed) { try { peer.reconnect(); } catch { /* */ } } }, 1500); });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') this.peerErr?.('notfound');
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type) && !peer.open) { clearTimeout(to); this.peerErr?.('broker'); }
    });
  }

  destroy() { try { this.peer?.destroy(); } catch { /* */ } this.peer = null; }
}

// ---------------- BroadcastChannel transport (two tabs, one computer, offline) ----------------
class LocalLink {
  constructor(bc, me, other) {
    this.bc = bc; this.me = me; this.other = other; this.closed = false;
    this.onmessage = null; this.onclose = null;
  }
  deliver(d) { if (!this.closed) this.onmessage?.(d); }
  send(m) { if (!this.closed) this.bc.postMessage({ k: 'm', to: this.other, from: this.me, d: m }); }
  sendFast(m) { this.send(m); }
  close() { if (this.closed) return; this.closed = true; this.bc.postMessage({ k: 'bye', to: this.other, from: this.me }); }
  remoteClosed() { if (this.closed) return; this.closed = true; this.onclose?.(); }
  kill() { this.closed = true; } // silent drop (heartbeat timeout will detect it)
}

class LocalTransport {
  constructor() { this.kind = 'local'; this.bc = null; this.links = new Map(); this.id = 'g' + makeToken(); }
  async ready() { if (!('BroadcastChannel' in window)) throw new Error('BroadcastChannel missing'); }
  open(code) {
    try { this.bc?.close(); } catch { /* */ }
    this.bc = new BroadcastChannel('tethered-local-' + code);
    this.bc.onmessage = (e) => this.onMsg(e.data);
  }
  host(code, cb) {
    this.id = 'host'; this.cb = cb; this.isHost = true;
    this.open(code);
    setTimeout(() => cb.onReady(), 50);
  }
  join(code, meta, cb) {
    this.cb = cb; this.isHost = false; this.code = code;
    this.id = 'g' + makeToken();
    this.open(code);
    let tries = 0;
    clearInterval(this.helloTimer);
    this.helloTimer = setInterval(() => {
      if (++tries > 12) { clearInterval(this.helloTimer); cb.onError('notfound'); return; }
      this.bc.postMessage({ k: 'hello', to: 'host', from: this.id, meta });
    }, 250);
  }
  onMsg(m) {
    if (m.to !== this.id) return;
    if (m.k === 'hello' && this.isHost) {
      const old = this.links.get(m.from);
      if (old && !old.closed) return;
      const link = new LocalLink(this.bc, this.id, m.from);
      this.links.set(m.from, link);
      this.bc.postMessage({ k: 'welcome', to: m.from, from: this.id });
      this.cb.onConnection(link, m.meta || {});
    } else if (m.k === 'welcome' && !this.isHost) {
      clearInterval(this.helloTimer);
      if (this.links.get('host') && !this.links.get('host').closed) return;
      const link = new LocalLink(this.bc, this.id, 'host');
      this.links.set('host', link);
      this.cb.onOpen(link);
    } else if (m.k === 'm') {
      this.links.get(m.from)?.deliver(m.d);
    } else if (m.k === 'bye') {
      this.links.get(m.from)?.remoteClosed();
    }
  }
  destroy() {
    clearInterval(this.helloTimer);
    for (const l of this.links.values()) l.close();
    this.links.clear();
    try { this.bc?.close(); } catch { /* */ }
    this.bc = null;
  }
}

export function makeTransport() {
  return new URLSearchParams(location.search).get('net') === 'local' ? new LocalTransport() : new PeerTransport();
}

// ---------------- tiny emitter ----------------
class Emitter {
  constructor() { this.h = {}; }
  on(k, f) { (this.h[k] ||= []).push(f); return this; }
  emit(k, ...a) { for (const f of this.h[k] || []) f(...a); }
}

// Shared heartbeat/liveness logic
class Session extends Emitter {
  constructor(transport) {
    super();
    this.t = transport; this.link = null; this.state = 'idle';
    this.lastRecv = 0; this.lastHb = 0; this.unstable = false; this.rtt = 0;
    this.timer = setInterval(() => this.tick(), 200);
  }
  attach(link) {
    this.link = link; this.lastRecv = now(); this.unstable = false;
    link.onmessage = (m) => {
      this.lastRecv = now();
      if (this.unstable) { this.unstable = false; this.emit('unstable', false); }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hb') return;
      if (m.t === 'ping') { link.send({ t: 'pong', t0: m.t0 }); return; }
      if (m.t === 'pong') { this.rtt = now() - m.t0; return; }
      this.emit('msg', m);
    };
    link.onclose = () => { if (this.link === link) this.dropped(); };
  }
  tick() {
    if (this.state !== 'connected' || !this.link) return;
    const t = now();
    if (t - this.lastHb > NET.heartbeat) { this.lastHb = t; this.link.send({ t: 'hb' }); this.link.send({ t: 'ping', t0: t }); }
    const silent = t - this.lastRecv;
    if (silent > NET.unstableAfter && !this.unstable) { this.unstable = true; this.emit('unstable', true); }
    if (silent > NET.dropAfter) this.dropped();
  }
  dropped() {
    if (this.state !== 'connected') return;
    this.state = 'dropped';
    const l = this.link; this.link = null;
    try { l?.close(); } catch { /* */ }
    this.emit('drop');
  }
  send(m) { this.link?.send(m); }
  sendFast(m) { this.link?.sendFast(m); }
  close() {
    clearInterval(this.timer); clearTimeout(this.retryTimer);
    this.state = 'closed';
    try { this.link?.close(); } catch { /* */ }
    this.link = null;
    this.t.destroy();
  }
}

export class HostSession extends Session {
  constructor(transport) { super(transport); this.code = null; this.token = null; this.hadGuest = false; this.attempts = 0; }

  async start() {
    this.state = 'opening';
    try { await this.t.ready(); } catch { this.emit('error', 'load'); return; }
    this.open();
  }

  open() {
    this.code = makeCode();
    this.t.host(this.code, {
      onReady: () => { this.state = 'waiting'; this.emit('ready', this.code); },
      onError: (kind) => {
        if (kind === 'taken' && this.attempts++ < 5) { this.t.destroy(); this.open(); return; }
        this.state = 'error'; this.emit('error', kind);
      },
      onConnection: (link, meta) => this.accept(link, meta),
    });
  }

  accept(link, meta) {
    if (this.state === 'closed') { link.close(); return; }
    if (this.state === 'connected' && this.link) {
      // same guest coming back before we noticed the drop -> replace; otherwise the room is full
      if (meta.token && meta.token === this.token) { const old = this.link; this.link = null; try { old.close(); } catch { /* */ } }
      else { link.send({ t: 'full' }); setTimeout(() => link.close(), 300); return; }
    }
    const rejoin = this.hadGuest;
    this.token = meta.token; this.guestMeta = meta;
    this.state = 'connected';
    this.attach(link);
    this.hadGuest = true;
    this.emit(rejoin ? 'rejoin' : 'join', meta);
  }

  // test hook
  killLink() { this.link?.kill?.(); }
}

export class GuestSession extends Session {
  constructor(transport) { super(transport); this.code = null; this.token = makeToken(); this.joining = false; }

  async join(code, token, meta = {}) {
    this.code = code;
    if (token) this.token = token;
    this.meta = meta;
    this.state = 'connecting';
    try { await this.t.ready(); } catch { this.emit('error', 'load'); return; }
    this.attempt(false);
  }

  attempt(isRetry) {
    if (this.state === 'closed' || this.joining) return;
    this.joining = true;
    this.t.join(this.code, { token: this.token, ...this.meta }, {
      onOpen: (link) => {
        this.joining = false;
        if (this.state === 'closed') { link.close(); return; }
        const wasDropped = this.state === 'dropped';
        this.state = 'connected';
        this.attach(link);
        this.emit(wasDropped || isRetry ? 'rejoin' : 'open');
      },
      onError: (kind) => {
        this.joining = false;
        if (this.state === 'dropped') { this.scheduleRetry(); this.emit('retryfail', kind); return; }
        this.state = 'error';
        this.emit('error', kind);
      },
    });
  }

  dropped() {
    if (this.state !== 'connected') return;
    super.dropped();
    this.scheduleRetry();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { if (this.state === 'dropped') this.attempt(true); }, NET.retryEvery * 1000);
  }

  retryNow() { if (this.state === 'dropped' || this.state === 'error') { this.state = 'dropped'; this.attempt(true); } }

  killLink() { this.link?.kill?.(); }
}
