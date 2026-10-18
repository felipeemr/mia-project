/* =============================================================================
   MERAKI — Rota de Geração de Kit com IA (/api/generate)
   Pipeline completo: IA → Storage → Renderização → Banco de Dados
   ============================================================================= */

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');

const { supabaseAdmin }            = require('../services/supabase');
const { generateKitImages }        = require('../services/ai');
const { uploadFromUrl, uploadBuffer } = require('../services/storage');
const { renderConvite, renderLembrete, createThumbnail } = require('../services/renderer');
const { buildIdentity } = require('../services/identity');
const { generateKitExtras } = require('../services/kit');
const { pickPhrase } = require('../services/phrases');
const { optionalAuth }             = require('../middleware/auth');

// Multer em memória para upload de fotos do formulário
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Caminho para os fundos padrão (fallback quando IA falha)
const ASSETS_PATH = path.join(__dirname, '..', '..', 'assets');
const DEFAULT_BG  = {
    infantil:  path.join(ASSETS_PATH, 'infantil_bg.jpg'),
    debutante: path.join(ASSETS_PATH, 'debutante_bg.jpg'),
    adulto:    path.join(ASSETS_PATH, 'adulto_bg.jpg'),
};

// ---------------------------------------------------------------------------
// Verificação de limites de geração
// ---------------------------------------------------------------------------
async function checkGenerationLimits(userId, userType, config = {}) {
    if (config.infiniteLimit) return { allowed: true };

    if (!userId) {
        // Usuário anônimo: verificamos por IP/sessão no frontend (limitação client-side)
        return { allowed: true };
    }

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_type, daily_count, monthly_count, last_reset_date')
        .eq('id', userId)
        .single();

    if (!profile) return { allowed: true };

    // Reset diário se necessário
    const today = new Date().toISOString().split('T')[0];
    if (profile.last_reset_date !== today) {
        await supabaseAdmin
            .from('profiles')
            .update({ daily_count: 0, last_reset_date: today })
            .eq('id', userId);
        profile.daily_count = 0;
    }

    if (profile.user_type === 'pro') {
        const dailyLimit   = config.proDailyLimit   || 6;
        const monthlyLimit = config.proMonthlyLimit  || 60;
        if (profile.daily_count   >= dailyLimit)   return { allowed: false, reason: `Limite diário (${dailyLimit}) atingido.` };
        if (profile.monthly_count >= monthlyLimit)  return { allowed: false, reason: `Limite mensal (${monthlyLimit}) atingido.` };
    }
    // Cliente free: limite verificado no frontend (a rota não bloqueia por ora)
    return { allowed: true };
}

const ALL_KIT_ITEMS = ['mascote', 'elementos', 'fundo', 'logo', 'lembrete', 'brasao', 'lembrancinha'];

// Guarda os itens do kit no Supabase; se falhar, devolve a imagem embutida (data URL) só para esta resposta
async function saveKitExtras(extras, pid) {
    const saveBuf = async (buf, name) => {
        if (!buf) return null;
        try { return await uploadBuffer(buf, `projects/${pid}/${name}`, 'image/png'); }
        catch (e) {
            console.warn(`[Generate] Falha ao salvar ${name} no storage: ${e.message}`);
            return `data:image/png;base64,${buf.toString('base64')}`;
        }
    };
    const saveList = (list, prefix) => Promise.all((list || []).map((e, i) => saveBuf(e.png, `${prefix}_${String(i + 1).padStart(2, '0')}.png`)));
    const [mascote, elementos, fundo, papel, principais, complementares, logo, lembrete, brasao, lembrancinha] = await Promise.all([
        saveBuf(extras.mascote, 'mascote.png'),
        saveBuf(extras.elementosSheet, 'prancha_elementos.png'),
        saveBuf(extras.fundo, 'fundo_limpo.png'),
        saveBuf(extras.papel, 'papel_digital.png'),
        saveList(extras.principais, 'elemento_principal'),
        saveList(extras.complementares, 'elemento_complementar'),
        saveBuf(extras.logo, 'logotipo.png'),
        saveBuf(extras.lembrete, 'lembrete.png'),
        saveBuf(extras.brasao, 'brasao.png'),
        saveBuf(extras.lembrancinha, 'lembrancinha.png'),
    ]);
    return {
        urls: { mascote, elementos, fundo, papel, logo, lembrete, brasao, lembrancinha },
        kit: { principais: principais.filter(Boolean), complementares: complementares.filter(Boolean) },
    };
}

// ---------------------------------------------------------------------------
// POST /api/generate — Pipeline principal de geração
// ---------------------------------------------------------------------------

router.post('/', optionalAuth, upload.fields([
    { name: 'photos', maxCount: 1 },
    { name: 'references', maxCount: 5 }
]), async (req, res) => {
    // Todos os campos do formulário são obrigatórios: nada é preenchido por conta do servidor
    const body = req.body || {};
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const faltando = [];
    if (!['infantil', 'debutante', 'adulto'].includes(str(body.type))) faltando.push('tipo de festa');
    if (!str(body.name))     faltando.push('nome');
    if (!str(body.age))      faltando.push('idade');
    if (!['m', 'f'].includes(str(body.gender))) faltando.push('menino ou menina');
    if (!str(body.date))     faltando.push('data da festa');
    if (!str(body.time))     faltando.push('horário');
    if (!str(body.location)) faltando.push('local');
    if (!str(body.theme))    faltando.push('tema');
    if (!(req.files?.photos?.length)) faltando.push('foto da criança');
    if (faltando.length) {
        return res.status(400).json({ error: `Preencha todos os campos obrigatórios: ${faltando.join(', ')}.` });
    }

    const projectData = {
        type:     str(body.type),
        name:     str(body.name),
        age:      str(body.age),
        date:     str(body.date),
        time:     str(body.time),
        location: str(body.location),
        gender:   str(body.gender),                        // menino/menina: define "Obrigado"/"Obrigada" na lembrancinha
        phrase:   pickPhrase(str(body.type)),              // sorteada pelo sistema (frases curtas e genéricas)
        theme:    str(body.theme),
        notes:    str(body.notes),                         // único campo opcional (observações livres)
    };
    projectData.initialLetter = projectData.name.charAt(0).toUpperCase();

    const childPhotos     = req.files?.photos     || [];
    const inspirationRefs = req.files?.references || [];

    console.log(`\n[Generate] Nova requisição: ${projectData.name} (${projectData.type}) - Fotos da criança: ${childPhotos.length} | Referências: ${inspirationRefs.length}`);

    // --- 1. Verificar limites ---
    const limitCheck = await checkGenerationLimits(
        req.user?.id, req.user?.user_type
    );
    if (!limitCheck.allowed) {
        return res.status(429).json({ error: limitCheck.reason });
    }

    // --- 2. Criar registro no banco com status 'generating' ---
    let projectId = null;
    try {
        // initialLetter (camelCase) não é coluna da tabela: vai como initial_letter
        const { initialLetter: _ignored, gender: _gender, ...dbFields } = projectData;
        const { data: projectRecord, error: insertError } = await supabaseAdmin
            .from('projects')
            .insert({
                user_id:       req.user?.id || null,
                ...dbFields,
                initial_letter: projectData.initialLetter,
                bg_template:   DEFAULT_BG[projectData.type],
                status:        'generating',
                watermarked:   true,
                assets_urls:   {},
            })
            .select('id')
            .single();

        if (insertError) console.warn('[Generate] Aviso: projeto não salvo no banco:', insertError.message);
        if (projectRecord) projectId = projectRecord.id;
    } catch (dbErr) {
        console.warn('[Generate] Aviso: não foi possível salvar projeto no banco:', dbErr.message);
    }

    // Pasta única desta geração no armazenamento. Sem projeto no banco, usa um id aleatório:
    // caminhos fixos eram sobrescritos e a CDN devolvia imagens de gerações anteriores.
    const storageId = projectId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // --- 3. Definir fundo: tenta IA, cai em padrão se falhar ---
    let bgBuffer    = null;
    let assetsUrls  = {};
    let aiDna       = null;
    let kitProvider = null; // provedor que gerou o convite: o kit segue o mesmo
    const bgDefault = DEFAULT_BG[projectData.type];

    try {
        const aiAvailable = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

        if (aiAvailable) {
            console.log('[Generate] Chamando API de IA para geração das imagens...');
            const aiImages = await generateKitImages(projectData, childPhotos, inspirationRefs);
            aiDna = aiImages._dna || null;
            kitProvider = aiImages._provider || null;
            assetsUrls.kit_provider = kitProvider;

            // Salva cada imagem no Supabase Storage com URL permanente
            const savePromises = Object.entries(aiImages).map(async ([key, url]) => {
                if (!url || key === '_dna' || key === '_provider') return; // Ignora _dna, pois não é uma URL de imagem
                try {
                    const savedUrl = await uploadFromUrl(url, `projects/${storageId}/${key}.png`);
                    assetsUrls[key] = savedUrl;
                } catch (e) {
                    console.warn(`[Generate] Falha ao salvar ${key}:`, e.message);
                    // Fallback: se o Supabase falhar (offline/ENOTFOUND), usamos a URL original da IA
                    assetsUrls[key] = url;
                }
            });
            await Promise.all(savePromises);

            // Usa o convite que a IA acabou de gerar. IMPORTANTE: vem da memória (Data URI) ou da URL original da IA,
            // e NÃO da URL pública do Supabase: ela pode devolver, pelo cache da CDN, o convite de uma geração anterior
            // (isso fazia mascote, prancha e fundo saírem com o tema do convite antigo).
            const rawBg = aiImages.background;
            if (rawBg) {
                if (rawBg.startsWith('data:')) {
                    bgBuffer = Buffer.from(rawBg.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                } else {
                    const axios = require('axios');
                    const resp  = await axios.get(rawBg, { responseType: 'arraybuffer', timeout: 30000 });
                    bgBuffer    = Buffer.from(resp.data);
                }
            }
        }
    } catch (aiErr) {
        console.error('[Generate] Falha crítica ao processar imagens da IA:', aiErr.message);
        
        // Atualiza status no banco para falha se possível
        if (projectId) {
            await supabaseAdmin.from('projects').update({ status: 'failed' }).eq('id', projectId);
        }

        // Interrompe a requisição e retorna erro pro frontend (removemos o mockup padrão)
        return res.status(500).json({ 
            error: 'Não foi possível gerar a arte. Por favor, olhe os logs do servidor para mais detalhes.', 
            detail: aiErr.message 
        });
    }

    // Se o buffer for inválido por qualquer outro motivo, rejeitamos para evitar gerar imagem com fundo vazio
    if (!bgBuffer) {
        console.error('[Generate] ERRO: bgBuffer está vazio. Estado atual:');
        console.error('  -> assetsUrls.background:', !!assetsUrls.background, typeof assetsUrls.background === 'string' ? assetsUrls.background.substring(0, 50) + '...' : assetsUrls.background);
        console.error('  -> projectId:', projectId);
        return res.status(500).json({ error: 'Falha na obtenção da imagem base gerada.' });
    }

    // --- 4. Renderizar lembrete em alta resolução ---
    let conviteUrl   = null;
    let lembreteUrl  = null;
    let conviteThumb = null;

    try {
        // O thumbnail do convite será feito usando a imagem pura do DALL-E 3 (bgBuffer)
        conviteThumb = await createThumbnail(bgBuffer, 600);

        if (projectId) {
            // Se a IA gerou um lembrete nativo, usamos ele como preview
            lembreteUrl = assetsUrls.lembrete || null;
            await uploadBuffer(conviteThumb, `projects/${storageId}/convite_thumb.jpg`,    'image/jpeg');
        }

        assetsUrls.convite_preview  = null; // Usará background
        assetsUrls.lembrete_preview = lembreteUrl;
    } catch (renderErr) {
        console.warn('[Generate] Aviso na renderização:', renderErr.message);
    }

    // --- 4b. Identidade visual (paleta e fontes) derivada da arte do convite: sem custo de IA ---
    let identity = null;
    try {
        identity = await buildIdentity(projectData, bgBuffer, aiDna);
    } catch (idErr) {
        console.warn('[Generate] Aviso ao montar identidade visual:', idErr.message);
    }

    // --- 4c. Itens extras do kit (mascote, prancha, elementos, fundo, papel), coerentes com o convite ---
    // Desligue com KIT_EXTRAS=off no .env (cada geração custa ~US$ 0,27 a mais).
    let kit = null;
    let kitMissing = [];
    let kitQuota = false;
    const kitUrls = {};
    if (process.env.KIT_EXTRAS !== 'off' && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)) {
        try {
            const extras = await generateKitExtras({
                invitation: bgBuffer,
                childPhoto: childPhotos[0]?.buffer || null,
                themeText: projectData.theme,
                provider: kitProvider,
                palette: identity?.palette || null,
                name: projectData.name,
                age: projectData.age,
                gender: projectData.gender,
                project: { date: projectData.date, time: projectData.time, location: projectData.location },
            });

            const saved = await saveKitExtras(extras, storageId);
            Object.assign(kitUrls, saved.urls);
            kit = saved.kit;
            kitMissing = extras.missing || [];
            kitQuota = !!extras.quota;

            // No banco entram só URLs de verdade (nunca imagens embutidas)
            const http = u => (u && /^https?:/.test(u)) ? u : null;
            for (const k of ['mascote', 'elementos', 'fundo', 'papel', 'logo', 'lembrete', 'brasao', 'lembrancinha']) if (http(kitUrls[k])) assetsUrls[k] = kitUrls[k];
            assetsUrls.kit_files = {
                principais: kit.principais.filter(http), complementares: kit.complementares.filter(http),
            };
        } catch (kitErr) {
            console.warn('[Generate] Aviso ao gerar itens extras do kit:', kitErr.message);
            kitMissing = ALL_KIT_ITEMS.slice();
        }
    }

    // --- 5. Atualizar status do projeto no banco ---
    if (projectId) {
        try {
            await supabaseAdmin
                .from('projects')
                .update({ status: 'preview', assets_urls: assetsUrls })
                .eq('id', projectId);
        } catch (updateErr) {
            console.warn('[Generate] Aviso ao atualizar projeto:', updateErr.message);
        }
    }

    // --- 6. Incrementar contador de gerações ---
    if (req.user?.id) {
        try {
            await supabaseAdmin.rpc('increment_generation_count', { user_uuid: req.user.id });
        } catch (_) { /* ignora erros de contador */ }
    }

    console.log(`[Generate] ✅ Concluído para "${projectData.name}"`);

    // --- 7. Retornar resposta ao frontend ---
    const timestamp = Date.now();
    const applyCacheBuster = (url) => (url && url.startsWith('http') ? `${url}?t=${timestamp}` : url);

    res.json({
        projectId,
        status:     'preview',
        assetsUrls: {
            // Imagens geradas por IA (com cache-buster para forçar a atualização no navegador)
            background:   applyCacheBuster(assetsUrls.background),
            mascote:      applyCacheBuster(kitUrls.mascote   || assetsUrls.mascote),
            elementos:    applyCacheBuster(kitUrls.elementos || assetsUrls.elementos),
            fundo:        applyCacheBuster(kitUrls.fundo     || assetsUrls.fundo),
            papel:        applyCacheBuster(kitUrls.papel     || assetsUrls.papel),
            logo:         applyCacheBuster(kitUrls.logo      || assetsUrls.logo),
            // Convite e lembrete renderizados em alta resolução
            convitePreview:  applyCacheBuster(assetsUrls.convite_preview),
            lembretePreview: applyCacheBuster(kitUrls.lembrete || assetsUrls.lembrete_preview),
            brasao:          applyCacheBuster(kitUrls.brasao),
            lembrancinha:    applyCacheBuster(kitUrls.lembrancinha),
            // DNA Visual extraído (tipografia, ícones)
            _dna:            aiDna,
        },
        identity,
        kit,
        kitMissing,
        kitQuota,
        project: {
            ...projectData,
            id: projectId,
            watermarked: true,
        },
    });
});

// ---------------------------------------------------------------------------
// GET /api/generate/status/:projectId — Consulta status de geração assíncrona
// ---------------------------------------------------------------------------
router.get('/status/:projectId', optionalAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('projects')
            .select('id, status, assets_urls, watermarked')
            .eq('id', req.params.projectId)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Projeto não encontrado.' });

        res.json({
            projectId:  data.id,
            status:     data.status,
            assetsUrls: data.assets_urls || {},
            watermarked: data.watermarked,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/generate/retry/:projectId — Refaz só os itens do kit que não saíram
// body (multipart): items (JSON ["mascote",...]), photos (opcional: necessária para o mascote)
// ---------------------------------------------------------------------------
router.post('/retry/:projectId', optionalAuth, upload.fields([{ name: 'photos', maxCount: 1 }]), async (req, res) => {
    try {
        const items = (() => { try { return JSON.parse(req.body.items || '[]'); } catch { return []; } })()
            .filter(k => ALL_KIT_ITEMS.includes(k));
        if (!items.length) return res.status(400).json({ error: 'Nenhum item informado para refazer.' });

        const { data: proj, error } = await supabaseAdmin.from('projects').select('*').eq('id', req.params.projectId).single();
        if (error || !proj) return res.status(404).json({ error: 'Projeto não encontrado.' });
        const urls = proj.assets_urls || {};
        if (!urls.background) return res.status(400).json({ error: 'Convite original não encontrado.' });

        const axios = require('axios');
        const fetchBuf = async (u) => Buffer.from((await axios.get(u, { responseType: 'arraybuffer', timeout: 30000 })).data);
        const invitation = await fetchBuf(urls.background);
        const existing = {};
        if (items.includes('lembrancinha')) {
            if (urls.fundo) existing.fundo = await fetchBuf(urls.fundo).catch(() => null);
            if (urls.logo)  existing.logo  = await fetchBuf(urls.logo).catch(() => null);
        }

        console.log(`[Retry] ${proj.name}: refazendo ${items.join(', ')}`);
        const extras = await generateKitExtras({
            invitation,
            childPhoto: req.files?.photos?.[0]?.buffer || null,
            themeText: proj.theme,
            palette: null,
            name: proj.name,
            age: proj.age,
            gender: ['m', 'f'].includes(req.body.gender) ? req.body.gender : (proj.gender || 'f'),   // a coluna gender não existe no banco: vem do formulário
            project: { date: proj.date, time: proj.time, location: proj.location },
            only: items,
            existing,
            provider: urls.kit_provider || null,
        });

        // Mesma pasta da geração original; o carimbo na URL evita devolver a imagem antiga pelo cache
        const saved = await saveKitExtras(extras, req.params.projectId);
        const http = u => (u && /^https?:/.test(u)) ? u : null;
        const merged = { ...urls };
        for (const k of Object.keys(saved.urls)) if (http(saved.urls[k])) merged[k] = saved.urls[k];
        try { await supabaseAdmin.from('projects').update({ assets_urls: merged }).eq('id', req.params.projectId); } catch (_) { /* segue sem salvar */ }

        const t = Date.now();
        const bust = (u) => (u && u.startsWith('http') ? `${u}?t=${t}` : u);
        res.json({
            assetsUrls: {
                mascote: bust(saved.urls.mascote), elementos: bust(saved.urls.elementos), fundo: bust(saved.urls.fundo),
                papel: bust(saved.urls.papel), logo: bust(saved.urls.logo), lembretePreview: bust(saved.urls.lembrete),
                brasao: bust(saved.urls.brasao), lembrancinha: bust(saved.urls.lembrancinha),
            },
            kit: items.includes('elementos') ? saved.kit : null,
            kitMissing: extras.missing || [],
            kitQuota: !!extras.quota,
        });
    } catch (err) {
        console.error('[Retry] Erro:', err.message);
        res.status(500).json({ error: 'Não foi possível refazer os itens agora.' });
    }
});

module.exports = router;
