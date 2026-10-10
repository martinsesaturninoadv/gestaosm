/* =========================================================
   PRAZOS EM DIAS ÚTEIS (CPC art. 219 e 220) e FLUXOS AUTOMÁTICOS POR ETAPA
   ========================================================= */
function pascoa(ano){const a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
  l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;}
const _feriadosCache={};
/* feriados do ano: nacionais + móveis (+ Justiça Federal, Lei 5.010/66) + os cadastrados pelo escritório */
function feriadosDoAno(ano,federal){
  const k=ano+(federal?'f':'')+(db?.escritorio?.feriados||'');if(_feriadosCache[k])return _feriadosCache[k];
  const p=pascoa(ano),m={};const add=(d,n)=>{m[d]=m[d]||n;};
  [['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['09-07','Independência'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal']]
    .forEach(([d,n])=>add(ano+'-'+d,n));
  add(addDays(-48,p),'Carnaval');add(addDays(-47,p),'Carnaval');add(addDays(-2,p),'Sexta-feira Santa');add(addDays(60,p),'Corpus Christi');
  if(federal){add(addDays(-4,p),'Semana Santa (JF)');add(addDays(-3,p),'Semana Santa (JF)');add(ano+'-08-11','Dia dos Cursos Jurídicos (JF)');add(ano+'-11-01','Todos os Santos (JF)');add(ano+'-12-08','Dia da Justiça (JF)');}
  String(db?.escritorio?.feriados||'').split(/\n|;/).forEach(l=>{const x=l.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*-?\s*(.*)$/);if(!x)return;if(x[3]&&+x[3]!==ano)return;
    add(`${ano}-${x[2].padStart(2,'0')}-${x[1].padStart(2,'0')}`,x[4]||'Feriado local');});
  return _feriadosCache[k]=m;
}
const emRecesso=d=>{const md=d.slice(5);return md>='12-20'||md<='01-20';}; // CPC art. 220: prazos suspensos de 20/12 a 20/01
function motivoNaoUtil(d,o={}){
  const dw=new Date(d+'T12:00').getDay();if(dw===0)return 'domingo';if(dw===6)return 'sábado';
  const f=feriadosDoAno(+d.slice(0,4),o.federal)[d];if(f)return f;
  if(o.recesso!==false&&emRecesso(d))return 'recesso forense';return '';
}
const ehDiaUtil=(d,o)=>!motivoNaoUtil(d,o);
/* CPC: exclui o dia do começo e inclui o do vencimento; prorroga se cair em dia não útil */
function calcularPrazo(inicio,dias,o={}){
  let d=inicio;
  if(o.uteis!==false){let n=0;while(n<dias){d=addDays(1,d);if(ehDiaUtil(d,o))n++;}}
  else{d=addDays(dias,d);while(!ehDiaUtil(d,o))d=addDays(1,d);}
  return d;
}
/* campos da calculadora no formulário de compromisso: recalcula a data ao digitar */
document.addEventListener('input',ev=>{
  if(!ev.target.closest('#f_prazoInicio,#f_prazoDias,#f_prazoTipo,#f_prazoFederal'))return;
  const ini=$('#f_prazoInicio')?.value,n=+$('#f_prazoDias')?.value;const out=$('#prazo-calc');if(!ini||!n){if(out)out.textContent='';return;}
  const o={uteis:$('#f_prazoTipo').value!=='corridos',federal:$('#f_prazoFederal').checked};
  const fim=calcularPrazo(ini,n,o);$('#f_data').value=fim;
  if(out)out.innerHTML=`Vencimento: <b>${fd(fim)}</b> (${['domingo','segunda','terça','quarta','quinta','sexta','sábado'][new Date(fim+'T12:00').getDay()]}) — ${n} dia(s) ${o.uteis?'úteis':'corridos'}, sem contar o dia ${fd(ini)}${emRecesso(ini)||emRecesso(fim)?' · considera o recesso de 20/12 a 20/01':''}.`;
});
document.addEventListener('change',ev=>{if(ev.target.closest('#f_prazoTipo,#f_prazoFederal'))$('#f_prazoDias')?.dispatchEvent(new Event('input',{bubbles:true}));});
const camposPrazo=()=>[{t:'sec',l:'🧮 Calcular prazo (opcional) — preenche a data sozinho'},
  {k:'prazoInicio',l:'Data da intimação / publicação',t:'date'},{k:'prazoDias',l:'Prazo (dias)',t:'number'},
  {k:'prazoTipo',l:'Contagem',t:'select',o:[['uteis','Dias úteis (CPC)'],['corridos','Dias corridos']]},{k:'prazoFederal',l:'Justiça Federal (feriados da Lei 5.010/66)',t:'check'},
  {t:'sec',l:'',html:'<div class="small" id="prazo-calc" style="color:var(--brand)"></div>'}];

/* ---------- FLUXOS AUTOMÁTICOS ---------- */
const FLUXOS_PADRAO=`# tipo | etapa | tarefa ({cliente} e {numero} são trocados) | dias | uteis ou corridos
sm | Coleta de documentos | Solicitar os documentos à cliente — {cliente} | 1 | corridos
sm | Coleta de documentos | Conferir CNIS e qualidade de segurada — {cliente} | 3 | uteis
sm | Guias em andamento | Emitir e enviar a próxima guia — {cliente} | 2 | uteis
sm | Aguardando o parto | Confirmar com a cliente se o bebê já nasceu — {cliente} | 7 | corridos
sm | Pronto para protocolo | Protocolar o requerimento no Meu INSS — {cliente} | 2 | uteis
sm | Protocolado — em análise | Acompanhar a análise do INSS — {cliente} | 30 | corridos
sm | Em exigência | Cumprir a exigência do INSS — {cliente} | 5 | uteis
sm | Deferido | Avisar a cliente do deferimento e cobrar os honorários — {cliente} | 1 | corridos
sm | Indeferido | Analisar o indeferimento e decidir recurso ou ação — {cliente} | 5 | uteis
judicial | Citação | Acompanhar a citação — {numero} | 15 | corridos
judicial | Contestação / réplica | Preparar a réplica — {numero} | 15 | uteis
judicial | Sentença | Analisar a sentença e avaliar recurso — {numero} | 5 | uteis
judicial | Recurso | Protocolar recurso ou contrarrazões — {numero} | 15 | uteis
judicial | Cumprimento de sentença | Iniciar o cumprimento de sentença — {numero} | 10 | uteis
judicial | Execução / RPV-precatório | Cadastrar a RPV/precatório no controle — {cliente} | 2 | uteis
administrativo | Requerimento a protocolar | Protocolar o requerimento — {cliente} | 2 | uteis
administrativo | Em exigência | Cumprir a exigência — {numero} | 5 | uteis
administrativo | Perícia / avaliação agendada | Orientar o cliente para a perícia — {cliente} | 2 | corridos
administrativo | Indeferido | Avaliar recurso administrativo ou ação judicial — {cliente} | 5 | uteis
administrativo | Recurso administrativo | Protocolar o recurso administrativo — {numero} | 20 | uteis
crm | Proposta enviada | Follow-up da proposta — {cliente} | 2 | corridos
crm | Fechado | Converter em cliente e gerar o contrato — {cliente} | 1 | corridos`;
function regrasFluxo(){
  return String(db.fluxos?.texto??FLUXOS_PADRAO).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>{const p=l.split('|').map(x=>x.trim());
    return {tipo:norm(p[0]),etapa:p[1]||'',titulo:p[2]||'',dias:parseInt(p[3])||0,uteis:!/corr/i.test(p[4]||'')};}).filter(r=>r.etapa&&r.titulo);
}
/* registros de cada tipo: [coleção, campo da etapa, tipo do fluxo] */
const ALVOS_FLUXO=[['sm','status',()=> 'sm'],['processos','fase',p=>p.tipo==='Administrativo'?'administrativo':'judicial'],['leads','etapa',()=>'crm']];
function iniciarFluxos(){
  if(db.fluxos?.iniciado)return;
  ALVOS_FLUXO.forEach(([c,campo])=>(db[c]||[]).forEach(o=>{o.fluxoVisto=o[campo]||'';}));
  db.fluxos={...(db.fluxos||{}),iniciado:true};
}
/* chamado a cada gravação: quando a etapa de um caso muda, cria as tarefas daquela etapa (uma vez só) */
function processarFluxos(){
  if(!db||!sessao||ehParceiro()||!db.fluxos?.iniciado)return;
  const regras=regrasFluxo();let n=0;
  ALVOS_FLUXO.forEach(([c,campo,tipoDe])=>(db[c]||[]).forEach(o=>{
    const etapa=o[campo]||'';if(o.fluxoVisto===etapa)return;o.fluxoVisto=etapa;
    if(db.fluxos.desligado)return;
    const tipo=tipoDe(o);const cid=c==='leads'?'':o.clienteId||'';
    regras.filter(r=>r.tipo===tipo&&norm(r.etapa)===norm(etapa)).forEach(r=>{
      const ref=`${c}:${o.id}:${etapa}:${r.titulo}`;if(db.tarefas.some(t=>t.fluxoRef===ref))return;
      const nome=c==='leads'?o.nome:nomeCli(cid);
      const titulo=r.titulo.replace(/\{cliente\}/g,nome||'').replace(/\{numero\}/g,o.numero||nome||'');
      const resp=o.responsavelId||db.usuarioAtual;
      db.tarefas.push({id:uid(),titulo,status:'todo',prioridade:/exig|protocol|recurso|réplica/i.test(titulo)?'Alta':'Média',prazo:calcularPrazo(today(),r.dias,{uteis:r.uteis}),
        responsavelId:resp,responsaveis:[resp].filter(Boolean),clienteId:cid,processoId:c==='processos'?o.id:'',obs:'Criada automaticamente pelo fluxo da etapa "'+etapa+'".',fluxoRef:ref,criadoPor:db.usuarioAtual});n++;});
  }));
  if(n)setTimeout(()=>toast(`⚙️ ${n} tarefa(s) criada(s) pelo fluxo da etapa`),400);
}
function cardFluxosConfig(){
  return `<div class="card"><h3>⚙️ Fluxos automáticos por etapa <label class="small" style="font-weight:400"><input type="checkbox" id="fluxo-off"${db.fluxos?.desligado?' checked':''}> desligar</label></h3>
    <div class="small muted" style="margin-bottom:8px">Quando um caso muda de etapa, o sistema cria estas tarefas para o responsável. Uma por linha: <b>tipo | etapa | tarefa | dias | uteis ou corridos</b>. Tipos: <b>sm</b>, <b>judicial</b>, <b>administrativo</b>, <b>crm</b>. Use {cliente} e {numero}.</div>
    <textarea id="fluxo-txt" rows="12" style="width:100%;font-family:ui-monospace,monospace;font-size:11.5px">${esc(db.fluxos?.texto??FLUXOS_PADRAO)}</textarea>
    <div class="mfoot"><button class="btn btn-ghost" data-act="fluxoPadrao">Restaurar padrão</button><button class="btn btn-brand" data-act="fluxoSalvar">Salvar fluxos</button></div></div>
  <div class="card"><h3>📅 Feriados locais (para prazos em dias úteis)</h3><div class="small muted" style="margin-bottom:8px">Os feriados nacionais, o Carnaval, a Sexta-feira Santa, Corpus Christi e o recesso de 20/12 a 20/01 já são considerados. Acrescente os municipais/estaduais: um por linha, <b>dd/mm Nome</b> (ou dd/mm/aaaa para um ano só).</div>
    <textarea id="feriados-txt" rows="5" style="width:100%" placeholder="20/01 São Sebastião&#10;09/07 Revolução Constitucionalista">${esc(db.escritorio.feriados||'')}</textarea>
    <div class="mfoot"><button class="btn btn-brand" data-act="feriadosSalvar">Salvar feriados</button></div></div>`;
}
const FLUXO_ACOES={
  fluxoSalvar:()=>{db.fluxos={...db.fluxos,texto:$('#fluxo-txt').value,desligado:$('#fluxo-off').checked};save();render();toast(`Fluxos salvos ✓ (${regrasFluxo().length} regra(s))`);},
  fluxoPadrao:()=>{$('#fluxo-txt').value=FLUXOS_PADRAO;},
  feriadosSalvar:()=>{db.escritorio.feriados=$('#feriados-txt').value;save();render();toast('Feriados salvos ✓');},
};
