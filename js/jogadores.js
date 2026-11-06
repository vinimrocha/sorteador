/* Gerenciamento de Jogadores (Fixos e Convidados) */
import { state } from './state.js';
import { supabaseClient, LIMITE_JOGADORES } from './config.js';
import { obterPresentesStorage, salvarPresentesStorage, limparPresentesStorage } from './storage.js';
import { escAttr } from './utils.js';

export function carregarJogadores(grupoId) {
    supabaseClient.from('jogadores').select('*').eq('grupo_id', grupoId).order('nome').then(function(result) {
        if (result.error) throw result.error;
        var salvos = obterPresentesStorage(grupoId);
        state.jogadores = (result.data || []).map(function(j) {
            var estaPresente = salvos.indexOf(j.id) >= 0 || salvos.indexOf(String(j.id)) >= 0;
            return Object.assign({}, j, { presente: estaPresente });
        });
        renderLista();
    }).catch(function(err) {
        console.error('Erro ao carregar jogadores:', err);
    });
}

export function renderLista() {
    var listaEl = document.getElementById('listaJogadores');
    if (!listaEl) return;
    listaEl.innerHTML = '';
    state.jogadores.forEach(function(j, index) {
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
        if (j.goleiro) { metaDiv.textContent = 'Goleiro'; } else { metaDiv.textContent = Number(j.categoria).toFixed(1); }
        if (j.menina) { var ms = document.createElement('em'); ms.className = 'tag-menina'; ms.textContent = ' mulher'; metaDiv.appendChild(ms); }
        if (j.convidado) { var cs = document.createElement('em'); cs.className = 'tag-convidado'; cs.textContent = ' convidado'; metaDiv.appendChild(cs); }
        infoDiv.appendChild(strong); infoDiv.appendChild(metaDiv);
        label.appendChild(checkbox); label.appendChild(infoDiv);
        div.appendChild(label);
        var actions = document.createElement('div');
        actions.className = 'jogador-actions';
        var btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn-mini';
        btnEdit.textContent = 'Editar';
        btnEdit.dataset.index = index;
        var btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn-mini btn-mini-danger';
        btnDel.textContent = 'Excluir';
        btnDel.dataset.index = index;
        actions.appendChild(btnEdit); actions.appendChild(btnDel);
        div.appendChild(actions); listaEl.appendChild(div);

        checkbox.addEventListener('change', function() {
            state.jogadores[parseInt(this.dataset.index)].presente = this.checked;
            salvarPresentesStorage();
            atualizarContador();
        });
        btnEdit.addEventListener('click', function() { editarJogador(parseInt(this.dataset.index)); });
        btnDel.addEventListener('click', function() { removerJogador(parseInt(this.dataset.index)); });
    });
    var limEl = document.getElementById('limiteJogadores');
    if (limEl) limEl.textContent = state.jogadores.length + ' de 150 jogadores';
    atualizarContador();
}

export function atingiuLimite() {
    if (state.jogadores.length >= LIMITE_JOGADORES) {
        alert('Limite de 150 jogadores atingido.');
        return true;
    }
    return false;
}

export function payloadJogador(j) {
    return {
        grupo_id: j.grupo_id,
        nome: j.nome,
        categoria: j.categoria,
        goleiro: !!j.goleiro,
        menina: !!j.menina,
        convidado: !!j.convidado
    };
}

export function limparFormFixo() {
    var nomeEl = document.getElementById('fixoNome');
    var tipoEl = document.getElementById('fixoTipo');
    var catEl = document.getElementById('fixoCategoria');
    var menEl = document.getElementById('fixoMenina');
    if (nomeEl) nomeEl.value = '';
    if (tipoEl) tipoEl.value = 'linha';
    if (catEl) catEl.value = '3';
    if (menEl) menEl.checked = false;
}

export function adicionarJogadorFixo() {
    if (!state.AUTH.user) { alert('Entre com sua conta para incluir jogadores.'); return; }
    if (!state.grupoAtual) { alert('Aguarde carregar os jogadores.'); return; }
    if (atingiuLimite()) return;
    var nome = document.getElementById('fixoNome').value.trim();
    var tipo = document.getElementById('fixoTipo').value;
    var categoria = parseFloat(document.getElementById('fixoCategoria').value);
    var menina = document.getElementById('fixoMenina').checked;
    if (!nome) { alert('Informe o nome do jogador.'); return; }
    var jogador = {
        nome: nome,
        categoria: categoria,
        goleiro: tipo === 'goleiro',
        presente: false,
        convidado: false,
        menina: menina,
        grupo_id: state.grupoAtual.id
    };
    supabaseClient.from('jogadores').insert(payloadJogador(jogador)).select().then(function(result) {
        if (result.error) throw result.error;
        jogador.id = result.data[0].id;
        state.jogadores.push(jogador);
        state.jogadores.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
        renderLista();
        limparFormFixo();
    }).catch(function(err) {
        alert('Erro ao incluir: ' + err.message);
    });
}

export function editarJogador(index) {
    var j = state.jogadores[index];
    if (!j) return;
    if (!state.AUTH.user) { alert('Entre com sua conta para editar jogadores.'); return; }
    state.EDIT_INDEX = index;
    var modal = document.getElementById('playerModal');
    if (!modal) return;
    var cats = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map(function(c) {
        return '<option value="' + c + '"' + (parseFloat(c) === parseFloat(j.categoria) ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    modal.innerHTML = '<div class="player-modal-overlay" onclick="if(event.target===this)fecharModalJogador()"><div class="player-modal"><h3>Editar jogador</h3><div class="form-group"><label for="editNome">Nome</label><input type="text" id="editNome" value="' + escAttr(j.nome) + '" autocomplete="off"></div><div class="form-row"><div class="form-group"><label for="editTipo">Tipo</label><select id="editTipo"><option value="linha"' + (j.goleiro ? '' : ' selected') + '>Linha</option><option value="goleiro"' + (j.goleiro ? ' selected' : '') + '>Goleiro</option></select></div><div class="form-group"><label for="editCategoria">Categoria</label><select id="editCategoria">' + cats + '</select></div></div><div class="form-group form-check"><label><input type="checkbox" id="editMenina"' + (j.menina ? ' checked' : '') + '> Menina (times separados)</label></div><div class="player-modal-row"><button class="btn-secondary" onclick="fecharModalJogador()">Cancelar</button><button class="btn-primary" onclick="salvarEdicaoJogador()">Salvar</button></div></div></div>';
}

export function fecharModalJogador() {
    var modal = document.getElementById('playerModal');
    if (modal) modal.innerHTML = '';
    state.EDIT_INDEX = null;
}

export function salvarEdicaoJogador() {
    var index = state.EDIT_INDEX;
    var j = state.jogadores[index];
    if (j == null || !j) { fecharModalJogador(); return; }
    var nome = document.getElementById('editNome').value.trim();
    var tipo = document.getElementById('editTipo').value;
    var categoria = parseFloat(document.getElementById('editCategoria').value);
    var menina = document.getElementById('editMenina').checked;
    if (!nome) { alert('Informe o nome do jogador.'); return; }
    var patch = { nome: nome, categoria: categoria, goleiro: tipo === 'goleiro', menina: menina };
    supabaseClient.from('jogadores').update(patch).eq('id', j.id).select().then(function(result) {
        if (result.error) throw result.error;
        state.jogadores[index] = Object.assign({}, j, patch);
        state.jogadores.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
        renderLista();
        fecharModalJogador();
    }).catch(function(err) {
        alert('Erro ao salvar: ' + err.message);
    });
}

export function removerJogador(index) {
    var j = state.jogadores[index];
    if (!j) return;
    if (!state.AUTH.user) { alert('Entre com sua conta para remover jogadores.'); return; }
    if (!confirm('Remover "' + j.nome + '" da lista?')) return;
    supabaseClient.from('jogadores').delete().eq('id', j.id).then(function(result) {
        if (result.error) { alert('Erro ao remover: ' + result.error.message); return; }
        state.jogadores = state.jogadores.filter(function(item) { return item.id !== j.id; });
        salvarPresentesStorage();
        location.reload();
    });
}

export function adicionarConvidado() {
    if (!state.AUTH.user) { alert('Entre com sua conta para adicionar convidados.'); return; }
    if (!state.grupoAtual) { alert('Aguarde carregar os jogadores.'); return; }
    if (atingiuLimite()) return;
    var nome = document.getElementById('convidadoNome').value.trim();
    var tipo = document.getElementById('convidadoTipo').value;
    var categoria = parseFloat(document.getElementById('convidadoCategoria').value);
    if (!nome) { alert('Informe o nome do convidado.'); return; }
    var menina = document.getElementById('convidadoMenina').checked;
    var convidado = {
        nome: nome,
        categoria: categoria,
        goleiro: tipo === 'goleiro',
        presente: true,
        convidado: true,
        menina: menina,
        grupo_id: state.grupoAtual.id
    };
    salvarJogadorNoSupabase(convidado);
}

export function salvarJogadorNoSupabase(jogador) {
    if (!state.AUTH.user) { alert('Acesso negado.'); return; }
    supabaseClient.from('usuarios_grupo').select('id').eq('grupo_id', jogador.grupo_id).eq('user_id', state.AUTH.user.id).single().then(function(r) {
        if (!r.data) { alert('Você não tem permissão para este grupo.'); return; }
        supabaseClient.from('jogadores').insert(payloadJogador(jogador)).select().then(function(result) {
            if (result.error) throw result.error;
            jogador.id = result.data[0].id;
            state.jogadores.push(jogador);
            state.jogadores.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
            salvarPresentesStorage();
            renderLista();
            document.getElementById('convidadoNome').value = '';
            document.getElementById('convidadoMenina').checked = false;
        }).catch(function(err) {
            alert('Erro ao salvar: ' + err.message);
        });
    }).catch(function() {
        alert('Você não tem permissão para este grupo.');
    });
}

export function desmarcarTodos() {
    state.jogadores.forEach(function(j) { j.presente = false; });
    limparPresentesStorage();
    document.querySelectorAll('input[type=checkbox]').forEach(function(cb) { cb.checked = false; });
    atualizarContador();
}

export function atualizarContador() {
    var total = state.jogadores.filter(function(j) { return j.presente; }).length;
    var el = document.getElementById('contadorSelecionados');
    if (el) el.textContent = total + ' selecionado' + (total !== 1 ? 's' : '');
}
