// Dragon's Gambit - roguelike chess
const W = 1920;
const H = 1080;
const CELL = 110;
const BX = (W - CELL * 8) / 2;
const BY = (H - CELL * 8) / 2;
const DISPLAY = "'Cinzel Decorative', serif";
const BODY = "'Alegreya', serif";

const container = document.getElementById('game-container');
const canvas = document.createElement('canvas');
container.appendChild(canvas);
const ctx = canvas.getContext('2d');
let scale = 1;
let offX = 0;
let offY = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  scale = Math.min(cw / W, ch / H) * dpr;
  offX = (cw * dpr - W * scale) / 2;
  offY = (ch * dpr - H * scale) / 2;
}
window.addEventListener('resize', resize);
resize();

const bg = new Image();
bg.crossOrigin = 'anonymous';
bg.src = 'assets/dungeon-bg.webp';
const music = new Audio('assets/audio/dark-theme.mp3');
music.loop = true;
music.volume = 0.4;
const sfxMove = new Audio('assets/audio/piece-move.mp3');
const sfxCapture = new Audio('assets/audio/piece-capture.mp3');
function play(a) {
  a.currentTime = 0;
  a.play().catch(() => {});
}

// ---------- Pieces ----------
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', T: '♟', D: '♜' };
const NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn', T: 'Traitor', D: 'Dragon' };
const VALUE = { K: 100, Q: 9, R: 5, D: 8, B: 3, N: 3, P: 1, T: 1 };

function makePiece(type, side, home) {
  return { type, side, home, extra: new Set(), shield: false, hoard: new Set() };
}

function startingArmy() {
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const army = [];
  for (let c = 0; c < 8; c++) {
    army.push(makePiece(back[c], 'w', [7, c]));
    army.push(makePiece('P', 'w', [6, c]));
  }
  return army;
}

function enemyArmy(level) {
  const pool = ['P', 'P', 'N', 'B', 'R', 'Q'];
  const army = [makePiece('K', 'b', [0, 4])];
  const count = Math.min(15, 5 + level * 2);
  const spots = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 8; c++) {
      if (!(r === 0 && c === 4)) spots.push([r, c]);
    }
  }
  spots.sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    const max = Math.min(pool.length, 2 + level);
    const t = pool[Math.floor(Math.random() * max)];
    const p = makePiece(spots[i][0] === 1 && t !== 'N' ? 'P' : t, 'b', spots[i]);
    if (level >= 3 && Math.random() < 0.15 * level) p.shield = true;
    army.push(p);
  }
  return army;
}

// ---------- Move generation ----------
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function slide(board, p, r, c, dirs, out) {
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inside(nr, nc)) {
      const t = board[nr][nc];
      if (!t) {
        out.push([nr, nc]);
      } else {
        if (t.side !== p.side) out.push([nr, nc]);
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
}

function step(board, p, r, c, dirs, out) {
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (inside(nr, nc) && (!board[nr][nc] || board[nr][nc].side !== p.side)) out.push([nr, nc]);
  }
}

function pawnMoves(board, p, r, c, dir, out) {
  const nr = r + dir;
  if (inside(nr, c) && !board[nr][c]) {
    out.push([nr, c]);
    const startRow = p.side === 'w' ? (dir < 0 ? 6 : 1) : (dir > 0 ? 1 : 6);
    if (r === startRow && inside(nr + dir, c) && !board[nr + dir][c]) out.push([nr + dir, c]);
  }
  for (const dc of [-1, 1]) {
    const t = inside(nr, c + dc) && board[nr][c + dc];
    if (t && t.side !== p.side) out.push([nr, c + dc]);
  }
}

const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

function movesetFor(type, board, p, r, c, out) {
  const fwd = p.side === 'w' ? -1 : 1;
  if (type === 'P') pawnMoves(board, p, r, c, fwd, out);
  if (type === 'T') pawnMoves(board, p, r, c, -fwd, out);
  if (type === 'N') step(board, p, r, c, KNIGHT, out);
  if (type === 'B') slide(board, p, r, c, BISHOP, out);
  if (type === 'R' || type === 'D') slide(board, p, r, c, ROOK, out);
  if (type === 'Q') slide(board, p, r, c, [...ROOK, ...BISHOP], out);
  if (type === 'K') step(board, p, r, c, [...ROOK, ...BISHOP], out);
}

function legalMoves(board, r, c) {
  const p = board[r][c];
  const out = [];
  const types = new Set([p.type, ...p.extra, ...p.hoard]);
  for (const t of types) movesetFor(t, board, p, r, c, out);
  const seen = new Set();
  return out.filter(([a, b]) => {
    const k = a * 8 + b;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- Roguelike Map ----------
const MAP_ROWS = 8;
const MAP_COLS = 3;

let mapNodes = [];
let currentNode = null;
let mapFloor = 0;

const NODE_TYPES = [
  'battle',
  'battle',
  'battle',
  'elite',
  'shop',
  'treasure'
];

function generateMap() {
  mapNodes = [];
  mapFloor = 0;
  currentNode = null;

  for (let row = 0; row < MAP_ROWS; row++) {
    const count = row === 0 || row === MAP_ROWS - 1
      ? 1
      : 2 + Math.floor(Math.random() * 2);

    const positions = [];

    while (positions.length < count) {
      const col = Math.floor(Math.random() * MAP_COLS);
      if (!positions.includes(col)) positions.push(col);
    }

    positions.sort((a, b) => a - b);

    for (const col of positions) {
      const type = row === MAP_ROWS - 1
        ? 'boss'
        : row === 0
          ? 'start'
          : NODE_TYPES[Math.floor(Math.random() * NODE_TYPES.length)];

      mapNodes.push({
        id: `${row}-${col}`,
        row,
        col,
        type,
        visited: false,
        unlocked: row === 0,
        connections: []
      });
    }
  }

  // Connect every node to at least one node
  // on the following row.
  for (let row = 0; row < MAP_ROWS - 1; row++) {
    const current = mapNodes.filter(n => n.row === row);
    const next = mapNodes.filter(n => n.row === row + 1);

    for (const node of current) {
      const nearest = [...next].sort(
        (a, b) =>
          Math.abs(a.col - node.col) -
          Math.abs(b.col - node.col)
      );

      const target = nearest[0];
      if (target) node.connections.push(target.id);
    }

    for (const node of next) {
      const nearest = [...current].sort(
        (a, b) =>
          Math.abs(a.col - node.col) -
          Math.abs(b.col - node.col)
      );

      const source = nearest[0];
      if (source && !source.connections.includes(node.id)) {
        source.connections.push(node.id);
      }
    }
  }
}

// ---------- State ----------
let state = 'title';
let level = 1;
let army = startingArmy();
let board = [];
let selected = null;
let moves = [];
let turn = 'w';
let particles = [];
let pops = [];
let log = 'Capture the enemy King!';
let rewards = [];
let pendingReward = null;
let aiTimer = 0;
let hover = null;

function setupBattle() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const p of army) board[p.home[0]][p.home[1]] = p;
  for (const p of enemyArmy(level)) board[p.home[0]][p.home[1]] = p;
  turn = 'w';
  selected = null;
  moves = [];
  log = `Battle ${level}: capture the enemy King!`;
  state = 'battle';
}

function cellCenter(r, c) {
  return [BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2];
}

function burst(r, c, color) {
  const [x, y] = cellCenter(r, c);
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 3 + Math.random() * 7;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
  }
}

function pop(r, c, text, color) {
  const [x, y] = cellCenter(r, c);
  pops.push({ x, y, text, color, t: 0 });
}

function doMove(fr, fc, tr, tc) {
  const p = board[fr][fc];
  const target = board[tr][tc];
  if (target && target.shield) {
    target.shield = false;
    burst(tr, tc, '#7cf');
    pop(tr, tc, 'Shield broke!', '#7cf');
    play(sfxCapture);
    return;
  }
  board[tr][tc] = p;
  board[fr][fc] = null;
  if (target) {
    play(sfxCapture);
    burst(tr, tc, p.side === 'w' ? '#ffc04a' : '#b04aff');
    if (p.type === 'D' && target.type !== 'K') {
      const gained = target.type === 'T' ? 'P' : target.type;
      if (!p.hoard.has(gained) && gained !== 'R') {
        p.hoard.add(gained);
        pop(tr, tc, `Hoard: +${NAMES[gained]}`, '#ff6a2a');
      }
      for (const t of target.extra) p.hoard.add(t);
      for (const t of target.hoard) p.hoard.add(t);
    } else {
      pop(tr, tc, `+${VALUE[target.type]}`, '#ffd76a');
    }
    if (target.type === 'K') {
      endBattle(target.side === 'b');
      return;
    }
  } else {
    play(sfxMove);
  }
  // Promotions
  if (p.type === 'P' && ((p.side === 'w' && tr === 0) || (p.side === 'b' && tr === 7))) {
    p.type = 'Q';
    pop(tr, tc, 'Queen!', '#fff');
  }
  if (p.type === 'T' && p.side === 'w' && tr === 7) {
    p.type = 'D';
    burst(tr, tc, '#ff4a1a');
    pop(tr, tc, 'DRAGON AWAKENS!', '#ff6a2a');
    log = 'The Traitor became a Dragon! Hoard: it gains the moves of every piece it captures.';
  }
}

function endBattle(won) {
  if (!won) {
    state = 'lost';
    return;
  }
  // Surviving player pieces keep their home squares
  army = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.side === 'w') army.push(p);
    }
  }
  level++;
  rollRewards();
  state = 'reward';
}

const REWARD_POOL = [
  { id: 'traitor', name: 'Turncoat', desc: 'Turn a Pawn into a Traitor (moves backward; reaching your back rank makes it a Dragon).', ok: p => p.type === 'P' },
  { id: 'knight', name: "Knight's Leap", desc: 'Piece also gains Knight moves.', ok: p => p.type !== 'K' && p.type !== 'N' },
  { id: 'bishop', name: "Bishop's Sight", desc: 'Piece also gains Bishop moves.', ok: p => p.type !== 'K' && p.type !== 'B' && p.type !== 'Q' },
  { id: 'rook', name: "Rook's Reach", desc: 'Piece also gains Rook moves.', ok: p => !['K', 'R', 'Q', 'D'].includes(p.type) },
  { id: 'shield', name: 'Aegis', desc: 'Piece survives one capture.', ok: p => !p.shield },
  { id: 'recruit', name: 'Recruit', desc: 'Restore a lost piece to an empty home square.', ok: null },
  { id: 'change', name: 'Transmute', desc: 'Change a Pawn into a Knight or Bishop at random.', ok: p => p.type === 'P' || p.type === 'T' }
];

function rollRewards() {
  const pool = [...REWARD_POOL].sort(() => Math.random() - 0.5);
  rewards = pool.slice(0, 3);
  if (level === 2 && !rewards.some(r => r.id === 'traitor')) rewards[0] = REWARD_POOL[0];
  pendingReward = null;
}

function applyReward(rw, p) {
  if (rw.id === 'traitor') p.type = 'T';
  if (rw.id === 'knight') p.extra.add('N');
  if (rw.id === 'bishop') p.extra.add('B');
  if (rw.id === 'rook') p.extra.add('R');
  if (rw.id === 'shield') p.shield = true;
  if (rw.id === 'change') p.type = Math.random() < 0.5 ? 'N' : 'B';
}

function recruit() {
  const taken = new Set(army.map(p => p.home[0] * 8 + p.home[1]));
  const base = startingArmy().filter(p => !taken.has(p.home[0] * 8 + p.home[1]));
  if (base.length) army.push(base.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0]);
}

// ---------- AI ----------
function aiMove() {
  let best = null;
  let bestScore = -Infinity;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.side !== 'b') continue;
      for (const [tr, tc] of legalMoves(board, r, c)) {
        const t = board[tr][tc];
        let s = Math.random() * 0.8 + (t ? VALUE[t.type] * 10 - VALUE[p.type] : 0);
        if (p.type === 'P') s += 0.3;
        if (isAttackedByWhite(tr, tc) && level > 1) s -= VALUE[p.type] * 5;
        if (s > bestScore) {
          bestScore = s;
          best = [r, c, tr, tc];
        }
      }
    }
  }
  if (!best) {
    endBattle(true);
    return;
  }
  doMove(...best);
  if (state === 'battle') turn = 'w';
}

function isAttackedByWhite(r, c) {
  for (let a = 0; a < 8; a++) {
    for (let b = 0; b < 8; b++) {
      const p = board[a][b];
      if (p && p.side === 'w' && legalMoves(board, a, b).some(m => m[0] === r && m[1] === c)) return true;
    }
  }
  return false;
}

function unlockNextNodes(node) {
  for (const id of node.connections) {
    const next = mapNodes.find(n => n.id === id);
    if (next) next.unlocked = true;
  }
}

function enterMap() {
  state = 'map';
}

function selectMapNode(x, y) {
  for (const node of mapNodes) {
    if (!node.unlocked || node.visited || node.type === 'start') continue;

    const [nx, ny] = mapPosition(node);

    if (Math.hypot(x - nx, y - ny) < 40) {
      node.visited = true;
      currentNode = node;
      mapFloor = node.row;

      unlockNextNodes(node);

      // For now, all encounters lead to battle.
      setupBattle();
      return;
    }
  }
}

// ---------- Input ----------
function toDesign(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  return [((e.clientX - rect.left) * dpr - offX) / scale, ((e.clientY - rect.top) * dpr - offY) / scale];
}

function toCell(x, y) {
  const c = Math.floor((x - BX) / CELL);
  const r = Math.floor((y - BY) / CELL);
  return inside(r, c) ? [r, c] : null;
}

const rewardRect = i => [W / 2 - 600 + i * 420, 330, 360, 260];

canvas.addEventListener('mousemove', e => {
  const [x, y] = toDesign(e);
  hover = { x, y };
});

canvas.addEventListener('mousedown', e => {
  music.play().catch(() => {});
  const [x, y] = toDesign(e);
 
if (state === 'title' || state === 'lost') {
  level = 1;
  army = startingArmy();

  generateMap();

  const startNode = mapNodes.find(n => n.type === 'start');
  if (startNode) {
    startNode.visited = true;
    unlockNextNodes(startNode);
  }

  enterMap();
  return;
}

if (state === 'map') {
  selectMapNode(x, y);
  return;
}

  if (state === 'reward') {
    handleRewardClick(x, y);
    return;
  }
  if (state !== 'battle' || turn !== 'w') return;
  const cell = toCell(x, y);
  if (!cell) return;
  const [r, c] = cell;
  if (selected && moves.some(m => m[0] === r && m[1] === c)) {
    doMove(selected[0], selected[1], r, c);
    selected = null;
    moves = [];
    if (state === 'battle') {
      turn = 'b';
      aiTimer = 0.5;
    }
    return;
  }
  const p = board[r][c];
  if (p && p.side === 'w') {
    selected = [r, c];
    moves = legalMoves(board, r, c);
  } else {
    selected = null;
    moves = [];
  }
});

function handleRewardClick(x, y) {
  if (!pendingReward) {
    rewards.forEach((rw, i) => {
      const [rx, ry, rw2, rh] = rewardRect(i);
      if (x > rx && x < rx + rw2 && y > ry && y < ry + rh) {
        if (rw.id === 'recruit') {
          recruit();
          setupBattle();
        } else if (army.some(rw.ok)) {
          pendingReward = rw;
        }
      }
    });
    if (y > 900 && y < 980 && x > W / 2 - 150 && x < W / 2 + 150) setupBattle();
    return;
  }
  const p = armyAt(x, y);
  if (p && pendingReward.ok(p)) {
    applyReward(pendingReward, p);
    setupBattle();
  }
}

function armyAt(x, y) {
  const cell = toCell(x, y);
  if (!cell) return null;
  return army.find(p => p.home[0] === cell[0] && p.home[1] === cell[1]) || null;
}

// ---------- Rendering ----------

const NODE_SYMBOLS = {
  start: '⚑',
  battle: '⚔',
  elite: '☠',
  shop: '$',
  treasure: '✦',
  boss: '♛'
};

function mapPosition(node) {
  return [
    W / 2 + (node.col - 1) * 420,
    160 + node.row * 110
  ];
}

function drawMap() {
  ctx.fillStyle = 'rgba(8,5,15,0.94)';
  ctx.fillRect(0, 0, W, H);

  text('THE DESCENT', W / 2, 65, 65, '#ffd76a', DISPLAY);
  text('Choose your next destination', W / 2, 120, 27, '#d9c8ff');

  // Draw connecting paths
  for (const node of mapNodes) {
    const [x, y] = mapPosition(node);

    for (const id of node.connections) {
      const target = mapNodes.find(n => n.id === id);
      if (!target) continue;

      const [tx, ty] = mapPosition(target);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = node.visited
        ? '#c9a24a'
        : '#51415e';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }

  // Draw encounter nodes
  for (const node of mapNodes) {
    const [x, y] = mapPosition(node);

    ctx.beginPath();
    ctx.arc(x, y,  34, 0, Math.PI * 2);

    ctx.fillStyle = node.visited
      ? '#72562a'
      : node.unlocked
        ? '#49315f'
        : '#211b2b';

    ctx.fill();

    ctx.strokeStyle = node.unlocked
      ? '#ffd76a'
      : '#62516c';

    ctx.lineWidth = 4;
    ctx.stroke();

    text(
      NODE_SYMBOLS[node.type],
      x,
      y,
       thirty,
      node.unlocked ? '#fff0c0' : '#82758e',
      DISPLAY
    );

    if (node.visited) {
      text('✓', x + 25, y - 25, 22, '#8dff9a');
    }
  }

  text('BATTLE  ⚔     ELITE  ☠     SHOP  $     TREASURE  ✦',
    W / 2, 1040, 22, '#d9c8ff');
}

function drawPiece(p, x, y, size) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.38, size * 0.32, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.shield) {
    ctx.strokeStyle = 'rgba(120,200,255,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  ctx.font = `${size * 0.78}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(x, y);
  if (p.type === 'T') ctx.rotate(Math.PI);
  const white = p.side === 'w';
  let fill = white ? '#f3e6c8' : '#2a1838';
  if (p.type === 'D') fill = '#ff5a1e';
  if (p.type === 'T') fill = '#9c7';
  ctx.lineWidth = 5;
  ctx.strokeStyle = white ? '#3a2410' : '#c79bff';
  ctx.strokeText(GLYPH[p.type], 0, 4);
  ctx.fillStyle = fill;
  ctx.fillText(GLYPH[p.type], 0, 4);
  ctx.restore();
  const tags = [...p.extra, ...p.hoard];
  if (tags.length) {
    ctx.font = `bold 18px ${BODY}`;
    ctx.fillStyle = p.type === 'D' ? '#ffb070' : '#ffd76a';
    ctx.textAlign = 'center';
    ctx.fillText('+' + tags.join(''), x, y - size * 0.36);
  }
}

function drawBoard(pieceList) {
  ctx.fillStyle = 'rgba(10,5,18,0.7)';
  ctx.fillRect(BX - 20, BY - 20, CELL * 8 + 40, CELL * 8 + 40);
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 4;
  ctx.strokeRect(BX - 20, BY - 20, CELL * 8 + 40, CELL * 8 + 40);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#3b2a4f' : '#8b7a9e';
      ctx.fillRect(BX + c * CELL, BY + r * CELL, CELL, CELL);
    }
  }
  if (selected) {
    ctx.fillStyle = 'rgba(255,200,80,0.45)';
    ctx.fillRect(BX + selected[1] * CELL, BY + selected[0] * CELL, CELL, CELL);
  }
  for (const [r, c] of moves) {
    const [x, y] = cellCenter(r, c);
    ctx.fillStyle = board[r][c] ? 'rgba(255,80,60,0.6)' : 'rgba(255,215,106,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, board[r][c] ? 46 : 16, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [p, r, c] of pieceList) {
    const [x, y] = cellCenter(r, c);
    drawPiece(p, x, y, CELL);
  }
}

function boardPieces() {
  const list = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]) list.push([board[r][c], r, c]);
    }
  }
  return list;
}

function text(str, x, y, size, color, font = BODY, align = 'center') {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function wrap(str, x, y, maxW, size, color) {
  ctx.font = `${size}px ${BODY}`;
  const words = str.split(' ');
  let line = '';
  for (const w of words) {
    if (ctx.measureText(line + w).width > maxW) {
      text(line, x, y, size, color);
      line = '';
      y += size * 1.2;
    }
    line += w + ' ';
  }
  text(line, x, y, size, color);
}

function drawInfoPanel() {
  ctx.fillStyle = 'rgba(15,8,25,0.85)';
  ctx.fillRect(40, 120, 400, 840);
  ctx.strokeStyle = '#c9a24a';
  ctx.strokeRect(40, 120, 400, 840);
  text(`Battle ${level}`, 240, 170, 40, '#ffd76a', DISPLAY);
  text(turn === 'w' ? 'Your move' : 'Enemy thinking...', 240, 230, 28, '#f3e6c8');
  wrap(log, 240, 300, 360, 24, '#d9c8ff');
  let p = selected ? board[selected[0]][selected[1]] : null;
  if (p) {
    text(NAMES[p.type], 240, 450, 36, '#ffd76a', DISPLAY);
    const extra = [...p.extra, ...p.hoard].map(t => NAMES[t]).join(', ');
    if (extra) wrap('Also moves as: ' + extra, 240, 500, 360, 22, '#f3e6c8');
    if (p.type === 'T') wrap('Moves backward. Reach your back rank to become a Dragon!', 240, 570, 360, 22, '#9c7');
    if (p.type === 'D') wrap('Hoard: gains the moves of each piece it captures.', 240, 570, 360, 22, '#ff8a4a');
  }
  wrap('Click a piece, then a highlighted square. Capture the enemy King to win.', 240, 860, 360, 20, '#a090b8');
}

function drawReward() {
  text('Spoils of Victory', W / 2, 180, 72, '#ffd76a', DISPLAY);
  if (!pendingReward) {
    text('Choose one blessing', W / 2, 260, 30, '#f3e6c8');
    rewards.forEach((rw, i) => {
      const [x, y, w, h] = rewardRect(i);
      const hot = hover && hover.x > x && hover.x < x + w && hover.y > y && hover.y < y + h;
      ctx.fillStyle = hot ? 'rgba(70,40,100,0.95)' : 'rgba(25,12,40,0.92)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      text(rw.name, x + w / 2, y + 50, 30, '#ffd76a', DISPLAY);
      wrap(rw.desc, x + w / 2, y + 120, w - 40, 24, '#f3e6c8');
    });
    ctx.fillStyle = 'rgba(25,12,40,0.92)';
    ctx.fillRect(W / 2 - 150, 900, 300, 80);
    text('Skip', W / 2, 940, 32, '#a090b8', DISPLAY);
  } else {
    text(`${pendingReward.name}: click a glowing piece`, W / 2, 80, 32, '#f3e6c8');
    for (const p of army) {
      if (pendingReward.ok(p)) {
        ctx.fillStyle = 'rgba(255,215,106,0.35)';
        ctx.fillRect(BX + p.home[1] * CELL, BY + p.home[0] * CELL, CELL, CELL);
      }
    }
  }
}

function drawEffects(dt) {
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt * 1.5;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
  }
  ctx.globalAlpha = 1;
  pops = pops.filter(p => p.t < 1);
  for (const p of pops) {
    p.t += dt * 0.8;
    const e = 1 - (1 - p.t) ** 3;
    ctx.globalAlpha = 1 - p.t;
    text(p.text, p.x, p.y - 30 - e * 70, 34, p.color, DISPLAY);
  }
  ctx.globalAlpha = 1;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'battle' && turn === 'b') {
    aiTimer -= dt;
    if (aiTimer <= 0) aiMove();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, W, H);
  if (state === 'title') {
    text("Dragon's Gambit", W / 2, 380, 110, '#ffd76a', DISPLAY);
    text('A roguelike chess descent', W / 2, 500, 40, '#d9c8ff');
    text('Win battles, earn blessings, forge Traitors into Dragons.', W / 2, 580, 30, '#f3e6c8');
    text('Click to begin', W / 2, 720, 44, '#fff', DISPLAY);
  }
else if (state === 'map') {
  drawMap();
}
 else if (state === 'battle') {
    drawBoard(boardPieces());
    drawInfoPanel();
  } else if (state === 'reward') {
    board = Array.from({ length: 8 }, () => Array(8).fill(null));
    selected = null;
    moves = [];
    if (pendingReward) drawBoard(army.map(p => [p, p.home[0], p.home[1]]));
    drawReward();
  } else if (state === 'lost') {
    drawBoard(boardPieces());
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    text('Your King Has Fallen', W / 2, 440, 90, '#ff5a4a', DISPLAY);
    text(`You reached battle ${level}`, W / 2, 560, 40, '#f3e6c8');
    text('Click to start a new run', W / 2, 660, 36, '#ffd76a');
  }
  drawEffects(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
