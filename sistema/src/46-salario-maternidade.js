/* =========================================================
   SALÁRIO-MATERNIDADE (rota #sm e ficha #sm/<id>)
   - quadro com 6 colunas e "próxima ação" em cada card;
   - guias com vencimento calculado (dia útil) e valor pelo mínimo vigente;
   - financeiro do caso reconciliado sozinho: honorários e reembolso de guia
     ficam "aguardando benefício" até a cliente receber a parcela do INSS;
   - aba "A receber" para saber quanto cobrar de quem.
   ========================================================= */
const SM_MAPA_ANTIGO={'Triagem / viabilidade':'Documentos','Coleta de documentos':'Documentos','Guias em andamento':'Guia a pagar','Aguardando o parto':'Aguardando parto',
  'Pronto para protocolo':'No INSS','Protocolado — em análise':'No INSS','Em exigência':'No INSS','Deferido':'Deferido — a receber','Concluído':'Encerrado','Indeferido':'Encerrado','Recurso / judicial':'Encerrado'};
const SM_DESFECHOS=['Concluído','Indeferido','Recurso / judicial'];
const SM_SIGLA=c=>{const x=norm(c||'');return /mei/.test(x)?'MEI':/contribuinte/.test(x)?'CI':/facultativ/.test(x)?'FAC':/desempreg/.test(x)?'DESEMP':/clt|empregada/.test(x)?'CLT':/rural|especial/.test(x)?'RURAL':/domestic/.test(x)?'DOM':/definir/.test(x)?'?':(c||'').slice(0,6).toUpperCase();};
const SALARIO_MINIMO={2024:1412,2025:1518,2026:1621};
const salarioMinimoDe=comp=>SALARIO_MINIMO[+String(comp||today()).slice(0,4)]||+db.escritorio.salarioMinimo||1621;
const pctCodigo=cod=>(GPS_CODIGOS.find(x=>x[0]===cod)||[0,0,0])[2];
function codigoPadraoSm(cat){const x=norm(cat||'');return /mei/.test(x)?'DAS-MEI':/contribuinte/.test(x)?'1007':'1406';}
/* vencimento: dia 15 do mês seguinte (DAS do MEI: dia 20); se não for dia útil, o próximo dia útil */
function vencGuia(comp,cod){let d=ymAdd(comp,1)+'-'+(cod==='DAS-MEI'?'20':'15');while(!ehDiaUtil(d,{recesso:false}))d=addDays(1,d);return d;}
const valorGuia=(comp,cod)=>Math.round(salarioMinimoDe(comp)*pctCodigo(cod))/100;
function guiaStatus(g){if(g.pagaEm)return 'Paga';if(g.emitidaEm)return diff(g.venc)<0?'Vencida':'Emitida';return diff(g.venc)<0?'Vencida':'A emitir';}
const mesParto=c=>(c.dataParto||c.dpp||'').slice(0,7);
/* alertas de uma guia: paga em atraso, competência depois do parto, código fora da lista */
function alertasGuia(c,g){
  const a=[];
  if(g.pagaEm&&g.venc&&g.pagaEm>g.venc)a.push(['r',`Paga em atraso (${fd(g.pagaEm)}, vencia ${fd(g.venc)}): pagamento em atraso de facultativa não conta para a qualidade de segurada nem para a carência.`]);
  if(mesParto(c)&&g.competencia>mesParto(c))a.push(['a',`Competência ${mLabel(g.competencia)} é depois do parto (${fd(c.dataParto||c.dpp)}): não serve para a qualidade de segurada.`]);
  if(g.codigo==='Outro'&&!g.codigoDesc)a.push(['a','Código "Outro" sem descrição.']);
  return a;
}
const smEncerrado=c=>c.status==='Encerrado';
const smAtivo=c=>!smEncerrado(c);

/* ---------- migração das 11 etapas antigas para as 6 novas (uma vez por caso, sem perder o histórico) ---------- */
function migrarSm(d){
  const hoje=today();let mudou=false;
  (d.sm||[]).forEach(c=>{
    if(!Array.isArray(c.guias))c.guias=[];
    if(!SM_STATUS.includes(c.status)){const ant=c.status||'';const novo=SM_MAPA_ANTIGO[ant]||'Documentos';
      c.statusAntigo=ant;c.status=novo;if(SM_DESFECHOS.includes(ant))c.desfecho=ant;
      if(ant==='Em exigência'&&!c.exigencia)c.exigencia={aberta:true,descricao:'Exigência em aberto (anotada antes da mudança do quadro)',prazo:'',abertaEm:hoje};
      if(ant==='Indeferido'&&!c.desfecho)c.desfecho='Indeferido';
      (c.historico=c.historico||[]).push({de:ant,para:novo,em:Date.now(),por:'mudança do quadro (6 colunas)'});mudou=true;}
    // data do parto no futuro é DPP
    if(c.dataParto&&c.dataParto>hoje){if(!c.dpp)c.dpp=c.dataParto;c.dataParto='';mudou=true;}
    // guias: vencimento pela regra e código da lista (uma vez)
    if(!c.guiasRevisadas){c.guias.forEach(g=>{if(!GPS_CODIGOS.some(x=>x[0]===g.codigo)){g.codigoDesc=g.codigo||'';g.codigo='Outro';}
      if(/^\d{4}-\d{2}$/.test(g.competencia||'')&&g.codigo!=='Outro'){const v=vencGuia(g.competencia,g.codigo);if(g.venc!==v){g.vencAnterior=g.venc||'';g.venc=v;}}});c.guiasRevisadas=1;mudou=true;}
  });
  return mudou;
}

/* ---------- financeiro do caso (reconciliado sozinho; ids fixos: nunca duplica) ---------- */
const smContrato=c=>db.contratos.filter(k=>k.clienteId===c.clienteId&&/maternidade/i.test(k.produto||'')).sort((a,b)=>String(b.data).localeCompare(String(a.data)))[0];
function honorariosSm(c){
  if(c.desfecho==='Indeferido'||(smEncerrado(c)&&c.desfecho!=='Concluído'))return null;
  const k=smContrato(c);
  if(k&&db.lancamentos.some(l=>l.contratoId===k.id&&!l.smId))return null; // o contrato já gerou as parcelas no financeiro
  let n,val,pct;
  if(k&&+k.parcelas>0&&valorParcela(k)>0){n=Math.round(+k.parcelas);val=valorParcela(k);pct=+k.exitoPct||0;}
  else{pct=c.honorariosPct!==undefined&&c.honorariosPct!==''?+c.honorariosPct:(+db.escritorio.smHonorariosPct||25);const base=+c.valorConcedido||+c.beneficioEstimado||0;
    n=Math.max(1,Math.round(+c.parcelasHonorarios||2));if(!base||!pct)return null;val=Math.round(base*pct/100/n*100)/100;}
  return {n,val,pct,contratoId:k?.id||'',total:Math.round(n*val*100)/100,doContrato:!!k&&+k.parcelas>0};
}
const vencAguardando=c=>c.previsaoPagamento&&c.previsaoPagamento>addDays(1)?c.previsaoPagamento:addDays(30);
function smReconciliar(d){
  if(!d||!Array.isArray(d.sm)||!podeFin())return false;
  let mudou=false;const L=d.lancamentos;const porId=new Map(L.map(l=>[l.id,l]));
  const garantir=(id,dados)=>{const l=porId.get(id);
    if(!l){const n={id,tipo:'receita',forma:'PIX',produto:'Salário-maternidade',obs:'',pagoEm:'',pago:false,auto:true,criado:today(),...dados};L.push(n);porId.set(id,n);mudou=true;return n;}
    if(l.pago||!l.auto)return l;
    for(const k in dados)if(JSON.stringify(l[k])!==JSON.stringify(dados[k])){l[k]=dados[k];mudou=true;}
    return l;};
  const remover=id=>{const l=porId.get(id);if(l&&!l.pago&&l.auto){d.lancamentos.splice(d.lancamentos.indexOf(l),1);porId.delete(id);mudou=true;}};
  d.sm.forEach(c=>{
    const h=honorariosSm(c),parc=c.parcelasInss||[];
    const liberar=i=>{const p=parc[i-1];return p&&p.recebidaEm?calcularPrazo(p.recebidaEm,5,{recesso:false}):'';};
    for(let i=1;i<=12;i++){const id='sm'+c.id+'h'+i;
      if(h&&i<=h.n){const lib=liberar(i);garantir(id,{categoria:'H.O. finais — êxito',descricao:`Honorários salário-maternidade — parcela ${i}/${h.n}`,clienteId:c.clienteId,contratoId:h.contratoId,
        valor:h.val,venc:lib||vencAguardando(c),aguardandoBeneficio:!lib,smId:c.id,smTipo:'honorarios',smParcela:i});}
      else remover(id);}
    const libReemb=liberar(1);
    c.guias.forEach(g=>{const id='sm'+c.id+'g'+g.id;
      if(g.pagaEm&&/escrit/i.test(g.quemPaga||'')&&c.desfecho!=='Indeferido')garantir(id,{categoria:'Reembolso de custas',descricao:`Reembolso guia comp. ${mLabel(g.competencia)}`,clienteId:c.clienteId,contratoId:'',
        valor:+g.valor||0,venc:libReemb||vencAguardando(c),aguardandoBeneficio:!libReemb,smId:c.id,smTipo:'reembolso',guiaId:g.id});
      else remover(id);});
  });
  // lançamentos automáticos de casos apagados ou de guias apagadas
  d.lancamentos.filter(l=>l.auto&&l.smId&&!l.pago).forEach(l=>{const c=d.sm.find(x=>x.id===l.smId);if(!c||(l.smTipo==='reembolso'&&!c.guias.some(g=>g.id===l.guiaId)))remover(l.id);});
  return mudou;
}
const lancSm=c=>db.lancamentos.filter(l=>l.smId===c.id);
function financeiroSm(c){
  const ls=lancSm(c),hon=ls.filter(l=>l.smTipo==='honorarios'),ree=ls.filter(l=>l.smTipo==='reembolso');
  const aberto=x=>x.filter(l=>!l.pago);const cobravel=x=>aberto(x).filter(l=>!l.aguardandoBeneficio);
  return {ls,hon,ree,contratado:sumBy(hon,l=>l.valor),recebido:sumBy(ls.filter(l=>l.pago),l=>l.valor),honAberto:sumBy(aberto(hon),l=>l.valor),reeAberto:sumBy(aberto(ree),l=>l.valor),
    aCobrar:sumBy(cobravel(ls),l=>l.valor),cobravel:cobravel(ls),total:sumBy(aberto(ls),l=>l.valor),semHonorarios:!hon.length&&!honorariosSm(c)&&!smContrato(c)};
}

/* ---------- próxima ação e alertas do caso ---------- */
function proximaAcaoSm(c){
  if(smEncerrado(c))return {txt:c.desfecho?'Encerrado: '+c.desfecho:'Encerrado',data:'',sev:''};
  if(c.exigencia?.aberta)return {txt:'Responder exigência'+(c.exigencia.prazo?' até '+fd(c.exigencia.prazo):''),data:c.exigencia.prazo||today(),sev:'r'};
  const pend=db.documentos.filter(x=>x.clienteId===c.clienteId&&!x.recebido);
  if(c.status==='Documentos'){if(!db.documentos.some(x=>x.clienteId===c.clienteId))return {txt:'Montar o checklist de documentos',data:today(),sev:'a'};
    return pend.length?{txt:`Pedir ${pend.length} documento(s): ${pend[0].nome}${pend.length>1?'…':''}`,data:'',sev:''}:{txt:'Checklist completo: avançar a etapa',data:today(),sev:'a'};}
  if(c.status==='Guia a pagar'){const g=c.guias.filter(x=>!x.pagaEm).sort((a,b)=>a.venc.localeCompare(b.venc))[0];
    return g?{txt:`Pagar guia ${mLabel(g.competencia)} até ${fd(g.venc)}`,data:g.venc,sev:diff(g.venc)<0?'r':diff(g.venc)<=7?'a':''}:{txt:c.guias.length?'Guias pagas: avançar a etapa':'Cadastrar as guias',data:today(),sev:'a'};}
  if(c.status==='Aguardando parto')return c.dataParto?{txt:'Parto informado: protocolar no INSS',data:today(),sev:'a'}:{txt:'Pedir certidão — parto previsto '+fd(c.dpp),data:c.dpp||'',sev:c.dpp&&diff(c.dpp)<0?'a':''};
  if(c.status==='No INSS')return !(c.nb||c.der)?{txt:'Protocolar no Meu INSS',data:today(),sev:'a'}:{txt:`Acompanhar análise (DER ${fd(c.der)}${c.der?', '+(-diff(c.der))+' dias':''})`,data:'',sev:c.der&&diff(c.der)<-45?'a':''};
  if(c.status==='Deferido — a receber'){const f=financeiroSm(c);
    if(!f.hon.length&&!f.semHonorarios&&!honorariosSm(c))return {txt:'Cadastrar contrato de honorários',data:today(),sev:'a'};
    if(!f.hon.length)return {txt:'Informar valor do benefício e % de honorários',data:today(),sev:'a'};
    const cob=f.cobravel.sort((a,b)=>a.venc.localeCompare(b.venc))[0];
    if(cob)return {txt:`Cobrar ${cob.smTipo==='reembolso'?'reembolso':'parcela '+cob.smParcela} ${brl(cob.valor)}`,data:cob.venc,sev:diff(cob.venc)<0?'r':'a'};
    if(f.total>0)return {txt:'Aguardar pagamento do INSS'+(c.previsaoPagamento?' (previsão '+fd(c.previsaoPagamento)+')':''),data:'',sev:''};
    return {txt:'Tudo recebido: encerrar o caso',data:today(),sev:'a'};}
  return {txt:'',data:'',sev:''};
}
function etiquetasSm(c){
  const t=[];const gs=c.guias.filter(g=>!g.pagaEm);
  if(gs.some(g=>diff(g.venc)<0))t.push(['🔴','Guia vencida']);else if(gs.some(g=>diff(g.venc)<=7))t.push(['🟠','Guia vence em até 7 dias']);
  if(c.exigencia?.aberta)t.push(['🔴','Exigência'+(c.exigencia.prazo?' até '+fd(c.exigencia.prazo):'')]);
  if(podeFin()&&financeiroSm(c).aCobrar>0)t.push(['💰','A receber: '+brl(financeiroSm(c).aCobrar)]);
  return t;
}
/* incoerências da ficha */
function alertasCaso(c){
  const a=[];const pagas=c.guias.filter(g=>g.pagaEm);
  if(/per[ií]odo de gra[cç]a/i.test(c.estrategia||'')&&pagas.length)a.push(['a',`Estratégia "via período de graça", mas há ${pagas.length} guia(s) paga(s). Confira a estratégia.`]);
  if(/via guias/i.test(c.estrategia||'')&&!c.guias.length)a.push(['a','Estratégia "via guias", mas nenhuma guia cadastrada.']);
  if(c.status==='Aguardando parto'&&c.guias.some(g=>!g.pagaEm&&(!mesParto(c)||g.competencia<=mesParto(c))))a.push(['a','Está em "Aguardando parto", mas ainda há guia não paga antes do parto.']);
  if(/contribuinte|facultativ|mei/i.test(c.categoria||'')&&!c.guias.length&&smAtivo(c))a.push(['a',`Categoria ${c.categoria}: nenhuma guia cadastrada.`]);
  if(['No INSS','Deferido — a receber'].includes(c.status)&&!(c.nb||c.der)&&c.status!=='No INSS')a.push(['r','Deferido sem NB/protocolo e DER: complete o requerimento.']);
  const procs=db.processos.filter(p=>p.clienteId===c.clienteId&&/maternidade/i.test(p.objeto||''));if(procs.length>1)a.push(['a',`A cliente tem ${procs.length} processos de salário-maternidade: confira se há duplicidade.`]);
  const inap=docsInaplicaveis(c);if(inap.length)a.push(['a',`Documento(s) que não se aplicam a ${c.categoria}: ${inap.map(x=>x.nome).join('; ')}`]);
  c.guias.forEach(g=>alertasGuia(c,g).forEach(x=>a.push(x)));
  return a;
}

/* ---------- checklist conforme a categoria ---------- */
const SM_DOCS_BASE=['RG e CPF da segurada','Certidão de nascimento da criança (ou atestado/termo de guarda)','CNIS atualizado','Comprovante de residência'];
const SM_DOCS_CAT=[[/clt|empregada|domestic/,['Carteira de trabalho / contratos','Últimos holerites']],[/desempreg/,['Carteira de trabalho (última saída)','Termo de rescisão (TRCT)','Comprovante de seguro-desemprego (se recebeu)']],
  [/contribuinte|facultativ/,['Comprovantes de recolhimento (guias pagas)']],[/mei/,['Comprovante de inscrição MEI (CCMEI)','DAS pagos']],[/rural|especial/,['Autodeclaração de segurada especial (rural)','Documentos da atividade rural (ITR, notas, contrato de parceria)']]];
const docsDaCategoria=cat=>{const x=norm(cat||'');return SM_DOCS_BASE.concat(...SM_DOCS_CAT.filter(([re])=>re.test(x)).map(([,l])=>l));};
const SM_DOCS_ESPECIFICOS=[[/rural|segurada especial|atividade rural|itr/i,/rural|especial/],[/mei|das\b|ccmei/i,/mei/]];
function docsInaplicaveis(c){const cat=norm(c.categoria||'');if(/definir/.test(cat))return [];
  return db.documentos.filter(d=>d.clienteId===c.clienteId&&SM_DOCS_ESPECIFICOS.some(([reDoc,reCat])=>reDoc.test(d.nome)&&!reCat.test(cat)));}

/* ---------- formulários ---------- */
function editSm(id,pre){
  const c=id?db.sm.find(x=>x.id===id):{status:'Documentos',categoria:SM_CATEG[0],responsavelId:db.usuarioAtual,guias:[],beneficioEstimado:Math.round(salarioMinimoDe(today())*4),honorariosPct:+db.escritorio.smHonorariosPct||25,parcelasHonorarios:2,...pre};
  form(id?'Editar caso de salário-maternidade':'Novo caso de salário-maternidade',[
    {k:'clienteId',l:'Segurada (cliente)',t:'select',o:O.clientes,req:1,full:1},
    {k:'categoria',l:'Categoria da segurada',t:'select',o:SM_CATEG,req:1},{k:'estrategia',l:'Estratégia',t:'select',o:SM_ESTRAT},
    {k:'status',l:'Etapa',t:'select',o:SM_STATUS,req:1},{k:'desfecho',l:'Desfecho (se encerrado)',t:'select',o:SM_DESFECHOS},{k:'responsavelId',l:'Responsável',t:'select',o:O.usuarios},
    {t:'sec',l:'Gestação e criança'},
    {k:'dpp',l:'Data provável do parto (DPP)',t:'date'},{k:'dataParto',l:'Data do parto / adoção',t:'date',dica:'Só depois do nascimento (não pode ser no futuro).'},
    {k:'crianca',l:'Nome da criança'},{k:'carenciaMeses',l:'Carência exigida (nº de contribuições)',t:'number',dica:'CLT, doméstica e avulsa: em regra, sem carência. Contribuinte individual, facultativa e MEI: confira as regras vigentes.'},
    {t:'sec',l:'INSS'},
    {k:'qualidadeAte',l:'Qualidade de segurada até',t:'date'},{k:'nb',l:'NB / protocolo'},{k:'der',l:'DER — data do requerimento',t:'date'},
    {t:'sec',l:'✅ Deferimento'},{k:'dataDeferimento',l:'Data do deferimento',t:'date'},{k:'dib',l:'DIB — início do benefício',t:'date'},
    {k:'valorConcedido',l:'Valor total concedido (R$)',t:'number'},{k:'previsaoPagamento',l:'Previsão da 1ª parcela do INSS',t:'date'},
    {t:'sec',l:'💰 Honorários deste caso'},{k:'beneficioEstimado',l:'Valor total estimado do benefício (R$)',t:'number'},
    {k:'honorariosPct',l:'Honorários (% do benefício)',t:'number',dica:'Contratos atuais: 25%. Contratos antigos podem ser 20%. Se houver contrato de salário-maternidade com parcelas, ele vale.'},
    {k:'parcelasHonorarios',l:'Honorários em quantas parcelas',t:'number'},
    {k:'obs',l:'Observações',t:'textarea',full:1,rows:2}],
    c,v=>{if(v.dataParto&&v.dataParto>today()){toast('A data do parto não pode ser no futuro: use a DPP.',1);$('#f_dataParto')?.classList.add('err');return false;}
      if(v.status==='Encerrado'&&!v.desfecho){toast('Escolha o desfecho do caso encerrado',1);return false;}
      if(v.status==='Deferido — a receber'&&!v.nb){toast('Para deferido, informe o NB/protocolo.',1);$('#f_nb')?.classList.add('err');return false;}
      if(v.status==='Deferido — a receber'&&!v.dataDeferimento)v.dataDeferimento=today();
      if(v.status==='Deferido — a receber'&&c.status!=='Deferido — a receber')setTimeout(()=>celebrarEvento('deferido','Benefício deferido!',nomeCli(v.clienteId||c.clienteId)),200);
      if(id&&v.status!==c.status)(c.historico=c.historico||[]).push({de:c.status,para:v.status,em:Date.now(),por:nomeUsr(db.usuarioAtual)});
      const nid=upsert('sm',id,v,{guias:[],historico:[{de:'',para:v.status,em:Date.now(),por:nomeUsr(db.usuarioAtual)}],guiasRevisadas:1});
      if(!id){garantirDocsSm(db.sm.find(x=>x.id===nid));location.hash='sm/'+nid;}
      setTimeout(()=>smSugerir(db.sm.find(x=>x.id===nid)),400);},
    id&&(()=>{db.sm=db.sm.filter(x=>x.id!==id);if(ui.page==='sm'&&ui.id)location.hash='sm';}));
}
/* lead de salário-maternidade convertido: o caso nasce em "Documentos", com a triagem e o checklist */
function criarCasoSmDoLead(l,clienteId){
  if(db.sm.some(x=>x.clienteId===clienteId&&smAtivo(x)))return null;
  const c={id:uid(),clienteId,status:'Documentos',categoria:'A definir (triagem)',estrategia:'',responsavelId:l.responsavelId||db.usuarioAtual,guias:[],guiasRevisadas:1,leadId:l.id,
    dpp:l.dpp||'',beneficioEstimado:Math.round(salarioMinimoDe(today())*4),honorariosPct:+db.escritorio.smHonorariosPct||25,parcelasHonorarios:2,
    obs:[l.resumoTriagem||l.resumo||'',l.obs||''].filter(Boolean).join('\n'),historico:[{de:'',para:'Documentos',em:Date.now(),por:'conversão do lead'}]};
  db.sm.push(c);garantirDocsSm(c);return c.id;
}
function garantirDocsSm(c){if(!c)return 0;let n=0;docsDaCategoria(c.categoria).forEach(nome=>{if(!db.documentos.some(d=>d.clienteId===c.clienteId&&norm(d.nome)===norm(nome))){db.documentos.push({id:uid(),clienteId:c.clienteId,nome,recebido:false,data:''});n++;}});return n;}
function editGuia(smId,gid){
  const caso=db.sm.find(x=>x.id===smId);const cod=codigoPadraoSm(caso.categoria);
  const g=gid?caso.guias.find(x=>x.id===gid):{competencia:today().slice(0,7),codigo:cod,quemPaga:'Cliente'};
  const calc=(comp,c)=>`Vencimento: <b>${fd(vencGuia(comp,c))}</b> · valor sugerido: <b>${c==='Outro'?'—':brl(valorGuia(comp,c))}</b> (${pctCodigo(c)}% de ${brl(salarioMinimoDe(comp))}, mínimo de ${String(comp).slice(0,4)})`;
  form(gid?'Editar guia':'Nova guia de recolhimento',[
    {k:'competencia',l:'Competência (mês/ano)',t:'month',req:1},{k:'codigo',l:'Código de pagamento',t:'select',o:GPS_CODIGOS.map(x=>[x[0],x[0]+' — '+x[1]]),req:1},
    {k:'codigoDesc',l:'Descrição (se "Outro")'},{k:'valor',l:'Valor (R$)',t:'number',dica:'Em branco: calculado pelo código sobre o salário mínimo da competência.',vazio:''},
    {t:'sec',l:'',html:`<div class="small" id="guia-calc" style="color:var(--brand)">${calc(g.competencia,g.codigo)}</div>`},
    {k:'emitidaEm',l:'Emitida em',t:'date'},{k:'pagaEm',l:'Paga em',t:'date'},
    {k:'quemPaga',l:'Quem paga',t:'select',o:['Cliente','Escritório (reembolsável)'],dica:'Guia paga pelo escritório vira reembolso a receber da cliente.'},{k:'link',l:'Link da guia / comprovante',t:'url'},{k:'obs',l:'Observação',full:1}],
    {...g,valor:gid?g.valor:''},v=>{
      if(v.codigo==='Outro'&&!v.codigoDesc){toast('Descreva o código "Outro"',1);return false;}
      v.venc=vencGuia(v.competencia,v.codigo==='Outro'?'1406':v.codigo);
      if(v.valor===''||v.valor==null){if(v.codigo==='Outro'){toast('Informe o valor',1);return false;}v.valor=valorGuia(v.competencia,v.codigo);}
      if(v.pagaEm&&v.pagaEm>today()){toast('"Paga em" não pode ser no futuro',1);return false;}
      if(gid)Object.assign(g,v);else caso.guias.push({id:uid(),...v});caso.guias.sort((a,b)=>a.competencia.localeCompare(b.competencia));
      const al=alertasGuia(caso,{...v});if(al.length)setTimeout(()=>toast('⚠ '+al[0][1],1),300);setTimeout(()=>smSugerir(caso),600);},
    gid&&(()=>{caso.guias=caso.guias.filter(x=>x.id!==gid);}));
  const atual=()=>{const el=$('#guia-calc');if(el)el.innerHTML=calc($('#f_competencia').value||today().slice(0,7),$('#f_codigo').value);};
  $('#f_competencia')?.addEventListener('input',atual);$('#f_codigo')?.addEventListener('change',atual);
}
function gerarGuias(smId){
  const caso=db.sm.find(x=>x.id===smId);
  form('Gerar guias em lote',[
    {k:'inicio',l:'Primeira competência',t:'month',req:1},{k:'qtd',l:'Quantidade de meses',t:'number',req:1},
    {k:'codigo',l:'Código',t:'select',o:GPS_CODIGOS.filter(x=>x[0]!=='Outro').map(x=>[x[0],x[0]+' — '+x[1]]),req:1},
    {k:'quemPaga',l:'Quem paga',t:'select',o:['Cliente','Escritório (reembolsável)']}],
    {inicio:today().slice(0,7),qtd:Math.max(1,(+caso.carenciaMeses||10)-caso.guias.filter(g=>g.pagaEm).length),codigo:codigoPadraoSm(caso.categoria),quemPaga:'Cliente'},v=>{
      let n=0,depois=0;
      for(let i=0;i<Math.min(60,Math.round(v.qtd));i++){const comp=ymAdd(v.inicio,i);if(caso.guias.some(g=>g.competencia===comp))continue;if(mesParto(caso)&&comp>mesParto(caso))depois++;
        caso.guias.push({id:uid(),competencia:comp,codigo:v.codigo,valor:valorGuia(comp,v.codigo),venc:vencGuia(comp,v.codigo),emitidaEm:'',pagaEm:'',quemPaga:v.quemPaga,link:'',obs:''});n++;}
      caso.guias.sort((a,b)=>a.competencia.localeCompare(b.competencia));toast(n+' guia(s) criada(s)'+(depois?` · ⚠ ${depois} depois do parto (não servem para a qualidade de segurada)`:''),depois?1:0);});
}

/* ---------- mudança de etapa (pede os dados quando precisa) ---------- */
function smMover(c,nova,dados){
  const ant=c.status;if(ant===nova&&!dados)return;
  Object.assign(c,dados||{});c.status=nova;(c.historico=c.historico||[]).push({de:ant,para:nova,em:Date.now(),por:nomeUsr(db.usuarioAtual)});
  if(nova==='Deferido — a receber'&&ant!==nova){if(!c.dataDeferimento)c.dataDeferimento=today();celebrarEvento('deferido','Benefício deferido!',nomeCli(c.clienteId));}
  save();render();toast('Etapa: '+nova);setTimeout(()=>smSugerir(c),500);
}
function smPedirMover(id,nova){
  const c=db.sm.find(x=>x.id===id);if(!c||c.status===nova)return render();
  if(nova==='Encerrado')return form('Encerrar o caso',[{k:'desfecho',l:'Desfecho',t:'select',o:SM_DESFECHOS,req:1,dica:'Indeferido com recurso ou ação: escolha "Recurso / judicial" para abrir o processo no Contencioso.'}],{desfecho:c.desfecho||'Concluído'},v=>{
    setTimeout(()=>{smMover(c,'Encerrado',{desfecho:v.desfecho});if(v.desfecho==='Recurso / judicial'&&!db.processos.some(p=>p.clienteId===c.clienteId&&p.tipo==='Judicial'&&/maternidade/i.test(p.objeto||'')))
      setTimeout(()=>editProcesso(null,{clienteId:c.clienteId,tipo:'Judicial',area:'Previdenciário',objeto:'Salário-maternidade — ação contra o indeferimento',parteContraria:'INSS'}),500);},50);});
  if(nova==='No INSS')return form('Requerimento no INSS',[{k:'nb',l:'Nº do protocolo / NB',dica:'Em branco se ainda vai protocolar.'},{k:'der',l:'DER — data do requerimento',t:'date'}],{nb:c.nb,der:c.der},v=>{
    if(v.nb&&!v.der){toast('Com protocolo, informe também a DER',1);return false;}setTimeout(()=>smMover(c,'No INSS',v),50);});
  if(nova==='Deferido — a receber')return form('Benefício deferido 🎉',[{k:'nb',l:'NB / protocolo',req:1},{k:'der',l:'DER — data do requerimento',t:'date',req:1},{k:'dataDeferimento',l:'Data do deferimento',t:'date',req:1},
      {k:'valorConcedido',l:'Valor total do benefício (R$)',t:'number',req:1},{k:'qtdParcelasInss',l:'Em quantas parcelas o INSS vai pagar',t:'number'},{k:'previsaoPagamento',l:'Previsão da 1ª parcela',t:'date'}],
    {nb:c.nb,der:c.der,dataDeferimento:c.dataDeferimento||today(),valorConcedido:c.valorConcedido||c.beneficioEstimado,qtdParcelasInss:c.qtdParcelasInss||(+c.parcelasHonorarios||2),previsaoPagamento:c.previsaoPagamento},v=>{
      const n=Math.max(1,Math.round(+v.qtdParcelasInss||1));const atual=c.parcelasInss||[];
      v.parcelasInss=Array.from({length:n},(_,i)=>atual[i]||{n:i+1,recebidaEm:'',previsao:v.previsaoPagamento?addMonths(v.previsaoPagamento,i):''});
      setTimeout(()=>smMover(c,'Deferido — a receber',v),50);});
  smMover(c,nova);
}
/* sugestões de etapa (não bloqueiam) */
function smSugerir(c){
  if(!c||smEncerrado(c))return;
  const todasPagas=c.guias.length&&c.guias.every(g=>g.pagaEm||(mesParto(c)&&g.competencia>mesParto(c)));
  if(c.status==='Guia a pagar'&&todasPagas&&c.dpp&&!c.dataParto&&diff(c.dpp)>0)return toastAcao(`${nomeCli(c.clienteId)}: guias pagas e parto previsto. Mover para "Aguardando parto"?`,'Mover',()=>smMover(c,'Aguardando parto'));
  if(c.dataParto&&['Documentos','Guia a pagar','Aguardando parto'].includes(c.status))return toastAcao(`${nomeCli(c.clienteId)}: parto informado. Mover para "No INSS"?`,'Mover',()=>smPedirMover(c.id,'No INSS'));
}

/* ---------- telas ---------- */
const smCor=s=>/Deferido|Concluído/.test(s)?'p-green':/Indeferido/.test(s)?'p-red':/INSS/.test(s)?'p-blue':/Guia/.test(s)?'p-amber':/Encerrado/.test(s)?'p-gray':'p-gray';
const guiaCor=s=>s==='Paga'?'p-green':s==='Vencida'?'p-red':s==='Emitida'?'p-blue':'p-amber';
function guiasPendentes(dias){const out=[];db.sm.filter(smAtivo).forEach(c=>(c.guias||[]).forEach(g=>{const st=guiaStatus(g);if(st!=='Paga'&&diff(g.venc)<=dias)out.push({c,g,st});}));return out.sort((a,b)=>a.g.venc.localeCompare(b.g.venc));}
function guiaBotoes(c,g,st){
  return `${st==='A emitir'||st==='Vencida'&&!g.emitidaEm?`<button class="btn btn-ghost btn-sm" data-act="guiaEmitida" data-id="${c.id}|${g.id}">Emitida</button>`:''}${st!=='Paga'?`<button class="btn btn-ghost btn-sm" data-act="guiaPaga" data-id="${c.id}|${g.id}">Paga</button>`:''}${g.link?`<a class="btn btn-ghost btn-sm" href="${esc(g.link)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir</a>`:''}<button class="btn btn-sm lnk" data-act="editGuia" data-id="${c.id}|${g.id}">editar</button>`;
}
const codGuia=g=>g.codigo==='Outro'?'Outro: '+(g.codigoDesc||'?'):g.codigo;
/* indicadores do topo: todos clicáveis, com a regra no "title" */
function kpisSm(){
  const ativos=db.sm.filter(smAtivo);const hoje=today();
  const acaoHoje=ativos.filter(c=>{const p=proximaAcaoSm(c);return p.data&&p.data<=hoje;});
  const g7=guiasPendentes(7),venc=g7.filter(x=>x.st==='Vencida');
  const partos=ativos.filter(c=>!c.dataParto&&c.dpp&&diff(c.dpp)>=0&&diff(c.dpp)<=30);
  const inss=ativos.filter(c=>c.status==='No INSS'),exig=inss.filter(c=>c.exigencia?.aberta);
  const fin=podeFin();const fs=db.sm.map(financeiroSm);const ym=hoje.slice(0,7);
  const aRec=sumBy(fs,f=>f.aCobrar),recMes=sumBy(db.lancamentos.filter(l=>l.smId&&l.pago&&String(l.pagoEm||'').startsWith(ym)),l=>l.valor);
  const k=(id,l,v,s,cls,regra)=>`<div class="card kpi kpi-clic${ui.f.sm?.filtro===id?' ativo':''}" data-act="smFiltro" data-id="${id}" title="${esc(regra)}" role="button" tabindex="0"><div class="l">${l}</div><div class="v">${v}</div><div class="s ${cls||''}">${s||'&nbsp;'}</div></div>`;
  return {ativos,acaoHoje,g7,partos,inss,exig,
    html:k('acao','Ação hoje',acaoHoje.length,'próxima ação vencida ou para hoje',acaoHoje.length?'bad':'good','Casos (não encerrados) cuja próxima ação tem data até hoje.')
      +k('guias','Guias a pagar (7 dias)',g7.length,venc.length?venc.length+' vencida(s)!':'nenhuma vencida',venc.length?'bad':'good','Guias não pagas com vencimento em até 7 dias (inclui as vencidas), de casos não encerrados.')
      +k('partos','Partos em 30 dias',partos.length,'DPP sem data de parto','','Casos com DPP entre hoje e daqui a 30 dias e sem data do parto.')
      +k('inss','No INSS',inss.length,exig.length+' com exigência',exig.length?'bad':'','Casos na coluna "No INSS". O subtítulo conta os que têm exigência em aberto.')
      +(fin?k('receber','A receber',brlK(aRec),'liberado para cobrar',aRec?'bad':'good','Honorários e reembolsos de guia já liberados (a cliente recebeu a parcela do INSS) e ainda não pagos.')
        +k('recebido','Recebido no mês',brlK(recMes),MESES_L[+ym.slice(5)-1],'good','Honorários e reembolsos de salário-maternidade pagos neste mês.'):'')};
}
V.sm=()=>{
  if(ui.id)return smCaso(ui.id);
  const f=ui.f.sm||(ui.f.sm={filtro:'',encerrados:false});const t=ui.tabSm||'casos';const K=kpisSm();
  let lista=db.sm;const titFiltro={acao:'com ação para hoje',guias:'com guia a pagar em 7 dias',partos:'com parto em 30 dias',inss:'no INSS'}[f.filtro];
  if(f.filtro==='acao')lista=K.acaoHoje;if(f.filtro==='guias')lista=[...new Set(K.g7.map(x=>x.c))];if(f.filtro==='partos')lista=K.partos;if(f.filtro==='inss')lista=K.inss;
  let corpo='';
  if(t==='casos'){const enc=db.sm.filter(smEncerrado).length;const cols=SM_STATUS.filter(s=>s!=='Encerrado'||f.encerrados);
    corpo=`${titFiltro?`<div class="hint">Mostrando só os casos ${titFiltro} (${lista.length}). <button class="btn btn-sm lnk" data-act="smFiltro" data-id="">mostrar todos</button></div>`:''}
    ${kanban(cols.map(s=>[s,s]),lista.filter(c=>f.encerrados||smAtivo(c)).map(c=>({...c,_col:c.status})),'sm',cardSm)}
    <div class="small muted" style="margin-top:6px"><label class="chk"><input type="checkbox" data-act="smEncerrados"${f.encerrados?' checked':''}> Mostrar a coluna "Encerrado" (${enc})</label></div>`;}
  if(t==='guias'){const fg=ui.f.guias||(ui.f.guias={st:'pendentes'});
    const todas=[];db.sm.forEach(c=>(c.guias||[]).forEach(g=>todas.push({c,g,st:guiaStatus(g)})));
    const ls=todas.filter(x=>fg.st==='todas'||(fg.st==='pendentes'?x.st!=='Paga'&&smAtivo(x.c):fg.st==='alertas'?alertasGuia(x.c,x.g).length:x.st===fg.st)).sort((a,b)=>a.g.venc.localeCompare(b.g.venc));
    corpo=`<div class="toolbar"><select data-f="guias.st">${[['pendentes','Não pagas'],['A emitir','A emitir'],['Emitida','Emitidas (aguardando pagamento)'],['Vencida','Vencidas'],['Paga','Pagas'],['alertas','⚠ Com alerta'],['todas','Todas']].map(([v,l])=>`<option value="${v}"${fg.st===v?' selected':''}>${l}</option>`).join('')}</select>
      <span class="small muted">Vencimento calculado: dia 15 do mês seguinte (DAS-MEI: dia 20), ou o próximo dia útil. Valor sobre o mínimo da competência (2026: ${brl(SALARIO_MINIMO[2026])}).</span></div>
    <div class="card tbl"><table><thead><tr><th>Segurada</th><th>Competência</th><th>Código</th><th class="num">Valor</th><th>Vencimento</th><th>Quem paga</th><th>Status</th><th></th></tr></thead><tbody>
    ${ls.map(({c,g,st})=>{const al=alertasGuia(c,g);return `<tr><td data-go="sm/${c.id}" style="cursor:pointer" class="strong">${esc(nomeCli(c.clienteId))}</td><td>${mLabel(g.competencia)}</td><td>${esc(codGuia(g))}</td><td class="num">${brl(g.valor)}</td><td>${fd(g.venc)}<div class="small">${st!=='Paga'?prazoTxt(g.venc):'paga '+fd(g.pagaEm)}</div></td>
      <td class="small">${/escrit/i.test(g.quemPaga||'')?'🏢 Escritório':'Cliente'}</td><td>${pill(st,guiaCor(st))}${al.map(a=>`<div class="small" style="color:var(--${a[0]==='r'?'red':'amber'})" title="${esc(a[1])}">⚠ ${esc(a[1].split(':')[0])}</div>`).join('')}</td>
      <td class="num">${guiaBotoes(c,g,st)}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">Nenhuma guia</td></tr>'}</tbody></table></div>`;}
  if(t==='receber')corpo=htmlAReceberSm();
  if(t==='lembretes')corpo=htmlLembretes();
  if(t==='partos'){const ls=db.sm.filter(c=>c.dpp||c.dataParto);const prox=ls.filter(c=>!c.dataParto).sort((a,b)=>String(a.dpp).localeCompare(String(b.dpp))),nasc=ls.filter(c=>c.dataParto).sort((a,b)=>b.dataParto.localeCompare(a.dataParto));
    const it=c=>`<div class="ev" data-go="sm/${c.id}"><div class="av" style="background:#FDE8EF;color:#C84B6E">👶</div><div class="body"><div class="t">${esc(nomeCli(c.clienteId))} ${c.crianca?'· '+esc(c.crianca):''}</div><div class="small muted">${c.dataParto?'Nasceu em '+fd(c.dataParto):'Previsto para '+fd(c.dpp)+' ('+prazoTxt(c.dpp)+')'}</div></div>${pill(c.status,smCor(c.status))}</div>`;
    corpo=`<div class="grid g-2"><div class="card"><h3>Próximos partos</h3>${prox.map(it).join('')||'<div class="empty">Nenhum</div>'}</div><div class="card"><h3>Já nasceram</h3>${nasc.map(it).join('')||'<div class="empty">Nenhum</div>'}</div></div>`;}
  const nRec=db.sm.filter(c=>financeiroSm(c).aCobrar>0).length,nLem=lembretesPendentes().filter(x=>!x.feito).length;
  return `<div class="grid g-kpi kpi-6">${K.html}</div>
  <div class="toolbar"><div class="tabs" style="margin:0;border:none">${[['casos','Quadro de casos'],['guias','Guias de recolhimento'],...(podeFin()?[['receber','💰 A receber'+(nRec?' ('+nRec+')':'')]]:[]),['partos','Partos e nascimentos'],['lembretes','📲 Lembretes'+(nLem?' ('+nLem+')':'')]].map(([k,l])=>`<button class="tab ${t===k?'active':''}" data-act="tabSm" data-id="${k}">${l}</button>`).join('')}</div>
    <span class="grow"></span><a class="btn btn-ghost" href="#scripts" style="text-decoration:none">Scripts</a><button class="btn btn-gold" data-act="novoSm">+ Caso</button></div>${corpo}`;
};
function cardSm(c){
  const p=proximaAcaoSm(c),tags=etiquetasSm(c),u=db.usuarios.find(x=>x.id===c.responsavelId);
  return `<div class="t" data-go="sm/${c.id}" style="cursor:pointer">${esc(nomeCli(c.clienteId))} <span class="sigla-sm">${esc(SM_SIGLA(c.categoria))}</span></div>
    ${p.txt?`<div class="prox-acao sev-${p.sev||'n'}">➜ ${esc(p.txt)}</div>`:''}
    <div class="meta">${tags.map(([i,tt])=>`<span title="${esc(tt)}">${i}</span>`).join(' ')}${c.dataParto?' 👶 '+fd(c.dataParto):c.dpp?' DPP '+fd(c.dpp):''}${u?`<span class="av-mini" title="${esc(u.nome)}">${esc(initials(u.nome))}</span>`:''}</div>
    ${smEncerrado(c)&&c.desfecho?`<div class="small">${pill(c.desfecho,c.desfecho==='Concluído'?'p-green':c.desfecho==='Indeferido'?'p-red':'p-amber')}</div>`:''}`;
}
function htmlAReceberSm(){
  const linhas=db.sm.map(c=>({c,f:financeiroSm(c),h:honorariosSm(c)})).filter(x=>x.f.total>0||(x.c.status==='Deferido — a receber'&&!x.f.hon.length));
  linhas.sort((a,b)=>(b.f.aCobrar>0)-(a.f.aCobrar>0)||b.f.total-a.f.total);
  const msg=(c,f)=>{const cl=cli(c.clienteId)||{};const it=f.cobravel.map(l=>`• ${l.descricao}: ${brl(l.valor)} (vence ${fd(l.venc)})`).join('\n');
    return `Olá, ${(cl.nome||'').split(' ')[0]}! Tudo bem? Aqui é do ${db.escritorio.nome||'escritório'}. Que bom que a parcela do salário-maternidade já caiu! 🎉\nConforme o contrato, seguem os valores:\n${it}\nTotal: ${brl(f.aCobrar)}\nPode pagar por PIX. Qualquer dúvida, estamos à disposição.`;};
  return `<div class="hint">Honorários e reembolsos de guia de cada caso. Ficam <b>aguardando benefício</b> até a cliente receber a parcela do INSS; ao registrar o recebimento na ficha do caso, vencem em 5 dias úteis e passam para <b>a cobrar</b>.</div>
  <div class="card tbl"><table><thead><tr><th>Cliente</th><th>Etapa</th><th class="num">Honorários em aberto</th><th class="num">Reembolso de guia</th><th class="num">Total</th><th>Já pode cobrar?</th><th></th></tr></thead><tbody>
  ${linhas.map(({c,f})=>{const cl=cli(c.clienteId)||{};return `<tr><td class="strong" data-go="sm/${c.id}" style="cursor:pointer">${esc(cl.nome||'—')}</td><td>${pill(c.status,smCor(c.status))}</td><td class="num">${brl(f.honAberto)}</td><td class="num">${brl(f.reeAberto)}</td><td class="num strong">${brl(f.total)}</td>
    <td>${!f.hon.length?'<span class="small" style="color:var(--red)">sem honorários lançados</span>':f.aCobrar>0?`<b style="color:var(--green)">Sim: ${brl(f.aCobrar)}</b>`:'<span class="small muted">aguardando o INSS</span>'}</td>
    <td class="num">${!f.hon.length?`<button class="btn btn-ghost btn-sm" data-act="editSm" data-id="${c.id}">Informar valores</button>`:f.aCobrar>0&&cl.tel?`<a class="btn btn-ghost btn-sm" style="color:#1F9D55;border-color:#1F9D55;text-decoration:none" target="_blank" rel="noopener" href="${waLink(cl.tel,msg(c,f))}">WhatsApp de cobrança</a>`:''}</td></tr>`;}).join('')||'<tr><td colspan="7" class="empty">Nada a receber</td></tr>'}</tbody></table></div>`;
}
function smCaso(id){
  const c=db.sm.find(x=>x.id===id);if(!c)return '<div class="empty">Caso não encontrado. <a href="#sm">Voltar</a></div>';
  const cl=cli(c.clienteId)||{};const pagas=c.guias.filter(g=>g.pagaEm).length,car=+c.carenciaMeses||0;
  const docs=db.documentos.filter(d=>d.clienteId===c.clienteId);const proc0=db.processos.find(p=>p.clienteId===c.clienteId&&/maternidade/i.test(p.objeto||''));
  const qual=c.qualidadeAte?diff(c.qualidadeAte):null,scrG=db.scripts.find(s=>/guia/i.test(s.titulo));
  const p=proximaAcaoSm(c),al=alertasCaso(c),fin=podeFin(),f=financeiroSm(c),h=honorariosSm(c);
  const parc=c.parcelasInss||[];
  return `<div class="toolbar"><a class="btn btn-ghost" href="#sm" style="text-decoration:none">← Salário-maternidade</a><span class="grow"></span>
    ${cl.tel?`<a class="btn btn-ghost" style="color:#1F9D55;border-color:#1F9D55;text-decoration:none" target="_blank" rel="noopener" href="${waLink(cl.tel,scrG?personalizar(scrG.texto,cl):'')}">WhatsApp (guia)</a>`:''}
    <button class="btn btn-ghost" data-act="smContrato" data-id="${c.id}">Gerar contrato</button><button class="btn btn-ghost" data-act="editSm" data-id="${c.id}">Editar caso</button></div>
  <div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div class="small muted">Salário-maternidade · ${esc(c.categoria)} <span class="sigla-sm">${esc(SM_SIGLA(c.categoria))}</span></div><div style="font-size:18px;font-weight:800"><a href="#cliente/${c.clienteId}">${esc(cl.nome||'—')}</a></div><div class="small">${esc(c.estrategia||'')}</div></div>
    <div style="text-align:right">${pill(c.status,smCor(c.status))}${c.desfecho?' '+pill(c.desfecho,c.desfecho==='Concluído'?'p-green':'p-red'):''}${p.txt?`<div class="prox-acao sev-${p.sev||'n'}" style="margin-top:6px">➜ ${esc(p.txt)}</div>`:''}</div></div>
    <div class="fases">${SM_STATUS.map((s,i)=>`<div class="fase ${s===c.status?'atual':i<SM_STATUS.indexOf(c.status)?'feita':''}" data-act="setSmStatus" data-id="${c.id}|${esc(s)}"><i></i><span>${esc(s)}</span></div>`).join('')}</div></div>
  ${al.length?`<div class="card alertas-sm" style="margin-bottom:14px">${al.map(([s,t])=>`<div class="small" style="color:var(--${s==='r'?'red':'amber'})">⚠ ${esc(t)}</div>`).join('')}</div>`:''}
  <div class="grid g-kpi">${c.dataDeferimento?kpi('✅ Deferido',fd(c.dataDeferimento),[c.valorConcedido&&fin?brl(c.valorConcedido):'',c.previsaoPagamento?'1ª parcela '+fd(c.previsaoPagamento):''].filter(Boolean).join(' · ')||'','good'):''}${kpi('Parto / DPP',c.dataParto?fd(c.dataParto):fd(c.dpp),c.dataParto?'nascimento'+(c.crianca?' — '+esc(c.crianca):''):c.dpp?prazoTxt(c.dpp):'')}
    ${kpi('Carência',car?pagas+' / '+car:'—',car?(pagas>=car?'cumprida ✓':'faltam '+(car-pagas)+' contribuição(ões)'):'sem carência informada',car&&pagas>=car?'good':car?'bad':'')}
    ${kpi('Qualidade de segurada',c.qualidadeAte?fd(c.qualidadeAte):'—',qual==null?'':qual<0?'expirada':'mantida por mais '+qual+' dias',qual!=null&&qual<30?'bad':'good')}
    ${kpi('Requerimento',c.nb||'—',c.der?'DER '+fd(c.der):'ainda não protocolado')}</div>
  <div class="grid g-2">
    <div>
    <div class="card" style="margin-bottom:14px"><h3>Guias de recolhimento <span class="flx"><button class="btn btn-ghost btn-sm" data-act="gerarGuias" data-id="${c.id}">Gerar em lote</button><button class="btn btn-gold btn-sm" data-act="novaGuia" data-id="${c.id}">+ Guia</button></span></h3>
      ${c.guias.length?`<div class="tbl"><table><thead><tr><th>Comp.</th><th>Código</th><th class="num">Valor</th><th>Vencimento</th><th title="Quem paga">Paga</th><th>Status</th><th></th></tr></thead><tbody>${c.guias.map(g=>{const st=guiaStatus(g),a=alertasGuia(c,g);return `<tr><td class="strong">${mLabel(g.competencia)}</td><td>${esc(codGuia(g))}</td><td class="num">${brl(g.valor)}</td><td>${fd(g.venc)}${g.pagaEm?`<div class="small muted">paga ${fd(g.pagaEm)}</div>`:''}</td><td class="small" title="${/escrit/i.test(g.quemPaga||'')?'Paga pelo escritório (reembolsável)':'Paga pela cliente'}">${/escrit/i.test(g.quemPaga||'')?'🏢':'👤'}</td><td>${pill(st,guiaCor(st))}${a.length?` <span title="${esc(a.map(x=>x[1]).join('\n'))}" style="cursor:help">⚠</span>`:''}</td><td class="num">${guiaBotoes(c,g,st)}</td></tr>`;}).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:8px">Total: ${brl(sumBy(c.guias,g=>g.valor))} · pagas ${pagas} · em aberto ${c.guias.length-pagas}</div>`:'<div class="empty">Nenhuma guia. Use "Gerar em lote" para criar as competências da carência.</div>'}</div>
    ${fin?`<div class="card" style="margin-bottom:14px"><h3>💰 Financeiro deste caso</h3>
      ${f.hon.length||f.ree.length?`<dl class="dl"><dt>Honorários contratados</dt><dd>${brl(f.contratado)}${h?` <span class="small muted">(${h.n}x ${brl(h.val)}${h.doContrato?', do contrato':', '+num(h.pct,0)+'% do benefício'})</span>`:''}</dd><dt>Reembolso de guias</dt><dd>${brl(sumBy(f.ree,l=>l.valor))}</dd><dt>Recebido</dt><dd style="color:var(--green)">${brl(f.recebido)}</dd><dt>Saldo</dt><dd class="strong">${brl(f.total)}${f.aCobrar?` <span style="color:var(--red)">(${brl(f.aCobrar)} já pode cobrar)</span>`:''}</dd></dl>
        <div class="tbl" style="margin-top:8px"><table><tbody>${f.ls.sort((a,b)=>a.descricao.localeCompare(b.descricao)).map(l=>`<tr data-act="editLanc" data-id="${l.id}"><td class="small">${esc(l.descricao)}</td><td class="num">${brl(l.valor)}</td><td>${pStatusLanc(lancStatus(l))}${!l.aguardandoBeneficio&&!l.pago?`<div class="small muted">vence ${fd(l.venc)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`
        :`<div class="empty">${f.semHonorarios?'Sem contrato nem valores de honorários.':'Informe o valor do benefício e o % de honorários.'} <button class="btn btn-sm lnk" data-act="editSm" data-id="${c.id}">Editar caso</button></div>`}
      ${parc.length?`<h3 style="margin-top:14px">Parcelas do INSS recebidas pela cliente</h3>${parc.map((x,i)=>`<div class="ev"><div class="body small"><b>Parcela ${i+1}</b>${x.previsao?' · previsão '+fd(x.previsao):''}${x.recebidaEm?` · <span style="color:var(--green)">recebida em ${fd(x.recebidaEm)}</span>`:''}</div>${x.recebidaEm?`<button class="btn btn-sm lnk" data-act="smParcela" data-id="${c.id}|${i}">alterar</button>`:`<button class="btn btn-ghost btn-sm" data-act="smParcela" data-id="${c.id}|${i}">Registrar recebimento</button>`}</div>`).join('')}`
        :c.status==='Deferido — a receber'?`<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-act="setSmStatus" data-id="${c.id}|Deferido — a receber">Informar as parcelas do INSS</button>`:''}</div>`:''}
    </div>
    <div>
    <div class="card" style="margin-bottom:14px"><h3>Exigência do INSS <span>${c.exigencia?.aberta?`<button class="btn btn-ghost btn-sm" data-act="smExigCumprida" data-id="${c.id}">Cumprida</button>`:`<button class="btn btn-ghost btn-sm" data-act="smExig" data-id="${c.id}">+ Registrar exigência</button>`}</span></h3>
      ${c.exigencia?.aberta?`<div class="small" style="color:var(--red)">🔴 ${esc(c.exigencia.descricao||'Exigência em aberto')}${c.exigencia.prazo?' · prazo '+fd(c.exigencia.prazo)+' ('+prazoTxt(c.exigencia.prazo)+')':''}</div>`:'<div class="small muted">Nenhuma exigência em aberto.</div>'}</div>
    <div class="card"><h3>Documentos <span class="flx"><button class="btn btn-ghost btn-sm" data-act="docsPadraoSm" data-id="${c.id}" title="Documentos de ${esc(c.categoria)}">+ Padrão (${esc(SM_SIGLA(c.categoria))})</button><button class="btn btn-gold btn-sm" data-act="novoDocCli" data-id="${c.clienteId}">+ Documento</button></span></h3>${docList(docs)}
      ${docsInaplicaveis(c).length?`<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-act="smLimparDocs" data-id="${c.id}">Remover os que não se aplicam a ${esc(c.categoria)}</button>`:''}
      ${proc0?`<h3 style="margin-top:16px">Processo / requerimento</h3><div class="ev" data-go="processo/${proc0.id}"><div class="body"><div class="t">${esc(proc0.numero)}</div><div class="small muted">${esc(proc0.fase)}</div></div>${pStatusProc(proc0.status)}</div>`:`<button class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="novoProcSm" data-id="${c.id}">+ Registrar requerimento no INSS</button>`}
      ${c.obs?`<div class="hint" style="margin:14px 0 0">${esc(c.obs)}</div>`:''}
      ${(c.historico||[]).length?`<h3 style="margin-top:16px">Histórico de etapas</h3>${c.historico.slice(-8).reverse().map(x=>`<div class="small">${new Date(x.em).toLocaleDateString('pt-BR')} · ${esc(x.de||'—')} → <b>${esc(x.para)}</b> <span class="muted">${esc(x.por||'')}</span></div>`).join('')}`:''}</div>
    </div>
  </div>`;
}
const SM_ACOES={
  tabSm:k=>{ui.tabSm=k;render();},novoSm:()=>editSm(),novoSmCli:id=>editSm(null,{clienteId:id}),editSm:id=>editSm(id),
  setSmStatus:k=>{const i=k.indexOf('|');smPedirMover(k.slice(0,i),k.slice(i+1));},
  smFiltro:k=>{const f=ui.f.sm||(ui.f.sm={});if(k==='receber'){ui.tabSm='receber';f.filtro='';}else if(k==='recebido'){ui.tabSm='receber';f.filtro='';}
    else if(k==='guias'){ui.tabSm='guias';(ui.f.guias=ui.f.guias||{}).st='pendentes';f.filtro=k;}else{f.filtro=f.filtro===k?'':k;ui.tabSm='casos';}render();},
  smEncerrados:()=>{const f=ui.f.sm||(ui.f.sm={});f.encerrados=!f.encerrados;render();},
  novaGuia:id=>editGuia(id),editGuia:k=>{const[s,g]=k.split('|');editGuia(s,g);},gerarGuias:id=>gerarGuias(id),
  guiaEmitida:k=>{const[s,gid]=k.split('|');const g=db.sm.find(x=>x.id===s).guias.find(x=>x.id===gid);g.emitidaEm=today();save();render();toast('Guia marcada como emitida ✓');},
  guiaPaga:k=>{const[s,gid]=k.split('|');const c=db.sm.find(x=>x.id===s);const g=c.guias.find(x=>x.id===gid);
    form('Guia paga',[{k:'pagaEm',l:'Paga em',t:'date',req:1},{k:'quemPaga',l:'Quem pagou',t:'select',o:['Cliente','Escritório (reembolsável)']}],{pagaEm:today(),quemPaga:g.quemPaga||'Cliente'},v=>{
      if(v.pagaEm>today()){toast('A data não pode ser no futuro',1);return false;}g.pagaEm=v.pagaEm;g.quemPaga=v.quemPaga;if(!g.emitidaEm)g.emitidaEm=v.pagaEm;
      const a=alertasGuia(c,g);setTimeout(()=>{toast(a.length?'⚠ '+a[0][1]:/escrit/i.test(v.quemPaga)?'Guia paga ✓ Reembolso lançado no financeiro da cliente (aguardando benefício)':'Guia paga ✓',a.length?1:0);smSugerir(c);},300);});},
  smParcela:k=>{const[s,i]=k.split('|');const c=db.sm.find(x=>x.id===s);const p=c.parcelasInss[+i];
    form(`Parcela ${+i+1} do INSS`,[{k:'recebidaEm',l:'Data em que a cliente recebeu',t:'date'},{k:'valor',l:'Valor recebido (R$, opcional)',t:'number',vazio:''}],p,v=>{
      if(v.recebidaEm&&v.recebidaEm>today()){toast('A data não pode ser no futuro',1);return false;}Object.assign(p,v);
      if(v.recebidaEm)setTimeout(()=>toast(`Recebimento registrado ✓ Honorários da parcela ${+i+1} vencem em ${fd(calcularPrazo(v.recebidaEm,5,{recesso:false}))} (5 dias úteis)`),300);});},
  smExig:id=>{const c=db.sm.find(x=>x.id===id);form('Exigência do INSS',[{k:'descricao',l:'O que o INSS pediu',t:'textarea',req:1,full:1,rows:3},{k:'prazo',l:'Prazo para cumprir',t:'date',req:1}],{prazo:calcularPrazo(today(),30,{uteis:false,recesso:false})},v=>{
    c.exigencia={aberta:true,...v,abertaEm:today()};if(c.status!=='No INSS'){(c.historico=c.historico||[]).push({de:c.status,para:'No INSS',em:Date.now(),por:nomeUsr(db.usuarioAtual)});c.status='No INSS';}});},
  smExigCumprida:id=>{const c=db.sm.find(x=>x.id===id);c.exigencia={...c.exigencia,aberta:false,cumpridaEm:today()};save();render();toast('Exigência cumprida ✓');},
  smLimparDocs:id=>{const c=db.sm.find(x=>x.id===id);const ids=new Set(docsInaplicaveis(c).map(x=>x.id));db.documentos=db.documentos.filter(x=>!ids.has(x.id));save();render();toast(ids.size+' documento(s) removido(s)');},
  smContrato:id=>{const c=db.sm.find(x=>x.id===id);const m=db.modelos.find(x=>/salário-maternidade/i.test(x.nome));ui.tabDoc='gerador';ui.f.doc={...(ui.f.doc||{}),mcli:c.clienteId,mproc:'',mctr:'',modelo:m?.id};location.hash='documentos';render();},
  novoProcSm:id=>{const c=db.sm.find(x=>x.id===id);editProcesso(null,{clienteId:c.clienteId,tipo:'Administrativo',area:'Previdenciário',objeto:'Salário-maternidade',parteContraria:'INSS',orgaoAdm:'INSS',fase:'Requerimento a protocolar'});},
  docsPadraoSm:id=>{let c=db.sm.find(x=>x.id===id);if(!c)c=db.sm.find(x=>x.clienteId===id)||{clienteId:id,categoria:''};const n=garantirDocsSm(c);save();render();toast(n+' documento(s) de '+(c.categoria||'salário-maternidade')+' adicionado(s)');},
};
