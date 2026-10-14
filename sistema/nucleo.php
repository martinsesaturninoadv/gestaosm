<?php
/*
 * Funções compartilhadas pelo api.php e pelo portal.php (portal do cliente).
 * Não acesse este arquivo diretamente.
 */
declare(strict_types=1);
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'nucleo.php') { http_response_code(404); exit; }
date_default_timezone_set('America/Sao_Paulo'); // horário de Brasília para prazos, lembretes e avisos

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

/* =========================================================
   NOTIFICAÇÕES PUSH (Web Push com VAPID, sem bibliotecas externas)
   Chegam no celular/computador mesmo com o sistema fechado.
   ========================================================= */
function nuc_b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function nuc_b64ud(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }
function nuc_push_tabelas(PDO $pdo): void
{
    static $feito = false;
    if ($feito) return;
    $feito = true;
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $auto = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $fim = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS push_assinaturas (
        id $auto, eh CHAR(64) NOT NULL UNIQUE, email VARCHAR(190) NOT NULL, endpoint TEXT NOT NULL, p256dh VARCHAR(200) NOT NULL,
        auth VARCHAR(60) NOT NULL, prefs VARCHAR(400), aparelho VARCHAR(120), criado_em BIGINT NOT NULL)$fim");
    $pdo->exec("CREATE TABLE IF NOT EXISTS push_enviados (chave VARCHAR(190) NOT NULL PRIMARY KEY, em BIGINT NOT NULL)$fim");
}
function nuc_ec_pem(string $raw65): string
{
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw65;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}
function nuc_ec_novo(): array
{
    $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$k) throw new RuntimeException('O servidor não conseguiu gerar a chave de notificações (OpenSSL).');
    $d = openssl_pkey_get_details($k);
    $pub = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
    return [$k, $pub];
}
/* par de chaves VAPID do servidor: criado uma vez e guardado só no banco (nunca vai para o navegador, exceto a pública) */
function nuc_vapid(PDO $pdo): array
{
    $v = nuc_config($pdo, 'vapid');
    if (!empty($v['pem']) && !empty($v['pub'])) return $v;
    [$k, $pub] = nuc_ec_novo();
    openssl_pkey_export($k, $pem);
    $v = ['pem' => $pem, 'pub' => nuc_b64u($pub)];
    nuc_gravar($pdo, 'config', 'vapid', $v);
    return $v;
}
function nuc_der_para_raw(string $der): string
{
    $o = 2;
    if (ord($der[1]) & 0x80) $o += ord($der[1]) & 0x7f;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$o + 1]);
        $int = ltrim(substr($der, $o + 2, $len), "\0");
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
        $o += 2 + $len;
    }
    return $out;
}
function nuc_vapid_jwt(array $v, string $aud, string $sub): string
{
    $h = nuc_b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $p = nuc_b64u(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $sub]));
    if (!openssl_sign("$h.$p", $der, $v['pem'], OPENSSL_ALGO_SHA256)) throw new RuntimeException('Falha ao assinar o aviso.');
    return "$h.$p." . nuc_b64u(nuc_der_para_raw($der));
}
/* criptografia do conteúdo (RFC 8291, aes128gcm) */
function nuc_push_cifrar(string $texto, string $uaPub, string $auth): string
{
    [$k, $asPub] = nuc_ec_novo();
    $seg = openssl_pkey_derive(openssl_pkey_get_public(nuc_ec_pem($uaPub)), $k, 32);
    if ($seg === false) throw new RuntimeException('Chave do aparelho inválida.');
    $prkChave = hash_hmac('sha256', $seg, $auth, true);
    $ikm = hash_hmac('sha256', "WebPush: info\0" . $uaPub . $asPub . "\x01", $prkChave, true);
    $sal = random_bytes(16);
    $prk = hash_hmac('sha256', $ikm, $sal, true);
    $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
    $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
    $cifrado = openssl_encrypt($texto . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    return $sal . pack('N', 4096) . chr(65) . $asPub . $cifrado . $tag;
}
/* envia para uma assinatura; devolve o código HTTP (404/410 = aparelho saiu, a assinatura é apagada) */
function nuc_push_um(PDO $pdo, array $a, array $dados, string $urgencia = 'normal'): int
{
    $v = nuc_vapid($pdo);
    $u = parse_url($a['endpoint']);
    if (($u['scheme'] ?? '') !== 'https' || empty($u['host'])) return 0;
    $aud = 'https://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    $esc = nuc_config($pdo, 'escritorio');
    $host = preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
    $sub = 'mailto:' . (filter_var($esc['email'] ?? '', FILTER_VALIDATE_EMAIL) ? $esc['email'] : 'contato@' . $host);
    $corpo = nuc_push_cifrar(json_encode($dados, JSON_UNESCAPED_UNICODE), nuc_b64ud($a['p256dh']), nuc_b64ud($a['auth']));
    $ch = curl_init($a['endpoint']);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $corpo, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => ['Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm', 'TTL: 86400', 'Urgency: ' . $urgencia,
            'Authorization: vapid t=' . nuc_vapid_jwt($v, $aud, $sub) . ', k=' . $v['pub']]]);
    curl_exec($ch);
    $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($st === 404 || $st === 410) $pdo->prepare('DELETE FROM push_assinaturas WHERE id = ?')->execute([$a['id']]);
    return $st;
}
/* marca uma chave como já avisada; devolve false se já tinha sido (evita aviso repetido) */
function nuc_push_marcar(PDO $pdo, string $chave): bool
{
    nuc_push_tabelas($pdo);
    try { $pdo->prepare('INSERT INTO push_enviados (chave, em) VALUES (?, ?)')->execute([mb_substr($chave, 0, 190), nuc_ms()]); return true; }
    catch (PDOException $e) { return false; }
}
/* tipos: msg (chat), tarefa, prazo, meta, resumo, portal, teste */
function nuc_push(PDO $pdo, array $emails, string $tipo, string $titulo, string $texto, string $url = '', ?string $chave = null, string $urgencia = 'normal'): int
{
    if (!function_exists('openssl_pkey_derive') || !function_exists('curl_init')) return 0;
    nuc_push_tabelas($pdo);
    $emails = array_values(array_unique(array_filter(array_map(fn($e) => mb_strtolower(trim((string) $e)), $emails))));
    if (!$emails) return 0;
    if ($chave !== null && !nuc_push_marcar($pdo, $chave)) return 0;
    $marcas = implode(',', array_fill(0, count($emails), '?'));
    $st = $pdo->prepare("SELECT * FROM push_assinaturas WHERE email IN ($marcas)");
    $st->execute($emails);
    $n = 0;
    $dados = ['t' => mb_substr($titulo, 0, 120), 'b' => mb_substr($texto, 0, 400), 'u' => $url, 'tag' => $tipo . '-' . substr(md5($titulo . $texto . $url), 0, 8)];
    foreach ($st->fetchAll() as $a) {
        $pr = json_decode((string) $a['prefs'], true);
        if (is_array($pr) && $tipo !== 'teste' && array_key_exists($tipo, $pr) && !$pr[$tipo]) continue;
        try { $c = nuc_push_um($pdo, $a, $dados, $urgencia); if ($c >= 200 && $c < 300) $n++; } catch (Throwable $e) { /* um aparelho com problema não impede os outros */ }
    }
    return $n;
}
/* e-mails da equipe (sem parceiros), opcionalmente só de alguns papéis */
function nuc_equipe(PDO $pdo, array $papeis = []): array
{
    $out = [];
    foreach ($pdo->query("SELECT email, papel FROM usuarios WHERE ativo = 1 AND papel NOT IN ('parceiro', 'editor')") as $u) {
        if (!$papeis || in_array($u['papel'], $papeis, true)) $out[] = mb_strtolower($u['email']);
    }
    return $out;
}
/* id da pessoa no cadastro do sistema (u1, u2…) → e-mail */
function nuc_emails_por_id(PDO $pdo): array
{
    $m = [];
    foreach (nuc_listar($pdo, 'usuarios') as $u) if (!empty($u['id']) && !empty($u['email'])) $m[$u['id']] = mb_strtolower((string) $u['email']);
    return $m;
}
function nuc_resp(array $r): array
{
    $ids = is_array($r['responsaveis'] ?? null) && $r['responsaveis'] ? $r['responsaveis'] : [($r['responsavelId'] ?? '')];
    return array_values(array_filter(array_map('strval', $ids)));
}
/* avisos por horário: rodam a cada 5 minutos enquanto alguém usa o sistema, ou pela tarefa agendada (cron) da hospedagem */
function nuc_avisos_periodicos(PDO $pdo, string $pasta, bool $forcar = false): array
{
    $marca = $pasta . '/ultimos-avisos.txt';
    if (!$forcar && is_file($marca) && time() - (int) file_get_contents($marca) < 300) return ['pulado' => true];
    $lock = @fopen($pasta . '/avisos.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['pulado' => true];
    file_put_contents($marca, (string) time());
    $n = 0;
    try {
        nuc_push_tabelas($pdo);
        if (!(int) $pdo->query('SELECT COUNT(*) FROM push_assinaturas')->fetchColumn()) return ['enviados' => 0];
        $hoje = date('Y-m-d'); $amanha = date('Y-m-d', strtotime('+1 day')); $agora = date('H:i'); $minAgora = (int) date('G') * 60 + (int) date('i');
        $util = (int) date('N') <= 5;
        $email = nuc_emails_por_id($pdo);
        $para = fn(array $r) => array_values(array_filter(array_map(fn($id) => $email[$id] ?? null, nuc_resp($r))));
        $min = fn(string $h) => preg_match('/^(\d{1,2}):(\d{2})/', $h, $m) ? (int) $m[1] * 60 + (int) $m[2] : null;
        $tarefas = nuc_listar($pdo, 'tarefas'); $eventos = nuc_listar($pdo, 'eventos'); $peticoes = nuc_listar($pdo, 'peticoes');
        // 1) tarefa com horário: aviso 1 hora antes e quando vence
        foreach ($tarefas as $t) {
            if (($t['status'] ?? '') === 'done' || ($t['prazo'] ?? '') !== $hoje || empty($t['hora']) || ($m = $min((string) $t['hora'])) === null) continue;
            $falta = $m - $minAgora;
            if ($falta <= 60 && $falta > 15) $n += nuc_push($pdo, $para($t), 'tarefa', '⏰ Tarefa vence às ' . $t['hora'], (string) $t['titulo'], '#tarefas', 'tarh1:' . $t['id'] . ':' . $hoje . $t['hora'], 'high');
            elseif ($falta <= 15 && $falta >= -30) $n += nuc_push($pdo, $para($t), 'tarefa', '🔴 URGENTE: tarefa vence ' . ($falta > 0 ? 'em ' . $falta . ' min' : 'agora'), (string) $t['titulo'], '#tarefas', 'tarh0:' . $t['id'] . ':' . $hoje . $t['hora'], 'high');
        }
        // 2) audiências e compromissos com hora: 1 hora antes
        foreach ($eventos as $e) {
            if (!empty($e['feito']) || ($e['data'] ?? '') !== $hoje || empty($e['hora']) || ($m = $min((string) $e['hora'])) === null) continue;
            $falta = $m - $minAgora;
            if ($falta <= 60 && $falta >= 0) $n += nuc_push($pdo, $para($e), 'prazo', (preg_match('/audi|per[ií]cia/i', (string) ($e['tipo'] ?? '')) ? '🏛 ' : '📅 ') . ($e['tipo'] ?? 'Compromisso') . ' às ' . $e['hora'], (string) $e['titulo'] . (!empty($e['linkVirtual']) ? ' · link na agenda' : ''), '#agenda', 'evh:' . $e['id'] . ':' . $hoje . $e['hora'], 'high');
        }
        // 3) bom dia: o que vence hoje e amanhã (dias úteis, a partir das 7h30)
        if ($util && $minAgora >= 450 && $minAgora < 720) {
            $porEmail = [];
            $soma = function (array $quem, string $k) use (&$porEmail) { foreach ($quem as $e) $porEmail[$e][$k] = ($porEmail[$e][$k] ?? 0) + 1; };
            foreach ($eventos as $e) {
                if (!empty($e['feito'])) continue;
                $aud = preg_match('/audi|per[ií]cia/i', (string) ($e['tipo'] ?? ''));
                if (($e['data'] ?? '') === $hoje) $soma($para($e), $aud ? 'aud' : 'prazo');
                elseif (($e['data'] ?? '') === $amanha && !$aud) $soma($para($e), 'amanha');
                elseif (($e['data'] ?? '') !== '' && $e['data'] < $hoje) $soma($para($e), 'atraso');
            }
            foreach ($tarefas as $t) {
                if (($t['status'] ?? '') === 'done' || empty($t['prazo'])) continue;
                if ($t['prazo'] === $hoje) $soma($para($t), 'tar'); elseif ($t['prazo'] < $hoje) $soma($para($t), 'atraso');
            }
            foreach ($peticoes as $p) {
                if (($p['status'] ?? '') === 'Protocolada' || !in_array($p['prazo'] ?? '', [$hoje, $amanha], true)) continue;
                $soma(array_values(array_filter([$email[$p['autorId'] ?? ''] ?? null, $email[$p['conferenteId'] ?? ''] ?? null])), 'pet');
            }
            foreach ($porEmail as $em => $c) {
                $partes = array_filter([($c['aud'] ?? 0) ? $c['aud'] . ' audiência(s)' : '', ($c['prazo'] ?? 0) ? $c['prazo'] . ' prazo(s)/compromisso(s)' : '', ($c['tar'] ?? 0) ? $c['tar'] . ' tarefa(s)' : '',
                    ($c['pet'] ?? 0) ? $c['pet'] . ' petição(ões) para protocolar até amanhã' : '', ($c['amanha'] ?? 0) ? $c['amanha'] . ' prazo(s) vencendo amanhã' : '', ($c['atraso'] ?? 0) ? '⚠️ ' . $c['atraso'] . ' em atraso' : '']);
                if ($partes) $n += nuc_push($pdo, [$em], 'prazo', '☀️ Bom dia! Hoje você tem:', implode(' · ', $partes), '#painel', 'manha:' . $hoje . ':' . $em);
            }
        }
        // 4) fim do dia: resumo do que a equipe fez (dias úteis, a partir das 18h, para administração e advogados)
        if ($util && $minAgora >= 1080 && $minAgora < 1320) {
            $feitas = count(array_filter($tarefas, fn($t) => ($t['status'] ?? '') === 'done' && substr((string) ($t['concluidoEm'] ?? ''), 0, 10) === $hoje));
            $cumpridos = count(array_filter($eventos, fn($e) => !empty($e['feito']) && substr((string) ($e['feitoEm'] ?? ''), 0, 10) === $hoje));
            $fech = count(array_filter(nuc_listar($pdo, 'leads'), fn($l) => ($l['etapa'] ?? '') === 'Fechado' && ($l['dataFechamento'] ?? '') === $hoje));
            $n += nuc_push($pdo, nuc_equipe($pdo, ['admin', 'advogado']), 'resumo', '📋 Resumo do dia da equipe', "$feitas tarefa(s) concluída(s), $cumpridos prazo(s)/compromisso(s) cumpridos" . ($fech ? ", $fech contrato(s) fechado(s) 🎉" : '') . '. Toque para ver o que cada pessoa fez.', '#resumo', 'resumo:' . $hoje);
        }
        // limpeza das marcas antigas (60 dias)
        $pdo->prepare('DELETE FROM push_enviados WHERE em < ?')->execute([nuc_ms() - 60 * 86400000]);
    } catch (Throwable $e) { /* avisos nunca podem derrubar o sistema */ }
    flock($lock, LOCK_UN);
    return ['enviados' => $n];
}
