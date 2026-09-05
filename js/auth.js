const AUTH = { loading: false, user: null, session: null };
var grupoAtual = null;

const SUPABASE_URL = 'https://maqdmlsouqmadoaayrcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcWRtbHNvdXFtYWRvYWF5cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NjQ2ODMsImV4cCI6MjEwNDE0MDY4M30.QTLO0en8WYvsdPMdkKuNUefSk8N1w72-B89a-4beRFM';

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function initAuth() {
    try {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
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

function loginWithEmail(email, password) {
    AUTH.loading = true;
    return supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password: password
    }).then(function(result) {
        if (result.error) return { success: false, error: result.error.message };
        return { success: true, message: 'Logado com sucesso!' };
    }).finally(function() { AUTH.loading = false; });
}

function logout() {
    supabaseClient.auth.signOut().then(function() {
        AUTH.user = null;
        AUTH.session = null;
        onAuthStateChanged(null);
    }).catch(function(err) { console.error('Erro ao logout:', err); });
}

function onAuthStateChanged(user) {
    var loginSection = document.getElementById('loginSection');
    var adminSection = document.getElementById('adminSection');
    if (user) {
        if (loginSection) loginSection.style.display = 'none';
        if (adminSection) adminSection.style.display = 'block';
        carregarMeusGrupos();
    } else {
        if (loginSection) loginSection.style.display = 'flex';
        if (adminSection) adminSection.style.display = 'none';
    }
}

function carregarMeusGrupos() {
    if (!AUTH.user) return [];
    supabaseClient.from('usuarios_grupo').select('grupo_id, grupo(nome, slug, logo_url), role').eq('user_id', AUTH.user.id).order('role', { ascending: false }).then(function(result) {
        if (result.error) { console.error('Erro ao carregar grupos:', result.error); return; }
        var groups = result.data || [];
        renderGroupSelector(groups);
    }).catch(function(err) { console.error('Erro ao carregar grupos:', err); });
}

function renderGroupSelector(groups) {
    var container = document.getElementById('groupSelector');
    if (!container || groups.length <= 1) { if (container) container.innerHTML = ''; return; }
    container.innerHTML = '<select id="grupoSelect" onchange="mudarGrupo(this.value)">' +
        groups.map(function(g) {
            return '<option value="' + g.grupo.slug + '">' + g.grupo.nome + '</option>';
        }).join('') + '</select>';
}

function mudarGrupo(slug) {
    carregarGrupo(slug);
}

function carregarGrupo(slug) {
    supabaseClient.from('grupos').select('id, nome, slug, logo_url').eq('slug', slug).single().then(function(result) {
        if (result.error || !result.data) { alert('Grupo nao encontrado: ' + slug); return; }
        var grupo = result.data;
        grupoAtual = grupo;
        var nomeEl = document.getElementById('nomeGrupo');
        var logoEl = document.getElementById('logoGrupo');
        if (nomeEl) nomeEl.textContent = grupo.nome;
        if (logoEl && grupo.logo_url) logoEl.src = grupo.logo_url;
        document.title = grupo.nome + ' - Sorteador de Times';
        carregarJogadores(grupo.id);
    }).catch(function(err) { console.error('Erro ao carregar grupo:', err); });
}

function carregarJogadores(grupoId) {
    supabaseClient.from('jogadores').select('*').eq('grupo_id', grupoId).eq('ativo', true).order('nome').then(function(result) {
        if (result.error) throw result.error;
        jogadores = (result.data || []).map(function(j) { return Object.assign({}, j, { presente: false }); });
        renderLista();
    }).catch(function(err) { console.error('Erro ao carregar jogadores:', err); });
}

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
        if (j.goleiro) {
            metaDiv.textContent = 'Goleiro';
        } else {
            metaDiv.textContent = j.categoria.toFixed(1);
        }
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

function sortearTimes(linhas, goleiros, porTime) {
    var total = linhas.length + goleiros.length;
    var qtdTimes = Math.ceil(total / porTime);
    if (qtdTimes < 1) { alert('E necessario pelo menos 1 jogador'); return null; }
    if (qtdTimes === 1 && total < 2) { alert('E necessario pelo menos 2 jogadores'); return null; }
    var meninasPresentes = linhas.filter(function(j) { return j.menina; });
    if (meninasPresentes.length > qtdTimes) {
        alert('Ha ' + meninasPresentes.length + ' mulheres e apenas ' + qtdTimes + ' time(s). Nao e possivel separa-las.');
        return null;
    }
    var times = [];
    for (var i = 0; i < qtdTimes; i++) { times.push({ nome: 'Time ' + (i + 1), jogadores: [], forca: 0 }); }
    goleiros.forEach(function(g, i) { times[i % times.length].jogadores.push(g); });
    var ordenados = linhas.slice().sort(function() { return Math.random() - 0.5; }).sort(function(a, b) { return b.categoria - a.categoria; });
    for (var j = 0; j < ordenados.length; j++) {
        var jogador = ordenados[j];
        var candidatos = times.filter(function(t) {
            if (jogador.menina && timeComMenina(t)) return false;
            return t.jogadores.length < porTime;
        }).sort(function(a, b) { return a.forca - b.forca; });
        if (candidatos.length > 0) { candidatos[0].jogadores.push(jogador); candidatos[0].forca += jogador.categoria; continue; }
        var overflow = times.filter(function(t) { return !jogador.menina || !timeComMenina(t); }).sort(function(a, b) { return a.forca - b.forca; });
        if (overflow.length === 0) { alert('Nao foi possivel separar ' + jogador.nome); return null; }
        overflow[0].jogadores.push(jogador); overflow[0].forca += jogador.categoria;
    }
    times.sort(function(a, b) { return b.jogadores.length - a.jogadores.length; });
    times.forEach(function(t, idx) { t.nome = 'Time ' + (idx + 1); });
    return times;
}

function timeComMenina(time) { return time.jogadores.some(function(j) { return j.menina; }); }

function renderResultado(times) {
    var resultadoEl = document.getElementById('resultado');
    if (!resultadoEl) return;
    resultadoEl.innerHTML = '';
    var imagemContainer = document.createElement('div');
    imagemContainer.id = 'imagemResultado';
    var header = document.createElement('div');
    header.className = 'resultado-header';
    header.innerHTML = '<img src="' + (grupoAtual.logo_url || 'logo-boleiros.png') + '" alt="' + grupoAtual.nome + '" class="resultado-logo" width="56" height="56"><div class="resultado-header-text"><h1>' + grupoAtual.nome + '</h1></div>';
    imagemContainer.appendChild(header);
    var grid = document.createElement('div');
    grid.className = 'times-grid';
    times.forEach(function(t) {
        var div = document.createElement('div');
        div.className = 'time';
        var html = '<h3>Time ' + t.nome + '</h3>';
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
    if (!AUTH.user) { alert('Voce precisa estar logado.'); return; }
    var nome = document.getElementById('convidadoNome').value.trim();
    var tipo = document.getElementById('convidadoTipo').value;
    var categoria = parseFloat(document.getElementById('convidadoCategoria').value);
    if (!nome) { alert('Informe o nome do convidado.'); return; }
    var menina = document.getElementById('convidadoMenina').checked;
    salvarJogadorNoSupabase({ nome: nome, categoria: categoria, goleiro: tipo === 'goleiro', presente: true, convidado: true, menina: menina, grupo_id: grupoAtual.id });
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
                if (navigator.share) {
                    navigator.share({ title: grupoAtual.nome, text: 'Times da pelada', files: [file] });
                } else {
                    alert('Compartilhamento nao suportado.');
                }
            });
        });
    });
}

function bindEventos() {
    var b = document.getElementById('btnSortear'); if (b) b.addEventListener('click', realizarSorteio);
    var b2 = document.getElementById('btnResortear'); if (b2) b2.addEventListener('click', realizarSorteio);
    var b3 = document.getElementById('btnCompartilhar'); if (b3) b3.addEventListener('click', compartilharImagem);
    var b4 = document.getElementById('btnDesmarcar'); if (b4) b4.addEventListener('click', desmarcarTodos);
    var b5 = document.getElementById('btnAdicionar'); if (b5) b5.addEventListener('click', adicionarConvidado);
}

function renderLoginScreen() {
    var ls = document.getElementById('loginSection');
    if (!ls) return;
    ls.innerHTML = '<div class="login-overlay"><div class="login-card"><div class="login-header"><h2>Boleiros de Cristo</h2><p>Area do organizador</p></div><div class="login-body"><div id="loginForm"><div class="form-group"><label for="loginEmail">Seu e-mail</label><input type="email" id="loginEmail" placeholder="seu@email.com" autocomplete="email"></div><div class="form-group"><label for="loginPassword">Sua senha</label><input type="password" id="loginPassword" placeholder="Sua senha" autocomplete="current-password"></div><button id="btnLogin" class="btn-primary" onclick="doLogin()">Entrar</button><p class="login-hint">Digite email e senha cadastrados.</p></div><div id="loginLoading" style="display:none;"><p>Entrando...</p></div><div id="loginStatus"></div></div></div></div>';
    ls.style.display = 'flex';
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
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        if (statusEl) statusEl.innerHTML = result.success ? '<p class="login-success">' + result.message + '</p>' : '<p class="login-error">Erro: ' + result.error + '</p>';
    });
}

document.addEventListener('DOMContentLoaded', function() { initAuth(); if (!AUTH.user) renderLoginScreen(); });
