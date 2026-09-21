/* =============================================================================
   MERAKI — Rota de Autenticação (/api/auth)
   Usa Supabase Auth para cadastro, login e gestão de sessão
   ============================================================================= */

const express = require('express');
const router  = express.Router();
const { supabase, supabaseAdmin } = require('../services/supabase');
const { requireAuth }             = require('../middleware/auth');

// ---------------------------------------------------------------------------
// POST /api/auth/signup — Cadastro de novo usuário
// ---------------------------------------------------------------------------
router.post('/signup', async (req, res) => {
    const { email, password, name, userType = 'client' } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, senha e nome são obrigatórios.' });
    }

    try {
        // 1. Cria usuário no Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, user_type: userType },
            },
        });

        if (authError) throw authError;

        // 2. Cria perfil na tabela profiles
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id:          authData.user.id,
                name,
                user_type:   userType,
                daily_count:  0,
                monthly_count: 0,
            });

        if (profileError) console.warn('[Auth] Aviso ao criar perfil:', profileError.message);

        res.status(201).json({
            message: 'Cadastro realizado! Verifique seu e-mail para confirmar a conta.',
            user: {
                id:       authData.user.id,
                email:    authData.user.email,
                name,
                userType,
            },
            session: authData.session,
        });
    } catch (err) {
        console.error('[Auth/Signup]', err.message);
        res.status(400).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — Login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Busca dados completos do perfil
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        res.json({
            token: data.session.access_token,
            user: {
                id:           data.user.id,
                email:        data.user.email,
                name:         profile?.name || data.user.user_metadata?.name,
                userType:     profile?.user_type || 'client',
                dailyCount:   profile?.daily_count || 0,
                monthlyCount: profile?.monthly_count || 0,
            },
        });
    } catch (err) {
        console.error('[Auth/Login]', err.message);
        res.status(401).json({ error: 'Email ou senha incorretos.' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout — Logout
// ---------------------------------------------------------------------------
router.post('/logout', requireAuth, async (req, res) => {
    try {
        await supabase.auth.signOut();
        res.json({ message: 'Logout realizado com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me — Dados do usuário logado
// ---------------------------------------------------------------------------
router.get('/me', requireAuth, async (req, res) => {
    try {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        res.json({
            id:           req.user.id,
            email:        req.user.email,
            name:         profile?.name,
            userType:     profile?.user_type || 'client',
            dailyCount:   profile?.daily_count || 0,
            monthlyCount: profile?.monthly_count || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
