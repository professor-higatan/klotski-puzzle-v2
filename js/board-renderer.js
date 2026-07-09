export function getCellSize(board) {
  const maxW = Math.min(window.innerWidth - 48, 400);
  const gap = board.gap_px;
  return Math.floor((maxW - gap * (board.cols + 1)) / board.cols);
}

export function getStepSize(board) {
  return getCellSize(board) + board.gap_px;
}

export function showBoardStatus(boardEl, message, isError = false) {
  boardEl.innerHTML = '';
  const status = document.createElement('p');
  status.id = 'board-status';
  status.className = 'board-status' + (isError ? ' error' : '');
  status.textContent = message;
  boardEl.appendChild(status);
}

export function renderBoard({ boardEl, config, pieces, dragHandler, skipIfDragging }) {
  if (!config) return;
  if (skipIfDragging && skipIfDragging()) return;

  const gap = config.board.gap_px;
  const cellSize = getCellSize(config.board);
  const { cols, rows } = config.board;

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
    dragHandler.setupPieceInteraction(el, p.id);
    boardEl.appendChild(el);
  }
}