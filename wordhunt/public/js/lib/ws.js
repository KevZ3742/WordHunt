const handlers = {};
let _ws      = null;
let _attempt = 0;
let _intentionalClose = false;

const BACKOFF = [1000, 2000, 3000, 5000, 8000, 10000];

export function connect() {
  _intentionalClose = false;
  _attempt = 0;
  _tryConnect();
}

function _tryConnect() {
  if (_intentionalClose) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  _ws = new WebSocket(`${proto}://${location.host}`);

  _ws.onopen = () => {
    _attempt = 0;
    _emit('__connected', {});
  };

  _ws.onclose = () => {
    _emit('__disconnected', { _attempt });
    if (_intentionalClose) return;
    const delay = BACKOFF[Math.min(_attempt, BACKOFF.length - 1)];
    _attempt++;
    setTimeout(_tryConnect, delay);
  };

  _ws.onerror = () => {
    _emit('__error', {});
  };

  _ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    _emit(msg.type, msg);
    _emit('*', msg);
  };
}

export function disconnect() {
  _intentionalClose = true;
  _ws?.close();
}

export function send(obj) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(obj));
  }
}

export function onMessage(type, fn) {
  if (!handlers[type]) handlers[type] = [];
  handlers[type].push(fn);
  return () => { handlers[type] = handlers[type].filter(h => h !== fn); };
}

function _emit(type, msg) {
  (handlers[type] || []).forEach(fn => fn(msg));
}