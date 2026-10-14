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


function applyRealAssets(assetsUrls, projectId, identity, phrase, kit) {
    if (!assetsUrls) return;
    appState.currentProject.assetsUrls = assetsUrls;
    appState.currentProject.identity = identity || null;
    appState.currentProject.kit = kit || null;
    if (phrase) appState.currentProject.phrase = phrase;
    appState.currentProject.projectId  = projectId;
    saveStateToStorage();

    populateResultScreen();
    console.log('[API] ✅ Assets reais aplicados na interface.');
    applyRealDownloadLinks(projectId);
}


function applyRealDownloadLinks(projectId) {
    if (!projectId) return;
    const base = `${API_BASE}/downloads/${projectId}`;
    const setHref = (id, url) => {
        const el = document.getElementById(id);
        if (el) { el.href = url; el.removeAttribute('onclick'); el.target = '_blank'; }
    };
    setHref('btn-download-png', `${base}/convite.png`);
    setHref('btn-download-pdf', `${base}/convite.pdf`);
    setHref('btn-download-zip', `${base}/kit.zip`);
    setHref('btn-dl-png',       `${base}/convite.png`);
    setHref('btn-dl-pdf',       `${base}/convite.pdf`);
    setHref('btn-dl-zip',       `${base}/kit.zip`);
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
        proDailyCount: 2,
        proMonthlyCount: 18
    },

    currentProject: {
        id: 101,
        type: 'infantil',
        name: 'Helena',
        age: '5 anos',
        date: '12/10/2026',
        time: '15:30',
        location: 'Buffet Jardim Secreto, Av. das Américas, 500',
        phrase: 'Venha viver essa aventura no meu Jardim Encantado!',
        theme: 'Jardim Encantado',
        notes: 'Quero tons pastel e bichinhos da floresta.',
        photos: [],
        references: [],
        watermarked: true,
        bgTemplate: 'assets/infantil_bg.jpg',
        initialLetter: 'H',
        dateObj: new Date(2026, 9, 12)
    },

    projectsDb: [
        { id: 101, name: 'Helena', type: 'infantil', theme: 'Jardim Encantado', status: 'Finalizado', date: '12/10/2026' },
        { id: 102, name: 'Laura', type: 'debutante', theme: 'Princesa Boho', status: 'Em criação', date: '26/08/2026' },
        { id: 103, name: 'Mariana', type: 'adulto', theme: 'Floral Delicado', status: 'Finalizado', date: '24/08/2026' }
    ]
};

// 2. APP INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    
    // DEVELOPER PRESETS: Automatically bypass payment and allow infinite generations for review
    appState.config.infiniteLimit = true;
    appState.config.bypassPayment = true;
    appState.config.freeLimits = 9999;
    appState.currentUser.clientGenerationsCount = 0;
    
    updateAdminInputFields();
    updateUIFromState();
    
    // Setup initial view
    showView('home');
    
    // Hook up form step toggles
    toggleFormFields();
    
    // Populate results initially with Helena prefill
    populateResultScreen();
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
        localStorage.setItem('meraki_state_collage_v3', json);
    } catch (e) {
        console.warn('Não foi possível salvar o estado local:', e.message);
    }
}

function loadStateFromStorage() {
    const saved = localStorage.getItem('meraki_state_collage_v3');
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

// 3. SPA RESPONSIVE ROUTING
function showView(viewId) {
    const views = document.querySelectorAll('.view-page-item');
    views.forEach(v => v.classList.remove('active'));
    
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

    // 2. Paleta (13)
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
    const tile = (src, maxH) => `<div class="brand-item-box watermarked" style="padding:10px;"><img src="${src}" alt="Elemento do tema" style="width:100%; max-height:${maxH}px; object-fit:contain; position:relative; z-index:1;"><div class="watermark-pattern-layer"><span>PRÉVIA</span></div></div>`;

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

    // Logotipo: imagem com as mesmas letras do título do convite (substitui o nome em fonte do navegador)
    const logo = assetsUrls && assetsUrls.logo;
    const logoName = document.getElementById('logo-val-name');
    if (logo && logoName) {
        logoName.style.display = 'none';
        let img = document.getElementById('logo-val-img');
        if (!img) {
            img = document.createElement('img');
            img.id = 'logo-val-img';
            img.alt = 'Logotipo da festa';
            img.style.cssText = 'max-width:100%; max-height:140px; object-fit:contain; position:relative; z-index:1;';
            logoName.parentNode.insertBefore(img, logoName);
        }
        img.src = logo;
    }

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
        const name = document.getElementById('partyName');
        const date = document.getElementById('partyDate');
        const time = document.getElementById('partyTime');
        const location = document.getElementById('partyLocation');
        
        if (!name.value || !date.value || !time.value || !location.value) {
            alert("Por favor, preencha todos os campos obrigatórios da festa!");
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
        labelPhotos.textContent = "Envie 1 foto da criança";
    } else if (partyType === 'debutante') {
        labelName.textContent = "Nome da Aniversariante";
        groupAge.style.display = 'block';
        inputAge.setAttribute('required', 'required');
        labelPhotos.textContent = "Envie 1 foto da Debutante (Opcional)";
        inputAge.placeholder = "Ex: 15 anos";
        inputAge.value = "15 anos";
    } else {
        labelName.textContent = "Nome do Aniversariante";
        groupAge.style.display = 'block';
        inputAge.removeAttribute('required');
        labelPhotos.textContent = "Envie 1 foto do Aniversariante (Opcional)";
        inputAge.placeholder = "Ex: 40 anos (Opcional)";
    }
}

// 7. PREFILL SIMULATION SHORTCUTS
function prefillAndGenerate(type) {
    showView('generator');
    nextStep(1);
    
    document.querySelectorAll('input[name="partyType"]').forEach(radio => {
        if (radio.value === type) {
            radio.checked = true;
        } else {
            radio.checked = false;
        }
    });
    
    toggleFormFields();
    
    const formFields = {
        infantil: {
            name: 'Helena',
            age: '5 anos',
            date: '2026-10-12',
            time: '15:30',
            location: 'Buffet Jardim Secreto, Av. das Américas, 500',
            phrase: 'Venha viver essa aventura no meu Jardim Encantado!',
            theme: 'Jardim Encantado',
            notes: 'Quero animais da floresta delicados, muitas flores em tom pastel de rosa e turquesa.'
        },
        debutante: {
            name: 'Giovanna',
            age: '15 anos',
            date: '2026-11-20',
            time: '21:00',
            location: 'Espaço Elegance, Rua Oscar Freire, 1024',
            phrase: 'Estou pronta para debutar e celebrar com as pessoas que mais amo!',
            theme: 'Princesa Realeza',
            notes: 'Quero algo bem delicado em rosa e dourado, com coroa sutil.'
        },
        adulto: {
            name: 'Carolina',
            age: '40 anos',
            date: '2026-09-05',
            time: '19:30',
            location: 'Bistrô das Oliveiras, Alameda Lorena, 88',
            phrase: 'Quero brindar à vida cercada de amigos!',
            theme: 'Floral Delicado',
            notes: 'Eucalipto, galhos secos, aquarela minimalista em tons verdes, ouro e off-white.'
        }
    };
    
    const data = formFields[type];
    
    document.getElementById('partyName').value = data.name;
    const presetGender = document.querySelector(`input[name="partyGender"][value="${data.gender || 'f'}"]`);
    if (presetGender) presetGender.checked = true;
    document.getElementById('partyAge').value = data.age;
    document.getElementById('partyDate').value = data.date;
    document.getElementById('partyTime').value = data.time;
    document.getElementById('partyLocation').value = data.location;
    document.getElementById('partyTheme').value = data.theme;
    document.getElementById('partyNotes').value = data.notes;
    
    nextStep(2);
    nextStep(3);
    
    const submitBtn = document.getElementById('btn-submit-generator');
    submitBtn.classList.add('animate-pulse');
    setTimeout(() => submitBtn.classList.remove('animate-pulse'), 3000);
}

// 8. SIMULATOR GENERATION RUNNER
function handleGeneratorSubmit(event) {
    if (event) event.preventDefault();
    
    const partyType = document.querySelector('input[name="partyType"]:checked').value;
    const name = document.getElementById('partyName').value;
    const age = document.getElementById('partyAge').value;
    const gender = (document.querySelector('input[name="partyGender"]:checked') || {}).value || 'f';
    const dateStr = document.getElementById('partyDate').value;
    const time = document.getElementById('partyTime').value;
    const location = document.getElementById('partyLocation').value;
    const theme = document.getElementById('partyTheme').value;
    const notes = document.getElementById('partyNotes').value;
    
    let formattedDate = 'Data Indefinida';
    let dateObj = new Date();
    if (dateStr) {
        const parts = dateStr.split('-');
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        dateObj = new Date(parts[0], parts[1]-1, parts[2]);
    }
    
    // Check Client Limits
    if (appState.currentUser.type === 'client' && !appState.config.infiniteLimit) {
        if (appState.currentUser.clientGenerationsCount >= appState.config.freeLimits) {
            alert(`Você atingiu seu limite de ${appState.config.freeLimits} gerações grátis. Para criar mais identidades, assine o plano profissional.`);
            showView('pro-sales');
            return;
        }
    }
    
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
        watermarked: appState.currentUser.type === 'client' && !appState.config.bypassPayment,
        initialLetter: name.charAt(0).toUpperCase(),
        bgTemplate: getBgTemplatePath(partyType),
        dateObj: dateObj
    };
    
    if (appState.currentUser.type === 'client') {
        appState.currentUser.clientGenerationsCount++;
    } else {
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

function getDefaultPhrase(type, name) {
    if (type === 'infantil') return 'Com grande alegria convido você para soprar as velinhas comigo!';
    if (type === 'debutante') return 'Um dia inesquecível para celebrar o início de uma linda jornada.';
    return 'Celebrar a vida é mais especial com a presença de amigos queridos!';
}

function getBgTemplatePath(type) {
    if (type === 'infantil') return 'assets/infantil_bg.jpg';
    if (type === 'debutante') return 'assets/debutante_bg.jpg';
    return 'assets/adulto_bg.jpg';
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
                applyRealAssets(apiResult.assetsUrls, apiResult.projectId, apiResult.identity, apiResult.project?.phrase, apiResult.kit);
                // Processa DNA da IA (Fontes e Ícones) da Fase 6
                if (apiResult.assetsUrls._dna) applyAiDna(apiResult.assetsUrls._dna);
            } else {
                populateResultScreen(); // modo sem backend: usa as artes de exemplo
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

// 9. DYNAMIC DATA BINDINGS & RENDERING
function populateResultScreen() {
    const p = appState.currentProject;
    
    // 1. Invitation overlay texts
    // Dados reais (gerados pela IA) => só imagens geradas. Sem backend (modo de exemplo) => artes de exemplo.
    const isReal = !!(p.assetsUrls && (p.assetsUrls.background || p.assetsUrls.convitePreview));
    const bgUrl = p.assetsUrls?.convitePreview || p.assetsUrls?.background || (isReal ? null : p.bgTemplate);
    setResultImg(document.getElementById('invite-bg-image'), bgUrl);
    
    // 2. RSVP/Reminder overlay texts
    
    // Set reminder background image to match the invitation background
    const reminderBg = document.getElementById('reminder-bg-image');
    const hasGenReminder = !!(p.assetsUrls && p.assetsUrls.lembretePreview);
    setResultImg(reminderBg, hasGenReminder ? p.assetsUrls.lembretePreview : (p.assetsUrls?.background || (isReal ? null : p.bgTemplate)));
    // O lembrete gerado pela IA já traz todos os textos dentro da arte (nada é sobreposto)
    

    // 3. Mascote official
    document.getElementById('mascot-val-title').textContent = `Mascote de ${p.name}`;
    const mascotImg = document.getElementById('mascot-img-render');
    if (mascotImg) {
        if (p.assetsUrls?.mascote) {
            setResultImg(mascotImg, p.assetsUrls.mascote);
        } else if (isReal) {
            setResultImg(mascotImg, null); // gerado de verdade, mas este item não saiu: não mostra a arte de exemplo
        } else {
            setResultImg(mascotImg, p.type === 'debutante' ? 'assets/girl_2.jpg' : 'assets/girl_1.jpg');
        }
    }

    // 4. Logo card sync
    document.getElementById('logo-val-name').textContent = p.name;
    document.getElementById('logo-val-theme').textContent = p.theme.toUpperCase();

    // 5. Custom Background render
    const bgRender = document.getElementById('custom-bg-render');
    // Lembrancinha (fundo limpo quadrado + logotipo + agradecimento): o cartão só aparece se foi gerada
    const favorUrl = p.assetsUrls && p.assetsUrls.lembrancinha;
    const favorCard = document.getElementById('lembrancinha-card');
    if (favorCard) favorCard.style.display = favorUrl ? '' : 'none';
    setResultImg(document.getElementById('lembrancinha-img'), favorUrl || null);

    // Fundo limpo: nunca mostra o convite (que tem texto) no lugar do fundo
    setResultImg(bgRender, p.assetsUrls?.fundo || (isReal ? null : p.bgTemplate));

    // 6. Elementos sheet & Papel digital
    const elemImg = document.querySelector('.elements-sheet-img');
    setResultImg(elemImg, p.assetsUrls?.elementos || (isReal ? null : 'assets/elementos_sheet.jpg'));

    const papelImg = document.querySelector('.digital-paper-img');
    if (papelImg && p.assetsUrls?.papel) papelImg.src = p.assetsUrls.papel;


    // 6. Monograms & Crest letter SVGs
    document.getElementById('brand-val-initial-crest').textContent = p.initialLetter;
    document.getElementById('brand-val-year').textContent = p.dateObj.getFullYear();
    
    // 7. Palette colors
    const colorDots = document.querySelectorAll('.color-palette-show .pal-dot');
    const palettes = {
        infantil: ['#69D7D1', '#AEEDEA', '#F7A8C8', '#FBE1EC', '#FFFFFF'],
        debutante: ['#F7A8C8', '#FBE1EC', '#DFBA73', '#FFFBEB', '#FFFFFF'],
        adulto: ['#3A7D7A', '#69D7D1', '#FBE1EC', '#DFBA73', '#FFFFFF']
    };
    const currentPal = palettes[p.type] || palettes.infantil;
    colorDots.forEach((dot, index) => {
        if (currentPal[index]) {
            dot.style.backgroundColor = currentPal[index];
            dot.title = currentPal[index];
        }
    });
    
    // 8. Pattern wallpaper
    const patternElem = document.getElementById('paper-pattern-element');
    if (p.type === 'infantil') {
        patternElem.style.backgroundColor = '#FBE1EC';
        patternElem.style.backgroundImage = `radial-gradient(#AEEDEA 15%, transparent 16%), radial-gradient(#AEEDEA 15%, transparent 16%)`;
    } else if (p.type === 'debutante') {
        patternElem.style.backgroundColor = '#FBE1EC';
        patternElem.style.backgroundImage = `radial-gradient(#DFBA73 10%, transparent 11%), radial-gradient(#DFBA73 10%, transparent 11%)`;
    } else {
        patternElem.style.backgroundColor = '#E6F4F3';
        patternElem.style.backgroundImage = `radial-gradient(#3A7D7A 8%, transparent 9%), radial-gradient(#3A7D7A 8%, transparent 9%)`;
    }
    
    if (p.identity) applyIdentity(p.identity);
    applyKitExtras(p.kit, p.assetsUrls);

    updateWatermarkVisibility();
    document.getElementById('checkout-val-theme').textContent = `Tema: ${p.theme} - ${p.name}`;
    
    // Highlight the first tab button initially on load
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
    if (appState.currentUser.type === 'client' && !appState.config.infiniteLimit) {
        if (appState.currentUser.clientGenerationsCount >= appState.config.freeLimits) {
            alert(`Você já utilizou todas as suas tentativas gratuitas (${appState.config.freeLimits} de ${appState.config.freeLimits}). Por favor, compre este kit para finalizar ou assine o plano profissional.`);
            showView('checkout');
            return;
        }
    }
    
    alert("Redirecionando para ajustar os dados! Você pode alterar o tema, as referências ou as observações para gerar outra variação.");
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

// 11. CHECKOUT & PAYMENT METHOD LOGIC
function switchPaymentMethod(method) {
    document.querySelectorAll('.payment-method-content').forEach(mc => mc.style.display = 'none');
    document.querySelectorAll('.pay-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if (method === 'pix') {
        document.getElementById('pay-method-pix').style.display = 'block';
        document.getElementById('btn-pay-pix').classList.add('active');
    } else {
        document.getElementById('pay-method-cc').style.display = 'block';
        document.getElementById('btn-pay-cc').classList.add('active');
    }
}

function copyPixKey() {
    const keyInput = document.getElementById('pixKeyInput');
    keyInput.select();
    document.execCommand('copy');
    alert("Chave Pix Copiada com sucesso!");
}

function simulatePaymentApproval() {
    appState.currentProject.watermarked = false;
    updateWatermarkVisibility();
    showView('download');
    alert("Pagamento Aprovado com Sucesso! Seu kit de 12 itens de alta resolução está liberado.");
}

// 12. DOWNLOAD & ZIP SIMULATORS
function trackDownload(fileName) {
    console.log(`Downloading ${fileName}...`);
}

function simulatePdfDownload(fileName) {
    alert(`Gerando e otimizando arquivo PDF para impressão da peça [${fileName}] em alta resolução. O download começará em seguida.`);
    
    setTimeout(() => {
        const link = document.createElement('a');
        link.href = appState.currentProject.bgTemplate;
        link.download = `Alta_Resolucao_${fileName}_Meraki.jpg`;
        link.click();
    }, 1500);
}

function simulateZipDownload() {
    alert("Compactando todos os elementos individuais (brasão, monograma, laços, mascotes) + papéis digitais + convites sem marca d'água em um arquivo ZIP de alta resolução.");
    
    setTimeout(() => {
        const link = document.createElement('a');
        link.href = 'assets/elementos_sheet.jpg';
        link.download = `Kit_Identidade_Visual_Completo_Meraki.zip`;
        link.click();
    }, 2000);
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
        localStorage.removeItem('meraki_state_collage_v3');
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
                proDailyCount: 2,
                proMonthlyCount: 18
            },
            currentProject: {
                id: 101,
                type: 'infantil',
                name: 'Helena',
                age: '5 anos',
                date: '12/10/2026',
                time: '15:30',
                location: 'Buffet Jardim Secreto, Av. das Américas, 500',
                phrase: 'Venha viver essa aventura no meu Jardim Encantado!',
                theme: 'Jardim Encantado',
                notes: 'Quero tons pastel.',
                photos: [],
                references: [],
                watermarked: true,
                bgTemplate: 'assets/infantil_bg.jpg',
                initialLetter: 'H',
                dateObj: new Date(2026, 9, 12)
            },
            projectsDb: [
                { id: 101, name: 'Helena', type: 'infantil', theme: 'Jardim Encantado', status: 'Finalizado', date: '12/10/2026' },
                { id: 102, name: 'Laura', type: 'debutante', theme: 'Princesa Boho', status: 'Em criação', date: '26/08/2026' },
                { id: 103, name: 'Mariana', type: 'adulto', theme: 'Floral Delicado', status: 'Finalizado', date: '24/08/2026' }
            ]
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
    const checkoutPrice = document.getElementById('checkout-val-price');
    if (checkoutPrice) checkoutPrice.textContent = `R$ ${appState.config.kitPrice.toFixed(2)}`;
    
    const badge = document.getElementById('user-badge');
    if (badge) {
        if (appState.currentUser.type === 'pro') {
            badge.textContent = 'Pro';
        } else {
            badge.textContent = 'Cliente';
        }
    }
    
    const regenCount = document.getElementById('btn-regen-count');
    if (regenCount) {
        const remaining = Math.max(0, appState.config.freeLimits - appState.currentUser.clientGenerationsCount);
        regenCount.textContent = appState.config.infiniteLimit ? 'Ilimitado' : `${remaining} restantes`;
    }
    const clientGenerationsBadge = document.getElementById('client-generations-badge');
    if (clientGenerationsBadge) {
        clientGenerationsBadge.textContent = `Tentativa ${appState.currentUser.clientGenerationsCount} de ${appState.config.freeLimits}`;
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
    
    const mockDetails = {
        Helena: {
            type: 'infantil',
            name: 'Helena',
            age: '5 anos',
            date: '12/10/2026',
            time: '15:30',
            location: 'Buffet Jardim Secreto, Av. das Américas, 500',
            phrase: 'Venha viver essa aventura no meu Jardim Encantado!',
            theme: 'Jardim Encantado',
            notes: 'Quero tons pastel.',
            watermarked: appState.currentUser.type === 'client' && !appState.config.bypassPayment,
            bgTemplate: 'assets/infantil_bg.jpg',
            initialLetter: 'H',
            dateObj: new Date(2026, 9, 12)
        },
        Laura: {
            type: 'debutante',
            name: 'Laura',
            age: '15 anos',
            date: '26/08/2026',
            time: '20:00',
            location: 'Mansão das Estrelas, Bloco B',
            phrase: 'Um marco especial da minha vida para dividir com você!',
            theme: 'Princesa Boho',
            watermarked: appState.currentUser.type === 'client' && !appState.config.bypassPayment,
            bgTemplate: 'assets/debutante_bg.jpg',
            initialLetter: 'L',
            dateObj: new Date(2026, 7, 26)
        },
        Mariana: {
            type: 'adulto',
            name: 'Mariana',
            age: '40 anos',
            date: '05/09/2026',
            time: '19:30',
            location: 'Bistrô das Oliveiras, Alameda Lorena, 88',
            phrase: 'Quero brindar à vida cercada de amigos!',
            theme: 'Floral Delicado',
            watermarked: appState.currentUser.type === 'client' && !appState.config.bypassPayment,
            bgTemplate: 'assets/adulto_bg.jpg',
            initialLetter: 'M',
            dateObj: new Date(2026, 8, 5)
        }
    };
    
    const details = mockDetails[proj.name] || {
        type: proj.type,
        name: proj.name,
        age: 'Festa',
        date: proj.date,
        time: '19:00',
        location: 'Salão de Festas Residencial',
        phrase: 'Venha celebrar!',
        theme: proj.theme,
        watermarked: appState.currentUser.type === 'client' && !appState.config.bypassPayment,
        bgTemplate: getBgTemplatePath(proj.type),
        initialLetter: proj.name.charAt(0).toUpperCase(),
        dateObj: new Date()
    };
    
    appState.currentProject = { id: proj.id, ...details };
    
    populateResultScreen();
    showView('result');
}
