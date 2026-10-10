/* =========================================================
   PÁGINAS — versão 6
   ========================================================= */
const FRASES=['Cada prazo cumprido é um cliente mais tranquilo.','Pequenas tarefas concluídas hoje viram grandes resultados no fim do mês.','Atendimento rápido fecha contrato: responda os novos contatos primeiro!','Organização é a melhor estratégia processual.','Meta batida é conquista de todo o time. Bora!','Cliente bem informado indica o escritório.','Foco no que vence hoje, olhar no que vence amanhã.'];
const smCor=s=>/Deferido|Concluído/.test(s)?'p-green':/Indeferido/.test(s)?'p-red':/exigência/i.test(s)?'p-amber':/Protocolado|Pronto/.test(s)?'p-blue':/Recurso/.test(s)?'p-teal':'p-gray';
const guiaCor=s=>s==='Paga'?'p-green':s==='Vencida'?'p-red':s==='Emitida'?'p-blue':'p-amber';
const leadsSemRetorno=()=>db.leads.filter(l=>!l.convertido&&!['Fechado','Perdido','Encaminhado a parceiro'].includes(l.etapa)&&diff(l.ultimoContato||l.primeiroContato||l.criado)<=-3);
function guiasPendentes(dias){const out=[];db.sm.forEach(c=>(c.guias||[]).forEach(g=>{const st=guiaStatus(g);if(st!=='Paga'&&diff(g.venc)<=dias)out.push({c,g,st});}));return out.sort((a,b)=>a.g.venc.localeCompare(b.g.venc));}
function aniversariantes(dias){
  const h=new Date();const lista=[];
  db.clientes.concat(db.usuarios.map(u=>({...u,_equipe:1}))).forEach(p=>{if(!p.nascimento)return;const[,m,d]=p.nascimento.split('-').map(Number);
    let prox=new Date(h.getFullYear(),m-1,d);if(prox<new Date(h.getFullYear(),h.getMonth(),h.getDate()))prox=new Date(h.getFullYear()+1,m-1,d);
    const n=Math.round((prox-new Date(h.getFullYear(),h.getMonth(),h.getDate()))/864e5);if(n<=dias)lista.push({p,n});});
  return lista.sort((a,b)=>a.n-b.n);
}

/* ---------------- PAINEL ---------------- */
/* tarefas ligadas a um parceiro: responsável por ela ou caso da parceria dele */
const tarefasParceiro=email=>db.tarefas.filter(t=>doParceiro(t,email)).sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.prazo||'9').localeCompare(b.prazo||'9'));
const linhaTarefa=t=>`<div class="ev${t.status==='done'?' done':''}"><span class="pic" style="width:16px">${t.status==='done'?'✔':'☑'}</span><div class="body" data-act="editTar" data-id="${t.id}"><div class="t" style="${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.titulo)}</div><div class="small muted">${esc(TSTATUS.find(s=>s[0]===t.status)[1])} · ${esc(nomesResp(t))}${t.clienteId&&cli(t.clienteId)?' · '+esc(nomeCli(t.clienteId)):''}</div></div><div class="small" style="text-align:right">${t.prazo?(t.status==='done'?fd(t.prazo):prazoTxt(t.prazo)):''}</div></div>`;
function painelParceiro(){
  const email=sessao.email,h=new Date().getHours();
  const ts=tarefasParceiro(email),abertas=ts.filter(t=>t.status!=='done'),atras=abertas.filter(t=>t.prazo&&diff(t.prazo)<0);
  const evs=db.eventos.filter(e=>!e.feito&&diff(e.data)<=15).sort((a,b)=>(a.data+(a.hora||'')).localeCompare(b.data+(b.hora||'')));
  const cls=db.clientes.filter(c=>norm(c.parceiro)===norm(email));
  const chip=(n,l,href,cls)=>`<a class="hchip ${cls||''}" href="${href}"><b>${n}</b><span>${l}</span></a>`;
  return `<div class="hero"><div><div class="hero-oi">${h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}, ${esc(sessao.nome)}! 👋</div><div class="hero-sub">Aqui está o que está com você na nossa parceria.</div></div>
    <div class="hchips">${chip(abertas.length,'tarefas em aberto','#tarefas')}${chip(atras.length,'em atraso','#tarefas',atras.length?'perigo':'ok')}${chip(evs.length,'prazos (15 dias)','#painel')}${chip(cls.length,'clientes da parceria','#parcerias')}</div></div>
    <div class="grid g-2">
      <div class="card"><h3>☑ Minhas tarefas <span><button class="btn btn-gold btn-sm" data-act="novaTar">+ Tarefa</button> <a class="btn btn-ghost btn-sm" href="#tarefas">Quadro</a></span></h3>${abertas.map(linhaTarefa).join('')||'<div class="empty">Nenhuma tarefa em aberto 🎉</div>'}</div>
      <div class="card"><h3>📅 Prazos e compromissos — próximos 15 dias</h3>${evs.map(e=>`<div class="ev" data-act="editEv" data-id="${e.id}"><div class="body"><div class="t">${esc(e.titulo)}</div><div class="small muted">${tagTipo(e.tipo)} ${esc(nomeCli(e.clienteId))} · ${esc(nomesResp(e))}</div></div><div class="small" style="text-align:right">${fd(e.data)}${e.hora?' '+esc(e.hora):''}<br>${prazoTxt(e.data)}</div></div>`).join('')||'<div class="empty">Nenhum prazo próximo</div>'}</div>
    </div>`;
}
V.painel=()=>{
  if(ehParceiro())return painelParceiro();
  const ym=today().slice(0,7),me=db.usuarioAtual;
  const evs=db.eventos.filter(e=>!e.feito);
  const atrasE=evs.filter(e=>diff(e.data)<0),hojeE=evs.filter(e=>diff(e.data)===0);
  const semana=evs.filter(e=>diff(e.data)>=0&&diff(e.data)<=7).sort((a,b)=>(a.data+(a.hora||'')).localeCompare(b.data+(b.hora||'')));
  const aud=semana.filter(e=>/audi|per[ií]cia/i.test(e.tipo));
  const tAtras=db.tarefas.filter(t=>t.status!=='done'&&t.prazo&&diff(t.prazo)<0);
  const minhas=db.tarefas.filter(t=>t.status!=='done'&&ehResp(t,me));
  const nome=sessao?sessao.nome:nomeUsr(me);const h=new Date().getHours();
  const frase=FRASES[new Date().getDate()%FRASES.length];
  const chip=(n,l,href,cls)=>`<a class="hchip ${cls||''}" href="${href}"><b>${n}</b><span>${l}</span></a>`;
  // agenda agrupada
  const grupos={};semana.forEach(e=>(grupos[e.data]=grupos[e.data]||[]).push(e));
  const rotDia=d=>{const n=diff(d);return n===0?'Hoje':n===1?'Amanhã':fdw(d);};
  const agenda=Object.keys(grupos).length?Object.entries(grupos).map(([d,l])=>`<div class="tl-dia"><div class="tl-rot ${diff(d)===0?'hoje':''}">${rotDia(d)}</div>${l.map(e=>`<div class="tl-ev" data-act="editEv" data-id="${e.id}" style="border-left-color:${corTipo(e.tipo)}">
      <div class="tl-hora">${esc(e.hora||'—')}</div><div class="tl-txt"><div class="strong">${esc(e.titulo)}</div><div class="small muted">${tagTipo(e.tipo)} ${esc(nomeCli(e.clienteId))} · ${esc(nomesResp(e))}</div></div></div>`).join('')}</div>`).join(''):'<div class="empty">Nenhum compromisso nos próximos 7 dias</div>';
  // pendências
  const pend=[];
  atrasE.forEach(e=>pend.push(['r','⏰',`Prazo vencido: ${e.titulo}`,nomeCli(e.clienteId),`editEv`,e.id]));
  tAtras.forEach(t=>pend.push(['r','☑',`Tarefa atrasada: ${t.titulo}`,nomesResp(t),'editTar',t.id]));
  db.sm.filter(c=>c.status==='Aguardando o parto').forEach(c=>{const nome=nomeCli(c.clienteId);
    if(c.dpp&&diff(c.dpp)<0)pend.push(['r','👶',`Data provável do parto já passou (${fd(c.dpp)}): confirmar nascimento e protocolar`,nome,'go','sm/'+c.id]);
    else if(c.dpp&&diff(c.dpp)<=10)pend.push(['a','👶',`Parto previsto para ${fd(c.dpp)}: preparar o protocolo do benefício`,nome,'go','sm/'+c.id]);});
  db.processos.filter(p=>p.status==='Em andamento'&&p.fase==='Em exigência').forEach(p=>pend.push(['a','⚑',`Exigência em aberto: ${p.numero}`,nomeCli(p.clienteId),'go','processo/'+p.id]));
  db.processos.filter(p=>p.status==='Em andamento'&&p.tipo==='Administrativo'&&p.prazoAnalise&&diff(p.prazoAnalise)<0&&/análise/.test(p.fase)).forEach(p=>pend.push(['a','⌛',`Análise do INSS passou do prazo: ${p.numero}`,nomeCli(p.clienteId),'go','processo/'+p.id]));
  guiasPendentes(10).forEach(({c,g,st})=>pend.push([st==='Vencida'?'r':'a','₲',`Guia ${mLabel(g.competencia)} ${st==='Vencida'?'VENCIDA':st==='A emitir'?'a emitir':'aguardando pagamento'} — vence ${fd(g.venc)}`,nomeCli(c.clienteId),'go','sm/'+c.id]));
  leadsSemRetorno().forEach(l=>pend.push(['b','◈',`Atendimento sem retorno há ${-diff(l.ultimoContato||l.primeiroContato||l.criado)} dias: ${l.nome}`,l.etapa,'editLead',l.id]));
  const docsPend={};db.documentos.filter(d=>!d.recebido).forEach(d=>docsPend[d.clienteId]=(docsPend[d.clienteId]||0)+1);
  Object.entries(docsPend).forEach(([cid,n])=>pend.push(['b','▤',`${n} documento(s) pendente(s)`,nomeCli(cid),'go','cliente/'+cid]));
  const ordem={r:0,a:1,b:2};pend.sort((a,b)=>ordem[a[0]]-ordem[b[0]]);
  const pendHtml=pend.length?pend.slice(0,12).map(([sev,ic,txt,sub,act,id])=>`<div class="pend pend-${sev}" ${act==='go'?`data-go="${id}"`:`data-act="${act}" data-id="${id}"`}><span class="pic">${ic}</span><div><div class="strong">${esc(txt)}</div><div class="small muted">${esc(sub||'')}</div></div></div>`).join('')+(pend.length>12?`<div class="small muted" style="padding:8px 4px">+ ${pend.length-12} outras pendências</div>`:''):'<div class="empty">Nenhuma pendência. Excelente trabalho! ✨</div>';
  // metas
  let metasHtml='',rankHtml='';
  if(!ehParceiro()){
    const ms=statusMetas(ym);
    metasHtml=`<div class="card destaque-metas"><h3>🎯 Metas da equipe — ${MESES_L[+ym.slice(5)-1]}<a class="btn btn-ghost btn-sm" href="#contratos">Detalhes</a></h3>
      <div class="aneis">${ms.map(m=>{const p=m.meta?m.atual/m.meta:0,ok=p>=1;const mostra=!m.fin;
        return `<div class="anel-box ${ok?'batida':''}">${anel(p,ok?'#2E7D4E':m.cor)}<div class="strong">${m.nome}</div><div class="small muted">${mostra?m.fmt(m.atual)+' de '+m.fmt(m.meta):Math.round(p*100)+'% da meta'}</div>${ok?'<div class="selo">🏆 Batida!</div>':`<div class="small" style="color:var(--amber)">${mostra?'faltam '+m.fmt(Math.max(0,m.meta-m.atual)):'falta '+Math.max(0,100-Math.round(p*100))+'%'}</div>`}</div>`;}).join('')||'<div class="empty">Defina as metas em Configurações</div>'}</div>
      ${db.metas.premio?`<div class="premio">🎁 <b>Prêmio:</b> ${esc(db.metas.premio)}</div>`:''}</div>`;
    const prod=produtividade(ym);const top=prod.slice(0,3);const med=['🥇','🥈','🥉'];
    rankHtml=`<div class="card"><h3>🏅 Produtividade da equipe — ranking do mês<small>${Object.entries(PONTOS).map(([k,v])=>`${{tarefa:'tarefa',prazo:'prazo cumprido',contrato:'contrato',atendimento:'atendimento',andamento:'andamento'}[k]} +${v}`).join(' · ')}</small></h3>
      <div class="podio">${top.map((l,i)=>`<div class="pod pod${i+1}"><div class="medalha">${med[i]}</div><div class="av av-g">${esc(initials(l.u.nome))}</div><div class="strong">${esc(l.u.nome)}</div><div class="pts">${l.pontos} pts</div><div class="pins">${l.pins.map(p=>`<span title="${esc(p[1])}">${p[0]}</span>`).join('')}</div></div>`).join('')}</div>
      <div class="tbl"><table class="rank"><thead><tr><th>Pessoa</th><th class="num" title="Tarefas concluídas">Tar.</th><th class="num" title="Prazos e compromissos cumpridos">Praz.</th><th class="num" title="Atendimentos cadastrados">Atend.</th><th class="num" title="Contratos fechados">Contr.</th><th class="num">Pontos</th></tr></thead><tbody>
      ${prod.map(l=>`<tr><td><span class="strong">${esc(l.u.nome)}</span> ${l.pins.map(p=>`<span class="pin" title="${esc(p[1])}">${p[0]}</span>`).join('')}${l.atrasados?` <span class="pill p-red" title="Prazos/tarefas em atraso">${l.atrasados} atraso${l.atrasados>1?'s':''}</span>`:''}</td><td class="num">${l.tarefas}</td><td class="num">${l.prazos}</td><td class="num">${l.atend}</td><td class="num">${l.contratos}</td><td class="num strong">${l.pontos}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const aniv=aniversariantes(7);const scrAniv=db.scripts.find(s=>s.categoria==='Aniversário');
  const anivHtml=aniv.length?aniv.map(({p,n})=>`<div class="ev"><div class="av" style="background:#F3D9E3;color:#8B2D4A">🎂</div><div class="body"><div class="t">${esc(p.nome)}${p._equipe?' <span class="small muted">(equipe)</span>':''}</div><div class="small muted">${n===0?'Hoje!':n===1?'Amanhã':'em '+n+' dias'} · ${fd(p.nascimento).slice(0,5)}</div></div>${!p._equipe&&p.tel?`<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(p.tel,personalizar(scrAniv?.texto||'Feliz aniversário, [Nome]!',p))}" style="text-decoration:none">Parabenizar</a>`:''}</div>`).join(''):'<div class="empty">Nenhum aniversário nos próximos 7 dias</div>';
  const partos=db.sm.filter(c=>!c.dataParto&&c.dpp&&diff(c.dpp)>=-7&&diff(c.dpp)<=45).sort((a,b)=>a.dpp.localeCompare(b.dpp));
  const smHtml=`${partos.slice(0,4).map(c=>`<div class="ev" data-go="sm/${c.id}"><div class="av" style="background:#FDE8EF;color:#C84B6E">👶</div><div class="body"><div class="t">${esc(nomeCli(c.clienteId))}</div><div class="small muted">Parto previsto ${fd(c.dpp)} (${diff(c.dpp)>=0?'em '+diff(c.dpp)+' dias':'há '+(-diff(c.dpp))+' dias'})</div></div></div>`).join('')}
    ${guiasPendentes(10).slice(0,5).map(({c,g,st})=>`<div class="ev" data-go="sm/${c.id}"><div class="av" style="background:var(--amber-l);color:var(--amber)">₲</div><div class="body"><div class="t">Guia ${mLabel(g.competencia)} — ${esc(nomeCli(c.clienteId))}</div><div class="small muted">vence ${fd(g.venc)}</div></div>${pill(st,guiaCor(st))}</div>`).join('')}`;
  return `<div class="hero">
      <div><div class="hero-oi">${h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}, ${esc(nome)}! 👋</div><div class="hero-sub">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · ${frase}</div></div>
      <div class="hchips">${chip(hojeE.length,'prazos hoje','#agenda',hojeE.length?'alerta':'')}${chip(atrasE.length+tAtras.length,'em atraso','#agenda',atrasE.length+tAtras.length?'perigo':'ok')}${chip(aud.length,'audiências e perícias (7 dias)','#agenda')}${chip(minhas.length,'minhas tarefas','#tarefas')}</div>
    </div>
    <div class="grid g-2">
      <div class="card"><h3>📅 Agenda — próximos 7 dias <a class="btn btn-ghost btn-sm" href="#agenda">Agenda completa</a></h3><div class="timeline-dias">${agenda}</div></div>
      <div class="card"><h3>⚠️ Pendências <small>${pend.length} item(ns)</small></h3><div class="pend-lista">${pendHtml}</div></div>
    </div>
    ${ehParceiro()?'':`<div class="grid g-2">${metasHtml}${rankHtml}</div>`}
    <div class="grid g-3">
      <div class="card"><h3>🎂 Aniversariantes da semana</h3>${anivHtml}</div>
      <div class="card"><h3>👶 Salário-maternidade <a class="btn btn-ghost btn-sm" href="#sm">Abrir</a></h3>${smHtml.trim()||'<div class="empty">Nenhum parto previsto ou guia pendente</div>'}</div>
      <div class="card"><h3>◈ Novos atendimentos <a class="btn btn-ghost btn-sm" href="#atendimentos">CRM</a></h3>${db.leads.filter(l=>l.etapa==='Novo contato').slice(0,6).map(l=>`<div class="ev"><div class="body" data-act="editLead" data-id="${l.id}"><div class="t">${esc(l.nome)}</div><div class="small muted">${esc(l.produto||'')} · ${esc(l.origem||'')} · ${fd(l.primeiroContato||l.criado)}</div></div>${l.tel?`<a class="btn btn-ghost btn-sm" style="text-decoration:none;color:#1F9D55" target="_blank" rel="noopener" href="${waLink(l.tel)}">WhatsApp</a>`:''}</div>`).join('')||'<div class="empty">Nenhum contato novo aguardando</div>'}</div>
    </div>`;
};

/* ---------------- AGENDA ---------------- */
V.agenda=()=>{
  const f=ui.f.agenda||(ui.f.agenda={resp:'',tipo:'',feitos:false,tarefas:true});
  const gOk=!gIndisponivel();
  const head=`<div class="toolbar">
    <div class="tabs" style="margin:0;border:none"><button class="tab ${ui.agendaView==='lista'?'active':''}" data-act="agView" data-id="lista">Lista</button><button class="tab ${ui.agendaView==='mes'?'active':''}" data-act="agView" data-id="mes">Mês</button></div>
    <select data-f="agenda.resp"><option value="">Todos os responsáveis</option>${db.usuarios.map(u=>`<option value="${u.id}"${f.resp===u.id?' selected':''}>${esc(u.nome)}</option>`).join('')}</select>
    <select data-f="agenda.tipo"><option value="">Todos os tipos</option>${db.tiposEvento.map(t=>`<option${f.tipo===t.nome?' selected':''}>${esc(t.nome)}</option>`).join('')}</select>
    <label class="small"><input type="checkbox" data-f="agenda.tarefas"${f.tarefas?' checked':''}> tarefas</label>
    <label class="small"><input type="checkbox" data-f="agenda.feitos"${f.feitos?' checked':''}> cumpridos</label>
    <span class="grow"></span>
    <button class="btn btn-ghost" data-act="gcalSync" title="${gOk?'Envia seus compromissos e tarefas para o seu Google Agenda':esc(gIndisponivel())}">↻ Google Agenda</button>
    <button class="btn btn-ghost" data-act="ics" title="Arquivo para importar em qualquer agenda (Google, Outlook, celular)">Exportar .ics</button>
    <button class="btn btn-gold" data-act="novoEv">+ Compromisso</button></div>`;
  let evs=db.eventos.filter(e=>(!f.resp||ehResp(e,f.resp))&&(!f.tipo||e.tipo===f.tipo));
  const tars=f.tarefas&&!f.tipo?db.tarefas.filter(t=>t.prazo&&(!f.resp||ehResp(t,f.resp))&&(f.feitos||t.status!=='done')):[];
  if(ui.agendaView==='mes'){
    const [y,m]=ui.agendaMes.split('-').map(Number);const first=new Date(y,m-1,1);const start=first.getDay();const days=new Date(y,m,0).getDate();
    let cells=['dom','seg','ter','qua','qui','sex','sáb'].map(d=>`<div class="hd">${d}</div>`).join('');
    for(let i=0;i<start;i++)cells+='<div class="out"></div>';
    for(let d=1;d<=days;d++){const ds=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const de=evs.filter(e=>e.data===ds).sort((a,b)=>(a.hora||'').localeCompare(b.hora||''));const dt=tars.filter(t=>t.prazo===ds);
      cells+=`<div class="${ds===today()?'today':''}"><div class="dn" data-act="novoEvData" data-id="${ds}" title="Adicionar compromisso">${d}</div>${de.map(e=>`<span class="ce" style="background:color-mix(in srgb,${corTipo(e.tipo)} 16%,transparent);color:${corTipo(e.tipo)};${e.feito?'opacity:.45;text-decoration:line-through':''}" data-act="editEv" data-id="${e.id}" title="${esc(e.tipo+': '+e.titulo)}">${e.hora?esc(e.hora)+' ':''}${esc(e.titulo)}</span>`).join('')}${dt.map(t=>`<span class="ce p-gray" data-act="editTar" data-id="${t.id}" title="Tarefa: ${esc(t.titulo)}" style="${t.status==='done'?'opacity:.45;text-decoration:line-through':''}">☑ ${esc(t.titulo)}</span>`).join('')}</div>`;}
    const tail=(7-(start+days)%7)%7;for(let i=0;i<tail;i++)cells+='<div class="out"></div>';
    return head+`<div class="card"><h3><span><button class="btn btn-ghost btn-sm" data-act="agMes" data-id="-1">‹</button> ${first.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})} <button class="btn btn-ghost btn-sm" data-act="agMes" data-id="1">›</button></span><small>Clique no número do dia para adicionar</small></h3><div class="cal">${cells}</div>
      <div class="legend">${db.tiposEvento.map(t=>`<span><i style="background:${t.cor}"></i>${esc(t.nome)}</span>`).join('')}</div></div>`;
  }
  if(!f.feitos)evs=evs.filter(e=>!e.feito);
  evs.sort((a,b)=>(a.data+(a.hora||'')).localeCompare(b.data+(b.hora||'')));
  const venc=evs.filter(e=>!e.feito&&diff(e.data)<0);const rest=evs.filter(e=>e.feito||diff(e.data)>=0);
  const groups={};rest.forEach(e=>(groups[e.data]=groups[e.data]||{e:[],t:[]}).e.push(e));
  tars.filter(t=>t.status==='done'||diff(t.prazo)>=0).forEach(t=>(groups[t.prazo]=groups[t.prazo]||{e:[],t:[]}).t.push(t));
  const tAtr=tars.filter(t=>t.status!=='done'&&diff(t.prazo)<0);
  const tItem=t=>`<div class="ev${t.status==='done'?' done':''}"><span class="pic" style="width:16px">☑</span><div class="body" data-act="editTar" data-id="${t.id}"><div class="t">${esc(t.titulo)}</div><div class="small muted">Tarefa · ${esc(TSTATUS.find(s=>s[0]===t.status)[1])} · ${esc(nomesResp(t))}</div></div><div class="small" style="text-align:right">${prazoTxt(t.prazo)}${t.status==='done'?'':`<br><a class="gcal" href="${esc(linkGcalTarefa(t))}" target="_blank" rel="noopener">+ Google Agenda</a>`}</div></div>`;
  return head+`<div class="hint">Os links <b>+ Google Agenda</b> funcionam sem configuração. O botão <b>↻ Google Agenda</b> sincroniza tudo de uma vez (exige conectar o Google; veja Configurações).</div>
  ${venc.length||tAtr.length?`<div class="card" style="border-color:var(--red);margin-bottom:14px"><h3 style="color:var(--red)">Vencidos e não cumpridos (${venc.length+tAtr.length})</h3>${venc.map(e=>evItem(e)).join('')}${tAtr.map(tItem).join('')}</div>`:''}
  <div class="card">${Object.keys(groups).length?Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,g])=>`<div class="dgroup">${fdw(d)}${d===today()?' — hoje':''}</div>${g.e.map(e=>evItem(e)).join('')}${g.t.map(tItem).join('')}`).join(''):'<div class="empty">Nenhum compromisso</div>'}</div>`;
};

/* ---------------- CONTENCIOSO E ADMINISTRATIVO ---------------- */
V.processos=()=>{
  const f=ui.f.proc||(ui.f.proc={q:'',area:'',status:'Em andamento',resp:''});const q=norm(f.q);const tipo=ui.tabProc;
  const base=db.processos.filter(p=>(!f.area||p.area===f.area)&&(!f.status||p.status===f.status)&&(!f.resp||p.responsavelId===f.resp)&&(!q||norm(p.numero+' '+p.objeto+' '+p.parteContraria+' '+nomeCli(p.clienteId)+' '+p.orgao+' '+(p.protocolo||'')).includes(q)));
  const list=base.filter(p=>p.tipo===tipo).sort((a,b)=>(proxEvento(a.id)?.data||'9999').localeCompare(proxEvento(b.id)?.data||'9999'));
  const nJ=base.filter(p=>p.tipo==='Judicial').length,nA=base.filter(p=>p.tipo==='Administrativo').length;
  const ativos=db.processos.filter(p=>p.tipo===tipo&&p.status==='Em andamento');
  const prox=d=>db.eventos.filter(e=>!e.feito&&diff(e.data)>=0&&diff(e.data)<=d&&proc(e.processoId)?.tipo===tipo);
  const kp=tipo==='Judicial'?kpi('Processos em andamento',ativos.length)+kpi('Audiências e perícias (30 dias)',prox(30).filter(e=>/audi|per[ií]cia/i.test(e.tipo)).length)+kpi('Prazos (7 dias)',prox(7).filter(e=>/prazo/i.test(e.tipo)).length)+kpi('Em fase de sentença/recurso',ativos.filter(p=>/Sentença|Recurso/.test(p.fase)).length)
    :kpi('Requerimentos em andamento',ativos.length)+kpi('Em análise',ativos.filter(p=>/análise/.test(p.fase)).length)+kpi('Em exigência',ativos.filter(p=>p.fase==='Em exigência').length,'','bad')+kpi('Análise com prazo vencido',ativos.filter(p=>p.prazoAnalise&&diff(p.prazoAnalise)<0&&/análise/.test(p.fase)).length);
  const filtros=`<input data-f="proc.q" value="${esc(f.q)}" placeholder="Número, cliente, parte, objeto…" style="min-width:220px">
    <select data-f="proc.area"><option value="">Todas as áreas</option>${AREAS.map(a=>`<option${f.area===a?' selected':''}>${a}</option>`).join('')}</select>
    <select data-f="proc.status"><option value="">Todas as situações</option>${STATUS_PROC.map(a=>`<option${f.status===a?' selected':''}>${a}</option>`).join('')}</select>
    <select data-f="proc.resp"><option value="">Todos os responsáveis</option>${db.usuarios.map(u=>`<option value="${u.id}"${f.resp===u.id?' selected':''}>${esc(u.nome)}</option>`).join('')}</select>`;
  let corpo;
  if(ui.procView==='quadro'){
    corpo=kanban(fasesDe(tipo).map(x=>[x,x]),list.map(p=>({...p,_col:p.fase})),'proc',p=>`<div class="t" data-go="processo/${p.id}" style="cursor:pointer">${esc(nomeCli(p.clienteId))}</div><div class="small muted">${esc(p.numero)}</div><div class="meta">${pill(p.area,'p-blue')} ${esc(p.objeto||'')}</div>${proxEvento(p.id)?`<div class="small" style="margin-top:4px">${prazoTxt(proxEvento(p.id).data)}</div>`:''}`);
  }else if(tipo==='Judicial'){
    corpo=`<div class="card tbl"><table><thead><tr><th>Processo</th><th>Cliente</th><th class="hide-m">Vara / comarca</th><th class="hide-m">Instância · polo</th><th>Fase</th><th class="hide-m">Responsável</th><th>Próximo prazo</th><th>Situação</th></tr></thead><tbody>
    ${list.map(p=>{const e=proxEvento(p.id);return `<tr data-go="processo/${p.id}"><td><div class="strong">${esc(p.numero)}</div><div class="small muted">${esc(p.area)} · ${esc(p.objeto)}</div></td><td>${esc(nomeCli(p.clienteId))}<div class="small muted">x ${esc(p.parteContraria||'—')}</div></td>
      <td class="hide-m small">${esc(p.orgao||'—')}${p.comarca&&!norm(p.orgao).includes(norm(p.comarca))?`<div class="muted">${esc(p.comarca)}</div>`:''}</td><td class="hide-m small">${esc(p.instancia||'—')}<div class="muted">${esc((p.polo||'').split(' (')[0])}</div></td><td class="small">${esc(p.fase)}</td>
      <td class="hide-m small">${esc(nomeUsr(p.responsavelId))}</td><td class="small">${e?`${fd(e.data)}<br>${prazoTxt(e.data)}`:'<span class="muted">—</span>'}</td><td>${pStatusProc(p.status)}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">Nenhum processo judicial</td></tr>'}</tbody></table></div>`;
  }else{
    corpo=`<div class="card tbl"><table><thead><tr><th>Requerimento</th><th>Cliente</th><th class="hide-m">Órgão</th><th>DER</th><th class="num">Dias em análise</th><th class="hide-m">Prazo de resposta</th><th>Fase</th><th class="hide-m">Responsável</th></tr></thead><tbody>
    ${list.map(p=>{const dias=p.der&&!/Deferido|Indeferido|Encerrado/.test(p.fase)?-diff(p.der):null;return `<tr data-go="processo/${p.id}"><td><div class="strong">${esc(p.protocolo||p.numero)}</div><div class="small muted">${esc(p.area)} · ${esc(p.objeto)}</div></td><td>${esc(nomeCli(p.clienteId))}</td><td class="hide-m small">${esc(p.orgaoAdm||p.orgao||'—')}</td><td>${fd(p.der)}</td>
      <td class="num ${dias>45?'c-bad':''}">${dias??'—'}</td><td class="hide-m small">${p.prazoAnalise?fd(p.prazoAnalise)+'<br>'+prazoTxt(p.prazoAnalise):'—'}</td><td>${pill(p.fase,smCor(p.fase))}</td><td class="hide-m small">${esc(nomeUsr(p.responsavelId))}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">Nenhum requerimento administrativo</td></tr>'}</tbody></table></div>`;
  }
  return `<div class="tabs"><button class="tab ${tipo==='Judicial'?'active':''}" data-act="tabProc" data-id="Judicial">⚖️ Contencioso (judicial) · ${nJ}</button><button class="tab ${tipo==='Administrativo'?'active':''}" data-act="tabProc" data-id="Administrativo">🏛️ Administrativo (INSS e órgãos) · ${nA}</button></div>
  <div class="grid g-kpi">${kp}</div>
  <div class="toolbar">${filtros}<div class="tabs" style="margin:0;border:none"><button class="tab ${ui.procView!=='quadro'?'active':''}" data-act="procView" data-id="lista">Lista</button><button class="tab ${ui.procView==='quadro'?'active':''}" data-act="procView" data-id="quadro">Quadro por fase</button></div>
    <span class="grow"></span><button class="btn btn-gold" data-act="novoProc">+ ${tipo==='Judicial'?'Processo':'Requerimento'}</button></div>
  ${ui.procView==='quadro'?'<div class="hint">Arraste o card para mudar a fase.</div>':''}${corpo}`;
};

V.processo=()=>{
  const p=proc(ui.id);if(!p)return '<div class="empty">Processo não encontrado. <a href="#processos">Voltar</a></div>';
  const c=cli(p.clienteId);const jud=p.tipo==='Judicial';
  const evs=db.eventos.filter(e=>e.processoId===p.id).sort((a,b)=>a.data.localeCompare(b.data));
  const ts=db.tarefas.filter(t=>t.processoId===p.id);
  const ls=db.lancamentos.filter(l=>l.processoId===p.id).sort((a,b)=>a.venc.localeCompare(b.venc));
  const and=(p.andamentos||[]).slice().sort((a,b)=>b.data.localeCompare(a.data));
  const fases=fasesDe(p.tipo);const fi=fases.indexOf(p.fase);
  const dados=jud?`<dt>Vara / juízo</dt><dd>${esc(p.orgao)||'—'}</dd><dt>Comarca</dt><dd>${esc(p.comarca)||'—'}</dd><dt>Instância</dt><dd>${esc(p.instancia)||'—'}</dd><dt>Polo do cliente</dt><dd>${esc(p.polo)||'—'}</dd><dt>Classe / rito</dt><dd>${esc(p.classe)||'—'}</dd>`
    :`<dt>Órgão</dt><dd>${esc(p.orgaoAdm||p.orgao)||'—'}</dd><dt>Protocolo</dt><dd>${esc(p.protocolo)||'—'}</dd><dt>DER</dt><dd>${fd(p.der)}${p.der?` (${-diff(p.der)} dias)`:''}</dd><dt>Prazo de resposta</dt><dd>${p.prazoAnalise?fd(p.prazoAnalise)+' · '+prazoTxt(p.prazoAnalise):'—'}</dd>`;
  return `<div class="toolbar"><a class="btn btn-ghost" href="#processos" style="text-decoration:none">← ${jud?'Contencioso':'Administrativo'}</a><span class="grow"></span><button class="btn btn-ghost" data-act="editProc" data-id="${p.id}">Editar</button></div>
  <div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div class="small muted">${jud?'⚖️ Contencioso':'🏛️ Administrativo'} · ${esc(p.area)}</div><div style="font-size:17px;font-weight:700">${esc(p.numero)}</div><div>${esc(p.objeto)}</div></div><div>${pStatusProc(p.status)}</div></div>
    <div class="fases">${fases.map((s,i)=>`<div class="fase ${s===p.fase?'atual':i<fi?'feita':''}" data-act="setFase" data-id="${p.id}|${esc(s)}" title="Mudar para esta fase"><i></i><span>${esc(s)}</span></div>`).join('')}</div></div>
  <div class="grid g-2">
    <div class="card"><h3>Dados</h3><dl class="dl"><dt>Cliente</dt><dd><a href="#cliente/${p.clienteId}">${esc(c?.nome||'—')}</a></dd><dt>Parte contrária</dt><dd>${esc(p.parteContraria)||'—'}</dd>${dados}<dt>Responsável</dt><dd>${esc(nomeUsr(p.responsavelId))}</dd><dt>Valor da causa</dt><dd>${p.valorCausa?brl(p.valorCausa):'—'}</dd><dt>Distribuição</dt><dd>${fd(p.distribuicao)}</dd></dl></div>
    <div class="card"><h3>Prazos e compromissos <button class="btn btn-gold btn-sm" data-act="novoEvProc" data-id="${p.id}">+ Compromisso</button></h3>${evs.length?evs.map(e=>evItem(e,false)).join(''):'<div class="empty">Nenhum prazo cadastrado</div>'}</div>
    <div class="card"><h3>Andamentos <button class="btn btn-gold btn-sm" data-act="novoAnd" data-id="${p.id}">+ Andamento</button></h3>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><input type="date" id="and-data" value="${today()}"><input id="and-txt" style="flex:1;min-width:160px" placeholder="Registro rápido de andamento…"><button class="btn btn-brand" data-act="addAnd" data-id="${p.id}">Adicionar</button></div>
      <div class="tl">${and.map(a=>`<div class="tli"><div class="d">${fd(a.data)}${a.autor?' · '+esc(nomeUsr(a.autor)):''} <button class="btn btn-sm lnk" data-act="editAnd" data-id="${p.id}|${a.id}">editar</button></div><div>${esc(a.texto)}</div></div>`).join('')||'<div class="empty">Nenhum andamento</div>'}</div></div>
    <div class="card"><h3>Tarefas <button class="btn btn-ghost btn-sm" data-act="novaTarProc" data-id="${p.id}">+ Tarefa</button></h3>${ts.length?ts.map(t=>`<div class="ev"><div class="body" data-act="editTar" data-id="${t.id}"><div class="t" style="${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.titulo)}</div><div class="small muted">${esc(TSTATUS.find(s=>s[0]===t.status)[1])} · ${esc(nomesResp(t))}</div></div><div class="small">${t.prazo?fd(t.prazo):''}</div></div>`).join(''):'<div class="empty">Nenhuma tarefa</div>'}
      ${podeFin()?`<h3 style="margin-top:18px">Financeiro do processo <button class="btn btn-ghost btn-sm" data-act="ctrProc" data-id="${p.id}">Novo contrato</button></h3>${lancTable(ls,false)}`:''}</div>
  </div>`;
};

/* ---------------- SALÁRIO-MATERNIDADE ---------------- */
V.sm=()=>{
  if(ui.id)return smCaso(ui.id);
  const t=ui.tabSm;const ativos=db.sm.filter(c=>!['Concluído','Indeferido'].includes(c.status));
  const gp=guiasPendentes(30);const venc=gp.filter(x=>x.st==='Vencida');
  const partos=db.sm.filter(c=>!c.dataParto&&c.dpp&&diff(c.dpp)>=-7&&diff(c.dpp)<=60);
  const ano=today().slice(0,4);
  let corpo='';
  if(t==='casos')corpo=kanban(SM_STATUS.map(s=>[s,s]),db.sm.map(c=>({...c,_col:c.status})),'sm',c=>{const pg=(c.guias||[]).filter(g=>g.pagaEm).length,car=+c.carenciaMeses||0;
    return `<div class="t" data-go="sm/${c.id}" style="cursor:pointer">${esc(nomeCli(c.clienteId))}</div><div class="small muted">${esc(c.categoria)}</div>
    <div class="meta">${c.dataParto?'👶 '+fd(c.dataParto):c.dpp?'DPP '+fd(c.dpp):''}</div>${car?`<div class="prog" title="Contribuições pagas para a carência"><i style="width:${Math.min(100,pg/car*100)}%;background:${pg>=car?'var(--green)':'var(--amber)'}"></i></div><div class="small muted">carência ${pg}/${car}</div>`:''}`;});
  if(t==='guias'){const f=ui.f.guias||(ui.f.guias={st:'pendentes'});
    const todas=[];db.sm.forEach(c=>(c.guias||[]).forEach(g=>todas.push({c,g,st:guiaStatus(g)})));
    const lista=todas.filter(x=>f.st==='todas'||(f.st==='pendentes'?x.st!=='Paga':x.st===f.st)).sort((a,b)=>a.g.venc.localeCompare(b.g.venc));
    corpo=`<div class="toolbar"><select data-f="guias.st">${[['pendentes','Não pagas'],['A emitir','A emitir'],['Emitida','Emitidas (aguardando pagamento)'],['Vencida','Vencidas'],['Paga','Pagas'],['todas','Todas']].map(([v,l])=>`<option value="${v}"${f.st===v?' selected':''}>${l}</option>`).join('')}</select></div>
    <div class="card tbl"><table><thead><tr><th>Segurada</th><th>Competência</th><th>Código</th><th class="num">Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>
    ${lista.map(({c,g,st})=>`<tr><td data-go="sm/${c.id}" style="cursor:pointer" class="strong">${esc(nomeCli(c.clienteId))}</td><td>${mLabel(g.competencia)}</td><td>${esc(g.codigo)}</td><td class="num">${brl(g.valor)}</td><td>${fd(g.venc)}<div class="small">${st!=='Paga'?prazoTxt(g.venc):''}</div></td><td>${pill(st,guiaCor(st))}</td>
      <td class="num">${guiaBotoes(c,g,st)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhuma guia</td></tr>'}</tbody></table></div>`;}
  if(t==='partos')corpo=`<div class="card">${db.sm.filter(c=>c.dpp||c.dataParto).sort((a,b)=>(a.dataParto||a.dpp).localeCompare(b.dataParto||b.dpp)).reverse().map(c=>`<div class="ev" data-go="sm/${c.id}"><div class="av" style="background:#FDE8EF;color:#C84B6E">👶</div><div class="body"><div class="t">${esc(nomeCli(c.clienteId))} ${c.crianca?'· '+esc(c.crianca):''}</div><div class="small muted">${c.dataParto?'Nasceu em '+fd(c.dataParto):'Previsto para '+fd(c.dpp)+' ('+prazoTxt(c.dpp)+')'}</div></div>${pill(c.status,smCor(c.status))}</div>`).join('')||'<div class="empty">Nenhum caso</div>'}</div>`;
  return `<div class="grid g-kpi">${kpi('Casos em andamento',ativos.length)}${kpi('Guias a emitir/pagar (30 dias)',gp.length,venc.length?venc.length+' vencida(s)!':'nenhuma vencida',venc.length?'bad':'good')}${kpi('Partos previstos (60 dias)',partos.length)}${(()=>{const ag=db.sm.filter(c=>c.status==='Aguardando o parto');const pass=ag.filter(c=>c.dpp&&diff(c.dpp)<0).length;return kpi('👶 Aguardando o parto',ag.length,pass?pass+' com DPP já passada':'guias pagas, esperando o nascimento',pass?'bad':'');})()}
    ${kpi('Em exigência',db.sm.filter(c=>c.status==='Em exigência').length,'',db.sm.some(c=>c.status==='Em exigência')?'bad':'')}${kpi('Deferidos em '+ano,db.sm.filter(c=>['Deferido','Concluído'].includes(c.status)&&(c.der||'').startsWith(ano)).length)}${podeFin()?kpi('Benefícios em andamento',brlK(sumBy(ativos,c=>c.beneficioEstimado)),'valor estimado'):''}</div>
  <div class="toolbar"><div class="tabs" style="margin:0;border:none">${[['casos','Quadro de casos'],['guias','Guias de recolhimento'],['partos','Partos e nascimentos']].map(([k,l])=>`<button class="tab ${t===k?'active':''}" data-act="tabSm" data-id="${k}">${l}</button>`).join('')}</div>
    <span class="grow"></span><a class="btn btn-ghost" href="#scripts" style="text-decoration:none">Scripts de salário-maternidade</a><button class="btn btn-gold" data-act="novoSm">+ Caso</button></div>
  ${t==='casos'?'<div class="hint">Controle completo: categoria da segurada, estratégia, carência, guias (GPS/DAS), DPP, protocolo e exigências. Arraste os cards para mudar a etapa.</div>':''}${corpo}`;
};
function guiaBotoes(c,g,st){
  return `${st==='A emitir'||st==='Vencida'&&!g.emitidaEm?`<button class="btn btn-ghost btn-sm" data-act="guiaEmitida" data-id="${c.id}|${g.id}">Emitida</button>`:''}${st!=='Paga'?`<button class="btn btn-ghost btn-sm" data-act="guiaPaga" data-id="${c.id}|${g.id}">Paga</button>`:''}${g.link?`<a class="btn btn-ghost btn-sm" href="${esc(g.link)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir</a>`:''}<button class="btn btn-sm lnk" data-act="editGuia" data-id="${c.id}|${g.id}">editar</button>`;
}
function smCaso(id){
  const c=db.sm.find(x=>x.id===id);if(!c)return '<div class="empty">Caso não encontrado. <a href="#sm">Voltar</a></div>';
  const cl=cli(c.clienteId)||{};const pagas=c.guias.filter(g=>g.pagaEm).length,car=+c.carenciaMeses||0;
  const docs=db.documentos.filter(d=>d.clienteId===c.clienteId);const proc0=db.processos.find(p=>p.clienteId===c.clienteId&&/maternidade/i.test(p.objeto));
  const qual=c.qualidadeAte?diff(c.qualidadeAte):null;
  const scrG=db.scripts.find(s=>/guia/i.test(s.titulo));
  return `<div class="toolbar"><a class="btn btn-ghost" href="#sm" style="text-decoration:none">← Salário-maternidade</a><span class="grow"></span>
    ${cl.tel?`<a class="btn btn-ghost" style="color:#1F9D55;border-color:#1F9D55;text-decoration:none" target="_blank" rel="noopener" href="${waLink(cl.tel,scrG?personalizar(scrG.texto,cl):'')}">WhatsApp (guia)</a>`:''}
    <button class="btn btn-ghost" data-act="smContrato" data-id="${c.id}">Gerar contrato</button><button class="btn btn-ghost" data-act="editSm" data-id="${c.id}">Editar caso</button></div>
  <div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div class="small muted">Salário-maternidade · ${esc(c.categoria)}</div><div style="font-size:18px;font-weight:800"><a href="#cliente/${c.clienteId}">${esc(cl.nome||'—')}</a></div><div class="small">${esc(c.estrategia||'')}</div></div><div>${pill(c.status,smCor(c.status))}</div></div>
    <div class="fases">${SM_STATUS.map((s,i)=>`<div class="fase ${s===c.status?'atual':i<SM_STATUS.indexOf(c.status)?'feita':''}" data-act="setSmStatus" data-id="${c.id}|${esc(s)}"><i></i><span>${esc(s)}</span></div>`).join('')}</div></div>
  <div class="grid g-kpi">${kpi('Parto / DPP',c.dataParto?fd(c.dataParto):fd(c.dpp),c.dataParto?'nascimento'+(c.crianca?' — '+esc(c.crianca):''):c.dpp?prazoTxt(c.dpp):'')}
    ${kpi('Carência',car?pagas+' / '+car:'—',car?(pagas>=car?'cumprida ✓':'faltam '+(car-pagas)+' contribuição(ões)'):'sem carência informada',car&&pagas>=car?'good':car?'bad':'')}
    ${kpi('Qualidade de segurada',c.qualidadeAte?fd(c.qualidadeAte):'—',qual==null?'':qual<0?'expirada':'mantida por mais '+qual+' dias',qual!=null&&qual<30?'bad':'good')}
    ${kpi('Requerimento',c.nb||'—',c.der?'DER '+fd(c.der):'ainda não protocolado')}${podeFin()?kpi('Benefício estimado',brl(c.beneficioEstimado)):''}</div>
  <div class="grid g-2">
    <div class="card"><h3>Guias de recolhimento <span class="flx"><button class="btn btn-ghost btn-sm" data-act="gerarGuias" data-id="${c.id}">Gerar em lote</button><button class="btn btn-gold btn-sm" data-act="novaGuia" data-id="${c.id}">+ Guia</button></span></h3>
      ${c.guias.length?`<div class="tbl"><table><thead><tr><th>Competência</th><th>Código</th><th class="num">Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>${c.guias.map(g=>{const st=guiaStatus(g);return `<tr><td class="strong">${mLabel(g.competencia)}</td><td>${esc(g.codigo)}</td><td class="num">${brl(g.valor)}</td><td>${fd(g.venc)}</td><td>${pill(st,guiaCor(st))}</td><td class="num">${guiaBotoes(c,g,st)}</td></tr>`;}).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:8px">Total: ${brl(sumBy(c.guias,g=>g.valor))} · pagas ${pagas} · em aberto ${c.guias.length-pagas}</div>`:'<div class="empty">Nenhuma guia. Use "Gerar em lote" para criar as competências da carência.</div>'}</div>
    <div class="card"><h3>Documentos <span class="flx"><button class="btn btn-ghost btn-sm" data-act="docsPadraoSm" data-id="${c.clienteId}">+ Padrão SM</button><button class="btn btn-gold btn-sm" data-act="novoDocCli" data-id="${c.clienteId}">+ Documento</button></span></h3>${docList(docs)}
      ${proc0?`<h3 style="margin-top:16px">Processo / requerimento</h3><div class="ev" data-go="processo/${proc0.id}"><div class="body"><div class="t">${esc(proc0.numero)}</div><div class="small muted">${esc(proc0.fase)}</div></div>${pStatusProc(proc0.status)}</div>`:`<button class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="novoProcSm" data-id="${c.id}">+ Registrar requerimento no INSS</button>`}
      ${c.obs?`<div class="hint" style="margin:14px 0 0">${esc(c.obs)}</div>`:''}</div>
  </div>`;
}

/* ---------------- DOCUMENTOS E MODELOS ---------------- */
const CAMPOS_MODELO=['cliente','qualificacao','tipodoc','doc','cidade','email','tel','escritorio','escritorio_qualificacao','advogados','cidade_esc','objeto','area','processo','parte_contraria','valor','valor_extenso','entrada','parcelas','valor_parcela','dia_venc','forma','exito','condicoes','validade','titular','crianca','dpp','data'];
function docList(docs){
  if(!docs.length)return '<div class="empty">Nenhum documento no checklist</div>';
  return docs.map(d=>`<div class="ev"><input type="checkbox" data-act="toggleDoc" data-id="${d.id}"${d.recebido?' checked':''} aria-label="Recebido"><div class="body" data-act="editDoc" data-id="${d.id}"><div class="t">${esc(d.nome)}</div><div class="small muted">${d.recebido?'Recebido'+(d.data?' em '+fd(d.data):''):'Pendente'}${d.arquivo?' · 📎 '+esc(d.arquivo):''}${d.obs?' · '+esc(d.obs):''}</div></div>
    <div class="flx">${d.link?`<a class="btn btn-ghost btn-sm" href="${esc(d.link)}" target="_blank" rel="noopener" style="text-decoration:none">📎 Abrir</a>`:''}<button class="btn btn-ghost btn-sm" data-act="anexarDoc" data-id="${d.id}">${d.link?'Substituir':'Anexar'}</button>${d.recebido?pill('Recebido','p-green'):pill('Pendente','p-amber')}</div></div>`).join('');
}
function contextoModelo(cid,pid,kid,valorX,validade){
  const c=cli(cid)||{},p=proc(pid),e=db.escritorio;
  const k=ctr(kid)||db.contratos.filter(x=>x.clienteId===cid&&(!pid||x.processoId===pid)).sort((a,b)=>b.data.localeCompare(a.data))[0];
  const caso=db.sm.find(x=>x.clienteId===cid);
  const valor=valorX||(k?+k.valorTotal:0);
  const advs=db.usuarios.filter(u=>u.oab&&!/parceir|estagi/i.test(u.papel)).map(u=>u.nome+' ('+u.oab+')').join(', ')||'[advogados]';
  const cond=k?[k.entrada?`sendo ${brl(k.entrada)} de entrada`:'',k.parcelas?`${k.entrada?'e o saldo em ':'em '}${num(k.parcelas,0)} parcelas mensais de ${brl(valorParcela(k))}, com vencimento todo dia ${k.diaVenc||10}`:'',k.forma?`por ${k.forma}`:''].filter(Boolean).join(' ')||'à vista':'conforme condições combinadas entre as partes';
  const pf=c.tipo!=='PJ';
  const qual=c.nome?`${c.nome}, ${pf?'inscrito(a) no CPF':'inscrita no CNPJ'} sob o nº ${c.doc||'[documento]'}${pf&&c.profissao?', '+c.profissao.toLowerCase():''}, ${pf?'residente e domiciliado(a)':'com sede'} em ${cidadeUF(c)||'[endereço]'}, e-mail ${c.email||'[e-mail]'}, telefone ${c.tel||'[telefone]'}`:'[qualificação do cliente]';
  return {cliente:c.nome||'[cliente]',qualificacao:qual,tipodoc:pf?'CPF':'CNPJ',doc:c.doc||'[documento]',cidade:cidadeUF(c)||'[endereço]',email:c.email||'[e-mail]',tel:c.tel||'[telefone]',
    escritorio:e.nome,escritorio_qualificacao:`${e.nome}${e.cnpj?', inscrita no CNPJ sob o nº '+e.cnpj:''}${e.oab?', registro na OAB '+e.oab:''}, com endereço em ${e.endereco||'[endereço do escritório]'}`,
    advogados:advs,cidade_esc:(e.cidade||'[cidade]').split('/')[0],
    objeto:p?`${p.objeto} (${p.area}${p.numero?' — '+p.numero:''})`:(k?.produto||c.produto||'[descrever o objeto]'),area:p?.area||k?.produto||c.produto||'[área]',processo:p?.numero||'[nº do processo]',parte_contraria:p?.parteContraria||'[parte contrária]',
    valor:valor?brl(valor):'R$ [valor]',valor_extenso:valor?extenso(valor):'[valor por extenso]',entrada:k?brl(k.entrada):'R$ [entrada]',parcelas:k?num(k.parcelas,0):'[nº]',valor_parcela:k?brl(valorParcela(k)):'R$ [parcela]',
    dia_venc:k?.diaVenc||10,forma:k?.forma||'PIX',exito:k&&k.exitoPct?num(k.exitoPct)+'%':'___%',condicoes:cond,validade:fd(validade||addDays(7)),titular:k?.titular||c.nome||'[titular]',
    crianca:caso?.crianca||'[nome da criança]',dpp:fd(caso?.dataParto||caso?.dpp)||'[data]',data:new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})};
}
const preencher=(texto,ctx)=>String(texto||'').replace(/\{\{(\w+)\}\}/g,(m,x)=>ctx[x]!=null?ctx[x]:m);
function corpoDocHTML(texto){
  const blocos=String(texto).split(/\n{2,}/);
  return blocos.map((b,i)=>{const linhas=b.split('\n');
    if(i===0)return `<h1 class="doc-tit">${linhas.map(esc).join('<br>')}</h1>`;
    if(/^_{5,}/.test(b.trim())||/^_{5,}/m.test(b))return `<p class="doc-ass">${linhas.map(esc).join('<br>')}</p>`;
    return `<p>${linhas.map(l=>{let h=esc(l);h=h.replace(/^(CLÁUSULA [^.—]+[—-][^.]+\.)/,'<b>$1</b>').replace(/^(CLÁUSULA [^.]+\.)/,'<b>$1</b>').replace(/^((?:CONTRATANTE|CONTRATADO|OUTORGANTE|OUTORGADOS|PODERES|NOTIFICANTE)\b:?)/,'<b>$1</b>').replace(/^(\d+\. [A-ZÇÃÕÁÉÍÓÚ ]+)$/,'<b>$1</b>');return h;}).join('<br>')}</p>`;}).join('');
}
V.documentos=()=>{
  const t=ui.tabDoc;
  const tabs=`<div class="tabs">${[['gerador','📝 Gerador de documentos'],['checklist','✅ Checklist de documentos'],['modelos','🗂️ Modelos (editar)']].map(([k,l])=>`<button class="tab ${t===k?'active':''}" data-act="tabDoc" data-id="${k}">${l}</button>`).join('')}</div>`;
  if(t==='checklist'){
    const f=ui.f.dcl||(ui.f.dcl={cli:''});const pend=db.documentos.filter(d=>!d.recebido);
    const byCli={};db.documentos.filter(d=>!f.cli||d.clienteId===f.cli).forEach(d=>(byCli[d.clienteId]=byCli[d.clienteId]||[]).push(d));
    return tabs+`<div class="toolbar"><select data-f="dcl.cli"><option value="">Todos os clientes</option>${O.clientes().map(([id,n])=>`<option value="${id}"${f.cli===id?' selected':''}>${esc(n)}</option>`).join('')}</select><span class="small muted">${pend.length} pendente(s)</span><span class="grow"></span><button class="btn btn-gold" data-act="novoDoc">+ Documento</button></div>
    <div class="hint">Use <b>Anexar</b> para enviar o arquivo direto para a pasta do cliente no <b>Google Drive</b> (na versão hospedada, com o Google conectado), ou cole o link do arquivo ao editar o documento.</div>
    <div class="card">${Object.entries(byCli).map(([cid,ds])=>`<div class="dgroup"><a href="#cliente/${cid}">${esc(nomeCli(cid))}</a> · ${ds.filter(d=>d.recebido).length}/${ds.length}${cli(cid)?.driveLink?` · <a href="${esc(cli(cid).driveLink)}" target="_blank" rel="noopener">📁 Drive</a>`:''}</div>${docList(ds)}`).join('')||'<div class="empty">Nenhum documento</div>'}</div>`;
  }
  if(t==='modelos'){
    const grupos={};db.modelos.forEach(m=>(grupos[m.categoria]=grupos[m.categoria]||[]).push(m));
    return tabs+`<div class="toolbar"><span class="hint" style="margin:0">Todos os modelos são editáveis. Use os campos automáticos entre chaves duplas, ex.: {{cliente}}, {{valor}}, {{valor_extenso}}.</span><span class="grow"></span><button class="btn btn-ghost" data-act="restaurarModelos">Restaurar modelos padrão</button><button class="btn btn-gold" data-act="novoModelo">+ Modelo</button></div>
    ${Object.entries(grupos).map(([g,ms])=>`<div class="card" style="margin-bottom:14px"><h3>${esc(g)} <small>${ms.length}</small></h3>${ms.map(m=>`<div class="ev"><div class="body" data-act="editModelo" data-id="${m.id}"><div class="t">${esc(m.nome)}</div><div class="small muted">${esc(m.area||'Geral')} · ${esc(String(m.texto).slice(0,110))}…</div></div><div class="flx"><button class="btn btn-ghost btn-sm" data-act="usarModelo" data-id="${m.id}">Usar</button><button class="btn btn-ghost btn-sm" data-act="duplicarModelo" data-id="${m.id}">Duplicar</button></div></div>`).join('')}</div>`).join('')||'<div class="empty">Nenhum modelo</div>'}`;
  }
  const f=ui.f.doc||(ui.f.doc={});
  if(!f.modelo||!db.modelos.some(m=>m.id===f.modelo))f.modelo=db.modelos[0]?.id||'';
  const m=db.modelos.find(x=>x.id===f.modelo);
  const procsCli=db.processos.filter(p=>!f.mcli||p.clienteId===f.mcli),ctrsCli=db.contratos.filter(k=>!f.mcli||k.clienteId===f.mcli);
  const ctx=contextoModelo(f.mcli,f.mproc,f.mctr,parseFloat(f.valor)||0,f.validade);
  const grupos={};db.modelos.forEach(x=>(grupos[x.categoria]=grupos[x.categoria]||[]).push(x));
  const gOk=!gIndisponivel();
  return tabs+`<div class="grid" style="grid-template-columns:minmax(0,330px) minmax(0,1fr)" id="doc-grid">
    <div class="card"><h3>Dados do documento</h3><div class="fgrid" style="grid-template-columns:1fr">
      <label>Modelo<select data-f="doc.modelo">${Object.entries(grupos).map(([g,ms])=>`<optgroup label="${esc(g)}">${ms.map(x=>`<option value="${x.id}"${x.id===f.modelo?' selected':''}>${esc(x.nome)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Cliente<select data-f="doc.mcli"><option value="">—</option>${O.clientes().map(([id,n])=>`<option value="${id}"${f.mcli===id?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Processo<select data-f="doc.mproc"><option value="">—</option>${procsCli.map(p=>`<option value="${p.id}"${f.mproc===p.id?' selected':''}>${esc(p.numero)} — ${esc(p.objeto)}</option>`).join('')}</select></label>
      <label>Contrato (valores)<select data-f="doc.mctr"><option value="">${ctrsCli.length?'Mais recente do cliente':'—'}</option>${ctrsCli.map(k=>`<option value="${k.id}"${f.mctr===k.id?' selected':''}>${fd(k.data)} — ${brl(k.valorTotal)} ${esc(k.produto||'')}</option>`).join('')}</select></label>
      <label>Valor (R$) — vazio usa o do contrato<input type="number" data-f="doc.valor" value="${esc(f.valor||'')}" step="0.01" min="0"></label>
      ${m&&/Proposta/.test(m.categoria)?`<label>Validade da proposta<input type="date" data-f="doc.validade" value="${esc(f.validade||addDays(7))}"></label>`:''}
    </div>
    <div class="small muted" style="margin-top:10px">Os documentos saem no papel timbrado do escritório (logotipo + marca d'água), que pode ser trocado em Configurações → Papel timbrado. Edite o texto direto na folha ao lado antes de exportar.</div>
    <div class="exp-btns">
      <button class="btn btn-brand" data-act="docWord">⬇ Baixar Word (.docx)</button>
      <button class="btn btn-ghost" data-act="docPrint">🖨 Imprimir / salvar PDF</button>
      <button class="btn btn-ghost" data-act="docGoogle" title="${gOk?'Cria um Google Docs editável':esc(gIndisponivel())}">📄 Abrir no Google Docs</button>
      <button class="btn btn-ghost" data-act="docCopiar">Copiar texto</button>
    </div></div>
    <div class="folha-wrap"><div class="folha" id="doc-preview" contenteditable="true" spellcheck="true" style="${estiloFolha()}">${m?documentoHTML(corpoDocHTML(preencher(m.texto,ctx))):'<div class="empty">Cadastre um modelo</div>'}</div></div>
  </div>`;
};

/* ---------------- SCRIPTS DE ATENDIMENTO ---------------- */
function personalizar(txt,pessoa){
  return String(txt||'').replace(/\[Nome\]/g,(pessoa?.nome||'').split(' ')[0]||'[Nome]').replace(/\[(Usuário|Usuario|Advogada|Advogado)\]/g,sessao?.nome||nomeUsr(db.usuarioAtual))
    .replace(/\[Escritório\]/g,db.escritorio.nome||'').replace(/\[Produto\]/g,pessoa?.produto||'');
}
V.scripts=()=>{
  const f=ui.f.scr||(ui.f.scr={cat:'',q:'',pessoa:''});const q=norm(f.q);
  const pessoas=db.clientes.map(c=>['c:'+c.id,c.nome+' (cliente)',c]).concat(db.leads.filter(l=>!l.convertido).map(l=>['l:'+l.id,l.nome+' (atendimento)',l]));
  const pes=pessoas.find(p=>p[0]===f.pessoa)?.[2];
  const lista=db.scripts.filter(s=>(!f.cat||s.categoria===f.cat)&&(!q||norm(s.titulo+' '+s.texto+' '+s.produto).includes(q)));
  const cats=[...new Set(SCRIPT_CATS.concat(db.scripts.map(s=>s.categoria)))];
  return `<div class="chips">${['',...cats].map(c=>`<button class="chipf ${f.cat===c?'on':''}" data-act="scrCat" data-id="${esc(c)}">${c?esc(c):'Todos'} <span>${c?db.scripts.filter(s=>s.categoria===c).length:db.scripts.length}</span></button>`).join('')}</div>
  <div class="toolbar"><input data-f="scr.q" value="${esc(f.q)}" placeholder="Buscar script…" style="min-width:200px">
    <select data-f="scr.pessoa"><option value="">Personalizar para… (troca [Nome])</option>${pessoas.map(([v,l])=>`<option value="${v}"${f.pessoa===v?' selected':''}>${esc(l)}</option>`).join('')}</select>
    <span class="grow"></span><button class="btn btn-gold" data-act="novoScript">+ Script</button></div>
  <div class="grid g-3">${lista.map(s=>{const txt=personalizar(s.texto,pes);return `<div class="card script"><div class="flx" style="justify-content:space-between"><span class="pill p-blue">${esc(s.categoria)}</span>${s.produto?`<span class="small muted">${esc(s.produto)}</span>`:''}</div>
    <h3 style="margin:8px 0">${esc(s.titulo)}</h3><div class="script-txt">${esc(txt)}</div>
    <div class="flx" style="margin-top:10px"><button class="btn btn-brand btn-sm" data-act="copiarScript" data-id="${s.id}">Copiar</button>${pes&&pes.tel?`<a class="btn btn-ghost btn-sm" style="text-decoration:none;color:#1F9D55;border-color:#1F9D55" target="_blank" rel="noopener" href="${waLink(pes.tel,txt)}">Enviar no WhatsApp</a>`:''}<button class="btn btn-ghost btn-sm" data-act="editScript" data-id="${s.id}">Editar</button></div></div>`;}).join('')||'<div class="empty">Nenhum script</div>'}</div>`;
};

/* ---------------- PARCERIAS ---------------- */
function resumoParceria(email){
  const ks=db.contratos.filter(k=>norm(k.parceiro)===norm(email));
  const linhas=ks.map(k=>{const pct=(+k.parceriaPct||0)/100;const rec=recebidoContrato(k);const aRec=sumBy(db.lancamentos.filter(l=>l.contratoId===k.id&&l.tipo==='receita'&&!l.pago),l=>l.valor);return {k,pct,rec,aRec,parte:rec*pct,parteFutura:aRec*pct};});
  const repasses=db.lancamentos.filter(l=>l.categoria==='Repasse a parceiro'&&norm(l.parceiro)===norm(email));
  const pago=sumBy(repasses.filter(l=>l.pago),l=>l.valor);
  return {ks,linhas,parte:sumBy(linhas,l=>l.parte),futura:sumBy(linhas,l=>l.parteFutura),pago,repasses,saldo:sumBy(linhas,l=>l.parte)-pago};
}
V.parcerias=()=>{
  const lista=ehParceiro()?[{nome:sessao.nome,email:sessao.email}]:parceiros();
  if(!ehParceiro()&&!podeFin())return semPermissao();
  const f=ui.f.parc||(ui.f.parc={email:''});
  const sel=ehParceiro()?sessao.email:(f.email||lista[0]?.email||'');
  const r=sel?resumoParceria(sel):null;const pn=lista.find(p=>norm(p.email)===norm(sel));
  const cls=db.clientes.filter(c=>norm(c.parceiro)===norm(sel));
  return `${ehParceiro()?`<div class="hint">Olá, ${esc(sessao.nome)}! Aqui você acompanha apenas os casos da nossa parceria: clientes, processos, prazos e a sua parte nos honorários.</div>`:`<div class="toolbar"><select data-f="parc.email">${lista.map(p=>`<option value="${esc(norm(p.email))}"${norm(p.email)===norm(sel)?' selected':''}>${esc(p.nome)}</option>`).join('')}</select>
    <span class="grow"></span><button class="btn btn-ghost" data-act="novoParceiro">+ Parceiro</button>${sel?`<button class="btn btn-gold" data-act="repasse" data-id="${esc(sel)}">Registrar repasse</button>`:''}</div>`}
  ${!r?'<div class="empty">Nenhum parceiro cadastrado. Cadastre em Configurações → Equipe com a função "Parceiro" e crie o acesso dele.</div>':`
  <div class="grid g-kpi">${kpi('Clientes da parceria',cls.length)}${kpi('Processos em andamento',db.processos.filter(p=>cls.some(c=>c.id===p.clienteId)&&p.status==='Em andamento').length)}${kpi('Contratos',r.ks.length)}
    ${kpi('Parte do parceiro (recebida)',brl(r.parte),'sobre honorários já recebidos')}${kpi('Já repassado',brl(r.pago))}${kpi('Saldo a repassar',brl(r.saldo),'+ '+brl(r.futura)+' a receber',r.saldo>0?'bad':'good')}</div>
  <div class="card" style="margin-bottom:14px"><h3>Contratos da parceria${pn?' — '+esc(pn.nome):''}</h3>${r.linhas.length?`<div class="tbl"><table><thead><tr><th>Cliente</th><th>Data</th><th class="num">Contrato</th><th class="num">% parceiro</th><th class="num">Recebido</th><th class="num">Parte recebida</th><th class="num">Parte a receber</th></tr></thead><tbody>
    ${r.linhas.map(l=>`<tr><td class="strong">${esc(nomeCli(l.k.clienteId))}</td><td>${fd(l.k.data)}</td><td class="num">${brl(l.k.valorTotal)}</td><td class="num">${num(l.pct*100)}%</td><td class="num">${brl(l.rec)}</td><td class="num strong">${brl(l.parte)}</td><td class="num">${brl(l.parteFutura)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum contrato com % de parceria. Informe o "% do parceiro" no contrato.</div>'}</div>
  <div class="card" style="margin-bottom:14px"><h3>☑ Tarefas ${ehParceiro()?'da parceria':'com '+esc(pn?.nome||'o parceiro')}<button class="btn btn-gold btn-sm" data-act="tarParceiro" data-id="${esc(sel)}">+ Tarefa${ehParceiro()?'':' para o parceiro'}</button></h3>${tarefasParceiro(sel).map(linhaTarefa).join('')||'<div class="empty">Nenhuma tarefa. Marque o parceiro como responsável numa tarefa para ela aparecer aqui e no painel dele.</div>'}</div>
  <div class="grid g-2"><div class="card"><h3>Clientes da parceria</h3>${cls.map(c=>`<div class="ev" data-go="cliente/${c.id}"><div class="body"><div class="t">${esc(c.nome)}</div><div class="small muted">${esc(c.produto||'')} · ${esc(c.status)}</div></div></div>`).join('')||'<div class="empty">Nenhum cliente</div>'}</div>
  <div class="card"><h3>Repasses</h3>${r.repasses.length?r.repasses.map(l=>`<div class="ev"><div class="body"${ehParceiro()?'':` data-act="editLanc" data-id="${l.id}"`}><div class="t">${brl(l.valor)}</div><div class="small muted">${esc(l.descricao)} · ${l.pago?'pago em '+fd(l.pagoEm):'previsto para '+fd(l.venc)}</div></div>${pStatusLanc(lancStatus(l))}</div>`).join(''):'<div class="empty">Nenhum repasse registrado</div>'}</div></div>`}`;
};

/* ---------------- PREVISÃO DE RECEBIMENTOS (visual) ---------------- */
V.previsao=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.prev||(ui.f.prev={mes:today().slice(0,7),n:12});
  const meses=Array.from({length:+f.n},(_,i)=>ymAdd(f.mes,i));const ini=meses[0]+'-01',fim=fimMes(meses[meses.length-1]);
  const recs=db.lancamentos.filter(l=>l.tipo==='receita'&&l.venc>=ini&&l.venc<=fim);
  const por=meses.map(m=>{const ls=recs.filter(l=>l.venc.startsWith(m));return {m,rec:sumBy(ls.filter(l=>l.pago),l=>l.valor),aber:sumBy(ls.filter(l=>!l.pago&&diff(l.venc)>=0),l=>l.valor),atr:sumBy(ls.filter(l=>!l.pago&&diff(l.venc)<0),l=>l.valor),n:ls.length};});
  const tot=sumBy(por,x=>x.rec+x.aber+x.atr);
  const prox=db.lancamentos.filter(l=>l.tipo==='receita'&&!l.pago&&diff(l.venc)>=-60&&diff(l.venc)<=30).sort((a,b)=>a.venc.localeCompare(b.venc));
  // tabela detalhada (dias 10/20/30)
  const grupos=[['Vencimento até o dia 10',d=>d<=10],['Vencimento do dia 11 ao 20',d=>d>10&&d<=20],['Vencimento do dia 21 ao 31',d=>d>20]];
  const corpo=grupos.map(([titulo,fn])=>{const gl=recs.filter(l=>fn(+l.venc.slice(8)));if(!gl.length)return '';
    const linhas={};gl.forEach(l=>{const k=(l.clienteId||'—')+'|'+(l.forma||'');(linhas[k]=linhas[k]||[]).push(l);});
    return `<tr class="sec"><td colspan="${meses.length+2}">${titulo}</td></tr>`+Object.entries(linhas).sort((a,b)=>nomeCli(a[0].split('|')[0]).localeCompare(nomeCli(b[0].split('|')[0]))).map(([k,ls])=>{const[cid,forma]=k.split('|');
      return `<tr><td class="strong">${cid==='—'?esc(ls[0].descricao):`<a href="#cliente/${cid}">${esc(nomeCli(cid))}</a>`}</td><td class="small">${esc(forma)}</td>${meses.map(m=>{const ml=ls.filter(l=>l.venc.startsWith(m));if(!ml.length)return '<td class="num muted">—</td>';
        const st=ml.some(l=>lancStatus(l)==='Atrasado')?'c-bad':ml.every(l=>l.pago)?'c-ok':'';return `<td class="num ${st}">${brl(sumBy(ml,l=>l.valor))}</td>`;}).join('')}</tr>`;}).join('');}).join('');
  return `<div class="toolbar">${mesSel('prev',f.mes)}<select data-f="prev.n">${[6,12,24].map(n=>`<option value="${n}"${+f.n===n?' selected':''}>${n} meses</option>`).join('')}</select>
    <span class="grow"></span><button class="btn btn-ghost" data-act="xlsPrev">Exportar Excel</button><button class="btn btn-gold" data-act="novoCtr">Novo contrato</button></div>
  <div class="grid g-kpi">${kpi('Previsto no período',brl(tot))}${kpi('Já recebido',brl(sumBy(por,x=>x.rec)),tot?num(sumBy(por,x=>x.rec)/tot*100,0)+'% do previsto':'','good')}${kpi('A receber',brl(sumBy(por,x=>x.aber)))}${kpi('Em atraso (no período)',brl(sumBy(por,x=>x.atr)),brl(sumBy(db.lancamentos.filter(l=>l.tipo==='receita'&&lancStatus(l)==='Atrasado'),l=>l.valor))+' em atraso no total','bad')}</div>
  <div class="card" style="margin-bottom:14px"><h3>Recebimentos mês a mês</h3>${barras([{nome:'Recebido',cor:'#2E7D4E',vals:por.map(x=>x.rec)},{nome:'A receber',cor:'#2E6DA4',vals:por.map(x=>x.aber)},{nome:'Em atraso',cor:'#C0392B',vals:por.map(x=>x.atr)}],por.map(x=>mLabel(x.m)),brl,true,180)}</div>
  <div class="mes-cards">${por.map(x=>{const t=x.rec+x.aber+x.atr;return `<div class="mes-card ${x.m===today().slice(0,7)?'atual':''}"><div class="small muted">${MESES_L[+x.m.slice(5)-1]} ${x.m.slice(0,4)}</div><div class="v">${brlK(t)}</div>
    <div class="prog"><i style="width:${t?x.rec/t*100:0}%;background:var(--green)"></i></div><div class="small">${t?num(x.rec/t*100,0):0}% recebido${x.atr?` · <span class="c-bad">${brlK(x.atr)} atrasado</span>`:''}</div><div class="small muted">${x.n} parcela(s)</div></div>`;}).join('')}</div>
  <div class="grid g-2" style="margin-top:14px">
    <div class="card"><h3>Próximos 30 dias e atrasados</h3>${prox.length?prox.slice(0,15).map(l=>{const c=cli(l.clienteId);return `<div class="ev"><div class="body" data-act="editLanc" data-id="${l.id}"><div class="t">${esc(nomeCli(l.clienteId))}</div><div class="small muted">${esc(l.descricao)} · ${fd(l.venc)} · ${prazoTxt(l.venc)}</div></div><div class="num"><b>${brl(l.valor)}</b>${c?.tel?`<br><a class="small" target="_blank" rel="noopener" href="${waLink(c.tel,personalizar((db.scripts.find(s=>s.categoria==='Cobrança')||{}).texto||'',c))}">cobrar</a>`:''}</div></div>`;}).join(''):'<div class="empty">Nada a receber nos próximos 30 dias</div>'}</div>
    <div class="card"><h3>Por dia de vencimento</h3>${hbars(grupos.map(([t,fn])=>[t.replace('Vencimento ',''),sumBy(recs.filter(l=>!l.pago&&fn(+l.venc.slice(8))),l=>l.valor)]),brlK)}<div class="small muted">Valores ainda não recebidos no período.</div></div>
  </div>
  <details class="card" style="margin-top:14px"><summary class="strong">Tabela detalhada (igual às abas "Previsão dia 10/20/30")</summary>
  <div class="tbl" style="margin-top:10px"><table class="wide sticky1"><thead><tr><th>Cliente</th><th>Título</th>${meses.map(m=>`<th class="num">${mLabel(m)}</th>`).join('')}</tr></thead><tbody>${corpo||`<tr><td colspan="${meses.length+2}" class="empty">Nenhuma receita prevista</td></tr>`}
  <tr class="tot"><td>Total</td><td></td>${por.map(x=>`<td class="num">${brl(x.rec+x.aber+x.atr)}</td>`).join('')}</tr></tbody></table></div></details>`;
};

/* ---------------- INDICADORES MENSAIS (visual + editável) ---------------- */
const chaveInd=(ano,produto,rot)=>ano+'|'+(produto||'*')+'|'+rot;
function tabelaIndicadores(ano,produto){
  const hoje=today(),meses=Array.from({length:12},(_,i)=>{const ym=ano+'-'+String(i+1).padStart(2,'0');return {ym,ini:ym+'-01',fim:fimMes(ym),futuro:ym>hoje.slice(0,7)};});
  const passados=meses.filter(m=>!m.futuro);const anoCtx={ini:ano+'-01-01',fim:(passados.length?passados[passados.length-1].fim:ano+'-12-31')};
  const defs=indicadores(produto).concat(db.indExtras.length?[['Indicadores manuais']].concat(db.indExtras.map(x=>[x.nome,()=>null,x.fmt||'int',x.agg||'f',true])):[]);
  return defs.map(r=>{
    if(r.length===1)return {sec:r[0]};
    const [rot,fn,fmt,agg,manual]=r;const aj=db.indAjustes[chaveInd(ano,produto,rot)]||{};
    const auto=meses.map(m=>m.futuro||manual?null:fn(m));
    const vals=auto.map((v,i)=>aj[i+1]!==undefined&&aj[i+1]!==''?aj[i+1]:v);
    const editado=Object.keys(aj).length>0;
    const nums=vals.filter(v=>v!=null&&v!==''&&!isNaN(+v)).map(Number);
    let media=null,total=null;
    if(agg==='t'){total=editado?moda(vals.filter(Boolean)):(passados.length?fn(anoCtx):null);}
    else if(editado||manual){if(nums.length){const s=nums.reduce((a,b)=>a+b,0);if(agg==='f'){total=s;media=s/Math.max(1,passados.length||nums.length);}else{media=s/nums.length;total=agg==='s'?null:media;}}}
    else if(agg==='f'){total=passados.length?fn(anoCtx):null;media=passados.length?total/passados.length:null;}
    else if(agg==='s'){media=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;}
    else if(agg==='a'){total=passados.length?fn(anoCtx):null;media=total;}
    return {rot,fmt,agg,vals,auto,aj,media,total,manual};
  });
}
V.indicadores=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.ind||(ui.f.ind={ano:today().slice(0,4),produto:'',visao:'graficos'});
  const linhas=tabelaIndicadores(f.ano,f.produto);const L=n=>linhas.find(r=>r.rot===n)||{vals:[]};
  const anos=[...new Set([today().slice(0,4)].concat(db.contratos.map(k=>k.data.slice(0,4)),db.lancamentos.map(l=>l.venc.slice(0,4))))].filter(Boolean).sort().reverse();
  const mesAtual=f.ano===today().slice(0,4)?+today().slice(5,7):12;
  const card=(rot,fmt,cor,inverso)=>{const r=L(rot);const v=r.vals.map(x=>x==null?null:+x);const at=v[mesAtual-1],ant=v[mesAtual-2];
    const varp=ant?((at-ant)/Math.abs(ant))*100:null;const bom=varp==null?'':(inverso?varp<=0:varp>=0)?'good':'bad';
    return `<div class="card kpi kpi-spark"><div class="l">${esc(rot)}</div><div class="v">${fmtInd(at,fmt)}</div><div class="s ${bom}">${varp==null?'&nbsp;':(varp>=0?'▲ ':'▼ ')+num(Math.abs(varp),0)+'% vs mês anterior'}</div>${sparkline(v.slice(0,mesAtual),cor)}</div>`;};
  const meses12=MESES.map(m=>m);
  const visual=`<div class="grid g-kpi">${card('Valor efetivamente faturado','brl','#2E7D4E')}${card('Total de saídas','brl','#C0392B',true)}${card('Conversões (contratos fechados)','int','#2E6DA4')}${card('Atendimentos (total)','int','#1A7A6E')}${card('Taxa de inadimplência','pct','#B26A10',true)}${card('Ticket médio de contratos','brl','#C8A84B')}</div>
    <div class="grid g-2">
      <div class="card"><h3>Faturamento × saídas</h3>${barras([{nome:'Faturado',cor:'#2E7D4E',vals:L('Valor efetivamente faturado').vals},{nome:'Saídas',cor:'#C0392B',vals:L('Total de saídas').vals}],meses12,brlK,false)}</div>
      <div class="card"><h3>Atendimentos por origem</h3>${barras([{nome:'Facebook/Instagram',cor:'#1877F2',vals:L('Atendimentos — Facebook/Instagram').vals},{nome:'Google',cor:'#EA4335',vals:L('Atendimentos — Google').vals},{nome:'Outras fontes',cor:'#8A8A8A',vals:L('Atendimentos — outras fontes').vals}],meses12,null,true)}</div>
      <div class="card"><h3>Conversões e taxa de conversão</h3>${barras([{nome:'Contratos',cor:'#2E6DA4',vals:L('Conversões (contratos fechados)').vals}],meses12,null,false,120)}<div class="small muted" style="margin-top:6px">Taxa de conversão: ${L('Taxa de conversão (contratos ÷ atendimentos do mês)').vals.map((v,i)=>v==null?'':`${MESES[i]} ${num(v,0)}%`).filter(Boolean).join(' · ')||'—'}</div></div>
      <div class="card"><h3>Investimento em tráfego × CAC médio</h3>${barras([{nome:'Tráfego total',cor:'#7B4FB0',vals:L('Tráfego total').vals}],meses12,brlK,false,120)}<div class="small muted" style="margin-top:6px">CAC médio: ${L('CAC médio por contrato').vals.map((v,i)=>v==null?'':`${MESES[i]} ${brl(v)}`).filter(Boolean).join(' · ')||'—'}</div></div>
    </div>`;
  const tabela=`<div class="hint">Clique em qualquer valor para <b>corrigir ou preencher manualmente</b>. Valores editados aparecem com ✎ e podem voltar ao automático. Use <b>+ Indicador manual</b> para acompanhar números que o sistema não calcula.</div>
  <div class="card tbl"><table class="wide sticky1 ind"><thead><tr><th>Indicador</th>${MESES_L.map(m=>`<th class="num">${m.slice(0,3)}</th>`).join('')}<th class="num">Média</th><th class="num">Total ${esc(f.ano)}</th></tr></thead><tbody>
  ${linhas.map(r=>r.sec?`<tr class="sec"><td colspan="15">${esc(r.sec)}</td></tr>`:`<tr><td>${esc(r.rot)}${r.manual?` <button class="btn btn-sm lnk" data-act="delIndExtra" data-id="${esc(r.rot)}">remover</button>`:''}</td>${r.vals.map((v,i)=>{const ed=r.aj[i+1]!==undefined&&r.aj[i+1]!=='';return `<td class="num cel ${v==null?'muted':''} ${ed?'editado':''}" data-act="editInd" data-id="${esc(r.rot)}|${i+1}" title="${ed?'Editado manualmente (automático: '+esc(fmtInd(r.auto[i],r.fmt))+')':'Clique para editar'}">${fmtInd(v,r.fmt)}${ed?' ✎':''}</td>`;}).join('')}<td class="num strong">${r.agg==='t'?'—':fmtInd(r.media,r.fmt==='int'?'dec':r.fmt)}</td><td class="num strong">${r.agg==='s'?'—':fmtInd(r.total,r.fmt)}</td></tr>`).join('')}
  </tbody></table></div>`;
  return `<div class="toolbar"><select data-f="ind.ano">${anos.map(a=>`<option${a===f.ano?' selected':''}>${a}</option>`).join('')}</select>
    <select data-f="ind.produto"><option value="">Escritório inteiro (todos os nichos)</option>${db.produtos.map(p=>`<option${f.produto===p?' selected':''}>${esc(p)}</option>`).join('')}</select>
    <div class="tabs" style="margin:0;border:none"><button class="tab ${f.visao!=='tabela'?'active':''}" data-act="indVisao" data-id="graficos">Gráficos</button><button class="tab ${f.visao==='tabela'?'active':''}" data-act="indVisao" data-id="tabela">Tabela completa</button></div>
    <span class="grow"></span><button class="btn btn-ghost" data-act="novoIndExtra">+ Indicador manual</button><button class="btn btn-ghost" data-act="xlsInd">Exportar Excel</button></div>
  <div class="hint" style="background:var(--teal-l)">Preenchido automaticamente com o que vocês cadastram (atendimentos, contratos, financeiro, processos). ${f.produto?'Mostrando o bloco do nicho <b>'+esc(f.produto)+'</b>.':'Escolha um produto para ver o bloco de cada nicho.'}</div>
  ${f.visao==='tabela'?tabela:visual}`;
};
const fmtInd=(v,t)=>v==null||v===''?'—':t==='brl'?brl(v):t==='pct'?num(v,1)+'%':t==='dec'?num(v,1):t==='int'?num(v,1):esc(v);
function editInd(rot,mes){
  const f=ui.f.ind;const k=chaveInd(f.ano,f.produto,rot);const r=tabelaIndicadores(f.ano,f.produto).find(x=>x.rot===rot);if(!r)return;
  const aj=db.indAjustes[k]||{};const atual=aj[mes]!==undefined?aj[mes]:r.auto[mes-1];
  modal(`${rot} — ${MESES_L[mes-1]} de ${f.ano}`,`<div class="fgrid" style="grid-template-columns:1fr"><label>Valor${r.fmt==='txt'?'':' (número)'}<input id="ind-v" ${r.fmt==='txt'?'':'type="number" step="any"'} value="${esc(atual??'')}"></label></div>
    <p class="small muted" style="margin-top:8px">${r.manual?'Indicador manual.':'Valor automático: <b>'+esc(fmtInd(r.auto[mes-1],r.fmt))+'</b>'}</p>`,
    [...(aj[mes]!==undefined?[{l:'Voltar ao automático',c:'btn-ghost',left:1,fn:()=>{delete aj[mes];if(!Object.keys(aj).length)delete db.indAjustes[k];else db.indAjustes[k]=aj;closeModal();save();render();}}]:[]),
     {l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Salvar',c:'btn-brand',fn:()=>{const v=$('#ind-v').value.trim();if(v===''){toast('Informe um valor',1);return;}aj[mes]=r.fmt==='txt'?v:parseFloat(v);db.indAjustes[k]={...aj};closeModal();save();render();toast('Indicador atualizado ✓');}}]);
}

/* ---------------- CONFIGURAÇÕES ---------------- */
let contasCache=null;
V.config=()=>{
  const e=db.escritorio,srv=modo==='servidor';
  if(ehAdmin()&&!contasCache){contasCache=[];api('contas').then(r=>{contasCache=r.contas;if(ui.page==='config')render();}).catch(()=>{});}
  const minhaSenha=`<div class="card"><h3>🔑 Minha senha</h3><div class="fgrid"><label>Senha atual<input id="s-atual" type="password" autocomplete="current-password"></label><label>Nova senha (mín. 8)<input id="s-nova" type="password" autocomplete="new-password"></label></div>
    <div class="mfoot"><button class="btn btn-brand" data-act="trocarSenha">Trocar senha</button></div></div>`;
  const gStatus=gIndisponivel();
  const google=`<div class="card"><h3>🔗 Integrações Google ${gConectado()?pill('Conectado','p-green'):''}</h3>
    ${ehAdmin()?`<div class="fgrid" style="grid-template-columns:1fr"><label>Client ID do Google (OAuth)<input id="g-client" value="${esc(e.googleClientId)}" placeholder="000000000000-xxxx.apps.googleusercontent.com"></label></div>`:''}
    <div class="fgrid" style="grid-template-columns:1fr;margin-top:8px"><label>Meu calendário no Google Agenda<input id="g-cal" value="${esc(localStorage.getItem('gcal_cal')||'primary')}" placeholder="primary"><span class="small muted" style="font-weight:400">"primary" = sua agenda principal. Ou o ID de uma agenda compartilhada do escritório.</span></label></div>
    <p class="small ${gStatus?'c-wait':'c-ok'}" style="margin-top:8px">${gStatus?esc(gStatus):'Pronto para conectar.'}</p>
    ${e.driveRaizLink?`<p class="small"><a href="${esc(e.driveRaizLink)}" target="_blank" rel="noopener">📁 Pasta de clientes no Google Drive</a></p>`:''}
    <div class="mfoot">${ehAdmin()?'<button class="btn btn-ghost" data-act="salvarGoogle">Salvar</button>':'<button class="btn btn-ghost" data-act="salvarGoogle">Salvar agenda</button>'}<button class="btn btn-brand" data-act="gConectar"${gStatus?' disabled':''}>Conectar Google</button></div>
    <div class="small muted">Como configurar: veja o guia <b>docs/GOOGLE.md</b> (uma vez só, pelo administrador).</div></div>`;
  if(ehParceiro())return `<div class="grid g-2">${minhaSenha}${google}</div>`;
  return `<div class="grid g-2">
  <div class="card"><h3>🏢 Dados do escritório</h3>
    <div class="fgrid">${[['nome','Nome do escritório',1],['cnpj','CNPJ'],['oab','Registro da sociedade na OAB'],['email','E-mail'],['tel','Telefone'],['cidade','Cidade/UF'],['endereco','Endereço',1]].map(([k,l,full])=>`<label${full?' class="full"':''}>${l}<input id="esc_${k}" value="${esc(e[k])}"></label>`).join('')}
    <label>Salário mínimo vigente (guias)<input id="esc_salarioMinimo" type="number" step="0.01" value="${esc(e.salarioMinimo)}"></label>
    ${podeFin()?`<label>Saldo inicial do caixa (R$)<input id="esc_saldoInicial" type="number" step="0.01" value="${esc(e.saldoInicial)}"></label><label>Saldo inicial a partir de<input id="esc_saldoInicialData" type="date" value="${esc(e.saldoInicialData)}"></label>`:''}
  </div><div class="mfoot"><button class="btn btn-brand" data-act="salvarEsc">Salvar</button></div></div>
  <div class="card"><h3>🖋️ Papel timbrado dos documentos <button class="btn btn-ghost btn-sm" data-act="verTimbrado">Ver no gerador</button></h3>
    <div class="timbrado-cfg">
      <div class="tb-mini" style="${estiloFolha()}"><img src="${logoSrc()}" alt=""><i></i><i></i><i></i><i></i><i></i></div>
      <div>
        <div class="strong">Logotipo (cabeçalho)</div><div class="small muted">${e.logo?'Personalizado':'Padrão do escritório (Martins &amp; Saturnino)'}</div>
        <div class="flx" style="margin:6px 0 14px"><button class="btn btn-ghost btn-sm" data-act="logoUp">Trocar logotipo</button>${e.logo?'<button class="btn btn-sm lnk" data-act="logoDel">voltar ao padrão</button>':''}</div>
        <div class="strong">Marca d'água</div><div class="small muted">${e.semMarca?'Desativada':e.marcaDagua?'Personalizada (imagem de página inteira A4)':'Padrão do escritório (balança)'}</div>
        <div class="flx" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-act="marcaUp">Trocar marca d'água</button><button class="btn btn-sm lnk" data-act="marcaSem">${e.semMarca?'ativar':'desativar'}</button>${e.marcaDagua||e.semMarca?'<button class="btn btn-sm lnk" data-act="marcaPadrao">voltar ao padrão</button>':''}</div>
      </div></div>
    <div class="small muted" style="margin-top:10px">Vale para todos os documentos: tela, impressão/PDF, Word (.docx) e Google Docs. Para trocar a marca d'água, use uma imagem do tamanho de uma página A4 em pé (como um papel timbrado), com fundo branco ou transparente.</div></div>
  ${ehAdmin()?`<div class="card"><h3>👥 Acessos ao sistema (login e senha) <button class="btn btn-gold btn-sm" data-act="novaConta">+ Acesso</button></h3>
    <div class="tbl"><table><thead><tr><th>Nome</th><th>E-mail (login)</th><th>Perfil</th><th></th></tr></thead><tbody>
    ${(contasCache||[]).map((c,i)=>`<tr data-act="editConta" data-id="${i}"><td class="strong">${esc(c.nome)}</td><td>${esc(c.email)}</td><td class="small">${esc(papelNome(c.papel))}</td><td>${c.ativo?pill('Ativo','p-green'):pill('Desativado','p-gray')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Carregando…</td></tr>'}</tbody></table></div>
    <div class="small muted" style="margin-top:8px">Cada pessoa entra com o próprio e-mail e senha. <b>Estagiário</b> não vê o financeiro; <b>Parceiro</b> vê só os casos da parceria.${modo==='local'?' Na demonstração, a senha de todos é <b>demo1234</b>.':''}</div></div>`:''}
  ${minhaSenha}
  ${['admin','advogado'].includes(papel())?cardSalasConfig():''}
  <div class="card"><h3>🧑‍⚖️ Equipe (responsáveis e parceiros) <button class="btn btn-gold btn-sm" data-act="novoUsr">+ Membro</button></h3><div class="tbl"><table><thead><tr><th>Nome</th><th>Função</th><th>OAB</th></tr></thead><tbody>
    ${db.usuarios.map(u=>`<tr data-act="editUsr" data-id="${u.id}"><td class="strong">${esc(u.nome)}<div class="small muted">${esc(u.email)}</div></td><td>${esc(u.papel)}</td><td>${esc(u.oab)||'—'}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h3>🏷️ Tipos de compromisso / serviço</h3><div id="tipos-lista">${db.tiposEvento.map((t,i)=>`<div class="tipo-lin"><input type="color" value="${esc(t.cor)}" data-tipo-cor="${i}" aria-label="Cor"><input value="${esc(t.nome)}" data-tipo-nome="${i}" aria-label="Nome"><button class="btn btn-sm lnk" data-act="delTipo" data-id="${i}">remover</button></div>`).join('')}</div>
    <div class="mfoot"><button class="btn btn-ghost" data-act="addTipo">+ Tipo</button><button class="btn btn-brand" data-act="salvarTipos">Salvar tipos</button></div></div>
  <div class="card"><h3>📦 Produtos / nichos <small>um por linha</small></h3>
    <textarea id="produtos-txt" rows="8" style="width:100%">${esc(db.produtos.join('\n'))}</textarea>
    <div class="mfoot"><button class="btn btn-ghost" data-act="editMetas">🎯 Metas e prêmio</button><button class="btn btn-brand" data-act="salvarProd">Salvar produtos</button></div></div>
  ${google}
  ${podeFin()?`<div class="card"><h3>📥 Importar planilhas do Excel</h3><p class="small muted" style="margin-bottom:12px">Traga os dados das planilhas <b>CRM interno</b> e <b>Controle financeiro</b>. Você confere o que foi encontrado antes de importar.</p>
    <button class="btn btn-brand" data-act="importarXls">Escolher planilha (.xlsx)</button></div>`:''}
  ${ehAdmin()?`<div class="card"><h3>💾 Backup</h3><p class="small muted" style="margin-bottom:12px">${srv?'Os dados ficam no banco da hospedagem. Exporte uma cópia de vez em quando.':'Na demonstração os dados ficam só neste navegador.'}</p>
    <div class="flx"><button class="btn btn-brand" data-act="exportar">Exportar backup (.json)</button><button class="btn btn-ghost" data-act="importar">Importar backup</button></div>
    ${srv?'':'<div class="flx" style="margin-top:12px"><button class="btn btn-ghost" data-act="resetDemo">Restaurar exemplo</button><button class="btn btn-danger" data-act="zerar">Apagar dados e começar vazio</button></div>'}</div>`:''}
  </div>`;
};
