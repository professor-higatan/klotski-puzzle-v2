import { APP_VERSION } from './constants.js';
import { getMovableDirs, isWin, tryMove } from './board-logic.js';
import { getStepSize, renderBoard, showBoardStatus } from './board-renderer.js';
import { launchConfetti } from './confetti.js';
import { createDemoPlayer } from './demo-player.js';
import { createDragHandler } from './drag-handler.js';
import { queryDom } from './dom.js';
import { renderLevelSelect } from './level-select.js';
import {
  loadProgress,
  markLevelCleared,
  saveProgress,
} from './progress.js';
import { createTimer } from './timer.js';
import { deepClone, formatTime, formatDurationJa } from './utils.js';

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
    this.won = false;
    this.initialized = false;

    this.timer = createTimer({
      onTick: (elapsed) => {
        if (!this.won) this.syncStats(elapsed);
      },
    });

    this.dragHandler = createDragHandler({
      getStepSize: () => getStepSize(this.config.board),
      getMovableDirs: (pieceId) =>
        getMovableDirs(pieceId, this.pieces, this.config.board),
      onMove: (pieceId, dir) => this.movePiece(pieceId, dir),
      isBlocked: () => this.won || this.demoPlayer.isActive(),
    });

    this.demoPlayer = createDemoPlayer({
      getBoardEl: () => this.dom.boardEl,
      getConfig: () => this.config,
      getPieces: () => this.pieces,
      setPieces: (pieces) => {
        this.pieces = pieces;
      },
      cloneInitialPieces: () => deepClone(this.initialPieces),
      onBeforeStart: () => this.prepareDemoBoard(),
      onAfterMove: (opts = {}) => {
        if (!opts.fullRender) this.moveCount += 1;
        this.syncStats();
        this.render();
      },
      onStatus: (text) => {
        this.dom.demoStatusEl.textContent = text;
      },
      onComplete: () => {
        this.checkWin();
        return this.won;
      },
      onUiActive: (active) => this.setDemoUI(active),
    });
  }

  getLevel(id) {
    return this.levelsData?.levels.find((l) => l.id === id) ?? null;
  }

  showScreen(name) {
    this.dom.levelSelectScreen.classList.toggle('hidden', name !== 'select');
    this.dom.gameScreen.classList.toggle('hidden', name !== 'game');
  }

  syncStats(elapsed = this.timer.elapsed) {
    this.dom.moveCountEl.textContent = String(this.moveCount);
    this.dom.timerEl.textContent = formatTime(elapsed);
  }

  render() {
    renderBoard({
      boardEl: this.dom.boardEl,
      config: this.config,
      pieces: this.pieces,
      skipIfDragging: () => this.dragHandler.isActive(),
    });
  }

  paintLevelSelect() {
    renderLevelSelect({
      levelGrid: this.dom.levelGrid,
      continueBtn: this.dom.continueBtn,
      levels: this.levelsData.levels,
      progress: this.progress,
      onSelect: (id) => this.startLevel(id),
      onContinue: (id) => this.startLevel(id),
    });
  }

  updateLevelHeader() {
    const level = this.getLevel(this.currentLevelId);
    if (!level) return;
    this.dom.levelLabelEl.textContent = `レベル ${level.id}`;
    this.dom.levelTitleEl.textContent = level.name_ja;
    document.title = `華容道 Lv.${level.id}`;
  }

  /** Shared reset of play state (not config / level id). */
  resetPlayState({ hideWinOverlay = true, restartTimer = true } = {}) {
    this.dragHandler.clear();
    this.pieces = deepClone(this.initialPieces);
    this.history = [];
    this.moveCount = 0;
    this.won = false;
    this.timer.resetAndStop();

    if (hideWinOverlay) {
      this.dom.winOverlay.classList.add('hidden');
    }

    this.dom.undoBtn.disabled = true;
    this.syncStats(0);
    if (restartTimer) this.timer.start();
    this.render();
  }

  startLevel(levelId) {
    if (levelId > this.progress.maxUnlocked) return;
    const level = this.getLevel(levelId);
    if (!level) return;

    this.demoPlayer.stop();
    this.dragHandler.clear();
    this.currentLevelId = levelId;
    this.config = level;
    this.solution = level.solution;
    this.initialPieces = deepClone(level.pieces);
    this.progress.lastLevel = levelId;
    saveProgress(this.progress);

    this.updateLevelHeader();
    this.showScreen('game');
    this.resetPlayState({ hideWinOverlay: false, restartTimer: true });
  }

  setDemoUI(active) {
    document.body.classList.toggle('is-demonstrating', active);
    this.dom.demoBanner.classList.toggle('hidden', !active);
    this.dom.surrenderBtn.classList.toggle('hidden', active);
    this.dom.undoBtn.disabled = active || this.history.length === 0;
    this.dom.resetBtn.disabled = active;
    this.dom.backBtn.disabled = active;
  }

  prepareDemoBoard() {
    this.dragHandler.clear();
    this.history = [];
    this.moveCount = 0;
    this.won = false;
    this.timer.resetAndStop();
    this.dom.winOverlay.classList.add('hidden');
    this.dom.undoBtn.disabled = true;
    this.syncStats(0);
  }

  async startDemo() {
    if (this.demoPlayer.isActive() || !this.config || !this.solution) return;
    await this.demoPlayer.start(this.solution);
    if (!this.won && !this.timer.isRunning()) this.timer.start();
  }

  resetGame(keepOverlay = true) {
    if (!this.config) return;
    this.demoPlayer.stop();
    this.resetPlayState({ hideWinOverlay: keepOverlay, restartTimer: true });
  }

  movePiece(pieceId, direction) {
    if (this.won || this.demoPlayer.isActive()) return false;
    this.history.push(deepClone(this.pieces));
    if (!tryMove(pieceId, direction, this.pieces, this.config.board)) {
      this.history.pop();
      return false;
    }
    this.moveCount += 1;
    this.dom.undoBtn.disabled = false;
    this.syncStats();
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
    this.syncStats();
    this.render();
  }

  checkWin() {
    if (!isWin(this.pieces, this.config.board.exit)) return;
    this.won = true;
    this.timer.stop();
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
    this.dom.winStatsEl.textContent = `${this.moveCount}手 / ${formatDurationJa(this.timer.elapsed)}`;

    const hasNext = this.currentLevelId < this.levelsData.levels.length;
    this.dom.nextLevelBtn.classList.toggle('hidden', !hasNext);
    this.dom.winOverlay.classList.remove('hidden');
    launchConfetti(this.dom.confettiCanvas);
  }

  goToLevelSelect() {
    this.demoPlayer.stop();
    this.dragHandler.clear();
    this.dom.winOverlay.classList.add('hidden');
    this.timer.stop();
    this.paintLevelSelect();
    this.showScreen('select');
  }

  bindEvents() {
    const d = this.dom;
    d.undoBtn.addEventListener('click', () => this.undo());
    d.resetBtn.addEventListener('click', () => this.resetGame());
    d.playAgainBtn.addEventListener('click', () => this.resetGame());
    d.surrenderBtn.addEventListener('click', () => this.startDemo());
    d.stopDemoBtn.addEventListener('click', () => this.demoPlayer.stop());
    d.backBtn.addEventListener('click', () => this.goToLevelSelect());
    d.toLevelsBtn.addEventListener('click', () => this.goToLevelSelect());
    d.nextLevelBtn.addEventListener('click', () => {
      d.winOverlay.classList.add('hidden');
      this.startLevel(this.currentLevelId + 1);
    });

    window.addEventListener('resize', () => {
      if (!this.initialized || !this.config) return;
      if (!this.dom.levelSelectScreen.classList.contains('hidden')) return;
      this.render();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.dragHandler.clear();
      if (
        this.initialized &&
        this.config &&
        !this.dom.gameScreen.classList.contains('hidden')
      ) {
        this.render();
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

      this.dragHandler.attach(this.dom.boardEl);
      this.bindEvents();
      this.paintLevelSelect();
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
