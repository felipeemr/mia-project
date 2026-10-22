/* =============================================================================
   MERAKI — Pedidos: limites de tentativas, liberação por pagamento e dados do projeto
   Sem alterar o banco: e-mail do cliente e estado do kit ficam em projects.assets_urls (jsonb).
   ============================================================================= */

const { supabaseAdmin } = require('./supabase');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const PRICE            = () => num(process.env.KIT_PRICE, 47.9);              // preço do kit (R$): definido SÓ no servidor
const FREE_PREVIEWS    = () => num(process.env.PREVIEW_ATTEMPTS, 2);          // prévias grátis por e-mail
const PAID_REGENS      = () => num(process.env.PAID_EXTRA_ATTEMPTS, 2);       // versões extras do convite depois de pagar
const MAX_PER_DAY      = () => num(process.env.MAX_PREVIEWS_PER_DAY, 300);    // trava geral de custo (todas as prévias do dia)
const IP_DAILY_LIMIT   = () => num(process.env.IP_DAILY_LIMIT, 8);            // prévias por IP em 24 h
const WINDOW_DAYS      = 30;                                                  // janela de contagem das prévias por e-mail
const KIT_STALE_MS     = 15 * 60 * 1000;                                      // kit "gerando" há mais que isso = travou

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;

async function getProject(id) {
    if (!id || !/^[0-9a-f-]{32,40}$/i.test(String(id))) return null;
    const { data, error } = await supabaseAdmin.from('projects').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
}

/** Mescla campos em projects.assets_urls (lê, mescla e grava) */
async function patchAssets(id, patch, extraColumns = {}) {
    const { data } = await supabaseAdmin.from('projects').select('assets_urls').eq('id', id).single();
    const merged = { ...(data?.assets_urls || {}), ...patch };
    const { error } = await supabaseAdmin.from('projects').update({ assets_urls: merged, ...extraColumns }).eq('id', id);
    if (error) throw new Error('Falha ao atualizar o projeto: ' + error.message);
    return merged;
}

// Limite por IP (em memória: reinicia com o servidor; protege contra rajadas)
const ipHits = new Map();
function ipAllowed(ip) {
    const now = Date.now(), day = 24 * 3600 * 1000;
    const list = (ipHits.get(ip) || []).filter(t => now - t < day);
    ipHits.set(ip, list);
    return list.length < IP_DAILY_LIMIT();
}
function ipRegister(ip) { const l = ipHits.get(ip) || []; l.push(Date.now()); ipHits.set(ip, l); }

/**
 * Pode gerar uma nova prévia? Conta as prévias AINDA NÃO PAGAS do e-mail nos últimos 30 dias:
 * pagar uma prévia a tira da conta (o cliente que comprou pode criar outra festa).
 */
async function previewAllowance(email) {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
        .from('projects').select('id', { count: 'exact', head: true })
        .eq('assets_urls->>owner_email', email).eq('status', 'preview').gte('created_at', since);
    if (error) throw new Error('Falha ao conferir as tentativas: ' + error.message);
    const { count: inflight } = await supabaseAdmin
        .from('projects').select('id', { count: 'exact', head: true })
        .eq('assets_urls->>owner_email', email).eq('status', 'generating')
        .gte('created_at', new Date(Date.now() - 12 * 60 * 1000).toISOString());
    const used = (count || 0) + (inflight || 0);
    return { used, allowed: FREE_PREVIEWS(), left: Math.max(0, FREE_PREVIEWS() - used) };
}

async function todayCount() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin.from('projects').select('id', { count: 'exact', head: true }).gte('created_at', start.toISOString());
    return count || 0;
}

/** Kit liberado = pago/entregue, ou dono profissional logado */
async function isUnlocked(project, userId) {
    if (!project) return false;
    if (project.status === 'paid' || project.status === 'delivered') return true;
    if (project.user_id && userId && project.user_id === userId) {
        const { data: profile } = await supabaseAdmin.from('profiles').select('user_type').eq('id', userId).single();
        return profile?.user_type === 'pro';
    }
    return false;
}

/** Marca o projeto como pago (idempotente). Só chamar com pagamento CONFERIDO na API do Mercado Pago. */
async function markPaid(project, { paymentId, method }) {
    if (project.status === 'paid' || project.status === 'delivered') return project;
    const { error } = await supabaseAdmin.from('projects').update({
        status: 'paid', watermarked: false, payment_id: String(paymentId), payment_method: method || null, paid_at: new Date().toISOString(),
    }).eq('id', project.id);
    if (error) throw new Error('Falha ao registrar o pagamento: ' + error.message);
    console.log(`[Pagamento] ✅ Projeto ${project.id} (${project.name}) liberado. Pagamento ${paymentId}.`);
    return { ...project, status: 'paid' };
}

/** Estado do kit; "gerando" há muito tempo vira "failed" para permitir nova tentativa */
function kitState(project) {
    const u = project.assets_urls || {};
    let state = u.kit_state || 'none';
    if (state === 'generating' && Date.now() - (u.kit_started_at || 0) > KIT_STALE_MS) state = 'failed';
    return state;
}

module.exports = {
    PRICE, FREE_PREVIEWS, PAID_REGENS, MAX_PER_DAY, normEmail, validEmail,
    getProject, patchAssets, ipAllowed, ipRegister, previewAllowance, todayCount, isUnlocked, markPaid, kitState,
};
