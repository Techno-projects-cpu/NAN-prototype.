/* =========================================================
   Room — Watch Party session management. Talks to the
   Render backend over WebSocket for presence, sync, chat,
   and relays WebRTC signaling to NZVoice.
   ========================================================= */
const NZRoom = (() => {

  const listeners = { chat: [], presence: [], loadMedia: [], sync: [], signal: [] };
  function on(event, fn){ listeners[event]?.push(fn); }
  function emit(event, data){ listeners[event]?.forEach(fn => fn(data)); }

  function httpBase(){ return NZ_CONFIG.BACKEND_URL.replace(/\/$/, ''); }
  function wsBase(){ return httpBase().replace(/^http/, 'ws'); }

  async function createRoom(){
    const res = await fetch(`${httpBase()}/rooms`, { method: 'POST' });
    if (!res.ok) throw new Error('Could not reach the Watch Party server.');
    const { code } = await res.json();
    return code;
  }

  function connect(code, name){
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBase()}/ws`);
      NZ.room.ws = ws;
      NZ.room.code = code.toUpperCase();

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'join', code: NZ.room.code, name }));
      });

      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case 'joined':
            NZ.room.clientId = msg.clientId;
            NZ.room.connected = true;
            applyPresence(msg.room);
            resolve(msg.room);
            break;
          case 'presence':
            applyPresence(msg.room);
            break;
          case 'chat':
            emit('chat', msg);
            break;
          case 'load-media':
            emit('loadMedia', msg.media);
            break;
          case 'sync':
            emit('sync', msg); // only received when we are NOT host (server enforces this)
            break;
          case 'signal':
            emit('signal', msg);
            break;
          case 'error':
            reject(new Error(msg.reason));
            break;
          default:
            break;
        }
      });

      ws.addEventListener('close', () => {
        NZ.room.connected = false;
        emit('presence', { participants: [] });
      });

      ws.addEventListener('error', () => reject(new Error('Connection to Watch Party server failed.')));
    });
  }

  function applyPresence(roomSummary){
    NZ.room.participants = roomSummary.participants || [];
    NZ.room.isHost = roomSummary.hostId === NZ.room.clientId;
    emit('presence', roomSummary);
  }

  function leave(){
    NZ.room.ws?.close();
    NZ.room.ws = null;
    NZ.room.code = null;
    NZ.room.clientId = null;
    NZ.room.isHost = false;
    NZ.room.participants = [];
    NZ.room.connected = false;
  }

  function sendChat(text){
    if (!NZ.room.ws) return;
    NZ.room.ws.send(JSON.stringify({ type: 'chat', text }));
  }

  /** Host calls this whenever the transport changes; non-hosts never call it. */
  function sendSync(action, payload){
    if (!NZ.room.ws || !NZ.room.isHost) return;
    NZ.room.ws.send(JSON.stringify({ type: 'sync', action, payload }));
  }

  function sendSignal(to, data){
    if (!NZ.room.ws) return;
    NZ.room.ws.send(JSON.stringify({ type: 'signal', to, data }));
  }

  function sendMuteState(muted){
    if (!NZ.room.ws) return;
    NZ.room.ws.send(JSON.stringify({ type: 'mute', muted }));
  }

  async function uploadHostFile(file){
    const form = new FormData();
    form.append('media', file);
    const res = await fetch(`${httpBase()}/rooms/${NZ.room.code}/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('Upload failed.');
    const { url, kind } = await res.json();
    return { url: `${httpBase()}${url}`, kind };
  }

  return {
    on, createRoom, connect, leave, sendChat, sendSync, sendSignal, sendMuteState, uploadHostFile,
  };
})();
