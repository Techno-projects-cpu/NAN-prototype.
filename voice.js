/* =========================================================
   Voice — WebRTC mesh audio. Every participant connects
   directly to every other participant; signaling (offers/
   answers/ICE) is relayed through the Room's WebSocket.
   Fine up to ~20 people per the room cap; push-to-talk is
   offered to keep things listenable at the higher end.
   ========================================================= */
const NZVoice = (() => {

  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  let localStream = null;
  let micEnabled = false;
  let pushToTalk = false;
  const peers = new Map();      // clientId -> RTCPeerConnection
  const remoteAudioEls = new Map(); // clientId -> <audio>

  async function enableMic(){
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setTrackEnabled(!pushToTalk); // open mic unless push-to-talk mode is on
    return localStream;
  }

  function setTrackEnabled(on){
    localStream?.getAudioTracks().forEach(t => { t.enabled = on; });
    micEnabled = on;
  }

  function setPushToTalk(on){
    pushToTalk = on;
    if (localStream) setTrackEnabled(!on); // start muted in PTT mode until key is held
  }

  function holdToTalk(active){
    if (!pushToTalk || !localStream) return;
    setTrackEnabled(active);
  }

  function toggleMute(){
    const newEnabledState = !micEnabled;
    setTrackEnabled(newEnabledState);
    NZRoom.sendMuteState(!newEnabledState);
    return newEnabledState;
  }

  function createPeer(peerId, isInitiator){
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(peerId, pc);

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) NZRoom.sendSignal(peerId, { kind: 'ice', candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      let audioEl = remoteAudioEls.get(peerId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        remoteAudioEls.set(peerId, audioEl);
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = e.streams[0];
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        NZRoom.sendSignal(peerId, { kind: 'offer', sdp: pc.localDescription });
      };
    }

    return pc;
  }

  async function handleSignal(msg){
    const { from, data } = msg;
    let pc = peers.get(from);

    if (data.kind === 'offer') {
      if (!pc) pc = createPeer(from, false);
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      NZRoom.sendSignal(from, { kind: 'answer', sdp: pc.localDescription });
    } else if (data.kind === 'answer') {
      await pc?.setRemoteDescription(data.sdp);
    } else if (data.kind === 'ice') {
      try { await pc?.addIceCandidate(data.candidate); } catch { /* benign if pc already closed */ }
    }
  }

  /** Called whenever room presence changes; connects to any new peer with a lower id
   *  to avoid both sides simultaneously initiating (classic WebRTC glare). */
  function syncPeers(participants){
    const myId = NZ.room.clientId;
    const otherIds = participants.map(p => p.id).filter(id => id !== myId);

    otherIds.forEach(id => {
      if (peers.has(id)) return;
      const shouldInitiate = myId < id;
      createPeer(id, shouldInitiate);
    });

    // tear down peers who left
    for (const id of peers.keys()) {
      if (!otherIds.includes(id)) {
        peers.get(id)?.close();
        peers.delete(id);
        remoteAudioEls.get(id)?.remove();
        remoteAudioEls.delete(id);
      }
    }
  }

  function teardownAll(){
    peers.forEach(pc => pc.close());
    peers.clear();
    remoteAudioEls.forEach(el => el.remove());
    remoteAudioEls.clear();
    localStream?.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  NZRoom.on('signal', handleSignal);
  NZRoom.on('presence', (summary) => {
    if (summary.participants) syncPeers(summary.participants);
  });

  return {
    enableMic, setPushToTalk, holdToTalk, toggleMute, teardownAll,
    get micEnabled(){ return micEnabled; },
    get pushToTalk(){ return pushToTalk; },
  };
})();
