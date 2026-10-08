<?php
/*
 * INSTALAÇÃO — cria o primeiro acesso de administrador.
 * Abra https://seudominio.com.br/instalar.php uma única vez, cadastre o administrador
 * e depois APAGUE este arquivo da hospedagem.
 * Por segurança, ele para de funcionar assim que existe qualquer usuário cadastrado.
 */
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

$msg = '';
$ok = false;
$bloqueado = false;
if (!is_file(__DIR__ . '/config.php')) {
    $msg = 'Crie primeiro o arquivo config.php (copie config.exemplo.php e preencha os dados do banco).';
    $bloqueado = true;
} else {
    $cfg = require __DIR__ . '/config.php';
    try {
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (($cfg['driver'] ?? 'mysql') === 'sqlite') {
            $dir = dirname($cfg['arquivo']);
            if (!is_dir($dir)) { mkdir($dir, 0700, true); file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n"); }
            $pdo = new PDO('sqlite:' . $cfg['arquivo'], null, null, $opts);
            $auto = 'INTEGER PRIMARY KEY AUTOINCREMENT'; $fim = '';
        } else {
            $pdo = new PDO('mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['banco'] . ';charset=utf8mb4', $cfg['usuario'], $cfg['senha'], $opts);
            $auto = 'INT AUTO_INCREMENT PRIMARY KEY'; $fim = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
        }
        $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (id $auto, nome VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
            senha_hash VARCHAR(255) NOT NULL, papel VARCHAR(20) NOT NULL DEFAULT 'advogado', ativo TINYINT NOT NULL DEFAULT 1, criado_em BIGINT NOT NULL)$fim");
        $existe = (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
        if ($existe > 0) {
            $msg = 'O sistema já está instalado. Apague o arquivo instalar.php da hospedagem.';
            $bloqueado = true;
        } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $nome = trim((string) ($_POST['nome'] ?? ''));
            $email = mb_strtolower(trim((string) ($_POST['email'] ?? '')));
            $senha = (string) ($_POST['senha'] ?? '');
            if ($nome === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $msg = 'Informe nome e e-mail válidos.';
            } elseif (mb_strlen($senha) < 8) {
                $msg = 'A senha deve ter pelo menos 8 caracteres.';
            } elseif ($senha !== (string) ($_POST['senha2'] ?? '')) {
                $msg = 'As senhas não conferem.';
            } else {
                $pdo->prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?,?,?,?,1,?)')
                    ->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), 'admin', (int) floor(microtime(true) * 1000)]);
                $ok = true;
                $msg = 'Administrador criado! Agora APAGUE o arquivo instalar.php da hospedagem e acesse o sistema.';
            }
        }
    } catch (PDOException $e) {
        $msg = 'Não foi possível conectar ao banco de dados. Confira host, nome do banco, usuário e senha no config.php.';
        $bloqueado = true;
    }
}
?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instalação</title>
<style>body{font-family:system-ui,sans-serif;background:#F3F4F6;color:#1A1A1A;display:flex;justify-content:center;padding:40px 16px}
.c{background:#fff;border-radius:14px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 6px}p{font-size:13px;color:#555}label{display:block;font-size:12px;font-weight:600;margin:12px 0 4px}
input{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #ccc;border-radius:8px;font:inherit}
button,a.b{display:inline-block;margin-top:16px;background:#1B3A5C;color:#fff;border:none;border-radius:8px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.m{padding:10px 12px;border-radius:8px;font-size:13px;margin-top:12px}.e{background:#FBEAEA;color:#B93434}.s{background:#E4F5EB;color:#2E7D4E}</style></head>
<body><div class="c"><h1>Instalação do sistema</h1><p>Crie o primeiro acesso, que será o administrador. Depois ele poderá cadastrar a equipe em Configurações.</p>
<?php if ($msg): ?><div class="m <?= $ok ? 's' : 'e' ?>"><?= h($msg) ?></div><?php endif; ?>
<?php if ($ok): ?><a class="b" href="./">Abrir o sistema</a>
<?php elseif (!$bloqueado): ?>
<form method="post"><label>Nome</label><input name="nome" required value="<?= h((string) ($_POST['nome'] ?? '')) ?>">
<label>E-mail (será o login)</label><input name="email" type="email" required value="<?= h((string) ($_POST['email'] ?? '')) ?>">
<label>Senha (mínimo 8 caracteres)</label><input name="senha" type="password" required minlength="8">
<label>Repita a senha</label><input name="senha2" type="password" required minlength="8">
<button>Criar administrador</button></form><?php endif; ?></div></body></html>
