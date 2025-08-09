// script.js — Snake Arcade (UI + game + touch + BFS AI + sound)

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
  POWERUP_TYPES: ['speed','bonus','slow']
};

const app = {
  view: 'home',
  elements: {},
  game: {
    canvas:null, ctx:null,
    snake:[{x:10,y:10}], aiSnake:[], food:{x:15,y:15}, powerups:[],
    direction:{x:0,y:0}, score:0, level:1, highScore:0,
    running:false, paused:false, mode:'human', speed:CONFIG.INITIAL_SPEED, loop:null,
    lastPowerupSpawn:0, activePower:null, audioCtx:null,
    touchStart:null, touchLast:null, touchSensitivity:40, aiDifficulty:'normal'
  }
};

// === DOM Shortcuts ===
function $(sel){ return document.querySelector(sel) }
function $all(sel){ return Array.from(document.querySelectorAll(sel)) }

// === UI Initialization ===
document.addEventListener('DOMContentLoaded', ()=> {
  cacheElements();
  wireUI();
  loadSettings();
  setupCanvas();
  initGameState();
  showView('home');
});

/* cache DOM nodes */
function cacheElements(){
  app.elements.views = $all('.view');
  app.elements.playView = $('.view-play');
  app.elements.homeView = $('.view-home');
  app.elements.settingsView = $('.view-settings');
  app.elements.toolsView = $('.view-tools');
  app.elements.sideMenu = $('#sideMenu');
  app.elements.btnMenu = $('#btnMenu');
  app.elements.closeMenu = $('#closeMenu');
  app.elements.menuItems = $all('.menu-item');
  app.elements.playNow = $('#playNow');
  app.elements.openSettings = $('#openSettings');
  app.elements.openTools = $('#openTools');
  app.elements.playCanvas = $('#gameCanvas');
  app.elements.hudActive = $('#hudActive') || document.getElementById('hudActive');
  app.elements.touchDpad = $('#touchDpad');
  app.elements.pauseBtn = $('#pauseBtn');
  app.elements.resetBtn = $('#resetBtn');
  app.elements.gameStatus = $('#gameStatus');
  app.elements.gameOverModal = $('#gameOverModal');
  app.elements.gameOverScore = $('#gameOverScore');
  app.elements.toggleTheme = $('#toggleTheme');
  app.elements.themeLight = $('#themeLight');
  app.elements.themeDark = $('#themeDark');
  app.elements.touchSensitivity = $('#touchSensitivity');
  app.elements.saveSettings = $('#saveSettings');
  app.elements.cancelSettings = $('#cancelSettings');
  app.elements.aiDifficulty = $('#aiDifficulty');
  app.elements.playButton = $('#playNow');
}

// === Home Screen Button Animation ===
document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".menu-btn");
    buttons.forEach((btn, index) => {
        btn.style.opacity = "0";
        btn.style.transform = "translateY(20px)";
        setTimeout(() => {
            btn.style.transition = "opacity 0.5s ease, transform 0.5s ease";
            btn.style.opacity = "1";
            btn.style.transform = "translateY(0)";
        }, 200 * index); // Staggered animation
    });

    // Add ripple effect to buttons
    buttons.forEach(btn => {
        btn.addEventListener("click", function (e) {
            const ripple = document.createElement("span");
            ripple.classList.add("ripple");
            this.appendChild(ripple);

            let x = e.clientX - e.target.getBoundingClientRect().left;
            let y = e.clientY - e.target.getBoundingClientRect().top;

            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;

            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
});
/* Wire UI events */
function wireUI(){
  // Menu toggles
  app.elements.btnMenu.addEventListener('click', openMenu);
  app.elements.closeMenu.addEventListener('click', closeMenu);
  app.elements.menuItems.forEach(btn=> btn.addEventListener('click', (e)=> {
    const nav = e.currentTarget.dataset.nav;
    if (nav) navigateTo(nav);
    // special IDs
    if (e.currentTarget.id === 'menuRestart') restartGame();
    if (e.currentTarget.id === 'menuToggleTheme') toggleTheme();
    closeMenu();
  }));

  // Home actions
  app.elements.playNow.addEventListener('click', ()=> navigateTo('play', {start:true}));
  app.elements.openSettings.addEventListener('click', ()=> navigateTo('settings'));
  app.elements.openTools.addEventListener('click', ()=> navigateTo('tools'));

  // In-play controls (also exists as top buttons)
  app.elements.pauseBtn.addEventListener('click', ()=> {
    if (!app.game.running) return;
    togglePause();
  });
  app.elements.resetBtn.addEventListener('click', ()=> restartGame());

  // Settings
  app.elements.toggleTheme.addEventListener('click', toggleTheme);
  app.elements.themeLight.addEventListener('click', ()=> setTheme('light'));
  app.elements.themeDark.addEventListener('click', ()=> setTheme('dark'));
  app.elements.saveSettings.addEventListener('click', saveSettings);
  app.elements.cancelSettings.addEventListener('click', ()=> navigateTo('home'));

  // touch dpad buttons
  if (app.elements.touchDpad) {
    app.elements.touchDpad.querySelectorAll('[data-dir]').forEach(btn=>{
      btn.addEventListener('touchstart', (e)=> {
        const dir = e.currentTarget.dataset.dir;
        applyDirectionFromDpad(dir);
      });
    });
  }

  // touch/drag on canvas
  bindCanvasTouchAndMouse();

  // keyboard
  document.addEventListener('keydown', (e)=> {
    if (!app.game.running || app.game.paused) return;
    if (['ArrowUp','w','W'].includes(e.key)) setDirection(0,-1);
    if (['ArrowDown','s','S'].includes(e.key)) setDirection(0,1);
    if (['ArrowLeft','a','A'].includes(e.key)) setDirection(-1,0);
    if (['ArrowRight','d','D'].includes(e.key)) setDirection(1,0);
    if (e.code === 'Space') {
      if (!app.game.running) startGame();
      else togglePause();
    }
    if (e.key === 'r' || e.key === 'R') restartGame();
  });

  // small tools (download score)
  $('#downloadScore')?.addEventListener('click', ()=> {
    const blob = new Blob([`Score:${app.game.score}\nHigh:${app.game.highScore}`], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'snake-score.txt'; a.click(); URL.revokeObjectURL(url);
  });

  $('#toggleSounds')?.addEventListener('click', ()=> {
    if (app.game.audioCtx && app.game.audioCtx.state !== 'closed') { app.game.audioCtx.close(); app.game.audioCtx = null; alert('Sounds toggled off'); }
    else { ensureAudio(); alert('Sounds toggled on'); }
  });
}

/* Theme */
function toggleTheme(){ document.body.classList.toggle('dark-mode'); localStorage.setItem('snake_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); }
function setTheme(t){ if (t==='dark') document.body.classList.add('dark-mode'); else document.body.classList.remove('dark-mode'); localStorage.setItem('snake_theme', t); }

/* navigation */
function navigateTo(view, options = {}) {
  // hide all views, show target
  app.elements.views.forEach(v => { v.style.display = 'none'; v.setAttribute('aria-hidden','true'); });
  const target = document.querySelector(`.view-${view}`);
  if (target) { target.style.display = 'block'; target.setAttribute('aria-hidden','false'); }
  app.view = view;
  // if play requested to start
  if (view === 'play') {
    // when entering play, show minimal chrome only
    hideInterfaceChrome(true);
    if (options.start) startGame();
  } else {
    hideInterfaceChrome(false);
    if (view === 'settings') loadSettingsIntoUI();
  }
}

/* show/hide chrome (except hamburger) */
function hideInterfaceChrome(hide) {
  // reduce header/footer except hamburger
  if (hide) {
    document.querySelector('.app-header').style.opacity = '0.08';
    document.querySelector('.app-footer').style.opacity = '0.08';
    // show in-play small buttons
    document.querySelector('.inplay-controls').style.display = 'flex';
  } else {
    document.querySelector('.app-header').style.opacity = '1';
    document.querySelector('.app-footer').style.opacity = '1';
    document.querySelector('.inplay-controls').style.display = 'none';
  }
}

/* menu open/close */
function openMenu(){ app.elements.sideMenu.classList.add('open'); app.elements.sideMenu.setAttribute('aria-hidden','false'); }
function closeMenu(){ app.elements.sideMenu.classList.remove('open'); app.elements.sideMenu.setAttribute('aria-hidden','true'); }

/* show a view by name quickly */
function showView(name){ navigateTo(name); }

// === Canvas & Game setup ===
function setupCanvas(){
  app.game.canvas = app.elements.playCanvas;
  if (!app.game.canvas) return;
  const dpr = window.devicePixelRatio || 1;
  app.game.canvas.width = CONFIG.CANVAS_SIZE * dpr;
  app.game.canvas.height = CONFIG.CANVAS_SIZE * dpr;
  app.game.canvas.style.width = Math.min(CONFIG.CANVAS_SIZE, app.game.canvas.parentElement.clientWidth - 20) + 'px';
  app.game.canvas.style.height = app.game.canvas.style.width;
  app.game.ctx = app.game.canvas.getContext('2d');
  app.game.ctx.setTransform(dpr,0,0,dpr,0,0);
  window.addEventListener('resize', ()=> {
    // scale canvas on resize
    app.game.canvas.style.width = Math.min(CONFIG.CANVAS_SIZE, app.game.canvas.parentElement.clientWidth - 20) + 'px';
    app.game.canvas.style.height = app.game.canvas.style.width;
    draw();
  });
}

/* initial game state */
function initGameState(){
  app.game.snake = [{x:10,y:10}];
  app.game.aiSnake = [];
  app.game.direction = {x:0,y:0};
  app.game.score = 0; app.game.level = 1; app.game.speed = CONFIG.INITIAL_SPEED;
  loadHighScore();
  generateFood();
  draw();
}

/* storage */
function loadHighScore(){ app.game.highScore = parseInt(localStorage.getItem('snakeHighScore') || '0',10) || 0; updateUI(); }

// === GAME LOGIC (integrated from previous) ===

// audio helpers
function ensureAudio(){
  try {
    if (!app.game.audioCtx) app.game.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e){}
}
function playTone(freq, dur=0.08, type='sine', when=0, gain=0.12){
  try {
    ensureAudio();
    const ctx = app.game.audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = gain;
    o.start(ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
    o.stop(ctx.currentTime + when + dur + 0.02);
  } catch(e){}
}
function playBite(){ playTone(900,0.07,'square',0,0.07); playTone(1400,0.06,'sawtooth',0.02,0.05); }
function playCrash(){ playTone(120,0.35,'sine',0,0.28); playTone(60,0.25,'sine',0.05,0.24); }
function playLevelUp(){ playTone(1100,0.12,'sine',0,0.12); playTone(1400,0.12,'sine',0.12,0.12); }

// spawn food
function generateFood(){
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  let newFood;
  do {
    newFood = {x: Math.floor(Math.random()*TILE_COUNT), y:Math.floor(Math.random()*TILE_COUNT)};
  } while (isOnSnake(newFood, app.game.snake) || isOnSnake(newFood, app.game.aiSnake) || isPowerupAt(newFood));
  app.game.food = newFood;
}

// power-ups spawn
function spawnPowerupRandom(){
  const now = Date.now();
  if (now - app.game.lastPowerupSpawn < CONFIG.POWERUP_SPAWN_FREQ) return;
  app.game.lastPowerupSpawn = now + Math.floor(Math.random()*4000);
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  let pos, attempts=0;
  do {
    pos = {x:Math.floor(Math.random()*TILE_COUNT), y:Math.floor(Math.random()*TILE_COUNT)};
    attempts++; if (attempts>200) return;
  } while (isOnSnake(pos, app.game.snake) || isOnSnake(pos, app.game.aiSnake) || (pos.x===app.game.food.x && pos.y===app.game.food.y));
  const r = Math.random(); const type = r<0.55 ? 'speed' : r<0.85 ? 'slow' : 'bonus';
  app.game.powerups.push({x:pos.x,y:pos.y,type,createdAt:now});
}

function isPowerupAt(pos){ return app.game.powerups.some(p=>p.x===pos.x && p.y===pos.y) }
function isOnSnake(pos, snake){ if(!snake) return false; return snake.some(s => s.x===pos.x && s.y===pos.y) }

// move snake
function moveSnake(snake, direction){
  if (!direction || (direction.x===0 && direction.y===0)) return;
  if (snake.length>1){
    const next = {x:snake[0].x+direction.x, y:snake[0].y+direction.y};
    if (next.x===snake[1].x && next.y===snake[1].y) return;
  }
  const head = {x:snake[0].x+direction.x, y:snake[0].y+direction.y};
  snake.unshift(head);
  if (!snake.foodEaten) snake.pop(); else snake.foodEaten = false;
}

// eat food
function eatFood(snake, updateScore=true){
  snake.foodEaten = true;
  if (updateScore){
    app.game.score += CONFIG.POINTS_PER_FOOD;
    playBite();
    const newLevel = Math.floor(app.game.score / CONFIG.POINTS_PER_LEVEL) + 1;
    if (newLevel > app.game.level){
      app.game.level = newLevel;
      app.game.speed = Math.max(50, CONFIG.INITIAL_SPEED - (app.game.level * CONFIG.SPEED_INCREASE));
      restartLoop();
      playLevelUp();
    }
  }
  generateFood();
}

// powerup collision & apply
function checkPowerupCollision(snake, isPlayer){
  const head = snake[0];
  for (let i=0;i<app.game.powerups.length;i++){
    const p = app.game.powerups[i];
    if (head.x===p.x && head.y===p.y){
      applyPowerup(p.type, isPlayer);
      app.game.powerups.splice(i,1);
      return true;
    }
  }
  return false;
}
function applyPowerup(type, isPlayer){
  if (type==='bonus'){
    if (isPlayer){ app.game.score += 50; app.elements.hudActive.textContent='BONUS +50'; playBite(); }
  } else if (type==='speed'){
    if (isPlayer){ app.elements.hudActive.textContent = '⚡ SPEED BOOST'; setActivePower('speed', CONFIG.POWERUP_DURATION); playToneSequence([1000,1400,1800]); }
  } else if (type==='slow'){
    if (isPlayer){ app.elements.hudActive.textContent='🐌 SLOWED'; setActivePower('slow', CONFIG.POWERUP_DURATION); playToneSequence([400,320]); }
  }
}
function setActivePower(type, duration){
  if (app.game.activePower && app.game.activePower.timer) clearTimeout(app.game.activePower.timer);
  if (type==='speed'){ app.game.speed = Math.max(45, app.game.speed - 60); restartLoop(); }
  else if (type==='slow'){ app.game.speed = app.game.speed + 80; restartLoop(); }
  app.game.activePower = {type, expiresAt: Date.now() + duration};
  app.game.activePower.timer = setTimeout(()=> {
    app.game.speed = Math.max(50, CONFIG.INITIAL_SPEED - (app.game.level * CONFIG.SPEED_INCREASE));
    restartLoop();
    app.game.activePower = null;
    app.elements.hudActive.textContent = '';
  }, duration);
}
function playToneSequence(freqs){ let t=0; for(const f of freqs){ playTone(f,0.06,'sine',t,0.09); t += 0.08; } }

// check collisions
function checkCollision(snake){
  if (!snake || snake.length===0) return false;
  const head = snake[0];
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  if (head.x<0||head.x>=TILE_COUNT||head.y<0||head.y>=TILE_COUNT) return true;
  for (let i=1;i<snake.length;i++) if (head.x===snake[i].x && head.y===snake[i].y) return true;
  return false;
}

// game over
function gameOver(winner){
  clearInterval(app.game.loop);
  app.game.running = false;
  if (app.game.score > app.game.highScore){
    app.game.highScore = app.game.score; localStorage.setItem('snakeHighScore', String(app.game.highScore));
    app.elements.gameOverMessage = 'NEW HIGH SCORE!';
  }
  $('#gameOverScore').textContent = String(app.game.score).padStart(6,'0');
  app.elements.gameOverModal.classList.add('show');
  app.elements.gameOverModal.setAttribute('aria-hidden','false');
  playCrash();
  updateUI();
}

// close game over (called by buttons)
function closeGameOver(){ app.elements.gameOverModal.classList.remove('show'); app.elements.gameOverModal.setAttribute('aria-hidden','true'); navigateTo('home'); }

// update UI
function updateUI(){
  // in this simplified UI we update hud and settings where needed
  // score display on home could be updated here (left as an exercise)
}

// draw
function draw(){
  const ctx = app.game.ctx;
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,CONFIG.CANVAS_SIZE,CONFIG.CANVAS_SIZE);

  // grid
  ctx.strokeStyle = 'rgba(0,80,0,0.08)';
  ctx.lineWidth = 1;
  for (let i=0;i<=TILE_COUNT;i++){
    ctx.beginPath();
    ctx.moveTo(i*CONFIG.GRID_SIZE,0); ctx.lineTo(i*CONFIG.GRID_SIZE, CONFIG.CANVAS_SIZE);
    ctx.moveTo(0,i*CONFIG.GRID_SIZE); ctx.lineTo(CONFIG.CANVAS_SIZE, i*CONFIG.GRID_SIZE);
    ctx.stroke();
  }

  // powerups
  for (const p of app.game.powerups) drawPowerup(p);

  // food
  ctx.save(); ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(app.game.food.x*CONFIG.GRID_SIZE + 2, app.game.food.y*CONFIG.GRID_SIZE + 2, CONFIG.GRID_SIZE-4, CONFIG.GRID_SIZE-4);
  ctx.restore();

  if (app.game.aiSnake.length>0) drawSnake(app.game.aiSnake, '#c38cff', '#8b5ed8');
  drawSnake(app.game.snake, '#00b894', '#007c62');
}

function drawPowerup(p){
  const ctx = app.game.ctx, x=p.x*CONFIG.GRID_SIZE, y=p.y*CONFIG.GRID_SIZE;
  ctx.save();
  if (p.type==='speed'){ ctx.shadowColor='#fff3b0'; ctx.shadowBlur=10; ctx.fillStyle='#ffd166'; }
  else if (p.type==='slow'){ ctx.shadowColor='#cfefff'; ctx.shadowBlur=10; ctx.fillStyle='#66c9ff'; }
  else { ctx.shadowColor='#eec8ff'; ctx.shadowBlur=10; ctx.fillStyle='#ffb3ff'; }
  ctx.fillRect(x+2,y+2,CONFIG.GRID_SIZE-4,CONFIG.GRID_SIZE-4);
  ctx.restore();
  ctx.save();
  ctx.font = `${Math.max(12, Math.floor(CONFIG.GRID_SIZE/1.6))}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const icon = p.type==='speed' ? '⚡' : p.type==='slow' ? '🐌' : '💎';
  ctx.fillText(icon, x + CONFIG.GRID_SIZE/2, y + CONFIG.GRID_SIZE/2 + 1);
  ctx.restore();
}

function drawSnake(snake, headColor, bodyColor){
  const ctx = app.game.ctx;
  snake.forEach((seg, idx)=>{
    const x = seg.x*CONFIG.GRID_SIZE, y = seg.y*CONFIG.GRID_SIZE;
    if (idx===0){
      ctx.save(); ctx.shadowColor=headColor; ctx.shadowBlur=8; ctx.fillStyle=headColor; ctx.fillRect(x+1,y+1,CONFIG.GRID_SIZE-2,CONFIG.GRID_SIZE-2); ctx.restore();
      ctx.fillStyle='#000'; const eye = Math.max(2, Math.floor(CONFIG.GRID_SIZE/6)); ctx.fillRect(x+5,y+6,eye,eye); ctx.fillRect(x+5+eye+2,y+6,eye,eye);
    } else {
      ctx.save(); ctx.fillStyle=bodyColor; ctx.shadowColor=bodyColor; ctx.shadowBlur=3; ctx.fillRect(x+1,y+1,CONFIG.GRID_SIZE-2,CONFIG.GRID_SIZE-2); ctx.restore();
    }
  });
}

// restart loop on speed change
function restartLoop(){ clearInterval(app.game.loop); if (app.game.running) app.game.loop = setInterval(gameStep, app.game.speed); }

// === AI BFS pathfinding (similar to earlier) ===
function aiNextMoveBFS(snake, goal){
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  const blocked = new Set();
  // block bodies (simple)
  for (const s of app.game.snake) blocked.add(`${s.x},${s.y}`);
  for (const s of app.game.aiSnake) blocked.add(`${s.x},${s.y}`);
  for (let i=1;i<snake.length;i++) blocked.add(`${snake[i].x},${snake[i].y}`);

  const start = {x:snake[0].x,y:snake[0].y};
  const q = [start]; const visited=new Set([`${start.x},${start.y}`]); const parent=new Map();
  const dirs = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let found=false, destKey=null;
  while(q.length && !found){
    const cur = q.shift();
    for (const d of dirs){
      const nx = cur.x + d.x, ny = cur.y + d.y, key = `${nx},${ny}`;
      if (nx<0||ny<0||nx>=TILE_COUNT||ny>=TILE_COUNT) continue;
      if (visited.has(key)) continue;
      if (nx===goal.x && ny===goal.y){ parent.set(key, `${cur.x},${cur.y}`); found=true; destKey=key; break; }
      if (blocked.has(key)) continue;
      visited.add(key); parent.set(key, `${cur.x},${cur.y}`); q.push({x:nx,y:ny});
    }
  }
  if (!found) return greedyFallback(snake, goal);
  const path = []; let curKey = destKey;
  while(curKey && curKey !== `${start.x},${start.y}`){ const [cx,cy]=curKey.split(',').map(Number); path.unshift({x:cx,y:cy}); curKey = parent.get(curKey); }
  if (path.length===0) return null;
  const next = path[0]; return {x: next.x - start.x, y: next.y - start.y};
}

function greedyFallback(snake, food){
  const head = snake[0];
  const moves = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let best=null, bestScore=-1e9;
  for (const m of moves){
    const np = {x: head.x+m.x, y: head.y+m.y};
    if (!isValidPos(np)) continue;
    const dist = Math.abs(np.x-food.x)+Math.abs(np.y-food.y);
    let score = -dist;
    const center = (CONFIG.CANVAS_SIZE/CONFIG.GRID_SIZE)/2; score -= (Math.abs(np.x-center)+Math.abs(np.y-center))*0.1;
    if (score>bestScore){ bestScore=score; best=m; }
  }
  return best;
}
function isValidPos(pos){ const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE; if (pos.x<0||pos.y<0||pos.x>=TILE_COUNT||pos.y>=TILE_COUNT) return false; if (isOnSnake(pos, app.game.snake)) return false; if (isOnSnake(pos, app.game.aiSnake)) return false; return true; }
// === Game main step ===
function gameStep(){
  if (!app.game.running || app.game.paused) return;
  spawnPowerupRandom();

  if (app.game.mode === 'human' || app.game.mode === 'vs') moveSnake(app.game.snake, app.game.direction);
  if (app.game.mode === 'ai'){
    const aiMove = aiNextMoveBFS(app.game.snake, app.game.food);
    app.game.direction = aiMove || app.game.direction;
    moveSnake(app.game.snake, app.game.direction);
  }
  if (app.game.mode === 'vs' && app.game.aiSnake.length>0){
    const aimove = aiNextMoveBFS(app.game.aiSnake, app.game.food);
    app.game.aiDirection = aimove || app.game.aiDirection;
    moveSnake(app.game.aiSnake, app.game.aiDirection);
  }

  // collisions
  if (app.game.mode !== 'ai'){
    if (checkCollision(app.game.snake)) { const head = app.game.snake[0]; if (app.game.aiSnake.length>0 && isOnSnake(head, app.game.aiSnake)) { gameOver('AI'); return; } gameOver('AI'); return; }
  } else { if (checkCollision(app.game.snake)) { gameOver(); return; } }

  if (app.game.mode === 'vs' && app.game.aiSnake.length>0){
    if (checkCollision(app.game.aiSnake)) { gameOver('PLAYER'); return; }
    const pHead = app.game.snake[0], aHead = app.game.aiSnake[0];
    if (pHead.x===aHead.x && pHead.y===aHead.y) { if (app.game.snake.length>app.game.aiSnake.length) gameOver('PLAYER'); else if (app.game.snake.length<app.game.aiSnake.length) gameOver('AI'); else gameOver('TIE'); return; }
  }

  // food collisions
  const head = app.game.snake[0];
  if (head.x===app.game.food.x && head.y===app.game.food.y) eatFood(app.game.snake, true);
  if (app.game.aiSnake.length>0){ const aiHead = app.game.aiSnake[0]; if (aiHead.x===app.game.food.x && aiHead.y===app.game.food.y) eatFood(app.game.aiSnake, false); }

  // powerups
  if (checkPowerupCollision(app.game.snake, true)) { /* handled */ }
  if (app.game.aiSnake.length>0) checkPowerupCollision(app.game.aiSnake, false);

  draw();
  updateUI();
}

// === Controls: start/pause/restart ===
function startGame(){
  if (app.game.running && !app.game.paused) return;
  ensureAudio();
  app.game.snake = [{x:10,y:10}];
  app.game.aiSnake = app.game.mode === 'vs' ? [{x:15,y:15}] : [];
  if (app.game.mode === 'ai') app.game.direction = {x:1,y:0};
  app.game.score = 0; app.game.level = 1; app.game.speed = CONFIG.INITIAL_SPEED;
  app.game.running = true; app.game.paused = false;
  generateFood(); app.game.powerups = []; app.game.lastPowerupSpawn = Date.now();
  app.elements.gameStatus.style.opacity = '0';
  clearInterval(app.game.loop); app.game.loop = setInterval(gameStep, app.game.speed);
}
function togglePause(){ if (!app.game.running) return; app.game.paused = !app.game.paused; app.elements.pauseBtn.textContent = app.game.paused ? 'Resume' : 'Pause'; if (app.game.paused) clearInterval(app.game.loop); else app.game.loop = setInterval(gameStep, app.game.speed); }
function restartGame(){ clearInterval(app.game.loop); app.game.running = false; app.game.paused = false; app.game.snake = [{x:10,y:10}]; app.game.aiSnake = []; app.game.direction={x:0,y:0}; app.game.score=0; app.game.level=1; app.game.speed=CONFIG.INITIAL_SPEED; app.game.powerups=[]; app.elements.hudActive.textContent=''; app.elements.gameStatus.style.opacity = '1'; app.elements.gameStatus.querySelector('.status-text').textContent = 'PRESS START TO BEGIN'; draw(); }
function restartLoop(){ clearInterval(app.game.loop); if (app.game.running) app.game.loop = setInterval(gameStep, app.game.speed); }

// navigation helper for menu buttons
function navigateTo(target, opts){
  if (target === 'home') { closeMenu(); showView('home'); }
  else if (target === 'play') { closeMenu(); showView('play'); if (opts && opts.start) startGame(); }
  else if (target === 'settings') { closeMenu(); showView('settings'); }
  else if (target === 'tools') { closeMenu(); showView('tools'); }
}

// show specific view
function showView(name){
  document.querySelectorAll('.view').forEach(v => { v.style.display = 'none'; v.setAttribute('aria-hidden','true'); });
  const view = document.querySelector(`.view-${name}`);
  if (view){ view.style.display = 'block'; view.setAttribute('aria-hidden','false'); }
  if (name === 'play') hideInterfaceChrome(true); else hideInterfaceChrome(false);
}

// hide interface chrome
function hideInterfaceChrome(hide){
  document.querySelector('.app-header').style.opacity = hide ? '0.12' : '1';
  document.querySelector('.app-footer').style.opacity = hide ? '0.12' : '1';
  document.querySelector('.inplay-controls').style.display = hide ? 'flex' : 'none';
}

// === Touch & Drag Controls ===
function bindCanvasTouchAndMouse(){
  const canvas = app.game.canvas;
  if (!canvas) return;
  // touchstart
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    app.game.touchStart = {x:t.clientX, y:t.clientY, time:Date.now()};
    app.game.touchLast = {x:t.clientX, y:t.clientY};
  }, {passive:true});
  // touchmove -> drag direction
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    const dx = t.clientX - app.game.touchStart.x;
    const dy = t.clientY - app.game.touchStart.y;
    const thresh = (app.elements.touchSensitivity?.value ? parseInt(app.elements.touchSensitivity.value,10) : app.game.touchSensitivity);
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > thresh){
      setDirection(dx > 0 ? 1 : -1, 0);
      app.game.touchStart.x = t.clientX; app.game.touchStart.y = t.clientY;
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > thresh){
      setDirection(0, dy > 0 ? 1 : -1);
      app.game.touchStart.x = t.clientX; app.game.touchStart.y = t.clientY;
    }
  }, {passive:true});
  // touchend -> swipe short gesture
  canvas.addEventListener('touchend', (e) => {
    if (!app.game.touchStart) return;
    const t = app.game.touchLast || app.game.touchStart;
    const dx = t.x - app.game.touchStart.x;
    const dy = t.y - app.game.touchStart.y;
    const dt = Date.now() - app.game.touchStart.time;
    const swipeThresh = 30;
    if (dt < 500 && (Math.abs(dx) > swipeThresh || Math.abs(dy) > swipeThresh)){
      if (Math.abs(dx) > Math.abs(dy)) setDirection(dx>0?1:-1, 0); else setDirection(0, dy>0?1:-1);
    }
    app.game.touchStart = null; app.game.touchLast = null;
  }, {passive:true});

  // mouse drag for desktop (optional)
  let dragging = false;
  canvas.addEventListener('mousedown', (e) => { dragging = true; app.game.touchStart = {x:e.clientX,y:e.clientY}; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging || !app.game.touchStart) return;
    const dx = e.clientX - app.game.touchStart.x, dy = e.clientY - app.game.touchStart.y;
    const thresh = 20;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > thresh) { setDirection(dx>0?1:-1,0); app.game.touchStart.x = e.clientX; app.game.touchStart.y = e.clientY; }
    else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > thresh) { setDirection(0,dy>0?1:-1); app.game.touchStart.x = e.clientX; app.game.touchStart.y = e.clientY; }
  });
  window.addEventListener('mouseup', ()=> { dragging=false; app.game.touchStart=null; });
}

// helper to set direction but prevent 180 turns
function setDirection(x,y){
  const cur = app.game.direction;
  if (cur.x === -x && cur.y === -y && app.game.snake.length > 1) return;
  app.game.direction = {x,y};
}

// dpad helper
function applyDirectionFromDpad(dir){
  if (dir === 'up') setDirection(0,-1);
  if (dir === 'down') setDirection(0,1);
  if (dir === 'left') setDirection(-1,0);
  if (dir === 'right') setDirection(1,0);
}

// === Settings persistence ===
function loadSettings(){
  const theme = localStorage.getItem('snake_theme') || 'light';
  setTheme(theme);
  const sens = parseInt(localStorage.getItem('snake_touch_sens') || '40',10);
  if (app.elements.touchSensitivity) app.elements.touchSensitivity.value = sens;
  app.game.touchSensitivity = sens;
  const aiDiff = localStorage.getItem('snake_ai_diff') || 'normal';
  if (app.elements.aiDifficulty) app.elements.aiDifficulty.value = aiDiff;
  app.game.aiDifficulty = aiDiff;
}
function loadSettingsIntoUI(){
  loadSettings();
}
function saveSettings(){
  const sens = parseInt(app.elements.touchSensitivity.value,10) || 40;
  localStorage.setItem('snake_touch_sens', String(sens)); app.game.touchSensitivity = sens;
  const ai = app.elements.aiDifficulty.value || 'normal'; localStorage.setItem('snake_ai_diff', ai); app.game.aiDifficulty = ai;
  alert('Settings saved');
  navigateTo('home');
}

// === Helper: powerup cleanup interval ===
setInterval(()=> {
  const now = Date.now();
  app.game.powerups = app.game.powerups.filter(p => (now - p.createdAt) < 35000);
}, 5000);

// === Utility small helpers ===
function playBite(){ playTone(900,0.06,'square',0,0.08); playTone(1400,0.05,'sawtooth',0.02,0.05); }
function playCrash(){ playTone(120,0.35,'sine',0,0.28); }
function playTone(freq,dur=0.08,type='sine',when=0,gain=0.12){ try{ ensureAudio(); const ctx = app.game.audioCtx; const o = ctx.createOscillator(); const g = ctx.createGain(); o.type=type; o.frequency.value=freq; o.connect(g); g.connect(ctx.destination); g.gain.value=gain; o.start(ctx.currentTime+when); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+when+dur); o.stop(ctx.currentTime+when+dur+0.02); }catch(e){} }
function ensureAudio(){ try{ if(!app.game.audioCtx) app.game.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){} }

// === Small helpers to expose start/reset for menu buttons ===
function startGame(){ showView('play'); startGameInternal(); }
function startGameInternal(){
  if (app.game.running && !app.game.paused) return;
  ensureAudio();
  app.game.snake = [{x:10,y:10}];
  app.game.aiSnake = app.game.mode==='vs' ? [{x:15,y:15}] : [];
  app.game.direction = app.game.mode==='ai' ? {x:1,y:0} : {x:0,y:0};
  app.game.score=0; app.game.level=1; app.game.speed=CONFIG.INITIAL_SPEED; app.game.running=true; app.game.paused=false;
  generateFood();
  app.game.powerups = [];
  app.game.loop = setInterval(gameStep, app.game.speed);
  app.elements.gameStatus.style.opacity = '0';
}
function restartGame(){ clearInterval(app.game.loop); app.game.running=false; app.game.paused=false; app.game.snake = [{x:10,y:10}]; app.game.aiSnake = []; app.game.direction={x:0,y:0}; app.game.score=0; app.game.level=1; app.game.speed=CONFIG.INITIAL_SPEED; app.game.powerups=[]; app.elements.hudActive.textContent=''; draw(); }
function togglePause(){ if (!app.game.running) return; app.game.paused = !app.game.paused; if (app.game.paused) clearInterval(app.game.loop); else app.game.loop = setInterval(gameStep, app.game.speed); }

// Expose some functions to global for button callbacks
window.startGame = startGameInternal;
window.resetGame = restartGame;
window.closeGameOver = closeGameOver;

// End of file
