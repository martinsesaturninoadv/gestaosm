<?php
/*
 * API do Sistema de Gestão do Escritório
 * Guarda os registros do sistema (clientes, processos, financeiro…) num banco
 * MySQL/SQLite e controla o login da equipe.
 *
 * Ações (?acao=…):
 *   GET  sessao               → usuário logado (401 se não houver)
 *   POST login  {email,senha} → inicia a sessão
 *   POST sair                 → encerra a sessão
 *   GET  dados&desde=ms       → registros alterados desde o instante informado
 *   POST salvar {upserts,exclusoes}
 *   POST senha {atual,nova}   → troca a própria senha
 *   GET  contas               → lista de acessos (somente administrador)
 *   POST conta {id?,nome,email,papel,ativo,senha?} (somente administrador)
 *   POST sala {presenca?,enviar?,desde} → escritório virtual: presença da equipe e chat
 *   GET  arquivo&doc=id       → arquivo enviado pelo cliente no portal
 *   GET  integracoes / POST segredos (admin) → chaves dos serviços externos (nunca vão para o navegador)
 *   POST zapsign | zapsignStatus | asaas | escavador | ia → integrações (assinatura, cobrança, andamentos, IA)
 *   POST webhook&s=asaas|zapsign&k=chave → avisos automáticos dos serviços (sem login)
 *   POST doisfatores {etapa:iniciar|ativar|desativar} → verificação em duas etapas (app autenticador)
 *   GET  backups / backup&f=arquivo / POST backupAgora (admin) → cópias diárias automáticas do banco
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const COLECOES = ['clientes', 'processos', 'eventos', 'tarefas', 'leads', 'lancamentos', 'documentos',
    'notas', 'contratos', 'despesasFixas', 'usuarios', 'sm', 'scripts', 'modelos', 'trafego', 'requisitorios', 'nps', 'recados', 'config'];
const CONFIG_IDS = ['escritorio', 'metas', 'produtos', 'tiposEvento', 'indAjustes', 'indExtras', 'salas', 'fluxos'];
// Coleções que o perfil "estagiario" não pode ver nem alterar
const COLECOES_FINANCEIRAS = ['lancamentos', 'contratos', 'despesasFixas', 'trafego', 'requisitorios'];
// Perfil "parceiro": só vê a parceria — registros com o e-mail dele no campo "parceiro"
// (casos da parceria) ou na lista "parceiros" (tarefas e compromissos em que ele é responsável).
// Não vê CRM, salário-maternidade, documentos, modelos nem scripts.
const COLECOES_PARCERIA = ['clientes', 'processos', 'eventos', 'tarefas', 'notas', 'contratos', 'lancamentos'];
const COLECOES_LIVRES_PARCEIRO = ['usuarios'];
const CONFIG_PARCEIRO = ['escritorio', 'produtos', 'tiposEvento', 'salas'];
// Escritório virtual: salas fixas (os nomes são editáveis em Configurações). O parceiro só entra na sala de reunião.
const SALAS = ['recepcao', 'joyce', 'vitoria', 'reuniao', 'copa', 'comercial'];
const SALA_PARCEIRO = 'reuniao';
const STATUS_SALA = ['disponivel', 'atendimento', 'ausente', 'foco'];
const PAPEIS = ['admin', 'advogado', 'estagiario', 'financeiro', 'parceiro'];

function minusculo(?string $s): string { return mb_strtolower(trim((string) $s)); }
function doParceiro($d, string $email): bool
{
    if (!is_array($d)) return false;
    if (minusculo($d['parceiro'] ?? '') === minusculo($email)) return true;
    foreach ((array) ($d['parceiros'] ?? []) as $e) if (is_string($e) && minusculo($e) === minusculo($email)) return true;
    return false;
}
function podeLer(array $u, string $col, string $id, $dados): bool
{
    if ($col === 'config' && $id === 'segredos') return false; // chaves de integração: só pelo endpoint "segredos"
    if ($u['papel'] === 'estagiario' && in_array($col, COLECOES_FINANCEIRAS, true)) return false;
    if ($u['papel'] === 'parceiro') {
        if ($col === 'config') return in_array($id, CONFIG_PARCEIRO, true);
        if (in_array($col, COLECOES_LIVRES_PARCEIRO, true)) return true;
        if (in_array($col, COLECOES_PARCERIA, true)) return doParceiro($dados, $u['email']);
        return false;
    }
    return true;
}
function podeGravar(array $u, string $col, string $id, $novo, $antigo): bool
{
    if (!in_array($col, COLECOES, true)) return false;
    if ($col === 'config' && !in_array($id, CONFIG_IDS, true)) return false; // "segredos" não está na lista: só pelo endpoint próprio
    if ($u['papel'] === 'estagiario' && (in_array($col, COLECOES_FINANCEIRAS, true) || ($col === 'config' && $id === 'metas'))) return false;
    if ($u['papel'] === 'parceiro') {
        if (!in_array($col, COLECOES_PARCERIA, true) || $col === 'contratos' || $col === 'lancamentos') return false;
        $dele = fn($d) => doParceiro($d, $u['email']);
        return ($novo === null || $dele($novo)) && ($antigo === null || $dele($antigo));
    }
    return true;
}

/* chat: "geral", "sala:<id>" ou "dm:<email>|<email>" (conversa privada só é lida pelas duas pessoas) */
function canalPermitido(array $u, string $canal): bool
{
    $parceiro = $u['papel'] === 'parceiro';
    if ($canal === 'geral') return !$parceiro;
    if (preg_match('/^sala:([a-z]+)$/', $canal, $m)) return in_array($m[1], SALAS, true) && (!$parceiro || $m[1] === SALA_PARCEIRO);
    if (preg_match('/^dm:([^|]+)\|([^|]+)$/', $canal, $m)) {
        $eu = minusculo($u['email']);
        return $m[1] !== $m[2] && ($m[1] === $eu || $m[2] === $eu) && filter_var($m[1], FILTER_VALIDATE_EMAIL) && filter_var($m[2], FILTER_VALIDATE_EMAIL);
    }
    return false;
}

function responder(array $dados, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function erro(string $msg, int $status = 400): void
{
    responder(['ok' => false, 'erro' => $msg], $status);
}

function agoraMs(): int
{
    return (int) floor(microtime(true) * 1000);
}

$arqConfig = __DIR__ . '/config.php';
if (!is_file($arqConfig)) {
    erro('Sistema não instalado: abra instalar.php neste mesmo endereço para instalar.', 503);
}
$cfg = require $arqConfig;
require __DIR__ . '/nucleo.php';

/* ---------- sessão ---------- */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('gestao_sm');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
$limite = (int) ($cfg['sessao_minutos'] ?? 480) * 60;
if (isset($_SESSION['ultimo']) && time() - $_SESSION['ultimo'] > $limite) {
    $_SESSION = [];
    session_destroy();
    session_start();
}
$_SESSION['ultimo'] = time();

/* ---------- banco ---------- */
function conectar(array $cfg): PDO
{
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if (($cfg['driver'] ?? 'mysql') === 'sqlite') {
        $dir = dirname($cfg['arquivo']);
        if (!is_dir($dir)) {
            mkdir($dir, 0700, true);
            file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
        }
        $pdo = new PDO('sqlite:' . $cfg['arquivo'], null, null, $opts);
        $pdo->exec('PRAGMA journal_mode=WAL');
        return $pdo;
    }
    $dsn = 'mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['banco'] . ';charset=utf8mb4';
    return new PDO($dsn, $cfg['usuario'], $cfg['senha'], $opts);
}

function criarTabelas(PDO $pdo, bool $mysql): void
{
    $auto = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $texto = $mysql ? 'MEDIUMTEXT' : 'TEXT';
    $fim = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (
        id $auto, nome VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, senha_hash VARCHAR(255) NOT NULL,
        papel VARCHAR(20) NOT NULL DEFAULT 'advogado', ativo TINYINT NOT NULL DEFAULT 1, criado_em BIGINT NOT NULL)$fim");
    $pdo->exec("CREATE TABLE IF NOT EXISTS registros (
        colecao VARCHAR(40) NOT NULL, id VARCHAR(60) NOT NULL, dados $texto, excluido TINYINT NOT NULL DEFAULT 0,
        atualizado_em BIGINT NOT NULL, atualizado_por INT, PRIMARY KEY (colecao, id))$fim");
    $pdo->exec("CREATE TABLE IF NOT EXISTS historico (
        id $auto, quando BIGINT NOT NULL, usuario_id INT, acao VARCHAR(20) NOT NULL, colecao VARCHAR(40), registro_id VARCHAR(60), ip VARCHAR(45))$fim");
    if ($mysql) {
        try { $pdo->exec('CREATE INDEX idx_reg_atualizado ON registros (atualizado_em)'); } catch (PDOException $e) { /* já existe */ }
    } else {
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_reg_atualizado ON registros (atualizado_em)');
    }
    try { $pdo->query('SELECT totp_secret FROM usuarios LIMIT 1'); }
    catch (PDOException $e) { $pdo->exec('ALTER TABLE usuarios ADD COLUMN totp_secret VARCHAR(64) NULL'); }
    // escritório virtual: presença (uma linha por pessoa) e mensagens do chat — fora do histórico de auditoria
    $pdo->exec("CREATE TABLE IF NOT EXISTS presenca (
        uid INT NOT NULL PRIMARY KEY, email VARCHAR(190) NOT NULL, nome VARCHAR(120) NOT NULL, papel VARCHAR(20) NOT NULL,
        sala VARCHAR(20) NOT NULL, x DOUBLE NOT NULL, y DOUBLE NOT NULL, status VARCHAR(20) NOT NULL, visual VARCHAR(400), visto BIGINT NOT NULL)$fim");
    $pdo->exec("CREATE TABLE IF NOT EXISTS mensagens (
        id $auto, canal VARCHAR(400) NOT NULL, de_uid INT NOT NULL, de_email VARCHAR(190) NOT NULL, de_nome VARCHAR(120) NOT NULL,
        texto TEXT NOT NULL, tipo VARCHAR(10) NOT NULL, em BIGINT NOT NULL)$fim");
    if ($mysql) {
        try { $pdo->exec('CREATE INDEX idx_msg_em ON mensagens (em)'); } catch (PDOException $e) { /* já existe */ }
    } else {
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_msg_em ON mensagens (em)');
    }
}

try {
    $pdo = conectar($cfg);
    $mysql = ($cfg['driver'] ?? 'mysql') !== 'sqlite';
    criarTabelas($pdo, $mysql);
} catch (PDOException $e) {
    erro('Não foi possível conectar ao banco de dados. Confira o config.php.', 500);
}

function registrar(PDO $pdo, ?int $uid, string $acao, ?string $col = null, ?string $rid = null): void
{
    $st = $pdo->prepare('INSERT INTO historico (quando, usuario_id, acao, colecao, registro_id, ip) VALUES (?,?,?,?,?,?)');
    $st->execute([agoraMs(), $uid, $acao, $col, $rid, $_SERVER['REMOTE_ADDR'] ?? null]);
}

function usuarioPublico(array $u): array
{
    return ['id' => (int) $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'papel' => $u['papel'], 'ativo' => (int) $u['ativo'] === 1, 'doisFatores' => !empty($u['totp_secret'])];
}

function usuarioLogado(PDO $pdo): array
{
    if (empty($_SESSION['uid'])) {
        erro('Faça login para continuar.', 401);
    }
    $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $st->execute([$_SESSION['uid']]);
    $u = $st->fetch();
    if (!$u || (int) $u['ativo'] !== 1) {
        $_SESSION = [];
        erro('Acesso desativado.', 401);
    }
    return $u;
}

function corpo(): array
{
    $json = json_decode(file_get_contents('php://input') ?: '[]', true);
    return is_array($json) ? $json : [];
}

$acao = $_GET['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];

/* ---------- verificação em duas etapas (TOTP, RFC 6238 — Google Authenticator, Microsoft Authenticator…) ---------- */
function base32Dec(string $b32): string
{
    $alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split(strtoupper(preg_replace('/[^A-Z2-7]/i', '', $b32))) as $c) $bits .= str_pad(decbin(strpos($alf, $c)), 5, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}
function base32Enc(string $bin): string
{
    $alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $g) $out .= $alf[bindec(str_pad($g, 5, '0'))];
    return $out;
}
function totpValido(string $segredo, string $codigo): bool
{
    $codigo = preg_replace('/\D/', '', $codigo);
    if (strlen($codigo) !== 6) return false;
    $chave = base32Dec($segredo); $t = (int) floor(time() / 30);
    for ($i = -1; $i <= 1; $i++) {
        $h = hash_hmac('sha1', pack('N*', 0) . pack('N*', $t + $i), $chave, true);
        $o = ord($h[19]) & 0xf;
        $n = ((ord($h[$o]) & 0x7f) << 24 | ord($h[$o + 1]) << 16 | ord($h[$o + 2]) << 8 | ord($h[$o + 3])) % 1000000;
        if (hash_equals(str_pad((string) $n, 6, '0', STR_PAD_LEFT), $codigo)) return true;
    }
    return false;
}

/* ---------- rotina diária: backup do banco e lembretes automáticos por e-mail ---------- */
function exportarTudo(PDO $pdo): string
{
    $out = ['gerado_em' => date('c'), 'registros' => [], 'usuarios' => []];
    foreach ($pdo->query('SELECT colecao, id, dados FROM registros WHERE excluido = 0 AND NOT (colecao = \'config\' AND id = \'segredos\')') as $r)
        $out['registros'][$r['colecao']][$r['id']] = json_decode((string) $r['dados'], true);
    foreach ($pdo->query('SELECT id, nome, email, papel, ativo FROM usuarios') as $u) $out['usuarios'][] = $u;
    return json_encode($out, JSON_UNESCAPED_UNICODE);
}
function fazerBackup(PDO $pdo, array $cfg): string
{
    $dir = nuc_pasta($cfg, 'backups');
    $nome = 'backup-' . date('Y-m-d') . '.json.gz';
    file_put_contents($dir . '/' . $nome, gzencode(exportarTudo($pdo), 9));
    $todos = glob($dir . '/backup-*.json.gz') ?: [];
    sort($todos);
    foreach (array_slice($todos, 0, max(0, count($todos) - 30)) as $velho) @unlink($velho); // guarda os últimos 30 dias
    return $dir . '/' . $nome;
}
function rotinaDiaria(PDO $pdo, array $cfg): void
{
    $dir = nuc_pasta($cfg, 'backups');
    $marca = $dir . '/ultima-rotina.txt';
    if (is_file($marca) && trim((string) file_get_contents($marca)) === date('Y-m-d')) return;
    $lock = @fopen($dir . '/rotina.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return;
    file_put_contents($marca, date('Y-m-d'));
    $esc = nuc_config($pdo, 'escritorio');
    $de = (string) ($esc['email'] ?? '');
    try {
        $arq = fazerBackup($pdo, $cfg);
        if (!empty($esc['backupEmail'])) {
            $tam = filesize($arq);
            nuc_email((string) $esc['backupEmail'], 'Backup diário — ' . ($esc['nome'] ?? 'sistema') . ' — ' . date('d/m/Y'),
                "Backup automático do sistema de gestão (" . round($tam / 1024) . " KB).\nGuarde este arquivo em local seguro. Para restaurar, fale com o suporte técnico.",
                $de, $tam < 8 * 1024 * 1024 ? [basename($arq) => file_get_contents($arq)] : []);
        }
    } catch (Throwable $e) { /* o backup não pode impedir o uso do sistema */ }
    if (!empty($esc['lembreteAuto'])) {
        try {
            $tpl = $esc['lembretes'] ?? [];
            $tGuia = $tpl['guia'] ?? 'Olá, {nome}! Lembrando que a guia do INSS da competência {competencia}, no valor de {valor}, vence em {venc}. {link}';
            $tParto = $tpl['parto'] ?? 'Olá, {nome}! A data prevista do parto é {dpp}. Assim que o bebê nascer, nos envie a certidão de nascimento.';
            $clientes = [];
            foreach (nuc_listar($pdo, 'clientes') as $c) $clientes[$c['id']] = $c;
            $em3 = date('Y-m-d', strtotime('+3 days')); $em10 = date('Y-m-d', strtotime('+10 days'));
            $fill = function (string $t, array $v): string { return trim(preg_replace('/\s{2,}/', ' ', preg_replace_callback('/\{(\w+)\}/', fn($m) => $v[$m[1]] ?? '', $t))); };
            foreach (nuc_listar($pdo, 'sm') as $caso) {
                $c = $clientes[$caso['clienteId'] ?? ''] ?? null;
                if (!$c || empty($c['email']) || in_array($caso['status'] ?? '', ['Concluído', 'Indeferido'], true)) continue;
                $nome = explode(' ', trim((string) $c['nome']))[0];
                $mudou = false;
                foreach (($caso['guias'] ?? []) as $i => $g) {
                    if (!empty($g['pagaEm']) || ($g['venc'] ?? '') !== $em3 || ($g['quemPaga'] ?? '') === 'Escritório' || !empty($g['lembradoAutoEm'])) continue;
                    $comp = preg_match('/^(\d{4})-(\d{2})/', (string) $g['competencia'], $m) ? "$m[2]/$m[1]" : '';
                    $link = !empty($g['link']) ? 'Guia: ' . $g['link'] : (!empty($c['portalToken']) ? 'Guia e código no seu portal: ' . portalUrl($c['portalToken']) : '');
                    if (nuc_email((string) $c['email'], 'Lembrete: guia do INSS vence em ' . nuc_data($g['venc']), $fill($tGuia, ['nome' => $nome, 'escritorio' => $esc['nome'] ?? '', 'competencia' => $comp, 'valor' => nuc_brl($g['valor'] ?? 0), 'venc' => nuc_data($g['venc']), 'link' => $link]), $de)) {
                        $caso['guias'][$i]['lembradoAutoEm'] = date('Y-m-d'); $mudou = true;
                    }
                }
                if (empty($caso['dataParto']) && ($caso['dpp'] ?? '') === $em10 && empty($caso['lembradoPartoAutoEm'])
                    && nuc_email((string) $c['email'], 'Salário-maternidade: parto previsto para ' . nuc_data($caso['dpp']), $fill($tParto, ['nome' => $nome, 'escritorio' => $esc['nome'] ?? '', 'dpp' => nuc_data($caso['dpp'])]), $de)) {
                    $caso['lembradoPartoAutoEm'] = date('Y-m-d'); $mudou = true;
                }
                if ($mudou) nuc_gravar($pdo, 'sm', (string) $caso['id'], $caso);
            }
        } catch (Throwable $e) { /* idem */ }
    }
    flock($lock, LOCK_UN);
}
function portalUrl(string $t): string
{
    global $https;
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/portal.php?t=' . $t;
}

/* ---------- integrações externas ---------- */
function falhaExterna(string $nome, int $st, string $raw): void
{
    if ($st === 0) erro('Não foi possível conectar ao serviço (' . $nome . '). Tente de novo em instantes.');
    $j = json_decode($raw, true);
    $det = $j['errors'][0]['description'] ?? $j['error']['message'] ?? $j['detail'] ?? $j['message'] ?? mb_substr($raw, 0, 200);
    erro($nome . ' recusou o pedido (' . $st . '): ' . (is_string($det) ? $det : json_encode($det, JSON_UNESCAPED_UNICODE)));
}
function segredos(PDO $pdo): array { return nuc_config($pdo, 'segredos'); }
function httpJson(string $metodo, string $url, array $headers, ?array $corpo = null, int $timeout = 60): array
{
    $ch = curl_init($url);
    $h = array_merge(['Accept: application/json'], $headers);
    if ($corpo !== null) { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($corpo, JSON_UNESCAPED_UNICODE)); }
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 15]);
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$status, $resp === false ? null : json_decode((string) $resp, true), $err ?: (string) $resp];
}
function buscarPorCampo(PDO $pdo, string $col, string $trecho): array
{
    $st = $pdo->prepare('SELECT id, dados FROM registros WHERE colecao = ? AND excluido = 0 AND dados LIKE ?');
    $st->execute([$col, '%' . $trecho . '%']);
    return $st->fetchAll();
}
if ($acao === 'webhook') {
    $s = segredos($pdo);
    $servico = (string) ($_GET['s'] ?? '');
    $corpo = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    $chaveOk = !empty($s['webhookChave']) && hash_equals((string) $s['webhookChave'], (string) ($_GET['k'] ?? ''));
    if ($servico === 'asaas') {
        $tokenOk = !empty($s['asaasWebhookToken']) && hash_equals((string) $s['asaasWebhookToken'], (string) ($_SERVER['HTTP_ASAAS_ACCESS_TOKEN'] ?? ''));
        if (!$tokenOk && !$chaveOk) erro('Não autorizado.', 401);
        $ev = (string) ($corpo['event'] ?? '');
        $pg = $corpo['payment'] ?? [];
        $lid = (string) ($pg['externalReference'] ?? '');
        if ($lid !== '' && ($l = nuc_ler($pdo, 'lancamentos', $lid))) {
            $l['cobranca'] = array_merge($l['cobranca'] ?? [], ['status' => (string) ($pg['status'] ?? $ev)]);
            if (in_array($ev, ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'], true)) {
                $l['pago'] = true;
                $l['pagoEm'] = substr((string) ($pg['paymentDate'] ?? $pg['clientPaymentDate'] ?? date('Y-m-d')), 0, 10);
                $l['forma'] = ['PIX' => 'PIX', 'BOLETO' => 'Boleto', 'CREDIT_CARD' => 'Cartão'][$pg['billingType'] ?? ''] ?? ($l['forma'] ?? 'PIX');
                if (!empty($pg['value'])) $l['valor'] = (float) $pg['value'];
            }
            nuc_gravar($pdo, 'lancamentos', $lid, $l);
        }
        responder(['ok' => true]);
    }
    if ($servico === 'zapsign') {
        if (!$chaveOk) erro('Não autorizado.', 401);
        $token = (string) ($corpo['token'] ?? $corpo['doc_token'] ?? '');
        if ($token !== '' && preg_match('/^[a-zA-Z0-9-]+$/', $token)) {
            foreach (buscarPorCampo($pdo, 'documentos', '"token":"' . $token . '"') as $r) {
                $d = json_decode((string) $r['dados'], true);
                if (($d['assinatura']['token'] ?? '') !== $token) continue;
                $d['assinatura']['status'] = (string) ($corpo['status'] ?? $d['assinatura']['status'] ?? '');
                foreach (($corpo['signers'] ?? []) as $sg) foreach (($d['assinatura']['signatarios'] ?? []) as $i => $sd)
                    if (($sd['token'] ?? '') === ($sg['token'] ?? '-')) $d['assinatura']['signatarios'][$i]['status'] = (string) ($sg['status'] ?? '');
                if (($d['assinatura']['status'] ?? '') === 'signed') { $d['recebido'] = true; $d['data'] = date('Y-m-d'); if (!empty($corpo['signed_file'])) $d['link'] = (string) $corpo['signed_file']; }
                nuc_gravar($pdo, 'documentos', (string) $r['id'], $d);
            }
        }
        responder(['ok' => true]);
    }
    erro('Serviço desconhecido.', 404);
}

// Proteção contra envio de formulários de outros sites (CSRF): toda escrita exige este cabeçalho,
// que um formulário comum de outro site não consegue enviar.
if ($metodo === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'gestao') {
    erro('Requisição inválida.', 403);
}

switch ($acao) {
    case 'sessao':
        $u = usuarioLogado($pdo);
        rotinaDiaria($pdo, $cfg);
        responder(['ok' => true, 'usuario' => usuarioPublico($u), 'agora' => agoraMs()]);

    case 'login':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $b = corpo();
        $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
        $st = $pdo->prepare('SELECT * FROM usuarios WHERE email = ?');
        $st->execute([$email]);
        $u = $st->fetch();
        if (!$u || (int) $u['ativo'] !== 1 || !password_verify((string) ($b['senha'] ?? ''), $u['senha_hash'])) {
            registrar($pdo, $u ? (int) $u['id'] : null, 'login_falhou');
            sleep(1); // dificulta tentativas em massa
            erro('E-mail ou senha incorretos.', 401);
        }
        if (!empty($u['totp_secret']) && !totpValido((string) $u['totp_secret'], (string) ($b['codigo'] ?? ''))) {
            if (($b['codigo'] ?? '') !== '') { registrar($pdo, (int) $u['id'], 'login_2fa_falhou'); sleep(1); }
            responder(['ok' => false, 'precisa2fa' => true, 'erro' => ($b['codigo'] ?? '') !== '' ? 'Código inválido. Confira o aplicativo autenticador.' : 'Digite o código de 6 dígitos do aplicativo autenticador.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $u['id'];
        registrar($pdo, (int) $u['id'], 'login');
        responder(['ok' => true, 'usuario' => usuarioPublico($u), 'agora' => agoraMs()]);

    case 'sair':
        if (!empty($_SESSION['uid'])) {
            registrar($pdo, (int) $_SESSION['uid'], 'logout');
            $pdo->prepare('DELETE FROM presenca WHERE uid = ?')->execute([(int) $_SESSION['uid']]);
        }
        $_SESSION = [];
        session_destroy();
        responder(['ok' => true]);

    case 'dados':
        $u = usuarioLogado($pdo);
        $agora = agoraMs();
        $desde = max(0, (int) ($_GET['desde'] ?? 0));
        $st = $pdo->prepare('SELECT colecao, id, dados, excluido FROM registros WHERE atualizado_em > ?' . ($desde === 0 ? ' AND excluido = 0' : ''));
        $st->execute([$desde]);
        $out = [];
        foreach ($st as $r) {
            $dados = json_decode((string) $r['dados'], true);
            if (!podeLer($u, $r['colecao'], $r['id'], $dados)) continue;
            $out[] = ['colecao' => $r['colecao'], 'id' => $r['id'], 'excluido' => (int) $r['excluido'] === 1,
                'dados' => (int) $r['excluido'] === 1 ? null : $dados];
        }
        responder(['ok' => true, 'agora' => $agora, 'registros' => $out]);

    case 'salvar':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $uid = (int) $u['id'];
        $b = corpo();
        $agora = agoraMs();
        $busca = $pdo->prepare('SELECT dados, excluido FROM registros WHERE colecao = ? AND id = ?');
        $atual = function (string $col, string $id) use ($busca) {
            $busca->execute([$col, $id]);
            $r = $busca->fetch();
            return $r ? ['dados' => json_decode((string) $r['dados'], true), 'excluido' => (int) $r['excluido'] === 1] : null;
        };
        $sqlUpsert = $mysql
            ? 'INSERT INTO registros (colecao, id, dados, excluido, atualizado_em, atualizado_por) VALUES (?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE dados = VALUES(dados), excluido = VALUES(excluido), atualizado_em = VALUES(atualizado_em), atualizado_por = VALUES(atualizado_por)'
            : 'INSERT INTO registros (colecao, id, dados, excluido, atualizado_em, atualizado_por) VALUES (?,?,?,?,?,?)
               ON CONFLICT(colecao, id) DO UPDATE SET dados = excluded.dados, excluido = excluded.excluido, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por';
        $st = $pdo->prepare($sqlUpsert);
        $pdo->beginTransaction();
        try {
            $n = 0;
            foreach (($b['upserts'] ?? []) as $r) {
                $col = (string) ($r['colecao'] ?? '');
                $id = (string) ($r['id'] ?? '');
                if ($id === '' || strlen($id) > 60) continue;
                $ant = $atual($col, $id);
                if (!podeGravar($u, $col, $id, $r['dados'] ?? null, $ant && !$ant['excluido'] ? $ant['dados'] : null)) continue;
                $st->execute([$col, $id, json_encode($r['dados'] ?? null, JSON_UNESCAPED_UNICODE), 0, $agora, $uid]);
                registrar($pdo, $uid, 'salvar', $col, $id);
                $n++;
            }
            foreach (($b['exclusoes'] ?? []) as $r) {
                $col = (string) ($r['colecao'] ?? '');
                $id = (string) ($r['id'] ?? '');
                if ($id === '') continue;
                $ant = $atual($col, $id);
                if (!$ant || $ant['excluido'] || !podeGravar($u, $col, $id, null, $ant['dados'])) continue;
                // mantém os dados do registro excluído (para as regras de acesso), marcando-o como excluído
                $st->execute([$col, $id, json_encode($ant['dados'], JSON_UNESCAPED_UNICODE), 1, $agora, $uid]);
                registrar($pdo, $uid, 'excluir', $col, $id);
                $n++;
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            erro('Falha ao salvar. Tente novamente.', 500);
        }
        responder(['ok' => true, 'agora' => $agora, 'gravados' => $n]);

    case 'senha':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $b = corpo();
        if (!password_verify((string) ($b['atual'] ?? ''), $u['senha_hash'])) erro('Senha atual incorreta.');
        $nova = (string) ($b['nova'] ?? '');
        if (mb_strlen($nova) < 8) erro('A nova senha deve ter pelo menos 8 caracteres.');
        $pdo->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($nova, PASSWORD_DEFAULT), $u['id']]);
        registrar($pdo, (int) $u['id'], 'troca_senha');
        responder(['ok' => true]);

    case 'sala':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $b = corpo();
        $agora = agoraMs();
        $parceiro = $u['papel'] === 'parceiro';
        if (is_array($b['presenca'] ?? null)) {
            $p = $b['presenca'];
            $sala = in_array($p['sala'] ?? '', SALAS, true) ? $p['sala'] : 'recepcao';
            if ($parceiro) $sala = SALA_PARCEIRO;
            $num = fn($v) => max(0.0, min(100.0, (float) $v));
            $status = in_array($p['status'] ?? '', STATUS_SALA, true) ? $p['status'] : 'disponivel';
            $visual = [];
            foreach ((array) ($p['visual'] ?? []) as $k => $v) {
                if (in_array($k, ['pele', 'cabelo', 'corCabelo', 'roupa', 'oculos', 'gravata'], true) && is_scalar($v)) $visual[$k] = mb_substr((string) $v, 0, 20);
            }
            $pdo->prepare('DELETE FROM presenca WHERE uid = ?')->execute([(int) $u['id']]);
            $pdo->prepare('INSERT INTO presenca (uid, email, nome, papel, sala, x, y, status, visual, visto) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([(int) $u['id'], minusculo($u['email']), $u['nome'], $u['papel'], $sala, $num($p['x'] ?? 50), $num($p['y'] ?? 50), $status, json_encode($visual), $agora]);
        }
        if (is_array($b['enviar'] ?? null)) {
            $canal = (string) ($b['enviar']['canal'] ?? '');
            $texto = trim(mb_substr((string) ($b['enviar']['texto'] ?? ''), 0, 2000));
            $tipo = in_array($b['enviar']['tipo'] ?? 'msg', ['msg', 'toc', 'emote'], true) ? $b['enviar']['tipo'] : 'msg';
            if ($texto === '' || !canalPermitido($u, $canal)) erro('Não foi possível enviar a mensagem.');
            $pdo->prepare('INSERT INTO mensagens (canal, de_uid, de_email, de_nome, texto, tipo, em) VALUES (?,?,?,?,?,?,?)')
                ->execute([$canal, (int) $u['id'], minusculo($u['email']), $u['nome'], $texto, $tipo, $agora]);
        }
        $desde = max(0, (int) ($b['desde'] ?? 0));
        $st = $desde > 0
            ? $pdo->prepare('SELECT * FROM mensagens WHERE em > ? ORDER BY id LIMIT 500')
            : $pdo->prepare('SELECT * FROM mensagens WHERE em > ? ORDER BY id DESC LIMIT 1500');
        $st->execute([$desde > 0 ? $desde : $agora - 30 * 86400000]);
        $linhas = $st->fetchAll();
        if ($desde === 0) $linhas = array_reverse($linhas);
        $msgs = [];
        foreach ($linhas as $m) {
            if (!canalPermitido($u, $m['canal'])) continue;
            $msgs[] = ['id' => (int) $m['id'], 'canal' => $m['canal'], 'de' => $m['de_email'], 'nome' => $m['de_nome'], 'texto' => $m['texto'], 'tipo' => $m['tipo'], 'em' => (int) $m['em']];
        }
        $st = $pdo->prepare('SELECT * FROM presenca WHERE visto > ?');
        $st->execute([$agora - 600000]);
        $pres = [];
        foreach ($st->fetchAll() as $p) {
            if ($parceiro && $p['sala'] !== SALA_PARCEIRO && (int) $p['uid'] !== (int) $u['id']) continue;
            $pres[] = ['email' => $p['email'], 'nome' => $p['nome'], 'papel' => $p['papel'], 'sala' => $p['sala'], 'x' => (float) $p['x'], 'y' => (float) $p['y'],
                'status' => $p['status'], 'visual' => json_decode((string) $p['visual'], true) ?: [], 'online' => (int) $p['visto'] > $agora - 45000];
        }
        responder(['ok' => true, 'agora' => $agora, 'presencas' => $pres, 'mensagens' => $msgs]);

    case 'arquivo': // arquivo enviado pelo cliente no portal (só para a equipe com acesso ao documento)
        $u = usuarioLogado($pdo);
        $id = (string) ($_GET['doc'] ?? '');
        $doc = nuc_ler($pdo, 'documentos', $id);
        if (!$doc || empty($doc['portalArquivo']['arquivo']) || !podeLer($u, 'documentos', $id, $doc)) erro('Arquivo não encontrado.', 404);
        $caminho = nuc_pasta($cfg, 'uploads/' . preg_replace('/[^a-z0-9]/i', '', (string) $doc['clienteId'])) . '/' . basename((string) $doc['portalArquivo']['arquivo']);
        if (!is_file($caminho)) erro('Arquivo não encontrado.', 404);
        $mime = (function_exists('mime_content_type') ? mime_content_type($caminho) : '') ?: 'application/octet-stream';
        header_remove('Content-Type');
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($caminho));
        header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode((string) ($doc['portalArquivo']['nome'] ?? 'arquivo')));
        readfile($caminho);
        exit;

    case 'integracoes':
        $u = usuarioLogado($pdo);
        $s = segredos($pdo);
        $mask = fn($k) => !empty($s[$k]) ? '••••' . substr((string) $s[$k], -4) : '';
        $base = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/api.php?acao=webhook';
        $r = ['ok' => true, 'zapsign' => !empty($s['zapsignToken']), 'asaas' => !empty($s['asaasToken']), 'escavador' => !empty($s['escavadorToken']), 'ia' => !empty($s['anthropicKey'])];
        if ($u['papel'] === 'admin') $r += ['mascaras' => ['zapsignToken' => $mask('zapsignToken'), 'asaasToken' => $mask('asaasToken'), 'asaasWebhookToken' => $mask('asaasWebhookToken'), 'escavadorToken' => $mask('escavadorToken'), 'anthropicKey' => $mask('anthropicKey')],
            'zapsignSandbox' => !empty($s['zapsignSandbox']), 'asaasSandbox' => !empty($s['asaasSandbox']),
            'webhooks' => !empty($s['webhookChave']) ? ['asaas' => $base . '&s=asaas', 'zapsign' => $base . '&s=zapsign&k=' . $s['webhookChave']] : null];
        responder($r);

    case 'segredos':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if ($u['papel'] !== 'admin') erro('Somente administradores.', 403);
        $b = corpo();
        $s = segredos($pdo);
        foreach (['zapsignToken', 'asaasToken', 'asaasWebhookToken', 'escavadorToken', 'anthropicKey'] as $k) {
            $v = trim((string) ($b[$k] ?? ''));
            if ($v === '-') unset($s[$k]); elseif ($v !== '') $s[$k] = mb_substr($v, 0, 500);
        }
        foreach (['zapsignSandbox', 'asaasSandbox'] as $k) if (array_key_exists($k, $b)) $s[$k] = !empty($b[$k]);
        if (empty($s['webhookChave'])) $s['webhookChave'] = bin2hex(random_bytes(16));
        nuc_gravar($pdo, 'config', 'segredos', $s, (int) $u['id']);
        registrar($pdo, (int) $u['id'], 'segredos', 'config', 'segredos');
        responder(['ok' => true]);

    case 'zapsign':
    case 'zapsignStatus':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if ($u['papel'] === 'parceiro') erro('Sem permissão.', 403);
        $s = segredos($pdo);
        if (empty($s['zapsignToken'])) erro('Configure o token da ZapSign em Configurações → Integrações.');
        $api = !empty($s['zapsignSandbox']) ? 'https://sandbox.api.zapsign.com.br/api/v1' : 'https://api.zapsign.com.br/api/v1';
        $auth = ['Authorization: Bearer ' . $s['zapsignToken']];
        $b = corpo();
        if ($acao === 'zapsignStatus') {
            $tk = (string) ($b['token'] ?? '');
            if (!preg_match('/^[a-zA-Z0-9-]+$/', $tk)) erro('Documento inválido.');
            [$st, $j, $raw] = httpJson('GET', $api . '/docs/' . $tk . '/', $auth);
            if ($st >= 300 || !$j) falhaExterna('ZapSign', $st, $raw);
            responder(['ok' => true, 'status' => $j['status'] ?? '', 'signed_file' => $j['signed_file'] ?? null,
                'signatarios' => array_map(fn($x) => ['token' => $x['token'] ?? '', 'nome' => $x['name'] ?? '', 'status' => $x['status'] ?? '', 'url' => $x['sign_url'] ?? ''], $j['signers'] ?? [])]);
        }
        $signers = [];
        foreach (array_slice((array) ($b['signatarios'] ?? []), 0, 10) as $sg) {
            $tel = preg_replace('/\D/', '', (string) ($sg['tel'] ?? ''));
            if (strlen($tel) > 11 && substr($tel, 0, 2) === '55') $tel = substr($tel, 2);
            $signers[] = array_filter(['name' => mb_substr((string) ($sg['nome'] ?? ''), 0, 120), 'email' => filter_var($sg['email'] ?? '', FILTER_VALIDATE_EMAIL) ?: null,
                'phone_country' => $tel ? '55' : null, 'phone_number' => $tel ?: null, 'auth_mode' => 'assinaturaTela', 'send_automatic_email' => !empty($sg['email']),
                'send_automatic_whatsapp' => false], fn($v) => $v !== null);
        }
        if (!$signers) erro('Informe ao menos um signatário.');
        $doc = ['name' => mb_substr((string) ($b['nome'] ?? 'Documento'), 0, 200), 'lang' => 'pt-br', 'signers' => $signers, 'external_id' => (string) ($b['documentoId'] ?? ''),
            'base64_docx' => (string) ($b['docx'] ?? '')];
        if ($doc['base64_docx'] === '' || strlen($doc['base64_docx']) > 20000000) erro('Documento vazio ou grande demais.');
        [$st, $j, $raw] = httpJson('POST', $api . '/docs/', $auth, $doc, 90);
        if ($st >= 300 || !$j || empty($j['token'])) falhaExterna('ZapSign', $st, $raw);
        responder(['ok' => true, 'token' => $j['token'], 'status' => $j['status'] ?? 'pending',
            'signatarios' => array_map(fn($x) => ['token' => $x['token'] ?? '', 'nome' => $x['name'] ?? '', 'status' => $x['status'] ?? 'new', 'url' => $x['sign_url'] ?? ''], $j['signers'] ?? [])]);

    case 'asaas':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if (!in_array($u['papel'], ['admin', 'advogado', 'financeiro'], true)) erro('Sem permissão.', 403);
        $s = segredos($pdo);
        if (empty($s['asaasToken'])) erro('Configure a chave do Asaas em Configurações → Integrações.');
        $api = !empty($s['asaasSandbox']) ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
        $auth = ['access_token: ' . $s['asaasToken'], 'User-Agent: GestaoEscritorio'];
        $lid = (string) (corpo()['lancamentoId'] ?? '');
        $l = nuc_ler($pdo, 'lancamentos', $lid);
        if (!$l || ($l['tipo'] ?? '') !== 'receita' || !empty($l['pago'])) erro('Receita não encontrada ou já paga.');
        if (!empty($l['cobranca']['id'])) responder(['ok' => true, 'cobranca' => $l['cobranca']]);
        $c = !empty($l['clienteId']) ? nuc_ler($pdo, 'clientes', (string) $l['clienteId']) : null;
        if (!$c) erro('Vincule um cliente a esta receita para gerar a cobrança.');
        $doc = preg_replace('/\D/', '', (string) ($c['doc'] ?? ''));
        if (!in_array(strlen($doc), [11, 14], true)) erro('Cadastre o CPF/CNPJ do cliente para gerar a cobrança.');
        if (empty($c['asaasId'])) {
            [$st, $j, $raw] = httpJson('GET', $api . '/customers?cpfCnpj=' . $doc, $auth);
            $cust = $j['data'][0]['id'] ?? null;
            if (!$cust) {
                $tel = preg_replace('/\D/', '', (string) ($c['tel'] ?? ''));
                [$st, $j, $raw] = httpJson('POST', $api . '/customers', $auth, array_filter(['name' => $c['nome'] ?? '', 'cpfCnpj' => $doc, 'email' => $c['email'] ?? null, 'mobilePhone' => $tel ?: null, 'externalReference' => $c['id'], 'notificationDisabled' => false]));
                if ($st >= 300 || empty($j['id'])) falhaExterna('Asaas', $st, $raw);
                $cust = $j['id'];
            }
            $c['asaasId'] = $cust;
            nuc_gravar($pdo, 'clientes', (string) $c['id'], $c, (int) $u['id']);
        }
        $venc = max((string) ($l['venc'] ?? ''), date('Y-m-d'));
        [$st, $j, $raw] = httpJson('POST', $api . '/payments', $auth, ['customer' => $c['asaasId'], 'billingType' => 'UNDEFINED', 'value' => round((float) $l['valor'], 2), 'dueDate' => $venc,
            'description' => mb_substr((string) ($l['descricao'] ?? 'Honorários advocatícios'), 0, 500), 'externalReference' => $lid]);
        if ($st >= 300 || empty($j['id'])) falhaExterna('Asaas', $st, $raw);
        $l['cobranca'] = ['id' => $j['id'], 'link' => $j['invoiceUrl'] ?? '', 'boleto' => $j['bankSlipUrl'] ?? '', 'status' => $j['status'] ?? 'PENDING', 'criadaEm' => date('Y-m-d')];
        nuc_gravar($pdo, 'lancamentos', $lid, $l, (int) $u['id']);
        responder(['ok' => true, 'cobranca' => $l['cobranca']]);

    case 'escavador':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if ($u['papel'] === 'parceiro') erro('Sem permissão.', 403);
        $s = segredos($pdo);
        if (empty($s['escavadorToken'])) erro('Configure o token do Escavador em Configurações → Integrações.');
        $num = preg_replace('/[^0-9.\-]/', '', (string) (corpo()['numero'] ?? ''));
        if (strlen(preg_replace('/\D/', '', $num)) !== 20) erro('Informe o número CNJ completo (20 dígitos).');
        [$st, $j, $raw] = httpJson('GET', 'https://api.escavador.com/api/v2/processos/numero_cnj/' . $num . '/movimentacoes', ['Authorization: Bearer ' . $s['escavadorToken'], 'X-Requested-With: XMLHttpRequest']);
        if ($st === 404) erro('O Escavador não encontrou este processo.');
        if ($st >= 300 || !$j) falhaExterna('Escavador', $st, $raw);
        $itens = [];
        foreach (($j['items'] ?? $j['movimentacoes'] ?? []) as $m) {
            $itens[] = ['data' => substr((string) ($m['data'] ?? ''), 0, 10), 'texto' => trim((string) ($m['conteudo'] ?? $m['texto'] ?? $m['tipo'] ?? '')), 'fonte' => (string) ($m['fonte']['nome'] ?? $m['fonte']['sigla'] ?? '')];
        }
        responder(['ok' => true, 'movimentacoes' => $itens]);

    case 'ia':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if ($u['papel'] === 'parceiro') erro('Sem permissão.', 403);
        $s = segredos($pdo);
        if (empty($s['anthropicKey'])) erro('Configure a chave da IA (Claude) em Configurações → Integrações.');
        $b = corpo();
        $pedido = trim(mb_substr((string) ($b['pedido'] ?? ''), 0, 20000));
        $contexto = trim(mb_substr((string) ($b['contexto'] ?? ''), 0, 60000));
        if ($pedido === '') erro('Descreva a peça que deseja.');
        @set_time_limit(300);
        $sistema = 'Você é um advogado brasileiro experiente que redige peças processuais e documentos jurídicos em português do Brasil, '
            . 'com linguagem técnica, clara e objetiva, fundamentação legal e jurisprudencial pertinente e estrutura completa (endereçamento, qualificação, fatos, fundamentos, pedidos, valor da causa quando couber, fecho). '
            . 'Use somente os dados fornecidos no contexto; quando faltar alguma informação, deixe um marcador entre colchetes, por exemplo [NÚMERO DO NB]. '
            . 'Não invente números de processos, julgados ou dados pessoais. Entregue apenas o texto da peça, sem comentários antes ou depois. '
            . 'Use parágrafos separados por linha em branco e títulos em letras maiúsculas.';
        [$st, $j, $raw] = httpJson('POST', 'https://api.anthropic.com/v1/messages', [
            'x-api-key: ' . $s['anthropicKey'], 'anthropic-version: 2023-06-01', 'anthropic-beta: server-side-fallback-2026-07-01'], [
            'model' => 'claude-opus-5-5', 'max_tokens' => 16000, 'output_config' => ['effort' => 'medium'], 'fallbacks' => 'default',
            'system' => $sistema,
            'messages' => [['role' => 'user', 'content' => "DADOS DO CASO (do sistema do escritório):
" . $contexto . "

PEDIDO:
" . $pedido]]], 280);
        if ($st === 401) erro('A chave da IA é inválida. Confira em Configurações → Integrações.');
        if ($st >= 300 || !$j) falhaExterna('A IA', $st, $raw);
        if (($j['stop_reason'] ?? '') === 'refusal') erro('A IA recusou este pedido. Reformule as instruções.');
        $texto = '';
        foreach (($j['content'] ?? []) as $bl) if (($bl['type'] ?? '') === 'text') $texto .= $bl['text'];
        if (trim($texto) === '') erro('A IA não devolveu texto. Tente de novo.');
        responder(['ok' => true, 'texto' => $texto, 'cortado' => ($j['stop_reason'] ?? '') === 'max_tokens']);

    case 'doisfatores':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $b = corpo();
        $etapa = (string) ($b['etapa'] ?? '');
        if ($etapa === 'iniciar') {
            $seg = base32Enc(random_bytes(20));
            $_SESSION['totp_novo'] = $seg;
            $emissor = rawurlencode((string) (nuc_config($pdo, 'escritorio')['nome'] ?? 'Gestão do Escritório'));
            responder(['ok' => true, 'segredo' => $seg, 'uri' => 'otpauth://totp/' . $emissor . ':' . rawurlencode($u['email']) . '?secret=' . $seg . '&issuer=' . $emissor . '&digits=6&period=30']);
        }
        if ($etapa === 'ativar') {
            $seg = (string) ($_SESSION['totp_novo'] ?? '');
            if ($seg === '' || !totpValido($seg, (string) ($b['codigo'] ?? ''))) erro('Código inválido. Confira se digitou o código atual do aplicativo.');
            $pdo->prepare('UPDATE usuarios SET totp_secret = ? WHERE id = ?')->execute([$seg, (int) $u['id']]);
            unset($_SESSION['totp_novo']);
            registrar($pdo, (int) $u['id'], '2fa_ativado');
            responder(['ok' => true]);
        }
        if ($etapa === 'desativar') {
            if (!password_verify((string) ($b['senha'] ?? ''), $u['senha_hash'])) erro('Senha incorreta.');
            $pdo->prepare('UPDATE usuarios SET totp_secret = NULL WHERE id = ?')->execute([(int) $u['id']]);
            registrar($pdo, (int) $u['id'], '2fa_desativado');
            responder(['ok' => true]);
        }
        erro('Etapa inválida.');

    case 'backups':
    case 'backup':
    case 'backupAgora':
        $u = usuarioLogado($pdo);
        if ($u['papel'] !== 'admin') erro('Somente administradores.', 403);
        $dir = nuc_pasta($cfg, 'backups');
        if ($acao === 'backupAgora') { if ($metodo !== 'POST') erro('Método inválido.', 405); fazerBackup($pdo, $cfg); registrar($pdo, (int) $u['id'], 'backup'); }
        if ($acao === 'backup') {
            $f = basename((string) ($_GET['f'] ?? ''));
            if (!preg_match('/^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/', $f) || !is_file($dir . '/' . $f)) erro('Backup não encontrado.', 404);
            header_remove('Content-Type');
            header('Content-Type: application/gzip');
            header('Content-Disposition: attachment; filename="' . $f . '"');
            header('Content-Length: ' . filesize($dir . '/' . $f));
            readfile($dir . '/' . $f);
            exit;
        }
        $lista = [];
        foreach (array_reverse(glob($dir . '/backup-*.json.gz') ?: []) as $f) $lista[] = ['arquivo' => basename($f), 'tamanho' => filesize($f)];
        responder(['ok' => true, 'backups' => $lista]);

    case 'contas':
        $u = usuarioLogado($pdo);
        if ($u['papel'] !== 'admin') erro('Somente administradores.', 403);
        $lista = $pdo->query('SELECT * FROM usuarios ORDER BY nome')->fetchAll();
        responder(['ok' => true, 'contas' => array_map('usuarioPublico', $lista)]);

    case 'conta':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if ($u['papel'] !== 'admin') erro('Somente administradores.', 403);
        $b = corpo();
        $nome = trim((string) ($b['nome'] ?? ''));
        $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
        $papel = in_array($b['papel'] ?? '', PAPEIS, true) ? $b['papel'] : 'advogado';
        $ativo = !empty($b['ativo']) ? 1 : 0;
        $senha = (string) ($b['senha'] ?? '');
        if ($nome === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) erro('Informe nome e e-mail válidos.');
        if ($senha !== '' && mb_strlen($senha) < 8) erro('A senha deve ter pelo menos 8 caracteres.');
        $id = (int) ($b['id'] ?? 0);
        try {
            if ($id) {
                if ($id === (int) $u['id'] && ($papel !== 'admin' || !$ativo)) erro('Você não pode remover o seu próprio acesso de administrador.');
                $pdo->prepare('UPDATE usuarios SET nome = ?, email = ?, papel = ?, ativo = ? WHERE id = ?')->execute([$nome, $email, $papel, $ativo, $id]);
                if ($senha !== '') $pdo->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $id]);
                if (!empty($b['zerar2fa'])) $pdo->prepare('UPDATE usuarios SET totp_secret = NULL WHERE id = ?')->execute([$id]);
            } else {
                if ($senha === '') erro('Defina uma senha inicial.');
                $pdo->prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?,?,?,?,?,?)')
                    ->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), $papel, $ativo, agoraMs()]);
                $id = (int) $pdo->lastInsertId();
            }
        } catch (PDOException $e) {
            erro('Já existe um acesso com este e-mail.');
        }
        registrar($pdo, (int) $u['id'], 'conta', 'usuarios', (string) $id);
        responder(['ok' => true, 'id' => $id]);

    default:
        erro('Ação desconhecida.', 404);
}
