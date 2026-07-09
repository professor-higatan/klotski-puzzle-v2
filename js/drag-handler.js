import {
  AXIS_LOCK,
  DRAG_SCALE,
  FLICK_VELOCITY,
  MIN_DRAG_DURATION,
  MIN_FLICK_DISTANCE,
  PRE_AXIS_FOLLOW,
  SNAP_BACK_MS,
  SWIPE_THRESHOLD,
  TRACKING_GAIN,
} from './constants.js';
import { directionFromDelta } from './board-logic.js';

/**
 * Pointer drag / swipe handler with board-level event delegation.
 * Attach once to the board element; re-renders do not need rebinding.
 */
export function createDragHandler({ getStepSize, getMovableDirs, onMove, isBlocked }) {
  let activeDrag = null;
  let boardEl = null;
  let boardPointerHandlers = null;
  let onPointerDown = null;

  function clampDragOffset(movableDirs, step, axis, delta) {
    const sign = Math.sign(delta) || 1;
    const dir = directionFromDelta(sign, sign, axis);
    const movable = movableDirs[dir];
    const abs = Math.abs(delta);
    if (movable) return sign * Math.min(abs, step);
    return sign * Math.min(abs, step * 0.2);
  }

  function applyDragTransform(el, tx, ty) {
    el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${DRAG_SCALE})`;
  }

  function updateDragVisuals() {
    if (!activeDrag) return;
    const { el, startX, startY, lastX, lastY, axis, step, movableDirs } = activeDrag;
    const dx = lastX - startX;
    const dy = lastY - startY;
    let tx = 0;
    let ty = 0;

    if (axis === 'x') {
      tx = clampDragOffset(movableDirs, step, 'x', dx * TRACKING_GAIN);
    } else if (axis === 'y') {
      ty = clampDragOffset(movableDirs, step, 'y', dy * TRACKING_GAIN);
    } else if (dx !== 0 || dy !== 0) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        tx = clampDragOffset(movableDirs, step, 'x', dx * PRE_AXIS_FOLLOW * TRACKING_GAIN);
      } else {
        ty = clampDragOffset(movableDirs, step, 'y', dy * PRE_AXIS_FOLLOW * TRACKING_GAIN);
      }
    }
    applyDragTransform(el, tx, ty);
  }

  function shouldCommitMove(axis, dx, dy, durationMs) {
    if (!axis) return false;
    const delta = axis === 'x' ? dx : dy;
    const abs = Math.abs(delta);
    if (abs >= SWIPE_THRESHOLD) return true;
    if (durationMs < MIN_DRAG_DURATION) return false;
    return abs >= MIN_FLICK_DISTANCE && abs / durationMs >= FLICK_VELOCITY;
  }

  function unbindBoardPointerHandlers() {
    if (!boardPointerHandlers) return;
    const { onMove: move, onUp, onCancel } = boardPointerHandlers;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    boardPointerHandlers = null;
  }

  function endDrag(commit) {
    if (!activeDrag) return;

    const { el, pieceId, axis, startX, startY, startTime, lastX, lastY, pointerId } = activeDrag;
    const dx = lastX - startX;
    const dy = lastY - startY;
    const durationMs = performance.now() - startTime;

    el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');

    if (commit && shouldCommitMove(axis, dx, dy, durationMs)) {
      const dir = directionFromDelta(dx, dy, axis);
      activeDrag = null;
      if (onMove(pieceId, dir)) {
        try {
          el.releasePointerCapture(pointerId);
        } catch (_) {
          /* already released */
        }
        return;
      }
    }

    el.classList.add('snap-back');
    el.style.transform = 'translate3d(0, 0, 0) scale(1)';
    setTimeout(() => {
      el.classList.remove('snap-back');
      el.style.transform = '';
    }, SNAP_BACK_MS);

    activeDrag = null;
    try {
      el.releasePointerCapture(pointerId);
    } catch (_) {
      /* already released */
    }
  }

  function bindDocumentPointerHandlers() {
    unbindBoardPointerHandlers();

    const onPointerMove = (e) => {
      if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
      e.preventDefault();
      activeDrag.lastX = e.clientX;
      activeDrag.lastY = e.clientY;
      const dx = activeDrag.lastX - activeDrag.startX;
      const dy = activeDrag.lastY - activeDrag.startY;
      if (!activeDrag.axis && (Math.abs(dx) > AXIS_LOCK || Math.abs(dy) > AXIS_LOCK)) {
        activeDrag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      updateDragVisuals();
    };

    const onPointerEnd = (e, commit) => {
      if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
      e.preventDefault();
      unbindBoardPointerHandlers();
      endDrag(commit);
    };

    const onUp = (e) => onPointerEnd(e, true);
    const onCancel = (e) => onPointerEnd(e, false);

    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    boardPointerHandlers = { onMove: onPointerMove, onUp, onCancel };
  }

  function beginDrag(e, el, pieceId) {
    if (isBlocked() || activeDrag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();

    activeDrag = {
      pieceId,
      el,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startTime: performance.now(),
      axis: null,
      step: getStepSize(),
      movableDirs: getMovableDirs(pieceId),
    };

    el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    applyDragTransform(el, 0, 0);
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {
      /* capture unsupported */
    }
    bindDocumentPointerHandlers();
  }

  function clear() {
    unbindBoardPointerHandlers();
    if (!activeDrag) return;
    const { el } = activeDrag;
    if (el) {
      el.classList.remove('dragging', 'snap-back');
      el.style.transform = '';
    }
    document.body.classList.remove('is-dragging');
    activeDrag = null;
  }

  function isActive() {
    return activeDrag !== null;
  }

  /** Attach delegated pointerdown on the board (once). */
  function attach(el) {
    if (boardEl === el && onPointerDown) return;

    detach();
    boardEl = el;
    onPointerDown = (e) => {
      const pieceEl = e.target.closest?.('.piece');
      if (!pieceEl || !boardEl.contains(pieceEl)) return;
      const pieceId = pieceEl.dataset.id;
      if (!pieceId) return;
      beginDrag(e, pieceEl, pieceId);
    };
    boardEl.addEventListener('pointerdown', onPointerDown);
  }

  function detach() {
    clear();
    if (boardEl && onPointerDown) {
      boardEl.removeEventListener('pointerdown', onPointerDown);
    }
    boardEl = null;
    onPointerDown = null;
  }

  return { attach, detach, clear, isActive };
}
