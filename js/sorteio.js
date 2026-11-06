/* Algoritmo de Sorteio, Balanceamento e Compartilhamento de Times */
import { state } from './state.js';
import { SYSTEM_LOGO } from './config.js';

export function getPresentes() {
    var linhas = state.jogadores.filter(function(j) { return j.presente && !j.goleiro; });
    var goleiros = state.jogadores.filter(function(j) { return j.presente && j.goleiro; });
    return { linhas: linhas, goleiros: goleiros };
}

export function timeComMenina(time) {
    return time.jogadores.some(function(j) { return j.menina; });
}

export function sortearTimes(linhas, goleiros, porTime) {
    var total = linhas.length + goleiros.length;
    var qtdTimes = Math.ceil(total / porTime);
    if (qtdTimes < 1) { alert('É necessário pelo menos 1 jogador'); return null; }
    if (qtdTimes === 1 && total < 2) { alert('É necessário pelo menos 2 jogadores'); return null; }
    var meninasPresentes = linhas.filter(function(j) { return j.menina; });
    if (meninasPresentes.length > qtdTimes) { alert('Há ' + meninasPresentes.length + ' mulheres e apenas ' + qtdTimes + ' time(s).'); return null; }
    var times = [];
    for (var i = 0; i < qtdTimes; i++) { times.push({ nome: 'Time ' + (i + 1), jogadores: [], forca: 0 }); }
    goleiros.forEach(function(g, i) { times[i % times.length].jogadores.push(g); });
    var ordenados = linhas.slice().sort(function() { return Math.random() - 0.5; }).sort(function(a, b) { return b.categoria - a.categoria; });
    for (var j = 0; j < ordenados.length; j++) {
        var jogador = ordenados[j];
        var candidatos = times.filter(function(t) { if (jogador.menina && timeComMenina(t)) return false; return t.jogadores.length < porTime; }).sort(function(a, b) { return a.forca - b.forca; });
        if (candidatos.length > 0) { candidatos[0].jogadores.push(jogador); candidatos[0].forca += jogador.categoria; continue; }
        var overflow = times.filter(function(t) { return !jogador.menina || !timeComMenina(t); }).sort(function(a, b) { return a.forca - b.forca; });
        if (overflow.length === 0) { alert('Não foi possível separar ' + jogador.nome); return null; }
        overflow[0].jogadores.push(jogador); overflow[0].forca += jogador.categoria;
    }
    times.sort(function(a, b) { return b.jogadores.length - a.jogadores.length; });
    times.forEach(function(t, idx) { t.nome = 'Time ' + (idx + 1); });
    return times;
}

export function renderResultado(times) {
    var resultadoEl = document.getElementById('resultado');
    if (!resultadoEl) return;
    resultadoEl.innerHTML = '';
    var imagemContainer = document.createElement('div');
    imagemContainer.id = 'imagemResultado';
    var header = document.createElement('div');
    header.className = 'resultado-header';
    var logo = (state.grupoAtual && state.grupoAtual.logo_url) || SYSTEM_LOGO;
    var nomeGrupo = (state.grupoAtual && state.grupoAtual.nome) || 'Sorteador de Times';
    header.innerHTML = '<img src="' + logo + '" alt="' + nomeGrupo + '" class="resultado-logo" width="56" height="56"><div class="resultado-header-text"><h1>' + nomeGrupo + '</h1></div>';
    imagemContainer.appendChild(header);
    var grid = document.createElement('div');
    grid.className = 'times-grid';
    times.forEach(function(t) {
        var div = document.createElement('div');
        div.className = 'time';
        var html = '<h3>' + t.nome + '</h3>';
        t.jogadores.forEach(function(j) {
            if (j.goleiro) html += '<div class="goleiro">🧤 <strong><em>' + j.nome + '</em></strong></div>';
            else if (j.menina) html += '<div class="menina">🌸 <strong><em>' + j.nome + '</em></strong></div>';
            else html += '<div>' + j.nome + '</div>';
        });
        div.innerHTML = html;
        grid.appendChild(div);
    });
    imagemContainer.appendChild(grid);
    var footer = document.createElement('div');
    footer.className = 'resultado-footer';
    var agora = new Date();
    var dataHora = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    footer.innerHTML = '<span>' + dataHora + '</span>';
    imagemContainer.appendChild(footer);
    resultadoEl.appendChild(imagemContainer);
}

export function getPorTime() {
    var el = document.querySelector('input[name="jogadoresPorTime"]:checked');
    return el ? Number(el.value) : 6;
}

export function realizarSorteio() {
    var p = getPresentes();
    var t = sortearTimes(p.linhas, p.goleiros, getPorTime());
    if (!t) return;
    renderResultado(t);
    var btnR = document.getElementById('btnResortear');
    var btnC = document.getElementById('btnCompartilhar');
    if (btnR) btnR.style.display = 'block';
    if (btnC) btnC.style.display = 'block';
    state.timesAtuais = t;
    if (typeof window !== 'undefined') window.timesAtuais = t;
    document.getElementById('resultadoContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function compartilharImagem() {
    var el = document.getElementById('imagemResultado');
    if (!el) return;
    var originalFont = el.style.fontFamily;
    el.style.fontFamily = 'Arial, Helvetica, sans-serif';
    document.fonts.ready.then(function() {
        var h2c = window.html2canvas || html2canvas;
        h2c(el, { scale: 2, useCORS: true, backgroundColor: '#f4f4f4' }).then(function(canvas) {
            el.style.fontFamily = originalFont;
            canvas.toBlob(function(blob) {
                var agora = new Date();
                var pad = function(n) { return (n < 10 ? '0' : '') + n; };
                var stamp = agora.getFullYear() + pad(agora.getMonth() + 1) + pad(agora.getDate()) + '-' + pad(agora.getHours()) + pad(agora.getMinutes());
                var file = new File([blob], 'times-' + stamp + '.png', { type: 'image/png' });
                var titulo = (state.grupoAtual && state.grupoAtual.nome) || 'Sorteador de Times';
                if (navigator.share) { navigator.share({ title: titulo, text: 'Times da pelada', files: [file] }); }
                else { alert('Compartilhamento não suportado neste navegador.'); }
            });
        });
    });
}
