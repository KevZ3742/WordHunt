/**
 * ws.js — WebSocket connection + simple event bus.
 *
 * Usage:
 *   import { send, onMessage, connect } from './lib/ws.js';
 *   onMessage('game_state', (msg) => { ... });
 *   connect();
 */

const handlers = {};

let _ws = null;

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  _ws = new WebSocket(`${proto}://${location.host}`);

  _ws.onopen  = () => _emit('__connected', {});
  _ws.onclose = () => { _emit('__disconnected', {}); setTimeout(connect, 2000); };
  _ws.onerror = () => _emit('__error', {});
  _ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    _emit(msg.type, msg);
    _emit('*', msg); // wildcard listener
  };
}

export function send(obj) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(obj));
  }
}

/**
 * Register a handler for a specific message type.
 * Use '__connected' / '__disconnected' for connection events.
 * Use '*' to receive all messages.
 * Returns an unsubscribe function.
 */
export function onMessage(type, fn) {
  if (!handlers[type]) handlers[type] = [];
  handlers[type].push(fn);
  return () => {
    handlers[type] = handlers[type].filter(h => h !== fn);
  };
}

function _emit(type, msg) {
  (handlers[type] || []).forEach(fn => fn(msg));
}