/* =========================================================
   Chat — renders incoming room chat messages and sends
   outgoing ones. Purely a rendering layer over NZRoom.
   ========================================================= */
const NZChat = (() => {

  function escapeHtml(s){
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function appendMessage({ from, name, text, ts }){
    const list = NZ.els.chatMessages;
    if (!list) return;
    const mine = from === NZ.room.clientId;
    const row = document.createElement('div');
    row.className = 'chat-msg' + (mine ? ' chat-msg-mine' : '');
    const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    row.innerHTML = `
      <span class="chat-msg-name">${escapeHtml(name)}</span>
      <span class="chat-msg-time">${time}</span>
      <div class="chat-msg-text">${escapeHtml(text)}</div>
    `;
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function clear(){
    if (NZ.els.chatMessages) NZ.els.chatMessages.innerHTML = '';
  }

  function renderParticipants(participants){
    const list = NZ.els.participantList;
    if (!list) return;
    list.innerHTML = '';
    participants.forEach(p => {
      const li = document.createElement('li');
      li.className = 'participant-item';
      li.innerHTML = `
        <span class="participant-dot ${p.muted ? '' : 'speaking-enabled'}"></span>
        <span class="participant-name">${escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="participant-badge">HOST</span>' : ''}
      `;
      list.appendChild(li);
    });
  }

  NZRoom.on('chat', appendMessage);
  NZRoom.on('presence', (summary) => {
    if (summary.participants) renderParticipants(summary.participants);
  });

  return { appendMessage, clear, renderParticipants };
})();
