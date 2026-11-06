/* Persistência local (localStorage) para presença de jogadores */
import { state } from './state.js';

export function getStorageKeyPresentes(grupoId) {
    var gid = grupoId || (state.grupoAtual ? state.grupoAtual.id : null);
    return gid ? 'presentes_' + gid : 'presentes_default';
}

export function obterPresentesStorage(grupoId) {
    try {
        var key = getStorageKeyPresentes(grupoId);
        var raw = localStorage.getItem(key);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

export function salvarPresentesStorage(grupoId) {
    try {
        var key = getStorageKeyPresentes(grupoId);
        var idsPresentes = state.jogadores.filter(function(j) { return !!j.presente; }).map(function(j) { return j.id; });
        localStorage.setItem(key, JSON.stringify(idsPresentes));
    } catch (e) {
        console.warn('Erro ao salvar presença no localStorage:', e);
    }
}

export function limparPresentesStorage(grupoId) {
    try {
        var key = getStorageKeyPresentes(grupoId);
        localStorage.removeItem(key);
    } catch (e) {}
}
