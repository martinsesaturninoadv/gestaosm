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
    'notas', 'contratos', 'despesasFixas', 'usuarios', 'sm', 'scripts', 'modelos', 'trafego', 'requisitorios', 'nps', 'recados', 'peticoes', 'conteudos', 'config'];
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
const PAPEIS = ['admin', 'advogado', 'estagiario', 'financeiro', 'parceiro', 'editor'];
// Perfil "editor" (editora de vídeo): só a produção de conteúdo, o nome da equipe e o escritório virtual (conversa privada e sala de reunião)
const CONFIG_EDITOR = ['escritorio', 'salas'];
function externo(array $u): bool { return in_array($u['papel'], ['parceiro', 'editor'], true); }
// Anexos guardados no próprio sistema (fora da pasta pública): extensões aceitas e coleções que podem ter anexos
const ANEXO_EXT = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'gif',
    'mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp', 'mp3', 'm4a', 'wav', 'ogg', 'aac', 'srt', 'zip', 'psd', 'prproj', 'aep', 'xml'];
const ANEXO_COLECOES = ['peticoes', 'conteudos', 'processos', 'clientes', 'documentos', 'tarefas'];
const ANEXO_MAX = 2147483648; // 2 GB por arquivo
const ANEXO_PARTE = 2097152;  // o navegador envia em pedaços de 2 MB (passa pelo limite de upload da hospedagem)

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
    if ($col === 'config' && in_array($id, ['segredos', 'vapid'], true)) return false; // chaves: só no servidor
    if ($u['papel'] === 'estagiario' && in_array($col, COLECOES_FINANCEIRAS, true)) return false;
    if ($u['papel'] === 'editor') {
        if ($col === 'config') return in_array($id, CONFIG_EDITOR, true);
        return in_array($col, ['conteudos', 'usuarios'], true);
    }
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
    if ($u['papel'] === 'editor') return $col === 'conteudos' && $novo !== null; // edita os conteúdos, não apaga
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
    $parceiro = externo($u);
    if ($canal === 'geral') return !$parceiro;
    if (preg_match('/^sala:([a-z]+)$/', $canal, $m)) return in_array($m[1], SALAS, true) && (!$parceiro || $m[1] === SALA_PARCEIRO);
    if (preg_match('/^cont:[\w-]{1,60}$/', $canal)) return $u['papel'] !== 'parceiro'; // conversa de um conteúdo (equipe e editora)
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
    // anexos guardados no próprio sistema (petições, vídeos da produção de conteúdo…)
    $pdo->exec("CREATE TABLE IF NOT EXISTS anexos (
        id VARCHAR(40) NOT NULL PRIMARY KEY, colecao VARCHAR(40) NOT NULL, registro VARCHAR(60) NOT NULL, nome VARCHAR(255) NOT NULL,
        mime VARCHAR(100) NOT NULL, tamanho BIGINT NOT NULL, por_email VARCHAR(190) NOT NULL, em BIGINT NOT NULL)$fim");
    // chamadas de voz/vídeo do escritório virtual: quem está em cada chamada e a sinalização (WebRTC) entre os navegadores
    $pdo->exec("CREATE TABLE IF NOT EXISTS rtc_participantes (
        chamada VARCHAR(190) NOT NULL, email VARCHAR(190) NOT NULL, nome VARCHAR(120) NOT NULL, visto BIGINT NOT NULL, PRIMARY KEY (chamada, email))$fim");
    $pdo->exec("CREATE TABLE IF NOT EXISTS rtc_sinais (
        id $auto, chamada VARCHAR(190) NOT NULL, de VARCHAR(190) NOT NULL, para VARCHAR(190) NOT NULL, tipo VARCHAR(12) NOT NULL, dados $texto, em BIGINT NOT NULL)$fim");
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
/* roda depois que a resposta já foi entregue ao navegador (não atrasa quem está usando) */
function depois(callable $f): void
{
    register_shutdown_function(function () use ($f) {
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        try { $f(); } catch (Throwable $e) { /* avisos nunca derrubam o sistema */ }
    });
}
/* push quando alguém recebe tarefa, petição para conferir ou compromisso */
function avisosDeMudancas(PDO $pdo, array $u, array $mud): void
{
    $checarMetas = false;
    $email = nuc_emails_por_id($pdo);
    $eu = minusculo($u['email']);
    $quem = fn(array $ids) => array_values(array_diff(array_filter(array_map(fn($i) => $email[$i] ?? null, $ids)), [$eu]));
    $quando = fn(array $r, string $k) => !empty($r[$k]) ? ' — ' . nuc_data((string) $r[$k]) . (!empty($r['hora']) ? ' às ' . $r['hora'] : '') : '';
    foreach ($mud as [$col, $id, $novo, $ant]) {
        if (!is_array($novo)) continue;
        if ($col === 'tarefas' && ($novo['status'] ?? '') !== 'done') {
            $para = $quem(array_diff(nuc_resp($novo), $ant ? nuc_resp($ant) : []));
            $urg = ($novo['prioridade'] ?? '') === 'Alta';
            if ($para) nuc_push($pdo, $para, 'tarefa', $urg ? '🔴 Tarefa URGENTE para você' : '☑ Nova tarefa para você', ($novo['titulo'] ?? '') . $quando($novo, 'prazo') . ' · por ' . $u['nome'], '#tarefas', 'tarnova:' . $id . ':' . md5(implode(',', $para)), $urg ? 'high' : 'normal');
        }
        if ($col === 'peticoes') {
            $st = $novo['status'] ?? ''; $stAnt = $ant['status'] ?? '';
            if ($st === 'A conferir' && !empty($novo['conferenteId']) && ($stAnt !== 'A conferir' || ($ant['conferenteId'] ?? '') !== $novo['conferenteId']))
                nuc_push($pdo, $quem([$novo['conferenteId']]), 'tarefa', '🔎 Petição para você conferir', ($novo['titulo'] ?? '') . $quando($novo, 'prazo') . ' · de ' . $u['nome'], '#peticoes', 'petconf:' . $id . ':' . nuc_ms(), 'high');
            elseif ($st !== $stAnt && in_array($st, ['Em correção', 'Pronta para protocolar', 'Conferida'], true) && !empty($novo['autorId']))
                nuc_push($pdo, $quem([$novo['autorId']]), 'tarefa', $st === 'Em correção' ? '✏️ Petição voltou para correção' : '✅ Petição conferida' . ($st === 'Pronta para protocolar' ? ': pronta para protocolar' : ''),
                    ($novo['titulo'] ?? '') . ($st === 'Em correção' && !empty($novo['apontamentos']) ? ' — ' . mb_substr((string) $novo['apontamentos'], 0, 120) : ''), '#peticoes', 'petst:' . $id . ':' . $st . ':' . nuc_ms());
        }
        $eqMenosEu = array_values(array_diff(nuc_equipe($pdo), [$eu]));
        $cliNome = function (array $r) use ($pdo): string { $c = !empty($r['clienteId']) ? nuc_ler($pdo, 'clientes', (string) $r['clienteId']) : null; return (string) ($c['nome'] ?? ''); };
        if ($col === 'tarefas' && ($novo['status'] ?? '') === 'done' && $ant && ($ant['status'] ?? '') !== 'done' && ($p = $quem([(string) ($novo['criadoPor'] ?? '')])))
            nuc_push($pdo, $p, 'conquista', '✅ ' . $u['nome'] . ' concluiu a tarefa que você pediu', (string) ($novo['titulo'] ?? ''), '#tarefas', 'tarok:' . $id);
        if ($col === 'peticoes' && ($novo['status'] ?? '') === 'Protocolada' && ($ant['status'] ?? '') !== 'Protocolada')
            nuc_push($pdo, $quem([(string) ($novo['autorId'] ?? ''), (string) ($novo['conferenteId'] ?? '')]), 'conquista', '📨 Petição protocolada', (string) ($novo['titulo'] ?? '') . ' · ' . $u['nome'], '#peticoes', 'petprot:' . $id);
        if ($col === 'contratos' && !$ant) {
            nuc_push($pdo, $eqMenosEu, 'conquista', '🎉 ' . $u['nome'] . ' fechou um contrato!', $cliNome($novo) ?: 'Novo contrato de honorários', '#painel', 'ctr:' . $id, 'high');
            $checarMetas = true;
        }
        if ($col === 'leads' && !$ant) $checarMetas = true;
        if ($col === 'sm' && ($novo['status'] ?? '') === 'Deferido' && ($ant['status'] ?? '') !== 'Deferido')
            nuc_push($pdo, $eqMenosEu, 'conquista', '✅ Benefício deferido! 🎉', $cliNome($novo) . ' · ' . $u['nome'], '#sm/' . $id, 'smdef:' . $id, 'high');
        if ($col === 'processos' && ($ant['status'] ?? '') !== ($novo['status'] ?? '') && in_array($novo['status'] ?? '', ['Ganho', 'Acordo', 'Deferido'], true)) {
            $tt = ['Ganho' => '🏆 Processo ganho!', 'Acordo' => '🤝 Acordo fechado!', 'Deferido' => '✅ Requerimento deferido!'][$novo['status']];
            nuc_push($pdo, $eqMenosEu, 'conquista', $tt, $cliNome($novo) . ' · ' . $u['nome'], '#processo/' . $id, 'proc:' . $id . ':' . $novo['status'], 'high');
        }
        if ($col === 'conteudos') {
            $et = (string) ($novo['etapa'] ?? ''); $etAnt = (string) ($ant['etapa'] ?? '');
            $tit = '“' . mb_substr((string) ($novo['titulo'] ?? ''), 0, 60) . '”';
            $url = '#conteudo/' . $id;
            $editora = $quem([(string) ($novo['editorId'] ?? '')]);
            $equipe = $quem(array_merge((array) ($novo['responsaveis'] ?? []), [(string) ($novo['criadoPor'] ?? '')]));
            if ($et === 'Edição' && ($etAnt !== 'Edição' || ($ant['editorId'] ?? '') !== ($novo['editorId'] ?? '')))
                nuc_push($pdo, $editora, 'tarefa', $etAnt === 'Revisão' ? '↩ Ajustes pedidos na edição' : '✂️ Vídeo para você editar', $tit . (!empty($novo['dataEdicao']) ? ' — entregar até ' . nuc_data((string) $novo['dataEdicao']) : '') . ' · ' . $u['nome'], $url, 'cted:' . $id . ':' . nuc_ms(), 'high');
            elseif ($et === 'Revisão' && $etAnt !== 'Revisão')
                nuc_push($pdo, $equipe, 'tarefa', '👀 Edição pronta para revisar', $tit . ' · enviado por ' . $u['nome'], $url, 'ctrev:' . $id . ':' . nuc_ms(), 'high');
            elseif (in_array($et, ['Agendado', 'Publicado'], true) && $etAnt === 'Revisão')
                nuc_push($pdo, $editora, 'conquista', '✅ Sua edição foi aprovada!', $tit . ' · ' . $u['nome'], $url, 'ctok:' . $id . ':' . nuc_ms());
            elseif ($et === 'Publicado' && $etAnt !== 'Publicado')
                nuc_push($pdo, array_values(array_unique(array_merge($editora, $equipe))), 'conquista', '🚀 Conteúdo publicado!', $tit, $url, 'ctpub:' . $id);
            elseif ($et === $etAnt && !empty($novo['editorId']) && ($ant['editorId'] ?? '') !== $novo['editorId'] && in_array($et, ['Ideia', 'Roteiro', 'Gravação'], true))
                nuc_push($pdo, $editora, 'tarefa', '🎬 Novo conteúdo com você na edição', $tit . ' (etapa: ' . $et . ')', $url, 'ctatr:' . $id . ':' . ($novo['editorId'] ?? ''));
        }
        if ($col === 'eventos' && empty($novo['feito']) && ($novo['data'] ?? '') >= date('Y-m-d')) {
            $para = $quem(array_diff(nuc_resp($novo), $ant ? nuc_resp($ant) : []));
            $aud = preg_match('/audi|per[ií]cia/i', (string) ($novo['tipo'] ?? ''));
            if ($para && empty($novo['peticaoId'])) nuc_push($pdo, $para, 'prazo', $aud ? '🏛 Nova audiência para você' : '📅 Novo ' . mb_strtolower((string) ($novo['tipo'] ?? 'compromisso')) . ' para você', ($novo['titulo'] ?? '') . $quando($novo, 'data'), '#agenda', 'evnovo:' . $id . ':' . md5(implode(',', $para)), $aud ? 'high' : 'normal');
        }
    }
    if ($checarMetas) avisosMetas($pdo);
}
/* push de mensagem do chat para quem não está com o sistema aberto */
/* marcos da meta do mês (50%, 75%, 90% e batida): cada marco é avisado uma única vez para a equipe */
function avisosMetas(PDO $pdo): void
{
    $m = nuc_config($pdo, 'metas');
    $ym = date('Y-m'); $ini = $ym . '-01'; $fim = date('Y-m-t');
    $no = fn($d) => ($d = substr((string) $d, 0, 10)) >= $ini && $d <= $fim;
    $ks = array_filter(nuc_listar($pdo, 'contratos'), fn($k) => $no($k['data'] ?? ''));
    $atend = count(array_filter(nuc_listar($pdo, 'leads'), fn($l) => $no(($l['primeiroContato'] ?? '') ?: ($l['criado'] ?? ''))))
        + count(array_filter(nuc_listar($pdo, 'clientes'), fn($c) => empty($c['leadId']) && $no($c['criado'] ?? '')));
    $lista = [['qtd', 'Contratos fechados', count($ks), (float) ($m['qtd'] ?? 0), false],
        ['valor', 'Valor contratado', array_sum(array_map(fn($k) => (float) ($k['valorTotal'] ?? 0), $ks)), (float) ($m['valorTotal'] ?? 0), true],
        ['atend', 'Novos atendimentos', $atend, (float) ($m['atendimentos'] ?? 0), false]];
    foreach ($lista as [$id, $nome, $atual, $meta, $fin]) {
        if ($meta <= 0) continue;
        $p = $atual / $meta * 100;
        foreach ([100, 90, 75, 50] as $marco) {
            if ($p < $marco) continue;
            $chave = "meta:$ym:$id:$marco";
            if ($marco === 100) $tit = '🏆 Meta batida: ' . $nome . '!';
            else $tit = '🔥 ' . $marco . '% da meta: ' . $nome;
            $txt = $marco === 100 ? ($fin ? 'A equipe bateu a meta do mês. Parabéns, time! 🎉' : 'Chegamos a ' . round($atual) . ' de ' . round($meta) . '. Parabéns, time! 🎉')
                : ($fin ? 'Falta pouco para bater a meta do mês. Bora!' : 'Já são ' . round($atual) . ' de ' . round($meta) . '. Faltam ' . max(0, round($meta - $atual)) . '. Bora!');
            nuc_push($pdo, nuc_equipe($pdo), 'meta', $tit, $txt, '#painel', $chave, $marco === 100 ? 'high' : 'normal');
            foreach ([90, 75, 50] as $menor) if ($menor < $marco) nuc_push_marcar($pdo, "meta:$ym:$id:$menor"); // não avisa marcos menores depois
            break;
        }
    }
}
function avisoChat(PDO $pdo, array $u, string $canal, string $texto, string $tipo, int $agora): void
{
    $eu = minusculo($u['email']);
    if (preg_match('/^dm:([^|]+)\|([^|]+)$/', $canal, $m)) $para = [$m[1] === $eu ? $m[2] : $m[1]];
    elseif ($canal === 'geral' || strpos($canal, 'sala:') === 0) $para = nuc_equipe($pdo);
    elseif (strpos($canal, 'cont:') === 0) {
        $c = nuc_ler($pdo, 'conteudos', substr($canal, 5));
        if (!$c) return;
        $ids = nuc_emails_por_id($pdo);
        $para = array_values(array_filter(array_map(fn($i) => $ids[$i] ?? null, array_merge((array) ($c['responsaveis'] ?? []), [$c['editorId'] ?? '', $c['criadoPor'] ?? '']))));
        $tituloCont = (string) ($c['titulo'] ?? 'conteúdo');
    }
    else return;
    $st = $pdo->prepare('SELECT email FROM presenca WHERE visto > ?');
    $st->execute([$agora - 45000]);
    $online = array_map('mb_strtolower', $st->fetchAll(PDO::FETCH_COLUMN));
    $sala = strpos($canal, 'sala:') === 0 ? ' na ' . str_replace('sala:', 'sala ', $canal) : ($canal === 'geral' ? ' no chat geral' : '');
    $titulo = $tipo === 'toc' ? '🚪 ' . $u['nome'] . ' bateu na sua porta' : '💬 ' . $u['nome'] . $sala;
    $url = '#escritorio';
    if (isset($tituloCont)) { $titulo = '💬 ' . $u['nome'] . ' em “' . mb_substr($tituloCont, 0, 50) . '”'; $url = '#' . str_replace('cont:', 'conteudo/', $canal); }
    foreach (array_diff($para, $online, [$eu]) as $e) {
        nuc_push($pdo, [$e], 'msg', $titulo, $tipo === 'toc' ? 'Toque para abrir o escritório virtual' : mb_substr($texto, 0, 200), $url, 'msg|' . $canal . '|' . $e . '|' . intdiv($agora, 120000), 'high');
    }
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
        depois(fn() => nuc_avisos_periodicos($pdo, nuc_pasta($cfg, 'backups')));
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
        depois(fn() => nuc_avisos_periodicos($pdo, nuc_pasta($cfg, 'backups')));
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
        $mud = [];
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
                if (in_array($col, ['tarefas', 'peticoes', 'eventos', 'conteudos', 'contratos', 'leads', 'sm', 'processos'], true)) $mud[] = [$col, $id, $r['dados'] ?? null, $ant && !$ant['excluido'] ? $ant['dados'] : null];
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
        if ($mud) depois(fn() => avisosDeMudancas($pdo, $u, $mud));
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
        $parceiro = externo($u);
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
            if ($tipo !== 'emote') depois(fn() => avisoChat($pdo, $u, $canal, $texto, $tipo, $agora));
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
        $st = $pdo->prepare('SELECT chamada, email, nome FROM rtc_participantes WHERE visto > ? ORDER BY chamada');
        $st->execute([$agora - 20000]);
        $cham = [];
        foreach ($st->fetchAll() as $c) {
            if (!canalPermitido($u, $c['chamada'])) continue;
            $cham[$c['chamada']][] = ['email' => $c['email'], 'nome' => $c['nome']];
        }
        $chamadas = [];
        foreach ($cham as $canal => $pessoas) $chamadas[] = ['canal' => $canal, 'pessoas' => $pessoas];
        responder(['ok' => true, 'agora' => $agora, 'presencas' => $pres, 'mensagens' => $msgs, 'chamadas' => $chamadas]);

    case 'upload': // arquivo enviado em pedaços (o corpo da requisição é o pedaço do arquivo)
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $col = (string) ($_GET['col'] ?? '');
        $reg = (string) ($_GET['reg'] ?? '');
        $up = (string) ($_GET['up'] ?? '');
        $nome = trim(str_replace(["\0", '/', '\\'], '', mb_substr((string) ($_GET['nome'] ?? 'arquivo'), 0, 200)));
        $ext = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
        $total = (int) ($_GET['total'] ?? 0);
        $ini = (int) ($_GET['ini'] ?? 0);
        if (!in_array($col, ANEXO_COLECOES, true) || !preg_match('/^[\w-]{1,60}$/', $reg) || !preg_match('/^[a-f0-9]{16,32}$/', $up)) erro('Envio inválido.');
        if (!in_array($ext, ANEXO_EXT, true)) erro('Tipo de arquivo não aceito (.' . $ext . ').');
        if ($total <= 0 || $total > ANEXO_MAX) erro('Arquivo muito grande (máximo 2 GB).');
        $ant = nuc_ler($pdo, $col, $reg);
        if ($ant ? !podeLer($u, $col, $reg, $ant) || !podeGravar($u, $col, $reg, $ant, $ant) : !podeGravar($u, $col, $reg, ['parceiro' => $u['email']], null)) erro('Sem permissão para anexar aqui.', 403);
        $dir = nuc_pasta($cfg, 'anexos');
        $tmp = $dir . '/tmp-' . $up . '-' . (int) $u['id'] . '.part';
        clearstatcache();
        $atual = is_file($tmp) ? filesize($tmp) : 0;
        if ($ini !== $atual) responder(['ok' => false, 'erro' => 'Fora de ordem', 'continuar' => $atual], 409);
        $pedaco = file_get_contents('php://input');
        if ($pedaco === false || strlen($pedaco) === 0 || strlen($pedaco) > ANEXO_PARTE + 1024) erro('Pedaço inválido.');
        if ($atual + strlen($pedaco) > $total) erro('Tamanho não confere.');
        file_put_contents($tmp, $pedaco, FILE_APPEND | LOCK_EX);
        $atual += strlen($pedaco);
        if ($atual < $total) responder(['ok' => true, 'recebido' => $atual]);
        $id = nuc_uid() . bin2hex(random_bytes(4));
        rename($tmp, $dir . '/' . $id . '.bin');
        foreach (glob($dir . '/tmp-*.part') ?: [] as $velho) if (filemtime($velho) < time() - 86400) @unlink($velho); // envios abandonados
        $mimes = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'heic' => 'image/heic',
            'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm', 'mkv' => 'video/x-matroska', 'avi' => 'video/x-msvideo', '3gp' => 'video/3gpp',
            'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'aac' => 'audio/aac', 'txt' => 'text/plain', 'srt' => 'text/plain', 'csv' => 'text/csv',
            'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        $mime = $mimes[$ext] ?? 'application/octet-stream';
        $em = agoraMs();
        $pdo->prepare('INSERT INTO anexos (id, colecao, registro, nome, mime, tamanho, por_email, em) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$id, $col, $reg, $nome, $mime, $total, minusculo($u['email']), $em]);
        registrar($pdo, (int) $u['id'], 'anexo', $col, $reg);
        responder(['ok' => true, 'anexo' => ['id' => $id, 'nome' => $nome, 'mime' => $mime, 'tamanho' => $total, 'por' => minusculo($u['email']), 'em' => $em]]);

    case 'anexo': // baixar ou assistir (com suporte a avançar o vídeo)
        $u = usuarioLogado($pdo);
        $st = $pdo->prepare('SELECT * FROM anexos WHERE id = ?');
        $st->execute([(string) ($_GET['id'] ?? '')]);
        $a = $st->fetch();
        if (!$a) erro('Arquivo não encontrado.', 404);
        $reg = nuc_ler($pdo, $a['colecao'], $a['registro']);
        if ($reg ? !podeLer($u, $a['colecao'], $a['registro'], $reg) : minusculo($u['email']) !== $a['por_email']) erro('Sem permissão.', 403);
        $arq = nuc_pasta($cfg, 'anexos') . '/' . $a['id'] . '.bin';
        if (!is_file($arq)) erro('Arquivo não encontrado no servidor.', 404);
        $tam = filesize($arq);
        $ini = 0; $fim = $tam - 1;
        if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'] ?? '', $m) && ($m[1] !== '' || $m[2] !== '')) {
            if ($m[1] === '') { $ini = max(0, $tam - (int) $m[2]); } else { $ini = (int) $m[1]; if ($m[2] !== '') $fim = min($fim, (int) $m[2]); }
            if ($ini > $fim || $ini >= $tam) { http_response_code(416); header('Content-Range: bytes */' . $tam); exit; }
            http_response_code(206);
            header("Content-Range: bytes $ini-$fim/$tam");
        }
        $inline = empty($_GET['baixar']) && preg_match('#^(image/(jpeg|png|webp|gif)|video/|audio/|application/pdf)#', $a['mime']);
        header('Content-Type: ' . $a['mime']);
        header('Accept-Ranges: bytes');
        header('Content-Length: ' . ($fim - $ini + 1));
        header('Cache-Control: private, max-age=3600');
        header("Content-Disposition: " . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($a['nome']));
        header("Content-Security-Policy: default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'");
        while (ob_get_level()) ob_end_clean();
        $f = fopen($arq, 'rb');
        fseek($f, $ini);
        $falta = $fim - $ini + 1;
        while ($falta > 0 && !feof($f)) { $buf = fread($f, (int) min(1048576, $falta)); echo $buf; $falta -= strlen($buf); flush(); }
        fclose($f);
        exit;

    case 'anexoApagar':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $b = corpo();
        $st = $pdo->prepare('SELECT * FROM anexos WHERE id = ?');
        $st->execute([(string) ($b['id'] ?? '')]);
        $a = $st->fetch();
        if (!$a) responder(['ok' => true]);
        if ($u['papel'] !== 'admin' && minusculo($u['email']) !== $a['por_email']) erro('Só quem enviou (ou a administração) pode apagar este arquivo.', 403);
        @unlink(nuc_pasta($cfg, 'anexos') . '/' . $a['id'] . '.bin');
        $pdo->prepare('DELETE FROM anexos WHERE id = ?')->execute([$a['id']]);
        registrar($pdo, (int) $u['id'], 'anexo_apagar', $a['colecao'], $a['registro']);
        responder(['ok' => true]);

    case 'rtc': // sinalização das chamadas: o áudio e o vídeo vão direto entre os navegadores
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $b = corpo();
        $agora = agoraMs();
        $eu = minusculo($u['email']);
        $ch = (string) ($b['chamada'] ?? '');
        if ($ch === '' || strlen($ch) > 190 || !canalPermitido($u, $ch)) erro('Chamada não permitida.', 403);
        $op = (string) ($b['op'] ?? 'ping');
        $pdo->prepare('DELETE FROM rtc_participantes WHERE visto < ?')->execute([$agora - 60000]);
        $pdo->prepare('DELETE FROM rtc_sinais WHERE em < ?')->execute([$agora - 120000]);
        if ($op === 'sair') {
            $pdo->prepare('DELETE FROM rtc_participantes WHERE chamada = ? AND email = ?')->execute([$ch, $eu]);
            $pdo->prepare('DELETE FROM rtc_sinais WHERE chamada = ? AND (para = ? OR de = ?)')->execute([$ch, $eu, $eu]);
            responder(['ok' => true]);
        }
        $st = $pdo->prepare('SELECT email FROM rtc_participantes WHERE chamada = ? AND visto > ?');
        $st->execute([$ch, $agora - 20000]);
        $antes = $st->fetchAll(PDO::FETCH_COLUMN);
        $pdo->prepare('DELETE FROM rtc_participantes WHERE chamada = ? AND email = ?')->execute([$ch, $eu]);
        $pdo->prepare('INSERT INTO rtc_participantes (chamada, email, nome, visto) VALUES (?,?,?,?)')->execute([$ch, $eu, $u['nome'], $agora]);
        if ($op === 'entrar') {
            $pdo->prepare('DELETE FROM rtc_sinais WHERE chamada = ? AND para = ?')->execute([$ch, $eu]); // restos de uma entrada anterior
            if (preg_match('/^dm:([^|]+)\|([^|]+)$/', $ch, $m) && !in_array($outro = ($m[1] === $eu ? $m[2] : $m[1]), $antes, true)) {
                $quer = $b['video'] ?? false ? 'chamada de vídeo' : 'chamada de voz';
                depois(fn() => nuc_push($pdo, [$outro], 'msg', '📞 ' . $u['nome'] . ' está te ligando', 'Toque para atender a ' . $quer . ' no escritório virtual', '#escritorio', 'liga|' . $ch . '|' . intdiv($agora, 60000), 'high'));
            }
        }
        $ins = $pdo->prepare('INSERT INTO rtc_sinais (chamada, de, para, tipo, dados, em) VALUES (?,?,?,?,?,?)');
        foreach (array_slice((array) ($b['sinais'] ?? []), 0, 60) as $sg) {
            $para = minusculo((string) ($sg['para'] ?? ''));
            $tipo = (string) ($sg['tipo'] ?? '');
            $dados = json_encode($sg['dados'] ?? null, JSON_UNESCAPED_UNICODE);
            if ($para === $eu || !in_array($para, $antes, true) || !in_array($tipo, ['oferta', 'resposta', 'ice', 'tchau'], true) || strlen($dados) > 100000) continue;
            $ins->execute([$ch, $eu, $para, $tipo, $dados, $agora]);
        }
        $st = $pdo->prepare('SELECT id, de, tipo, dados FROM rtc_sinais WHERE chamada = ? AND para = ? ORDER BY id');
        $st->execute([$ch, $eu]);
        $sinais = [];
        $ids = [];
        foreach ($st->fetchAll() as $r) { $ids[] = (int) $r['id']; $sinais[] = ['de' => $r['de'], 'tipo' => $r['tipo'], 'dados' => json_decode((string) $r['dados'], true)]; }
        if ($ids) $pdo->exec('DELETE FROM rtc_sinais WHERE id IN (' . implode(',', $ids) . ')');
        $st = $pdo->prepare('SELECT email, nome FROM rtc_participantes WHERE chamada = ? AND visto > ?');
        $st->execute([$ch, $agora - 20000]);
        responder(['ok' => true, 'agora' => $agora, 'participantes' => $st->fetchAll(), 'sinais' => $sinais]);

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

    case 'push':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $b = corpo();
        $eu = minusculo($u['email']);
        nuc_push_tabelas($pdo);
        $op = (string) ($b['op'] ?? 'estado');
        $ep = (string) ($b['endpoint'] ?? ($b['sub']['endpoint'] ?? ''));
        if ($op === 'estado') {
            $ok = function_exists('openssl_pkey_derive') && function_exists('curl_init');
            $r = ['ok' => true, 'suportado' => $ok, 'pub' => $ok ? nuc_vapid($pdo)['pub'] : ''];
            if ($ep !== '') {
                $st = $pdo->prepare('SELECT prefs FROM push_assinaturas WHERE eh = ? AND email = ?');
                $st->execute([hash('sha256', $ep), $eu]);
                $p = $st->fetchColumn();
                $r['assinado'] = $p !== false;
                $r['prefs'] = $p ? json_decode((string) $p, true) : null;
            }
            if ($u['papel'] === 'admin') {
                $s = segredos($pdo);
                if (empty($s['cronChave'])) { $s['cronChave'] = bin2hex(random_bytes(16)); nuc_gravar($pdo, 'config', 'segredos', $s, (int) $u['id']); }
                $r['cron'] = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/api.php?acao=cron&k=' . $s['cronChave'];
                $r['aparelhos'] = (int) $pdo->query('SELECT COUNT(*) FROM push_assinaturas')->fetchColumn();
            }
            responder($r);
        }
        if ($op === 'assinar') {
            $k = $b['sub']['keys'] ?? [];
            if (!preg_match('#^https://[^\s]+$#', $ep) || strlen($ep) > 1000 || empty($k['p256dh']) || empty($k['auth'])) erro('Assinatura inválida.');
            if (strlen(nuc_b64ud((string) $k['p256dh'])) !== 65 || strlen(nuc_b64ud((string) $k['auth'])) < 16) erro('Chaves do aparelho inválidas.');
            $prefs = [];
            foreach (['msg', 'tarefa', 'prazo', 'meta', 'resumo', 'portal', 'conquista'] as $t) $prefs[$t] = !isset($b['prefs'][$t]) || !empty($b['prefs'][$t]);
            $pdo->prepare('DELETE FROM push_assinaturas WHERE eh = ?')->execute([hash('sha256', $ep)]);
            $pdo->prepare('INSERT INTO push_assinaturas (eh, email, endpoint, p256dh, auth, prefs, aparelho, criado_em) VALUES (?,?,?,?,?,?,?,?)')
                ->execute([hash('sha256', $ep), $eu, $ep, (string) $k['p256dh'], (string) $k['auth'], json_encode($prefs), mb_substr((string) ($b['aparelho'] ?? ''), 0, 120), agoraMs()]);
            responder(['ok' => true, 'prefs' => $prefs]);
        }
        if ($op === 'prefs') {
            $prefs = [];
            foreach (['msg', 'tarefa', 'prazo', 'meta', 'resumo', 'portal', 'conquista'] as $t) $prefs[$t] = !empty($b['prefs'][$t]);
            $pdo->prepare('UPDATE push_assinaturas SET prefs = ? WHERE eh = ? AND email = ?')->execute([json_encode($prefs), hash('sha256', $ep), $eu]);
            responder(['ok' => true, 'prefs' => $prefs]);
        }
        if ($op === 'remover') {
            $pdo->prepare('DELETE FROM push_assinaturas WHERE eh = ? AND email = ?')->execute([hash('sha256', $ep), $eu]);
            responder(['ok' => true]);
        }
        if ($op === 'testar') {
            $n = nuc_push($pdo, [$eu], 'teste', '🔔 Teste de notificação', 'Está funcionando! Os avisos do escritório vão chegar aqui mesmo com o sistema fechado.', '#painel', null, 'high');
            responder(['ok' => true, 'enviados' => $n]);
        }
        erro('Operação inválida.');

    case 'avisar': // metas e ranking (detectados no painel): avisa a equipe uma única vez por chave
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        if (externo($u)) erro('Sem permissão.', 403);
        $b = corpo();
        $tipo = in_array($b['tipo'] ?? '', ['meta', 'ranking'], true) ? $b['tipo'] : '';
        $chave = (string) ($b['chave'] ?? '');
        if ($tipo === '' || strpos($chave, $tipo . ':') !== 0 || strlen($chave) > 150) erro('Aviso inválido.');
        $n = nuc_push($pdo, nuc_equipe($pdo), 'meta', mb_substr((string) ($b['titulo'] ?? ''), 0, 100), mb_substr((string) ($b['texto'] ?? ''), 0, 300), '#painel', $chave);
        responder(['ok' => true, 'enviados' => $n]);

    case 'cron': // tarefa agendada da hospedagem: curl "https://…/api.php?acao=cron&k=CHAVE"
        $s = segredos($pdo);
        if (empty($s['cronChave']) || !hash_equals((string) $s['cronChave'], (string) ($_GET['k'] ?? ''))) erro('Chave inválida.', 403);
        rotinaDiaria($pdo, $cfg);
        responder(['ok' => true] + nuc_avisos_periodicos($pdo, nuc_pasta($cfg, 'backups'), true));

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
        if (externo($u)) erro('Sem permissão.', 403);
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
        if (externo($u)) erro('Sem permissão.', 403);
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
        if (externo($u) && !($u['papel'] === 'editor' && (corpo()['modo'] ?? '') === 'conteudo')) erro('Sem permissão.', 403);
        $s = segredos($pdo);
        if (empty($s['anthropicKey'])) erro('Configure a chave da IA (Claude) em Configurações → Integrações.');
        $b = corpo();
        $pedido = trim(mb_substr((string) ($b['pedido'] ?? ''), 0, 20000));
        $contexto = trim(mb_substr((string) ($b['contexto'] ?? ''), 0, 60000));
        if ($pedido === '') erro('Descreva o que deseja.');
        @set_time_limit(300);
        $sistema = 'Você é um advogado brasileiro experiente que redige peças processuais e documentos jurídicos em português do Brasil, '
            . 'com linguagem técnica, clara e objetiva, fundamentação legal e jurisprudencial pertinente e estrutura completa (endereçamento, qualificação, fatos, fundamentos, pedidos, valor da causa quando couber, fecho). '
            . 'Use somente os dados fornecidos no contexto; quando faltar alguma informação, deixe um marcador entre colchetes, por exemplo [NÚMERO DO NB]. '
            . 'Não invente números de processos, julgados ou dados pessoais. Entregue apenas o texto da peça, sem comentários antes ou depois. '
            . 'Use parágrafos separados por linha em branco e títulos em letras maiúsculas.';
        if (($b['modo'] ?? '') === 'conteudo') {
            $sistema = 'Você é roteirista de conteúdo orgânico (TikTok, Instagram Reels, YouTube Shorts) para escritórios de advocacia no Brasil. '
                . 'Escreva em português do Brasil, linguagem simples e direta, frases curtas, para leigos. '
                . 'Respeite o Provimento 205/2021 da OAB: conteúdo apenas informativo e educativo, sem promessa de resultado, sem citar preços ou honorários, sem oferecer serviços de forma mercantil e sem captação de clientela; não use expressões como "garantimos" ou "ganhe já". '
                . 'Não invente números de leis, valores ou prazos que você não tenha certeza; quando necessário, use [CONFERIR]. '
                . 'Entregue nesta estrutura, com os títulos em maiúsculas: GANCHO (primeiros 3 segundos), ROTEIRO (falas numeradas, com indicação de cortes e textos na tela entre colchetes), CHAMADA FINAL, LEGENDA, HASHTAGS (até 8). '
                . 'Duração alvo de 30 a 60 segundos para vídeos curtos.';
        }
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
