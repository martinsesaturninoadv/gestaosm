/* =========================================================
   ASSISTENTE DE VOZ PARA TAREFAS e RESUMO DO DIA POR USUÁRIO
   ========================================================= */
const DIAS_SEMANA=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const NUM_EXT={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,quinze:15,vinte:20,trinta:30};
/* "Tarefa para a Dra. Vitória: protocolar o recurso da Maria Souza até sexta às 14h, urgente" → campos da tarefa */
function interpretarComando(txt){
  const orig=String(txt||'').trim();let n=' '+norm(orig).replace(/[,.;!?]/g,' ').replace(/\s+/g,' ')+' ';
  const out={responsaveis:[],prazo:'',hora:'',prioridade:'Média',clienteId:''};const tira=re=>{n=n.replace(re,' ');};
  // prioridade
  if(/\b(urgente|urgencia|prioridade alta|o quanto antes|imediatamente)\b/.test(n)){out.prioridade='Alta';tira(/\b(e |)(urgente|urgencia|prioridade alta|o quanto antes|imediatamente)\b/g);}
  // hora
  let m=n.match(/\b(?:as|ate as|a partir das)?\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|horas|hrs)?\s*(da manha|da tarde|da noite)?\b(?=\s)/);
  const mh=n.match(/\b(?:as|ate as|ate)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(h|horas|hrs)?\s*(da manha|da tarde|da noite)?/)||n.match(/\b(\d{1,2})[:h](\d{2})\b/)||n.match(/\b(\d{1,2})\s*(h|horas)\b(\s*(da manha|da tarde|da noite))?/);
  if(/\bmeio[ -]dia\b/.test(n)){out.hora='12:00';tira(/\b(as |ate o |ate |)meio[ -]dia\b/);}
  else if(mh){let h=+mh[1],mi=+(mh[2]&&/^\d+$/.test(mh[2])?mh[2]:0);const per=(mh[4]||mh[3]||'')+'';if(/tarde|noite/.test(per)&&h<12)h+=12;
    if(h<24&&mi<60){out.hora=String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');tira(new RegExp(mh[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}}
  // data
  const hoje=today();const proxDia=w=>{const d0=new Date(hoje+'T12:00').getDay();let k=(w-d0+7)%7;if(k===0)k=7;return addDays(k,hoje);};
  if(/\bdepois de amanha\b/.test(n)){out.prazo=addDays(2,hoje);tira(/\b(ate |para |)depois de amanha\b/);}
  else if(/\bamanha\b/.test(n)){out.prazo=addDays(1,hoje);tira(/\b(ate |para |)amanha\b/);}
  else if(/\bhoje\b/.test(n)){out.prazo=hoje;tira(/\b(ate |para |)hoje\b/);}
  else if((m=n.match(/\bdaqui a (\d+|\w+) dias?\b/))){const k=+m[1]||NUM_EXT[m[1]]||0;if(k){out.prazo=addDays(k,hoje);tira(/\bdaqui a (\d+|\w+) dias?\b/);}}
  else if(/\b(semana que vem|proxima semana)\b/.test(n)){out.prazo=addDays(7,hoje);tira(/\b(ate a |na |para a |)(semana que vem|proxima semana)\b/);}
  else if((m=n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))){let y=m[3]?(m[3].length===2?'20'+m[3]:m[3]):hoje.slice(0,4);let d=`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(!m[3]&&d<hoje)d=(+y+1)+d.slice(4);out.prazo=d;tira(/\b(ate |para |no |dia |)\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/);}
  else if((m=n.match(/\bdia (\d{1,2})\b/))){const dd=+m[1];if(dd>=1&&dd<=31){let d=hoje.slice(0,8)+String(dd).padStart(2,'0');if(d<hoje)d=ymAdd(hoje.slice(0,7),1)+'-'+String(dd).padStart(2,'0');out.prazo=d;tira(/\b(ate o |ate |no |para o |)dia \d{1,2}\b/);}}
  else{for(let w=0;w<7;w++){const re=new RegExp('\\b(ate |na |para |nesta |na proxima |)'+DIAS_SEMANA[w]+'(-feira| feira)?\\b');if(re.test(n)){out.prazo=proxDia(w);tira(re);break;}}}
  // responsáveis (nomes da equipe) e "para mim"
  if(/\b(para mim|pra mim|minha tarefa)\b/.test(n)&&db.usuarioAtual){out.responsaveis.push(db.usuarioAtual);tira(/\b(para mim|pra mim)\b/);}
  db.usuarios.forEach(u=>{const ws=norm(u.nome).replace(/\b(dra?|adv|advogad[oa])\.?\b/g,' ').split(/[^a-z]+/).filter(w=>w.length>=3&&!['estagiario','estagiaria','secretaria','parceiro'].includes(w));
    const first=ws[0];if(!first)return;const re=new RegExp('\\b(para (a |o )?|pra (a |o )?|(a |o )?(doutora|doutor|dra|dr) )?'+first+'(\\s+'+(ws[1]||'#')+')?\\b');
    if(re.test(n)&&!out.responsaveis.includes(u.id)){out.responsaveis.push(u.id);tira(re);}});
  // cliente (nome completo ou dois primeiros nomes)
  let melhor=null;db.clientes.forEach(c=>{const cn=norm(c.nome);const ws=cn.split(' ').filter(Boolean);const cands=[cn,ws.slice(0,2).join(' ')].filter(x=>x.split(' ').length>=2);
    cands.forEach(x=>{if(n.includes(' '+x+' ')&&(!melhor||x.length>melhor[1].length))melhor=[c.id,x];});});
  if(melhor){out.clienteId=melhor[0];tira(new RegExp('\\b(da cliente |do cliente |da |do |de |cliente |)'+melhor[1]+'\\b'));}
  // título: o que sobrou, sem as palavras de comando
  let t=n.replace(/\b(criar|crie|cria|nova|adicionar|adicione|anotar|anote|registrar|lembrar de|lembrete de|lembrete|tarefa|tarefas|por favor|preciso|precisa|para|pra|ate|as|no|na|com prazo)\b(?=\s)/g,m=>m).trim();
  t=t.replace(/^((criar|crie|cria|nova|adicionar|adicione|anotar|anote|registrar)\s+)?(uma\s+)?(tarefa|lembrete)?\s*(para|pra)?\s*(a|o)?\s*[:\-]?\s*/,'').replace(/^(lembrar de|lembrete de)\s+/,'').replace(/\s+(ate|para|pra|no|na|as|e)\s*$/g,'').replace(/\s{2,}/g,' ').trim();
  // devolve com acentos: procura o trecho correspondente no texto original
  out.titulo=recuperarAcentos(orig,t)||t;
  if(out.titulo)out.titulo=out.titulo.charAt(0).toUpperCase()+out.titulo.slice(1);
  if(out.clienteId&&!/—/.test(out.titulo))out.titulo+=' — '+nomeCli(out.clienteId);
  if(!out.responsaveis.length&&db.usuarioAtual)out.responsaveis.push(db.usuarioAtual);
  return out;
}
function recuperarAcentos(orig,semAcento){
  if(!semAcento)return '';const ws=semAcento.split(' ');const ow=orig.replace(/[,.;!?]/g,' ').split(/\s+/).filter(Boolean);
  const res=[];let i=0;for(const w of ws){while(i<ow.length&&norm(ow[i])!==w)i++;if(i<ow.length){res.push(ow[i]);i++;}else res.push(w);}
  return res.join(' ');
}
let VOZ=null;
function assistenteVoz(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const abrirComTexto=txt=>{const r=interpretarComando(txt);closeModal();
    setTimeout(()=>{editTarefa(null,{titulo:r.titulo,prazo:r.prazo||addDays(1),hora:r.hora,prioridade:r.prioridade,clienteId:r.clienteId,responsaveis:r.responsaveis,responsavelId:r.responsaveis[0]||db.usuarioAtual,obs:'🎙️ Ditado: "'+txt+'"'});
      toast('Confira e clique em Salvar ✓');},120);};
  modal('🎙️ Nova tarefa por voz',`<div class="voz-box"><div class="voz-mic${SR?' on':''}" id="voz-mic">🎙️</div>
    <div class="small muted" id="voz-st">${SR?'Ouvindo… fale a tarefa, por exemplo:':'Este navegador não reconhece voz. Use o microfone do teclado do celular e digite/dite abaixo. Exemplo:'}</div>
    <div class="small" style="font-style:italic;margin:6px 0 10px">"Tarefa para a Dra. Vitória: protocolar o recurso da Maria Souza até sexta às 14h, urgente"</div>
    <textarea id="voz-txt" rows="3" style="width:100%" placeholder="O que você falar aparece aqui…"></textarea></div>`,
    [{l:'Cancelar',c:'btn-ghost',fn:()=>{try{VOZ&&VOZ.abort();}catch(e){}closeModal();}},{l:'Criar tarefa',c:'btn-brand',fn:()=>{try{VOZ&&VOZ.stop();}catch(e){}const t=$('#voz-txt').value.trim();if(!t)return toast('Fale ou digite a tarefa',1);abrirComTexto(t);}}]);
  if(!SR){setTimeout(()=>$('#voz-txt')?.focus(),100);return;}
  try{VOZ=new SR();VOZ.lang='pt-BR';VOZ.interimResults=true;VOZ.continuous=false;let final='';
    VOZ.onresult=e=>{let tmp='';for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)final+=r[0].transcript+' ';else tmp+=r[0].transcript;}const box=$('#voz-txt');if(box)box.value=(final+tmp).trim();};
    VOZ.onerror=e=>{const st=$('#voz-st');if(st)st.textContent=e.error==='not-allowed'?'Permita o uso do microfone no navegador e tente de novo.':'Não entendi. Tente de novo ou digite abaixo.';$('#voz-mic')?.classList.remove('on');};
    VOZ.onend=()=>{$('#voz-mic')?.classList.remove('on');const t=$('#voz-txt')?.value.trim();if(t&&final)setTimeout(()=>{if($('#voz-txt'))abrirComTexto(t);},400);};
    VOZ.start();}catch(e){toast('Não foi possível usar o microfone',1);}
}

/* ---------- resumo do dia ---------- */
function resumoDia(dia){
  const no=d=>(d||'').slice(0,10)===dia;const emDia=ms=>ms&&iso(new Date(ms))===dia;
  return db.usuarios.filter(u=>!/parceir/i.test(u.papel)).map(u=>{
    const it=[];const add=(ic,txt,go)=>it.push({ic,txt,go});
    db.tarefas.filter(t=>t.status==='done'&&t.concluidoPor===u.id&&no(t.concluidoEm)).forEach(t=>add('☑','Concluiu a tarefa: '+t.titulo));
    db.eventos.filter(e=>e.feito&&(e.feitoPor||e.responsavelId)===u.id&&no(e.feitoEm)).forEach(e=>add('⏰','Cumpriu: '+(e.tipo?e.tipo+' — ':'')+e.titulo));
    db.processos.forEach(p=>(p.andamentos||[]).filter(a=>a.autor===u.id&&no(a.data)).forEach(a=>add('⚖️','Andamento em '+p.numero+': '+String(a.texto).slice(0,80),'processo/'+p.id)));
    db.leads.filter(l=>l.criadoPor===u.id&&no(l.criado)).forEach(l=>add('◈','Novo atendimento: '+l.nome));
    db.leads.filter(l=>l.etapa==='Fechado'&&no(l.dataFechamento)&&(l.responsavelId===u.id||l.criadoPor===u.id)).forEach(l=>add('🤝','Fechou: '+l.nome+(+l.valorFechado?' ('+brl(+l.valorFechado)+')':'')));
    db.contratos.filter(k=>k.responsavelId===u.id&&no(k.data)).forEach(k=>add('✎','Contrato de '+nomeCli(k.clienteId)+(podeFin()?' — '+brl(k.valorTotal):'')));
    db.peticoes.forEach(p=>(p.historico||[]).filter(h=>h.por===u.id&&emDia(h.em)).forEach(h=>add('🔎',(h.status==='A conferir'?'Enviou para conferência':h.status==='Conferida'?'Conferiu':h.status==='Protocolada'?'Protocolou':'Moveu para "'+h.status+'"')+': '+p.titulo,'peticoes')));
    db.notas.filter(x=>x.autor===u.id&&no(x.data)).forEach(x=>add('📝','Registro em '+nomeCli(x.clienteId)+': '+String(x.texto).slice(0,70)));
    db.recados.filter(r=>r.criadoPor===u.id&&emDia(r.em)).forEach(r=>add('💬','Mensagem no portal para '+nomeCli(r.clienteId)));
    (db.conteudos||[]).filter(c=>(c.historico||[]).some(h=>h.por===u.id&&emDia(h.em))).forEach(c=>add('🎬','Conteúdo: '+c.titulo+' ('+c.etapa+')','conteudo'));
    return {u,it};
  });
}
V.resumo=()=>{
  const f=ui.f.res||(ui.f.res={dia:today()});const r=resumoDia(f.dia);const tot=sumBy(r,x=>x.it.length);
  const ord=r.slice().sort((a,b)=>b.it.length-a.it.length);
  return `<div class="toolbar"><input type="date" data-f="res.dia" value="${esc(f.dia)}"><button class="btn btn-ghost btn-sm" data-act="resDia" data-id="-1">‹ dia anterior</button><button class="btn btn-ghost btn-sm" data-act="resDia" data-id="1">próximo dia ›</button>
    <span class="grow"></span><button class="btn btn-ghost" data-act="resCopiar">Copiar resumo</button></div>
  <div class="hint">📋 <b>${tot}</b> atividade(s) registradas em ${fd(f.dia)} por ${r.filter(x=>x.it.length).length} pessoa(s). O resumo junta tarefas concluídas, prazos cumpridos, andamentos, atendimentos, fechamentos, petições, registros e mensagens.</div>
  <div class="grid g-2">${ord.map(({u,it})=>`<div class="card"><h3><span class="flx" style="gap:8px"><span class="av">${esc(initials(u.nome))}</span>${esc(u.nome)}</span><small>${it.length} atividade(s)</small></h3>
    ${it.length?it.map(x=>`<div class="ev"${x.go?` data-go="${x.go}" style="cursor:pointer"`:''}><span class="pic">${x.ic}</span><div class="body small">${esc(x.txt)}</div></div>`).join(''):'<div class="empty">Nada registrado neste dia</div>'}</div>`).join('')}</div>`;
};
function textoResumoDia(dia){
  const r=resumoDia(dia);return `📋 Resumo do dia ${fd(dia)} — ${db.escritorio.nome||''}\n\n`+r.map(({u,it})=>`*${u.nome}* (${it.length})\n`+(it.length?it.map(x=>`${x.ic} ${x.txt}`).join('\n'):'— nada registrado')).join('\n\n');
}
const VOZ_ACOES={
  voz:()=>assistenteVoz(),
  resDia:d=>{const f=ui.f.res;f.dia=addDays(+d,f.dia);render();},
  resCopiar:()=>{const t=textoResumoDia(ui.f.res.dia);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Resumo copiado ✓ (cole no WhatsApp do escritório)')).catch(()=>toast('Não foi possível copiar',1));},
};
