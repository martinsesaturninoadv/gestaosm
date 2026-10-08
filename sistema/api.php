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
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const COLECOES = ['clientes', 'processos', 'eventos', 'tarefas', 'leads', 'lancamentos', 'documentos',
    'notas', 'contratos', 'despesasFixas', 'usuarios', 'config'];
// Coleções que o perfil "estagiario" não pode ver nem alterar
const COLECOES_FINANCEIRAS = ['lancamentos', 'contratos', 'despesasFixas'];
const PAPEIS = ['admin', 'advogado', 'estagiario', 'financeiro'];

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
    erro('Sistema não configurado: crie o arquivo config.php a partir de config.exemplo.php.', 503);
}
$cfg = require $arqConfig;

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
    return ['id' => (int) $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'papel' => $u['papel'], 'ativo' => (int) $u['ativo'] === 1];
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

// Proteção contra envio de formulários de outros sites (CSRF): toda escrita exige este cabeçalho,
// que um formulário comum de outro site não consegue enviar.
if ($metodo === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'gestao') {
    erro('Requisição inválida.', 403);
}

switch ($acao) {
    case 'sessao':
        $u = usuarioLogado($pdo);
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
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $u['id'];
        registrar($pdo, (int) $u['id'], 'login');
        responder(['ok' => true, 'usuario' => usuarioPublico($u), 'agora' => agoraMs()]);

    case 'sair':
        if (!empty($_SESSION['uid'])) registrar($pdo, (int) $_SESSION['uid'], 'logout');
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
            if ($u['papel'] === 'estagiario' && in_array($r['colecao'], COLECOES_FINANCEIRAS, true)) continue;
            $out[] = ['colecao' => $r['colecao'], 'id' => $r['id'], 'excluido' => (int) $r['excluido'] === 1,
                'dados' => (int) $r['excluido'] === 1 ? null : json_decode((string) $r['dados'], true)];
        }
        responder(['ok' => true, 'agora' => $agora, 'registros' => $out]);

    case 'salvar':
        if ($metodo !== 'POST') erro('Método inválido.', 405);
        $u = usuarioLogado($pdo);
        $uid = (int) $u['id'];
        $b = corpo();
        $agora = agoraMs();
        $permitida = function (string $col) use ($u): bool {
            if (!in_array($col, COLECOES, true)) return false;
            if ($u['papel'] === 'estagiario' && in_array($col, COLECOES_FINANCEIRAS, true)) return false;
            return true;
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
                if (!$permitida($col) || $id === '' || strlen($id) > 60) continue;
                $st->execute([$col, $id, json_encode($r['dados'] ?? null, JSON_UNESCAPED_UNICODE), 0, $agora, $uid]);
                registrar($pdo, $uid, 'salvar', $col, $id);
                $n++;
            }
            foreach (($b['exclusoes'] ?? []) as $r) {
                $col = (string) ($r['colecao'] ?? '');
                $id = (string) ($r['id'] ?? '');
                if (!$permitida($col) || $id === '') continue;
                $st->execute([$col, $id, null, 1, $agora, $uid]);
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
