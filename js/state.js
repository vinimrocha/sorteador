/* Gerenciamento centralizado de estado */

export const state = {
    AUTH: { loading: false, user: null, session: null },
    grupoAtual: null,
    MEUS_GRUPOS: [],
    jogadores: [],
    PENDING_SIGNUP: null,
    LOGO_FILE: null,
    JOIN_SLUG: null,
    EDIT_INDEX: null,
    timesAtuais: null
};

// Exposição opcional no window para debugging e retrocompatibilidade
if (typeof window !== 'undefined') {
    window.AUTH = state.AUTH;
    Object.defineProperty(window, 'grupoAtual', {
        get: () => state.grupoAtual,
        set: (v) => { state.grupoAtual = v; }
    });
    Object.defineProperty(window, 'jogadores', {
        get: () => state.jogadores,
        set: (v) => { state.jogadores = v; }
    });
    Object.defineProperty(window, 'PENDING_SIGNUP', {
        get: () => state.PENDING_SIGNUP,
        set: (v) => { state.PENDING_SIGNUP = v; }
    });
    Object.defineProperty(window, 'LOGO_FILE', {
        get: () => state.LOGO_FILE,
        set: (v) => { state.LOGO_FILE = v; }
    });
    Object.defineProperty(window, 'JOIN_SLUG', {
        get: () => state.JOIN_SLUG,
        set: (v) => { state.JOIN_SLUG = v; }
    });
    Object.defineProperty(window, 'EDIT_INDEX', {
        get: () => state.EDIT_INDEX,
        set: (v) => { state.EDIT_INDEX = v; }
    });
}

export function displayName() {
    if (state.AUTH.user && state.AUTH.user.user_metadata && state.AUTH.user.user_metadata.display_name) {
        return state.AUTH.user.user_metadata.display_name;
    }
    return state.AUTH.user ? state.AUTH.user.email : '';
}

export function isOwnerOf(grupoId) {
    return state.MEUS_GRUPOS.some(function(g) {
        return g.id === grupoId && g.role === 'owner' && g.status === 'approved';
    });
}
