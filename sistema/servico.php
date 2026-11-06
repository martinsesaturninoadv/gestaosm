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
const SV_ESCOPOS = ['clientes:ler', 'clientes:gravar', 'leads:ler', 'leads:gravar', 'anuncios:ler', 'anuncios:gravar', 'relatorios:ler'];
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
        'conjunto' => $l['conjunto'] ?? '', 'anuncio' => $l['anuncio'] ?? '', 'area_interesse' => $l['produto'] ?? '', 'resumo_triagem' => $l['resumoTriagem'] ?? '',
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
    } elseif (empty($l['codigoAnuncio']) && (empty($l['origem']) || $l['origem'] === SV_ORIGEM_ORGANICA)) {
        $l['origem'] = SV_ORIGEM_ORGANICA;
    }
    foreach (['campanha', 'conjunto', 'anuncio'] as $k) if (isset($in[$k]) && sv_texto($in[$k], 200) !== '') $l[$k] = sv_texto($in[$k], 200);
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
        foreach (['origem' => 'origem', 'produto' => 'produto', 'email' => 'email'] as $de => $para) if (empty($c[$para]) && !empty($lead[$de])) $c[$para] = $lead[$de];
        if (empty($c['tel']) && !empty($lead['telE164'])) { $c['telE164'] = $lead['telE164']; $c['tel'] = sv_telefone_exibir($lead['telE164']); }
        if (!empty($lead['primeiroContato'])) $c['primeiroContato'] = $lead['primeiroContato'];
    }
    if (empty($c['origem'])) $c['origem'] = 'Outro';
    sv_gravar($pdo, 'clientes', $c['id'], $c, $quem);
    $contrato = sv_cliente_honorarios($pdo, $c, $in, $quem);
    if ($lead) sv_marcar_convertido($pdo, $lead, (string) $c['id'], $quem);
    return ['cliente' => sv_cliente_api($pdo, $c), 'contrato_id' => $contrato];
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
    foreach (WSP_CAMINHOS as $campo => $caminhos) {
        $lista = !empty($cfg['caminhos'][$campo]) ? array_merge([(string) $cfg['caminhos'][$campo]], $caminhos) : $caminhos;
        $v = null;
        foreach ($lista as $c) if (($v = wsp_pegar($p, $c)) !== null && $v !== '' && $v !== []) break;
        if ($v === null || $v === '' || $v === []) $v = wsp_procurar($p, array_map(fn($c) => mb_strtolower((string) preg_replace('/^.*\./', '', $c)), $caminhos));
        $out[$campo] = $v;
    }
    $tel = wsp_texto_de($out['telefone']);
    $etq = [];
    foreach ((array) ($out['etiquetas'] ?? []) as $e) { $t = sv_texto(wsp_texto_de($e), 60); if ($t !== '') $etq[] = $t; }
    if (is_string($out['etiquetas'] ?? null)) $etq = array_filter(array_map('trim', explode(',', $out['etiquetas'])));
    return ['evento' => sv_texto(wsp_texto_de($out['evento']), 80), 'telefone' => strpos($tel, '@g.us') !== false ? '' : $tel, 'nome' => sv_texto(wsp_texto_de($out['nome']), 120),
        'mensagem' => sv_texto(wsp_texto_de($out['mensagem']), 2000), 'coluna' => sv_texto(wsp_texto_de($out['coluna']), 80), 'etiquetas' => array_values($etq),
        'de_mim' => $out['de_mim'] !== null && sv_bool($out['de_mim'])];
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
    if ($x['telefone'] === '' || sv_telefone_e164($x['telefone']) === '') return ['status' => 'ignorado', 'detalhe' => 'Telefone não encontrado no evento: ajuste o mapeamento em Configurações → API e conector.', 'extraido' => $x];
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
