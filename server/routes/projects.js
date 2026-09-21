/* =============================================================================
   MERAKI — Rota de Projetos (/api/projects)
   CRUD completo de projetos no Supabase
   ============================================================================= */

const express = require('express');
const router  = express.Router();
const { supabaseAdmin }         = require('../services/supabase');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// GET /api/projects — Lista projetos do usuário autenticado
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json({ projects: data || [] });
    } catch (err) {
        console.error('[Projects/GET]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id — Detalhe de um projeto específico
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('projects')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Projeto não encontrado.' });

        // Se o projeto não for público, exige autenticação do dono
        if (data.user_id && (!req.user || req.user.id !== data.user_id)) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        res.json({ project: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/projects — Salva/cria um novo projeto
// ---------------------------------------------------------------------------
router.post('/', optionalAuth, async (req, res) => {
    const {
        type, name, age, date, time, location,
        phrase, theme, notes, initialLetter, bgTemplate,
    } = req.body;

    if (!name || !type) {
        return res.status(400).json({ error: 'Nome e tipo de evento são obrigatórios.' });
    }

    try {
        const projectData = {
            user_id:       req.user?.id || null,
            type:          type || 'infantil',
            name,
            age:           age || '',
            date:          date || '',
            time:          time || '',
            location:      location || '',
            phrase:        phrase || '',
            theme:         theme || '',
            notes:         notes || '',
            initial_letter: initialLetter || name.charAt(0).toUpperCase(),
            bg_template:   bgTemplate || '',
            status:        'draft',
            watermarked:   true,
            assets_urls:   {},
        };

        const { data, error } = await supabaseAdmin
            .from('projects')
            .insert(projectData)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ project: data });
    } catch (err) {
        console.error('[Projects/POST]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/:id — Atualiza dados de um projeto
// ---------------------------------------------------------------------------
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        // Verifica se o projeto pertence ao usuário
        const { data: existing } = await supabaseAdmin
            .from('projects')
            .select('user_id')
            .eq('id', req.params.id)
            .single();

        if (!existing || existing.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        const { data, error } = await supabaseAdmin
            .from('projects')
            .update({ ...req.body, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ project: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id — Remove um projeto
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { data: existing } = await supabaseAdmin
            .from('projects')
            .select('user_id')
            .eq('id', req.params.id)
            .single();

        if (!existing || existing.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        const { error } = await supabaseAdmin
            .from('projects')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ message: 'Projeto removido com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
