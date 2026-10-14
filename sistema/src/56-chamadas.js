/* =========================================================
   CHAMADAS DE VOZ E VÍDEO DO ESCRITÓRIO VIRTUAL (WebRTC)
   - chamada da sala (todos que entrarem) ou ligação privada pela conversa;
   - o áudio e o vídeo vão direto entre os navegadores; o servidor só faz a
     "apresentação" (sinalização) e não grava nada;
   - quem entra chama quem já está na chamada (evita conflito de ofertas).
   ========================================================= */
const RTC={canal:'',pcs:new Map(),local:null,tela:null,cam:false,mic:true,t:null,fila:[],grande:false,ativas:[],recusadas:new Set(),tocando:null};
const nomeChamada=c=>c.startsWith('sala:')?salaNome(c.slice(5)):c.startsWith('dm:')?(()=>{const o=c.slice(3).split('|').find(e=>e!==meuEmailEsc());return 'Ligação com '+(ESC.pres.get(o)?.nome||db.usuarios.find(u=>norm(u.email)===o)?.nome||o);})():'Chamada';
function iceServers(){
  const l=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
  const t=db.escritorio?.turn;if(t&&t.urls)l.push({urls:String(t.urls).split(/[\s,]+/).filter(Boolean),username:t.usuario||undefined,credential:t.senha||undefined});
  return l;
}
async function rtcEntrar(canal,video){
  if(modo!=='servidor')return toast('As chamadas de voz e vídeo funcionam na versão hospedada (com o servidor).',1);
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)return toast('Este navegador não faz chamadas. Use o Chrome, Edge, Safari ou Firefox atualizados.',1);
  if(!window.isSecureContext)return toast('As chamadas só funcionam com o endereço seguro (https).',1);
  if(RTC.canal){if(RTC.canal===canal)return rtcMostrar();if(!await confirmar('Você já está em outra chamada. Sair dela e entrar nesta?','Trocar'))return;await rtcSair();}
  try{RTC.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:video?{width:{ideal:640},height:{ideal:480},facingMode:'user'}:false});}
  catch(e){
    if(video){try{RTC.local=await navigator.mediaDevices.getUserMedia({audio:true});toast('Câmera indisponível: entrando só com voz.',1);}catch(e2){}}
    if(!RTC.local)return toast(e.name==='NotAllowedError'?'Permita o uso do microfone (e da câmera) no navegador e tente de novo. No celular: cadeado ao lado do endereço → Permissões.':'Não encontramos microfone neste aparelho.',1);
  }
  RTC.canal=canal;RTC.cam=!!RTC.local.getVideoTracks().length;RTC.mic=true;RTC.fila=[];RTC.recusadas.delete(canal);rtcPararToque();
  rtcMostrar();
  try{const r=await api('rtc',{chamada:canal,op:'entrar',video:RTC.cam});
    // quem entra liga para quem já estava
    for(const p of r.participantes)if(p.email!==meuEmailEsc())await rtcOferta(p.email,p.nome);
    rtcProcessar(r);
  }catch(e){toast(e.msg||'Não foi possível entrar na chamada',1);return rtcSair();}
  rtcLoop();
}
function rtcLoop(){clearTimeout(RTC.t);if(!RTC.canal)return;RTC.t=setTimeout(async()=>{
  if(!RTC.canal)return;const sinais=RTC.fila.splice(0);
  try{rtcProcessar(await api('rtc',{chamada:RTC.canal,op:'ping',sinais}));}catch(e){RTC.fila.unshift(...sinais);}
  rtcLoop();},RTC.fila.length?150:900);}
function rtcSinal(para,tipo,dados){RTC.fila.push({para,tipo,dados});if(RTC.fila.length===1)rtcLoop();}
function rtcNovoPc(email,nome){
  rtcFecharPc(email);
  const pc=new RTCPeerConnection({iceServers:iceServers()});const info={pc,nome:nome||email,stream:new MediaStream(),ice:[],remoto:false};
  RTC.pcs.set(email,info);
  pc.onicecandidate=e=>{if(e.candidate)rtcSinal(email,'ice',e.candidate.toJSON());};
  pc.ontrack=e=>{if(!info.stream.getTracks().includes(e.track))info.stream.addTrack(e.track);e.track.onunmute=()=>rtcDesenhar();e.track.onmute=()=>rtcDesenhar();rtcDesenhar();};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){toast('A conexão com '+info.nome+' falhou. Se estiverem em redes diferentes (ex.: 4G), configure um servidor TURN ou use o link do Meet.',1);}rtcDesenhar();};
  return info;
}
function rtcTrilhas(pc){
  const a=RTC.local.getAudioTracks()[0]||null,v=RTC.tela?.getVideoTracks()[0]||RTC.local.getVideoTracks()[0]||null;
  return {a,v};
}
async function rtcOferta(email,nome){
  const info=rtcNovoPc(email,nome),pc=info.pc,{a,v}=rtcTrilhas();
  // sempre um canal de áudio e um de vídeo: assim dá para ligar a câmera ou mostrar a tela depois, sem renegociar
  pc.addTransceiver(a||'audio',{direction:'sendrecv',streams:[RTC.local]});pc.addTransceiver(v||'video',{direction:'sendrecv',streams:[RTC.local]});
  await pc.setLocalDescription(await pc.createOffer());
  rtcSinal(email,'oferta',{sdp:pc.localDescription.sdp,nome:sessao.nome});rtcDesenhar();
}
async function rtcProcessar(r){
  if(!r||!RTC.canal)return;
  const presentes=new Set(r.participantes.map(p=>p.email));
  for(const s of r.sinais||[]){
    try{
      if(s.tipo==='oferta'){const nome=r.participantes.find(p=>p.email===s.de)?.nome||s.dados.nome;const info=rtcNovoPc(s.de,nome),pc=info.pc;
        await pc.setRemoteDescription({type:'offer',sdp:s.dados.sdp});info.remoto=true;
        const {a,v}=rtcTrilhas();const ts=pc.getTransceivers();
        for(const t of ts){const k=t.receiver.track?.kind;if(k==='audio'){await t.sender.replaceTrack(a);t.direction='sendrecv';}else if(k==='video'){await t.sender.replaceTrack(v);t.direction='sendrecv';}}
        if(RTC.local)ts.forEach(t=>{try{t.sender.setStreams&&t.sender.setStreams(RTC.local);}catch(e){}});
        await pc.setLocalDescription(await pc.createAnswer());rtcSinal(s.de,'resposta',{sdp:pc.localDescription.sdp});
        for(const c of info.ice.splice(0))await pc.addIceCandidate(c).catch(()=>{});}
      else if(s.tipo==='resposta'){const info=RTC.pcs.get(s.de);if(info&&info.pc.signalingState==='have-local-offer'){await info.pc.setRemoteDescription({type:'answer',sdp:s.dados.sdp});info.remoto=true;for(const c of info.ice.splice(0))await info.pc.addIceCandidate(c).catch(()=>{});}}
      else if(s.tipo==='ice'){const info=RTC.pcs.get(s.de);if(info){if(info.remoto)await info.pc.addIceCandidate(s.dados).catch(()=>{});else info.ice.push(s.dados);}}
      else if(s.tipo==='tchau')rtcFecharPc(s.de);
    }catch(e){console.warn('rtc',e);}
  }
  // quem saiu (ou caiu) da chamada
  for(const em of [...RTC.pcs.keys()])if(!presentes.has(em))rtcFecharPc(em);
  RTC.part=r.participantes;rtcDesenhar();
}
function rtcFecharPc(email){const i=RTC.pcs.get(email);if(!i)return;try{i.pc.close();}catch(e){}RTC.pcs.delete(email);rtcDesenhar();}
async function rtcSair(){
  const c=RTC.canal;if(!c)return;clearTimeout(RTC.t);
  for(const em of RTC.pcs.keys())RTC.fila.push({para:em,tipo:'tchau',dados:null});
  try{if(RTC.fila.length)await api('rtc',{chamada:c,op:'ping',sinais:RTC.fila.splice(0)});}catch(e){}
  api('rtc',{chamada:c,op:'sair'}).catch(()=>{});
  for(const em of [...RTC.pcs.keys()])rtcFecharPc(em);
  [RTC.local,RTC.tela].forEach(s=>s&&s.getTracks().forEach(t=>t.stop()));
  RTC.local=null;RTC.tela=null;RTC.canal='';RTC.part=[];RTC.grande=false;
  const el=$('#rtc');if(el)el.remove();
  if(ui.page==='escritorio'&&$('#esc-root'))escAtualizar(true);
}
async function rtcTrocarVideo(track){for(const {pc} of RTC.pcs.values()){const t=pc.getTransceivers().find(t=>(t.sender.track?.kind||t.receiver.track?.kind)==='video');if(t)await t.sender.replaceTrack(track).catch(()=>{});}}
async function rtcCamera(){
  if(!RTC.canal)return;const v=RTC.local.getVideoTracks()[0];
  if(v){v.stop();RTC.local.removeTrack(v);RTC.cam=false;if(!RTC.tela)await rtcTrocarVideo(null);} // desliga de verdade (a luz da câmera apaga)
  else{try{const st=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});const nv=st.getVideoTracks()[0];RTC.local.addTrack(nv);RTC.cam=true;if(!RTC.tela)await rtcTrocarVideo(nv);}
    catch(e){return toast('Não foi possível ligar a câmera. Confira a permissão do navegador.',1);}}
  rtcDesenhar(true);
}
function rtcMic(){if(!RTC.local)return;RTC.mic=!RTC.mic;RTC.local.getAudioTracks().forEach(t=>t.enabled=RTC.mic);rtcDesenhar();}
async function rtcTela(){
  if(RTC.tela){RTC.tela.getTracks().forEach(t=>t.stop());RTC.tela=null;await rtcTrocarVideo(RTC.local.getVideoTracks()[0]||null);return rtcDesenhar();}
  if(!navigator.mediaDevices.getDisplayMedia)return toast('Este aparelho não compartilha a tela (no celular use o computador).',1);
  try{RTC.tela=await navigator.mediaDevices.getDisplayMedia({video:true});const t=RTC.tela.getVideoTracks()[0];t.onended=()=>{if(RTC.tela)rtcTela();};await rtcTrocarVideo(t);rtcDesenhar();}
  catch(e){RTC.tela=null;}
}
/* ---------- painel flutuante da chamada (continua aberto ao navegar pelo sistema) ---------- */
function rtcMostrar(){
  let el=$('#rtc');if(!el){el=document.createElement('div');el.id='rtc';el.className='rtc';document.body.appendChild(el);
    el.addEventListener('click',ev=>{const b=ev.target.closest('[data-rtc]');if(!b)return;const a=b.dataset.rtc;
      if(a==='sair')rtcSair();else if(a==='mic')rtcMic();else if(a==='cam')rtcCamera();else if(a==='tela')rtcTela();else if(a==='grande'){RTC.grande=!RTC.grande;rtcDesenhar(true);}});}
  rtcDesenhar(true);
}
function rtcTile(id,nome,stream,eu,info){
  const temVideo=stream&&stream.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted&&(eu?(RTC.cam||RTC.tela):true));
  const est=info?info.pc.connectionState:'';
  return `<div class="rtc-tile${temVideo?'':' sem-video'}" data-tile="${esc(id)}"><video autoplay playsinline ${eu?'muted':''}></video>
    <div class="rtc-av">${esc(initials(nome))}</div><div class="rtc-nome">${esc(eu?'Você':nome)}${eu&&!RTC.mic?' 🔇':''}${est&&est!=='connected'?` <span class="rtc-est">${est==='failed'?'falhou':'conectando…'}</span>`:''}</div></div>`;
}
function rtcDesenhar(forcar){
  const el=$('#rtc');if(!el||!RTC.canal)return;
  const lista=[['__eu',sessao.nome,RTC.tela||RTC.local,true,null],...[...RTC.pcs.entries()].map(([em,i])=>[em,i.nome,i.stream,false,i])];
  const chave=lista.map(l=>l[0]+':'+(l[4]?.pc.connectionState||'')+':'+(l[2]?.getVideoTracks().map(t=>t.muted?0:1).join('')||'')).join('|')+RTC.cam+RTC.mic+!!RTC.tela+RTC.grande;
  if(!forcar&&el._chave===chave)return;el._chave=chave;
  const n=lista.length;
  const velhos=new Map([...el.querySelectorAll('[data-tile]')].map(t=>[t.dataset.tile,t.querySelector('video')])); // reaproveita os vídeos (sem piscar)
  el.className='rtc'+(RTC.grande?' grande':'');
  el.innerHTML=`<div class="rtc-cab"><b>📞 ${esc(nomeChamada(RTC.canal))}</b><span class="small">${n} na chamada</span><span class="grow"></span><button data-rtc="grande" title="${RTC.grande?'Diminuir':'Ampliar'}">${RTC.grande?'🗗':'⛶'}</button></div>
    <div class="rtc-grade n${Math.min(n,6)}">${lista.map(l=>rtcTile(...l)).join('')}</div>
    ${n===1?'<div class="rtc-espera small">Aguardando alguém entrar… Quem estiver na sala vê o aviso para entrar.</div>':''}
    <div class="rtc-ctrl"><button data-rtc="mic" class="${RTC.mic?'':'off'}" title="Microfone">${RTC.mic?'🎙️':'🔇'}</button><button data-rtc="cam" class="${RTC.cam?'':'off'}" title="Câmera">${RTC.cam?'🎥':'📷'}</button><button data-rtc="tela" class="${RTC.tela?'on':''}" title="Compartilhar a tela">🖥️</button><button data-rtc="sair" class="sair" title="Sair da chamada">📞 Sair</button></div>`;
  lista.forEach(([id,,stream])=>{let v=el.querySelector(`[data-tile="${CSS.escape(id)}"] video`);const old=velhos.get(id);
    if(v&&old&&old.srcObject===stream){v.replaceWith(old);v=old;}
    if(v&&stream&&v.srcObject!==stream){v.srcObject=stream;v.play().catch(()=>{});}});
}
/* ---------- chamadas acontecendo agora (vem junto com a presença do escritório) ---------- */
function rtcAtualizarAtivas(lista){
  RTC.ativas=lista||[];const me=meuEmailEsc();
  // ligação privada para mim: toca e mostra "atender"
  const toque=RTC.ativas.find(c=>c.canal.startsWith('dm:')&&c.canal!==RTC.canal&&!RTC.recusadas.has(c.canal)&&!c.pessoas.some(p=>p.email===me));
  let av=$('#rtc-toque');
  if(toque){const quem=toque.pessoas[0];
    if(!av){av=document.createElement('div');av.id='rtc-toque';av.className='rtc-toque';document.body.appendChild(av);
      av.addEventListener('click',ev=>{const b=ev.target.closest('[data-toque]');if(!b)return;const c=av.dataset.canal;av.remove();rtcPararToque();
        if(b.dataset.toque==='recusar'){RTC.recusadas.add(c);}else rtcEntrar(c,b.dataset.toque==='video');});
      if(!RTC.tocando){RTC.tocando=setInterval(()=>escSom(true),1600);escSom(true);}
      notificar('📞 '+quem.nome+' está te ligando','Abra o escritório virtual para atender','liga');}
    av.dataset.canal=toque.canal;
    av.innerHTML=`<div class="strong">📞 ${esc(quem.nome)} está te ligando</div><div class="flx" style="gap:8px;margin-top:8px"><button class="btn btn-ghost btn-sm" data-toque="recusar">Recusar</button><button class="btn btn-brand btn-sm" data-toque="voz">🎙️ Atender</button><button class="btn btn-gold btn-sm" data-toque="video">🎥 Com vídeo</button></div>`;}
  else if(av){av.remove();rtcPararToque();}
  // quem ligou e desistiu: libera para tocar de novo numa próxima ligação
  for(const c of [...RTC.recusadas])if(!RTC.ativas.some(a=>a.canal===c))RTC.recusadas.delete(c);
}
function rtcPararToque(){clearInterval(RTC.tocando);RTC.tocando=null;}
const rtcNaSala=s=>RTC.ativas.find(c=>c.canal==='sala:'+s);
window.addEventListener('pagehide',()=>{if(RTC.canal&&navigator.sendBeacon){/* a saída também acontece sozinha em ~20s */}});
const RTC_ACOES={
  rtcSala:id=>{if(!podeSala(id))return toast('Sala fechada para parceiros 🔒',1);
    modal('📞 Chamada na '+salaNome(id),`<p class="small">${rtcNaSala(id)?'Na chamada agora: <b>'+esc(rtcNaSala(id).pessoas.map(p=>p.nome).join(', '))+'</b>.':'Ninguém na chamada ainda: quem estiver no escritório virtual vê o aviso para entrar.'}</p><p class="small muted">A chamada é direta entre os computadores/celulares e não é gravada. Funciona no Chrome, Edge, Safari e Firefox.</p>`,
      [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'🎙️ Entrar só com voz',c:'btn-ghost',fn:()=>{closeModal();rtcEntrar('sala:'+id,false);}},{l:'🎥 Entrar com vídeo',c:'btn-brand',fn:()=>{closeModal();rtcEntrar('sala:'+id,true);}}]);},
  rtcLigar:(email,el)=>{const v=el?.dataset.video==='1';rtcEntrar(canalDm(meuEmailEsc(),email),v);},
};
