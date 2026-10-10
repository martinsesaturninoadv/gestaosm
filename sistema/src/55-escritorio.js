/* =========================================================
   ESCRITÓRIO VIRTUAL — mapa com salas, bonequinhos animados, presença e chat
   - cada pessoa clica numa sala (ou usa as setas) e o bonequinho anda até lá;
   - chat geral, por sala e privado; "bater na porta"; emotes;
   - cada sala pode ter um link fixo do Google Meet para vídeo/voz;
   - o parceiro só entra na Sala de Reunião (regra também no servidor).
   ========================================================= */
const ESC={on:false,t:null,desde:0,pres:new Map(),msgs:[],ids:new Set(),eu:null,aba:'geral',dm:'',primeira:true,lidas:null,ocultoDesde:0,ultimoOnline:0};
/* posição das salas no mapa (% da largura/altura): [x, y, largura, altura] */
const SALA_GEO={recepcao:[0,0,33.34,50],joyce:[33.33,0,33.34,50],vitoria:[66.66,0,33.34,50],comercial:[0,50,33.34,50],reuniao:[33.33,50,33.34,50],copa:[66.66,50,33.34,50]};
const ST_SALA=[['disponivel','🟢','Disponível'],['atendimento','🔴','Em atendimento'],['foco','🎧','Concentrado'],['ausente','🟡','Ausente']];
const EMOTES=['👋','🎉','👍','☕','❤️','😂'];
const PELES=['#F8D5B8','#EDBB94','#D29A6C','#A86D46','#6E4529'];
const CORES_CABELO=['#2B1D14','#5A3825','#A0522D','#D9A441','#7A7A7A','#B03A2E'];
const ROUPAS=['#1B3A5C','#C9A646','#2E7D4E','#8B2D4A','#7B4FB0','#0E7490','#C0392B','#3D3D3D'];
const CABELOS=['Curto','Longo','Coque','Cacheado','Raspado'];

const meuEmailEsc=()=>norm(sessao?.email||'');
const salaNome=id=>db.salas?.[id]?.nome||salasPadrao()[id]?.nome||id;
const podeSala=id=>!ehParceiro()||id===SALA_PARCEIRO;
const canalDm=(a,b)=>'dm:'+[norm(a),norm(b)].sort().join('|');
const chaveLidas=()=>'msadv_lidas_'+meuEmailEsc();
function hashTxt(s){let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return Math.abs(h);}
function visualPadrao(email){const h=hashTxt(email);return {pele:PELES[h%5],cabelo:(h>>3)%4,corCabelo:CORES_CABELO[(h>>5)%6],roupa:ROUPAS[(h>>7)%8],oculos:(h>>9)%4===0?1:0,gravata:0};}
function meuVisual(){try{const v=JSON.parse(localStorage.getItem('msadv_visual_'+meuEmailEsc())||'null');if(v)return v;}catch(e){}return visualPadrao(meuEmailEsc());}
function visualDe(email){if(norm(email)===meuEmailEsc())return meuVisual();const p=ESC.pres.get(norm(email));return p&&p.visual&&p.visual.pele?p.visual:visualPadrao(email);}
function salaEm(x,y){for(const id of SALAS_ORDEM){const[a,b,w,h]=SALA_GEO[id];if(x>=a&&x<a+w&&y>=b&&y<b+h)return id;}return 'recepcao';}
function limitarNaSala(id,x,y){const[a,b,w,h]=SALA_GEO[id];return [Math.min(a+w-3,Math.max(a+3,x)),Math.min(b+h-3,Math.max(b+12,y))];}
function pontoNaSala(id){const[a,b,w,h]=SALA_GEO[id];return [a+w*(.2+Math.random()*.6),b+h*(.45+Math.random()*.4)];}

/* ---------- bonequinho (SVG) ---------- */
function avatarSVG(v){
  v=v||{};const pele=v.pele||PELES[0],cc=v.corCabelo||CORES_CABELO[0],roupa=v.roupa||ROUPAS[0],est=+v.cabelo||0;
  const cabelo=[
    `<path d="M9 17 Q8 4 20 4.5 Q32 4 31 17 Q28 10 20 10.5 Q12 10 9 17Z" fill="${cc}"/>`,
    `<path d="M8 19 Q7 3.5 20 3.5 Q33 3.5 32 19 L32.5 31 Q30 32.5 28.3 29.5 L28 15 Q20 9 12 15 L11.7 29.5 Q10 32.5 7.5 31Z" fill="${cc}"/>`,
    `<circle cx="20" cy="3.6" r="4.6" fill="${cc}"/><path d="M9 17 Q8 5 20 5.5 Q32 5 31 17 Q28 11 20 11 Q12 11 9 17Z" fill="${cc}"/>`,
    `<g fill="${cc}"><circle cx="10.5" cy="13" r="4.4"/><circle cx="14" cy="7.8" r="4.6"/><circle cx="20" cy="6" r="4.8"/><circle cx="26" cy="7.8" r="4.6"/><circle cx="29.5" cy="13" r="4.4"/></g>`,
    `<path d="M10 14 Q11 6.5 20 6.5 Q29 6.5 30 14 Q26 10.5 20 10.5 Q14 10.5 10 14Z" fill="${cc}" opacity=".55"/>`][est]||'';
  return `<svg viewBox="0 0 40 60" aria-hidden="true"><ellipse class="sombra" cx="20" cy="57.5" rx="11" ry="2.6"/>
    <g class="perna pe"><rect x="13.2" y="40" width="6" height="15" rx="3" fill="#2B3A55"/><ellipse cx="16" cy="55.2" rx="3.9" ry="2" fill="#1d1d1d"/></g>
    <g class="perna pd"><rect x="20.8" y="40" width="6" height="15" rx="3" fill="#2B3A55"/><ellipse cx="24" cy="55.2" rx="3.9" ry="2" fill="#1d1d1d"/></g>
    <g class="braco be"><rect x="6.2" y="28" width="5" height="13.5" rx="2.5" fill="${roupa}"/><circle cx="8.7" cy="41.5" r="2.6" fill="${pele}"/></g>
    <rect x="10" y="26.5" width="20" height="17.5" rx="7" fill="${roupa}"/>
    ${v.gravata?'<path d="M20 27.5 L18.3 30.5 L20 38.5 L21.7 30.5Z" fill="#8B2D4A"/>':'<path d="M16 27 Q20 31 24 27" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.3"/>'}
    <g class="braco bd"><rect x="28.8" y="28" width="5" height="13.5" rx="2.5" fill="${roupa}"/><circle cx="31.3" cy="41.5" r="2.6" fill="${pele}"/></g>
    ${est===1?cabelo:''}<circle cx="20" cy="17" r="11" fill="${pele}"/>${est!==1?cabelo:cabelo.replace(/<path[^>]*>/,'<path d="M9 16 Q9 5 20 5 Q31 5 31 16 Q27 9.5 20 10 Q13 9.5 9 16Z" fill="'+cc+'"/>')}
    <g class="olhos"><ellipse cx="16" cy="18" rx="1.45" ry="1.9" fill="#222"/><ellipse cx="24" cy="18" rx="1.45" ry="1.9" fill="#222"/></g>
    ${v.oculos?'<g fill="none" stroke="#2b2b2b" stroke-width="1"><circle cx="16" cy="18" r="3.3"/><circle cx="24" cy="18" r="3.3"/><path d="M19.3 18 L20.7 18"/></g>':''}
    <circle cx="13" cy="21.6" r="1.9" fill="#F28B82" opacity=".35"/><circle cx="27" cy="21.6" r="1.9" fill="#F28B82" opacity=".35"/>
    <path d="M16.6 22.3 Q20 25.2 23.4 22.3" fill="none" stroke="#7a3b2e" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}
const cabecaMini=email=>`<span class="esc-mini">${avatarSVG(visualDe(email))}</span>`;

/* ---------- móveis de cada sala (posições em % da sala) ---------- */
function moveis(id){
  const e=(t,x,y,s)=>`<span class="mv-e" style="left:${x}%;top:${y}%;${s?'font-size:'+s+'em':''}">${t}</span>`;
  const r=(cls,x,y,w,h)=>`<i class="${cls}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%"></i>`;
  return {
    recepcao:r('mv-balcao',12,30,46,11)+e('🖥️',24,32)+e('🛎️',46,33,.8)+e('🛋️',74,74,1.5)+e('🪴',90,24)+e('🪴',8,88)+r('mv-tapete',35,86,30,10),
    joyce:r('mv-mesa',28,28,44,13)+e('💻',44,30)+e('⚖️',60,30,.9)+e('🪑',50,48)+e('📚',88,26)+e('🪴',9,88)+e('🖼️',12,24,.9),
    vitoria:r('mv-mesa',28,28,44,13)+e('💻',44,30)+e('📁',60,30,.9)+e('🪑',50,48)+e('🖼️',88,24,.9)+e('🌸',90,88)+e('📚',11,26),
    comercial:r('mv-mesa',8,30,36,12)+r('mv-mesa',56,30,36,12)+e('💻',20,32)+e('📞',34,32,.85)+e('💻',70,32)+e('📈',84,32,.85)+e('🎯',90,86)+e('🪴',8,88),
    reuniao:r('mv-mesa-reuniao',22,40,56,26)+e('📺',50,22,1.2)+e('🪑',30,36)+e('🪑',50,34)+e('🪑',70,36)+e('🪑',30,72)+e('🪑',50,74)+e('🪑',70,72)+e('🪴',8,88)+e('🪴',92,88),
    copa:r('mv-balcao',8,24,58,10)+e('☕',18,27)+e('🍩',32,27,.9)+e('🍪',44,27,.9)+e('🥤',56,27,.85)+r('mv-geladeira',80,18,12,24)+r('mv-redonda',42,58,18,26)+e('🪑',36,74)+e('🪑',64,74)+e('🪴',8,88)
  }[id]||'';
}

/* ---------- página ---------- */
V.escritorio=()=>{
  const eu=ESC.eu||{status:'disponivel'};
  return `<div id="esc-root" class="esc">
    <div class="esc-top">
      <div class="esc-status">${ST_SALA.map(([k,ic,l])=>`<button class="esc-st ${eu.status===k?'on':''}" data-act="escStatus" data-id="${k}" title="${l}">${ic}<span>${l}</span></button>`).join('')}</div>
      <div class="esc-emotes">${EMOTES.map(e=>`<button data-act="escEmote" data-id="${e}" title="Reagir">${e}</button>`).join('')}</div>
      <span class="grow"></span>
      <button class="btn btn-ghost btn-sm" data-act="escVisual">🎨 Meu bonequinho</button>
    </div>
    <div class="esc-corpo">
      <div class="esc-mapa-wrap"><div class="esc-mapa" id="esc-mapa">
        ${SALAS_ORDEM.map(id=>{const[a,b,w,h]=SALA_GEO[id];return `<div class="esc-sala sala-${id}${podeSala(id)?'':' trancada'}" data-sala="${id}" style="left:${a}%;top:${b}%;width:${w}%;height:${h}%">
          ${moveis(id)}<div class="esc-rot"><b data-nome-sala="${id}">${esc(salaNome(id))}</b><span class="esc-qtd" data-qtd="${id}"></span>${db.salas?.[id]?.meet&&podeSala(id)?`<button class="esc-meet" data-act="escMeet" data-id="${id}" title="Entrar na chamada desta sala">🎥</button>`:''}</div>
          ${podeSala(id)?'':'<div class="esc-tranca">🔒</div>'}</div>`;}).join('')}
        <div id="esc-avs"></div><div class="esc-menu" id="esc-menu" hidden></div>
      </div><div class="small muted esc-dica">Clique numa sala (ou use as setas do teclado) para andar até lá. Clique num colega para conversar ou bater na porta.${ehParceiro()?' Como parceiro, você tem acesso à <b>Sala de Reunião</b>.':''}</div></div>
      <div class="esc-chat card">
        <div class="tabs esc-abas" id="esc-abas"></div>
        <div class="esc-cab" id="esc-cab"></div>
        <div class="esc-msgs" id="esc-msgs"></div>
        <form class="esc-form" id="esc-form"><input id="esc-input" placeholder="Escreva uma mensagem…" autocomplete="off" maxlength="2000"><button class="btn btn-brand btn-sm" type="submit">Enviar</button></form>
      </div>
    </div></div>`;
};
function escMontar(){
  if(!ESC.eu)escCarregarEu();
  const f=$('#esc-form');if(f&&!f._ok){f._ok=1;f.addEventListener('submit',ev=>{ev.preventDefault();const i=$('#esc-input');const t=i.value.trim();if(!t)return;const c=escCanalAtual();if(!c)return toast('Escolha uma conversa',1);i.value='';escEnviar({canal:c,texto:t,tipo:'msg'});});}
  const m=$('#esc-mapa');if(m&&!m._ok){m._ok=1;m.addEventListener('click',escClickMapa);}
  escAtualizar(true);
}

/* ---------- estado local ---------- */
function escCarregarEu(){
  let eu=null;try{eu=JSON.parse(localStorage.getItem('msadv_esc_eu_'+meuEmailEsc())||'null');}catch(e){}
  if(!eu||!SALA_GEO[eu.sala]||!podeSala(eu.sala)){const s=ehParceiro()?SALA_PARCEIRO:'recepcao';const[x,y]=pontoNaSala(s);eu={sala:s,x,y,status:'disponivel'};}
  ESC.eu=eu;ESC.aba=ehParceiro()?'sala':'geral';
  try{ESC.lidas=JSON.parse(localStorage.getItem(chaveLidas())||'null');}catch(e){ESC.lidas=null;}
}
function escGuardarEu(){try{localStorage.setItem('msadv_esc_eu_'+meuEmailEsc(),JSON.stringify(ESC.eu));}catch(e){}}
function escGuardarLidas(){try{localStorage.setItem(chaveLidas(),JSON.stringify(ESC.lidas||{}));}catch(e){}}
function statusEfetivo(){return ESC.ocultoDesde&&Date.now()-ESC.ocultoDesde>10*60000?'ausente':ESC.eu.status;}
document.addEventListener('visibilitychange',()=>{ESC.ocultoDesde=document.hidden?Date.now():0;if(!document.hidden&&ESC.on){escMarcarLida();badges();}});

/* ---------- comunicação ---------- */
function escIniciar(){
  escParar();if(!sessao)return;
  ESC.pres=new Map();ESC.msgs=[];ESC.ids=new Set();ESC.desde=0;ESC.primeira=true;ESC.eu=null;ESC.dm='';
  escCarregarEu();ESC.on=true;escTick();
}
function escParar(){ESC.on=false;clearTimeout(ESC.t);}
function escCorpo(extra){return {presenca:{...ESC.eu,status:statusEfetivo(),visual:meuVisual()},desde:ESC.desde,...extra};}
async function escTick(){
  clearTimeout(ESC.t);if(!ESC.on)return;
  try{escProcessar(await api('sala',escCorpo()));}catch(e){}
  if(ESC.on)ESC.t=setTimeout(escTick,ui.page==='escritorio'&&!document.hidden?3000:10000);
}
async function escEnviar(enviar){
  try{const r=await api('sala',escCorpo(enviar?{enviar}:{}));escProcessar(r);}
  catch(e){if(enviar)toast(e.msg||'Mensagem não enviada. Verifique a conexão.',1);}
}
function escProcessar(r){
  if(!r||!r.ok)return;
  ESC.pres=new Map((r.presencas||[]).map(p=>[norm(p.email),p]));
  const novas=[];
  (r.mensagens||[]).forEach(m=>{if(ESC.ids.has(m.id))return;ESC.ids.add(m.id);ESC.msgs.push(m);novas.push(m);if(m.em>ESC.desde)ESC.desde=m.em;});
  if(ESC.msgs.length>3000){ESC.msgs=ESC.msgs.slice(-2000);}
  if(ESC.primeira){ESC.primeira=false;
    if(!ESC.lidas){ESC.lidas={};ESC.msgs.forEach(m=>{if(m.em>(ESC.lidas[m.canal]||0))ESC.lidas[m.canal]=m.em;});escGuardarLidas();}}
  else novas.forEach(escNotificar);
  if(ui.page==='escritorio'&&$('#esc-root'))escAtualizar(false,novas);
  badges();
}

/* ---------- conversas ---------- */
function escCanalAtual(){
  if(ESC.aba==='geral')return ehParceiro()?'':'geral';
  if(ESC.aba==='sala')return 'sala:'+ESC.eu.sala;
  return ESC.dm?canalDm(meuEmailEsc(),ESC.dm):'';
}
function canaisVisiveis(){const me=meuEmailEsc();return c=>c==='geral'?!ehParceiro():c.startsWith('sala:')?c==='sala:'+ESC.eu?.sala:c.startsWith('dm:')&&c.slice(3).split('|').includes(me);}
function naoLidas(canal){const me=meuEmailEsc(),l=(ESC.lidas||{})[canal]||0;return ESC.msgs.filter(m=>m.canal===canal&&m.de!==me&&m.tipo!=='emote'&&m.em>l).length;}
function totalNaoLidas(){if(!ESC.lidas)return 0;const ok=canaisVisiveis();return [...new Set(ESC.msgs.map(m=>m.canal))].filter(ok).reduce((s,c)=>s+naoLidas(c),0);}
function escMarcarLida(){
  if(ui.page!=='escritorio'||document.hidden||!ESC.lidas)return;const c=escCanalAtual();if(!c)return;
  const ult=ESC.msgs.filter(m=>m.canal===c).reduce((s,m)=>Math.max(s,m.em),0);if(ult>(ESC.lidas[c]||0)){ESC.lidas[c]=ult;escGuardarLidas();}
}
function pessoasDm(){
  const me=meuEmailEsc();const m=new Map();
  db.usuarios.filter(u=>u.email&&norm(u.email)!==me&&(!ehParceiro()||!/parceir/i.test(u.papel))).forEach(u=>m.set(norm(u.email),{email:norm(u.email),nome:u.nome}));
  ESC.pres.forEach(p=>{if(p.email!==me)m.set(p.email,{email:p.email,nome:p.nome});});
  return [...m.values()].map(p=>({...p,on:!!ESC.pres.get(p.email)?.online,n:naoLidas(canalDm(me,p.email))})).sort((a,b)=>b.n-a.n||b.on-a.on||a.nome.localeCompare(b.nome));
}
function linkify(t){return esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g,'<br>');}
function hhmm(ms){const d=new Date(ms);const h=d.toTimeString().slice(0,5);return iso(d)===today()?h:fd(iso(d)).slice(0,5)+' '+h;}
function escRenderChat(){
  const abas=$('#esc-abas');if(!abas)return;
  const me=meuEmailEsc(),sala='sala:'+ESC.eu.sala,ndm=pessoasDm().reduce((s,p)=>s+p.n,0);
  const nb=n=>n?`<span class="nb">${n}</span>`:'';
  abas.innerHTML=(ehParceiro()?'':`<button class="tab ${ESC.aba==='geral'?'active':''}" data-act="escAba" data-id="geral">💬 Geral${nb(naoLidas('geral'))}</button>`)
    +`<button class="tab ${ESC.aba==='sala'?'active':''}" data-act="escAba" data-id="sala">📍 ${esc(salaNome(ESC.eu.sala))}${nb(naoLidas(sala))}</button>`
    +`<button class="tab ${ESC.aba==='dm'?'active':''}" data-act="escAba" data-id="dm">🔒 Privado${nb(ndm)}</button>`;
  const cab=$('#esc-cab'),box=$('#esc-msgs'),form=$('#esc-form');
  if(ESC.aba==='dm'&&!ESC.dm){
    cab.innerHTML='<div class="small muted">Escolha com quem conversar:</div>';form.style.display='none';
    box.innerHTML=pessoasDm().map(p=>`<div class="esc-pessoa" data-act="escAbrirDm" data-id="${esc(p.email)}">${cabecaMini(p.email)}<div class="grow"><div class="strong">${esc(p.nome)}</div><div class="small muted">${p.on?'🟢 online · '+esc(salaNome(ESC.pres.get(p.email).sala)):'offline'}</div></div>${nb(p.n)}</div>`).join('')||'<div class="empty">Ninguém cadastrado na equipe ainda</div>';
    return;}
  form.style.display='';
  const canal=escCanalAtual();
  if(ESC.aba==='dm'){const p=ESC.pres.get(ESC.dm);const nome=p?.nome||db.usuarios.find(u=>norm(u.email)===ESC.dm)?.nome||ESC.dm;
    cab.innerHTML=`<button class="btn btn-ghost btn-sm" data-act="escAba" data-id="dm">←</button> ${cabecaMini(ESC.dm)} <b>${esc(nome)}</b> <span class="small muted">${p?.online?'🟢 online':'offline'}</span><span class="grow"></span><button class="btn btn-ghost btn-sm" data-act="escToc" data-id="${esc(ESC.dm)}" title="Bater na porta">🚪</button>`;}
  else if(ESC.aba==='sala'){const s=ESC.eu.sala,qtd=[...ESC.pres.values()].filter(p=>p.online&&p.sala===s).length;
    cab.innerHTML=`<span class="small muted">Conversa de quem está na sala · ${qtd} pessoa(s) aqui</span><span class="grow"></span>${db.salas?.[s]?.meet?`<button class="btn btn-gold btn-sm" data-act="escMeet" data-id="${s}">🎥 Entrar na chamada</button>`:''}`;}
  else cab.innerHTML='<span class="small muted">Conversa de toda a equipe</span>';
  const ms=ESC.msgs.filter(m=>m.canal===canal&&m.tipo!=='emote').slice(-200);
  const perto=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  let ant=null;
  box.innerHTML=ms.map(m=>{const meu=m.de===me,junto=ant&&ant.de===m.de&&m.em-ant.em<300000;ant=m;
    if(m.tipo==='toc')return `<div class="esc-sis">🚪 <b>${esc(meu?'Você':m.nome)}</b> bateu na porta · ${hhmm(m.em)}</div>`;
    return `<div class="esc-msg ${meu?'meu':''} ${junto?'junto':''}">${junto?'<span class="esc-mini vazio"></span>':cabecaMini(m.de)}<div><div class="esc-meta">${junto?'':`<b>${esc(meu?'Você':m.nome)}</b> `}<span>${hhmm(m.em)}</span></div><div class="esc-bal">${linkify(m.texto)}</div></div></div>`;}).join('')
    ||`<div class="empty">${ESC.aba==='dm'?'Nenhuma mensagem ainda. Diga oi! 👋':'Nenhuma mensagem ainda'}</div>`;
  if(perto||box._canal!==canal)box.scrollTop=box.scrollHeight;box._canal=canal;
  escMarcarLida();
}

/* ---------- mapa: bonequinhos ---------- */
function escPessoasNoMapa(){
  const me=meuEmailEsc(),l=[...ESC.pres.values()].filter(p=>p.online&&p.email!==me);
  l.push({email:me,nome:sessao.nome,sala:ESC.eu.sala,x:ESC.eu.x,y:ESC.eu.y,status:statusEfetivo(),online:true,eu:true});
  return l;
}
function escAtualizar(tudo,novas){
  const box=$('#esc-avs');if(!box)return;
  const vivos=new Set();const qtd={};
  escPessoasNoMapa().forEach(p=>{
    vivos.add(p.email);qtd[p.sala]=(qtd[p.sala]||0)+1;
    let el=box.querySelector(`[data-av="${CSS.escape(p.email)}"]`);
    const vis=JSON.stringify(visualDe(p.email));
    if(!el){el=document.createElement('div');el.className='av3';el.dataset.av=p.email;el.style.left=p.x+'%';el.style.top=p.y+'%';
      el.innerHTML=`<div class="av3-bal" hidden></div><div class="av3-corpo"></div><div class="av3-nome"><i></i><span></span></div>`;
      box.appendChild(el);}
    if(el._vis!==vis){el._vis=vis;el.querySelector('.av3-corpo').innerHTML=avatarSVG(visualDe(p.email));const o=el.querySelector('.olhos');if(o)o.style.animationDelay=(hashTxt(p.email)%40)/10+'s';}
    const ox=parseFloat(el.style.left),oy=parseFloat(el.style.top);
    if(Math.abs(ox-p.x)>.05||Math.abs(oy-p.y)>.05){
      if(p.x<ox-.05)el.classList.add('esq');else if(p.x>ox+.05)el.classList.remove('esq');
      el.classList.add('andando');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('andando'),1400);
      el.style.left=p.x+'%';el.style.top=p.y+'%';}
    el.style.zIndex=Math.round(p.y*10);
    el.classList.toggle('eu',!!p.eu);el.dataset.status=p.status;
    el.querySelector('.av3-nome i').textContent=(ST_SALA.find(s=>s[0]===p.status)||ST_SALA[0])[1];
    el.querySelector('.av3-nome span').textContent=(p.eu?'Você':String(p.nome||'').split(' ').slice(0,2).join(' '));
    el.title=`${p.nome} — ${(ST_SALA.find(s=>s[0]===p.status)||ST_SALA[0])[2]}`;
  });
  box.querySelectorAll('.av3').forEach(el=>{if(!vivos.has(el.dataset.av))el.remove();});
  SALAS_ORDEM.forEach(id=>{const q=document.querySelector(`[data-qtd="${id}"]`);if(q)q.textContent=qtd[id]?qtd[id]+' 👤':'';});
  (novas||[]).forEach(m=>{
    if(m.tipo==='emote')escBalao(m.de,m.texto,true);
    else if(m.tipo==='msg'&&(m.canal==='geral'||m.canal.startsWith('sala:')))escBalao(m.de,m.texto.length>60?m.texto.slice(0,58)+'…':m.texto);
  });
  escRenderChat();
}
function escBalao(email,txt,emote){
  const el=document.querySelector(`[data-av="${CSS.escape(norm(email))}"]`);if(!el)return;
  const b=el.querySelector('.av3-bal');b.textContent=txt;b.hidden=false;b.classList.toggle('emo',!!emote);
  clearTimeout(b._t);b._t=setTimeout(()=>{b.hidden=true;},emote?3500:6000);
  if(emote){el.classList.remove('pulando','acenando');void el.offsetWidth;el.classList.add(txt==='👋'?'acenando':'pulando');setTimeout(()=>el.classList.remove('pulando','acenando'),2200);}
}
function escMover(x,y,sala){
  sala=sala||salaEm(x,y);
  if(!podeSala(sala)){toast('Como parceiro, você tem acesso só à '+salaNome(SALA_PARCEIRO),1);return;}
  [x,y]=limitarNaSala(sala,x,y);
  const mudou=sala!==ESC.eu.sala;ESC.eu={...ESC.eu,x,y,sala};escGuardarEu();
  escAtualizar(false);escEnviar(null);
  if(mudou){toast('Você entrou: '+salaNome(sala));if(ESC.aba==='sala')escRenderChat();}
}
function escClickMapa(ev){
  const menu=$('#esc-menu');
  const av=ev.target.closest('.av3');
  if(av&&!av.classList.contains('eu')){ev.stopPropagation();escMenuPessoa(av);return;}
  if(ev.target.closest('[data-act]'))return;
  if(menu&&!menu.hidden){menu.hidden=true;return;}
  const r=$('#esc-mapa').getBoundingClientRect();
  escMover((ev.clientX-r.left)/r.width*100,(ev.clientY-r.top)/r.height*100);
}
function escMenuPessoa(av){
  const p=ESC.pres.get(av.dataset.av);if(!p)return;const menu=$('#esc-menu');
  menu.innerHTML=`<div class="strong">${esc(p.nome)}</div><div class="small muted">${esc((ST_SALA.find(s=>s[0]===p.status)||ST_SALA[0])[2])} · ${esc(salaNome(p.sala))}</div>
    <button data-act="escAbrirDm" data-id="${esc(p.email)}">💬 Mensagem privada</button><button data-act="escToc" data-id="${esc(p.email)}">🚪 Bater na porta</button>${podeSala(p.sala)?`<button data-act="escIrAte" data-id="${esc(p.email)}">🚶 Ir até lá</button>`:''}`;
  menu.style.left=av.style.left;menu.style.top=av.style.top;menu.hidden=false;
}
document.addEventListener('keydown',ev=>{
  if(ui.page!=='escritorio'||!ESC.eu||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')||$('#mbg')?.classList.contains('open'))return;
  const d={ArrowLeft:[-3,0],ArrowRight:[3,0],ArrowUp:[0,-4],ArrowDown:[0,4],a:[-3,0],d:[3,0],w:[0,-4],s:[0,4]}[ev.key];if(!d)return;
  ev.preventDefault();const x=Math.min(98,Math.max(2,ESC.eu.x+d[0])),y=Math.min(97,Math.max(3,ESC.eu.y+d[1]));const sala=salaEm(x,y);
  if(!podeSala(sala))return toast('Sala fechada para parceiros 🔒',1);
  ESC.eu={...ESC.eu,x,y,sala};escGuardarEu();escAtualizar(false);clearTimeout(ESC.tTecla);ESC.tTecla=setTimeout(()=>escEnviar(null),400);
});

/* ---------- avisos (som, toast e contador) ---------- */
let escAudio=null;
document.addEventListener('pointerdown',()=>{if(!escAudio){try{escAudio=new (window.AudioContext||window.webkitAudioContext)();}catch(e){escAudio=0;}}},{once:true});
function escSom(forte){
  if(!escAudio)return;try{const t=escAudio.currentTime;[[880,0],[1320,.12]].concat(forte?[[990,.3],[1320,.42]]:[]).forEach(([f,d])=>{const o=escAudio.createOscillator(),g=escAudio.createGain();
    o.frequency.value=f;o.type='sine';g.gain.setValueAtTime(.0001,t+d);g.gain.exponentialRampToValueAtTime(.18,t+d+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d+.25);o.connect(g);g.connect(escAudio.destination);o.start(t+d);o.stop(t+d+.3);});}catch(e){}
}
function escNotificar(m){
  const me=meuEmailEsc();if(m.de===me||m.tipo==='emote')return;
  if(!canaisVisiveis()(m.canal))return;
  const vendo=ui.page==='escritorio'&&!document.hidden&&escCanalAtual()===m.canal;
  if(document.hidden&&(m.tipo==='toc'||m.canal.startsWith('dm:')))notificar(m.tipo==='toc'?'🚪 '+m.nome+' está batendo na sua porta':'💬 '+m.nome,m.tipo==='toc'?'Escritório virtual':m.texto.slice(0,120),'chat-'+m.canal);
  if(m.tipo==='toc'){escSom(true);toastAcao(`🚪 ${m.nome} está batendo na sua porta`,'Ir até lá',()=>{location.hash='escritorio';escIrAte(m.de);});return;}
  if(vendo)return;
  escSom(m.canal.startsWith('dm:'));
  if(m.canal.startsWith('dm:'))toastAcao(`💬 ${m.nome}: ${m.texto.length>70?m.texto.slice(0,68)+'…':m.texto}`,'Responder',()=>{location.hash='escritorio';ESC.aba='dm';ESC.dm=m.de;setTimeout(escRenderChat,50);});
}
function toastAcao(txt,botao,fn){
  const t=document.createElement('div');t.className='toast-acao';t.innerHTML=`<span></span><button class="btn btn-gold btn-sm"></button><button class="x" aria-label="Fechar">×</button>`;
  t.querySelector('span').textContent=txt;t.querySelector('.btn').textContent=botao;
  t.querySelector('.btn').onclick=()=>{t.remove();fn();};t.querySelector('.x').onclick=()=>t.remove();
  let pilha=$('#pilha-avisos');if(!pilha){pilha=document.createElement('div');pilha.id='pilha-avisos';document.body.appendChild(pilha);}
  pilha.appendChild(t);while(pilha.children.length>4)pilha.firstChild.remove();setTimeout(()=>t.remove(),12000);
}
function escIrAte(email){
  const p=ESC.pres.get(norm(email));if(!p||!p.online)return toast('Essa pessoa não está online agora',1);
  if(!podeSala(p.sala))return toast('Sala fechada para parceiros 🔒',1);
  escMover(p.x+(p.x>50?-4:4),p.y,p.sala);
}

/* ---------- personalizar o bonequinho ---------- */
function escEditarVisual(){
  const v={...meuVisual()};
  const prev=()=>{const b=$('#vis-prev');if(b)b.innerHTML=avatarSVG(v);};
  const sw=(k,cores)=>cores.map(c=>`<button type="button" class="vis-sw ${v[k]===c?'on':''}" data-k="${k}" data-v="${c}" style="background:${c}"></button>`).join('');
  modal('🎨 Meu bonequinho',`<div class="vis-grid"><div class="vis-prev av3" id="vis-prev"></div><div>
    <div class="strong small">Pele</div><div class="vis-linha">${sw('pele',PELES)}</div>
    <div class="strong small">Cabelo</div><div class="vis-linha">${CABELOS.map((n,i)=>`<button type="button" class="vis-op ${+v.cabelo===i?'on':''}" data-k="cabelo" data-v="${i}">${n}</button>`).join('')}</div>
    <div class="strong small">Cor do cabelo</div><div class="vis-linha">${sw('corCabelo',CORES_CABELO)}</div>
    <div class="strong small">Roupa</div><div class="vis-linha">${sw('roupa',ROUPAS)}</div>
    <div class="vis-linha"><label class="small"><input type="checkbox" id="vis-oc"${v.oculos?' checked':''}> Óculos</label><label class="small"><input type="checkbox" id="vis-gr"${v.gravata?' checked':''}> Gravata</label></div></div></div>`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Salvar',c:'btn-brand',fn:()=>{try{localStorage.setItem('msadv_visual_'+meuEmailEsc(),JSON.stringify(v));}catch(e){}closeModal();
      const el=document.querySelector('.av3.eu');if(el)el._vis='';escAtualizar(false);escEnviar(null);toast('Bonequinho atualizado ✓');}}]);
  prev();
  $('#m-body').addEventListener('click',ev=>{const b=ev.target.closest('[data-k]');if(!b)return;const k=b.dataset.k;v[k]=k==='cabelo'?+b.dataset.v:b.dataset.v;
    b.parentElement.querySelectorAll('[data-k]').forEach(x=>x.classList.toggle('on',x===b));prev();});
  $('#m-body').addEventListener('change',()=>{v.oculos=$('#vis-oc').checked?1:0;v.gravata=$('#vis-gr').checked?1:0;prev();});
}

/* ---------- ações ---------- */
const ESC_ACOES={
  escStatus:k=>{ESC.eu={...ESC.eu,status:k};escGuardarEu();document.querySelectorAll('.esc-st').forEach(b=>b.classList.toggle('on',b.dataset.id===k));escAtualizar(false);escEnviar(null);},
  escEmote:e=>{escBalao(meuEmailEsc(),e,true);escEnviar({canal:'sala:'+ESC.eu.sala,texto:e,tipo:'emote'});},
  escAba:id=>{ESC.aba=id;if(id==='dm')ESC.dm='';escRenderChat();},
  escAbrirDm:email=>{$('#esc-menu')&&($('#esc-menu').hidden=true);if(ui.page!=='escritorio')location.hash='escritorio';ESC.aba='dm';ESC.dm=norm(email);escRenderChat();setTimeout(()=>$('#esc-input')?.focus(),50);},
  escToc:email=>{$('#esc-menu')&&($('#esc-menu').hidden=true);escEnviar({canal:canalDm(meuEmailEsc(),email),texto:'🚪 bateu na porta',tipo:'toc'});toast('Você bateu na porta 🚪');},
  escIrAte:email=>{$('#esc-menu').hidden=true;escIrAte(email);},
  escMeet:id=>{if(!podeSala(id))return toast('Sala fechada para parceiros 🔒',1);const l=db.salas?.[id]?.meet;if(l)window.open(l,'_blank','noopener');else toast('Esta sala ainda não tem link de chamada (Configurações → Escritório virtual)',1);},
  escVisual:()=>escEditarVisual(),
  salvarSalas:()=>{
    const novas={};let erro='';
    SALAS_ORDEM.forEach(id=>{const n=$('#sala_n_'+id).value.trim();let m=$('#sala_m_'+id).value.trim().replace(/^http:\/\//i,'https://');
      if(m&&!/^https:\/\//i.test(m))m='https://'+m; // aceita "meet.google.com/abc-defg-hij" sem o https://
      if(m&&!/^https:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(m)){erro=erro||salaNome(id);$('#sala_m_'+id).classList.add('err');return;}
      novas[id]={nome:n||salasPadrao()[id].nome,meet:m};});
    if(erro)return toast('Link inválido na sala "'+erro+'". Cole o endereço da chamada, ex.: https://meet.google.com/abc-defg-hij',1);
    db.salas=novas;save();render();toast('Salas salvas ✓');},
};
function cardSalasConfig(){
  return `<div class="card"><h3>✦ Escritório virtual — salas</h3><div class="small muted" style="margin-bottom:8px">Renomeie as salas e cole um link fixo do <b>Google Meet</b> para cada uma (em meet.google.com → "Criar uma reunião para depois"). O botão 🎥 da sala abre a chamada. O parceiro só entra na <b>${esc(salaNome(SALA_PARCEIRO))}</b>.</div>
    <div class="fgrid">${SALAS_ORDEM.map(id=>`<label>Nome da sala<input id="sala_n_${id}" value="${esc(salaNome(id))}"></label><label>Link da chamada (Google Meet)<input id="sala_m_${id}" type="url" placeholder="https://meet.google.com/…" value="${esc(db.salas?.[id]?.meet||'')}"></label>`).join('')}</div>
    <div class="mfoot"><button class="btn btn-brand" data-act="salvarSalas">Salvar salas</button></div></div>`;
}

/* ---------- demonstração: colegas simulados e regras iguais às do servidor ---------- */
function escCanalOk(u,canal){
  const parc=u.papel==='parceiro';
  if(canal==='geral')return !parc;
  let m=canal.match(/^sala:([a-z]+)$/);if(m)return SALAS_ORDEM.includes(m[1])&&(!parc||m[1]===SALA_PARCEIRO);
  m=canal.match(/^dm:([^|]+)\|([^|]+)$/);if(m){const eu=norm(u.email);return m[1]!==m[2]&&(m[1]===eu||m[2]===eu);}
  return false;
}
const KEY_SALA_DEMO='msadv_gestao_v6_demo_sala';
function demoSala(u,b){
  let S;try{S=JSON.parse(localStorage.getItem(KEY_SALA_DEMO)||'null');}catch(e){}
  if(!S||!S.pres)S={pres:{},msgs:[],seq:0,pend:[]};
  const agora=Date.now();const me=norm(u.email),parc=u.papel==='parceiro';
  if(b.presenca){const p=b.presenca;let sala=SALAS_ORDEM.includes(p.sala)?p.sala:'recepcao';if(parc)sala=SALA_PARCEIRO;
    S.pres[me]={email:me,nome:u.nome,papel:u.papel,sala,x:Math.min(100,Math.max(0,+p.x||50)),y:Math.min(100,Math.max(0,+p.y||50)),status:p.status||'disponivel',visual:p.visual||{},visto:agora};}
  const add=(canal,de,nome,texto,tipo)=>{S.msgs.push({id:++S.seq,canal,de,nome,texto,tipo,em:agora+(S.seq%7)});};
  if(b.enviar){const c=String(b.enviar.canal||''),t=String(b.enviar.texto||'').trim().slice(0,2000);
    if(!t||!escCanalOk(u,c))throw {status:400,msg:'Não foi possível enviar a mensagem.'};
    add(c,me,u.nome,t,b.enviar.tipo||'msg');
    const outro=c.startsWith('dm:')?c.slice(3).split('|').find(e=>e!==me):null;
    if(outro&&S.pres[outro]&&S.pres[outro].bot&&b.enviar.tipo!=='emote')
      S.pend.push({at:agora+2500,canal:c,de:outro,texto:b.enviar.tipo==='toc'?'Pode entrar! 😊':['Oi! Já te respondo 😊','Combinado! 👍','Pode deixar, vou ver isso agora.','Estou em atendimento, falo com você em 10 min.'][S.seq%4]});
    if(c==='geral'&&b.enviar.tipo==='msg'){const bot=Object.values(S.pres).find(p=>p.bot&&p.papel!=='parceiro');if(bot)S.pend.push({at:agora+1800,canal:'sala:'+bot.sala,de:bot.email,texto:'👍',tipo:'emote'});}}
  // colegas simulados (as outras contas da demonstração)
  const salaDe=c=>/vit/i.test(c.nome)?'vitoria':/martins|joyce/i.test(c.nome)?'joyce':c.papel==='parceiro'?'reuniao':/secret/i.test(c.nome)?'recepcao':/estag/i.test(c.nome)?'comercial':'copa';
  demo.store.contas.filter(c=>c.ativo&&norm(c.email)!==me).forEach((c,i)=>{const e=norm(c.email);let p=S.pres[e];
    if(p&&!p.bot)return; // conta usada de verdade neste navegador
    if(!p){const s=salaDe(c);const[x,y]=pontoNaSala(s);p=S.pres[e]={email:e,nome:c.nome,papel:c.papel,sala:s,x,y,status:['disponivel','atendimento','foco','disponivel'][i%4],visual:visualPadrao(e),bot:1};}
    if(Math.random()<.08){const[x,y]=pontoNaSala(p.sala);p.x=x;p.y=y;}
    p.visto=agora;});
  S.pend=S.pend.filter(r=>{if(r.at>agora)return true;const p=S.pres[r.de];if(p)add(r.canal,r.de,p.nome,r.texto,r.tipo||'msg');return false;});
  if(S.msgs.length>1500)S.msgs=S.msgs.slice(-1000);
  try{localStorage.setItem(KEY_SALA_DEMO,JSON.stringify(S));}catch(e){}
  const desde=+b.desde||0;
  const msgs=S.msgs.filter(m=>(desde?m.em>desde:m.em>agora-30*864e5)&&escCanalOk(u,m.canal));
  const pres=Object.values(S.pres).filter(p=>p.visto>agora-600000&&(!parc||p.sala===SALA_PARCEIRO||p.email===me))
    .map(p=>({email:p.email,nome:p.nome,papel:p.papel,sala:p.sala,x:p.x,y:p.y,status:p.status,visual:p.visual,online:p.visto>agora-45000}));
  return {ok:true,agora,presencas:pres,mensagens:msgs};
}
