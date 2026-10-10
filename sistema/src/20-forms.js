/* =========================================================
   FORMULÁRIO GENÉRICO (modal)
   ========================================================= */
function normOpts(o){return (typeof o==='function'?o():o).map(x=>Array.isArray(x)?x:[x,x]);}
function closeModal(){$('#mbg').classList.remove('open');if(precisaRender){precisaRender=false;render();}}
function modal(title,html,buttons,wide){
  $('#m-title').textContent=title;$('#m-body').innerHTML=html;$('.modal').style.maxWidth=wide?'860px':'';
  const foot=$('#m-foot');foot.innerHTML='';
  (buttons||[{l:'Fechar',c:'btn-ghost',fn:closeModal}]).forEach(b=>{const el=document.createElement('button');el.className='btn '+b.c+(b.left?' left':'');el.textContent=b.l;el.onclick=b.fn;foot.appendChild(el);});
  $('#mbg').classList.add('open');
  const first=$('#m-body input:not([type=checkbox]),#m-body select,#m-body textarea');if(first)setTimeout(()=>first.focus(),30);
}
function form(title,fields,data,onSave,onDelete,nota){
  const html=(nota?`<div class="nota">${nota}</div>`:'')+'<div class="fgrid">'+fields.map(f=>{
    if(f.t==='sec')return `<div class="full dgroup" style="margin:8px 0 0">${esc(f.l)}</div>`;
    const v=data[f.k]??f.d??'';const id='f_'+f.k;const cls=f.full?' class="full"':'';
    let inp;
    if(f.t==='select'){let os=normOpts(f.o);if(v!==''&&!os.some(([ov])=>String(ov)===String(v)))os=[[v,v]].concat(os);
      inp=`<select id="${id}">${f.req?'':'<option value="">—</option>'}${os.map(([ov,ol])=>`<option value="${esc(ov)}"${String(ov)===String(v)?' selected':''}>${esc(ol)}</option>`).join('')}</select>`;}
    else if(f.t==='textarea')inp=`<textarea id="${id}" rows="${f.rows||3}">${esc(v)}</textarea>`;
    else if(f.t==='multi'){const sel=Array.isArray(v)?v:[];
      inp=`<div class="multi" id="${id}">${normOpts(f.o).map(([ov,ol])=>`<label class="chk"><input type="checkbox" value="${esc(ov)}"${sel.includes(ov)?' checked':''}> ${esc(ol)}</label>`).join('')}</div>`;}
    else if(f.t==='check')return `<label class="chk${f.full?' full':''}"><input type="checkbox" id="${id}"${v?' checked':''}> ${esc(f.l)}</label>`;
    else inp=`<input id="${id}" type="${f.t||'text'}" value="${esc(v)}"${f.t==='number'?' step="any" min="0"':''}${f.ph?` placeholder="${esc(f.ph)}"`:''}${f.list?` list="dl_${f.k}"`:''}>${f.list?`<datalist id="dl_${f.k}">${normOpts(f.list).map(([o])=>`<option value="${esc(o)}">`).join('')}</datalist>`:''}`;
    return `<label${cls}>${esc(f.l)}${f.req?' *':''}${inp}${f.dica?`<span class="small muted" style="font-weight:400">${f.dica}</span>`:''}</label>`;
  }).join('')+'</div>';
  const btns=[];
  if(onDelete)btns.push({l:'Excluir',c:'btn-danger',left:1,fn:async()=>{if(await confirmar('Excluir este registro? Esta ação não pode ser desfeita.','Excluir')){await onDelete();closeModal();save();render();toast('Excluído');}}});
  btns.push({l:'Cancelar',c:'btn-ghost',fn:closeModal});
  btns.push({l:'Salvar',c:'btn-brand',fn:()=>{
    const out={};let ok=true;
    fields.forEach(f=>{if(f.t==='sec')return;const el=$('#f_'+f.k);let v=f.t==='multi'?[...el.querySelectorAll('input:checked')].map(i=>i.value):f.t==='check'?el.checked:f.t==='number'?(el.value===''?(f.vazio??0):parseFloat(el.value)||0):el.value.trim();
      el.classList.remove('err');if(f.req&&(v===''||v===null||(Array.isArray(v)&&!v.length))){el.classList.add('err');ok=false;}out[f.k]=v;});
    if(!ok){toast('Preencha os campos obrigatórios',1);return;}
    if(onSave(out)===false)return;
    closeModal();save();render();toast('Salvo ✓');
  }});
  modal(title,html,btns,fields.length>14);
}
function upsert(coll,id,vals,base){
  if(id){Object.assign(db[coll].find(x=>x.id===id),vals);return id;}
  const n={criadoPor:db.usuarioAtual||'',...base,...vals,id:uid()};
  if(ehParceiro()&&!n.parceiro)n.parceiro=meuEmail();
  db[coll].push(n);return n.id;
}
const O={
  clientes:()=>db.clientes.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>[c.id,c.nome]),
  processos:()=>db.processos.map(p=>[p.id,p.numero+' — '+nomeCli(p.clienteId)]),
  usuarios:()=>db.usuarios.map(u=>[u.id,u.nome+(/parceir/i.test(u.papel)?' (parceiro)':'')]),
  produtos:()=>db.produtos,
  parceiros:()=>parceiros().map(u=>[norm(u.email),u.nome]),
  tipos:()=>db.tiposEvento.map(t=>t.nome),
};
const campoParceiro=()=>ehParceiro()?[]:[{k:'parceiro',l:'Parceria (advogado parceiro)',t:'select',o:O.parceiros,dica:'O parceiro verá apenas os casos marcados com o nome dele.'}];
function addProduto(p){p=String(p||'').trim();if(p&&!db.produtos.some(x=>norm(x)===norm(p)))db.produtos.push(p);return db.produtos.find(x=>norm(x)===norm(p))||p;}
const camposPerfil=[
  {t:'sec',l:'Perfil (para indicadores e estatísticas)'},
  {k:'nascimento',l:'Data de nascimento',t:'date'},{k:'idade',l:'Idade (se não souber a data)',t:'number',vazio:null},
  {k:'sexo',l:'Sexo',t:'select',o:SEXOS},{k:'profissao',l:'Profissão'},
  {k:'renda',l:'Faixa de renda (R$/mês)',t:'number'},{k:'uf',l:'Estado (UF)',t:'select',o:UFS},{k:'cidade',l:'Cidade',full:1},
];

/* ---------- formulários por entidade ---------- */
function editCliente(id){
  const c=id?cli(id):{tipo:'PF',status:'Ativo',primeiroContato:today(),ultimoContato:today()};
  form(id?'Editar cliente':'Novo cliente',[
    {k:'nome',l:'Nome / razão social',req:1,full:1},{k:'tipo',l:'Tipo',t:'select',o:[['PF','Pessoa física'],['PJ','Pessoa jurídica']],req:1},
    {k:'doc',l:'CPF / CNPJ'},{k:'tel',l:'Telefone / WhatsApp'},{k:'email',l:'E-mail',t:'email'},
    {k:'origem',l:'Origem (como chegou)',t:'select',o:ORIGENS},{k:'produto',l:'Produto / nicho',t:'select',o:O.produtos},
    {k:'primeiroContato',l:'Primeiro contato',t:'date'},{k:'ultimoContato',l:'Último contato',t:'date'},
    {k:'status',l:'Situação',t:'select',o:['Ativo','Inativo'],req:1},...campoParceiro(),
    ...camposPerfil,{k:'driveLink',l:'Pasta no Google Drive (cole o link da pasta)',t:'url',full:1,ph:'https://drive.google.com/drive/folders/…'},{k:'obs',l:'Observações',t:'textarea',full:1}],
    c,v=>{v.driveLink=(v.driveLink||'').trim();const fid=(v.driveLink.match(/folders\/([\w-]+)/)||v.driveLink.match(/[?&]id=([\w-]+)/)||[])[1];v.driveId=fid||(v.driveLink?'':(c.driveLink?'':c.driveId||''));
      const nid=upsert('clientes',id,v,{criado:today()});if(!id)location.hash='cliente/'+nid;},
    id&&(()=>{db.clientes=db.clientes.filter(x=>x.id!==id);if(ui.page==='cliente')location.hash='clientes';}));
}
function editProcesso(id,pre){
  const p=id?proc(id):{tipo:ui.tabProc==='Administrativo'?'Administrativo':'Judicial',status:'Em andamento',responsavelId:db.usuarioAtual,distribuicao:today(),...pre};
  if(!p.fase)p.fase=fasesDe(p.tipo)[0];
  form(id?'Editar processo':'Novo processo / requerimento',[
    {k:'clienteId',l:'Cliente',t:'select',o:O.clientes,req:1,full:1},
    {k:'tipo',l:'Tipo',t:'select',o:[['Judicial','Contencioso (judicial)'],['Administrativo','Administrativo (INSS e outros órgãos)']],req:1},
    {k:'numero',l:'Nº do processo / NB / protocolo',req:1,ph:'0000000-00.0000.0.00.0000'},
    {k:'area',l:'Área',t:'select',o:AREAS,req:1},{k:'objeto',l:'Objeto / assunto'},
    {k:'parteContraria',l:'Parte contrária'},{k:'responsavelId',l:'Responsável',t:'select',o:O.usuarios},
    {k:'fase',l:'Fase',t:'select',o:FASES,req:1,dica:'Judicial: da distribuição ao encerramento. Administrativo: do requerimento à decisão.'},{k:'status',l:'Situação',t:'select',o:STATUS_PROC,req:1},
    {k:'valorCausa',l:'Valor da causa / proveito estimado (R$)',t:'number'},{k:'distribuicao',l:'Data de distribuição / protocolo',t:'date'},
    {t:'sec',l:'Contencioso (se judicial)'},
    {k:'orgao',l:'Vara / juízo'},{k:'comarca',l:'Comarca / seção'},{k:'instancia',l:'Instância',t:'select',o:INSTANCIAS},{k:'polo',l:'Polo do cliente',t:'select',o:POLOS},
    {k:'classe',l:'Classe / rito',list:['Procedimento comum','Juizado Especial Cível','Juizado Especial Federal','Reclamação trabalhista','Execução','Mandado de segurança','Ação de alimentos']},
    {t:'sec',l:'Administrativo (se requerimento)'},
    {k:'orgaoAdm',l:'Órgão',t:'select',o:ORGAOS_ADM},{k:'protocolo',l:'Nº do protocolo / requerimento'},
    {k:'der',l:'DER — data de entrada do requerimento',t:'date'},{k:'prazoAnalise',l:'Prazo esperado de resposta',t:'date'}],
    p,v=>{if(!fasesDe(v.tipo).includes(v.fase))v.fase=fasesDe(v.tipo)[0];const nid=upsert('processos',id,v,{andamentos:[]});if(!id)location.hash='processo/'+nid;},
    id&&(()=>{db.processos=db.processos.filter(x=>x.id!==id);if(ui.page==='processo')location.hash='processos';}));
}
function editEvento(id,pre){
  const e=id?db.eventos.find(x=>x.id===id):{tipo:db.tiposEvento[0]?.nome||'Prazo',data:today(),responsavelId:db.usuarioAtual,feito:false,...pre};
  form(id?'Editar compromisso':'Novo compromisso / serviço',[
    {k:'tipo',l:'Tipo de compromisso / serviço',req:1,list:O.tipos,dica:'Escolha da lista ou digite um tipo novo — ele é adicionado automaticamente.'},{k:'titulo',l:'Descrição',req:1},
    {k:'data',l:'Data',t:'date',req:1},{k:'hora',l:'Hora',t:'time'},
    {k:'processoId',l:'Processo',t:'select',o:O.processos,full:1},
    {k:'clienteId',l:'Cliente',t:'select',o:O.clientes,full:1},
    {k:'responsaveis',l:'Responsáveis (marque uma ou mais pessoas)',t:'multi',o:O.usuarios,full:1,req:1},
    {k:'obs',l:'Observações',t:'textarea',full:1,rows:2},{k:'feito',l:'Cumprido / realizado',t:'check',full:1}],
    {...e,responsaveis:respDe(e)},v=>{v.responsavelId=v.responsaveis[0]||'';if(v.processoId&&!v.clienteId)v.clienteId=proc(v.processoId)?.clienteId||'';
      if(!db.tiposEvento.some(t=>norm(t.nome)===norm(v.tipo)))db.tiposEvento.push({nome:v.tipo,cor:corNova()});
      else v.tipo=db.tiposEvento.find(t=>norm(t.nome)===norm(v.tipo)).nome;
      if(v.feito&&!e.feito){v.feitoEm=today();v.feitoPor=db.usuarioAtual;}if(!v.feito)v.feitoEm='';
      upsert('eventos',id,v);},
    id&&(()=>{db.eventos=db.eventos.filter(x=>x.id!==id);}));
}
const corNova=()=>['#C0392B','#1E5FA8','#1A7A6E','#7B4FB0','#B26A10','#C84B6E','#2E7D4E','#0E7490','#6B6B6B'][db.tiposEvento.length%9];
const quemConclui=x=>ehResp(x,db.usuarioAtual)?db.usuarioAtual:(x.responsavelId||db.usuarioAtual);
function editTarefa(id,pre){
  const t=id?db.tarefas.find(x=>x.id===id):{status:'todo',prioridade:'Média',prazo:addDays(2),responsavelId:db.usuarioAtual,...pre};
  form(id?'Editar tarefa':'Nova tarefa',[
    {k:'titulo',l:'Tarefa',req:1,full:1},{k:'status',l:'Status',t:'select',o:TSTATUS,req:1},{k:'prioridade',l:'Prioridade',t:'select',o:PRIOR,req:1},
    {k:'prazo',l:'Prazo',t:'date'},{k:'clienteId',l:'Cliente',t:'select',o:O.clientes},
    {k:'responsaveis',l:'Responsáveis (marque uma ou mais pessoas)',t:'multi',o:O.usuarios,full:1,req:1},
    {k:'processoId',l:'Processo',t:'select',o:O.processos,full:1},{k:'obs',l:'Detalhes',t:'textarea',full:1,rows:2}],
    {...t,responsaveis:respDe(t)},v=>{v.responsavelId=v.responsaveis[0]||'';if(v.status==='done'&&t.status!=='done'){v.concluidoEm=today();v.concluidoPor=quemConclui(v);}if(v.status!=='done')v.concluidoEm='';upsert('tarefas',id,v);},id&&(()=>{db.tarefas=db.tarefas.filter(x=>x.id!==id);}));
}
function editLead(id){
  const l=id?db.leads.find(x=>x.id===id):{etapa:'Novo contato',origem:'',primeiroContato:today(),ultimoContato:today()};
  form(id?'Editar atendimento':'Novo atendimento',[
    {k:'nome',l:'Nome',req:1},{k:'tel',l:'WhatsApp / telefone'},{k:'email',l:'E-mail',t:'email'},
    {k:'origem',l:'Origem',t:'select',o:ORIGENS},{k:'produto',l:'Produto / nicho',t:'select',o:O.produtos},
    {k:'etapa',l:'Status / etapa',t:'select',o:ETAPAS,req:1},{k:'canal',l:'WhatsApp de entrada',t:'select',o:CANAIS},{k:'etiquetas',l:'Etiquetas (WaSpeed)'},
    {k:'primeiroContato',l:'Primeiro contato',t:'date'},{k:'ultimoContato',l:'Último contato',t:'date'},
    {k:'valor',l:'Honorários estimados (R$)',t:'number'},{k:'campanha',l:'Campanha (Meta)',list:()=>[...new Set(db.trafego.map(t=>t.campanha))].sort(),dica:'Para medir o resultado de cada campanha na tela Tráfego pago.'},
    {k:'dataFechamento',l:'Data de fechamento',t:'date',dica:'Preenchida sozinha ao mover para "Fechado".'},{k:'valorFechado',l:'Honorários fechados (R$)',t:'number',dica:'Valor do contrato fechado (se vazio, usa o estimado).'},
    {k:'proposta',l:'Proposta enviada',t:'textarea',full:1,rows:2,},
    {k:'obs',l:'Resumo do caso',t:'textarea',full:1,rows:2},...campoParceiro(),...camposPerfil],
    l,v=>{if(v.etapa==='Fechado'&&!v.dataFechamento)v.dataFechamento=today();if(v.etapa!=='Fechado')v.dataFechamento='';upsert('leads',id,v,{criado:v.primeiroContato||today()});},id&&(()=>{db.leads=db.leads.filter(x=>x.id!==id);}));
}
function editLanc(id,pre){
  const l=id?db.lancamentos.find(x=>x.id===id):{tipo:'receita',venc:today(),pago:false,forma:'PIX',...pre};
  const cats=l.tipo==='despesa'?CAT_DESP:CAT_REC;
  form((id?'Editar ':'Nova ')+(l.tipo==='despesa'?'despesa':'receita'),[
    {k:'descricao',l:'Descrição',req:1,full:1},{k:'categoria',l:'Categoria',t:'select',o:cats,req:1,d:cats[0]},
    {k:'valor',l:'Valor (R$)',t:'number',req:1},{k:'venc',l:'Vencimento',t:'date',req:1},{k:'forma',l:'Forma de pagamento',t:'select',o:FORMAS},
    {k:'clienteId',l:'Cliente',t:'select',o:O.clientes},{k:'processoId',l:'Processo',t:'select',o:O.processos},
    {k:'produto',l:'Produto / nicho (opcional)',t:'select',o:O.produtos},
    {k:'pago',l:l.tipo==='despesa'?'Pago':'Recebido',t:'check'},{k:'pagoEm',l:'Data do pagamento',t:'date'},
    {k:'obs',l:'Observação',t:'textarea',full:1,rows:2}],
    l,v=>{if(!v.valor){toast('Informe o valor',1);return false;}if(v.pago&&!v.pagoEm)v.pagoEm=today();if(!v.pago)v.pagoEm='';if(v.processoId&&!v.clienteId)v.clienteId=proc(v.processoId)?.clienteId||'';upsert('lancamentos',id,v,{tipo:l.tipo,criado:today()});},
    id&&(()=>{db.lancamentos=db.lancamentos.filter(x=>x.id!==id);}));
}
function editContrato(id,pre){
  const k=id?ctr(id):{data:today(),ambito:'Judicial',forma:'PIX',diaVenc:10,parcelas:0,entrada:0,gerar:true,responsavelId:db.usuarioAtual,...pre};
  if(!id&&k.clienteId&&!k.produto)k.produto=cli(k.clienteId)?.produto||'';
  const campos=[
    {k:'clienteId',l:'Cliente (contratante)',t:'select',o:O.clientes,req:1,full:1},{k:'titular',l:'Titular da ação (se diferente)'},
    {k:'processoId',l:'Processo',t:'select',o:O.processos},{k:'produto',l:'Produto / nicho',t:'select',o:O.produtos},{k:'ambito',l:'Âmbito',t:'select',o:AMBITOS},
    {k:'data',l:'Data do contrato',t:'date',req:1},{k:'forma',l:'Forma de pagamento',t:'select',o:FORMAS},
    {k:'responsavelId',l:'Quem fechou o contrato',t:'select',o:O.usuarios,dica:'Conta pontos no ranking da equipe.'},{k:'parceriaPct',l:'% do parceiro (se for caso de parceria)',t:'number'},
    {t:'sec',l:'Honorários'},
    {k:'valorTotal',l:'H.O. inicial — valor do contrato (R$)',t:'number',req:1},{k:'entrada',l:'Valor de entrada (R$)',t:'number'},
    {k:'parcelas',l:'Quantidade de parcelas',t:'number'},{k:'valorParcela',l:'Valor da parcela (vazio = calcular)',t:'number',vazio:0},
    {k:'diaVenc',l:'Dia de vencimento das parcelas',t:'number'},{k:'exitoPct',l:'Êxito (% do proveito)',t:'number'},
    {k:'hoAcordo',l:'H.O. final — acordo (R$)',t:'number'},{k:'hoExito',l:'H.O. final — êxito (R$)',t:'number'},{k:'sucumbencia',l:'Sucumbência (R$)',t:'number'},
    {t:'sec',l:'Custos'},
    {k:'custos',l:'Custos do caso (R$)',t:'number'},{k:'cac',l:'CAC — custo de aquisição (R$)',t:'number'},
    {k:'custosDesc',l:'Detalhe dos custos (correios, diligências…)',t:'textarea',full:1,rows:2},
    {k:'proposta',l:'Texto da proposta',t:'textarea',full:1,rows:2},{k:'obs',l:'Observações',t:'textarea',full:1,rows:2}];
  if(!id)campos.push({k:'gerar',l:'Gerar entrada e parcelas no financeiro (contas a receber)',t:'check',full:1});
  form(id?'Editar contrato':'Novo contrato de honorários',campos,k,v=>{
    if(!v.valorTotal){toast('Informe o valor do contrato',1);return false;}
    if(+v.entrada>+v.valorTotal){toast('A entrada não pode ser maior que o valor do contrato',1);return false;}
    if(!v.valorParcela&&+v.parcelas>0)v.valorParcela=Math.round((v.valorTotal-(v.entrada||0))/v.parcelas*100)/100;
    const gerar=v.gerar;delete v.gerar;
    const nid=upsert('contratos',id,v);
    if(!id){const c=cli(v.clienteId);if(c){c.status='Ativo';if(!c.produto)c.produto=v.produto;}
      if(gerar)db.lancamentos.push(...gerarParcelas(ctr(nid)));setTimeout(checarMetas,400);}
  },id&&(async()=>{const abertas=db.lancamentos.filter(l=>l.contratoId===id&&!l.pago);
      if(abertas.length&&await confirmar(`Excluir também as ${abertas.length} parcela(s) em aberto deste contrato no financeiro?`,'Excluir parcelas'))db.lancamentos=db.lancamentos.filter(l=>!(l.contratoId===id&&!l.pago));
      db.contratos=db.contratos.filter(x=>x.id!==id);}),
  id?'Alterar o contrato não muda as parcelas já lançadas no financeiro. Ajuste-as em <b>Contas a receber e pagar</b>, se necessário.':'O CAC (custo de aquisição) é a verba de marketing do nicho no mês dividida pelos contratos fechados, ou o valor pago pela indicação. Em recontratação, deixe 0.');
}
function editFixa(id){
  const f=id?db.despesasFixas.find(x=>x.id===id):{ativo:true,dia:10,categoria:'Aluguel'};
  form(id?'Editar despesa fixa':'Nova despesa fixa',[
    {k:'descricao',l:'Descrição',req:1,full:1},{k:'categoria',l:'Categoria',t:'select',o:CAT_DESP,req:1},
    {k:'previsto',l:'Valor previsto (R$/mês)',t:'number',req:1},{k:'dia',l:'Dia do vencimento',t:'number'},
    {k:'produto',l:'Produto / nicho (ex.: tráfego por nicho)',t:'select',o:O.produtos},{k:'ativo',l:'Ativa (lançar todo mês)',t:'check',full:1}],
    f,v=>{upsert('despesasFixas',id,v);},id&&(()=>{db.despesasFixas=db.despesasFixas.filter(x=>x.id!==id);}));
}
function editDoc(id,pre){
  const d=id?db.documentos.find(x=>x.id===id):{recebido:false,...pre};
  form(id?'Editar documento':'Novo documento no checklist',[
    {k:'clienteId',l:'Cliente',t:'select',o:O.clientes,req:1,full:1},{k:'nome',l:'Documento',req:1,full:1},
    {k:'link',l:'Link do arquivo (Google Drive ou outro)',t:'url',full:1,ph:'https://drive.google.com/…'},{k:'obs',l:'Observação',full:1},
    {k:'recebido',l:'Já recebido',t:'check',full:1}],
    d,v=>{v.data=v.recebido?(d.data||today()):'';upsert('documentos',id,v);},id&&(()=>{db.documentos=db.documentos.filter(x=>x.id!==id);}));
}
function editUsuario(id,pre){
  const u=id?usr(id):{papel:'Advogado(a)',...pre};
  form(id?'Editar membro da equipe':'Novo membro da equipe',[
    {k:'nome',l:'Nome',req:1},{k:'papel',l:'Função',t:'select',o:['Sócio(a)','Advogado(a)','Estagiário(a)','Administrativo / financeiro','Parceiro'],req:1},
    {k:'oab',l:'OAB'},{k:'email',l:'E-mail',t:'email',dica:'Use o mesmo e-mail do acesso (login) da pessoa. Para parceiros, é o que liga os casos a ele.'},{k:'nascimento',l:'Aniversário',t:'date'}],
    u,v=>{upsert('usuarios',id,v);},id&&db.usuarios.length>1&&(()=>{db.usuarios=db.usuarios.filter(x=>x.id!==id);if(db.usuarioAtual===id)db.usuarioAtual=db.usuarios[0].id;}));
}
function editMetas(){
  form('Metas mensais de contratos',[
    {k:'qtd',l:'Quantidade de contratos / mês',t:'number'},{k:'valorTotal',l:'Valor total de contratos (R$)',t:'number'},
    {k:'entradas',l:'Valor total de entradas (R$)',t:'number'},{k:'ticket',l:'Valor médio do contrato (R$)',t:'number'},
    {k:'entradaMedia',l:'Valor médio das entradas (R$)',t:'number'},{k:'parcelasMedia',l:'Quantidade média de parcelas (máximo)',t:'number'},
    {k:'parcelaMedia',l:'Valor médio das parcelas (R$)',t:'number'},{k:'atendimentos',l:'Novos atendimentos / mês',t:'number'},
    {k:'premio',l:'Gratificação / prêmio ao bater a meta',t:'textarea',full:1,rows:2,dica:'Aparece no painel para motivar a equipe.'}],db.metas,v=>{db.metas={...db.metas,...v};});
}
function pagarReal(id){
  const l=db.lancamentos.find(x=>x.id===id);
  form('Registrar pagamento',[{k:'valor',l:'Valor real pago (R$)',t:'number',req:1},{k:'pagoEm',l:'Data do pagamento',t:'date',req:1},{k:'forma',l:'Forma',t:'select',o:FORMAS}],
    {valor:l.valor,pagoEm:today(),forma:l.forma},v=>{Object.assign(l,v,{pago:true});});
}
function editConta(c){
  c=c||{papel:'advogado',ativo:true};
  form(c.id?'Editar acesso':'Novo acesso ao sistema',[
    {k:'nome',l:'Nome',req:1},{k:'email',l:'E-mail (login)',t:'email',req:1},
    {k:'papel',l:'Perfil',t:'select',o:PAPEIS,req:1},{k:'senha',l:c.id?'Nova senha (deixe vazio para manter)':'Senha inicial (mín. 8 caracteres)',t:'text'},
    {k:'ativo',l:'Acesso ativo',t:'check',full:1}],c,v=>{
      api('conta',{...v,id:c.id||0}).then(()=>{contasCache=null;
        // quem ganha acesso entra também na Equipe (é o que o coloca na lista de responsáveis das tarefas)
        if(!db.usuarios.some(u=>norm(u.email)===norm(v.email))){db.usuarios.push({id:uid(),nome:v.nome,papel:papelNome(v.papel).replace(/ —.*/,''),oab:'',email:v.email});save();}
        toast('Acesso salvo ✓');render();}).catch(e=>toast(e.msg||'Não foi possível salvar',1));
    },null,'Cada pessoa da equipe deve ter o próprio acesso. Envie a senha inicial por um canal seguro e peça para a pessoa trocá-la em Configurações → Minha senha.');
}


function editAndamento(pid,aid){
  const p=proc(pid);const a=aid?p.andamentos.find(x=>x.id===aid):{data:today()};
  form(aid?'Editar andamento':'Novo andamento',[{k:'data',l:'Data',t:'date',req:1},{k:'texto',l:'Andamento / movimentação',t:'textarea',req:1,full:1,rows:4}],a,v=>{
    if(aid)Object.assign(a,v);else p.andamentos.push({id:uid(),autor:db.usuarioAtual,...v});},
    aid&&(()=>{p.andamentos=p.andamentos.filter(x=>x.id!==aid);}));
}
function editNota(id,cid){
  const n=id?db.notas.find(x=>x.id===id):{data:today(),clienteId:cid};
  form(id?'Editar registro':'Novo registro de atendimento',[{k:'data',l:'Data',t:'date',req:1},{k:'texto',l:'Registro',t:'textarea',req:1,full:1,rows:4}],n,v=>{
    if(id)Object.assign(n,v);else{db.notas.push({id:uid(),clienteId:cid,autor:db.usuarioAtual,...v});const c=cli(cid);if(c)c.ultimoContato=today();}},
    id&&(()=>{db.notas=db.notas.filter(x=>x.id!==id);}));
}
/* ---------- salário-maternidade ---------- */
function editSm(id,pre){
  const c=id?db.sm.find(x=>x.id===id):{status:SM_STATUS[0],categoria:SM_CATEG[0],responsavelId:db.usuarioAtual,guias:[],beneficioEstimado:Math.round((+db.escritorio.salarioMinimo||1518)*4),...pre};
  form(id?'Editar caso de salário-maternidade':'Novo caso de salário-maternidade',[
    {k:'clienteId',l:'Segurada (cliente)',t:'select',o:O.clientes,req:1,full:1},
    {k:'categoria',l:'Categoria da segurada',t:'select',o:SM_CATEG,req:1},{k:'estrategia',l:'Estratégia',t:'select',o:SM_ESTRAT},
    {k:'status',l:'Etapa',t:'select',o:SM_STATUS,req:1},{k:'responsavelId',l:'Responsável',t:'select',o:O.usuarios},
    {t:'sec',l:'Gestação e criança'},
    {k:'dpp',l:'Data provável do parto (DPP)',t:'date'},{k:'dataParto',l:'Data do parto / adoção',t:'date'},
    {k:'crianca',l:'Nome da criança'},{k:'carenciaMeses',l:'Carência exigida (nº de contribuições)',t:'number',dica:'CLT, doméstica e avulsa: em regra, sem carência. Contribuinte individual, facultativa e MEI: confira as regras vigentes.'},
    {t:'sec',l:'INSS'},
    {k:'qualidadeAte',l:'Qualidade de segurada até',t:'date'},{k:'der',l:'DER — data do requerimento',t:'date'},
    {k:'nb',l:'NB / protocolo'},{k:'beneficioEstimado',l:'Valor total estimado do benefício (R$)',t:'number'},
    {k:'obs',l:'Observações',t:'textarea',full:1,rows:2}],
    c,v=>{if(v.status==='Aguardando o parto'&&v.dataParto){v.status='Pronto para protocolo';setTimeout(()=>toast('Parto informado: caso movido para "Pronto para protocolo" 👶'),300);}
      const nid=upsert('sm',id,v,{guias:[]});if(!id)location.hash='sm/'+nid;},id&&(()=>{db.sm=db.sm.filter(x=>x.id!==id);if(ui.page==='sm'&&ui.id)location.hash='sm';}),
    'Cadastre também os documentos padrão do salário-maternidade no checklist do cliente (botão na ficha do caso).');
}
const vencGuia=comp=>diaNoMes(ymAdd(comp,1),15);
function guiaStatus(g){if(g.pagaEm)return 'Paga';if(g.emitidaEm)return diff(g.venc)<0?'Vencida':'Emitida';return diff(g.venc)<0?'Vencida':'A emitir';}
function editGuia(smId,gid){
  const caso=db.sm.find(x=>x.id===smId);const g=gid?caso.guias.find(x=>x.id===gid):{competencia:today().slice(0,7),codigo:'1007',quemPaga:'Cliente'};
  if(!gid){g.venc=vencGuia(g.competencia);g.valor=Math.round((+db.escritorio.salarioMinimo||1518)*0.2*100)/100;}
  form(gid?'Editar guia':'Nova guia de recolhimento',[
    {k:'competencia',l:'Competência (mês/ano)',t:'month',req:1},{k:'codigo',l:'Código de pagamento',list:GPS_CODIGOS.map(x=>[x[0]]),dica:GPS_CODIGOS.map(x=>x[0]+' = '+x[1]).join(' · ')},
    {k:'valor',l:'Valor (R$)',t:'number',req:1},{k:'venc',l:'Vencimento',t:'date',req:1,dica:'GPS de contribuinte individual/facultativo: dia 15 do mês seguinte à competência (dia útil seguinte se cair em fim de semana ou feriado).'},
    {k:'emitidaEm',l:'Emitida em',t:'date'},{k:'pagaEm',l:'Paga em',t:'date'},
    {k:'quemPaga',l:'Quem paga',t:'select',o:['Cliente','Escritório (reembolsável)']},{k:'link',l:'Link da guia / comprovante',t:'url'},{k:'obs',l:'Observação',full:1}],
    g,v=>{if(gid)Object.assign(g,v);else caso.guias.push({id:uid(),...v});caso.guias.sort((a,b)=>a.competencia.localeCompare(b.competencia));},
    gid&&(()=>{caso.guias=caso.guias.filter(x=>x.id!==gid);}));
}
function gerarGuias(smId){
  const caso=db.sm.find(x=>x.id===smId);const sal=+db.escritorio.salarioMinimo||1518;
  form('Gerar guias em lote',[
    {k:'inicio',l:'Primeira competência',t:'month',req:1},{k:'qtd',l:'Quantidade de meses',t:'number',req:1},
    {k:'codigo',l:'Código',t:'select',o:GPS_CODIGOS.map(x=>[x[0],x[0]+' — '+x[1]]),req:1},{k:'base',l:'Salário de contribuição (R$)',t:'number',req:1,dica:'Salário mínimo configurado: '+brl(sal)+' (atualize em Configurações).'}],
    {inicio:today().slice(0,7),qtd:Math.max(1,(+caso.carenciaMeses||10)-caso.guias.filter(g=>g.pagaEm).length),codigo:'1007',base:sal},v=>{
      const al=(GPS_CODIGOS.find(x=>x[0]===v.codigo)||[0,0,20])[2];let n=0;
      for(let i=0;i<Math.min(60,Math.round(v.qtd));i++){const c=ymAdd(v.inicio,i);if(caso.guias.some(g=>g.competencia===c))continue;
        caso.guias.push({id:uid(),competencia:c,codigo:v.codigo,valor:Math.round(v.base*al)/100,venc:vencGuia(c),emitidaEm:'',pagaEm:'',quemPaga:'Cliente',link:'',obs:''});n++;}
      caso.guias.sort((a,b)=>a.competencia.localeCompare(b.competencia));toast(n+' guia(s) criada(s)');});
}
/* ---------- scripts e modelos ---------- */
function editScript(id){
  const s=id?db.scripts.find(x=>x.id===id):{categoria:SCRIPT_CATS[0]};
  form(id?'Editar script':'Novo script',[{k:'titulo',l:'Título',req:1},{k:'categoria',l:'Categoria',req:1,list:SCRIPT_CATS},{k:'produto',l:'Produto / nicho (opcional)',t:'select',o:O.produtos},
    {k:'texto',l:'Texto',t:'textarea',req:1,full:1,rows:8,dica:'Use [Nome], [Usuário], [Escritório] e [Produto]: são trocados automaticamente.'}],
    s,v=>{upsert('scripts',id,v);},id&&(()=>{db.scripts=db.scripts.filter(x=>x.id!==id);}));
}
function editModelo(id){
  const m=id?db.modelos.find(x=>x.id===id):{categoria:MODELO_CATS[0],texto:''};
  form(id?'Editar modelo':'Novo modelo de documento',[{k:'nome',l:'Nome do modelo',req:1,full:1},{k:'categoria',l:'Tipo',t:'select',o:MODELO_CATS,req:1},{k:'area',l:'Área / nicho',list:O.produtos},
    {k:'texto',l:'Texto do modelo',t:'textarea',req:1,full:1,rows:16,dica:'Campos automáticos: '+CAMPOS_MODELO.map(c=>'{{'+c+'}}').join(' ')}],
    m,v=>{const nid=upsert('modelos',id,v);ui.f.doc=ui.f.doc||{};ui.f.doc.modelo=nid;},id&&(()=>{db.modelos=db.modelos.filter(x=>x.id!==id);}));
}
