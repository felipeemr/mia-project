/* =============================================================================
   MERAKI — Rota de Downloads (/api/downloads)
   Gera arquivos limpos em alta resolução (sem marca d'água) após pagamento
   e empacota em ZIP para download do kit completo
   ============================================================================= */

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const archiver = require('archiver');
const axios    = require('axios');

const { supabaseAdmin }                       = require('../services/supabase');
const { renderConvite, renderLembrete, pngToPdf } = require('../services/renderer');
const { uploadBuffer, downloadBuffer }        = require('../services/storage');
const { requireAuth, optionalAuth }           = require('../middleware/auth');

const ASSETS_PATH = path.join(__dirname, '..', '..', 'assets');
const DEFAULT_BG  = {
    infantil:  path.join(ASSETS_PATH, 'infantil_bg.jpg'),
    debutante: path.join(ASSETS_PATH, 'debutante_bg.jpg'),
    adulto:    path.join(ASSETS_PATH, 'adulto_bg.jpg'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verifica se o projeto foi pago ou se é um acesso de bypass */
async function isProjectUnlocked(projectId, userId, bypassPayment = false) {
    if (bypassPayment) return true;

    const { data } = await supabaseAdmin
        .from('projects')
        .select('status, user_id, watermarked')
        .eq('id', projectId)
        .single();

    if (!data) return false;
    if (data.status === 'paid' || data.status === 'delivered') return true;
    if (data.user_id && userId && data.user_id === userId) {
        // Conviteira pro — acesso direto
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('user_type')
            .eq('id', userId)
            .single();
        return profile?.user_type === 'pro';
    }
    return false;
}

/** Carrega buffer de fundo: da URL gerada por IA ou do asset local padrão */
async function getBgBuffer(project) {
    const aiUrl = project.assets_urls?.background;
    if (aiUrl) {
        try {
            const resp = await axios.get(aiUrl, { responseType: 'arraybuffer', timeout: 15000 });
            return Buffer.from(resp.data);
        } catch (_) { /* fallback */ }
    }
    return fs.readFileSync(DEFAULT_BG[project.type] || DEFAULT_BG.infantil);
}

// ---------------------------------------------------------------------------
// GET /api/downloads/:projectId/convite.png — Convite limpo 300 DPI
// ---------------------------------------------------------------------------
router.get('/:projectId/convite.png', optionalAuth, async (req, res) => {
    try {
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('id', req.params.projectId)
            .single();

        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

        const unlocked = await isProjectUnlocked(
            project.id,
            req.user?.id,
            process.env.NODE_ENV === 'development' // bypass em dev
        );

        const withWatermark = !unlocked;
        const bgBuffer      = await getBgBuffer(project);
        const convitePng    = await renderConvite(project, bgBuffer, withWatermark);

        res.set({
            'Content-Type':        'image/png',
            'Content-Disposition': `attachment; filename="convite_${project.name}.png"`,
            'Cache-Control':       'no-store',
        });
        res.send(convitePng);
    } catch (err) {
        console.error('[Downloads/Convite]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/downloads/:projectId/convite.pdf — Convite em PDF A4
// ---------------------------------------------------------------------------
router.get('/:projectId/convite.pdf', optionalAuth, async (req, res) => {
    try {
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('id', req.params.projectId)
            .single();

        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

        const unlocked      = await isProjectUnlocked(project.id, req.user?.id, process.env.NODE_ENV === 'development');
        const withWatermark = !unlocked;
        const bgBuffer      = await getBgBuffer(project);

        const [convitePng] = await Promise.all([
            renderConvite(project, bgBuffer, withWatermark),
        ]);
        const pdfBuffer = await pngToPdf(convitePng);

        res.set({
            'Content-Type':        'application/pdf',
            'Content-Disposition': `attachment; filename="convite_${project.name}.pdf"`,
            'Cache-Control':       'no-store',
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[Downloads/PDF]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/downloads/:projectId/lembrete.png — Lembrete limpo 300 DPI
// ---------------------------------------------------------------------------
router.get('/:projectId/lembrete.png', optionalAuth, async (req, res) => {
    try {
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('id', req.params.projectId)
            .single();

        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

        const unlocked      = await isProjectUnlocked(project.id, req.user?.id, process.env.NODE_ENV === 'development');
        const withWatermark = !unlocked;
        const bgBuffer      = await getBgBuffer(project);
        const lembretePng   = await renderLembrete(project, bgBuffer, withWatermark);

        res.set({
            'Content-Type':        'image/png',
            'Content-Disposition': `attachment; filename="lembrete_${project.name}.png"`,
            'Cache-Control':       'no-store',
        });
        res.send(lembretePng);
    } catch (err) {
        console.error('[Downloads/Lembrete]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/downloads/:projectId/kit.zip — Pacote ZIP completo dos 15 itens
// ---------------------------------------------------------------------------
router.get('/:projectId/kit.zip', optionalAuth, async (req, res) => {
    try {
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('id', req.params.projectId)
            .single();

        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

        const unlocked = await isProjectUnlocked(project.id, req.user?.id, process.env.NODE_ENV === 'development');
        if (!unlocked) {
            return res.status(402).json({ error: 'Kit não desbloqueado. Realize o pagamento para acessar os arquivos limpos.' });
        }

        const bgBuffer = await getBgBuffer(project);

        console.log(`[Downloads/ZIP] Gerando kit para "${project.name}"...`);

        // Renderiza convite e lembrete em alta resolução SEM marca d'água
        const [convitePng, lembretePng] = await Promise.all([
            renderConvite(project, bgBuffer, false),
            renderLembrete(project, bgBuffer, false),
        ]);
        const convitePdf = await pngToPdf(convitePng);

        // Configura streaming do ZIP
        res.set({
            'Content-Type':        'application/zip',
            'Content-Disposition': `attachment; filename="kit_${project.name}_Meraki.zip"`,
            'Cache-Control':       'no-store',
        });

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.pipe(res);

        // --- Arquivos renderizados em alta resolução ---
        archive.append(convitePng,  { name: '01_Convite_Principal.png' });
        archive.append(lembretePng, { name: '02_Lembrete_RSVP.png'    });
        archive.append(convitePdf,  { name: '01_Convite_Principal.pdf' });

        // --- Imagens geradas por IA (se disponíveis) ---
        const aiAssets = project.assets_urls || {};
        const aiFiles  = [
            { key: 'mascote',   name: '03_Mascote_Oficial.png'           },
            { key: 'elementos', name: '04_Prancha_Elementos.png'          },
            { key: 'fundo',     name: '08_Fundo_Personalizado_Limpo.png'  },
            { key: 'papel',     name: '09_Papel_Digital_Estampado.png'    },
        ];

        for (const { key, name } of aiFiles) {
            if (aiAssets[key]) {
                try {
                    const resp = await axios.get(aiAssets[key], { responseType: 'arraybuffer', timeout: 20000 });
                    archive.append(Buffer.from(resp.data), { name });
                } catch (dlErr) {
                    console.warn(`[ZIP] Falha ao incluir ${name}:`, dlErr.message);
                }
            }
        }

        // --- Instruções de uso (TXT) ---
        const instrucoes = `
MERAKI ARTES DIGITAIS
Kit de Identidade Visual — ${project.name}
Tema: ${project.theme}
Gerado em: ${new Date().toLocaleDateString('pt-BR')}

ITENS DO KIT:
01. Convite Principal Retrato (PNG + PDF) — Alta resolução para impressão
02. Lembrete da Festa / Card RSVP (PNG)
03. Mascote Oficial da Aniversariante (PNG)
04. Prancha Geral de Elementos Separados (PNG)
08. Fundo Personalizado Limpo (PNG)
09. Papel Digital Estampado (PNG)

OBSERVAÇÕES:
- Arquivos PNG em resolução A4 (2480×3508 px, 300 DPI) — prontos para impressão profissional
- O arquivo PDF é ideal para envio a gráficas
- Os itens 10–15 (Logo, Brasão, Monograma, Paleta e Tipografia) ficam no painel online

Dúvidas? Contate: suporte@merakiartesdigitais.com.br
`.trim();

        archive.append(instrucoes, { name: 'LEIA-ME_Instrucoes.txt' });

        await archive.finalize();
        console.log(`[Downloads/ZIP] ✅ ZIP enviado para "${project.name}"`);

        // Marca como entregue no banco
        await supabaseAdmin
            .from('projects')
            .update({ status: 'delivered' })
            .eq('id', project.id);

    } catch (err) {
        console.error('[Downloads/ZIP]', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

module.exports = router;
