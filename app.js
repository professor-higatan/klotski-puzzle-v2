(function () {
  'use strict';

  const APP_VERSION = '9';
  const PROGRESS_KEY = 'klotski-progress-v1';

  let levelsData = null;
  let config = null;
  let solution = null;
  let currentLevelId = null;
  let progress = { maxUnlocked: 1, cleared: [], lastLevel: 1 };

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

  const levelSelectScreen = document.getElementById('level-select-screen');
  const gameScreen = document.getElementById('game-screen');
  const levelGrid = document.getElementById('level-grid');
  const continueBtn = document.getElementById('continue-btn');
  const backBtn = document.getElementById('back-btn');
  const levelLabelEl = document.getElementById('level-label');
  const levelTitleEl = document.getElementById('level-title');
  const boardEl = document.getElementById('board');
  const moveCountEl = document.getElementById('move-count');
  const timerEl = document.getElementById('timer');
  const undoBtn = document.getElementById('undo-btn');
  const resetBtn = document.getElementById('reset-btn');
  const winOverlay = document.getElementById('win-overlay');
  const winLevelNameEl = document.getElementById('win-level-name');
  const winStatsEl = document.getElementById('win-stats');
  const nextLevelBtn = document.getElementById('next-level-btn');
  const playAgainBtn = document.getElementById('play-again-btn');
  const toLevelsBtn = document.getElementById('to-levels-btn');
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

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      progress.maxUnlocked = Math.max(1, saved.maxUnlocked || 1);
      progress.cleared = Array.isArray(saved.cleared) ? saved.cleared : [];
      progress.lastLevel = saved.lastLevel || 1;
    } catch (_) {}
  }

  function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }

  function showScreen(name) {
    levelSelectScreen.classList.toggle('hidden', name !== 'select');
    gameScreen.classList.toggle('hidden', name !== 'game');
  }

  function getLevel(id) {
    return levelsData.levels.find((l) => l.id === id);
  }

  function getContinueLevel() {
    const sorted = levelsData.levels.map((l) => l.id).sort((a, b) => a - b);
    for (const id of sorted) {
      if (id <= progress.maxUnlocked && !progress.cleared.includes(id)) return id;
    }
    return Math.min(progress.maxUnlocked, sorted[sorted.length - 1]);
  }

  function renderLevelSelect() {
    levelGrid.innerHTML = '';
    const continueLevel = getContinueLevel();
    const hasUncleared = levelsData.levels.some(
      (l) => l.id <= progress.maxUnlocked && !progress.cleared.includes(l.id)
    );
    continueBtn.classList.toggle('hidden', !hasUncleared);

    for (const level of levelsData.levels) {
      const unlocked = level.id <= progress.maxUnlocked;
      const cleared = progress.cleared.includes(level.id);
      const btn = document.createElement('button');
      btn.className = 'level-card' + (unlocked ? ' unlocked' : ' locked') + (cleared ? ' cleared' : '');
      btn.type = 'button';
      btn.disabled = !unlocked;
      btn.innerHTML =
        `<span class="level-card-num">レベル ${level.id}</span>` +
        `<span class="level-card-name">${level.name_ja}</span>` +
        `<span class="level-card-moves">正解 ${level.solution.total} 手</span>` +
        `<span class="level-card-badge">${cleared ? '✅' : unlocked ? '▶' : '🔒'}</span>`;
      if (unlocked) {
        btn.addEventListener('click', () => startLevel(level.id));
      }
      levelGrid.appendChild(btn);
    }

    continueBtn.onclick = () => startLevel(continueLevel);
  }

  function updateLevelHeader() {
    const level = getLevel(currentLevelId);
    if (!level) return;
    levelLabelEl.textContent = `レベル ${level.id}`;
    levelTitleEl.textContent = level.name_ja;
    document.title = `華容道 Lv.${level.id}`;
  }

  function startLevel(levelId) {
    if (levelId > progress.maxUnlocked) return;
    const level = getLevel(levelId);
    if (!level) return;

    stopDemo();
    clearActiveDrag();
    currentLevelId = levelId;
    config = level;
    solution = level.solution;
    initialPieces = deepClone(level.pieces);
    progress.lastLevel = levelId;
    saveProgress();

    updateLevelHeader();
    showScreen('game');
    resetGame(false);
    if (!timerInterval) startTimer();
  }

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
      loadProgress();
      const res = await fetch(`levels.json?v=${APP_VERSION}`);
      if (!res.ok) throw new Error('levels.json の読み込みに失敗しました');
      levelsData = await res.json();
      if (!Array.isArray(levelsData?.levels) || levelsData.levels.length === 0) {
        throw new Error('levels.json の形式が正しくありません');
      }
      progress.maxUnlocked = Math.min(progress.maxUnlocked, levelsData.levels.length);
      bindEvents();
      renderLevelSelect();
      showScreen('select');
      initialized = true;
    } catch (err) {
      console.error(err);
      showBoardStatus('読み込みに失敗しました。ページを再読み込みしてください。', true);
      showScreen('game');
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
    backBtn.disabled = active;
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
    if (demonstrating || !config || !solution) return;

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
      demoStatusEl.textContent = '正解の動きをお見せします…';
      await sleep(600);

      const moves = solution.moves;
      for (let i = 0; i < moves.length; i++) {
        if (demoAbort) break;
        const { pieceId, direction } = moves[i];
        demoStatusEl.textContent = `正解再生中… ${i + 1} / ${solution.total || moves.length}`;
        await animateDemoMove(pieceId, direction);
      }

      if (!demoAbort) {
        checkWin();
        demoStatusEl.textContent = won ? 'クリア！これが正解の動きです' : '再生が終わりました';
        await sleep(won ? 1200 : 800);
      }
    } catch (err) {
      console.error(err);
      demoStatusEl.textContent = '正解の再生に失敗しました';
      await sleep(1500);
    }

    setDemoUI(false);
    backBtn.disabled = false;
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
        if (col + piece.width >= config.board.cols || occ[row + r][col + piece.width]) return false;
      }
      return true;
    }
    if (dc === -1) {
      for (let r = 0; r < piece.height; r++) {
        if (col - 1 < 0 || occ[row + r][col - 1]) return false;
      }
      return true;
    }
    if (dr === 1) {
      for (let c = 0; c < piece.width; c++) {
        if (row + piece.height >= config.board.rows || occ[row + piece.height][col + c]) return false;
      }
      return true;
    }
    if (dr === -1) {
      for (let c = 0; c < piece.width; c++) {
        if (row - 1 < 0 || occ[row - 1][col + c]) return false;
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

  function markLevelCleared() {
    if (!progress.cleared.includes(currentLevelId)) {
      progress.cleared.push(currentLevelId);
      progress.cleared.sort((a, b) => a - b);
    }
    const maxId = levelsData.levels.length;
    if (currentLevelId < maxId) {
      progress.maxUnlocked = Math.max(progress.maxUnlocked, currentLevelId + 1);
    }
    saveProgress();
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
      timerInterval = null;
      markLevelCleared();
      showWin();
    }
  }

  function showWin() {
    const level = getLevel(currentLevelId);
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    winLevelNameEl.textContent = level ? `レベル ${level.id}：${level.name_ja}` : '';
    winStatsEl.textContent = `${moveCount}手 / ${m}分${s}秒`;

    const hasNext = currentLevelId < levelsData.levels.length;
    nextLevelBtn.classList.toggle('hidden', !hasNext);

    winOverlay.classList.remove('hidden');
    launchConfetti();
  }

  function goToLevelSelect() {
    stopDemo();
    clearActiveDrag();
    winOverlay.classList.add('hidden');
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    renderLevelSelect();
    showScreen('select');
  }

  function getCellSize() {
    const maxW = Math.min(window.innerWidth - 48, 400);
    const gap = config.board.gap_px;
    return Math.floor((maxW - gap * (config.board.cols + 1)) / config.board.cols);
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
      if (Math.abs(dx) >= Math.abs(dy)) {
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

    boardEl.style.width = cols * cellSize + (cols + 1) * gap + 'px';
    boardEl.style.height = rows * cellSize + (rows + 1) * gap + 'px';
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
    return abs >= MIN_FLICK_DISTANCE && abs / durationMs >= FLICK_VELOCITY;
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
    backBtn.addEventListener('click', goToLevelSelect);
    toLevelsBtn.addEventListener('click', goToLevelSelect);
    nextLevelBtn.addEventListener('click', () => {
      winOverlay.classList.add('hidden');
      startLevel(currentLevelId + 1);
    });

    window.addEventListener('resize', () => {
      if (initialized && !levelSelectScreen.classList.contains('hidden')) return;
      if (initialized && config) render();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        clearActiveDrag();
        if (initialized && config && gameScreen.classList.contains('hidden') === false) render();
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