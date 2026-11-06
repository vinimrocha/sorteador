/* Entrypoint da Aplicação - Boleiros de Cristo (Sorteador de Times) */

import { supabaseClient } from './config.js';
import { state, displayName, isOwnerOf } from './state.js';
import {
    initAuth, loginWithEmail, logout, onAuthStateChanged, renderLoginScreen,
    showSignupForm, showGroupChoice, showCreateGroup, showJoinGroup,
    doLogin, doSignup, doCreateGroup, doJoinGroup
} from './auth.js';
import {
    showManageGroup, doSaveGroup, carregarPendentesManage, doApproveManage,
    doRejectManage, carregarMembrosManage, doRemoveAdmin, doDeleteGroup,
    doApprove, doReject, mudarGrupo, selectJoinGroup
} from './grupos.js';
import {
    adicionarJogadorFixo, editarJogador, fecharModalJogador, salvarEdicaoJogador,
    removerJogador, adicionarConvidado, desmarcarTodos, renderLista
} from './jogadores.js';
import { realizarSorteio, compartilharImagem } from './sorteio.js';
import {
    carregarDadosArtilharia, trocarTipoPeriodo, trocarChavePeriodo,
    abrirModalLancarGols, fecharModalLancarGols, ajustarGol, validarInputGol,
    filtrarJogadoresModal, importarPresentesNaRodada, salvarGolsRodada,
    abrirHistoricoRodadas, fecharModalHistorico, excluirRodada,
    compartilharRankingImagem
} from './artilharia.js';
import { registerServiceWorker, initInstallPrompt, doInstall, dismissInstall } from './pwa.js';

export function trocarAba(aba) {
    var tabS = document.getElementById('tabSorteador');
    var tabA = document.getElementById('tabArtilharia');
    var appMain = document.getElementById('mainApp');
    var appArt = document.getElementById('artilhariaApp');

    if (aba === 'artilharia') {
        if (tabS) tabS.classList.remove('active');
        if (tabA) tabA.classList.add('active');
        if (appMain) appMain.style.display = 'none';
        if (appArt) appArt.style.display = 'block';
        carregarDadosArtilharia();
    } else {
        if (tabA) tabA.classList.remove('active');
        if (tabS) tabS.classList.add('active');
        if (appArt) appArt.style.display = 'none';
        if (appMain) appMain.style.display = 'block';
    }
}

// Expor funções necessárias para o escopo global (window),
// garantindo compatibilidade com onclick inline no HTML e templates dinâmicos
Object.assign(window, {
    // Navegação de Abas
    trocarAba,

    // Autenticação & Fluxo de Telas
    initAuth,
    loginWithEmail,
    logout,
    onAuthStateChanged,
    renderLoginScreen,
    showSignupForm,
    showGroupChoice,
    showCreateGroup,
    showJoinGroup,
    doLogin,
    doSignup,
    doCreateGroup,
    doJoinGroup,

    // Grupos & Gestão (Owner/Admin)
    showManageGroup,
    doSaveGroup,
    carregarPendentesManage,
    doApproveManage,
    doRejectManage,
    carregarMembrosManage,
    doRemoveAdmin,
    doDeleteGroup,
    doApprove,
    doReject,
    mudarGrupo,
    selectJoinGroup,

    // Jogadores & Presença
    adicionarJogadorFixo,
    editarJogador,
    fecharModalJogador,
    salvarEdicaoJogador,
    removerJogador,
    adicionarConvidado,
    desmarcarTodos,
    renderLista,

    // Sorteio
    realizarSorteio,
    compartilharImagem,

    // Artilharia & Rankings
    carregarDadosArtilharia,
    trocarTipoPeriodo,
    trocarChavePeriodo,
    abrirModalLancarGols,
    fecharModalLancarGols,
    ajustarGol,
    validarInputGol,
    filtrarJogadoresModal,
    importarPresentesNaRodada,
    salvarGolsRodada,
    abrirHistoricoRodadas,
    fecharModalHistorico,
    excluirRodada,
    compartilharRankingImagem,

    // PWA
    doInstall,
    dismissInstall
});

// Inicialização da aplicação após carregamento do DOM
document.addEventListener('DOMContentLoaded', function() {
    renderLoginScreen();
    initAuth();
    registerServiceWorker();
    initInstallPrompt();
});
