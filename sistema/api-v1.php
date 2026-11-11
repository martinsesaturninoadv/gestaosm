<?php
/*
 * API v1 do Sistema de Gestão — Martins & Saturnino
 *   /api/v1/...                       API REST (chave de API ou token OAuth no cabeçalho Authorization: Bearer …)
 *   /api/v1/webhooks/waspeed          eventos do WaSpeed (token secreto)
 *   /api/v1/mcp                       conector MCP do Claude (Streamable HTTP, sem estado, OAuth)
 *   /.well-known/oauth-*  /oauth/*    servidor de autorização OAuth 2.1 (PKCE) para o conector
 * As rotas chegam aqui pelo .htaccess (parâmetro r). Documentação: api-v1.yaml e docs/API-E-CONECTOR.md
 */
declare(strict_types=1);

$arqConfig = __DIR__ . '/config.php';
if (!is_file($arqConfig)) { http_response_code(503); header('Content-Type: application/json'); echo '{"ok":false,"erro":"Sistema não instalado."}'; exit; }
$cfg = require $arqConfig;
require __DIR__ . '/nucleo.php';
require __DIR__ . '/servico.php';

const V1_VERSAO = '1.0.0';
const V1_LIMITE_MIN = 120;              // requisições por minuto por chave/token
const V1_ACESSO_SEG = 3600;             // token de acesso do conector: 1 hora
const V1_RENOVACAO_SEG = 30 * 86400;    // renovação: 30 dias
const V1_REDIRECTS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
const V1_HOSTS_CIMD = ['claude.ai', 'www.claude.ai', 'claude.com', 'www.claude.com', 'anthropic.com', 'www.anthropic.com', 'api.anthropic.com'];

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true) && preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $_SERVER['HTTP_HOST'] ?? '');
$rota = trim((string) ($_GET['r'] ?? ''), '/');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$LOG = ['quem' => 'anônimo', 'auth' => '-', 'recurso' => null, 'inicio' => microtime(true)];
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function v1_base(): string
{
    global $https;
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir;
}
function v1_json(array $dados, int $status = 200, array $cab = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    foreach ($cab as $c) header($c);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function v1_erro(string $msg, int $status, array $extra = [], array $cab = []): void { v1_json(['ok' => false, 'erro' => $msg] + $extra, $status, $cab); }
function v1_corpo(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (trim($raw) === '') return [];
    $j = json_decode($raw, true);
    if (!is_array($j)) v1_erro('O corpo da requisição deve ser JSON (objeto).', 400);
    return $j;
}
function v1_cabecalho_auth(): string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower((string) $k) === 'authorization') $h = (string) $v;
    return trim($h);
}
function v1_bearer(): string { return preg_match('/^Bearer\s+(\S+)$/i', v1_cabecalho_auth(), $m) ? $m[1] : ''; }

/* ---------- conexão ---------- */
try { $pdo = nuc_pdo($cfg); } catch (Throwable $e) { v1_erro('Banco de dados indisponível.', 503); }
if (!$https && !$local) v1_erro('Use https:// para acessar a API.', 403);

/* log de cada chamada (LGPD): quem, quando, o quê. Não guarda dados pessoais da consulta (só os nomes dos parâmetros). */
register_shutdown_function(function () use ($pdo, $rota, $metodo) {
    global $LOG;
    if (!sv_migrado($pdo) || $rota === '' || strpos($rota, 'wk/') === 0) return;
    $q = array_keys($_GET);
    $q = array_values(array_diff($q, ['r']));
    $r = '/' . ($rota === 'mcp' || strpos($rota, 'oauth/') === 0 ? $rota : 'api/v1/' . $rota) . ($q ? '?' . implode('&', array_map(fn($k) => $k . '=…', $q)) : '');
    try {
        $pdo->prepare('INSERT INTO api_log (em, quem, auth, ip, metodo, rota, status, recurso, ms) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([nuc_ms(), mb_substr((string) $LOG['quem'], 0, 190), $LOG['auth'], $_SERVER['REMOTE_ADDR'] ?? null, $metodo, mb_substr($r, 0, 255), http_response_code() ?: 200,
                $LOG['recurso'] ? mb_substr((string) $LOG['recurso'], 0, 80) : null, (int) round((microtime(true) - $LOG['inicio']) * 1000)]);
    } catch (Throwable $e) { /* o log nunca derruba a resposta */ }
});

/* ---------- autenticação: chave de API (gsm_…) ou token OAuth do conector (gat_…) ---------- */
function v1_principal(PDO $pdo): ?array
{
    $t = v1_bearer();
    if ($t === '') return null;
    $h = hash('sha256', $t);
    if (strpos($t, 'gsm_') === 0) {
        $st = $pdo->prepare('SELECT * FROM api_chaves WHERE hash = ? AND revogada_em IS NULL');
        $st->execute([$h]);
        $k = $st->fetch();
        if (!$k) return null;
        if ((int) ($k['ultimo_uso'] ?? 0) < nuc_ms() - 60000) $pdo->prepare('UPDATE api_chaves SET ultimo_uso = ? WHERE id = ?')->execute([nuc_ms(), $k['id']]);
        return ['tipo' => 'chave', 'id' => 'k' . $k['id'], 'nome' => 'chave: ' . $k['nome'], 'uid' => null, 'membro' => '', 'escopos' => array_filter(explode(' ', (string) $k['escopos']))];
    }
    if (strpos($t, 'gat_') === 0) {
        $st = $pdo->prepare("SELECT * FROM oauth_tokens WHERE hash = ? AND tipo = 'acesso' AND revogado = 0 AND expira > ?");
        $st->execute([$h, nuc_ms()]);
        $tk = $st->fetch();
        if (!$tk) return null;
        $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
        $st->execute([$tk['usuario_id']]);
        $u = $st->fetch();
        if (!$u || (int) $u['ativo'] !== 1 || $u['papel'] !== 'admin') return null;
        return ['tipo' => 'oauth', 'id' => 'u' . $u['id'], 'nome' => $u['nome'] . ' (via Claude)', 'uid' => (int) $u['id'], 'email' => $u['email'],
            'membro' => sv_membro_por_email($pdo, (string) $u['email']), 'escopos' => SV_ESCOPOS];
    }
    return null;
}
function v1_exigir(array $p, string $escopo): void
{
    if (!in_array($escopo, $p['escopos'], true)) throw new SvErro('Esta chave não tem permissão para "' . $escopo . '".', 403);
}
function v1_ativa(PDO $pdo): void
{
    if (!sv_migrado($pdo)) v1_erro('A API ainda não foi ativada: aplique a migração em Configurações → API e conector.', 503);
}

/* =========================================================
   ROTAS
   ========================================================= */
try {
    if ($rota === '' || $rota === 'status') v1_json(['ok' => true, 'servico' => 'Sistema de Gestão — API', 'versao' => V1_VERSAO, 'ativa' => sv_migrado($pdo),
        'documentacao' => v1_base() . '/api/v1/openapi.yaml', 'mcp' => v1_base() . '/api/v1/mcp']);
    if ($rota === 'openapi.yaml') {
        header('Content-Type: application/yaml; charset=utf-8');
        readfile(__DIR__ . '/api-v1.yaml');
        exit;
    }
    if (strpos($rota, 'wk/') === 0) oa_metadados($pdo, $rota);
    if (strpos($rota, 'oauth/') === 0) { v1_ativa($pdo); oa_rota($pdo, substr($rota, 6)); }
    if ($rota === 'webhooks/waspeed') {
        v1_ativa($pdo);
        try { wsp_rota($pdo); }
        catch (Throwable $e) {
            $det = 'Falha interna: ' . get_class($e) . ': ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')';
            error_log('webhook waspeed: ' . $det);
            try { $pdo->prepare('INSERT INTO webhook_log (em, origem, ip, evento, status, detalhe, lead_id, payload) VALUES (?,?,?,?,?,?,?,?)')
                ->execute([nuc_ms(), 'waspeed', $_SERVER['REMOTE_ADDR'] ?? '', null, 'erro', mb_substr($det, 0, 500), null, mb_substr((string) file_get_contents('php://input'), 0, 262144)]); } catch (Throwable $e2) { error_log('webhook waspeed (log): ' . $e2->getMessage()); }
            v1_erro($det, 500);
        }
    }
    if ($rota === 'mcp') { v1_ativa($pdo); mcp_rota($pdo); }

    v1_ativa($pdo);
    $p = v1_principal($pdo);
    if (!$p) v1_erro('Autenticação necessária: envie Authorization: Bearer <chave de API>.', 401, [], ['WWW-Authenticate: Bearer realm="api"']);
    $LOG['quem'] = $p['nome'];
    $LOG['auth'] = $p['tipo'];
    if (!sv_limite($pdo, 'p:' . $p['id'], V1_LIMITE_MIN, 60)) v1_erro('Limite de ' . V1_LIMITE_MIN . ' requisições por minuto atingido. Tente de novo em instantes.', 429, [], ['Retry-After: 60']);
    rest_rota($pdo, $p, $rota, $metodo);
} catch (SvErro $e) {
    v1_erro($e->getMessage(), $e->status, $e->extra);
} catch (Throwable $e) {
    error_log('api-v1: ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine());
    v1_erro('Erro interno. O problema foi registrado.', 500);
}

/* ---------- API REST ---------- */
function rest_rota(PDO $pdo, array $p, string $rota, string $m): void
{
    global $LOG;
    $seg = explode('/', $rota);
    $id = $seg[1] ?? '';
    if ($id !== '') { if (!preg_match('/^[\w-]{1,60}$/', $id)) throw new SvErro('Identificador inválido.', 400); $LOG['recurso'] = $seg[0] . ':' . $id; }
    $n = count($seg);
    $sem = fn() => v1_erro('Método não permitido nesta rota.', 405);
    switch ($seg[0]) {
        case 'clientes':
            if ($n === 1) {
                if ($m === 'GET') { v1_exigir($p, 'clientes:ler'); v1_json(['ok' => true] + sv_buscar_clientes($pdo, $_GET)); }
                if ($m === 'POST') { v1_exigir($p, 'clientes:gravar'); $r = sv_cadastrar_cliente($pdo, v1_corpo(), $p); $LOG['recurso'] = 'clientes:' . $r['cliente']['id']; v1_json(['ok' => true] + $r, 201); }
                $sem();
            }
            if ($n === 2) {
                if ($m === 'GET') { v1_exigir($p, 'clientes:ler'); v1_json(['ok' => true, 'cliente' => sv_cliente_api($pdo, sv_cliente($pdo, $id))]); }
                if ($m === 'PATCH') { v1_exigir($p, 'clientes:gravar'); v1_json(['ok' => true] + sv_atualizar_cliente($pdo, $id, v1_corpo(), $p)); }
                $sem();
            }
            if ($n === 3 && $seg[2] === 'documentos') {
                if ($m === 'POST') { v1_exigir($p, 'clientes:gravar'); v1_json(['ok' => true] + sv_anexar_documento($pdo, $id, v1_corpo(), $p), 201); }
                if ($m === 'GET') { v1_exigir($p, 'clientes:ler'); v1_json(['ok' => true, 'documentos' => array_values((array) (sv_cliente($pdo, $id)['docsGerados'] ?? []))]); }
                $sem();
            }
            break;
        case 'leads':
            if ($n === 1) {
                if ($m === 'GET') { v1_exigir($p, 'leads:ler'); v1_json(['ok' => true] + sv_buscar_leads($pdo, $_GET)); }
                if ($m === 'POST') { v1_exigir($p, 'leads:gravar'); $r = sv_registrar_lead($pdo, v1_corpo(), $p); $LOG['recurso'] = 'leads:' . $r['lead']['id']; v1_json(['ok' => true] + $r, $r['criado'] ? 201 : 200); }
                $sem();
            }
            if ($n === 2) { if ($m === 'GET') { v1_exigir($p, 'leads:ler'); v1_json(['ok' => true, 'lead' => sv_lead_api($pdo, sv_lead($pdo, $id))]); } $sem(); }
            if ($n === 3 && $seg[2] === 'etapa') { if ($m === 'PATCH' || $m === 'POST') { v1_exigir($p, 'leads:gravar'); v1_json(['ok' => true] + sv_mudar_etapa($pdo, $id, v1_corpo(), $p)); } $sem(); }
            if ($n === 3 && $seg[2] === 'interacoes') { if ($m === 'POST') { v1_exigir($p, 'leads:gravar'); v1_json(['ok' => true] + sv_registrar_interacao($pdo, $id, v1_corpo(), $p), 201); } $sem(); }
            if ($n === 3 && $seg[2] === 'converter') {
                if ($m === 'POST') { v1_exigir($p, 'leads:gravar'); v1_exigir($p, 'clientes:gravar'); v1_json(['ok' => true] + sv_converter_lead($pdo, $id, v1_corpo(), $p), 201); }
                $sem();
            }
            break;
        case 'funil':
            if ($rota === 'funil/etapas' && $m === 'GET') { v1_exigir($p, 'leads:ler'); v1_json(['ok' => true, 'etapas' => sv_etapas($pdo)]); }
            break;
        case 'anuncios':
            if ($n === 1) {
                if ($m === 'GET') { v1_exigir($p, 'anuncios:ler'); v1_json(['ok' => true, 'itens' => array_map('sv_anuncio_api', sv_anuncios($pdo))]); }
                if ($m === 'POST') { v1_exigir($p, 'anuncios:gravar'); [$a, $novo] = sv_salvar_anuncio($pdo, v1_corpo(), $p); v1_json(['ok' => true, 'anuncio' => $a, 'criado' => $novo], $novo ? 201 : 200); }
                $sem();
            }
            break;
        case 'relatorios':
            if ($rota === 'relatorios/anuncios' && $m === 'GET') { v1_exigir($p, 'relatorios:ler'); v1_json(['ok' => true] + sv_relatorio_anuncios($pdo, $_GET)); }
            break;
    }
    v1_erro('Rota não encontrada: /api/v1/' . $rota, 404);
}

/* ---------- webhook do WaSpeed ---------- */
function wsp_rota(PDO $pdo): void
{
    global $LOG, $metodo;
    $LOG['quem'] = 'WaSpeed (webhook)';
    $LOG['auth'] = 'webhook';
    if ($metodo === 'GET') v1_json(['ok' => true, 'mensagem' => 'Endereço do webhook ativo. O WaSpeed deve enviar POST com o token.']);
    if ($metodo !== 'POST') v1_erro('Use POST.', 405);
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!sv_limite($pdo, 'wh:' . $ip, 600, 60)) v1_erro('Muitas requisições.', 429, [], ['Retry-After: 60']);
    $tok = $_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? $_SERVER['HTTP_X_WASPEED_TOKEN'] ?? $_SERVER['HTTP_X_TOKEN'] ?? '';
    if ($tok === '') $tok = v1_bearer();
    if ($tok === '') $tok = (string) ($_GET['token'] ?? '');
    $seg = nuc_config($pdo, 'segredos');
    $log = $pdo->prepare('INSERT INTO webhook_log (em, origem, ip, evento, status, detalhe, lead_id, payload) VALUES (?,?,?,?,?,?,?,?)');
    if (empty($seg['waspeedTokenHash']) || $tok === '' || !hash_equals((string) $seg['waspeedTokenHash'], hash('sha256', $tok))) {
        $log->execute([nuc_ms(), 'waspeed', $ip, null, 'nao_autorizado', empty($seg['waspeedTokenHash']) ? 'Token ainda não gerado no sistema' : 'Token ausente ou inválido', null, null]);
        v1_erro('Token do webhook inválido.', 401);
    }
    $raw = (string) file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) { parse_str($raw, $form); $payload = $form ?: null; }
    if (!is_array($payload)) {
        $log->execute([nuc_ms(), 'waspeed', $ip, null, 'erro', 'Corpo não é JSON', null, mb_substr($raw, 0, 262144)]);
        v1_erro('Corpo inválido: envie JSON.', 400);
    }
    // alguns envios trazem vários eventos numa lista
    $eventos = array_is_list_v1($payload) ? $payload : [$payload];
    $res = [];
    foreach (array_slice($eventos, 0, 50) as $ev) {
        if (!is_array($ev)) continue;
        try { $r = wsp_processar($pdo, $ev); }
        catch (SvErro $e) { $r = ['status' => 'erro', 'detalhe' => $e->getMessage(), 'lead_id' => null, 'extraido' => null]; }
        catch (Throwable $e) { // qualquer falha fica registrada em "Eventos recebidos" para conferência
            error_log('webhook waspeed: ' . get_class($e) . ': ' . $e->getMessage() . ' em ' . basename($e->getFile()) . ':' . $e->getLine());
            $r = ['status' => 'erro', 'detalhe' => 'Falha interna: ' . get_class($e) . ': ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')', 'lead_id' => null, 'extraido' => null];
        }
        $log->execute([nuc_ms(), 'waspeed', $ip, mb_substr((string) ($r['extraido']['evento'] ?? ''), 0, 80) ?: null, $r['status'], mb_substr((string) $r['detalhe'], 0, 500), $r['lead_id'] ?? null,
            mb_substr(json_encode($ev, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $raw, 0, 262144)]);
        $res[] = ['status' => $r['status'], 'detalhe' => $r['detalhe'], 'lead_id' => $r['lead_id'] ?? null];
    }
    $LOG['recurso'] = 'leads:' . ($res[0]['lead_id'] ?? '-');
    v1_json(['ok' => true, 'resultados' => $res]);
}
function array_is_list_v1(array $a): bool { return $a === [] || array_keys($a) === range(0, count($a) - 1); }

/* =========================================================
   OAUTH 2.1 (para o conector do Claude): metadados, registro de cliente, autorização com login, token
   ========================================================= */
function oa_recurso(): string { return v1_base() . '/api/v1/mcp'; }
function oa_metadados(PDO $pdo, string $rota): void
{
    $b = v1_base();
    if ($rota === 'wk/prm') v1_json(['resource' => oa_recurso(), 'authorization_servers' => [$b], 'scopes_supported' => ['sistema'], 'bearer_methods_supported' => ['header'],
        'resource_name' => 'Sistema de Gestão — ' . (nuc_config($pdo, 'escritorio')['nome'] ?? 'Escritório')]);
    if ($rota === 'wk/as') v1_json(['issuer' => $b, 'authorization_endpoint' => "$b/oauth/authorize", 'token_endpoint' => "$b/oauth/token", 'registration_endpoint' => "$b/oauth/register",
        'revocation_endpoint' => "$b/oauth/revoke", 'response_types_supported' => ['code'], 'grant_types_supported' => ['authorization_code', 'refresh_token'],
        'code_challenge_methods_supported' => ['S256'], 'token_endpoint_auth_methods_supported' => ['none', 'client_secret_post', 'client_secret_basic'],
        'scopes_supported' => ['sistema'], 'client_id_metadata_document_supported' => true, 'authorization_response_iss_parameter_supported' => true]);
    v1_erro('Não encontrado.', 404);
}
function oa_erro(string $codigo, string $desc, int $status = 400): void { v1_json(['error' => $codigo, 'error_description' => $desc], $status); }
function oa_rota(PDO $pdo, string $acao): void
{
    global $LOG;
    $LOG['auth'] = 'oauth';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($acao === 'register') oa_registrar($pdo, $ip);
    if ($acao === 'authorize') oa_autorizar($pdo, $ip);
    if ($acao === 'token') oa_token($pdo);
    if ($acao === 'revoke') {
        $t = (string) ($_POST['token'] ?? '');
        if ($t !== '') {
            $st = $pdo->prepare('SELECT familia FROM oauth_tokens WHERE hash = ?');
            $st->execute([hash('sha256', $t)]);
            if (($f = $st->fetchColumn()) !== false) $pdo->prepare('UPDATE oauth_tokens SET revogado = 1 WHERE familia = ?')->execute([$f]);
        }
        v1_json([]);
    }
    v1_erro('Não encontrado.', 404);
}
/* Registro automático (RFC 7591): só aceita o endereço de retorno do Claude */
function oa_registrar(PDO $pdo, string $ip): void
{
    global $metodo;
    if ($metodo !== 'POST') oa_erro('invalid_request', 'Use POST.', 405);
    if (!sv_limite($pdo, 'reg:' . $ip, 20, 3600)) oa_erro('invalid_request', 'Muitos registros. Tente mais tarde.', 429);
    $b = v1_corpo();
    $uris = array_values(array_filter((array) ($b['redirect_uris'] ?? []), 'is_string'));
    if (!$uris) oa_erro('invalid_redirect_uri', 'Informe redirect_uris.');
    foreach ($uris as $u) if (!in_array($u, V1_REDIRECTS, true)) oa_erro('invalid_redirect_uri', 'Endereço de retorno não permitido. Este servidor só aceita o conector do Claude.');
    $metodoAuth = in_array($b['token_endpoint_auth_method'] ?? 'none', ['none', 'client_secret_post', 'client_secret_basic'], true) ? ($b['token_endpoint_auth_method'] ?? 'none') : 'none';
    $id = 'cl_' . bin2hex(random_bytes(16));
    $segredo = $metodoAuth === 'none' ? null : 'cs_' . bin2hex(random_bytes(24));
    $nome = sv_texto($b['client_name'] ?? 'Claude', 190) ?: 'Claude';
    $pdo->prepare('INSERT INTO oauth_clientes (client_id, nome, redirect_uris, segredo_hash, origem, criado_em) VALUES (?,?,?,?,?,?)')
        ->execute([$id, $nome, json_encode($uris), $segredo ? hash('sha256', $segredo) : null, 'dcr', nuc_ms()]);
    $r = ['client_id' => $id, 'client_id_issued_at' => time(), 'client_name' => $nome, 'redirect_uris' => $uris, 'grant_types' => ['authorization_code', 'refresh_token'],
        'response_types' => ['code'], 'token_endpoint_auth_method' => $metodoAuth];
    if ($segredo) $r += ['client_secret' => $segredo, 'client_secret_expires_at' => 0];
    v1_json($r, 201);
}
/* cliente do OAuth: registrado aqui (DCR) ou documento de identidade publicado pelo Claude (CIMD, client_id é uma URL https) */
function oa_cliente(PDO $pdo, string $id): ?array
{
    $st = $pdo->prepare('SELECT * FROM oauth_clientes WHERE client_id = ?');
    $st->execute([$id]);
    $c = $st->fetch();
    if ($c && ($c['origem'] !== 'cimd' || (int) $c['criado_em'] > nuc_ms() - 86400000)) return $c + ['uris' => json_decode((string) $c['redirect_uris'], true) ?: []];
    if (!preg_match('#^https://([^/:]+)/#', $id, $m) || !in_array(strtolower($m[1]), V1_HOSTS_CIMD, true) || !function_exists('curl_init')) return $c ? $c + ['uris' => json_decode((string) $c['redirect_uris'], true) ?: []] : null;
    $ch = curl_init($id);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => 'GestaoEscritorio-OAuth/1.0', CURLOPT_MAXFILESIZE => 65536]);
    $raw = curl_exec($ch);
    $cod = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $doc = $cod === 200 ? json_decode((string) $raw, true) : null;
    if (!is_array($doc) || ($doc['client_id'] ?? '') !== $id) {
        // O claude.ai às vezes recusa leituras automáticas vindas de servidores. Como o client_id é do próprio Claude
        // e o retorno só pode ir para o endereço oficial dele (V1_REDIRECTS), aceitamos sem o documento.
        error_log('oauth: documento do cliente ' . $id . ' indisponível (HTTP ' . $cod . '); usando o retorno oficial do Claude');
        if (!in_array(strtolower($m[1]), ['claude.ai', 'www.claude.ai', 'claude.com', 'www.claude.com'], true)) return null;
        $pdo->prepare('DELETE FROM oauth_clientes WHERE client_id = ?')->execute([$id]);
        $pdo->prepare('INSERT INTO oauth_clientes (client_id, nome, redirect_uris, segredo_hash, origem, criado_em) VALUES (?,?,?,?,?,?)')
            ->execute([$id, 'Claude', json_encode(V1_REDIRECTS), null, 'cimd', nuc_ms()]); // guarda por 24 h (o token não espera uma nova tentativa)
        return ['client_id' => $id, 'nome' => 'Claude', 'segredo_hash' => null, 'origem' => 'cimd', 'uris' => V1_REDIRECTS];
    }
    $uris = array_values(array_filter((array) ($doc['redirect_uris'] ?? []), 'is_string'));
    $pdo->prepare('DELETE FROM oauth_clientes WHERE client_id = ?')->execute([$id]);
    $pdo->prepare('INSERT INTO oauth_clientes (client_id, nome, redirect_uris, segredo_hash, origem, criado_em) VALUES (?,?,?,?,?,?)')
        ->execute([$id, sv_texto($doc['client_name'] ?? 'Claude', 190) ?: 'Claude', json_encode($uris), null, 'cimd', nuc_ms()]);
    return ['client_id' => $id, 'nome' => $doc['client_name'] ?? 'Claude', 'segredo_hash' => null, 'origem' => 'cimd', 'uris' => $uris];
}
function oa_pagina(string $titulo, string $corpo): void
{
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai https://claude.com; frame-ancestors 'none'");
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . nuc_h($titulo) . '</title>'
        . '<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1d2b;color:#1b2733;display:grid;place-items:center;min-height:100vh;padding:16px}'
        . '.c{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,.35)}h1{font-size:20px;margin:0 0 6px}p{color:#4a5866;font-size:14px;line-height:1.5}'
        . 'label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cfd6dd;border-radius:9px;font-size:15px}'
        . 'button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:9px;background:#1B3A5C;color:#fff;font-size:15px;font-weight:700;cursor:pointer}button.sec{background:#e8ecf0;color:#1b2733;margin-top:8px}'
        . '.erro{background:#fde8e8;color:#8a1f1f;padding:10px;border-radius:8px;font-size:13px}.logo{width:44px;height:44px;border-radius:10px;background:#1B3A5C;color:#C8A84B;display:grid;place-items:center;font-weight:800;margin-bottom:12px}'
        . 'ul{font-size:14px;color:#33414e;padding-left:18px}</style></head><body><div class="c"><div class="logo">MS</div>' . $corpo . '</div></body></html>';
    exit;
}
function oa_autorizar(PDO $pdo, string $ip): void
{
    global $https, $metodo;
    $q = $metodo === 'POST' ? $_POST : $_GET;
    $cid = (string) ($q['client_id'] ?? '');
    $redir = (string) ($q['redirect_uri'] ?? '');
    $cli = $cid !== '' ? oa_cliente($pdo, $cid) : null;
    if (!$cli || !in_array($redir, $cli['uris'], true) || !in_array($redir, V1_REDIRECTS, true))
        oa_pagina('Pedido inválido', '<h1>Pedido de acesso inválido</h1><p>O aplicativo que pediu acesso não foi reconhecido ou o endereço de retorno não confere. Feche esta janela e tente adicionar o conector de novo no Claude.</p>');
    $state = (string) ($q['state'] ?? '');
    $volta = function (array $ps) use ($redir, $state) {
        $ps += ['state' => $state, 'iss' => v1_base()];
        if ($state === '') unset($ps['state']);
        header('Location: ' . $redir . (strpos($redir, '?') === false ? '?' : '&') . http_build_query($ps));
        http_response_code(302);
        exit;
    };
    if (($q['response_type'] ?? '') !== 'code') $volta(['error' => 'unsupported_response_type']);
    $desafio = (string) ($q['code_challenge'] ?? '');
    if (($q['code_challenge_method'] ?? '') !== 'S256' || !preg_match('/^[A-Za-z0-9_-]{43,128}$/', $desafio)) $volta(['error' => 'invalid_request', 'error_description' => 'PKCE S256 obrigatório']);
    $rec = (string) ($q['resource'] ?? '');
    if ($rec !== '' && !in_array(rtrim($rec, '/'), [oa_recurso(), v1_base()], true)) $volta(['error' => 'invalid_target']);
    session_name('gestao_oauth');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    $ocultos = '';
    foreach (['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as $k) if (isset($q[$k])) $ocultos .= '<input type="hidden" name="' . $k . '" value="' . nuc_h((string) $q[$k]) . '">';
    $ocultos .= '<input type="hidden" name="csrf" value="' . nuc_h($_SESSION['csrf']) . '">';
    $nomeCli = nuc_h((string) ($cli['nome'] ?: 'Claude'));
    $escritorio = nuc_h((string) (nuc_config($pdo, 'escritorio')['nome'] ?? 'Sistema de Gestão'));
    $erro = '';
    $passo = 'login';
    if ($metodo === 'POST') {
        if (!hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) $erro = 'A página expirou. Tente de novo.';
        elseif (($_POST['acao'] ?? '') === 'negar') $volta(['error' => 'access_denied']);
        elseif (($_POST['acao'] ?? '') === 'login') {
            if (!sv_limite($pdo, 'login:' . $ip, 10, 600)) $erro = 'Muitas tentativas. Aguarde 10 minutos.';
            else {
                $st = $pdo->prepare('SELECT * FROM usuarios WHERE email = ?');
                $st->execute([mb_strtolower(trim((string) ($_POST['email'] ?? '')))]);
                $u = $st->fetch();
                if (!$u || (int) $u['ativo'] !== 1 || !password_verify((string) ($_POST['senha'] ?? ''), $u['senha_hash'])) { sleep(1); $erro = 'E-mail ou senha incorretos.'; }
                elseif ($u['papel'] !== 'admin') $erro = 'Só administradoras podem autorizar o conector do Claude.';
                elseif (!empty($u['totp_secret']) && !totpValido((string) $u['totp_secret'], (string) ($_POST['codigo'] ?? ''))) { $erro = ($_POST['codigo'] ?? '') === '' ? '' : 'Código inválido.'; $passo = '2fa'; }
                else { session_regenerate_id(true); $_SESSION['oa_uid'] = (int) $u['id']; $_SESSION['oa_em'] = time(); $passo = 'consentir'; }
            }
        } elseif (($_POST['acao'] ?? '') === 'autorizar' && !empty($_SESSION['oa_uid']) && time() - (int) $_SESSION['oa_em'] < 900) {
            $st = $pdo->prepare("SELECT * FROM usuarios WHERE id = ? AND ativo = 1 AND papel = 'admin'");
            $st->execute([$_SESSION['oa_uid']]);
            $u = $st->fetch();
            if ($u) {
                $codigo = bin2hex(random_bytes(32));
                $pdo->prepare('INSERT INTO oauth_codigos (hash, client_id, usuario_id, redirect_uri, desafio, escopo, recurso, expira) VALUES (?,?,?,?,?,?,?,?)')
                    ->execute([hash('sha256', $codigo), $cid, (int) $u['id'], $redir, $desafio, 'sistema', $rec, nuc_ms() + 300000]);
                $pdo->prepare('INSERT INTO historico (quando, usuario_id, acao, colecao, registro_id, ip) VALUES (?,?,?,?,?,?)')->execute([nuc_ms(), (int) $u['id'], 'oauth_autorizou', 'oauth', mb_substr($cid, 0, 60), $ip]);
                unset($_SESSION['oa_uid']);
                $volta(['code' => $codigo]);
            }
            $erro = 'Acesso não permitido.';
        } else $erro = 'Entre de novo para autorizar.';
    }
    if ($passo === 'consentir') oa_pagina('Autorizar o Claude', '<h1>Autorizar o ' . $nomeCli . '?</h1><p>O conector vai acessar o <b>' . $escritorio . '</b> em seu nome para:</p>'
        . '<ul><li>buscar, cadastrar e atualizar clientes e os links dos documentos;</li><li>registrar leads, interações e mudar as etapas do funil;</li><li>consultar e cadastrar anúncios e o relatório por anúncio.</li></ul>'
        . '<p>Tudo fica registrado no log com o seu nome. Você pode revogar em Configurações → API e conector.</p>'
        . '<form method="post">' . $ocultos . '<button name="acao" value="autorizar">Autorizar</button><button class="sec" name="acao" value="negar">Cancelar</button></form>');
    $email = nuc_h((string) ($_POST['email'] ?? ''));
    $doisF = $passo === '2fa';
    oa_pagina('Entrar para autorizar', '<h1>Conectar o ' . $nomeCli . '</h1><p>Entre com a sua conta de <b>administradora</b> do ' . $escritorio . ' para autorizar o conector.</p>'
        . ($erro !== '' ? '<div class="erro">' . nuc_h($erro) . '</div>' : '')
        . '<form method="post">' . $ocultos . '<input type="hidden" name="acao" value="login">'
        . '<label>E-mail</label><input name="email" type="email" autocomplete="username" required value="' . $email . '">'
        . '<label>Senha</label><input name="senha" type="password" autocomplete="current-password" required>'
        . ($doisF ? '<label>Código do aplicativo autenticador</label><input name="codigo" inputmode="numeric" maxlength="6" autofocus required>' : '')
        . '<button>Entrar</button></form><form method="post">' . $ocultos . '<button class="sec" name="acao" value="negar">Cancelar</button></form>');
}
function oa_emitir(PDO $pdo, string $cid, int $uid, string $familia): array
{
    $acesso = 'gat_' . bin2hex(random_bytes(32));
    $renov = 'grt_' . bin2hex(random_bytes(32));
    $ins = $pdo->prepare('INSERT INTO oauth_tokens (hash, tipo, client_id, usuario_id, escopo, familia, expira, criado_em) VALUES (?,?,?,?,?,?,?,?)');
    $ins->execute([hash('sha256', $acesso), 'acesso', $cid, $uid, 'sistema', $familia, nuc_ms() + V1_ACESSO_SEG * 1000, nuc_ms()]);
    $ins->execute([hash('sha256', $renov), 'renovacao', $cid, $uid, 'sistema', $familia, nuc_ms() + V1_RENOVACAO_SEG * 1000, nuc_ms()]);
    return ['access_token' => $acesso, 'token_type' => 'Bearer', 'expires_in' => V1_ACESSO_SEG, 'refresh_token' => $renov, 'scope' => 'sistema'];
}
function oa_token(PDO $pdo): void
{
    global $metodo, $LOG;
    if ($metodo !== 'POST') oa_erro('invalid_request', 'Use POST.', 405);
    $cid = (string) ($_POST['client_id'] ?? '');
    $seg = (string) ($_POST['client_secret'] ?? '');
    if (preg_match('/^Basic\s+(.+)$/i', v1_cabecalho_auth(), $m)) { [$cid, $seg] = array_pad(explode(':', (string) base64_decode($m[1]), 2), 2, ''); $cid = urldecode($cid); $seg = urldecode($seg); }
    $cli = $cid !== '' ? oa_cliente($pdo, $cid) : null;
    if (!$cli) oa_erro('invalid_client', 'Cliente desconhecido.', 401);
    if (!empty($cli['segredo_hash']) && !hash_equals((string) $cli['segredo_hash'], hash('sha256', $seg))) oa_erro('invalid_client', 'Segredo do cliente inválido.', 401);
    $ativo = function (int $uid) use ($pdo): bool { $st = $pdo->prepare("SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1 AND papel = 'admin'"); $st->execute([$uid]); return (bool) $st->fetchColumn(); };
    $g = (string) ($_POST['grant_type'] ?? '');
    if ($g === 'authorization_code') {
        $st = $pdo->prepare('SELECT * FROM oauth_codigos WHERE hash = ?');
        $st->execute([hash('sha256', (string) ($_POST['code'] ?? ''))]);
        $c = $st->fetch();
        if (!$c || $c['client_id'] !== $cid) oa_erro('invalid_grant', 'Código inválido.');
        if ((int) $c['usado'] === 1) { $pdo->prepare('UPDATE oauth_tokens SET revogado = 1 WHERE familia = ?')->execute(['f' . substr($c['hash'], 0, 32)]); oa_erro('invalid_grant', 'Código já usado.'); }
        if ((int) $c['expira'] < nuc_ms()) oa_erro('invalid_grant', 'Código expirado.');
        $pdo->prepare('UPDATE oauth_codigos SET usado = 1 WHERE hash = ?')->execute([$c['hash']]); // uso único, mesmo se a tentativa falhar
        if (isset($_POST['redirect_uri']) && $_POST['redirect_uri'] !== $c['redirect_uri']) oa_erro('invalid_grant', 'redirect_uri não confere.');
        $ver = (string) ($_POST['code_verifier'] ?? '');
        if (!hash_equals((string) $c['desafio'], rtrim(strtr(base64_encode(hash('sha256', $ver, true)), '+/', '-_'), '='))) oa_erro('invalid_grant', 'code_verifier inválido (PKCE).');
        if (!$ativo((int) $c['usuario_id'])) oa_erro('invalid_grant', 'Conta sem permissão.');
        $LOG['quem'] = 'oauth: usuário ' . $c['usuario_id'];
        v1_json(oa_emitir($pdo, $cid, (int) $c['usuario_id'], 'f' . substr($c['hash'], 0, 32)));
    }
    if ($g === 'refresh_token') {
        $st = $pdo->prepare("SELECT * FROM oauth_tokens WHERE hash = ? AND tipo = 'renovacao'");
        $st->execute([hash('sha256', (string) ($_POST['refresh_token'] ?? ''))]);
        $t = $st->fetch();
        if (!$t || $t['client_id'] !== $cid) oa_erro('invalid_grant', 'Token de renovação inválido.');
        if ((int) $t['revogado'] === 1) { $pdo->prepare('UPDATE oauth_tokens SET revogado = 1 WHERE familia = ?')->execute([$t['familia']]); oa_erro('invalid_grant', 'Token de renovação já usado.'); }
        if ((int) $t['expira'] < nuc_ms()) oa_erro('invalid_grant', 'Token de renovação expirado.');
        if (!$ativo((int) $t['usuario_id'])) oa_erro('invalid_grant', 'Conta sem permissão.');
        $pdo->prepare('UPDATE oauth_tokens SET revogado = 1 WHERE id = ?')->execute([$t['id']]); // renovação de uso único (rotação)
        $LOG['quem'] = 'oauth: usuário ' . $t['usuario_id'];
        v1_json(oa_emitir($pdo, $cid, (int) $t['usuario_id'], (string) $t['familia']));
    }
    oa_erro('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
}

/* =========================================================
   SERVIDOR MCP (Streamable HTTP, sem estado): cada POST traz uma mensagem JSON-RPC e a resposta vem em JSON
   ========================================================= */
function mcp_ferramentas(): array
{
    $s = fn(string $d, array $extra = []) => ['type' => 'string', 'description' => $d] + $extra;
    $data = fn(string $d) => ['type' => 'string', 'description' => $d . ' Formato AAAA-MM-DD.'];
    $clienteProps = ['nome' => $s('Nome completo.'), 'cpf' => $s('CPF, com ou sem pontuação.'), 'telefone' => $s('Telefone com DDD (WhatsApp).'), 'email' => $s('E-mail.'),
        'nacionalidade' => $s('Nacionalidade (ex.: brasileira).'), 'estado_civil' => $s('Estado civil.'), 'profissao' => $s('Profissão.'), 'rg' => $s('Número do RG.'),
        'orgao_emissor' => $s('Órgão emissor do RG (ex.: SSP/SP).'), 'data_nascimento' => $data('Data de nascimento.'), 'filiacao' => $s('Nome da mãe e do pai.'),
        'endereco' => ['type' => 'object', 'description' => 'Endereço completo.', 'properties' => ['cep' => $s('CEP'), 'logradouro' => $s('Rua/avenida'), 'numero' => $s('Número'),
            'complemento' => $s('Complemento'), 'bairro' => $s('Bairro'), 'cidade' => $s('Cidade'), 'uf' => $s('UF (2 letras)')]],
        'area_do_caso' => $s('Área do direito do caso (ex.: Salário-maternidade, BPC/LOAS, Trabalhista).'), 'objeto' => $s('Objeto do caso, em uma ou duas frases.'),
        'honorarios_valor' => ['type' => 'number', 'description' => 'Valor dos honorários contratuais em reais.'], 'honorarios_forma' => $s('Forma de pagamento dos honorários (ex.: entrada de R$ 500 + 5x de R$ 300).'),
        'honorarios_exito_percentual' => ['type' => 'number', 'description' => 'Percentual de êxito (0 a 100).'], 'justica_gratuita' => ['type' => 'boolean', 'description' => 'Se vai pedir justiça gratuita.']];
    $leadProps = ['telefone' => $s('Telefone do lead com DDD. É a chave única: se já existir, o lead é atualizado.'), 'nome' => $s('Nome do lead.'),
        'primeira_mensagem' => $s('Primeira mensagem recebida no WhatsApp (o código do anúncio, como [BPC-01], é lido daqui).'), 'data_primeiro_contato' => $data('Data do primeiro contato.'),
        'plataforma' => $s('Plataforma de origem (ex.: Meta, Instagram, Facebook, Google).'), 'codigo_anuncio' => $s('Código do anúncio, se já souber (ex.: BPC-01).'),
        'campanha' => $s('Nome da campanha (opcional; vem do cadastro do anúncio).'), 'conjunto' => $s('Conjunto de anúncios (opcional).'), 'anuncio' => $s('Nome do anúncio (opcional).'),
        'area_interesse' => $s('Área do direito de interesse.'), 'resumo_triagem' => $s('Resumo da triagem do caso.'), 'responsavel' => $s('Advogada responsável (nome ou e-mail).')];
    $ro = ['readOnlyHint' => true, 'destructiveHint' => false, 'openWorldHint' => false];
    $rw = ['readOnlyHint' => false, 'destructiveHint' => false, 'openWorldHint' => false];
    return [
        'buscar_cliente' => ['Buscar cliente', 'Procura clientes cadastrados por CPF, nome ou telefone. Use antes de cadastrar, para evitar duplicidade. Informe pelo menos um dos campos.',
            ['cpf' => $s('CPF'), 'nome' => $s('Nome ou parte dele'), 'telefone' => $s('Telefone com DDD')], [], 'clientes:ler', $ro,
            fn($pdo, $a, $q) => sv_buscar_clientes($pdo, $a)],
        'cadastrar_cliente' => ['Cadastrar cliente', 'Cadastra um novo cliente com a qualificação completa e, se informados, os honorários (que viram um contrato no sistema). Falha com erro se o CPF já existir: nesse caso use atualizar_cliente. Se o cliente veio de um lead, informe lead_id para ligar os dois.',
            $clienteProps + ['lead_id' => $s('ID do lead de origem (opcional).')], ['nome', 'cpf'], 'clientes:gravar', $rw,
            fn($pdo, $a, $q) => sv_cadastrar_cliente($pdo, $a, $q)],
        'atualizar_cliente' => ['Atualizar cliente', 'Atualiza só os campos informados de um cliente existente.', ['id' => $s('ID do cliente.')] + $clienteProps, ['id'], 'clientes:gravar', $rw,
            fn($pdo, $a, $q) => sv_atualizar_cliente($pdo, (string) ($a['id'] ?? ''), array_diff_key($a, ['id' => 1]), $q)],
        'anexar_documento_cliente' => ['Anexar documento ao cliente', 'Registra no cadastro do cliente o link de um documento gerado no Google Docs (procuração, declaração de hipossuficiência, contrato de honorários ou outro).',
            ['cliente_id' => $s('ID do cliente.'), 'tipo' => $s('Tipo do documento.', ['enum' => SV_TIPOS_DOC]), 'url' => $s('Link https do documento (Google Docs).'),
                'data' => $data('Data do documento (padrão: hoje).'), 'titulo' => $s('Título do documento (opcional).')], ['cliente_id', 'tipo', 'url'], 'clientes:gravar', $rw,
            fn($pdo, $a, $q) => sv_anexar_documento($pdo, (string) ($a['cliente_id'] ?? ''), $a, $q)],
        'buscar_leads' => ['Buscar leads', 'Lista leads do funil de atendimento, filtrando por etapa, telefone ou data do primeiro contato.',
            ['etapa' => $s('Nome da etapa (veja listar_etapas_funil).'), 'telefone' => $s('Telefone com DDD.'), 'desde' => $data('Só leads com primeiro contato a partir desta data.'),
                'limite' => ['type' => 'integer', 'description' => 'Máximo de resultados (padrão 50, máximo 200).']], [], 'leads:ler', $ro,
            fn($pdo, $a, $q) => sv_buscar_leads($pdo, $a)],
        'registrar_lead' => ['Registrar lead', 'Registra um lead que chegou pelo WhatsApp. O telefone é a chave única: se já existir, atualiza em vez de duplicar. Lê o código do anúncio na primeira mensagem e preenche campanha, conjunto e anúncio; sem código, a origem fica "Orgânico / não identificado".',
            $leadProps, ['telefone'], 'leads:gravar', $rw, fn($pdo, $a, $q) => sv_registrar_lead($pdo, $a, $q, 'mcp')],
        'mudar_etapa_lead' => ['Mudar etapa do lead', 'Move o lead para outra etapa do funil e registra no histórico. Para etapas de perda (ex.: Perdido) o motivo é obrigatório.',
            ['lead_id' => $s('ID do lead.'), 'etapa' => $s('Nova etapa (exatamente como em listar_etapas_funil).'), 'motivo' => $s('Motivo da mudança (obrigatório para Perdido).')],
            ['lead_id', 'etapa'], 'leads:gravar', $rw, fn($pdo, $a, $q) => sv_mudar_etapa($pdo, (string) ($a['lead_id'] ?? ''), $a, $q, 'mcp')],
        'registrar_interacao' => ['Registrar interação', 'Registra uma conversa ou contato com o lead. Se informar data_follow_up, cria uma tarefa de follow-up no sistema para a responsável.',
            ['lead_id' => $s('ID do lead.'), 'resumo' => $s('Resumo do que foi conversado.'), 'data' => $data('Data da interação (padrão: hoje).'), 'canal' => $s('Canal (padrão: WhatsApp).'),
                'proximo_passo' => $s('Próximo passo combinado.'), 'data_follow_up' => $data('Data para retomar o contato.')], ['lead_id', 'resumo'], 'leads:gravar', $rw,
            fn($pdo, $a, $q) => sv_registrar_interacao($pdo, (string) ($a['lead_id'] ?? ''), $a, $q)],
        'converter_lead_em_cliente' => ['Converter lead em cliente', 'Cria o cliente a partir do lead (aproveitando nome, telefone e área), liga os dois e move o lead para a etapa de cliente fechado. Pode receber os dados de qualificação do cliente.',
            ['lead_id' => $s('ID do lead.')] + $clienteProps, ['lead_id'], 'clientes:gravar', $rw,
            fn($pdo, $a, $q) => sv_converter_lead($pdo, (string) ($a['lead_id'] ?? ''), array_diff_key($a, ['lead_id' => 1]), $q)],
        'listar_etapas_funil' => ['Listar etapas do funil', 'Mostra as etapas do funil de atendimento, na ordem, com o tipo de cada uma (andamento, ganho, perdido ou parceiro).', [], [], 'leads:ler', $ro,
            fn($pdo, $a, $q) => ['etapas' => sv_etapas($pdo)]],
        'listar_anuncios' => ['Listar anúncios', 'Lista os anúncios cadastrados com código, campanha, conjunto, anúncio, área e datas de veiculação.', [], [], 'anuncios:ler', $ro,
            fn($pdo, $a, $q) => ['itens' => array_map('sv_anuncio_api', sv_anuncios($pdo))]],
        'cadastrar_anuncio' => ['Cadastrar anúncio', 'Cadastra (ou atualiza, se o código já existir) um anúncio da Meta com o código usado na mensagem pré-preenchida.',
            ['codigo' => $s('Código do anúncio: 2 a 5 letras, hífen e 2 ou 3 números (ex.: BPC-01).'), 'campanha' => $s('Nome da campanha.'), 'conjunto' => $s('Nome do conjunto de anúncios.'),
                'anuncio' => $s('Nome do anúncio.'), 'area_do_direito' => $s('Área do direito.'), 'data_inicio' => $data('Início da veiculação.'), 'data_fim' => $data('Fim da veiculação.'),
                'plataforma' => $s('Plataforma (padrão: Meta).'), 'investimento' => ['type' => 'number', 'description' => 'Valor investido no anúncio, em reais (opcional).']], ['codigo', 'campanha'], 'anuncios:gravar', $rw,
            function ($pdo, $a, $q) { [$an, $novo] = sv_salvar_anuncio($pdo, $a, $q); return ['anuncio' => $an, 'criado' => $novo]; }],
        'relatorio_por_anuncio' => ['Relatório por anúncio', 'Leads e clientes fechados por anúncio e por campanha, com taxa de conversão e custo por cliente quando houver investimento cadastrado.',
            ['desde' => $data('Início do período (primeiro contato).'), 'ate' => $data('Fim do período.')], [], 'relatorios:ler', $ro,
            fn($pdo, $a, $q) => sv_relatorio_anuncios($pdo, $a)],
    ];
}
function mcp_lista(): array
{
    $out = [];
    foreach (mcp_ferramentas() as $nome => [$titulo, $desc, $props, $req, , $anot]) {
        $schema = ['type' => 'object', 'properties' => $props ?: new stdClass(), 'additionalProperties' => false];
        if ($req) $schema['required'] = $req;
        $out[] = ['name' => $nome, 'title' => $titulo, 'description' => $desc, 'inputSchema' => $schema, 'annotations' => $anot + ['title' => $titulo]];
    }
    return $out;
}
function mcp_rota(PDO $pdo): void
{
    global $metodo, $LOG;
    if ($metodo === 'OPTIONS') { http_response_code(204); header('Allow: POST'); exit; }
    if ($metodo !== 'POST') { header('Allow: POST'); v1_erro('Este servidor MCP responde só a POST (sem fluxo SSE).', 405); }
    $p = v1_principal($pdo);
    if (!$p) v1_json(['error' => 'invalid_token', 'error_description' => 'Conecte o Claude pelo OAuth.'], 401,
        ['WWW-Authenticate: Bearer resource_metadata="' . v1_base() . '/.well-known/oauth-protected-resource", error="invalid_token"']);
    $LOG['quem'] = $p['nome'];
    $LOG['auth'] = 'mcp';
    if (!sv_limite($pdo, 'p:' . $p['id'], V1_LIMITE_MIN, 60)) v1_json(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32000, 'message' => 'Limite de requisições por minuto atingido.']], 429, ['Retry-After: 60']);
    $j = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($j)) v1_json(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32700, 'message' => 'JSON inválido.']], 400);
    $lote = array_is_list_v1($j);
    $resp = [];
    foreach ($lote ? $j : [$j] as $msg) { $r = mcp_mensagem($pdo, $p, is_array($msg) ? $msg : []); if ($r !== null) $resp[] = $r; }
    if (!$resp) { http_response_code(202); exit; } // só notificações
    v1_json($lote ? $resp : $resp[0]);
}
function mcp_mensagem(PDO $pdo, array $p, array $m): ?array
{
    global $LOG;
    $id = $m['id'] ?? null;
    $met = (string) ($m['method'] ?? '');
    if (!array_key_exists('id', $m)) return null; // notificação (ex.: notifications/initialized)
    $ok = fn($r) => ['jsonrpc' => '2.0', 'id' => $id, 'result' => $r];
    $err = fn(int $c, string $t) => ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $c, 'message' => $t]];
    if ($met === 'initialize') {
        $pedida = (string) ($m['params']['protocolVersion'] ?? '');
        $versoes = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
        return $ok(['protocolVersion' => in_array($pedida, $versoes, true) ? $pedida : $versoes[1], 'capabilities' => ['tools' => ['listChanged' => false]],
            'serverInfo' => ['name' => 'gestao-escritorio', 'title' => 'Sistema de Gestão — ' . (nuc_config($pdo, 'escritorio')['nome'] ?? 'Escritório'), 'version' => V1_VERSAO],
            'instructions' => 'Sistema de gestão do escritório. Antes de cadastrar um cliente, use buscar_cliente para evitar duplicidade. Leads são identificados pelo telefone. '
                . 'Use listar_etapas_funil para saber os nomes exatos das etapas. Datas no formato AAAA-MM-DD. Os dados são de clientes (LGPD): peça e mostre só o necessário.']);
    }
    if ($met === 'ping') return $ok(new stdClass());
    if ($met === 'tools/list') return $ok(['tools' => mcp_lista()]);
    if ($met === 'tools/call') {
        $nome = (string) ($m['params']['name'] ?? '');
        $args = $m['params']['arguments'] ?? [];
        $fs = mcp_ferramentas();
        if (!isset($fs[$nome])) return $err(-32602, 'Ferramenta desconhecida: ' . $nome);
        if (!is_array($args)) $args = [];
        $LOG['recurso'] = 'mcp:' . $nome;
        try {
            v1_exigir($p, $fs[$nome][4]);
            $r = ($fs[$nome][6])($pdo, $args, $p);
            return $ok(['content' => [['type' => 'text', 'text' => json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)]], 'structuredContent' => $r, 'isError' => false]);
        } catch (SvErro $e) {
            $info = ['erro' => $e->getMessage()] + $e->extra;
            return $ok(['content' => [['type' => 'text', 'text' => 'Erro: ' . $e->getMessage() . ($e->extra ? ' ' . json_encode($e->extra, JSON_UNESCAPED_UNICODE) : '')]], 'structuredContent' => $info, 'isError' => true]);
        }
    }
    if (strpos($met, 'notifications/') === 0) return null;
    return $err(-32601, 'Método não suportado: ' . $met);
}
