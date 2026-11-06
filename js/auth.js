/* Autenticação, Telas de Login/Cadastro e Fluxo Principal */
import { state, displayName } from './state.js';
import { supabaseClient, SYSTEM_LOGO } from './config.js';
import {
    getMyGroups, getPendingRequests, renderGroupSelector,
    carregarGrupo, createUserAndGroup, joinGroup, loadJoinGroups
} from './grupos.js';

export function initAuth() {
    try {
        var hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            var params = new URLSearchParams(hash.substring(1));
            var accessToken = params.get('access_token');
            var refreshToken = params.get('refresh_token');
            if (accessToken) {
                supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(function(data) {
                    state.AUTH.session = data.session;
                    state.AUTH.user = data.session ? data.session.user : null;
                    window.history.replaceState({}, document.title, window.location.pathname);
                    onAuthStateChanged(state.AUTH.user);
                });
                return;
            }
        } else if (hash && hash.includes('error=')) {
            window.history.replaceState({}, document.title, window.location.pathname);
            renderLoginScreen();
            return;
        }
        supabaseClient.auth.getSession().then(function(result) {
            state.AUTH.session = result.data.session;
            state.AUTH.user = result.data.session ? result.data.session.user : null;
        });
        supabaseClient.auth.onAuthStateChange(function(event, session) {
            state.AUTH.session = session;
            state.AUTH.user = session ? session.user : null;
            if (event === 'TOKEN_REFRESHED' && state.grupoAtual) {
                return;
            }
            onAuthStateChanged(state.AUTH.user);
        });
    } catch (err) {
        console.error('Erro ao inicializar auth:', err);
    }
}

export function ensureSession(email, password) {
    return supabaseClient.auth.getSession().then(function(result) {
        if (result.data && result.data.session) return { success: true, session: result.data.session };
        return supabaseClient.auth.signInWithPassword({ email: email.trim(), password: password }).then(function(r) {
            if (r.error) return { success: false, error: r.error.message };
            return { success: true, session: r.data.session };
        });
    });
}

export function signupUser(email, password, username) {
    return supabaseClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: { data: { display_name: username.trim() } }
    }).then(function(result) {
        if (result.error) {
            var msg = (result.error.message || '').toLowerCase();
            if (msg.indexOf('already registered') >= 0 || msg.indexOf('already exists') >= 0) {
                return { success: false, alreadyRegistered: true, error: 'Este e-mail já tem conta. Faça login.' };
            }
            if (msg.indexOf('invalid') >= 0) {
                return { success: false, error: 'E-mail recusado pelo servidor. Use um e-mail válido.' };
            }
            return { success: false, error: result.error.message };
        }
        var user = result.data.user;
        state.PENDING_SIGNUP = { email: email.trim().toLowerCase(), password: password, username: username.trim(), userId: user ? user.id : null };
        return ensureSession(email, password).then(function(s) {
            if (!s.success) return { success: false, error: 'Conta criada! Confirme seu e-mail e faça login.' };
            state.AUTH.session = s.session;
            state.AUTH.user = s.session.user;
            if (state.PENDING_SIGNUP) state.PENDING_SIGNUP.userId = state.AUTH.user.id;
            return { success: true, user: state.AUTH.user };
        });
    });
}

export function loginWithEmail(email, password) {
    state.AUTH.loading = true;
    return supabaseClient.auth.signInWithPassword({ email: email.trim(), password: password }).then(function(result) {
        if (result.error) {
            var msg = (result.error.message || '').toLowerCase();
            if (msg.indexOf('invalid login credentials') >= 0 || msg.indexOf('invalid') >= 0) {
                return { success: false, notFound: true, error: 'E-mail não encontrado.' };
            }
            return { success: false, error: result.error.message };
        }
        return { success: true, message: 'Logado com sucesso!' };
    }).finally(function() { state.AUTH.loading = false; });
}

export function logout() {
    state.PENDING_SIGNUP = null;
    state.LOGO_FILE = null;
    state.JOIN_SLUG = null;
    supabaseClient.auth.signOut().then(function() {
        state.AUTH.user = null;
        state.AUTH.session = null;
        onAuthStateChanged(null);
    }).catch(function(err) {
        console.error('Erro ao logout:', err);
    });
}

export function onAuthStateChanged(user) {
    var adminSection = document.getElementById('adminSection');
    if (user) {
        hideWaitingScreen();
        if (adminSection) adminSection.style.display = 'block';
        loadApp();
    } else {
        var panel = document.getElementById('pendingPanel');
        if (panel) panel.innerHTML = '';
        renderLoginScreen();
    }
}

export function resetHeaderGenerico() {
    var nomeEl = document.getElementById('nomeGrupo');
    var subEl = document.getElementById('subGrupo');
    var logoEl = document.getElementById('logoGrupo');
    if (nomeEl) nomeEl.textContent = 'Sorteador de Times';
    if (subEl) subEl.textContent = 'Sorteie os times da sua pelada';
    if (logoEl) logoEl.src = SYSTEM_LOGO;
    document.title = 'Sorteador de Times';
}

export function personalizarHeader(grupo) {
    var nomeEl = document.getElementById('nomeGrupo');
    var subEl = document.getElementById('subGrupo');
    var logoEl = document.getElementById('logoGrupo');
    if (nomeEl) nomeEl.textContent = grupo.nome;
    if (subEl) subEl.textContent = 'Sorteador Oficial de Times';
    if (logoEl && grupo.logo_url) logoEl.src = grupo.logo_url;
    document.title = grupo.nome + ' - Sorteador de Times';
}

export function renderUserBar() {
    var el = document.getElementById('userInfo');
    if (el) el.textContent = displayName();
}

export function loadApp() {
    getMyGroups().then(function(groups) {
        state.MEUS_GRUPOS = groups || [];
        var approved = (groups || []).filter(function(g) { return g.status === 'approved'; });
        var pending = (groups || []).filter(function(g) { return g.status !== 'approved'; });
        renderUserBar();
        var mainEl = document.getElementById('mainApp');
        if (approved.length === 0) {
            if (mainEl) mainEl.style.display = 'none';
            renderPendingPanel([]);
            if (pending.length > 0) showWaitingScreen(pending);
            else showGroupChoice();
            return;
        }
        if (mainEl) mainEl.style.display = 'block';
        hideWaitingScreen();
        renderGroupSelector(approved);
        carregarGrupo(approved[0].slug);
        renderPendingPanel(approved);
    });
}

export function showWaitingScreen(pending) {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var nome = displayName();
    var lista = pending.length
        ? pending.map(function(g) { return '<li>' + g.nome + ' (' + g.slug + ') — aguardando aprovação do owner</li>'; }).join('')
        : '<li>Seu pedido foi registrado. Aguarde aprovação do owner.</li>';
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Olá, ' + nome + '</h2><p>Seu acesso está pendente</p></div><div class="login-body"><ul class="waiting-list">' + lista + '</ul><button class="btn-secondary" onclick="logout()">Sair</button></div></div></div>';
    ls.style.display = 'block';
}

export function hideWaitingScreen() {
    var ls = document.getElementById('loginSection');
    if (ls) { ls.innerHTML = ''; ls.style.display = 'none'; }
}

export function renderPendingPanel(ownerGroups) {
    var panel = document.getElementById('pendingPanel');
    if (!panel) return;
    if (!ownerGroups || !ownerGroups.length) { panel.innerHTML = ''; return; }
    var promises = ownerGroups.map(function(g) {
        return getPendingRequests(g.id).then(function(reqs) { return { grupo: g, pedidos: reqs }; });
    });
    Promise.all(promises).then(function(resultados) {
        var html = '';
        resultados.forEach(function(r) {
            if (!r.pedidos.length) return;
            html += '<div class="pending-panel"><h3>Pedidos pendentes — ' + r.grupo.nome + '</h3>';
            r.pedidos.forEach(function(p) {
                html += '<div class="pending-item"><span class="pending-email">' + p.email + '</span><span class="pending-actions"><button class="btn-success btn-compact" onclick="doApprove(\'' + p.id + '\')">Aprovar</button> <button class="btn-secondary btn-compact" onclick="doReject(\'' + p.id + '\')">Recusar</button></span></div>';
            });
            html += '</div>';
        });
        panel.innerHTML = html;
    });
}

export function renderLoginScreen() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var mainEl = document.getElementById('mainApp');
    var adminSection = document.getElementById('adminSection');
    if (mainEl) mainEl.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    resetHeaderGenerico();
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Sorteador de Times</h2><p>Área do organizador</p></div><div class="login-body"><form id="loginForm" onsubmit="doLogin(); return false;"><div class="form-group"><label for="loginEmail">Seu e-mail</label><input type="email" id="loginEmail" placeholder="seu@email.com" autocomplete="email"></div><div class="form-group"><label for="loginPassword">Sua senha</label><input type="password" id="loginPassword" placeholder="Sua senha" autocomplete="current-password"></div><button id="btnLogin" class="btn-primary" type="submit">Entrar</button><p id="loginSwitchText" class="login-hint"><a href="#" onclick="showSignupForm(); return false;">Não tem conta? Cadastre-se</a></p></form><div id="loginLoading" style="display:none;"><p>Entrando...</p></div><div id="loginStatus"></div></div></div></div>';
    ls.style.display = 'block';
}

export function showSignupForm(prefillEmail) {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Criar conta</h2><p>Primeiro, crie seu usuário</p></div><div class="login-body"><div id="signupForm"><div class="form-group"><label for="signupUsername">Nome de usuário</label><input type="text" id="signupUsername" placeholder="Seu nome" autocomplete="nickname"></div><div class="form-group"><label for="signupEmail">Seu e-mail</label><input type="email" id="signupEmail" placeholder="seu@email.com" autocomplete="email" value="' + (prefillEmail || '') + '"></div><div class="form-group"><label for="signupPassword">Senha</label><input type="password" id="signupPassword" placeholder="Mínimo 6 caracteres" autocomplete="new-password"></div><button class="btn-primary" onclick="doSignup()">Criar conta</button><p class="login-hint"><a href="#" onclick="renderLoginScreen(); return false;">Já tenho conta</a></p></div><div id="signupLoading" style="display:none;"><p>Criando...</p></div><div id="signupStatus"></div></div></div></div>';
    ls.style.display = 'block';
}

export function showGroupChoice() {
    var ls = document.getElementById('loginSection');
    if (!ls || !state.AUTH.user) { renderLoginScreen(); return; }
    var name = state.PENDING_SIGNUP ? state.PENDING_SIGNUP.username : displayName();
    var mainEl = document.getElementById('mainApp');
    if (mainEl) mainEl.style.display = 'none';
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Olá, ' + name + '</h2><p>Você ainda não tem grupo. Escolha uma opção:</p></div><div class="login-body"><div id="newUserForm"><button class="btn-primary" onclick="showCreateGroup()">Criar grupo</button><button class="btn-secondary" onclick="showJoinGroup()">Entrar em grupo</button><p class="login-hint"><a href="#" onclick="logout(); return false;">Sair</a></p></div></div></div></div>';
    ls.style.display = 'block';
}

export function showCreateGroup() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var email = state.PENDING_SIGNUP ? state.PENDING_SIGNUP.email : (state.AUTH.user ? state.AUTH.user.email : '');
    var username = state.PENDING_SIGNUP ? state.PENDING_SIGNUP.username : (displayName() || '');
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Criar Grupo</h2><p>Você será o owner do grupo</p></div><div class="login-body"><div id="createGroupForm"><div class="form-group"><label for="groupName">Nome do grupo</label><input type="text" id="groupName" placeholder="Ex: Boleiros de Cristo"></div><div class="form-group"><label for="groupLogo">Logo (URL ou arquivo)</label><input type="text" id="groupLogo" placeholder="URL da logo (opcional)"><input type="file" id="groupLogoFile" accept="image/*" style="margin-top:8px;"><img id="groupLogoPreview" style="display:none;max-width:96px;margin-top:8px;border-radius:8px;"></div><div class="form-group"><label for="newUsername">Seu nome de usuário</label><input type="text" id="newUsername" placeholder="Seu nome" value="' + username + '"></div><div class="form-group"><label for="newEmail">Seu e-mail</label><input type="email" id="newEmail" placeholder="seu@email.com" value="' + email + '"></div><div class="form-group"><label for="newPassword">Senha</label><input type="password" id="newPassword" placeholder="Sua senha"></div><button class="btn-primary" onclick="doCreateGroup()">Criar Grupo</button><p class="login-hint"><a href="#" onclick="showGroupChoice(); return false;">Voltar</a></p></div><div id="createGroupLoading" style="display:none;"><p>Criando...</p></div><div id="createGroupStatus"></div></div></div></div>';
    var fileInput = document.getElementById('groupLogoFile');
    if (fileInput) fileInput.addEventListener('change', function() {
        var f = fileInput.files && fileInput.files[0];
        var prev = document.getElementById('groupLogoPreview');
        if (!f) { state.LOGO_FILE = null; if (prev) prev.style.display = 'none'; return; }
        state.LOGO_FILE = f;
        if (prev) { prev.src = URL.createObjectURL(f); prev.style.display = 'block'; }
    });
}

export function showJoinGroup() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var email = state.PENDING_SIGNUP ? state.PENDING_SIGNUP.email : (state.AUTH.user ? state.AUTH.user.email : '');
    var username = state.PENDING_SIGNUP ? state.PENDING_SIGNUP.username : (displayName() || '');
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Entrar em Grupo</h2><p>O owner precisa aprovar seu pedido</p></div><div class="login-body"><div id="joinGroupForm"><div class="form-group"><label for="joinUsername">Seu nome de usuário</label><input type="text" id="joinUsername" placeholder="Seu nome" value="' + username + '"></div><div class="form-group"><label for="joinEmail">Seu e-mail</label><input type="email" id="joinEmail" placeholder="seu@email.com" value="' + email + '"></div><div class="form-group"><label for="joinPassword">Sua senha</label><input type="password" id="joinPassword" placeholder="Sua senha"></div><div class="form-group"><label>Escolha o grupo</label><div id="joinGroupList"><p class="login-hint">Carregando grupos...</p></div></div><button class="btn-primary" onclick="doJoinGroup()">Pedir acesso</button><p class="login-hint"><a href="#" onclick="showGroupChoice(); return false;">Voltar</a></p></div><div id="joinGroupLoading" style="display:none;"><p>Solicitando...</p></div><div id="joinGroupStatus"></div></div></div></div>';
    state.JOIN_SLUG = null;
    loadJoinGroups();
}

export function doLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !email.includes('@')) { alert('Informe um e-mail válido.'); return; }
    if (!password) { alert('Informe sua senha.'); return; }
    var formEl = document.getElementById('loginForm');
    var loadingEl = document.getElementById('loginLoading');
    var statusEl = document.getElementById('loginStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';
    loginWithEmail(email, password).then(function(result) {
        if (result.success) return;
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        if (result.notFound) {
            if (statusEl) statusEl.innerHTML = '<p class="login-error">E-mail não encontrado. Cadastre-se abaixo.</p>';
            setTimeout(function() { showSignupForm(email); }, 1200);
        } else if (statusEl) {
            statusEl.innerHTML = '<p class="login-error">Erro: ' + result.error + '</p>';
        }
    });
}

export function doSignup() {
    var username = document.getElementById('signupUsername').value.trim();
    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value;
    if (!username) { alert('Informe seu nome de usuário.'); return; }
    if (!email || !email.includes('@')) { alert('Informe um e-mail válido.'); return; }
    if (!password || password.length < 6) { alert('A senha deve ter no mínimo 6 caracteres.'); return; }
    var formEl = document.getElementById('signupForm');
    var loadingEl = document.getElementById('signupLoading');
    var statusEl = document.getElementById('signupStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';
    signupUser(email, password, username).then(function(result) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (!result.success) {
            if (formEl) formEl.style.display = 'block';
            if (result.alreadyRegistered) {
                if (statusEl) statusEl.innerHTML = '<p class="login-error">' + result.error + '</p>';
                setTimeout(function() { renderLoginScreen(); }, 1500);
            } else if (statusEl) {
                statusEl.innerHTML = '<p class="login-error">Erro: ' + result.error + '</p>';
            }
            return;
        }
        showGroupChoice();
    });
}

export function doCreateGroup() {
    var nomeGrupo = document.getElementById('groupName').value.trim();
    var logoTyped = document.getElementById('groupLogo').value.trim();
    var username = document.getElementById('newUsername').value.trim();
    var email = document.getElementById('newEmail').value.trim();
    var password = document.getElementById('newPassword').value;
    if (!nomeGrupo) { alert('Informe o nome do grupo.'); return; }
    if (!username) { alert('Informe seu nome de usuário.'); return; }
    if (!email || !email.includes('@')) { alert('Informe um e-mail válido.'); return; }
    if (!password) { alert('Informe sua senha.'); return; }
    var formEl = document.getElementById('createGroupForm');
    var loadingEl = document.getElementById('createGroupLoading');
    var statusEl = document.getElementById('createGroupStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';

    var finish = function(finalLogo) {
        state.LOGO_FILE = null;
        createUserAndGroup(email, password, username, nomeGrupo, finalLogo, signupUser, ensureSession).then(function(result) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (formEl) formEl.style.display = 'block';
            if (statusEl) statusEl.innerHTML = result.success ? '<p class="login-success">Grupo criado! Entrando...</p>' : '<p class="login-error">Erro: ' + result.error + '</p>';
            if (result.success) { setTimeout(function() { onAuthStateChanged(state.AUTH.user); }, 1500); }
        });
    };

    if (state.LOGO_FILE) {
        import('./grupos.js').then(function(m) {
            m.uploadLogo(state.LOGO_FILE).then(function(up) {
                if (!up.success) {
                    if (loadingEl) loadingEl.style.display = 'none';
                    if (formEl) formEl.style.display = 'block';
                    if (statusEl) statusEl.innerHTML = '<p class="login-error">Erro no upload da logo: ' + up.error + '</p>';
                    return;
                }
                finish(up.url);
            });
        });
    } else {
        finish(logoTyped || SYSTEM_LOGO);
    }
}

export function doJoinGroup() {
    var username = document.getElementById('joinUsername').value.trim();
    var email = document.getElementById('joinEmail').value.trim();
    var password = document.getElementById('joinPassword').value;
    var slug = state.JOIN_SLUG;
    if (!username) { alert('Informe seu nome de usuário.'); return; }
    if (!email || !email.includes('@')) { alert('Informe um e-mail válido.'); return; }
    if (!password) { alert('Informe sua senha.'); return; }
    if (!slug) { alert('Escolha um grupo na lista.'); return; }
    var formEl = document.getElementById('joinGroupForm');
    var loadingEl = document.getElementById('joinGroupLoading');
    var statusEl = document.getElementById('joinGroupStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';
    joinGroup(email, password, username, slug, signupUser, ensureSession).then(function(result) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        if (statusEl) statusEl.innerHTML = result.success ? '<p class="login-success">Pedido enviado! Aguarde aprovação do owner.</p>' : '<p class="login-error">Erro: ' + result.error + '</p>';
        if (result.success) { setTimeout(function() { onAuthStateChanged(state.AUTH.user); }, 1500); }
    });
}
