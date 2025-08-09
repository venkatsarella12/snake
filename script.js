// script.js — Snake Arcade (UI + Game + Touch + AI + Sound)
// Complete single-file game logic

// === CONFIG & STATE ===
const CONFIG = {
  GRID_SIZE: 20,
  CANVAS_SIZE: 480,
  INITIAL_SPEED: 160,
  SPEED_INCREASE: 10,
  POINTS_PER_FOOD: 10,
  POINTS_PER_LEVEL: 100,
  POWERUP_SPAWN_FREQ: 12000,
  POWERUP_DURATION: 8000,
  POWERUP_TYPES: ['speed', 'bonus', 'slow']
};

const app = {
  view: 'home',
  elements: {},
  game: {
    canvas: null,
    ctx: null,
    snake: [],
    aiSnake: [],
    food: null,
    powerups: [],
    direction: { x: 0, y: 0 },
    score: 0,
    level: 1,
    highScore: 0,
    running: false,
    paused: false,
    mode: 'human', // 'human' | 'ai' | 'vs'
    speed: CONFIG.INITIAL_SPEED,
    loop: null,
    lastPowerupSpawn: 0,
    activePower: null,
    audioCtx: null,
    touchStart: null,
    touchLast: null,
    touchSensitivity: 40,
    aiDifficulty: 'normal',
    aiDirection: { x: 0, y: 0 }
  }
};

// DOM Selectors helpers
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  wireUI();
  loadSettings();
  setupCanvas();
  initGameState();
  showView('home');
  initMenuButtonAnimation();
});

function cacheElements() {
  app.elements.views = $all('.view') || [];
  app.elements.playView = $('.view-play');
  app.elements.homeView = $('.view-home');
  app.elements.settingsView = $('.view-settings');
  app.elements.toolsView = $('.view-tools');
  app.elements.sideMenu = $('#sideMenu');
  app.elements.btnMenu = $('#btnMenu');
  app.elements.closeMenu = $('#closeMenu');
  app.elements.menuItems = $all('.menu-item') || [];
  app.elements.playNow = $('#playNow');
  app.elements.openSettings = $('#openSettings');
  app.elements.openTools = $('#openTools');
  app.elements.playCanvas = $('#gameCanvas');
  app.elements.hudActive = $('#hudActive') || { textContent: '' };
  app.elements.touchDpad = $('#touchDpad');
  app.elements.pauseBtn = $('#pauseBtn') || { addEventListener: ()=>{}, textContent: 'Pause' };
  app.elements.resetBtn = $('#resetBtn');
  app.elements.gameStatus = $('#gameStatus') || { style: {}, querySelector: ()=>({ textContent: '' }) };
  app.elements.gameOverModal = $('#gameOverModal') || { classList: { add: ()=>{}, remove: ()=>{} }, setAttribute: ()=>{} };
  app.elements.gameOverScore = $('#gameOverScore') || { textContent: '' };
  app.elements.toggleTheme = $('#toggleTheme');
  app.elements.themeLight = $('#themeLight');
  app.elements.themeDark = $('#themeDark');
  app.elements.touchSensitivity = $('#touchSensitivity');
  app.elements.saveSettings = $('#saveSettings');
  app.elements.cancelSettings = $('#cancelSettings');
  app.elements.aiDifficulty = $('#aiDifficulty');
}

function wireUI() {
  // Menu
  app.elements.btnMenu?.addEventListener('click', openMenu);
  app.elements.closeMenu?.addEventListener('click', closeMenu);
  app.elements.menuItems.forEach(btn => {
    btn.addEventListener('click', e => {
      const nav = e.currentTarget.dataset.nav;
      if (nav) navigateTo(nav);
      if (e.currentTarget.id === 'menuRestart') restartGame();
      if (e.currentTarget.id === 'menuToggleTheme') toggleTheme();
      closeMenu();
    });
  });

  // Home view
  app.elements.playNow?.addEventListener('click', () => navigateTo('play', { start: true }));
  app.elements.openSettings?.addEventListener('click', () => navigateTo('settings'));
  app.elements.openTools?.addEventListener('click', () => navigateTo('tools'));

  // In-play controls
  app.elements.pauseBtn?.addEventListener('click', () => { if (app.game.running) togglePause(); });
  app.elements.resetBtn?.addEventListener('click', restartGame);

  // Theme buttons
  app.elements.toggleTheme?.addEventListener('click', toggleTheme);
  app.elements.themeLight?.addEventListener('click', () => setTheme('light'));
  app.elements.themeDark?.addEventListener('click', () => setTheme('dark'));

  // Settings buttons
  app.elements.saveSettings?.addEventListener('click', saveSettings);
  app.elements.cancelSettings?.addEventListener('click', () => navigateTo('home'));

  // D-pad
  app.elements.touchDpad?.querySelectorAll?.('[data-dir]')?.forEach(btn => {
    btn.addEventListener('touchstart', () => applyDirectionFromDpad(btn.dataset.dir));
  });

  // Touch / Mouse canvas control
  bindCanvasTouchAndMouse();

  // Keyboard
  document.addEventListener('keydown', e => {
    // Prevent key handling when not playing (except space to start)
    if (e.code === 'Space') {
      if (!app.game.running) startGame();
      else togglePause();
      e.preventDefault();
      return;
    }
    if (!app.game.running || app.game.paused) return;
    if (['ArrowUp','w','W'].includes(e.key)) setDirection(0, -1);
    if (['ArrowDown','s','S'].includes(e.key)) setDirection(0, 1);
    if (['ArrowLeft','a','A'].includes(e.key)) setDirection(-1, 0);
    if (['ArrowRight','d','D'].includes(e.key)) setDirection(1, 0);
    if (['r', 'R'].includes(e.key)) restartGame();
  });

  // Tools: Download and toggle sound
  $('#downloadScore')?.addEventListener('click', () => {
    const blob = new Blob([`Score:${app.game.score}\nHigh:${app.game.highScore}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'snake-score.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#toggleSounds')?.addEventListener('click', () => {
    if (app.game.audioCtx && app.game.audioCtx.state !== 'closed') {
      app.game.audioCtx.close();
      app.game.audioCtx = null;
      alert('Sounds toggled off');
    } else {
      ensureAudio();
      alert('Sounds toggled on');
    }
  });
}

function initMenuButtonAnimation() {
  const buttons = $all('.menu-btn') || [];
  buttons.forEach((btn, i) => {
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(20px)';
    setTimeout(() => {
      btn.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0)';
    }, i * 200);

    btn.addEventListener('click', function (e) {
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      this.append(ripple);
      const rect = this.getBoundingClientRect();
      ripple.style.left = `${(e.clientX || rect.left) - rect.left}px`;
      ripple.style.top = `${(e.clientY || rect.top) - rect.top}px`;
      setTimeout(() => ripple.remove(), 600);
    });
  });
}

// Theme, Nav, Menu
function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('snake_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}
function setTheme(mode) {
  document.body.classList.toggle('dark-mode', mode === 'dark');
  localStorage.setItem('snake_theme', mode);
}

function navigateTo(view, opts = {}) {
  (app.elements.views || []).forEach(v => {
    v.style.display = 'none';
    v.setAttribute('aria-hidden', 'true');
  });
  const target = $(`.view-${view}`);
  if (target) {
    target.style.display = 'block';
    target.setAttribute('aria-hidden', 'false');
  }
  app.view = view;
  if (view === 'play') {
    hideInterfaceChrome(true);
    if (opts.start) startGame();
  } else {
    hideInterfaceChrome(false);
    if (view === 'settings') loadSettingsIntoUI();
  }
}

function showView(viewName) {
  navigateTo(viewName);
}

function openMenu() {
  app.elements.sideMenu?.classList?.add('open');
  app.elements.sideMenu?.setAttribute?.('aria-hidden', 'false');
}
function closeMenu() {
  app.elements.sideMenu?.classList?.remove('open');
  app.elements.sideMenu?.setAttribute?.('aria-hidden', 'true');
}
function hideInterfaceChrome(hide) {
  $('.app-header')?.style && ($('.app-header').style.opacity = hide ? '0.12' : '1');
  $('.app-footer')?.style && ($('.app-footer').style.opacity = hide ? '0.12' : '1');
  const ipc = document.querySelector('.inplay-controls');
  if (ipc) ipc.style.display = hide ? 'flex' : 'none';
}

// Canvas Setup & Game Init
function setupCanvas() {
  const canvas = app.elements.playCanvas;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CONFIG.CANVAS_SIZE * dpr;
  canvas.height = CONFIG.CANVAS_SIZE * dpr;
  canvas.style.width = `${Math.min(CONFIG.CANVAS_SIZE, canvas.parentElement.clientWidth - 20)}px`;
  canvas.style.height = canvas.style.width;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.game.canvas = canvas;
  app.game.ctx = ctx;

  window.addEventListener('resize', () => {
    canvas.style.width = `${Math.min(CONFIG.CANVAS_SIZE, canvas.parentElement.clientWidth - 20)}px`;
    canvas.style.height = canvas.style.width;
    draw();
  });
}

function initGameState() {
  app.game.snake = [{ x: 10, y: 10 }];
  app.game.aiSnake = [];
  app.game.direction = { x: 0, y: 0 };
  app.game.score = 0;
  app.game.level = 1;
  app.game.speed = CONFIG.INITIAL_SPEED;
  loadHighScore();
  generateFood();
  draw();
}

function loadHighScore() {
  const hs = parseInt(localStorage.getItem('snakeHighScore'), 10);
  app.game.highScore = isNaN(hs) ? 0 : hs;
  updateUI();
}

// Touch & Mouse Controls
function bindCanvasTouchAndMouse() {
  const canvas = app.game.canvas;
  if (!canvas) return;
  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    app.game.touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    app.game.touchLast = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    const t = e.touches[0];
    app.game.touchLast = { x: t.clientX, y: t.clientY };
    const dx = t.clientX - app.game.touchStart.x;
    const dy = t.clientY - app.game.touchStart.y;
    const thresh = app.elements.touchSensitivity?.value
      ? parseInt(app.elements.touchSensitivity.value, 10)
      : app.game.touchSensitivity;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > thresh) {
      setDirection(dx > 0 ? 1 : -1, 0);
      app.game.touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > thresh) {
      setDirection(0, dy > 0 ? 1 : -1);
      app.game.touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }
  }, { passive: true });

  canvas.addEventListener('touchend', () => {
    if (!app.game.touchStart) return;
    const dx = (app.game.touchLast?.x || app.game.touchStart.x) - app.game.touchStart.x;
    const dy = (app.game.touchLast?.y || app.game.touchStart.y) - app.game.touchStart.y;
    const dt = Date.now() - app.game.touchStart.time;

    if (dt < 500 && (Math.abs(dx) > 30 || Math.abs(dy) > 30)) {
      if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 1 : -1, 0);
      else setDirection(0, dy > 0 ? 1 : -1);
    }
    app.game.touchStart = null;
    app.game.touchLast = null;
  }, { passive: true });

  let dragging = false;
  canvas.addEventListener('mousedown', e => {
    dragging = true;
    app.game.touchStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mousemove', e => {
    if (!dragging || !app.game.touchStart) return;
    const dx = e.clientX - app.game.touchStart.x, dy = e.clientY - app.game.touchStart.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
      setDirection(dx > 0 ? 1 : -1, 0);
      app.game.touchStart = { x: e.clientX, y: e.clientY };
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) {
      setDirection(0, dy > 0 ? 1 : -1);
      app.game.touchStart = { x: e.clientX, y: e.clientY };
    }
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    app.game.touchStart = null;
  });
}

function setDirection(x, y) {
  const cur = app.game.direction;
  // Prevent reversing into self when length > 1
  if (cur.x === -x && cur.y === -y && app.game.snake.length > 1) return;
  app.game.direction = { x, y };
}

function applyDirectionFromDpad(dir) {
  switch (dir) {
    case 'up': setDirection(0, -1); break;
    case 'down': setDirection(0, 1); break;
    case 'left': setDirection(-1, 0); break;
    case 'right': setDirection(1, 0); break;
  }
}

// Settings Persistence
function loadSettings() {
  const theme = localStorage.getItem('snake_theme') || 'light';
  setTheme(theme);

  const sens = parseInt(localStorage.getItem('snake_touch_sens'), 10);
  if (!isNaN(sens) && app.elements.touchSensitivity) {
    app.elements.touchSensitivity.value = sens;
    app.game.touchSensitivity = sens;
  }

  const ai = localStorage.getItem('snake_ai_diff') || 'normal';
  if (app.elements.aiDifficulty) {
    app.elements.aiDifficulty.value = ai;
    app.game.aiDifficulty = ai;
  }
}

function loadSettingsIntoUI() {
  loadSettings();
}

function saveSettings() {
  const sens = parseInt(app.elements.touchSensitivity.value, 10);
  if (!isNaN(sens)) {
    localStorage.setItem('snake_touch_sens', String(sens));
    app.game.touchSensitivity = sens;
  }

  const ai = app.elements.aiDifficulty?.value || 'normal';
  localStorage.setItem('snake_ai_diff', ai);
  app.game.aiDifficulty = ai;

  alert('Settings saved');
  navigateTo('home');
}

// Power-up Cleanup
setInterval(() => {
  const now = Date.now();
  app.game.powerups = app.game.powerups.filter(p => (now - p.createdAt) < 35000);
}, 5000);

// Audio Helpers
function ensureAudio() {
  try {
    if (!app.game.audioCtx) {
      app.game.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  } catch { /* ignore */ }
}

function playTone(freq, dur = 0.08, type = 'sine', when = 0, gain = 0.12) {
  try {
    ensureAudio();
    const ctx = app.game.audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = gain;
    o.start(ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
    o.stop(ctx.currentTime + when + dur + 0.02);
  } catch { }
}

function playBite() {
  playTone(900, 0.06, 'square', 0, 0.08);
  playTone(1400, 0.05, 'sawtooth', 0.02, 0.05);
}

function playCrash() {
  playTone(120, 0.35, 'sine', 0, 0.28);
}

// Game Logic (food, powerups, movement, collisions)
function generateFood() {
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  let pos;
  let attempts = 0;
  do {
    pos = {
      x: Math.floor(Math.random() * TILE_COUNT),
      y: Math.floor(Math.random() * TILE_COUNT)
    };
    attempts++;
    if (attempts > 1000) break;
  } while (
    isOnSnake(pos, app.game.snake) ||
    isOnSnake(pos, app.game.aiSnake) ||
    isPowerupAt(pos)
  );
  app.game.food = pos || { x: 0, y: 0 };
}

function isOnSnake(pos, snake) {
  if (!snake || !snake.length) return false;
  return snake.some(s => s.x === pos.x && s.y === pos.y);
}

function isPowerupAt(pos) {
  return app.game.powerups.some(p => p.x === pos.x && p.y === pos.y);
}

function spawnPowerupRandom() {
  const now = Date.now();
  if (now - app.game.lastPowerupSpawn < CONFIG.POWERUP_SPAWN_FREQ) return;
  // small random offset for variety
  app.game.lastPowerupSpawn = now + Math.floor(Math.random() * 4000);

  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  let pos, attempts = 0;
  do {
    pos = {
      x: Math.floor(Math.random() * TILE_COUNT),
      y: Math.floor(Math.random() * TILE_COUNT)
    };
    attempts++;
    if (attempts > 200) return;
  } while (
    isOnSnake(pos, app.game.snake) ||
    isOnSnake(pos, app.game.aiSnake) ||
    (app.game.food && pos.x === app.game.food.x && pos.y === app.game.food.y)
  );

  const r = Math.random();
  const type = r < 0.55 ? 'speed' : r < 0.85 ? 'slow' : 'bonus';
  app.game.powerups.push({ x: pos.x, y: pos.y, type, createdAt: now });
}

function moveSnake(snake, dir) {
  if (!dir || (dir.x === 0 && dir.y === 0)) return;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (snake.length > 1) {
    const second = snake[1];
    if (head.x === second.x && head.y === second.y) return;
  }
  snake.unshift(head);
  if (snake.foodEaten) {
    snake.foodEaten = false;
  } else {
    snake.pop();
  }
}

function eatFood(snake, isPlayer = false) {
  snake.foodEaten = true;
  if (isPlayer) {
    app.game.score += CONFIG.POINTS_PER_FOOD;
    playBite();
    const newLevel = Math.floor(app.game.score / CONFIG.POINTS_PER_LEVEL) + 1;
    if (newLevel > app.game.level) {
      app.game.level = newLevel;
      app.game.speed = Math.max(50, CONFIG.INITIAL_SPEED - (app.game.level * CONFIG.SPEED_INCREASE));
      restartLoop();
      playToneSequence([1100, 1400]);
    }
  } else {
    // AI gets smaller score (or none) — leave as no score
  }
  generateFood();
}

function playToneSequence(freqs) {
  let t = 0;
  freqs.forEach(f => {
    playTone(f, 0.06, 'sine', t, 0.09);
    t += 0.08;
  });
}

function checkPowerupCollision(snake, isPlayer = false) {
  if (!snake || !snake.length) return false;
  const head = snake[0];
  for (let i = 0; i < app.game.powerups.length; i++) {
    const p = app.game.powerups[i];
    if (head.x === p.x && head.y === p.y) {
      if (isPlayer) applyPowerup(p.type, isPlayer);
      app.game.powerups.splice(i, 1);
      return true;
    }
  }
  return false;
}

function applyPowerup(type, isPlayer) {
  if (!isPlayer) return;

  if (app.elements.hudActive) app.elements.hudActive.textContent = '';
  switch (type) {
    case 'bonus':
      app.game.score += 50;
      if (app.elements.hudActive) app.elements.hudActive.textContent = 'BONUS +50';
      playBite();
      break;
    case 'speed':
      if (app.elements.hudActive) app.elements.hudActive.textContent = '⚡ SPEED BOOST';
      activatePower('speed');
      playToneSequence([1000, 1400, 1800]);
      break;
    case 'slow':
      if (app.elements.hudActive) app.elements.hudActive.textContent = '🐌 SLOWED';
      activatePower('slow');
      playToneSequence([400, 320]);
      break;
  }
}

function activatePower(type) {
  if (app.game.activePower?.timer) {
    clearTimeout(app.game.activePower.timer);
  }

  if (type === 'speed') {
    app.game.speed = Math.max(45, app.game.speed - 60);
  } else if (type === 'slow') {
    app.game.speed += 80;
  }

  restartLoop();
  app.game.activePower = { type, expiresAt: Date.now() + CONFIG.POWERUP_DURATION };
  app.game.activePower.timer = setTimeout(() => {
    app.game.speed = Math.max(50, CONFIG.INITIAL_SPEED - (app.game.level * CONFIG.SPEED_INCREASE));
    restartLoop();
    app.game.activePower = null;
    if (app.elements.hudActive) app.elements.hudActive.textContent = '';
  }, CONFIG.POWERUP_DURATION);
}

function checkCollision(snake) {
  if (!snake || !snake.length) return false;
  const head = snake[0];
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;

  // Wall collisions
  if (head.x < 0 || head.y < 0 || head.x >= TILE_COUNT || head.y >= TILE_COUNT) {
    return true;
  }

  // Self-collision
  for (let i = 1; i < snake.length; i++) {
    if (head.x === snake[i].x && head.y === snake[i].y) return true;
  }
  return false;
}

function gameOver(winner) {
  clearInterval(app.game.loop);
  app.game.running = false;

  if (app.game.score > app.game.highScore) {
    app.game.highScore = app.game.score;
    localStorage.setItem('snakeHighScore', app.game.highScore);
  }

  if (app.elements.gameOverScore) app.elements.gameOverScore.textContent = String(app.game.score).padStart(6, '0');
  if (app.elements.gameOverModal) {
    app.elements.gameOverModal.classList.add('show');
    app.elements.gameOverModal.setAttribute('aria-hidden', 'false');
  }

  playCrash();
  updateUI();
}

function closeGameOver() {
  app.elements.gameOverModal?.classList?.remove('show');
  app.elements.gameOverModal?.setAttribute?.('aria-hidden', 'true');
  navigateTo('home');
}

function updateUI() {
  // Update HUD (score / level / highscore)
  const scoreEl = $('#score'); // optional element ids in HTML
  const levelEl = $('#level');
  const highEl = $('#highscore');
  if (scoreEl) scoreEl.textContent = String(app.game.score).padStart(6, '0');
  if (levelEl) levelEl.textContent = String(app.game.level);
  if (highEl) highEl.textContent = String(app.game.highScore);
}

// Canvas drawing
function draw() {
  const ctx = app.game.ctx;
  if (!ctx) return;
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  ctx.clearRect(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);

  // Background grid
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
  ctx.strokeStyle = 'rgba(0,80,0,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= TILE_COUNT; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CONFIG.GRID_SIZE, 0);
    ctx.lineTo(i * CONFIG.GRID_SIZE, CONFIG.CANVAS_SIZE);
    ctx.moveTo(0, i * CONFIG.GRID_SIZE);
    ctx.lineTo(CONFIG.CANVAS_SIZE, i * CONFIG.GRID_SIZE);
    ctx.stroke();
  }

  // Powerups
  app.game.powerups.forEach(drawPowerup);

  // Food
  const f = app.game.food;
  if (f) {
    ctx.save();
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(f.x * CONFIG.GRID_SIZE + 2, f.y * CONFIG.GRID_SIZE + 2, CONFIG.GRID_SIZE - 4, CONFIG.GRID_SIZE - 4);
    ctx.restore();
  }

  // AI snake if vs mode
  if (app.game.aiSnake.length > 0) drawSnake(app.game.aiSnake, '#c38cff', '#8b5ed8');
  drawSnake(app.game.snake, '#00b894', '#007c62');
}

function drawPowerup(p) {
  const ctx = app.game.ctx;
  const x = p.x * CONFIG.GRID_SIZE;
  const y = p.y * CONFIG.GRID_SIZE;
  ctx.save();
  switch (p.type) {
    case 'speed':
      ctx.shadowColor = '#fff3b0';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd166';
      break;
    case 'slow':
      ctx.shadowColor = '#cfefff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#66c9ff';
      break;
    case 'bonus':
      ctx.shadowColor = '#eec8ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffb3ff';
      break;
    default:
      ctx.fillStyle = '#fff';
  }
  ctx.fillRect(x + 2, y + 2, CONFIG.GRID_SIZE - 4, CONFIG.GRID_SIZE - 4);
  ctx.font = `${Math.max(12, Math.floor(CONFIG.GRID_SIZE / 1.6))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icon = p.type === 'speed' ? '⚡' : (p.type === 'slow' ? '🐌' : '💎');
  ctx.fillText(icon, x + CONFIG.GRID_SIZE / 2, y + CONFIG.GRID_SIZE / 2 + 1);
  ctx.restore();
}

function drawSnake(snake, headColor, bodyColor) {
  const ctx = app.game.ctx;
  if (!snake || !snake.length) return;
  snake.forEach((seg, i) => {
    const x = seg.x * CONFIG.GRID_SIZE;
    const y = seg.y * CONFIG.GRID_SIZE;
    if (i === 0) {
      ctx.save();
      ctx.shadowColor = headColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = headColor;
      ctx.fillRect(x + 1, y + 1, CONFIG.GRID_SIZE - 2, CONFIG.GRID_SIZE - 2);

      const eye = Math.max(2, Math.floor(CONFIG.GRID_SIZE / 6));
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 5, y + 6, eye, eye);
      ctx.fillRect(x + 5 + eye + 2, y + 6, eye, eye);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = bodyColor;
      ctx.shadowColor = bodyColor;
      ctx.shadowBlur = 3;
      ctx.fillRect(x + 1, y + 1, CONFIG.GRID_SIZE - 2, CONFIG.GRID_SIZE - 2);
      ctx.restore();
    }
  });
}

// Helpers for AI and movement
function restartLoop() {
  clearInterval(app.game.loop);
  if (app.game.running) {
    app.game.loop = setInterval(gameStep, app.game.speed);
  }
}

// AI Pathfinding (BFS) with greedy fallback
function aiNextMoveBFS(snake, goal) {
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  const blocked = new Set();

  // mark cells occupied by both snakes as blocked
  [...(app.game.snake || []), ...(app.game.aiSnake || [])].forEach(s => blocked.add(`${s.x},${s.y}`));
  // Also block snake's body (except head)
  (snake || []).slice(1).forEach(s => blocked.add(`${s.x},${s.y}`));

  const start = { x: snake[0].x, y: snake[0].y };
  const q = [{ x: start.x, y: start.y }];
  const visited = new Set([`${start.x},${start.y}`]);
  const parent = new Map();

  const dirs = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let destKey = null;

  while (q.length && destKey === null) {
    const cur = q.shift();
    for (const d of dirs) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= TILE_COUNT || ny >= TILE_COUNT) continue;
      if (visited.has(key)) continue;
      if (nx === goal.x && ny === goal.y) {
        parent.set(key, `${cur.x},${cur.y}`);
        destKey = key;
        break;
      }
      if (blocked.has(key)) continue;

      visited.add(key);
      parent.set(key, `${cur.x},${cur.y}`);
      q.push({ x: nx, y: ny });
    }
  }

  if (!destKey) return greedyFallback(snake, goal);

  // Reconstruct path from dest to start
  const path = [];
  let curKey = destKey;
  while (curKey && curKey !== `${start.x},${start.y}`) {
    const [px, py] = curKey.split(',').map(Number);
    path.unshift({ x: px, y: py });
    curKey = parent.get(curKey);
  }

  if (!path.length) return null;
  const next = path[0];
  return { x: next.x - start.x, y: next.y - start.y };
}

function greedyFallback(snake, food) {
  const head = snake[0];
  const moves = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let best = null, bestScore = -Infinity;

  for (const m of moves) {
    const np = { x: head.x + m.x, y: head.y + m.y };
    if (!isValidPos(np)) continue;

    const dist = Math.abs(np.x - food.x) + Math.abs(np.y - food.y);
    const center = (CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE) / 2;
    const proximityScore = -(Math.abs(np.x - center) + Math.abs(np.y - center)) * 0.1;
    const score = -dist + proximityScore;

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best || { x: 0, y: 0 };
}

function isValidPos(pos) {
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  if (pos.x < 0 || pos.y < 0 || pos.x >= TILE_COUNT || pos.y >= TILE_COUNT) return false;
  if (isOnSnake(pos, app.game.snake)) return false;
  if (isOnSnake(pos, app.game.aiSnake)) return false;
  return true;
}

// Game Loop
function gameStep() {
  if (!app.game.running || app.game.paused) return;
  spawnPowerupRandom();

  // Player movement (human or vs)
  if (app.game.mode === 'human' || app.game.mode === 'vs') {
    moveSnake(app.game.snake, app.game.direction);
  } else if (app.game.mode === 'ai') {
    const m = aiNextMoveBFS(app.game.snake, app.game.food);
    if (m) app.game.direction = m;
    moveSnake(app.game.snake, app.game.direction);
  }

  // AI snake actions in vs mode
  if (app.game.mode === 'vs' && app.game.aiSnake.length) {
    const aiMove = aiNextMoveBFS(app.game.aiSnake, app.game.food);
    if (aiMove) app.game.aiDirection = aiMove;
    moveSnake(app.game.aiSnake, app.game.aiDirection);
  }

  // Collisions
  if (checkCollision(app.game.snake)) {
    gameOver('AI');
    return;
  }

  if (app.game.mode === 'vs' && app.game.aiSnake.length) {
    if (checkCollision(app.game.aiSnake)) { gameOver('PLAYER'); return; }
    const pHead = app.game.snake[0], aHead = app.game.aiSnake[0];
    if (pHead.x === aHead.x && pHead.y === aHead.y) {
      if (app.game.snake.length > app.game.aiSnake.length) gameOver('PLAYER');
      else if (app.game.snake.length < app.game.aiSnake.length) gameOver('AI');
      else gameOver('TIE');
      return;
    }
  }

  // Food pickups
  const head = app.game.snake[0];
  if (app.game.food && head.x === app.game.food.x && head.y === app.game.food.y) eatFood(app.game.snake, true);

  if (app.game.aiSnake.length) {
    const aiHead = app.game.aiSnake[0];
    if (app.game.food && aiHead.x === app.game.food.x && aiHead.y === app.game.food.y) eatFood(app.game.aiSnake, false);
  }

  // Powerups
  checkPowerupCollision(app.game.snake, true);
  if (app.game.aiSnake.length) checkPowerupCollision(app.game.aiSnake, false);

  draw();
  updateUI();
}

// Game Controls
function startGame() {
  showView('play');
  startGameInternal();
}

function startGameInternal() {
  if (app.game.running && !app.game.paused) return;
  ensureAudio();

  app.game.snake = [{ x: 10, y: 10 }];
  app.game.aiSnake = app.game.mode === 'vs' ? [{ x: 15, y: 15 }] : [];
  app.game.direction = app.game.mode === 'ai' ? { x: 1, y: 0 } : { x: 0, y: 0 };
  app.game.aiDirection = { x: 0, y: 0 };

  app.game.score = 0;
  app.game.level = 1;
  app.game.speed = CONFIG.INITIAL_SPEED;
  app.game.running = true;
  app.game.paused = false;

  generateFood();
  app.game.powerups = [];
  app.game.lastPowerupSpawn = Date.now();
  if (app.elements.gameStatus) {
    app.elements.gameStatus.style.opacity = '0';
  }

  clearInterval(app.game.loop);
  app.game.loop = setInterval(gameStep, app.game.speed);
  draw();
  updateUI();
}

function togglePause() {
  if (!app.game.running) return;
  app.game.paused = !app.game.paused;
  if (app.elements.pauseBtn) app.elements.pauseBtn.textContent = app.game.paused ? 'Resume' : 'Pause';
  clearInterval(app.game.loop);
  if (!app.game.paused) {
    app.game.loop = setInterval(gameStep, app.game.speed);
  }
}

function restartGame() {
  clearInterval(app.game.loop);
  app.game.running = false;
  app.game.paused = false;
  app.game.snake = [{ x: 10, y: 10 }];
  app.game.aiSnake = [];
  app.game.direction = { x: 0, y: 0 };
  app.game.aiDirection = { x: 0, y: 0 };
  app.game.score = 0;
  app.game.level = 1;
  app.game.speed = CONFIG.INITIAL_SPEED;
  app.game.powerups = [];
  if (app.elements.hudActive) app.elements.hudActive.textContent = '';
  if (app.elements.gameStatus) {
    app.elements.gameStatus.style.opacity = '1';
    const st = app.elements.gameStatus.querySelector('.status-text');
    if (st) st.textContent = 'PRESS START TO BEGIN';
  }
  draw();
  updateUI();
}

// Expose globals for HTML onclicks
window.startGame = startGameInternal;
window.resetGame = restartGame;
window.closeGameOver = closeGameOver;
