/**
 * useDrag.js — Mouse and touch drag interaction for the tile grid.
 *
 * Uses a line-sweep algorithm: on every move event, we cast a segment from
 * the PREVIOUS pointer position to the CURRENT one, then collect every tile
 * whose center falls within SWEEP_R pixels of that segment.  This ensures
 * fast diagonal swipes never skip tiles even when mousemove/touchmove fires
 * at a low rate.
 *
 * Usage:
 *   import { initDrag } from './hooks/useDrag.js';
 *   initDrag(board);   // board = object returned by createBoard()
 */

const SWEEP_R = 28; // px — radius around the sweep segment; ~half a tile

export function initDrag(board) {
  const wrap = document.getElementById('grid-wrap');
  if (!wrap) return;

  let dragging    = false;
  let tileCenters = []; // [{ el, idx, cx, cy }] — cached per-drag
  let lastX = 0, lastY = 0;

  // ── Cache tile centers once at drag-start (layout is stable mid-game) ──
  function cacheCenters() {
    tileCenters = [];
    document.querySelectorAll('#g-grid .tile').forEach(el => {
      const r = el.getBoundingClientRect();
      tileCenters.push({
        el,
        idx: parseInt(el.dataset.idx),
        cx: r.left + r.width  / 2,
        cy: r.top  + r.height / 2,
      });
    });
  }

  // ── Find the closest tile to a single point (used for drag-start only) ──
  function closestTile(x, y) {
    let best = null, bestD = Infinity;
    for (const t of tileCenters) {
      const d = (x - t.cx) ** 2 + (y - t.cy) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    // Accept only if the pointer is within ~half a tile width of the center
    const halfTile = tileCenters[0]
      ? tileCenters[0].el.getBoundingClientRect().width / 2 + 8
      : 40;
    return (best && bestD < halfTile ** 2) ? best.el : null;
  }

  // ── Collect all tiles whose center is within SWEEP_R of segment (x1,y1)→(x2,y2) ──
  // Results are sorted in travel order so tiles are added sequentially.
  function tilesAlongSegment(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const hits  = [];

    for (const t of tileCenters) {
      let d2;
      if (lenSq === 0) {
        d2 = (t.cx - x1) ** 2 + (t.cy - y1) ** 2;
      } else {
        // Project tile center onto segment, clamped to [0,1]
        const tParam = Math.max(0, Math.min(1,
          ((t.cx - x1) * dx + (t.cy - y1) * dy) / lenSq
        ));
        const nearX = x1 + tParam * dx;
        const nearY = y1 + tParam * dy;
        d2 = (t.cx - nearX) ** 2 + (t.cy - nearY) ** 2;
      }
      if (d2 <= SWEEP_R * SWEEP_R) hits.push(t);
    }

    // Sort along travel direction so tiles register in the order you pass them
    hits.sort((a, b) => {
      const ta = lenSq === 0 ? 0 : ((a.cx - x1) * dx + (a.cy - y1) * dy) / lenSq;
      const tb = lenSq === 0 ? 0 : ((b.cx - x1) * dx + (b.cy - y1) * dy) / lenSq;
      return ta - tb;
    });

    return hits.map(t => t.el);
  }

  // ── Core move handler — sweeps segment from last position to current ──
  function onMove(x, y) {
    tilesAlongSegment(lastX, lastY, x, y).forEach(tile => {
      board.tryAddIndex(parseInt(tile.dataset.idx));
    });
    lastX = x; lastY = y;
  }

  // ── Drag start ──
  function onStart(x, y) {
    cacheCenters();
    board.clearPath();
    lastX = x; lastY = y;
    const tile = closestTile(x, y);
    if (tile) board.tryAddIndex(parseInt(tile.dataset.idx));
  }

  // ── Drag end ──
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    board.submitPath();
  }

  // ── Mouse events ──
  wrap.addEventListener('mousedown', e => {
    dragging = true;
    onStart(e.clientX, e.clientY);
    e.preventDefault();
  });

  wrap.addEventListener('mousemove', e => {
    if (!dragging) return;
    onMove(e.clientX, e.clientY);
  });

  wrap.addEventListener('mouseup', onEnd);
  // Catch mouseup outside the grid (user releases button elsewhere)
  document.addEventListener('mouseup', onEnd);

  // ── Touch events ──
  wrap.addEventListener('touchstart', e => {
    dragging = true;
    const t = e.touches[0];
    onStart(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    onEnd();
    e.preventDefault();
  }, { passive: false });
}