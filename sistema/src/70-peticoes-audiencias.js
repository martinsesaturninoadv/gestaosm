/* =========================================================
   CONFERÊNCIA DE PETIÇÕES e AUDIÊNCIAS
   ========================================================= */
const PET_STATUS=['A conferir','Em correção','Conferida','Pronta para protocolar','Protocolada'];
const PET_TIPOS=['Petição inicial','Contestação','Réplica','Recurso','Contrarrazões','Manifestação','Requerimento INSS','Recurso administrativo','Embargos','Cumprimento de sentença','Outra'];
const corPet={'A conferir':'p-amber','Em correção':'p-red','Conferida':'p-blue','Pronta para protocolar':'p-green','Protocolada':'p-gray'};
/* cria/atualiza o compromisso da agenda ligado à petição (prazo para protocolar) */
function sincronizarAgendaPeticao(pt){
  let e=pt.eventoId&&db.eventos.find(x=>x.id===pt.eventoId);
  if(!pt.prazo){if(e)db.eventos=db.eventos.filter(x=>x.id!==e.id);pt.eventoId='';return;}
  const resp=[pt.autorId,pt.conferenteId].filter(Boolean);
  const dados={tipo:'Prazo',titulo:'Protocolar: '+pt.titulo,data:pt.prazo,hora:pt.hora||'',clienteId:pt.clienteId||'',processoId:pt.processoId||'',
    responsavelId:resp[0]||db.usuarioAtual,responsaveis:resp.length?[...new Set(resp)]:[db.usuarioAtual],feito:pt.status==='Protocolada',obs:'Ligado à conferência de petições ('+pt.status+').',peticaoId:pt.id};
  if(dados.feito&&!(e&&e.feito)){dados.feitoEm=today();dados.feitoPor=db.usuarioAtual;}
  if(e)Object.assign(e,dados);else{e={id:uid(),...dados};db.eventos.push(e);pt.eventoId=e.id;}
}
function editPeticao(id,pre){
  const pt=id?db.peticoes.find(x=>x.id===id):{status:'A conferir',tipo:'Manifestação',autorId:db.usuarioAtual,prazo:addDays(2),...pre};
  form(id?'Editar petição':'Nova petição para conferir',[
    {k:'titulo',l:'Petição / peça',req:1,full:1,ph:'Ex.: Réplica — Maria Souza x Banco X'},{k:'tipo',l:'Tipo',t:'select',o:PET_TIPOS},{k:'status',l:'Situação',t:'select',o:PET_STATUS,req:1},
    {k:'clienteId',l:'Cliente',t:'select',o:O.clientes},{k:'processoId',l:'Processo',t:'select',o:O.processos},
    {k:'autorId',l:'Quem redigiu',t:'select',o:O.usuarios},{k:'conferenteId',l:'Quem vai conferir',t:'select',o:O.usuarios},
    {k:'prazo',l:'Protocolar até (vai para a agenda)',t:'date'},{k:'hora',l:'Horário limite',t:'time'},
    {t:'sec',html:id?`<div class="dgroup" style="margin:8px 0 4px">📎 Arquivo da petição (guardado no sistema)</div>${anexosBox('peticoes',pt)}`:'<div class="hint" style="margin:8px 0 0">📎 Depois de salvar, a petição abre de novo para você <b>anexar o arquivo</b> (Word ou PDF) direto no sistema.</div>'},
    {k:'link',l:'Ou link do arquivo (Drive / Docs), se preferir',t:'url',full:1,ph:'https://docs.google.com/…'},
    {k:'apontamentos',l:'Apontamentos da conferência (o que corrigir)',t:'textarea',full:1,rows:3},{k:'obs',l:'Observações',t:'textarea',full:1,rows:2}],
    pt,v=>{if(v.processoId&&!v.clienteId)v.clienteId=proc(v.processoId)?.clienteId||'';
      const mudou=id&&v.status!==pt.status;const alvo=id?pt:{...v};
      if(id)Object.assign(pt,v);else{alvo.id=uid();alvo.criado=today();alvo.criadoPor=db.usuarioAtual;alvo.historico=[];db.peticoes.push(alvo);}
      const o=id?pt:alvo;if(mudou||!id)(o.historico=o.historico||[]).push({em:Date.now(),por:db.usuarioAtual,status:o.status});
      if(o.status==='Conferida'&&!o.conferidaEm)o.conferidaEm=today();if(o.status==='Protocolada'&&!o.protocoladaEm)o.protocoladaEm=today();
      sincronizarAgendaPeticao(o);if(!id)setTimeout(()=>{editPeticao(o.id);toast('Petição criada ✓ Agora anexe o arquivo 📎');},350);},
    id&&(()=>{const e=pt.eventoId;db.peticoes=db.peticoes.filter(x=>x.id!==id);if(e)db.eventos=db.eventos.filter(x=>x.id!==e);}));
}
function moverPeticao(id,st){const pt=db.peticoes.find(x=>x.id===id);if(!pt)return;pt.status=st;(pt.historico=pt.historico||[]).push({em:Date.now(),por:db.usuarioAtual,status:st});
  if(st==='Conferida'&&!pt.conferidaEm)pt.conferidaEm=today();if(st==='Protocolada'&&!pt.protocoladaEm)pt.protocoladaEm=today();sincronizarAgendaPeticao(pt);
  if(st==='Protocolada')celebrarEvento('peticao','Petição protocolada!','O prazo foi marcado como cumprido na agenda');}
const petUrgente=pt=>pt.status!=='Protocolada'&&pt.prazo&&diff(pt.prazo)<=1;
V.peticoes=()=>{
  const f=ui.f.pet||(ui.f.pet={quem:'',ver:'quadro'});const me=db.usuarioAtual;
  const ls=db.peticoes.filter(p=>!f.quem||(f.quem==='conferir'?p.conferenteId===me:p.autorId===me)).sort((a,b)=>(a.prazo||'9').localeCompare(b.prazo||'9'));
  const paraMim=db.peticoes.filter(p=>p.conferenteId===me&&p.status==='A conferir').length,urg=db.peticoes.filter(petUrgente).length;
  const card=p=>`<div class="t" data-act="editPet" data-id="${p.id}" style="cursor:pointer">${esc(p.titulo)}</div>
    <div class="small muted">${esc(p.tipo||'')}${p.clienteId?' · '+esc(nomeCli(p.clienteId)):''}</div>
    <div class="meta">${p.prazo?(p.status==='Protocolada'?'protocolada '+fd(p.protocoladaEm||p.prazo):prazoTxt(p.prazo)+(p.hora?' · até '+esc(p.hora):'')):'sem prazo'}</div>
    <div class="small" style="margin-top:3px">✍️ ${esc(nomeUsr(p.autorId))}${p.conferenteId?' → 🔎 '+esc(nomeUsr(p.conferenteId)):''}</div>
    ${p.apontamentos&&p.status==='Em correção'?`<div class="small" style="margin-top:4px;color:var(--red)">⚠ ${esc(p.apontamentos.slice(0,90))}</div>`:''}
    ${(p.anexos||[]).length?`<a class="small" href="${anxUrl(p.anexos[p.anexos.length-1].id)}" data-act="anxVer" data-id="peticoes|${p.id}|${p.anexos[p.anexos.length-1].id}">📎 ${esc(p.anexos[p.anexos.length-1].nome)}${p.anexos.length>1?' (+'+(p.anexos.length-1)+')':''}</a> `:''}${p.link?`<a class="small" href="${esc(p.link)}" target="_blank" rel="noopener">📄 Drive</a>`:''}`;
  return `<div class="grid g-kpi">${kpi('Para eu conferir',paraMim,'',paraMim?'bad':'good')}${kpi('A conferir (todas)',db.peticoes.filter(p=>p.status==='A conferir').length)}${kpi('Em correção',db.peticoes.filter(p=>p.status==='Em correção').length)}
    ${kpi('Prontas para protocolar',db.peticoes.filter(p=>p.status==='Pronta para protocolar').length)}${kpi('Vencendo (até amanhã)',urg,'',urg?'bad':'good')}</div>
  <div class="toolbar"><select data-f="pet.quem"><option value="">Todas as petições</option><option value="conferir"${f.quem==='conferir'?' selected':''}>🔎 Que eu confiro</option><option value="minhas"${f.quem==='minhas'?' selected':''}>✍️ Que eu redigi</option></select>
    <span class="hint" style="margin:0">Arraste entre as colunas. O prazo para protocolar entra na agenda dos responsáveis.</span><span class="grow"></span><button class="btn btn-gold" data-act="novaPet">+ Petição para conferir</button></div>
  ${kanban(PET_STATUS.map(s=>[s,s]),ls.map(p=>({...p,_col:p.status})),'pet',card)}`;
};

/* ---------- AUDIÊNCIAS ---------- */
const ehAudiencia=e=>/audi[eê]ncia|per[ií]cia|concilia/i.test(e.tipo||'');
function editAudiencia(id,pre){
  const e=id?db.eventos.find(x=>x.id===id):{tipo:'Audiência',data:addDays(7),hora:'14:00',modalidade:'Virtual',responsavelId:db.usuarioAtual,feito:false,...pre};
  form(id?'Editar audiência':'Nova audiência / perícia',[
    {k:'tipo',l:'Tipo',t:'select',o:['Audiência','Audiência de conciliação','Audiência de instrução','Audiência una','Perícia','Perícia médica (INSS)','Sustentação oral'],req:1},
    {k:'titulo',l:'Descrição',req:1,ph:'Ex.: Instrução — Maria x Banco X'},{k:'data',l:'Data',t:'date',req:1},{k:'hora',l:'Hora',t:'time',req:1},
    {k:'processoId',l:'Processo',t:'select',o:O.processos,full:1},{k:'clienteId',l:'Cliente',t:'select',o:O.clientes},
    {k:'modalidade',l:'Modalidade',t:'select',o:['Virtual','Presencial','Híbrida']},{k:'local',l:'Local (fórum / vara / sala)',full:1},
    {k:'linkVirtual',l:'Link da sala virtual',t:'url',full:1,ph:'https://… (Zoom, Teams, Meet, Cisco)'},
    {k:'responsaveis',l:'Quem vai (advogados)',t:'multi',o:O.usuarios,full:1,req:1},
    {k:'testemunhas',l:'Testemunhas / partes a confirmar',t:'textarea',full:1,rows:2},
    {k:'clienteAvisado',l:'Cliente avisado e orientado',t:'check'},{k:'testemunhasOk',l:'Testemunhas confirmadas',t:'check'},{k:'docsOk',l:'Documentos e roteiro prontos',t:'check'},
    {k:'resultado',l:'Resultado / ata (depois da audiência)',t:'textarea',full:1,rows:2},{k:'feito',l:'Realizada',t:'check',full:1}],
    {...e,responsaveis:respDe(e)},v=>{v.responsavelId=v.responsaveis[0]||'';if(v.processoId&&!v.clienteId)v.clienteId=proc(v.processoId)?.clienteId||'';
      if(!db.tiposEvento.some(t=>norm(t.nome)===norm(v.tipo)))db.tiposEvento.push({nome:v.tipo,cor:'#1E5FA8'});
      if(v.feito&&!e.feito){v.feitoEm=today();v.feitoPor=db.usuarioAtual;}upsert('eventos',id,v);},id&&(()=>{db.eventos=db.eventos.filter(x=>x.id!==id);}));
}
V.audiencias=()=>{
  const f=ui.f.aud||(ui.f.aud={ver:'proximas'});
  const todas=db.eventos.filter(ehAudiencia);
  const prox=todas.filter(e=>!e.feito&&diff(e.data)>=0).sort((a,b)=>(a.data+(a.hora||'')).localeCompare(b.data+(b.hora||'')));
  const pend=todas.filter(e=>!e.feito&&diff(e.data)<0);
  const pass=todas.filter(e=>e.feito).sort((a,b)=>b.data.localeCompare(a.data));
  const lista=f.ver==='realizadas'?pass:f.ver==='pendentes'?pend:prox;
  const chk=(ok,l)=>`<span class="small" style="color:${ok?'var(--green)':'var(--amber)'}">${ok?'✔':'○'} ${l}</span>`;
  return `<div class="grid g-kpi">${kpi('Próximos 7 dias',prox.filter(e=>diff(e.data)<=7).length)}${kpi('Hoje',prox.filter(e=>diff(e.data)===0).length,'',prox.some(e=>diff(e.data)===0)?'bad':'')}${kpi('Sem resultado lançado',pend.length,'audiências passadas',pend.length?'bad':'good')}${kpi('Realizadas',pass.length)}</div>
  <div class="toolbar"><div class="tabs" style="margin:0;border:none">${[['proximas','Próximas'],['pendentes','Passadas sem resultado'],['realizadas','Realizadas']].map(([k,l])=>`<button class="tab ${f.ver===k?'active':''}" data-act="audVer" data-id="${k}">${l}</button>`).join('')}</div><span class="grow"></span><button class="btn btn-gold" data-act="novaAud">+ Audiência / perícia</button></div>
  <div class="aud-lista">${lista.map(e=>{const p=proc(e.processoId),d=diff(e.data);return `<div class="card aud${d===0&&!e.feito?' hoje':''}">
    <div class="aud-data"><b>${e.data.slice(8)}</b><span>${MESES[+e.data.slice(5,7)-1]}</span><small>${esc(e.hora||'')}</small></div>
    <div class="grow"><div class="strong">${esc(e.titulo)} ${pill(e.tipo,'p-blue')} ${e.modalidade?pill(e.modalidade,e.modalidade==='Virtual'?'p-green':'p-gray'):''}</div>
      <div class="small muted">${esc(nomeCli(e.clienteId))}${p?' · '+esc(p.numero)+' · '+esc(p.orgao||''):''} · ${esc(nomesResp(e))}</div>
      ${e.local?`<div class="small">📍 ${esc(e.local)}</div>`:''}${e.feito?(e.resultado?`<div class="small" style="margin-top:4px">📝 ${esc(e.resultado)}</div>`:''):`<div class="flx" style="margin-top:6px;gap:12px">${chk(e.clienteAvisado,'cliente avisado')}${chk(e.testemunhasOk,'testemunhas')}${chk(e.docsOk,'documentos')}</div>`}
    </div><div class="flx" style="flex-direction:column;align-items:flex-end">${!e.feito?`<div class="small strong" style="color:${d<=1?'var(--red)':'inherit'}">${d===0?'HOJE':d===1?'amanhã':d>0?'em '+d+' dias':prazoTxt(e.data)}</div>`:''}
      ${e.linkVirtual&&!e.feito?`<a class="btn btn-brand btn-sm" href="${esc(e.linkVirtual)}" target="_blank" rel="noopener" style="text-decoration:none">🎥 Entrar na sala</a>`:''}
      ${cli(e.clienteId)?.tel&&!e.feito?`<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" style="text-decoration:none" href="${esc(waLink(cli(e.clienteId).tel,`Olá, ${(nomeCli(e.clienteId)||'').split(' ')[0]}! Lembrando da sua ${e.tipo.toLowerCase()} no dia ${fd(e.data)} às ${e.hora||''}${e.modalidade==='Virtual'&&e.linkVirtual?'. Link: '+e.linkVirtual:e.local?'. Local: '+e.local:''}. Qualquer dúvida, estamos à disposição.`))}" data-act="audAvisado" data-id="${e.id}">Avisar cliente</a>`:''}
      <button class="btn btn-ghost btn-sm" data-act="editAud" data-id="${e.id}">${e.feito||d<0?'Lançar resultado':'Editar'}</button></div></div>`;}).join('')||'<div class="empty">Nenhuma audiência aqui</div>'}</div>`;
};
const PET_AUD_ACOES={
  novaPet:()=>editPeticao(),editPet:id=>editPeticao(id),
  novaAud:()=>editAudiencia(),editAud:id=>editAudiencia(id),audVer:k=>{ui.f.aud.ver=k;render();},
  audAvisado:id=>{const e=db.eventos.find(x=>x.id===id);if(e){e.clienteAvisado=true;save();setTimeout(render,300);}},
};
