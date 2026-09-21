/* =============================================================================
   MERAKI — Middleware de Autenticação (JWT via Supabase)
   ============================================================================= */

const { createClient } = require('@supabase/supabase-js');

/**
 * Middleware que verifica o token JWT do Supabase.
 * Popula req.user com os dados do usuário autenticado.
 * Retorna 401 se o token estiver ausente ou inválido.
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Cria cliente Supabase com a chave de serviço para validar qualquer token
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        req.user  = user;
        req.token = token;
        next();
    } catch (err) {
        console.error('[AUTH MW]', err.message);
        return res.status(401).json({ error: 'Falha ao verificar autenticação.' });
    }
}

/**
 * Middleware opcional — não bloqueia se não houver token,
 * mas popula req.user se válido (útil para rotas mistas).
 */
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
            req.user  = user;
            req.token = token;
        }
    } catch (_) { /* silencioso */ }
    next();
}

module.exports = { requireAuth, optionalAuth };
