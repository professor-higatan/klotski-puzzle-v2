import { APP_VERSION } from './constants.js';
import { getMovableDirs, isWin, tryMove } from './board-logic.js';
import { getStepSize, renderBoard, showBoardStatus } from './board-renderer.js';
import { launchConfetti } from './confetti.js';
import { createDemoPlayer } from './demo-player.js';
import { createDragHandler } from './drag-handler.js';
import { queryDom } from './dom.js';
import { renderLevelSelect, renderPackSelect } from './level-select.js';
import {
  findLevel,
  findPack,
  legacyIdMap,
  nextLevelInPack,
} from './levels-data.js';
import {
  isLevelUnlocked,
  loadProgressWithCatalog,
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
    this.currentPackId = null;
    this.selectMode = 'packs'; // 'packs' | 'levels'
    this.browsePackId = null;
    this.progress = null;
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

  getLevelEntry(levelId) {
    return findLevel(this.levelsData, levelId);
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

  paintSelect() {
    if (this.selectMode === 'levels' && this.browsePackId) {
      this.paintLevelSelect(this.browsePackId);
    } else {
      this.paintPackSelect();
    }
  }

  paintPackSelect() {
    this.selectMode = 'packs';
    this.browsePackId = null;
    const d = this.dom;
    d.packBackBtn.classList.add('hidden');
    d.selectTitle.textContent = '華容道';
    d.selectSubtitle.textContent = 'パックを選んで★を出口まで運ぼう！';
    d.selectHint.textContent = 'パックをクリアすると次のパックが解放されます';
    document.title = '華容道パズル';

    renderPackSelect({
      levelGrid: d.levelGrid,
      continueBtn: d.continueBtn,
      data: this.levelsData,
      progress: this.progress,
      onSelectPack: (packId) => this.openPack(packId),
      onContinue: (levelId) => this.startLevel(levelId),
    });
  }

  openPack(packId) {
    this.browsePackId = packId;
    this.paintLevelSelect(packId);
  }

  paintLevelSelect(packId) {
    const pack = findPack(this.levelsData, packId);
    if (!pack) {
      this.paintPackSelect();
      return;
    }

    this.selectMode = 'levels';
    this.browsePackId = packId;
    const d = this.dom;
    d.packBackBtn.classList.remove('hidden');
    d.selectTitle.textContent = pack.name_ja;
    d.selectSubtitle.textContent = pack.description || 'レベルを選ぼう';
    d.selectHint.textContent = 'レベルを順にクリアすると次が解放されます';
    document.title = `華容道 — ${pack.name_ja}`;

    renderLevelSelect({
      levelGrid: d.levelGrid,
      continueBtn: d.continueBtn,
      pack,
      data: this.levelsData,
      progress: this.progress,
      onSelect: (levelId) => this.startLevel(levelId),
      onContinue: (levelId) => this.startLevel(levelId),
    });
  }

  updateLevelHeader() {
    const entry = this.getLevelEntry(this.currentLevelId);
    if (!entry) return;
    const { pack, level } = entry;
    this.dom.levelLabelEl.textContent = `${pack.name_ja} · レベル ${level.order}`;
    this.dom.levelTitleEl.textContent = level.name_ja;
    document.title = `華容道 ${level.name_ja}`;
  }

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
    const entry = this.getLevelEntry(levelId);
    if (!entry) return;

    const { pack, level, hydrated } = entry;
    if (!isLevelUnlocked(level, pack, this.progress, this.levelsData)) return;

    this.demoPlayer.stop();
    this.dragHandler.clear();
    this.currentLevelId = levelId;
    this.currentPackId = pack.id;
    this.browsePackId = pack.id;
    this.config = hydrated;
    this.solution = level.solution;
    this.initialPieces = deepClone(level.pieces);
    this.progress.lastLevelId = levelId;
    this.progress.lastPackId = pack.id;
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
    const entry = this.getLevelEntry(this.currentLevelId);
    if (entry) {
      markLevelCleared(
        this.progress,
        entry.level,
        entry.pack,
        this.levelsData
      );
    }
    this.showWin();
  }

  showWin() {
    const entry = this.getLevelEntry(this.currentLevelId);
    this.dom.winLevelNameEl.textContent = entry
      ? `${entry.pack.name_ja}：${entry.level.name_ja}`
      : '';
    this.dom.winStatsEl.textContent = `${this.moveCount}手 / ${formatDurationJa(this.timer.elapsed)}`;

    const next = entry
      ? nextLevelInPack(entry.pack, this.currentLevelId)
      : null;
    this.dom.nextLevelBtn.classList.toggle('hidden', !next);
    this.dom.winOverlay.classList.remove('hidden');
    launchConfetti(this.dom.confettiCanvas);
  }

  goToLevelSelect() {
    this.demoPlayer.stop();
    this.dragHandler.clear();
    this.dom.winOverlay.classList.add('hidden');
    this.timer.stop();
    if (this.currentPackId) {
      this.paintLevelSelect(this.currentPackId);
    } else {
      this.paintPackSelect();
    }
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
    d.packBackBtn.addEventListener('click', () => this.paintPackSelect());
    d.nextLevelBtn.addEventListener('click', () => {
      d.winOverlay.classList.add('hidden');
      const entry = this.getLevelEntry(this.currentLevelId);
      const next = entry
        ? nextLevelInPack(entry.pack, this.currentLevelId)
        : null;
      if (next) this.startLevel(next.id);
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

      const res = await fetch(`levels.json?v=${APP_VERSION}`);
      if (!res.ok) throw new Error('levels.json の読み込みに失敗しました');

      this.levelsData = await res.json();
      if (
        this.levelsData?.version !== 2 ||
        !Array.isArray(this.levelsData?.packs) ||
        this.levelsData.packs.length === 0
      ) {
        throw new Error('levels.json の形式が正しくありません（v2 packs が必要）');
      }

      const map = legacyIdMap(this.levelsData);
      this.progress = loadProgressWithCatalog(this.levelsData, map);

      this.dragHandler.attach(this.dom.boardEl);
      this.bindEvents();
      this.paintPackSelect();
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
