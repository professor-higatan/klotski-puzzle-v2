(function () {
  'use strict';

  const APP_VERSION = '7';

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
  let boardPointerHandlers = null;
  let solution = null;
  let demonstrating = false;
  let demoAbort = false;

  const DEMO_MOVE_MS = 300;

  const TRACKING_GAIN = 1.5;
  const SWIPE_THRESHOLD = 10;
  const FLICK_VELOCITY = 0.4;
  const MIN_FLICK_DISTANCE = 6;
  const MIN_DRAG_DURATION = 50;
  const AXIS_LOCK = 4;
  const PRE_AXIS_FOLLOW = 0.9;
  const DRAG_SCALE = 1.03;
  const SNAP_BACK_MS = 80;

  const boardEl = document.getElementById('board');
  const moveCountEl = document.getElementById('move-count');
  const timerEl = document.getElementById('timer');
  const undoBtn = document.getElementById('undo-btn');
  const resetBtn = document.getElementById('reset-btn');
  const winOverlay = document.getElementById('win-overlay');
  const winStatsEl = document.getElementById('win-stats');
  const playAgainBtn = document.getElementById('play-again-btn');
  const surrenderBtn = document.getElementById('surrender-btn');
  const demoBanner = document.getElementById('demo-banner');
  const demoStatusEl = document.getElementById('demo-status');
  const stopDemoBtn = document.getElementById('stop-demo-btn');
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

  function bindBoardPointerHandlers() {
    unbindBoardPointerHandlers();

    const onMove = (e) => {
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

    const onEnd = (e, commit) => {
      if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
      e.preventDefault();
      unbindBoardPointerHandlers();
      endDrag(commit);
    };

    const onUp = (e) => onEnd(e, true);
    const onCancel = (e) => onEnd(e, false);

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);

    boardPointerHandlers = { onMove, onUp, onCancel };
  }

  function unbindBoardPointerHandlers() {
    if (!boardPointerHandlers) return;
    const { onMove, onUp, onCancel } = boardPointerHandlers;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    boardPointerHandlers = null;
  }

  function clearActiveDrag() {
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setDemoUI(active) {
    demonstrating = active;
    document.body.classList.toggle('is-demonstrating', active);
    demoBanner.classList.toggle('hidden', !active);
    surrenderBtn.classList.toggle('hidden', active);
    undoBtn.disabled = active || history.length === 0;
    resetBtn.disabled = active;
    surrenderBtn.disabled = active;
  }

  async function loadSolution() {
    if (solution) return solution;
    const res = await fetch(`solution.json?v=${APP_VERSION}`);
    if (!res.ok) throw new Error('solution.json load failed');
    solution = await res.json();
    return solution;
  }

  async function animateDemoMove(pieceId, direction) {
    if (demoAbort) return false;
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) return false;
    const { dc, dr } = DIRS[direction];
    if (!canMove(piece, dc, dr)) return false;

    const el = boardEl.querySelector(`[data-id="${pieceId}"]`);
    if (!el) return false;

    const gap = config.board.gap_px;
    const cellSize = getCellSize();
    const step = cellSize + gap;
    const newCol = piece.position.col + dc;
    const newRow = piece.position.row + dr;

    el.classList.add('demo-highlight', 'demo-slide');
    el.style.left = gap + newCol * step + 'px';
    el.style.top = gap + newRow * step + 'px';

    await sleep(DEMO_MOVE_MS);
    if (demoAbort) return false;

    piece.position.col = newCol;
    piece.position.row = newRow;
    moveCount++;
    updateStats();
    render();
    return true;
  }

  async function startDemo() {
    if (demonstrating || !config) return;

    clearActiveDrag();
    demoAbort = false;
    setDemoUI(true);

    pieces = deepClone(initialPieces);
    history = [];
    moveCount = 0;
    elapsedSeconds = 0;
    won = false;
    winOverlay.classList.add('hidden');
    updateStats();
    if (timerInterval) clearInterval(timerInterval);
    render();

    try {
      const sol = await loadSolution();
      demoStatusEl.textContent = '正解の動きをお見せします…';
      await sleep(600);

      for (let i = 0; i < sol.moves.length; i++) {
        if (demoAbort) break;
        const { pieceId, direction } = sol.moves[i];
        demoStatusEl.textContent = `正解再生中… ${i + 1} / ${sol.total || sol.moves.length}`;
        await animateDemoMove(pieceId, direction);
      }

      if (!demoAbort) {
        checkWin();
        demoStatusEl.textContent = won
          ? 'クリア！これが正解の動きです'
          : '再生が終わりました';
        await sleep(won ? 1200 : 800);
      }
    } catch (err) {
      console.error(err);
      demoStatusEl.textContent = '正解の読み込みに失敗しました';
      await sleep(1500);
    }

    setDemoUI(false);
    if (!won && !timerInterval) startTimer();
  }

  function stopDemo() {
    demoAbort = true;
  }

  function resetGame(keepOverlay) {
    if (!config) return;

    stopDemo();
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
    if (axis === 'x') return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function movePiece(pieceId, direction) {
    if (won || demonstrating) return false;
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
    } else if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx >= absDy) {
        tx = clampDragOffset(movableDirs, step, 'x', dx * PRE_AXIS_FOLLOW * TRACKING_GAIN);
      } else {
        ty = clampDragOffset(movableDirs, step, 'y', dy * PRE_AXIS_FOLLOW * TRACKING_GAIN);
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
    const abs = Math.abs(delta);

    if (abs >= SWIPE_THRESHOLD) return true;
    if (durationMs < MIN_DRAG_DURATION) return false;

    const velocity = abs / durationMs;
    return abs >= MIN_FLICK_DISTANCE && velocity >= FLICK_VELOCITY;
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
      if (movePiece(pieceId, dir)) {
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
      if (won || activeDrag || demonstrating) return;
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

      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      bindBoardPointerHandlers();
    });
  }

  function bindEvents() {
    undoBtn.addEventListener('click', undo);
    resetBtn.addEventListener('click', () => resetGame());
    playAgainBtn.addEventListener('click', () => resetGame());
    surrenderBtn.addEventListener('click', startDemo);
    stopDemoBtn.addEventListener('click', stopDemo);

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