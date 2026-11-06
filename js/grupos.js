/* Gerenciamento de Grupos, Papéis (Owner/Admin) e Associações */
import { state, isOwnerOf } from './state.js';
import { supabaseClient, SYSTEM_LOGO } from './config.js';
import { carregarJogadores } from './jogadores.js';
import { escAttr, slugify } from './utils.js';
import { personalizarHeader, onAuthStateChanged, loadApp } from './auth.js';

export function uploadLogo(file) {
    var ext = ((file.name || '').split('.').pop() || 'png').toLowerCase().substring(0, 4);
    var path = 'grupos/' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;
    return supabaseClient.storage.from('logos').upload(path, file, { upsert: false }).then(function(r) {
        if (r.error) return { success: false, error: r.error.message };
        var pub = supabaseClient.storage.from('logos').getPublicUrl(path);
        return { success: true, url: pub.data.publicUrl };
    });
}

export function createUserAndGroup(email, password, username, nomeGrupo, logoUrl, signupFn, ensureSessionFn) {
    var ctx = null;
    return signupFn(email, password, username).then(function(result) {
        if (!result.success && !result.alreadyRegistered) return result;
        if (result.alreadyRegistered) {
            return ensureSessionFn(email, password).then(function(s) {
                if (!s.success) return { success: false, error: 'Este e-mail já tem conta. Faça login.' };
                state.AUTH.session = s.session;
                state.AUTH.user = s.session.user;
                state.PENDING_SIGNUP = { email: email.trim().toLowerCase(), password: password, username: username.trim(), userId: state.AUTH.user.id };
                return { success: true, user: state.AUTH.user };
            });
        }
        return result;
    }).then(function(result) {
        if (!result.success) return result;
        ctx = { userId: state.AUTH.user.id, email: email.trim().toLowerCase() };
        var slug = slugify(nomeGrupo) + '-' + Date.now().toString(36);
        return supabaseClient.from('grupos').insert({ nome: nomeGrupo.trim(), slug: slug, logo_url: (logoUrl || SYSTEM_LOGO) }).select().then(function(r) {
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
            state.PENDING_SIGNUP = null;
            return { success: true, grupo: result.grupo };
        });
    });
}

export function joinGroup(email, password, username, groupSlug, signupFn, ensureSessionFn) {
    var ctx = null;
    var grupo = null;
    return signupFn(email, password, username).then(function(result) {
        if (!result.success && !result.alreadyRegistered) return result;
        if (result.alreadyRegistered) {
            return ensureSessionFn(email, password).then(function(s) {
                if (!s.success) return { success: false, error: 'Este e-mail já tem conta. Faça login.' };
                state.AUTH.session = s.session;
                state.AUTH.user = s.session.user;
                state.PENDING_SIGNUP = { email: email.trim().toLowerCase(), password: password, username: (username || '').trim(), userId: state.AUTH.user.id };
                return { success: true, user: state.AUTH.user };
            });
        }
        return result;
    }).then(function(result) {
        if (!result.success) return result;
        ctx = { userId: state.AUTH.user.id, email: email.trim().toLowerCase() };
        return supabaseClient.from('grupos').select('id, nome, slug').eq('slug', groupSlug.trim().toLowerCase()).single().then(function(r) {
            if (r.error || !r.data) return { success: false, error: 'Grupo não encontrado. Confira o código.' };
            grupo = r.data;
            return supabaseClient.from('usuarios_grupo').select('id, status').eq('grupo_id', grupo.id).eq('user_id', ctx.userId).maybeSingle().then(function(ex) {
                if (ex.data) return { success: false, error: ex.data.status === 'approved' ? 'Você já é admin deste grupo.' : 'Pedido já enviado. Aguarde aprovação do owner.' };
                return { success: true };
            });
        });
    }).then(function(result) {
        if (!result.success) return result;
        return supabaseClient.from('usuarios_grupo').select('id', { count: 'exact' }).eq('grupo_id', grupo.id).then(function(c) {
            if ((c.count || 0) >= 5) return { success: false, error: 'Este grupo já tem 5 administradores (limite).' };
            return supabaseClient.from('usuarios_grupo').insert({
                grupo_id: grupo.id,
                email: ctx.email,
                user_id: ctx.userId,
                role: 'admin',
                status: 'pending'
            }).select().then(function(ir) {
                if (ir.error) return { success: false, error: ir.error.message };
                state.PENDING_SIGNUP = null;
                return { success: true, grupo: grupo };
            });
        });
    });
}

export function getMyGroups() {
    if (!state.AUTH.user) return Promise.resolve([]);
    return supabaseClient.from('usuarios_grupo').select('grupo_id, grupos(nome, slug, logo_url), role, status').eq('user_id', state.AUTH.user.id).then(function(result) {
        if (result.error) return [];
        return (result.data || []).map(function(g) {
            return { id: g.grupo_id, nome: g.grupos.nome, slug: g.grupos.slug, logo_url: g.grupos.logo_url, role: g.role, status: g.status };
        });
    }).catch(function() { return []; });
}

export function getPendingRequests(groupId) {
    return supabaseClient.from('usuarios_grupo').select('id, email, role, created_at').eq('grupo_id', groupId).eq('status', 'pending').then(function(result) {
        if (result.error) return [];
        return result.data || [];
    }).catch(function() { return []; });
}

export function approveUser(requestId) {
    return supabaseClient.from('usuarios_grupo').update({ status: 'approved' }).eq('id', requestId).select().then(function(result) {
        if (result.error) return { success: false, error: result.error.message };
        return { success: true };
    });
}

export function rejectUser(requestId) {
    return supabaseClient.from('usuarios_grupo').delete().eq('id', requestId).then(function(result) {
        if (result.error) return { success: false, error: result.error.message };
        return { success: true };
    });
}

export function toggleManageButton() {
    var btn = document.getElementById('btnManageGroup');
    if (!btn) return;
    btn.style.display = (state.AUTH.user && state.grupoAtual && isOwnerOf(state.grupoAtual.id)) ? 'block' : 'none';
}

export function showManageGroup() {
    if (!state.AUTH.user || !state.grupoAtual || !isOwnerOf(state.grupoAtual.id)) {
        alert('Apenas o owner pode gerenciar o grupo.');
        return;
    }
    var mainEl = document.getElementById('mainApp');
    if (mainEl) mainEl.style.display = 'none';
    state.LOGO_FILE = null;
    var ls = document.getElementById('loginSection');
    var logo = state.grupoAtual.logo_url || SYSTEM_LOGO;
    ls.innerHTML = '<div class="login-page"><div class="login-card"><div class="login-header"><h2>Gerenciar Grupo</h2><p>Nome e logo do grupo</p></div><div class="login-body"><div id="manageGroupForm"><div style="text-align:center;margin-bottom:12px;"><img id="manageLogoPreview" src="' + escAttr(logo) + '" alt="Logo do grupo" style="max-width:120px;border-radius:12px;"></div><div class="form-group"><label for="manageGroupName">Nome do grupo</label><input type="text" id="manageGroupName" value="' + escAttr(state.grupoAtual.nome) + '"></div><div class="form-group"><label for="manageGroupLogo">Nova logo (URL ou arquivo)</label><input type="text" id="manageGroupLogo" value="" placeholder="Cole a URL ou escolha um arquivo"><input type="file" id="manageGroupLogoFile" accept="image/*" style="margin-top:8px;"></div><button class="btn-primary" onclick="doSaveGroup()">Salvar</button><p class="login-hint"><a href="#" onclick="onAuthStateChanged(window.AUTH ? window.AUTH.user : null); return false;">Voltar</a></p></div><div id="manageGroupLoading" style="display:none;"><p>Salvando...</p></div><div id="manageGroupStatus"></div><div class="pending-panel" style="margin-top:16px;"><h3>Solicitações pendentes</h3><div id="managePendingList"><p class="login-hint">Carregando...</p></div></div><div class="pending-panel" style="margin-top:16px;"><h3>Administradores</h3><div id="manageMembersList"><p class="login-hint">Carregando...</p></div></div><div class="danger-zone"><h3>Zona de perigo</h3><p class="login-hint">Exclui o grupo, os jogadores e os acessos. Não pode ser desfeita.</p><button class="btn-danger" onclick="doDeleteGroup()">Excluir grupo e jogadores</button></div></div></div></div>';
    ls.style.display = 'block';
    carregarPendentesManage();
    carregarMembrosManage();
    var fileInput = document.getElementById('manageGroupLogoFile');
    if (fileInput) fileInput.addEventListener('change', function() {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        state.LOGO_FILE = f;
        var prev = document.getElementById('manageLogoPreview');
        if (prev) prev.src = URL.createObjectURL(f);
    });
}

export function doSaveGroup() {
    if (!state.AUTH.user || !state.grupoAtual || !isOwnerOf(state.grupoAtual.id)) {
        alert('Apenas o owner pode gerenciar o grupo.');
        return;
    }
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
        state.LOGO_FILE = null;
        supabaseClient.from('grupos').update({ nome: nome, logo_url: finalLogo }).eq('id', state.grupoAtual.id).select().then(function(r) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (formEl) formEl.style.display = 'block';
            if (r.error) {
                if (statusEl) statusEl.innerHTML = '<p class="login-error">Erro: ' + r.error.message + '</p>';
                return;
            }
            state.grupoAtual.nome = nome;
            state.grupoAtual.logo_url = finalLogo;
            personalizarHeader(state.grupoAtual);
            if (statusEl) statusEl.innerHTML = '<p class="login-success">Grupo atualizado!</p>';
            setTimeout(function() { onAuthStateChanged(state.AUTH.user); }, 1200);
        });
    };

    if (state.LOGO_FILE) {
        uploadLogo(state.LOGO_FILE).then(function(up) {
            if (!up.success) {
                if (loadingEl) loadingEl.style.display = 'none';
                if (formEl) formEl.style.display = 'block';
                if (statusEl) statusEl.innerHTML = '<p class="login-error">Erro no upload da logo: ' + up.error + '</p>';
                return;
            }
            finish(up.url);
        });
    } else {
        finish(logoTyped || state.grupoAtual.logo_url || SYSTEM_LOGO);
    }
}

export function carregarPendentesManage() {
    var box = document.getElementById('managePendingList');
    if (!box || !state.grupoAtual) return;
    box.innerHTML = '<p class="login-hint">Carregando...</p>';
    getPendingRequests(state.grupoAtual.id).then(function(reqs) {
        if (!reqs || !reqs.length) { box.innerHTML = '<p class="login-hint">Nenhuma solicitação pendente.</p>'; return; }
        box.innerHTML = reqs.map(function(p) {
            return '<div class="pending-item"><span class="pending-email">' + escAttr(p.email) + '</span><span class="pending-actions"><button class="btn-success btn-compact" onclick="doApproveManage(\'' + p.id + '\')">Aprovar</button> <button class="btn-secondary btn-compact" onclick="doRejectManage(\'' + p.id + '\')">Recusar</button></span></div>';
        }).join('');
    });
}

export function doApproveManage(requestId) {
    approveUser(requestId).then(function(r) {
        if (!r.success) { alert('Erro: ' + r.error); return; }
        carregarPendentesManage();
    });
}

export function doRejectManage(requestId) {
    if (!confirm('Recusar este pedido?')) return;
    rejectUser(requestId).then(function(r) {
        if (!r.success) { alert('Erro: ' + r.error); return; }
        carregarPendentesManage();
    });
}

export function getGroupMembers(groupId) {
    return supabaseClient.from('usuarios_grupo').select('id, email, role, status').eq('grupo_id', groupId).eq('status', 'approved').order('role').then(function(r) {
        if (r.error) return [];
        return r.data || [];
    }).catch(function() { return []; });
}

export function carregarMembrosManage() {
    var box = document.getElementById('manageMembersList');
    if (!box || !state.grupoAtual) return;
    box.innerHTML = '<p class="login-hint">Carregando...</p>';
    getGroupMembers(state.grupoAtual.id).then(function(members) {
        if (!members.length) { box.innerHTML = '<p class="login-hint">Nenhum membro.</p>'; return; }
        box.innerHTML = members.map(function(m) {
            var tag = m.role === 'owner' ? '<span class="admin-badge">owner</span>' : '<span class="admin-badge">admin</span>';
            var btn = m.role === 'owner' ? '' : ' <button class="btn-secondary btn-compact" onclick="doRemoveAdmin(\'' + m.id + '\', \'' + escAttr(m.email) + '\')">Remover</button>';
            return '<div class="pending-item"><span class="pending-email">' + escAttr(m.email) + ' ' + tag + '</span><span class="pending-actions">' + btn + '</span></div>';
        }).join('');
    });
}

export function doRemoveAdmin(membershipId, email) {
    if (!confirm('Remover "' + email + '" do grupo?')) return;
    supabaseClient.from('usuarios_grupo').delete().eq('id', membershipId).then(function(r) {
        if (r.error) { alert('Erro: ' + r.error.message); return; }
        carregarMembrosManage();
    });
}

export function doDeleteGroup() {
    if (!state.AUTH.user || !state.grupoAtual || !isOwnerOf(state.grupoAtual.id)) {
        alert('Apenas o owner pode excluir o grupo.');
        return;
    }
    if (!confirm('Excluir o grupo "' + state.grupoAtual.nome + '" e TODOS os jogadores?')) return;
    if (!confirm('Confirme novamente: exclusão definitiva.')) return;
    supabaseClient.from('grupos').delete().eq('id', state.grupoAtual.id).then(function(r) {
        if (r.error) { alert('Erro: ' + r.error.message); return; }
        location.reload();
    });
}

export function doApprove(requestId) {
    approveUser(requestId).then(function(r) {
        if (!r.success) { alert('Erro: ' + r.error); return; }
        loadApp();
    });
}

export function doReject(requestId) {
    if (!confirm('Recusar este pedido?')) return;
    rejectUser(requestId).then(function(r) {
        if (!r.success) { alert('Erro: ' + r.error); return; }
        loadApp();
    });
}

export function renderGroupSelector(groups) {
    var container = document.getElementById('groupSelector');
    if (!container || groups.length <= 1) { if (container) container.innerHTML = ''; return; }
    container.innerHTML = '<select id="grupoSelect" onchange="mudarGrupo(this.value)">' +
        groups.map(function(g) { return '<option value="' + g.slug + '">' + g.nome + '</option>'; }).join('') + '</select>';
}

export function mudarGrupo(slug) {
    carregarGrupo(slug, true);
}

export function carregarGrupo(slug, personalizar) {
    supabaseClient.from('grupos').select('id, nome, slug, logo_url').eq('slug', slug).single().then(function(result) {
        if (result.error || !result.data) {
            if (personalizar !== false) alert('Grupo não encontrado');
            else console.warn('Grupo público não encontrado:', slug);
            return;
        }
        state.grupoAtual = result.data;
        if (personalizar !== false && state.AUTH.user) personalizarHeader(state.grupoAtual);
        else { state.grupoAtual.nome = 'Sorteador de Times'; state.grupoAtual.logo_url = state.grupoAtual.logo_url || SYSTEM_LOGO; }
        toggleManageButton();
        carregarJogadores(state.grupoAtual.id);
    }).catch(function(err) {
        console.error('Erro ao carregar grupo:', err);
    });
}

export function loadJoinGroups() {
    var box = document.getElementById('joinGroupList');
    if (!box) return;
    supabaseClient.from('grupos').select('id, nome, slug, logo_url').order('nome').then(function(r) {
        if (r.error) { box.innerHTML = '<p class="login-error">Erro ao carregar grupos: ' + r.error.message + '</p>'; return; }
        if (!r.data || !r.data.length) { box.innerHTML = '<p class="login-hint">Nenhum grupo disponível.</p>'; return; }
        box.innerHTML = r.data.map(function(g) {
            var logo = g.logo_url || SYSTEM_LOGO;
            return '<div class="group-option" data-slug="' + g.slug + '" onclick="selectJoinGroup(\'' + g.slug + '\', this)"><img src="' + escAttr(logo) + '" alt="" width="40" height="40"><span>' + escAttr(g.nome) + '</span></div>';
        }).join('');
    }).catch(function() {
        box.innerHTML = '<p class="login-error">Erro ao carregar grupos.</p>';
    });
}

export function selectJoinGroup(slug, el) {
    state.JOIN_SLUG = slug;
    var items = document.querySelectorAll('#joinGroupList .group-option');
    items.forEach(function(i) { i.classList.remove('selected'); });
    if (el) el.classList.add('selected');
}
