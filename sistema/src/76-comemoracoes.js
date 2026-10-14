/* =========================================================
   COMEMORAÇÕES: efeitos sonoros e visuais nas conquistas, pontos que "voam",
   feed das conquistas da equipe e marcos das metas (50%, 75%, 90%, 100%)
   Cada pessoa liga/desliga em Configurações → Sons e animações (vale para o aparelho).
   ========================================================= */
const prefEfeito=k=>{try{return localStorage.getItem('msadv_fx_'+k)!=='0';}catch(e){return true;}};
const setPrefEfeito=(k,v)=>{try{localStorage.setItem('msadv_fx_'+k,v?'1':'0');}catch(e){}};
let SFX_CTX=null;
function sfxCtx(){if(!SFX_CTX){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;try{SFX_CTX=new C();}catch(e){return null;}}if(SFX_CTX.state==='suspended')SFX_CTX.resume().catch(()=>{});return SFX_CTX;}
document.addEventListener('pointerdown',()=>{if(prefEfeito('som'))sfxCtx();},{once:true}); // o navegador só libera o som depois de um toque
/* sons sintetizados (sem arquivos): [frequência, início(s), duração(s), forma, volume] */
const SFX={
  ding:[[1318.5,0,.18,'sine',.22],[1760,.09,.28,'sine',.18]],
  pop:[[660,0,.08,'sine',.18],[990,.05,.1,'sine',.14]],
  moeda:[[987.8,0,.09,'square',.08],[1318.5,.08,.35,'square',.08]],
  sucesso:[[523.3,0,.16,'triangle',.2],[659.3,.1,.16,'triangle',.2],[784,.2,.16,'triangle',.2],[1046.5,.3,.42,'triangle',.22]],
  fanfarra:[[523.3,0,.14,'triangle',.22],[523.3,.15,.1,'triangle',.2],[523.3,.27,.1,'triangle',.2],[698.5,.4,.5,'triangle',.24],[880,.4,.5,'sine',.12],[784,.92,.14,'triangle',.22],[880,1.07,.14,'triangle',.22],[1046.5,1.22,.75,'triangle',.26],[1318.5,1.22,.75,'sine',.12]],
  whoosh:[[300,0,.25,'sine',.12,900]],
};
function sfx(nome){
  if(!prefEfeito('som'))return;const ctx=sfxCtx();const notas=SFX[nome];if(!ctx||!notas)return;
  try{const t0=ctx.currentTime+.02;notas.forEach(([f,ini,dur,forma,vol,ate])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=forma;o.frequency.setValueAtTime(f,t0+ini);
    if(ate)o.frequency.exponentialRampToValueAtTime(ate,t0+ini+dur);
    g.gain.setValueAtTime(.0001,t0+ini);g.gain.exponentialRampToValueAtTime(vol,t0+ini+.015);g.gain.exponentialRampToValueAtTime(.0001,t0+ini+dur);
    o.connect(g);g.connect(ctx.destination);o.start(t0+ini);o.stop(t0+ini+dur+.05);});}catch(e){}
}
const CONQUISTAS={
  tarefa:{ic:'✅',som:'ding',pts:()=>PONTOS.tarefa},
  prazo:{ic:'⚡',som:'ding',pts:()=>PONTOS.prazo},
  contrato:{ic:'🤝',som:'moeda',som2:'fanfarra',pts:()=>PONTOS.contrato,confete:true},
  deferido:{ic:'✅',som:'fanfarra',pts:()=>PONTOS.deferido,confete:true},
  acordo:{ic:'🤝',som:'fanfarra',confete:true},
  ganho:{ic:'🏆',som:'fanfarra',confete:true},
  peticao:{ic:'📨',som:'sucesso',burst:true},
  edicao:{ic:'✂️',som:'sucesso',burst:true},
  aprovado:{ic:'🎬',som:'sucesso',burst:true},
  publicado:{ic:'🚀',som:'sucesso',confete:true},
};
let ultimoToque={x:innerWidth/2,y:innerHeight/2};
document.addEventListener('pointerdown',e=>{ultimoToque={x:e.clientX,y:e.clientY};},true);
const jaComemorou=new Map();
/* conquista feita por mim, aqui: som + faixa + confete + pontos */
function celebrarEvento(tipo,titulo,sub){
  const c=CONQUISTAS[tipo]||{ic:'🎉',som:'sucesso'};
  const ult=jaComemorou.get(tipo)||0;if(Date.now()-ult<1500)return;jaComemorou.set(tipo,Date.now()); // evita comemorar duas vezes o mesmo clique
  sfx(c.som);if(c.som2)setTimeout(()=>sfx(c.som2),380);
  if(!prefEfeito('anim')){toast(c.ic+' '+titulo+(sub?' — '+sub:''));return;}
  const pts=c.pts?c.pts():0;
  if(pts)pontosVoando('+'+pts+' pts');
  document.querySelectorAll('.conquista').forEach(x=>x.remove()); // uma faixa por vez
  const el=document.createElement('div');el.className='conquista c-'+tipo;
  el.innerHTML=`<div class="conq-ic">${c.ic}</div><div><div class="conq-t"></div><div class="conq-s"></div></div>${pts?`<div class="conq-pts">+${pts}</div>`:''}`;
  el.querySelector('.conq-t').textContent=titulo;el.querySelector('.conq-s').textContent=sub||'';
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('on'));
  setTimeout(()=>{el.classList.remove('on');setTimeout(()=>el.remove(),500);},c.confete?4200:2800);
  if(c.confete&&!reduzMovimento())confete(2600);else if(c.burst&&!reduzMovimento())estouro(ultimoToque.x,ultimoToque.y);
  setTimeout(checarMetas,500);
}
const reduzMovimento=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function pontosVoando(txt){
  if(reduzMovimento())return;const el=document.createElement('div');el.className='pts-voa';el.textContent=txt;
  el.style.left=Math.min(innerWidth-80,Math.max(10,ultimoToque.x-20))+'px';el.style.top=Math.max(60,ultimoToque.y-20)+'px';
  document.body.appendChild(el);setTimeout(()=>el.remove(),1400);
}
/* pequeno estouro de confete no ponto do clique */
function estouro(x,y){
  const cv=document.createElement('canvas');cv.className='confete';document.body.appendChild(cv);const ctx=cv.getContext('2d');cv.width=innerWidth;cv.height=innerHeight;
  const cores=['#C8A84B','#2E6DA4','#2E7D4E','#C84B6E','#F0D080'];
  const ps=Array.from({length:36},()=>{const a=Math.random()*Math.PI*2,v=3+Math.random()*5;return {x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-3,r:3+Math.random()*3,c:cores[Math.random()*5|0]};});
  const t0=performance.now();(function q(t){ctx.clearRect(0,0,cv.width,cv.height);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.25;ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.r*2,p.r);});
    if(t-t0<1100)requestAnimationFrame(q);else cv.remove();})(t0);
}
/* feed: conquistas dos colegas que chegam pela sincronização */
function feedEquipe(itens){
  if(!itens.length||!prefEfeito('feed'))return;
  let box=$('#feed-equipe');if(!box){box=document.createElement('div');box.id='feed-equipe';document.body.appendChild(box);}
  itens.slice(0,3).forEach((it,i)=>setTimeout(()=>{
    const el=document.createElement('div');el.className='feed-item'+(it.grande?' grande':'');
    el.innerHTML=`<div class="av av-g">${esc(initials(it.quem||'?'))}</div><div><div class="strong small"></div><div class="small muted"></div></div><span class="feed-ic">${it.ic}</span>`;
    el.querySelector('.strong').textContent=it.titulo;el.querySelector('.muted').textContent=it.sub||'';
    box.appendChild(el);while(box.children.length>3)box.firstChild.remove();
    sfx(it.grande?'sucesso':'pop');if(it.grande&&prefEfeito('anim')&&!reduzMovimento())estouro(innerWidth-160,innerHeight-80);
    setTimeout(()=>{el.classList.add('sai');setTimeout(()=>el.remove(),400);},7000);},i*900));
  setTimeout(checarMetas,800);
}
/* compara o registro antigo e o novo (vindo de outra pessoa) e descreve a conquista */
function conquistaRemota(col,ant,novo){
  if(!novo||!ant&&!['contratos'].includes(col))return null;
  const me=db.usuarioAtual;const nomeU=id=>db.usuarios.find(u=>u.id===id)?.nome||'';
  if(col==='tarefas'&&novo.status==='done'&&ant.status!=='done'&&novo.concluidoPor!==me)return {ic:'✅',quem:nomeU(novo.concluidoPor),titulo:nomeU(novo.concluidoPor)+' concluiu uma tarefa',sub:novo.titulo};
  if(col==='eventos'&&novo.feito&&!ant.feito&&novo.feitoPor!==me)return {ic:'⚡',quem:nomeU(novo.feitoPor),titulo:nomeU(novo.feitoPor)+' cumpriu um prazo',sub:novo.titulo};
  if(col==='contratos'&&!ant&&novo.responsavelId!==me)return {ic:'🤝',grande:1,quem:nomeU(novo.responsavelId),titulo:'🎉 '+(nomeU(novo.responsavelId)||'A equipe')+' fechou um contrato!',sub:nomeCli(novo.clienteId)};
  if(col==='sm'&&novo.status==='Deferido'&&ant.status!=='Deferido')return {ic:'✅',grande:1,quem:nomeU(novo.responsavelId),titulo:'Benefício deferido! 🎉',sub:nomeCli(novo.clienteId)};
  if(col==='processos'&&novo.status!==ant.status&&['Ganho','Acordo','Deferido'].includes(novo.status))return {ic:novo.status==='Ganho'?'🏆':novo.status==='Acordo'?'🤝':'✅',grande:1,quem:nomeU(novo.responsavelId),titulo:(novo.status==='Ganho'?'Processo ganho!':novo.status==='Acordo'?'Acordo fechado!':'Requerimento deferido!')+' 🎉',sub:nomeCli(novo.clienteId)};
  if(col==='peticoes'&&novo.status==='Protocolada'&&ant.status!=='Protocolada')return {ic:'📨',quem:nomeU(novo.autorId),titulo:'Petição protocolada',sub:novo.titulo};
  if(col==='conteudos'&&novo.etapa==='Publicado'&&ant.etapa!=='Publicado')return {ic:'🚀',grande:1,quem:'',titulo:'Conteúdo publicado!',sub:novo.titulo};
  return null;
}
/* marcos da meta do mês (uma vez por aparelho): 50%, 75%, 90% */
function checarMarcosMeta(){
  if(!sessao||ehExterno()||!db)return;const ym=today().slice(0,7);
  statusMetas(ym).forEach(m=>{if(!m.meta||(m.fin&&!podeFin()))return;const p=m.atual/m.meta;if(p>=1)return;
    const marco=[90,75,50].find(x=>p*100>=x);if(!marco)return;const k='marco|'+ym+'|'+m.id+'|'+marco+'|'+meuEmail();
    try{if(localStorage.getItem(k))return;localStorage.setItem(k,'1');}catch(e){return;}
    sfx('sucesso');toastAcao(`🔥 ${marco}% da meta "${m.nome}"! ${m.fin?'':'Faltam '+m.fmt(Math.max(0,m.meta-m.atual))+'.'} Bora!`,'Ver metas',()=>{location.hash='painel';});});
}
function cardEfeitos(){
  const t=(k,l,d)=>`<label class="chk"><input type="checkbox" data-act="fxPref" data-id="${k}"${prefEfeito(k)?' checked':''}> <span><b>${l}</b><br><span class="small muted">${d}</span></span></label>`;
  return `<div class="card"><h3>🎉 Sons e animações</h3><p class="small muted">Comemorações quando alguém conclui uma tarefa, cumpre um prazo, fecha contrato, tem benefício deferido, fecha acordo ou bate a meta. Vale para este aparelho.</p>
    <div style="display:flex;flex-direction:column;gap:10px">${t('som','Efeitos sonoros','Plim na tarefa concluída, moedinha no contrato, fanfarra no deferimento e na meta.')}${t('anim','Animações','Faixa de conquista, confete e "+pontos" voando.')}${t('feed','Conquistas da equipe','Aviso no canto da tela quando um colega conclui algo.')}</div>
    <div class="mfoot"><button class="btn btn-ghost btn-sm" data-act="fxTeste" data-id="tarefa">Testar tarefa</button><button class="btn btn-ghost btn-sm" data-act="fxTeste" data-id="contrato">Testar contrato</button><button class="btn btn-ghost btn-sm" data-act="fxTeste" data-id="meta">Testar meta</button></div></div>`;
}
const FX_ACOES={
  fxPref:(k,el)=>{setPrefEfeito(k,el.checked);if(el.checked&&k==='som'){sfxCtx();sfx('ding');}},
  fxTeste:k=>{jaComemorou.delete(k);if(k==='meta'){sfx('fanfarra');celebrar('Meta batida: Contratos fechados!','Exemplo de comemoração quando a equipe bate a meta do mês.');}
    else celebrarEvento(k,k==='contrato'?'Contrato fechado!':'Tarefa concluída!',k==='contrato'?'Exemplo de comemoração':'Exemplo de comemoração');},
};
