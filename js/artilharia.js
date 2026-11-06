/* Módulo de Artilharia e Rankings Periódicos (Mensal, Bimestral, Semestral e Anual) */

import { state, isOwnerOf } from './state.js';
import { supabaseClient, SYSTEM_LOGO } from './config.js';
import { escAttr } from './utils.js';

export const artilhariaState = {
    rodadas: [],
    gols: [],
    tipoPeriodo: 'mensal', // 'mensal' | 'bimestral' | 'semestral' | 'anual' | 'geral'
    chavePeriodo: null,
    carregando: false,
    rodadaEmEdicao: null
};

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function carregarDadosArtilharia(grupoId) {
    var gid = grupoId || (state.grupoAtual ? state.grupoAtual.id : null);
    if (!gid) return Promise.resolve();

    artilhariaState.carregando = true;
    renderArtilharia();

    return supabaseClient.from('rodadas')
        .select('id, data, observacao, created_at')
        .eq('grupo_id', gid)
        .order('data', { ascending: false })
        .then(function(resRodadas) {
            if (resRodadas.error) throw resRodadas.error;
            artilhariaState.rodadas = resRodadas.data || [];

            var rodadaIds = artilhariaState.rodadas.map(function(r) { return r.id; });
            if (rodadaIds.length === 0) {
                artilhariaState.gols = [];
                artilhariaState.carregando = false;
                renderArtilharia();
                return;
            }

            return supabaseClient.from('gols_rodada')
                .select('id, rodada_id, jogador_id, gols')
                .in('rodada_id', rodadaIds)
                .then(function(resGols) {
                    if (resGols.error) throw resGols.error;
                    artilhariaState.gols = resGols.data || [];
                    artilhariaState.carregando = false;
                    renderArtilharia();
                });
        }).catch(function(err) {
            artilhariaState.carregando = false;
            console.error('Erro ao carregar dados de artilharia:', err);
            renderArtilharia();
        });
}

// Helpers de Período
export function getChavePeriodo(dataStr, tipo) {
    var d = new Date(dataStr + 'T12:00:00');
    if (isNaN(d.getTime())) d = new Date();
    var ano = d.getFullYear();
    var mes = d.getMonth(); // 0 a 11

    if (tipo === 'mensal') {
        var mm = (mes + 1 < 10 ? '0' : '') + (mes + 1);
        return ano + '-' + mm;
    }
    if (tipo === 'bimestral') {
        var b = Math.floor(mes / 2) + 1; // 1 a 6
        return ano + '-B' + b;
    }
    if (tipo === 'semestral') {
        var s = mes < 6 ? 1 : 2;
        return ano + '-S' + s;
    }
    if (tipo === 'anual') {
        return String(ano);
    }
    return 'geral';
}

export function getLabelPeriodo(chave, tipo) {
    if (tipo === 'geral' || chave === 'geral') return 'Todo o Histórico';

    if (tipo === 'mensal') {
        var partsM = chave.split('-');
        var anoM = partsM[0];
        var mesNum = parseInt(partsM[1], 10) - 1;
        return MESES[mesNum] + ' / ' + anoM;
    }
    if (tipo === 'bimestral') {
        var partsB = chave.split('-B');
        var anoB = partsB[0];
        var numB = partsB[1];
        var nomesB = [
            '',
            '1º Bimestre (Jan-Fev)',
            '2º Bimestre (Mar-Abr)',
            '3º Bimestre (Mai-Jun)',
            '4º Bimestre (Jul-Ago)',
            '5º Bimestre (Set-Out)',
            '6º Bimestre (Nov-Dez)'
        ];
        return (nomesB[parseInt(numB, 10)] || ('Bimestre ' + numB)) + ' / ' + anoB;
    }
    if (tipo === 'semestral') {
        var partsS = chave.split('-S');
        var anoS = partsS[0];
        var numS = partsS[1];
        return numS + 'º Semestre / ' + anoS;
    }
    if (tipo === 'anual') {
        return 'Ano ' + chave;
    }
    return chave;
}

export function calcularPeriodosDisponiveis(tipo) {
    if (tipo === 'geral') return [{ chave: 'geral', label: 'Todo o Histórico' }];

    var chavesSet = {};
    artilhariaState.rodadas.forEach(function(r) {
        if (r.data) {
            var k = getChavePeriodo(r.data, tipo);
            chavesSet[k] = true;
        }
    });

    // Se nenhuma rodada ainda existir, incluir o período corrente
    var hojeK = getChavePeriodo(new Date().toISOString().substring(0, 10), tipo);
    chavesSet[hojeK] = true;

    var chaves = Object.keys(chavesSet).sort().reverse();
    return chaves.map(function(k) {
        return { chave: k, label: getLabelPeriodo(k, tipo) };
    });
}

export function calcularRanking(tipo, chave) {
    var rodadasFiltradas = artilhariaState.rodadas.filter(function(r) {
        if (tipo === 'geral') return true;
        return getChavePeriodo(r.data, tipo) === chave;
    });

    var rodadaIdsValidos = {};
    rodadasFiltradas.forEach(function(r) { rodadaIdsValidos[r.id] = true; });

    var totais = {}; // jogador_id => { gols, rodadasComGol }
    artilhariaState.gols.forEach(function(g) {
        if (rodadaIdsValidos[g.rodada_id] && g.gols > 0) {
            if (!totais[g.jogador_id]) {
                totais[g.jogador_id] = { gols: 0, rodadasComGol: 0 };
            }
            totais[g.jogador_id].gols += g.gols;
            totais[g.jogador_id].rodadasComGol += 1;
        }
    });

    // Mapear com informações dos jogadores
    var listaJogadores = state.jogadores || [];
    var jogadoresMap = {};
    listaJogadores.forEach(function(j) { jogadoresMap[j.id] = j; });

    var ranking = Object.keys(totais).map(function(jId) {
        var idNum = parseInt(jId, 10);
        var j = jogadoresMap[idNum] || { id: idNum, nome: 'Jogador #' + jId, categoria: 3, goleiro: false };
        return {
            id: idNum,
            nome: j.nome,
            goleiro: j.goleiro,
            menina: j.menina,
            convidado: j.convidado,
            categoria: j.categoria,
            gols: totais[jId].gols,
            rodadasComGol: totais[jId].rodadasComGol
        };
    });

    // Ordenar: mais gols primeiro. Desempate: mais rodadas com gol, depois nome
    ranking.sort(function(a, b) {
        if (b.gols !== a.gols) return b.gols - a.gols;
        if (b.rodadasComGol !== a.rodadasComGol) return b.rodadasComGol - a.rodadasComGol;
        return a.nome.localeCompare(b.nome);
    });

    return ranking;
}

export function trocarTipoPeriodo(novoTipo) {
    artilhariaState.tipoPeriodo = novoTipo;
    var periodos = calcularPeriodosDisponiveis(novoTipo);
    artilhariaState.chavePeriodo = periodos.length > 0 ? periodos[0].chave : null;
    renderArtilharia();
}

export function trocarChavePeriodo(novaChave) {
    artilhariaState.chavePeriodo = novaChave;
    renderArtilharia();
}

// Renderização Visual
export function renderArtilharia() {
    var container = document.getElementById('artilhariaApp');
    if (!container) return;

    if (artilhariaState.carregando) {
        container.innerHTML = '<div class="card" style="text-align:center;padding:32px;"><p class="login-hint">Carregando artilharia...</p></div>';
        return;
    }

    var tipo = artilhariaState.tipoPeriodo;
    var periodosDisponiveis = calcularPeriodosDisponiveis(tipo);

    if (!artilhariaState.chavePeriodo || !periodosDisponiveis.some(function(p) { return p.chave === artilhariaState.chavePeriodo; })) {
        artilhariaState.chavePeriodo = periodosDisponiveis.length > 0 ? periodosDisponiveis[0].chave : null;
    }

    var ranking = calcularRanking(tipo, artilhariaState.chavePeriodo);
    var labelAtual = getLabelPeriodo(artilhariaState.chavePeriodo, tipo);

    var ehAdmin = !!(state.AUTH.user && state.grupoAtual);

    var html = '';

    // Barra de Ações do Administrador
    if (ehAdmin) {
        html += '<div class="artilharia-admin-bar">';
        html += '<button class="btn-primary" onclick="abrirModalLancarGols()">⚽ Lançar Gols da Rodada</button>';
        html += '<button class="btn-secondary btn-compact" onclick="abrirHistoricoRodadas()">📋 Histórico de Rodadas (' + artilhariaState.rodadas.length + ')</button>';
        html += '</div>';
    }

    // Card de Filtros por Período
    html += '<section class="card card-periodos">';
    html += '<div class="periodo-tabs">';
    ['mensal', 'bimestral', 'semestral', 'anual', 'geral'].forEach(function(p) {
        var ativo = tipo === p ? 'active' : '';
        var nomes = { mensal: 'Mensal', bimestral: 'Bimestral', semestral: 'Semestral', anual: 'Anual', geral: 'Geral' };
        html += '<button class="periodo-tab ' + ativo + '" onclick="trocarTipoPeriodo(\'' + p + '\')">' + nomes[p] + '</button>';
    });
    html += '</div>';

    if (tipo !== 'geral') {
        html += '<div class="periodo-select-row">';
        html += '<label for="periodoSelect">Selecione o período:</label>';
        html += '<select id="periodoSelect" onchange="trocarChavePeriodo(this.value)">';
        periodosDisponiveis.forEach(function(p) {
            var sel = p.chave === artilhariaState.chavePeriodo ? 'selected' : '';
            html += '<option value="' + p.chave + '" ' + sel + '>' + escAttr(p.label) + '</option>';
        });
        html += '</select>';
        html += '</div>';
    }
    html += '</section>';

    // Container capturável da Artilharia
    html += '<div id="imagemRankingCard" class="card-ranking-container">';
    html += '<div class="ranking-header">';
    var logo = (state.grupoAtual && state.grupoAtual.logo_url) || SYSTEM_LOGO;
    var nomeGrupo = (state.grupoAtual && state.grupoAtual.nome) || 'Sorteador de Times';
    html += '<img src="' + escAttr(logo) + '" alt="' + escAttr(nomeGrupo) + '" class="ranking-header-logo" width="48" height="48">';
    html += '<div class="ranking-header-text">';
    html += '<h2>Artilharia · ' + escAttr(nomeGrupo) + '</h2>';
    html += '<p class="ranking-sub">' + escAttr(labelAtual) + '</p>';
    html += '</div>';
    html += '</div>';

    if (ranking.length === 0) {
        html += '<div class="ranking-empty">';
        html += '<p>Nenhum gol registrado neste período.</p>';
        if (ehAdmin) {
            html += '<button class="btn-primary btn-compact" style="margin-top:12px;" onclick="abrirModalLancarGols()">+ Registrar primeira rodada</button>';
        }
        html += '</div>';
    } else {
        // PÓDIO TOP 3
        html += '<div class="podio-container">';

        // 2º Lugar
        if (ranking[1]) {
            html += '<div class="podio-item podio-2">';
            html += '<div class="podio-medalha">🥈</div>';
            html += '<div class="podio-avatar">' + escAttr(ranking[1].nome.substring(0, 2).toUpperCase()) + '</div>';
            html += '<div class="podio-nome">' + escAttr(ranking[1].nome) + '</div>';
            html += '<div class="podio-gols"><strong>' + ranking[1].gols + '</strong> gols</div>';
            html += '<div class="podio-degrau degrau-2">2º</div>';
            html += '</div>';
        } else {
            html += '<div class="podio-item podio-vazio"></div>';
        }

        // 1º Lugar (Ouro - Centro)
        if (ranking[0]) {
            html += '<div class="podio-item podio-1">';
            html += '<div class="podio-coroa">👑</div>';
            html += '<div class="podio-medalha">🥇</div>';
            html += '<div class="podio-avatar podio-avatar-ouro">' + escAttr(ranking[0].nome.substring(0, 2).toUpperCase()) + '</div>';
            html += '<div class="podio-nome"><strong>' + escAttr(ranking[0].nome) + '</strong></div>';
            html += '<div class="podio-gols"><strong class="gols-destaque">' + ranking[0].gols + '</strong> gols</div>';
            html += '<div class="podio-degrau degrau-1">1º</div>';
            html += '</div>';
        }

        // 3º Lugar
        if (ranking[2]) {
            html += '<div class="podio-item podio-3">';
            html += '<div class="podio-medalha">🥉</div>';
            html += '<div class="podio-avatar">' + escAttr(ranking[2].nome.substring(0, 2).toUpperCase()) + '</div>';
            html += '<div class="podio-nome">' + escAttr(ranking[2].nome) + '</div>';
            html += '<div class="podio-gols"><strong>' + ranking[2].gols + '</strong> gols</div>';
            html += '<div class="podio-degrau degrau-3">3º</div>';
            html += '</div>';
        } else {
            html += '<div class="podio-item podio-vazio"></div>';
        }

        html += '</div>'; // fim podio-container

        // TABELA COMPLETA DE ARTILHEIROS
        html += '<div class="ranking-tabela-card">';
        html += '<table class="ranking-tabela">';
        html += '<thead><tr><th style="width:40px;">#</th><th>Jogador</th><th style="text-align:center;">Jogos c/ gol</th><th style="text-align:right;">Gols</th></tr></thead>';
        html += '<tbody>';
        ranking.forEach(function(item, idx) {
            var pos = idx + 1;
            var posBadge = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos + 'º';
            var destaqueLinha = pos <= 3 ? 'linha-destaque' : '';
            html += '<tr class="' + destaqueLinha + '">';
            html += '<td class="col-pos">' + posBadge + '</td>';
            html += '<td class="col-nome"><strong>' + escAttr(item.nome) + '</strong>';
            if (item.menina) html += ' <em class="tag-menina">mulher</em>';
            if (item.goleiro) html += ' <span style="font-size:11px;">🧤</span>';
            html += '</td>';
            html += '<td class="col-jogos" style="text-align:center;">' + item.rodadasComGol + '</td>';
            html += '<td class="col-gols" style="text-align:right;"><span class="badge-gols">' + item.gols + '</span></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '</div>'; // fim ranking-tabela-card
    }

    var agora = new Date();
    var dataHora = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    html += '<div class="ranking-footer"><span>Atualizado em ' + dataHora + '</span></div>';
    html += '</div>'; // fim imagemRankingCard

    if (ranking.length > 0) {
        html += '<div style="text-align:center;margin:16px 0;">';
        html += '<button class="btn-success" onclick="compartilharRankingImagem()">📸 Compartilhar Imagem da Artilharia</button>';
        html += '</div>';
    }

    container.innerHTML = html;
}

// Modal de Lançamento de Gols
export function abrirModalLancarGols() {
    if (!state.AUTH.user || !state.grupoAtual) {
        alert('Entre na sua conta de organizador para registrar gols.');
        return;
    }
    var modal = document.getElementById('playerModal');
    if (!modal) return;

    var hoje = new Date().toISOString().substring(0, 10);
    var jogadoresOrdenados = (state.jogadores || []).slice().sort(function(a, b) {
        return a.nome.localeCompare(b.nome);
    });

    var html = '<div class="player-modal-overlay" onclick="if(event.target===this)fecharModalLancarGols()">';
    html += '<div class="player-modal modal-lancar-gols">';
    html += '<div class="modal-header-lancar">';
    html += '<h3>⚽ Registrar Gols da Rodada</h3>';
    html += '<button class="btn-fechar-modal" onclick="fecharModalLancarGols()">×</button>';
    html += '</div>';

    html += '<div class="form-row" style="margin-bottom:12px;">';
    html += '<div class="form-group" style="flex:1;">';
    html += '<label for="rodadaData">Data da partida</label>';
    html += '<input type="date" id="rodadaData" value="' + hoje + '">';
    html += '</div>';
    html += '<div class="form-group" style="flex:2;">';
    html += '<label for="rodadaObs">Observação (opcional)</label>';
    html += '<input type="text" id="rodadaObs" placeholder="Ex: Pelada de Quarta" autocomplete="off">';
    html += '</div>';
    html += '</div>';

    html += '<div class="lancar-atalhos">';
    html += '<button type="button" class="btn-secondary btn-compact" onclick="importarPresentesNaRodada()">Importar presentes de hoje</button>';
    html += '<input type="text" id="filtroJogadoresLancar" class="input-busca-gols" placeholder="Buscar jogador..." oninput="filtrarJogadoresModal(this.value)">';
    html += '</div>';

    html += '<div class="lista-gols-inputs" id="listaGolsInputs">';
    jogadoresOrdenados.forEach(function(j) {
        html += '<div class="item-gol-jogador" data-id="' + j.id + '" data-nome="' + escAttr(j.nome.toLowerCase()) + '">';
        html += '<div class="item-gol-info">';
        html += '<strong>' + escAttr(j.nome) + '</strong>';
        if (j.goleiro) html += ' <small>(Goleiro)</small>';
        html += '</div>';
        html += '<div class="item-gol-contador">';
        html += '<button type="button" class="btn-contador" onclick="ajustarGol(' + j.id + ', -1)">−</button>';
        html += '<input type="number" id="golInput_' + j.id + '" min="0" max="99" value="0" class="input-gols-val" onchange="validarInputGol(this)">';
        html += '<button type="button" class="btn-contador" onclick="ajustarGol(' + j.id + ', 1)">+</button>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div>'; // fim lista-gols-inputs

    html += '<div class="modal-footer-lancar">';
    html += '<button type="button" class="btn-secondary" onclick="fecharModalLancarGols()">Cancelar</button>';
    html += '<button type="button" class="btn-primary" id="btnSalvarGols" onclick="salvarGolsRodada()">Salvar Rodada</button>';
    html += '</div>';

    html += '</div></div>';
    modal.innerHTML = html;
}

export function fecharModalLancarGols() {
    var modal = document.getElementById('playerModal');
    if (modal) modal.innerHTML = '';
}

export function ajustarGol(jogadorId, delta) {
    var input = document.getElementById('golInput_' + jogadorId);
    if (!input) return;
    var val = parseInt(input.value || '0', 10);
    val = Math.max(0, val + delta);
    input.value = val;
    var container = input.closest('.item-gol-jogador');
    if (container) {
        if (val > 0) container.classList.add('com-gol');
        else container.classList.remove('com-gol');
    }
}

export function validarInputGol(input) {
    var val = parseInt(input.value || '0', 10);
    if (isNaN(val) || val < 0) val = 0;
    input.value = val;
    var container = input.closest('.item-gol-jogador');
    if (container) {
        if (val > 0) container.classList.add('com-gol');
        else container.classList.remove('com-gol');
    }
}

export function filtrarJogadoresModal(termo) {
    var t = (termo || '').toLowerCase().trim();
    var itens = document.querySelectorAll('#listaGolsInputs .item-gol-jogador');
    itens.forEach(function(item) {
        var nome = item.dataset.nome || '';
        item.style.display = nome.indexOf(t) >= 0 ? 'flex' : 'none';
    });
}

export function importarPresentesNaRodada() {
    var presentesIds = (state.jogadores || []).filter(function(j) { return j.presente; }).map(function(j) { return j.id; });
    if (presentesIds.length === 0) {
        alert('Nenhum jogador está marcado como presente no sorteador.');
        return;
    }
    var itens = document.querySelectorAll('#listaGolsInputs .item-gol-jogador');
    itens.forEach(function(item) {
        var id = parseInt(item.dataset.id, 10);
        if (presentesIds.indexOf(id) >= 0) {
            item.style.order = '-1';
            item.classList.add('item-destaque-presente');
        } else {
            item.style.order = '1';
            item.classList.remove('item-destaque-presente');
        }
    });
}

export function salvarGolsRodada() {
    if (!state.AUTH.user || !state.grupoAtual) { alert('Acesso negado.'); return; }
    var dataInput = document.getElementById('rodadaData');
    var obsInput = document.getElementById('rodadaObs');
    var btn = document.getElementById('btnSalvarGols');

    var dataVal = dataInput ? dataInput.value : '';
    var obsVal = obsInput ? obsInput.value.trim() : '';

    if (!dataVal) { alert('Informe a data da partida.'); return; }

    var golsPorJogador = [];
    var inputs = document.querySelectorAll('#listaGolsInputs .input-gols-val');
    inputs.forEach(function(inp) {
        var idStr = inp.id.replace('golInput_', '');
        var qtd = parseInt(inp.value || '0', 10);
        if (qtd > 0) {
            golsPorJogador.push({ jogador_id: parseInt(idStr, 10), gols: qtd });
        }
    });

    if (golsPorJogador.length === 0) {
        if (!confirm('Nenhum gol foi marcado nesta rodada (0 a 0). Deseja salvar mesmo assim?')) {
            return;
        }
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
    }

    // 1. Inserir a rodada
    supabaseClient.from('rodadas').insert({
        grupo_id: state.grupoAtual.id,
        data: dataVal,
        observacao: obsVal || null,
        created_by: state.AUTH.user.id
    }).select().then(function(resRodada) {
        if (resRodada.error) throw resRodada.error;
        var novaRodada = resRodada.data[0];

        if (golsPorJogador.length === 0) {
            fecharModalLancarGols();
            carregarDadosArtilharia(state.grupoAtual.id);
            return;
        }

        // 2. Inserir os gols associados
        var payloadGols = golsPorJogador.map(function(item) {
            return {
                rodada_id: novaRodada.id,
                jogador_id: item.jogador_id,
                gols: item.gols
            };
        });

        return supabaseClient.from('gols_rodada').insert(payloadGols).then(function(resGols) {
            if (resGols.error) throw resGols.error;
            fecharModalLancarGols();
            carregarDadosArtilharia(state.grupoAtual.id);
        });
    }).catch(function(err) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Salvar Rodada';
        }
        alert('Erro ao salvar rodada: ' + err.message);
    });
}

// Histórico de Rodadas
export function abrirHistoricoRodadas() {
    var modal = document.getElementById('playerModal');
    if (!modal) return;

    var html = '<div class="player-modal-overlay" onclick="if(event.target===this)fecharModalHistorico()">';
    html += '<div class="player-modal modal-historico-rodadas">';
    html += '<div class="modal-header-lancar">';
    html += '<h3>📋 Histórico de Rodadas</h3>';
    html += '<button class="btn-fechar-modal" onclick="fecharModalHistorico()">×</button>';
    html += '</div>';

    if (artilhariaState.rodadas.length === 0) {
        html += '<p class="login-hint" style="padding:24px 0;text-align:center;">Nenhuma rodada cadastrada.</p>';
    } else {
        html += '<div class="lista-historico">';
        artilhariaState.rodadas.forEach(function(r) {
            var dataFormatada = r.data ? r.data.split('-').reverse().join('/') : 'Data não informada';
            var golsDaRodada = artilhariaState.gols.filter(function(g) { return g.rodada_id === r.id; });
            var totalGols = golsDaRodada.reduce(function(acc, item) { return acc + item.gols; }, 0);

            html += '<div class="item-historico-rodada">';
            html += '<div class="hist-info">';
            html += '<strong>📅 ' + dataFormatada + '</strong>';
            if (r.observacao) html += ' <span class="hist-obs">(' + escAttr(r.observacao) + ')</span>';
            html += '<div class="hist-sub">Total de gols: <strong>' + totalGols + '</strong> · ' + golsDaRodada.length + ' atleta(s) marcaram</div>';
            html += '</div>';
            html += '<div class="hist-acoes">';
            html += '<button class="btn-mini btn-mini-danger" onclick="excluirRodada(\'' + r.id + '\')">Excluir</button>';
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '<div class="modal-footer-lancar">';
    html += '<button type="button" class="btn-secondary" onclick="fecharModalHistorico()">Fechar</button>';
    html += '</div>';
    html += '</div></div>';

    modal.innerHTML = html;
}

export function fecharModalHistorico() {
    var modal = document.getElementById('playerModal');
    if (modal) modal.innerHTML = '';
}

export function excluirRodada(rodadaId) {
    if (!state.AUTH.user || !state.grupoAtual) { alert('Acesso negado.'); return; }
    if (!confirm('Excluir esta rodada e todos os seus gols registrados? Não pode ser desfeita.')) return;

    supabaseClient.from('rodadas').delete().eq('id', rodadaId).then(function(res) {
        if (res.error) throw res.error;
        carregarDadosArtilharia(state.grupoAtual.id).then(function() {
            abrirHistoricoRodadas();
        });
    }).catch(function(err) {
        alert('Erro ao excluir rodada: ' + err.message);
    });
}

// Compartilhamento via Imagem
export function compartilharRankingImagem() {
    var el = document.getElementById('imagemRankingCard');
    if (!el) return;

    var originalFont = el.style.fontFamily;
    el.style.fontFamily = 'Arial, Helvetica, sans-serif';

    document.fonts.ready.then(function() {
        var h2c = window.html2canvas || html2canvas;
        h2c(el, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' }).then(function(canvas) {
            el.style.fontFamily = originalFont;
            canvas.toBlob(function(blob) {
                var agora = new Date();
                var pad = function(n) { return (n < 10 ? '0' : '') + n; };
                var stamp = agora.getFullYear() + pad(agora.getMonth() + 1) + pad(agora.getDate()) + '-' + pad(agora.getHours()) + pad(agora.getMinutes());
                var file = new File([blob], 'artilharia-' + stamp + '.png', { type: 'image/png' });
                var grupoNome = (state.grupoAtual && state.grupoAtual.nome) || 'Sorteador de Times';
                if (navigator.share) {
                    navigator.share({
                        title: 'Artilharia - ' + grupoNome,
                        text: 'Ranking de Artilheiros (' + getLabelPeriodo(artilhariaState.chavePeriodo, artilhariaState.tipoPeriodo) + ')',
                        files: [file]
                    });
                } else {
                    alert('Compartilhamento direto não suportado. A imagem foi aberta em nova aba.');
                    var url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                }
            });
        });
    });
}
