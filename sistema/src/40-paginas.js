/* =========================================================
   PÁGINAS
   ========================================================= */
const V={};

function kanban(cols,items,kind,cardFn){
  return `<div class="kanban" style="grid-template-columns:repeat(${cols.length},minmax(220px,1fr))">${cols.map(([key,label],ci)=>{const its=items.filter(i=>i._col===key);
    return `<div class="kcol" data-drop="${kind}:${esc(key)}"><div class="kcol-h"><span>${esc(label)}</span><span>${its.length}</span></div>
    ${its.map(i=>`<div class="kcard" draggable="true" data-drag="${kind}:${i.id}">${cardFn(i)}<div class="kmove">${ci>0?`<button data-act="kmove" data-id="${kind}:${i.id}:${esc(cols[ci-1][0])}" aria-label="Mover para a esquerda">◀</button>`:'<span></span>'}${ci<cols.length-1?`<button data-act="kmove" data-id="${kind}:${i.id}:${esc(cols[ci+1][0])}" aria-label="Mover para a direita">▶</button>`:''}</div></div>`).join('')}</div>`;}).join('')}</div>`;
}
function moveCard(kind,id,col){
  if(kind==='tarefa'){const t=db.tarefas.find(x=>x.id===id);if(t){if(col==='done'&&t.status!=='done'){t.concluidoEm=today();t.concluidoPor=t.responsavelId||db.usuarioAtual;toast('Tarefa concluída! +'+PONTOS.tarefa+' pontos 🎉');}if(col!=='done')t.concluidoEm='';t.status=col;}}
  if(kind==='proc'){const p=proc(id);if(p)p.fase=col;}
  if(kind==='sm'){const c=db.sm.find(x=>x.id===id);if(c)c.status=col;}
  if(kind==='lead'){const l=db.leads.find(x=>x.id===id);if(l){l.etapa=col;l.ultimoContato=today();if(col==='Fechado'&&!l.convertido)setTimeout(()=>toast('Negócio fechado! Use "Converter em cliente" no card.'),300);}}
  save();render();
}
V.tarefas=()=>{
  const f=ui.f.tarefas||(ui.f.tarefas={resp:''});
  const items=db.tarefas.filter(t=>!f.resp||t.responsavelId===f.resp).map(t=>({...t,_col:t.status})).sort((a,b)=>(a.prazo||'9').localeCompare(b.prazo||'9'));
  return `<div class="toolbar"><select data-f="tarefas.resp"><option value="">Todos os responsáveis</option>${db.usuarios.map(u=>`<option value="${u.id}"${f.resp===u.id?' selected':''}>${esc(u.nome)}</option>`).join('')}</select>
    <span class="grow"></span><button class="btn btn-gold" data-act="novaTar">+ Tarefa</button></div>
    <div class="hint">Arraste os cards entre as colunas (ou use ◀ ▶). Clique no card para editar.</div>
    ${kanban(TSTATUS,items,'tarefa',t=>`<div class="t" data-act="editTar" data-id="${t.id}" style="cursor:pointer">${esc(t.titulo)}</div>
      <div class="meta">${pPrior(t.prioridade)} <span>${esc(nomeUsr(t.responsavelId))}</span>${t.prazo?' · '+(t.status==='done'?fd(t.prazo):prazoTxt(t.prazo)):''}</div>
      ${t.processoId&&proc(t.processoId)?`<div class="small muted" style="margin-top:3px">${esc(proc(t.processoId).numero)}</div>`:''}`)}`;
};

V.clientes=()=>{
  const f=ui.f.cli||(ui.f.cli={q:'',status:'Ativo',tipo:'',produto:''});
  const q=f.q.toLowerCase(),dq=digits(f.q);
  const list=db.clientes.filter(c=>(!f.status||c.status===f.status)&&(!f.tipo||c.tipo===f.tipo)&&(!f.produto||c.produto===f.produto)&&(!q||(c.nome+' '+c.doc+' '+c.email+' '+cidadeUF(c)).toLowerCase().includes(q)||(dq.length>=3&&digits(c.doc+c.tel).includes(dq)))).sort((a,b)=>a.nome.localeCompare(b.nome));
  return `<div class="toolbar"><input data-f="cli.q" value="${esc(f.q)}" placeholder="Filtrar por nome, CPF/CNPJ, cidade…" style="min-width:240px">
    <select data-f="cli.status"><option value="">Todas as situações</option>${['Ativo','Inativo'].map(s=>`<option${f.status===s?' selected':''}>${s}</option>`).join('')}</select>
    <select data-f="cli.tipo"><option value="">PF e PJ</option><option value="PF"${f.tipo==='PF'?' selected':''}>Pessoa física</option><option value="PJ"${f.tipo==='PJ'?' selected':''}>Pessoa jurídica</option></select>
    <select data-f="cli.produto"><option value="">Todos os produtos</option>${db.produtos.map(p=>`<option${f.produto===p?' selected':''}>${esc(p)}</option>`).join('')}</select>
    <span class="grow"></span><a class="btn btn-ghost" href="#registro" style="text-decoration:none">Registro histórico</a><button class="btn btn-gold" data-act="novoCli">+ Cliente</button></div>
  <div class="card tbl"><table><thead><tr><th>Cliente</th><th>CPF / CNPJ</th><th class="hide-m">Contato</th><th class="hide-m">Produto</th><th class="hide-m">Cidade</th><th class="num">Processos</th>${podeFin()?'<th class="num">Em aberto</th>':''}<th>Situação</th></tr></thead><tbody>
  ${list.map(c=>{const np=db.processos.filter(p=>p.clienteId===c.id&&p.status==='Em andamento').length;const ab=podeFin()?saldoAberto(c.id):0;
    return `<tr data-go="cliente/${c.id}"><td><div class="strong">${esc(c.nome)}${c.driveLink?` <a href="${esc(c.driveLink)}" target="_blank" rel="noopener" title="Abrir a pasta no Google Drive" style="text-decoration:none">📁</a>`:''}</div><div class="small muted">${c.tipo==='PJ'?'Pessoa jurídica':'Pessoa física'} · desde ${fd(c.criado)}</div></td><td>${esc(c.doc)}</td><td class="hide-m">${esc(c.tel)}<div class="small muted">${esc(c.email)}</div></td><td class="hide-m small">${esc(c.produto)}</td><td class="hide-m">${esc(cidadeUF(c))}</td><td class="num">${np}</td>${podeFin()?`<td class="num">${ab?brl(ab):'—'}</td>`:''}<td>${pill(c.status,c.status==='Ativo'?'p-green':'p-gray')}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">Nenhum cliente encontrado</td></tr>'}
  </tbody></table></div>`;
};

function lancTable(list,showCli=true){
  if(!list.length)return '<div class="empty">Nenhum lançamento</div>';
  return `<div class="tbl"><table><thead><tr><th>Vencimento</th><th>Descrição</th>${showCli?'<th class="hide-m">Cliente</th>':''}<th class="hide-m">Categoria</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>
  ${list.map(l=>{const st=lancStatus(l);return `<tr data-act="editLanc" data-id="${l.id}"><td>${fd(l.venc)}</td><td><div class="strong">${esc(l.descricao)}</div>${l.processoId&&proc(l.processoId)?`<div class="small muted">${esc(proc(l.processoId).numero)}</div>`:''}${l.obs?`<div class="small muted">${esc(l.obs)}</div>`:''}</td>
    ${showCli?`<td class="hide-m">${esc(l.clienteId?nomeCli(l.clienteId):'—')}</td>`:''}<td class="hide-m small">${esc(l.categoria)}</td>
    <td class="num" style="color:${l.tipo==='despesa'?'var(--red)':'var(--green)'};font-weight:600">${l.tipo==='despesa'?'− ':''}${brl(l.valor)}</td><td>${pStatusLanc(st)}${l.pago&&l.pagoEm&&l.pagoEm!==l.venc?`<div class="small muted">em ${fd(l.pagoEm)}</div>`:''}</td>
    <td class="num">${l.pago?'':`<button class="btn btn-ghost btn-sm" data-act="baixar" data-id="${l.id}">${l.tipo==='despesa'?'Pagar':'Receber'}</button>`}</td></tr>`;}).join('')}</tbody></table></div>`;
}
function contratosTable(list,showCli=true){
  if(!list.length)return '<div class="empty">Nenhum contrato</div>';
  return `<div class="tbl"><table><thead><tr><th>Data</th>${showCli?'<th>Cliente</th>':''}<th class="hide-m">Produto</th><th class="num">Contrato</th><th class="num">Entrada</th><th class="num">Parcelas</th><th class="num">Recebido</th></tr></thead><tbody>
  ${list.map(k=>`<tr data-act="editCtr" data-id="${k.id}"><td>${fd(k.data)}</td>${showCli?`<td class="strong">${esc(nomeCli(k.clienteId))}${k.titular?`<div class="small muted">Titular: ${esc(k.titular)}</div>`:''}</td>`:''}<td class="hide-m small">${esc(k.produto)}<div class="muted">${esc(k.ambito)}</div></td>
    <td class="num">${brl(k.valorTotal)}</td><td class="num">${brl(k.entrada)}</td><td class="num">${k.parcelas?`${num(k.parcelas,0)}× ${brl(valorParcela(k))}`:'—'}</td><td class="num">${brl(recebidoContrato(k))}</td></tr>`).join('')}</tbody></table></div>`;
}
function btnDrive(c){
  return c.driveLink?`<a class="btn btn-ghost" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(c.driveLink)}">📁 Pasta no Drive</a>`
    :`<button class="btn btn-ghost" data-act="vincularDrive" data-id="${c.id}">📁 Vincular pasta do Drive</button>`;
}
V.cliente=()=>{
  const c=cli(ui.id);if(!c)return '<div class="empty">Cliente não encontrado. <a href="#clientes">Voltar</a></div>';
  const ps=db.processos.filter(p=>p.clienteId===c.id);
  const ks=db.contratos.filter(k=>k.clienteId===c.id).sort((a,b)=>b.data.localeCompare(a.data));
  const ls=db.lancamentos.filter(l=>l.clienteId===c.id).sort((a,b)=>a.venc.localeCompare(b.venc));
  const docs=db.documentos.filter(d=>d.clienteId===c.id);
  const notas=db.notas.filter(n=>n.clienteId===c.id).sort((a,b)=>b.data.localeCompare(a.data));
  const evs=db.eventos.filter(e=>e.clienteId===c.id&&!e.feito).sort((a,b)=>a.data.localeCompare(b.data));
  const sms=db.sm.filter(x=>x.clienteId===c.id);
  const pago=recebidoCliente(c.id),aberto=saldoAberto(c.id);
  let tab=ui.tabCli;if(!podeFin()&&['financeiro','contratos'].includes(tab))tab='processos';
  const tabs=[['processos','Processos ('+ps.length+')']].concat(podeFin()?[['contratos','Contratos ('+ks.length+')'],['financeiro','Financeiro']]:[]).concat(sms.length||c.produto==='Salário-maternidade'?[['sm','Salário-maternidade']]:[]).concat([['documentos','Documentos ('+docs.filter(d=>!d.recebido).length+' pend.)'],['agenda','Agenda ('+evs.length+')'],['historico','Histórico']]);
  let body='';
  if(tab==='processos')body=`<div class="toolbar"><span class="grow"></span><button class="btn btn-gold btn-sm" data-act="novoProcCli" data-id="${c.id}">+ Processo</button></div>`+(ps.length?`<div class="tbl"><table><thead><tr><th>Número</th><th>Área</th><th>Objeto</th><th>Fase</th><th>Situação</th></tr></thead><tbody>${ps.map(p=>`<tr data-go="processo/${p.id}"><td class="strong">${esc(p.numero)}</td><td>${esc(p.area)}<div class="small muted">${esc(p.tipo)}</div></td><td>${esc(p.objeto)}</td><td class="small">${esc(p.fase)}</td><td>${pStatusProc(p.status)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum processo</div>');
  if(tab==='contratos')body=`<div class="toolbar"><span class="grow"></span><button class="btn btn-gold btn-sm" data-act="ctrCli" data-id="${c.id}">+ Contrato de honorários</button></div>${contratosTable(ks,false)}`;
  if(tab==='financeiro')body=`<div class="toolbar"><span class="small">Recebido: <b style="color:var(--green)">${brl(pago)}</b> · Em aberto: <b style="color:var(--amber)">${brl(aberto)}</b></span><span class="grow"></span>
    <button class="btn btn-ghost btn-sm" data-act="novaRecCli" data-id="${c.id}">+ Receita avulsa</button><button class="btn btn-gold btn-sm" data-act="ctrCli" data-id="${c.id}">Novo contrato</button></div>${lancTable(ls,false)}`;
  if(tab==='documentos')body=`<div class="toolbar">${c.driveLink?`<a class="btn btn-ghost btn-sm" href="${esc(c.driveLink)}" target="_blank" rel="noopener" style="text-decoration:none">📁 Pasta no Google Drive</a>`:`<button class="btn btn-ghost btn-sm" data-act="vincularDrive" data-id="${c.id}">📁 Vincular pasta do Drive</button>`}<span class="grow"></span><button class="btn btn-ghost btn-sm" data-act="docsPadraoSm" data-id="${c.id}">+ Documentos padrão do salário-maternidade</button><button class="btn btn-ghost btn-sm" data-act="modeloCli" data-id="${c.id}">Gerar contrato / proposta / procuração</button><button class="btn btn-gold btn-sm" data-act="novoDocCli" data-id="${c.id}">+ Documento</button></div>`+docList(docs);
  if(tab==='sm')body=`<div class="toolbar"><span class="grow"></span><button class="btn btn-gold btn-sm" data-act="novoSmCli" data-id="${c.id}">+ Caso de salário-maternidade</button></div>`+(sms.length?sms.map(x=>{const pg=x.guias.filter(g=>g.pagaEm).length;return `<div class="ev"><div class="body" data-go="sm/${x.id}"><div class="t">${esc(x.categoria)} · ${esc(x.estrategia||'')}</div><div class="small muted">DPP/parto ${fd(x.dataParto||x.dpp)} · guias pagas ${pg}/${x.guias.length}</div></div>${pill(x.status,smCor(x.status))}</div>`;}).join(''):'<div class="empty">Nenhum caso cadastrado</div>');
  if(tab==='agenda')body=`<div class="toolbar"><span class="grow"></span><button class="btn btn-gold btn-sm" data-act="novoEvCli" data-id="${c.id}">+ Compromisso</button></div>`+(evs.length?evs.map(e=>evItem(e)).join(''):'<div class="empty">Nenhum compromisso pendente</div>');
  if(tab==='historico')body=`<div style="display:flex;gap:8px;margin-bottom:14px"><textarea id="nota-txt" rows="2" style="flex:1" placeholder="Registrar atendimento, ligação, reunião…"></textarea><button class="btn btn-brand" data-act="addNota" data-id="${c.id}">Registrar</button></div>
    <div class="tl">${notas.map(n=>`<div class="tli"><div class="d">${fd(n.data)} · ${esc(nomeUsr(n.autor))} <button class="btn btn-sm lnk" data-act="editNota" data-id="${n.id}">editar</button></div><div>${esc(n.texto)}</div></div>`).join('')||'<div class="empty">Nenhum registro</div>'}</div>`;
  const wa=c.tel?`<a class="btn btn-ghost" style="color:#1F9D55;border-color:#1F9D55;text-decoration:none" target="_blank" rel="noopener" href="${waLink(c.tel)}">WhatsApp</a>`:'';
  const idade=idadeDe(c);
  return `<div class="toolbar"><a class="btn btn-ghost" href="#clientes" style="text-decoration:none">← Clientes</a><span class="grow"></span>${wa}${btnDrive(c)}<button class="btn btn-ghost" data-act="editCli" data-id="${c.id}">Editar dados</button></div>
  <div class="grid" style="grid-template-columns:minmax(0,320px) minmax(0,1fr)" id="cli-grid">
    <div class="card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><div class="av" style="width:44px;height:44px;font-size:15px">${esc(initials(c.nome))}</div><div><div style="font-size:15px;font-weight:700">${esc(c.nome)}</div>${pill(c.status,c.status==='Ativo'?'p-green':'p-gray')} ${pill(c.tipo,'p-blue')}</div></div>
      <dl class="dl"><dt>${c.tipo==='PJ'?'CNPJ':'CPF'}</dt><dd>${esc(c.doc)||'—'}</dd><dt>Telefone</dt><dd>${esc(c.tel)||'—'}</dd><dt>E-mail</dt><dd style="word-break:break-all">${esc(c.email)||'—'}</dd><dt>Cidade</dt><dd>${esc(cidadeUF(c))||'—'}</dd>
      <dt>Produto</dt><dd>${esc(c.produto)||'—'}</dd><dt>Origem</dt><dd>${esc(c.origem)||'—'}</dd>${c.tipo==='PF'?`<dt>Idade / sexo</dt><dd>${idade!=null?idade+' anos':'—'}${c.sexo?' · '+esc(c.sexo):''}</dd><dt>Profissão</dt><dd>${esc(c.profissao)||'—'}</dd><dt>Renda</dt><dd>${c.renda?brl(c.renda):'—'}</dd>`:''}
      ${c.parceiro?`<dt>Parceria</dt><dd>${esc(parceiros().find(u=>norm(u.email)===norm(c.parceiro))?.nome||c.parceiro)}</dd>`:''}${c.nascimento?`<dt>Aniversário</dt><dd>${fd(c.nascimento).slice(0,5)}</dd>`:''}
      <dt>1º / último contato</dt><dd>${fd(c.primeiroContato)} · ${fd(c.ultimoContato)}</dd><dt>Cliente desde</dt><dd>${fd(c.criado)}</dd></dl>
      ${c.obs?`<div class="hint" style="margin:12px 0 0">${esc(c.obs)}</div>`:''}
      ${podeFin()?`<div class="grid g-kpi" style="grid-template-columns:1fr 1fr;margin:14px 0 0"><div class="kpi"><div class="l">Recebido</div><div class="v" style="font-size:16px;color:var(--green)">${brl(pago)}</div></div><div class="kpi"><div class="l">Em aberto</div><div class="v" style="font-size:16px;color:var(--amber)">${brl(aberto)}</div></div></div>`:''}
    </div>
    <div class="card"><div class="tabs">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'active':''}" data-act="tabCli" data-id="${k}">${l}</button>`).join('')}</div>${body}</div>
  </div>`;
};

/* ---------- Registro histórico (mesmas colunas da planilha CRM) ---------- */
function linhasRegistro(){
  const f=ui.f.reg||(ui.f.reg={q:'',tipo:'',produto:'',origem:''});
  const rows=[];
  const somaCat=(cid,cat)=>sumBy(db.lancamentos.filter(l=>l.tipo==='receita'&&l.pago&&l.clienteId===cid&&l.categoria===cat),l=>l.valor);
  if(f.tipo!=='clientes')db.leads.filter(l=>!l.convertido).forEach(l=>rows.push({_t:'lead',_id:l.id,nome:l.nome,email:l.email,tel:l.tel,origem:l.origem,produto:l.produto||l.area,primeiro:l.primeiroContato||l.criado,ultimo:l.ultimoContato,proposta:l.proposta,status:l.etapa,
    idade:idadeDe(l),sexo:l.sexo,uf:l.uf,cidade:l.cidade,profissao:l.profissao,renda:l.renda}));
  if(f.tipo!=='atendimentos')db.clientes.forEach(c=>{
    const base={_t:'cliente',_id:c.id,nome:c.nome,email:c.email,tel:c.tel,origem:c.origem,produto:c.produto,primeiro:c.primeiroContato,ultimo:c.ultimoContato,status:c.status==='Ativo'?'Fechado':'Cliente inativo',
      idade:idadeDe(c),sexo:c.sexo,uf:c.uf,cidade:c.cidade,profissao:c.profissao,renda:c.renda};
    const ks=db.contratos.filter(k=>k.clienteId===c.id);
    if(!ks.length){rows.push({...base,recebido:recebidoCliente(c.id),sucumbencia:somaCat(c.id,'Sucumbência')});return;}
    ks.forEach(k=>rows.push({...base,_ctr:k.id,produto:k.produto||c.produto,proposta:k.proposta,dataContrato:k.data,custos:+k.custos||0,custosDesc:k.custosDesc,ambito:k.ambito,cac:+k.cac||0,custoTotal:(+k.custos||0)+(+k.cac||0),
      hoInicial:k.valorTotal,entrada:k.entrada,valorParcela:valorParcela(k),parcelas:k.parcelas,hoAcordo:+k.hoAcordo||(ks.length===1?somaCat(c.id,'H.O. finais — acordo'):0),
      hoExito:+k.hoExito||(ks.length===1?somaCat(c.id,'H.O. finais — êxito'):0),sucumbencia:+k.sucumbencia||(ks.length===1?somaCat(c.id,'Sucumbência'):0),recebido:ks.length===1?Math.max(recebidoCliente(c.id),+k.recebidoImportado||0):recebidoContrato(k)}));
  });
  const q=norm(f.q);
  return rows.filter(r=>(!f.produto||r.produto===f.produto)&&(!f.origem||r.origem===f.origem)&&(!q||norm(r.nome+' '+r.email+' '+r.tel+' '+r.cidade).includes(q)))
    .sort((a,b)=>String(b.primeiro||'').localeCompare(String(a.primeiro||'')));
}
const COLS_REG=[['nome','Nome'],['email','E-mail'],['tel','WhatsApp'],['origem','Origem'],['produto','Produto'],['primeiro','Primeiro contato','d'],['ultimo','Último contato','d'],['proposta','Proposta','w'],['status','Status'],
  ['idade','Idade'],['sexo','Sexo'],['uf','Estado'],['cidade','Cidade'],['profissao','Profissão'],['renda','Faixa de renda','$'],['dataContrato','Data do contrato','d'],['custos','Custos do caso','$'],['ambito','Âmbito'],
  ['cac','CAC','$'],['custoTotal','Custo total (caso + CAC)','$'],['hoInicial','H.O. inicial (previsto)','$'],['entrada','Valor de entrada','$'],['valorParcela','Valor da parcela','$'],['parcelas','Qtd. de parcelas'],
  ['hoAcordo','H.O. final (acordo)','$'],['hoExito','H.O. final (êxito)','$'],['sucumbencia','Sucumbência','$'],['recebido','Valor total recebido','$']];
V.registro=()=>{
  const f=ui.f.reg||(ui.f.reg={q:'',tipo:'',produto:'',origem:''});
  const rows=linhasRegistro();const fin=podeFin();
  const cols=COLS_REG.filter(c=>fin||!['custos','cac','custoTotal','hoInicial','entrada','valorParcela','parcelas','hoAcordo','hoExito','sucumbencia','recebido'].includes(c[0]));
  const cel=(r,[k,,t])=>{const v=r[k];if(v==null||v===''||(t==='$'&&!v))return '<td class="muted">—</td>';if(t==='d')return `<td>${fd(v)}</td>`;if(t==='$')return `<td class="num">${brl(v)}</td>`;if(k==='status')return `<td>${pEtapa(v)}</td>`;return `<td${t==='w'?' class="wrap small"':''}>${esc(v)}</td>`;};
  return `<div class="toolbar"><input data-f="reg.q" value="${esc(f.q)}" placeholder="Buscar nome, e-mail, telefone…" style="min-width:220px">
    <select data-f="reg.tipo"><option value="">Atendimentos e clientes</option><option value="atendimentos"${f.tipo==='atendimentos'?' selected':''}>Só atendimentos</option><option value="clientes"${f.tipo==='clientes'?' selected':''}>Só clientes</option></select>
    <select data-f="reg.produto"><option value="">Todos os produtos</option>${db.produtos.map(p=>`<option${f.produto===p?' selected':''}>${esc(p)}</option>`).join('')}</select>
    <select data-f="reg.origem"><option value="">Todas as origens</option>${[...new Set(ORIGENS.concat(db.clientes.map(c=>c.origem),db.leads.map(l=>l.origem)).filter(Boolean))].map(o=>`<option${f.origem===o?' selected':''}>${esc(o)}</option>`).join('')}</select>
    <span class="grow"></span><button class="btn btn-ghost" data-act="xlsReg">Exportar Excel</button><button class="btn btn-gold" data-act="novoLead">+ Atendimento</button></div>
  <div class="hint">Mesmas colunas da planilha <b>CRM interno</b>. Cada contrato aparece em uma linha. Clique na linha para editar; os valores recebidos vêm do financeiro.</div>
  <div class="card tbl"><table class="wide sticky1"><thead><tr>${cols.map(c=>`<th${c[2]==='$'?' class="num"':''}>${c[1]}</th>`).join('')}</tr></thead><tbody>
  ${rows.map(r=>`<tr data-act="${r._t==='lead'?'editLead':r._ctr?'editCtr':'editCli'}" data-id="${r._ctr||r._id}">${cols.map(c=>c[0]==='nome'?`<td class="strong">${esc(r.nome)}<div class="small muted">${r._t==='lead'?'Atendimento':'Cliente'}</div></td>`:cel(r,c)).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}" class="empty">Nenhum registro</td></tr>`}
  </tbody></table></div>`;
};

V.atendimentos=()=>{
  const f=ui.f.crm||(ui.f.crm={produto:''});
  const ls=db.leads.filter(l=>!f.produto||(l.produto||l.area)===f.produto);const ativos=ls.filter(l=>!['Fechado','Perdido','Encaminhado a parceiro'].includes(l.etapa));
  const fech=ls.filter(l=>l.etapa==='Fechado').length,perd=ls.filter(l=>l.etapa==='Perdido').length;
  const orig={};ls.forEach(l=>orig[l.origem||'—']=(orig[l.origem||'—']||0)+1);
  return `<div class="grid g-kpi">${kpi('Atendimentos em aberto',ativos.length,ls.filter(l=>l.etapa==='Em recuperação').length+' em recuperação')}${kpi('Valor em negociação',brl(sumBy(ativos,l=>l.valor)))}${kpi('Taxa de conversão',(fech+perd?Math.round(fech/(fech+perd)*100):0)+'%',fech+' fechados · '+perd+' perdidos')}${kpi('Principal origem',Object.entries(orig).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—')}</div>
  <div class="toolbar"><select data-f="crm.produto"><option value="">Todos os produtos</option>${db.produtos.map(p=>`<option${f.produto===p?' selected':''}>${esc(p)}</option>`).join('')}</select><span class="hint" style="margin:0">Funil de novos casos: do primeiro contato ao contrato assinado. Arraste para mudar de etapa.</span><span class="grow"></span><a class="btn btn-ghost" href="#registro" style="text-decoration:none">Registro histórico</a><button class="btn btn-gold" data-act="novoLead">+ Atendimento</button></div>
  ${kanban(ETAPAS.map(e=>[e,e]),ls.map(l=>({...l,_col:l.etapa})),'lead',l=>`<div class="t" data-act="editLead" data-id="${l.id}" style="cursor:pointer">${esc(l.nome)}</div>
    <div class="meta">${(l.produto||l.area)?pill(l.produto||l.area,'p-blue'):''}<span>${esc(l.origem||'')}</span>${l.valor?'<span>· '+brl(l.valor)+'</span>':''}</div>
    <div class="small muted" style="margin-top:3px">1º contato ${fd(l.primeiroContato||l.criado)}${l.ultimoContato?' · último '+fd(l.ultimoContato):''}</div>
    ${l.obs?`<div class="small muted" style="margin-top:4px">${esc(l.obs)}</div>`:''}
    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${l.tel?`<a class="small" target="_blank" rel="noopener" href="${waLink(l.tel)}">WhatsApp</a>`:''}${l.etapa==='Fechado'&&!l.convertido?`<button class="btn btn-brand btn-sm" data-act="converter" data-id="${l.id}">Converter em cliente</button>`:''}${l.convertido?'<span class="small" style="color:var(--green)">✓ convertido</span>':''}</div>`)}`;
};

/* ---------- FINANCEIRO ---------- */
V.financeiro=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.fin||(ui.f.fin={tipo:'',status:'',mes:today().slice(0,7),q:''});
  const L=db.lancamentos;
  const rec=L.filter(l=>l.tipo==='receita'&&!l.pago),desp=L.filter(l=>l.tipo==='despesa'&&!l.pago);
  const atras=rec.filter(l=>diff(l.venc)<0);
  const prox30=d=>diff(d)>=0&&diff(d)<=30;
  const q=norm(f.q);
  const list=filtroFin().sort((a,b)=>a.venc.localeCompare(b.venc));
  const tR=sumBy(list.filter(l=>l.tipo==='receita'),l=>l.valor),tD=sumBy(list.filter(l=>l.tipo==='despesa'),l=>l.valor);
  return `<div class="grid g-kpi">
    ${kpi('A receber (crédito em carteira)',brl(sumBy(rec,l=>l.valor)),brl(sumBy(rec.filter(l=>prox30(l.venc)),l=>l.valor))+' nos próximos 30 dias')}
    ${kpi('Em atraso',brl(sumBy(atras,l=>l.valor)),atras.length+' lançamento(s)',atras.length?'bad':'good')}
    ${kpi('A pagar',brl(sumBy(desp,l=>l.valor)),brl(sumBy(desp.filter(l=>prox30(l.venc)),l=>l.valor))+' nos próximos 30 dias')}
  </div>
  <div class="toolbar">
    <input data-f="fin.q" value="${esc(f.q)}" placeholder="Buscar descrição, cliente…" style="min-width:200px">
    <select data-f="fin.tipo"><option value="">Receitas e despesas</option><option value="receita"${f.tipo==='receita'?' selected':''}>Receitas (entradas)</option><option value="despesa"${f.tipo==='despesa'?' selected':''}>Despesas (saídas)</option></select>
    <select data-f="fin.status"><option value="">Todos os status</option>${['Em aberto','Atrasado','Pago'].map(s=>`<option${f.status===s?' selected':''}>${s}</option>`).join('')}</select>
    ${mesSel('fin',f.mes)}<button class="btn btn-ghost btn-sm" data-act="finTodos">Todos os meses</button>
    <span class="grow"></span>
    <button class="btn btn-ghost" data-act="xlsFin">Exportar Excel</button>
    <button class="btn btn-ghost" data-act="novaDesp">+ Despesa</button><button class="btn btn-ghost" data-act="novaRec">+ Receita</button><button class="btn btn-gold" data-act="novoCtr">Novo contrato</button></div>
  <div class="card"><h3>Lançamentos ${f.mes?'— '+mLong(f.mes):'— todos os meses'}<small>Receitas ${brl(tR)} · Despesas ${brl(tD)} · Saldo <b style="color:${tR-tD>=0?'var(--green)':'var(--red)'}">${brl(tR-tD)}</b></small></h3>${lancTable(list)}</div>`;
};
function filtroFin(){const f=ui.f.fin;const q=norm(f.q);return db.lancamentos.filter(l=>(!f.tipo||l.tipo===f.tipo)&&(!f.status||lancStatus(l)===f.status)&&(!f.mes||l.venc.startsWith(f.mes))&&(!q||norm(l.descricao+' '+nomeCli(l.clienteId)+' '+l.categoria+' '+(l.obs||'')).includes(q)));}

V.fixas=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.fixas||(ui.f.fixas={mes:today().slice(0,7)});const ym=f.mes,ini=ym+'-01',fim=fimMes(ym);
  const fixas=db.despesasFixas.slice().sort((a,b)=>(a.dia||0)-(b.dia||0));
  let tPrev=0,tReal=0;
  const linhas=fixas.map(x=>{const l=db.lancamentos.find(l=>l.fixaId===x.id&&l.venc>=ini&&l.venc<=fim);if(x.ativo)tPrev+=+x.previsto||0;
    const real=l&&l.pago?l.valor:null;if(real!=null)tReal+=real;const dif=real!=null?real-(+x.previsto||0):null;
    return `<tr><td data-act="editFixa" data-id="${x.id}" style="cursor:pointer"><div class="strong">${esc(x.descricao)}</div><div class="small muted">${esc(x.categoria)}${x.produto?' · '+esc(x.produto):''}${x.ativo?'':' · inativa'}</div></td><td class="num">${x.dia||'—'}</td>
      <td class="num">${brl(x.previsto)}</td><td class="num">${real!=null?brl(real):'—'}</td><td class="num ${dif>0?'c-bad':dif<0?'c-ok':''}">${dif!=null?(dif>0?'+':'')+brl(dif):'—'}</td>
      <td>${l?pStatusLanc(lancStatus(l)):pill('Não lançada','p-gray')}</td>
      <td class="num">${!l&&x.ativo?`<button class="btn btn-ghost btn-sm" data-act="lancarFixa" data-id="${x.id}">Lançar</button>`:l&&!l.pago?`<button class="btn btn-ghost btn-sm" data-act="pagarReal" data-id="${l.id}">Pagar</button>`:l?`<button class="btn btn-ghost btn-sm" data-act="editLanc" data-id="${l.id}">Ver</button>`:''}</td></tr>`;}).join('');
  const variaveis=db.lancamentos.filter(l=>l.tipo==='despesa'&&!l.fixaId&&l.venc>=ini&&l.venc<=fim&&l.categoria!==LUCROS);
  const faltam=fixas.filter(x=>x.ativo&&!db.lancamentos.some(l=>l.fixaId===x.id&&l.venc>=ini&&l.venc<=fim)).length;
  return `<div class="toolbar">${mesSel('fixas',ym)}<span class="grow"></span>${faltam?`<button class="btn btn-brand" data-act="lancarFixas">Lançar ${faltam} despesa(s) fixa(s) de ${mLabel(ym)}</button>`:''}<button class="btn btn-gold" data-act="novaFixa">+ Despesa fixa</button></div>
  <div class="grid g-kpi">${kpi('Previsto no mês',brl(tPrev))}${kpi('Real (pago)',brl(tReal),tPrev?num(tReal/tPrev*100,0)+'% do previsto':'')}${kpi('Despesas variáveis',brl(sumBy(variaveis,l=>l.valor)),variaveis.length+' lançamento(s)')}</div>
  <div class="hint">Igual à aba <b>Despesas fixas</b> da planilha: valor previsto × valor real. Cadastre cada despesa uma vez; todo mês clique em <b>Lançar</b> e, ao pagar, informe o valor real.</div>
  <div class="card tbl"><table><thead><tr><th>Descrição</th><th class="num">Dia</th><th class="num">Valor previsto</th><th class="num">Valor real</th><th class="num">Diferença</th><th>Status</th><th></th></tr></thead><tbody>
    ${linhas||'<tr><td colspan="7" class="empty">Nenhuma despesa fixa cadastrada</td></tr>'}
    <tr class="tot"><td>Total</td><td></td><td class="num">${brl(tPrev)}</td><td class="num">${brl(tReal)}</td><td class="num">${brl(tReal-tPrev)}</td><td></td><td></td></tr></tbody></table></div>
  ${variaveis.length?`<div class="card" style="margin-top:14px"><h3>Despesas variáveis de ${mLabel(ym)}</h3>${lancTable(variaveis.sort((a,b)=>a.venc.localeCompare(b.venc)),false)}</div>`:''}`;
};

V.fluxo=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.fluxo||(ui.f.fluxo={mes:today().slice(0,7)});const ym=f.mes,ini=ym+'-01',fim=fimMes(ym);
  const ent=receitasPagas(ini,fim).sort((a,b)=>dataCaixa(a).localeCompare(dataCaixa(b)));
  const sai=despesasPagas(ini,fim,l=>l.categoria!==LUCROS).sort((a,b)=>dataCaixa(a).localeCompare(dataCaixa(b)));
  const luc=despesasPagas(ini,fim,l=>l.categoria===LUCROS);
  const tE=sumBy(ent,l=>l.valor),tS=sumBy(sai,l=>l.valor),tL=sumBy(luc,l=>l.valor),ant=saldoAntes(ini),saldo=ant+tE-tS;
  const origem=l=>{const p=proc(l.processoId);return [l.clienteId?nomeCli(l.clienteId):'',p?(p.numero+(p.parteContraria?' x '+p.parteContraria:'')):''].filter(Boolean).join(' · ')||'—';};
  const tab=(arr,isE)=>arr.length?`<div class="tbl"><table><thead><tr><th>Data</th><th class="num">Valor</th><th>Descrição</th>${isE?'<th class="hide-m">Origem</th>':''}</tr></thead><tbody>${arr.map(l=>`<tr data-act="editLanc" data-id="${l.id}"><td>${fd(dataCaixa(l))}</td><td class="num strong" style="color:${isE?'var(--green)':'var(--red)'}">${brl(l.valor)}</td><td>${esc(l.categoria)}<div class="small muted">${esc(l.descricao)}</div></td>${isE?`<td class="hide-m small">${esc(origem(l))}</td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum lançamento pago</div>';
  const semIni=!db.escritorio.saldoInicialData&&!+db.escritorio.saldoInicial;
  return `<div class="toolbar">${mesSel('fluxo',ym)}<span class="grow"></span><button class="btn btn-ghost" data-act="xlsFluxo">Exportar Excel</button><button class="btn btn-ghost" data-act="novaLucro">+ Distribuição de lucros</button><button class="btn btn-ghost" data-act="novaDesp">+ Saída</button><button class="btn btn-gold" data-act="novaRec">+ Entrada</button></div>
  ${semIni?'<div class="nota">Informe o <b>saldo inicial do caixa</b> em <a href="#config">Configurações</a> para o saldo anterior ("herança") ficar correto.</div>':''}
  <div class="grid g-kpi">
    ${kpi('Saldo do mês anterior',brl(ant),'"herança" recebida')}${kpi('Total de entradas',brl(tE),ent.length+' recebimento(s)','good')}${kpi('Total de saídas',brl(tS),sai.length+' pagamento(s)','bad')}
    ${kpi('Saldo do mês',brl(saldo),'anterior + entradas − saídas',saldo>=0?'good':'bad')}${kpi('Distribuição de lucros',brl(tL))}${kpi('Saldo transportado',brl(saldo-tL),'"herança" para o próximo mês',saldo-tL>=0?'good':'bad')}
  </div>
  <div class="grid g-2"><div class="card"><h3>Entradas — ${mLong(ym)} <small>${brl(tE)}</small></h3>${tab(ent,true)}</div><div class="card"><h3>Saídas — ${mLong(ym)} <small>${brl(tS)}</small></h3>${tab(sai,false)}</div></div>
  <div class="card"><h3>Evolução — últimos 6 meses</h3>${fluxo6()}</div>`;
};

function avaliarMetas(list){
  const n=list.length,m=db.metas;const avg=f=>n?sumBy(list,f)/n:0;
  return [['Quantidade de contratos no mês',m.qtd,n,'int',1],['Valor total de contratos',m.valorTotal,sumBy(list,k=>k.valorTotal),'brl',1],['Valor total de entradas',m.entradas,sumBy(list,k=>k.entrada),'brl',1],
    ['Valor médio do contrato',m.ticket,avg(k=>k.valorTotal),'brl',1],['Valor médio das entradas',m.entradaMedia,avg(k=>k.entrada),'brl',1],
    ['Quantidade média de parcelas',m.parcelasMedia,avg(k=>k.parcelas),'dec',-1],['Valor médio das parcelas',m.parcelaMedia,avg(valorParcela),'brl',1]];
}
V.contratos=()=>{
  if(!podeFin())return semPermissao();
  const f=ui.f.ctr||(ui.f.ctr={mes:today().slice(0,7)});const ym=f.mes,ini=ym+'-01',fim=fimMes(ym);
  const list=db.contratos.filter(k=>k.data>=ini&&k.data<=fim).sort((a,b)=>a.data.localeCompare(b.data));
  const n=list.length;const fmt=(v,t)=>t==='brl'?brl(v):num(v,t==='dec'?1:0);
  const metas=avaliarMetas(list);
  const ano=ym.slice(0,4);const mesesAno=Array.from({length:12},(_,i)=>ano+'-'+String(i+1).padStart(2,'0'));
  return `<div class="toolbar">${mesSel('ctr',ym)}<span class="grow"></span><button class="btn btn-ghost" data-act="editMetas">Editar metas</button><button class="btn btn-ghost" data-act="xlsCtr">Exportar Excel</button><button class="btn btn-gold" data-act="novoCtr">+ Contrato</button></div>
  <div class="grid g-2">
    <div class="card"><h3>Contratos de ${mLong(ym)} <small>${n} contrato(s)</small></h3>
      ${n?`<div class="tbl"><table><thead><tr><th>#</th><th>Cliente</th><th class="num">Valor do contrato</th><th class="num">Entrada</th><th class="num">Parcelas</th><th class="num">Valor da parcela</th></tr></thead><tbody>
      ${list.map((k,i)=>`<tr data-act="editCtr" data-id="${k.id}"><td>${i+1}</td><td class="strong">${esc(nomeCli(k.clienteId))}<div class="small muted">${esc(k.produto)} · ${fd(k.data)}</div></td><td class="num">${brl(k.valorTotal)}</td><td class="num">${brl(k.entrada)}</td><td class="num">${num(k.parcelas,0)}</td><td class="num">${brl(valorParcela(k))}</td></tr>`).join('')}
      <tr class="tot"><td></td><td>Total</td><td class="num">${brl(sumBy(list,k=>k.valorTotal))}</td><td class="num">${brl(sumBy(list,k=>k.entrada))}</td><td class="num">${num(sumBy(list,k=>k.parcelas),0)}</td><td class="num">${brl(sumBy(list,valorParcela))}</td></tr>
      <tr><td></td><td class="muted">Média</td><td class="num">${brl(sumBy(list,k=>k.valorTotal)/n)}</td><td class="num">${brl(sumBy(list,k=>k.entrada)/n)}</td><td class="num">${num(sumBy(list,k=>k.parcelas)/n)}</td><td class="num">${brl(sumBy(list,valorParcela)/n)}</td></tr></tbody></table></div>`:'<div class="empty">Nenhum contrato neste mês</div>'}</div>
    <div class="card"><h3>Metas do mês</h3><div class="tbl"><table><thead><tr><th></th><th class="num">Meta</th><th class="num">Resultado</th><th>Status</th></tr></thead><tbody>
      ${metas.map(([l,meta,res,t,dir])=>{const ok=n?(dir>0?res>=meta:res<=meta):null;return `<tr><td>${l}</td><td class="num">${fmt(meta,t)}</td><td class="num strong">${n?fmt(res,t):'—'}</td><td>${ok==null?pill('Sem contratos','p-gray'):ok?pill('Batida','p-green'):pill('Não batida','p-red')}</td></tr>`;}).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:8px">Em "quantidade média de parcelas", a meta é um teto: quanto menos parcelas, melhor.</div></div>
  </div>
  <div class="card"><h3>Resumo de ${ano}</h3><div class="tbl"><table class="wide"><thead><tr><th>Mês</th><th class="num">Contratos</th><th class="num">Valor total</th><th class="num">Entradas</th><th class="num">Ticket médio</th><th>Meta de quantidade</th><th>Meta de valor</th></tr></thead><tbody>
    ${mesesAno.map(m=>{const ks=db.contratos.filter(k=>k.data.startsWith(m));const v=sumBy(ks,k=>k.valorTotal);const fut=m>today().slice(0,7);
      return `<tr data-act="ctrMes" data-id="${m}" style="cursor:pointer"><td class="${m===ym?'strong':''}">${MESES_L[+m.slice(5)-1]}</td><td class="num">${ks.length}</td><td class="num">${brl(v)}</td><td class="num">${brl(sumBy(ks,k=>k.entrada))}</td><td class="num">${ks.length?brl(v/ks.length):'—'}</td>
      <td>${fut?'<span class="muted">—</span>':ks.length>=db.metas.qtd?pill('Batida','p-green'):pill('Não batida','p-red')}</td><td>${fut?'<span class="muted">—</span>':v>=db.metas.valorTotal?pill('Batida','p-green'):pill('Não batida','p-red')}</td></tr>`;}).join('')}
  </tbody></table></div></div>`;
};

/* ---------- Indicadores mensais (planilha "Questionário Geral") ---------- */
function indicadores(produto){
  const okP=p=>!produto||p===produto;
  const C=()=>db.clientes.filter(c=>okP(c.produto));
  const K=(x)=>db.contratos.filter(k=>k.data>=x.ini&&k.data<=x.fim&&okP(k.produto||cli(k.clienteId)?.produto));
  const RP=(x,f)=>receitasPagas(x.ini,x.fim,l=>okP(prodLanc(l))&&(!f||f(l)));
  const DP=(x,cats)=>despesasPagas(x.ini,x.fim,l=>(!produto||prodLanc(l)===produto)&&(!cats||cats.includes(l.categoria)));
  const cat=(...cs)=>x=>sumBy(DP(x,cs),l=>l.valor);
  const atend=x=>db.leads.filter(l=>okP(l.produto||l.area)&&(l.primeiroContato||l.criado)>=x.ini&&(l.primeiroContato||l.criado)<=x.fim).map(l=>l.origem)
    .concat(C().filter(c=>!c.leadId&&c.primeiroContato>=x.ini&&c.primeiroContato<=x.fim).map(c=>c.origem));
  const fech=(x,fn)=>K(x).filter(k=>fn(cli(k.clienteId)?.origem)).length;
  const novos=x=>C().filter(c=>c.criado>=x.ini&&c.criado<=x.fim);
  const avg=(arr,f)=>arr.length?sumBy(arr,f)/arr.length:null;
  const formaV=(x,re)=>sumBy(K(x).filter(k=>re.test(k.forma||'')),k=>k.valorTotal);
  // [seção] ou [rótulo, função(ctx), formato, agregação]  — agregação: f=fluxo (soma) · s=estoque (média) · a=média (calcula no ano) · t=texto
  return [
    ['Métricas de base'],
    ['Crédito em carteira (a receber)',x=>sumBy(db.lancamentos.filter(l=>l.tipo==='receita'&&okP(prodLanc(l))&&(l.criado||l.venc)<=x.fim&&!(l.pago&&dataCaixa(l)<=x.fim)),l=>l.valor),'brl','s'],
    ['Valor efetivamente faturado',x=>sumBy(RP(x),l=>l.valor),'brl','f'],
    ['Total de saídas',x=>sumBy(DP(x).filter(l=>l.categoria!==LUCROS),l=>l.valor),'brl','f'],
    ['Número de clientes na carteira',x=>C().filter(c=>(c.criado||'')<=x.fim).length,'int','s'],
    ['Casos ativos (atos e processos)',x=>db.processos.filter(p=>okP(cli(p.clienteId)?.produto)&&p.status==='Em andamento'&&(p.distribuicao||'')<=x.fim).length,'int','s'],
    ['Estados em que atuamos',x=>new Set(C().filter(c=>(c.criado||'')<=x.fim&&c.uf).map(c=>c.uf)).size,'int','s'],
    ['Processos novos ajuizados',x=>db.processos.filter(p=>okP(cli(p.clienteId)?.produto)&&p.tipo==='Judicial'&&p.distribuicao>=x.ini&&p.distribuicao<=x.fim).length,'int','f'],
    ['Acordos realizados',x=>RP(x,l=>l.categoria==='H.O. finais — acordo').length,'int','f'],
    ['Honorários com parceria (execução delegada)',x=>sumBy(RP(x,l=>/parceria/i.test(l.categoria)),l=>l.valor),'brl','f'],
    ['Taxas'],
    ['Taxa de inadimplência',x=>{const lim=x.fim<today()?x.fim:addDays(-1);const prev=db.lancamentos.filter(l=>l.tipo==='receita'&&okP(prodLanc(l))&&l.venc>=x.ini&&l.venc<=lim);const t=sumBy(prev,l=>l.valor);
      return t?sumBy(prev.filter(l=>!(l.pago&&dataCaixa(l)<=x.fim)),l=>l.valor)/t*100:null;},'pct','a'],
    ['Crédito recuperado (atrasados recebidos)',x=>sumBy(RP(x,l=>l.venc<x.ini),l=>l.valor),'brl','f'],
    ['Investimento'],
    ['Equipamentos',cat('Equipamentos'),'brl','f'],['Capacitação (cursos, livros, consultoria)',cat('Capacitação'),'brl','f'],
    ['Prospecção (tráfego + agência + indicações)',cat('Tráfego — Google','Tráfego — Facebook/Instagram','Agência / marketing','Indicações pagas'),'brl','f'],
    ['Tráfego total',cat('Tráfego — Google','Tráfego — Facebook/Instagram'),'brl','f'],['Tráfego Facebook/Instagram',cat('Tráfego — Facebook/Instagram'),'brl','f'],['Tráfego Google',cat('Tráfego — Google'),'brl','f'],
    ['Indicações pagas',cat('Indicações pagas'),'brl','f'],
    ['Métricas de vendas'],
    ['Conversões (contratos fechados)',x=>K(x).length,'int','f'],['Conversões — Facebook/Instagram',x=>fech(x,ehFace),'int','f'],['Conversões — Google',x=>fech(x,ehGoogle),'int','f'],
    ['Atendimentos (total)',x=>atend(x).length,'int','f'],['Atendimentos — Facebook/Instagram',x=>atend(x).filter(ehFace).length,'int','f'],['Atendimentos — Google',x=>atend(x).filter(ehGoogle).length,'int','f'],
    ['Atendimentos — outras fontes',x=>atend(x).filter(o=>!ehFace(o)&&!ehGoogle(o)).length,'int','f'],
    ['Taxa de conversão (contratos ÷ atendimentos do mês)',x=>{const a=atend(x).length;return a?K(x).length/a*100:null;},'pct','a'],
    ['Fechamentos — indicação de parceiros',x=>fech(x,ehParc),'int','f'],
    ['Clientes indicados a parceiros (enviados)',x=>db.leads.filter(l=>okP(l.produto||l.area)&&l.etapa==='Encaminhado a parceiro'&&(l.ultimoContato||l.criado)>=x.ini&&(l.ultimoContato||l.criado)<=x.fim).length,'int','f'],
    ['Indicados por parceiros (recebidos)',x=>atend(x).filter(ehParc).length,'int','f'],['Indicados por clientes (recebidos)',x=>atend(x).filter(ehIndCli).length,'int','f'],
    ['Vendas no boleto',x=>formaV(x,/boleto/i),'brl','f'],['Vendas no cartão',x=>formaV(x,/cart/i),'brl','f'],['Vendas no PIX',x=>formaV(x,/pix/i),'brl','f'],['Vendas na recorrência',x=>formaV(x,/recorr/i),'brl','f'],
    ['Custos'],
    ['Taxa de cartão',cat('Taxa de cartão'),'brl','f'],['Taxa de boleto',cat('Taxa de boleto'),'brl','f'],['Tarifas bancárias',cat('Tarifas bancárias'),'brl','f'],['Aluguel',cat('Aluguel'),'brl','f'],
    ['Custo de aquisição de clientes (CAC total)',x=>sumBy(K(x),k=>k.cac),'brl','f'],['CAC médio por contrato',x=>{const ks=K(x);return ks.length?sumBy(ks,k=>k.cac)/ks.length:null;},'brl','a'],
    ['Copa',cat('Copa'),'brl','f'],['Folha de pagamento e pró-labore',cat('Folha de pagamento','Pró-labore'),'brl','f'],['Impostos',cat('Impostos'),'brl','f'],
    ['Telefonia / internet',cat('Telefonia / internet'),'brl','f'],['Sistemas',cat('Sistemas'),'brl','f'],['Energia elétrica',cat('Energia elétrica'),'brl','f'],['Manutenção (limpeza e consertos)',cat('Manutenção / extraordinárias'),'brl','f'],
    ['Tickets médios'],
    ['Ticket médio de contratos',x=>avg(K(x),k=>k.valorTotal),'brl','a'],['Ticket médio de entradas',x=>avg(K(x),k=>k.entrada),'brl','a'],['Quantidade média de parcelas',x=>avg(K(x),k=>k.parcelas),'dec','a'],
    ['Ticket médio de sucumbências',x=>avg(RP(x,l=>l.categoria==='Sucumbência'),l=>l.valor),'brl','a'],['Ticket médio de acordos',x=>avg(RP(x,l=>l.categoria==='H.O. finais — acordo'),l=>l.valor),'brl','a'],
    ['Ticket médio de TMP',x=>avg(RP(x,l=>l.categoria==='TMP'),l=>l.valor),'brl','a'],
    ['Estatísticas dos novos clientes'],
    ['Estado com mais novos clientes',x=>moda(novos(x).map(c=>c.uf)),'txt','t'],['Cidade com mais novos clientes',x=>moda(novos(x).map(c=>c.cidade)),'txt','t'],
    ...FAIXAS.map(([a,b,l])=>['Novos clientes — '+l,x=>novos(x).filter(c=>{const i=idadeDe(c);return i!=null&&i>=a&&i<=b;}).length,'int','f']),
    ['Profissão mais frequente',x=>moda(novos(x).map(c=>c.profissao)),'txt','t'],['Faixa de renda média',x=>avg(novos(x).filter(c=>+c.renda),c=>c.renda),'brl','a'],
    ['Sexo preponderante',x=>moda(novos(x).map(c=>c.sexo)),'txt','t'],
  ];
}
V.relatorios=()=>{
  if(!podeFin())return semPermissao();
  const y=String(new Date().getFullYear()),ini=y+'-01-01',fim=y+'-12-31';
  const rp=receitasPagas(ini,fim),dp=despesasPagas(ini,fim,l=>l.categoria!==LUCROS),lucros=sumBy(despesasPagas(ini,fim,l=>l.categoria===LUCROS),l=>l.valor);
  const sum=(arr,key)=>{const o={};arr.forEach(l=>o[key(l)]=(o[key(l)]||0)+l.valor);return Object.entries(o).sort((a,b)=>b[1]-a[1]);};
  const recCat=sum(rp,l=>l.categoria),despCat=sum(dp,l=>l.categoria);
  const tR=sumBy(rp,l=>l.valor),tD=sumBy(dp,l=>l.valor);
  const recArea=sum(rp,areaLanc),recProd=sum(rp,l=>prodLanc(l)||'Sem produto');
  const pArea={};db.processos.filter(p=>p.status==='Em andamento').forEach(p=>pArea[p.area]=(pArea[p.area]||0)+1);
  const resultados={};db.processos.filter(p=>p.status!=='Em andamento').forEach(p=>resultados[p.status]=(resultados[p.status]||0)+1);
  const origem={};db.clientes.forEach(c=>origem[c.origem||'—']=(origem[c.origem||'—']||0)+1);
  const prod=db.usuarios.map(u=>({u,proc:db.processos.filter(p=>p.responsavelId===u.id&&p.status==='Em andamento').length,
    tdone:db.tarefas.filter(t=>t.responsavelId===u.id&&t.status==='done').length,topen:db.tarefas.filter(t=>t.responsavelId===u.id&&t.status!=='done').length,
    ev:db.eventos.filter(e=>e.responsavelId===u.id&&!e.feito).length,venc:db.eventos.filter(e=>e.responsavelId===u.id&&!e.feito&&diff(e.data)<0).length}));
  const nCli=new Set(rp.filter(l=>l.clienteId).map(l=>l.clienteId)).size;
  return `<div class="grid g-kpi">${kpi('Receita '+y,brl(tR))}${kpi('Despesa '+y,brl(tD))}${kpi('Resultado '+y,brl(tR-tD),tR?'margem '+Math.round((tR-tD)/tR*100)+'%':'',tR-tD>=0?'good':'bad')}${kpi('Ticket médio por cliente',brl(nCli?tR/nCli:0))}</div>
  <div class="grid g-2">
    <div class="card"><h3>DRE simplificado ${y} <small>regime de caixa</small></h3><div class="tbl"><table><tbody>
      <tr><td class="strong">Receitas</td><td class="num strong" style="color:var(--green)">${brl(tR)}</td></tr>${recCat.map(([k,v])=>`<tr><td class="small" style="padding-left:22px">${esc(k)}</td><td class="num small">${brl(v)}</td></tr>`).join('')}
      <tr><td class="strong">Despesas</td><td class="num strong" style="color:var(--red)">− ${brl(tD)}</td></tr>${despCat.map(([k,v])=>`<tr><td class="small" style="padding-left:22px">${esc(k)}</td><td class="num small">${brl(v)}</td></tr>`).join('')}
      <tr class="tot"><td>Resultado operacional</td><td class="num" style="color:${tR-tD>=0?'var(--green)':'var(--red)'}">${brl(tR-tD)}</td></tr>
      <tr><td>Distribuição de lucros</td><td class="num">− ${brl(lucros)}</td></tr><tr class="tot"><td>Saldo retido no caixa</td><td class="num">${brl(tR-tD-lucros)}</td></tr></tbody></table></div></div>
    <div class="card"><h3>Receita por produto / nicho <small>${y}</small></h3>${hbars(recProd,brlK)}
      <h3 style="margin-top:18px">Receita por área do direito</h3>${hbars(recArea,brlK)}
      <h3 style="margin-top:18px">Processos encerrados — resultado</h3>${hbars(Object.entries(resultados).map(([k,v])=>[k,v,k==='Ganho'||k==='Acordo'?'var(--green)':k==='Perdido'?'var(--red)':'var(--gray)']))}</div>
    <div class="card"><h3>Produtividade da equipe</h3><div class="tbl"><table><thead><tr><th>Membro</th><th class="num">Processos</th><th class="num">Tarefas feitas</th><th class="num">Tarefas abertas</th><th class="num">Prazos pend.</th></tr></thead><tbody>
      ${prod.map(r=>`<tr><td>${esc(r.u.nome)}<div class="small muted">${esc(r.u.papel)}</div></td><td class="num">${r.proc}</td><td class="num">${r.tdone}</td><td class="num">${r.topen}</td><td class="num">${r.ev}${r.venc?` <span class="pill p-red">${r.venc} venc.</span>`:''}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h3>Origem dos clientes</h3>${hbars(Object.entries(origem).sort((a,b)=>b[1]-a[1]))}<h3 style="margin-top:18px">Processos em andamento por área</h3>${hbars(Object.entries(pArea).sort((a,b)=>b[1]-a[1]))}<div class="toolbar" style="margin:14px 0 0"><button class="btn btn-ghost" onclick="window.print()">Imprimir relatório</button></div></div>
  </div>`;
};

