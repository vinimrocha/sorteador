/**
 * BOLEIROS DE CRISTO
 * app.js - Versao Supabase (multi-grupo) com autenticacao
 *
 * CONFIGURACAO: Preencha as constantes abaixo com seus dados do Supabase
 */

// supabaseClient ja esta disponivel via auth.js
const supabaseClient = window.supabaseClient;

// =========================
// ESTADO GLOBAL
// =========================

let jogadores = [];
let grupoAtual = { id: null, nome: '', slug: '' };
let meusGrupos = [];

// =========================
// ELEMENTOS
// =========================

const listaEl = document.getElementById("listaJogadores");
const btnSortear = document.getElementById("btnSortear");
const btnResortear = document.getElementById("btnResortear");
const btnCompartilhar = document.getElementById("btnCompartilhar");
const btnDesmarcar = document.getElementById("btnDesmarcar");
const btnAdicionar = document.getElementById("btnAdicionar");
const contadorSelecionados = document.getElementById("contadorSelecionados");
const resultadoEl = document.getElementById("resultado");
const nomeGrupoEl = document.getElementById("nomeGrupo");
const logoGrupoEl = document.getElementById("logoGrupo");

// =========================
// INICIALIZACAO
// =========================

document.addEventListener("DOMContentLoaded", async () => {
    await initAuth();
    bindEventos();

    if (AUTH.user) {
        await carregarMeusGrupos();
        const slug = getSlugFromURL();
        carregarGrupo(slug);
    } else {
        renderLoginScreen();
    }
});

// =========================
// OBTER SLUG DA URL
// =========================

function getSlugFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('g') || 'boleiros-de-cristo';
}

// =========================
// CARREGAR MEUS GRUPOS
// =========================

async function carregarMeusGrupos() {
    if (!AUTH.user) return;

    try {
        const { data: groups, error } = await supabaseClient
            .from('usuarios_grupo')
            .select('grupo_id, grupo(nome, slug, logo_url), role')
            .eq('user_id', AUTH.user.id)
            .order('created_at', { ascending: false });

        if (!error && groups) {
            meusGrupos = groups.map(g => ({
                id: g.grupo_id,
                nome: g.grupo.nome,
                slug: g.grupo.slug,
                logo_url: g.grupo.logo_url,
                role: g.role
            }));
            renderGroupSelector();
        }
    } catch (err) {
        console.error('Erro ao carregar grupos:', err);
    }
}

// =========================
// SELETOR DE GRUPO
// =========================

function renderGroupSelector() {
    let container = document.getElementById('groupSelector');
    if (!container && meusGrupos.length > 0) {
        container = document.createElement('div');
        container.id = 'groupSelector';
        container.className = 'group-selector';
        const header = document.querySelector('.header');
        if (header) header.appendChild(container);
    }
    if (!container) return;

    if (meusGrupos.length <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <select id="grupoSelect" onchange="mudarGrupo(this.value)">
            ${meusGrupos.map(g => `<option value="${g.slug}" ${g.slug === grupoAtual.slug ? 'selected' : ''}>${g.nome}</option>`).join('\n')}
        </select>
    `;
}

async function mudarGrupo(slug) {
    await carregarGrupo(slug);
}

// =========================
// CARREGAR GRUPO
// =========================

async function carregarGrupo(slug) {
    try {
        const { data: grupo, error: grupoErr } = await supabaseClient
            .from('grupos')
            .select('id, nome, slug, logo_url')
            .eq('slug', slug)
            .single();

        if (grupoErr || !grupo) {
            alert('Grupo nao encontrado: ' + slug);
            return;
        }

        // Verificar se usuario eh admin deste grupo
        const isAdmin = await isAdminOfGroup(grupo.id);
        if (!isAdmin && AUTH.user) {
            alert('Voce nao tem permissao de administrador neste grupo.');
            return;
        }

        grupoAtual = grupo;

        if (nomeGrupoEl) nomeGrupoEl.textContent = grupo.nome;
        if (logoGrupoEl && grupo.logo_url) logoGrupoEl.src = grupo.logo_url;
        document.title = grupo.nome + ' - Sorteador de Times';

        await carregarJogadores(grupo.id);

    } catch (err) {
        console.error('Erro ao carregar grupo:', err);
        alert('Erro ao conectar com o servidor.');
    }
}

// =========================
// CARREGAR JOGADORES
// =========================

async function carregarJogadores(grupoId) {
    try {
        const { data, error } = await supabaseClient
            .from('jogadores')
            .select('*')
            .eq('grupo_id', grupoId)
            .eq('ativo', true)
            .order('nome');

        if (error) throw error;

        jogadores = data.map(j => ({ ...j, presente: false }));
        renderLista();

    } catch (err) {
        console.error('Erro ao carregar jogadores:', err);
        alert('Erro ao carregar jogadores do grupo.');
    }
}

// =========================
// RENDER LISTA
// =========================

function renderLista() {
    listaEl.innerHTML = "";

    jogadores.forEach((j, index) => {
        const div = document.createElement("div");
        div.className = "jogador";

        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.index = index;
        checkbox.checked = j.presente;

        if (j.presente) {
            checkbox.setAttribute('checked', 'checked');
        }

        const infoDiv = document.createElement("div");
        infoDiv.className = "jogador-info";

        const strong = document.createElement("strong");
        strong.textContent = j.nome;

        const metaDiv = document.createElement("div");
        metaDiv.className = "jogador-meta";

        if (j.goleiro) {
            metaDiv.textContent = "🥅 Goleiro";
        } else {
            metaDiv.textContent = `⭐ ${j.categoria.toFixed(1)}`;
        }

        if (j.menina) {
            const meninaSpan = document.createElement("em");
            meninaSpan.className = "tag-menina";
            meninaSpan.textContent = " menina";
            metaDiv.appendChild(meninaSpan);
        }

        if (j.convidado) {
            const convidadoSpan = document.createElement("em");
            convidadoSpan.className = "tag-convidado";
            convidadoSpan.textContent = " convidado";
            metaDiv.appendChild(convidadoSpan);
        }

        infoDiv.appendChild(strong);
        infoDiv.appendChild(metaDiv);
        label.appendChild(checkbox);
        label.appendChild(infoDiv);
        div.appendChild(label);
        listaEl.appendChild(div);

        checkbox.addEventListener("change", function() {
            jogadores[idx] = jogadores[idx] || {};
            const idx = parseInt(this.dataset.index);
            jogadores[idx].presente = this.checked;
            atualizarContador();
        });
    });

    atualizarContador();
}

// =========================
// PEGAR PRESENTES
// =========================

function getPresentes() {
    const linhas = jogadores.filter(j => j.presente && !j.goleiro);
    const goleiros = jogadores.filter(j => j.presente && j.goleiro);
    return { linhas, goleiros };
}

// =========================
// SORTER
// =========================

function timeComMenina(time) {
    return time.jogadores.some(j => j.menina);
}

function candidatosParaJogador(times, jogador, porTime) {
    return times
        .filter(t => {
            if (jogador.menina && timeComMenina(t)) return false;
            return t.jogadores.length < porTime;
        })
        .sort((a, b) => a.forca - b.forca);
}

function candidatosOverflow(times, jogador) {
    return times
        .filter(t => !jogador.menina || !timeComMenina(t))
        .sort((a, b) => a.forca - b.forca);
}

function sortearTimes(linhas, goleiros, porTime) {
    const total = linhas.length + goleiros.length;
    const qtdTimes = Math.ceil(total / porTime);

    if (qtdTimes < 1) { alert("É necessário ter pelo menos 1 jogador para sortear"); return null; }
    if (qtdTimes === 1 && total < 2) { alert("É necessário ter pelo menos 2 jogadores para sortear"); return null; }

    const meninasPresentes = linhas.filter(j => j.menina);
    if (meninasPresentes.length > qtdTimes) {
        alert(`Há ${meninasPresentes.length} meninas presentes, mas só ${qtdTimes} time(s). Não é possível colocá-las em times separados.`);
        return null;
    }

    const times = [];
    for (let i = 0; i < qtdTimes; i++) {
        times.push({ nome: `Time ${i + 1}`, jogadores: [], forca: 0 });
    }

    goleiros.forEach((g, i) => { const timeIndex = i % times.length; times[timeIndex].jogadores.push(g); });

    const ordenados = [...linhas]
        .sort(() => Math.random() - 0.5)
        .sort((a, b) => b.categoria - a.categoria);

    for (const j of ordenados) {
        const candidatos = candidatosParaJogador(times, j, porTime);
        if (candidatos.length > 0) {
            candidatos[0].jogadores.push(j);
            candidatos[0].forca += j.categoria;
            continue;
        }
        const overflow = candidatosOverflow(times, j);
        if (overflow.length === 0) {
            alert(`Não foi possível separar ${j.nome} das outras meninas em times diferentes.`);
            return null;
        }
        overflow[0].jogadores.push(j);
        overflow[0].forca += j.categoria;
    }

    reordenarTimes(times);
    return times;
}

function reordenarTimes(times) {
    times.sort((a, b) => b.jogadores.length - a.jogadores.length);
    times.forEach((t, index) => { t.nome = `Time ${index + 1}`; });
    return times;
}

// =========================
// RENDER RESULTADO
// =========================

function renderResultado(times) {
    resultadoEl.innerHTML = "";

    const imagemContainer = document.createElement("div");
    imagemContainer.id = "imagemResultado";

    const header = document.createElement("div");
    header.className = "resultado-header";
    header.innerHTML = `
        <img src="${grupoAtual.logo_url || 'logo-boleiros.png'}" alt="${grupoAtual.nome}" class="resultado-logo" width="56" height="56">
        <div class="resultado-header-text"><h1>${grupoAtual.nome}</h1></div>
    `;
    imagemContainer.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "times-grid";
    times.forEach(t => {
        const div = document.createElement("div");
        div.className = "time";
        let html = `<h3>⚽ ${t.nome}</h3>`;
        t.jogadores.forEach(j => {
            html += j.goleiro ? `<div class="goleiro">🥅 ${j.nome}</div>` : `<div>${j.nome}</div>`;
        });
        div.innerHTML = html;
        grid.appendChild(div);
    });
    imagemContainer.appendChild(grid);

    const footer = document.createElement("div");
    footer.className = "resultado-footer";
    footer.innerHTML = `<span>${new Date().toLocaleDateString('pt-BR')}</span>`;
    imagemContainer.appendChild(footer);

    resultadoEl.appendChild(imagemContainer);
}

// =========================
// PEGAR CONFIG
// =========================

function getPorTime() {
    const el = document.querySelector('input[name="jogadoresPorTime"]:checked');
    return el ? Number(el.value) : 6;
}

// =========================
// SORTEAR
// =========================

function realizarSorteio() {
    const { linhas, goleiros } = getPresentes();
    const porTime = getPorTime();
    const times = sortearTimes(linhas, goleiros, porTime);
    if (!times) return;
    renderResultado(times);
    btnResortear.style.display = "block";
    btnCompartilhar.style.display = "block";
    window.timesAtuais = times;
    document.getElementById("resultadoContainer")
        .scrollIntoView({ behavior: "smooth", block: "start" });
}

// =========================
// ADICIONAR CONVIDADO (PROTEGIDO)
// =========================

function adicionarConvidado() {
    if (!AUTH.user) {
        alert('Voce precisa estar logado para adicionar convidados.');
        return;
    }

    const nome = document.getElementById("convidadoNome").value.trim();
    const tipo = document.getElementById("convidadoTipo").value;
    const categoria = parseFloat(document.getElementById("convidadoCategoria").value);
    if (!nome) { alert("Informe o nome do convidado."); return; }

    const menina = document.getElementById("convidadoMenina").checked;

    const novoJogador = {
        nome, categoria, goleiro: tipo === "goleiro",
        presente: true, convidado: true, menina, grupo_id: grupoAtual.id
    };

    salvarJogadorNoSupabase(novoJogador);
}

async function salvarJogadorNoSupabase(jogador) {
    if (!AUTH.user) {
        alert('Acesso negado. Faça login.');
        return;
    }

    const isAdmin = await isAdminOfGroup(jogador.grupo_id);
    if (!isAdmin) {
        alert('Voce nao tem permissao para adicionar jogadores neste grupo.');
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('jogadores')
            .insert(jogador)
            .select()
            .single();

        if (error) throw error;

        jogador.id = data.id;
        jogadores.push(jogador);
        renderLista();
        document.getElementById("convidadoNome").value = "";
        document.getElementById("convidadoMenina").checked = false;
    } catch (err) {
        console.error('Erro ao salvar convidado:', err);
        alert('Erro ao salvar convidado: ' + (err.message || 'Erro desconhecido'));
    }
}

// =========================
// DESMARCAR
// =========================

function desmarcarTodos() {
    jogadores.forEach(j => { j.presente = false; });
    document.querySelectorAll("input[type=checkbox]")
        .forEach(cb => cb.checked = false);
    atualizarContador();
}

// =========================
// CONTADOR
// =========================

function atualizarContador() {
    const total = jogadores.filter(j => j.presente).length;
    contadorSelecionados.textContent = `${total} selecionado${total !== 1 ? "s" : ""}`;
}

// =========================
// COMPARTILHAR
// =========================

async function compartilharImagem() {
    const el = document.getElementById("imagemResultado");
    if (!el) return;
    const fontOriginal = el.style.fontFamily;
    el.style.fontFamily = "Arial, Helvetica, sans-serif";

    await document.fonts.ready;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#f4f4f4" });
    el.style.fontFamily = fontOriginal;

    canvas.toBlob(async blob => {
        const file = new File([blob], "times.png", { type: "image/png" });
        if (navigator.share) {
            await navigator.share({ title: grupoAtual.nome, text: "Times da pelada", files: [file] });
        } else {
            alert("Compartilhamento não suportado neste dispositivo.");
        }
    });
}

// =========================
// EVENTOS
// =========================

function bindEventos() {
    btnSortear.addEventListener("click", realizarSorteio);
    btnResortear.addEventListener("click", realizarSorteio);
    btnCompartilhar.addEventListener("click", compartilharImagem);
    btnDesmarcar.addEventListener("click", desmarcarTodos);
    btnAdicionar.addEventListener("click", adicionarConvidado);
}
