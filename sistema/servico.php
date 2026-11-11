<?php
/*
 * Regras de negócio compartilhadas pela API REST (/api/v1), pelo conector MCP do Claude,
 * pelo webhook do WaSpeed e pelas telas de administração (api.php).
 * Os clientes e leads continuam guardados na tabela "registros" (JSON), como o resto do sistema,
 * para que as telas, a sincronização e as permissões sigam funcionando sem mudança.
 * Não acesse este arquivo diretamente.
 */
declare(strict_types=1);
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'servico.php') { http_response_code(404); exit; }

const SV_MIGRACAO = '2026-11-api-v1';
const SV_ESCOPOS = ['clientes:ler', 'clientes:gravar', 'leads:ler', 'leads:gravar', 'anuncios:ler', 'anuncios:gravar', 'relatorios:ler', 'financeiro:ler', 'financeiro:gravar'];
const SV_TIPOS_DOC = ['procuracao', 'declaracao_hipossuficiencia', 'contrato_honorarios', 'outro'];
const SV_ORIGEM_ORGANICA = 'Orgânico / não identificado';
// etapas antigas do Kanban → novas (e o caminho de volta, usado ao reverter a migração)
const SV_MAPA_ETAPAS = ['Novo contato' => 'Novo lead', 'Em atendimento' => 'Em triagem', 'Proposta enviada' => 'Proposta enviada', 'Em recuperação' => 'Negociação',
    'Fechado' => 'Cliente fechado', 'Perdido' => 'Perdido', 'Encaminhado a parceiro' => 'Encaminhado a parceiro'];
const SV_MAPA_VOLTA = ['Novo lead' => 'Novo contato', 'Em triagem' => 'Em atendimento', 'Aguardando documentos' => 'Em atendimento', 'Proposta enviada' => 'Proposta enviada',
    'Negociação' => 'Em recuperação', 'Contrato enviado' => 'Proposta enviada', 'Cliente fechado' => 'Fechado', 'Perdido' => 'Perdido', 'Encaminhado a parceiro' => 'Encaminhado a parceiro'];

class SvErro extends Exception
{
    public int $status;
    public array $extra;
    public function __construct(string $msg, int $status = 422, array $extra = [])
    {
        parent::__construct($msg);
        $this->status = $status;
        $this->extra = $extra;
    }
}

/* ======================= utilidades ======================= */
function sv_mysql(PDO $pdo): bool { return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'; }
function sv_texto($v, int $max = 500): string
{
    if (is_array($v) || is_object($v)) return '';
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', trim((string) $v)) ?? '';
    return mb_substr($s, 0, $max);
}
function sv_norm(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n']);
    return preg_replace('/\s+/', ' ', $s) ?? $s;
}
/* data em AAAA-MM-DD; aceita AAAA-MM-DD, DD/MM/AAAA e data-hora ISO */
function sv_data($v, string $campo): string
{
    $s = sv_texto($v, 40);
    if ($s === '') return '';
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $s, $m) || preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $n)) {
        [$a, $mes, $d] = isset($m[1]) ? [$m[1], $m[2], $m[3]] : [$n[3], $n[2], $n[1]];
        if (checkdate((int) $mes, (int) $d, (int) $a)) return "$a-$mes-$d";
    }
    throw new SvErro("Data inválida em \"$campo\". Use AAAA-MM-DD (ex.: 2026-11-06).", 422, ['campo' => $campo]);
}
/* valor em reais: aceita número, "1500.50", "1.500,50" e "R$ 1.500" */
function sv_valor($v, string $campo): ?float
{
    if ($v === null || $v === '') return null;
    if (is_int($v) || is_float($v)) return (float) $v;
    $s = preg_replace('/[R$\s\x{00A0}]/u', '', (string) $v) ?? '';
    if (strpos($s, ',') !== false) $s = str_replace(['.', ','], ['', '.'], $s);
    elseif (preg_match('/^\d{1,3}(\.\d{3})+$/', $s)) $s = str_replace('.', '', $s);
    if (!is_numeric($s)) throw new SvErro("Valor inválido em \"$campo\".", 422, ['campo' => $campo]);
    return (float) $s;
}
function sv_bool($v): bool { return is_bool($v) ? $v : in_array(sv_norm((string) $v), ['1', 'true', 'sim', 's', 'yes'], true); }
function sv_digitos(string $s): string { return preg_replace('/\D/', '', $s) ?? ''; }
function sv_cpf_valido(string $d): bool
{
    if (strlen($d) !== 11 || preg_match('/^(\d)\1{10}$/', $d)) return false;
    for ($t = 9; $t < 11; $t++) {
        $s = 0;
        for ($i = 0; $i < $t; $i++) $s += (int) $d[$i] * ($t + 1 - $i);
        if ((int) $d[$t] !== ((10 * $s) % 11) % 10) return false;
    }
    return true;
}
function sv_cpf_formatado(string $d): string { return strlen($d) === 11 ? substr($d, 0, 3) . '.' . substr($d, 3, 3) . '.' . substr($d, 6, 3) . '-' . substr($d, 9) : $d; }
/* telefone no formato E.164 (+5511999998888). Celular brasileiro antigo de 8 dígitos ganha o 9 (o WhatsApp às vezes manda sem). */
function sv_telefone_e164(string $s): string
{
    $s = trim(preg_replace('/@.*$/', '', $s) ?? '');
    $mais = strpos($s, '+') === 0;
    $d = sv_digitos($s);
    if (strpos($d, '00') === 0) { $d = substr($d, 2); $mais = true; }
    if (!$mais && in_array(strlen($d), [10, 11], true)) $d = '55' . $d;
    if (!$mais && strlen($d) === 12 && strpos($d, '0') === 0) $d = '55' . substr($d, 1); // 0 + DDD + número
    if (strpos($d, '55') === 0 && strlen($d) === 12 && preg_match('/^[6-9]$/', $d[4])) $d = substr($d, 0, 4) . '9' . substr($d, 4);
    if (strpos($d, '55') === 0 && strlen($d) !== 13 && strlen($d) !== 12) return '';
    if (strlen($d) < 10 || strlen($d) > 15) return '';
    return '+' . $d;
}
function sv_telefone_exibir(string $e164): string
{
    return preg_match('/^\+55(\d{2})(\d{4,5})(\d{4})$/', $e164, $m) ? "($m[1]) $m[2]-$m[3]" : $e164;
}
/* código do anúncio na mensagem pré-preenchida: "[BPC-01]" (também aceita sem colchetes, minúsculas e 3 dígitos) */
function sv_extrair_codigo(string $txt, ?PDO $pdo = null): string
{
    if (preg_match('/\[\s*([A-Za-z]{2,5})\s*[-–_]\s*(\d{1,3})\s*\]/u', $txt, $m)) return strtoupper($m[1]) . '-' . $m[2];
    // sem colchetes (a pessoa apagou ou digitou): só vale se o código estiver cadastrado, para não confundir com outras palavras
    if (preg_match_all('/(?<![A-Za-z0-9])([A-Za-z]{2,5})\s?[-–]\s?(\d{1,3})(?![0-9])/u', $txt, $ms, PREG_SET_ORDER))
        foreach ($ms as $m) { $c = strtoupper($m[1]) . '-' . $m[2]; if ($pdo === null || sv_anuncio_por_codigo($pdo, $c)) return $c; }
    return '';
}
function sv_codigo_chave(string $c): string { return preg_match('/^([A-Z]{2,5})-(\d+)$/', strtoupper(trim($c)), $m) ? $m[1] . '-' . (int) $m[2] : strtoupper(trim($c)); }
function sv_hoje(): string { return date('Y-m-d'); }

/* ======================= gravação com autoria (LGPD) ======================= */
/* $quem: ['tipo' => chave|oauth|webhook|sessao, 'nome' => …, 'uid' => id do login (ou null), 'membro' => id na equipe (u1…)] */
function sv_gravar(PDO $pdo, string $col, string $id, array $dados, array $quem): void
{
    nuc_gravar($pdo, $col, $id, $dados, $quem['uid'] ?? null);
    $st = $pdo->prepare('INSERT INTO historico (quando, usuario_id, acao, colecao, registro_id, ip) VALUES (?,?,?,?,?,?)');
    $st->execute([nuc_ms(), $quem['uid'] ?? null, mb_substr('api:' . ($quem['tipo'] ?? '?'), 0, 20), $col, $id, $_SERVER['REMOTE_ADDR'] ?? null]);
}
function sv_equipe(PDO $pdo): array
{
    $m = [];
    foreach (nuc_listar($pdo, 'usuarios') as $u) if (!empty($u['id'])) $m[$u['id']] = ['id' => (string) $u['id'], 'nome' => (string) ($u['nome'] ?? ''), 'email' => mb_strtolower((string) ($u['email'] ?? ''))];
    return $m;
}
function sv_membro_por_email(PDO $pdo, string $email): string
{
    foreach (sv_equipe($pdo) as $u) if ($u['email'] !== '' && $u['email'] === mb_strtolower($email)) return $u['id'];
    return '';
}
/* responsável informado por e-mail, nome ou id da equipe */
function sv_resolver_responsavel(PDO $pdo, string $txt): string
{
    $t = sv_norm($txt);
    if ($t === '') return '';
    $eq = sv_equipe($pdo);
    if (isset($eq[$txt])) return $txt;
    foreach ($eq as $u) if ($u['email'] === $t) return $u['id'];
    foreach ($eq as $u) if (sv_norm($u['nome']) === $t) return $u['id'];
    foreach ($eq as $u) { $n = sv_norm($u['nome']); if ($n !== '' && (strpos($n, $t) !== false || strpos($t, preg_replace('/^(dra?\.?|adv\.?)\s+/', '', $n)) !== false)) return $u['id']; }
    return '';
}

/* ======================= funil ======================= */
function sv_etapas(PDO $pdo): array
{
    $out = [];
    foreach (nuc_funil($pdo) as $i => $e) $out[] = ['ordem' => $i + 1, 'nome' => $e['nome'], 'tipo' => $e['tipo']];
    return $out;
}
function sv_validar_etapa(PDO $pdo, string $nome): string
{
    foreach (nuc_funil($pdo) as $e) if (sv_norm($e['nome']) === sv_norm($nome)) return $e['nome'];
    throw new SvErro('Etapa desconhecida: "' . $nome . '". Consulte GET /funil/etapas.', 422, ['campo' => 'etapa', 'etapas' => array_column(nuc_funil($pdo), 'nome')]);
}

/* ======================= anúncios ======================= */
function sv_anuncios(PDO $pdo): array
{
    $l = nuc_listar($pdo, 'anuncios');
    usort($l, fn($a, $b) => strcmp((string) ($a['codigo'] ?? ''), (string) ($b['codigo'] ?? '')));
    return $l;
}
function sv_anuncio_por_codigo(PDO $pdo, string $codigo): ?array
{
    if ($codigo === '') return null;
    $k = sv_codigo_chave($codigo);
    foreach (nuc_listar($pdo, 'anuncios') as $a) if (sv_codigo_chave((string) ($a['codigo'] ?? '')) === $k) return $a;
    return null;
}
function sv_anuncio_api(array $a): array
{
    return ['id' => $a['id'], 'codigo' => $a['codigo'] ?? '', 'plataforma' => $a['plataforma'] ?? '', 'campanha' => $a['campanha'] ?? '', 'conjunto' => $a['conjunto'] ?? '',
        'anuncio' => $a['anuncio'] ?? '', 'area_do_direito' => $a['area'] ?? '', 'data_inicio' => $a['inicio'] ?? '', 'data_fim' => $a['fim'] ?? '',
        'investimento' => isset($a['investimento']) && $a['investimento'] !== '' ? (float) $a['investimento'] : null, 'mensagem_pre_preenchida' => $a['mensagem'] ?? '', 'obs' => $a['obs'] ?? ''];
}
function sv_salvar_anuncio(PDO $pdo, array $in, array $quem): array
{
    $codigo = strtoupper(sv_texto($in['codigo'] ?? '', 12));
    if (!preg_match('/^[A-Z]{2,5}-\d{2,3}$/', $codigo)) throw new SvErro('Código do anúncio inválido. Use de 2 a 5 letras, hífen e 2 ou 3 números (ex.: BPC-01).', 422, ['campo' => 'codigo']);
    $a = sv_anuncio_por_codigo($pdo, $codigo);
    $novo = $a === null;
    if ($novo) $a = ['id' => 'an' . nuc_uid(), 'codigo' => $codigo, 'criado' => sv_hoje(), 'plataforma' => 'Meta'];
    $map = ['plataforma' => 'plataforma', 'campanha' => 'campanha', 'conjunto' => 'conjunto', 'anuncio' => 'anuncio', 'area_do_direito' => 'area', 'obs' => 'obs', 'mensagem_pre_preenchida' => 'mensagem'];
    foreach ($map as $k => $int) if (array_key_exists($k, $in)) $a[$int] = sv_texto($in[$k], 200);
    if (array_key_exists('data_inicio', $in)) $a['inicio'] = sv_data($in['data_inicio'], 'data_inicio');
    if (array_key_exists('data_fim', $in)) $a['fim'] = sv_data($in['data_fim'], 'data_fim');
    if (array_key_exists('investimento', $in)) $a['investimento'] = sv_valor($in['investimento'], 'investimento');
    if (empty($a['mensagem'])) $a['mensagem'] = 'Olá! Vim pelo anúncio [' . $codigo . ']';
    sv_gravar($pdo, 'anuncios', $a['id'], $a, $quem);
    return [sv_anuncio_api($a), $novo];
}

/* ======================= leads ======================= */
function sv_lead_api(PDO $pdo, array $l): array
{
    $eq = sv_equipe($pdo);
    $tipo = nuc_tipo_etapa($pdo, (string) ($l['etapa'] ?? ''));
    return ['id' => $l['id'], 'nome' => $l['nome'] ?? '', 'telefone' => $l['telE164'] ?? (sv_telefone_e164((string) ($l['tel'] ?? '')) ?: ($l['tel'] ?? '')),
        'email' => $l['email'] ?? '', 'etapa' => $l['etapa'] ?? '', 'tipo_etapa' => $tipo, 'motivo_perda' => $l['motivoPerda'] ?? '',
        'primeira_mensagem' => $l['primeiraMensagem'] ?? '', 'data_primeiro_contato' => $l['primeiroContato'] ?? ($l['criado'] ?? ''), 'ultimo_contato' => $l['ultimoContato'] ?? '',
        'origem' => $l['origem'] ?? '', 'plataforma' => $l['plataforma'] ?? '', 'codigo_anuncio' => $l['codigoAnuncio'] ?? '', 'campanha' => $l['campanha'] ?? '',
        'conjunto' => $l['conjunto'] ?? '', 'anuncio' => $l['anuncio'] ?? '', 'area_interesse' => $l['produto'] ?? '', 'resumo_triagem' => $l['resumoTriagem'] ?? '', 'canal_whatsapp' => $l['canal'] ?? '', 'veio_de_anuncio' => !empty($l['codigoAnuncio']) || !empty($l['anuncioSemCodigo']),
        'responsavel' => isset($eq[$l['responsavelId'] ?? '']) ? $eq[$l['responsavelId']]['nome'] : ($l['responsavelNome'] ?? ''), 'responsavel_id' => $l['responsavelId'] ?? '',
        'etiquetas' => $l['etiquetas'] ?? '', 'cliente_id' => $l['clienteId'] ?? '', 'convertido' => !empty($l['convertido']), 'data_fechamento' => $l['dataFechamento'] ?? '',
        'historico_etapas' => array_values((array) ($l['historicoEtapas'] ?? [])), 'interacoes' => array_values((array) ($l['interacoes'] ?? []))];
}
function sv_lead(PDO $pdo, string $id): array
{
    $l = nuc_ler($pdo, 'leads', $id);
    if (!$l) throw new SvErro('Lead não encontrado.', 404);
    return $l;
}
function sv_buscar_leads(PDO $pdo, array $f): array
{
    $etapa = sv_texto($f['etapa'] ?? '', 80);
    $tel = sv_texto($f['telefone'] ?? '', 40);
    $desde = isset($f['desde']) && $f['desde'] !== '' ? sv_data($f['desde'], 'desde') : '';
    $e164 = $tel !== '' ? sv_telefone_e164($tel) : '';
    if ($tel !== '' && $e164 === '') throw new SvErro('Telefone inválido para busca.', 422, ['campo' => 'telefone']);
    $out = [];
    foreach (nuc_listar($pdo, 'leads') as $l) {
        if ($etapa !== '' && sv_norm((string) ($l['etapa'] ?? '')) !== sv_norm($etapa)) continue;
        if ($e164 !== '' && ($l['telE164'] ?? sv_telefone_e164((string) ($l['tel'] ?? ''))) !== $e164) continue;
        if ($desde !== '' && (string) (($l['primeiroContato'] ?? '') ?: ($l['criado'] ?? '')) < $desde) continue;
        $out[] = $l;
    }
    usort($out, fn($a, $b) => strcmp((string) (($b['primeiroContato'] ?? '') ?: ($b['criado'] ?? '')), (string) (($a['primeiroContato'] ?? '') ?: ($a['criado'] ?? ''))));
    $lim = max(1, min(200, (int) ($f['limite'] ?? 50)));
    return ['total' => count($out), 'itens' => array_map(fn($l) => sv_lead_api($pdo, $l), array_slice($out, 0, $lim))];
}
function sv_lead_por_tel(PDO $pdo, string $e164): ?array
{
    $st = $pdo->prepare('SELECT lead_id FROM lead_telefones WHERE telefone = ?');
    $st->execute([$e164]);
    $id = $st->fetchColumn();
    if ($id !== false && ($l = nuc_ler($pdo, 'leads', (string) $id))) return $l;
    foreach (nuc_listar($pdo, 'leads') as $l) if (($l['telE164'] ?? sv_telefone_e164((string) ($l['tel'] ?? ''))) === $e164) { sv_indexar_tel($pdo, $e164, (string) $l['id'], true); return $l; }
    return null;
}
/* índice de telefones (chave única): garante que o mesmo número não vire dois leads */
function sv_indexar_tel(PDO $pdo, string $e164, string $id, bool $substituir = false): bool
{
    if ($e164 === '') return false;
    try { $pdo->prepare('INSERT INTO lead_telefones (telefone, lead_id) VALUES (?, ?)')->execute([$e164, $id]); return true; }
    catch (PDOException $e) {
        if ($substituir) $pdo->prepare('UPDATE lead_telefones SET lead_id = ? WHERE telefone = ?')->execute([$id, $e164]);
        return false;
    }
}
/* origem do lead: código do anúncio (informado ou achado na primeira mensagem) → campanha, conjunto e anúncio */
function sv_aplicar_origem(PDO $pdo, array &$l, array $in): void
{
    $codigo = strtoupper(sv_texto($in['codigo_anuncio'] ?? '', 12));
    if ($codigo === '') $codigo = sv_extrair_codigo((string) ($l['primeiraMensagem'] ?? ''), $pdo);
    $plat = sv_texto($in['plataforma'] ?? '', 40);
    if ($plat !== '') $l['plataforma'] = $plat;
    if ($codigo !== '') {
        $l['codigoAnuncio'] = $codigo;
        $a = sv_anuncio_por_codigo($pdo, $codigo);
        if ($a) {
            $l['codigoAnuncio'] = $a['codigo'];
            foreach (['campanha' => 'campanha', 'conjunto' => 'conjunto', 'anuncio' => 'anuncio'] as $k => $int) if (!empty($a[$int])) $l[$k] = $a[$int];
            if (empty($l['produto']) && !empty($a['area'])) $l['produto'] = $a['area'];
            if (empty($l['plataforma'])) $l['plataforma'] = $a['plataforma'] ?? 'Meta';
        }
        $p = sv_norm((string) ($l['plataforma'] ?? 'meta'));
        $l['origem'] = strpos($p, 'google') !== false ? 'Google Ads' : 'Facebook / Instagram Ads';
    } elseif (sv_bool($in['veio_de_anuncio'] ?? false) || sv_texto($in['campanha'] ?? '', 200) !== '' || sv_texto($in['anuncio'] ?? '', 200) !== '') {
        // veio de anúncio (ex.: "Você respondeu a um anúncio" no WhatsApp), mas sem o código: conta como tráfego pago
        $p = sv_norm((string) ($l['plataforma'] ?? 'meta'));
        $l['origem'] = strpos($p, 'google') !== false ? 'Google Ads' : 'Facebook / Instagram Ads';
        $l['anuncioSemCodigo'] = true;
    } elseif (empty($l['codigoAnuncio']) && (empty($l['origem']) || $l['origem'] === SV_ORIGEM_ORGANICA)) {
        $l['origem'] = SV_ORIGEM_ORGANICA;
    }
    foreach (['campanha', 'conjunto', 'anuncio'] as $k) if (isset($in[$k]) && sv_texto($in[$k], 200) !== '') $l[$k] = sv_texto($in[$k], 200);
}
/* os dois números do escritório: o WaSpeed está no Geral; o de salário-maternidade chega pelo Claude */
const SV_CANAIS = ['WhatsApp — Geral', 'WhatsApp — Salário-maternidade'];
function sv_canal_whats(string $txt, string $origem = ''): string
{
    $n = sv_norm($txt);
    if ($n === '') return $origem === 'waspeed' ? SV_CANAIS[0] : '';
    return preg_match('/matern|\bsm\b|2/', $n) ? SV_CANAIS[1] : SV_CANAIS[0];
}
function sv_registrar_lead(PDO $pdo, array $in, array $quem, string $canal = 'api'): array
{
    $e164 = sv_telefone_e164(sv_texto($in['telefone'] ?? '', 40));
    if ($e164 === '') throw new SvErro('Informe um telefone válido (com DDD). Ele é a chave única do lead.', 422, ['campo' => 'telefone']);
    $avisos = [];
    $l = sv_lead_por_tel($pdo, $e164);
    $criado = $l === null;
    if ($criado) {
        $id = 'ld' . nuc_uid();
        // reserva o telefone antes de gravar: se outra chamada chegou junto, usa o lead dela
        if (!sv_indexar_tel($pdo, $e164, $id)) { $l = sv_lead_por_tel($pdo, $e164); $criado = $l === null; }
        if ($criado) $l = ['id' => $id, 'etapa' => nuc_etapa_inicial($pdo), 'criado' => sv_hoje(), 'criadoPor' => $quem['membro'] ?? '', 'historicoEtapas' => [], 'interacoes' => []];
    }
    $l['tel'] = $l['tel'] ?? sv_telefone_exibir($e164);
    if (empty($l['tel'])) $l['tel'] = sv_telefone_exibir($e164);
    $l['telE164'] = $e164;
    $nome = sv_texto($in['nome'] ?? '', 120);
    if ($nome !== '' && (empty($l['nome']) || $criado || !empty($in['substituir_nome']))) $l['nome'] = $nome;
    if (empty($l['nome'])) $l['nome'] = 'Lead ' . sv_telefone_exibir($e164);
    $msg = sv_texto($in['primeira_mensagem'] ?? '', 2000);
    if ($msg !== '' && empty($l['primeiraMensagem'])) $l['primeiraMensagem'] = $msg;
    if (isset($in['data_primeiro_contato']) && $in['data_primeiro_contato'] !== '') {
        $d = sv_data($in['data_primeiro_contato'], 'data_primeiro_contato');
        if ($criado || empty($l['primeiroContato']) || $d < $l['primeiroContato']) $l['primeiroContato'] = $d;
    }
    if (empty($l['primeiroContato'])) $l['primeiroContato'] = $l['criado'] ?? sv_hoje();
    $l['ultimoContato'] = max((string) ($l['ultimoContato'] ?? ''), sv_hoje());
    foreach (['email' => ['email', 190], 'area_interesse' => ['produto', 80], 'resumo_triagem' => ['resumoTriagem', 4000], 'canal_whatsapp' => ['canal', 60]] as $k => [$int, $max])
        if (isset($in[$k]) && sv_texto($in[$k], $max) !== '') $l[$int] = sv_texto($in[$k], $max);
    if (isset($in['responsavel']) && sv_texto($in['responsavel'], 120) !== '') {
        $r = sv_resolver_responsavel($pdo, sv_texto($in['responsavel'], 120));
        if ($r !== '') $l['responsavelId'] = $r;
        else { $l['responsavelNome'] = sv_texto($in['responsavel'], 120); $avisos[] = 'Responsável "' . $l['responsavelNome'] . '" não encontrado na equipe: guardado só como texto.'; }
    }
    if (isset($in['canal_whatsapp']) || $canal === 'waspeed') $l['canal'] = sv_canal_whats((string) ($in['canal_whatsapp'] ?? ''), $canal);
    if (empty($l['produto']) && preg_match('/matern/i', (string) ($l['canal'] ?? ''))) $l['produto'] = 'Salário-maternidade';
    sv_aplicar_origem($pdo, $l, $in);
    if (!empty($l['codigoAnuncio']) && !sv_anuncio_por_codigo($pdo, (string) $l['codigoAnuncio'])) $avisos[] = 'Código de anúncio ' . $l['codigoAnuncio'] . ' não está cadastrado em /anuncios: campanha e anúncio não foram preenchidos.';
    if (isset($in['etapa']) && sv_texto($in['etapa'], 80) !== '') {
        $nova = sv_validar_etapa($pdo, sv_texto($in['etapa'], 80));
        if ($nova !== ($l['etapa'] ?? '')) sv_trocar_etapa($pdo, $l, $nova, sv_texto($in['motivo'] ?? '', 500), $quem, $canal);
    }
    sv_gravar($pdo, 'leads', $l['id'], $l, $quem);
    return ['lead' => sv_lead_api($pdo, $l), 'criado' => $criado, 'avisos' => $avisos];
}
/* muda a etapa e guarda o histórico (de, para, quando, quem, motivo) */
function sv_trocar_etapa(PDO $pdo, array &$l, string $nova, string $motivo, array $quem, string $canal): void
{
    $de = (string) ($l['etapa'] ?? '');
    $tipo = nuc_tipo_etapa($pdo, $nova);
    if ($tipo === 'perdido' && $motivo === '') throw new SvErro('Informe o motivo para mover o lead para "' . $nova . '".', 422, ['campo' => 'motivo']);
    $l['etapa'] = $nova;
    if ($tipo === 'perdido') $l['motivoPerda'] = $motivo;
    if ($tipo === 'ganho' && empty($l['dataFechamento'])) $l['dataFechamento'] = sv_hoje();
    if ($tipo !== 'ganho' && nuc_tipo_etapa($pdo, $de) === 'ganho') $l['dataFechamento'] = '';
    $l['ultimoContato'] = sv_hoje();
    $h = (array) ($l['historicoEtapas'] ?? []);
    $h[] = ['de' => $de, 'para' => $nova, 'data' => sv_hoje(), 'em' => nuc_ms(), 'por' => $quem['nome'] ?? '', 'origem' => $canal, 'motivo' => $motivo];
    $l['historicoEtapas'] = array_slice($h, -200);
}
function sv_mudar_etapa(PDO $pdo, string $id, array $in, array $quem, string $canal = 'api'): array
{
    $l = sv_lead($pdo, $id);
    $nova = sv_validar_etapa($pdo, sv_texto($in['etapa'] ?? '', 80));
    if ($nova === ($l['etapa'] ?? '')) return ['lead' => sv_lead_api($pdo, $l), 'mudou' => false];
    sv_trocar_etapa($pdo, $l, $nova, sv_texto($in['motivo'] ?? '', 500), $quem, $canal);
    sv_gravar($pdo, 'leads', $id, $l, $quem);
    return ['lead' => sv_lead_api($pdo, $l), 'mudou' => true];
}
function sv_registrar_interacao(PDO $pdo, string $id, array $in, array $quem): array
{
    $l = sv_lead($pdo, $id);
    $resumo = sv_texto($in['resumo'] ?? '', 4000);
    if ($resumo === '') throw new SvErro('Informe o resumo da interação.', 422, ['campo' => 'resumo']);
    $it = ['id' => 'it' . nuc_uid(), 'data' => isset($in['data']) && $in['data'] !== '' ? sv_data($in['data'], 'data') : sv_hoje(), 'canal' => sv_texto($in['canal'] ?? 'WhatsApp', 60) ?: 'WhatsApp',
        'resumo' => $resumo, 'proximoPasso' => sv_texto($in['proximo_passo'] ?? '', 1000),
        'dataFollowUp' => isset($in['data_follow_up']) && $in['data_follow_up'] !== '' ? sv_data($in['data_follow_up'], 'data_follow_up') : '', 'em' => nuc_ms(), 'por' => $quem['nome'] ?? ''];
    $l['interacoes'] = array_slice(array_merge((array) ($l['interacoes'] ?? []), [$it]), -500);
    $l['ultimoContato'] = max((string) ($l['ultimoContato'] ?? ''), $it['data']);
    $tarefa = null;
    if ($it['dataFollowUp'] !== '') {
        // o follow-up vira tarefa no sistema, para quem cuida do lead
        $resp = (string) ($l['responsavelId'] ?? '');
        $tarefa = ['id' => 't' . nuc_uid(), 'titulo' => 'Follow-up: ' . ($l['nome'] ?? 'lead') . ($it['proximoPasso'] !== '' ? ' — ' . mb_substr($it['proximoPasso'], 0, 80) : ''),
            'status' => 'todo', 'prioridade' => 'Média', 'prazo' => $it['dataFollowUp'], 'hora' => '', 'responsavelId' => $resp, 'responsaveis' => $resp !== '' ? [$resp] : [],
            'clienteId' => (string) ($l['clienteId'] ?? ''), 'processoId' => '', 'leadId' => $id, 'obs' => 'Lead: ' . ($l['tel'] ?? '') . "\n" . $resumo, 'criadoPor' => $quem['membro'] ?? ''];
        sv_gravar($pdo, 'tarefas', $tarefa['id'], $tarefa, $quem);
        $it['tarefaId'] = $tarefa['id'];
        $l['interacoes'][count($l['interacoes']) - 1] = $it;
    }
    sv_gravar($pdo, 'leads', $id, $l, $quem);
    return ['interacao' => $it, 'tarefa_follow_up_id' => $tarefa['id'] ?? null, 'lead' => sv_lead_api($pdo, $l)];
}

/* ======================= clientes ======================= */
const SV_CAMPOS_CLIENTE = ['nome' => ['nome', 160], 'nacionalidade' => ['nacionalidade', 60], 'estado_civil' => ['estadoCivil', 40], 'profissao' => ['profissao', 120],
    'rg' => ['rg', 30], 'orgao_emissor' => ['orgaoEmissor', 30], 'filiacao' => ['filiacao', 300], 'email' => ['email', 190], 'area_do_caso' => ['produto', 80],
    'objeto' => ['objeto', 2000], 'obs' => ['obs', 4000], 'tipo' => ['tipo', 2]];
const SV_CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
function sv_cliente(PDO $pdo, string $id): array
{
    $c = nuc_ler($pdo, 'clientes', $id);
    if (!$c) throw new SvErro('Cliente não encontrado.', 404);
    return $c;
}
function sv_contratos_do_cliente(PDO $pdo, string $id): array
{
    return array_values(array_filter(nuc_listar($pdo, 'contratos'), fn($k) => ($k['clienteId'] ?? '') === $id));
}
function sv_cliente_api(PDO $pdo, array $c, bool $completo = true): array
{
    $cpf = sv_digitos((string) ($c['doc'] ?? ''));
    $o = ['id' => $c['id'], 'nome' => $c['nome'] ?? '', 'cpf' => strlen($cpf) === 11 ? sv_cpf_formatado($cpf) : ($c['doc'] ?? ''), 'telefone' => $c['telE164'] ?? (sv_telefone_e164((string) ($c['tel'] ?? '')) ?: ($c['tel'] ?? '')),
        'email' => $c['email'] ?? '', 'area_do_caso' => $c['produto'] ?? '', 'status' => $c['status'] ?? '', 'lead_id' => $c['leadId'] ?? '', 'criado_em' => $c['criado'] ?? ''];
    if (!$completo) return $o;
    $o += ['nacionalidade' => $c['nacionalidade'] ?? '', 'estado_civil' => $c['estadoCivil'] ?? '', 'profissao' => $c['profissao'] ?? '', 'rg' => $c['rg'] ?? '', 'orgao_emissor' => $c['orgaoEmissor'] ?? '',
        'data_nascimento' => $c['nascimento'] ?? '', 'filiacao' => $c['filiacao'] ?? '', 'objeto' => $c['objeto'] ?? '', 'justica_gratuita' => !empty($c['justicaGratuita']),
        'endereco' => array_combine(SV_CAMPOS_ENDERECO, array_map(fn($k) => (string) ($c[$k] ?? ''), SV_CAMPOS_ENDERECO)),
        'documentos' => array_values((array) ($c['docsGerados'] ?? [])),
        'contratos' => array_map(fn($k) => ['id' => $k['id'], 'data' => $k['data'] ?? '', 'valor' => (float) ($k['valorTotal'] ?? 0), 'forma' => $k['forma'] ?? '', 'exito_percentual' => (float) ($k['exitoPct'] ?? 0)], sv_contratos_do_cliente($pdo, (string) $c['id'])),
        'drive' => $c['driveLink'] ?? ''];
    return $o;
}
function sv_buscar_clientes(PDO $pdo, array $f): array
{
    $cpf = sv_digitos(sv_texto($f['cpf'] ?? '', 20));
    $nome = sv_norm(sv_texto($f['nome'] ?? '', 120));
    $tel = sv_texto($f['telefone'] ?? '', 40);
    if ($cpf === '' && $nome === '' && $tel === '') throw new SvErro('Informe cpf, nome ou telefone para buscar.', 422);
    $e164 = $tel !== '' ? sv_telefone_e164($tel) : '';
    $out = [];
    foreach (nuc_listar($pdo, 'clientes') as $c) {
        if ($cpf !== '' && sv_digitos((string) ($c['doc'] ?? '')) !== $cpf) continue;
        if ($nome !== '' && strpos(sv_norm((string) ($c['nome'] ?? '')), $nome) === false) continue;
        if ($tel !== '' && ($c['telE164'] ?? sv_telefone_e164((string) ($c['tel'] ?? ''))) !== $e164) continue;
        $out[] = sv_cliente_api($pdo, $c, false);
    }
    return ['total' => count($out), 'itens' => array_slice($out, 0, 50)];
}
/* aplica os campos da API ao cliente (parcial: só os informados) */
function sv_cliente_aplicar(PDO $pdo, array &$c, array $in): void
{
    foreach (SV_CAMPOS_CLIENTE as $k => [$int, $max]) if (array_key_exists($k, $in)) $c[$int] = sv_texto($in[$k], $max);
    if (array_key_exists('tipo', $in) && !in_array($c['tipo'], ['PF', 'PJ'], true)) $c['tipo'] = 'PF';
    if (array_key_exists('nome', $in) && $c['nome'] === '') throw new SvErro('O nome não pode ficar vazio.', 422, ['campo' => 'nome']);
    if (array_key_exists('email', $in) && $c['email'] !== '' && !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) throw new SvErro('E-mail inválido.', 422, ['campo' => 'email']);
    if (array_key_exists('cpf', $in)) {
        $d = sv_digitos(sv_texto($in['cpf'], 20));
        if ($d !== '' && !sv_cpf_valido($d)) throw new SvErro('CPF inválido.', 422, ['campo' => 'cpf']);
        $c['doc'] = $d !== '' ? sv_cpf_formatado($d) : '';
    }
    if (array_key_exists('telefone', $in)) {
        $e = sv_telefone_e164(sv_texto($in['telefone'], 40));
        if (sv_texto($in['telefone'], 40) !== '' && $e === '') throw new SvErro('Telefone inválido.', 422, ['campo' => 'telefone']);
        $c['telE164'] = $e;
        $c['tel'] = $e !== '' ? sv_telefone_exibir($e) : '';
    }
    if (array_key_exists('data_nascimento', $in)) $c['nascimento'] = sv_data($in['data_nascimento'], 'data_nascimento');
    if (array_key_exists('justica_gratuita', $in)) $c['justicaGratuita'] = sv_bool($in['justica_gratuita']);
    $end = $in['endereco'] ?? null;
    if (is_string($end)) { $c['enderecoCompleto'] = sv_texto($end, 400); if (preg_match('/\b(\d{5})-?(\d{3})\b/', $end, $m)) $c['cep'] = "$m[1]-$m[2]"; }
    $fonte = is_array($end) ? $end : $in;
    foreach (SV_CAMPOS_ENDERECO as $k) if (array_key_exists($k, $fonte)) $c[$k] = sv_texto($fonte[$k], $k === 'logradouro' ? 200 : 80);
    if (isset($c['cep']) && $c['cep'] !== '') { $d = sv_digitos((string) $c['cep']); if (strlen($d) !== 8) throw new SvErro('CEP inválido (8 números).', 422, ['campo' => 'cep']); $c['cep'] = substr($d, 0, 5) . '-' . substr($d, 5); }
    if (isset($c['uf']) && $c['uf'] !== '') $c['uf'] = strtoupper(substr((string) $c['uf'], 0, 2));
}
/* honorários informados viram um contrato no sistema (é ele que alimenta metas, financeiro e indicadores) */
function sv_cliente_honorarios(PDO $pdo, array $c, array $in, array $quem): ?string
{
    if (!array_key_exists('honorarios_valor', $in) && !array_key_exists('honorarios_forma', $in) && !array_key_exists('honorarios_exito_percentual', $in)) return null;
    $valor = sv_valor($in['honorarios_valor'] ?? null, 'honorarios_valor');
    $exito = sv_valor($in['honorarios_exito_percentual'] ?? null, 'honorarios_exito_percentual');
    if ($exito !== null && ($exito < 0 || $exito > 100)) throw new SvErro('Percentual de êxito deve estar entre 0 e 100.', 422, ['campo' => 'honorarios_exito_percentual']);
    $k = null;
    foreach (sv_contratos_do_cliente($pdo, (string) $c['id']) as $x) if (!empty($x['viaApi'])) $k = $x;
    if (!$k) $k = ['id' => 'k' . nuc_uid(), 'clienteId' => $c['id'], 'processoId' => '', 'data' => sv_hoje(), 'produto' => $c['produto'] ?? '', 'ambito' => '', 'valorTotal' => 0, 'entrada' => 0,
        'parcelas' => 0, 'forma' => '', 'cac' => 0, 'custos' => 0, 'custosDesc' => '', 'diaVenc' => 10, 'exitoPct' => 0, 'valorParcela' => 0, 'hoAcordo' => 0, 'hoExito' => 0, 'sucumbencia' => 0,
        'titular' => '', 'proposta' => '', 'responsavelId' => $quem['membro'] ?? '', 'viaApi' => true, 'obs' => 'Cadastrado pela automação (API). Complete entrada e parcelas na tela para gerar o financeiro.'];
    if ($valor !== null) $k['valorTotal'] = $valor;
    if (array_key_exists('honorarios_forma', $in)) $k['forma'] = sv_texto($in['honorarios_forma'], 200);
    if ($exito !== null) $k['exitoPct'] = $exito;
    if (empty($k['produto']) && !empty($c['produto'])) $k['produto'] = $c['produto'];
    if (!empty($c['parceiro'])) $k['parceiro'] = $c['parceiro'];
    if (!empty($c['canal']) && empty($k['canal'])) $k['canal'] = $c['canal'];
    sv_gravar($pdo, 'contratos', $k['id'], $k, $quem);
    return $k['id'];
}
function sv_cpf_existente(PDO $pdo, string $doc, string $exceto = ''): ?array
{
    $d = sv_digitos($doc);
    if ($d === '') return null;
    foreach (nuc_listar($pdo, 'clientes') as $c) if (($c['id'] ?? '') !== $exceto && sv_digitos((string) ($c['doc'] ?? '')) === $d) return $c;
    return null;
}
function sv_cadastrar_cliente(PDO $pdo, array $in, array $quem): array
{
    if (sv_texto($in['nome'] ?? '', 160) === '') throw new SvErro('Informe o nome do cliente.', 422, ['campo' => 'nome']);
    $c = ['id' => 'c' . nuc_uid(), 'tipo' => 'PF', 'status' => 'Ativo', 'criado' => sv_hoje(), 'criadoPor' => $quem['membro'] ?? '', 'primeiroContato' => sv_hoje(), 'ultimoContato' => sv_hoje(), 'docsGerados' => []];
    sv_cliente_aplicar($pdo, $c, $in);
    if (($dup = sv_cpf_existente($pdo, (string) ($c['doc'] ?? ''))) !== null) throw new SvErro('Já existe cliente com este CPF.', 409, ['cliente_id' => $dup['id'], 'nome' => $dup['nome'] ?? '']);
    $lead = null;
    if (!empty($in['lead_id'])) {
        $lead = sv_lead($pdo, sv_texto($in['lead_id'], 60));
        if (!empty($lead['clienteId']) && nuc_ler($pdo, 'clientes', (string) $lead['clienteId'])) throw new SvErro('Este lead já foi convertido em cliente.', 409, ['cliente_id' => $lead['clienteId']]);
        $c['leadId'] = $lead['id'];
        foreach (['origem' => 'origem', 'produto' => 'produto', 'email' => 'email', 'canal' => 'canal'] as $de => $para) if (empty($c[$para]) && !empty($lead[$de])) $c[$para] = $lead[$de];
        if (empty($c['tel']) && !empty($lead['telE164'])) { $c['telE164'] = $lead['telE164']; $c['tel'] = sv_telefone_exibir($lead['telE164']); }
        if (!empty($lead['primeiroContato'])) $c['primeiroContato'] = $lead['primeiroContato'];
    }
    if (empty($c['origem'])) $c['origem'] = 'Outro';
    sv_gravar($pdo, 'clientes', $c['id'], $c, $quem);
    $contrato = sv_cliente_honorarios($pdo, $c, $in, $quem);
    $sm = null;
    if ($lead) {
        sv_marcar_convertido($pdo, $lead, (string) $c['id'], $quem);
        // lead de salário-maternidade: o caso já nasce no quadro, em "Documentos", com o checklist básico
        if (preg_match('/maternidade/iu', (string) ($c['produto'] ?? ''))) {
            $obs = trim((string) ($lead['resumoTriagem'] ?? ''));
            $sm = sv_sm_criar($pdo, ['cliente_id' => $c['id'], 'lead_id' => $lead['id'], 'obs' => $obs, 'dpp' => $in['dpp'] ?? ''], $quem)['caso']['id'];
        }
    }
    return ['cliente' => sv_cliente_api($pdo, $c), 'contrato_id' => $contrato] + ($sm ? ['caso_sm_id' => $sm] : []);
}
function sv_marcar_convertido(PDO $pdo, array $lead, string $clienteId, array $quem): void
{
    $lead['convertido'] = true;
    $lead['clienteId'] = $clienteId;
    $ganho = nuc_etapa_do_tipo($pdo, 'ganho');
    if (($lead['etapa'] ?? '') !== $ganho) sv_trocar_etapa($pdo, $lead, $ganho, '', $quem, 'conversao');
    sv_gravar($pdo, 'leads', (string) $lead['id'], $lead, $quem);
}
function sv_atualizar_cliente(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_cliente($pdo, $id);
    sv_cliente_aplicar($pdo, $c, $in);
    if (array_key_exists('cpf', $in) && ($dup = sv_cpf_existente($pdo, (string) ($c['doc'] ?? ''), $id)) !== null) throw new SvErro('Outro cliente já usa este CPF.', 409, ['cliente_id' => $dup['id']]);
    $c['ultimoContato'] = sv_hoje();
    sv_gravar($pdo, 'clientes', $id, $c, $quem);
    $contrato = sv_cliente_honorarios($pdo, $c, $in, $quem);
    return ['cliente' => sv_cliente_api($pdo, $c), 'contrato_id' => $contrato];
}
function sv_anexar_documento(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_cliente($pdo, $id);
    $tipo = sv_texto($in['tipo'] ?? '', 40);
    if (!in_array($tipo, SV_TIPOS_DOC, true)) throw new SvErro('Tipo de documento inválido. Use: ' . implode(', ', SV_TIPOS_DOC) . '.', 422, ['campo' => 'tipo']);
    $url = sv_texto($in['url'] ?? '', 1000);
    if (!preg_match('#^https://[^\s]+$#', $url)) throw new SvErro('Informe a URL do documento começando com https:// (ex.: link do Google Docs).', 422, ['campo' => 'url']);
    $doc = ['id' => 'dg' . nuc_uid(), 'tipo' => $tipo, 'url' => $url, 'titulo' => sv_texto($in['titulo'] ?? '', 200),
        'data' => isset($in['data']) && $in['data'] !== '' ? sv_data($in['data'], 'data') : sv_hoje(), 'em' => nuc_ms(), 'por' => $quem['nome'] ?? ''];
    $c['docsGerados'] = array_values(array_merge((array) ($c['docsGerados'] ?? []), [$doc]));
    sv_gravar($pdo, 'clientes', $id, $c, $quem);
    return ['documento' => $doc, 'cliente_id' => $id];
}
function sv_converter_lead(PDO $pdo, string $id, array $in, array $quem): array
{
    $l = sv_lead($pdo, $id);
    if (!empty($l['clienteId']) && nuc_ler($pdo, 'clientes', (string) $l['clienteId'])) throw new SvErro('Este lead já foi convertido em cliente.', 409, ['cliente_id' => $l['clienteId']]);
    $dados = $in + ['nome' => $l['nome'] ?? '', 'email' => $l['email'] ?? '', 'area_do_caso' => $l['produto'] ?? '', 'telefone' => $l['telE164'] ?? ($l['tel'] ?? '')];
    $dados['lead_id'] = $id;
    return sv_cadastrar_cliente($pdo, $dados, $quem);
}

/* ======================= relatório por anúncio e campanha ======================= */
function sv_relatorio_anuncios(PDO $pdo, array $f): array
{
    $desde = isset($f['desde']) && $f['desde'] !== '' ? sv_data($f['desde'], 'desde') : '';
    $ate = isset($f['ate']) && $f['ate'] !== '' ? sv_data($f['ate'], 'ate') : '';
    $anuncios = [];
    foreach (sv_anuncios($pdo) as $a) $anuncios[sv_codigo_chave((string) $a['codigo'])] = $a;
    $porAnuncio = [];
    $porCampanha = [];
    $ini = function (string $k, array $base) use (&$porAnuncio) { if (!isset($porAnuncio[$k])) $porAnuncio[$k] = $base + ['leads' => 0, 'fechados' => 0, 'perdidos' => 0, 'em_andamento' => 0]; };
    foreach ($anuncios as $k => $a) $ini($k, ['codigo' => $a['codigo'], 'campanha' => $a['campanha'] ?? '', 'conjunto' => $a['conjunto'] ?? '', 'anuncio' => $a['anuncio'] ?? '', 'area' => $a['area'] ?? '', 'investimento' => (float) ($a['investimento'] ?? 0)]);
    foreach (nuc_listar($pdo, 'leads') as $l) {
        $d = (string) (($l['primeiroContato'] ?? '') ?: ($l['criado'] ?? ''));
        if (($desde !== '' && $d < $desde) || ($ate !== '' && $d > $ate)) continue;
        $cod = (string) ($l['codigoAnuncio'] ?? '');
        $k = $cod !== '' ? sv_codigo_chave($cod) : SV_ORIGEM_ORGANICA;
        $ini($k, ['codigo' => $cod !== '' ? $cod : SV_ORIGEM_ORGANICA, 'campanha' => $l['campanha'] ?? '', 'conjunto' => $l['conjunto'] ?? '', 'anuncio' => $l['anuncio'] ?? '', 'area' => '', 'investimento' => 0.0]);
        $tipo = nuc_tipo_etapa($pdo, (string) ($l['etapa'] ?? ''));
        $porAnuncio[$k]['leads']++;
        if ($tipo === 'ganho' || !empty($l['convertido'])) $porAnuncio[$k]['fechados']++;
        elseif ($tipo === 'perdido' || $tipo === 'parceiro') $porAnuncio[$k]['perdidos']++;
        else $porAnuncio[$k]['em_andamento']++;
    }
    $linhas = [];
    foreach ($porAnuncio as $r) {
        $r['taxa_conversao'] = $r['leads'] ? round($r['fechados'] / $r['leads'] * 100, 1) : 0.0;
        $r['custo_por_lead'] = $r['investimento'] > 0 && $r['leads'] ? round($r['investimento'] / $r['leads'], 2) : null;
        $r['custo_por_cliente'] = $r['investimento'] > 0 && $r['fechados'] ? round($r['investimento'] / $r['fechados'], 2) : null;
        $linhas[] = $r;
        $c = $r['codigo'] === SV_ORIGEM_ORGANICA ? SV_ORIGEM_ORGANICA : (($r['campanha'] ?? '') !== '' ? $r['campanha'] : 'Sem campanha cadastrada');
        if (!isset($porCampanha[$c])) $porCampanha[$c] = ['campanha' => $c, 'anuncios' => 0, 'leads' => 0, 'fechados' => 0, 'perdidos' => 0, 'investimento' => 0.0];
        $porCampanha[$c]['anuncios']++;
        foreach (['leads', 'fechados', 'perdidos', 'investimento'] as $x) $porCampanha[$c][$x] += $r[$x];
    }
    usort($linhas, fn($a, $b) => $b['leads'] <=> $a['leads'] ?: strcmp((string) $a['codigo'], (string) $b['codigo']));
    $camp = array_values($porCampanha);
    foreach ($camp as &$c) { $c['taxa_conversao'] = $c['leads'] ? round($c['fechados'] / $c['leads'] * 100, 1) : 0.0; $c['custo_por_cliente'] = $c['investimento'] > 0 && $c['fechados'] ? round($c['investimento'] / $c['fechados'], 2) : null; }
    unset($c);
    usort($camp, fn($a, $b) => $b['leads'] <=> $a['leads']);
    $tl = array_sum(array_column($linhas, 'leads'));
    $tf = array_sum(array_column($linhas, 'fechados'));
    return ['periodo' => ['desde' => $desde, 'ate' => $ate], 'totais' => ['leads' => $tl, 'fechados' => $tf, 'taxa_conversao' => $tl ? round($tf / $tl * 100, 1) : 0.0],
        'por_anuncio' => $linhas, 'por_campanha' => $camp];
}

/* ======================= tabelas novas e migrations (com backup e reversão) ======================= */
function sv_ddl(PDO $pdo): array
{
    $my = sv_mysql($pdo);
    $auto = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $txt = $my ? 'MEDIUMTEXT' : 'TEXT';
    $fim = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    return [
        'api_chaves' => "CREATE TABLE IF NOT EXISTS api_chaves (id $auto, nome VARCHAR(120) NOT NULL, prefixo VARCHAR(16) NOT NULL, hash CHAR(64) NOT NULL UNIQUE,
            escopos VARCHAR(400) NOT NULL, criado_por INT, criado_em BIGINT NOT NULL, ultimo_uso BIGINT, revogada_em BIGINT)$fim",
        'api_log' => "CREATE TABLE IF NOT EXISTS api_log (id $auto, em BIGINT NOT NULL, quem VARCHAR(190) NOT NULL, auth VARCHAR(10) NOT NULL, ip VARCHAR(45),
            metodo VARCHAR(8) NOT NULL, rota VARCHAR(255) NOT NULL, status INT NOT NULL, recurso VARCHAR(80), ms INT)$fim",
        'api_limite' => "CREATE TABLE IF NOT EXISTS api_limite (chave VARCHAR(190) NOT NULL, janela BIGINT NOT NULL, n INT NOT NULL, PRIMARY KEY (chave, janela))$fim",
        'webhook_log' => "CREATE TABLE IF NOT EXISTS webhook_log (id $auto, em BIGINT NOT NULL, origem VARCHAR(20) NOT NULL, ip VARCHAR(45), evento VARCHAR(80),
            status VARCHAR(20) NOT NULL, detalhe VARCHAR(500), lead_id VARCHAR(60), payload $txt)$fim",
        'oauth_clientes' => "CREATE TABLE IF NOT EXISTS oauth_clientes (client_id VARCHAR(190) NOT NULL PRIMARY KEY, nome VARCHAR(190), redirect_uris TEXT NOT NULL,
            segredo_hash CHAR(64), origem VARCHAR(10) NOT NULL, criado_em BIGINT NOT NULL)$fim",
        'oauth_codigos' => "CREATE TABLE IF NOT EXISTS oauth_codigos (hash CHAR(64) NOT NULL PRIMARY KEY, client_id VARCHAR(190) NOT NULL, usuario_id INT NOT NULL, redirect_uri TEXT NOT NULL,
            desafio VARCHAR(128) NOT NULL, escopo VARCHAR(190), recurso VARCHAR(400), expira BIGINT NOT NULL, usado TINYINT NOT NULL DEFAULT 0)$fim",
        'oauth_tokens' => "CREATE TABLE IF NOT EXISTS oauth_tokens (id $auto, hash CHAR(64) NOT NULL UNIQUE, tipo VARCHAR(10) NOT NULL, client_id VARCHAR(190) NOT NULL, usuario_id INT NOT NULL,
            escopo VARCHAR(190), familia VARCHAR(40) NOT NULL, expira BIGINT NOT NULL, revogado TINYINT NOT NULL DEFAULT 0, criado_em BIGINT NOT NULL)$fim",
        'lead_telefones' => "CREATE TABLE IF NOT EXISTS lead_telefones (telefone VARCHAR(20) NOT NULL PRIMARY KEY, lead_id VARCHAR(60) NOT NULL)$fim",
    ];
}
function sv_tabela_migracoes(PDO $pdo): void
{
    $txt = sv_mysql($pdo) ? 'MEDIUMTEXT' : 'TEXT';
    $pdo->exec("CREATE TABLE IF NOT EXISTS schema_migracoes (versao VARCHAR(60) NOT NULL PRIMARY KEY, aplicada_em BIGINT NOT NULL, detalhes $txt)" . (sv_mysql($pdo) ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : ''));
}
function sv_migrado(PDO $pdo): bool
{
    static $cache = null;
    if ($cache !== null) return $cache;
    try { $st = $pdo->prepare('SELECT 1 FROM schema_migracoes WHERE versao = ?'); $st->execute([SV_MIGRACAO]); return $cache = (bool) $st->fetchColumn(); }
    catch (PDOException $e) { return $cache = false; }
}
function mig_estado(PDO $pdo): array
{
    sv_tabela_migracoes($pdo);
    $st = $pdo->prepare('SELECT aplicada_em, detalhes FROM schema_migracoes WHERE versao = ?');
    $st->execute([SV_MIGRACAO]);
    $r = $st->fetch();
    return ['versao' => SV_MIGRACAO, 'aplicada' => (bool) $r, 'aplicada_em' => $r ? (int) $r['aplicada_em'] : null, 'detalhes' => $r ? json_decode((string) $r['detalhes'], true) : null];
}
/* o que a migração vai fazer, sem gravar nada */
function mig_previa(PDO $pdo): array
{
    $mapa = [];
    $desconhecidas = [];
    $tels = [];
    $semTel = 0;
    $leads = nuc_listar($pdo, 'leads');
    foreach ($leads as $l) {
        $e = (string) ($l['etapa'] ?? '');
        $novo = SV_MAPA_ETAPAS[$e] ?? null;
        if ($novo === null) { $desconhecidas[$e] = ($desconhecidas[$e] ?? 0) + 1; $novo = 'Novo lead'; }
        $mapa["$e → $novo"] = ($mapa["$e → $novo"] ?? 0) + 1;
        $t = sv_telefone_e164((string) ($l['tel'] ?? ''));
        if ($t === '') $semTel++;
        else $tels[$t][] = ['id' => $l['id'], 'nome' => $l['nome'] ?? '', 'etapa' => $e];
    }
    $dups = [];
    foreach ($tels as $t => $ls) if (count($ls) > 1) $dups[] = ['telefone' => $t, 'leads' => $ls];
    return ['total_leads' => count($leads), 'mapeamento' => $mapa, 'etapas_desconhecidas' => $desconhecidas, 'telefones_duplicados' => $dups, 'leads_sem_telefone' => $semTel,
        'novas_etapas' => array_map(fn($e) => ['nome' => $e[0], 'tipo' => $e[1]], NUC_FUNIL_PADRAO), 'tabelas_novas' => array_keys(sv_ddl($pdo)),
        'observacao' => 'Telefones duplicados não são juntados: o primeiro lead fica com o telefone no índice e os outros aparecem aqui para vocês decidirem.'];
}
/* cópia de segurança antes de mexer no banco: arquivo SQLite inteiro (VACUUM INTO) e export JSON completo */
function mig_backup(PDO $pdo, array $cfg, string $quando): array
{
    $dir = nuc_pasta($cfg, 'backups');
    $arqs = [];
    $out = ['gerado_em' => date('c'), 'motivo' => 'antes da migração ' . SV_MIGRACAO . " ($quando)", 'registros' => [], 'usuarios' => []];
    foreach ($pdo->query('SELECT colecao, id, dados, excluido FROM registros') as $r) $out['registros'][] = $r;
    foreach ($pdo->query('SELECT id, nome, email, papel, ativo FROM usuarios') as $u) $out['usuarios'][] = $u;
    $nome = $dir . '/pre-migracao-' . $quando . '-' . date('Ymd-His') . '.json.gz';
    if (file_put_contents($nome, gzencode(json_encode($out, JSON_UNESCAPED_UNICODE), 9)) === false) throw new SvErro('Não foi possível gravar o backup. Nada foi alterado.', 500);
    $arqs[] = basename($nome);
    if (!sv_mysql($pdo)) {
        $copia = $dir . '/pre-migracao-' . $quando . '-' . date('Ymd-His') . '.sqlite';
        try { $pdo->exec('VACUUM INTO ' . $pdo->quote($copia)); $arqs[] = basename($copia); } catch (PDOException $e) { /* SQLite antigo: fica o export JSON */ }
    }
    return $arqs;
}
function mig_aplicar(PDO $pdo, array $cfg): array
{
    if (mig_estado($pdo)['aplicada']) throw new SvErro('A migração já foi aplicada.', 409);
    $previa = mig_previa($pdo);
    $backup = mig_backup($pdo, $cfg, 'aplicar');
    foreach (sv_ddl($pdo) as $sql) $pdo->exec($sql);
    $pdo->beginTransaction();
    try {
        $f = nuc_config($pdo, 'funil');
        if (empty($f['etapas'])) nuc_gravar($pdo, 'config', 'funil', ['etapas' => array_map(fn($e) => ['nome' => $e[0], 'tipo' => $e[1]], NUC_FUNIL_PADRAO)]);
        $n = 0;
        foreach (nuc_listar($pdo, 'leads') as $l) {
            $e = (string) ($l['etapa'] ?? '');
            $l['etapaAntesMigracao'] = $e;
            $l['etapa'] = SV_MAPA_ETAPAS[$e] ?? 'Novo lead';
            if ($l['etapa'] === 'Perdido' && empty($l['motivoPerda'])) $l['motivoPerda'] = 'Não informado (antes da migração)';
            $t = sv_telefone_e164((string) ($l['tel'] ?? ''));
            if ($t !== '') { $l['telE164'] = $t; sv_indexar_tel($pdo, $t, (string) $l['id']); }
            if (empty($l['origem'])) $l['origem'] = empty($l['campanha']) ? SV_ORIGEM_ORGANICA : 'Facebook / Instagram Ads';
            nuc_gravar($pdo, 'leads', (string) $l['id'], $l);
            $n++;
        }
        $det = ['leads_convertidos' => $n, 'mapeamento' => $previa['mapeamento'], 'telefones_duplicados' => count($previa['telefones_duplicados']), 'backup' => $backup];
        $pdo->prepare('INSERT INTO schema_migracoes (versao, aplicada_em, detalhes) VALUES (?,?,?)')->execute([SV_MIGRACAO, nuc_ms(), json_encode($det, JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        foreach (array_keys(sv_ddl($pdo)) as $t) $pdo->exec("DROP TABLE IF EXISTS $t");
        throw new SvErro('A migração falhou e nada foi alterado: ' . $e->getMessage(), 500);
    }
    return ['ok' => true, 'backup' => $backup, 'leads_convertidos' => $n, 'previa' => $previa];
}
function mig_reverter(PDO $pdo, array $cfg): array
{
    if (!mig_estado($pdo)['aplicada']) throw new SvErro('A migração não está aplicada.', 409);
    $backup = mig_backup($pdo, $cfg, 'reverter');
    $pdo->beginTransaction();
    try {
        $n = 0;
        foreach (nuc_listar($pdo, 'leads') as $l) {
            $e = (string) ($l['etapa'] ?? '');
            // quem já existia volta para a etapa antiga; quem nasceu depois usa o mapa de volta
            $ant = (string) ($l['etapaAntesMigracao'] ?? '');
            if ($ant !== '' && (SV_MAPA_ETAPAS[$ant] ?? 'Novo lead') === $e) $l['etapa'] = $ant; // não mudou depois da migração
            else $l['etapa'] = SV_MAPA_VOLTA[$e] ?? ($ant !== '' ? $ant : 'Novo contato');
            unset($l['etapaAntesMigracao']);
            nuc_gravar($pdo, 'leads', (string) $l['id'], $l);
            $n++;
        }
        nuc_gravar($pdo, 'config', 'funil', ['etapas' => []]); // as telas voltam para a lista antiga
        $pdo->prepare('DELETE FROM schema_migracoes WHERE versao = ?')->execute([SV_MIGRACAO]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw new SvErro('Não foi possível reverter: ' . $e->getMessage(), 500);
    }
    foreach (array_keys(sv_ddl($pdo)) as $t) $pdo->exec("DROP TABLE IF EXISTS $t");
    return ['ok' => true, 'backup' => $backup, 'leads_revertidos' => $n];
}

/* ======================= webhook do WaSpeed ======================= */
/* Onde procurar cada dado no JSON que o WaSpeed envia. Os caminhos podem ser trocados em
   Configurações → API e conector (campo "caminhos"), sem mexer neste código. */
const WSP_CAMINHOS = [
    'evento' => ['event', 'evento', 'type', 'tipo', 'action', 'acao', 'data.event'],
    'telefone' => ['phone', 'telefone', 'number', 'numero', 'whatsapp', 'wa_id', 'chatId', 'chat_id', 'jid', 'remoteJid', 'from', 'sender',
        'contact.phone', 'contact.number', 'contato.telefone', 'data.phone', 'data.number', 'data.from', 'data.chatId', 'data.contact.phone', 'data.contact.number', 'data.key.remoteJid', 'message.from'],
    'nome' => ['name', 'nome', 'pushName', 'contactName', 'contact_name', 'sender_name', 'contact.name', 'contato.nome', 'data.name', 'data.pushName', 'data.contact.name', 'data.contactName'],
    'mensagem' => ['message', 'mensagem', 'text', 'body', 'content', 'message.text', 'message.body', 'message.conversation', 'mensagem.texto',
        'data.message', 'data.text', 'data.body', 'data.message.text', 'data.message.body', 'data.message.conversation'],
    'coluna' => ['column', 'coluna', 'columnName', 'column_name', 'stage', 'etapa', 'kanban', 'kanban.column', 'kanban.coluna', 'data.column', 'data.columnName', 'data.stage', 'data.kanban.column', 'data.coluna'],
    'etiquetas' => ['labels', 'etiquetas', 'tags', 'label', 'etiqueta', 'contact.labels', 'data.labels', 'data.tags', 'data.etiquetas'],
    'de_mim' => ['fromMe', 'from_me', 'data.fromMe', 'message.fromMe', 'data.message.fromMe', 'data.key.fromMe'],
];
function wsp_config(PDO $pdo): array
{
    $c = nuc_config($pdo, 'waspeed');
    return ['caminhos' => is_array($c['caminhos'] ?? null) ? $c['caminhos'] : [], 'colunas' => is_array($c['colunas'] ?? null) ? $c['colunas'] : []];
}
function wsp_pegar(array $p, string $caminho)
{
    $v = $p;
    foreach (explode('.', $caminho) as $parte) {
        if (preg_match('/^(\w+)\[(\d+)\]$/', $parte, $m)) { $v = $v[$m[1]][(int) $m[2]] ?? null; }
        elseif (is_array($v) && array_key_exists($parte, $v)) $v = $v[$parte];
        else return null;
        if ($v === null) return null;
    }
    return $v;
}
/* procura o nome da chave em qualquer nível (último recurso, quando nenhum caminho bateu) */
function wsp_procurar(array $p, array $nomes, int $prof = 0)
{
    if ($prof > 5) return null;
    foreach ($p as $k => $v) if (is_string($k) && in_array(mb_strtolower($k), $nomes, true) && $v !== null && $v !== '' && $v !== []) return $v;
    foreach ($p as $v) if (is_array($v) && ($r = wsp_procurar($v, $nomes, $prof + 1)) !== null) return $r;
    return null;
}
function wsp_texto_de($v): string
{
    if (is_array($v)) foreach (['name', 'nome', 'title', 'titulo', 'text', 'body', 'label'] as $k) if (isset($v[$k]) && is_scalar($v[$k])) return (string) $v[$k];
    return is_scalar($v) ? (string) $v : '';
}
function wsp_extrair(array $p, array $cfg): array
{
    $out = [];
    $lid = '';
    // "…@lid", "…@g.us" (grupo), "…@newsletter" e "status@broadcast" não são telefones: procura o número em outro campo
    $naoTel = fn($v) => is_scalar($v) && preg_match('/@(lid|g\.us|newsletter|broadcast)\b/i', (string) $v);
    foreach (WSP_CAMINHOS as $campo => $caminhos) {
        $lista = !empty($cfg['caminhos'][$campo]) ? array_merge([(string) $cfg['caminhos'][$campo]], $caminhos) : $caminhos;
        $v = null;
        foreach ($lista as $c) {
            $v = wsp_pegar($p, $c);
            if ($campo === 'telefone' && $naoTel($v)) { if ($lid === '' && stripos((string) $v, '@lid') !== false) $lid = (string) $v; $v = null; continue; }
            if ($v !== null && $v !== '' && $v !== []) break;
        }
        if ($v === null || $v === '' || $v === []) $v = wsp_procurar($p, array_map(fn($c) => mb_strtolower((string) preg_replace('/^.*\./', '', $c)), $caminhos));
        if ($campo === 'telefone' && $naoTel($v)) { if ($lid === '' && stripos((string) $v, '@lid') !== false) $lid = (string) $v; $v = null; }
        $out[$campo] = $v;
    }
    $tel = wsp_texto_de($out['telefone']);
    $etq = [];
    foreach ((array) ($out['etiquetas'] ?? []) as $e) { $t = sv_texto(wsp_texto_de($e), 60); if ($t !== '') $etq[] = $t; }
    if (is_string($out['etiquetas'] ?? null)) $etq = array_filter(array_map('trim', explode(',', $out['etiquetas'])));
    return ['evento' => sv_texto(wsp_texto_de($out['evento']), 80), 'telefone' => strpos($tel, '@g.us') !== false ? '' : $tel, 'nome' => sv_texto(wsp_texto_de($out['nome']), 120),
        'mensagem' => sv_texto(wsp_texto_de($out['mensagem']), 2000), 'coluna' => sv_texto(wsp_texto_de($out['coluna']), 80), 'etiquetas' => array_values($etq),
        'de_mim' => $out['de_mim'] !== null && !is_array($out['de_mim']) && sv_bool($out['de_mim']), 'lid' => $lid];
}
function wsp_etapa_da_coluna(PDO $pdo, string $coluna, array $cfg): string
{
    if ($coluna === '') return '';
    foreach ($cfg['colunas'] as $col => $etapa) if (sv_norm((string) $col) === sv_norm($coluna) && trim((string) $etapa) !== '') return sv_validar_etapa($pdo, (string) $etapa);
    foreach (nuc_funil($pdo) as $e) if (sv_norm($e['nome']) === sv_norm($coluna)) return $e['nome'];
    return '';
}
/* cria/atualiza o lead pelo telefone, lê o código do anúncio e espelha a coluna do Kanban do WaSpeed */
function wsp_processar(PDO $pdo, array $payload): array
{
    $cfg = wsp_config($pdo);
    $x = wsp_extrair($payload, $cfg);
    if ($x['telefone'] === '' || sv_telefone_e164($x['telefone']) === '') return ['status' => 'ignorado', 'extraido' => $x, 'detalhe' => $x['lid'] !== ''
        ? 'O WaSpeed mandou só o identificador interno do WhatsApp (' . $x['lid'] . '), sem o número de telefone. Confira em "Dados a enviar" se há opção de enviar o número.'
        : 'Telefone não encontrado no evento: ajuste o mapeamento em Configurações → API e conector.'];
    $quem = ['tipo' => 'webhook', 'nome' => 'WaSpeed', 'uid' => null, 'membro' => ''];
    $in = ['telefone' => $x['telefone'], 'nome' => $x['nome'], 'plataforma' => ''];
    if ($x['mensagem'] !== '' && !$x['de_mim']) { $in['primeira_mensagem'] = $x['mensagem']; $in['data_primeiro_contato'] = sv_hoje(); }
    $r = sv_registrar_lead($pdo, $in, $quem, 'waspeed');
    $l = sv_lead($pdo, $r['lead']['id']);
    $det = [$r['criado'] ? 'Lead criado' : 'Lead atualizado'];
    $mudou = false;
    if ($x['etiquetas']) {
        $atuais = array_filter(array_map('trim', explode(',', (string) ($l['etiquetas'] ?? ''))));
        $l['etiquetas'] = implode(', ', array_values(array_unique(array_merge($atuais, $x['etiquetas']))));
        $mudou = true;
    }
    if ($x['coluna'] !== '') {
        $l['waspeedColuna'] = $x['coluna'];
        $mudou = true;
        $etapa = wsp_etapa_da_coluna($pdo, $x['coluna'], $cfg);
        if ($etapa === '') $det[] = 'coluna "' . $x['coluna'] . '" sem etapa correspondente (cadastre no mapeamento)';
        elseif ($etapa !== ($l['etapa'] ?? '')) {
            $motivo = nuc_tipo_etapa($pdo, $etapa) === 'perdido' ? 'Movido para "' . $x['coluna'] . '" no WaSpeed' : '';
            sv_trocar_etapa($pdo, $l, $etapa, $motivo, $quem, 'waspeed');
            $det[] = 'etapa → ' . $etapa;
        }
    }
    if ($mudou) sv_gravar($pdo, 'leads', (string) $l['id'], $l, $quem);
    if (!empty($l['codigoAnuncio'])) $det[] = 'anúncio ' . $l['codigoAnuncio'];
    return ['status' => 'ok', 'detalhe' => implode('; ', $det), 'lead_id' => (string) $l['id'], 'extraido' => $x];
}

/* ======================= limites e limpeza ======================= */
function sv_limite(PDO $pdo, string $chave, int $max, int $janelaSeg): bool
{
    $j = intdiv(time(), $janelaSeg);
    $up = $pdo->prepare('UPDATE api_limite SET n = n + 1 WHERE chave = ? AND janela = ?');
    $up->execute([$chave, $j]);
    if ($up->rowCount() === 0) {
        try { $pdo->prepare('INSERT INTO api_limite (chave, janela, n) VALUES (?, ?, 1)')->execute([$chave, $j]); }
        catch (PDOException $e) { $up->execute([$chave, $j]); }
    }
    $st = $pdo->prepare('SELECT n FROM api_limite WHERE chave = ? AND janela = ?');
    $st->execute([$chave, $j]);
    return (int) $st->fetchColumn() <= $max;
}
function sv_limpeza(PDO $pdo): void
{
    if (!sv_migrado($pdo)) return;
    $agora = nuc_ms();
    $pdo->prepare('DELETE FROM api_log WHERE em < ?')->execute([$agora - 365 * 86400000]);      // log de acesso: 12 meses
    $pdo->prepare('DELETE FROM webhook_log WHERE em < ?')->execute([$agora - 30 * 86400000]);  // payload bruto: 30 dias
    $pdo->prepare('DELETE FROM api_limite WHERE janela < ?')->execute([intdiv(time(), 60) - 1440]);
    $pdo->prepare('DELETE FROM oauth_codigos WHERE expira < ?')->execute([$agora]);
    $pdo->prepare('DELETE FROM oauth_tokens WHERE expira < ?')->execute([$agora - 30 * 86400000]);
}

/* =========================================================
   SALÁRIO-MATERNIDADE pela API/conector (mesmas regras da tela)
   - o servidor grava os dados do caso; o financeiro (honorários e reembolso de guia) é montado pelo sistema
     na próxima abertura (reconciliação com ids fixos, que nunca duplica). Quando o lançamento já existe,
     o recebimento da parcela do INSS já libera a cobrança aqui mesmo.
   ========================================================= */
const SV_SM_CATEG = ['A definir (triagem)', 'Empregada (CLT)', 'Desempregada (período de graça)', 'Desempregada', 'Contribuinte individual', 'MEI', 'Facultativa', 'Segurada especial (rural)', 'Empregada doméstica', 'Trabalhadora avulsa'];
const SV_SM_ESTRAT = ['Via vínculo empregatício', 'Via guias (recolhimento)', 'Via período de graça', 'Via segurada especial (rural)', 'Via MEI (DAS)'];
const SV_SM_DESFECHOS = ['Concluído', 'Indeferido', 'Recurso / judicial'];
const SV_GPS = ['1406' => 20, '1473' => 11, '1929' => 5, '1007' => 20, '1163' => 11, 'DAS-MEI' => 5, 'Outro' => 0];
const SV_SALARIO_MINIMO = [2024 => 1412, 2025 => 1518, 2026 => 1621];
const SV_SM_DOCS_BASE = ['RG e CPF da segurada', 'Certidão de nascimento da criança (ou atestado/termo de guarda)', 'CNIS atualizado', 'Comprovante de residência'];

function sv_pascoa(int $ano): string
{
    $a = $ano % 19; $b = intdiv($ano, 100); $c = $ano % 100; $d = intdiv($b, 4); $e = $b % 4; $f = intdiv($b + 8, 25); $g = intdiv($b - $f + 1, 3);
    $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4; $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
    $mes = intdiv($h + $l - 7 * $m + 114, 31); $dia = (($h + $l - 7 * $m + 114) % 31) + 1;
    return sprintf('%04d-%02d-%02d', $ano, $mes, $dia);
}
function sv_mais_dias(string $d, int $n): string { return date('Y-m-d', strtotime("$d 12:00 $n day")); }
/* dia útil: sem sábado, domingo, feriados nacionais (fixos e móveis) e os feriados locais cadastrados no escritório */
function sv_dia_util(PDO $pdo, string $d): bool
{
    static $locais = null;
    $dw = (int) date('w', strtotime("$d 12:00"));
    if ($dw === 0 || $dw === 6) return false;
    $ano = (int) substr($d, 0, 4);
    $p = sv_pascoa($ano);
    $f = array_map(fn($md) => "$ano-$md", ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);
    array_push($f, sv_mais_dias($p, -48), sv_mais_dias($p, -47), sv_mais_dias($p, -2), sv_mais_dias($p, 60));
    if ($locais === null) { $locais = []; $esc = nuc_config($pdo, 'escritorio') ?: [];
        foreach (preg_split('/\n|;/', (string) ($esc['feriados'] ?? '')) as $l) if (preg_match('/^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/', $l, $m)) $locais[] = [(int) $m[1], (int) $m[2], isset($m[3]) ? (int) $m[3] : 0]; }
    foreach ($locais as [$dd, $mm, $aa]) if ((!$aa || $aa === $ano)) $f[] = sprintf('%04d-%02d-%02d', $ano, $mm, $dd);
    return !in_array($d, $f, true);
}
function sv_uteis_depois(PDO $pdo, string $d, int $n): string { while ($n > 0) { $d = sv_mais_dias($d, 1); if (sv_dia_util($pdo, $d)) $n--; } return $d; }
function sv_venc_guia(PDO $pdo, string $comp, string $cod): string
{
    $d = date('Y-m', strtotime("$comp-01 12:00 +1 month")) . ($cod === 'DAS-MEI' ? '-20' : '-15');
    while (!sv_dia_util($pdo, $d)) $d = sv_mais_dias($d, 1);
    return $d;
}
function sv_salario_minimo(PDO $pdo, string $comp): float
{
    $a = (int) substr($comp, 0, 4);
    if (isset(SV_SALARIO_MINIMO[$a])) return (float) SV_SALARIO_MINIMO[$a];
    $esc = nuc_config($pdo, 'escritorio') ?: [];
    return (float) ($esc['salarioMinimo'] ?? 1621) ?: 1621.0;
}
function sv_valor_guia(PDO $pdo, string $comp, string $cod): float { return round(sv_salario_minimo($pdo, $comp) * (SV_GPS[$cod] ?? 0)) / 100; }
function sv_competencia($v, string $campo): string
{
    $s = sv_texto($v, 10);
    if (preg_match('/^(\d{4})-(\d{2})$/', $s, $m) || preg_match('/^(\d{2})\/(\d{4})$/', $s, $n)) {
        [$a, $mes] = isset($m[1]) ? [$m[1], $m[2]] : [$n[2], $n[1]];
        if ((int) $mes >= 1 && (int) $mes <= 12) return "$a-$mes";
    }
    throw new SvErro("Competência inválida em \"$campo\". Use AAAA-MM (ex.: 2026-03).", 422, ['campo' => $campo]);
}
function sv_opcao($v, array $lista, string $campo): string
{
    $s = sv_texto($v, 120);
    if ($s === '') return '';
    foreach ($lista as $o) if (sv_norm($o) === sv_norm($s)) return $o;
    foreach ($lista as $o) if (strpos(sv_norm($o), sv_norm($s)) !== false) return $o;
    throw new SvErro("Valor inválido em \"$campo\". Use: " . implode(', ', $lista) . '.', 422, ['campo' => $campo]);
}
function sv_sm_caso(PDO $pdo, string $id): array
{
    $c = nuc_ler($pdo, 'sm', $id);
    if (!$c) throw new SvErro('Caso de salário-maternidade não encontrado.', 404);
    return sv_sm_normalizar($c);
}
/* casos antigos (11 etapas) são lidos já na etapa nova; a gravação definitiva é feita pelo sistema na abertura */
function sv_sm_normalizar(array $c): array
{
    if (!in_array($c['status'] ?? '', NUC_SM_ETAPAS, true)) {
        $ant = (string) ($c['status'] ?? '');
        $c['statusAntigo'] = $ant;
        $c['status'] = nuc_sm_etapa($c);
        if (in_array($ant, SV_SM_DESFECHOS, true) && empty($c['desfecho'])) $c['desfecho'] = $ant;
        if ($ant === 'Em exigência' && empty($c['exigencia'])) $c['exigencia'] = ['aberta' => true, 'descricao' => 'Exigência em aberto (anotada antes da mudança do quadro)', 'prazo' => '', 'abertaEm' => sv_hoje()];
        $c['historico'] = array_merge((array) ($c['historico'] ?? []), [['de' => $ant, 'para' => $c['status'], 'em' => nuc_ms(), 'por' => 'mudança do quadro (6 colunas)']]);
    }
    if (!isset($c['guias']) || !is_array($c['guias'])) $c['guias'] = [];
    return $c;
}
function sv_sm_status_guia(array $g): string
{
    if (!empty($g['pagaEm'])) return 'Paga';
    $venc = (string) ($g['venc'] ?? '');
    if ($venc !== '' && $venc < sv_hoje()) return 'Vencida';
    return !empty($g['emitidaEm']) ? 'Emitida' : 'A emitir';
}
function sv_sm_alertas(array $c): array
{
    $a = [];
    $parto = substr((string) (($c['dataParto'] ?? '') ?: ($c['dpp'] ?? '')), 0, 7);
    foreach ($c['guias'] as $g) {
        if (!empty($g['pagaEm']) && !empty($g['venc']) && $g['pagaEm'] > $g['venc']) $a[] = "Guia {$g['competencia']} paga em atraso ({$g['pagaEm']}, vencia {$g['venc']}): não conta para qualidade de segurada nem carência.";
        if ($parto !== '' && ($g['competencia'] ?? '') > $parto) $a[] = "Guia {$g['competencia']} é de competência depois do parto: não serve para a qualidade de segurada.";
    }
    $pagas = count(array_filter($c['guias'], fn($g) => !empty($g['pagaEm'])));
    if (preg_match('/per[ií]odo de gra[cç]a/iu', (string) ($c['estrategia'] ?? '')) && $pagas) $a[] = "Estratégia \"via período de graça\", mas há $pagas guia(s) paga(s).";
    if (preg_match('/via guias/i', (string) ($c['estrategia'] ?? '')) && !$c['guias']) $a[] = 'Estratégia "via guias", mas nenhuma guia cadastrada.';
    if (!empty($c['exigencia']['aberta'])) $a[] = 'Exigência do INSS em aberto' . (!empty($c['exigencia']['prazo']) ? ' (prazo ' . $c['exigencia']['prazo'] . ')' : '') . '.';
    if (($c['status'] ?? '') === 'Deferido — a receber' && empty($c['nb'])) $a[] = 'Deferido sem NB/protocolo.';
    return $a;
}
function sv_sm_api(PDO $pdo, array $c, bool $completo = true): array
{
    $cli = nuc_ler($pdo, 'clientes', (string) ($c['clienteId'] ?? '')) ?: [];
    $o = ['id' => $c['id'], 'cliente_id' => $c['clienteId'] ?? '', 'cliente' => $cli['nome'] ?? '', 'etapa' => $c['status'] ?? '', 'desfecho' => $c['desfecho'] ?? '',
        'categoria' => $c['categoria'] ?? '', 'estrategia' => $c['estrategia'] ?? '', 'dpp' => $c['dpp'] ?? '', 'data_parto' => $c['dataParto'] ?? '',
        'nb' => $c['nb'] ?? '', 'der' => $c['der'] ?? '', 'exigencia_aberta' => !empty($c['exigencia']['aberta']),
        'guias_pendentes' => count(array_filter($c['guias'], fn($g) => empty($g['pagaEm']))), 'alertas' => sv_sm_alertas($c)];
    if (!$completo) return $o;
    $o += ['crianca' => $c['crianca'] ?? '', 'carencia_meses' => $c['carenciaMeses'] ?? '', 'qualidade_ate' => $c['qualidadeAte'] ?? '', 'responsavel' => $c['responsavelId'] ?? '',
        'exigencia' => $c['exigencia'] ?? null, 'data_deferimento' => $c['dataDeferimento'] ?? '', 'dib' => $c['dib'] ?? '', 'valor_concedido' => (float) ($c['valorConcedido'] ?? 0),
        'previsao_pagamento' => $c['previsaoPagamento'] ?? '', 'beneficio_estimado' => (float) ($c['beneficioEstimado'] ?? 0), 'honorarios_percentual' => (float) ($c['honorariosPct'] ?? 0),
        'parcelas_honorarios' => (int) ($c['parcelasHonorarios'] ?? 0), 'obs' => $c['obs'] ?? '',
        'guias' => array_map(fn($g) => ['id' => $g['id'] ?? '', 'competencia' => $g['competencia'] ?? '', 'codigo' => $g['codigo'] ?? '', 'codigo_descricao' => $g['codigoDesc'] ?? '',
            'valor' => (float) ($g['valor'] ?? 0), 'vencimento' => $g['venc'] ?? '', 'status' => sv_sm_status_guia($g), 'emitida_em' => $g['emitidaEm'] ?? '', 'paga_em' => $g['pagaEm'] ?? '',
            'quem_paga' => $g['quemPaga'] ?? 'Cliente'], $c['guias']),
        'parcelas_inss' => array_map(fn($p) => ['n' => (int) ($p['n'] ?? 0), 'previsao' => $p['previsao'] ?? '', 'recebida_em' => $p['recebidaEm'] ?? '',
            'honorarios_vencem_em' => !empty($p['recebidaEm']) ? sv_uteis_depois($pdo, (string) $p['recebidaEm'], 5) : ''], (array) ($c['parcelasInss'] ?? [])),
        'historico' => array_map(fn($h) => ['de' => $h['de'] ?? '', 'para' => $h['para'] ?? '', 'em' => isset($h['em']) ? date('Y-m-d H:i', (int) ($h['em'] / 1000)) : '', 'por' => $h['por'] ?? ''], (array) ($c['historico'] ?? []))];
    return $o;
}
function sv_sm_buscar(PDO $pdo, array $f): array
{
    $id = sv_texto($f['caso_id'] ?? '', 60);
    if ($id !== '') return ['total' => 1, 'itens' => [sv_sm_api($pdo, sv_sm_caso($pdo, $id))]];
    $cli = sv_texto($f['cliente_id'] ?? '', 60);
    $nome = sv_norm(sv_texto($f['nome'] ?? '', 120));
    $cpf = sv_digitos(sv_texto($f['cpf'] ?? '', 20));
    $tel = sv_texto($f['telefone'] ?? '', 40);
    $e164 = $tel !== '' ? sv_telefone_e164($tel) : '';
    $etapa = sv_texto($f['etapa'] ?? '', 60) !== '' ? sv_opcao($f['etapa'], NUC_SM_ETAPAS, 'etapa') : '';
    $clientes = [];
    foreach (nuc_listar($pdo, 'clientes') as $c) $clientes[(string) $c['id']] = $c;
    $out = [];
    foreach (nuc_listar($pdo, 'sm') as $c) {
        $c = sv_sm_normalizar($c);
        $k = $clientes[(string) ($c['clienteId'] ?? '')] ?? [];
        if ($cli !== '' && ($c['clienteId'] ?? '') !== $cli) continue;
        if ($etapa !== '' && $c['status'] !== $etapa) continue;
        if ($nome !== '' && strpos(sv_norm((string) ($k['nome'] ?? '')), $nome) === false) continue;
        if ($cpf !== '' && sv_digitos((string) ($k['doc'] ?? '')) !== $cpf) continue;
        if ($tel !== '' && ($k['telE164'] ?? sv_telefone_e164((string) ($k['tel'] ?? ''))) !== $e164) continue;
        $out[] = sv_sm_api($pdo, $c, false);
    }
    $um = count($out) === 1 ? [sv_sm_api($pdo, sv_sm_caso($pdo, (string) $out[0]['id']))] : array_slice($out, 0, 100);
    return ['total' => count($out), 'itens' => $um];
}
function sv_sm_historico(array &$c, string $para, array $quem): void
{
    if (($c['status'] ?? '') === $para) return;
    $c['historico'] = array_merge((array) ($c['historico'] ?? []), [['de' => $c['status'] ?? '', 'para' => $para, 'em' => nuc_ms(), 'por' => $quem['nome'] ?? 'API']]);
    $c['status'] = $para;
}
function sv_sm_gravar(PDO $pdo, array $c, array $quem): array
{
    sv_gravar($pdo, 'sm', (string) $c['id'], $c, $quem);
    return ['caso' => sv_sm_api($pdo, $c)];
}
/* campos simples do caso (parcial: só os informados) */
function sv_sm_aplicar(PDO $pdo, array &$c, array $in): void
{
    if (array_key_exists('categoria', $in)) $c['categoria'] = sv_opcao($in['categoria'], SV_SM_CATEG, 'categoria') ?: 'A definir (triagem)';
    if (array_key_exists('estrategia', $in)) $c['estrategia'] = sv_opcao($in['estrategia'], SV_SM_ESTRAT, 'estrategia');
    foreach (['dpp' => 'dpp', 'data_parto' => 'dataParto', 'qualidade_ate' => 'qualidadeAte', 'previsao_pagamento' => 'previsaoPagamento'] as $k => $int)
        if (array_key_exists($k, $in)) $c[$int] = sv_data($in[$k], $k);
    if (!empty($c['dataParto']) && $c['dataParto'] > sv_hoje()) throw new SvErro('A data do parto não pode ser no futuro: use a DPP (data provável do parto).', 422, ['campo' => 'data_parto']);
    foreach (['crianca' => ['crianca', 160], 'obs' => ['obs', 4000]] as $k => [$int, $max]) if (array_key_exists($k, $in)) $c[$int] = sv_texto($in[$k], $max);
    foreach (['carencia_meses' => 'carenciaMeses', 'beneficio_estimado' => 'beneficioEstimado', 'honorarios_percentual' => 'honorariosPct', 'parcelas_honorarios' => 'parcelasHonorarios'] as $k => $int)
        if (array_key_exists($k, $in)) $c[$int] = sv_valor($in[$k], $k) ?? '';
    if (isset($c['honorariosPct']) && $c['honorariosPct'] !== '' && ($c['honorariosPct'] < 0 || $c['honorariosPct'] > 100)) throw new SvErro('Percentual de honorários deve estar entre 0 e 100.', 422, ['campo' => 'honorarios_percentual']);
    if (array_key_exists('responsavel', $in)) $c['responsavelId'] = sv_resolver_responsavel($pdo, sv_texto($in['responsavel'], 160));
}
function sv_sm_docs(PDO $pdo, array $c, array $quem): void
{
    $tem = [];
    foreach (nuc_listar($pdo, 'documentos') as $d) if (($d['clienteId'] ?? '') === $c['clienteId']) $tem[sv_norm((string) ($d['nome'] ?? ''))] = 1;
    foreach (SV_SM_DOCS_BASE as $nome) if (!isset($tem[sv_norm($nome)])) { $id = 'd' . nuc_uid(); sv_gravar($pdo, 'documentos', $id, ['id' => $id, 'clienteId' => $c['clienteId'], 'nome' => $nome, 'recebido' => false, 'data' => ''], $quem); }
}
function sv_sm_criar(PDO $pdo, array $in, array $quem): array
{
    $cli = sv_cliente($pdo, sv_texto($in['cliente_id'] ?? '', 60));
    foreach (nuc_listar($pdo, 'sm') as $x) if (($x['clienteId'] ?? '') === $cli['id'] && nuc_sm_etapa($x) !== 'Encerrado')
        throw new SvErro('Esta cliente já tem um caso de salário-maternidade em andamento.', 409, ['caso_id' => $x['id']]);
    $esc = nuc_config($pdo, 'escritorio') ?: [];
    $c = ['id' => 's' . nuc_uid(), 'clienteId' => $cli['id'], 'status' => 'Documentos', 'categoria' => 'A definir (triagem)', 'estrategia' => '', 'responsavelId' => $quem['membro'] ?? '',
        'guias' => [], 'guiasRevisadas' => 1, 'dpp' => '', 'dataParto' => '', 'beneficioEstimado' => round(sv_salario_minimo($pdo, sv_hoje()) * 4),
        'honorariosPct' => (float) ($esc['smHonorariosPct'] ?? 25) ?: 25, 'parcelasHonorarios' => 2, 'obs' => '',
        'historico' => [['de' => '', 'para' => 'Documentos', 'em' => nuc_ms(), 'por' => $quem['nome'] ?? 'API']]];
    if (!empty($in['lead_id'])) $c['leadId'] = sv_texto($in['lead_id'], 60);
    sv_sm_aplicar($pdo, $c, $in);
    sv_sm_docs($pdo, $c, $quem);
    return sv_sm_gravar($pdo, $c, $quem);
}
function sv_sm_atualizar(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    sv_sm_aplicar($pdo, $c, $in);
    return sv_sm_gravar($pdo, $c, $quem);
}
function sv_sm_mover(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    $nova = sv_opcao($in['etapa'] ?? '', NUC_SM_ETAPAS, 'etapa');
    if ($nova === '') throw new SvErro('Informe a etapa: ' . implode(', ', NUC_SM_ETAPAS) . '.', 422, ['campo' => 'etapa']);
    if ($nova === 'Deferido — a receber') throw new SvErro('Para deferido use sm_registrar_deferimento (precisa de NB, DER, data e valor).', 422, ['campo' => 'etapa']);
    if ($nova === 'Encerrado') {
        $c['desfecho'] = sv_opcao($in['desfecho'] ?? '', SV_SM_DESFECHOS, 'desfecho');
        if ($c['desfecho'] === '') throw new SvErro('Para encerrar, informe o desfecho: ' . implode(', ', SV_SM_DESFECHOS) . '.', 422, ['campo' => 'desfecho']);
    }
    if ($nova === 'No INSS') {
        if (array_key_exists('nb', $in)) $c['nb'] = sv_texto($in['nb'], 60);
        if (array_key_exists('der', $in)) $c['der'] = sv_data($in['der'], 'der');
        if (!empty($c['nb']) && empty($c['der'])) throw new SvErro('Com protocolo/NB, informe também a DER.', 422, ['campo' => 'der']);
    }
    sv_sm_historico($c, $nova, $quem);
    return sv_sm_gravar($pdo, $c, $quem);
}
function sv_sm_guia(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    $comp = sv_competencia($in['competencia'] ?? '', 'competencia');
    $cod = sv_texto($in['codigo'] ?? '', 20);
    if ($cod === '') $cod = preg_match('/mei/i', (string) $c['categoria']) ? 'DAS-MEI' : (preg_match('/contribuinte/i', (string) $c['categoria']) ? '1007' : '1406');
    if (!array_key_exists($cod, SV_GPS)) throw new SvErro('Código inválido. Use: ' . implode(', ', array_keys(SV_GPS)) . '.', 422, ['campo' => 'codigo']);
    $desc = sv_texto($in['codigo_descricao'] ?? '', 120);
    if ($cod === 'Outro' && $desc === '') throw new SvErro('Descreva o código "Outro" em codigo_descricao.', 422, ['campo' => 'codigo_descricao']);
    $valor = sv_valor($in['valor'] ?? null, 'valor');
    if ($valor === null) { if ($cod === 'Outro') throw new SvErro('Informe o valor da guia de código "Outro".', 422, ['campo' => 'valor']); $valor = sv_valor_guia($pdo, $comp, $cod); }
    $quemPaga = preg_match('/escrit/i', (string) ($in['quem_paga'] ?? '')) ? 'Escritório (reembolsável)' : 'Cliente';
    $g = null;
    foreach ($c['guias'] as $i => $x) if (($x['competencia'] ?? '') === $comp) $g = $i;
    $dados = ['competencia' => $comp, 'codigo' => $cod, 'codigoDesc' => $desc, 'valor' => $valor, 'venc' => sv_venc_guia($pdo, $comp, $cod === 'Outro' ? '1406' : $cod), 'quemPaga' => $quemPaga];
    if (array_key_exists('link', $in)) $dados['link'] = sv_texto($in['link'], 1000);
    if ($g !== null) $c['guias'][$g] = array_merge($c['guias'][$g], $dados);
    else $c['guias'][] = ['id' => 'g' . nuc_uid(), 'emitidaEm' => '', 'pagaEm' => '', 'link' => '', 'obs' => ''] + $dados;
    usort($c['guias'], fn($a, $b) => strcmp((string) $a['competencia'], (string) $b['competencia']));
    if ($c['status'] === 'Documentos') sv_sm_historico($c, 'Guia a pagar', $quem);
    $r = sv_sm_gravar($pdo, $c, $quem);
    return $r + ['guia' => array_values(array_filter($r['caso']['guias'], fn($x) => $x['competencia'] === $comp))[0], 'atualizada' => $g !== null];
}
function sv_sm_guia_paga(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    $gid = sv_texto($in['guia_id'] ?? '', 60);
    $comp = sv_texto($in['competencia'] ?? '', 10) !== '' ? sv_competencia($in['competencia'], 'competencia') : '';
    $i = null;
    foreach ($c['guias'] as $k => $g) if (($gid !== '' && ($g['id'] ?? '') === $gid) || ($gid === '' && $comp !== '' && ($g['competencia'] ?? '') === $comp)) $i = $k;
    if ($i === null) throw new SvErro('Guia não encontrada: informe guia_id ou a competência (AAAA-MM).', 404);
    $pagaEm = sv_data($in['paga_em'] ?? '', 'paga_em') ?: sv_hoje();
    if ($pagaEm > sv_hoje()) throw new SvErro('"paga_em" não pode ser no futuro.', 422, ['campo' => 'paga_em']);
    $c['guias'][$i]['pagaEm'] = $pagaEm;
    if (empty($c['guias'][$i]['emitidaEm'])) $c['guias'][$i]['emitidaEm'] = $pagaEm;
    if (array_key_exists('quem_paga', $in)) $c['guias'][$i]['quemPaga'] = preg_match('/escrit/i', (string) $in['quem_paga']) ? 'Escritório (reembolsável)' : 'Cliente';
    $r = sv_sm_gravar($pdo, $c, $quem);
    $g = $c['guias'][$i];
    $av = [];
    if (!empty($g['venc']) && $pagaEm > $g['venc']) $av[] = 'Paga em atraso: pagamento em atraso de facultativa não conta para a qualidade de segurada nem para a carência.';
    if (preg_match('/escrit/i', (string) $g['quemPaga'])) $av[] = 'Paga pelo escritório: vira reembolso a receber da cliente (lançado no financeiro, aguardando o benefício).';
    return $r + ['avisos' => $av];
}
function sv_sm_requerimento(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    $c['nb'] = sv_texto($in['nb'] ?? '', 60);
    $c['der'] = sv_data($in['der'] ?? '', 'der');
    if ($c['nb'] === '' || $c['der'] === '') throw new SvErro('Informe o nº do protocolo/NB e a DER.', 422, ['campo' => $c['nb'] === '' ? 'nb' : 'der']);
    if (in_array($c['status'], ['Documentos', 'Guia a pagar', 'Aguardando parto'], true)) sv_sm_historico($c, 'No INSS', $quem);
    return sv_sm_gravar($pdo, $c, $quem);
}
function sv_sm_exigencia(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    if (sv_bool($in['cumprida'] ?? false)) {
        if (empty($c['exigencia']['aberta'])) throw new SvErro('Não há exigência em aberto neste caso.', 409);
        $c['exigencia'] = array_merge((array) $c['exigencia'], ['aberta' => false, 'cumpridaEm' => sv_data($in['data'] ?? '', 'data') ?: sv_hoje()]);
        return sv_sm_gravar($pdo, $c, $quem);
    }
    $desc = sv_texto($in['descricao'] ?? '', 2000);
    if ($desc === '') throw new SvErro('Descreva o que o INSS pediu.', 422, ['campo' => 'descricao']);
    $prazo = sv_data($in['prazo'] ?? '', 'prazo') ?: sv_mais_dias(sv_hoje(), 30);
    $c['exigencia'] = ['aberta' => true, 'descricao' => $desc, 'prazo' => $prazo, 'abertaEm' => sv_hoje()];
    if ($c['status'] !== 'No INSS') sv_sm_historico($c, 'No INSS', $quem);
    return sv_sm_gravar($pdo, $c, $quem);
}
function sv_sm_deferimento(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    $nb = sv_texto($in['nb'] ?? ($c['nb'] ?? ''), 60);
    $der = sv_data($in['der'] ?? ($c['der'] ?? ''), 'der');
    $valor = sv_valor($in['valor_concedido'] ?? null, 'valor_concedido');
    if ($nb === '') throw new SvErro('Informe o NB/protocolo.', 422, ['campo' => 'nb']);
    if ($der === '') throw new SvErro('Informe a DER.', 422, ['campo' => 'der']);
    if (!$valor) throw new SvErro('Informe o valor total concedido (R$).', 422, ['campo' => 'valor_concedido']);
    $c['nb'] = $nb; $c['der'] = $der; $c['valorConcedido'] = $valor;
    $c['dataDeferimento'] = sv_data($in['data_deferimento'] ?? '', 'data_deferimento') ?: sv_hoje();
    if (array_key_exists('dib', $in)) $c['dib'] = sv_data($in['dib'], 'dib');
    if (array_key_exists('previsao_pagamento', $in)) $c['previsaoPagamento'] = sv_data($in['previsao_pagamento'], 'previsao_pagamento');
    $n = max(1, (int) round((float) ($in['parcelas_inss'] ?? ($c['qtdParcelasInss'] ?? ($c['parcelasHonorarios'] ?? 1)))));
    $c['qtdParcelasInss'] = $n;
    $atual = (array) ($c['parcelasInss'] ?? []);
    $prev = (string) ($c['previsaoPagamento'] ?? '');
    $c['parcelasInss'] = [];
    for ($i = 0; $i < $n; $i++) $c['parcelasInss'][] = $atual[$i] ?? ['n' => $i + 1, 'recebidaEm' => '', 'previsao' => $prev !== '' ? date('Y-m-d', strtotime("$prev 12:00 +$i month")) : ''];
    if (!empty($c['exigencia']) && is_array($c['exigencia'])) $c['exigencia']['aberta'] = false;
    sv_sm_historico($c, 'Deferido — a receber', $quem);
    $r = sv_sm_gravar($pdo, $c, $quem);
    $pct = (float) (($c['honorariosPct'] ?? '') !== '' ? $c['honorariosPct'] : 25);
    $np = max(1, (int) round((float) ($c['parcelasHonorarios'] ?? 2)));
    return $r + ['honorarios_previstos' => ['percentual' => $pct, 'parcelas' => $np, 'valor_parcela' => round($valor * $pct / 100 / $np, 2),
        'obs' => 'Lançados no financeiro como "aguardando benefício"; cada parcela vence 5 dias úteis depois que a cliente recebe a parcela do INSS. Se houver contrato de salário-maternidade com parcelas, ele prevalece.']];
}
function sv_sm_parcela(PDO $pdo, string $id, array $in, array $quem): array
{
    $c = sv_sm_caso($pdo, $id);
    $n = (int) ($in['parcela'] ?? 1);
    $ps = (array) ($c['parcelasInss'] ?? []);
    if (!$ps) throw new SvErro('O caso ainda não tem o deferimento registrado (use sm_registrar_deferimento).', 409);
    if ($n < 1 || $n > count($ps)) throw new SvErro('Parcela inválida: o INSS paga em ' . count($ps) . ' parcela(s).', 422, ['campo' => 'parcela']);
    $data = sv_data($in['recebida_em'] ?? '', 'recebida_em') ?: sv_hoje();
    if ($data > sv_hoje()) throw new SvErro('A data de recebimento não pode ser no futuro.', 422, ['campo' => 'recebida_em']);
    $ps[$n - 1]['recebidaEm'] = $data;
    if (array_key_exists('valor', $in)) $ps[$n - 1]['valor'] = sv_valor($in['valor'], 'valor') ?? '';
    $c['parcelasInss'] = $ps;
    $r = sv_sm_gravar($pdo, $c, $quem);
    $lib = sv_uteis_depois($pdo, $data, 5);
    // lançamentos automáticos já existentes: libera a cobrança agora (os que faltarem o sistema cria na abertura)
    $liberados = 0;
    foreach (nuc_listar($pdo, 'lancamentos') as $l) {
        if (($l['smId'] ?? '') !== $c['id'] || !empty($l['pago']) || empty($l['auto'])) continue;
        $alvo = ($l['smTipo'] ?? '') === 'honorarios' ? (int) ($l['smParcela'] ?? 0) === $n : (($l['smTipo'] ?? '') === 'reembolso' && $n === 1);
        if (!$alvo) continue;
        $l['venc'] = $lib; $l['aguardandoBeneficio'] = false;
        sv_gravar($pdo, 'lancamentos', (string) $l['id'], $l, $quem); $liberados++;
    }
    return $r + ['cobrar_a_partir_de' => $lib, 'lancamentos_liberados' => $liberados, 'obs' => "Honorários da parcela $n vencem em $lib (5 dias úteis depois do recebimento)."];
}
function sv_sm_a_receber(PDO $pdo, array $f): array
{
    $clientes = [];
    foreach (nuc_listar($pdo, 'clientes') as $c) $clientes[(string) $c['id']] = $c;
    $casos = [];
    foreach (nuc_listar($pdo, 'sm') as $c) $casos[(string) $c['id']] = sv_sm_normalizar($c);
    $porCaso = [];
    foreach (nuc_listar($pdo, 'lancamentos') as $l) {
        if (empty($l['smId']) || !empty($l['pago'])) continue;
        $porCaso[(string) $l['smId']][] = $l;
    }
    $itens = []; $tot = ['cobrar_agora' => 0.0, 'aguardando_beneficio' => 0.0, 'previsto_sem_lancamento' => 0.0];
    foreach ($casos as $id => $c) {
        $ls = $porCaso[$id] ?? [];
        $cli = $clientes[(string) ($c['clienteId'] ?? '')] ?? [];
        $base = ['caso_id' => $id, 'cliente' => $cli['nome'] ?? '', 'telefone' => $cli['tel'] ?? '', 'etapa' => $c['status']];
        foreach ($ls as $l) {
            $ag = !empty($l['aguardandoBeneficio']);
            $tot[$ag ? 'aguardando_beneficio' : 'cobrar_agora'] += (float) ($l['valor'] ?? 0);
            $itens[] = $base + ['tipo' => ($l['smTipo'] ?? '') === 'reembolso' ? 'Reembolso de guia' : 'Honorários', 'descricao' => $l['descricao'] ?? '', 'valor' => (float) ($l['valor'] ?? 0),
                'situacao' => $ag ? 'Aguardando benefício' : ((string) ($l['venc'] ?? '') < sv_hoje() ? 'Vencido' : 'A cobrar'), 'vencimento' => $ag ? '' : ($l['venc'] ?? '')];
        }
        if (!$ls && $c['status'] === 'Deferido — a receber' && !empty($c['valorConcedido'])) {
            $pct = (float) (($c['honorariosPct'] ?? '') !== '' ? $c['honorariosPct'] : 25);
            $v = round((float) $c['valorConcedido'] * $pct / 100, 2);
            $tot['previsto_sem_lancamento'] += $v;
            $itens[] = $base + ['tipo' => 'Honorários', 'descricao' => "Previsto: $pct% do benefício (ainda não lançado; entra no financeiro quando alguém abrir o sistema)", 'valor' => $v, 'situacao' => 'Previsto', 'vencimento' => ''];
        }
    }
    $sit = sv_texto($f['situacao'] ?? '', 40);
    if ($sit !== '') $itens = array_values(array_filter($itens, fn($i) => sv_norm($i['situacao']) === sv_norm($sit) || ($sit === 'cobrar_agora' && in_array($i['situacao'], ['A cobrar', 'Vencido'], true))));
    usort($itens, fn($a, $b) => strcmp($a['vencimento'] ?: '9999', $b['vencimento'] ?: '9999'));
    return ['totais' => array_map(fn($v) => round($v, 2), $tot), 'total' => count($itens), 'itens' => array_slice($itens, 0, 200)];
}

/* =========================================================
   PETIÇÕES, AGENDA, FINANCEIRO e TRÁFEGO pelo conector (Claude)
   ========================================================= */
const SV_PET_STATUS = ['A conferir', 'Em correção', 'Conferida', 'Pronta para protocolar', 'Protocolada'];
const SV_CAT_REC = ['H.O. iniciais', 'H.O. finais — acordo', 'H.O. finais — êxito', 'Sucumbência', 'TMP', 'Honorários mensais (partido)', 'Consulta', 'Parceria (execução delegada)', 'Reembolso de custas', 'Outras receitas'];
const SV_CAT_DESP = ['Aluguel', 'Energia elétrica', 'Telefonia / internet', 'Sistemas', 'Tráfego — Google', 'Tráfego — Facebook/Instagram', 'Agência / marketing', 'Indicações pagas', 'Contador', 'Folha de pagamento', 'Pró-labore', 'Impostos',
    'Taxa de cartão', 'Taxa de boleto', 'Tarifas bancárias', 'Empresa de TI', 'Copa', 'Correios', 'Material de expediente', 'Manutenção / extraordinárias', 'Equipamentos', 'Capacitação', 'Custas processuais', 'Repasse a parceiro', 'Distribuição de lucros', 'Outras despesas'];

function sv_excluir(PDO $pdo, string $col, string $id, ?int $uid = null): void
{
    $pdo->prepare('UPDATE registros SET excluido = 1, atualizado_em = ?, atualizado_por = ? WHERE colecao = ? AND id = ?')->execute([nuc_ms(), $uid, $col, $id]);
}
function sv_achar_cliente(PDO $pdo, array $in): string
{
    if (!empty($in['cliente_id'])) return (string) sv_cliente($pdo, sv_texto($in['cliente_id'], 60))['id'];
    $nome = sv_norm(sv_texto($in['cliente'] ?? '', 160));
    if ($nome === '') return '';
    $achados = array_values(array_filter(nuc_listar($pdo, 'clientes'), fn($c) => strpos(sv_norm((string) ($c['nome'] ?? '')), $nome) !== false));
    if (count($achados) === 1) return (string) $achados[0]['id'];
    if (!$achados) throw new SvErro('Cliente "' . ($in['cliente'] ?? '') . '" não encontrado. Use buscar_cliente.', 404);
    throw new SvErro('Mais de um cliente com esse nome: informe cliente_id.', 409, ['opcoes' => array_map(fn($c) => ['id' => $c['id'], 'nome' => $c['nome'] ?? ''], array_slice($achados, 0, 10))]);
}
function sv_achar_processo(PDO $pdo, array $in): string
{
    $id = sv_texto($in['processo_id'] ?? '', 60);
    if ($id !== '') { if (!nuc_ler($pdo, 'processos', $id)) throw new SvErro('Processo não encontrado.', 404); return $id; }
    $num = sv_digitos(sv_texto($in['numero_processo'] ?? '', 40));
    if ($num === '') return '';
    foreach (nuc_listar($pdo, 'processos') as $p) if (sv_digitos((string) ($p['numero'] ?? '')) === $num) return (string) $p['id'];
    return '';
}
/* push para pessoas da equipe (ids u1…), sem quem fez a ação */
function sv_avisar(PDO $pdo, array $ids, array $quem, string $tipo, string $titulo, string $texto, string $url, string $chave): void
{
    $em = nuc_emails_por_id($pdo);
    $para = array_values(array_filter(array_map(fn($i) => $em[$i] ?? null, array_diff(array_unique(array_filter($ids)), [(string) ($quem['membro'] ?? '')]))));
    if ($para) try { nuc_push($pdo, $para, $tipo, $titulo, $texto, $url, $chave, 'high'); } catch (Throwable $e) { /* aviso nunca impede a gravação */ }
}

/* ---------- petições (conferência entre as advogadas) ---------- */
function sv_pet_api(PDO $pdo, array $p): array
{
    $eq = sv_equipe($pdo);
    $nm = fn($id) => $eq[$id]['nome'] ?? '';
    return ['id' => $p['id'], 'titulo' => $p['titulo'] ?? '', 'tipo' => $p['tipo'] ?? '', 'status' => $p['status'] ?? '', 'cliente_id' => $p['clienteId'] ?? '', 'processo_id' => $p['processoId'] ?? '',
        'autor' => $nm($p['autorId'] ?? ''), 'conferente' => $nm($p['conferenteId'] ?? ''), 'prazo' => $p['prazo'] ?? '', 'hora' => $p['hora'] ?? '', 'link' => $p['link'] ?? '',
        'apontamentos' => $p['apontamentos'] ?? '', 'criada_em' => $p['criado'] ?? ''];
}
/* quem confere: o informado; senão a outra advogada/sócia da equipe */
function sv_conferente_padrao(PDO $pdo, string $autor): string
{
    $esc = nuc_config($pdo, 'escritorio');
    if (!empty($esc['conferentes'][$autor])) return (string) $esc['conferentes'][$autor];
    foreach (nuc_listar($pdo, 'usuarios') as $u) if (($u['id'] ?? '') !== $autor && preg_match('/s[oó]ci|advog/i', (string) ($u['papel'] ?? ''))) return (string) $u['id'];
    return '';
}
function sv_pet_registrar(PDO $pdo, array $in, array $quem): array
{
    $tit = sv_texto($in['titulo'] ?? '', 200);
    if ($tit === '') throw new SvErro('Informe o título da petição.', 422, ['campo' => 'titulo']);
    $autor = sv_texto($in['autor'] ?? '', 160) !== '' ? sv_resolver_responsavel($pdo, sv_texto($in['autor'], 160)) : (string) ($quem['membro'] ?? '');
    $conf = sv_texto($in['conferente'] ?? '', 160) !== '' ? sv_resolver_responsavel($pdo, sv_texto($in['conferente'], 160)) : sv_conferente_padrao($pdo, $autor);
    $st = sv_opcao($in['status'] ?? 'A conferir', SV_PET_STATUS, 'status') ?: 'A conferir';
    $link = sv_texto($in['link'] ?? '', 1000);
    if ($link !== '' && !preg_match('#^https://#', $link)) throw new SvErro('O link precisa começar com https:// (ex.: Google Drive ou Docs).', 422, ['campo' => 'link']);
    $p = ['id' => 'pt' . nuc_uid(), 'titulo' => $tit, 'tipo' => sv_texto($in['tipo'] ?? 'Manifestação', 60) ?: 'Manifestação', 'status' => $st, 'clienteId' => sv_achar_cliente($pdo, $in),
        'processoId' => sv_achar_processo($pdo, $in), 'autorId' => $autor, 'conferenteId' => $conf, 'prazo' => sv_data($in['prazo'] ?? '', 'prazo'), 'hora' => sv_texto($in['hora'] ?? '', 5),
        'link' => $link, 'apontamentos' => sv_texto($in['apontamentos'] ?? '', 4000), 'obs' => sv_texto($in['obs'] ?? '', 2000), 'criado' => sv_hoje(), 'criadoPor' => $autor,
        'historico' => [['em' => nuc_ms(), 'por' => $quem['membro'] ?? '', 'status' => $st]], 'viaClaude' => true];
    if ($p['processoId'] !== '' && $p['clienteId'] === '') $p['clienteId'] = (string) ((nuc_ler($pdo, 'processos', $p['processoId']) ?? [])['clienteId'] ?? '');
    sv_pet_agenda($pdo, $p, $quem);
    sv_gravar($pdo, 'peticoes', $p['id'], $p, $quem);
    sv_pet_aviso($pdo, $p, null, $quem);
    return ['peticao' => sv_pet_api($pdo, $p), 'avisado' => sv_pet_api($pdo, $p)['conferente']];
}
function sv_pet_achar(PDO $pdo, array $in): array
{
    $id = sv_texto($in['peticao_id'] ?? '', 60);
    if ($id !== '') { $p = nuc_ler($pdo, 'peticoes', $id); if (!$p) throw new SvErro('Petição não encontrada.', 404); return $p; }
    $t = sv_norm(sv_texto($in['titulo'] ?? '', 200));
    $xs = array_values(array_filter(nuc_listar($pdo, 'peticoes'), fn($p) => $t !== '' && strpos(sv_norm((string) ($p['titulo'] ?? '')), $t) !== false && ($p['status'] ?? '') !== 'Protocolada'));
    if (count($xs) === 1) return $xs[0];
    throw new SvErro($xs ? 'Mais de uma petição com esse título: informe peticao_id.' : 'Petição não encontrada: informe peticao_id ou parte do título.', $xs ? 409 : 404);
}
function sv_pet_status(PDO $pdo, array $in, array $quem): array
{
    $p = sv_pet_achar($pdo, $in);
    $ant = $p;
    if (sv_texto($in['status'] ?? '', 60) !== '') $p['status'] = sv_opcao($in['status'], SV_PET_STATUS, 'status');
    foreach (['apontamentos' => 4000, 'obs' => 2000] as $k => $max) if (array_key_exists($k, $in)) $p[$k] = sv_texto($in[$k], $max);
    if (array_key_exists('link', $in)) $p['link'] = sv_texto($in['link'], 1000);
    if (array_key_exists('prazo', $in)) $p['prazo'] = sv_data($in['prazo'], 'prazo');
    if (sv_texto($in['conferente'] ?? '', 160) !== '') $p['conferenteId'] = sv_resolver_responsavel($pdo, sv_texto($in['conferente'], 160));
    if ($p['status'] !== $ant['status']) $p['historico'] = array_merge((array) ($p['historico'] ?? []), [['em' => nuc_ms(), 'por' => $quem['membro'] ?? '', 'status' => $p['status']]]);
    if ($p['status'] === 'Conferida' && empty($p['conferidaEm'])) $p['conferidaEm'] = sv_hoje();
    if ($p['status'] === 'Protocolada' && empty($p['protocoladaEm'])) $p['protocoladaEm'] = sv_hoje();
    sv_pet_agenda($pdo, $p, $quem);
    sv_gravar($pdo, 'peticoes', (string) $p['id'], $p, $quem);
    sv_pet_aviso($pdo, $p, $ant, $quem);
    return ['peticao' => sv_pet_api($pdo, $p)];
}
function sv_pet_aviso(PDO $pdo, array $p, ?array $ant, array $quem): void
{
    $st = (string) $p['status']; $stAnt = (string) ($ant['status'] ?? '');
    $tit = (string) ($p['titulo'] ?? '');
    if ($st === 'A conferir' && ($stAnt !== 'A conferir' || ($ant['conferenteId'] ?? '') !== ($p['conferenteId'] ?? '')))
        sv_avisar($pdo, [$p['conferenteId'] ?? ''], $quem, 'tarefa', '🔎 Petição para você conferir', $tit . (!empty($p['prazo']) ? ' — protocolar até ' . nuc_data((string) $p['prazo']) : ''), '#peticoes', 'petconf:' . $p['id'] . ':' . nuc_ms());
    elseif ($st !== $stAnt && in_array($st, ['Em correção', 'Conferida', 'Pronta para protocolar'], true))
        sv_avisar($pdo, [$p['autorId'] ?? ''], $quem, 'tarefa', $st === 'Em correção' ? '✏️ Petição voltou para correção' : '✅ Petição conferida', $tit . (!empty($p['apontamentos']) && $st === 'Em correção' ? ' — ' . mb_substr((string) $p['apontamentos'], 0, 120) : ''), '#peticoes', 'petst:' . $p['id'] . ':' . $st . ':' . nuc_ms());
    elseif ($st === 'Protocolada' && $stAnt !== 'Protocolada')
        sv_avisar($pdo, [$p['autorId'] ?? '', $p['conferenteId'] ?? ''], $quem, 'conquista', '📨 Petição protocolada', $tit, '#peticoes', 'petprot:' . $p['id']);
}
/* o prazo da petição vira compromisso na agenda (igual à tela) */
function sv_pet_agenda(PDO $pdo, array &$p, array $quem): void
{
    $eid = (string) ($p['eventoId'] ?? '');
    if (empty($p['prazo'])) { if ($eid !== '') sv_excluir($pdo, 'eventos', $eid, $quem['uid'] ?? null); $p['eventoId'] = ''; return; }
    $resp = array_values(array_unique(array_filter([(string) ($p['autorId'] ?? ''), (string) ($p['conferenteId'] ?? '')])));
    $e = $eid !== '' ? (nuc_ler($pdo, 'eventos', $eid) ?? []) : [];
    if ($eid === '' || !$e) $eid = 'e' . nuc_uid();
    $e = array_merge($e, ['id' => $eid, 'tipo' => 'Prazo', 'titulo' => 'Protocolar: ' . $p['titulo'], 'data' => $p['prazo'], 'hora' => $p['hora'] ?? '', 'clienteId' => $p['clienteId'] ?? '', 'processoId' => $p['processoId'] ?? '',
        'responsavelId' => $resp[0] ?? ($quem['membro'] ?? ''), 'responsaveis' => $resp ?: [($quem['membro'] ?? '')], 'feito' => $p['status'] === 'Protocolada', 'obs' => 'Ligado à conferência de petições (' . $p['status'] . ').', 'peticaoId' => $p['id']]);
    sv_gravar($pdo, 'eventos', $eid, $e, $quem);
    $p['eventoId'] = $eid;
}
function sv_pet_buscar(PDO $pdo, array $f): array
{
    $st = sv_texto($f['status'] ?? '', 60) !== '' ? sv_opcao($f['status'], SV_PET_STATUS, 'status') : '';
    $out = [];
    foreach (nuc_listar($pdo, 'peticoes') as $p) {
        if ($st !== '' && ($p['status'] ?? '') !== $st) continue;
        if ($st === '' && ($p['status'] ?? '') === 'Protocolada' && empty($f['incluir_protocoladas'])) continue;
        $out[] = sv_pet_api($pdo, $p);
    }
    usort($out, fn($a, $b) => strcmp($a['prazo'] ?: '9999', $b['prazo'] ?: '9999'));
    return ['total' => count($out), 'itens' => array_slice($out, 0, 100)];
}

/* ---------- agenda (audiências, reuniões, prazos) ---------- */
function sv_evento_registrar(PDO $pdo, array $in, array $quem): array
{
    $tit = sv_texto($in['titulo'] ?? '', 200);
    $data = sv_data($in['data'] ?? '', 'data');
    if ($tit === '' || $data === '') throw new SvErro('Informe título e data do compromisso.', 422, ['campo' => $tit === '' ? 'titulo' : 'data']);
    $hora = sv_texto($in['hora'] ?? '', 5);
    if ($hora !== '' && !preg_match('/^\d{2}:\d{2}$/', $hora)) throw new SvErro('Hora no formato HH:MM.', 422, ['campo' => 'hora']);
    $resp = [];
    foreach ((array) ($in['responsaveis'] ?? []) as $r) { $x = sv_resolver_responsavel($pdo, sv_texto($r, 160)); if ($x !== '') $resp[] = $x; }
    if (!$resp && !empty($quem['membro'])) $resp = [(string) $quem['membro']];
    $cid = sv_achar_cliente($pdo, $in); $pid = sv_achar_processo($pdo, $in);
    if ($pid !== '' && $cid === '') $cid = (string) ((nuc_ler($pdo, 'processos', $pid) ?? [])['clienteId'] ?? '');
    // não duplica: mesmo título, data e hora
    foreach (nuc_listar($pdo, 'eventos') as $e) if (($e['data'] ?? '') === $data && ($e['hora'] ?? '') === $hora && sv_norm((string) ($e['titulo'] ?? '')) === sv_norm($tit))
        return ['evento' => ['id' => $e['id'], 'titulo' => $e['titulo'], 'data' => $data, 'hora' => $hora], 'ja_existia' => true];
    $e = ['id' => 'e' . nuc_uid(), 'tipo' => sv_texto($in['tipo'] ?? 'Reunião', 60) ?: 'Reunião', 'titulo' => $tit, 'data' => $data, 'hora' => $hora, 'clienteId' => $cid, 'processoId' => $pid,
        'responsavelId' => $resp[0] ?? '', 'responsaveis' => array_values(array_unique($resp)), 'feito' => false,
        'obs' => trim(sv_texto($in['local'] ?? '', 300) !== '' ? 'Local/link: ' . sv_texto($in['local'], 300) . "\n" . sv_texto($in['obs'] ?? '', 2000) : sv_texto($in['obs'] ?? '', 2000)), 'viaClaude' => true];
    sv_gravar($pdo, 'eventos', $e['id'], $e, $quem);
    sv_avisar($pdo, $e['responsaveis'], $quem, 'tarefa', (preg_match('/audi/i', $e['tipo']) ? '⚖️ Nova audiência' : '📅 Novo compromisso') . ' para você', $tit . ' — ' . nuc_data($data) . ($hora ? ' às ' . $hora : ''), '#agenda', 'evnovo:' . $e['id']);
    return ['evento' => ['id' => $e['id'], 'tipo' => $e['tipo'], 'titulo' => $tit, 'data' => $data, 'hora' => $hora, 'cliente_id' => $cid, 'processo_id' => $pid], 'ja_existia' => false];
}
function sv_agenda(PDO $pdo, array $f): array
{
    $de = sv_data($f['desde'] ?? '', 'desde') ?: sv_hoje();
    $ate = sv_data($f['ate'] ?? '', 'ate') ?: sv_mais_dias($de, 30);
    $cli = [];
    foreach (nuc_listar($pdo, 'clientes') as $c) $cli[(string) $c['id']] = $c['nome'] ?? '';
    $eq = sv_equipe($pdo);
    $out = [];
    foreach (nuc_listar($pdo, 'eventos') as $e) {
        if (!empty($e['feito']) || ($e['data'] ?? '') < $de || ($e['data'] ?? '') > $ate) continue;
        $out[] = ['id' => $e['id'], 'tipo' => $e['tipo'] ?? '', 'titulo' => $e['titulo'] ?? '', 'data' => $e['data'], 'hora' => $e['hora'] ?? '', 'cliente' => $cli[(string) ($e['clienteId'] ?? '')] ?? '',
            'responsaveis' => array_map(fn($i) => $eq[$i]['nome'] ?? $i, nuc_resp($e))];
    }
    usort($out, fn($a, $b) => strcmp($a['data'] . $a['hora'], $b['data'] . $b['hora']));
    return ['total' => count($out), 'itens' => array_slice($out, 0, 200)];
}

/* ---------- financeiro ---------- */
function sv_lanc_registrar(PDO $pdo, array $in, array $quem): array
{
    $tipo = sv_norm(sv_texto($in['tipo'] ?? '', 20)) === 'despesa' ? 'despesa' : 'receita';
    $desc = sv_texto($in['descricao'] ?? '', 200);
    $valor = sv_valor($in['valor'] ?? null, 'valor');
    $venc = sv_data($in['vencimento'] ?? '', 'vencimento') ?: sv_hoje();
    if ($desc === '' || !$valor) throw new SvErro('Informe descrição e valor.', 422, ['campo' => $desc === '' ? 'descricao' : 'valor']);
    $cats = $tipo === 'despesa' ? SV_CAT_DESP : SV_CAT_REC;
    $cat = sv_texto($in['categoria'] ?? '', 80) !== '' ? sv_opcao($in['categoria'], $cats, 'categoria') : ($tipo === 'despesa' ? 'Outras despesas' : 'Outras receitas');
    $pago = sv_bool($in['pago'] ?? false);
    $cid = sv_achar_cliente($pdo, $in); $pid = sv_achar_processo($pdo, $in);
    $n = max(1, min(60, (int) ($in['parcelas'] ?? 1)));
    $ids = [];
    for ($i = 0; $i < $n; $i++) {
        $v = $i ? date('Y-m-d', strtotime("$venc 12:00 +$i month")) : $venc;
        $l = ['id' => 'l' . nuc_uid(), 'tipo' => $tipo, 'descricao' => $desc . ($n > 1 ? ' — parcela ' . ($i + 1) . "/$n" : ''), 'categoria' => $cat, 'clienteId' => $cid, 'processoId' => $pid, 'contratoId' => '',
            'valor' => round($valor / (sv_bool($in['valor_e_total'] ?? false) ? $n : 1), 2), 'venc' => $v, 'pago' => $pago && !$i, 'pagoEm' => $pago && !$i ? (sv_data($in['pago_em'] ?? '', 'pago_em') ?: $v) : '',
            'forma' => sv_texto($in['forma'] ?? 'PIX', 30) ?: 'PIX', 'produto' => '', 'obs' => sv_texto($in['obs'] ?? '', 2000), 'criado' => sv_hoje(), 'viaClaude' => true];
        sv_gravar($pdo, 'lancamentos', $l['id'], $l, $quem);
        $ids[] = $l['id'];
    }
    return ['lancamentos' => $ids, 'tipo' => $tipo, 'categoria' => $cat];
}
function sv_fixa_registrar(PDO $pdo, array $in, array $quem): array
{
    $desc = sv_texto($in['descricao'] ?? '', 200);
    $valor = sv_valor($in['valor_mensal'] ?? null, 'valor_mensal');
    if ($desc === '' || !$valor) throw new SvErro('Informe descrição e valor mensal.', 422);
    $cat = sv_texto($in['categoria'] ?? '', 80) !== '' ? sv_opcao($in['categoria'], SV_CAT_DESP, 'categoria') : 'Outras despesas';
    $f = null;
    foreach (nuc_listar($pdo, 'despesasFixas') as $x) if (sv_norm((string) ($x['descricao'] ?? '')) === sv_norm($desc)) $f = $x;
    $novo = $f === null;
    $f = array_merge($f ?? ['id' => 'f' . nuc_uid()], ['descricao' => $desc, 'categoria' => $cat, 'previsto' => $valor, 'dia' => max(1, min(31, (int) ($in['dia_vencimento'] ?? 10))), 'ativo' => !array_key_exists('ativa', $in) || sv_bool($in['ativa']), 'produto' => '']);
    sv_gravar($pdo, 'despesasFixas', (string) $f['id'], $f, $quem);
    return ['despesa_fixa' => ['id' => $f['id'], 'descricao' => $desc, 'categoria' => $cat, 'valor_mensal' => $valor, 'dia' => $f['dia']], 'criada' => $novo,
        'obs' => 'Entra em "Despesas fixas" e é lançada no mês pelo botão "Lançar despesas do mês".'];
}
function sv_contas(PDO $pdo, array $f): array
{
    $de = sv_data($f['desde'] ?? '', 'desde') ?: date('Y-m-01');
    $ate = sv_data($f['ate'] ?? '', 'ate') ?: date('Y-m-t', strtotime($de . ' 12:00'));
    $tipo = sv_norm(sv_texto($f['tipo'] ?? '', 20));
    $cli = []; $proc = [];
    foreach (nuc_listar($pdo, 'clientes') as $c) $cli[(string) $c['id']] = $c['nome'] ?? '';
    foreach (nuc_listar($pdo, 'processos') as $p) $proc[(string) $p['id']] = $p['numero'] ?? '';
    $itens = []; $tot = ['a_receber' => 0.0, 'a_pagar' => 0.0, 'recebido' => 0.0, 'pago' => 0.0, 'aguardando_beneficio' => 0.0];
    foreach (nuc_listar($pdo, 'lancamentos') as $l) {
        $d = !empty($l['pago']) ? (string) ($l['pagoEm'] ?: $l['venc']) : (string) ($l['venc'] ?? '');
        if ($d < $de || $d > $ate) continue;
        $rec = ($l['tipo'] ?? '') === 'receita';
        if ($tipo === 'receita' && !$rec || $tipo === 'despesa' && $rec) continue;
        $ag = !empty($l['aguardandoBeneficio']) && empty($l['pago']);
        $k = !empty($l['pago']) ? ($rec ? 'recebido' : 'pago') : ($ag ? 'aguardando_beneficio' : ($rec ? 'a_receber' : 'a_pagar'));
        $tot[$k] += (float) ($l['valor'] ?? 0);
        if (!empty($f['so_em_aberto']) && !empty($l['pago'])) continue;
        $itens[] = ['tipo' => $rec ? 'A receber' : 'A pagar', 'data' => $d, 'descricao' => $l['descricao'] ?? '', 'categoria' => $l['categoria'] ?? '', 'valor' => (float) ($l['valor'] ?? 0),
            'de_quem' => $cli[(string) ($l['clienteId'] ?? '')] ?? '', 'processo' => $proc[(string) ($l['processoId'] ?? '')] ?? '',
            'situacao' => !empty($l['pago']) ? ($rec ? 'Recebido' : 'Pago') : ($ag ? 'Aguardando benefício' : ($d < sv_hoje() ? 'Vencido' : 'Em aberto'))];
    }
    usort($itens, fn($a, $b) => strcmp($a['data'], $b['data']));
    return ['periodo' => [$de, $ate], 'totais' => array_map(fn($v) => round($v, 2), $tot), 'total' => count($itens), 'itens' => array_slice($itens, 0, 300)];
}

/* ---------- tráfego pago: investimento por dia (Meta Ads pela API ou informado pelo Claude) e retorno ---------- */
function tr_nicho(array $existentes, string $campanha): string
{
    foreach ($existentes as $t) if (($t['campanha'] ?? '') === $campanha && !empty($t['nicho'])) return (string) $t['nicho'];
    $n = sv_norm($campanha);
    if (preg_match('/\bsm\b|matern|gestant/', $n)) return 'Salário-maternidade';
    if (preg_match('/bpc|loas/', $n)) return 'BPC/LOAS';
    return '';
}
/* grava linhas diárias (por anúncio) e tira as linhas antigas que cobrem os mesmos dias da mesma conta (não soma duas vezes) */
function tr_gravar_linhas(PDO $pdo, array $linhas, string $fonte, array $quem): array
{
    if (!$linhas) return ['gravadas' => 0, 'substituidas' => 0];
    $existentes = nuc_listar($pdo, 'trafego');
    $porConta = [];
    $chave = fn($l) => (string) ($l['conta'] ?? '') . ($fonte === 'claude' ? '|' . ($l['campanha'] ?? '') : '');
    foreach ($linhas as $l) { $c = $chave($l); $porConta[$c][0] = min($porConta[$c][0] ?? '9999', $l['inicio']); $porConta[$c][1] = max($porConta[$c][1] ?? '', $l['inicio']); }
    $novosIds = array_flip(array_map(fn($l) => $l['id'], $linhas));
    $subst = 0;
    foreach ($existentes as $t) {
        $c = $chave($t);
        if (isset($novosIds[$t['id']]) || !isset($porConta[$c])) continue;
        if (($t['inicio'] ?? '') <= $porConta[$c][1] && ($t['fim'] ?? '') >= $porConta[$c][0] && empty($t['manual'])) { sv_excluir($pdo, 'trafego', (string) $t['id'], $quem['uid'] ?? null); $subst++; }
    }
    foreach ($linhas as $l) {
        $l += ['nicho' => tr_nicho($existentes, (string) $l['campanha']), 'tipoCamp' => '', 'importado' => sv_hoje(), 'fonte' => $fonte, 'alcance' => 0, 'tipo' => '', 'resultados' => 0, 'ativa' => null];
        nuc_gravar($pdo, 'trafego', $l['id'], $l, $quem['uid'] ?? null);
    }
    $pdo->prepare('INSERT INTO historico (quando, usuario_id, acao, colecao, registro_id, ip) VALUES (?,?,?,?,?,?)')
        ->execute([nuc_ms(), $quem['uid'] ?? null, mb_substr('api:trafego:' . $fonte, 0, 20), 'trafego', count($linhas) . ' linhas', $_SERVER['REMOTE_ADDR'] ?? null]);
    return ['gravadas' => count($linhas), 'substituidas' => $subst];
}
function tr_registrar(PDO $pdo, array $in, array $quem): array
{
    $ls = [];
    foreach ((array) ($in['linhas'] ?? []) as $i => $r) {
        if (!is_array($r)) continue;
        $dia = sv_data($r['data'] ?? '', "linhas[$i].data");
        $gasto = sv_valor($r['valor_gasto'] ?? null, "linhas[$i].valor_gasto");
        if ($dia === '' || $gasto === null) throw new SvErro("Linha $i: informe data e valor_gasto.", 422);
        $conta = sv_texto($r['conta'] ?? 'Conta de anúncios', 120) ?: 'Conta de anúncios';
        $camp = sv_texto($r['campanha'] ?? '(sem nome)', 200) ?: '(sem nome)'; $conj = sv_texto($r['conjunto'] ?? '', 200); $an = sv_texto($r['anuncio'] ?? '', 200);
        $ls[] = ['id' => 'tc' . substr(md5("$conta|$camp|$conj|$an|$dia"), 0, 16), 'conta' => $conta, 'campanha' => $camp, 'conjunto' => $conj, 'anuncio' => $an, 'inicio' => $dia, 'fim' => $dia,
            'gasto' => round($gasto, 2), 'impressoes' => (int) ($r['impressoes'] ?? 0), 'cliques' => (int) ($r['cliques'] ?? 0), 'conversas' => (int) ($r['conversas'] ?? 0), 'leads' => (int) ($r['leads'] ?? 0), 'resultados' => (int) ($r['conversas'] ?? 0) ?: (int) ($r['leads'] ?? 0)];
    }
    if (!$ls) throw new SvErro('Envie pelo menos uma linha em "linhas".', 422, ['campo' => 'linhas']);
    return tr_gravar_linhas($pdo, $ls, 'claude', $quem);
}
/* ----- Meta Ads (Graph API). Token e contas ficam em "segredos" (nunca vão para o navegador) ----- */
function ma_cfg(PDO $pdo): array
{
    $s = nuc_config($pdo, 'segredos');
    $contas = [];
    foreach (preg_split('/[\s,;]+/', (string) ($s['metaContas'] ?? '')) as $x) { $d = preg_replace('/\D/', '', $x); if ($d !== '') $contas[] = $d; }
    return ['token' => (string) ($s['metaToken'] ?? ''), 'contas' => array_values(array_unique($contas))];
}
function ma_get(string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10]);
    $r = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) throw new SvErro('Sem conexão com a Meta: ' . $err, 502);
    $j = json_decode((string) $r, true);
    if (!is_array($j)) throw new SvErro('Resposta inválida da Meta (HTTP ' . $code . ').', 502);
    if (isset($j['error'])) throw new SvErro('Meta: ' . ($j['error']['message'] ?? 'erro') . (($j['error']['code'] ?? 0) == 190 ? ' — gere um novo token no Gerenciador de Negócios.' : ''), 502);
    return $j;
}
function ma_acao(array $acoes, array $tipos): int
{
    $n = 0;
    foreach ($acoes as $a) if (in_array($a['action_type'] ?? '', $tipos, true)) $n += (int) round((float) ($a['value'] ?? 0));
    return $n;
}
function ma_sincronizar(PDO $pdo, string $desde, string $ate, array $quem): array
{
    $c = ma_cfg($pdo);
    if ($c['token'] === '' || !$c['contas']) throw new SvErro('Configure o token e as contas de anúncio em Configurações → Integrações.', 409);
    if ($desde > $ate) [$desde, $ate] = [$ate, $desde];
    $res = [];
    foreach ($c['contas'] as $act) {
        $q = http_build_query(['level' => 'ad', 'time_increment' => 1, 'limit' => 500, 'access_token' => $c['token'],
            'fields' => 'account_name,campaign_name,adset_name,ad_name,ad_id,spend,impressions,reach,inline_link_clicks,actions',
            'time_range' => json_encode(['since' => $desde, 'until' => $ate])]);
        $url = "https://graph.facebook.com/v21.0/act_$act/insights?$q";
        $ls = []; $paginas = 0; $conta = '';
        while ($url && $paginas++ < 40) {
            $j = ma_get($url);
            foreach ((array) ($j['data'] ?? []) as $r) {
                $dia = (string) ($r['date_start'] ?? ''); $conta = (string) ($r['account_name'] ?? ('Conta ' . $act));
                $ac = (array) ($r['actions'] ?? []);
                $ls[] = ['id' => 'ma' . substr(md5($act . '|' . ($r['ad_id'] ?? $r['ad_name'] ?? '') . '|' . $dia), 0, 16), 'conta' => $conta, 'contaId' => $act,
                    'campanha' => (string) ($r['campaign_name'] ?? '(sem nome)'), 'conjunto' => (string) ($r['adset_name'] ?? ''), 'anuncio' => (string) ($r['ad_name'] ?? ''), 'inicio' => $dia, 'fim' => $dia,
                    'gasto' => round((float) ($r['spend'] ?? 0), 2), 'impressoes' => (int) ($r['impressions'] ?? 0), 'alcance' => (int) ($r['reach'] ?? 0), 'cliques' => (int) ($r['inline_link_clicks'] ?? 0),
                    'conversas' => ma_acao($ac, ['onsite_conversion.messaging_conversation_started_7d']), 'leads' => ma_acao($ac, ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'])];
                $ls[count($ls) - 1]['resultados'] = $ls[count($ls) - 1]['conversas'] ?: $ls[count($ls) - 1]['leads'];
                $ls[count($ls) - 1]['tipo'] = 'Conversas por mensagem iniciadas';
            }
            $url = (string) ($j['paging']['next'] ?? '');
        }
        $g = tr_gravar_linhas($pdo, $ls, 'meta', $quem);
        $res[] = ['conta' => $conta ?: $act, 'linhas' => $g['gravadas'], 'investido' => round(array_sum(array_column($ls, 'gasto')), 2)];
    }
    $est = nuc_config($pdo, 'metaAdsEstado');
    $est = ['ultima' => nuc_ms(), 'ate' => $ate, 'resultado' => $res, 'erro' => ''] + $est;
    nuc_gravar($pdo, 'config', 'metaAdsEstado', $est);
    return ['periodo' => [$desde, $ate], 'contas' => $res];
}
/* automático: no máximo a cada 6 horas, quando alguém abre o sistema (busca desde o último dia sincronizado, até 90 dias) */
function ma_auto(PDO $pdo): void
{
    $c = ma_cfg($pdo);
    if ($c['token'] === '' || !$c['contas']) return;
    $est = nuc_config($pdo, 'metaAdsEstado');
    if (nuc_ms() - (int) ($est['ultima'] ?? 0) < 6 * 3600000) return;
    $desde = max(date('Y-m-d', strtotime('-90 days')), date('Y-m-d', strtotime(((string) ($est['ate'] ?? date('Y-m-d', strtotime('-30 days')))) . ' -2 days')));
    try { ma_sincronizar($pdo, $desde, date('Y-m-d'), ['tipo' => 'meta', 'nome' => 'Meta Ads (automático)', 'uid' => null]); }
    catch (Throwable $e) { nuc_gravar($pdo, 'config', 'metaAdsEstado', ['ultima' => nuc_ms(), 'erro' => $e->getMessage()] + $est); }
}
/* relatório: orgânico x pago, investimento e retorno em contratos, por dia / semana / quinzena / mês */
function tr_periodo(string $d, string $agrup): string
{
    $t = strtotime("$d 12:00");
    if ($agrup === 'dia') return $d;
    if ($agrup === 'semana') return date('Y-m-d', strtotime('monday this week', $t));
    if ($agrup === 'quinzena') return substr($d, 0, 8) . ((int) substr($d, 8) <= 15 ? '01' : '16');
    return substr($d, 0, 7);
}
function tr_relatorio(PDO $pdo, array $f): array
{
    $ag = sv_norm(sv_texto($f['agrupar_por'] ?? 'mes', 12));
    $ag = in_array($ag, ['dia', 'semana', 'quinzena'], true) ? $ag : 'mes';
    $ate = sv_data($f['ate'] ?? '', 'ate') ?: sv_hoje();
    $de = sv_data($f['desde'] ?? '', 'desde') ?: date('Y-m-d', strtotime("$ate -" . ['dia' => 14, 'semana' => 56, 'quinzena' => 90, 'mes' => 180][$ag] . ' days'));
    $pago = fn($o) => preg_match('/facebook|instagram|meta|google ads|anúncio|anuncio|tráfego|trafego/iu', (string) $o);
    $P = [];
    $z = fn() => ['leads' => 0, 'leads_pagos' => 0, 'leads_organicos' => 0, 'investido' => 0.0, 'conversas' => 0, 'contratos' => 0, 'contratos_pagos' => 0, 'valor_contratos' => 0.0, 'valor_contratos_pagos' => 0.0, 'por_conta' => []];
    foreach (nuc_listar($pdo, 'leads') as $l) {
        $d = (string) ($l['primeiroContato'] ?? ($l['criado'] ?? ''));
        if ($d < $de || $d > $ate) continue;
        $k = tr_periodo($d, $ag); $P[$k] = $P[$k] ?? $z();
        $P[$k]['leads']++; $P[$k][$pago($l['origem'] ?? '') ? 'leads_pagos' : 'leads_organicos']++;
    }
    foreach (nuc_listar($pdo, 'trafego') as $t) {
        $ini = (string) ($t['inicio'] ?? ''); $fim = (string) ($t['fim'] ?? $ini);
        if ($ini === '' || $fim < $de || $ini > $ate) continue;
        // linha de vários dias (planilha): divide o valor igualmente pelos dias
        $dias = max(1, (int) round((strtotime("$fim 12:00") - strtotime("$ini 12:00")) / 86400) + 1);
        for ($i = 0; $i < $dias; $i++) {
            $d = date('Y-m-d', strtotime("$ini 12:00 +$i day"));
            if ($d < $de || $d > $ate) continue;
            $k = tr_periodo($d, $ag); $P[$k] = $P[$k] ?? $z();
            $v = (float) ($t['gasto'] ?? 0) / $dias;
            $P[$k]['investido'] += $v; $P[$k]['conversas'] += (int) ($t['conversas'] ?? 0) / $dias;
            $cn = (string) ($t['conta'] ?? '—'); $P[$k]['por_conta'][$cn] = ($P[$k]['por_conta'][$cn] ?? 0) + $v;
        }
    }
    $clientes = []; $leads = [];
    foreach (nuc_listar($pdo, 'clientes') as $c) $clientes[(string) $c['id']] = $c;
    foreach (nuc_listar($pdo, 'leads') as $l) $leads[(string) $l['id']] = $l;
    foreach (nuc_listar($pdo, 'contratos') as $k0) {
        $d = (string) ($k0['data'] ?? '');
        if ($d < $de || $d > $ate) continue;
        $c = $clientes[(string) ($k0['clienteId'] ?? '')] ?? [];
        $orig = (string) ($c['origem'] ?? ($leads[(string) ($c['leadId'] ?? '')]['origem'] ?? ''));
        $k = tr_periodo($d, $ag); $P[$k] = $P[$k] ?? $z();
        $v = (float) ($k0['valorTotal'] ?? 0);
        $P[$k]['contratos']++; $P[$k]['valor_contratos'] += $v;
        if ($pago($orig)) { $P[$k]['contratos_pagos']++; $P[$k]['valor_contratos_pagos'] += $v; }
    }
    ksort($P);
    $tot = $z(); $linhas = [];
    foreach ($P as $k => $x) {
        foreach ($x as $c => $v) if ($c !== 'por_conta') $tot[$c] += $v;
        foreach ($x['por_conta'] as $cn => $v) $tot['por_conta'][$cn] = ($tot['por_conta'][$cn] ?? 0) + $v;
        $linhas[] = tr_linha($k, $x);
    }
    $nd = max(1, (int) round((strtotime("$ate 12:00") - strtotime("$de 12:00")) / 86400) + 1);
    return ['agrupado_por' => $ag, 'periodo' => [$de, $ate], 'linhas' => $linhas, 'total' => tr_linha('total', $tot) + ['investimento_medio_por_dia' => round($tot['investido'] / $nd, 2)],
        'obs' => 'Lead pago = origem de anúncio (código do anúncio, "veio de anúncio" ou plataforma). Contrato pago = cliente cuja origem é anúncio. Retorno = valor dos contratos pagos ÷ investimento.'];
}
function tr_linha(string $k, array $x): array
{
    $pc = fn($a, $b) => $b ? round($a / $b * 100, 1) : 0;
    return ['periodo' => $k, 'leads' => $x['leads'], 'leads_pagos' => $x['leads_pagos'], 'leads_organicos' => $x['leads_organicos'], 'percentual_pago' => $pc($x['leads_pagos'], $x['leads']),
        'percentual_organico' => $pc($x['leads_organicos'], $x['leads']), 'investido' => round($x['investido'], 2), 'investido_por_conta' => array_map(fn($v) => round($v, 2), $x['por_conta']),
        'custo_por_lead_pago' => $x['leads_pagos'] ? round($x['investido'] / $x['leads_pagos'], 2) : null, 'contratos' => $x['contratos'], 'contratos_de_anuncio' => $x['contratos_pagos'],
        'valor_contratos' => round($x['valor_contratos'], 2), 'valor_contratos_de_anuncio' => round($x['valor_contratos_pagos'], 2),
        'cac' => $x['contratos_pagos'] ? round($x['investido'] / $x['contratos_pagos'], 2) : null, 'retorno_por_real' => $x['investido'] > 0 ? round($x['valor_contratos_pagos'] / $x['investido'], 2) : null];
}
