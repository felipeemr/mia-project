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

// ---------------------------------------------------------------------------
// POST /api/generate — Pipeline principal de geração
// ---------------------------------------------------------------------------

router.post('/', optionalAuth, upload.fields([
    { name: 'photos', maxCount: 5 },
    { name: 'references', maxCount: 5 }
]), async (req, res) => {
    const projectData = {
        type:     req.body.type     || 'infantil',
        name:     req.body.name     || 'Aniversariante',
        age:      req.body.age      || '',
        date:     req.body.date     || '',
        time:     req.body.time     || '',
        location: req.body.location || '',
        phrase:   req.body.phrase   || '',
        theme:    req.body.theme    || '',
        notes:    req.body.notes    || '',
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
        const { data: projectRecord } = await supabaseAdmin
            .from('projects')
            .insert({
                user_id:       req.user?.id || null,
                ...projectData,
                initial_letter: projectData.initialLetter,
                bg_template:   DEFAULT_BG[projectData.type],
                status:        'generating',
                watermarked:   true,
                assets_urls:   {},
            })
            .select('id')
            .single();

        if (projectRecord) projectId = projectRecord.id;
    } catch (dbErr) {
        console.warn('[Generate] Aviso: não foi possível salvar projeto no banco:', dbErr.message);
    }

    // --- 3. Definir fundo: tenta IA, cai em padrão se falhar ---
    let bgBuffer    = null;
    let assetsUrls  = {};
    let aiDna       = null;
    const bgDefault = DEFAULT_BG[projectData.type];

    try {
        const aiAvailable = !!(process.env.REPLICATE_API_TOKEN || process.env.OPENAI_API_KEY);

        if (aiAvailable) {
            console.log('[Generate] Chamando API de IA para geração das imagens...');
            const aiImages = await generateKitImages(projectData, childPhotos, inspirationRefs);
            aiDna = aiImages._dna || null;

            // Salva cada imagem no Supabase Storage com URL permanente
            const savePromises = Object.entries(aiImages).map(async ([key, url]) => {
                if (!url || key === '_dna') return; // Ignora _dna, pois não é uma URL de imagem
                try {
                    const savedUrl = await uploadFromUrl(url, `projects/${projectId}/${key}.png`);
                    assetsUrls[key] = savedUrl;
                } catch (e) {
                    console.warn(`[Generate] Falha ao salvar ${key}:`, e.message);
                    // Fallback: se o Supabase falhar (offline/ENOTFOUND), usamos a URL original da IA
                    assetsUrls[key] = url;
                }
            });
            await Promise.all(savePromises);

            // Usa o fundo gerado pela IA para o convite (suporta URL remota e Data URI)
            if (assetsUrls.background) {
                if (assetsUrls.background.startsWith('data:')) {
                    const base64Part = assetsUrls.background.replace(/^data:image\/\w+;base64,/, '');
                    bgBuffer = Buffer.from(base64Part, 'base64');
                } else {
                    const axios = require('axios');
                    const resp  = await axios.get(assetsUrls.background, { responseType: 'arraybuffer', timeout: 30000 });
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
        // FASE 7: Não renderizamos o convite por cima, pois o DALL-E 3 já desenha o pôster perfeito.
        // Renderizamos apenas o lembrete (que precisa da contagem regressiva).
        const lembretePng = await renderLembrete(projectData, bgBuffer, true, aiDna);

        // O thumbnail do convite será feito usando a imagem pura do DALL-E 3 (bgBuffer)
        conviteThumb = await createThumbnail(bgBuffer, 600);

        if (projectId) {
            // O convitePreview no Supabase também será nulo (o sistema usará o background).
            lembreteUrl = await uploadBuffer(lembretePng,  `projects/${projectId}/lembrete_preview.png`, 'image/png');
            await uploadBuffer(conviteThumb, `projects/${projectId}/convite_thumb.jpg`,    'image/jpeg');
        }

        assetsUrls.convite_preview  = null; // Usará background
        assetsUrls.lembrete_preview = lembreteUrl;
    } catch (renderErr) {
        console.warn('[Generate] Aviso na renderização:', renderErr.message);
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
    res.json({
        projectId,
        status:     'preview',
        assetsUrls: {
            // Imagens geradas por IA
            background:   assetsUrls.background   || null,
            mascote:      assetsUrls.mascote       || null,
            elementos:    assetsUrls.elementos     || null,
            fundo:        assetsUrls.fundo         || null,
            papel:        assetsUrls.papel         || null,
            // Convite e lembrete renderizados em alta resolução (com marca d'água)
            convitePreview:  assetsUrls.convite_preview  || null,
            lembretePreview: assetsUrls.lembrete_preview || null,
            // DNA Visual extraído (tipografia, ícones)
            _dna:            aiDna,
        },
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

module.exports = router;
