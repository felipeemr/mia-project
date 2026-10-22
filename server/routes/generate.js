/* =============================================================================
   MERAKI — Rota de Geração (/api/generate)

   FLUXO
     1) POST /                 prévia grátis: SÓ convite + lembrete, com marca d'água (2 tentativas por e-mail)
     2) pagamento              (routes/payments.js) libera o projeto
     3) POST /regenerate/:id   depois de pago, até 2 novas versões do convite + lembrete (sem marca)
     4) POST /kit/:id          gera o resto do kit a partir do convite aprovado (em segundo plano)
     5) GET  /kit/:id/status   acompanha a geração do kit
     6) GET  /project/:id      estado do projeto (retomar a tela, voltar do pagamento)

   A arte limpa fica em bucket PRIVADO; o navegador só recebe a prévia já marcada até o pagamento.
   ============================================================================= */

const express  = require('express');
const router   = express.Router();
const sharp    = require('sharp');
const multer   = require('multer');

const { supabaseAdmin }  = require('../services/supabase');
const { generateKitImages } = require('../services/ai');
const { uploadBuffer, uploadPrivate, downloadPrivate, removePrivate } = require('../services/storage');
const { buildIdentity }  = require('../services/identity');
const { generateKitExtras } = require('../services/kit');
const { pickPhrase }     = require('../services/phrases');
const { makePreview }    = require('../services/preview');
const orders             = require('../services/orders');
const { optionalAuth }   = require('../middleware/auth');

// Multer em memória para upload de fotos do formulário
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const KIT_ITEMS = ['mascote', 'elementos', 'fundo', 'logo', 'brasao', 'lembrancinha'];   // o lembrete já vem da prévia
const AI_AVAILABLE = () => !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const bust = (u, t) => (u && /^https?:/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}t=${t}` : u);

// ---------------------------------------------------------------------------
// Limites do profissional logado (cliente comum é controlado por e-mail, abaixo)
// ---------------------------------------------------------------------------
async function proLimitReason(userId) {
    if (!userId) return null;
    const { data: profile } = await supabaseAdmin.from('profiles')
        .select('user_type, daily_count, monthly_count, last_reset_date').eq('id', userId).single();
    if (!profile || profile.user_type !== 'pro') return null;
    const today = new Date().toISOString().split('T')[0];
    if (profile.last_reset_date !== today) {
        await supabaseAdmin.from('profiles').update({ daily_count: 0, last_reset_date: today }).eq('id', userId);
        profile.daily_count = 0;
    }
    if (profile.daily_count >= 6) return 'Limite diário (6) atingido.';
    if (profile.monthly_count >= 60) return 'Limite mensal (60) atingido.';
    return null;
}

// ---------------------------------------------------------------------------
// Convite + lembrete (a parte que o cliente vê de graça, com marca d'água)
// ---------------------------------------------------------------------------
async function makeInvitationAndReminder(data, photoBuffer, refs = []) {
    const projectData = { ...data };
    const childPhotos = photoBuffer ? [{ buffer: photoBuffer }] : [];
    const aiImages = await generateKitImages(projectData, childPhotos, refs);
    const raw = aiImages.background;
    if (!raw) throw new Error('A IA não devolveu o convite.');
    let invitation;
    if (raw.startsWith('data:')) invitation = Buffer.from(raw.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    else invitation = Buffer.from((await require('axios').get(raw, { responseType: 'arraybuffer', timeout: 30000 })).data);
    const provider = aiImages._provider || null;

    // Lembrete no estilo do convite aprovado (mesmo provedor do convite)
    let reminder = null, reminderQuota = false;
    if (AI_AVAILABLE() && process.env.KIT_EXTRAS !== 'off') {
        try {
            const r = await generateKitExtras({
                invitation, only: ['lembrete'], provider, name: projectData.name, age: projectData.age,
                gender: projectData.gender, themeText: projectData.theme,
                project: { date: projectData.date, time: projectData.time, location: projectData.location },
            });
            reminder = r.lembrete || null;
            reminderQuota = !!r.quota;
        } catch (e) { console.warn('[Generate] Lembrete falhou:', e.message); }
    }
    return { invitation, reminder, reminderQuota, provider };
}

/** Guarda a arte limpa (privado) e a prévia marcada (público). Devolve o que vai para assets_urls. */
async function storeInvitation(id, { invitation, reminder, provider }) {
    const t = Date.now();
    const out = { kit_provider: provider, preview_t: t };
    await uploadPrivate(invitation, `projects/${id}/convite.png`, 'image/png');
    out.priv_convite = `projects/${id}/convite.png`;
    out.preview_convite = await uploadBuffer(await makePreview(invitation), `projects/${id}/preview_convite.jpg`, 'image/jpeg');
    if (reminder) {
        await uploadPrivate(reminder, `projects/${id}/lembrete.png`, 'image/png');
        out.priv_lembrete = `projects/${id}/lembrete.png`;
        out.preview_lembrete = await uploadBuffer(await makePreview(reminder), `projects/${id}/preview_lembrete.jpg`, 'image/jpeg');
    } else {
        out.priv_lembrete = null; out.preview_lembrete = null;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Visão do projeto para o navegador (nunca inclui e-mail nem caminhos privados)
// ---------------------------------------------------------------------------
async function projectView(project, userId) {
    const u = project.assets_urls || {};
    const unlocked = await orders.isUnlocked(project, userId);
    const t = u.preview_t || Date.now();
    const view = {
        projectId: project.id,
        project: { name: project.name, type: project.type, age: project.age, date: project.date, time: project.time, location: project.location, theme: project.theme, phrase: project.phrase, gender: u.gender || null },
        unlocked,
        price: orders.PRICE(),
        watermarked: !unlocked,
    };
    if (!unlocked) {
        const allow = await orders.previewAllowance(u.owner_email || '');
        view.attempts = { used: allow.used, allowed: allow.allowed, left: allow.left };
        view.assetsUrls = { convitePreview: bust(u.preview_convite, t), lembretePreview: bust(u.preview_lembrete, t) };
        return view;
    }
    const clean = (name) => `/api/downloads/${project.id}/view/${name}.jpg?t=${t}`;
    view.assetsUrls = { convitePreview: u.priv_convite ? clean('convite') : null, lembretePreview: u.priv_lembrete ? clean('lembrete') : null };
    view.regen = { used: u.regen_used || 0, allowed: orders.PAID_REGENS(), left: Math.max(0, orders.PAID_REGENS() - (u.regen_used || 0)) };
    const state = orders.kitState(project);
    view.kit = { state, missing: u.kit_missing || [], quota: !!u.kit_quota };
    if (state === 'ready' || state === 'partial') {
        const kt = u.kit_t || t;
        for (const k of ['mascote', 'elementos', 'fundo', 'papel', 'logo', 'brasao', 'lembrancinha']) if (u[k]) view.assetsUrls[k] = bust(u[k], kt);
        view.kit.files = {
            principais: (u.kit_files?.principais || []).map(x => bust(x, kt)),
            complementares: (u.kit_files?.complementares || []).map(x => bust(x, kt)),
        };
        view.identity = u.identity || null;
    }
    return view;
}

// ---------------------------------------------------------------------------
// POST /api/generate — prévia grátis (convite + lembrete com marca d'água)
// ---------------------------------------------------------------------------
router.post('/', optionalAuth, upload.fields([{ name: 'photos', maxCount: 1 }, { name: 'references', maxCount: 5 }]), async (req, res) => {
    const body = req.body || {};
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
    const email = orders.normEmail(body.email);
    if (!orders.validEmail(email)) faltando.push('e-mail válido');
    if (faltando.length) return res.status(400).json({ error: `Preencha todos os campos obrigatórios: ${faltando.join(', ')}.` });

    // --- Travas de custo: e-mail, IP e total do dia ---
    try {
        const ip = req.ip || req.socket?.remoteAddress || 'ip';
        if (!orders.ipAllowed(ip)) return res.status(429).json({ code: 'LIMIT', error: 'Muitas tentativas deste dispositivo hoje. Tente novamente amanhã.' });
        if (await orders.todayCount() >= orders.MAX_PER_DAY()) return res.status(503).json({ code: 'BUSY', error: 'Estamos com muita procura hoje. Tente novamente amanhã.' });
        const allow = await orders.previewAllowance(email);
        if (allow.left <= 0) {
            return res.status(429).json({ code: 'LIMIT', error: `Você usou suas ${allow.allowed} prévias gratuitas. Escolha a que mais gostou e libere o kit completo.` });
        }
        const proReason = await proLimitReason(req.user?.id);
        if (proReason) return res.status(429).json({ code: 'LIMIT', error: proReason });
        orders.ipRegister(ip);
    } catch (e) {
        console.error('[Generate] Falha ao conferir limites:', e.message);
        return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
    }

    const projectData = {
        type: str(body.type), name: str(body.name), age: str(body.age), date: str(body.date), time: str(body.time),
        location: str(body.location), gender: str(body.gender), phrase: pickPhrase(str(body.type)),
        theme: str(body.theme), notes: str(body.notes),
    };
    const photo = req.files.photos[0].buffer;
    const refs = req.files?.references || [];
    console.log(`\n[Generate] Prévia: ${projectData.name} (${projectData.type}) | referências: ${refs.length}`);

    // --- Cria o projeto (o banco é obrigatório: é ele que liga pagamento e arquivos) ---
    let projectId = null;
    try {
        const { data: rec, error } = await supabaseAdmin.from('projects').insert({
            user_id: req.user?.id || null,
            type: projectData.type, name: projectData.name, age: projectData.age, date: projectData.date, time: projectData.time,
            location: projectData.location, phrase: projectData.phrase, theme: projectData.theme, notes: projectData.notes,
            initial_letter: projectData.name.charAt(0).toUpperCase(),
            status: 'generating', watermarked: true,
            assets_urls: { owner_email: email, gender: projectData.gender, kit_state: 'none', regen_used: 0 },
        }).select('id').single();
        if (error) throw new Error(error.message);
        projectId = rec.id;
    } catch (e) {
        console.error('[Generate] Não foi possível criar o projeto:', e.message);
        return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
    }

    try {
        if (!AI_AVAILABLE()) throw new Error('Nenhuma API de IA configurada.');
        const made = await makeInvitationAndReminder(projectData, photo, refs);

        // Foto da criança fica no bucket privado só para gerar o mascote depois; é apagada quando o kit termina
        const jpeg = await sharp(photo).rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
        await uploadPrivate(jpeg, `projects/${projectId}/foto.jpg`, 'image/jpeg');

        const stored = await storeInvitation(projectId, made);
        stored.priv_foto = `projects/${projectId}/foto.jpg`;
        await orders.patchAssets(projectId, stored, { status: 'preview' });

        if (req.user?.id) { try { await supabaseAdmin.rpc('increment_generation_count', { user_uuid: req.user.id }); } catch (_) { /* ignora */ } }
        console.log(`[Generate] ✅ Prévia pronta para "${projectData.name}" (${made.provider || '?'}) lembrete=${!!made.reminder}`);

        const project = await orders.getProject(projectId);
        res.json({ ...(await projectView(project, req.user?.id)), reminderMissing: !made.reminder, reminderQuota: made.reminderQuota });
    } catch (err) {
        console.error('[Generate] Falha ao gerar a prévia:', err.message);
        try { await supabaseAdmin.from('projects').update({ status: 'failed' }).eq('id', projectId); } catch (_) { /* ignora */ }
        res.status(500).json({ error: 'Não foi possível gerar a arte agora. Isso não gastou nenhuma das suas tentativas.', detail: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/generate/project/:id — estado do projeto
// ---------------------------------------------------------------------------
router.get('/project/:projectId', optionalAuth, async (req, res) => {
    try {
        const project = await orders.getProject(req.params.projectId);
        if (!project || project.status === 'failed') return res.status(404).json({ error: 'Projeto não encontrado.' });
        res.json(await projectView(project, req.user?.id));
    } catch (err) {
        res.status(500).json({ error: 'Não foi possível carregar o projeto.' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/generate/regenerate/:id — depois de pago: nova versão do convite + lembrete (sem marca)
// ---------------------------------------------------------------------------
router.post('/regenerate/:projectId', optionalAuth, upload.none(), async (req, res) => {
    try {
        const project = await orders.getProject(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
        if (!(await orders.isUnlocked(project, req.user?.id))) return res.status(402).json({ error: 'Libere o kit para criar novas versões.' });
        const u = project.assets_urls || {};
        const state = orders.kitState(project);
        if (state !== 'none') return res.status(409).json({ error: 'O kit já foi gerado a partir de um convite. Não é possível trocar o convite agora.' });
        if ((u.regen_used || 0) >= orders.PAID_REGENS()) return res.status(429).json({ error: 'Você já usou suas novas versões.' });

        // Reserva a tentativa antes de gastar (evita duplo clique)
        await orders.patchAssets(project.id, { regen_used: (u.regen_used || 0) + 1 });
        const photo = u.priv_foto ? await downloadPrivate(u.priv_foto).catch(() => null) : null;
        const data = { type: project.type, name: project.name, age: project.age, date: project.date, time: project.time, location: project.location,
            gender: u.gender || 'f', phrase: pickPhrase(project.type), theme: project.theme, notes: project.notes || '' };
        console.log(`\n[Generate] Nova versão (paga) de "${project.name}" (${(u.regen_used || 0) + 1}/${orders.PAID_REGENS()})`);

        let made;
        try { made = await makeInvitationAndReminder(data, photo, []); }
        catch (e) {                                     // falhou: devolve a tentativa
            await orders.patchAssets(project.id, { regen_used: u.regen_used || 0 });
            throw e;
        }
        const stored = await storeInvitation(project.id, made);
        await orders.patchAssets(project.id, stored, { phrase: data.phrase });
        res.json(await projectView(await orders.getProject(project.id), req.user?.id));
    } catch (err) {
        console.error('[Generate/regenerate]', err.message);
        res.status(500).json({ error: 'Não foi possível criar uma nova versão agora. A tentativa não foi descontada.' });
    }
});

// ---------------------------------------------------------------------------
// Geração do kit em segundo plano (depois do pagamento)
// ---------------------------------------------------------------------------
const running = new Set();

async function runKitJob(projectId, only) {
    if (running.has(projectId)) return;
    running.add(projectId);
    try {
        const project = await orders.getProject(projectId);
        const u = project.assets_urls || {};
        const items = (only && only.length ? only : KIT_ITEMS).filter(k => KIT_ITEMS.includes(k));
        const full = !only || !only.length;
        const invitation = await downloadPrivate(u.priv_convite);
        const photo = u.priv_foto ? await downloadPrivate(u.priv_foto).catch(() => null) : null;
        const axios = require('axios');
        const fetchBuf = async (url) => Buffer.from((await axios.get(url.split('?')[0], { responseType: 'arraybuffer', timeout: 30000 })).data);

        // Paleta/fontes saem do convite, sem custo de IA
        let identity = u.identity || null;
        if (!identity || full) {
            try { identity = await buildIdentity({ type: project.type, theme: project.theme, name: project.name }, invitation, null); } catch (e) { console.warn('[Kit] Identidade:', e.message); }
        }

        const existing = {};
        if (items.includes('lembrancinha')) {
            if (!items.includes('fundo') && u.fundo) existing.fundo = await fetchBuf(u.fundo).catch(() => null);
            if (!items.includes('logo') && u.logo) existing.logo = await fetchBuf(u.logo).catch(() => null);
        }

        console.log(`\n[Kit] Gerando ${items.join(', ')} para "${project.name}" (${u.kit_provider || 'gemini'})...`);
        const extras = await generateKitExtras({
            invitation, childPhoto: photo, themeText: project.theme, palette: identity?.palette || null,
            name: project.name, age: project.age, gender: u.gender || 'f',
            project: { date: project.date, time: project.time, location: project.location },
            provider: u.kit_provider || null, only: items, existing,
        });

        // Itens do kit pago ficam em pasta própria (com carimbo) para a CDN não devolver versão antiga
        const t = Date.now();
        const dir = `projects/${projectId}/kit_${t}`;
        const save = async (buf, name) => (buf ? uploadBuffer(buf, `${dir}/${name}`, 'image/png') : null);
        const saveList = (list, prefix) => Promise.all((list || []).map((e, i) => save(e.png, `${prefix}_${String(i + 1).padStart(2, '0')}.png`)));
        const [mascote, elementos, fundo, papel, logo, brasao, lembrancinha, principais, complementares] = await Promise.all([
            save(extras.mascote, 'mascote.png'), save(extras.elementosSheet, 'prancha_elementos.png'), save(extras.fundo, 'fundo_limpo.png'),
            save(extras.papel, 'papel_digital.png'), save(extras.logo, 'logotipo.png'), save(extras.brasao, 'brasao.png'),
            save(extras.lembrancinha, 'lembrancinha.png'), saveList(extras.principais, 'elemento_principal'), saveList(extras.complementares, 'elemento_complementar'),
        ]);

        const patch = { kit_t: t, identity, kit_provider: u.kit_provider || null };
        for (const [k, v] of Object.entries({ mascote, elementos, fundo, papel, logo, brasao, lembrancinha })) if (v) patch[k] = v;
        if (principais.filter(Boolean).length || complementares.filter(Boolean).length) {
            patch.kit_files = { principais: principais.filter(Boolean), complementares: complementares.filter(Boolean) };
        }
        const missing = extras.missing || [];
        const gotAny = Object.values({ mascote, elementos, fundo, logo, brasao, lembrancinha }).some(Boolean) || !!u.mascote;
        patch.kit_missing = missing;
        patch.kit_quota = !!extras.quota;
        patch.kit_state = !missing.length ? 'ready' : (gotAny ? 'partial' : 'failed');
        await orders.patchAssets(projectId, patch);
        if (patch.kit_state === 'ready' && u.priv_foto) { await removePrivate(u.priv_foto); await orders.patchAssets(projectId, { priv_foto: null }); }
        console.log(`[Kit] ✅ "${project.name}": ${patch.kit_state}${missing.length ? ' (faltaram: ' + missing.join(', ') + ')' : ''}`);
    } catch (err) {
        console.error('[Kit] Falha:', err.message);
        try { await orders.patchAssets(projectId, { kit_state: 'failed', kit_missing: KIT_ITEMS, kit_quota: false }); } catch (_) { /* ignora */ }
    } finally {
        running.delete(projectId);
    }
}

// POST /api/generate/kit/:id  body: { items?: [...] } — inicia (ou refaz só alguns itens)
router.post('/kit/:projectId', optionalAuth, express.json(), async (req, res) => {
    try {
        const project = await orders.getProject(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
        if (!(await orders.isUnlocked(project, req.user?.id))) return res.status(402).json({ error: 'Libere o kit para gerar os demais itens.' });
        const u = project.assets_urls || {};
        if (!u.priv_convite) return res.status(409).json({ error: 'Convite aprovado não encontrado.' });
        const state = orders.kitState(project);
        if (state === 'generating' || running.has(project.id)) return res.json({ state: 'generating' });

        const only = Array.isArray(req.body?.items) ? req.body.items.filter(k => KIT_ITEMS.includes(k)) : [];
        if (state === 'ready' && !only.length) return res.json({ state: 'ready' });
        if (only.includes('mascote') && !u.priv_foto) return res.status(409).json({ error: 'A foto da criança não está mais disponível para refazer o mascote.' });

        await orders.patchAssets(project.id, { kit_state: 'generating', kit_started_at: Date.now(), kit_missing: [] });
        runKitJob(project.id, only);          // segue em segundo plano; o navegador consulta o status
        res.status(202).json({ state: 'generating' });
    } catch (err) {
        console.error('[Generate/kit]', err.message);
        res.status(500).json({ error: 'Não foi possível iniciar a geração do kit.' });
    }
});

// GET /api/generate/kit/:id/status
router.get('/kit/:projectId/status', optionalAuth, async (req, res) => {
    try {
        const project = await orders.getProject(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
        const view = await projectView(project, req.user?.id);
        if (!view.unlocked) return res.status(402).json({ error: 'Kit não liberado.' });
        res.json(view);
    } catch (err) {
        res.status(500).json({ error: 'Não foi possível consultar o kit.' });
    }
});

module.exports = router;
