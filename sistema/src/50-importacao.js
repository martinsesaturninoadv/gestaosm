/* =========================================================
   IMPORTAÇÃO DAS PLANILHAS (Excel)
   ========================================================= */
function acharCabecalho(rows,obrig){
  for(let i=0;i<Math.min(rows.length,15);i++){const r=(rows[i]||[]).map(norm);if(obrig.every(o=>r.some(c=>c.startsWith(o))))return i;}return -1;
}
function idxCol(head,...alias){const h=head.map(norm);for(const a of alias){const i=h.findIndex(c=>c.startsWith(a));if(i>=0)return i;}return -1;}
function guessCatDesp(desc){
  const d=norm(desc);const R=[[/aluguel|condominio/,'Aluguel'],[/\bluz\b|energia/,'Energia elétrica'],[/telefon|internet|celular/,'Telefonia / internet'],[/google/,'Tráfego — Google'],[/facebook|instagram|meta ads/,'Tráfego — Facebook/Instagram'],
    [/agencia|publicidade|landing|marketing/,'Agência / marketing'],[/sistema|software|canva|zapsign|integra|omie|active/,'Sistemas'],[/contador|contab/,'Contador'],[/taxa (de )?cart|cartao/,'Taxa de cartão'],[/boleto/,'Taxa de boleto'],
    [/tarifa|encargo|banc/,'Tarifas bancárias'],[/empresa de ti|\bti\b|informatica/,'Empresa de TI'],[/pro.?labore/,'Pró-labore'],[/salario|folha|funcionari/,'Folha de pagamento'],[/copa|cafe|agua|filtro/,'Copa'],
    [/correio/,'Correios'],[/expediente|material|papel/,'Material de expediente'],[/manuten|extraordin|conserto|ar condicionado|limpeza/,'Manutenção / extraordinárias'],[/equipamento|computador|notebook|impressora/,'Equipamentos'],
    [/curso|treinamento|capacita|livro|periodico|consultoria/,'Capacitação'],[/imposto|simples|\bdas\b|\biss\b|irpj/,'Impostos'],[/custas|guia|diligencia|pericia/,'Custas processuais'],[/lucro/,LUCROS],[/indicac/,'Indicações pagas']];
  for(const[re,c]of R)if(re.test(d))return c;return 'Outras despesas';
}
function guessCatRec(desc){const d=norm(desc);if(/sucumb/.test(d))return 'Sucumbência';if(/acordo/.test(d))return 'H.O. finais — acordo';if(/final|exito/.test(d))return 'H.O. finais — êxito';if(/inicia|entrada|parcela/.test(d))return 'H.O. iniciais';if(/\btmp\b/.test(d))return 'TMP';if(/parceria|delegad/.test(d))return 'Parceria (execução delegada)';if(/consulta/.test(d))return 'Consulta';return 'Outras receitas';}
function mapEtapa(s){const d=norm(s);if(/recupera/.test(d))return 'Em recuperação';if(/fechad|contrat/.test(d))return 'Fechado';if(/perd|desist/.test(d))return 'Perdido';if(/parceir/.test(d))return 'Encaminhado a parceiro';if(/proposta/.test(d))return 'Proposta enviada';if(/atendim|negocia/.test(d))return 'Em atendimento';return 'Novo contato';}
function somaReais(txt){const m=String(txt||'').match(/R\$\s*[\d.,]+/g);return m?m.reduce((s,x)=>s+parseNum(x),0):parseNum(txt);}
function telTxt(v){if(v==null||v==='')return '';if(typeof v==='number')v=String(Math.round(v));const d=digits(v);if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return String(v).trim();}
function achaCliente(nome){const n=norm(nome);return n?db.clientes.find(c=>norm(c.nome)===n):null;}
function achaClienteEm(txt){const t=norm(txt);if(!t)return null;return db.clientes.filter(c=>norm(c.nome).length>3&&t.includes(norm(c.nome))).sort((a,b)=>b.nome.length-a.nome.length)[0]||null;}

function analisarPlanilha(abas){
  const achados=[];
  for(const [nome,rows] of Object.entries(abas)){
    const n=norm(nome);let h;
    if((h=acharCabecalho(rows,['nome','e-mail','whatsapp']))>=0||(n.startsWith('registro historico')&&(h=acharCabecalho(rows,['nome']))>=0)){
      const head=rows[h];const ix={nome:idxCol(head,'nome')};const dados=rows.slice(h+1).filter(r=>r&&r[ix.nome]!=null&&String(r[ix.nome]).trim());
      achados.push({tipo:'crm',aba:nome,h,n:dados.length,desc:`${dados.length} pessoa(s) — viram <b>clientes + contratos</b> (quem tem data do contrato ou status "fechado") ou <b>atendimentos</b>`});}
    else if((h=acharCabecalho(rows,['nome do contratante','valor']))>=0||(n==='entrada'&&(h=acharCabecalho(rows,['valor']))>=0)){
      const head=rows[h];const iv=idxCol(head,'valor');const dados=rows.slice(h+1).filter(r=>r&&parseNum(r[iv])>0);
      achados.push({tipo:'entrada',aba:nome,h,n:dados.length,desc:`${dados.length} parcela(s) a receber — viram <b>receitas</b> em Contas a receber`});}
    else if(n.startsWith('despesas fixas')||((h=acharCabecalho(rows,['descricao','valor previsto']))>=0)){
      if(h<0)h=acharCabecalho(rows,['descricao']);if(h<0)continue;const dados=rows.slice(h+1).filter(r=>r&&r[0]&&!/^total/i.test(norm(r[0]))&&parseNum(r[1])>0);
      achados.push({tipo:'fixas',aba:nome,h,n:dados.length,desc:`${dados.length} despesa(s) fixa(s) com valor previsto`});}
    else if(n.startsWith('fluxo de caixa')){h=acharCabecalho(rows,['data','valor','descricao']);if(h<0)continue;
      const dados=rows.slice(h+1).filter(r=>r&&(parseNum(r[1])>0||parseNum(r[6])>0));
      achados.push({tipo:'fluxo',aba:nome,h,n:dados.length,desc:`${dados.length} linha(s) de entradas/saídas já realizadas, saldo anterior e distribuição de lucros`});}
    else if(n.startsWith('controle de contratos')){achados.push({tipo:'metas',aba:nome,h:0,n:7,desc:'Metas mensais de contratos (quantidade, valores e médias)'});}
    else if(n.startsWith('previsao')){achados.push({tipo:'info',aba:nome,desc:'Não precisa importar: o sistema monta a previsão sozinho a partir das parcelas.'});}
    else if(n.startsWith('questionario')||n.startsWith('blocos')){achados.push({tipo:'info',aba:nome,desc:'Não precisa importar: os indicadores são calculados sozinhos em <b>Indicadores mensais</b>.'});}
  }
  return achados;
}
function importar(abas,achados,opts){
  const r={clientes:0,contratos:0,leads:0,receitas:0,despesas:0,fixas:0,metas:0,ignorados:0};
  achados.forEach(a=>{const rows=abas[a.aba];
    if(a.tipo==='crm'){const head=rows[a.h];const c=k=>idxCol(head,...k);
      const ix={nome:c(['nome']),email:c(['e-mail','email']),tel:c(['whatsapp','telefone','fone']),origem:c(['origem']),produto:c(['produto','nicho']),pc:c(['primeiro contato']),uc:c(['ultimo contato']),
        prop:c(['proposta']),status:c(['status']),idade:c(['idade']),sexo:c(['sexo']),uf:c(['estado']),cid:c(['cidade']),prof:c(['profissao']),renda:c(['faixa de renda','renda']),dc:c(['data do contrato']),
        custos:c(['custos do caso']),amb:c(['ambito']),cac:c(['cac']),hoi:c(['ho inicial','h.o inicial','h.o. inicial']),ent:c(['valor de entrada']),vp:c(['valor de parcela','valor da parcela']),qp:c(['quantidade de parcela']),
        hoa:c(['ho final (acordo)','h.o final (acordo)','h.o. final (acordo)']),hoe:c(['ho final (exito)','h.o final (exito)','h.o. final (exito)']),suc:c(['sucumbencia']),rec:c(['valor total recebido'])};
      const g=(row,k)=>ix[k]>=0?row[ix[k]]:null;const s=(row,k)=>{const v=g(row,k);return v==null?'':String(v).trim();};
      rows.slice(a.h+1).forEach(row=>{if(!row||!s(row,'nome'))return;
        const prodN=s(row,'produto')?addProduto(s(row,'produto')):'';const sx=s(row,'sexo');
        const perfil={email:s(row,'email'),tel:telTxt(g(row,'tel')),origem:s(row,'origem'),produto:prodN,primeiroContato:parseData(g(row,'pc')),ultimoContato:parseData(g(row,'uc')),
          idade:parseNum(g(row,'idade'))||null,sexo:/^f/i.test(sx)?'Feminino':/^m/i.test(sx)?'Masculino':sx,uf:s(row,'uf').toUpperCase().slice(0,2),cidade:s(row,'cid'),profissao:s(row,'prof'),renda:parseNum(g(row,'renda'))};
        const dc=parseData(g(row,'dc'));const fechado=!!dc||/fechad/i.test(s(row,'status'));
        if(fechado){let cl=achaCliente(s(row,'nome'));
          if(!cl){cl={id:uid(),tipo:'PF',nome:s(row,'nome'),doc:'',status:'Ativo',criado:dc||perfil.primeiroContato||today(),obs:'',...perfil};db.clientes.push(cl);r.clientes++;}
          else for(const k in perfil)if(!cl[k]&&perfil[k])cl[k]=perfil[k];
          const hoi=parseNum(g(row,'hoi'));
          if(hoi>0||parseNum(g(row,'ent'))>0){const data=dc||cl.criado;
            if(!db.contratos.some(k=>k.clienteId===cl.id&&k.data===data&&+k.valorTotal===hoi)){
              const custosTxt=s(row,'custos');
              db.contratos.push({id:uid(),clienteId:cl.id,processoId:'',titular:'',data,produto:prodN,ambito:s(row,'amb'),valorTotal:hoi,entrada:parseNum(g(row,'ent')),parcelas:parseNum(g(row,'qp')),valorParcela:parseNum(g(row,'vp')),
                diaVenc:10,forma:'',exitoPct:0,hoAcordo:parseNum(g(row,'hoa')),hoExito:parseNum(g(row,'hoe')),sucumbencia:parseNum(g(row,'suc')),custos:somaReais(custosTxt),custosDesc:/[a-z]/i.test(custosTxt)?custosTxt:'',
                cac:parseNum(g(row,'cac')),proposta:s(row,'prop'),recebidoImportado:parseNum(g(row,'rec')),obs:'Importado da planilha CRM'});r.contratos++;}}
        }else{
          if(db.leads.some(l=>norm(l.nome)===norm(s(row,'nome'))&&(l.primeiroContato||'')===perfil.primeiroContato)){r.ignorados++;return;}
          db.leads.push({id:uid(),nome:s(row,'nome'),...perfil,etapa:mapEtapa(s(row,'status')),valor:0,proposta:s(row,'prop'),obs:'',criado:perfil.primeiroContato||today()});r.leads++;}
      });}
    if(a.tipo==='entrada'){const head=rows[a.h];const c=k=>idxCol(head,...k);
      const ix={tit:c(['nome do titular']),con:c(['nome do contratante','cliente']),tel:c(['fone','telefone','whatsapp']),email:c(['e-mail','email']),dc:c(['data do contrato']),val:c(['valor']),venc:c(['vencimento']),obs:c(['observa'])};
      const grupos={};
      rows.slice(a.h+1).forEach(row=>{if(!row)return;const val=parseNum(row[ix.val]);const venc=parseData(row[ix.venc]);if(!(val>0)||!venc)return;
        const nome=String(row[ix.con]??row[ix.tit]??'').trim()||'Sem nome';const dc=parseData(row[ix.dc]);
        let cl=achaCliente(nome);if(!cl){cl={id:uid(),tipo:'PF',nome,doc:'',tel:telTxt(row[ix.tel]),email:String(row[ix.email]??'').trim(),status:'Ativo',criado:dc||venc,primeiroContato:dc||'',ultimoContato:'',obs:''};db.clientes.push(cl);r.clientes++;}
        const k=cl.id+'|'+dc;(grupos[k]=grupos[k]||{cl,dc,tit:String(row[ix.tit]??'').trim(),itens:[]}).itens.push({val,venc,obs:ix.obs>=0?String(row[ix.obs]??'').trim():''});});
      Object.values(grupos).forEach(gp=>{gp.itens.sort((x,y)=>x.venc.localeCompare(y.venc));const n=gp.itens.length;
        gp.itens.forEach((it,i)=>{if(db.lancamentos.some(l=>l.tipo==='receita'&&l.clienteId===gp.cl.id&&l.venc===it.venc&&Math.abs(l.valor-it.val)<.01)){r.ignorados++;return;}
          const pago=opts.marcarPagas&&it.venc<today();
          db.lancamentos.push({id:uid(),tipo:'receita',descricao:n>1?`H.O. — parcela ${i+1}/${n}`:'H.O. — pagamento único',categoria:'H.O. iniciais',clienteId:gp.cl.id,processoId:'',contratoId:'',valor:it.val,venc:it.venc,pago,pagoEm:pago?it.venc:'',
            forma:'',produto:'',obs:[gp.tit&&norm(gp.tit)!==norm(gp.cl.nome)?'Titular da ação: '+gp.tit:'',it.obs].filter(Boolean).join(' · '),criado:gp.dc||it.venc});r.receitas++;});});}
    if(a.tipo==='fixas'){rows.slice(a.h+1).forEach(row=>{if(!row||!row[0])return;const desc=String(row[0]).trim();if(/^total/i.test(norm(desc)))return;const prev=parseNum(row[1]);if(!(prev>0))return;
      if(db.despesasFixas.some(f=>norm(f.descricao)===norm(desc))){r.ignorados++;return;}
      const mN=desc.match(/nicho\s+(\S+)/i);db.despesasFixas.push({id:uid(),descricao:desc,categoria:guessCatDesp(desc),previsto:prev,dia:10,produto:mN?addProduto(mN[1]):'',ativo:true});r.fixas++;});}
    if(a.tipo==='fluxo'){const head=rows[a.h].map(norm);const datas=head.reduce((acc,c,i)=>(c==='data'&&acc.push(i),acc),[]);
      const e0=datas[0],s0=datas[1];let primeira='';
      const addL=(tipo,data,valor,desc,orig)=>{if(!data||!(valor>0))return;if(!primeira||data<primeira)primeira=data;
        const descr=[desc,orig].filter(Boolean).join(' — ');
        if(db.lancamentos.some(l=>l.tipo===tipo&&l.pago&&dataCaixa(l)===data&&Math.abs(l.valor-valor)<.01&&norm(l.descricao)===norm(descr))){r.ignorados++;return;}
        const cl=tipo==='receita'?achaClienteEm(orig):null;
        db.lancamentos.push({id:uid(),tipo,descricao:descr||'(sem descrição)',categoria:tipo==='receita'?guessCatRec(desc):guessCatDesp(desc),clienteId:cl?cl.id:'',processoId:'',contratoId:'',valor,venc:data,pago:true,pagoEm:data,forma:'',produto:'',obs:'Importado do fluxo de caixa',criado:data});
        r[tipo==='receita'?'receitas':'despesas']++;};
      rows.slice(a.h+1).forEach(row=>{if(!row)return;
        if(e0!=null&&!/^total/i.test(norm(row[e0])))addL('receita',parseData(row[e0]),parseNum(row[e0+1]),String(row[e0+2]??'').trim(),String(row[e0+3]??'').trim());
        if(s0!=null&&!/^total/i.test(norm(row[s0])))addL('despesa',parseData(row[s0]),parseNum(row[s0+1]),String(row[s0+2]??'').trim(),'');});
      let heranca=null,lucro=null;rows.forEach(row=>(row||[]).forEach((c,i)=>{const t=norm(c);if(t.startsWith('heranca recebida'))heranca=parseNum(row[i+1]);if(t.startsWith('distribuicao de lucros'))lucro=parseNum(row[i+1]);}));
      if(primeira){const ym=primeira.slice(0,7);
        if(heranca!=null&&!+db.escritorio.saldoInicial){db.escritorio.saldoInicial=heranca;db.escritorio.saldoInicialData=ym+'-01';}
        if(lucro>0&&!db.lancamentos.some(l=>l.categoria===LUCROS&&l.venc.startsWith(ym))){db.lancamentos.push({id:uid(),tipo:'despesa',descricao:'Distribuição de lucros',categoria:LUCROS,clienteId:'',processoId:'',contratoId:'',valor:lucro,venc:fimMes(ym),pago:true,pagoEm:fimMes(ym),forma:'Transferência',produto:'',obs:'Importado do fluxo de caixa',criado:fimMes(ym)});r.despesas++;}}}
    if(a.tipo==='metas'){const mapa=[['qtd. de contrato','qtd'],['qtd de contrato','qtd'],['valor total de contratos','valorTotal'],['valor total de entrada','entradas'],['valor medio do contrato','ticket'],['valor medio das entradas','entradaMedia'],['quantidade media de presta','parcelasMedia'],['quantidade medio de presta','parcelasMedia'],['valor medio das presta','parcelaMedia']];
      const feito={};rows.forEach(row=>{if(!row)return;const t=norm(row[0]);const m=mapa.find(([p])=>t.startsWith(p));if(!m||feito[m[1]])return;
        const v=row.slice(1).find(x=>typeof x==='number'||(typeof x==='string'&&/^\s*[\d.,]+\s*$/.test(x)));if(v!=null){db.metas[m[1]]=parseNum(v);feito[m[1]]=1;r.metas++;}});}
  });
  return r;
}
async function iniciarImportacao(file){
  let abas;
  try{const X=await carregarXLSX();const wb=X.read(await file.arrayBuffer(),{type:'array'});abas={};wb.SheetNames.forEach(n=>abas[n]=X.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null}));}
  catch(e){toast(e.message||'Não foi possível ler a planilha',1);return;}
  const achados=analisarPlanilha(abas);const uteis=achados.filter(a=>a.tipo!=='info');
  if(!achados.length){toast('Nenhuma aba reconhecida nesta planilha',1);return;}
  modal('Importar: '+file.name,`<p class="small muted" style="margin-bottom:8px">Marque o que deseja importar. Registros que já existem (mesmo nome/data/valor) são ignorados, então importar de novo não duplica.</p>
    <div class="imp-list">${achados.map((a,i)=>`<label><input type="checkbox" id="imp_${i}"${a.tipo==='info'?' disabled':' checked'}><span><b>Aba "${esc(a.aba)}"</b>${a.desc}</span></label>`).join('')}</div>
    ${uteis.some(a=>a.tipo==='entrada')?'<label class="small" style="display:flex;gap:8px;margin-top:12px"><input type="checkbox" id="imp_pagas"> Marcar como <b>já recebidas</b> as parcelas da aba Entrada com vencimento anterior a hoje</label>':''}`,
    [{l:'Cancelar',c:'btn-ghost',fn:closeModal},{l:'Importar',c:'btn-brand',fn:()=>{
      const sel=achados.filter((a,i)=>a.tipo!=='info'&&$('#imp_'+i)?.checked);
      // a ordem importa: primeiro o CRM (cria clientes), depois financeiro
      const ordem=['crm','entrada','fixas','fluxo','metas'];sel.sort((a,b)=>ordem.indexOf(a.tipo)-ordem.indexOf(b.tipo));
      const r=importar(abas,sel,{marcarPagas:$('#imp_pagas')?.checked});closeModal();save();render();
      modal('Importação concluída',`<div class="dl" style="grid-template-columns:200px 1fr"><dt>Clientes criados</dt><dd>${r.clientes}</dd><dt>Contratos</dt><dd>${r.contratos}</dd><dt>Atendimentos (CRM)</dt><dd>${r.leads}</dd>
        <dt>Receitas</dt><dd>${r.receitas}</dd><dt>Despesas</dt><dd>${r.despesas}</dd><dt>Despesas fixas</dt><dd>${r.fixas}</dd><dt>Metas atualizadas</dt><dd>${r.metas}</dd><dt>Já existiam (ignorados)</dt><dd>${r.ignorados}</dd></dl>
        <p class="small muted" style="margin-top:12px">Confira os nichos em Configurações → Produtos e complete CPF, processos e contratos dos clientes importados.</p>`);
    }}]);
}

