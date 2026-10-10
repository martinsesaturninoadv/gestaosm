<?php
/*
 * Funções compartilhadas pelo api.php e pelo portal.php (portal do cliente).
 * Não acesse este arquivo diretamente.
 */
declare(strict_types=1);
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'nucleo.php') { http_response_code(404); exit; }

function nuc_ms(): int { return (int) floor(microtime(true) * 1000); }
function nuc_pdo(array $cfg): PDO
{
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if (($cfg['driver'] ?? 'mysql') === 'sqlite') return new PDO('sqlite:' . $cfg['arquivo'], null, null, $opts);
    return new PDO('mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['banco'] . ';charset=utf8mb4', $cfg['usuario'], $cfg['senha'], $opts);
}
/* pasta privada (fora do site quando possível) para arquivos enviados e backups */
function nuc_pasta(array $cfg, string $sub = ''): string
{
    if (($cfg['driver'] ?? '') === 'sqlite') $base = dirname($cfg['arquivo']);
    else {
        $fora = dirname(__DIR__) . '/dados-gestao';
        $base = ((is_dir($fora) && is_writable($fora)) || (!is_dir($fora) && is_writable(dirname(__DIR__)))) ? $fora : __DIR__ . '/dados';
    }
    $dir = $base . ($sub !== '' ? '/' . $sub : '');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (!is_file($base . '/.htaccess')) @file_put_contents($base . '/.htaccess', "Require all denied\nDeny from all\n");
    return $dir;
}
function nuc_ler(PDO $pdo, string $col, string $id): ?array
{
    $st = $pdo->prepare('SELECT dados FROM registros WHERE colecao = ? AND id = ? AND excluido = 0');
    $st->execute([$col, $id]);
    $r = $st->fetchColumn();
    return $r === false ? null : (json_decode((string) $r, true) ?: null);
}
function nuc_listar(PDO $pdo, string $col): array
{
    $st = $pdo->prepare('SELECT dados FROM registros WHERE colecao = ? AND excluido = 0');
    $st->execute([$col]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $d) { $x = json_decode((string) $d, true); if (is_array($x)) $out[] = $x; }
    return $out;
}
function nuc_gravar(PDO $pdo, string $col, string $id, array $dados, ?int $uid = null): void
{
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $sql = $mysql
        ? 'INSERT INTO registros (colecao, id, dados, excluido, atualizado_em, atualizado_por) VALUES (?,?,?,0,?,?) ON DUPLICATE KEY UPDATE dados = VALUES(dados), excluido = 0, atualizado_em = VALUES(atualizado_em), atualizado_por = VALUES(atualizado_por)'
        : 'INSERT INTO registros (colecao, id, dados, excluido, atualizado_em, atualizado_por) VALUES (?,?,?,0,?,?) ON CONFLICT(colecao, id) DO UPDATE SET dados = excluded.dados, excluido = 0, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por';
    $pdo->prepare($sql)->execute([$col, $id, json_encode($dados, JSON_UNESCAPED_UNICODE), nuc_ms(), $uid]);
}
function nuc_uid(): string { return base_convert((string) nuc_ms(), 10, 36) . bin2hex(random_bytes(3)); }
function nuc_config(PDO $pdo, string $id): array { return nuc_ler($pdo, 'config', $id) ?? []; }
/* e-mail simples (mail() da hospedagem), com anexos opcionais [nome => conteúdo] */
function nuc_email(string $para, string $assunto, string $texto, string $de, array $anexos = []): bool
{
    if (!filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
    $host = preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
    $de = filter_var($de, FILTER_VALIDATE_EMAIL) ? $de : 'nao-responda@' . $host;
    $h = ['From: ' . $de, 'Reply-To: ' . $de, 'MIME-Version: 1.0'];
    $assuntoCod = '=?UTF-8?B?' . base64_encode($assunto) . '?=';
    if (!$anexos) {
        $h[] = 'Content-Type: text/plain; charset=UTF-8';
        $h[] = 'Content-Transfer-Encoding: base64';
        return @mail($para, $assuntoCod, chunk_split(base64_encode($texto)), implode("\r\n", $h));
    }
    $b = 'b' . bin2hex(random_bytes(8));
    $h[] = 'Content-Type: multipart/mixed; boundary="' . $b . '"';
    $corpo = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($texto));
    foreach ($anexos as $nome => $conteudo) {
        $corpo .= "--$b\r\nContent-Type: application/octet-stream; name=\"$nome\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$nome\"\r\n\r\n" . chunk_split(base64_encode($conteudo));
    }
    $corpo .= "--$b--";
    return @mail($para, $assuntoCod, $corpo, implode("\r\n", $h));
}
function nuc_h(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function nuc_data(?string $d): string { return $d && preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $d, $m) ? "$m[3]/$m[2]/$m[1]" : '—'; }
function nuc_brl($v): string { return 'R$ ' . number_format((float) $v, 2, ',', '.'); }
