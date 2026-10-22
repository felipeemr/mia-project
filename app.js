/* ==========================================================================
   MERAKI ARTES DIGITAIS - PRODUCTION APP LOGIC
   Direct responsive site navigation without simulator frame
   ========================================================================== */

/* ==========================================================================
   FASE 2 — CAMADA DE API (Backend Real)
   - Quando o backend estiver rodando em localhost:3001, usa a API real.
   - Se o backend estiver offline, cai automaticamente no modo mock (Fase 1).
   - Toda a lógica de UI permanece INTACTA — apenas os dados mudam.
   ========================================================================== */

const API_BASE = (window.location.port === '3001' || window.location.origin.includes('3001'))
    ? `${window.location.origin}/api`
    : 'http://localhost:3001/api';

let _authToken = localStorage.getItem('meraki_auth_token') || null;

async function apiCall(method, endpoint, data = null) {
    try {
        const opts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(_authToken ? { 'Authorization': `Bearer ${_authToken}` } : {}),
            },
        };
        if (data && method !== 'GET') opts.body = JSON.stringify(data);
        const res = await fetch(`${API_BASE}${endpoint}`, opts);
        if (!res.ok) return null;
        return await res.json();
    } catch (_) { return null; }
}

async function apiLogin(email, password) {
    const result = await apiCall('POST', '/auth/login', { email, password });
    if (result?.token) {
        _authToken = result.token;
        localStorage.setItem('meraki_auth_token', _authToken);
        appState.currentUser.type            = result.user.userType || 'pro';
        appState.currentUser.name            = result.user.name || email;
        appState.currentUser.proDailyCount   = result.user.dailyCount   || 0;
        appState.currentUser.proMonthlyCount = result.user.monthlyCount || 0;
        saveStateToStorage();
        return result;
    }
    return null;
}

async function apiLogout() {
    await apiCall('POST', '/auth/logout');
    _authToken = null;
    localStorage.removeItem('meraki_auth_token');
}

let selectedPhotosFiles = [];
let selectedRefFiles    = [];

function handleUserPhotosSelected(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    selectedPhotosFiles = [files[0]]; // apenas 1 foto: a nova substitui a anterior
    event.target.value = '';
    renderPhotoPreviews();
}

function handleUserRefSelected(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    selectedRefFiles = selectedRefFiles.concat(files);
    renderRefPreviews();
}

function renderPhotoPreviews() {
    const container = document.getElementById('user-photos-thumbs');
    if (!container) return;
    container.querySelectorAll('.thumb-avatar-circle').forEach(el => el.remove());
    const addBtn = document.getElementById('user-photo-add-btn');
    if (addBtn) addBtn.style.display = selectedPhotosFiles.length ? 'none' : '';

    selectedPhotosFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'thumb-avatar-circle';
        div.style.position = 'relative';
        div.innerHTML = `<img src="${url}" alt="Foto ${idx+1}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"><span style="position:absolute;top:-4px;right:-4px;background:#ff4d4d;color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;z-index:2;" onclick="removePhoto(${idx})">×</span>`;
        container.insertBefore(div, container.firstChild);
    });
}

function renderRefPreviews() {
    const container = document.getElementById('user-ref-thumbs');
    if (!container) return;
    container.querySelectorAll('.thumb-inspiration-square').forEach(el => el.remove());

    selectedRefFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'thumb-inspiration-square';
        div.style.position = 'relative';
        div.innerHTML = `<img src="${url}" alt="Ref ${idx+1}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"><span style="position:absolute;top:-4px;right:-4px;background:#ff4d4d;color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;z-index:2;" onclick="removeRef(${idx})">×</span>`;
        container.insertBefore(div, container.firstChild);
    });
}

function removePhoto(idx) {
    selectedPhotosFiles.splice(idx, 1);
    renderPhotoPreviews();
}

function removeRef(idx) {
    selectedRefFiles.splice(idx, 1);
    renderRefPreviews();
}

async function apiGenerateKit(projectData) {
    const formData = new FormData();
    Object.entries(projectData).forEach(([k, v]) => {
        if (v !== null && v !== undefined && typeof v !== 'object') formData.append(k, v);
    });

    // Anexa fotos e referências reais selecionadas pelo usuário
    formData.append('email', projectData.email || '');
    selectedPhotosFiles.forEach(file => formData.append('photos', file));
    selectedRefFiles.forEach(file => formData.append('references', file));


    try {
        const res = await fetch(`${API_BASE}/generate`, {
            method:  'POST',
            headers: _authToken ? { 'Authorization': `Bearer ${_authToken}` } : {},
            body:    formData,
            signal:  AbortSignal.timeout(600000), // 10 minutos: convite (até ~5 min no pior caso) + itens do kit (~1,5 min)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Falha desconhecida no servidor.');
        }
        return await res.json();
    } catch (e) { 
        console.warn('[API/Generate]', e.message); 
        throw e; // Lançar o erro para que a interface saiba que falhou
    }
}




/* ========================================================================== */

// 1. STATE MANAGEMENT (Simulated Database & Configurations)
let appState = {
    config: {
        kitPrice: 47.90,
        freeLimits: 2,
        proDailyLimit: 6,
        proMonthlyLimit: 60,
        bypassPayment: false,
        infiniteLimit: false
    },

    currentUser: {
        type: 'client', // 'client' or 'pro'
        name: 'Cliente',
        clientGenerationsCount: 0,
        proDailyCount: 0,
        proMonthlyCount: 0
    },

    currentProject: {},

    projectsDb: []
};

// 2. APP INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();

    // Pagamento e limites são controlados SÓ pelo servidor (o navegador não libera nada)
    appState.config.infiniteLimit = false;
    appState.config.bypassPayment = false;

    updateAdminInputFields();
    updateUIFromState();

    // Setup initial view
    showView('home');

    // Hook up form step toggles
    toggleFormFields();

    // Voltando do pagamento (ou retomando um projeto): ?pago=<id>
    resumeFromUrl();

    // Painel de testes só aparece com ?dev=1 na URL
    if (new URLSearchParams(location.search).get('dev') === '1') {
        const fab = document.getElementById('devFabToggle');
        if (fab) fab.style.display = '';
    }
});

// Save and Load State
function saveStateToStorage() {
    // Ignora imagens embutidas (data URLs) e o kit: são grandes e não precisam ser guardadas
    try {
        const json = JSON.stringify(appState, (k, v) => {
            if (k === 'kit') return undefined;
            if (typeof v === 'string' && v.startsWith('data:') && v.length > 2000) return undefined;
            return v;
        });
        localStorage.setItem('meraki_state_collage_v4', json);
    } catch (e) {
        console.warn('Não foi possível salvar o estado local:', e.message);
    }
}

function loadStateFromStorage() {
    const saved = localStorage.getItem('meraki_state_collage_v4');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            appState.config = { ...appState.config, ...parsed.config };
            appState.currentUser = { ...appState.currentUser, ...parsed.currentUser };
            appState.projectsDb = parsed.projectsDb || appState.projectsDb;
        } catch (e) {
            console.error("Error parsing saved state", e);
        }
    }
}

// Volta ao início com a página recarregada: formulário, foto e kit anterior não ficam na tela
function goHomeFresh() {
    window.location.href = window.location.pathname;
}

// 3. SPA RESPONSIVE ROUTING
function showView(viewId) {
    const views = document.querySelectorAll('.view-page-item');
    views.forEach(v => v.classList.remove('active'));

    if (viewId === 'download') renderDownloads();
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.add('active');
        targetView.scrollIntoView({ behavior: 'smooth' });
    }

    // Update active nav items in desktop header
    document.querySelectorAll('.header-nav-menu a').forEach(a => a.classList.remove('active'));

    const activeLink = Array.from(document.querySelectorAll('.header-nav-menu a')).find(a => {
        return a.getAttribute('onclick')?.includes(viewId);
    });
    if (activeLink) activeLink.classList.add('active');
}

function navTo(viewId) {
    showView(viewId);
}

// Header Navigation Click (Desktop)
function handleMenuClick(event, viewId) {
    if (event) event.preventDefault();

    // Scroll to "Como funciona" directly if we are on landing home page
    if (viewId === 'how-it-works') {
        showView('home');
        setTimeout(() => {
            const anchor = document.getElementById('how-it-works-anchor');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
        }, 100);
        return;
    }

    showView(viewId);
}

// Mobile hamburger toggle actions
function toggleMobileMenu() {
    const dropdown = document.getElementById('mobileNavDropdown');
    dropdown.classList.toggle('open');
}

function handleMobileMenuClick(viewId) {
    toggleMobileMenu();
    showView(viewId);
}

// Floating developer actions panel
function toggleDevPanel() {
    const panel = document.getElementById('devFloatPanel');
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
    }
}

// ---------------------------------------------------------------------------
// Identidade visual da festa (Passo 1): paleta, fontes, logotipo, brasão,
// monograma e papel digital derivados da arte do convite (sem custo de IA).
// ---------------------------------------------------------------------------
function _hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function _luminance(hex) {
    const { r, g, b } = _hexToRgb(hex);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function _contrast(a, b) {
    const la = _luminance(a), lb = _luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Entre as cores candidatas, devolve a que mais contrasta com o fundo (mínimo 3:1; senão a escura)
function _readableColor(candidates, bg, fallback) {
    const ok = candidates.filter(Boolean).map(c => ({ c, r: _contrast(c, bg) })).sort((x, y) => y.r - x.r)[0];
    return ok && ok.r >= 3 ? ok.c : fallback;
}

function _fontStack(f) {
    if (!f) return 'sans-serif';
    const generic = { serif: 'serif', display: 'sans-serif', mono: 'monospace', sans: 'sans-serif' }[f.category] || 'sans-serif';
    return `'${f.family}', ${generic}`;
}

function applyIdentity(identity) {
    if (!identity || !Array.isArray(identity.palette) || identity.palette.length < 5) return;
    const [primary, secondary, accent, light, dark] = identity.palette;
    const fonts = identity.fonts || {};
    const mainStack = _fontStack(fonts.main);
    const compStack = _fontStack(fonts.complementary);

    // 1. Carrega as fontes escolhidas (Google Fonts, licença livre)
    if (fonts.googleFontsUrl) {
        let link = document.getElementById('identity-fonts-link');
        if (!link) {
            link = document.createElement('link');
            link.id = 'identity-fonts-link';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        if (link.href !== fonts.googleFontsUrl) link.href = fonts.googleFontsUrl;
    }

    // 2. Paleta (12)
    const palBox = document.querySelector('.color-palette-show');
    if (palBox && palBox.children.length < identity.palette.length) {
        palBox.innerHTML = identity.palette.map(() => '<span class="pal-dot"></span>').join('');
    }
    const dots = document.querySelectorAll('.color-palette-show .pal-dot');
    dots.forEach((dot, i) => {
        if (!identity.palette[i]) return;
        dot.style.backgroundColor = identity.palette[i];
        dot.style.border = '1px solid rgba(0,0,0,0.12)';
        dot.title = identity.palette[i];
    });
    const hexRow = document.getElementById('palette-hex-row');
    if (hexRow) {
        const names = ['Principal', 'Secundária', 'Destaque', 'Clara', 'Escura'];
        hexRow.innerHTML = identity.palette.map((hex, i) =>
            `<span style="display:inline-block; margin:0 6px; font-size:0.65rem; color:var(--gray-muted);"><strong>${names[i]}</strong><br>${hex}</span>`
        ).join('');
    }

    // 3. Tipografias (14 e 15)
    const mainSpec = document.getElementById('font-main-spec');
    if (mainSpec && fonts.main) {
        mainSpec.style.fontFamily = mainStack;
        mainSpec.style.fontWeight = String(fonts.main.weights?.[fonts.main.weights.length - 1] || 700);
        mainSpec.textContent = `${fonts.main.family} (Aa Bb Cc Dd Ee Ff)`;
    }
    const compSpec = document.getElementById('font-comp-spec');
    if (compSpec && fonts.complementary) {
        compSpec.style.fontFamily = compStack;
        compSpec.style.fontWeight = String(fonts.complementary.weights?.[0] || 400);
        compSpec.textContent = `${fonts.complementary.family} (Aa Bb Cc Dd Ee Ff)`;
    }
    const catLabel = { serif: 'serifada', sans: 'sem serifa', display: 'de destaque (display)', mono: 'monoespaçada' };
    const mainDesc = document.getElementById('font-main-desc');
    if (mainDesc && fonts.main) mainDesc.textContent = `Fonte ${catLabel[fonts.main.category] || ''} sugerida para títulos e nomes (Google Fonts, uso livre).`;
    const compDesc = document.getElementById('font-comp-desc');
    if (compDesc && fonts.complementary) compDesc.textContent = `Fonte ${catLabel[fonts.complementary.category] || ''} sugerida para leitura rápida de dados básicos (Google Fonts, uso livre).`;

    // 4. Logotipo (10)
    const logoBox = document.querySelector('#logo-brand-box .logo-flex-item');
    const logoName = document.getElementById('logo-val-name');
    const logoSub = document.getElementById('logo-val-theme');
    if (logoBox) logoBox.style.background = `linear-gradient(135deg, ${light} 0%, ${primary}33 100%)`;
    if (logoName) {
        logoName.style.fontFamily = mainStack;
        logoName.style.color = _readableColor([primary, secondary, accent, dark], light, dark);
    }
    if (logoSub) {
        logoSub.style.fontFamily = compStack;
        logoSub.style.color = _readableColor([accent, secondary, primary, dark], light, dark);
    }

    // 5. Brasão (11)
    const crest = document.getElementById('crest-box');
    if (crest) {
        const paths = crest.querySelectorAll('path');
        if (paths[0]) paths[0].setAttribute('stroke', primary);
        if (paths[1]) paths[1].setAttribute('fill', accent);
        const crestInitial = document.getElementById('brand-val-initial-crest');
        const crestYear = document.getElementById('brand-val-year');
        if (crestInitial) {
            crestInitial.setAttribute('fill', _readableColor([dark, primary], '#FFFFFF', dark));
            crestInitial.setAttribute('font-family', mainStack);
        }
        if (crestYear) {
            crestYear.setAttribute('fill', _readableColor([accent, secondary, primary], '#FFFFFF', dark));
            crestYear.setAttribute('font-family', compStack);
        }
    }

    // 6. Monograma (12)
    const mono = document.getElementById('mono-box');
    if (mono) {
        const circles = mono.querySelectorAll('circle');
        if (circles[0]) circles[0].setAttribute('stroke', accent);
        if (circles[1]) circles[1].setAttribute('stroke', primary);
        const monoInitial = document.getElementById('brand-val-initial');
        if (monoInitial) {
            monoInitial.setAttribute('fill', _readableColor([dark, primary], '#FFFFFF', dark));
            monoInitial.setAttribute('font-family', mainStack);
        }
        const monoLabel = mono.querySelector('text:not(#brand-val-initial)');
        if (monoLabel) {
            monoLabel.setAttribute('fill', _readableColor([primary, accent, secondary], '#FFFFFF', dark));
            monoLabel.setAttribute('font-family', compStack);
        }
    }

    // 7. Papel digital (09): estampa com as cores da paleta
    const pattern = document.getElementById('paper-pattern-element');
    if (pattern && !(appState.currentProject && appState.currentProject.assetsUrls && appState.currentProject.assetsUrls.papel)) {
        pattern.style.backgroundColor = light;
        pattern.style.backgroundImage =
            `radial-gradient(${accent} 15%, transparent 16%), radial-gradient(${primary} 10%, transparent 11%)`;
    }
}

// ---------------------------------------------------------------------------
// Itens do kit gerados a partir do convite: elementos recortados, ilustrações e papel digital
// ---------------------------------------------------------------------------
function applyKitExtras(kit, assetsUrls) {
    const paid = !!(appState.currentProject && appState.currentProject.unlocked);
    const tile = (src, maxH) => `<div class="brand-item-box${paid ? '' : ' watermarked'}" style="padding:10px;"><img src="${src}" alt="Elemento do tema" style="width:100%; max-height:${maxH}px; object-fit:contain; position:relative; z-index:1;">${paid ? '' : '<div class="watermark-pattern-layer"><span>PRÉVIA</span></div>'}</div>`;

    if (kit) {
        const fill = (id, list, maxH, cols) => {
            const el = document.getElementById(id);
            if (!el || !Array.isArray(list) || !list.length) return;
            el.innerHTML = list.map(u => tile(u, maxH)).join('');
            el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        };
        fill('kit-principais-grid', kit.principais, 180, 2);
        fill('kit-complementares-grid', kit.complementares, 110, 3);

    }

    // Brasão e monograma gerados no estilo e nas letras do convite (substituem os desenhos fixos)
    const showBrandImage = (boxId, url, alt) => {
        const box = document.getElementById(boxId);
        const wrap = box && box.querySelector('.svg-wrapper');
        if (!wrap || !url) return;
        const svg = wrap.querySelector('svg');
        if (svg) svg.style.display = 'none';
        let img = wrap.querySelector('img.brand-ai-img');
        if (!img) {
            img = document.createElement('img');
            img.className = 'brand-ai-img';
            img.alt = alt;
            img.style.cssText = 'max-width:100%; max-height:190px; object-fit:contain; position:relative; z-index:1;';
            wrap.appendChild(img);
        }
        img.src = url;
    };
    showBrandImage('crest-box', assetsUrls && assetsUrls.brasao, 'Brasão da aniversariante');

    // Logotipo: imagem com as mesmas letras do título do convite
    const logo = assetsUrls && assetsUrls.logo;
    const logoImg = document.getElementById('logo-val-img');
    if (logo && logoImg) logoImg.src = logo;

    // Papel digital: usa a estampa gerada com os elementos do tema
    const papel = assetsUrls && assetsUrls.papel;
    const pattern = document.getElementById('paper-pattern-element');
    if (papel && pattern) {
        pattern.style.backgroundImage = `url("${papel}")`;
        pattern.style.backgroundSize = 'cover';
        pattern.style.backgroundPosition = 'center';
        pattern.style.backgroundRepeat = 'no-repeat';
    }
}

// Aplica Tipografia e Elementos UI dinâmicos da Fase 6
function applyAiDna(dna) {
    if (!dna) return;

    // 1. Tipografia Dinâmica
    if (dna.typography) {
        const root = document.documentElement;
        let fontFamily = "'Playfair Display', serif"; // fallback
        switch(dna.typography.toLowerCase()) {
            case 'pixel':   fontFamily = "'Press Start 2P', cursive"; break;
            case 'elegant': fontFamily = "'Playfair Display', serif"; break;
            case 'playful': fontFamily = "'Fredoka', sans-serif"; break;
            case 'modern':  fontFamily = "'Montserrat', sans-serif"; break;
            case 'rustic':  fontFamily = "'Cormorant Garamond', serif"; break;
        }
        root.style.setProperty('--font-title', fontFamily);
    }

    // 2. Elementos UI Dinâmicos (Emojis e Nomes)
    if (dna.uiElements && Array.isArray(dna.uiElements)) {
        dna.uiElements.forEach((elem, index) => {
            const emojiNode = document.getElementById(`ui-elem-${index}-emoji`);
            const nameNode  = document.getElementById(`ui-elem-${index}-name`);
            if (emojiNode && elem.emoji) emojiNode.textContent = elem.emoji;
            if (nameNode && elem.name)   nameNode.textContent  = elem.name;
        });
    }
}

// ---------------------------------------------------------------------------
// HELPERS & EXTRASTOR FORM STEP NAVIGATION
let currentFormStep = 1;
function nextStep(stepNum) {
    if (stepNum === 3) {
        const checks = [
            ['partyName', 'o nome'],
            ['partyAge', 'a idade'],
            ['partyDate', 'a data da festa'],
            ['partyTheme', 'o tema ou estilo'],
            ['partyTime', 'o horário'],
            ['partyLocation', 'o local / endereço'],
        ];
        for (const [id, label] of checks) {
            const el = document.getElementById(id);
            if (!el || !String(el.value || '').trim()) {
                alert(`Por favor, preencha ${label}.`);
                if (el) el.focus();
                return;
            }
        }
        const typeEl = document.querySelector('input[name="partyType"]:checked');
        const genderEl = document.querySelector('input[name="partyGender"]:checked');
        if (typeEl && typeEl.value !== 'debutante' && !genderEl) {
            alert('Por favor, informe se é menino ou menina.');
            return;
        }
    }

    document.querySelectorAll('.form-step').forEach(step => step.style.display = 'none');
    document.getElementById(`form-step-${stepNum}`).style.display = 'block';

    document.querySelectorAll('.step-circle').forEach((dot, index) => {
        if (index < stepNum) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });

    currentFormStep = stepNum;
}

function prevStep(stepNum) {
    document.querySelectorAll('.form-step').forEach(step => step.style.display = 'none');
    document.getElementById(`form-step-${stepNum}`).style.display = 'block';

    document.querySelectorAll('.step-circle').forEach((dot, index) => {
        if (index < stepNum) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    currentFormStep = stepNum;
}

function toggleFormFields() {
    const partyType = document.querySelector('input[name="partyType"]:checked').value;
    const labelName = document.getElementById('label-party-name');
    const groupAge = document.getElementById('group-party-age');
    const labelPhotos = document.getElementById('label-photos-upload');
    const inputAge = document.getElementById('partyAge');
    const groupGender = document.getElementById('group-party-gender');
    if (groupGender) {
        groupGender.style.display = partyType === 'debutante' ? 'none' : '';
        if (partyType === 'debutante') {
            const girl = document.querySelector('input[name="partyGender"][value="f"]');
            if (girl) girl.checked = true;
        }
    }

    if (partyType === 'infantil') {
        labelName.textContent = "Nome da criança";
        groupAge.style.display = 'block';
        inputAge.setAttribute('required', 'required');
        inputAge.placeholder = "Ex.: 10 anos";
        labelPhotos.textContent = "Envie 1 foto da criança (obrigatória)";
    } else if (partyType === 'debutante') {
        labelName.textContent = "Nome da Aniversariante";
        groupAge.style.display = 'block';
        inputAge.setAttribute('required', 'required');
        labelPhotos.textContent = "Envie 1 foto da aniversariante (obrigatória)";
        inputAge.placeholder = "Ex.: 15 anos";
    } else {
        labelName.textContent = "Nome do Aniversariante";
        groupAge.style.display = 'block';
        inputAge.setAttribute('required', 'required');
        labelPhotos.textContent = "Envie 1 foto do aniversariante (obrigatória)";
        inputAge.placeholder = "Ex.: 40 anos";
    }
}

// 7. ESCOLHA DO TIPO DE FESTA (miniaturas da página inicial): só seleciona o tipo e abre o formulário vazio
function selectPartyType(type) {
    showView('generator');
    document.querySelectorAll('input[name="partyType"]').forEach(radio => { radio.checked = (radio.value === type); });
    toggleFormFields();
    nextStep(2);
}

// 8. SIMULATOR GENERATION RUNNER
function handleGeneratorSubmit(event) {
    if (event) event.preventDefault();

    const partyType = document.querySelector('input[name="partyType"]:checked').value;
    const name = document.getElementById('partyName').value;
    const age = document.getElementById('partyAge').value;
    const gender = (document.querySelector('input[name="partyGender"]:checked') || {}).value || (partyType === 'debutante' ? 'f' : '');
    const dateStr = document.getElementById('partyDate').value;
    const time = document.getElementById('partyTime').value;
    const location = document.getElementById('partyLocation').value;
    const theme = document.getElementById('partyTheme').value;
    const notes = document.getElementById('partyNotes').value;
    const email = (document.getElementById('partyEmail').value || '').trim();

    // Tudo é obrigatório (a foto também); nada é preenchido por conta própria
    const faltando = [];
    if (!name.trim()) faltando.push('nome');
    if (!age.trim()) faltando.push('idade');
    if (!gender) faltando.push('menino ou menina');
    if (!dateStr) faltando.push('data da festa');
    if (!theme.trim()) faltando.push('tema');
    if (!time) faltando.push('horário');
    if (!location.trim()) faltando.push('local');
    if (!selectedPhotosFiles.length) faltando.push('foto da criança');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) faltando.push('um e-mail válido');
    if (faltando.length) {
        alert('Por favor, preencha: ' + faltando.join(', ') + '.');
        return;
    }

    const dateParts = dateStr.split('-');
    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

    // Check Pro Limits
    if (appState.currentUser.type === 'pro') {
        if (appState.currentUser.proDailyCount >= appState.config.proDailyLimit) {
            alert(`Limite diário de ${appState.config.proDailyLimit} gerações atingido. Tente novamente amanhã ou aumente seu limite no painel admin.`);
            showView('pro-dashboard');
            return;
        }
    }

    appState.currentProject = {
        id: Date.now(),
        type: partyType,
        name: name,
        age: age,
        gender: gender,
        date: formattedDate,
        time: time,
        location: location,
        phrase: '', // o servidor sorteia a frase do convite
        theme: theme,
        notes: notes,
        email: email,
        watermarked: true,
        initialLetter: name.charAt(0).toUpperCase(),
        dateObj: dateObj
    };

    if (appState.currentUser.type !== 'client') {
        appState.currentUser.proDailyCount++;
        appState.currentUser.proMonthlyCount++;

        appState.projectsDb.unshift({
            id: appState.currentProject.id,
            name: appState.currentProject.name,
            type: appState.currentProject.type,
            theme: appState.currentProject.theme,
            status: 'Finalizado',
            date: formattedDate
        });
    }

    saveStateToStorage();
    updateUIFromState();

    showView('generating');
    startLoadingProgressAnimation();
}

function startLoadingProgressAnimation() {
    const progressBar = document.getElementById('generator-progress-bar');
    const statusText = document.getElementById('generating-status-text');
    const tips = document.querySelectorAll('.gen-tip-item');

    let progress = 0;
    progressBar.style.width = '0%';

    const statuses = [
        "Mia está selecionando as paletas aquareladas...",
        "Conectando com a API de geração de imagens...",
        "Ilustrando laços e molduras suaves com aquarela...",
        "Formatando monograma com a inicial do nome...",
        "Posicionando os mascotes temáticos...",
        "Ajustando a prancha de elementos separados...",
        "Finalizando a prévia em alta definição...",
    ];

    let statusIdx = 0;
    let tipIdx = 0;
    let apiResult = null;
    let apiDone = false;
    let apiError = null;

    const tipInterval = setInterval(() => {
        tips.forEach(t => t.classList.remove('active'));
        tipIdx = (tipIdx + 1) % tips.length;
        tips[tipIdx].classList.add('active');
    }, 2500);

    // --- FASE 2: Chama a API real em paralelo com a animação ---
    apiGenerateKit(appState.currentProject)
        .then(result => {
            apiResult = result;
            apiDone   = true;
            console.log('[App] Resposta da API recebida:', result ? '✅ Sucesso' : '⚠️ Modo mock');
        })
        .catch((err) => { 
            apiError = err.message;
            apiDone = true; 
        });

    // Velocidade da barra: aumenta progressivamente até 80%, depois aguarda a API
    const interval = setInterval(() => {
        // Pausa em 80% até a API responder (ou avança normalmente se não houver backend)
        if (progress >= 80 && !apiDone) {
            statusText.textContent = "Finalizando geração com a IA...";
            return;
        }

        progress += (progress < 80 ? 2 : 4);
        progressBar.style.width = `${Math.min(progress, 100)}%`;

        if (progress % 15 === 0 && statusIdx < statuses.length - 1) {
            statusIdx++;
            statusText.textContent = statuses[statusIdx];
        }

        if (progress >= 100) {
            clearInterval(interval);
            clearInterval(tipInterval);

            if (apiError) {
                alert(`⚠️ Ocorreu um problema na geração:\n\n${apiError}`);
                showView('generator'); // Volta para o formulário
                return;
            }

            // Aplica as imagens reais da IA ANTES de mostrar a tela: assim nunca aparece imagem de exemplo
            // antes da imagem gerada (applyRealAssets já monta a tela de resultado com os dados reais).
            if (apiResult?.assetsUrls) {
                applyProjectView(apiResult);
                if (apiResult.reminderMissing) alert('O convite ficou pronto, mas o lembrete não pôde ser criado agora. Você pode gerar outra opção ou seguir com o convite.');
            }
            showView('result');
        }
    }, 80);
}


// Imagem transparente de 1x1: as imagens do resultado nascem com ela (nunca uma arte de exemplo)
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// Define a imagem de um item do resultado. Sem URL, fica vazia. Com URL, só aparece (fade) quando termina de carregar.
function setResultImg(el, url) {
    if (!el) return;
    el.classList.add('result-img');
    if (!url) { el.classList.remove('loaded'); el.onload = null; el.src = BLANK_IMG; return; }
    if (el.getAttribute('src') === url && el.complete && el.naturalWidth > 0) { el.classList.add('loaded'); return; }
    el.classList.remove('loaded');
    el.onload = () => el.classList.add('loaded');
    el.onerror = () => el.classList.remove('loaded');
    el.src = url;
}

// Mostra ou esconde um cartão da galeria
function setCardVisible(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
}

// Renumera os cartões visíveis em sequência, esconde grupos sem nenhum cartão e atualiza as contagens de itens
function refreshGallery() {
    const gallery = document.querySelector('.results-scroll-gallery');
    if (!gallery) return;
    let n = 0;
    gallery.querySelectorAll('.preview-card-wrapper').forEach(card => {
        if (card.style.display === 'none') return;
        n++;
        const badge = card.querySelector('.prominent-highlight-badge');
        if (badge) badge.textContent = badge.textContent.replace(/^\d{2}\.\s*/, `${String(n).padStart(2, '0')}. `);
    });
    let divider = null, any = false;
    const flush = () => { if (divider) divider.style.display = any ? '' : 'none'; };
    Array.from(gallery.children).forEach(el => {
        if (el.classList.contains('gallery-section-divider')) { flush(); divider = el; any = false; }
        else if (el.classList.contains('preview-card-wrapper') && el.style.display !== 'none') any = true;
    });
    flush();

    appState.kitItemCount = n;
    const label = `${n} ${n === 1 ? 'item' : 'itens'}`;
    const checkoutTitle = document.getElementById('checkout-kit-title');
    if (checkoutTitle) checkoutTitle.textContent = `Kit Digital Completo (${label})`;
}

// Nomes (como o cliente os conhece) dos itens que podem faltar no kit
const KIT_ITEM_LABELS = { mascote: 'Mascote', elementos: 'Elementos do tema e papel digital', fundo: 'Fundo limpo', logo: 'Logotipo', lembrete: 'Lembrete', brasao: 'Brasão', lembrancinha: 'Lembrancinha' };

// Mostra quais itens não saíram e oferece tentar de novo (só eles, o convite aprovado não muda)
function renderKitMissingNotice() {
    const box = document.getElementById('kit-missing-notice');
    if (!box) return;
    const p = appState.currentProject || {};
    const missing = (p.kitMissing || []).filter(k => KIT_ITEM_LABELS[k]);
    if (!missing.length || !p.projectId) { box.style.display = 'none'; return; }
    const names = missing.map(k => KIT_ITEM_LABELS[k]).join(', ');
    document.getElementById('kit-missing-title').textContent = missing.length === 1 ? 'Um item do kit não pôde ser gerado' : `${missing.length} itens do kit não puderam ser gerados`;
    document.getElementById('kit-missing-text').textContent = (p.kitQuota
        ? 'O serviço de criação está temporariamente indisponível. '
        : 'Houve uma instabilidade ao criar estes itens. ')
        + `Faltaram: ${names}. O seu convite está pronto; toque abaixo para gerar só o que faltou.`;
    const btn = document.getElementById('kit-retry-btn');
    btn.disabled = false; btn.textContent = '🔄 Tentar de novo os itens que faltam';
    box.style.display = '';
}

function retryMissingKit() {
    const p = appState.currentProject || {};
    const items = (p.kitMissing || []).slice();
    if (!items.length || !p.projectId) return;
    startKitGeneration(items);
}

// 9. DYNAMIC DATA BINDINGS & RENDERING
// Só aparece o que foi gerado para este cliente: nenhuma arte, texto ou cor de exemplo.
function populateResultScreen() {
    const p = appState.currentProject || {};
    const a = p.assetsUrls || {};

    // 01 Convite
    setResultImg(document.getElementById('invite-bg-image'), a.convitePreview || a.background || null);

    // 02 Lembrete (arte gerada, com todos os textos dentro da imagem)
    setResultImg(document.getElementById('reminder-bg-image'), a.lembretePreview || null);
    setCardVisible('reminder-card', !!a.lembretePreview);

    // 03 Mascote
    const mascotTitle = document.getElementById('mascot-val-title');
    if (mascotTitle) mascotTitle.textContent = p.name ? `Mascote de ${p.name}` : '';
    setResultImg(document.getElementById('mascot-img-render'), a.mascote || null);
    setCardVisible('mascot-card', !!a.mascote);

    // 04 Prancha de elementos
    setResultImg(document.querySelector('.elements-sheet-img'), a.elementos || null);
    setCardVisible('elements-sheet-card', !!a.elementos);

    // 05 e 06 Elementos recortados
    setCardVisible('principais-card', !!(p.kit && p.kit.principais && p.kit.principais.length));
    setCardVisible('complementares-card', !!(p.kit && p.kit.complementares && p.kit.complementares.length));

    // 07 Fundo limpo (nunca mostra o convite, que tem texto, no lugar dele)
    setResultImg(document.getElementById('custom-bg-render'), a.fundo || null);
    setCardVisible('bg-card', !!a.fundo);

    // 08 Lembrancinha
    setResultImg(document.getElementById('lembrancinha-img'), a.lembrancinha || null);
    setCardVisible('lembrancinha-card', !!a.lembrancinha);

    // 09 Papel digital
    setCardVisible('paper-card', !!a.papel);

    // 10 Logotipo e 11 Brasão
    setCardVisible('logo-card', !!a.logo);
    setCardVisible('crest-card', !!a.brasao);

    // 12 Paleta
    setCardVisible('palette-card', !!(p.identity && Array.isArray(p.identity.palette) && p.identity.palette.length >= 5));

    if (p.identity) applyIdentity(p.identity);
    applyKitExtras(p.kit, a);

    updateWatermarkVisibility();
    renderResultState();
    const checkoutTheme = document.getElementById('checkout-val-theme');
    if (checkoutTheme) checkoutTheme.textContent = p.theme ? `Tema: ${p.theme}${p.name ? ' - ' + p.name : ''}` : '';
    refreshGallery();
    renderKitMissingNotice();

    // Realça a primeira aba
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const firstTabBtn = document.getElementById('btn-tab-convites');
    if (firstTabBtn) firstTabBtn.classList.add('active');
}

function switchResultTab(event, sectionId) {
    if (event) event.preventDefault();

    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event) {
        event.target.classList.add('active');
    }
}

// 10. REGENERATION LOGIC
function handleRegenerationClick() {
    const att = (appState.currentProject || {}).attempts;
    if (att && att.left <= 0) {
        alert(`Você já usou suas ${att.allowed} prévias grátis. Escolha a que mais gostou e libere o kit completo.`);
        goToCheckout();
        return;
    }
    alert("Vamos ajustar os dados! Você pode mudar o tema, a foto ou as observações para gerar outra variação.");
    showView('generator');
    nextStep(3);
}

// Watermarks
function updateWatermarkVisibility() {
    const isWatermarked = appState.currentProject.watermarked;
    const containers = [
        'invite-mock-container',
        'reminder-mock-container',
        'elements-sheet-mock-container',
        'digital-paper-mock-container',
        'mono-box',
        'crest-box',
        'logo-brand-box',
        'mascot-showcase-container',
        'bg-custom-container',
        'lembrancinha-container'
    ];

    containers.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            if (isWatermarked) {
                elem.classList.add('watermarked');
                elem.classList.remove('unwatermarked');
            } else {
                elem.classList.remove('watermarked');
                elem.classList.add('unwatermarked');
            }
        }
    });

    const banner = document.getElementById('watermark-notice');
    if (banner) {
        banner.style.display = isWatermarked ? 'flex' : 'none';
    }
}

// 11. PROJETO, PAGAMENTO (Mercado Pago) E GERAÇÃO DO KIT
// O navegador só mostra o que o servidor devolve: prévia marcada até o pagamento, kit completo depois.
const authHeaders = () => (typeof _authToken !== 'undefined' && _authToken ? { 'Authorization': `Bearer ${_authToken}` } : {});
let payPollTimer = null;
let kitPollTimer = null;
let busyTimer = null;

// Aplica o que o servidor devolveu (prévia, pago, kit) ao projeto atual e redesenha a tela de resultado
function applyProjectView(v) {
    if (!appState.currentProject) appState.currentProject = {};
    const p = appState.currentProject;
    if (v.project) {
        p.name = v.project.name; p.type = v.project.type; p.age = v.project.age; p.theme = v.project.theme;
        p.date = v.project.date; p.time = v.project.time; p.location = v.project.location;
        p.phrase = v.project.phrase || p.phrase; p.gender = v.project.gender || p.gender;
    }
    p.projectId = v.projectId;
    // Endereços relativos do servidor (arte limpa de quem já pagou) ganham o endereço completo da API
    const abs = (u) => (typeof u === 'string' && u.startsWith('/api/')) ? API_BASE.replace(/\/api$/, '') + u : u;
    p.assetsUrls = Object.fromEntries(Object.entries(v.assetsUrls || {}).map(([k, u]) => [k, abs(u)]));
    p.unlocked = !!v.unlocked;
    p.watermarked = !v.unlocked;
    p.price = v.price;
    p.attempts = v.attempts || null;
    p.regen = v.regen || null;
    p.kitState = v.kit ? v.kit.state : 'none';
    p.kitMissing = (v.kit && v.kit.missing) || [];
    p.kitQuota = !!(v.kit && v.kit.quota);
    p.kit = (v.kit && v.kit.files) || null;
    p.identity = v.identity || null;

    const entry = appState.projectsDb.find(x => x.id === p.id);
    if (entry) {   // Profissionais: guarda o projeto para reabrir depois pela lista
        const { photos, references, ...rest } = p;
        entry.snapshot = { ...rest, dateObj: rest.dateObj ? new Date(rest.dateObj).toISOString() : null };
    }
    try { localStorage.setItem('meraki_last_project', v.projectId); } catch (_) { /* ignora */ }
    saveStateToStorage();
    populateResultScreen();
    if (v.identity) applyIdentity(v.identity);
}

// Botões, avisos e contadores da tela de resultado conforme o estado: prévia, pago ou kit pronto
function renderResultState() {
    const p = appState.currentProject || {};
    const unlocked = !!p.unlocked;
    const kitReady = unlocked && (p.kitState === 'ready' || p.kitState === 'partial');
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
    show('actions-locked', !unlocked);
    show('actions-paid', unlocked && !kitReady);
    show('actions-ready', kitReady);
    const tabs = document.querySelector('.result-tabs');
    if (tabs) tabs.style.display = kitReady ? '' : 'none';

    const banner = document.getElementById('watermark-notice');
    if (banner) {
        banner.style.display = unlocked ? 'none' : 'flex';
        const h4 = banner.querySelector('h4'), pp = banner.querySelector('p');
        if (h4) h4.textContent = 'Prévia do seu convite e lembrete (com marca d\'água)';
        if (pp) pp.textContent = 'Gostou? Libere o kit completo: mascote com o rosto da criança, elementos do tema, fundo, papel digital, logotipo, brasão, lembrancinha e paleta de cores, tudo sem marca d\'água e pronto para baixar.';
    }

    const badge = document.getElementById('client-generations-badge');
    if (badge) {
        if (!unlocked && p.attempts) badge.textContent = `Prévia ${p.attempts.used} de ${p.attempts.allowed}`;
        else badge.textContent = unlocked ? '✅ Kit liberado' : '';
    }
    const plural = (n) => `${n} ${n === 1 ? 'restante' : 'restantes'}`;
    const regenCount = document.getElementById('btn-regen-count');
    if (regenCount && p.attempts) regenCount.textContent = plural(p.attempts.left);
    const paidCount = document.getElementById('btn-paid-regen-count');
    if (paidCount && p.regen) paidCount.textContent = plural(p.regen.left);
    show('btn-paid-regen', !!(p.regen && p.regen.left > 0));

    const price = document.getElementById('checkout-val-price');
    if (price && p.price) price.textContent = `R$ ${Number(p.price).toFixed(2).replace('.', ',')}`;
}

// ---------------- Pagamento ----------------
function goToCheckout() {
    if (!(appState.currentProject || {}).projectId) { alert('Gere uma prévia primeiro.'); return; }
    stopPayPolling();
    const w = document.getElementById('pay-waiting'); if (w) w.style.display = 'none';
    const d = document.getElementById('btn-pay-dev'); if (d) d.style.display = 'none';
    const b = document.getElementById('btn-pay-mp'); if (b) b.style.display = '';
    showView('checkout');
}

async function startPayment() {
    const p = appState.currentProject || {};
    if (!p.projectId) return;
    const btn = document.getElementById('btn-pay-mp');
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/payments/${p.projectId}/checkout`, { method: 'POST', headers: authHeaders() });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Não foi possível iniciar o pagamento.');
        if (d.paid) { await onPaid(); return; }
        if (d.dev) {                                    // servidor em modo de teste, sem Mercado Pago
            document.getElementById('btn-pay-dev').style.display = '';
            btn.style.display = 'none';
            return;
        }
        window.location.href = d.url;                  // paga no Mercado Pago e volta para cá (?pago=<id>)
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

function reopenPayment() { startPayment(); }

function stopPayPolling() { if (payPollTimer) { clearInterval(payPollTimer); payPollTimer = null; } }

async function checkPayment() {
    const p = appState.currentProject || {};
    if (!p.projectId) return false;
    try {
        const res = await fetch(`${API_BASE}/payments/${p.projectId}/status`, { headers: authHeaders() });
        const d = await res.json();
        if (d.paid) { stopPayPolling(); await onPaid(); return true; }
    } catch (_) { /* tenta de novo no próximo ciclo */ }
    return false;
}

function startPayPolling() {
    stopPayPolling();
    const w = document.getElementById('pay-waiting'); if (w) w.style.display = '';
    payPollTimer = setInterval(checkPayment, 4000);
    checkPayment();
}

async function checkPaymentNow() {
    if (!(await checkPayment())) alert('Ainda não recebemos a confirmação. O Pix leva alguns segundos; se já pagou, aguarde um pouco e tente de novo.');
}

async function devApprovePayment() {
    const p = appState.currentProject || {};
    try {
        const res = await fetch(`${API_BASE}/payments/${p.projectId}/dev-approve`, { method: 'POST', headers: authHeaders() });
        if (!res.ok) throw new Error('Simulação indisponível neste servidor.');
        await onPaid();
    } catch (e) { alert(e.message); }
}

// Pagamento confirmado pelo servidor: recarrega o projeto (agora liberado) e mostra as opções
async function onPaid() {
    const p = appState.currentProject || {};
    const res = await fetch(`${API_BASE}/generate/project/${p.projectId}`, { headers: authHeaders() });
    if (!res.ok) { alert('Pagamento aprovado! Recarregue a página para ver o seu kit.'); return; }
    applyProjectView(await res.json());
    showView('result');
    alert('Pagamento aprovado! Confira o seu convite e, quando quiser, gere o kit completo.');
}

// ---------------- Barra de progresso (tela "criando") ----------------
function showBusy(title, text, seconds) {
    const t = document.querySelector('#view-generating .magic-title'); if (t) t.textContent = title;
    const s = document.getElementById('generating-status-text'); if (s) s.textContent = text;
    const bar = document.getElementById('generator-progress-bar'); if (bar) bar.style.width = '2%';
    showView('generating');
    let prog = 2;
    if (busyTimer) clearInterval(busyTimer);
    busyTimer = setInterval(() => {
        prog = Math.min(92, prog + 90 / seconds);
        if (bar) bar.style.width = `${prog}%`;
    }, 1000);
}
function stopBusy() {
    if (busyTimer) { clearInterval(busyTimer); busyTimer = null; }
    const bar = document.getElementById('generator-progress-bar'); if (bar) bar.style.width = '100%';
    const t = document.querySelector('#view-generating .magic-title'); if (t) t.textContent = 'Mia está criando a mágica! ✨';
}

// ---------------- Kit completo (depois de pago) ----------------
async function startKitGeneration(items) {
    const p = appState.currentProject || {};
    if (!p.projectId) return;
    try {
        const res = await fetch(`${API_BASE}/generate/kit/${p.projectId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ items: Array.isArray(items) ? items : [] }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Não foi possível iniciar a geração do kit.');
        showBusy('Mia está montando o seu kit! ✨', 'Criando o mascote, os elementos, o logotipo e o restante do kit... isso leva alguns minutos. Pode deixar esta página aberta.', 240);
        pollKit();
    } catch (e) {
        alert(e.message);
    }
}

function pollKit() {
    if (kitPollTimer) clearInterval(kitPollTimer);
    const tick = async () => {
        const p = appState.currentProject || {};
        try {
            const res = await fetch(`${API_BASE}/generate/kit/${p.projectId}/status`, { headers: authHeaders() });
            if (!res.ok) return;
            const v = await res.json();
            if (v.kit && v.kit.state === 'generating') return;
            clearInterval(kitPollTimer); kitPollTimer = null;
            stopBusy();
            applyProjectView(v);
            showView('result');
            const st = v.kit && v.kit.state;
            if (st === 'failed') alert('Não foi possível criar o kit agora. Nada foi perdido: toque em "Tentar de novo" para gerar outra vez.');
            else if (st === 'partial') alert('Quase tudo ficou pronto! Alguns itens não saíram; você pode gerar só os que faltam.');
        } catch (_) { /* tenta de novo */ }
    };
    kitPollTimer = setInterval(tick, 5000);
}

// Depois de pago: nova versão do convite e do lembrete (limpos), antes de gerar o resto do kit
async function regeneratePaid() {
    const p = appState.currentProject || {};
    if (!p.projectId) return;
    if (p.regen && p.regen.left <= 0) { alert('Você já usou suas novas versões.'); return; }
    if (!confirm('Criar outra versão do convite e do lembrete? Esta tentativa será descontada.')) return;
    showBusy('Mia está criando outra versão! ✨', 'Desenhando um novo convite e um novo lembrete...', 120);
    try {
        const res = await fetch(`${API_BASE}/generate/regenerate/${p.projectId}`, { method: 'POST', headers: authHeaders(), signal: AbortSignal.timeout(600000) });
        const d = await res.json().catch(() => ({}));
        stopBusy();
        if (!res.ok) throw new Error(d.error || 'Não foi possível criar outra versão agora.');
        applyProjectView(d);
        showView('result');
    } catch (e) {
        stopBusy();
        showView('result');
        alert(e.message);
    }
}

// Voltando do pagamento (?pago=<id>) ou retomando um kit já pago
async function resumeFromUrl() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('pago');
    let pid = fromUrl;
    if (!pid) { try { pid = localStorage.getItem('meraki_last_project'); } catch (_) { /* ignora */ } }
    if (!pid) return;
    try {
        const res = await fetch(`${API_BASE}/generate/project/${pid}`, { headers: authHeaders() });
        if (!res.ok) { try { localStorage.removeItem('meraki_last_project'); } catch (_) { /* ignora */ } return; }
        const v = await res.json();
        if (!fromUrl) {                                   // sem retorno do pagamento: só retoma kit que já foi pago
            if (!v.unlocked || !confirm(`Você tem um kit já liberado (${(v.project && v.project.name) || 'sua festa'}). Quer continuar com ele?`)) return;
        }
        appState.currentProject = { id: Date.now() };
        applyProjectView(v);
        if (fromUrl) history.replaceState(null, '', location.pathname);
        if (v.unlocked) {
            if (v.kit && v.kit.state === 'generating') {
                showBusy('Mia está montando o seu kit! ✨', 'Seu kit está sendo criado. Pode deixar esta página aberta.', 240);
                pollKit();
            } else {
                showView('result');
            }
        } else {
            showView('checkout');
            startPayPolling();
        }
    } catch (e) { console.warn('[App] Não foi possível retomar o projeto:', e.message); }
}



// 12. DOWNLOADS: links reais para os arquivos do projeto gerado (o servidor confere se o kit foi liberado)
function renderDownloads() {
    const list = document.getElementById('download-options-list');
    const warn = document.getElementById('download-unavailable');
    if (!list) return;
    const p = appState.currentProject || {};
    list.innerHTML = '';
    if (!p.projectId) {
        if (warn) warn.style.display = '';
        return;
    }
    if (warn) warn.style.display = 'none';

    const base = `${API_BASE}/downloads/${p.projectId}`;
    const link = (href, label, cls) => `<a href="${href}" target="_blank" rel="noopener" class="dl-btn${cls ? ' ' + cls : ''}">${label}</a>`;
    const card = (icon, title, desc, actions) => `<div class="download-item-card"><div class="item-icon-area">${icon}</div><div class="item-meta"><h4>${title}</h4><p>${desc}</p></div><div class="download-actions">${actions}</div></div>`;

    let html = card('✉️', 'Convite', 'Envio virtual (PNG) e versão para impressão (PDF).', link(`${base}/convite.png`, 'PNG') + link(`${base}/convite.pdf`, 'PDF', 'outline'));
    if (p.assetsUrls && p.assetsUrls.lembretePreview) {
        html += card('⏰', 'Lembrete', 'Card de contagem regressiva no estilo do convite.', link(`${base}/lembrete.png`, 'PNG'));
    }
    html += card('📦', 'Pacote completo (ZIP)', 'Todos os itens do seu kit em alta resolução, sem marca d\'água.', link(`${base}/kit.zip`, 'BAIXAR ZIP', 'btn-primary'));
    list.innerHTML = html;

    const subtitle = document.getElementById('download-subtitle');
    if (subtitle) subtitle.textContent = `Seu kit (${appState.kitItemCount || 0} itens) em altíssima resolução foi liberado, limpo de marcas d'água, para download:`;
}

// 13. PROFESSIONAL PORTAL LOGIN & DASHBOARD LOGIC
async function handleProLogin(event) {
    if (event) event.preventDefault();

    const emailEl = document.getElementById('proEmail');
    const passEl  = document.getElementById('proPassword');
    const email   = emailEl?.value?.trim();
    const pass    = passEl?.value?.trim();

    // Tenta login real se tiver credenciais e backend disponível
    if (email && pass) {
        const btn = document.getElementById('btn-pro-login');
        if (btn) btn.textContent = 'Entrando...';

        const result = await apiLogin(email, pass);
        if (result) {
            // Login real bem-sucedido — estado já atualizado por apiLogin()
            updateUIFromState();
            showView('pro-dashboard');
            if (btn) btn.textContent = 'ENTRAR';
            return;
        }
        if (btn) btn.textContent = 'ENTRAR';
        // Falha no login real? cai no mock abaixo (só em dev)
        console.warn('[Login] API indisponível — usando modo mock');
    }

    // Modo mock (Fase 1 — mantido para compatibilidade)
    appState.currentUser.type = 'pro';
    appState.currentUser.name = email || 'Ana';
    saveStateToStorage();
    updateUIFromState();
    showView('pro-dashboard');
}

async function logoutPro() {
    await apiLogout(); // Revoga token no backend (se disponível)

    appState.currentUser.type = 'client';
    appState.currentUser.name = 'Cliente';
    saveStateToStorage();
    updateUIFromState();
    showView('home');
}


function simulateProSubscription() {
    alert("Simulando assinatura do Plano Conviteira Pró pela Kiwify...");

    appState.currentUser.type = 'pro';
    appState.currentUser.name = 'Ana';

    saveStateToStorage();
    updateUIFromState();

    showView('pro-dashboard');
}

// 14. ADMIN PANEL SETTINGS ACTIONS
function saveAdminSettings() {
    const priceInput = document.getElementById('admin-kit-price').value;
    const freeInput = document.getElementById('admin-client-free').value;
    const dailyInput = document.getElementById('admin-pro-daily').value;
    const monthlyInput = document.getElementById('admin-pro-monthly').value;

    appState.config.kitPrice = parseFloat(priceInput);
    appState.config.freeLimits = parseInt(freeInput);
    appState.config.proDailyLimit = parseInt(dailyInput);
    appState.config.proMonthlyLimit = parseInt(monthlyInput);

    saveStateToStorage();
    updateUIFromState();

    alert("Configurações Administrativas Salvas com Sucesso!");
}

function toggleBypassPayment() {
    const checked = document.getElementById('admin-bypass-payment').checked;
    appState.config.bypassPayment = checked;
    saveStateToStorage();
}

function toggleInfiniteLimit() {
    const checked = document.getElementById('admin-infinite-limit').checked;
    appState.config.infiniteLimit = checked;
    saveStateToStorage();
}

function resetSimulator() {
    if (confirm("Deseja redefinir todo o estado do simulador (limites, configurações e projetos)?")) {
        localStorage.removeItem('meraki_state_collage_v4');
        appState = {
            config: {
                kitPrice: 47.90,
                freeLimits: 2,
                proDailyLimit: 6,
                proMonthlyLimit: 60,
                bypassPayment: false,
                infiniteLimit: false
            },
            currentUser: {
                type: 'client',
                name: 'Cliente',
                clientGenerationsCount: 0,
                proDailyCount: 0,
                proMonthlyCount: 0
            },
            currentProject: {},
            projectsDb: []
        };

        updateAdminInputFields();
        updateUIFromState();
        showView('home');

        alert("Simulador Resetado!");
    }
}

// 15. DYNAMIC DATA RE-BINDINGS & RE-RENDERS
function updateAdminInputFields() {
    document.getElementById('admin-kit-price').value = appState.config.kitPrice;
    document.getElementById('admin-client-free').value = appState.config.freeLimits;
    document.getElementById('admin-pro-daily').value = appState.config.proDailyLimit;
    document.getElementById('admin-pro-monthly').value = appState.config.proMonthlyLimit;
    document.getElementById('admin-bypass-payment').checked = appState.config.bypassPayment;
    document.getElementById('admin-infinite-limit').checked = appState.config.infiniteLimit;
}

function updateUIFromState() {
    const badge = document.getElementById('user-badge');
    if (badge) {
        if (appState.currentUser.type === 'pro') {
            badge.textContent = 'Pro';
        } else {
            badge.textContent = 'Cliente';
        }
    }

    const limitWarning = document.getElementById('client-limit-warning');
    if (limitWarning) {
        limitWarning.style.display = appState.currentUser.type === 'pro' ? 'none' : 'block';
    }

    const proValToday = document.getElementById('pro-val-today');
    if (proValToday) {
        proValToday.textContent = `${appState.currentUser.proDailyCount} de ${appState.config.proDailyLimit}`;
    }
    const proValMonth = document.getElementById('pro-val-month');
    if (proValMonth) {
        proValMonth.textContent = `${appState.currentUser.proMonthlyCount} de ${appState.config.proMonthlyLimit}`;
    }

    renderProProjectsList();
    renderAdminProjectsTable();
}

function renderProProjectsList() {
    const container = document.getElementById('pro-projects-list');
    if (!container) return;

    container.innerHTML = '';

    appState.projectsDb.forEach(p => {
        const typeLabels = { infantil: 'Infantil', debutante: '15 anos', adulto: 'Adulto' };
        const statusClass = p.status === 'Finalizado' ? 'finalizado' : 'criando';

        const card = document.createElement('div');
        card.className = 'pro-project-item-card';
        card.innerHTML = `
            <div class="pro-proj-info">
                <h5>${p.name} - ${typeLabels[p.type] || p.type}</h5>
                <span>Tema: ${p.theme}</span>
            </div>
            <span class="pro-proj-status ${statusClass}">${p.status === 'Finalizado' ? '✓ Finalizado' : '⌛ Em criação'}</span>
        `;

        card.style.cursor = 'pointer';
        card.onclick = () => {
            loadProjectToResult(p.id);
        };

        container.appendChild(card);
    });
}

function renderAdminProjectsTable() {
    const container = document.getElementById('admin-projects-rows');
    if (!container) return;

    container.innerHTML = '';

    appState.projectsDb.forEach(p => {
        const typeLabels = { infantil: 'Infantil', debutante: '15 anos', adulto: 'Adulto' };

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.name}</strong></td>
            <td>${typeLabels[p.type] || p.type}</td>
            <td><span class="pro-proj-status ${p.status === 'Finalizado' ? 'finalizado' : 'criando'}">${p.status}</span></td>
            <td>${p.date}</td>
            <td><button class="btn-admin-view" onclick="loadProjectToResult(${p.id})">Ver</button></td>
        `;
        container.appendChild(tr);
    });
}

function loadProjectToResult(projectId) {
    const proj = appState.projectsDb.find(p => p.id === projectId);
    if (!proj) return;
    if (!proj.snapshot) {
        alert('A arte deste projeto não está salva neste navegador.');
        return;
    }
    appState.currentProject = {
        ...proj.snapshot,
        dateObj: proj.snapshot.dateObj ? new Date(proj.snapshot.dateObj) : null,
        watermarked: appState.currentUser.type === 'client' && !appState.config.bypassPayment,
    };

    populateResultScreen();
    showView('result');
}
