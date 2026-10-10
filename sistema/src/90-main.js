/* =========================================================
   RENDER / ROTEAMENTO
   ========================================================= */
const PAGINAS_PARCEIRO=['painel','tarefas','parcerias','config','cliente','processo'];
function render(){
  if(!db)return;
  const [page,id]=(location.hash.slice(1)||'painel').split('/');
  ui.page=V[page]?page:'painel';ui.id=id||null;
  if(ehParceiro()&&!PAGINAS_PARCEIRO.includes(ui.page))ui.page='painel';
  let title=TITLES[ui.page];
  if(ui.page==='cliente'&&cli(ui.id))title=cli(ui.id).nome;
  if(ui.page==='processo'&&proc(ui.id))title=(proc(ui.id).tipo==='Judicial'?'Processo ':'Requerimento ')+proc(ui.id).numero;
  if(ui.page==='sm'&&ui.id){const c=db.sm.find(x=>x.id===ui.id);if(c)title='Salário-maternidade — '+nomeCli(c.clienteId);}
  if(ehParceiro()&&ui.page==='painel')title='Painel da parceria';
  $('#ptitle').textContent=title;document.title=title+' · Gestão do Escritório';
  $('#view').innerHTML=V[ui.page]();
  ['#cli-grid','#doc-grid'].forEach(s=>{const g=$(s);if(g&&innerWidth<860)g.style.gridTemplateColumns='minmax(0,1fr)';});
  const navKey={cliente:'clientes',processo:'processos'}[ui.page]||ui.page;
  document.querySelectorAll('.ni').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+navKey));
  document.querySelectorAll('[data-fin]').forEach(el=>el.style.display=podeFin()?'':'none');
  document.querySelectorAll('[data-noparc]').forEach(el=>el.style.display=ehParceiro()?'none':'');
  document.querySelectorAll('[data-parc]').forEach(el=>el.style.display=ehParceiro()||(podeFin()&&parceiros().length)?'':'none');
  badges();userBox();
}
function badges(){
  const n=(id,v)=>{$('#'+id).textContent=v||'';};
  n('nb-agenda',db.eventos.filter(e=>!e.feito&&diff(e.data)<=0).length);
  n('nb-tarefas',db.tarefas.filter(t=>t.status!=='done'&&t.prazo&&diff(t.prazo)<0).length);
  n('nb-fin',podeFin()?db.lancamentos.filter(l=>l.tipo==='receita'&&lancStatus(l)==='Atrasado').length:0);
  n('nb-docs',db.documentos.filter(d=>!d.recebido).length);
  n('nb-sm',guiasPendentes(7).length);
  $('#brand-nome').textContent=(db.escritorio.nome||'Escritório').replace(/\s+Advocacia(\s+e\s+Consultoria)?$/i,'');
}
function userBox(){
  const box=$('#suser');
  if(!sessao){box.innerHTML='';return;}
  box.innerHTML=`<div class="av">${esc(initials(sessao.nome))}</div><div class="uname" title="${esc(sessao.email)}"><div>${esc(sessao.nome)}</div><div class="upapel">${esc(papelNome(sessao.papel).replace(/ —.*/,''))}${modo==='local'?' · demonstração':''}</div></div><button class="sair" data-act="sair">Sair</button>`;
}

/* ---------- ações (delegação de eventos) ---------- */
const A={
  tarParceiro:email=>{const u=db.usuarios.find(x=>norm(x.email)===norm(email));editTarefa(null,u?{responsaveis:ehParceiro()?[u.id]:[u.id,db.usuarioAtual].filter(Boolean)}:{});},
  quickAdd:()=>ehParceiro()?editTarefa():modal('O que deseja cadastrar?',`<div class="qa">
    <button data-act="novoLead">Atendimento<small>novo contato / possível cliente</small></button><button data-act="novoCli">Cliente<small>pessoa física ou jurídica</small></button>
    <button data-act="novoProc">Processo<small>judicial ou administrativo</small></button><button data-act="novoEv">Prazo / compromisso<small>prazo, audiência, perícia, reunião</small></button>
    <button data-act="novaTar">Tarefa<small>para você ou a equipe</small></button><button data-act="novoSm">Caso de salário-maternidade<small>guias, DPP e requerimento</small></button>${podeFin()?`<button data-act="novoCtr">Contrato de honorários<small>gera entrada e parcelas</small></button>
    <button data-act="novaRec">Receita<small>entrada avulsa</small></button><button data-act="novaDesp">Despesa<small>conta a pagar</small></button>`:''}</div>`),
  novoCli:()=>editCliente(),editCli:id=>editCliente(id),
  novoProc:()=>editProcesso(),editProc:id=>editProcesso(id),novoProcCli:id=>editProcesso(null,{clienteId:id}),
  novoEv:()=>editEvento(),editEv:id=>editEvento(id),novoEvData:d=>editEvento(null,{data:d}),
  novoEvProc:id=>editEvento(null,{processoId:id,clienteId:proc(id)?.clienteId}),novoEvCli:id=>editEvento(null,{clienteId:id}),
  toggleEv:id=>{const e=db.eventos.find(x=>x.id===id);e.feito=!e.feito;e.feitoEm=e.feito?today():'';e.feitoPor=e.feito?db.usuarioAtual:'';save();render();toast(e.feito?'Cumprido! +'+PONTOS.prazo+' pontos ✓':'Reaberto');},
  novaTar:()=>editTarefa(),editTar:id=>editTarefa(id),novaTarProc:id=>editTarefa(null,{processoId:id,clienteId:proc(id)?.clienteId}),
  novoLead:()=>editLead(),editLead:id=>editLead(id),
  converter:id=>{const l=db.leads.find(x=>x.id===id);const nid=uid();
    db.clientes.push({id:nid,tipo:'PF',nome:l.nome,doc:'',tel:l.tel,email:l.email||'',cidade:l.cidade||'',uf:l.uf||'',origem:l.origem,produto:l.produto||'',status:'Ativo',criado:today(),
      primeiroContato:l.primeiroContato||l.criado,ultimoContato:today(),idade:l.idade||null,nascimento:l.nascimento||'',sexo:l.sexo||'',profissao:l.profissao||'',renda:l.renda||0,obs:l.obs||'',leadId:l.id});
    l.convertido=true;l.etapa='Fechado';db.notas.push({id:uid(),clienteId:nid,data:today(),autor:db.usuarioAtual,texto:'Cliente convertido a partir do atendimento.'+(l.proposta?' Proposta: '+l.proposta:'')});
    save();location.hash='cliente/'+nid;
    if(podeFin())setTimeout(()=>editContrato(null,{clienteId:nid,produto:l.produto||'',proposta:l.proposta||'',valorTotal:+l.valor||0}),80);
    toast('Cliente criado — registre o contrato de honorários');},
  novaRec:()=>editLanc(null,{tipo:'receita'}),novaDesp:()=>editLanc(null,{tipo:'despesa'}),editLanc:id=>editLanc(id),
  novaLucro:()=>editLanc(null,{tipo:'despesa',categoria:LUCROS,descricao:'Distribuição de lucros aos sócios',pago:true,pagoEm:today(),forma:'Transferência'}),
  novaRecCli:id=>editLanc(null,{tipo:'receita',clienteId:id}),
  novoCtr:()=>editContrato(),editCtr:id=>editContrato(id),ctrCli:id=>editContrato(null,{clienteId:id}),ctrProc:id=>editContrato(null,{clienteId:proc(id)?.clienteId,processoId:id}),
  ctrMes:m=>{ui.f.ctr.mes=m;render();},
  baixar:id=>{const l=db.lancamentos.find(x=>x.id===id);l.pago=true;l.pagoEm=today();save();render();toast((l.tipo==='despesa'?'Pagamento':'Recebimento')+' registrado ✓');},
  pagarReal:id=>pagarReal(id),
  novaFixa:()=>editFixa(),editFixa:id=>editFixa(id),
  lancarFixa:id=>{lancarFixas(ui.f.fixas.mes,[id]);},lancarFixas:()=>lancarFixas(ui.f.fixas.mes),
  editMetas:()=>editMetas(),
  finTodos:()=>{ui.f.fin.mes='';render();},
  mesNav:k=>{const[g,d]=k.split(':');const f=ui.f[g];f.mes=ymAdd(f.mes||today().slice(0,7),+d);render();},
  xlsFin:()=>exportarExcel('lancamentos'+(ui.f.fin.mes?'-'+ui.f.fin.mes:''),[['Lançamentos',filtroFin().sort((a,b)=>a.venc.localeCompare(b.venc)).map(l=>{const c=cli(l.clienteId);return {Tipo:l.tipo==='receita'?'Entrada':'Saída',Vencimento:fd(l.venc),Descrição:l.descricao,Categoria:l.categoria,Cliente:c?.nome||'',Fone:c?.tel||'','E-mail':c?.email||'',Processo:proc(l.processoId)?.numero||'',Valor:l.valor,Status:lancStatus(l),'Pago em':l.pagoEm?fd(l.pagoEm):'',Forma:l.forma||'',Observação:l.obs||''};})]]),
  xlsReg:()=>exportarExcel('registro-historico',[['Registro histórico',linhasRegistro().map(r=>{const o={Tipo:r._t==='lead'?'Atendimento':'Cliente'};COLS_REG.forEach(([k,l,t])=>{const v=r[k];o[l]=v==null||v===''?'':t==='d'?fd(v):v;});return o;})]]),
  xlsPrev:()=>{const f=ui.f.prev;const meses=Array.from({length:f.n},(_,i)=>ymAdd(f.mes,i));const linhas={};
    db.lancamentos.filter(l=>l.tipo==='receita'&&l.venc>=meses[0]&&l.venc<=fimMes(meses[meses.length-1])).forEach(l=>{const d=+l.venc.slice(8);const g=d<=10?'Dia 10':d<=20?'Dia 20':'Dia 30';const k=g+'|'+l.clienteId+'|'+(l.forma||'');
      if(!linhas[k]){linhas[k]={Grupo:g,Cliente:nomeCli(l.clienteId),Título:l.forma||''};meses.forEach(m=>linhas[k][mLabel(m)]=0);}linhas[k][mLabel(l.venc.slice(0,7))]+=l.valor;});
    exportarExcel('previsao-recebimentos',[['Previsão',Object.values(linhas).sort((a,b)=>(a.Grupo+a.Cliente).localeCompare(b.Grupo+b.Cliente))]]);},
  xlsFluxo:()=>{const ym=ui.f.fluxo.mes,ini=ym+'-01',fim=fimMes(ym);
    exportarExcel('fluxo-de-caixa-'+ym,[['Entradas',receitasPagas(ini,fim).map(l=>({Data:fd(dataCaixa(l)),Valor:l.valor,Descrição:l.categoria,Detalhe:l.descricao,Origem:nomeCli(l.clienteId)}))],
      ['Saídas',despesasPagas(ini,fim).map(l=>({Data:fd(dataCaixa(l)),Valor:l.valor,Descrição:l.categoria,Detalhe:l.descricao}))],
      ['Resumo',[{Mês:mLong(ym),'Saldo anterior':saldoAntes(ini),'Total entradas':sumBy(receitasPagas(ini,fim),l=>l.valor),'Total saídas':sumBy(despesasPagas(ini,fim,l=>l.categoria!==LUCROS),l=>l.valor),'Distribuição de lucros':sumBy(despesasPagas(ini,fim,l=>l.categoria===LUCROS),l=>l.valor)}]]]);},
  xlsCtr:()=>exportarExcel('contratos',[['Contratos',db.contratos.slice().sort((a,b)=>a.data.localeCompare(b.data)).map(k=>({Data:fd(k.data),Cliente:nomeCli(k.clienteId),Titular:k.titular||'',Produto:k.produto,Âmbito:k.ambito,'Valor do contrato':k.valorTotal,'Valor da entrada':k.entrada,'Quantidade de parcelas':k.parcelas,'Valor da parcela':valorParcela(k),Forma:k.forma,'Êxito %':k.exitoPct||'',CAC:k.cac||0,'Custos do caso':k.custos||0,Recebido:recebidoContrato(k)}))]]),
  xlsInd:()=>{const f=ui.f.ind;exportarExcel('indicadores-'+f.ano+(f.produto?'-'+f.produto:''),[['Indicadores',tabelaIndicadores(f.ano,f.produto).map(r=>{if(r.sec)return {Indicador:'— '+r.sec.toUpperCase()+' —'};const o={Indicador:r.rot};
    r.vals.forEach((v,i)=>o[MESES_L[i]]=v==null?'':typeof v==='number'?Math.round(v*100)/100:v);o['Média']=r.media==null?'':Math.round(r.media*100)/100;o['Total']=r.total==null?'':typeof r.total==='number'?Math.round(r.total*100)/100:r.total;return o;})]]);},
  tabCli:k=>{ui.tabCli=k;render();},
  addNota:id=>{const t=$('#nota-txt').value.trim();if(!t)return;db.notas.push({id:uid(),clienteId:id,data:today(),autor:db.usuarioAtual,texto:t});const c=cli(id);if(c)c.ultimoContato=today();save();render();toast('Registrado ✓');},
  addAnd:id=>{const t=$('#and-txt').value.trim();if(!t)return;proc(id).andamentos.push({id:uid(),data:$('#and-data').value||today(),texto:t,autor:db.usuarioAtual});save();render();toast('Andamento adicionado ✓');},
  novoAnd:id=>editAndamento(id),editAnd:k=>{const[pid,aid]=k.split('|');editAndamento(pid,aid);},editNota:id=>editNota(id),
  novoDoc:()=>editDoc(null,{clienteId:ui.f.doc?.cli||''}),novoDocCli:id=>editDoc(null,{clienteId:id}),editDoc:id=>editDoc(id),
  toggleDoc:id=>{const d=db.documentos.find(x=>x.id===id);d.recebido=!d.recebido;d.data=d.recebido?today():'';save();render();},

  modeloCli:id=>{ui.tabDoc='gerador';ui.f.doc={...(ui.f.doc||{}),mcli:id,mproc:db.processos.find(p=>p.clienteId===id)?.id||'',mctr:''};location.hash='documentos';render();},
  tabDoc:k=>{ui.tabDoc=k;render();},
  docWord:async()=>{try{toast('Gerando o Word…');const b=await gerarDocx();await download(nomeArquivoDoc()+'.docx',b);}catch(e){toast(e.message||'Falha ao gerar o Word',1);}},
  docPrint:()=>imprimirDocumento(),
  docCopiar:()=>{const t=$('#doc-preview').innerText;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Texto copiado ✓')).catch(()=>{const r=document.createRange();r.selectNodeContents($('#doc-preview'));const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');s.removeAllRanges();toast('Texto copiado ✓');});},
  docGoogle:async()=>{const f=ui.f.doc;const m=gIndisponivel();if(m){gErro(new Error(m));return;}
    try{toast('Criando no Google Docs…');const docx=await gerarDocx();const pasta=f.mcli?await drivePastaCliente(f.mcli):await drivePastaRaiz();
      const r=await driveUpload(docx,nomeArquivoDoc(),pasta,'application/vnd.google-apps.document');
      abrirLinkModal('Documento criado no Google Docs',r.webViewLink,'O documento foi salvo no papel timbrado'+(f.mcli?', na pasta do cliente,':'')+' no Google Drive e pode ser editado e compartilhado.');}catch(e){gErro(e);}},
  novoModelo:()=>editModelo(),editModelo:id=>editModelo(id),
  usarModelo:id=>{ui.tabDoc='gerador';ui.f.doc={...(ui.f.doc||{}),modelo:id};render();},
  duplicarModelo:id=>{const m=db.modelos.find(x=>x.id===id);db.modelos.push({...m,id:uid(),nome:m.nome+' (cópia)',padrao:false});save();render();toast('Modelo duplicado');},
  restaurarModelos:()=>{let n=0;modelosPadrao().forEach(m=>{if(!db.modelos.some(x=>x.nome===m.nome)){db.modelos.push(m);n++;}});save();render();toast(n?n+' modelo(s) restaurado(s)':'Todos os modelos padrão já existem');},
  tabProc:k=>{ui.tabProc=k;render();},procView:k=>{ui.procView=k;render();},
  setFase:k=>{const i=k.indexOf('|');const p=proc(k.slice(0,i));p.fase=k.slice(i+1);save();render();toast('Fase atualizada ✓');},
  tabSm:k=>{ui.tabSm=k;render();},novoSm:()=>editSm(),novoSmCli:id=>editSm(null,{clienteId:id}),editSm:id=>editSm(id),
  setSmStatus:k=>{const i=k.indexOf('|');const c=db.sm.find(x=>x.id===k.slice(0,i));c.status=k.slice(i+1);save();render();toast('Etapa atualizada ✓');},
  novaGuia:id=>editGuia(id),editGuia:k=>{const[s,g]=k.split('|');editGuia(s,g);},gerarGuias:id=>gerarGuias(id),
  guiaEmitida:k=>{const[s,gid]=k.split('|');const g=db.sm.find(x=>x.id===s).guias.find(x=>x.id===gid);g.emitidaEm=today();save();render();toast('Guia marcada como emitida ✓');},
  guiaPaga:k=>{const[s,gid]=k.split('|');const g=db.sm.find(x=>x.id===s).guias.find(x=>x.id===gid);g.pagaEm=today();if(!g.emitidaEm)g.emitidaEm=today();save();render();toast('Guia paga ✓');},
  smContrato:id=>{const c=db.sm.find(x=>x.id===id);const m=db.modelos.find(x=>/salário-maternidade/i.test(x.nome));ui.tabDoc='gerador';ui.f.doc={...(ui.f.doc||{}),mcli:c.clienteId,mproc:'',mctr:'',modelo:m?.id};location.hash='documentos';render();},
  novoProcSm:id=>{const c=db.sm.find(x=>x.id===id);editProcesso(null,{clienteId:c.clienteId,tipo:'Administrativo',area:'Previdenciário',objeto:'Salário-maternidade',parteContraria:'INSS',orgaoAdm:'INSS',fase:'Requerimento a protocolar'});},
  docsPadraoSm:cid=>{let n=0;SM_DOCS.forEach(nome=>{if(!db.documentos.some(d=>d.clienteId===cid&&norm(d.nome)===norm(nome))){db.documentos.push({id:uid(),clienteId:cid,nome,recebido:false,data:''});n++;}});save();render();toast(n+' documento(s) adicionado(s) ao checklist');},
  vincularDrive:id=>{const c=cli(id);
    form('Pasta do cliente no Google Drive',[{k:'driveLink',l:'Link da pasta',t:'url',full:1,req:1,ph:'https://drive.google.com/drive/folders/…'}],{},v=>{
      const l=v.driveLink.trim(),fid=(l.match(/folders\/([\w-]+)/)||l.match(/[?&]id=([\w-]+)/)||[])[1];
      upsert('clientes',id,{driveLink:l,driveId:fid||''});},null,
      `No Google Drive, abra a pasta de <b>${esc(c.nome)}</b>, copie o endereço da barra do navegador (ou clique com o botão direito na pasta → <b>Compartilhar → Copiar link</b>) e cole abaixo.`+(!gIndisponivel()?` Ou <a href="#" data-act="drivePasta" data-id="${id}">crie uma pasta nova automaticamente</a>.`:''));},
  drivePasta:async id=>{closeModal();try{await drivePastaCliente(id);render();toast('Pasta criada no Google Drive ✓');}catch(e){gErro(e);}},
  anexarDoc:id=>{const m=gIndisponivel();if(m){modal('Anexar arquivo',`<p class="small" style="margin-bottom:10px">${esc(m)}</p><p class="small">Enquanto isso, você pode colar o link do arquivo (Google Drive, Dropbox etc.) no documento.</p>`,[{l:'Fechar',c:'btn-ghost',fn:closeModal},{l:'Colar link',c:'btn-brand',fn:()=>{closeModal();editDoc(id);}}]);return;}
    const inp=$('#file-anexo');inp.dataset.doc=id;inp.click();},
  scrCat:c=>{ui.f.scr.cat=c;render();},novoScript:()=>editScript(),editScript:id=>editScript(id),
  copiarScript:id=>{const s=db.scripts.find(x=>x.id===id);const p=ui.f.scr.pessoa;const pes=p?(p[0]==='c'?cli(p.slice(2)):db.leads.find(l=>l.id===p.slice(2))):null;const t=personalizar(s.texto,pes);
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Script copiado ✓')).catch(()=>modal('Copie o texto',`<textarea rows="8" style="width:100%">${esc(t)}</textarea>`));},
  novoParceiro:()=>editUsuario(null,{papel:'Parceiro'}),
  repasse:email=>{const p=parceiros().find(u=>norm(u.email)===norm(email));const r=resumoParceria(email);
    editLanc(null,{tipo:'despesa',categoria:'Repasse a parceiro',descricao:'Repasse de honorários — '+(p?.nome||email),valor:Math.max(0,Math.round(r.saldo*100)/100),parceiro:norm(email),pago:true,pagoEm:today(),forma:'PIX'});},
  gcalSync:async()=>{const m=gIndisponivel();if(m){modal('Sincronizar com o Google Agenda',`<p class="small">${esc(m)}</p><p class="small" style="margin-top:8px">Sem configurar nada, use os links <b>+ Google Agenda</b> de cada compromisso ou o botão <b>Exportar .ics</b>.</p>`);return;}
    try{await sincronizarGoogleAgenda(false);}catch(e){gErro(e);setSync('');}},
  ics:()=>exportarICS(!ui.f.agenda?.resp?false:true),
  gConectar:async()=>{try{await gToken();toast('Google conectado ✓');render();}catch(e){gErro(e);}},
  salvarGoogle:()=>{if($('#g-client')){db.escritorio.googleClientId=$('#g-client').value.trim();save();}try{localStorage.setItem('gcal_cal',$('#g-cal').value.trim()||'primary');}catch(e){}render();toast('Integrações salvas ✓');},
  logoUp:()=>$('#file-logo').click(),logoDel:()=>{db.escritorio.logo='';save();render();toast('Logotipo padrão restaurado');},
  marcaUp:()=>$('#file-marca').click(),marcaPadrao:()=>{db.escritorio.marcaDagua='';db.escritorio.semMarca=false;save();render();toast("Marca d'água padrão restaurada");},
  marcaSem:()=>{db.escritorio.semMarca=!db.escritorio.semMarca;save();render();},
  verTimbrado:()=>{ui.tabDoc='gerador';location.hash='documentos';render();},
  addTipo:()=>{lerTipos();db.tiposEvento.push({nome:'Novo tipo',cor:corNova()});render();},
  delTipo:i=>{lerTipos();db.tiposEvento.splice(+i,1);render();},
  salvarTipos:()=>{lerTipos();db.tiposEvento=db.tiposEvento.filter(t=>t.nome.trim());save();render();toast('Tipos de compromisso salvos ✓');},
  editInd:k=>{const i=k.lastIndexOf('|');editInd(k.slice(0,i),+k.slice(i+1));},
  indVisao:v=>{ui.f.ind.visao=v;render();},
  novoIndExtra:()=>form('Novo indicador manual',[{k:'nome',l:'Nome do indicador',req:1,full:1},{k:'fmt',l:'Formato',t:'select',o:[['int','Número'],['brl','Valor em R$'],['pct','Percentual'],['txt','Texto']],req:1},{k:'agg',l:'Total do ano',t:'select',o:[['f','Somar os meses'],['s','Média dos meses'],['t','Sem total (texto)']],req:1}],{fmt:'int',agg:'f'},v=>{db.indExtras.push({id:uid(),...v});}),
  delIndExtra:nome=>{confirmar('Remover o indicador manual "'+nome+'"?','Remover').then(ok=>{if(!ok)return;db.indExtras=db.indExtras.filter(x=>x.nome!==nome);save();render();});},
  resetDemo:()=>{confirmar('Substituir todos os dados pelos dados de exemplo? Os acessos também voltam ao padrão (senha demo1234).','Restaurar').then(ok=>{if(!ok)return;demoReset(seed());localStorage.removeItem(KEY_SESSAO);location.hash='painel';location.reload();});},
  zerar:()=>{confirmar('Apagar TODOS os clientes, processos, financeiro e demais registros da demonstração? Recomenda-se exportar um backup antes.','Apagar tudo').then(ok=>{if(!ok)return;
    const n=vazio();['escritorio','usuarios','produtos','metas','tiposEvento','modelos','scripts'].forEach(k=>n[k]=db[k]);n.escritorio={...n.escritorio,saldoInicial:0,saldoInicialData:''};
    const contas=demo.store.contas;demoReset(n);demo.store.contas=contas;demoSave();entrar(sessao);toast('Dados apagados');});},
  kmove:k=>{const[kind,id,col]=k.split(':');moveCard(kind,id,col);},
  agView:v=>{ui.agendaView=v;render();},
  agMes:d=>{ui.agendaMes=ymAdd(ui.agendaMes,+d);render();},
  salvarEsc:()=>{['nome','cnpj','oab','email','tel','cidade','endereco'].forEach(k=>db.escritorio[k]=$('#esc_'+k).value.trim());db.escritorio.salarioMinimo=parseFloat($('#esc_salarioMinimo').value)||db.escritorio.salarioMinimo;
    if($('#esc_saldoInicial')){db.escritorio.saldoInicial=parseFloat($('#esc_saldoInicial').value)||0;db.escritorio.saldoInicialData=$('#esc_saldoInicialData').value;}
    save();render();toast('Dados do escritório salvos ✓');},
  salvarProd:()=>{const l=$('#produtos-txt').value.split('\n').map(s=>s.trim()).filter(Boolean);db.produtos=[...new Set(l)];save();render();toast('Produtos salvos ✓');},
  novoUsr:()=>editUsuario(),editUsr:id=>editUsuario(id),
  novaConta:()=>editConta(),editConta:i=>editConta({...contasCache[+i],senha:''}),
  trocarSenha:()=>{api('senha',{atual:$('#s-atual').value,nova:$('#s-nova').value}).then(()=>{toast('Senha alterada ✓');$('#s-atual').value='';$('#s-nova').value='';}).catch(e=>toast(e.msg||'Não foi possível trocar a senha',1));},
  sair:()=>{document.querySelectorAll('.confete').forEach(c=>c.remove());api('sair',{}).finally(()=>{clearInterval(tPuxar);sessao=null;G.token=null;db=vazio();contasCache=null;location.hash='painel';render();mostrarLogin();});},
  exportar:()=>download('backup-escritorio-'+today()+'.json',JSON.stringify({...db,usuarioAtual:undefined},null,1),'application/json'),
  importar:()=>$('#file-import').click(),
  importarXls:()=>$('#file-xlsx').click(),importarWa:()=>importarWhatsApp(),
};
function lerTipos(){document.querySelectorAll('[data-tipo-nome]').forEach(el=>{const i=+el.dataset.tipoNome;if(db.tiposEvento[i])db.tiposEvento[i].nome=el.value.trim();});
  document.querySelectorAll('[data-tipo-cor]').forEach(el=>{const i=+el.dataset.tipoCor;if(db.tiposEvento[i])db.tiposEvento[i].cor=el.value;});}
function lancarFixas(ym,ids){
  let n=0;db.despesasFixas.filter(f=>f.ativo&&(!ids||ids.includes(f.id))).forEach(f=>{
    if(db.lancamentos.some(l=>l.fixaId===f.id&&l.venc.startsWith(ym)))return;
    const venc=diaNoMes(ym,+f.dia||10);
    db.lancamentos.push({id:uid(),tipo:'despesa',descricao:f.descricao,categoria:f.categoria,clienteId:'',processoId:'',contratoId:'',valor:+f.previsto||0,venc,pago:false,pagoEm:'',forma:'Boleto',produto:f.produto||'',obs:'',fixaId:f.id,criado:today()});n++;});
  save();render();toast(n+' despesa(s) lançada(s) ✓');
}
document.addEventListener('click',ev=>{
  const a=ev.target.closest('[data-act]');
  if(a&&A[a.dataset.act]){if(a.tagName!=='INPUT')ev.preventDefault();ev.stopPropagation();if(a.closest('.qa')&&$('#mbg').classList.contains('open'))closeModal();A[a.dataset.act](a.dataset.id,a);return;}
  const g=ev.target.closest('[data-go]');if(g&&!ev.target.closest('a,button,input')){location.hash=g.dataset.go;return;}
  if(ev.target.id==='mbg')closeModal();
  if(!ev.target.closest('.search'))$('#sres').classList.remove('open');
  if(ev.target.closest('.ni')||ev.target.id==='scrim'){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('open');}
});
/* filtros: data-f="grupo.campo" */
function onFilter(el){const[g,k]=el.dataset.f.split('.');ui.f[g]=ui.f[g]||{};ui.f[g][k]=el.type==='checkbox'?el.checked:el.value;
  if(g==='doc'&&k==='mcli'){ui.f.doc.mproc=db.processos.find(p=>p.clienteId===el.value)?.id||'';ui.f.doc.mctr='';}}
document.addEventListener('change',ev=>{const el=ev.target;if(!el.dataset||!el.dataset.f)return;if(el.tagName!=='INPUT'||['checkbox','month','number'].includes(el.type)){onFilter(el);render();}});
let fTimer;
document.addEventListener('input',ev=>{const el=ev.target;if(el.dataset&&el.dataset.f&&el.tagName==='INPUT'&&!['checkbox','month','number'].includes(el.type)){onFilter(el);clearTimeout(fTimer);fTimer=setTimeout(()=>{const pos=el.selectionStart,sel='[data-f="'+el.dataset.f+'"]';render();const n=$(sel);if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}},250);}});
document.addEventListener('focusout',ev=>{if(precisaRender&&ev.target.closest&&ev.target.closest('#view'))setTimeout(()=>{const a=document.activeElement;if(precisaRender&&!(a&&a.closest&&a.closest('#view')&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))&&!$('#mbg').classList.contains('open')){precisaRender=false;render();}},200);});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#cbg').classList.contains('open'))closeModal();if(ev.key==='Enter'&&ev.target.id==='and-txt')A.addAnd(ui.id);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)puxar(false);});
/* drag & drop dos kanbans */
let dragKey=null;
document.addEventListener('dragstart',ev=>{const c=ev.target.closest&&ev.target.closest('[data-drag]');if(c){dragKey=c.dataset.drag;ev.dataTransfer.setData('text/plain',dragKey);ev.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',ev=>{const col=ev.target.closest&&ev.target.closest('[data-drop]');if(col&&dragKey&&col.dataset.drop.split(':')[0]===dragKey.split(':')[0]){ev.preventDefault();document.querySelectorAll('.kcol.over').forEach(c=>c!==col&&c.classList.remove('over'));col.classList.add('over');}});
document.addEventListener('dragleave',ev=>{const col=ev.target.closest&&ev.target.closest('[data-drop]');if(col&&!col.contains(ev.relatedTarget))col.classList.remove('over');});
document.addEventListener('drop',ev=>{const col=ev.target.closest&&ev.target.closest('[data-drop]');if(col&&dragKey){ev.preventDefault();const[kind,id]=dragKey.split(':');const target=col.dataset.drop.slice(kind.length+1);dragKey=null;moveCard(kind,id,target);}});
document.addEventListener('dragend',()=>{dragKey=null;document.querySelectorAll('.kcol.over').forEach(c=>c.classList.remove('over'));});
/* busca global */
$('#q').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase(),box=$('#sres');if(q.length<2){box.classList.remove('open');return;}
  const dq=digits(q);
  const cs=db.clientes.filter(c=>c.nome.toLowerCase().includes(q)||(dq.length>=3&&digits(c.doc+' '+c.tel).includes(dq))).slice(0,6);
  const ls=db.leads.filter(l=>!l.convertido&&l.nome.toLowerCase().includes(q)).slice(0,4);
  const ps=db.processos.filter(p=>(p.numero+' '+p.objeto+' '+p.parteContraria).toLowerCase().includes(q)||(dq.length>=3&&digits(p.numero).includes(dq))).slice(0,6);
  box.innerHTML=cs.map(c=>`<a href="#cliente/${c.id}">${esc(c.nome)}<small>Cliente · ${esc(c.doc||c.tel)}</small></a>`).join('')+ls.map(l=>`<a href="#atendimentos" data-lead="${l.id}">${esc(l.nome)}<small>Atendimento · ${esc(l.etapa)}</small></a>`).join('')+ps.map(p=>`<a href="#processo/${p.id}">${esc(p.numero)}<small>Processo · ${esc(nomeCli(p.clienteId))} · ${esc(p.objeto)}</small></a>`).join('')||'<div class="empty">Nada encontrado</div>';
  box.classList.add('open');
});
$('#sres').addEventListener('click',e=>{const a=e.target.closest('a');if(a){$('#sres').classList.remove('open');$('#q').value='';if(a.dataset.lead)setTimeout(()=>editLead(a.dataset.lead),60);}});
$('#menu-btn').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#scrim').classList.add('open');});
$('#file-import').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d.clientes)||!Array.isArray(d.lancamentos))throw 0;
  confirmar('Substituir os dados atuais pelo conteúdo do backup?','Substituir').then(ok=>{if(!ok)return;const atual=db.usuarioAtual;db=migrar(d);db.usuarioAtual=atual||db.usuarios[0]?.id||'';save();location.hash='painel';render();toast('Backup importado ✓');});}catch(err){toast('Arquivo de backup inválido',1);}e.target.value='';};r.readAsText(f);});
$('#file-anexo').addEventListener('change',async e=>{const f=e.target.files[0];const id=e.target.dataset.doc;e.target.value='';if(!f)return;const d=db.documentos.find(x=>x.id===id);if(!d)return;
  try{toast('Enviando para o Google Drive…');const pasta=await drivePastaCliente(d.clienteId);const r=await driveUpload(f,d.nome+' — '+f.name,pasta);
    Object.assign(d,{link:r.webViewLink,arquivo:f.name,recebido:true,data:d.data||today()});save();render();toast('Arquivo anexado ao Google Drive ✓');}catch(err){gErro(err);}});
$('#file-logo').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(!f)return;lerImagem(f,900).then(u=>{db.escritorio.logo=u;save();render();toast('Logotipo atualizado ✓');}).catch(err=>toast(err.message,1));});
$('#file-marca').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(!f)return;lerImagem(f,1414).then(u=>{db.escritorio.marcaDagua=u;db.escritorio.semMarca=false;save();render();toast("Marca d'água atualizada ✓");}).catch(err=>toast(err.message,1));});
document.addEventListener('click',e=>{const b=e.target.closest('[data-login]');if(b){$('#l-email').value=b.dataset.login;$('#l-senha').value='demo1234';$('#login-form').requestSubmit();}});
$('#file-wa').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)lerArquivoWa(f);});
$('#file-xlsx').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)iniciarImportacao(f);});
$('#login-form').addEventListener('submit',e=>{e.preventDefault();$('#l-err').textContent='';
  api('login',{email:$('#l-email').value,senha:$('#l-senha').value}).then(r=>{$('#l-senha').value='';entrar(r.usuario);}).catch(err=>{$('#l-err').textContent=err.msg||'Não foi possível entrar. Verifique a conexão.';});});
window.addEventListener('hashchange',()=>{closeModal();render();window.scrollTo(0,0);});
window.addEventListener('resize',()=>{const g=$('#cli-grid');if(g)g.style.gridTemplateColumns=innerWidth<860?'minmax(0,1fr)':'minmax(0,320px) minmax(0,1fr)';const d=$('#doc-grid');if(d)d.style.gridTemplateColumns=innerWidth<860?'minmax(0,1fr)':'minmax(0,330px) minmax(0,1fr)';});

iniciar();
