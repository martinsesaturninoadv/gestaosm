/* =========================================================
   CONTEÚDO PADRÃO: modelos de documentos, scripts e dados de demonstração v6
   (tudo editável dentro do sistema)
   ========================================================= */
const ASSIN=`{{cidade_esc}}, {{data}}.


_______________________________________
CONTRATANTE: {{cliente}}


_______________________________________
CONTRATADO: {{escritorio}}`;
const CLAUS_FINAIS=(n)=>`CLÁUSULA ${n}ª — DOS DADOS PESSOAIS. Os dados pessoais do CONTRATANTE, inclusive os sensíveis, serão tratados exclusivamente para a execução deste contrato e para o exercício regular de direitos, com sigilo profissional, nos termos da Lei nº 13.709/2018 (LGPD).

CLÁUSULA ${n+1}ª — DA RESCISÃO. Em caso de revogação do mandato ou desistência sem culpa do CONTRATADO, serão devidos os honorários proporcionais aos serviços já prestados, sem prejuízo dos honorários de êxito, conforme o Código de Ética e Disciplina da OAB.

CLÁUSULA ${n+2}ª — DO FORO. Fica eleito o foro da comarca de {{cidade_esc}} para dirimir dúvidas oriundas deste contrato.

E, por estarem de acordo, as partes assinam o presente em duas vias de igual teor.

${ASSIN}`;
const CAB=(area)=>`CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS
${area}

CONTRATANTE: {{qualificacao}}.

CONTRATADO: {{escritorio_qualificacao}}, por seus advogados {{advogados}}.`;

function modelosPadrao(){
  const m=(nome,categoria,area,texto)=>({id:uid(),nome,categoria,area,texto,padrao:true});
  return [
  m('Contrato — Salário-maternidade','Contrato de honorários','Salário-maternidade',`${CAB('SALÁRIO-MATERNIDADE')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO prestará serviços de advocacia para requerer e acompanhar o benefício de salário-maternidade da CONTRATANTE em razão do nascimento (ou adoção/guarda) de {{crianca}}, com data prevista/efetiva em {{dpp}}, compreendendo: análise da qualidade de segurada e da carência, planejamento das contribuições, emissão e controle das guias de recolhimento necessárias, requerimento administrativo perante o INSS, cumprimento de exigências, recursos e, se necessário, ação judicial.

CLÁUSULA 2ª — DOS HONORÁRIOS. A CONTRATANTE pagará honorários de {{valor}} ({{valor_extenso}}), {{condicoes}}, além de {{exito}} sobre as parcelas do benefício efetivamente recebidas.
§ 1º Recebendo o benefício diretamente, a CONTRATANTE pagará os honorários de êxito em até 5 (cinco) dias do crédito em sua conta.
§ 2º Havendo pagamento judicial (RPV/precatório), a CONTRATANTE autoriza o destaque dos honorários, nos termos do art. 22, § 4º, da Lei nº 8.906/1994.

CLÁUSULA 3ª — DAS GUIAS DE RECOLHIMENTO. Quando a estratégia exigir contribuições (GPS ou DAS-MEI), o CONTRATADO indicará as competências, códigos e valores, e a CONTRATANTE se obriga a pagá-las até o vencimento e a enviar os comprovantes. O atraso no pagamento pode impedir a concessão do benefício, não sendo de responsabilidade do CONTRATADO.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATANTE. Fornecer documentos verdadeiros e completos (RG, CPF, CNIS, carteira de trabalho, comprovante de residência); enviar a certidão de nascimento da criança em até 10 (dez) dias após o parto; informar imediatamente qualquer carta, exigência ou contato do INSS; manter telefone e e-mail atualizados.

CLÁUSULA 5ª — DA OBRIGAÇÃO DE MEIO. A obrigação do CONTRATADO é de meio: a concessão do benefício depende da análise do INSS ou do Poder Judiciário.

CLÁUSULA 6ª — DAS DESPESAS. Contribuições previdenciárias, cópias, autenticações e eventuais custas correm por conta da CONTRATANTE.

${CLAUS_FINAIS(7)}`),
  m('Contrato — Previdenciário (aposentadorias e benefícios)','Contrato de honorários','Previdenciário',`${CAB('DIREITO PREVIDENCIÁRIO')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO prestará serviços de advocacia previdenciária ao CONTRATANTE, compreendendo análise de viabilidade e planejamento, requerimento administrativo perante o INSS, acompanhamento de exigências e perícias, recursos administrativos e, se necessário, ação judicial, relativos a: {{objeto}}.

CLÁUSULA 2ª — DOS HONORÁRIOS. O CONTRATANTE pagará:
a) honorários iniciais de {{valor}} ({{valor_extenso}}), {{condicoes}};
b) honorários de êxito de {{exito}} sobre os valores atrasados (parcelas vencidas) recebidos administrativa ou judicialmente, inclusive por RPV ou precatório.
Parágrafo único. O CONTRATANTE autoriza o destaque dos honorários contratuais do valor a receber, nos termos do art. 22, § 4º, da Lei nº 8.906/1994.

CLÁUSULA 3ª — DAS OBRIGAÇÕES DO CONTRATANTE. Fornecer documentos verdadeiros e completos (CNIS, carteiras de trabalho, PPP/laudos, exames e relatórios médicos); comparecer a perícias, avaliações sociais e audiências; informar imediatamente qualquer correspondência ou exigência do INSS.

CLÁUSULA 4ª — DAS DESPESAS. Perícias particulares, cópias, autenticações e deslocamentos correrão por conta do CONTRATANTE, mediante prévia comunicação.

CLÁUSULA 5ª — DA OBRIGAÇÃO DE MEIO. A concessão do benefício depende de decisão do INSS ou do Poder Judiciário, não havendo garantia de resultado.

${CLAUS_FINAIS(6)}`),
  m('Contrato — Trabalhista','Contrato de honorários','Trabalhista',`${CAB('DIREITO DO TRABALHO')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO patrocinará os interesses do CONTRATANTE em reclamação trabalhista e/ou negociação extrajudicial em face de {{parte_contraria}}, relativa a: {{objeto}}, até o trânsito em julgado e a execução.

CLÁUSULA 2ª — DOS HONORÁRIOS. O CONTRATANTE pagará:
a) honorários iniciais de {{valor}} ({{valor_extenso}}), {{condicoes}};
b) honorários de êxito de {{exito}} sobre o valor bruto recebido, seja por acordo, seja por condenação.
Parágrafo único. Os honorários de sucumbência fixados em favor do advogado (art. 791-A da CLT) pertencem exclusivamente ao CONTRATADO e não se compensam com os contratuais.

CLÁUSULA 3ª — DAS AUDIÊNCIAS. O CONTRATANTE se obriga a comparecer às audiências designadas, ciente de que sua ausência pode acarretar o arquivamento da reclamação ou a aplicação de confissão (art. 844 da CLT), e a indicar testemunhas quando solicitado.

CLÁUSULA 4ª — DOS RISCOS. O CONTRATANTE declara ter sido informado de que, em caso de improcedência total ou parcial, poderá haver condenação em honorários de sucumbência em favor da parte contrária, nos termos da lei.

CLÁUSULA 5ª — DAS OBRIGAÇÕES DO CONTRATANTE. Fornecer documentos (CTPS, contracheques, termo de rescisão, extrato do FGTS, conversas e provas) e informações verdadeiras.

${CLAUS_FINAIS(6)}`),
  m('Contrato — Cível e consumidor','Contrato de honorários','Cível',`${CAB('DIREITO CIVIL E DO CONSUMIDOR')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO prestará serviços advocatícios ao CONTRATANTE em procedimento extrajudicial e/ou judicial em face de {{parte_contraria}}, relativo a: {{objeto}}, inclusive perante os Juizados Especiais (Lei nº 9.099/1995), até a fase de cumprimento de sentença.

CLÁUSULA 2ª — DOS HONORÁRIOS. O CONTRATANTE pagará:
a) honorários iniciais de {{valor}} ({{valor_extenso}}), {{condicoes}};
b) honorários de êxito de {{exito}} sobre o proveito econômico obtido (indenizações, restituições ou valores recebidos por acordo).
Parágrafo único. Os honorários de sucumbência pertencem ao advogado (art. 85 do CPC e art. 23 da Lei nº 8.906/1994) e não se compensam com os contratuais.

CLÁUSULA 3ª — DAS DESPESAS. Custas, preparo de recursos, perícias e diligências correrão por conta do CONTRATANTE, salvo gratuidade da justiça deferida.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE. Fornecer contratos, notas fiscais, faturas, protocolos de atendimento, conversas e demais provas, e comparecer às audiências designadas.

CLÁUSULA 5ª — DA OBRIGAÇÃO DE MEIO. Não há garantia de resultado, que depende de decisão judicial ou acordo.

${CLAUS_FINAIS(6)}`),
  m('Contrato — Família','Contrato de honorários','Família',`${CAB('DIREITO DE FAMÍLIA')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO prestará serviços advocatícios ao CONTRATANTE em: {{objeto}}, abrangendo tentativa de solução consensual, audiências de conciliação e mediação e, se necessário, o processo judicial até a sentença.

CLÁUSULA 2ª — DOS HONORÁRIOS. O CONTRATANTE pagará honorários de {{valor}} ({{valor_extenso}}), {{condicoes}}. Havendo partilha de bens, serão devidos ainda {{exito}} sobre o valor dos bens atribuídos ao CONTRATANTE.

CLÁUSULA 3ª — DO ESCOPO. Não estão incluídos: recursos aos tribunais, execução de alimentos, inventário ou outras ações conexas, que serão objeto de nova contratação.

CLÁUSULA 4ª — DO SIGILO. As partes reconhecem que as ações de família tramitam em segredo de justiça e que o CONTRATADO manterá sigilo absoluto sobre as informações recebidas.

CLÁUSULA 5ª — DAS OBRIGAÇÕES DO CONTRATANTE. Fornecer certidões, comprovantes de renda e de despesas, documentos dos bens e comparecer às audiências e sessões de mediação.

${CLAUS_FINAIS(6)}`),
  m('Contrato — Direito digital','Contrato de honorários','Direito digital',`${CAB('DIREITO DIGITAL')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO prestará serviços advocatícios ao CONTRATANTE relativos a: {{objeto}}, podendo incluir: notificações extrajudiciais a plataformas, provedores e instituições financeiras; pedidos de remoção de conteúdo e de identificação de responsáveis (Lei nº 12.965/2014 — Marco Civil da Internet); recuperação de contas e perfis; medidas relativas a golpes e fraudes digitais; demandas envolvendo proteção de dados (Lei nº 13.709/2018 — LGPD); e as ações judiciais cabíveis, inclusive com pedido de tutela de urgência.

CLÁUSULA 2ª — DOS HONORÁRIOS. O CONTRATANTE pagará:
a) honorários iniciais de {{valor}} ({{valor_extenso}}), {{condicoes}};
b) honorários de êxito de {{exito}} sobre indenizações, restituições ou valores recuperados.

CLÁUSULA 3ª — DA PRESERVAÇÃO DE PROVAS. O CONTRATANTE se obriga a NÃO apagar mensagens, publicações, perfis ou e-mails relacionados ao caso e a fornecer capturas de tela com endereço (URL), data e hora, links, números de protocolo e comprovantes de transações.

CLÁUSULA 4ª — DAS DESPESAS. Atas notariais, perícias técnicas em meios digitais, custas e diligências correrão por conta do CONTRATANTE, mediante prévia comunicação.

CLÁUSULA 5ª — DA URGÊNCIA E DOS LIMITES. O CONTRATANTE declara ciência de que a remoção de conteúdo e a identificação de autores dependem, em regra, de ordem judicial e da resposta das plataformas, inclusive estrangeiras, não havendo garantia de prazo ou resultado.

${CLAUS_FINAIS(6)}`),
  m('Contrato — Tributário / empresarial (partido mensal)','Contrato de honorários','Empresarial',`${CAB('ASSESSORIA JURÍDICA EMPRESARIAL E TRIBUTÁRIA')}

CLÁUSULA 1ª — DO OBJETO. O CONTRATADO prestará assessoria jurídica contínua à CONTRATANTE, compreendendo: {{objeto}}; consultas por escrito e reuniões; análise e elaboração de contratos; e acompanhamento das demandas judiciais e administrativas listadas em anexo.

CLÁUSULA 2ª — DOS HONORÁRIOS. A CONTRATANTE pagará honorários mensais de {{valor}} ({{valor_extenso}}), com vencimento todo dia {{dia_venc}}, por {{forma}}, reajustados anualmente pelo IPCA. Êxitos em teses tributárias: {{exito}} sobre o crédito efetivamente recuperado ou compensado.

CLÁUSULA 3ª — DO ESCOPO. Demandas não incluídas no objeto (novas ações, operações societárias, recursos aos tribunais superiores) serão orçadas à parte.

CLÁUSULA 4ª — DO PRAZO. Este contrato vigora por 12 (doze) meses, renovando-se automaticamente, podendo ser rescindido por qualquer das partes com aviso prévio de 30 (trinta) dias.

${CLAUS_FINAIS(5)}`),
  m('Proposta de honorários','Proposta de honorários','',`PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS

Ao(À) Sr(a). {{cliente}}

Agradecemos a confiança. Conforme conversamos, apresentamos a nossa proposta para atuação em: {{objeto}}.

1. O QUE ESTÁ INCLUÍDO
• Análise completa do caso e dos documentos;
• Definição da melhor estratégia ({{area}});
• Atuação administrativa e/ou judicial até a decisão final;
• Acompanhamento e atualizações pelo WhatsApp, com atendimento para dúvidas.

2. INVESTIMENTO
• Honorários iniciais: {{valor}} ({{valor_extenso}}) — {{condicoes}}.
• Honorários de êxito: {{exito}} sobre o proveito econômico obtido.
• Despesas como custas, cópias e perícias particulares não estão incluídas.

3. FORMAS DE PAGAMENTO
PIX, boleto ou cartão de crédito (consulte o parcelamento).

4. VALIDADE
Esta proposta é válida até {{validade}}.

Estamos à disposição para esclarecer qualquer dúvida.

{{cidade_esc}}, {{data}}.

{{escritorio}}
{{advogados}}`),
  m('Procuração ad judicia et extra','Procuração','',`PROCURAÇÃO AD JUDICIA ET EXTRA

OUTORGANTE: {{qualificacao}}.

OUTORGADOS: {{advogados}}, integrantes de {{escritorio_qualificacao}}.

PODERES: pelo presente instrumento, o(a) outorgante nomeia e constitui os outorgados seus bastantes procuradores, conferindo-lhes os poderes da cláusula ad judicia et extra para o foro em geral, em qualquer juízo, instância ou tribunal, bem como perante órgãos da administração pública, inclusive o Instituto Nacional do Seguro Social (INSS), podendo propor ações, contestar, recorrer, transigir, desistir, firmar acordos, receber e dar quitação, requerer benefícios, emitir guias, cumprir exigências, substabelecer com ou sem reserva de poderes e praticar todos os demais atos necessários ao fiel cumprimento deste mandato, especialmente para: {{objeto}}.

{{cidade_esc}}, {{data}}.


_______________________________________
{{cliente}}`),
  m('Declaração de hipossuficiência','Declaração','',`DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA

Eu, {{qualificacao}}, DECLARO, para os fins do art. 99 do Código de Processo Civil, que não possuo condições de arcar com as custas e despesas processuais sem prejuízo do meu próprio sustento e de minha família, razão pela qual requeiro os benefícios da gratuidade da justiça.

Declaro estar ciente de que a falsidade desta declaração sujeita o(a) declarante às sanções civis, administrativas e penais cabíveis.

{{cidade_esc}}, {{data}}.


_______________________________________
{{cliente}}`),
  m('Recibo de honorários','Recibo','',`RECIBO DE HONORÁRIOS

Recebemos de {{cliente}}, {{tipodoc}} nº {{doc}}, a importância de {{valor}} ({{valor_extenso}}), referente a honorários advocatícios relativos a: {{objeto}}.

Para clareza, firmamos o presente recibo, dando plena e geral quitação do valor acima.

{{cidade_esc}}, {{data}}.


_______________________________________
{{escritorio}}`),
  m('Notificação extrajudicial — remoção de conteúdo','Notificação','Direito digital',`NOTIFICAÇÃO EXTRAJUDICIAL

À {{parte_contraria}}

NOTIFICANTE: {{qualificacao}}, por seus advogados {{advogados}}.

Pela presente, o(a) NOTIFICANTE vem comunicar que se encontra disponível em vossa plataforma conteúdo que viola seus direitos de personalidade (honra, imagem e privacidade), conforme endereços (URLs) e capturas anexas, relativo a: {{objeto}}.

Diante disso, NOTIFICA-SE para que, no prazo de 48 (quarenta e oito) horas: (i) torne indisponível o conteúdo indicado; (ii) preserve os registros de acesso e de conexão relacionados, nos termos dos arts. 13, 15 e 22 da Lei nº 12.965/2014 (Marco Civil da Internet); e (iii) informe as providências adotadas.

O não atendimento ensejará as medidas judiciais cabíveis, inclusive pedido de tutela de urgência e indenização.

{{cidade_esc}}, {{data}}.

{{escritorio}}
{{advogados}}`),
  ];
}

function scriptsPadrao(){
  const s=(categoria,titulo,texto,produto)=>({id:uid(),categoria,titulo,texto,produto:produto||''});
  return [
  s('Primeiro atendimento','Boas-vindas (todos os casos)','Olá, [Nome]! Tudo bem? Aqui é [Usuário], do escritório [Escritório]. Recebemos sua mensagem e vou te ajudar pessoalmente. Para eu entender o seu caso, pode me contar em poucas palavras o que aconteceu?'),
  s('Primeiro atendimento','Salário-maternidade — primeira resposta','Oi, [Nome]! Parabéns pela gestação/bebê! 💛 Sou [Usuário], do [Escritório]. Para verificar se você tem direito ao salário-maternidade, me responda: 1) Qual a data prevista do parto (ou do nascimento)? 2) Você trabalhou de carteira assinada, foi MEI ou pagou o INSS por conta nos últimos anos? 3) Quando foi o seu último trabalho/contribuição?','Salário-maternidade'),
  s('Primeiro atendimento','Direito digital — golpe ou perfil falso','Olá, [Nome]! Sinto muito pelo ocorrido. Primeira orientação importante: NÃO apague nada (mensagens, perfis, comprovantes). Tire prints mostrando o link, a data e a hora. Agora me conte: foi golpe com PIX/cartão, conta invadida ou conteúdo publicado sem autorização?','Direito digital'),
  s('Qualificação','Perguntas de triagem','Para eu analisar direitinho, preciso de algumas informações: nome completo, cidade, profissão, como ficou sabendo do escritório e se já procurou outro advogado ou o órgão antes. Pode me enviar também uma foto do seu documento e do CNIS (se tiver)?'),
  s('Objeções','"Está caro"','Entendo, [Nome]. Vale lembrar que o nosso trabalho envolve análise completa, estratégia e acompanhamento até o final — e que um pedido mal feito pode ser negado e atrasar meses. Por isso podemos facilitar: uma entrada menor e o restante parcelado, ou parte só no êxito. Qual formato fica melhor para você?'),
  s('Objeções','"Vou pensar"','Claro, [Nome], é uma decisão importante. Posso te ajudar a pensar: ficou alguma dúvida sobre o valor, sobre como funciona o processo ou sobre os prazos? Lembrando que, no seu caso, o tempo conta: quanto antes começarmos, melhor.'),
  s('Objeções','"Já pedi e foi negado"','Isso é muito comum, [Nome], e não significa que você não tenha direito. Muitas negativas acontecem por falta de documento ou erro no pedido. Me envie a carta de indeferimento: vou analisar o motivo e te dizer se cabe recurso ou novo pedido.'),
  s('Objeções','"Tenho medo de golpe"','Você está certa em se proteger, [Nome]! Somos o escritório [Escritório], com registro na OAB, e você pode confirmar nossos advogados no site da OAB. Nunca pedimos senha de banco nem pagamento para liberar benefício. Posso fazer uma chamada de vídeo para você nos conhecer.'),
  s('Objeções','"Não tenho os documentos agora"','Sem problema, [Nome]! Podemos começar com o que você tem. Vou te mandar a lista e você envia aos poucos, por foto, aqui mesmo no WhatsApp. O importante é já garantir a análise do seu caso.'),
  s('Fechamento','Envio do contrato','Perfeito, [Nome]! Vou te enviar agora o contrato e a procuração para assinatura digital. Depois de assinado, já começamos o seu caso e te mantenho informada de cada passo. Qualquer dúvida, é só me chamar!'),
  s('Pós-venda','Boas-vindas ao cliente','Seja muito bem-vinda, [Nome]! A partir de agora o seu caso está com a nossa equipe. Sempre que houver novidade você recebe uma mensagem por aqui. Se o INSS ou qualquer órgão entrar em contato com você, nos avise na hora, combinado?'),
  s('Pós-venda','Atualização de andamento','Oi, [Nome]! Passando para atualizar: o seu caso está em andamento e seguimos acompanhando de perto. Assim que houver qualquer decisão eu te aviso. Precisa de algo?'),
  s('Pós-venda','Benefício concedido / êxito','[Nome], ótima notícia! 🎉 O seu pedido foi APROVADO! Vou te explicar os próximos passos e os valores. Obrigado pela confiança no nosso trabalho!'),
  s('Pedido de indicação','Pedido de indicação após resultado','[Nome], ficamos muito felizes em ajudar você! Se conhecer alguém que precise de ajuda (gestantes, trabalhadores, aposentadorias, golpes digitais…), pode indicar o nosso contato. Será um prazer cuidar de quem você confia. 💛'),
  s('Aniversário','Feliz aniversário','Feliz aniversário, [Nome]! 🎂 Toda a equipe do [Escritório] deseja a você um novo ano cheio de saúde, conquistas e alegria. Conte sempre com a gente!'),
  s('Cobrança','Lembrete de parcela (gentil)','Oi, [Nome]! Tudo bem? Passando para lembrar que a parcela dos honorários vence em breve. Se preferir, posso te mandar a chave PIX ou o boleto por aqui. Obrigado!'),
  s('Cobrança','Parcela em atraso','Olá, [Nome]! Notamos que a parcela dos honorários está em aberto. Aconteceu alguma coisa? Se precisar, podemos combinar uma nova data. Me avise por aqui, por favor.'),
  s('Recuperação de contato','Lead que sumiu','Oi, [Nome]! Tudo bem? Conversamos há alguns dias sobre o seu caso e não quero que você perca o seu direito por causa de prazo. Ainda posso te ajudar? Se preferir, me diga o melhor horário para uma ligação rápida.'),
  s('Datas e avisos','Guia de recolhimento do INSS','Oi, [Nome]! Segue a guia do INSS da competência indicada. O vencimento é no dia 15. Assim que pagar, me envie o comprovante por aqui, combinado? Isso é essencial para garantir o seu salário-maternidade.','Salário-maternidade'),
  s('Datas e avisos','Perto da data do parto','[Nome], a data do parto está chegando! 💛 Assim que o bebê nascer, me envie a certidão de nascimento para darmos entrada no seu salário-maternidade o quanto antes.','Salário-maternidade'),
  ];
}

/* dados de demonstração acrescentados na versão 6 */
function seedV6(d){
  const P='parceiro@costaadv.com';
  const em={u1:'admin@escritorio.com',u2:'saturnino@escritorio.com',u3:'estagiario@escritorio.com',u4:'secretaria@escritorio.com'};
  d.usuarios.forEach(u=>u.email=em[u.id]||u.email);
  d.usuarios.push({id:'u5',nome:'Dra. Vitória',papel:'Advogado(a)',oab:'OAB/SP 000.005',email:'vitoria@escritorio.com'},{id:'u6',nome:'Dr. Rafael Costa',papel:'Parceiro',oab:'OAB/RJ 000.006',email:P});
  d.clientes.find(c=>c.id==='c6').parceiro=P;
  d.contratos.find(k=>k.id==='k3').parceriaPct=30;
  const lp=d.leads.find(l=>l.nome==='Patrícia Gomes');if(lp)lp.parceiro=P;
  d.contratos.forEach((k,i)=>k.responsavelId=['u1','u2','u5'][i%3]);
  d.leads.forEach((l,i)=>l.criadoPor=['u4','u5','u1','u3'][i%4]);
  d.processos.forEach(p=>{(p.andamentos||[]).forEach(a=>a.autor=p.responsavelId);
    if(p.tipo==='Judicial'){p.instancia='1º grau';p.polo='Ativo (autor / requerente)';p.comarca=(p.orgao||'').split(/—|-/).pop().trim();}
    else{p.orgaoAdm='INSS';p.protocolo=p.numero.replace(/^NB\s*/,'');p.der=p.distribuicao;p.prazoAnalise=addDays(45,p.distribuicao);}});
  d.tarefas.forEach(t=>{if(t.status==='done'){t.concluidoEm=t.prazo<=today()?t.prazo:today();t.concluidoPor=t.responsavelId;}});
  const hojeMes=d=>d.slice(0,7)===today().slice(0,7)?d:today();
  [['Protocolar requerimento — Isabela','u5',0,'c5','p5'],['Analisar CNIS — Kátia','u5',-1],['Revisar contrato — TechNova','u2',-1,'c7','p7'],['Montar pasta de provas — Camila','u5',-2],
   ['Responder e-mails de clientes','u4',0],['Atualizar andamentos da semana','u3',-1],['Peticionar juntada de documentos — José Carlos','u1',-2,'c3','p9']].forEach(([titulo,r,off,cid,pid])=>
    d.tarefas.push({id:uid(),titulo,status:'done',prazo:hojeMes(addDays(off)),prioridade:'Média',responsavelId:r,clienteId:cid||'',processoId:pid||'',concluidoEm:hojeMes(addDays(off)),concluidoPor:r}));
  d.eventos.forEach(e=>{if(e.feito)e.feitoEm=e.data;});
  d.eventos.push({id:uid(),tipo:'Atendimento / consulta',titulo:'Consulta inicial — golpe do PIX',processoId:'',clienteId:'',data:hojeMes(addDays(-1)),hora:'15:00',responsavelId:'u5',feito:true,feitoEm:hojeMes(addDays(-1)),obs:''});
  // aniversários (para o painel)
  const aniv=(off,ano)=>{const x=addDays(off);return ano+x.slice(4);};
  d.clientes.find(c=>c.id==='c1').nascimento=aniv(2,1997);d.clientes.find(c=>c.id==='c5').nascimento=aniv(0,2002);d.clientes.find(c=>c.id==='c3').nascimento=aniv(5,1979);
  // Direito digital
  d.clientes.push({id:'c11',tipo:'PF',nome:'Camila Torres',doc:'444.555.666-77',tel:'(11) 97654-3210',email:'camila@email.com',cidade:'Santo André',uf:'SP',origem:'Instagram orgânico',produto:'Direito digital',status:'Ativo',
    criado:addDays(-6),primeiroContato:addDays(-9),ultimoContato:addDays(-2),sexo:'Feminino',idade:32,profissao:'Designer',renda:5200,obs:'Perfil falso usando fotos da cliente para aplicar golpes.'});
  d.processos.push({id:'p10',clienteId:'c11',numero:'1012345-22.2026.8.26.0554',area:'Direito digital',tipo:'Judicial',orgao:'JEC de Santo André',parteContraria:'Rede Social Exemplo Ltda.',objeto:'Remoção de perfil falso + indenização',
    fase:'Citação',status:'Em andamento',responsavelId:'u5',valorCausa:20000,distribuicao:addDays(-4),instancia:'1º grau',polo:'Ativo (autor / requerente)',comarca:'Santo André',
    andamentos:[{id:uid(),data:addDays(-4),texto:'Distribuição com pedido de tutela de urgência.',autor:'u5'},{id:uid(),data:addDays(-2),texto:'Tutela deferida: remoção do perfil em 48h.',autor:'u5'}]});
  const k12={id:'k12',clienteId:'c11',processoId:'p10',data:hojeMes(addDays(-2)),produto:'Direito digital',ambito:'Judicial',valorTotal:3500,entrada:1500,parcelas:2,forma:'PIX',cac:0,custos:180,custosDesc:'Ata notarial',
    diaVenc:10,exitoPct:30,valorParcela:1000,hoAcordo:0,hoExito:0,sucumbencia:0,titular:'',proposta:'',obs:'',responsavelId:'u5'};
  d.contratos.push(k12);d.lancamentos.push(...gerarParcelas(k12,v=>v<=today()));
  d.leads.push({id:uid(),nome:'Bruno Lima',tel:'(11) 91234-5678',produto:'Direito digital',origem:'Google Ads',etapa:'Em atendimento',valor:3000,criado:addDays(-2),primeiroContato:addDays(-2),ultimoContato:addDays(-1),
    obs:'Conta do Instagram invadida e usada para golpes.',sexo:'Masculino',idade:29,uf:'SP',cidade:'São Paulo',email:'',profissao:'Empreendedor',renda:6000,proposta:'',criadoPor:'u5'});
  d.eventos.push({id:uid(),tipo:'Prazo',titulo:'Comprovar cumprimento da tutela (prints)',processoId:'p10',clienteId:'c11',data:addDays(4),hora:'',responsavelId:'u5',feito:false,obs:''});
  // Salário-maternidade
  const comp0=monthDate(-3,1).slice(0,7);const sal=d.escritorio.salarioMinimo||1518;
  const vencG=c=>diaNoMes(ymAdd(c,1),15);
  const guias=[];for(let i=0;i<10;i++){const c=ymAdd(comp0,i),v=vencG(c);const paga=v<today();
    guias.push({id:uid(),competencia:c,codigo:'1007',valor:Math.round(sal*0.2*100)/100,venc:v,emitidaEm:i<=3?addDays(-100+i*30):'',pagaEm:paga?v:'',quemPaga:'Cliente',link:'',obs:''});}
  const S=(o)=>({id:uid(),guias:[],obs:'',responsavelId:'u1',carenciaMeses:0,qualidadeAte:'',nb:'',der:'',beneficioEstimado:Math.round(sal*4),...o});
  d.sm=[
    S({clienteId:'c9',categoria:'Contribuinte individual',estrategia:'Via guias (recolhimento)',status:'Guias em andamento',dpp:addDays(40),crianca:'(a nascer)',carenciaMeses:10,guias,responsavelId:'u5',obs:'Cumprir 10 contribuições antes do parto.'}),
    S({clienteId:'c2',categoria:'Empregada (CLT)',estrategia:'Via vínculo empregatício',status:'Em exigência',dataParto:addDays(-75),dpp:addDays(-75),crianca:'Helena',nb:'215.678.901-2',der:addDays(-60),qualidadeAte:addDays(200)}),
    S({clienteId:'c5',categoria:'Segurada especial (rural)',estrategia:'Via segurada especial (rural)',status:'Protocolado — em análise',dataParto:addDays(-50),dpp:addDays(-50),crianca:'Davi',nb:'198.765.432-1',der:addDays(-40)}),
    S({clienteId:'c1',categoria:'Desempregada (período de graça)',estrategia:'Via período de graça',status:'Recurso / judicial',dataParto:addDays(-150),dpp:addDays(-150),crianca:'Miguel',der:addDays(-200),qualidadeAte:addDays(-30),obs:'Indeferido no INSS; ação no JEF.'}),
    S({clienteId:'c8',categoria:'Empregada (CLT)',estrategia:'Via vínculo empregatício',status:'Concluído',dataParto:addDays(-170),dpp:addDays(-170),crianca:'Laura',nb:'187.654.321-0',der:addDays(-155)}),
  ];
  d.eventos.push({id:uid(),tipo:'Emissão de guia (SM)',titulo:'Emitir e enviar guia GPS — Roberta',processoId:'',clienteId:'c9',data:addDays(3),hora:'',responsavelId:'u5',feito:false,obs:''});
  d.produtos=PRODUTOS_PADRAO.slice();
  d.modelos=modelosPadrao();d.scripts=scriptsPadrao();
  migrar(d);
}
