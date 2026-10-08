<?php
/*
 * CONFIGURAÇÃO DO BANCO DE DADOS
 * ------------------------------------------------------------------
 * 1. Copie este arquivo e renomeie a cópia para  config.php
 * 2. Preencha os dados do banco MySQL criado no cPanel da hospedagem
 *    (cPanel → "Bancos de dados MySQL").
 * 3. Nunca compartilhe o config.php: ele contém a senha do banco.
 */
return [
    // 'mysql' (recomendado na HostGator) ou 'sqlite' (arquivo único, sem criar banco)
    'driver'   => 'mysql',

    // --- MySQL ---
    'host'     => 'localhost',
    'banco'    => 'usuariocpanel_gestao',   // nome completo do banco, como aparece no cPanel
    'usuario'  => 'usuariocpanel_app',      // usuário do banco
    'senha'    => 'TROQUE_ESTA_SENHA',

    // --- SQLite (só se driver = 'sqlite') ---
    // Caminho de um arquivo FORA da pasta pública (public_html), ex.: '/home/usuariocpanel/dados/gestao.sqlite'
    'arquivo'  => __DIR__ . '/dados/gestao.sqlite',

    // Tempo de sessão sem uso antes de pedir login de novo (em minutos)
    'sessao_minutos' => 480,
];
