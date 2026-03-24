/**
 * useDefinition.js — Hover-tooltip with dictionary definitions.
 *
 * Fetches from the Free Dictionary API (no key required):
 *   https://api.dictionaryapi.dev/api/v2/entries/en/<word>
 *
 * Usage:
 *   import { attachDefinitionTooltip } from './hooks/useDefinition.js';
 *
 *   // Call once per container; pass a CSS selector for the target elements
 *   attachDefinitionTooltip('#a-word-list', '.aw-pill');
 *   attachDefinitionTooltip('#aw-grid',     '.aw-chip');
 *
 * The tooltip is a single shared DOM node appended to <body>.
 * It positions itself near the hovered element, staying inside the viewport.
 */

// ── SINGLETON TOOLTIP NODE ──
let _tip = null;
let _hideTimer  = null;
let _fetchCtrl  = null;   // AbortController for in-flight requests
const _cache    = {};     // word → definition result (or null if not found)

function _ensureTip() {
  if (_tip) return _tip;
  _tip = document.createElement('div');
  _tip.id = 'def-tooltip';
  _tip.innerHTML = '';
  document.body.appendChild(_tip);
  return _tip;
}

// ── POSITIONING ──
function _position(anchorEl) {
  const tip    = _ensureTip();
  const aRect  = anchorEl.getBoundingClientRect();
  const tRect  = tip.getBoundingClientRect();
  const margin = 8;

  // Try above first, then below
  let top  = aRect.top  + window.scrollY - tRect.height - margin;
  let left = aRect.left + window.scrollX + (aRect.width - tRect.width) / 2;

  if (top < window.scrollY + margin) {
    top = aRect.bottom + window.scrollY + margin;
  }

  // Clamp horizontally
  const maxLeft = window.innerWidth + window.scrollX - tRect.width - margin;
  left = Math.max(margin, Math.min(left, maxLeft));

  tip.style.top  = top  + 'px';
  tip.style.left = left + 'px';
}

// ── SHOW / HIDE ──
function _show(anchorEl, word) {
  clearTimeout(_hideTimer);
  const tip = _ensureTip();
  tip.className = 'def-tooltip def-tooltip--loading';
  tip.innerHTML = `<span class="def-word">${word.toUpperCase()}</span>
    <span class="def-body def-loading">looking up…</span>`;
  tip.classList.add('def-tooltip--visible');

  // Position before fetch so user sees the loader in the right place
  requestAnimationFrame(() => _position(anchorEl));

  _fetchDefinition(word).then(result => {
    if (!result) {
      tip.innerHTML = `<span class="def-word">${word.toUpperCase()}</span>
        <span class="def-body def-empty">no definition found</span>`;
    } else {
      const { pos, definition, example } = result;
      tip.innerHTML = `
        <div class="def-header">
          <span class="def-word">${word.toUpperCase()}</span>
          <span class="def-pos">${pos}</span>
        </div>
        <p class="def-body">${_esc(definition)}</p>
        ${example ? `<p class="def-example">"${_esc(example)}"</p>` : ''}`;
    }
    tip.className = 'def-tooltip def-tooltip--visible';
    requestAnimationFrame(() => _position(anchorEl));
  });
}

function _hide() {
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    const tip = _ensureTip();
    tip.classList.remove('def-tooltip--visible');
  }, 120);
}

// ── FETCH ──
async function _fetchDefinition(word) {
  if (word in _cache) return _cache[word];

  if (_fetchCtrl) _fetchCtrl.abort();
  _fetchCtrl = new AbortController();

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: _fetchCtrl.signal }
    );
    if (!res.ok) { _cache[word] = null; return null; }

    const data = await res.json();
    // data[0].meanings[0].definitions[0]
    const meaning    = data?.[0]?.meanings?.[0];
    const defObj     = meaning?.definitions?.[0];
    const definition = defObj?.definition;
    const example    = defObj?.example ?? null;
    const pos        = meaning?.partOfSpeech ?? '';

    const result = definition ? { pos, definition, example } : null;
    _cache[word] = result;
    return result;
  } catch (e) {
    if (e.name === 'AbortError') return _cache[word] ?? null;
    _cache[word] = null;
    return null;
  }
}

// ── ATTACH ──
/**
 * Attach hover listeners to all matching elements inside `containerSelector`.
 * Uses event delegation so it works even if the pills are re-rendered.
 *
 * @param {string} containerSelector  CSS selector for the parent container
 * @param {string} itemSelector       CSS selector for the hoverable items
 * @param {function} getWord          (el) => string — extracts the word from the element
 */
const _attached = new WeakSet();

export function attachDefinitionTooltip(
  containerSelector,
  itemSelector,
  getWord = (el) => el.textContent.trim().split(/\s/)[0].toLowerCase()
) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  if (_attached.has(container)) return;
  _attached.add(container);

  container.addEventListener('mouseover', e => {
    const item = e.target.closest(itemSelector);
    if (!item) return;
    const word = getWord(item);
    if (!word || word.length < 3) return;
    _show(item, word);
  });

  container.addEventListener('mouseout', e => {
    const item = e.target.closest(itemSelector);
    if (!item) return;
    _hide();
  });
}

/**
 * Injects the tooltip CSS into the page <head> if not already present.
 * Call once at startup.
 */
export function injectTooltipStyles() {
  if (document.getElementById('def-tooltip-styles')) return;
  const style = document.createElement('style');
  style.id = 'def-tooltip-styles';
  style.textContent = `
#def-tooltip {
  position: absolute;
  z-index: 1000;
  max-width: 260px;
  min-width: 160px;
  background: var(--surface);
  border: 1.5px solid var(--accent);
  border-radius: 10px;
  padding: .6rem .85rem;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px) scale(.97);
  transition: opacity .15s ease, transform .15s ease;
  box-shadow: 0 4px 24px rgba(0,0,0,.45);
}
#def-tooltip.def-tooltip--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.def-header {
  display: flex;
  align-items: baseline;
  gap: .5rem;
  margin-bottom: .35rem;
}
.def-word {
  font-family: 'Space Mono', monospace;
  font-size: .78rem;
  font-weight: 700;
  color: var(--accent2);
  letter-spacing: .1em;
}
.def-pos {
  font-family: 'Space Mono', monospace;
  font-size: .6rem;
  color: var(--muted);
  font-style: italic;
}
.def-body {
  font-family: 'Syne', sans-serif;
  font-size: .78rem;
  color: var(--text);
  line-height: 1.45;
  margin: 0;
}
.def-loading {
  color: var(--muted);
  font-style: italic;
}
.def-empty {
  color: var(--muted);
  font-style: italic;
}
.def-example {
  font-family: 'Syne', sans-serif;
  font-size: .72rem;
  color: var(--muted);
  font-style: italic;
  margin: .35rem 0 0;
  line-height: 1.4;
}
  `;
  document.head.appendChild(style);
}

function _esc(str) {
  return (str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}