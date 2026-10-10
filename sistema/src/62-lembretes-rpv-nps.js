/* =========================================================
   LEMBRETES PARA CLIENTES · RPV / PRECATÓRIOS / ALVARÁS · PESQUISA DE SATISFAÇÃO (NPS)
   ========================================================= */
const LEMBRETES_PADRAO={
  guia:'Olá, {nome}! Aqui é do escritório {escritorio}. Lembrando que a guia do INSS da competência {competencia}, no valor de {valor}, vence em {venc}. {link}Qualquer dúvida, estamos à disposição. 😊',
  parto:'Olá, {nome}! Tudo bem? Aqui é do escritório {escritorio}. A data prevista do parto é {dpp}. Assim que o bebê nascer, nos envie a certidão de nascimento para darmos entrada no salário-maternidade. 💗',
  portal:'Olá, {nome}! Este é o seu link para acompanhar o seu caso, enviar documentos e ver as guias: {portal}',
  nps:'Olá, {nome}! Foi um prazer cuidar do seu caso. Você pode avaliar o nosso atendimento em 1 minuto? {nps} Muito obrigado! 🙏'};
const tplLembrete=k=>(db.escritorio.lembretes||{})[k]||LEMBRETES_PADRAO[k];
const urlBase=()=>location.origin+location.pathname.replace(/[^/]*$/,'');
const linkPortal=c=>c?.portalToken?urlBase()+'portal.php?t='+c.portalToken:'';
function preencherMsg(tpl,v){return tpl.replace(/\{(\w+)\}/g,(m,k)=>v[k]??'').replace(/\s{2,}/g,' ').trim();}
function msgGuia(c,g){const cl=cli(c.clienteId);return preencherMsg(tplLembrete('guia'),{nome:(cl?.nome||'').split(' ')[0],escritorio:db.escritorio.nome,competencia:mLabel(g.competencia),valor:brl(g.valor),venc:fd(g.venc),link:g.link?'Guia: '+g.link+' ':linkPortal(cl)?'Guia e código no seu portal: '+linkPortal(cl)+' ':''});}
function msgParto(c){const cl=cli(c.clienteId);return preencherMsg(tplLembrete('parto'),{nome:(cl?.nome||'').split(' ')[0],escritorio:db.escritorio.nome,dpp:fd(c.dpp)});}
const mailLink=(email,assunto,txt)=>email?`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(txt)}`:'';
function botoesEnvio(cl,txt,assunto,act,id){
  const wa=cl?.tel?waLink(cl.tel,txt):'',ml=mailLink(cl?.email,assunto,txt);
  return `${wa?`<a class="btn btn-sm" style="background:#1F9D55;color:#fff;text-decoration:none" target="_blank" rel="noopener" href="${esc(wa)}" data-act="${act}" data-id="${esc(id)}">WhatsApp</a>`:''}${ml?`<a class="btn btn-ghost btn-sm" style="text-decoration:none" href="${esc(ml)}" data-act="${act}" data-id="${esc(id)}">E-mail</a>`:''}${!wa&&!ml?'<span class="small muted">sem telefone/e-mail</span>':''}`;
}
/* lista do dia: guias vencendo e partos próximos */
function lembretesPendentes(){
  const out=[];
  db.sm.forEach(c=>{if(['Concluído','Indeferido'].includes(c.status))return;
    (c.guias||[]).forEach(g=>{if(g.pagaEm||g.quemPaga==='Escritório')return;const d=diff(g.venc);if(d>7||d<-30)return;out.push({tipo:'guia',c,g,d,feito:g.lembradoEm&&g.lembradoEm>=addDays(-3)});});
    if(!c.dataParto&&c.dpp&&diff(c.dpp)<=15&&diff(c.dpp)>=-30)out.push({tipo:'parto',c,d:diff(c.dpp),feito:c.lembradoPartoEm&&c.lembradoPartoEm>=addDays(-7)});});
  return out.sort((a,b)=>a.feito-b.feito||a.d-b.d);
}
function htmlLembretes(){
  const l=lembretesPendentes();
  return `<div class="card"><h3>📲 Lembretes para as clientes <small>guias até 7 dias e partos até 15 dias</small></h3>
    <div class="small muted" style="margin-bottom:8px">Clique em WhatsApp ou E-mail: a mensagem já vai pronta. ${db.escritorio.lembreteAuto?'✅ O envio automático por e-mail está <b>ligado</b> (3 dias antes do vencimento).':'Dá para ligar o envio automático por e-mail em Configurações → Lembretes.'}</div>
    ${l.map(x=>{const cl=cli(x.c.clienteId);const txt=x.tipo==='guia'?msgGuia(x.c,x.g):msgParto(x.c);const id=x.tipo==='guia'?x.c.id+'|'+x.g.id:x.c.id;
      return `<div class="ev"${x.feito?' style="opacity:.55"':''}><span class="pic">${x.tipo==='guia'?'₲':'👶'}</span><div class="body"><div class="t">${esc(cl?.nome||'—')}</div><div class="small muted">${x.tipo==='guia'?`Guia ${mLabel(x.g.competencia)} · ${brl(x.g.valor)} · vence ${fd(x.g.venc)} (${prazoTxt(x.g.venc)})`:`Parto previsto ${fd(x.c.dpp)} (${prazoTxt(x.c.dpp)})`}${x.feito?' · ✓ lembrado':''}</div></div>
        <div class="flx">${botoesEnvio(cl,txt,x.tipo==='guia'?'Guia do INSS — vencimento '+fd(x.g.venc):'Salário-maternidade — parto',x.tipo==='guia'?'lembrouGuia':'lembrouParto',id)}</div></div>`;}).join('')||'<div class="empty">Nenhum lembrete pendente 🎉</div>'}</div>`;
}
function cardLembretesConfig(){
  const t=k=>esc(tplLembrete(k));
  return `<div class="card"><h3>📲 Lembretes e mensagens para clientes</h3>
    <label class="chk small"><input type="checkbox" id="lem-auto"${db.escritorio.lembreteAuto?' checked':''}> Enviar <b>automaticamente por e-mail</b> o lembrete da guia 3 dias antes do vencimento e o do parto 10 dias antes (clientes com e-mail cadastrado)</label>
    <div class="fgrid" style="margin-top:8px">${[['guia','Guia do INSS — {nome} {competencia} {valor} {venc} {link}'],['parto','Parto — {nome} {dpp}'],['portal','Link do portal — {nome} {portal}'],['nps','Pesquisa de satisfação — {nome} {nps}']].map(([k,l])=>`<label class="full">${l}<textarea id="lem-${k}" rows="3">${t(k)}</textarea></label>`).join('')}</div>
    <div class="mfoot"><button class="btn btn-brand" data-act="lemSalvar">Salvar mensagens</button></div></div>`;
}

/* ---------- RPV / precatório / alvará ---------- */
const REQ_TIPOS=['RPV','Precatório','Alvará','Levantamento judicial'];
const REQ_STATUS=['Expedido','Aguardando pagamento','Depositado — aguardando levantamento','Levantado — repassar ao cliente','Repassado','Cancelado'];
function calcReq(r){
  const base=+r.valorLevantado||+r.valorBruto||0;const hon=+r.honorariosValor||(base*(+r.honorariosPct||0)/100);
  return {base,hon,repasse:Math.max(0,base-hon-(+r.despesas||0)-(+r.impostoRetido||0))};
}
function editReq(id,pre){
  const r=id?db.requisitorios.find(x=>x.id===id):{tipo:'RPV',status:'Expedido',dataExpedicao:today(),honorariosPct:30,...pre};
  form(id?'Editar RPV / precatório / alvará':'Novo RPV / precatório / alvará',[
    {k:'clienteId',l:'Cliente',t:'select',o:O.clientes,req:1,full:1},{k:'processoId',l:'Processo',t:'select',o:O.processos,full:1},
    {k:'tipo',l:'Tipo',t:'select',o:REQ_TIPOS,req:1},{k:'status',l:'Situação',t:'select',o:REQ_STATUS,req:1},
    {k:'numero',l:'Nº da requisição / alvará'},{k:'tribunal',l:'Tribunal / vara'},
    {k:'valorBruto',l:'Valor requisitado (R$)',t:'number'},{k:'dataExpedicao',l:'Data de expedição',t:'date'},
    {k:'previsaoPagamento',l:'Previsão de pagamento',t:'date',dica:'RPV federal: até 60 dias após a expedição (preenchido sozinho se vazio).'},{k:'dataPagamento',l:'Data do depósito',t:'date'},
    {k:'dataLevantamento',l:'Data do levantamento',t:'date'},{k:'valorLevantado',l:'Valor levantado (R$)',t:'number'},
    {k:'honorariosPct',l:'Honorários contratuais (%)',t:'number'},{k:'honorariosValor',l:'ou valor fixo dos honorários (R$)',t:'number'},
    {k:'despesas',l:'Despesas a descontar (R$)',t:'number'},{k:'impostoRetido',l:'Imposto retido (R$)',t:'number'},
    {k:'dataRepasse',l:'Data do repasse ao cliente',t:'date'},{k:'obs',l:'Observações',t:'textarea',full:1,rows:2}],
    r,v=>{if(v.tipo==='RPV'&&!v.previsaoPagamento&&v.dataExpedicao)v.previsaoPagamento=addDays(60,v.dataExpedicao);
      if(v.dataRepasse&&!['Repassado','Cancelado'].includes(v.status))v.status='Repassado';
      else if(v.dataLevantamento&&['Expedido','Aguardando pagamento','Depositado — aguardando levantamento'].includes(v.status))v.status='Levantado — repassar ao cliente';
      else if(v.dataPagamento&&['Expedido','Aguardando pagamento'].includes(v.status))v.status='Depositado — aguardando levantamento';
      if(v.processoId&&!v.clienteId)v.clienteId=proc(v.processoId)?.clienteId||'';
      upsert('requisitorios',id,v);},id&&(()=>{db.requisitorios=db.requisitorios.filter(x=>x.id!==id);}));
}
function pendenciasReq(){
  const p=[];if(!podeFin())return p;
  db.requisitorios.forEach(r=>{const n=nomeCli(r.clienteId);
    if(['Expedido','Aguardando pagamento'].includes(r.status)&&r.previsaoPagamento&&diff(r.previsaoPagamento)<0)p.push(['a','🏛',`${r.tipo} passou da previsão de pagamento (${fd(r.previsaoPagamento)})`,n,'editReq',r.id]);
    if(r.status==='Depositado — aguardando levantamento')p.push(['a','🏛',`${r.tipo} depositado: providenciar o levantamento`,n,'editReq',r.id]);
    if(r.status==='Levantado — repassar ao cliente'&&r.dataLevantamento&&diff(r.dataLevantamento)<=-3)p.push(['r','💸',`Repasse ao cliente pendente há ${-diff(r.dataLevantamento)} dias (${brl(calcReq(r).repasse)})`,n,'editReq',r.id]);});
  return p;
}
V.requisitorios=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.req||(ui.f.req={st:'abertos',tipo:''});
  const ls=db.requisitorios.filter(r=>(!f.tipo||r.tipo===f.tipo)&&(f.st==='todos'||(f.st==='abertos'?!['Repassado','Cancelado'].includes(r.status):r.status===f.st))).sort((a,b)=>(a.previsaoPagamento||'9').localeCompare(b.previsaoPagamento||'9'));
  const ab=db.requisitorios.filter(r=>!['Repassado','Cancelado'].includes(r.status));
  const aRec=ab.filter(r=>['Expedido','Aguardando pagamento','Depositado — aguardando levantamento'].includes(r.status));
  const aRep=ab.filter(r=>r.status==='Levantado — repassar ao cliente');
  return `<div class="toolbar"><select data-f="req.st"><option value="abertos">Em aberto</option><option value="todos"${f.st==='todos'?' selected':''}>Todos</option>${REQ_STATUS.map(s=>`<option${f.st===s?' selected':''}>${s}</option>`).join('')}</select>
    <select data-f="req.tipo"><option value="">Todos os tipos</option>${REQ_TIPOS.map(s=>`<option${f.tipo===s?' selected':''}>${s}</option>`).join('')}</select><span class="grow"></span><button class="btn btn-gold" data-act="novoReq">+ RPV / precatório / alvará</button></div>
  <div class="grid g-kpi">${kpi('A receber (requisitado)',brl(sumBy(aRec,r=>+r.valorBruto||0)),aRec.length+' requisição(ões)')}${kpi('Honorários previstos',brl(sumBy(aRec,r=>calcReq(r).hon)))}
    ${kpi('Repasses pendentes',brl(sumBy(aRep,r=>calcReq(r).repasse)),aRep.length+' cliente(s)',aRep.length?'bad':'good')}${kpi('Previsão vencida',aRec.filter(r=>r.previsaoPagamento&&diff(r.previsaoPagamento)<0).length)}</div>
  <div class="card tbl"><table><thead><tr><th>Cliente</th><th>Tipo</th><th class="hide-m">Nº / tribunal</th><th class="num">Valor</th><th>Previsão</th><th>Situação</th><th class="num">Honorários</th><th class="num">Repasse</th><th></th></tr></thead><tbody>
  ${ls.map(r=>{const c=calcReq(r);return `<tr data-act="editReq" data-id="${r.id}"><td class="strong">${esc(nomeCli(r.clienteId))}${r.processoId&&proc(r.processoId)?`<div class="small muted">${esc(proc(r.processoId).numero)}</div>`:''}</td><td>${esc(r.tipo)}</td><td class="hide-m small">${esc(r.numero||'')}<div class="muted">${esc(r.tribunal||'')}</div></td>
    <td class="num">${brl(c.base)}</td><td class="small">${r.previsaoPagamento?fd(r.previsaoPagamento)+(['Expedido','Aguardando pagamento'].includes(r.status)?'<br>'+prazoTxt(r.previsaoPagamento):''):'—'}</td>
    <td>${pill(r.status,r.status==='Repassado'?'p-green':r.status.startsWith('Levantado')?'p-red':r.status.startsWith('Depositado')?'p-amber':'p-blue')}</td><td class="num">${brl(c.hon)}</td><td class="num strong">${brl(c.repasse)}</td>
    <td>${['Levantado — repassar ao cliente','Repassado'].includes(r.status)&&!db.lancamentos.some(l=>l.reqRef===r.id)?`<button class="btn btn-ghost btn-sm" data-act="reqHon" data-id="${r.id}">Lançar honorários</button>`:''}</td></tr>`;}).join('')||'<tr><td colspan="9" class="empty">Nenhum registro</td></tr>'}</tbody></table></div>`;
};

/* ---------- pesquisa de satisfação (NPS) ---------- */
const linkNps=c=>c?.portalToken?linkPortal(c)+'&nps=1':'';
function garantirToken(c){if(!c.portalToken){c.portalToken=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');save();}return c.portalToken;}
function npsPendentes(){
  const out=[];const visto=new Set();
  db.sm.filter(c=>['Deferido','Concluído'].includes(c.status)).forEach(c=>out.push(c.clienteId));
  db.processos.filter(p=>p.status!=='Em andamento'||p.fase==='Encerrado').forEach(p=>out.push(p.clienteId));
  return out.filter(id=>{if(!id||visto.has(id))return false;visto.add(id);const c=cli(id);return c&&!c.npsEnviadoEm&&!db.nps.some(n=>n.clienteId===id);}).map(cli);
}
function resumoNps(){const ns=db.nps.filter(n=>n.nota!=null);if(!ns.length)return null;const pro=ns.filter(n=>n.nota>=9).length,det=ns.filter(n=>n.nota<=6).length;return {n:ns.length,nps:Math.round((pro-det)/ns.length*100),media:sumBy(ns,n=>n.nota)/ns.length};}
function htmlNps(){
  const r=resumoNps();const pend=npsPendentes();
  return `<div class="card"><h3>⭐ Pesquisa de satisfação (NPS)</h3>
    ${r?`<div class="grid g-kpi" style="grid-template-columns:repeat(3,1fr)">${kpi('NPS',r.nps,r.nps>=75?'excelente':r.nps>=50?'muito bom':r.nps>=0?'razoável':'crítico',r.nps>=50?'good':'bad')}${kpi('Nota média',num(r.media,1))}${kpi('Respostas',r.n)}</div>`:'<div class="small muted">Ainda não há respostas.</div>'}
    ${pend.length?`<div class="strong small" style="margin:10px 0 4px">Enviar para clientes com caso concluído/deferido:</div>${pend.slice(0,8).map(c=>`<div class="ev"><div class="body"><div class="t">${esc(c.nome)}</div></div><div class="flx"><button class="btn btn-ghost btn-sm" data-act="npsEnviar" data-id="${c.id}">Enviar pesquisa</button></div></div>`).join('')}`:''}
    ${db.nps.slice().sort((a,b)=>(b.em||0)-(a.em||0)).slice(0,6).map(n=>`<div class="ev"><span class="pic" style="font-weight:700;color:${n.nota>=9?'var(--green)':n.nota<=6?'var(--red)':'var(--amber)'}">${n.nota}</span><div class="body"><div class="t">${esc(nomeCli(n.clienteId))}</div><div class="small muted">${esc(n.comentario||'')}${n.indicacao?.nome?' · indicou '+esc(n.indicacao.nome):''}</div></div></div>`).join('')}</div>`;
}
const LEMB_ACOES={
  lembrouGuia:k=>{const[cid,gid]=k.split('|');const g=db.sm.find(x=>x.id===cid)?.guias.find(x=>x.id===gid);if(g){g.lembradoEm=today();save();setTimeout(render,300);}},
  lembrouParto:id=>{const c=db.sm.find(x=>x.id===id);if(c){c.lembradoPartoEm=today();save();setTimeout(render,300);}},
  lemSalvar:()=>{db.escritorio.lembretes={};['guia','parto','portal','nps'].forEach(k=>db.escritorio.lembretes[k]=$('#lem-'+k).value.trim());db.escritorio.lembreteAuto=$('#lem-auto').checked;save();render();toast('Mensagens salvas ✓');},
  novoReq:()=>editReq(),editReq:id=>editReq(id),novoReqProc:id=>editReq(null,{processoId:id,clienteId:proc(id)?.clienteId}),
  reqHon:id=>{const r=db.requisitorios.find(x=>x.id===id);const c=calcReq(r);if(!c.hon)return toast('Informe o percentual ou o valor dos honorários',1);
    db.lancamentos.push({id:uid(),tipo:'receita',descricao:`Honorários — ${r.tipo} ${r.numero||''}`.trim(),categoria:'H.O. finais — êxito',clienteId:r.clienteId,processoId:r.processoId||'',contratoId:'',valor:Math.round(c.hon*100)/100,venc:r.dataLevantamento||today(),pago:true,pagoEm:r.dataLevantamento||today(),forma:'Transferência',produto:cli(r.clienteId)?.produto||'',obs:'Lançado do controle de RPV/precatórios',criado:today(),reqRef:r.id});
    save();render();toast('Honorários lançados no financeiro ✓');},
  npsEnviar:id=>{const c=cli(id);garantirToken(c);const txt=preencherMsg(tplLembrete('nps'),{nome:(c.nome||'').split(' ')[0],nps:linkNps(c)});
    modal('Enviar pesquisa — '+c.nome,`<p class="small">${esc(txt)}</p><div class="flx" style="margin-top:10px">${botoesEnvio(c,txt,'Como foi o nosso atendimento?','npsMarcar',id)}</div>`,[{l:'Fechar',c:'btn-ghost',fn:closeModal}]);},
  portalCli:id=>{const c=cli(id);garantirToken(c);const lk=linkPortal(c);const txt=preencherMsg(tplLembrete('portal'),{nome:(c.nome||'').split(' ')[0],portal:lk});
    modal('🔗 Portal do cliente — '+c.nome,`<p class="small muted">Pelo link, ${esc((c.nome||'').split(' ')[0])} vê o andamento dos casos, as guias do INSS e os documentos pendentes, e pode <b>enviar arquivos</b> (que aparecem aqui na aba Documentos). Valores internos e anotações não aparecem.${modo==='local'?' <b>O portal só funciona na versão hospedada.</b>':''}</p>
      <input readonly value="${esc(lk)}" style="width:100%;margin:10px 0" onclick="this.select()"><div class="flx">${botoesEnvio(c,txt,'Acompanhe o seu caso','portalEnviado',id)}<button class="btn btn-ghost btn-sm" data-act="portalCopiar" data-id="${esc(lk)}">Copiar link</button><span class="grow"></span><button class="btn btn-sm lnk" data-act="portalNovo" data-id="${id}">Gerar novo link (o antigo deixa de funcionar)</button></div>`,[{l:'Fechar',c:'btn-ghost',fn:closeModal}]);},
  portalCopiar:lk=>{(navigator.clipboard?navigator.clipboard.writeText(lk):Promise.reject()).then(()=>toast('Link copiado ✓')).catch(()=>toast('Selecione o link e copie',1));},
  portalEnviado:id=>{const c=cli(id);if(c){c.portalEnviadoEm=today();save();}},
  portalNovo:async id=>{if(!await confirmar('Gerar um novo link? O link antigo deixa de funcionar.','Gerar'))return;const c=cli(id);c.portalToken='';garantirToken(c);A.portalCli(id);},
  npsMarcar:id=>{const c=cli(id);if(c){c.npsEnviadoEm=today();save();}},
};
