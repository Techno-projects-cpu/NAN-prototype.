/* =========================================================
   Main — wires DOM references and all UI event listeners.
   ========================================================= */
(function init(){

  /* ---------- splash screen: hold for a beat, then fade ---------- */
  const SPLASH_HOLD_MS = 2200;
  const splash = document.getElementById('splash');
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 600);
  }, SPLASH_HOLD_MS);

  /* ---------- collect DOM refs into NZ.els ---------- */
  const ids = [
    'stageWrap','stage','videoEl','audioEl','subtitleOverlay','dropZone','loadingStreak',
    'stageClickTarget','centerFlash','seekBar','seekBuffered','seekFill','seekHandle',
    'timeCurrent','timeDuration','prevBtn','playBtn','nextBtn','stopBtn','muteBtn',
    'volumeSlider','nowPlaying','rateBtn','eqQuickBtn','ccBtn','loopBtn','shuffleBtn',
    'pipBtn','fullscreenBtn','playlistList','playlistCount','clearPlaylistBtn',
    'addToPlaylistBtn','infoTitle','infoFormat','infoDuration','infoResolution','infoSource',
    'eqDrawer','eqEnableToggle','closeEqBtn','eqPresets','eqBands','eqPreamp','eqPreampValue',
    'filterDrawer','closeFilterBtn','resetFilterBtn','filterBody',
    'urlModalBackdrop','urlInput','urlCancelBtn','urlOpenBtn',
    'fileInput','folderInput','subInput',
    'openFileBtn','openFolderBtn','openUrlBtn','snapshotBtn','addSubBtn',
    'menuLoopOff','menuLoopOne','menuLoopAll','menuShuffle',
    'subOffsetPlus','subOffsetMinus','subTrackList','toggleEqBtn','toggleFilterBtn',
    'themeMenu',
    'createRoomBtn','joinRoomBtn','copyRoomLinkBtn','leaveRoomBtn','shareFileToRoomBtn',
    'roomBadge','roomBadgeCode','roomBadgeCount',
    'roomNotJoined','roomJoined','roomEmptyCreateBtn','roomEmptyJoinBtn',
    'participantList','micToggleBtn','pttToggle',
    'chatMessages','chatInput','chatSendBtn',
    'createRoomModalBackdrop','createRoomNameInput','createRoomCancelBtn','createRoomConfirmBtn',
    'joinRoomModalBackdrop','joinRoomCodeInput','joinRoomNameInput','joinRoomCancelBtn','joinRoomConfirmBtn',
    'roomCreatedModalBackdrop','roomCodeDisplay','roomCreatedCopyBtn','roomCreatedDoneBtn',
  ];
  ids.forEach(id => { NZ.els[id] = document.getElementById(id); });
  NZ.els.video = NZ.els.videoEl;
  NZ.els.audio = NZ.els.audioEl;

  NZPlayerCore.bindTransportEvents(NZ.els.video);
  NZPlayerCore.bindTransportEvents(NZ.els.audio);
  NZShortcuts.bind();

  /* ---------- file / folder / url opening ---------- */
  function ingestFilesAndPlay(fileList, autoplayFirstNew){
    const before = NZ.playlist.length;
    NZPlaylist.addFiles(fileList);
    if (autoplayFirstNew) NZPlayerCore.loadIndex(before, true);
  }

  NZ.els.openFileBtn.addEventListener('click', () => NZ.els.fileInput.click());
  NZ.els.openFolderBtn.addEventListener('click', () => NZ.els.folderInput.click());
  NZ.els.addToPlaylistBtn.addEventListener('click', () => NZ.els.fileInput.click());

  NZ.els.fileInput.addEventListener('change', (e) => {
    if (!e.target.files.length) return;
    ingestFilesAndPlay(e.target.files, NZ.currentIndex === -1);
    e.target.value = '';
  });
  NZ.els.folderInput.addEventListener('change', (e) => {
    const media = Array.from(e.target.files).filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
    if (!media.length) return;
    ingestFilesAndPlay(media, NZ.currentIndex === -1);
    e.target.value = '';
  });

  NZ.els.openUrlBtn.addEventListener('click', () => NZ.els.urlModalBackdrop.classList.add('open'));
  NZ.els.urlCancelBtn.addEventListener('click', () => NZ.els.urlModalBackdrop.classList.remove('open'));
  NZ.els.urlOpenBtn.addEventListener('click', () => {
    const url = NZ.els.urlInput.value.trim();
    if (!url) return;
    const item = NZPlaylist.addUrl(url);
    NZPlayerCore.loadIndex(NZ.playlist.indexOf(item), true);
    NZ.els.urlInput.value = '';
    NZ.els.urlModalBackdrop.classList.remove('open');
  });
  NZ.els.urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') NZ.els.urlOpenBtn.click(); });

  /* ---------- drag & drop onto the stage ---------- */
  ['dragover','dragenter'].forEach(evt => NZ.els.stage.addEventListener(evt, (e) => {
    e.preventDefault();
    NZ.els.dropZone.classList.add('drag-over');
  }));
  ['dragleave','drop'].forEach(evt => NZ.els.stage.addEventListener(evt, (e) => {
    e.preventDefault();
    NZ.els.dropZone.classList.remove('drag-over');
  }));
  NZ.els.stage.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
    if (files.length) ingestFilesAndPlay(files, NZ.currentIndex === -1);
  });

  /* ---------- transport controls ---------- */
  NZ.els.stageClickTarget.addEventListener('click', () => NZPlayerCore.playPause());
  NZ.els.playBtn.addEventListener('click', () => NZPlayerCore.playPause());
  NZ.els.stopBtn.addEventListener('click', () => NZPlayerCore.stop());
  NZ.els.nextBtn.addEventListener('click', () => NZPlayerCore.next());
  NZ.els.prevBtn.addEventListener('click', () => NZPlayerCore.prev());
  NZ.els.muteBtn.addEventListener('click', () => NZPlayerCore.toggleMute());
  NZ.els.fullscreenBtn.addEventListener('click', () => NZPlayerCore.toggleFullscreen());
  NZ.els.pipBtn.addEventListener('click', () => NZPlayerCore.togglePip());
  NZ.els.snapshotBtn.addEventListener('click', () => NZPlayerCore.takeSnapshot());

  NZ.els.volumeSlider.addEventListener('input', (e) => {
    NZPlayerCore.setVolume(Number(e.target.value) / 100);
  });

  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  let rateIdx = 2;
  NZ.els.rateBtn.addEventListener('click', () => {
    rateIdx = (rateIdx + 1) % RATES.length;
    NZPlayerCore.setRate(RATES[rateIdx]);
    NZ.els.rateBtn.textContent = `${RATES[rateIdx]}x`;
  });

  /* ---------- seek bar ---------- */
  function seekFromEvent(e){
    const rect = NZ.els.seekBar.getBoundingClientRect();
    const frac = nzClamp((e.clientX - rect.left) / rect.width, 0, 1);
    NZPlayerCore.seekTo(frac);
    NZ.els.seekFill.style.width = `${frac * 100}%`;
    NZ.els.seekHandle.style.left = `${frac * 100}%`;
  }
  NZ.els.seekBar.addEventListener('mousedown', (e) => {
    NZ.isSeeking = true;
    seekFromEvent(e);
    const onMove = (ev) => seekFromEvent(ev);
    const onUp = () => {
      NZ.isSeeking = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  /* ---------- loop / shuffle ---------- */
  const loopCycle = ['off', 'all', 'one'];
  const loopIcons = { off: '⟲', all: '🔁', one: '🔂' };
  NZ.els.loopBtn.addEventListener('click', () => {
    const idx = (loopCycle.indexOf(NZ.loopMode) + 1) % loopCycle.length;
    NZ.loopMode = loopCycle[idx];
    NZ.els.loopBtn.textContent = loopIcons[NZ.loopMode];
    NZ.els.loopBtn.classList.toggle('active', NZ.loopMode !== 'off');
  });
  NZ.els.menuLoopOff.addEventListener('click', () => { NZ.loopMode = 'off'; NZ.els.loopBtn.textContent = loopIcons.off; NZ.els.loopBtn.classList.remove('active'); });
  NZ.els.menuLoopOne.addEventListener('click', () => { NZ.loopMode = 'one'; NZ.els.loopBtn.textContent = loopIcons.one; NZ.els.loopBtn.classList.add('active'); });
  NZ.els.menuLoopAll.addEventListener('click', () => { NZ.loopMode = 'all'; NZ.els.loopBtn.textContent = loopIcons.all; NZ.els.loopBtn.classList.add('active'); });

  NZ.els.shuffleBtn.addEventListener('click', () => {
    NZ.shuffle = !NZ.shuffle;
    NZ.els.shuffleBtn.classList.toggle('active', NZ.shuffle);
    NZ.els.menuShuffle.textContent = `Shuffle: ${NZ.shuffle ? 'On' : 'Off'}`;
  });
  NZ.els.menuShuffle.addEventListener('click', () => NZ.els.shuffleBtn.click());

  /* ---------- playlist footer ---------- */
  NZ.els.clearPlaylistBtn.addEventListener('click', () => NZPlaylist.clear());

  /* ---------- sidebar tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab' + btn.dataset.tab[0].toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active');
    });
  });

  /* ---------- subtitles ---------- */
  NZ.els.addSubBtn.addEventListener('click', () => NZ.els.subInput.click());
  NZ.els.subInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const track = await NZSubtitles.loadFromFile(file);
    const item = nzActiveItem();
    if (item) item.subtitleTrack = track;
    NZSubtitles.setActiveTrack(track);
    NZ.els.subTrackList.textContent = track.label;
    e.target.value = '';
  });
  NZ.els.subOffsetPlus.addEventListener('click', () => { NZ.subtitleOffset += 0.5; });
  NZ.els.subOffsetMinus.addEventListener('click', () => { NZ.subtitleOffset -= 0.5; });
  let subtitlesVisible = true;
  NZ.els.ccBtn.classList.add('active');
  NZ.els.ccBtn.addEventListener('click', () => {
    subtitlesVisible = !subtitlesVisible;
    NZ.els.subtitleOverlay.style.display = subtitlesVisible ? 'block' : 'none';
    NZ.els.ccBtn.classList.toggle('active', subtitlesVisible);
  });

  /* ---------- equalizer drawer ---------- */
  NZ.els.toggleEqBtn.addEventListener('click', () => openDrawer(NZ.els.eqDrawer));
  NZ.els.eqQuickBtn.addEventListener('click', () => openDrawer(NZ.els.eqDrawer));
  NZ.els.closeEqBtn.addEventListener('click', () => closeDrawer(NZ.els.eqDrawer));

  NZ.els.eqEnableToggle.addEventListener('change', (e) => {
    NZEqualizer.setEnabled(e.target.checked);
    NZ.els.eqQuickBtn.classList.toggle('active', e.target.checked);
  });

  Object.keys(NZEqualizer.PRESETS).forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'eq-preset-btn' + (name === 'Flat' ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      NZEqualizer.applyPreset(name);
      document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEqSliders();
    });
    NZ.els.eqPresets.appendChild(btn);
  });

  function renderEqSliders(){
    NZ.els.eqBands.innerHTML = '';
    NZEqualizer.BANDS_HZ.forEach((hz, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'eq-band';
      const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
      wrap.innerHTML = `
        <input type="range" min="-20" max="20" step="1" value="${NZEqualizer.bandGains[i]}" />
        <span class="eq-band-label">${label}</span>
        <span class="eq-band-value">${NZEqualizer.bandGains[i]} dB</span>
      `;
      const input = wrap.querySelector('input');
      const valueEl = wrap.querySelector('.eq-band-value');
      input.addEventListener('input', () => {
        NZEqualizer.setBand(i, Number(input.value));
        valueEl.textContent = `${input.value} dB`;
      });
      NZ.els.eqBands.appendChild(wrap);
    });
  }
  renderEqSliders();

  NZ.els.eqPreamp.addEventListener('input', (e) => {
    NZEqualizer.setPreamp(Number(e.target.value));
    NZ.els.eqPreampValue.textContent = `${e.target.value} dB`;
  });

  /* ---------- video adjustments drawer ---------- */
  NZ.els.toggleFilterBtn.addEventListener('click', () => openDrawer(NZ.els.filterDrawer));
  NZ.els.closeFilterBtn.addEventListener('click', () => closeDrawer(NZ.els.filterDrawer));
  NZ.els.resetFilterBtn.addEventListener('click', () => { NZFilters.reset(); renderFilterSliders(); });

  const FILTER_DEFS = [
    { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
    { key: 'contrast', label: 'Contrast', min: 0, max: 200, unit: '%' },
    { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
    { key: 'hue', label: 'Hue rotate', min: -180, max: 180, unit: '°' },
    { key: 'gamma', label: 'Gamma', min: 50, max: 200, unit: '%' },
  ];
  function renderFilterSliders(){
    NZ.els.filterBody.innerHTML = '';
    FILTER_DEFS.forEach(def => {
      const row = document.createElement('div');
      row.className = 'filter-row';
      row.innerHTML = `
        <div class="filter-row-head"><span>${def.label}</span><span class="filter-row-val">${NZ.filters[def.key]}${def.unit}</span></div>
        <input type="range" min="${def.min}" max="${def.max}" value="${NZ.filters[def.key]}" />
      `;
      const input = row.querySelector('input');
      const val = row.querySelector('.filter-row-val');
      input.addEventListener('input', () => {
        NZFilters.set(def.key, Number(input.value));
        val.textContent = `${input.value}${def.unit}`;
      });
      NZ.els.filterBody.appendChild(row);
    });
  }
  renderFilterSliders();

  function openDrawer(drawer){
    document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
    drawer.classList.add('open');
  }
  function closeDrawer(drawer){ drawer.classList.remove('open'); }

  /* ---------- theme switching ---------- */
  NZ.els.themeMenu.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.body.setAttribute('data-theme', btn.dataset.theme);
    });
  });

  /* =========================================================
     WATCH PARTY
     ========================================================= */
  const transportEl = document.querySelector('.transport');

  function openModal(el){ el.classList.add('open'); }
  function closeModal(el){ el.classList.remove('open'); }

  NZ.els.createRoomBtn.addEventListener('click', () => openModal(NZ.els.createRoomModalBackdrop));
  NZ.els.roomEmptyCreateBtn.addEventListener('click', () => openModal(NZ.els.createRoomModalBackdrop));
  NZ.els.createRoomCancelBtn.addEventListener('click', () => closeModal(NZ.els.createRoomModalBackdrop));

  NZ.els.joinRoomBtn.addEventListener('click', () => openModal(NZ.els.joinRoomModalBackdrop));
  NZ.els.roomEmptyJoinBtn.addEventListener('click', () => openModal(NZ.els.joinRoomModalBackdrop));
  NZ.els.joinRoomCancelBtn.addEventListener('click', () => closeModal(NZ.els.joinRoomModalBackdrop));

  NZ.els.createRoomConfirmBtn.addEventListener('click', async () => {
    const name = NZ.els.createRoomNameInput.value.trim() || 'Host';
    try {
      const code = await NZRoom.createRoom();
      await NZRoom.connect(code, name);
      closeModal(NZ.els.createRoomModalBackdrop);
      NZ.els.roomCodeDisplay.textContent = code;
      openModal(NZ.els.roomCreatedModalBackdrop);
      onRoomJoined();
    } catch (err) {
      alert(err.message || 'Could not create the room.');
    }
  });

  NZ.els.roomCreatedDoneBtn.addEventListener('click', () => closeModal(NZ.els.roomCreatedModalBackdrop));
  NZ.els.roomCreatedCopyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${NZ.room.code}`);
  });

  NZ.els.joinRoomConfirmBtn.addEventListener('click', async () => {
    const code = NZ.els.joinRoomCodeInput.value.trim().toUpperCase();
    const name = NZ.els.joinRoomNameInput.value.trim() || 'Guest';
    if (!code) return;
    try {
      await NZRoom.connect(code, name);
      closeModal(NZ.els.joinRoomModalBackdrop);
      onRoomJoined();
    } catch (err) {
      alert(err.message || 'Could not join that room.');
    }
  });

  NZ.els.leaveRoomBtn.addEventListener('click', () => {
    NZRoom.leave();
    NZVoice.teardownAll();
    onRoomLeft();
  });
  NZ.els.copyRoomLinkBtn.addEventListener('click', () => NZ.els.roomCreatedCopyBtn.click());

  function onRoomJoined(){
    NZ.els.roomBadge.hidden = false;
    NZ.els.roomBadgeCode.textContent = NZ.room.code;
    NZ.els.copyRoomLinkBtn.disabled = false;
    NZ.els.leaveRoomBtn.disabled = false;
    NZ.els.shareFileToRoomBtn.disabled = false;
    NZ.els.roomNotJoined.hidden = true;
    NZ.els.roomJoined.hidden = false;
    document.querySelector('[data-tab="room"]').click();
    applyHostLock();
  }

  function onRoomLeft(){
    NZ.els.roomBadge.hidden = true;
    NZ.els.copyRoomLinkBtn.disabled = true;
    NZ.els.leaveRoomBtn.disabled = true;
    NZ.els.shareFileToRoomBtn.disabled = true;
    NZ.els.roomNotJoined.hidden = false;
    NZ.els.roomJoined.hidden = true;
    NZChat.clear();
    transportEl.classList.remove('locked');
  }

  function applyHostLock(){
    const locked = NZ.room.connected && !NZ.room.isHost;
    transportEl.classList.toggle('locked', locked);
  }
  NZRoom.on('presence', () => {
    NZ.els.roomBadgeCount.textContent = NZ.room.participants.length;
    applyHostLock();
  });

  /* ---------- chat ---------- */
  NZ.els.chatSendBtn.addEventListener('click', sendChatFromInput);
  NZ.els.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatFromInput(); });
  function sendChatFromInput(){
    const text = NZ.els.chatInput.value.trim();
    if (!text) return;
    NZRoom.sendChat(text);
    NZ.els.chatInput.value = '';
  }

  /* ---------- voice ---------- */
  NZ.els.micToggleBtn.addEventListener('click', async () => {
    if (!NZ.room.connected) return;
    await NZVoice.enableMic();
    const enabled = NZVoice.toggleMute();
    NZ.els.micToggleBtn.textContent = enabled ? '🎙 Mic On' : '🎙 Mic Off';
    NZ.els.micToggleBtn.classList.toggle('active', enabled);
  });
  NZ.els.pttToggle.addEventListener('change', (e) => {
    NZVoice.setPushToTalk(e.target.checked);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV' && NZVoice.pushToTalk) NZVoice.holdToTalk(true);
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV' && NZVoice.pushToTalk) NZVoice.holdToTalk(false);
  });

  /* ---------- share local file to room ---------- */
  NZ.els.shareFileToRoomBtn.addEventListener('click', () => {
    if (!NZ.room.connected) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        await NZRoom.uploadHostFile(file);
        // playback for everyone (including the sharer) happens via the
        // 'load-media' broadcast below, which the server sends to the whole room.
      } catch (err) {
        alert(err.message || 'Upload failed.');
      }
    };
    input.click();
  });

  NZRoom.on('loadMedia', (media) => {
    const item = NZPlaylist.addUrl(media.src.startsWith('http') ? media.src : `${NZ_CONFIG.BACKEND_URL.replace(/\/$/, '')}${media.src}`);
    item.title = media.title || item.title;
    item.kind = media.kind || item.kind;
    NZPlayerCore.loadIndex(NZ.playlist.indexOf(item), true);
  });

  /* ---------- sync: host broadcasts, guests receive & apply ---------- */
  const el = NZ.els.video;
  ['play', 'pause'].forEach(evt => {
    el.addEventListener(evt, () => {
      if (NZ.room.connected && NZ.room.isHost) NZRoom.sendSync(evt, { time: el.currentTime });
    });
  });
  NZ.els.seekBar.addEventListener('mouseup', () => {
    if (NZ.room.connected && NZ.room.isHost) NZRoom.sendSync('seek', { time: el.currentTime });
  });
  NZ.els.nextBtn.addEventListener('click', () => {
    if (NZ.room.connected && NZ.room.isHost) NZRoom.sendSync('index', { index: NZ.currentIndex + 1 });
  });
  NZ.els.prevBtn.addEventListener('click', () => {
    if (NZ.room.connected && NZ.room.isHost) NZRoom.sendSync('index', { index: NZ.currentIndex - 1 });
  });

  NZRoom.on('sync', (msg) => {
    // guests only: apply the host's transport state without re-broadcasting
    switch (msg.action) {
      case 'play': el.currentTime = msg.payload.time; el.play(); break;
      case 'pause': el.currentTime = msg.payload.time; el.pause(); break;
      case 'seek': el.currentTime = msg.payload.time; break;
      case 'index': NZPlayerCore.loadIndex(msg.payload.index, true); break;
      default: break;
    }
  });

  /* ---------- join a room directly via ?room=CODE link ---------- */
  const roomFromLink = new URLSearchParams(location.search).get('room');
  if (roomFromLink) {
    NZ.els.joinRoomCodeInput.value = roomFromLink.toUpperCase();
    openModal(NZ.els.joinRoomModalBackdrop);
  }

})();
