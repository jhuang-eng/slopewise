/* tutor.js
   connection layer for tutor mode: a room code, a peer to peer link, a
   tiny message bus, and video/audio calls. 

   needs peerjs loaded first:
     <script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
     <script src="tutor.js"></script>

   usage:
     tutor.host((status, info) => ...)            tutor side
         status 'waiting' gives info = the 4 letter code to read out
     tutor.join('AB7K', (status, info) => ...)    student side
     tutor.on('chat', msg => ...)                 handle one message type
     tutor.send('chat', { text: 'hi' })           send one message
     tutor.sendMedia(stream)                      send your camera and mic
     tutor.onMedia(stream => ..., () => ...)      the other side's video, and when it ends
     tutor.leave()                                close everything

   statuses: 'waiting', 'connected', 'closed', 'error' (info = error type)

   video works as two one-way calls: each side calls the other with its
   own stream and answers the other's call without sending anything back.
   that way either person can turn their camera on or off on their own
*/

const tutor = (() => {
  const PREFIX = 'slopewise-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I, L
  const CONNECT_MS = 15000;

  // relay servers for networks that block direct connections.
  // paste the turn entries from your metered.ca dashboard here.
  // left empty, peerjs uses its own default servers
  const ICE_SERVERS = [];
  const PEER_OPTS = ICE_SERVERS.length ? { config: { iceServers: ICE_SERVERS } } : {};
  const handlers = {};
  const calls = new Set();
  let peer = null;
  let conn = null;
  let remoteId = null;
  let report = () => {};
  let onStream = () => {};
  let onStreamEnd = () => {};
  let connectTimer = null;

  function makeCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
  }

  // attaches listeners to a data connection, whichever side opened it
  function wire(c) {
    conn = c;
    remoteId = c.peer;
    c.on('open', () => {
      clearTimeout(connectTimer);
      report('connected');
    });
    c.on('data', msg => {
      // anything arriving here is untrusted, so check its shape first
      if (!msg || typeof msg.type !== 'string') return;
      const handler = handlers[msg.type];
      if (handler) handler(msg);
    });
    c.on('close', () => report('closed'));
    c.on('error', err => report('error', err.type || String(err)));
  }

  // incoming video: answer without a stream, so this side only receives
  function listen() {
    peer.on('call', call => {
      // only take calls from the person on the other end of the data link
      if (call.peer !== remoteId) {
        call.close();
        return;
      }
      calls.add(call);
      call.answer();
      call.on('stream', stream => onStream(stream));
      call.on('close', () => {
        calls.delete(call);
        onStreamEnd();
      });
      call.on('error', () => onStreamEnd());
    });
  }

  function host(onStatus, attempt = 0) {
    leave();
    report = onStatus;
    const code = makeCode();
    peer = new Peer(PREFIX + code, PEER_OPTS);
    listen();

    peer.on('open', () => report('waiting', code));

    peer.on('connection', c => {
      // one student at a time, a second connection is turned away
      if (conn && conn.open) {
        c.close();
        return;
      }
      wire(c);
    });

    peer.on('error', err => {
      // the code was already taken, so try a fresh one
      if (err.type === 'unavailable-id' && attempt < 5) {
        host(onStatus, attempt + 1);
        return;
      }
      report('error', err.type);
    });
  }

  function join(code, onStatus) {
    leave();
    report = onStatus;
    peer = new Peer(PEER_OPTS);
    listen();

    // if the link never opens, say so instead of hanging on connecting
    connectTimer = setTimeout(() => {
      if (!conn || !conn.open) report('error', 'timeout');
    }, CONNECT_MS);

    peer.on('open', () => {
      wire(peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true }));
    });

    // a wrong code shows up here as 'peer-unavailable'
    peer.on('error', err => {
      clearTimeout(connectTimer);
      report('error', err.type);
    });
  }

  // type goes last so a payload can never overwrite it
  function send(type, payload = {}) {
    if (!conn || !conn.open) return false;
    conn.send({ ...payload, type });
    return true;
  }

  function on(type, handler) {
    handlers[type] = handler;
  }

  function sendMedia(stream) {
    if (!peer || !remoteId || !conn || !conn.open) return null;
    const call = peer.call(remoteId, stream);
    if (!call) return null;
    calls.add(call);
    call.on('close', () => calls.delete(call));
    return call;
  }

  function onMedia(streamHandler, endHandler) {
    onStream = streamHandler;
    onStreamEnd = endHandler;
  }

  function leave() {
    clearTimeout(connectTimer);
git add tutor.js index.html room.js
git commit -m "Tutor mode connect timeout, relay server slot, Desmos key"
git push    for (const call of calls) call.close();
    calls.clear();
    if (conn) conn.close();
    if (peer) peer.destroy();
    conn = null;
    peer = null;
    remoteId = null;
  }

  return {
    host, join, send, on, leave, sendMedia, onMedia,
    isOpen: () => !!(conn && conn.open)
  };
})();
