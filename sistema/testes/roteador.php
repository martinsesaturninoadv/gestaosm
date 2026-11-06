<?php
/*
 * Roteador para testes locais com o servidor embutido do PHP (php -S): faz o papel do .htaccess.
 * Não vai para a hospedagem.
 */
$caminho = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$regras = [
    '#^/api/v1/?(.*)$#' => null,
    '#^/\.well-known/oauth-protected-resource(/.*)?$#' => 'wk/prm',
    '#^/\.well-known/oauth-authorization-server(/.*)?$#' => 'wk/as',
    '#^/\.well-known/openid-configuration$#' => 'wk/as',
    '#^/oauth/(register|authorize|token|revoke)$#' => 'oauth/',
];
foreach ($regras as $re => $r) {
    if (!preg_match($re, $caminho, $m)) continue;
    $_GET['r'] = $r === null ? $m[1] : ($r === 'oauth/' ? 'oauth/' . $m[1] : $r);
    $_SERVER['SCRIPT_NAME'] = '/api-v1.php';
    $_SERVER['SCRIPT_FILENAME'] = __DIR__ . '/api-v1.php';
    require __DIR__ . '/api-v1.php';
    return true;
}
if (preg_match('#^/(nucleo|servico|config)\.php$#', $caminho)) { http_response_code(403); return true; }
return false;
