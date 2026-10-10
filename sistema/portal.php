<?php
/*
 * PORTAL DO CLIENTE — acesso pelo link único gerado na ficha do cliente (portal.php?t=...).
 * Mostra o andamento dos casos, as guias do INSS, os documentos pendentes (com envio de arquivos)
 * e a pesquisa de satisfação (portal.php?t=...&nps=1). Não mostra valores internos nem anotações.
 */
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
if (!is_file(__DIR__ . '/config.php')) { http_response_code(503); exit('Sistema não instalado.'); }
$cfg = require __DIR__ . '/config.php';
require __DIR__ . '/nucleo.php';

const SM_ETAPAS = ['Triagem / viabilidade', 'Coleta de documentos', 'Guias em andamento', 'Aguardando o parto', 'Pronto para protocolo', 'Protocolado — em análise', 'Em exigência', 'Deferido', 'Concluído'];
const FASES_JUD = ['Inicial / Distribuição', 'Citação', 'Contestação / réplica', 'Instrução', 'Sentença', 'Recurso', 'Cumprimento de sentença', 'Execução / RPV-precatório', 'Encerrado'];
const FASES_ADM = ['Requerimento a protocolar', 'Protocolado — em análise', 'Em exigência', 'Perícia / avaliação agendada', 'Deferido', 'Recurso administrativo', 'Encerrado'];
const EXTENSOES = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'doc', 'docx'];

$t = (string) ($_GET['t'] ?? '');
$h = 'nuc_h';
try { $pdo = nuc_pdo($cfg); } catch (Throwable $e) { http_response_code(500); exit('Serviço indisponível no momento.'); }
$cliente = null;
if (preg_match('/^[a-f0-9]{32}$/', $t)) {
    $st = $pdo->prepare("SELECT dados FROM registros WHERE colecao = 'clientes' AND excluido = 0 AND dados LIKE ?");
    $st->execute(['%"portalToken":"' . $t . '"%']);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $d) { $x = json_decode((string) $d, true); if (($x['portalToken'] ?? '') === $t) { $cliente = $x; break; } }
}
$esc = nuc_config($pdo, 'escritorio');
$nomeEsc = $esc['nome'] ?? 'Escritório';
if (!$cliente) { http_response_code(404); pagina($nomeEsc, '<div class="card"><h2>Link inválido ou expirado</h2><p>Peça um novo link ao escritório.</p></div>'); exit; }
$cid = (string) $cliente['id'];
$msg = '';

/* ---------- envio de documento ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['acao'] ?? '') === 'enviar') {
    $f = $_FILES['arquivo'] ?? null;
    $ext = strtolower(pathinfo((string) ($f['name'] ?? ''), PATHINFO_EXTENSION));
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) $msg = 'erro:Não foi possível receber o arquivo. Tente de novo (máximo 15 MB).';
    elseif ($f['size'] > 15 * 1024 * 1024) $msg = 'erro:O arquivo passa de 15 MB.';
    elseif (!in_array($ext, EXTENSOES, true)) $msg = 'erro:Envie PDF, foto (JPG/PNG) ou Word.';
    else {
        $dir = nuc_pasta($cfg, 'uploads/' . preg_replace('/[^a-z0-9]/i', '', $cid));
        $nomeSeguro = preg_replace('/[^a-zA-Z0-9._-]+/', '_', pathinfo($f['name'], PATHINFO_FILENAME));
        $arq = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '-' . substr($nomeSeguro, 0, 60) . '.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $arq)) $msg = 'erro:Falha ao salvar o arquivo.';
        else {
            $docId = (string) ($_POST['doc'] ?? '');
            $doc = $docId !== '' ? nuc_ler($pdo, 'documentos', $docId) : null;
            if (!$doc || ($doc['clienteId'] ?? '') !== $cid) { $docId = nuc_uid(); $doc = ['id' => $docId, 'clienteId' => $cid, 'nome' => 'Enviado pelo cliente: ' . $f['name'], 'obs' => '']; }
            $doc['recebido'] = true; $doc['data'] = date('Y-m-d');
            $doc['portalArquivo'] = ['nome' => $f['name'], 'arquivo' => $arq, 'tamanho' => (int) $f['size'], 'em' => date('Y-m-d H:i')];
            if (!empty($cliente['parceiro'])) $doc['parceiro'] = $cliente['parceiro'];
            nuc_gravar($pdo, 'documentos', $docId, $doc);
            $tid = nuc_uid();
            nuc_gravar($pdo, 'tarefas', $tid, ['id' => $tid, 'titulo' => 'Conferir documento enviado pelo portal — ' . ($cliente['nome'] ?? ''), 'status' => 'todo', 'prioridade' => 'Média',
                'prazo' => date('Y-m-d', strtotime('+1 day')), 'responsavelId' => '', 'clienteId' => $cid, 'processoId' => '', 'obs' => $doc['nome'], 'parceiro' => $cliente['parceiro'] ?? '']);
            $msg = 'ok:Recebemos o seu arquivo. Obrigado! 😊';
        }
    }
}
/* ---------- pesquisa de satisfação ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['acao'] ?? '') === 'nps') {
    $nota = (int) ($_POST['nota'] ?? -1);
    if ($nota < 0 || $nota > 10) $msg = 'erro:Escolha uma nota de 0 a 10.';
    else {
        $ind = ['nome' => trim(mb_substr((string) ($_POST['ind_nome'] ?? ''), 0, 120)), 'tel' => trim(mb_substr((string) ($_POST['ind_tel'] ?? ''), 0, 40))];
        $nid = nuc_uid();
        nuc_gravar($pdo, 'nps', $nid, ['id' => $nid, 'clienteId' => $cid, 'nota' => $nota, 'comentario' => trim(mb_substr((string) ($_POST['comentario'] ?? ''), 0, 2000)), 'indicacao' => $ind['nome'] ? $ind : null, 'em' => nuc_ms()]);
        if ($ind['nome'] !== '') {
            $lid = nuc_uid();
            nuc_gravar($pdo, 'leads', $lid, ['id' => $lid, 'nome' => $ind['nome'], 'tel' => $ind['tel'], 'origem' => 'Indicação de cliente', 'etapa' => 'Novo contato', 'produto' => '',
                'primeiroContato' => date('Y-m-d'), 'ultimoContato' => date('Y-m-d'), 'criado' => date('Y-m-d'), 'obs' => 'Indicado por ' . ($cliente['nome'] ?? '') . ' na pesquisa de satisfação.', 'valor' => 0]);
        }
        $msg = 'ok:Muito obrigado pela sua avaliação! 💛';
    }
}

/* ---------- resposta da cliente às mensagens do escritório ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['acao'] ?? '') === 'responder') {
    $texto = trim(mb_substr((string) ($_POST['texto'] ?? ''), 0, 3000));
    if ($texto === '') $msg = 'erro:Escreva a sua mensagem.';
    else {
        $rid = nuc_uid();
        nuc_gravar($pdo, 'recados', $rid, ['id' => $rid, 'clienteId' => $cid, 'texto' => $texto, 'origem' => 'cliente', 'autor' => $cliente['nome'] ?? '', 'em' => nuc_ms(), 'parceiro' => $cliente['parceiro'] ?? '']);
        $tid = nuc_uid();
        nuc_gravar($pdo, 'tarefas', $tid, ['id' => $tid, 'titulo' => 'Responder mensagem do portal — ' . ($cliente['nome'] ?? ''), 'status' => 'todo', 'prioridade' => 'Alta',
            'prazo' => date('Y-m-d', strtotime('+1 day')), 'responsavelId' => '', 'clienteId' => $cid, 'processoId' => '', 'obs' => mb_substr($texto, 0, 300), 'parceiro' => $cliente['parceiro'] ?? '']);
        $msg = 'ok:Mensagem enviada ao escritório. Responderemos em breve. 😊';
    }
}

/* ---------- dados do cliente ---------- */
$doCliente = fn($l) => array_values(array_filter($l, fn($x) => ($x['clienteId'] ?? '') === $cid));
$processos = $doCliente(nuc_listar($pdo, 'processos'));
$sms = $doCliente(nuc_listar($pdo, 'sm'));
$docs = array_values(array_filter($doCliente(nuc_listar($pdo, 'documentos')), fn($d) => empty($d['recebido'])));
$reqs = $doCliente(nuc_listar($pdo, 'requisitorios'));
$primeiro = explode(' ', trim((string) ($cliente['nome'] ?? '')))[0];

$etapas = function (array $lista, string $atual) use ($h): string {
    $i = array_search($atual, $lista, true);
    if ($i === false) return '<div class="etapa-atual">' . $h($atual) . '</div>';
    $o = '<div class="trilha">';
    foreach ($lista as $k => $e) $o .= '<span class="' . ($k < $i ? 'feita' : ($k === $i ? 'atual' : '')) . '" title="' . $h($e) . '"></span>';
    return $o . '</div><div class="etapa-atual">Etapa atual: <b>' . $h($atual) . '</b> (' . ($i + 1) . ' de ' . count($lista) . ')</div>';
};
$html = '';
if ($msg) { [$tipo, $texto] = explode(':', $msg, 2); $html .= '<div class="aviso ' . ($tipo === 'ok' ? 'ok' : 'erro') . '">' . $h($texto) . '</div>'; }

if (isset($_GET['nps'])) {
    $html .= '<div class="card"><h2>Como foi o nosso atendimento?</h2><form method="post"><input type="hidden" name="acao" value="nps">
      <p>De 0 a 10, quanto você recomendaria o escritório a um amigo ou familiar?</p><div class="notas">';
    for ($n = 0; $n <= 10; $n++) $html .= '<label><input type="radio" name="nota" value="' . $n . '" required><span>' . $n . '</span></label>';
    $html .= '</div><label>Quer deixar um comentário? (opcional)<textarea name="comentario" rows="3"></textarea></label>
      <p class="sub">Conhece alguém que precisa de ajuda? Indique (opcional):</p><div class="duas"><label>Nome<input name="ind_nome"></label><label>WhatsApp<input name="ind_tel"></label></div>
      <button>Enviar avaliação</button></form></div>';
}
foreach ($sms as $c) {
    $guias = $c['guias'] ?? [];
    usort($guias, fn($a, $b) => strcmp((string) ($a['competencia'] ?? ''), (string) ($b['competencia'] ?? '')));
    $pagas = count(array_filter($guias, fn($g) => !empty($g['pagaEm'])));
    $car = (int) ($c['carenciaMeses'] ?? 0);
    $html .= '<div class="card"><h2>💗 Salário-maternidade</h2>' . $etapas(SM_ETAPAS, (string) ($c['status'] ?? ''));
    $html .= '<div class="linha">' . (!empty($c['dataParto']) ? '👶 Nascimento: <b>' . nuc_data($c['dataParto']) . '</b>' : (!empty($c['dpp']) ? '📅 Data provável do parto: <b>' . nuc_data($c['dpp']) . '</b>' : '')) . '</div>';
    if ($car) $html .= '<div class="linha">Contribuições pagas: <b>' . $pagas . ' de ' . $car . '</b><div class="barra"><i style="width:' . min(100, round($pagas / max(1, $car) * 100)) . '%"></i></div></div>';
    if ($guias) {
        $html .= '<h3>Guias do INSS</h3><div class="rolar"><table><tr><th>Mês</th><th>Valor</th><th>Vence</th><th>Situação</th><th></th></tr>';
        foreach ($guias as $g) {
            $paga = !empty($g['pagaEm']); $venc = (string) ($g['venc'] ?? '');
            $sit = $paga ? '<span class="tag ok">Paga</span>' : ($venc && $venc < date('Y-m-d') ? '<span class="tag erro">Vencida</span>' : '<span class="tag">A pagar</span>');
            $comp = preg_match('/^(\d{4})-(\d{2})/', (string) ($g['competencia'] ?? ''), $m) ? "$m[2]/$m[1]" : '';
            $html .= '<tr><td>' . $h($comp) . '</td><td>' . nuc_brl($g['valor'] ?? 0) . '</td><td>' . nuc_data($venc) . '</td><td>' . $sit . '</td><td>'
                . (!$paga && !empty($g['link']) && preg_match('#^https?://#', $g['link']) ? '<a class="btn mini" href="' . $h($g['link']) . '" target="_blank" rel="noopener">Guia</a>' : '') . '</td></tr>';
        }
        $html .= '</table></div>';
    }
    $html .= '</div>';
}
foreach ($processos as $p) {
    $adm = ($p['tipo'] ?? '') === 'Administrativo';
    $html .= '<div class="card"><h2>' . ($adm ? '🏛 Requerimento' : '⚖️ Processo') . ' ' . $h($p['numero'] ?? '') . '</h2><div class="sub">' . $h(trim(($p['area'] ?? '') . ' · ' . ($p['objeto'] ?? ''), ' ·')) . '</div>'
        . $etapas($adm ? FASES_ADM : FASES_JUD, (string) ($p['fase'] ?? '')) . (($p['status'] ?? '') !== 'Em andamento' ? '<div class="linha">Situação: <b>' . $h($p['status'] ?? '') . '</b></div>' : '') . '</div>';
}
foreach ($reqs as $r) {
    if (($r['status'] ?? '') === 'Cancelado') continue;
    $html .= '<div class="card"><h2>💰 ' . $h($r['tipo'] ?? 'Requisição') . '</h2><div class="linha">Situação: <b>' . $h($r['status'] ?? '') . '</b></div>'
        . (!empty($r['previsaoPagamento']) && empty($r['dataPagamento']) ? '<div class="linha">Previsão de pagamento: <b>' . nuc_data($r['previsaoPagamento']) . '</b></div>' : '') . '</div>';
}
$html .= '<div class="card"><h2>📎 Documentos</h2>';
if ($docs) {
    $html .= '<p class="sub">Precisamos destes documentos. Toque em "Enviar" e escolha a foto ou o PDF:</p>';
    foreach ($docs as $d) $html .= '<form method="post" enctype="multipart/form-data" class="doc"><input type="hidden" name="acao" value="enviar"><input type="hidden" name="doc" value="' . $h($d['id']) . '"><span>' . $h($d['nome'] ?? '') . '</span><input type="file" name="arquivo" required accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx"><button>Enviar</button></form>';
} else $html .= '<p class="sub">Nenhum documento pendente no momento. ✅</p>';
$html .= '<form method="post" enctype="multipart/form-data" class="doc"><input type="hidden" name="acao" value="enviar"><span>Enviar outro documento</span><input type="file" name="arquivo" required accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx"><button>Enviar</button></form></div>';
/* ---------- aba Mensagens (o que o escritório publicou para a cliente) ---------- */
$recados = $doCliente(nuc_listar($pdo, 'recados'));
usort($recados, fn($a, $b) => ($a['em'] ?? 0) <=> ($b['em'] ?? 0));
$novas = count(array_filter($recados, fn($r) => ($r['origem'] ?? '') !== 'cliente' && empty($r['lidoEm'])));
$aba = ($_GET['aba'] ?? '') === 'msgs' ? 'msgs' : 'caso';
$base = 'portal.php?t=' . $t;
if ($aba === 'msgs') {
    $html = $msg ? '<div class="aviso ' . (strpos($msg, 'ok:') === 0 ? 'ok' : 'erro') . '">' . $h(explode(':', $msg, 2)[1]) . '</div>' : '';
    $html .= '<div class="card"><h2>💬 Mensagens do escritório</h2>';
    foreach ($recados as $r) {
        $nos = ($r['origem'] ?? '') !== 'cliente';
        $quando = !empty($r['em']) ? date('d/m/Y H:i', (int) floor($r['em'] / 1000)) : '';
        $html .= '<div class="msg ' . ($nos ? 'nos' : 'eu') . '"><div class="quem">' . $h($nos ? ($r['autor'] ?? 'Escritório') : 'Você') . ' · ' . $quando . (!$nos ? '' : (empty($r['lidoEm']) ? ' · <b class="novo">nova</b>' : '')) . '</div><div class="txt">' . nl2br($h((string) ($r['texto'] ?? ''))) . '</div></div>';
        if ($nos && empty($r['lidoEm'])) { $r['lidoEm'] = date('d/m/Y H:i'); nuc_gravar($pdo, 'recados', (string) $r['id'], $r); }
    }
    if (!$recados) $html .= '<p class="sub">Nenhuma mensagem por enquanto. Quando o escritório publicar uma novidade sobre o seu caso, ela aparece aqui.</p>';
    $html .= '<form method="post" action="' . $h($base) . '&aba=msgs"><input type="hidden" name="acao" value="responder"><label>Escrever para o escritório<textarea name="texto" rows="3" required></textarea></label><button>Enviar mensagem</button></form></div>';
}
$html = '<nav class="abas"><a href="' . $h($base) . '"' . ($aba === 'caso' ? ' class="on"' : '') . '>📋 Meu caso</a><a href="' . $h($base) . '&aba=msgs"' . ($aba === 'msgs' ? ' class="on"' : '') . '>💬 Mensagens' . ($novas && $aba !== 'msgs' ? ' <span class="bolha">' . $novas . '</span>' : '') . '</a></nav>'
    . ($novas && $aba !== 'msgs' ? '<a class="aviso ok" style="display:block;text-decoration:none" href="' . $h($base) . '&aba=msgs">📩 Você tem ' . $novas . ' mensagem(ns) nova(s) do escritório. Toque para ler.</a>' : '') . $html;
$tel = preg_replace('/\D/', '', (string) ($esc['tel'] ?? ''));
if ($tel) $html .= '<a class="whats" href="https://wa.me/' . (strlen($tel) <= 11 ? '55' : '') . $tel . '" target="_blank" rel="noopener">Falar com o escritório no WhatsApp</a>';
pagina($nomeEsc, '<div class="ola">Olá, ' . $h($primeiro) . '! 👋</div><p class="sub">Aqui você acompanha o seu caso com o escritório ' . $h($nomeEsc) . '.</p>' . $html);

function pagina(string $esc, string $corpo): void
{
    $logo = is_file(__DIR__ . '/logo-ms.png') ? '<img src="logo-ms.png" alt="">' : '';
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>' . nuc_h($esc) . ' — Portal do cliente</title><style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#F4F1EA;color:#1a1a1a}header{background:#0F2942;color:#fff;padding:16px;display:flex;align-items:center;gap:12px}header img{height:42px;background:#fff;border-radius:8px;padding:4px}
    main{max-width:720px;margin:0 auto;padding:16px}.ola{font-size:22px;font-weight:700;margin-top:6px}.sub{color:#666;font-size:14px}.card{background:#fff;border-radius:14px;padding:16px;margin:14px 0;box-shadow:0 2px 10px rgba(0,0,0,.06)}
    h2{font-size:17px;margin:0 0 8px;color:#0F2942}h3{font-size:14px;margin:14px 0 6px}.trilha{display:flex;gap:4px;margin:10px 0 6px}.trilha span{flex:1;height:8px;border-radius:4px;background:#E5E1D6}.trilha .feita{background:#C9A646}.trilha .atual{background:#1B3A5C}
    .etapa-atual,.linha{font-size:14px;margin:6px 0}.barra{height:8px;background:#E5E1D6;border-radius:4px;margin-top:4px}.barra i{display:block;height:100%;background:#2E7D4E;border-radius:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 4px;border-bottom:1px solid #eee}.rolar{overflow-x:auto}.abas{display:flex;gap:6px;margin:14px 0 4px}.abas a{flex:1;text-align:center;padding:10px;border-radius:10px;background:#fff;color:#1B3A5C;text-decoration:none;font-weight:600;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.05)}.abas a.on{background:#1B3A5C;color:#fff}.bolha{background:#C0392B;color:#fff;border-radius:99px;padding:1px 7px;font-size:12px}.msg{margin:10px 0;max-width:88%}.msg.eu{margin-left:auto}.msg .quem{font-size:12px;color:#888;margin-bottom:3px}.msg .txt{background:#F1F3F6;border-radius:4px 14px 14px 14px;padding:9px 12px;font-size:14px;line-height:1.45}.msg.eu .txt{background:#FBF3DC;border-radius:14px 4px 14px 14px}.novo{color:#C0392B}.btn.mini{padding:6px 10px;font-size:13px}td,th{white-space:nowrap}.tag{font-size:12px;padding:2px 8px;border-radius:99px;background:#FEF3E0;color:#8A5300}.tag.ok{background:#E4F5EB;color:#2E7D4E}.tag.erro{background:#FBEAEA;color:#B93434}
    .btn,button{display:inline-block;background:#1B3A5C;color:#fff;border:0;border-radius:8px;padding:9px 14px;font:inherit;font-size:14px;cursor:pointer;text-decoration:none}
    .doc{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;border-top:1px solid #eee}.doc span{flex:1 1 100%;font-weight:600;font-size:14px}.doc input[type=file]{flex:1;min-width:0;font-size:13px}
    .aviso{padding:12px;border-radius:10px;margin-top:12px}.aviso.ok{background:#E4F5EB;color:#2E7D4E}.aviso.erro{background:#FBEAEA;color:#B93434}
    .whats{display:block;text-align:center;background:#1F9D55;color:#fff;border-radius:12px;padding:14px;text-decoration:none;font-weight:700;margin:18px 0}
    label{display:block;font-size:13px;margin:10px 0}input:not([type]),textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:8px;font:inherit}
    .notas{display:flex;flex-wrap:wrap;gap:6px}.notas label{margin:0}.notas input{display:none}.notas span{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;border:1px solid #ccc;font-weight:700;cursor:pointer}
    .notas input:checked+span{background:#C9A646;border-color:#C9A646;color:#fff}.duas{display:grid;grid-template-columns:1fr 1fr;gap:8px}footer{text-align:center;color:#999;font-size:12px;padding:20px}
    </style></head><body><header>' . $logo . '<div><b>' . nuc_h($esc) . '</b><div style="font-size:12px;opacity:.8">Portal do cliente</div></div></header><main>' . $corpo . '</main><footer>Seus dados são tratados com sigilo profissional (LGPD). Não compartilhe este link.</footer></body></html>';
}
