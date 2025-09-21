// main.js — 16:9 GAME AREA + **PIXEL-BASED SYNC** + EVENT-BASED BALL + PERF
// What’s in this patch (per your request):
// - Reverted network protocol to **pixels** (x,y,w,h,angle for paddles; x,y,vx,vy for ball events).
// - No continuous ball position spam: P1 sends **only** on collide / wall-bounce / serve / score.
// - Paddles/ball **draw correctly** again: full canvas clear each frame + visible defaults before tracking/peer.
// - Layout preserved: two real <video> halves under a transparent canvas, all inside #gameScreen (16:9).
// - P2 video mirroring: we **do not touch** your flipper function (left as-is, as you noted it’s fixed).

//////////////////// On-screen logger ////////////////////
const logEl = document.getElementById('log');
// const log  = (...a)=>{console.log(...a); if(logEl){logEl.textContent += a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n'; logEl.scrollTop=logEl.scrollHeight;}};
// const warn = (...a)=>{console.warn(...a); if(logEl){logEl.textContent += '⚠️ '+a.join(' ')+'\n'; logEl.scrollTop=logEl.scrollHeight;}};
// const err  = (...a)=>{console.error(...a); if(logEl){logEl.textContent += '❌ '+a.join(' ')+'\n'; logEl.scrollTop=logEl.scrollHeight;}};

const log  = () => {};
const warn = () => {};
const err  = () => {};

//////////////////// MediaPipe ////////////////////
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// ★ High five explosion by demi
let handshakeBursted = false; // ★
function sendBurst(x,y){ sendPacket({ type:'burst', x, y }); } // ★

//////////////////// DOM ////////////////////
const gameScreen = document.getElementById('gameScreen') || document.body; // 16:9 container if present
const lobby = document.getElementById('lobby');
const roomsDiv = document.getElementById('rooms');
const newRoomName = document.getElementById('newRoomName');
const createRoomBtn = document.getElementById('createRoomBtn');
const sigStatus = document.getElementById('sigStatus');
const rtcStatus = document.getElementById('rtcStatus');
const gamewrap = document.getElementById('gamewrap');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha:true }); // transparent overlays

const roleChip = document.getElementById('roleChip');
const statusChip = document.getElementById('statusChip');
const scoreHud = document.getElementById('scoreHud');
const waitingPanel = document.getElementById('waitingPanel');
const help = document.getElementById('help');
const toggleDebugBtn = document.getElementById('toggleDebug');
const pauseBtn = document.getElementById('pauseBtn');
const hud = document.getElementById('hud');
const countdownEl = document.getElementById('countdown');

// ★ overlay by demi
const overlayEls = {
  awayScore: document.getElementById('away-score'),
  homeScore: document.getElementById('home-score'),
  awayCity:  document.getElementById('away-city'),
  homeCity:  document.getElementById('home-city'),
  instruction: document.getElementById('instruction'),
  gameOver: document.getElementById('gameover'),
  gameOver2: document.getElementById('gameover2'),
  winner: document.getElementById('winner'),
};

// ★ stage node inside the 16:9 shell by demi
const stageEl = document.getElementById('stage16x9') || gameScreen;
const leftGradient = document.getElementById('left-gradient');
const rightGradient = document.getElementById('right-gradient');

// ★ colors from CSS vars (for paddle tinting) by demi
const _css = getComputedStyle(document.documentElement);
const PONG_BLUE  = (_css.getPropertyValue('--pong-blue')  || '#25AAE6').trim();
const PONG_GREEN = (_css.getPropertyValue('--pong-green') || '#65F0C4').trim();

// ★ FX canvas (sits above game canvas so bursts aren't cleared each frame) by demi
const fxCanvas = document.createElement('canvas');
const fxCtx = fxCanvas.getContext('2d', { alpha:true });
Object.assign(fxCanvas.style, {
  position:'absolute', top:'0', left:'0', width:'100%', height:'100%',
  zIndex:'3', pointerEvents:'none'
});

//////////////////// Video layers (inside #gameScreen, hidden until game) ////////////////////
let vidLayersReady = false;
let leftContainer = null; // container we can flip (you’ve fixed this already)
const localVideo = document.createElement('video');  // RIGHT (self)
localVideo.autoplay = true; localVideo.muted = true; localVideo.playsInline = true;
const remoteVideo = document.createElement('video'); // LEFT (opponent)
remoteVideo.autoplay = true; remoteVideo.muted = true; remoteVideo.playsInline = true;

function ensureVideoLayersCreated() {
  if (vidLayersReady) return;

  (stageEl || gameScreen).style.position = (stageEl || gameScreen).style.position || 'relative';

  // LEFT (opponent)
  leftContainer = document.createElement('div');
  leftContainer.id = 'vidLeft';
  Object.assign(leftContainer.style, {
    position:'absolute', top:'0', left:'0', width:'50%', height:'100%',
    zIndex:'1', overflow:'hidden', background:'#000', pointerEvents:'none', display:'none',
    transform:'scaleX(1)', transformOrigin:'center'
  });
  Object.assign(remoteVideo.style, { width:'100%', height:'100%', objectFit:'cover', display:'block' });
  leftContainer.appendChild(remoteVideo);

  // RIGHT (self)
  const right = document.createElement('div');
  right.id = 'vidRight';
  Object.assign(right.style, {
    position:'absolute', top:'0', left:'50%', width:'50%', height:'100%',
    zIndex:'1', overflow:'hidden', background:'#000', pointerEvents:'none', display:'none'
  });
  Object.assign(localVideo.style, { width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', display:'block' });
  right.appendChild(localVideo);

  // Insert in the 16:9 stage
  (stageEl || gameScreen).prepend(right);
  (stageEl || gameScreen).prepend(leftContainer);

  // game canvas
  Object.assign(canvas.style, { position:'absolute', top:'0', left:'0', width:'100%', height:'100%', zIndex:'2', pointerEvents:'none' });
  // ★ fx canvas above game canvas
  (stageEl || gameScreen).appendChild(fxCanvas);

  if (gamewrap) { gamewrap.style.position='relative'; gamewrap.style.zIndex='4'; }
  if (lobby)    { lobby.style.position='relative'; lobby.style.zIndex='4'; }

  vidLayersReady = true;
}


function showVideoLayers(show) {
  ensureVideoLayersCreated();
  const disp = show ? 'block' : 'none';
  document.getElementById('vidLeft').style.display = disp;
  document.getElementById('vidRight').style.display = disp;
}

// You asked us NOT to touch your flipper. Leaving this **no-op**.
function configureRemoteMirrorForPublisherRole(_publisherRole){ /* no-op per your note */ }

//////////////////// Config ////////////////////
const SIGNAL_URL = 'wss://{INSERT_SERVER_URL_HERE}'; // your signaling server (node server.mjs)
const APP_ID = "{INSERT_CF_SFU_APP_ID_HERE}"; // your Cloudflare Realtime SFU app ID
const APP_TOKEN = "{INSERT_CF_SFU_APP_TOKEN_HERE}"; // your Cloudflare Realtime SFU app token
const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;
const CF_HEADERS = { "Authorization": `Bearer ${APP_TOKEN}`, "Content-Type": "application/json" };

// Game constants & timing
const MODEL_PATH = "/models/hand_landmarker.task";
const FIRST_TO_GOALS = 5;
const PADDLE_LEN = 140, PADDLE_THICK = 22, BALL_RADIUS = 20;
const PHYS_DT = 1/60, SUBSTEPS = 3;
const AUTO_READY_MS = 3000;
const RTC_CONNECT_WATCHDOG_MS = 12000;

//////////////////// Net state ////////////////////
let ws; let roomName = null; let myRole = null; // 'P1' | 'P2'
let pc; let dc; let isPaired = false; let rtcOpen = false;
let countdownRunning = false;
let useWsRelay = false; // gameplay fallback only

// Cloudflare Realtime PCs
let sfuLocalPC = null;      // publish PC
let sfuRemotePC = null;     // subscribe PC
let sfuPublishSessionId = null;
let sfuSubscribeSessionId = null;

//////////////////// Rate limiter (token bucket) ////////////////////
const RATE_MAX_TOKENS = 24;        // burst
const RATE_REFILL_PER_SEC = 72;    // msgs/sec
let rate_tokens = RATE_MAX_TOKENS;
let last_refill = performance.now();
function rateRefill(){ const now=performance.now(); const dt=(now-last_refill)/1000; last_refill=now; rate_tokens=Math.min(RATE_MAX_TOKENS, rate_tokens + RATE_REFILL_PER_SEC*dt); }
function rateTryConsume(n=1){ rateRefill(); if (rate_tokens>=n){ rate_tokens-=n; return true; } return false; }

//////////////////// Game State ////////////////////
const state = {
  phase: 'lobby',
  readyLocal: false,
  readyRemote: false,
  sentReadyTrue: false,

  field: { w:0, h:0, margin:20 },

  ball: { x:0, y:0, r:BALL_RADIUS, vx:-420, vy:180, speedMin:360, speedMax:820 },
  score: { p1:0, p2:0 },

  paddleLocal: null,
  paddleRemote: null,

  lastContact: { nx:0, ny:0, validUntil:0, active:false },

  handDetector: null,
  handLandmarks: null,

  debug: false,
  localStream: null
};

//////////////////// Sizing ////////////////////

function fitCanvas() {
  const host = stageEl || gameScreen || document.body;
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // size canvases (game + fx)
  for (const c of [canvas, fxCanvas]) {
    c.width  = Math.floor(rect.width  * dpr);
    c.height = Math.floor(rect.height * dpr);
    c.style.width  = rect.width + 'px';
    c.style.height = rect.height + 'px';
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  fxCtx.setTransform(dpr,0,0,dpr,0,0);

  // ★ compute actual play area = stage minus bottom scoreboxes (like 15%) and 20px padding all around by demi
  const bottomEl = document.querySelector('.pp-bottom');
  const scoreH = bottomEl ? bottomEl.getBoundingClientRect().height : Math.round(rect.height * 0.15);
  const PAD = 20;

  // these are the REAL bounds for paddles/ball
  state.field.xMin = PAD;
  state.field.xMax = rect.width - PAD;
  state.field.yMin = PAD;
  state.field.yMax = Math.max(PAD+60, rect.height - scoreH - PAD); // keep at least a bit of space

  state.field.w = state.field.xMax - state.field.xMin;
  state.field.h = state.field.yMax - state.field.yMin;
}


window.addEventListener('resize', fitCanvas); fitCanvas();

//////////////////// UI helpers ////////////////////
function showLobby(){ lobby && (lobby.style.display = 'grid'); gamewrap && (gamewrap.style.display = 'none'); showVideoLayers(false); }
function showGame(){  lobby && (lobby.style.display = 'none');  gamewrap && (gamewrap.style.display = 'block'); showVideoLayers(true); ensureLoopStarted(); }
function updateScoreHud(){
  if (scoreHud) scoreHud.textContent = `${state.score.p1} : ${state.score.p2}`;
  // ★ overlay by demi
  if (overlayEls.awayScore) overlayEls.awayScore.textContent = String(state.score.p1);
  if (overlayEls.homeScore) overlayEls.homeScore.textContent = String(state.score.p2);
}

function showGameOverOverlay() {
  const home = overlayEls.homeCity?.textContent || 'HOME';
  const away = overlayEls.awayCity?.textContent || 'AWAY';

  // Which city label corresponds to P1/P2 from *this client’s* POV?
  // P1 client:  P1=home (right), P2=away (left)
  // P2 client:  P1=away (left), P2=home (right)
  const p1City = (myRole === 'P2') ? home : away;
  const p2City = (myRole === 'P2') ? away : home;
  

  const winnerCity = (state.score.p1 > state.score.p2) ? p1City : p2City;
  const name = String(winnerCity).toUpperCase();

    // Color by CITY, not by role:
  // Shanghai = green, New York = red, always.
  let winnerColor = '';
  if (name === 'SHANGHAI') winnerColor = PONG_GREEN;
  else if (name === 'NEW YORK') winnerColor = PONG_BLUE;

  overlayEls.gameOver?.classList.remove('hidden');
  overlayEls.gameOver2?.classList.remove('hidden');
  if (overlayEls.winner) {
    overlayEls.winner.textContent = String(winnerCity).toUpperCase();
    if (winnerColor) overlayEls.winner.style.color = winnerColor;
    overlayEls.winner.classList.remove('hidden');
  }
}



//////////////////// Signaling (WebSocket) ////////////////////
function connectSignaling() {
  log('[WS] connecting to', SIGNAL_URL);
  ws = new WebSocket(SIGNAL_URL);
  ws.onopen = () => { sigStatus && (sigStatus.textContent = 'Signaling: Connected'); log('[WS] open'); ws.send(JSON.stringify({type:'list'})); };
  ws.onclose = (e) => { sigStatus && (sigStatus.textContent = 'Signaling: Disconnected'); warn('[WS] close', e.code, e.reason); };
  ws.onerror = (e) => { sigStatus && (sigStatus.textContent = 'Signaling: Error'); err('[WS] error', e); };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type !== 'rooms' && msg.type !== 'room_update') log('[WS] message:', msg.type, JSON.stringify(msg));

    if (msg.type === 'rooms') renderRooms(msg.rooms);
    if (msg.type === 'room_update') markRoom(msg.room, msg.occupants);
    if (msg.type === 'join_ok') onJoined(msg);
    if (msg.type === 'join_rejected') alert('Room full');
    if (msg.type === 'paired') onPaired();
    if (msg.type === 'peer_left') onPeerLeft();

    if (msg.type === 'signal_offer') onSignalOffer(msg);
    if (msg.type === 'signal_answer') onSignalAnswer(msg);
    if (msg.type === 'signal_ice') onSignalIce(msg);
    if (msg.type === 'ready_state') onReadyRemote(msg);

    if (msg.type === 'relay' && msg.payload) onDataMessage({ data: JSON.stringify(msg.payload) });

    if (msg.type === 'sfu_publish') {
      const publisherRole = msg.role || ((myRole === 'P1') ? 'P2' : 'P1');
      configureRemoteMirrorForPublisherRole(publisherRole); // left as no-op by your direction
      const trackName = Array.isArray(msg.tracks) && msg.tracks.length ? msg.tracks[0].trackName : null;
      if (!trackName) { warn('[SFU] publish missing trackName'); return; }
      ensureSubscribedToRemote(msg.sessionId, trackName).catch(e=>err('[SFU] ensureSubscribed error', e));
    }
  };
}
function renderRooms(list){
  roomsDiv.innerHTML = '';
  if (!list?.length) { roomsDiv.innerHTML = `<div class="room"><span>No rooms yet.</span></div>`; return; }
  for (const r of list){
    const div = document.createElement('div');
    div.className = 'room';
    div.innerHTML = `
      <div>
        <div><b>${r.name}</b></div>
        <span class="small">${r.occupants}/2</span>
      </div>
      <div class="row">
        <button class="btn secondary joinBtn">Join</button>
      </div>`;
    div.querySelector('.joinBtn').onclick = () => joinRoom(r.name);
    roomsDiv.appendChild(div);
  }
}
function markRoom(){}

createRoomBtn?.addEventListener('click', ()=>{ const name = newRoomName.value.trim(); if (!name) return; joinRoom(name); });
function joinRoom(name){ roomName = name; log('[WS] create_or_join', name); ws.send(JSON.stringify({ type:'create_or_join', room:name })); }

function onJoined({room, role}){
  myRole = role;
  roleChip && (roleChip.textContent = `Role: ${role}`);
  log('[ROOM] joined', room, 'as', role);

  ensureVideoLayersCreated();
  fitCanvas();

  // Start DC (P1 offers)
  setupRTC().catch(e=>err('[RTC] setup failed', e));

  showGame();
  state.phase = 'waiting';
  statusChip && (statusChip.textContent = 'Waiting for peer…');

  applyRoleCities();


  // ★ overlay by demi
  overlayEls.gameOver?.classList.add('hidden');
  overlayEls.gameOver2?.classList.add('hidden');
  overlayEls.winner?.classList.add('hidden');
  overlayEls.instruction?.classList.remove('hidden');
  updateScoreHud();

  // Visible defaults so overlays exist before tracking/peer
  setDefaultLocalPaddle();
  setDefaultRemotePaddle();
  centerBall();

  initCamera()
    .then(()=> publishLocalVideoToSFU())
    .then(({ sessionId, trackName })=>{
      log('[SFU] announcing publish to peer', {sessionId, trackName});
      ws.send(JSON.stringify({ type:'sfu_publish', room:roomName, role: myRole, sessionId, tracks:[{ trackName }] }));
    })
    .then(()=> initHands())
    .then(()=> { armHandLoop(); })
    .catch(e=>err('[Startup] media/vision failed', e));
}

function onPaired(){ isPaired = true; statusChip && (statusChip.textContent = 'Peer connected. Establishing RTC…'); startRtcWatchdog(); }
function onPeerLeft(){ statusChip && (statusChip.textContent = 'Peer left. Returning to lobby.'); cleanupRTC(); setTimeout(()=>window.location.reload(), 1200); }

//////////////////// WebRTC DATA (gameplay only) ////////////////////
async function setupRTC(){
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
  if (pc) { cleanupRTC(); }
  pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({type:'signal_ice', candidate:e.candidate, room:roomName})); };
  pc.onconnectionstatechange = ()=>{ rtcStatus && (rtcStatus.textContent = `RTC: ${pc.connectionState}`); };

  if (myRole === 'P1') {
    dc = pc.createDataChannel('game', { ordered:false, maxRetransmits:0 });
    optimizeDataChannel(dc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type:'signal_offer', offer, room:roomName }));
  } else {
    pc.ondatachannel = (ev) => { dc = ev.channel; optimizeDataChannel(dc); };
  }
}
function optimizeDataChannel(channel){
  channel.onopen = ()=>{ rtcOpen = true; try{ channel.bufferedAmountLowThreshold = 1<<14; }catch{} };
  channel.onclose = ()=>{ rtcOpen = false; };
  channel.onerror = ()=>{};
  channel.onmessage = onDataMessage;
}
async function onSignalOffer({offer}){
  if (!pc) await setupRTC();
  try {
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type:'signal_answer', answer, room:roomName }));
  } catch(e){ err('[RTC] handling offer failed', e); }
}
async function onSignalAnswer({answer}){ try { await pc.setRemoteDescription(answer); } catch(e){ err('[RTC] setRemoteDescription(answer) failed', e); } }
async function onSignalIce({candidate}){ try { await pc.addIceCandidate(candidate); } catch(e){ /* ignore */ } }
let rtcWatchdogTid=null;
function startRtcWatchdog(){ clearTimeout(rtcWatchdogTid); rtcWatchdogTid=setTimeout(()=>{ if (!rtcOpen) { useWsRelay = true; rtcStatus && (rtcStatus.textContent='RTC: data via WS'); } }, RTC_CONNECT_WATCHDOG_MS); }

//////////////////// Cloudflare Realtime SFU (video only) ////////////////////
async function createCallsSession(){ const res = await fetch(`${API_BASE}/sessions/new`, { method:'POST', headers: CF_HEADERS }); const js = await res.json(); if(!js.sessionId) throw new Error('SFU: no sessionId'); return js.sessionId; }
async function createPeerConnectionForSFU(label){
  const pc = new RTCPeerConnection({ iceServers: [{ urls:'stun:stun.cloudflare.com:3478' }], bundlePolicy:'max-bundle' });
  pc.oniceconnectionstatechange = () => log(`[SFU-PC:${label}] ice`, pc.iceConnectionState);
  pc.onsignalingstatechange   = () => log(`[SFU-PC:${label}] signaling`, pc.signalingState);
  return pc;
}
async function publishLocalVideoToSFU(){
  sfuPublishSessionId = await createCallsSession();
  sfuLocalPC = await createPeerConnectionForSFU('publish');

  const vTrack = localVideo.srcObject?.getVideoTracks?.()[0];
  if (!vTrack) throw new Error('SFU publish: no local video track');

  const vTx = sfuLocalPC.addTransceiver(vTrack, { direction: 'sendonly' });
  const offer = await sfuLocalPC.createOffer();
  await sfuLocalPC.setLocalDescription(offer);

  const pushResp = await fetch(`${API_BASE}/sessions/${sfuPublishSessionId}/tracks/new`, {
    method:'POST', headers: CF_HEADERS,
    body: JSON.stringify({
      sessionDescription: { sdp: offer.sdp, type:'offer' },
      tracks: [{ location:'local', mid: vTx.mid, trackName: vTrack.id }]
    })
  }).then(r=>r.json());
  if (!pushResp.sessionDescription) throw new Error('SFU push: missing sessionDescription');

  await sfuLocalPC.setRemoteDescription(new RTCSessionDescription(pushResp.sessionDescription));
  return { sessionId: sfuPublishSessionId, trackName: vTrack.id };
}
async function pullRemoteVideoFromSFU({ sessionId, trackName }){
  sfuSubscribeSessionId = await createCallsSession();
  sfuRemotePC = await createPeerConnectionForSFU('subscribe');

  sfuRemotePC.addEventListener('track', ({ track, streams })=>{
    const ms = streams?.[0] || new MediaStream([track]);
    remoteVideo.srcObject = ms;
    remoteVideo.play?.().catch(()=>{});
  });

  const pullResp = await fetch(`${API_BASE}/sessions/${sfuSubscribeSessionId}/tracks/new`, {
    method:'POST', headers: CF_HEADERS,
    body: JSON.stringify({ tracks: [{ location:'remote', trackName, sessionId }] })
  }).then(r=>r.json());

  if (pullResp.sessionDescription?.type === 'offer') {
    await sfuRemotePC.setRemoteDescription(pullResp.sessionDescription);
    const ans = await sfuRemotePC.createAnswer();
    await sfuRemotePC.setLocalDescription(ans);
    await fetch(`${API_BASE}/sessions/${sfuSubscribeSessionId}/renegotiate`, {
      method:'PUT', headers: CF_HEADERS,
      body: JSON.stringify({ sessionDescription: { sdp: ans.sdp, type: 'answer' } })
    });
  } else if (pullResp.requiresImmediateRenegotiation) {
    const pullResp2 = await fetch(`${API_BASE}/sessions/${sfuSubscribeSessionId}/tracks/new`, {
      method:'POST', headers: CF_HEADERS,
      body: JSON.stringify({ tracks: [{ location:'remote', trackName, sessionId }] })
    }).then(r=>r.json());
    await sfuRemotePC.setRemoteDescription(pullResp2.sessionDescription);
    const ans2 = await sfuRemotePC.createAnswer();
    await sfuRemotePC.setLocalDescription(ans2);
    await fetch(`${API_BASE}/sessions/${sfuSubscribeSessionId}/renegotiate`, {
      method:'PUT', headers: CF_HEADERS,
      body: JSON.stringify({ sessionDescription: { sdp: ans2.sdp, type: 'answer' } })
    });
  }
  // wait until drawable
  await new Promise((res, rej)=>{
    const t=setTimeout(()=>rej(new Error('SFU: no video within 8s')),8000);
    (function check(){ if (remoteVideo.videoWidth>0) { clearTimeout(t); res(); } else setTimeout(check,200); })();
  });
}
async function ensureSubscribedToRemote(sessionId, trackName){
  const haveTrack = !!(remoteVideo.srcObject && remoteVideo.srcObject.getVideoTracks && remoteVideo.srcObject.getVideoTracks().length>0);
  if (haveTrack && remoteVideo.videoWidth>0) { log('[SFU] already have remote video'); return; }
  if (sfuRemotePC) { try { sfuRemotePC.close(); } catch{} sfuRemotePC=null; }
  await pullRemoteVideoFromSFU({ sessionId, trackName });
}

//////////////////// Camera (local on RIGHT) ////////////////////
async function initCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{ facingMode:'user', width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30} },
    audio:false
  });
  localVideo.srcObject = stream;
  await new Promise(res => localVideo.onloadedmetadata = res);
  await localVideo.play().catch(()=>{});
  state.localStream = stream;
  log('🎥 Camera ready', localVideo.videoWidth, localVideo.videoHeight);
}

//////////////////// Hands ////////////////////
async function initHands(){
    try {
  const fileset = await FilesetResolver.forVisionTasks("/wasm");
  state.handDetector = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 1
  });

    log('🖐️ HandLandmarker ready (1 hand)');

  } catch(e){

    err('Failed to init HandLandmarker. Check /models and /wasm paths.', e);

    throw e;

  }
}

//////////////////// Drawing & Geometry ////////////////////
function rightHalf(){ return { x: state.field.w*0.5, y:0, w: Math.ceil(state.field.w*0.5), h: state.field.h }; }
function leftHalf(){ return { x: 0, y:0, w: Math.floor(state.field.w*0.5), h: state.field.h }; }

function clearCanvas(){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.restore(); }

function applyRoleCities(){
  if (overlayEls.homeCity && overlayEls.awayCity){
    if (myRole === 'P1'){      // right = NY
      overlayEls.homeCity.textContent = 'NEW YORK';
      overlayEls.awayCity.textContent = 'SHANGHAI';
      leftGradient.style.background = `linear-gradient(to top, rgba(37,170,230,1) 0%, rgba(37,170,230,.7) 5%, rgba(37,170,230,.1) 20%, rgba(37,170,230,0) 50%)`;
      rightGradient.style.background = `linear-gradient(to top, rgba(101,240,196,1) 0%, rgba(101,240,196,.7) 5%, rgba(101,240,196,.1) 20%, rgba(101,240,196,0) 50%)`;
    } else {                   // P2: right = SH
      overlayEls.homeCity.textContent = 'SHANGHAI';
      overlayEls.awayCity.textContent = 'NEW YORK';
      rightGradient.style.background = `linear-gradient(to top, rgba(37,170,230,1) 0%, rgba(37,170,230,.7) 5%, rgba(37,170,230,.1) 20%, rgba(37,170,230,0) 50%)`;
      leftGradient.style.background = `linear-gradient(to top, rgba(101,240,196,1) 0%, rgba(101,240,196,.7) 5%, rgba(101,240,196,.1) 20%, rgba(101,240,196,0) 50%)`;
    }
  }
}


function drawCourt(){
  if (document.getElementById('centerline')) return; // ★ overlay by demi: SVG line is present
  const {w,h}=state.field;
  ctx.setLineDash([10,14]); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke(); ctx.setLineDash([]);
}

function drawBall(){ const b=state.ball; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); }

function drawRotatedPaddle(p, side){
  if (!p) return;
  const L = leftHalf(), R = rightHalf();
  const clip = (side==='left') ? L : R;

  ctx.save();
  ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();

  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  // ★ role-aware tint
  ctx.fillStyle = colorForSide(side);
  ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);

  if (state.debug){
    ctx.strokeStyle='rgba(255,255,255,0.65)'; ctx.lineWidth=2;
    ctx.strokeRect(-p.w/2, -p.h/2, p.w, p.h);
    ctx.beginPath(); ctx.moveTo(-p.w/2, 0); ctx.lineTo(p.w/2, 0); ctx.stroke();
  }
  ctx.restore();
}



// animation helper by demi (fixed to use x,y + fx canvas + color)
function makeStarburst(x, y, options = {}) {
  const cx = x, cy = y;
  return new Promise(resolve => {
    const numLines   = options.numLines   ?? 8;
    const maxDistance= options.maxDistance?? 40;
    const maxLength  = options.maxLength  ?? 15;
    const duration   = options.duration   ?? 250; // ms
    const color      = options.color      ?? "white";
    const lineWidth  = options.lineWidth  ?? 8;

    let startTime = null;

    function draw(progress) {
      fxCtx.strokeStyle = color;
      fxCtx.lineWidth = lineWidth;
      fxCtx.lineCap = "round";

      const centerDist = maxDistance * progress;
      const lineLength = maxLength * 4 * progress * (1 - progress);

      for (let i = 0; i < numLines; i++) {
        const angle = (i / numLines) * Math.PI * 2;
        const dist1 = centerDist - lineLength / 2;
        const dist2 = centerDist + lineLength / 2;

        const x1 = cx + Math.cos(angle) * dist1;
        const y1 = cy + Math.sin(angle) * dist1;
        const x2 = cx + Math.cos(angle) * dist2;
        const y2 = cy + Math.sin(angle) * dist2;

        fxCtx.beginPath();
        fxCtx.moveTo(x1, y1);
        fxCtx.lineTo(x2, y2);
        fxCtx.stroke();
      }
    }

    function animate(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // clear fx layer each frame and redraw
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      draw(progress);

      if (progress < 1) requestAnimationFrame(animate);
      else {
        // final clear so it doesn’t linger
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        resolve();
      }
    }

    requestAnimationFrame(animate);
  });
}


// Defaults so overlays visible before first input
function setDefaultLocalPaddle(){
  const rHalf = rightHalf();
  state.paddleLocal = { x: rHalf.x + rHalf.w*0.75, y: rHalf.h*0.5, w: PADDLE_LEN, h: PADDLE_THICK, angle: Math.PI/2 };
}
function setDefaultRemotePaddle(){
  const lHalf = leftHalf();
  state.paddleRemote = { x: lHalf.w*0.25, y: lHalf.h*0.5, w: PADDLE_LEN, h: PADDLE_THICK, angle: Math.PI/2 };
}
function centerBall(){ state.ball.x = state.field.w*0.5; state.ball.y = state.field.h*0.5; }

//////////////////// Collision / Math ////////////////////
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function mirrorX(x){ return state.field.w - x; }
function mirrorAngle(a){ return -a; }

function collideAndResolveBallPaddle(p, lastContact=state.lastContact) {
  if (!p) return false;
  const b = state.ball;
  const cosA = Math.cos(p.angle), sinA = Math.sin(p.angle);
  const relX = b.x - p.x, relY = b.y - p.y;
  const localX =  cosA*relX + sinA*relY;
  const localY = -sinA*relX + cosA*relY;
  const hx = p.w/2, hy = p.h/2;
  const cx = clamp(localX, -hx, hx);
  const cy = clamp(localY, -hy, hy);
  let dx = localX - cx, dy = localY - cy;
  let dist2 = dx*dx + dy*dy;
  const r = b.r;
  if (dist2 > r*r) return false;
  let pen, nxl, nyl;
  if (dist2 > 1e-8) { const dist = Math.sqrt(dist2); nxl = dx / dist; nyl = dy / dist; pen = r - dist; }
  else { const penX = hx - Math.abs(localX), penY = hy - Math.abs(localY);
         if (penX < penY){ nxl = (localX>0)?1:-1; nyl = 0; pen = r + penX; }
         else            { nxl = 0; nyl = (localY>0)?1:-1; pen = r + penY; } }
  const nx =  cosA*nxl - sinA*nyl, ny =  sinA*nxl + cosA*nyl;
  const now = performance.now();
  let useNx = nx, useNy = ny;
  if (lastContact.active && now < lastContact.validUntil) { useNx = lastContact.nx; useNy = lastContact.ny; }
  else { lastContact.nx = nx; lastContact.ny = ny; lastContact.validUntil = now + 120; lastContact.active = true; }
  const EPS = 0.5;
  b.x += useNx * (pen + EPS);
  b.y += useNy * (pen + EPS);
  const vDotN = (b.vx*useNx + b.vy*useNy);
  if (vDotN < 0) { b.vx = b.vx - 2 * vDotN * useNx; b.vy = b.vy - 2 * vDotN * useNy; }
  const speed = Math.min(Math.hypot(b.vx,b.vy)*1.03, state.ball.speedMax);
  const vmag = Math.hypot(b.vx,b.vy) || 1;
  b.vx = (b.vx / vmag) * speed; b.vy = (b.vy / vmag) * speed;
  return true;
}

//////////////////// PIXEL-BASED NETCODE (event-based ball) ////////////////////
function sendPacket(obj){
  if (!rateTryConsume(1)) return;
  if (dc && dc.readyState === 'open') {
    if (dc.bufferedAmount > (1<<20)) return;
    dc.send(JSON.stringify(obj));
  } else if (useWsRelay) {
    ws?.send(JSON.stringify({ type:'relay', room:roomName, payload: obj }));
  }
}

function onDataMessage(ev){
  const m = JSON.parse(ev.data);

  if (m.type === 'paddle') {                      // pixels from peer POV (mirrored already)
    state.paddleRemote = m.paddle;
    return;
  }

  if (m.type === 'burst'){
    const x = (myRole === 'P2') ? mirrorX(m.x) : m.x; // ★ mirror for P2
    makeStarburst(x, m.y).catch(()=>{});
    return;
  }

  if (m.type === 'ball_event' && myRole === 'P2') {
    // Mirror ball event to P2 POV
    state.ball.x  = mirrorX(m.ball.x);
    state.ball.y  = m.ball.y;
    state.ball.vx = -m.ball.vx;
    state.ball.vy =  m.ball.vy;
    return;
  }

  if (m.type === 'score')   {
    state.score.p1 = m.score.p1;
    state.score.p2 = m.score.p2;
    updateScoreHud();
    return; }

    if (m.type === 'game_over') {
  state.phase = 'finished';

  // Use final scores from host
  if (m.score) {
    state.score.p1 = m.score.p1 | 0;
    state.score.p2 = m.score.p2 | 0;
    updateScoreHud();
  }

  statusChip && (statusChip.textContent =
    (state.score.p1 > state.score.p2) ? 'P1 wins!' : 'P2 wins!');

  showGameOverOverlay();
  return;
}

  if (m.type === 'start' && state.phase!=='playing') {
    state.phase='playing';
    waitingPanel?.classList.add('hidden');
    help?.classList.remove('hidden'); hud?.classList.remove('hidden'); scoreHud?.classList.remove('hidden');
    statusChip && (statusChip.textContent='Playing');
    overlayEls.instruction?.classList.add('hidden');
    return;
  }
}

function sendBallEvent(){ if (myRole!=='P1') return; const b=state.ball; sendPacket({ type:'ball_event', ball:{ x:b.x, y:b.y, vx:b.vx, vy:b.vy } }); }
function sendScore(){ if (myRole!=='P1') return; sendPacket({ type:'score', score:{ p1:state.score.p1, p2:state.score.p2 }}); }
function sendGameOver(){ sendPacket({ type:'game_over', score:{ p1:state.score.p1, p2:state.score.p2 }}); }
function sendStart(){ sendPacket({ type:'start' }); }

// Paddle: mirror to opponent POV in pixels, throttle/delta
let lastPaddleSent = { x:0, y:0, angle:0, t:0 };
const PADDLE_HZ = 22, PADDLE_MIN_DT = 1000/PADDLE_HZ, PADDLE_MIN_DPIX = 3, PADDLE_MIN_DA = 0.04;
function maybeSendPaddle(){
  const p = state.paddleLocal; const now=performance.now();
  if (!p) return;
  const mirrored = { x: mirrorX(p.x), y: p.y, w:p.w, h:p.h, angle: mirrorAngle(p.angle) };

  const dX = Math.abs(p.x - lastPaddleSent.x);
  const dY = Math.abs(p.y - lastPaddleSent.y);
  const dA = Math.abs(p.angle - lastPaddleSent.angle);
  const dt = now - lastPaddleSent.t;
  if (dt < PADDLE_MIN_DT && dX < PADDLE_MIN_DPIX && dY < PADDLE_MIN_DPIX && dA < PADDLE_MIN_DA) return;

  sendPacket({ type:'paddle', paddle: mirrored });
  lastPaddleSent = { x: p.x, y: p.y, angle: p.angle, t: now };
}

// ★ role-aware colors (NY=blue, SH=green) by demi
function colorForSide(side){
  // For P1 POV: RIGHT = NY(blue), LEFT = SH(green)
  // For P2 POV: RIGHT = SH(green), LEFT = NY(blue)
  const rightColor = (myRole === 'P1') ? PONG_BLUE : PONG_GREEN;
  const leftColor  = (myRole === 'P1') ? PONG_GREEN : PONG_BLUE;
  return (side === 'right') ? rightColor : leftColor;
}

//////////////////// Readiness & handshake ////////////////////
function setLocalReady(val){
  if (state.sentReadyTrue && !val) return;
  if (state.readyLocal === val) return;
  state.readyLocal = val; if (val) state.sentReadyTrue = true;
  ws.send(JSON.stringify({ type:'ready_state', room:roomName, ready:val }));
}
function onReadyRemote({ready}){
  state.readyRemote = !!ready;
  if (state.phase==='waiting' && (rtcOpen || useWsRelay) && isPaired) maybeStartHandshake();
}
let autoReadyTid=null;
function armAutoReady(){ clearTimeout(autoReadyTid); autoReadyTid=setTimeout(()=>{ if (!state.readyLocal) setLocalReady(true); }, AUTO_READY_MS); }
function maybeStartHandshake(){
  if (state.phase!=='waiting') return;
  if (!(rtcOpen || useWsRelay) || !isPaired) return;
  armAutoReady();
  const t = setInterval(()=>{
    const both = !!(state.readyLocal && state.readyRemote);

    // ★ fire handshake burst once
    if (both && !handshakeBursted && state.paddleLocal && state.paddleRemote) {
      handshakeBursted = true;
      const x = (state.paddleLocal.x + state.paddleRemote.x) * 0.5;
      const y = (state.paddleLocal.y + state.paddleRemote.y) * 0.5;
      makeStarburst(x, y, { numLines:12, maxDistance:50, maxLength:22, duration:320 }).catch(()=>{});
      sendBurst(x, y);
    }

    if (both) {
      clearInterval(t);
      if (!countdownRunning && myRole==='P1') startCountdown();
    }
  }, 150);
}


//////////////////// Hand inference loop ////////////////////
let handLoopArmed = false;
function armHandLoop(){
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;
  if (handLoopArmed) return; handLoopArmed = true;
  let frameSkip = 0; // ~15Hz if 30fps feed
  const step = ()=>{
    if (state.phase!=='lobby' && state.handDetector){
      try {
        if ((frameSkip++ & 1) === 0) {
          const res = state.handDetector.detectForVideo(localVideo, performance.now());
          state.handLandmarks = (res?.landmarks && res.landmarks[0]) || null;
          if (state.handLandmarks) state.paddleLocal = paddleFromHand(state.handLandmarks);
          if (!state.paddleLocal) setDefaultLocalPaddle(); // keep visible
          const ready = isPaddleNearCenter(state.paddleLocal); if (ready) setLocalReady(true);
        }
        maybeSendPaddle();
      } catch(e){}
    }
    localVideo.requestVideoFrameCallback(()=>step());
  };
  localVideo.requestVideoFrameCallback(()=>step());
}


function paddleFromHand(hand){
  if (!hand) return null;
  const rHalf = rightHalf();
  const vw = Math.max(1, localVideo.videoWidth), vh = Math.max(1, localVideo.videoHeight);
  const rt = rHalf.w / rHalf.h, rs = vw / vh;
  let sx, sy, sw, sh;
  if (rs > rt) { sh = vh; sw = Math.round(vh*rt); sx = Math.round((vw - sw)/2); sy = 0; }
  else { sw = vw; sh = Math.round(vw/rt); sx = 0; sy = Math.round((vh - sh)/2); }

  const map = (pt)=> {
    const srcX = pt.x * vw, srcY = pt.y * vh;
    const u = (srcX - sx) / sw, v = (srcY - sy) / sh;
    const uu = Math.min(1, Math.max(0, u)), vv = Math.min(1, Math.max(0, v));
    const x_nom = rHalf.x + uu * rHalf.w;
    const x = rHalf.x + rHalf.w - (x_nom - rHalf.x); // mirror self into right half
    const y = rHalf.y + vv * rHalf.h;                 // ★ offset by play area top
    return { x, y };
  };

  const wrist  = map(hand[0]);
  const midTip = map(hand[12]);
  const midMCP = map(hand[9]);

  let ax = midTip.x - wrist.x, ay = midTip.y - wrist.y, length = Math.hypot(ax, ay);
  if (!isFinite(length) || length < 1){ ax = midMCP.x - wrist.x; ay = midMCP.y - wrist.y; length = Math.hypot(ax, ay); }
  const angle = Math.atan2(ay, ax);
  let cx = (wrist.x + midTip.x) * 0.5, cy = (wrist.y + midTip.y) * 0.5;

  const halfW = PADDLE_LEN/2, halfH = PADDLE_THICK/2;
  cx = clamp(cx, rHalf.x + halfW, rHalf.x + rHalf.w - halfW);
  cy = clamp(cy, rHalf.y + halfH, rHalf.y + rHalf.h - halfH);
  if (cx < rHalf.x - halfW) return null;
  return { x:cx, y:cy, w:PADDLE_LEN, h:PADDLE_THICK, angle };
}


function isPaddleNearCenter(p){ if (!p) return false; const centerX = state.field.w * 0.5; return Math.abs(p.x - centerX) < 120; }

//////////////////// Game loop (event-based) ////////////////////
let lastTime=0, acc=0, rafId=0, frameCounter=0, lastFpsUpdate=performance.now();
let loopStarted = false;
function ensureLoopStarted(){ if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); } }

function drawFrame(){
  clearCanvas();         // full clear (fixes ghosting)
  drawCourt();

  if (!state.paddleLocal)  setDefaultLocalPaddle();
  if (!state.paddleRemote) setDefaultRemotePaddle();

  drawRotatedPaddle(state.paddleRemote, 'left');
  drawRotatedPaddle(state.paddleLocal,  'right');
  drawBall();

  const now=performance.now(); frameCounter++;
  if (now - lastFpsUpdate > 500){
    const fps = Math.round(frameCounter*1000/(now-lastFpsUpdate));
    frameCounter=0; lastFpsUpdate=now;
    const fpsEl = document.getElementById('fps'); if (fpsEl) fpsEl.textContent = `fps: ${fps}`;
  }
}

// walls & scoring use play bounds
function wallsAndEvents_P1(){
  const b = state.ball; let bounced=false, scored=null;
  if (b.y - b.r < state.field.yMin){ b.y = state.field.yMin + b.r; b.vy = Math.abs(b.vy); state.lastContact.active=false; bounced=true; }
  if (b.y + b.r > state.field.yMax){ b.y = state.field.yMax - b.r; b.vy = -Math.abs(b.vy); state.lastContact.active=false; bounced=true; }
  if (b.x < state.field.xMin - b.r - 4){ scored = scoreSide('left'); }
  if (b.x > state.field.xMax + b.r + 4){ scored = scoreSide('right'); }
  return {bounced, scored};
}

function scoreSide(side) {
  // if left side is breached, p1 scores (keep your original semantics)
  const who = side === 'left' ? 'p2' : 'p1';
  state.score[who]++;
  updateScoreHud();

  // keep your role-based "who scored" flag
  return (myRole === 'P1')
    ? who
    : (who === 'p1' ? 'p2' : 'p1');
}

function resetBall(dir=-1){
  const b=state.ball;
  b.x = state.field.xMin + state.field.w*0.5;
  b.y = state.field.yMin + state.field.h*0.5;
  const ang=(Math.random()*0.5 - 0.25), speed=460;
  b.vx = dir*speed*Math.cos(ang); b.vy = speed*Math.sin(ang); state.lastContact.active=false;
  b.visible = true; // ★ show again after serve
}

function checkGameOver(){
  if (state.score.p1 >= FIRST_TO_GOALS || state.score.p2 >= FIRST_TO_GOALS) {
    state.phase='finished';
    statusChip && (statusChip.textContent=(state.score.p1>state.score.p2)?'P1 wins!' : 'P2 wins!');
    sendGameOver();
    showGameOverOverlay();
    return true;   // ★ signal that the game is done
  }
  return false;
}

async function substep_P1(dt){
  const b=state.ball; b.x += b.vx * dt; b.y += b.vy * dt;

  let collided=false;
  if (state.paddleRemote) collided = collideAndResolveBallPaddle(state.paddleRemote) || collided;
  if (state.paddleLocal)  collided = collideAndResolveBallPaddle(state.paddleLocal)  || collided;

  if (collided) sendBallEvent();

  const {bounced, scored} = wallsAndEvents_P1();
  if (bounced) sendBallEvent();

  if (scored){
    // ★ starburst at spikes edge, hide ball, broadcast burst
    const edgeX = (myRole==='P2') ? ((scored==='p1') ? state.field.xMin : state.field.xMax)
                                 : ((scored==='p1') ? state.field.xMax : state.field.xMin);
    // const y = b.y;
    // if 
    // const edgeX = (scored==='p1') ? state.field.xMin : state.field.xMax;
    const y = b.y;
    state.ball.visible = false;
    sendScore();
    sendBurst(edgeX, y);
    await makeStarburst(edgeX, y, { duration:350, numLines:12, maxDistance:56, maxLength:24 });

    if (checkGameOver()) return;

    const dir = (scored==='p1') ? +1 : -1;
    resetBall(dir);
    sendBallEvent();      // on serve
  }
}


async function gameStep_P1(dt){ const h=dt/SUBSTEPS; for (let i=0;i<SUBSTEPS;i++) await substep_P1(h); }

function loop(tsMs){
  if (state.phase==='lobby') return;
  const t = tsMs/1000; if (!lastTime) lastTime = t;
  let frameTime = t - lastTime; if (frameTime > 0.25) frameTime = 0.25;
  lastTime = t; acc += frameTime;

  (async () => {
    while (acc >= PHYS_DT) {
      if (state.phase === 'playing') {
        if (myRole === 'P1') { await gameStep_P1(PHYS_DT); }
        else { state.ball.x += state.ball.vx * PHYS_DT; state.ball.y += state.ball.vy * PHYS_DT; } // P2 integrates locally
      }
      acc -= PHYS_DT;
    }
    drawFrame();
    rafId = requestAnimationFrame(loop);
  })();
}

//////////////////// Countdown & controls ////////////////////
toggleDebugBtn?.addEventListener('click', ()=>{ state.debug = !state.debug; });
pauseBtn?.addEventListener('click', ()=>{ try{ ws?.send(JSON.stringify({type:'leave'})); }catch{} showVideoLayers(false); window.location.reload(); });

function startCountdown(){
  if (countdownRunning) return; countdownRunning = true;
  state.phase='sync';
  waitingPanel?.classList.add('hidden'); countdownEl && (countdownEl.style.display='block');
  let n=3; if (countdownEl) countdownEl.textContent = n;
  const tid = setInterval(()=>{
    n--; if (countdownEl) countdownEl.textContent = (n>0? n : '');
    if (n<=0) {
      clearInterval(tid);
      overlayEls.instruction?.classList.add('hidden');
      countdownEl && (countdownEl.style.display='none');
      state.phase='playing';
      statusChip && (statusChip.textContent='Playing');
      help?.classList.remove('hidden'); hud?.classList.remove('hidden'); scoreHud?.classList.remove('hidden');
      if (myRole==='P1'){ resetBall(-1); sendBallEvent(); sendStart(); }
    }
  }, 1000);
}

//////////////////// Cleanup ////////////////////
function cleanupRTC(){
  try { if (dc) { dc.onopen=dc.onclose=dc.onmessage=dc.onerror=null; dc.close(); } } catch {}
  try { if (pc) { pc.onicecandidate=null; pc.close(); } } catch {}
  try { if (sfuLocalPC)  { sfuLocalPC.close();  sfuLocalPC=null; } } catch {}
  try { if (sfuRemotePC) { sfuRemotePC.close(); sfuRemotePC=null; } } catch {}
  dc=null; pc=null; rtcOpen=false; useWsRelay=false;
  clearTimeout(rtcWatchdogTid);
  clearTimeout(autoReadyTid);
}

//////////////////// Boot ////////////////////
ensureVideoLayersCreated(); // built but hidden
fitCanvas();
connectSignaling();
showLobby();

document.addEventListener('keydown',(e)=>{
  if (e.key==='f'||e.key==='F'){
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
  }
  if (e.key==='p'||e.key==='P'||e.key==='Escape') pauseBtn?.click();
  if (e.key==='d'||e.key==='D') toggleDebugBtn?.click();
});

// If CSS toggles #gamewrap visibility, still ensure loop & layers turn on
const visObs = new MutationObserver(()=>{
  if (gamewrap?.style.display === 'block') {
    state.phase = 'waiting';
    waitingPanel?.classList.remove('hidden');
    hud?.classList.remove('hidden');
    help?.classList.add('hidden');
    scoreHud?.classList.remove('hidden');
    updateScoreHud();
    showVideoLayers(true);
    ensureLoopStarted();
    visObs.disconnect();
  }
});
visObs.observe(gamewrap || document.body, { attributes:true, attributeFilter:['style'] });
