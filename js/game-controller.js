import { APP_VERSION, DEMO_MOVE_MS, DIRS } from './constants.js';
import { canMove, getMovableDirs, isWin, tryMove } from './board-logic.js';
import { getCellSize, getStepSize, renderBoard, showBoardStatus } from './board-renderer.js';
import { launchConfetti } from './confetti.js';
import { createDragHandler } from './drag-handler.js';
import { queryDom } from './dom.js';
import {
  getContinueLevel,
  loadProgress,
  markLevelCleared,
  saveProgress,
} from './progress.js';
import { deepClone, formatTime, sleep } from './utils.js';

export class GameController {
  constructor() {
    this.dom = queryDom();
    this.levelsData = null;
    this.config = null;
    this.solution = null;
    this.currentLevelId = null;
    this.progress = loadProgress();
    this.pieces = [];
    this.initialPieces = [];
    this.history = [];
    this.moveCount = 0;
    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.won = false;
    this.initialized = false;
    this.demonstrating = false;
    this.demoAbort = false;

    this.dragHandler = createDragHandler({
      getStepSize: () => this.getStepSize(),
      getMovableDirs: (pieceId) => this.getMovableDirs(pieceId),
      onMove: (pieceId, dir) => this.movePiece(pieceId, dir),
      isBlocked: () => this.won || this.demonstrating,
    });
  }

  getLevel(id) {
    return this.levelsData.levels.find((l) => l.id === id);
  }

  showScreen(name) {
    this.dom.levelSelectScreen.classList.toggle('hidden', name !== 'select');
    this.dom.gameScreen.classList.toggle('hidden', name !== 'game');
  }

  updateStats() {
    this.dom.moveCountEl.textContent = this.moveCount;
    this.dom.timerEl.textContent = formatTime(this.elapsedSeconds);
  }

  getStepSize() {
    return getStepSize(this.config.board);
  }

  getMovableDirs(pieceId) {
    return getMovableDirs(pieceId, this.pieces, this.config.board);
  }

  render() {
    renderBoard({
      boardEl: this.dom.boardEl,
      config: this.config,
      pieces: this.pieces,
      dragHandler: this.dragHandler,
      skipIfDragging: () => this.dragHandler.isActive(),
    });
  }

  renderLevelSelect() {
    const { levelGrid, continueBtn } = this.dom;
    const levels = this.levelsData.levels;
    levelGrid.innerHTML = '';

    const continueLevel = getContinueLevel(levels, this.progress);
    const hasUncleared = levels.some(
      (l) => l.id <= this.progress.maxUnlocked && !this.progress.cleared.includes(l.id)
    );
    continueBtn.classList.toggle('hidden', !hasUncleared);

    for (const level of levels) {
      const unlocked = level.id <= this.progress.maxUnlocked;
      const cleared = this.progress.cleared.includes(level.id);
      const btn = document.createElement('button');
      btn.className =
        'level-card' + (unlocked ? ' unlocked' : ' locked') + (cleared ? ' cleared' : '');
      btn.type = 'button';
      btn.disabled = !unlocked;
      btn.innerHTML =
        `<span class="level-card-num">レベル ${level.id}</span>` +
        `<span class="level-card-name">${level.name_ja}</span>` +
        `<span class="level-card-moves">正解 ${level.solution.total} 手</span>` +
        `<span class="level-card-badge">${cleared ? '✅' : unlocked ? '▶' : '🔒'}</span>`;
      if (unlocked) {
        btn.addEventListener('click', () => this.startLevel(level.id));
      }
      levelGrid.appendChild(btn);
    }

    continueBtn.onclick = () => this.startLevel(continueLevel);
  }

  updateLevelHeader() {
    const level = this.getLevel(this.currentLevelId);
    if (!level) return;
    this.dom.levelLabelEl.textContent = `レベル ${level.id}`;
    this.dom.levelTitleEl.textContent = level.name_ja;
    document.title = `華容道 Lv.${level.id}`;
  }

  startLevel(levelId) {
    if (levelId > this.progress.maxUnlocked) return;
    const level = this.getLevel(levelId);
    if (!level) return;

    this.stopDemo();
    this.dragHandler.clear();
    this.currentLevelId = levelId;
    this.config = level;
    this.solution = level.solution;
    this.initialPieces = deepClone(level.pieces);
    this.progress.lastLevel = levelId;
    saveProgress(this.progress);

    this.updateLevelHeader();
    this.showScreen('game');
    this.resetGame(false);
    if (!this.timerInterval) this.startTimer();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      if (!this.won) {
        this.elapsedSeconds++;
        this.updateStats();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  setDemoUI(active) {
    this.demonstrating = active;
    document.body.classList.toggle('is-demonstrating', active);
    this.dom.demoBanner.classList.toggle('hidden', !active);
    this.dom.surrenderBtn.classList.toggle('hidden', active);
    this.dom.undoBtn.disabled = active || this.history.length === 0;
    this.dom.resetBtn.disabled = active;
    this.dom.backBtn.disabled = active;
  }

  async animateDemoMove(pieceId, direction) {
    if (this.demoAbort) return false;
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece) return false;
    const { dc, dr } = DIRS[direction];
    if (!canMove(piece, this.pieces, this.config.board)(dc, dr)) return false;

    const el = this.dom.boardEl.querySelector(`[data-id="${pieceId}"]`);
    if (!el) return false;

    const gap = this.config.board.gap_px;
    const cellSize = getCellSize(this.config.board);
    const step = cellSize + gap;
    const newCol = piece.position.col + dc;
    const newRow = piece.position.row + dr;

    el.classList.add('demo-highlight', 'demo-slide');
    el.style.left = gap + newCol * step + 'px';
    el.style.top = gap + newRow * step + 'px';

    await sleep(DEMO_MOVE_MS);
    if (this.demoAbort) return false;

    piece.position.col = newCol;
    piece.position.row = newRow;
    this.moveCount++;
    this.updateStats();
    this.render();
    return true;
  }

  async startDemo() {
    if (this.demonstrating || !this.config || !this.solution) return;

    this.dragHandler.clear();
    this.demoAbort = false;
    this.setDemoUI(true);

    this.pieces = deepClone(this.initialPieces);
    this.history = [];
    this.moveCount = 0;
    this.elapsedSeconds = 0;
    this.won = false;
    this.dom.winOverlay.classList.add('hidden');
    this.updateStats();
    this.stopTimer();
    this.render();

    try {
      this.dom.demoStatusEl.textContent = '正解の動きをお見せします…';
      await sleep(600);

      const moves = this.solution.moves;
      for (let i = 0; i < moves.length; i++) {
        if (this.demoAbort) break;
        const { pieceId, direction } = moves[i];
        this.dom.demoStatusEl.textContent =
          `正解再生中… ${i + 1} / ${this.solution.total || moves.length}`;
        await this.animateDemoMove(pieceId, direction);
      }

      if (!this.demoAbort) {
        this.checkWin();
        this.dom.demoStatusEl.textContent = this.won
          ? 'クリア！これが正解の動きです'
          : '再生が終わりました';
        await sleep(this.won ? 1200 : 800);
      }
    } catch (err) {
      console.error(err);
      this.dom.demoStatusEl.textContent = '正解の再生に失敗しました';
      await sleep(1500);
    }

    this.setDemoUI(false);
    this.dom.backBtn.disabled = false;
    if (!this.won && !this.timerInterval) this.startTimer();
  }

  stopDemo() {
    this.demoAbort = true;
  }

  resetGame(keepOverlay = true) {
    if (!this.config) return;
    this.stopDemo();
    this.dragHandler.clear();
    this.pieces = deepClone(this.initialPieces);
    this.history = [];
    this.moveCount = 0;
    this.elapsedSeconds = 0;
    this.won = false;

    if (keepOverlay) {
      this.dom.winOverlay.classList.add('hidden');
    }

    this.updateStats();
    this.dom.undoBtn.disabled = true;
    this.stopTimer();
    this.startTimer();
    this.render();
  }

  movePiece(pieceId, direction) {
    if (this.won || this.demonstrating) return false;
    this.history.push(deepClone(this.pieces));
    if (!tryMove(pieceId, direction, this.pieces, this.config.board)) {
      this.history.pop();
      return false;
    }
    this.moveCount++;
    this.dom.undoBtn.disabled = false;
    this.updateStats();
    this.render();
    this.checkWin();
    return true;
  }

  undo() {
    if (this.history.length === 0 || this.won) return;
    this.dragHandler.clear();
    this.pieces = this.history.pop();
    this.moveCount = Math.max(0, this.moveCount - 1);
    this.dom.undoBtn.disabled = this.history.length === 0;
    this.updateStats();
    this.render();
  }

  checkWin() {
    if (!isWin(this.pieces, this.config.board.exit)) return;
    this.won = true;
    this.stopTimer();
    markLevelCleared(
      this.progress,
      this.currentLevelId,
      this.levelsData.levels.length
    );
    this.showWin();
  }

  showWin() {
    const level = this.getLevel(this.currentLevelId);
    this.dom.winLevelNameEl.textContent = level
      ? `レベル ${level.id}：${level.name_ja}`
      : '';
    const m = Math.floor(this.elapsedSeconds / 60);
    const s = this.elapsedSeconds % 60;
    this.dom.winStatsEl.textContent = `${this.moveCount}手 / ${m}分${s}秒`;

    const hasNext = this.currentLevelId < this.levelsData.levels.length;
    this.dom.nextLevelBtn.classList.toggle('hidden', !hasNext);

    this.dom.winOverlay.classList.remove('hidden');
    launchConfetti(this.dom.confettiCanvas);
  }

  goToLevelSelect() {
    this.stopDemo();
    this.dragHandler.clear();
    this.dom.winOverlay.classList.add('hidden');
    this.stopTimer();
    this.renderLevelSelect();
    this.showScreen('select');
  }

  bindEvents() {
    const d = this.dom;
    d.undoBtn.addEventListener('click', () => this.undo());
    d.resetBtn.addEventListener('click', () => this.resetGame());
    d.playAgainBtn.addEventListener('click', () => this.resetGame());
    d.surrenderBtn.addEventListener('click', () => this.startDemo());
    d.stopDemoBtn.addEventListener('click', () => this.stopDemo());
    d.backBtn.addEventListener('click', () => this.goToLevelSelect());
    d.toLevelsBtn.addEventListener('click', () => this.goToLevelSelect());
    d.nextLevelBtn.addEventListener('click', () => {
      d.winOverlay.classList.add('hidden');
      this.startLevel(this.currentLevelId + 1);
    });

    window.addEventListener('resize', () => {
      if (this.initialized && !this.dom.levelSelectScreen.classList.contains('hidden')) return;
      if (this.initialized && this.config) this.render();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.dragHandler.clear();
        if (
          this.initialized &&
          this.config &&
          this.dom.gameScreen.classList.contains('hidden') === false
        ) {
          this.render();
        }
      }
    });
  }

  async init() {
    try {
      showBoardStatus(this.dom.boardEl, '読み込み中…');
      this.progress = loadProgress();
      const res = await fetch(`levels.json?v=${APP_VERSION}`);
      if (!res.ok) throw new Error('levels.json の読み込みに失敗しました');
      this.levelsData = await res.json();
      if (!Array.isArray(this.levelsData?.levels) || this.levelsData.levels.length === 0) {
        throw new Error('levels.json の形式が正しくありません');
      }
      this.progress.maxUnlocked = Math.min(
        this.progress.maxUnlocked,
        this.levelsData.levels.length
      );
      this.bindEvents();
      this.renderLevelSelect();
      this.showScreen('select');
      this.initialized = true;
    } catch (err) {
      console.error(err);
      showBoardStatus(
        this.dom.boardEl,
        '読み込みに失敗しました。ページを再読み込みしてください。',
        true
      );
      this.showScreen('game');
    }
  }
}