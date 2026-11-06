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
import { registerServiceWorker, initInstallPrompt, doInstall, dismissInstall } from './pwa.js';

// Expor funções necessárias para o escopo global (window),
// garantindo compatibilidade com onclick inline no HTML e templates dinâmicos
Object.assign(window, {
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
