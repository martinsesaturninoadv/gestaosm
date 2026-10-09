<?php
/*
 * INSTALAÇÃO — tudo por esta página, sem editar arquivos:
 *  1. cria a configuração (config.php) e o banco de dados;
 *  2. cria o primeiro acesso de administrador;
 *  3. apaga a si mesmo ao terminar.
 * Banco "automático" = SQLite (um arquivo guardado FORA da pasta pública do site).
 * Também aceita MySQL, se preferir informar um banco criado no cPanel.
 * Por segurança, para de funcionar assim que existe qualquer usuário cadastrado.
 */
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function abrir(array $cfg): array
{
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if (($cfg['driver'] ?? 'mysql') === 'sqlite') {
        $dir = dirname($cfg['arquivo']);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true)) throw new RuntimeException('Não foi possível criar a pasta de dados: ' . $dir);
        if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
        $pdo = new PDO('sqlite:' . $cfg['arquivo'], null, null, $opts);
        return [$pdo, 'INTEGER PRIMARY KEY AUTOINCREMENT', ''];
    }
    $pdo = new PDO('mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['banco'] . ';charset=utf8mb4', $cfg['usuario'], $cfg['senha'], $opts);
    return [$pdo, 'INT AUTO_INCREMENT PRIMARY KEY', ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'];
}
/* pasta de dados fora do site público (ex.: /home/usuario/dados-gestao) quando possível */
function pastaDados(): string
{
    $fora = dirname(__DIR__) . '/dados-gestao';
    if ((is_dir($fora) && is_writable($fora)) || (!is_dir($fora) && is_writable(dirname(__DIR__)))) return $fora;
    return __DIR__ . '/dados';
}

$arqCfg = __DIR__ . '/config.php';
$temCfg = is_file($arqCfg);
$msg = '';
$ok = false;
$bloqueado = false;
$apagado = false;
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

try {
    if ($temCfg) {
        $cfg = require $arqCfg;
        [$pdo, $auto, $fim] = abrir($cfg);
        $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (id $auto, nome VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
            senha_hash VARCHAR(255) NOT NULL, papel VARCHAR(20) NOT NULL DEFAULT 'advogado', ativo TINYINT NOT NULL DEFAULT 1, criado_em BIGINT NOT NULL)$fim");
        if ((int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) {
            $bloqueado = true;
            $apagado = @unlink(__FILE__);
            $msg = 'O sistema já está instalado.' . ($apagado ? '' : ' Apague o arquivo instalar.php no Gerenciador de Arquivos.');
        }
    }
} catch (Throwable $e) {
    $bloqueado = true;
    $msg = 'Não foi possível abrir o banco de dados configurado. Apague o arquivo config.php no Gerenciador de Arquivos e abra esta página de novo.';
}

if (!$bloqueado && $_SERVER['REQUEST_METHOD'] === 'POST') {
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
        try {
            if (!$temCfg) {
                if (($_POST['tipo'] ?? 'auto') === 'mysql') {
                    $cfg = ['driver' => 'mysql', 'host' => trim((string) ($_POST['host'] ?? 'localhost')) ?: 'localhost',
                        'banco' => trim((string) ($_POST['banco'] ?? '')), 'usuario' => trim((string) ($_POST['usuario'] ?? '')),
                        'senha' => (string) ($_POST['dbsenha'] ?? ''), 'sessao_minutos' => 480];
                } else {
                    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) throw new RuntimeException('Esta hospedagem não tem SQLite. Escolha "MySQL" e informe um banco criado no cPanel.');
                    $cfg = ['driver' => 'sqlite', 'arquivo' => pastaDados() . '/gestao.sqlite', 'sessao_minutos' => 480];
                }
                [$pdo, $auto, $fim] = abrir($cfg); // testa a conexão antes de gravar
                $conteudo = "<?php\n// Gerado automaticamente pelo instalar.php em " . date('d/m/Y H:i') . ". Não compartilhe este arquivo.\nreturn " . var_export($cfg, true) . ";\n";
                if (@file_put_contents($arqCfg, $conteudo) === false) throw new RuntimeException('Não foi possível gravar o config.php nesta pasta (permissão).');
                @chmod($arqCfg, 0600);
            }
            $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (id $auto, nome VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
                senha_hash VARCHAR(255) NOT NULL, papel VARCHAR(20) NOT NULL DEFAULT 'advogado', ativo TINYINT NOT NULL DEFAULT 1, criado_em BIGINT NOT NULL)$fim");
            if ((int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) throw new RuntimeException('Já existe um administrador. Entre no sistema.');
            $pdo->prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?,?,?,?,1,?)')
                ->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), 'admin', (int) floor(microtime(true) * 1000)]);
            $ok = true;
            $apagado = @unlink(__FILE__);
            $msg = 'Pronto! O sistema está instalado e o seu acesso de administrador foi criado.'
                . ($apagado ? '' : ' Por segurança, apague agora o arquivo instalar.php no Gerenciador de Arquivos.');
        } catch (PDOException $e) {
            $msg = 'Não foi possível conectar ao banco de dados. Confira os dados do MySQL (nome completo do banco e do usuário, com o prefixo do cPanel, e a senha).';
        } catch (Throwable $e) {
            $msg = $e->getMessage();
        }
    }
}
$v = fn(string $k, string $d = '') => h((string) ($_POST[$k] ?? $d));
?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instalação do sistema</title>
<style>body{font-family:system-ui,sans-serif;background:#0F2942;color:#1A1A1A;display:flex;justify-content:center;padding:32px 16px;margin:0}
.c{background:#fff;border-radius:16px;padding:26px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{font-size:19px;margin:0 0 6px}p{font-size:13px;color:#555;line-height:1.5}label{display:block;font-size:12px;font-weight:600;margin:12px 0 4px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;font:inherit}
button,a.b{display:block;width:100%;box-sizing:border-box;text-align:center;margin-top:18px;background:#1B3A5C;color:#fff;border:none;border-radius:8px;padding:12px 16px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.m{padding:10px 12px;border-radius:8px;font-size:13px;margin-top:12px;line-height:1.45}.e{background:#FBEAEA;color:#B93434}.s{background:#E4F5EB;color:#2E7D4E}.a{background:#FEF3E0;color:#8A5300}
details{margin-top:16px;font-size:13px;border:1px solid #eee;border-radius:8px;padding:8px 12px}summary{cursor:pointer;font-weight:600}
.r{display:flex;gap:8px;align-items:center;font-weight:400;margin:8px 0}.r input{width:auto}h2{font-size:13px;margin:18px 0 0;color:#1B3A5C;text-transform:uppercase;letter-spacing:.5px}</style></head>
<body><div class="c"><h1>Instalação do sistema</h1>
<?php if (!$https): ?><div class="m a">Esta página não está com o cadeado (https). Se possível, ative o SSL no cPanel (SSL/TLS Status → Run AutoSSL) e abra o endereço começando com <b>https://</b>.</div><?php endif; ?>
<?php if ($msg): ?><div class="m <?= $ok ? 's' : ($bloqueado ? 'a' : 'e') ?>"><?= h($msg) ?></div><?php endif; ?>
<?php if ($ok || $bloqueado): ?><a class="b" href="./">Abrir o sistema</a>
<?php else: ?>
<p>Preencha e clique em <b>Instalar</b>. O sistema cria sozinho o banco de dados e a configuração; você não precisa editar nenhum arquivo.</p>
<form method="post">
<h2>Seu acesso de administrador</h2>
<label>Seu nome</label><input name="nome" required value="<?= $v('nome') ?>">
<label>E-mail (será o seu login)</label><input name="email" type="email" required value="<?= $v('email') ?>">
<label>Senha (mínimo 8 caracteres)</label><input name="senha" type="password" required minlength="8">
<label>Repita a senha</label><input name="senha2" type="password" required minlength="8">
<?php if (!$temCfg): ?>
<details><summary>Banco de dados: automático (recomendado)</summary>
<label class="r"><input type="radio" name="tipo" value="auto" <?= ($_POST['tipo'] ?? 'auto') !== 'mysql' ? 'checked' : '' ?>> Automático: cria um banco em arquivo, fora da pasta pública do site</label>
<label class="r"><input type="radio" name="tipo" value="mysql" <?= ($_POST['tipo'] ?? '') === 'mysql' ? 'checked' : '' ?>> MySQL (banco criado no cPanel)</label>
<label>Servidor MySQL</label><input name="host" value="<?= $v('host', 'localhost') ?>">
<label>Nome do banco (ex.: usuario_gestao)</label><input name="banco" value="<?= $v('banco') ?>">
<label>Usuário do banco (ex.: usuario_app)</label><input name="usuario" value="<?= $v('usuario') ?>">
<label>Senha do banco</label><input name="dbsenha" type="password">
</details>
<?php endif; ?>
<button>Instalar</button></form><?php endif; ?></div></body></html>
