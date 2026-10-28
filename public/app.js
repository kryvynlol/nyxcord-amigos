(() => {
  const $ = id => document.getElementById(id);
  const socket = io({ transports: ['websocket', 'polling'] });
  let myId = null, myName = '', currentRoom = '', users = [], callJoined = false, micStream = null, screenStream = null, muted = false;
  const peers = new Map(), pendingCandidates = new Map();
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
    $('callCount').textContent = callJoined ? users.length : '0';
    renderCallPeople();
  }
  function renderCallPeople() {
    const list = $('callParticipants'); list.replaceChildren();
    const participants = callJoined ? users : [];
    if (!participants.length) {
      const p = document.createElement('p'); p.className = 'empty-call'; p.textContent = 'ninguém na chamada ainda'; list.append(p); return;
    }
    for (const u of participants) {
      const row = document.createElement('div'); row.className = 'call-person';
      const av = document.createElement('div'); av.className = 'avatar'; av.textContent = initials(u.name);
      const info = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = u.name;
      const small = document.createElement('small'); small.textContent = u.id === myId ? (muted ? 'microfone silenciado' : 'você · conectado') : 'na sala de voz';
      info.append(strong, small); row.append(av, info); list.append(row);
    }
  }
  function showJoinModal() { $('joinModal').classList.remove('hidden'); }
  function joinRoom(name, room) {
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
      if (callJoined) { leaveCall(); }
      toast(`Você entrou na sala ${currentRoom}.`);
    });
  }
  socket.on('connect', () => { $('connectionStatus').textContent = 'conectado'; });
  socket.on('disconnect', () => { $('connectionStatus').textContent = 'reconectando'; });
  socket.on('history', messages => { $('chat').replaceChildren(); for (const msg of messages) addMessage(msg); if (!messages.length) { const w = document.createElement('div'); w.className='welcome'; w.id='welcome'; w.innerHTML='<div class="welcome-glyph">✦</div><p class="eyebrow">VOCÊ ENCONTROU SEU LUGAR</p><h2>Bem-vinde ao <em>geral.</em></h2><p>As melhores conversas começam com um “oi”.<br>Chame sua galera e faça a noite durar.</p>'; $('chat').append(w); } });
  socket.on('chat-message', addMessage);
  socket.on('users', renderUsers);
  socket.on('user-joined', user => { if (callJoined && user.id !== myId) makeOffer(user.id); toast(`${user.name} chegou à sala.`); });
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
  $('shareScreen').addEventListener('click', () => callJoined ? shareScreen() : toast('Entre na chamada antes de compartilhar a tela.'));
  async function joinCall() {
    if (!currentRoom) return toast('Entre em uma sala primeiro.');
    if (callJoined) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      callJoined = true; muted = false;
      $('joinCall').textContent = '● Você está na chamada';
      $('joinCall').disabled = true; $('leaveCall').disabled = false; $('muteButton').disabled = false; $('screenButton').disabled = false;
      $('voiceStatus').style.color = 'var(--good)';
      $('callHeadline').textContent = 'Você está conectado.';
      $('callDescription').textContent = 'Sua voz está pronta. Compartilhe sua tela quando quiser.';
      $('callCount').textContent = users.length; renderCallPeople();
      for (const u of users) if (u.id !== myId) makeOffer(u.id);
      toast('Você entrou na chamada de voz.');
    } catch (err) {
      toast(err.name === 'NotAllowedError' ? 'Permita o acesso ao microfone no navegador.' : 'Não foi possível acessar o microfone. Verifique as permissões.');
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
    if (micStream) micStream.getTracks().forEach(track => pc.addTrack(track, micStream));
    if (screenStream) screenStream.getTracks().forEach(track => pc.addTrack(track, screenStream));
    pc.onicecandidate = e => { if (e.candidate) socket.emit('webrtc-ice', { to: id, candidate: e.candidate }); };
    pc.ontrack = e => attachRemote(id, e.streams[0]);
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
    let tile = document.getElementById(`remote-${id}`);
    if (!tile) {
      tile = document.createElement('div'); tile.id = `remote-${id}`; tile.className = 'remote-tile';
      tile.style.cssText = 'position:fixed;right:18px;bottom:18px;width:min(320px,40vw);z-index:5;background:#100b16;border:1px solid #8f50b8;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px #0009';
      const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.style.cssText = 'width:100%;max-height:220px;display:block;background:#08060a';
      const label = document.createElement('div'); label.textContent = users.find(u => u.id === id)?.name || 'participante'; label.style.cssText = 'padding:8px 10px;font-size:11px;color:#e8d6f3';
      tile.append(video, label); document.body.append(tile); tile.querySelector('video').srcObject = stream;
    } else tile.querySelector('video').srcObject = stream;
  }
  function closePeer(id) {
    const pc = peers.get(id); if (pc) { pc.ontrack = null; pc.close(); peers.delete(id); }
    const tile = document.getElementById(`remote-${id}`); if (tile) tile.remove();
    pendingCandidates.delete(id);
  }
  async function shareScreen() {
    if (!callJoined) return toast('Entre na chamada primeiro.');
    if (screenStream) return stopScreen();
    if (!navigator.mediaDevices?.getDisplayMedia) return toast('Seu navegador não permite compartilhar a tela neste contexto. Use HTTPS ou localhost.');
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const track = screenStream.getVideoTracks()[0];
      $('screenVideo').srcObject = screenStream; $('screenPreview').hidden = false; $('screenButton').classList.add('active');
      track.addEventListener('ended', stopScreen);
      for (const [id, pc] of peers) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        else pc.addTrack(track, screenStream);
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc-offer', { to: id, offer: pc.localDescription });
      }
      toast('Compartilhamento iniciado. Escolha uma tela ou janela na janela do navegador.');
    } catch (err) { screenStream = null; toast(err.name === 'NotAllowedError' ? 'Compartilhamento cancelado.' : 'Não foi possível compartilhar a tela.'); }
  }
  async function stopScreen() {
    if (!screenStream) return;
    screenStream.getTracks().forEach(t => t.stop()); screenStream = null;
    $('screenVideo').srcObject = null; $('screenPreview').hidden = true; $('screenButton').classList.remove('active');
    for (const [id, pc] of peers) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        const replacement = micStream?.getVideoTracks?.()[0] || null;
        try { await sender.replaceTrack(replacement); } catch {}
      }
      try { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc-offer', { to: id, offer: pc.localDescription }); } catch {}
    }
    toast('Compartilhamento encerrado.');
  }
  function leaveCall() {
    if (!callJoined) return;
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    for (const id of [...peers.keys()]) closePeer(id);
    document.querySelectorAll('.remote-tile').forEach(el => el.remove());
    $('screenPreview').hidden = true; $('screenVideo').srcObject = null;
    callJoined = false; muted = false;
    $('joinCall').disabled = false; $('joinCall').textContent = '◖ Entrar na chamada';
    $('leaveCall').disabled = true; $('muteButton').disabled = true; $('screenButton').disabled = true;
    $('muteButton').classList.remove('active'); $('screenButton').classList.remove('active'); $('muteButton').textContent = '♩';
    $('voiceStatus').style.color = ''; $('callHeadline').textContent = 'Sua noite, sua galera.';
    $('callDescription').textContent = 'Entre na chamada para conversar por voz ou compartilhar sua tela.';
    $('callCount').textContent = '0'; renderCallPeople(); toast('Você saiu da chamada.');
  }
  const params = new URLSearchParams(location.search);
  $('roomInput').value = (params.get('room') || 'madrugada').slice(0, 32);
  $('nameInput').value = localStorage.getItem('nyxcord-name') || '';
  $('joinForm').addEventListener('submit', () => { try { localStorage.setItem('nyxcord-name', $('nameInput').value.trim()); } catch {} });
  showJoinModal();
})();