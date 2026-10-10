/* =========================================================
   COMPONENTES DE VISUALIZAÇÃO
   ========================================================= */
const pill=(t,c)=>`<span class="pill ${c}">${esc(t)}</span>`;
const pStatusLanc=s=>pill(s,s==='Pago'?'p-green':s==='Atrasado'?'p-red':'p-amber');
const pStatusProc=s=>pill(s,s==='Em andamento'?'p-blue':s==='Ganho'||s==='Acordo'?'p-green':s==='Perdido'?'p-red':'p-gray');
const pPrior=p=>pill(p,p==='Alta'?'p-red':p==='Média'?'p-amber':'p-gray');
const pTipoEvt=t=>tagTipo(t);
const pEtapa=e=>pill(e,e==='Fechado'||e==='Cliente'?'p-green':e==='Perdido'?'p-red':e==='Em recuperação'?'p-amber':e==='Proposta enviada'?'p-blue':'p-gray');
function prazoTxt(d){const n=diff(d);if(n<0)return `<span style="color:var(--red);font-weight:600">vencido há ${-n} dia${n===-1?'':'s'}</span>`;if(n===0)return '<span style="color:var(--red);font-weight:600">hoje</span>';if(n===1)return '<span style="color:var(--amber);font-weight:600">amanhã</span>';return `<span class="${n<=5?'strong':'muted'}" style="${n<=5?'color:var(--amber)':''}">em ${n} dias</span>`;}
function kpi(l,v,s,cls){return `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s ${cls||''}">${s||'&nbsp;'}</div></div>`;}
function hbars(items,fmt){const max=Math.max(1,...items.map(i=>i[1]));if(!items.length)return '<div class="empty">Sem dados</div>';
  return items.map(([l,v,c])=>`<div class="hb"><div class="lb" title="${esc(l)}">${esc(l)}</div><div class="tr"><div class="fl" style="width:${(Math.max(0,v)/max*100).toFixed(1)}%;${c?'background:'+c:''}"></div></div><div class="num small">${fmt?fmt(v):v}</div></div>`).join('');}
function evItem(e,showProc=true){
  const p=proc(e.processoId);
  return `<div class="ev${e.feito?' done':''}"><input type="checkbox" data-act="toggleEv" data-id="${e.id}"${e.feito?' checked':''} aria-label="Marcar como cumprido">
    <div class="body" data-act="editEv" data-id="${e.id}"><div class="t">${esc(e.titulo)}</div>
    <div class="small muted">${pTipoEvt(e.tipo)} ${e.hora?esc(e.hora)+' · ':''}${showProc&&p?esc(p.numero)+' · ':''}${esc(nomeCli(e.clienteId))} · ${esc(nomesResp(e))}</div></div>
    <div class="small" style="text-align:right;white-space:nowrap">${fd(e.data)}<br>${e.feito?'<span class="muted">cumprido</span>':prazoTxt(e.data)}${e.feito?'':`<br><a class="gcal" href="${esc(linkGcalEvento(e))}" target="_blank" rel="noopener" title="Adicionar ao Google Agenda">+ Google Agenda</a>`}</div></div>`;
}
function fluxo6(){
  const out=[];for(let m=-5;m<=0;m++){const ym=monthDate(m,1).slice(0,7),ini=ym+'-01',fim=fimMes(ym);
    out.push({ym,r:sumBy(receitasPagas(ini,fim),l=>l.valor),d:sumBy(despesasPagas(ini,fim,l=>l.categoria!==LUCROS),l=>l.valor)});}
  const max=Math.max(1,...out.flatMap(o=>[o.r,o.d]));
  return `<div class="vbars">${out.map(o=>`<div class="vg" title="${mLabel(o.ym)} — Receitas ${brl(o.r)} · Despesas ${brl(o.d)} · Resultado ${brl(o.r-o.d)}">
    <div class="vgb"><div class="vb" style="height:${o.r/max*150}px;background:var(--green)"></div><div class="vb" style="height:${o.d/max*150}px;background:var(--red);opacity:.75"></div></div>
    <div class="lb">${mLabel(o.ym)}</div><div class="small" style="font-weight:600;color:${o.r-o.d>=0?'var(--green)':'var(--red)'}">${brlK(o.r-o.d)}</div></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--green)"></i>Receitas recebidas</span><span><i style="background:var(--red);opacity:.75"></i>Despesas pagas (sem distribuição de lucros)</span><span>Abaixo: resultado do mês</span></div>`;
}
const mesSel=(grp,val)=>`<input type="month" data-f="${grp}.mes" value="${esc(val)}" aria-label="Mês"><button class="btn btn-ghost btn-sm" data-act="mesNav" data-id="${grp}:-1" aria-label="Mês anterior">‹</button><button class="btn btn-ghost btn-sm" data-act="mesNav" data-id="${grp}:1" aria-label="Próximo mês">›</button>`;
const semPermissao=()=>'<div class="card"><h3>Sem acesso</h3><p class="muted">Seu perfil não tem acesso às informações financeiras. Fale com o administrador.</p></div>';


/* ---------- gráficos ---------- */
function anel(pct,cor,centro,tam=104){
  const r=(tam-14)/2,c=2*Math.PI*r,p=Math.max(0,Math.min(1,pct||0));
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="${Math.round(p*100)}%"><circle cx="${tam/2}" cy="${tam/2}" r="${r}" fill="none" stroke="var(--gray-l)" stroke-width="10"/>
    <circle cx="${tam/2}" cy="${tam/2}" r="${r}" fill="none" stroke="${cor}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c*p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${tam/2} ${tam/2})" class="anel-arco"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${tam/5}" font-weight="800" fill="var(--text)">${centro??Math.round(p*100)+'%'}</text></svg>`;
}
function sparkline(vals,cor='var(--brand2)',w=120,h=34){
  const v=vals.map(x=>x==null?null:+x);const nums=v.filter(x=>x!=null);if(nums.length<2)return '';
  const min=Math.min(...nums),max=Math.max(...nums),rg=max-min||1;const step=w/(v.length-1);
  const pts=v.map((x,i)=>x==null?null:[i*step,h-3-((x-min)/rg)*(h-6)]).filter(Boolean);
  const last=pts[pts.length-1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ')}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${cor}"/></svg>`;
}
/* barras verticais: series=[{nome,cor,vals:[]}], rotulos=[] ; empilhado=true soma as séries */
function barras(series,rotulos,fmt,empilhado,alt=170){
  fmt=fmt||(x=>num(x,0));
  const tot=rotulos.map((_,i)=>empilhado?sumBy(series,s=>s.vals[i]):Math.max(...series.map(s=>+s.vals[i]||0)));
  const max=Math.max(1,...tot);
  return `<div class="bchart" style="--h:${alt}px">${rotulos.map((r,i)=>`<div class="bcol" title="${esc(r)}\n${series.map(s=>s.nome+': '+fmt(+s.vals[i]||0)).join('\n')}">
    <div class="bstack ${empilhado?'emp':''}">${series.map(s=>`<i style="height:${((+s.vals[i]||0)/max*alt).toFixed(1)}px;background:${s.cor}"></i>`).join('')}</div>
    <div class="blb">${esc(r)}</div></div>`).join('')}</div>
    <div class="legend">${series.map(s=>`<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div>`;
}

/* ---------- produtividade, pontos e pins ---------- */
const PONTOS={tarefa:10,prazo:15,contrato:50,atendimento:5,andamento:3};
function produtividade(ym){
  const no=d=>d&&String(d).startsWith(ym);
  const linhas=db.usuarios.filter(u=>!/parceir/i.test(u.papel)).map(u=>{
    const tarefas=db.tarefas.filter(t=>t.status==='done'&&(t.concluidoPor||t.responsavelId)===u.id&&no(t.concluidoEm)).length;
    const prazos=db.eventos.filter(e=>e.feito&&(e.feitoPor||e.responsavelId)===u.id&&no(e.feitoEm||e.data)).length;
    const contratos=db.contratos.filter(k=>k.responsavelId===u.id&&no(k.data)).length;
    const atend=db.leads.filter(l=>l.criadoPor===u.id&&no(l.primeiroContato||l.criado)).length+db.clientes.filter(c=>c.criadoPor===u.id&&!c.leadId&&no(c.criado)).length;
    const andam=sumBy(db.processos,p=>(p.andamentos||[]).filter(a=>a.autor===u.id&&no(a.data)).length);
    const atrasados=db.eventos.filter(e=>!e.feito&&ehResp(e,u.id)&&diff(e.data)<0).length+db.tarefas.filter(t=>t.status!=='done'&&ehResp(t,u.id)&&t.prazo&&diff(t.prazo)<0).length;
    const pontos=tarefas*PONTOS.tarefa+prazos*PONTOS.prazo+contratos*PONTOS.contrato+atend*PONTOS.atendimento+andam*PONTOS.andamento;
    return {u,tarefas,prazos,contratos,atend,andam,atrasados,pontos,pins:[]};
  }).sort((a,b)=>b.pontos-a.pontos);
  linhas.forEach((l,i)=>{
    if(i===0&&l.pontos>0)l.pins.push(['🏆','Líder do mês']);
    if(l.contratos>=2)l.pins.push(['🎯','Fechador(a): '+l.contratos+' contratos']);
    if(l.tarefas>=5)l.pins.push(['🔥','Produtivo(a): '+l.tarefas+' tarefas']);
    if(l.atend>=3)l.pins.push(['🤝','Captador(a): '+l.atend+' atendimentos']);
    if(l.prazos>=2&&!l.atrasados)l.pins.push(['⚡','Prazos em dia']);
    if(l.andam>=3)l.pins.push(['📚','Processos atualizados']);
  });
  return linhas;
}
function statusMetas(ym){
  const ini=ym+'-01',fim=fimMes(ym),m=db.metas;
  const ks=db.contratos.filter(k=>k.data>=ini&&k.data<=fim);
  const atend=db.leads.filter(l=>(l.primeiroContato||l.criado)>=ini&&(l.primeiroContato||l.criado)<=fim).length+db.clientes.filter(c=>!c.leadId&&c.criado>=ini&&c.criado<=fim).length;
  return [
    {id:'qtd',nome:'Contratos fechados',atual:ks.length,meta:+m.qtd||0,cor:'#2E6DA4',fmt:x=>num(x,0)},
    {id:'valor',nome:'Valor contratado',atual:sumBy(ks,k=>k.valorTotal),meta:+m.valorTotal||0,cor:'#C8A84B',fmt:x=>brlK(x),fin:true},
    {id:'atend',nome:'Novos atendimentos',atual:atend,meta:+m.atendimentos||0,cor:'#1A7A6E',fmt:x=>num(x,0)},
  ].filter(x=>x.meta>0);
}
/* ---------- comemoração ---------- */
function confete(ms=3200){
  const cv=document.createElement('canvas');cv.className='confete';document.body.appendChild(cv);
  const ctx=cv.getContext('2d');const W=cv.width=innerWidth,H=cv.height=innerHeight;
  const cores=['#C8A84B','#2E6DA4','#2E7D4E','#C84B6E','#F0D080','#5B93CF'];
  const ps=Array.from({length:160},()=>({x:Math.random()*W,y:-20-Math.random()*H*.5,vx:(Math.random()-.5)*4,vy:2+Math.random()*4,r:4+Math.random()*5,c:cores[Math.random()*cores.length|0],a:Math.random()*6,va:(Math.random()-.5)*.3}));
  const t0=performance.now();
  (function quadro(t){ctx.clearRect(0,0,W,H);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.05;p.a+=p.va;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.c;ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);ctx.restore();});
    if(t-t0<ms)requestAnimationFrame(quadro);else cv.remove();})(t0);
}
function celebrar(titulo,texto){
  if(!window.matchMedia||!matchMedia('(prefers-reduced-motion: reduce)').matches)confete();
  modal('',`<div class="celebra"><div class="trofeu">🏆</div><h2>${esc(titulo)}</h2><p>${esc(texto||'')}</p>${db.metas.premio?`<div class="premio">🎁 ${esc(db.metas.premio)}</div>`:''}</div>`,[{l:'Bora pra próxima! 🚀',c:'btn-gold',fn:closeModal}]);
}
function checarMetas(){
  if(!sessao||ehParceiro()||!db)return;
  const ym=today().slice(0,7);const bat=statusMetas(ym).filter(m=>m.atual>=m.meta&&(!m.fin||podeFin()));
  for(const m of bat){const k='meta_celebrada|'+ym+'|'+m.id+'|'+meuEmail();
    let ja=false;try{ja=!!localStorage.getItem(k);localStorage.setItem(k,'1');}catch(e){}
    if(!ja){celebrar('Meta batida: '+m.nome+'!','A equipe chegou a '+m.fmt(m.atual)+' de '+m.fmt(m.meta)+' neste mês. Parabéns, time!');return;}}
}
