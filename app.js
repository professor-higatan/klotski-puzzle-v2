(function () {
  'use strict';

  const APP_VERSION = '5';

  let config = null;
  let pieces = [];
  let initialPieces = [];
  let history = [];
  let moveCount = 0;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let won = false;
  let activeDrag = null;
  let initialized = false;

  const TRACKING_GAIN = 1.5;
  const SWIPE_THRESHOLD = 8;
  const FLICK_VELOCITY = 0.23;
  const AXIS_LOCK = 2;
  const PRE_AXIS_FOLLOW = 1;
  const DRAG_SCALE = 1.03;
  const SNAP_BACK_MS = 67;

  const boardEl = document.getElementById('board');
  const moveCountEl = document.getElementById('move-count');
  const timerEl = document.getElementById('timer');
  const undoBtn = document.getElementById('undo-btn');
  const resetBtn = document.getElementById('reset-btn');
  const winOverlay = document.getElementById('win-overlay');
  const winStatsEl = document.getElementById('win-stats');
  const playAgainBtn = document.getElementById('play-again-btn');
  const confettiCanvas = document.getElementById('confetti-canvas');

  const DIRS = {
    up: { dc: 0, dr: -1 },
    down: { dc: 0, dr: 1 },
    left: { dc: -1, dr: 0 },
    right: { dc: 1, dr: 0 },
  };

  function showBoardStatus(message, isError) {
    boardEl.innerHTML = '';
    const status = document.createElement('p');
    status.id = 'board-status';
    status.className = 'board-status' + (isError ? ' error' : '');
    status.textContent = message;
    boardEl.appendChild(status);
  }

  function clearActiveDrag() {
    if (!activeDrag) return;
    const { el } = activeDrag;
    if (el) {
      el.classList.remove('dragging', 'snap-back');
      el.style.transform = '';
    }
    document.body.classList.remove('is-dragging');
    activeDrag = null;
  }

  async function init() {
    try {
      showBoardStatus('読み込み中…');
      const res = await fetch(`puzzle.json?v=${APP_VERSION}`);
      if (!res.ok) throw new Error(`puzzle.json の読み込みに失敗しました (${res.status})`);

      config = await res.json();
      if (!config?.board?.cols || !Array.isArray(config.pieces)) {
        throw new Error('puzzle.json の形式が正しくありません');
      }

      initialPieces = deepClone(config.pieces);
      resetGame(false);
      bindEvents();
      initialized = true;
    } catch (err) {
      console.error(err);
      showBoardStatus('盤面の読み込みに失敗しました。ページを再読み込みしてください。', true);
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function resetGame(keepOverlay) {
    if (!config) return;

    clearActiveDrag();
    pieces = deepClone(initialPieces);
    history = [];
    moveCount = 0;
    elapsedSeconds = 0;
    won = false;

    if (keepOverlay !== false) {
      winOverlay.classList.add('hidden');
    }

    updateStats();
    undoBtn.disabled = true;

    if (timerInterval) clearInterval(timerInterval);
    startTimer();
    render();
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      if (!won) {
        elapsedSeconds++;
        updateStats();
      }
    }, 1000);
  }

  function updateStats() {
    moveCountEl.textContent = moveCount;
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function getOccupancy(excludeId) {
    const occ = Array.from({ length: config.board.rows }, () =>
      Array(config.board.cols).fill(null)
    );
    for (const p of pieces) {
      if (p.id === excludeId) continue;
      for (let r = 0; r < p.height; r++) {
        for (let c = 0; c < p.width; c++) {
          occ[p.position.row + r][p.position.col + c] = p.id;
        }
      }
    }
    return occ;
  }

  function canMove(piece, dc, dr) {
    const occ = getOccupancy(piece.id);
    const { col, row } = piece.position;

    if (dc === 1) {
      for (let r = 0; r < piece.height; r++) {
        const nc = col + piece.width;
        if (nc >= config.board.cols || occ[row + r][nc]) return false;
      }
      return true;
    }
    if (dc === -1) {
      for (let r = 0; r < piece.height; r++) {
        const nc = col - 1;
        if (nc < 0 || occ[row + r][nc]) return false;
      }
      return true;
    }
    if (dr === 1) {
      for (let c = 0; c < piece.width; c++) {
        const nr = row + piece.height;
        if (nr >= config.board.rows || occ[nr][col + c]) return false;
      }
      return true;
    }
    if (dr === -1) {
      for (let c = 0; c < piece.width; c++) {
        const nr = row - 1;
        if (nr < 0 || occ[nr][col + c]) return false;
      }
      return true;
    }
    return false;
  }

  function directionFromDelta(dx, dy, axis) {
    if (axis === 'x') return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  function movePiece(pieceId, direction) {
    if (won) return false;
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) return false;
    const { dc, dr } = DIRS[direction];
    if (!canMove(piece, dc, dr)) return false;

    history.push(deepClone(pieces));
    piece.position.col += dc;
    piece.position.row += dr;
    moveCount++;
    undoBtn.disabled = false;
    updateStats();
    render();
    checkWin();
    return true;
  }

  function undo() {
    if (history.length === 0 || won) return;
    clearActiveDrag();
    pieces = history.pop();
    moveCount = Math.max(0, moveCount - 1);
    undoBtn.disabled = history.length === 0;
    updateStats();
    render();
  }

  function checkWin() {
    const goal = config.board.exit;
    const boss = pieces.find((p) => p.id === goal.target_piece_id);
    if (
      boss &&
      boss.position.col === goal.target_position.col &&
      boss.position.row === goal.target_position.row
    ) {
      won = true;
      clearInterval(timerInterval);
      showWin();
    }
  }

  function showWin() {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    winStatsEl.textContent = `${moveCount}手 / ${m}分${s}秒`;
    winOverlay.classList.remove('hidden');
    launchConfetti();
  }

  function getCellSize() {
    const maxW = Math.min(window.innerWidth - 48, 400);
    const gap = config.board.gap_px;
    const cols = config.board.cols;
    return Math.floor((maxW - gap * (cols + 1)) / cols);
  }

  function getStepSize() {
    return getCellSize() + config.board.gap_px;
  }

  function getMovableDirs(pieceId) {
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) return {};
    return {
      up: canMove(piece, 0, -1),
      down: canMove(piece, 0, 1),
      left: canMove(piece, -1, 0),
      right: canMove(piece, 1, 0),
    };
  }

  function clampDragOffset(movableDirs, step, axis, delta) {
    const sign = Math.sign(delta) || 1;
    const dir = directionFromDelta(sign, sign, axis);
    const movable = movableDirs[dir];
    const abs = Math.abs(delta);
    if (movable) return sign * Math.min(abs, step);
    return sign * Math.min(abs, step * 0.16);
  }

  function applyDragTransform(el, tx, ty) {
    el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${DRAG_SCALE})`;
  }

  function amplifyDelta(delta) {
    return delta * TRACKING_GAIN;
  }

  function updateDragVisuals() {
    if (!activeDrag) return;

    const { el, startX, startY, lastX, lastY, axis, step, movableDirs } = activeDrag;
    const dx = lastX - startX;
    const dy = lastY - startY;

    let tx = 0;
    let ty = 0;

    if (axis === 'x') {
      tx = clampDragOffset(movableDirs, step, 'x', amplifyDelta(dx));
    } else if (axis === 'y') {
      ty = clampDragOffset(movableDirs, step, 'y', amplifyDelta(dy));
    } else {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx >= absDy) {
        tx = clampDragOffset(movableDirs, step, 'x', amplifyDelta(dx * PRE_AXIS_FOLLOW));
      } else {
        ty = clampDragOffset(movableDirs, step, 'y', amplifyDelta(dy * PRE_AXIS_FOLLOW));
      }
    }

    applyDragTransform(el, tx, ty);
  }

  function render() {
    if (!config) return;
    if (activeDrag) return;

    const gap = config.board.gap_px;
    const cellSize = getCellSize();
    const cols = config.board.cols;
    const rows = config.board.rows;
    const boardW = cols * cellSize + (cols + 1) * gap;
    const boardH = rows * cellSize + (rows + 1) * gap;

    boardEl.style.width = boardW + 'px';
    boardEl.style.height = boardH + 'px';
    boardEl.style.background = config.board.background;
    boardEl.innerHTML = '';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.left = gap + c * (cellSize + gap) + 'px';
        cell.style.top = gap + r * (cellSize + gap) + 'px';
        cell.style.width = cellSize + 'px';
        cell.style.height = cellSize + 'px';
        cell.style.background = config.colors.empty.fill;
        boardEl.appendChild(cell);
      }
    }

    for (const p of pieces) {
      const colorDef = config.colors[p.color];
      if (!colorDef) continue;

      const el = document.createElement('div');
      el.className = 'piece';
      el.dataset.id = p.id;
      el.style.left = gap + p.position.col * (cellSize + gap) + 'px';
      el.style.top = gap + p.position.row * (cellSize + gap) + 'px';
      el.style.width = p.width * cellSize + (p.width - 1) * gap + 'px';
      el.style.height = p.height * cellSize + (p.height - 1) * gap + 'px';
      el.style.background = colorDef.fill;
      el.style.color = colorDef.label_text;
      el.style.border = `2px solid ${colorDef.stroke}`;

      if (p.label) el.textContent = p.label;
      if (p.is_goal_piece && config.ui_hints?.highlight_goal_piece) {
        el.classList.add('goal-piece');
      }

      setupPieceInteraction(el, p.id);
      boardEl.appendChild(el);
    }
  }

  function shouldCommitMove(axis, dx, dy, durationMs) {
    if (!axis) return false;
    const delta = axis === 'x' ? dx : dy;
    const velocity = Math.abs(delta) / Math.max(durationMs, 1);
    return Math.abs(delta) >= SWIPE_THRESHOLD || velocity >= FLICK_VELOCITY;
  }

  function endDrag(commit) {
    if (!activeDrag) return;

    const { el, pieceId, axis, startX, startY, pointerId, startTime, lastX, lastY } = activeDrag;
    const dx = lastX - startX;
    const dy = lastY - startY;
    const durationMs = performance.now() - startTime;

    el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');

    if (commit && shouldCommitMove(axis, dx, dy, durationMs)) {
      const dir = directionFromDelta(dx, dy, axis);
      if (movePiece(pieceId, dir)) {
        activeDrag = null;
        try { el.releasePointerCapture(pointerId); } catch (_) {}
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
    try { el.releasePointerCapture(pointerId); } catch (_) {}
  }

  function setupPieceInteraction(el, pieceId) {
    el.addEventListener('pointerdown', (e) => {
      if (won || activeDrag) return;
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
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!activeDrag || activeDrag.pieceId !== pieceId) return;
      e.preventDefault();

      activeDrag.lastX = e.clientX;
      activeDrag.lastY = e.clientY;

      const dx = activeDrag.lastX - activeDrag.startX;
      const dy = activeDrag.lastY - activeDrag.startY;

      if (!activeDrag.axis && (Math.abs(dx) > AXIS_LOCK || Math.abs(dy) > AXIS_LOCK)) {
        activeDrag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }

      updateDragVisuals();
    });

    el.addEventListener('pointerup', (e) => {
      if (!activeDrag || activeDrag.pieceId !== pieceId) return;
      e.preventDefault();
      endDrag(true);
    });

    el.addEventListener('pointercancel', () => {
      if (!activeDrag || activeDrag.pieceId !== pieceId) return;
      endDrag(false);
    });

    el.addEventListener('lostpointercapture', () => {
      if (!activeDrag || activeDrag.pieceId !== pieceId) return;
      endDrag(false);
    });
  }

  function bindEvents() {
    undoBtn.addEventListener('click', undo);
    resetBtn.addEventListener('click', () => resetGame());
    playAgainBtn.addEventListener('click', () => resetGame());

    window.addEventListener('resize', () => {
      if (initialized) render();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        clearActiveDrag();
        if (initialized) render();
      }
    });

    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        clearActiveDrag();
        if (initialized) render();
      }
    });
  }

  function launchConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    const colors = ['#E63946', '#1D6FB8', '#F4C430', '#ffd700', '#ff6b6b', '#4ecdc4'];
    const particles = Array.from({ length: 150 }, () => ({
      x: Math.random() * confettiCanvas.width,
      y: -20 - Math.random() * 200,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
    }));

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.rot += p.vr;
        if (p.y < confettiCanvas.height + 20) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      frame++;
      if (alive && frame < 300) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
    animate();
  }

  init();
})();