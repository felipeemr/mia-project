/* =============================================================================
   MERAKI — Pagamento (/api/payments) com Mercado Pago (Checkout Pro: Pix e cartão)
   Fluxo: cria a cobrança do projeto -> cliente paga -> o servidor CONFERE o pagamento
   direto na API do Mercado Pago (webhook ou consulta) -> projeto vira "paid".
   Nunca confia no que o navegador diz: o valor vem do servidor e a liberação só vem do Mercado Pago.
   ============================================================================= */

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');
const router  = express.Router();

const orders = require('../services/orders');

const MP = 'https://api.mercadopago.com';
const token = () => process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const mp = () => axios.create({ baseURL: MP, timeout: 20000, headers: { Authorization: `Bearer ${token()}` } });
const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
// Simulação de pagamento só para desenvolvimento, e só se ligada de propósito no .env
const devPaymentOn = () => process.env.ALLOW_DEV_PAYMENT === 'on' && process.env.NODE_ENV !== 'production';

/** Confere um pagamento (já lido da API do MP) e libera o projeto se estiver tudo certo */
async function applyPayment(payment) {
    if (!payment || payment.status !== 'approved') return null;
    const projectId = payment.external_reference;
    const project = await orders.getProject(projectId);
    if (!project) { console.warn(`[Pagamento] ${payment.id}: projeto "${projectId}" não existe.`); return null; }
    if (payment.currency_id && payment.currency_id !== 'BRL') { console.warn(`[Pagamento] ${payment.id}: moeda inesperada ${payment.currency_id}.`); return null; }
    if (Number(payment.transaction_amount) + 0.001 < orders.PRICE()) {
        console.warn(`[Pagamento] ${payment.id}: valor ${payment.transaction_amount} menor que o preço ${orders.PRICE()}.`);
        return null;
    }
    return orders.markPaid(project, { paymentId: payment.id, method: payment.payment_type_id || payment.payment_method_id });
}

// ---------------------------------------------------------------------------
// POST /api/payments/:projectId/checkout — cria a cobrança e devolve o link de pagamento
// ---------------------------------------------------------------------------
router.post('/:projectId/checkout', async (req, res) => {
    try {
        const project = await orders.getProject(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
        if (await orders.isUnlocked(project)) return res.json({ paid: true });

        const email = project.assets_urls?.owner_email || undefined;
        const price = orders.PRICE();

        if (!token()) {
            if (devPaymentOn()) return res.json({ dev: true, price });
            return res.status(503).json({ error: 'O pagamento ainda não está configurado. Tente novamente mais tarde.' });
        }

        const base = publicUrl();
        const back = `${base}/?pago=${project.id}`;
        const prefBody = {
            items: [{ id: 'kit-digital', title: 'Kit Digital Completo - Meraki Artes Digitais', quantity: 1, currency_id: 'BRL', unit_price: Number(price.toFixed(2)) }],
            external_reference: project.id,
            payer: email ? { email } : undefined,
            back_urls: { success: back, failure: back, pending: back },
            statement_descriptor: 'MERAKI ARTES',
        };
        if (/^https:\/\//.test(base)) {            // o Mercado Pago só avisa endereços públicos com https
            prefBody.auto_return = 'approved';
            prefBody.notification_url = `${base}/api/payments/webhook`;
        }
        const { data } = await mp().post('/checkout/preferences', prefBody);
        const url = token().startsWith('TEST-') ? (data.sandbox_init_point || data.init_point) : data.init_point;
        res.json({ url, price });
    } catch (err) {
        console.error('[Pagamento/checkout]', err.response?.data || err.message);
        res.status(502).json({ error: 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/payments/:projectId/status — o navegador pergunta; o servidor confere no Mercado Pago
// ---------------------------------------------------------------------------
const lastCheck = new Map();
router.get('/:projectId/status', async (req, res) => {
    try {
        let project = await orders.getProject(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
        if (await orders.isUnlocked(project)) return res.json({ paid: true });

        if (token()) {
            const last = lastCheck.get(project.id) || 0;
            if (Date.now() - last > 3000) {                 // no máximo 1 consulta ao MP a cada 3 s por projeto
                lastCheck.set(project.id, Date.now());
                const { data } = await mp().get('/v1/payments/search', {
                    params: { external_reference: project.id, sort: 'date_created', criteria: 'desc', limit: 10 },
                });
                for (const p of data.results || []) {
                    if (p.status === 'approved' && await applyPayment(p)) { return res.json({ paid: true }); }
                }
            }
        }
        res.json({ paid: false });
    } catch (err) {
        console.error('[Pagamento/status]', err.response?.data || err.message);
        res.json({ paid: false });
    }
});

// ---------------------------------------------------------------------------
// POST /api/payments/webhook — aviso do Mercado Pago
// ---------------------------------------------------------------------------
function validSignature(req, dataId) {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret) return true;                                // sem segredo configurado: a conferência na API já protege
    const sig = String(req.headers['x-signature'] || '');
    const ts = (sig.match(/ts=([^,]+)/) || [])[1];
    const v1 = (sig.match(/v1=([^,]+)/) || [])[1];
    if (!ts || !v1) return false;
    const id = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
    const manifest = `id:${id};request-id:${req.headers['x-request-id'] || ''};ts:${ts};`;
    const calc = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(v1)); } catch { return false; }
}

router.post('/webhook', async (req, res) => {
    const dataId = req.query['data.id'] || req.body?.data?.id || req.query.id;
    const type = req.query.type || req.query.topic || req.body?.type || req.body?.topic;
    res.sendStatus(200);                                      // responde logo; o MP reenvia se não receber 200
    try {
        if (type !== 'payment' || !dataId || !token()) return;
        if (!validSignature(req, dataId)) { console.warn('[Pagamento/webhook] assinatura inválida: ignorado.'); return; }
        const { data } = await mp().get(`/v1/payments/${encodeURIComponent(dataId)}`);   // confere na fonte
        await applyPayment(data);
    } catch (err) {
        console.error('[Pagamento/webhook]', err.response?.data || err.message);
    }
});

// ---------------------------------------------------------------------------
// POST /api/payments/:projectId/dev-approve — SÓ para testar sem Mercado Pago (ALLOW_DEV_PAYMENT=on)
// ---------------------------------------------------------------------------
router.post('/:projectId/dev-approve', async (req, res) => {
    if (!devPaymentOn()) return res.status(404).json({ error: 'Não encontrado.' });
    const project = await orders.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
    await orders.markPaid(project, { paymentId: `dev-${Date.now()}`, method: 'dev' });
    res.json({ paid: true });
});

module.exports = router;
