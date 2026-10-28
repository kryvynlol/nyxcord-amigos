(() => {
  const $ = id => document.getElementById(id);
  const socket = io({ transports: ['websocket', 'polling'] });
  let myId = null, myName = '', currentRoom = '', users = [], callUsers = [], callJoined = false, micStream = null, screenStream = null, muted = false;
  const peers = new Map(), pendingCandidates = new Map(), remoteStreams = new Map();
  let toastTimer;
  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function initials(name) { return (name || '?').trim().slice(0, 1).toUpperCase(); }
  function safeText(el, text) { el.textContent = text; }
  function fmtTime(timestamp) { return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function addMessage(msg) {
    $('welcome').style.display = 'none';
    const row = document.createElement('article'); row.className = 'message';
    const av = document.createElement('div'); av.className = 'avatar'; av.textContent = initials(msg.name);
    const body = document.createElement('div'); body.className = 'message-body';
    const head = document.createElement('div'); head.className = 'message-head';
    const name = document.createElement('strong'); name.textContent = msg.name;
    const time = document.createElement('time'); time.textContent = fmtTime(msg.time);
    const text = document.createElement('div'); text.className = 'message-text'; text.textContent = msg.text;
    head.append(name, time); body.append(head, text); row.append(av, body); $('chat').append(row); $('chat').scrollTop = $('chat').scrollHeight;
  }
  function renderUsers(list) {
    users = list || [];
    $('memberCount').textContent = users.length;
    $('memberList').replaceChildren();
    if (!users.length) {
      const empty = document.createElement('div'); empty.className = 'empty-members'; empty.textContent = 'a sala está quieta...'; $('memberList').append(empty);
    }
    for (const user of users) {
      const row = document.createElement('div'); row.className = 'member';
      const av = document.createElement('div'); av.className = 'avatar'; av.textContent = initials(user.name); av.style.color = user.color || '';
      const label = document.createElement('div'); label.textContent = user.name;
      const small = document.createElement('small'); small.textContent = user.id === myId ? 'você' : 'na sala'; label.append(small);
      row.append(av, label); $('memberList').append(row);
    }
    renderCallPeople();
  }
  function renderCallPeople() {
    const list = $('callParticipants'); list.replaceChildren();
    const participants = callUsers;
    $('callCount').textContent = String(participants.length);
    if (!participants.length) {
      const p = document.createElement('p'); p.className = 'empty-call'; p.textContent = 'ninguém na chamada ainda'; list.append(p); return;
    }
    for (const u of participants) {
      const row = document.createElement('div'); row.className = 'call-person';
      const av = document.createElement('div'); av.className = 'avatar'; av.textContent = initials(u.name); av.style.color = u.color || '';
      const info = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = u.name;
      const small = document.createElement('small'); small.textContent = u.id === myId ? (muted ? 'microfone silenciado' : 'você · na chamada') : 'na chamada';
      info.append(strong, small); row.append(av, info); list.append(row);
    }
  }
  function renderCallUsers(list) {
    callUsers = Array.isArray(list) ? list : [];
    renderCallPeople();
  }
  function showJoinModal() { $('joinModal').classList.remove('hidden'); }
  function joinRoom(name, room) {
    if (callJoined) leaveCall();
    socket.emit('join-room', { name, room }, response => {
      if (!response?.ok) { toast(response?.error || 'Não foi possível entrar.'); return; }
      myId = response.id; myName = name; currentRoom = response.room;
      $('joinModal').classList.add('hidden');
      safeText($('myName'), myName); safeText($('myAvatar'), initials(myName));
      safeText($('roomTitle'), currentRoom); $('roomInput').value = currentRoom;
      history.replaceState(null, '', `?room=${encodeURIComponent(currentRoom)}`);
      $('connectionStatus').textContent = 'conectado';
      renderUsers(response.users);
      $('chat').replaceChildren();
      const welcome = document.createElement('div'); welcome.className = 'welcome'; welcome.id = 'welcome';
      welcome.innerHTML = '<div class="welcome-glyph">✦</div><p class="eyebrow">VOCÊ ENCONTROU SEU LUGAR</p><h2>Bem-vinde ao <em>geral.</em></h2><p>As melhores conversas começam com um “oi”.<br>Chame sua galera e faça a noite durar.</p>';
      $('chat').append(welcome);
      callUsers = []; renderCallPeople();
      toast(`Você entrou na sala ${currentRoom}.`);
    });
  }
  socket.on('connect', () => { $('connectionStatus').textContent = 'conectado'; });
  socket.on('disconnect', () => { $('connectionStatus').textContent = 'reconectando'; });
  socket.on('history', messages => { $('chat').replaceChildren(); for (const msg of messages) addMessage(msg); if (!messages.length) { const w = document.createElement('div'); w.className='welcome'; w.id='welcome'; w.innerHTML='<div class="welcome-glyph">✦</div><p class="eyebrow">VOCÊ ENCONTROU SEU LUGAR</p><h2>Bem-vinde ao <em>geral.</em></h2><p>As melhores conversas começam com um “oi”.<br>Chame sua galera e faça a noite durar.</p>'; $('chat').append(w); } });
  socket.on('chat-message', addMessage);
  socket.on('users', renderUsers);
  socket.on('call-users', renderCallUsers);
  socket.on('call-user-joined', user => { if (callJoined && user.id !== myId && myId < user.id) makeOffer(user.id); });
  socket.on('call-user-left', ({ id, users: list }) => { closePeer(id); if (list) renderCallUsers(list); });
  socket.on('user-joined', user => { toast(`${user.name} chegou à sala.`); });
  socket.on('user-left', ({ id }) => { closePeer(id); });
  $('joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('nameInput').value, $('roomInput').value); });
  $('chatForm').addEventListener('submit', e => { e.preventDefault(); const input = $('messageInput'); const text = input.value.trim(); if (!text) return; if (!currentRoom) return toast('Entre em uma sala primeiro.'); socket.emit('chat-message', { text }); input.value = ''; input.focus(); });
  $('editName').addEventListener('click', () => { $('nameInput').value = myName; showJoinModal(); });
  $('newRoom').addEventListener('click', () => { const room = prompt('Código da nova sala (letras, números ou hífen):', currentRoom || 'madrugada'); if (room) { $('roomInput').value = room; $('nameInput').value = myName; showJoinModal(); } });
  $('inviteButton').addEventListener('click', copyInvite);
  $('copyInvite').addEventListener('click', copyInvite);
  async function copyInvite() {
    if (!currentRoom) return toast('Entre em uma sala primeiro.');
    const url = `${location.origin}/?room=${encodeURIComponent(currentRoom)}`;
    try { await navigator.clipboard.writeText(url); toast('Link da sala copiado! Envie para seus amigos.'); }
    catch { prompt('Copie o link da sala:', url); }
  }
  $('themeButton').addEventListener('click', () => document.body.classList.toggle('light'));
  $('voiceChannel').addEventListener('click', () => callJoined ? toast('Você já está na chamada.') : joinCall());
  $('textChannel').addEventListener('click', () => $('messageInput').focus());
  $('joinCall').addEventListener('click', joinCall);
  $('leaveCall').addEventListener('click', leaveCall);
  $('muteButton').addEventListener('click', () => {
    muted = !muted;
    if (micStream) micStream.getAudioTracks().forEach(t => t.enabled = !muted);
    $('muteButton').classList.toggle('active', muted); $('muteButton').textContent = muted ? '×' : '♩';
    renderCallPeople(); toast(muted ? 'Microfone silenciado.' : 'Microfone ativado.');
  });
  $('screenButton').addEventListener('click', shareScreen);
  $('fullscreenScreen').addEventListener('click', async () => {
    const target = $('screenPreview');
    if (!screenStream) return toast('Compartilhe sua tela primeiro.');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await target.requestFullscreen(); }
    catch { toast('Seu navegador não permitiu abrir em tela cheia.'); }
  });
  document.addEventListener('fullscreenchange', () => { $('fullscreenScreen').textContent = document.fullscreenElement ? '⛶ Sair da tela cheia' : '⛶ Tela cheia'; });
  $('shareScreen').addEventListener('click', () => callJoined ? shareScreen() : toast('Entre na chamada antes de compartilhar a tela.'));
  async function joinCall() {
    if (!currentRoom) return toast('Entre em uma sala primeiro.');
    if (callJoined) return;
    if (!navigator.mediaDevices?.getUserMedia) return toast('Seu navegador não permite usar o microfone. Abra o site pelo link HTTPS.');
    $('joinCall').disabled = true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      callJoined = true; muted = false;
      $('joinCall').textContent = '● Conectado à chamada';
      $('joinCall').classList.add('connected');
      $('joinCall').disabled = false; $('leaveCall').disabled = false; $('muteButton').disabled = false; $('screenButton').disabled = false;
      $('voiceStatus').style.color = 'var(--good)';
      $('callHeadline').textContent = 'Você está na chamada.';
      $('callDescription').textContent = 'Seu microfone está conectado. Use “Sair da chamada” para desconectar.';
      socket.emit('call-join', response => {
        if (!response?.ok) { toast(response?.error || 'Não foi possível entrar na chamada.'); leaveCall(); return; }
        renderCallUsers(response.users || []);
        for (const u of callUsers) if (u.id !== myId && myId < u.id) makeOffer(u.id);
      });
      renderCallPeople();
      toast('Você entrou na chamada.');
    } catch (err) {
      $('joinCall').disabled = false;
      toast(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' ? 'Microfone bloqueado. Clique no ícone ao lado do endereço e permita o microfone.' : err.name === 'NotFoundError' ? 'Não encontrei um microfone conectado.' : 'Não foi possível acessar o microfone. Confira as permissões do navegador.');
    }
  }
  function getPeer(id) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    if (micStream) micStream.getAudioTracks().forEach(track => pc.addTrack(track, micStream));
    // Negotiate a video channel up front. Sharing/stopping a screen then only replaces its track.
    pc.addTransceiver('video', { direction: 'sendrecv' });
    pc.onicecandidate = e => { if (e.candidate) socket.emit('webrtc-ice', { to: id, candidate: e.candidate }); };
    pc.ontrack = e => {
      let stream = remoteStreams.get(id);
      if (!stream) { stream = new MediaStream(); remoteStreams.set(id, stream); }
      if (!stream.getTracks().some(t => t.id === e.track.id)) stream.addTrack(e.track);
      e.track.addEventListener('ended', () => { try { stream.removeTrack(e.track); } catch {} attachRemote(id, stream); });
      e.track.addEventListener('mute', () => attachRemote(id, stream));
      e.track.addEventListener('unmute', () => attachRemote(id, stream));
      attachRemote(id, stream);
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && pc.connectionState !== 'disconnected') closePeer(id);
    };
    peers.set(id, pc);
    return pc;
  }
  async function makeOffer(id) {
    if (!callJoined || id === myId) return;
    try {
      const pc = getPeer(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { to: id, offer: pc.localDescription });
    } catch (e) { console.error('offer error', e); }
  }
  socket.on('webrtc-offer', async ({ from, offer }) => {
    if (!callJoined) return;
    try {
      const pc = getPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { to: from, answer: pc.localDescription });
      const queued = pendingCandidates.get(from) || [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingCandidates.delete(from);
    } catch (e) { console.error('answer error', e); }
  });
  socket.on('webrtc-answer', async ({ from, answer }) => {
    const pc = peers.get(from); if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      const queued = pendingCandidates.get(from) || [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingCandidates.delete(from);
    } catch (e) { console.error('set answer error', e); }
  });
  socket.on('webrtc-ice', async ({ from, candidate }) => {
    const pc = peers.get(from);
    if (!pc || !pc.remoteDescription) {
      const queued = pendingCandidates.get(from) || []; queued.push(candidate); pendingCandidates.set(from, queued); return;
    }
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error('ICE error', e); }
  });
  function attachRemote(id, stream) {
    // Audio-only participants must not look like they are sharing a blank screen.
    let audio = document.getElementById(`remote-audio-${id}`);
    if (!audio) { audio = document.createElement('audio'); audio.id = `remote-audio-${id}`; audio.autoplay = true; audio.playsInline = true; audio.style.display = 'none'; document.body.append(audio); }
    audio.srcObject = stream;
    audio.play().catch(() => {});
    const videoTrack = stream.getVideoTracks().find(t => t.readyState === 'live' && !t.muted);
    let tile = document.getElementById(`remote-${id}`);
    if (!videoTrack) { if (tile) tile.remove(); return; }
    if (!tile) {
      tile = document.createElement('div'); tile.id = `remote-${id}`; tile.className = 'remote-tile';
      tile.style.cssText = 'position:fixed;right:18px;bottom:18px;width:min(420px,48vw);z-index:5;background:#100b16;border:1px solid #8f50b8;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px #0009';
      const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.muted = true;
      video.style.cssText = 'width:100%;max-height:280px;display:block;background:#08060a;object-fit:contain';
      const label = document.createElement('div'); label.style.cssText = 'padding:8px 10px;font-size:11px;color:#e8d6f3;display:flex;justify-content:space-between;align-items:center;gap:8px';
      const name = document.createElement('span'); name.textContent = users.find(u => u.id === id)?.name || callUsers.find(u => u.id === id)?.name || 'participante';
      const fullscreen = document.createElement('button'); fullscreen.type = 'button'; fullscreen.className = 'fullscreen-button'; fullscreen.textContent = '⛶ Tela cheia'; fullscreen.addEventListener('click', async () => {
        try { if (document.fullscreenElement === tile) await document.exitFullscreen(); else await tile.requestFullscreen(); }
        catch { toast('Não foi possível abrir a transmissão em tela cheia.'); }
      });
      label.append(name, fullscreen); tile.append(video, label); document.body.append(tile);
    }
    const video = tile.querySelector('video');
    video.srcObject = stream;
    video.hidden = false;
    video.play().catch(() => {});
  }
  function closePeer(id) {
    const pc = peers.get(id); if (pc) { pc.ontrack = null; pc.close(); peers.delete(id); }
    const tile = document.getElementById(`remote-${id}`); if (tile) tile.remove();
    const audio = document.getElementById(`remote-audio-${id}`); if (audio) audio.remove();
    remoteStreams.delete(id); pendingCandidates.delete(id);
  }
  function videoSender(pc) {
    const transceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
    return transceiver?.sender || pc.getSenders().find(sender => sender.track?.kind === 'video');
  }
  async function shareScreen() {
    if (!callJoined) return toast('Entre na chamada primeiro.');
    if (screenStream) return stopScreen();
    if (!navigator.mediaDevices?.getDisplayMedia) return toast('Seu navegador não permite compartilhar a tela. Use o link HTTPS.');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      screenStream = stream;
      const track = stream.getVideoTracks()[0];
      $('screenVideo').srcObject = stream; $('screenPreview').hidden = false; $('screenButton').classList.add('active');
      track.addEventListener('ended', stopScreen, { once: true });
      await Promise.all([...peers.values()].map(async pc => { const sender = videoSender(pc); if (sender) await sender.replaceTrack(track); }));
      toast('Tela compartilhada. Para encerrar, clique novamente no botão de tela.');
    } catch (err) { if (screenStream) screenStream.getTracks().forEach(t => t.stop()); screenStream = null; $('screenPreview').hidden = true; $('screenButton').classList.remove('active'); toast(err.name === 'NotAllowedError' ? 'Compartilhamento cancelado.' : 'Não foi possível compartilhar a tela.'); }
  }
  async function stopScreen() {
    if (!screenStream) return;
    const oldStream = screenStream; screenStream = null;
    oldStream.getTracks().forEach(t => t.stop());
    $('screenVideo').srcObject = null; $('screenPreview').hidden = true; $('screenButton').classList.remove('active');
    await Promise.all([...peers.values()].map(async pc => { const sender = videoSender(pc); if (sender) { try { await sender.replaceTrack(null); } catch {} } }));
    toast('Compartilhamento encerrado.');
  }
  function leaveCall() {
    if (!callJoined) return;
    socket.emit('call-leave');
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    for (const id of [...peers.keys()]) closePeer(id);
    callUsers = [];
    document.querySelectorAll('.remote-tile').forEach(el => el.remove());
    $('screenPreview').hidden = true; $('screenVideo').srcObject = null;
    callJoined = false; muted = false;
    $('joinCall').disabled = false; $('joinCall').classList.remove('connected'); $('joinCall').textContent = '◖ Entrar na chamada';
    $('leaveCall').disabled = true; $('muteButton').disabled = true; $('screenButton').disabled = true;
    $('muteButton').classList.remove('active'); $('screenButton').classList.remove('active'); $('muteButton').textContent = '♩';
    $('voiceStatus').style.color = ''; $('callHeadline').textContent = 'Sua noite, sua galera.';
    $('callDescription').textContent = 'Entre na chamada para conversar por voz ou compartilhar sua tela.';
    renderCallPeople(); toast('Você saiu da chamada.');
  }
  const params = new URLSearchParams(location.search);
  $('roomInput').value = (params.get('room') || 'madrugada').slice(0, 32);
  $('nameInput').value = localStorage.getItem('nyxcord-name') || '';
  $('joinForm').addEventListener('submit', () => { try { localStorage.setItem('nyxcord-name', $('nameInput').value.trim()); } catch {} });
  showJoinModal();
})();