/**
 * BOLEIROS DE CRISTO - modulo de autenticacao
 * Usa Magic Link do Supabase Auth (sem senha)
 */

const AUTH = {
    loading: false,
    user: null,
    session: null
};

const SUPABASE_URL = 'https://maqdmlsouqmadoaayrcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcWRtbHNvdXFtYWRvYWF5cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NjQ2ODMsImV4cCI6MjEwNDE0MDY4M30.QTLO0en8WYvsdPMdkKuNUefSk8N1w72-B89a-4beRFM';

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// INICIALIZAR AUTH
// =========================

async function initAuth() {
    try {
        // Verifica se ha token na URL (Magic Link)
        const hash = window.location.hash;
        if (hash) {
            if (hash.includes('access_token')) {
                const params = new URLSearchParams(hash.substring(1));
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                if (accessToken) {
                    const { data } = await supabaseClient.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    });
                    AUTH.session = data.session;
                    AUTH.user = data.session?.user ?? null;
                    window.history.replaceState({}, document.title, window.location.pathname);
                    onAuthStateChanged(AUTH.user);
                    return;
                }
            } else if (hash.includes('error=')) {
                // Erro no link (expirado ou invalido)
                console.error('Erro no Magic Link:', hash);
                window.history.replaceState({}, document.title, window.location.pathname);
                renderLoginScreen();
                return;
            }
        }

        // Verifica se ha sessao existente
        const { data: { session } } = await supabaseClient.auth.getSession();
        AUTH.session = session;
        AUTH.user = session?.user ?? null;

        // Listener para mudancas de sessao
        supabaseClient.auth.onAuthStateChange((event, session) => {
            AUTH.session = session;
            AUTH.user = session?.user ?? null;
            onAuthStateChanged(AUTH.user);
        });

    } catch (err) {
        console.error('Erro ao inicializar auth:', err);
    }
}
}

// =========================
// MAGIC LINK (login)
// =========================

async function loginWithMagicLink(email) {
    AUTH.loading = true;
    try {
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: email.trim(),
            options: {
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });

        if (error) throw error;
        return { success: true, message: 'Link de verificacao enviado para ' + email };
    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        AUTH.loading = false;
    }
}

// =========================
// LOGOUT
// =========================

async function logout() {
    try {
        await supabaseClient.auth.signOut();
        AUTH.user = null;
        AUTH.session = null;
        onAuthStateChanged(null);
    } catch (err) {
        console.error('Erro ao logout:', err);
    }
}

// =========================
// ESTADO DE AUTENTICACAO
// =========================

function onAuthStateChanged(user) {
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');
    const groupSection = document.getElementById('groupSection');

    if (user) {
        if (loginSection) loginSection.style.display = 'none';
        if (adminSection) adminSection.style.display = 'block';
        if (groupSection) groupSection.style.display = 'block';
        carregarMeusGrupos();
    } else {
        if (loginSection) loginSection.style.display = 'flex';
        if (adminSection) adminSection.style.display = 'none';
        if (groupSection) groupSection.style.display = 'none';
    }
}

// =========================
// CARREGAR GRUPOS DO USUARIO
// =========================

async function carregarMeusGrupos() {
    if (!AUTH.user) return [];

    try {
        const { data: groups, error } = await supabaseClient
            .from('usuarios_grupo')
            .select('grupo_id, grupo(nome, slug, logo_url), role')
            .eq('user_id', AUTH.user.id)
            .order('role', { ascending: false });

        if (error) throw error;
        return groups || [];
    } catch (err) {
        console.error('Erro ao carregar grupos:', err);
        return [];
    }
}

// =========================
// VERIFICAR SE E ADMIN DO GRUPO
// =========================

async function isAdminOfGroup(grupoId) {
    if (!AUTH.user) return false;
    try {
        const { data, error } = await supabaseClient
            .from('usuarios_grupo')
            .select('id')
            .eq('grupo_id', grupoId)
            .eq('user_id', AUTH.user.id)
            .single();
        return !error && !!data;
    } catch (err) {
        return false;
    }
}

// =========================
// TELA DE LOGIN
// =========================

function renderLoginScreen() {
    const loginSection = document.getElementById('loginSection');
    if (!loginSection) return;

    loginSection.innerHTML = `
        <div class="login-overlay" id="loginOverlay">
            <div class="login-card">
                <div class="login-header">
                    <h2>⚽ Boleiros de Cristo</h2>
                    <p>Area do organizador</p>
                </div>
                <div class="login-body">
                    <div id="loginForm">
                        <div class="form-group">
                            <label for="loginEmail">Seu e-mail</label>
                            <input type="email" id="loginEmail" placeholder="seu@email.com" autocomplete="email">
                        </div>
                        <button id="btnLogin" class="btn-primary" onclick="doLogin()">
                            Enviar Link de Acesso
                        </button>
                        <p class="login-hint">Enviamos um link para seu e-mail. Clique nele para entrar.</p>
                    </div>
                    <div id="loginLoading" style="display:none;">
                        <p>Enviando link...</p>
                    </div>
                    <div id="loginStatus"></div>
                </div>
            </div>
        </div>
    `;
    loginSection.style.display = 'flex';
}

// =========================
// EXECUTAR LOGIN
// =========================

async function doLogin() {
    const email = document.getElementById('loginEmail')?.value.trim();
    if (!email || !email.includes('@')) {
        alert('Informe um e-mail valido.');
        return;
    }

    const formEl = document.getElementById('loginForm');
    const loadingEl = document.getElementById('loginLoading');
    const statusEl = document.getElementById('loginStatus');

    if (formEl) formEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '';

    const result = await loginWithMagicLink(email);

    if (loadingEl) loadingEl.style.display = 'none';
    if (formEl) formEl.style.display = 'block';

    if (result.success) {
        if (statusEl) statusEl.innerHTML = `<p class="login-success">${result.message}</p>`;
    } else {
        if (statusEl) statusEl.innerHTML = `<p class="login-error">Erro: ${result.error}</p>`;
    }
}

// =========================
// INICIALIZAR NA CARGA
// =========================

document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    if (!AUTH.user) {
        renderLoginScreen();
    }
});
