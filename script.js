/* === script.js - Classic Snake Arcade (with power-ups, BFS AI, sounds) === */

/* CONFIG */
const CONFIG = {
  GRID_SIZE: 20,            // pixel size of a grid cell
  CANVAS_SIZE: 480,        // canvas drawing size (square)
  INITIAL_SPEED: 160,      // ms per step (lower = faster)
  SPEED_INCREASE: 10,      // ms decrease per level
  POINTS_PER_FOOD: 10,
  POINTS_PER_LEVEL: 100,
  POWERUP_SPAWN_FREQ: 12000, // ms between potential power-up spawns
  POWERUP_DURATION: 8000,   // ms duration for temporary powerups
  POWERUP_TYPES: ['speed','bonus','slow']
};

/* STATE */
let gameState = {
  canvas: null,
  ctx: null,
  snake: [{x:10,y:10}],
  aiSnake: [],
  food: {x:15,y:15},
  powerups: [],            // array of {x,y,type}
  direction: {x:0,y:0},
  score: 0,
  level: 1,
  highScore: 0,
  gameRunning: false,
  gamePaused: false,
  gameMode: 'human', // 'human','ai','vs'
  gameSpeed: CONFIG.INITIAL_SPEED,
  gameLoop: null,
  lastPowerupSpawn: 0,
  activePower: null,      // {type, expiresAt}
  audioCtx: null
};

/* DOM refs */
const elements = {
  canvas:null, startBtn:null, pauseBtn:null, resetBtn:null,
  scoreEl:null, highScoreEl:null, levelEl:null, gameModeEl:null,
  gameStatus:null, gameOverModal:null, gameOverScore:null, gameOverMessage:null,
  levelProgress:null, progressText:null, aiStatus:null, hudActive:null
};

/* --- AUDIO (Web Audio procedural tones) --- */
function ensureAudio() {
  if (!gameState.audioCtx) {
    gameState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function playTone(freq, duration=0.12, type='sine', when=0, gain=0.12) {
  try {
    ensureAudio();
    const ctx = gameState.audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + when);
    g.gain.setValueAtTime(gain, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
    o.stop(ctx.currentTime + when + duration + 0.02);
  } catch (e) {
    // audio API can be blocked by browser until user gestures; ignore silently
    // console.warn('Audio issue', e);
  }
}
function playBite(){ playTone(900, 0.08, 'square', 0, 0.08); playTone(1400, 0.06, 'sawtooth', 0.02, 0.06); }
function playCrash(){ playTone(120, 0.35, 'sine', 0, 0.28); playTone(60, 0.25, 'sine', 0.05, 0.24); }
function playLevelUp(){ playTone(1100,0.15,'sine',0,0.12); playTone(1400,0.18,'sine',0.12,0.12); playTone(1800,0.12,'triangle',0.3,0.09); }

/* --- INIT --- */
function initGame(){
  elements.canvas = document.getElementById('gameCanvas');
  elements.startBtn = document.getElementById('startBtn');
  elements.pauseBtn = document.getElementById('pauseBtn');
  elements.resetBtn = document.getElementById('resetBtn');
  elements.scoreEl = document.getElementById('score');
  elements.highScoreEl = document.getElementById('highScore');
  elements.levelEl = document.getElementById('level');
  elements.gameModeEl = document.getElementById('gameMode');
  elements.gameStatus = document.getElementById('gameStatus');
  elements.gameOverModal = document.getElementById('gameOverModal');
  elements.gameOverScore = document.getElementById('gameOverScore');
  elements.gameOverMessage = document.getElementById('gameOverMessage');
  elements.levelProgress = document.getElementById('levelProgress');
  elements.progressText = document.getElementById('progressText');
  elements.aiStatus = document.getElementById('aiStatus');
  elements.hudActive = document.getElementById('activePower');

  gameState.canvas = elements.canvas;
  gameState.ctx = elements.canvas.getContext('2d');

  setupCanvasResolution();
  loadHighScore();
  setupEventListeners();
  generateFood();
  draw();
  console.log('🐍 Snake Arcade ready');
}

/* --- Canvas scaling --- */
function setupCanvasResolution(){
  const dpr = window.devicePixelRatio || 1;
  elements.canvas.width = CONFIG.CANVAS_SIZE * dpr;
  elements.canvas.height = CONFIG.CANVAS_SIZE * dpr;
  elements.canvas.style.width = Math.min(CONFIG.CANVAS_SIZE, elements.canvas.parentElement.clientWidth - 40) + 'px';
  elements.canvas.style.height = elements.canvas.style.width;
  const ctx = elements.canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  gameState.ctx = ctx;
}

/* --- Storage --- */
function loadHighScore(){
  gameState.highScore = parseInt(localStorage.getItem('snakeHighScore') || '0', 10);
  updateUI();
}

/* --- Event listeners --- */
function setupEventListeners(){
  elements.startBtn.addEventListener('click', toggleGame);
  elements.pauseBtn.addEventListener('click', pauseGame);
  elements.resetBtn.addEventListener('click', resetGame);

  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>setGameMode(e.currentTarget.dataset.mode));
  });

  document.addEventListener('keydown', handleKeyPress);
  window.addEventListener('keydown', (e)=>{
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  }, false);

  window.addEventListener('resize', ()=>{ setupCanvasResolution(); draw(); });
  elements.gameOverModal.addEventListener('click', (e)=>{ if(e.target===elements.gameOverModal) closeGameOver(); });
}

/* --- Input --- */
function handleKeyPress(e){
  // ensure audio context starts on user gesture
  if (gameState.audioCtx && gameState.audioCtx.state === 'suspended') gameState.audioCtx.resume();
  if (e.code === 'Space') {
    if (!gameState.gameRunning) startGame();
    else pauseGame();
    return;
  }
  if (!gameState.gameRunning || gameState.gamePaused || gameState.gameMode === 'ai') return;
  const k = e.key;
  const cur = gameState.direction;
  if ((k==='ArrowUp'||k==='w'||k==='W') && cur.y===0) gameState.direction={x:0,y:-1};
  if ((k==='ArrowDown'||k==='s'||k==='S') && cur.y===0) gameState.direction={x:0,y:1};
  if ((k==='ArrowLeft'||k==='a'||k==='A') && cur.x===0) gameState.direction={x:-1,y:0};
  if ((k==='ArrowRight'||k==='d'||k==='D') && cur.x===0) gameState.direction={x:1,y:0};
  if (k==='r'||k==='R') resetGame();
}

/* --- Mode --- */
function setGameMode(mode){
  if (gameState.gameRunning) return;
  gameState.gameMode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn=>btn.classList.remove('active'));
  const el = document.querySelector(`[data-mode="${mode}"]`); if(el) el.classList.add('active');
  const modeText = {'human':'HUMAN','ai':'AI DEMO','vs':'VS AI'}; elements.gameModeEl.textContent = modeText[mode] || 'HUMAN';
  updateAIStatus(mode==='ai' ? 'ACTIVE' : mode==='vs' ? 'READY' : 'STANDBY');
  resetGame();
}
function updateAIStatus(status){
  if (!elements.aiStatus) return;
  const t = elements.aiStatus.querySelector('.ai-text'); if(t) t.textContent = status;
  const brain = elements.aiStatus.querySelector('.ai-brain'); if(brain){
    brain.style.borderColor = status==='ACTIVE' ? '#00ff66' : status==='READY' ? '#ff6b00' : '#0066ff';
  }
}

/* --- Loop control helpers --- */
function restartGameLoop(){
  clearInterval(gameState.gameLoop);
  gameState.gameLoop = setInterval(gameStep, gameState.gameSpeed);
}

/* --- Game flow --- */
function toggleGame(){ if (gameState.gameRunning) resetGame(); else startGame(); }
function startGame(){
  if (gameState.gameRunning && !gameState.gamePaused) return;
  // start audio context on user gesture
  try{ ensureAudio(); if (gameState.audioCtx.state==='suspended') gameState.audioCtx.resume(); }catch(e){}
  gameState.snake = [{x:10,y:10}];
  gameState.aiSnake = gameState.gameMode==='vs'? [{x:15,y:15}]: [];
  gameState.direction = {x:0,y:0};
  gameState.aiDirection = {x:1,y:0};
  gameState.score = 0; gameState.level = 1; gameState.gameSpeed = CONFIG.INITIAL_SPEED;
  gameState.gameRunning = true; gameState.gamePaused = false;
  if (gameState.gameMode==='ai'){ gameState.direction={x:1,y:0}; }
  generateFood();
  gameState.powerups = [];
  elements.startBtn.textContent = 'RESET';
  elements.pauseBtn.disabled = false;
  elements.gameStatus.style.opacity = '0';
  if (gameState.gameMode==='ai' || gameState.gameMode==='vs') updateAIStatus('ACTIVE');
  restartGameLoop();
  // powerup spawn cycle
  gameState.lastPowerupSpawn = Date.now();
  console.log('🎮 Game started');
}
function pauseGame(){
  if (!gameState.gameRunning) return;
  gameState.gamePaused = !gameState.gamePaused;
  elements.pauseBtn.textContent = gameState.gamePaused ? 'RESUME' : 'PAUSE';
  if (gameState.gamePaused){
    clearInterval(gameState.gameLoop);
    elements.gameStatus.style.opacity = '1';
    elements.gameStatus.querySelector('.status-text').textContent = 'GAME PAUSED';
  } else {
    restartGameLoop();
    elements.gameStatus.style.opacity = '0';
  }
}
function resetGame(){
  clearInterval(gameState.gameLoop);
  gameState.gameRunning = false; gameState.gamePaused=false;
  gameState.snake = [{x:10,y:10}]; gameState.aiSnake=[]; gameState.direction={x:0,y:0};
  gameState.score=0; gameState.level=1; gameState.gameSpeed=CONFIG.INITIAL_SPEED;
  gameState.powerups=[]; gameState.activePower=null;
  elements.startBtn.textContent='START'; elements.pauseBtn.textContent='PAUSE'; elements.pauseBtn.disabled=true;
  elements.gameStatus.style.opacity='1'; elements.gameStatus.querySelector('.status-text').textContent='PRESS START TO BEGIN';
  updateAIStatus('STANDBY'); generateFood(); updateUI(); draw();
  console.log('🔄 Reset');
}
/* --- Spawning food & power-ups --- */
function generateFood(){
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  let pos;
  do {
    pos = {x:Math.floor(Math.random()*TILE_COUNT), y:Math.floor(Math.random()*TILE_COUNT)};
  } while (isPositionOnSnake(pos, gameState.snake) || isPositionOnSnake(pos, gameState.aiSnake) || isPowerupAt(pos));
  gameState.food = pos;
}
function isPowerupAt(pos){ return gameState.powerups.some(p=>p.x===pos.x && p.y===pos.y); }
function spawnPowerupRandom(){
  const now = Date.now();
  if (now - gameState.lastPowerupSpawn < CONFIG.POWERUP_SPAWN_FREQ) return;
  gameState.lastPowerupSpawn = now + Math.floor(Math.random()*4000); // jitter
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  let pos;
  let attempts=0;
  do {
    pos = {x:Math.floor(Math.random()*TILE_COUNT), y:Math.floor(Math.random()*TILE_COUNT)};
    attempts++;
    if(attempts>200) return;
  } while (isPositionOnSnake(pos, gameState.snake) || isPositionOnSnake(pos, gameState.aiSnake) || (pos.x===gameState.food.x && pos.y===gameState.food.y));
  // pick random type, bias so 'bonus' less common
  const r = Math.random();
  const type = r<0.55 ? 'speed' : r<0.85 ? 'slow' : 'bonus';
  gameState.powerups.push({x:pos.x,y:pos.y,type,createdAt:now});
}

/* --- Collision helpers --- */
function isPositionOnSnake(pos, snake){
  if(!snake) return false;
  return snake.some(s=>s.x===pos.x && s.y===pos.y);
}

/* --- Game step --- */
function gameStep(){
  if (!gameState.gameRunning || gameState.gamePaused) return;
  // spawn power-ups occasionally
  spawnPowerupRandom();

  // move main snake
  if (gameState.gameMode==='human' || gameState.gameMode==='vs') {
    moveSnake(gameState.snake, gameState.direction);
  }
  if (gameState.gameMode==='ai') {
    const aiMove = aiNextMoveBFS(gameState.snake, gameState.food);
    gameState.direction = aiMove || gameState.direction;
    moveSnake(gameState.snake, gameState.direction);
  }
  if (gameState.gameMode==='vs' && gameState.aiSnake.length>0) {
    const aiMove = aiNextMoveBFS(gameState.aiSnake, gameState.food, true);
    gameState.aiDirection = aiMove || gameState.aiDirection;
    moveSnake(gameState.aiSnake, gameState.aiDirection);
  }

  // collisions and outcomes
  if (gameState.gameMode !== 'ai') {
    if (checkCollision(gameState.snake)) {
      // if collided with AI body in VS mode, AI wins
      const head = gameState.snake[0];
      if (gameState.aiSnake.length>0 && isPositionOnSnake(head, gameState.aiSnake)) {
        gameOver('AI'); return;
      }
      gameOver('AI'); return;
    }
  } else {
    if (checkCollision(gameState.snake)) { gameOver(); return; }
  }

  if (gameState.gameMode==='vs' && gameState.aiSnake.length>0) {
    if (checkCollision(gameState.aiSnake)) { gameOver('PLAYER'); return; }
    // head-on collision
    const pHead = gameState.snake[0], aHead = gameState.aiSnake[0];
    if (pHead.x===aHead.x && pHead.y===aHead.y) {
      if (gameState.snake.length > gameState.aiSnake.length) gameOver('PLAYER');
      else if (gameState.snake.length < gameState.aiSnake.length) gameOver('AI');
      else gameOver('TIE');
      return;
    }
  }

  // food collisions
  const head = gameState.snake[0];
  if (head.x===gameState.food.x && head.y===gameState.food.y) {
    eatFood(gameState.snake, true);
  }
  if (gameState.aiSnake.length>0) {
    const aiHead = gameState.aiSnake[0];
    if (aiHead.x===gameState.food.x && aiHead.y===gameState.food.y) {
      eatFood(gameState.aiSnake, false);
    }
  }

  // powerup collisions
  if (checkPowerupCollision(gameState.snake, true)) return;
  if (gameState.aiSnake.length>0) checkPowerupCollision(gameState.aiSnake, false);

  // update draw and UI
  draw();
  updateUI();
}

/* --- Move snake --- */
function moveSnake(snake, direction){
  if (!direction || (direction.x===0 && direction.y===0)) return;
  if (snake.length>1) {
    const next = {x:snake[0].x+direction.x, y:snake[0].y+direction.y};
    if (next.x===snake[1].x && next.y===snake[1].y) return; // prevent 180
  }
  const head = {x:snake[0].x+direction.x, y:snake[0].y+direction.y};
  snake.unshift(head);
  if (!snake.foodEaten) snake.pop(); else snake.foodEaten = false;
}

/* --- Eat food --- */
function eatFood(snake, updateScore=true){
  snake.foodEaten = true;
  if (updateScore) {
    gameState.score += CONFIG.POINTS_PER_FOOD;
    playBite();
    // level up check
    const newLevel = Math.floor(gameState.score / CONFIG.POINTS_PER_LEVEL) + 1;
    if (newLevel > gameState.level) {
      gameState.level = newLevel;
      gameState.gameSpeed = Math.max(50, CONFIG.INITIAL_SPEED - (gameState.level * CONFIG.SPEED_INCREASE));
      restartGameLoop();
      playLevelUp();
    }
  }
  generateFood();
}

/* --- Power-up collision/effects --- */
function checkPowerupCollision(snake, isPlayer){
  const head = snake[0];
  for (let i=0;i<gameState.powerups.length;i++){
    const p = gameState.powerups[i];
    if (head.x===p.x && head.y===p.y){
      // apply effect
      applyPowerup(p.type, isPlayer);
      // remove powerup
      gameState.powerups.splice(i,1);
      return true;
    }
  }
  return false;
}
function applyPowerup(type, isPlayer){
  // Only player's power-ups affect score/speed etc. AI will "eat" but we can give it length by foodEaten
  if (type==='bonus'){
    if (isPlayer){
      gameState.score += 50;
      elements.hudActive.textContent = 'BONUS +50';
      playBite();
    }
  } else if (type==='speed'){
    if (isPlayer){
      elements.hudActive.textContent = 'SPEED BOOST';
      setActivePower('speed', CONFIG.POWERUP_DURATION);
      playToneSequence([1000,1400,1800],0.05);
    } else {
      // AI speed boost - make AI move twice this frame by giving it temporary advantage (no-op for now)
    }
  } else if (type==='slow'){
    if (isPlayer){
      elements.hudActive.textContent = 'SLOWED';
      setActivePower('slow', CONFIG.POWERUP_DURATION);
      playToneSequence([400,320],0.09);
    }
  }
  // ensure UI updates
  updateUI();
  // small animation clearing after duration will be handled by setActivePower
}
function setActivePower(type, duration){
  // clear old
  if (gameState.activePower && gameState.activePower.timer) clearTimeout(gameState.activePower.timer);
  const prev = gameState.activePower ? gameState.activePower.type : null;
  // apply
  if (type==='speed'){
    // speed boost -> temporarily increase speed (decrease ms)
    gameState.gameSpeed = Math.max(45, gameState.gameSpeed - 60);
    restartGameLoop();
  } else if (type==='slow'){
    // slow -> temporarily slow game
    gameState.gameSpeed = gameState.gameSpeed + 80;
    restartGameLoop();
  }
  gameState.activePower = {type, expiresAt: Date.now() + duration};
  // UI indicator
  elements.hudActive.textContent = (type==='speed' ? '⚡ SPEED BOOST' : type==='slow' ? '🐌 SLOW DOWN' : type.toUpperCase());
  // schedule revert
  gameState.activePower.timer = setTimeout(()=>{
    // revert effect: restore base speed depending on level
    gameState.gameSpeed = Math.max(50, CONFIG.INITIAL_SPEED - (gameState.level * CONFIG.SPEED_INCREASE));
    restartGameLoop();
    gameState.activePower = null;
    elements.hudActive.textContent = '';
  }, duration);
}
/* tiny melody helper */
function playToneSequence(freqs, dur){
  let t=0;
  for (const f of freqs){ playTone(f,dur,'sine',t,0.09); t += dur+0.02; }
}

/* --- Collision detection --- */
function checkCollision(snake){
  if (!snake || snake.length===0) return false;
  const head = snake[0];
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  // walls
  if (head.x<0||head.x>=TILE_COUNT||head.y<0||head.y>=TILE_COUNT) return true;
  // self
  for (let i=1;i<snake.length;i++) if (head.x===snake[i].x && head.y===snake[i].y) return true;
  return false;
}

/* --- Game Over --- */
function gameOver(winner){
  clearInterval(gameState.gameLoop);
  gameState.gameRunning = false;
  // high score update (player)
  if (gameState.score > gameState.highScore){
    gameState.highScore = gameState.score;
    localStorage.setItem('snakeHighScore', String(gameState.highScore));
    elements.gameOverMessage.textContent = '🎉 NEW HIGH SCORE! 🎉';
  } else {
    if (winner==='PLAYER') elements.gameOverMessage.textContent = 'YOU WIN! GREAT JOB!';
    else if (winner==='AI') elements.gameOverMessage.textContent = 'AI WINS — TRY AGAIN!';
    else if (winner==='TIE') elements.gameOverMessage.textContent = "IT'S A TIE!";
    else elements.gameOverMessage.textContent = 'TRY AGAIN TO BEAT YOUR HIGH SCORE!';
  }
  elements.gameOverScore.textContent = String(gameState.score).padStart(6,'0');
  elements.gameOverModal.style.display = 'flex';
  elements.gameOverModal.setAttribute('aria-hidden','false');
  updateAIStatus('STANDBY');
  playCrash();
  updateUI();
}

/* --- Close Game Over --- */
function closeGameOver(){
  elements.gameOverModal.style.display = 'none';
  elements.gameOverModal.setAttribute('aria-hidden','true');
  resetGame();
}

/* --- UI updates --- */
function updateUI(){
  elements.scoreEl.textContent = String(gameState.score).padStart(6,'0');
  elements.highScoreEl.textContent = String(gameState.highScore).padStart(6,'0');
  elements.levelEl.textContent = String(gameState.level).padStart(3,'0');
  const progressPercent = (gameState.score % CONFIG.POINTS_PER_LEVEL) / CONFIG.POINTS_PER_LEVEL * 100;
  if (elements.levelProgress) elements.levelProgress.style.width = progressPercent + '%';
  if (elements.progressText) elements.progressText.textContent = `${gameState.score % CONFIG.POINTS_PER_LEVEL}/${CONFIG.POINTS_PER_LEVEL}`;
  // active power HUD handled elsewhere
}

/* --- DRAWING --- */
function draw(){
  const ctx = gameState.ctx;
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  // clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,CONFIG.CANVAS_SIZE,CONFIG.CANVAS_SIZE);

  // subtle grid
  ctx.strokeStyle = '#002200';
  ctx.lineWidth = 1;
  for (let i=0;i<=TILE_COUNT;i++){
    ctx.beginPath();
    ctx.moveTo(i*CONFIG.GRID_SIZE,0); ctx.lineTo(i*CONFIG.GRID_SIZE, CONFIG.CANVAS_SIZE);
    ctx.moveTo(0,i*CONFIG.GRID_SIZE); ctx.lineTo(CONFIG.CANVAS_SIZE, i*CONFIG.GRID_SIZE);
    ctx.stroke();
  }

  // draw power-ups first (behind snakes)
  for (const p of gameState.powerups){
    drawPowerup(p);
  }

  // food glow
  ctx.save();
  ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(gameState.food.x*CONFIG.GRID_SIZE + 2, gameState.food.y*CONFIG.GRID_SIZE + 2, CONFIG.GRID_SIZE-4, CONFIG.GRID_SIZE-4);
  ctx.restore();

  // draw AI snake if present
  if (gameState.aiSnake.length>0) drawSnake(gameState.aiSnake, '#c38cff', '#8b5ed8');

  // draw player snake
  drawSnake(gameState.snake, '#00ff66', '#00aa55');
}

/* draw single powerup (colored cell + emoji) */
function drawPowerup(p){
  const ctx = gameState.ctx;
  const x = p.x * CONFIG.GRID_SIZE, y = p.y * CONFIG.GRID_SIZE;
  ctx.save();
  if (p.type === 'speed'){
    ctx.shadowColor = '#ffff66'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffe86b';
  } else if (p.type === 'slow'){
    ctx.shadowColor = '#66ccff'; ctx.shadowBlur = 10; ctx.fillStyle = '#66c9ff';
  } else if (p.type === 'bonus'){
    ctx.shadowColor = '#ffd1ff'; ctx.shadowBlur = 12; ctx.fillStyle = '#ffb3ff';
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fillRect(x+2,y+2,CONFIG.GRID_SIZE-4,CONFIG.GRID_SIZE-4);
  ctx.restore();
  // draw icon (emoji) - fallback to simple circle if emoji not render nicely
  ctx.save();
  ctx.font = `${Math.max(12, Math.floor(CONFIG.GRID_SIZE/1.6))}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline='middle';
  let icon = '';
  if (p.type==='speed') icon='⚡'; else if (p.type==='slow') icon='🐌'; else if (p.type==='bonus') icon='💎';
  ctx.fillText(icon, x + CONFIG.GRID_SIZE/2, y + CONFIG.GRID_SIZE/2 + 1);
  ctx.restore();
}

/* draw snake */
function drawSnake(snake, headColor, bodyColor){
  const ctx = gameState.ctx;
  if (!snake || snake.length===0) return;
  snake.forEach((seg, idx)=>{
    const x = seg.x*CONFIG.GRID_SIZE, y = seg.y*CONFIG.GRID_SIZE;
    if (idx===0){
      ctx.save();
      ctx.shadowColor = headColor; ctx.shadowBlur=8; ctx.fillStyle = headColor;
      ctx.fillRect(x+1,y+1,CONFIG.GRID_SIZE-2,CONFIG.GRID_SIZE-2); ctx.restore();
      // eyes
      ctx.fillStyle='#000';
      const eye = Math.max(2, Math.floor(CONFIG.GRID_SIZE/6));
      ctx.fillRect(x+5,y+6,eye,eye);
      ctx.fillRect(x+5+eye+2,y+6,eye,eye);
    } else {
      ctx.save(); ctx.fillStyle = bodyColor; ctx.shadowColor = bodyColor; ctx.shadowBlur=3;
      ctx.fillRect(x+1,y+1,CONFIG.GRID_SIZE-2,CONFIG.GRID_SIZE-2); ctx.restore();
    }
  });
}

/* --- AI: BFS pathfinding to food avoiding walls and bodies --- */
/* returns a direction {x,y} or null if not found */
function aiNextMoveBFS(snake, goal, isVSMode=false){
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  // build grid of blocked cells
  const blocked = new Set();
  // block snake bodies (including tail except last cell if it will move - but we'll keep simple and block all body except head)
  const allBodies = [];
  // add player snake bodies if AI should avoid them (always avoid)
  allBodies.push(...gameState.snake);
  // add AI snake bodies except if searching for AI itself (we will pass snake param - but still block other snake)
  if (gameState.aiSnake && gameState.aiSnake.length>0 && !isVSMode) allBodies.push(...gameState.aiSnake);
  // mark bodies
  for (const s of allBodies){
    blocked.add(`${s.x},${s.y}`);
  }
  // Also ensure snake self-collisions for path calculation are considered except head
  for (let i=1;i<snake.length;i++) blocked.add(`${snake[i].x},${snake[i].y}`);

  // BFS
  const start = {x:snake[0].x,y:snake[0].y};
  const queue = [];
  const visited = new Set();
  const parent = new Map();
  queue.push(start);
  visited.add(`${start.x},${start.y}`);
  const dirs = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let found=false, destKey=null;
  while(queue.length>0 && !found){
    const cur = queue.shift();
    for (const d of dirs){
      const nx = cur.x + d.x, ny = cur.y + d.y;
      const key = `${nx},${ny}`;
      if (nx<0||ny<0||nx>=TILE_COUNT||ny>=TILE_COUNT) continue;
      if (visited.has(key)) continue;
      // allow stepping into goal even if previously "blocked"
      if (nx===goal.x && ny===goal.y){
        parent.set(key, `${cur.x},${cur.y}`);
        found=true; destKey=key; break;
      }
      if (blocked.has(key)) continue;
      visited.add(key);
      parent.set(key, `${cur.x},${cur.y}`);
      queue.push({x:nx,y:ny});
    }
  }
  if (!found) {
    // fallback: greedy move toward food but avoid immediate collisions
    return greedyAIFallback(snake, goal);
  }
  // reconstruct path from destKey back to start
  const path = [];
  let curKey = destKey;
  while(curKey && curKey !== `${start.x},${start.y}`){
    const [cx,cy] = curKey.split(',').map(Number);
    path.unshift({x:cx,y:cy});
    curKey = parent.get(curKey);
  }
  if (path.length===0) return null;
  const next = path[0];
  return {x: next.x - start.x, y: next.y - start.y};
}

/* greedy fallback (simple evaluate moves) */
function greedyAIFallback(snake, food){
  const head = snake[0];
  const moves = [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let best=null, bestScore=-1e9;
  for (const m of moves){
    const np = {x: head.x+m.x, y: head.y+m.y};
    if (!isValidPos(np, snake)) continue;
    // score by closeness
    const dist = Math.abs(np.x - food.x) + Math.abs(np.y - food.y);
    let score = -dist;
    // prefer center
    const center = (CONFIG.CANVAS_SIZE/CONFIG.GRID_SIZE)/2;
    score -= (Math.abs(np.x-center)+Math.abs(np.y-center))*0.1;
    if (score > bestScore){ bestScore = score; best = m; }
  }
  return best;
}
function isValidPos(pos, snake){
  const TILE_COUNT = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;
  if (pos.x<0||pos.y<0||pos.x>=TILE_COUNT||pos.y>=TILE_COUNT) return false;
  // avoid any snake body
  if (isPositionOnSnake(pos, gameState.snake)) return false;
  if (isPositionOnSnake(pos, gameState.aiSnake)) return false;
  return true;
}

/* --- Utility restart loop (to apply new speed) --- */
function restartGameLoop(){
  clearInterval(gameState.gameLoop);
  gameState.gameLoop = setInterval(gameStep, gameState.gameSpeed);
}

/* --- Power-up lifetime cleanup (optional) --- */
/* keep powerups for up to 35s then remove */
setInterval(()=>{
  const now = Date.now();
  gameState.powerups = gameState.powerups.filter(p => (now - p.createdAt) < 35000);
}, 5000);

/* --- Check & revert active power exposure in UI each frame --- */
setInterval(()=>{
  if (gameState.activePower && Date.now() > gameState.activePower.expiresAt){
    // revert handled by timer; here we just clear HUD if expired
    if (!gameState.activePower) elements.hudActive.textContent = '';
  }
}, 500);

/* --- Draw + game start --- */
document.addEventListener('DOMContentLoaded', ()=>initGame());

/* --- Helper: play small tone used above --- */
function playTone(freq, duration=0.08, type='sine', when=0, gain=0.12){
  try {
    ensureAudio();
    const ctx = gameState.audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = gain;
    o.start(ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
    o.stop(ctx.currentTime + when + duration + 0.02);
  } catch(e){ /* ignore */ }
}

/* --- End of file --- */
        
