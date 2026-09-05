const AUTH = { loading: false, user: null, session: null };
var grupoAtual = null;

const SUPABASE_URL = 'https://maqdmlsouqmadoaayrcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcWRtbHNvdXFtYWRvYWF5cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NjQ2ODMsImV4cCI6MjEwNDE0MDY4M30.QTLO0en8WYvsdPMdkKuNUefSk8N1w72-B89a-4beRFM';

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function initAuth() {
    try {
        var hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            var params = new URLSearchParams(hash.substring(1));
            var accessToken = params.get('access_token');
            var refreshToken = params.get('refresh_token');
            if (accessToken) {
                supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(function(data) {
                    AUTH.session = data.session;
                    AUTH.user = data.session ? data.session.user : null;
                    window.history.replaceState({}, document.title, window.location.pathname);
                    onAuthStateChanged(AUTH.user);
                });
                return;
            }
        } else if (hash && hash.includes('error=')) {
            window.history.replaceState({}, document.title, window.location.pathname);
            renderLoginScreen();
            return;
        }
        supabaseClient.auth.getSession().then(function(result) {
            AUTH.session = result.data.session;
            AUTH.user = result.data.session ? result.data.session.user : null;
        });
        supabaseClient.auth.onAuthStateChange(function(event, session) {
            AUTH.session = session;
            AUTH.user = session ? session.user : null;
            onAuthStateChanged(AUTH.user);
        });
    } catch (err) {
        console.error('Erro ao inicializar auth:', err);
    }
}

/* Cadastro temporario entre signup e escolha criar/entrar em grupo */
var PENDING_SIGNUP = null;

function slugify(texto) {
    return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 30) || 'grupo';
}

/* Garante sessao apos signUp (quando confirmacao de email esta desligada). */
function ensureSession(email, password) {
    return supabaseClient.auth.getSession().then(function(result) {
        if (result.data && result.data.session) return { success: true, session: result.data.session };
        return supabaseClient.auth.signInWithPassword({ email: email.trim(), password: password }).then(function(r) {
            if (r.error) return { success: false, error: r.error.message };
            return { success: true, session: r.data.session };
        });
    });
}

/* Cria o usuario no Supabase Auth (authentication/users).
   Dados do usuario: email (pk), senha, Nome de usuario (user_metadata.display_name). */
function signupUser(email, password, username) {
    return supabaseClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: { data: { display_name: username.trim() } }
    }).then(function(result) {
        if (result.error) {
            var msg = (result.error.message || '').toLowerCase();
            if (msg.indexOf('already registered') >= 0 || msg.indexOf('already exists') >= 0) {
                return { success: false, alreadyRegistered: true, error: 'Este e-mail ja tem conta. Faca login.' };
            }
            if (msg.indexOf('invalid') >= 0) {
                return { success: false, error: 'E-mail recusado pelo servidor. Use um e-mail real/valido ou configure o SMTP no Supabase (Auth > Settings).' };
            }
            return { success: false, error: result.error.message };
        }
        var user = result.data.user;
        PENDING_SIGNUP = { email: email.trim().toLowerCase(), password: password, username: username.trim(), userId: user ? user.id : null };
        return ensureSession(email, password).then(function(s) {
            if (!s.success) return { success: false, error: 'Conta criada! Confirme seu e-mail e faca login.' };
            AUTH.session = s.session;
            AUTH.user = s.session.user;
            if (PENDING_SIGNUP) PENDING_SIGNUP.userId = AUTH.user.id;
            return { success: true, user: AUTH.user };
        });
    });
}

/* Upload da logo para o bucket 'logos' (Supabase Storage) e retorna a URL publica,
   salva em grupos.logo_url pelo CRUD de criar grupo. */
function uploadLogo(file) {
    var ext = ((file.name || '').split('.').pop() || 'png').toLowerCase().substring(0, 4);
    var path = 'grupos/' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;
    return supabaseClient.storage.from('logos').upload(path, file, { upsert: false }).then(function(r) {
        if (r.error) return { success: false, error: r.error.message };
        var pub = supabaseClient.storage.from('logos').getPublicUrl(path);
        return { success: true, url: pub.data.publicUrl };
    });
}

/* Cria grupo (nome + logo) e vincula o usuario como owner (aprovado). */
function createUserAndGroup(email, password, username, nomeGrupo, logoUrl) {
    var ctx = null;
    return signupUser(email, password, username).then(function(result) {
        if (!result.success && !result.alreadyRegistered) return result;
        if (result.alreadyRegistered) {
            return ensureSession(email, password).then(function(s) {
                if (!s.success) return { success: false, error: 'Este e-mail ja tem conta. Faca login.' };
                AUTH.session = s.session;
                AUTH.user = s.session.user;
                PENDING_SIGNUP = { email: email.trim().toLowerCase(), password: password, username: username.trim(), userId: AUTH.user.id };
                return { success: true, user: AUTH.user };
            });
        }
        return result;
    }).then(function(result) {
        if (!result.success) return result;
        ctx = { userId: AUTH.user.id, email: email.trim().toLowerCase() };
        var slug = slugify(nomeGrupo) + '-' + Date.now().toString(36);
        return supabaseClient.from('grupos').insert({ nome: nomeGrupo.trim(), slug: slug, logo_url: (logoUrl || 'logo-boleiros.png') }).select().then(function(r) {
            if (r.error) return { success: false, error: r.error.message };
            return { success: true, grupo: r.data[0] };
        });
    }).then(function(result) {
        if (!result.success) return result;
        return supabaseClient.from('usuarios_grupo').insert({
            grupo_id: result.grupo.id,
            email: ctx.email,
            user_id: ctx.userId,
            role: 'owner',
            status: 'approved'
        }).select().then(function(r) {
            if (r.error) return { success: false, error: r.error.message };
            PENDING_SIGNUP = null;
            return { success: true, grupo: result.grupo };
        });
    });
}

/* Pede para entrar em grupo existente: cria conta (se preciso) e registra
   pedido pendente de admin para aprovacao do owner. */
function joinGroup(email, password, username, groupSlug) {
    var ctx = null;
    var grupo = null;
    return signupUser(email, password, username).then(function(result) {
        if (!result.success && !result.alreadyRegistered) return result;
        if (result.alreadyRegistered) {
            return ensureSession(email, password).then(function(s) {
                if (!s.success) return { success: false, error: 'Este e-mail ja tem conta. Faca login.' };
                AUTH.session = s.session;
                AUTH.user = s.session.user;
                PENDING_SIGNUP = { email: email.trim().toLowerCase(), password: password, username: (username || '').trim(), userId: AUTH.user.id };
                return { success: true, user: AUTH.user };
            });
        }
        return result;
    }).then(function(result) {
        if (!result.success) return result;
        ctx = { userId: AUTH.user.id, email: email.trim().toLowerCase() };
        return supabaseClient.from('grupos').select('id, nome, slug').eq('slug', groupSlug.trim().toLowerCase()).single().then(function(r) {
            if (r.error || !r.data) return { success: false, error: 'Grupo nao encontrado. Confira o codigo.' };
            grupo = r.data;
            return supabaseClient.from('usuarios_grupo').select('id, status').eq('grupo_id', grupo.id).eq('user_id', ctx.userId).maybeSingle().then(function(ex) {
                if (ex.data) return { success: false, error: ex.data.status === 'approved' ? 'Voce ja e admin deste grupo.' : 'Pedido ja enviado. Aguarde aprovacao do owner.' };
                return { success: true };
            });
        });
    }).then(function(result) {
        if (!result.success) return result;
        return supabaseClient.from('usuarios_grupo').select('id', { count: 'exact' }).eq('grupo_id', grupo.id).then(function(c) {
            if ((c.count || 0) >= 5) return { success: false, error: 'Este grupo ja tem 5 administradores (limite).' };
            return supabaseClient.from('usuarios_grupo').insert({
                grupo_id: grupo.id,
                email: ctx.email,
                user_id: ctx.userId,
                role: 'admin',
                status: 'pending'
            }).select().then(function(ir) {
                if (ir.error) return { success: false, error: ir.error.message };
                PENDING_SIGNUP = null;
                return { success: true, grupo: grupo };
            });
        });
    });
}

function getMyGroups() {
    if (!AUTH.user) return [];
    return supabaseClient.from('usuarios_grupo').select('grupo_id, grupos(nome, slug, logo_url), role, status').eq('user_id', AUTH.user.id).then(function(result) {
        if (result.error) return [];
        return (result.data || []).map(function(g) {
            return { id: g.grupo_id, nome: g.grupos.nome, slug: g.grupos.slug, logo_url: g.grupos.logo_url, role: g.role, status: g.status };
        });
    }).catch(function() { return []; });
}

function getPendingRequests(groupId) {
    return supabaseClient.from('usuarios_grupo').select('id, email, role, created_at').eq('grupo_id', groupId).eq('status', 'pending').then(function(result) {
        if (result.error) return [];
        return result.data || [];
    }).catch(function() { return []; });
}

function approveUser(requestId) {
    return supabaseClient.from('usuarios_grupo').update({ status: 'approved' }).eq('id', requestId).select().then(function(result) {
        if (result.error) return { success: false, error: result.error.message };
        return { success: true };
    });
}

function rejectUser(requestId) {
    return supabaseClient.from('usuarios_grupo').delete().eq('id', requestId).then(function(result) {
        if (result.error) return { success: false, error: result.error.message };
        return { success: true };
    });
}

function onAuthStateChanged(user) {
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

/* Tela inicial: so login, sem listas nem dados de grupos. */
var SYSTEM_LOGO = 'sorteador-logo.png';

function resetHeaderGenerico() {
    var nomeEl = document.getElementById('nomeGrupo');
    var subEl = document.getElementById('subGrupo');
    var logoEl = document.getElementById('logoGrupo');
    if (nomeEl) nomeEl.textContent = 'Sorteador de Times';
    if (subEl) subEl.textContent = 'Sorteie os times da sua pelada';
    if (logoEl) logoEl.src = SYSTEM_LOGO;
    document.title = 'Sorteador de Times';
}

function personalizarHeader(grupo) {
    var nomeEl = document.getElementById('nomeGrupo');
    var subEl = document.getElementById('subGrupo');
    var logoEl = document.getElementById('logoGrupo');
    if (nomeEl) nomeEl.textContent = grupo.nome;
    if (subEl) subEl.textContent = 'Sorteador Oficial de Times';
    if (logoEl && grupo.logo_url) logoEl.src = grupo.logo_url;
    document.title = grupo.nome + ' - Sorteador de Times';
}

function displayName() {
    if (AUTH.user && AUTH.user.user_metadata && AUTH.user.user_metadata.display_name) return AUTH.user.user_metadata.display_name;
    return AUTH.user ? AUTH.user.email : '';
}

/* Grupos do usuario logado (para checar papel de owner). */
var MEUS_GRUPOS = [];

function isOwnerOf(grupoId) {
    return MEUS_GRUPOS.some(function(g) { return g.id === grupoId && g.role === 'owner' && g.status === 'approved'; });
}

function toggleManageButton() {
    var btn = document.getElementById('btnManageGroup');
    if (!btn) return;
    btn.style.display = (AUTH.user && grupoAtual && isOwnerOf(grupoAtual.id)) ? 'block' : 'none';
}

function loadApp() {
    getMyGroups().then(function(groups) {
        MEUS_GRUPOS = groups || [];
        var approved = groups.filter(function(g) { return g.status === 'approved'; });
        var pending = groups.filter(function(g) { return g.status !== 'approved'; });
        renderUserBar();
        var mainEl = document.getElementById('mainApp');
        if (approved.length === 0) {
            if (mainEl) mainEl.style.display = 'none';
            renderPendingPanel([]);
            /* Com grupo pendente: tela de espera. Sem grupo nenhum: opcoes criar/entrar. */
            if (pending.length > 0) showWaitingScreen(pending);
            else showGroupChoice();
            return;
        }
        if (mainEl) mainEl.style.display = 'block';
        hideWaitingScreen();
        renderGroupSelector(approved);
        carregarGrupo(approved[0].slug);
        renderPendingPanel(approved.filter(function(g) { return g.role === 'owner'; }));
    });
}

function showWaitingScreen(pending) {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var nome = displayName();
    var lista = pending.length
        ? pending.map(function(g) { return '<li>' + g.nome + ' (' + g.slug + ') — aguardando aprovacao do owner</li>'; }).join('')
        : '<li>Seu pedido foi registrado. Aguarde aprovacao do owner.</li>';
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Ola, ' + nome + '</h2><p>Seu acesso esta pendente</p></div><div class="login-body"><ul class="waiting-list">' + lista + '</ul><button class="btn-secondary" onclick="logout()">Sair</button></div></div></div>';
    ls.style.display = 'block';
}

function hideWaitingScreen() {
    var ls = document.getElementById('loginSection');
    if (ls) { ls.innerHTML = ''; ls.style.display = 'none'; }
}

function renderUserBar() {
    var el = document.getElementById('userInfo');
    if (el) el.textContent = displayName();
}

function renderPendingPanel(ownerGroups) {
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

/* Gerenciamento do grupo (owner): nome + logo com upload para o Storage. */
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function showManageGroup() {
    if (!AUTH.user || !grupoAtual || !isOwnerOf(grupoAtual.id)) { alert('Apenas o owner pode gerenciar o grupo.'); return; }
    var mainEl = document.getElementById('mainApp');
    if (mainEl) mainEl.style.display = 'none';
    window.LOGO_FILE = null;
    var ls = document.getElementById('loginSection');
    var logo = grupoAtual.logo_url || SYSTEM_LOGO;
    ls.innerHTML = '<div class="login-page"><div class="login-card"><div class="login-header"><h2>Gerenciar Grupo</h2><p>Nome e logo do grupo</p></div><div class="login-body"><div id="manageGroupForm"><div style="text-align:center;margin-bottom:12px;"><img id="manageLogoPreview" src="' + escAttr(logo) + '" alt="Logo do grupo" style="max-width:120px;border-radius:12px;"></div><div class="form-group"><label for="manageGroupName">Nome do grupo</label><input type="text" id="manageGroupName" value="' + escAttr(grupoAtual.nome) + '"></div><div class="form-group"><label for="manageGroupLogo">Logo (URL ou arquivo)</label><input type="text" id="manageGroupLogo" value="' + escAttr(logo) + '"><input type="file" id="manageGroupLogoFile" accept="image/*" style="margin-top:8px;"></div><button class="btn-primary" onclick="doSaveGroup()">Salvar</button><p class="login-hint"><a href="#" onclick="onAuthStateChanged(AUTH.user); return false;">Voltar</a></p></div><div id="manageGroupLoading" style="display:none;"><p>Salvando...</p></div><div id="manageGroupStatus"></div></div></div></div>';
    ls.style.display = 'block';
    var fileInput = document.getElementById('manageGroupLogoFile');
    if (fileInput) fileInput.addEventListener('change', function() {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        window.LOGO_FILE = f;
        var prev = document.getElementById('manageLogoPreview');
        if (prev) prev.src = URL.createObjectURL(f);
    });
}

function doSaveGroup() {
    if (!AUTH.user || !grupoAtual || !isOwnerOf(grupoAtual.id)) { alert('Apenas o owner pode gerenciar o grupo.'); return; }
    var nome = document.getElementById('manageGroupName').value.trim();
    var logoTyped = document.getElementById('manageGroupLogo').value.trim();
    if (!nome) { alert('Informe o nome do grupo.'); return; }
    var formEl = document.getElementById('manageGroupForm');
    var loadingEl = document.getElementById('manageGroupLoading');
    var statusEl = document.getElementById('manageGroupStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';
    var finish = function(finalLogo) {
        window.LOGO_FILE = null;
        supabaseClient.from('grupos').update({ nome: nome, logo_url: finalLogo }).eq('id', grupoAtual.id).select().then(function(r) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (formEl) formEl.style.display = 'block';
            if (r.error) {
                if (statusEl) statusEl.innerHTML = '<p class="login-error">Erro: ' + r.error.message + '</p>';
                return;
            }
            grupoAtual.nome = nome;
            grupoAtual.logo_url = finalLogo;
            personalizarHeader(grupoAtual);
            if (statusEl) statusEl.innerHTML = '<p class="login-success">Grupo atualizado!</p>';
            setTimeout(function() { onAuthStateChanged(AUTH.user); }, 1200);
        });
    };
    if (window.LOGO_FILE) {
        uploadLogo(window.LOGO_FILE).then(function(up) {
            if (!up.success) {
                if (loadingEl) loadingEl.style.display = 'none';
                if (formEl) formEl.style.display = 'block';
                if (statusEl) statusEl.innerHTML = '<p class="login-error">Erro no upload da logo: ' + up.error + '</p>';
                return;
            }
            finish(up.url);
        });
    } else {
        finish(logoTyped || SYSTEM_LOGO);
    }
}

function doApprove(requestId) {    approveUser(requestId).then(function(r) {
        if (!r.success) { alert('Erro: ' + r.error); return; }
        loadApp();
    });
}

function doReject(requestId) {
    if (!confirm('Recusar este pedido?')) return;
    rejectUser(requestId).then(function(r) {
        if (!r.success) { alert('Erro: ' + r.error); return; }
        loadApp();
    });
}

function renderGroupSelector(groups) {
    var container = document.getElementById('groupSelector');
    if (!container || groups.length <= 1) { if (container) container.innerHTML = ''; return; }
    container.innerHTML = '<select id="grupoSelect" onchange="mudarGrupo(this.value)">' +
        groups.map(function(g) { return '<option value="' + g.slug + '">' + g.nome + '</option>'; }).join('') + '</select>';
}

function mudarGrupo(slug) { carregarGrupo(slug, true); }

function carregarGrupo(slug, personalizar) {
    supabaseClient.from('grupos').select('id, nome, slug, logo_url').eq('slug', slug).single().then(function(result) {
        if (result.error || !result.data) {
            if (personalizar !== false) alert('Grupo nao encontrado');
            else console.warn('Grupo publico nao encontrado:', slug);
            return;
        }
        grupoAtual = result.data;
        /* Personaliza header só para admin/owner logado; visitante vê o generico. */
        if (personalizar !== false && AUTH.user) personalizarHeader(grupoAtual);
        else { grupoAtual.nome = 'Sorteador de Times'; grupoAtual.logo_url = grupoAtual.logo_url || SYSTEM_LOGO; }
        toggleManageButton();
        carregarJogadores(grupoAtual.id);
    }).catch(function(err) { console.error('Erro ao carregar grupo:', err); });
}

function carregarJogadores(grupoId) {
    supabaseClient.from('jogadores').select('*').eq('grupo_id', grupoId).eq('ativo', true).order('nome').then(function(result) {
        if (result.error) throw result.error;
        jogadores = (result.data || []).map(function(j) { return Object.assign({}, j, { presente: false }); });
        renderLista();
    }).catch(function(err) { console.error('Erro ao carregar jogadores:', err); });
}

var jogadores = [];

function renderLista() {
    var listaEl = document.getElementById('listaJogadores');
    if (!listaEl) return;
    listaEl.innerHTML = '';
    jogadores.forEach(function(j, index) {
        var div = document.createElement('div');
        div.className = 'jogador';
        var label = document.createElement('label');
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.index = index;
        checkbox.checked = j.presente;
        var infoDiv = document.createElement('div');
        infoDiv.className = 'jogador-info';
        var strong = document.createElement('strong');
        strong.textContent = j.nome;
        var metaDiv = document.createElement('div');
        metaDiv.className = 'jogador-meta';
        if (j.goleiro) { metaDiv.textContent = 'Goleiro'; } else { metaDiv.textContent = j.categoria.toFixed(1); }
        if (j.menina) { var ms = document.createElement('em'); ms.className = 'tag-menina'; ms.textContent = ' mulher'; metaDiv.appendChild(ms); }
        if (j.convidado) { var cs = document.createElement('em'); cs.className = 'tag-convidado'; cs.textContent = ' convidado'; metaDiv.appendChild(cs); }
        infoDiv.appendChild(strong); infoDiv.appendChild(metaDiv);
        label.appendChild(checkbox); label.appendChild(infoDiv);
        div.appendChild(label); listaEl.appendChild(div);
        checkbox.addEventListener('change', function() {
            jogadores[parseInt(this.dataset.index)].presente = this.checked;
            atualizarContador();
        });
    });
    atualizarContador();
}

function getPresentes() {
    var linhas = jogadores.filter(function(j) { return j.presente && !j.goleiro; });
    var goleiros = jogadores.filter(function(j) { return j.presente && j.goleiro; });
    return { linhas: linhas, goleiros: goleiros };
}

function timeComMenina(time) { return time.jogadores.some(function(j) { return j.menina; }); }

function sortearTimes(linhas, goleiros, porTime) {
    var total = linhas.length + goleiros.length;
    var qtdTimes = Math.ceil(total / porTime);
    if (qtdTimes < 1) { alert('E necessario pelo menos 1 jogador'); return null; }
    if (qtdTimes === 1 && total < 2) { alert('E necessario pelo menos 2 jogadores'); return null; }
    var meninasPresentes = linhas.filter(function(j) { return j.menina; });
    if (meninasPresentes.length > qtdTimes) { alert('Ha ' + meninasPresentes.length + ' mulheres e apenas ' + qtdTimes + ' time(s).'); return null; }
    var times = [];
    for (var i = 0; i < qtdTimes; i++) { times.push({ nome: 'Time ' + (i + 1), jogadores: [], forca: 0 }); }
    goleiros.forEach(function(g, i) { times[i % times.length].jogadores.push(g); });
    var ordenados = linhas.slice().sort(function() { return Math.random() - 0.5; }).sort(function(a, b) { return b.categoria - a.categoria; });
    for (var j = 0; j < ordenados.length; j++) {
        var jogador = ordenados[j];
        var candidatos = times.filter(function(t) { if (jogador.menina && timeComMenina(t)) return false; return t.jogadores.length < porTime; }).sort(function(a, b) { return a.forca - b.forca; });
        if (candidatos.length > 0) { candidatos[0].jogadores.push(jogador); candidatos[0].forca += jogador.categoria; continue; }
        var overflow = times.filter(function(t) { return !jogador.menina || !timeComMenina(t); }).sort(function(a, b) { return a.forca - b.forca; });
        if (overflow.length === 0) { alert('Nao foi possivel separar ' + jogador.nome); return null; }
        overflow[0].jogadores.push(jogador); overflow[0].forca += jogador.categoria;
    }
    times.sort(function(a, b) { return b.jogadores.length - a.jogadores.length; });
    times.forEach(function(t, idx) { t.nome = 'Time ' + (idx + 1); });
    return times;
}

function renderResultado(times) {
    var resultadoEl = document.getElementById('resultado');
    if (!resultadoEl) return;
    resultadoEl.innerHTML = '';
    var imagemContainer = document.createElement('div');
    imagemContainer.id = 'imagemResultado';
    var header = document.createElement('div');
    header.className = 'resultado-header';
    header.innerHTML = '<img src="' + (grupoAtual.logo_url || SYSTEM_LOGO) + '" alt="' + grupoAtual.nome + '" class="resultado-logo" width="56" height="56"><div class="resultado-header-text"><h1>' + grupoAtual.nome + '</h1></div>';
    imagemContainer.appendChild(header);
    var grid = document.createElement('div');
    grid.className = 'times-grid';
    times.forEach(function(t) {
        var div = document.createElement('div');
        div.className = 'time';
        var html = '<h3>' + t.nome + '</h3>';
        t.jogadores.forEach(function(j) { html += j.goleiro ? '<div class="goleiro">Goleiro ' + j.nome + '</div>' : '<div>' + j.nome + '</div>'; });
        div.innerHTML = html;
        grid.appendChild(div);
    });
    imagemContainer.appendChild(grid);
    var footer = document.createElement('div');
    footer.className = 'resultado-footer';
    footer.innerHTML = '<span>' + new Date().toLocaleDateString('pt-BR') + '</span>';
    imagemContainer.appendChild(footer);
    resultadoEl.appendChild(imagemContainer);
}

function getPorTime() {
    var el = document.querySelector('input[name="jogadoresPorTime"]:checked');
    return el ? Number(el.value) : 6;
}

function realizarSorteio() {
    var p = getPresentes();
    var t = sortearTimes(p.linhas, p.goleiros, getPorTime());
    if (!t) return;
    renderResultado(t);
    var btnR = document.getElementById('btnResortear');
    var btnC = document.getElementById('btnCompartilhar');
    if (btnR) btnR.style.display = 'block';
    if (btnC) btnC.style.display = 'block';
    window.timesAtuais = t;
    document.getElementById('resultadoContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function adicionarConvidado() {
    if (!AUTH.user) { alert('Entre com sua conta para adicionar convidados.'); return; }
    if (!grupoAtual) { alert('Aguarde carregar os jogadores.'); return; }
    var nome = document.getElementById('convidadoNome').value.trim();
    var tipo = document.getElementById('convidadoTipo').value;
    var categoria = parseFloat(document.getElementById('convidadoCategoria').value);
    if (!nome) { alert('Informe o nome do convidado.'); return; }
    var menina = document.getElementById('convidadoMenina').checked;
    var convidado = { nome: nome, categoria: categoria, goleiro: tipo === 'goleiro', presente: true, convidado: true, menina: menina, grupo_id: grupoAtual.id };
    salvarJogadorNoSupabase(convidado);
}

function salvarJogadorNoSupabase(jogador) {
    if (!AUTH.user) { alert('Acesso negado.'); return; }
    supabaseClient.from('usuarios_grupo').select('id').eq('grupo_id', jogador.grupo_id).eq('user_id', AUTH.user.id).single().then(function(r) {
        if (!r.data) { alert('Voce nao tem permissao para este grupo.'); return; }
        supabaseClient.from('jogadores').insert(jogador).select().then(function(result) {
            if (result.error) throw result.error;
            jogador.id = result.data.id;
            jogadores.push(jogador);
            renderLista();
            document.getElementById('convidadoNome').value = '';
            document.getElementById('convidadoMenina').checked = false;
        }).catch(function(err) { alert('Erro ao salvar: ' + err.message); });
    }).catch(function() { alert('Voce nao tem permissao para este grupo.'); });
}

function desmarcarTodos() {
    jogadores.forEach(function(j) { j.presente = false; });
    document.querySelectorAll('input[type=checkbox]').forEach(function(cb) { cb.checked = false; });
    atualizarContador();
}

function atualizarContador() {
    var total = jogadores.filter(function(j) { return j.presente; }).length;
    var el = document.getElementById('contadorSelecionados');
    if (el) el.textContent = total + ' selecionado' + (total !== 1 ? 's' : '');
}

function compartilharImagem() {
    var el = document.getElementById('imagemResultado');
    if (!el) return;
    var originalFont = el.style.fontFamily;
    el.style.fontFamily = 'Arial, Helvetica, sans-serif';
    document.fonts.ready.then(function() {
        html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#f4f4f4' }).then(function(canvas) {
            el.style.fontFamily = originalFont;
            canvas.toBlob(function(blob) {
                var file = new File([blob], 'times.png', { type: 'image/png' });
                if (navigator.share) { navigator.share({ title: grupoAtual.nome, text: 'Times da pelada', files: [file] }); }
                else { alert('Compartilhamento nao suportado.'); }
            });
        });
    });
}

function loginWithEmail(email, password) {
    AUTH.loading = true;
    return supabaseClient.auth.signInWithPassword({ email: email.trim(), password: password }).then(function(result) {
        if (result.error) {
            var msg = (result.error.message || '').toLowerCase();
            if (msg.indexOf('invalid login credentials') >= 0 || msg.indexOf('invalid') >= 0) {
                return { success: false, notFound: true, error: 'E-mail nao encontrado.' };
            }
            return { success: false, error: result.error.message };
        }
        return { success: true, message: 'Logado com sucesso!' };
    }).finally(function() { AUTH.loading = false; });
}

function logout() {
    PENDING_SIGNUP = null;
    window.LOGO_FILE = null;
    supabaseClient.auth.signOut().then(function() { AUTH.user = null; AUTH.session = null; onAuthStateChanged(null); }).catch(function(err) { console.error('Erro ao logout:', err); });
}

function renderLoginScreen() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var mainEl = document.getElementById('mainApp');
    var adminSection = document.getElementById('adminSection');
    if (mainEl) mainEl.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    resetHeaderGenerico();
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Sorteador de Times</h2><p>Area do organizador</p></div><div class="login-body"><div id="loginForm"><div class="form-group"><label for="loginEmail">Seu e-mail</label><input type="email" id="loginEmail" placeholder="seu@email.com" autocomplete="email"></div><div class="form-group"><label for="loginPassword">Sua senha</label><input type="password" id="loginPassword" placeholder="Sua senha" autocomplete="current-password"></div><button id="btnLogin" class="btn-primary" onclick="doLogin()">Entrar</button><p id="loginSwitchText" class="login-hint"><a href="#" onclick="showSignupForm(); return false;">Nao tem conta? Cadastre-se</a></p></div><div id="loginLoading" style="display:none;"><p>Entrando...</p></div><div id="loginStatus"></div></div></div></div>';
    ls.style.display = 'block';
}

/* Cadastro: cria o usuario no Supabase Auth e oferece Criar grupo / Entrar em grupo */
function showSignupForm(prefillEmail) {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Criar conta</h2><p>Primeiro, crie seu usuario</p></div><div class="login-body"><div id="signupForm"><div class="form-group"><label for="signupUsername">Nome de usuario</label><input type="text" id="signupUsername" placeholder="Seu nome" autocomplete="nickname"></div><div class="form-group"><label for="signupEmail">Seu e-mail</label><input type="email" id="signupEmail" placeholder="seu@email.com" autocomplete="email" value="' + (prefillEmail || '') + '"></div><div class="form-group"><label for="signupPassword">Senha</label><input type="password" id="signupPassword" placeholder="Minimo 6 caracteres" autocomplete="new-password"></div><button class="btn-primary" onclick="doSignup()">Criar conta</button><p class="login-hint"><a href="#" onclick="renderLoginScreen(); return false;">Ja tenho conta</a></p></div><div id="signupLoading" style="display:none;"><p>Criando...</p></div><div id="signupStatus"></div></div></div></div>';
    ls.style.display = 'block';
}

function showGroupChoice() {
    var ls = document.getElementById('loginSection');
    if (!ls || !AUTH.user) { renderLoginScreen(); return; }
    var name = PENDING_SIGNUP ? PENDING_SIGNUP.username : displayName();
    var mainEl = document.getElementById('mainApp');
    if (mainEl) mainEl.style.display = 'none';
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Ola, ' + name + '</h2><p>Voce ainda nao tem grupo. Escolha uma opcao:</p></div><div class="login-body"><div id="newUserForm"><button class="btn-primary" onclick="showCreateGroup()">Criar grupo</button><button class="btn-secondary" onclick="showJoinGroup()">Entrar em grupo</button><p class="login-hint"><a href="#" onclick="logout(); return false;">Sair</a></p></div></div></div></div>';
    ls.style.display = 'block';
}

function showCreateGroup() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var email = PENDING_SIGNUP ? PENDING_SIGNUP.email : (AUTH.user ? AUTH.user.email : '');
    var username = PENDING_SIGNUP ? PENDING_SIGNUP.username : (displayName() || '');
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Criar Grupo</h2><p>Voce sera o owner do grupo</p></div><div class="login-body"><div id="createGroupForm"><div class="form-group"><label for="groupName">Nome do grupo</label><input type="text" id="groupName" placeholder="Ex: Boleiros de Cristo"></div><div class="form-group"><label for="groupLogo">Logo (URL ou arquivo)</label><input type="text" id="groupLogo" placeholder="logo-boleiros.png (opcional)"><input type="file" id="groupLogoFile" accept="image/*" style="margin-top:8px;"><img id="groupLogoPreview" style="display:none;max-width:96px;margin-top:8px;border-radius:8px;"></div><div class="form-group"><label for="newUsername">Seu nome de usuario</label><input type="text" id="newUsername" placeholder="Seu nome" value="' + username + '"></div><div class="form-group"><label for="newEmail">Seu e-mail</label><input type="email" id="newEmail" placeholder="seu@email.com" value="' + email + '"></div><div class="form-group"><label for="newPassword">Senha</label><input type="password" id="newPassword" placeholder="Sua senha"></div><button class="btn-primary" onclick="doCreateGroup()">Criar Grupo</button><p class="login-hint"><a href="#" onclick="showGroupChoice(); return false;">Voltar</a></p></div><div id="createGroupLoading" style="display:none;"><p>Criando...</p></div><div id="createGroupStatus"></div></div></div></div>';
    var fileInput = document.getElementById('groupLogoFile');
    if (fileInput) fileInput.addEventListener('change', function() {
        var f = fileInput.files && fileInput.files[0];
        var prev = document.getElementById('groupLogoPreview');
        if (!f) { window.LOGO_FILE = null; if (prev) prev.style.display = 'none'; return; }
        window.LOGO_FILE = f;
        if (prev) { prev.src = URL.createObjectURL(f); prev.style.display = 'block'; }
    });
}

function showJoinGroup() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    var email = PENDING_SIGNUP ? PENDING_SIGNUP.email : (AUTH.user ? AUTH.user.email : '');
    var username = PENDING_SIGNUP ? PENDING_SIGNUP.username : (displayName() || '');
    ls.innerHTML = '<div class="login-page"><div class="login-card"><img src="sorteador-logo.png" alt="Sorteador de Times" class="login-logo"><div class="login-header"><h2>Entrar em Grupo</h2><p>O owner precisa aprovar seu pedido</p></div><div class="login-body"><div id="joinGroupForm"><div class="form-group"><label for="joinUsername">Seu nome de usuario</label><input type="text" id="joinUsername" placeholder="Seu nome" value="' + username + '"></div><div class="form-group"><label for="joinEmail">Seu e-mail</label><input type="email" id="joinEmail" placeholder="seu@email.com" value="' + email + '"></div><div class="form-group"><label for="joinPassword">Sua senha</label><input type="password" id="joinPassword" placeholder="Sua senha"></div><div class="form-group"><label for="joinSlug">Codigo do grupo</label><input type="text" id="joinSlug" placeholder="ex: boleiros-de-cristo" autocomplete="off"></div><button class="btn-primary" onclick="doJoinGroup()">Pedir acesso</button><p class="login-hint"><a href="#" onclick="showGroupChoice(); return false;">Voltar</a></p></div><div id="joinGroupLoading" style="display:none;"><p>Solicitando...</p></div><div id="joinGroupStatus"></div></div></div></div>';
}

function doLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !email.includes('@')) { alert('Informe um e-mail valido.'); return; }
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
            if (statusEl) statusEl.innerHTML = '<p class="login-error">E-mail nao encontrado. Cadastre-se abaixo.</p>';
            setTimeout(function() { showSignupForm(email); }, 1200);
        } else if (statusEl) {
            statusEl.innerHTML = '<p class="login-error">Erro: ' + result.error + '</p>';
        }
    });
}

function doSignup() {
    var username = document.getElementById('signupUsername').value.trim();
    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value;
    if (!username) { alert('Informe seu nome de usuario.'); return; }
    if (!email || !email.includes('@')) { alert('Informe um e-mail valido.'); return; }
    if (!password || password.length < 6) { alert('A senha deve ter no minimo 6 caracteres.'); return; }
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

function doCreateGroup() {
    var nomeGrupo = document.getElementById('groupName').value.trim();
    var logoTyped = document.getElementById('groupLogo').value.trim();
    var username = document.getElementById('newUsername').value.trim();
    var email = document.getElementById('newEmail').value.trim();
    var password = document.getElementById('newPassword').value;
    if (!nomeGrupo) { alert('Informe o nome do grupo.'); return; }
    if (!username) { alert('Informe seu nome de usuario.'); return; }
    if (!email || !email.includes('@')) { alert('Informe um e-mail valido.'); return; }
    if (!password) { alert('Informe sua senha.'); return; }
    var formEl = document.getElementById('createGroupForm');
    var loadingEl = document.getElementById('createGroupLoading');
    var statusEl = document.getElementById('createGroupStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';
    var finish = function(finalLogo) {
        window.LOGO_FILE = null;
        createUserAndGroup(email, password, username, nomeGrupo, finalLogo).then(function(result) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (formEl) formEl.style.display = 'block';
            if (statusEl) statusEl.innerHTML = result.success ? '<p class="login-success">Grupo criado! Entrando...</p>' : '<p class="login-error">Erro: ' + result.error + '</p>';
            if (result.success) { setTimeout(function() { onAuthStateChanged(AUTH.user); }, 1500); }
        });
    };
    if (window.LOGO_FILE) {
        uploadLogo(window.LOGO_FILE).then(function(up) {
            if (!up.success) {
                if (loadingEl) loadingEl.style.display = 'none';
                if (formEl) formEl.style.display = 'block';
                if (statusEl) statusEl.innerHTML = '<p class="login-error">Erro no upload da logo: ' + up.error + '</p>';
                return;
            }
            finish(up.url);
        });
    } else {
        finish(logoTyped || SYSTEM_LOGO);
    }
}

function doJoinGroup() {
    var username = document.getElementById('joinUsername').value.trim();
    var email = document.getElementById('joinEmail').value.trim();
    var password = document.getElementById('joinPassword').value;
    var slug = document.getElementById('joinSlug').value.trim().toLowerCase();
    if (!username) { alert('Informe seu nome de usuario.'); return; }
    if (!email || !email.includes('@')) { alert('Informe um e-mail valido.'); return; }
    if (!password) { alert('Informe sua senha.'); return; }
    if (!slug) { alert('Informe o codigo do grupo.'); return; }
    var formEl = document.getElementById('joinGroupForm');
    var loadingEl = document.getElementById('joinGroupLoading');
    var statusEl = document.getElementById('joinGroupStatus');
    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';
    joinGroup(email, password, username, slug).then(function(result) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        if (statusEl) statusEl.innerHTML = result.success ? '<p class="login-success">Pedido enviado! Aguarde aprovacao do owner.</p>' : '<p class="login-error">Erro: ' + result.error + '</p>';
        if (result.success) { setTimeout(function() { onAuthStateChanged(AUTH.user); }, 1500); }
    });
}

document.addEventListener('DOMContentLoaded', function() { renderLoginScreen(); initAuth(); });
