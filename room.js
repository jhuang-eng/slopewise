/* room.js
   tutor mode once two people are connected: a shared whiteboard that
   takes images, a shared desmos calculator, video and audio, and text
   chat. everything travels over the peer to peer link in tutor.js, so
   nothing is uploaded or stored on a server. 

   messages (every one is checked before use, since it comes from
   another browser):
     wb-hello                          student asks for the current board
     wb-sync   {items, calc}           tutor replies with the whole board
     wb-begin  {id, c, w, p}           a stroke starts
     wb-pts    {id, pts}               more points for a stroke in progress
     wb-image  {id, src, x, y, w, h}   an image was added
     wb-move   {id, x, y}              an image was dragged
     wb-erase  {id}                    one stroke or image was removed
     wb-clear                          everything was removed
     calc      {state}                 desmos state after a change
     chat      {text}
     media-off                         the other side stopped their camera

   the board has a fixed logical size, 1600 by 1000, so a stroke lands
   in the same place on a phone and a laptop
*/

const Room = (() => {
  const LW = 1600;
  const LH = 1000;
  const PEN = 6;
  const HIT = 14;
  const MAX_ITEMS = 3000;
  const MAX_IMAGE_CHARS = 3.5e6;
  const COLORS = ['--ink', '--accent', '--bad', '--good'];
  const COLOR_NAMES = ['Black', 'Blue', 'Red', 'Green'];

  // desmos's public demo key. it works, but desmos asks that a real
  // product request its own key. swap it here once you have one
  const DESMOS_KEY = 'dcb31709b452b1cf9dc26972add0fda6';
  const DESMOS_SRC = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${DESMOS_KEY}`;

  let el = null;
  let canvas, ctx, wrap, calcEl, vLocal, vRemote, remoteTile, chatLog;
  let role = null;
  let active = false;

  let items = [];              // strokes and images, in draw order
  const byId = new Map();
  const images = new Map();    // id -> decoded image, ready to draw
  const mine = [];             // ids made on this side, newest last, for undo
  let tool = 'pen';
  let color = 0;
  let drawing = null;
  let dragging = null;
  let outbox = [];
  let flushTimer = null;
  let dirty = false;
  let seq = 0;
  let clearArmed = 0;

  let calc = null;
  let calcLoading = false;
  let pendingCalc = null;
  let lastCalc = '';
  let calcTimer = null;

  let local = null;
  let outCall = null;

  const $r = sel => el.querySelector(sel);
  const send = (type, payload) => (typeof tutor !== 'undefined' ? tutor.send(type, payload) : false);
  const newId = () => (role === 'tutor' ? 't' : 's') + Date.now().toString(36) + (seq++).toString(36);
  const round = v => Math.round(v * 10) / 10;

  /* ---------------------------------------------------------------
     checks for anything that arrives from the other browser
     --------------------------------------------------------------- */

  const okId = v => typeof v === 'string' && v.length > 0 && v.length <= 40;
  const okNum = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e5;
  const okPt = p => Array.isArray(p) && p.length === 2 && okNum(p[0]) && okNum(p[1]);
  const okPts = a => Array.isArray(a) && a.length <= 4000 && a.every(okPt);
  const okColor = c => Number.isInteger(c) && c >= 0 && c < COLORS.length;
  // only plain raster images, never svg, which can carry script
  const okSrc = s => typeof s === 'string' && s.length < MAX_IMAGE_CHARS &&
    /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);

  function cleanItem(o) {
    if (!o || typeof o !== 'object' || !okId(o.id)) return null;
    if (o.type === 'stroke' && okColor(o.c) && okNum(o.w) && o.w > 0 && o.w <= 40 && okPts(o.pts) && o.pts.length) {
      return { type: 'stroke', id: o.id, c: o.c, w: o.w, pts: o.pts.map(p => [p[0], p[1]]) };
    }
    if (o.type === 'image' && okSrc(o.src) && [o.x, o.y, o.w, o.h].every(okNum) && o.w > 0 && o.h > 0) {
      return { type: 'image', id: o.id, src: o.src, x: o.x, y: o.y, w: o.w, h: o.h };
    }
    return null;
  }

  /* ---------------------------------------------------------------
     board state
     --------------------------------------------------------------- */

  function add(item) {
    if (byId.has(item.id) || items.length >= MAX_ITEMS) return false;
    items.push(item);
    byId.set(item.id, item);
    if (item.type === 'image') decode(item);
    schedule();
    return true;
  }

  function remove(id) {
    if (!byId.has(id)) return false;
    items = items.filter(it => it.id !== id);
    byId.delete(id);
    images.delete(id);
    schedule();
    return true;
  }

  function wipe() {
    items = [];
    byId.clear();
    images.clear();
    mine.length = 0;
    schedule();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function decode(item) {
    loadImage(item.src).then(img => {
      if (byId.get(item.id) === item) {
        images.set(item.id, img);
        schedule();
      }
    }).catch(() => remove(item.id));
  }

  /* ---------------------------------------------------------------
     drawing the board
     --------------------------------------------------------------- */

  function resizeCanvas() {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.width * (LH / LW) * dpr);
    draw();
  }

  function schedule() {
    if (dirty || !canvas) return;
    dirty = true;
    requestAnimationFrame(() => {
      dirty = false;
      draw();
    });
  }

  function draw() {
    if (!canvas.width) return;
    const css = getComputedStyle(document.documentElement);
    const token = name => css.getPropertyValue(name).trim();
    const s = canvas.width / LW;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = token('--paper');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    // graph-paper grid, every 50 units
    ctx.strokeStyle = token('--grid');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 50; x < LW; x += 50) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LH);
    }
    for (let y = 50; y < LH; y += 50) {
      ctx.moveTo(0, y);
      ctx.lineTo(LW, y);
    }
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const it of items) {
      if (it.type === 'image') {
        const img = images.get(it.id);
        if (img) ctx.drawImage(img, it.x, it.y, it.w, it.h);
        continue;
      }
      ctx.strokeStyle = token(COLORS[it.c]);
      ctx.lineWidth = it.w;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      // a single tap still leaves a dot
      if (it.pts.length === 1) ctx.lineTo(it.pts[0][0] + 0.1, it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();
    }

    // outline the image being dragged
    if (dragging) {
      const { img } = dragging;
      ctx.strokeStyle = token('--accent');
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 10]);
      ctx.strokeRect(img.x, img.y, img.w, img.h);
      ctx.setLineDash([]);
    }
  }

  /* ---------------------------------------------------------------
     pen, eraser, and move tools
     --------------------------------------------------------------- */

  function toBoard(e) {
    const r = canvas.getBoundingClientRect();
    return [round(((e.clientX - r.left) / r.width) * LW), round(((e.clientY - r.top) / r.height) * LH)];
  }

  function segDist(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function hits(it, p) {
    if (it.type === 'image') {
      return p[0] >= it.x && p[0] <= it.x + it.w && p[1] >= it.y && p[1] <= it.y + it.h;
    }
    const reach = it.w / 2 + HIT;
    if (it.pts.length === 1) return Math.hypot(p[0] - it.pts[0][0], p[1] - it.pts[0][1]) <= reach;
    for (let i = 1; i < it.pts.length; i++) {
      if (segDist(p, it.pts[i - 1], it.pts[i]) <= reach) return true;
    }
    return false;
  }

  // topmost first, so the eraser takes what is visibly on top
  function itemAt(p, onlyImages) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (onlyImages && it.type !== 'image') continue;
      if (hits(it, p)) return it;
    }
    return null;
  }

  function eraseAt(p) {
    const it = itemAt(p, false);
    if (it && remove(it.id)) send('wb-erase', { id: it.id });
  }

  // points go out in small batches, so the other side sees the stroke
  // being drawn without one message per pixel
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (drawing && outbox.length) {
      send('wb-pts', { id: drawing.id, pts: outbox });
      outbox = [];
    }
  }

  function onDown(e) {
    if (!active || e.button > 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toBoard(e);

    if (tool === 'pen') {
      drawing = { type: 'stroke', id: newId(), c: color, w: PEN, pts: [p] };
      add(drawing);
      mine.push(drawing.id);
      send('wb-begin', { id: drawing.id, c: color, w: PEN, p });
    } else if (tool === 'erase') {
      eraseAt(p);
    } else {
      const img = itemAt(p, true);
      if (img) dragging = { img, dx: p[0] - img.x, dy: p[1] - img.y, sent: 0 };
      schedule();
    }
  }

  function onMove(e) {
    if (!active) return;
    const p = toBoard(e);

    if (drawing) {
      const last = drawing.pts[drawing.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2 || drawing.pts.length >= 4000) return;
      drawing.pts.push(p);
      outbox.push(p);
      if (!flushTimer) flushTimer = setTimeout(flush, 40);
      schedule();
    } else if (tool === 'erase' && e.buttons) {
      eraseAt(p);
    } else if (dragging) {
      dragging.img.x = round(p[0] - dragging.dx);
      dragging.img.y = round(p[1] - dragging.dy);
      const now = performance.now();
      if (now - dragging.sent > 60) {
        dragging.sent = now;
        send('wb-move', { id: dragging.img.id, x: dragging.img.x, y: dragging.img.y });
      }
      schedule();
    }
  }

  function onUp() {
    if (drawing) {
      flush();
      drawing = null;
    }
    if (dragging) {
      send('wb-move', { id: dragging.img.id, x: dragging.img.x, y: dragging.img.y });
      dragging = null;
      schedule();
    }
  }

  function undo() {
    while (mine.length) {
      const id = mine.pop();
      if (remove(id)) {
        send('wb-erase', { id });
        return;
      }
    }
  }

  // clearing wipes both screens, so it takes a second tap
  function clearBoard() {
    const btn = $r('#wb-clear');
    if (Date.now() - clearArmed > 3000) {
      clearArmed = Date.now();
      btn.textContent = 'Tap again to clear';
      setTimeout(() => {
        if (Date.now() - clearArmed >= 3000) btn.textContent = 'Clear';
      }, 3000);
      return;
    }
    clearArmed = 0;
    btn.textContent = 'Clear';
    wipe();
    send('wb-clear', {});
  }

  function setTool(next) {
    tool = next;
    wrap.dataset.tool = next;
    el.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === next)));
  }

  function setColor(i) {
    color = i;
    setTool('pen');
    el.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.color === i)));
  }

  /* ---------------------------------------------------------------
     images: dropped, pasted, or picked from a file
     shrunk to 1280 px on the long side before sending, so a phone
     photo goes from a few MB to a few hundred KB
     --------------------------------------------------------------- */

  function note(text) {
    const n = $r('#wb-note');
    n.textContent = text;
    n.hidden = !text;
  }

  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');

      // keep png for screenshots and diagrams if it stays small
      if (file.type === 'image/png') {
        g.drawImage(img, 0, 0, c.width, c.height);
        const png = c.toDataURL('image/png');
        if (png.length < 1.2e6) return png;
      }

      // jpeg has no transparency, so paint white underneath first
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/jpeg', 0.82);
      if (out.length > 1.2e6) out = c.toDataURL('image/jpeg', 0.6);
      return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function addImageFile(file) {
    if (!active || !file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      note('Only PNG, JPEG, WebP, or GIF images work here.');
      return;
    }
    if (file.size > 25e6) {
      note('That image is over 25 MB. Try a smaller one or a screenshot.');
      return;
    }
    note('Adding image…');

    try {
      const src = await shrink(file);
      if (!okSrc(src)) throw new Error('too big');
      const img = await loadImage(src);
      const k = Math.min((LW * 0.6) / img.naturalWidth, (LH * 0.6) / img.naturalHeight);
      const w = round(img.naturalWidth * k);
      const h = round(img.naturalHeight * k);
      const item = { type: 'image', id: newId(), src, x: round((LW - w) / 2), y: round((LH - h) / 2), w, h };

      add(item);
      images.set(item.id, img);
      mine.push(item.id);
      send('wb-image', { id: item.id, src, x: item.x, y: item.y, w, h });
      note('');
      setTool('move');
    } catch (e) {
      note('That image couldn’t be added. Try another file.');
    }
  }

  /* ---------------------------------------------------------------
     desmos calculator, kept in sync both ways
     --------------------------------------------------------------- */

  function loadCalc() {
    if (calc || calcLoading) return;
    if (window.Desmos) {
      makeCalc();
      return;
    }
    calcLoading = true;
    const s = document.createElement('script');
    s.src = DESMOS_SRC;
    s.async = true;
    s.onload = () => {
      calcLoading = false;
      makeCalc();
    };
    s.onerror = () => {
      calcLoading = false;
      calcEl.innerHTML = '<p class="calc-off">The calculator couldn’t load. Check your internet, or open desmos.com/calculator in another tab.</p>';
    };
    document.head.appendChild(s);
  }

  function makeCalc() {
    if (!window.Desmos || calc) return;
    calcEl.textContent = '';
    calc = Desmos.GraphingCalculator(calcEl, { keypad: true, settingsMenu: false, border: false });

    // send changes after a short pause. comparing against the last
    // state seen keeps an applied remote change from echoing back
    calc.observeEvent('change', () => {
      clearTimeout(calcTimer);
      calcTimer = setTimeout(() => {
        const state = calc.getState();
        const json = JSON.stringify(state);
        if (json === lastCalc) return;
        lastCalc = json;
        send('calc', { state });
      }, 300);
    });

    if (pendingCalc) {
      applyCalc(pendingCalc);
      pendingCalc = null;
    }
  }

  function applyCalc(state) {
    if (!state || typeof state !== 'object') return;
    if (!calc) {
      pendingCalc = state;
      return;
    }
    try {
      lastCalc = JSON.stringify(state);
      calc.setState(state, { allowUndo: true });
      lastCalc = JSON.stringify(calc.getState());
    } catch (e) {
      // a state this version of desmos can't read is ignored
    }
  }

  function toggleCalc() {
    calcEl.hidden = !calcEl.hidden;
    $r('#calc-toggle').setAttribute('aria-pressed', String(!calcEl.hidden));
    if (!calcEl.hidden) {
      loadCalc();
      if (calc) calc.resize();
    }
  }

  /* ---------------------------------------------------------------
     video and audio
     --------------------------------------------------------------- */

  function avError(text) {
    const n = $r('#av-err');
    n.textContent = text;
    n.hidden = !text;
  }

  function updateAV() {
    const on = !!local;
    const mic = on && local.getAudioTracks()[0];
    const cam = on && local.getVideoTracks()[0];
    $r('#av-start').hidden = on;
    $r('#av-mic').hidden = !mic;
    $r('#av-cam').hidden = !cam;
    $r('#av-stop').hidden = !on;
    if (mic) $r('#av-mic').textContent = mic.enabled ? 'Mute' : 'Unmute';
    if (cam) $r('#av-cam').textContent = cam.enabled ? 'Camera off' : 'Camera on';
    $r('#tile-local').classList.toggle('live', !!cam && cam.enabled);
  }

  async function startAV() {
    avError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      avError('This browser can’t use a camera here. Try Chrome or Safari on the https:// version of the site.');
      return;
    }

    try {
      local = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        avError('Camera and mic are blocked. Allow them in your browser’s site settings, then try again.');
        return;
      }
      // no camera, or it is busy: fall back to audio only
      try {
        local = await navigator.mediaDevices.getUserMedia({ audio: true });
        avError('No camera available, so this is audio only.');
      } catch (e2) {
        avError('Couldn’t start the camera or mic. Close other apps that might be using them and try again.');
        return;
      }
    }

    vLocal.srcObject = local;
    vLocal.play().catch(() => {});
    outCall = tutor.sendMedia(local);
    if (!outCall) avError('Video couldn’t connect. The board and chat still work.');
    updateAV();
  }

  function stopAV(quiet) {
    if (local) local.getTracks().forEach(t => t.stop());
    local = null;
    if (outCall) outCall.close();
    outCall = null;
    vLocal.srcObject = null;
    if (!quiet) send('media-off', {});
    updateAV();
  }

  function toggleTrack(kind) {
    if (!local) return;
    const tracks = kind === 'audio' ? local.getAudioTracks() : local.getVideoTracks();
    tracks.forEach(t => { t.enabled = !t.enabled; });
    updateAV();
  }

  function showRemote(stream) {
    vRemote.srcObject = stream;
    remoteTile.classList.add('live');
    // browsers block sound until the person interacts, so offer a button
    vRemote.play().then(() => { $r('#tile-play').hidden = true; })
      .catch(() => { $r('#tile-play').hidden = false; });
  }

  function clearRemote() {
    vRemote.srcObject = null;
    remoteTile.classList.remove('live');
    $r('#tile-play').hidden = true;
  }

  /* ---------------------------------------------------------------
     chat
     --------------------------------------------------------------- */

  function addChat(who, text, self) {
    const li = document.createElement('li');
    if (self) li.className = 'me';
    const b = document.createElement('b');
    b.textContent = who;
    const span = document.createElement('span');
    span.textContent = text;
    li.append(b, span);
    chatLog.append(li);
    while (chatLog.children.length > 200) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  const otherName = () => (role === 'tutor' ? 'Student' : 'Tutor');

  /* ---------------------------------------------------------------
     incoming messages
     --------------------------------------------------------------- */

  function listen() {
    tutor.on('wb-hello', () => {
      if (!active || role !== 'tutor') return;
      send('wb-sync', { items, calc: calc ? calc.getState() : pendingCalc });
    });

    tutor.on('wb-sync', m => {
      if (!active || role !== 'student' || !Array.isArray(m.items)) return;
      wipe();
      m.items.slice(0, MAX_ITEMS).forEach(o => {
        const it = cleanItem(o);
        if (it) add(it);
      });
      if (m.calc) applyCalc(m.calc);
    });

    tutor.on('wb-begin', m => {
      if (!active || !okId(m.id) || !okColor(m.c) || !okNum(m.w) || m.w <= 0 || m.w > 40 || !okPt(m.p)) return;
      add({ type: 'stroke', id: m.id, c: m.c, w: m.w, pts: [[m.p[0], m.p[1]]] });
    });

    tutor.on('wb-pts', m => {
      if (!active || !okId(m.id) || !okPts(m.pts)) return;
      const it = byId.get(m.id);
      if (!it || it.type !== 'stroke' || it.pts.length + m.pts.length > 4000) return;
      m.pts.forEach(p => it.pts.push([p[0], p[1]]));
      schedule();
    });

    tutor.on('wb-image', m => {
      if (!active) return;
      const it = cleanItem({ ...m, type: 'image' });
      if (it) add(it);
    });

    tutor.on('wb-move', m => {
      if (!active || !okId(m.id) || !okNum(m.x) || !okNum(m.y)) return;
      const it = byId.get(m.id);
      if (!it || it.type !== 'image') return;
      it.x = m.x;
      it.y = m.y;
      schedule();
    });

    tutor.on('wb-erase', m => {
      if (active && okId(m.id)) remove(m.id);
    });

    tutor.on('wb-clear', () => {
      if (active) wipe();
    });

    tutor.on('calc', m => {
      if (!active || !m.state || typeof m.state !== 'object') return;
      if (JSON.stringify(m.state).length > 500000) return;
      applyCalc(m.state);
    });

    tutor.on('chat', m => {
      if (!active || typeof m.text !== 'string') return;
      const text = m.text.trim().slice(0, 500);
      if (text) addChat(otherName(), text, false);
    });

    tutor.on('media-off', () => {
      if (active) clearRemote();
    });

    tutor.onMedia(stream => {
      if (active) showRemote(stream);
    }, clearRemote);
  }

  /* ---------------------------------------------------------------
     building the room once, and opening and closing it
     --------------------------------------------------------------- */

  function build() {
    el = document.getElementById('room');
    if (!el || typeof tutor === 'undefined') return false;

    const swatches = COLORS.map((c, i) =>
      `<button class="swatch" data-color="${i}" aria-pressed="${i === 0}" aria-label="${COLOR_NAMES[i]} pen" style="background:var(${c})"></button>`
    ).join('');

    el.innerHTML = `
      <div class="room-grid">
        <div class="room-main">
          <div class="wb-tools" role="toolbar" aria-label="Whiteboard tools">
            <button class="tool" data-tool="pen" aria-pressed="true">Pen</button>
            <button class="tool" data-tool="erase" aria-pressed="false">Eraser</button>
            <button class="tool" data-tool="move" aria-pressed="false">Move image</button>
            <span class="swatches">${swatches}</span>
            <button class="tool" id="wb-image">Add image</button>
            <input type="file" id="wb-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <button class="tool" id="wb-undo">Undo</button>
            <button class="tool" id="wb-clear">Clear</button>
            <button class="tool" id="calc-toggle" aria-pressed="false">Calculator</button>
          </div>
          <p class="small muted" id="wb-note" hidden></p>
          <div class="wb-wrap" id="wb-wrap" data-tool="pen">
            <canvas id="wb" aria-label="Shared whiteboard. Drop or paste an image to add it."></canvas>
            <div class="wb-drop" id="wb-drop" hidden>Drop the image to add it</div>
          </div>
          <div class="calc" id="calc" hidden></div>
        </div>
        <aside class="room-side">
          <div class="av">
            <div class="tile" id="tile-remote">
              <video id="v-remote" autoplay playsinline></video>
              <span class="tile-empty">${otherName()}'s camera is off</span>
              <button class="tile-play" id="tile-play" hidden>Tap to hear and see</button>
              <span class="tile-lbl" id="lbl-remote">${otherName()}</span>
            </div>
            <div class="tile" id="tile-local">
              <video id="v-local" autoplay playsinline muted></video>
              <span class="tile-empty">Your camera is off</span>
              <span class="tile-lbl">You</span>
            </div>
          </div>
          <div class="row av-ctl">
            <button class="btn" id="av-start">Start camera and mic</button>
            <button class="btn quiet" id="av-mic" hidden>Mute</button>
            <button class="btn quiet" id="av-cam" hidden>Camera off</button>
            <button class="btn quiet" id="av-stop" hidden>End video</button>
          </div>
          <p class="small err" id="av-err" hidden></p>
          <div class="chat">
            <ol id="chat-log" aria-live="polite" aria-label="Chat messages"></ol>
            <form id="chat-form">
              <input type="text" id="chat-input" maxlength="500" autocomplete="off" placeholder="Message" aria-label="Message">
              <button class="btn" type="submit">Send</button>
            </form>
          </div>
        </aside>
      </div>`;

    canvas = $r('#wb');
    ctx = canvas.getContext('2d');
    wrap = $r('#wb-wrap');
    calcEl = $r('#calc');
    vLocal = $r('#v-local');
    vRemote = $r('#v-remote');
    remoteTile = $r('#tile-remote');
    chatLog = $r('#chat-log');

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    el.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
    el.querySelectorAll('[data-color]').forEach(b => { b.onclick = () => setColor(+b.dataset.color); });
    $r('#wb-undo').onclick = undo;
    $r('#wb-clear').onclick = clearBoard;
    $r('#calc-toggle').onclick = toggleCalc;
    $r('#wb-image').onclick = () => $r('#wb-file').click();
    $r('#wb-file').onchange = e => {
      addImageFile(e.target.files[0]);
      e.target.value = '';
    };

    // drag and drop onto the board
    const drop = $r('#wb-drop');
    const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    wrap.addEventListener('dragover', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      drop.hidden = false;
    });
    wrap.addEventListener('dragleave', () => { drop.hidden = true; });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      drop.hidden = true;
      addImageFile(e.dataTransfer.files[0]);
    });

    // pasting a screenshot anywhere while the room is open adds it
    document.addEventListener('paste', e => {
      if (!active || el.hidden || !e.clipboardData) return;
      const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      addImageFile(file);
    });

    $r('#av-start').onclick = startAV;
    $r('#av-stop').onclick = () => stopAV(false);
    $r('#av-mic').onclick = () => toggleTrack('audio');
    $r('#av-cam').onclick = () => toggleTrack('video');
    $r('#tile-play').onclick = () => {
      vRemote.play().then(() => { $r('#tile-play').hidden = true; }).catch(() => {});
    };

    $r('#chat-form').onsubmit = e => {
      e.preventDefault();
      const input = $r('#chat-input');
      const text = input.value.trim().slice(0, 500);
      if (!text) return;
      if (send('chat', { text })) addChat('You', text, true);
      input.value = '';
    };

    new ResizeObserver(() => { if (!el.hidden) resizeCanvas(); }).observe(wrap);
    listen();
    return true;
  }

  function open(asRole) {
    if (!el && !build()) return;
    role = asRole;
    active = true;
    wipe();
    chatLog.textContent = '';
    note('');
    avError('');
    setTool('pen');
    $r('#lbl-remote').textContent = otherName();
    remoteTile.querySelector('.tile-empty').textContent = `${otherName()}'s camera is off`;
    clearRemote();
    updateAV();
    if (calc && calc.setBlank) calc.setBlank();
    lastCalc = '';
    pendingCalc = null;
    loadCalc();
    if (role === 'student') send('wb-hello', {});
  }

  function close() {
    if (!el) return;
    active = false;
    stopAV(true);
    clearRemote();
    wipe();
    el.hidden = true;
  }

  function show(visible) {
    if (!el) return;
    el.hidden = !(visible && active);
    if (el.hidden) return;
    resizeCanvas();
    if (calc && !calcEl.hidden) calc.resize();
    if (vRemote.srcObject) vRemote.play().catch(() => {});
  }

  return {
    // built at page load so incoming messages always have a handler
    init: () => { if (!el) build(); },
    open,
    close,
    show,
    available: () => typeof tutor !== 'undefined' && !!document.getElementById('room'),
    // used by the automated tests
    _state: () => ({ items, calc, local, tool })
  };
})();
