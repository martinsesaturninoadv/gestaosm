/* =========================================================
   CONSTANTES
   ========================================================= */
const KEY_V5='msadv_gestao_v5',KEY_V4='msadv_gestao_v4',KEY_STORE='msadv_gestao_v6_demo',KEY_SESSAO='msadv_gestao_v6_sessao';
const AREAS=['Previdenciário','Trabalhista','Cível','Família','Consumidor','Direito digital','Tributário','Empresarial','Criminal'];
const FASES_JUD=['Inicial / Distribuição','Citação','Contestação / réplica','Instrução','Sentença','Recurso','Cumprimento de sentença','Execução / RPV-precatório','Encerrado'];
const FASES_ADM=['Requerimento a protocolar','Protocolado — em análise','Em exigência','Perícia / avaliação agendada','Deferido','Indeferido','Recurso administrativo','Encerrado'];
const FASES=FASES_JUD.concat(FASES_ADM.filter(f=>f!=='Encerrado'));
const fasesDe=tipo=>tipo==='Administrativo'?FASES_ADM:FASES_JUD;
const STATUS_PROC=['Em andamento','Suspenso','Ganho','Acordo','Perdido','Arquivado'];
const INSTANCIAS=['1º grau','2º grau / Turma Recursal','Tribunais superiores (STJ/STF/TST)'];
const POLOS=['Ativo (autor / requerente)','Passivo (réu / requerido)','Terceiro interessado'];
const ORGAOS_ADM=['INSS','Receita Federal','Procon','Detran','Prefeitura','Banco / instituição financeira','Plataforma digital','Outro'];
const TIPOS_EVT_PADRAO=[['Prazo','#C0392B'],['Audiência','#1E5FA8'],['Perícia','#1A7A6E'],['Reunião com cliente','#6B6B6B'],['Exigência INSS','#B26A10'],['Protocolo / requerimento','#7B4FB0'],['Emissão de guia (SM)','#C84B6E'],['Diligência','#2E7D4E'],['Atendimento / consulta','#0E7490']];
const CAT_REC=['H.O. iniciais','H.O. finais — acordo','H.O. finais — êxito','Sucumbência','TMP','Honorários mensais (partido)','Consulta','Parceria (execução delegada)','Reembolso de custas','Outras receitas'];
const LUCROS='Distribuição de lucros';
const CAT_DESP=['Aluguel','Energia elétrica','Telefonia / internet','Sistemas','Tráfego — Google','Tráfego — Facebook/Instagram','Agência / marketing','Indicações pagas','Contador','Folha de pagamento','Pró-labore','Impostos','Taxa de cartão','Taxa de boleto','Tarifas bancárias','Empresa de TI','Copa','Correios','Material de expediente','Manutenção / extraordinárias','Equipamentos','Capacitação','Custas processuais','Repasse a parceiro',LUCROS,'Outras despesas'];
const FORMAS=['PIX','Boleto','Cartão','Cheque','Transferência','Dinheiro','Recorrência'];
const ETAPAS=['Novo contato','Em atendimento','Proposta enviada','Em recuperação','Fechado','Perdido','Encaminhado a parceiro'];
const ORIGENS=['Google Ads','Facebook / Instagram Ads','Instagram orgânico','Indicação de cliente','Indicação de parceiro','Site','Outro'];
const AMBITOS=['Judicial','Administrativo','Administrativo + Judicial','Extrajudicial / consultivo'];
const SEXOS=['Feminino','Masculino','Outro'];
const UFS='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const PAPEIS=[['admin','Administrador(a)'],['advogado','Advogado(a)'],['financeiro','Financeiro / administrativo'],['estagiario','Estagiário(a) — sem financeiro'],['parceiro','Parceiro — só os casos da parceria']];
const papelNome=p=>(PAPEIS.find(x=>x[0]===p)||['',p||''])[1];
const PRODUTOS_PADRAO=['Salário-maternidade','Previdenciário (outros)','Trabalhista','Família','Consumidor','Cível','Direito digital','Tributário','Empresarial'];
const METAS_PADRAO={qtd:20,valorTotal:55000,entradas:25000,ticket:2500,entradaMedia:1000,parcelasMedia:5,parcelaMedia:300,atendimentos:60,premio:'Batendo a meta do mês: happy hour da equipe e bônus de R$ 300 para quem mais pontuar!'};
const FAIXAS=[[0,20,'Até 20 anos'],[21,30,'21 a 30 anos'],[31,40,'31 a 40 anos'],[41,50,'41 a 50 anos'],[51,60,'51 a 60 anos'],[61,70,'61 a 70 anos'],[71,200,'71 anos ou mais']];
const PRIOR=['Alta','Média','Baixa'];
const TSTATUS=[['todo','A fazer'],['doing','Em andamento'],['done','Concluído']];
/* Salário-maternidade */
const SM_STATUS=['Triagem / viabilidade','Coleta de documentos','Guias em andamento','Aguardando o parto','Pronto para protocolo','Protocolado — em análise','Em exigência','Deferido','Indeferido','Recurso / judicial','Concluído'];
const SM_CATEG=['Empregada (CLT)','Desempregada (período de graça)','Desempregada','Contribuinte individual','MEI','Facultativa','Segurada especial (rural)','Empregada doméstica','Trabalhadora avulsa'];
const SM_ESTRAT=['Via vínculo empregatício','Via guias (recolhimento)','Via período de graça','Via segurada especial (rural)','Via MEI (DAS)'];
const GPS_CODIGOS=[['1007','Contribuinte individual — 20%',20],['1163','Contribuinte individual — plano simplificado 11%',11],['1406','Facultativo — 20%',20],['1473','Facultativo — plano simplificado 11%',11],['1929','Facultativo baixa renda — 5%',5],['DAS-MEI','MEI — DAS mensal',5]];
const SM_DOCS=['RG e CPF da segurada','Certidão de nascimento da criança (ou atestado/termo de guarda)','CNIS atualizado','Comprovante de residência','Carteira de trabalho / contratos','Comprovantes de recolhimento (guias pagas)','Declaração de atividade rural / autodeclaração (se rural)','Comprovante de inscrição MEI e DAS pagos (se MEI)'];
const SCRIPT_CATS=['Primeiro atendimento','Qualificação','Objeções','Fechamento','Pós-venda','Pedido de indicação','Aniversário','Cobrança','Recuperação de contato','Datas e avisos'];
const MODELO_CATS=['Contrato de honorários','Proposta de honorários','Procuração','Declaração','Recibo','Notificação','Outro'];
const TITLES={painel:'Painel',escritorio:'Escritório virtual',trafego:'Tráfego pago (Meta Ads)',requisitorios:'RPV, precatórios e alvarás',agenda:'Agenda e compromissos',tarefas:'Tarefas',clientes:'Clientes',cliente:'Cliente',registro:'Registro histórico de clientes',processos:'Contencioso e administrativo',processo:'Processo',sm:'Salário-maternidade',smcaso:'Caso de salário-maternidade',documentos:'Documentos e modelos',scripts:'Scripts de atendimento',atendimentos:'Atendimentos (CRM)',financeiro:'Contas a receber e pagar',previsao:'Previsão de recebimentos',fixas:'Despesas fixas',fluxo:'Fluxo de caixa',contratos:'Contratos e metas',parcerias:'Parcerias',indicadores:'Indicadores mensais',relatorios:'Relatórios',config:'Configurações'};
const PAG_FIN=['financeiro','previsao','fixas','fluxo','contratos','indicadores','relatorios'];
const XLSX_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

/* =========================================================
   UTILITÁRIOS
   ========================================================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brlK=v=>Math.abs(v)>=1000?(v<0?'−':'')+'R$ '+(Math.abs(v)/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':brl(v);
const num=(v,d=1)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:d});
const iso=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10);};
const today=()=>iso(new Date());
const addDays=(n,base)=>{const d=base?new Date(base+'T00:00'):new Date();d.setDate(d.getDate()+n);return iso(d);};
const addMonths=(s,n)=>{const d=new Date(s+'T00:00'),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return iso(d);};
const monthDate=(off,day)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+off);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return iso(d);};
const ymAdd=(ym,n)=>addMonths(ym+'-01',n).slice(0,7);
const fimMes=ym=>{const[y,m]=ym.split('-').map(Number);return ym+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');};
const diaNoMes=(ym,dia)=>{const[y,m]=ym.split('-').map(Number);return ym+'-'+String(Math.min(Math.max(1,dia||1),new Date(y,m,0).getDate())).padStart(2,'0');};
const fd=s=>s?new Date(s+'T00:00').toLocaleDateString('pt-BR'):'—';
const fdw=s=>s?new Date(s+'T00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}):'—';
const diff=s=>Math.round((new Date(s+'T00:00')-new Date(today()+'T00:00'))/864e5);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const mLabel=ym=>{const[y,m]=ym.split('-');return MESES[+m-1]+'/'+y.slice(2);};
const mLong=ym=>{const[y,m]=ym.split('-');return MESES_L[+m-1]+' de '+y;};
const initials=n=>String(n||'?').replace(/^(Adv|Dr|Dra)\.?\s+/i,'').replace(/\b(advocacia|advogados|associados|sociedade|de|da|do|e)\b/gi,'').split(/[^A-Za-zÀ-ú]+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
const digits=s=>String(s||'').replace(/\D/g,'');
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const sumBy=(arr,f)=>arr.reduce((s,x)=>s+(+f(x)||0),0);
const moda=arr=>{const c={};arr.filter(Boolean).forEach(v=>c[v]=(c[v]||0)+1);const e=Object.entries(c).sort((a,b)=>b[1]-a[1]);return e.length?e[0][0]:'—';};
const ehFace=o=>/facebook|instagram|meta/i.test(o||'');
const ehGoogle=o=>/google/i.test(o||'');
const ehParc=o=>/parceir/i.test(o||'');
const ehIndCli=o=>/indica/i.test(o||'')&&!ehParc(o);
const waLink=(tel,txt)=>{let d=digits(tel);if(!d)return '';if(d.length<=11)d='55'+d;return 'https://wa.me/'+d+(txt?'?text='+encodeURIComponent(txt):'');};
function parseNum(v){
  if(typeof v==='number')return v;let s=String(v??'').replace(/R\$|\s| /g,'').trim();if(!s||s==='-')return 0;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if((s.match(/\./g)||[]).length>1){const i=s.lastIndexOf('.');s=s.slice(0,i).replace(/\./g,'')+(s.length-i===3?'.':'')+s.slice(i+1);}
  else if(/^-?\d{1,3}\.\d{3}$/.test(s))s=s.replace('.','');
  const n=parseFloat(s.replace(/[^\d.-]/g,''));return isNaN(n)?0:n;
}
function parseData(v){
  if(v==null||v==='')return '';
  if(typeof v==='number'&&v>20000&&v<80000)return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
  if(v instanceof Date&&!isNaN(v))return iso(v);
  const s=String(v).trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:'';
}

function toast(msg,bad){const t=$('#toast');t.textContent=msg;t.style.background=bad?'var(--red)':'var(--brand)';t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2800);}
/* downloads: na página publicada no Claude usa a permissão "downloads"; no navegador/hospedagem, link normal */
let dlNs=null;
try{if(window.claude&&typeof window.claude.use==='function')window.claude.use('downloads').then(n=>{dlNs=n;}).catch(()=>{});}catch(e){}
async function download(name,content,type){
  name=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w.\- ]+/g,'').replace(/\s+/g,'_');
  const blob=content instanceof Blob?content:new Blob([content],{type});
  if(dlNs){try{await dlNs.save({filename:name,data:blob});}catch(e){if(e&&e.code!=='declined')toast('Não foi possível baixar aqui ('+(e.code||'erro')+').',1);}return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);
}
let xlsxP=null;
function carregarXLSX(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  return xlsxP||(xlsxP=new Promise((res,rej)=>{const s=document.createElement('script');s.src=XLSX_URL;s.onload=()=>res(window.XLSX);
    s.onerror=()=>{xlsxP=null;rej(new Error('Não foi possível carregar o leitor de Excel. Verifique a conexão com a internet.'));};document.head.appendChild(s);}));
}
async function exportarExcel(nome,abas){
  try{const X=await carregarXLSX();const wb=X.utils.book_new();
    abas.forEach(([titulo,linhas])=>X.utils.book_append_sheet(wb,X.utils.json_to_sheet(linhas.length?linhas:[{'':'Sem dados'}]),titulo.slice(0,31)));
    const buf=X.write(wb,{type:'array',bookType:'xlsx'});
    await download(nome+'.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  }catch(e){toast(e.message||'Falha ao gerar Excel',1);}
}


/* número por extenso (reais) */
function extenso(v){
  const u=['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const d=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const c=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  const ate999=n=>{if(n===0)return '';if(n===100)return 'cem';const p=[];const ce=Math.floor(n/100),r=n%100;if(ce)p.push(c[ce]);if(r){if(r<20)p.push(u[r]);else{p.push(d[Math.floor(r/10)]+(r%10?' e '+u[r%10]:''));}}return p.join(' e ');};
  const inteiro=n=>{if(n===0)return 'zero';const grupos=[['',''],['mil','mil'],['milhão','milhões'],['bilhão','bilhões']];const partes=[];let i=0;
    while(n>0){const g=n%1000;if(g){let t=i===1&&g===1?'mil':ate999(g)+(i?' '+(g===1?grupos[i][0]:grupos[i][1]):'');partes.unshift({t,g,i});}n=Math.floor(n/1000);i++;}
    return partes.map((p,k)=>(k>0&&(k===partes.length-1)&&(p.g<100||p.g%100===0)?'e ':'')+p.t).join(' ').replace(/\s+/g,' ').trim();};
  v=Math.round((+v||0)*100);const r=Math.floor(v/100),cent=v%100;
  let s=r?inteiro(r)+(r===1?' real':(r%1000000===0?' de reais':' reais')):'';
  if(cent)s+=(s?' e ':'')+inteiro(cent)+(cent===1?' centavo':' centavos');
  return s||'zero reais';
}
const corTipo=nome=>(db&&db.tiposEvento||[]).find(t=>norm(t.nome)===norm(nome))?.cor||'#6B6B6B';
const tagTipo=nome=>`<span class="pill" style="background:color-mix(in srgb,${corTipo(nome)} 15%,transparent);color:${corTipo(nome)}">${esc(nome||'—')}</span>`;
/* confirmação própria (window.confirm é bloqueado em algumas páginas incorporadas) */
function confirmar(msg,ok='Confirmar',perigo=true){
  return new Promise(res=>{const bg=$('#cbg');$('#c-msg').textContent=msg;const b=$('#c-ok');b.textContent=ok;b.className='btn '+(perigo?'btn-danger-solid':'btn-brand');
    const fim=v=>{bg.classList.remove('open');b.onclick=null;$('#c-no').onclick=null;res(v);};
    b.onclick=()=>fim(true);$('#c-no').onclick=()=>fim(false);bg.classList.add('open');setTimeout(()=>b.focus(),30);});
}
/* hash simples só para o modo demonstração (no servidor a senha usa password_hash do PHP) */
const hashDemo=s=>{let h=2166136261;for(const ch of 'msadv|'+s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
/* escritório virtual: salas fixas (nome e link do Google Meet editáveis em Configurações) */
const SALAS_ORDEM=['recepcao','joyce','vitoria','comercial','reuniao','copa'];
const SALA_PARCEIRO='reuniao';
function salasPadrao(){return {recepcao:{nome:'Recepção',meet:''},joyce:{nome:'Sala da Dra. Joyce',meet:''},vitoria:{nome:'Sala da Dra. Vitória',meet:''},
  comercial:{nome:'Comercial',meet:''},reuniao:{nome:'Sala de Reunião',meet:''},copa:{nome:'Copa',meet:''}};}
