/* Teste manual do fluxo prévia -> pagamento -> download, SEM gastar IA.
   Cria um projeto de teste direto no banco com a arte de exemplo (test_convite.png), confere que:
   - antes de pagar: os downloads e a arte limpa respondem 402; a prévia pública tem marca d'água
   - depois do pagamento (simulado, precisa de ALLOW_DEV_PAYMENT=on): a arte limpa e o ZIP funcionam
   Uso: node test-flow-offline.js   (com o servidor rodando em http://localhost:3001)  */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('./services/supabase');
const { uploadPrivate, uploadBuffer } = require('./services/storage');
const { makePreview } = require('./services/preview');

const BASE = 'http://localhost:3001/api';
const ok = (c, msg) => { console.log(`${c ? '✅' : '❌'} ${msg}`); if (!c) process.exitCode = 1; };

(async () => {
    const art = fs.readFileSync(path.join(__dirname, 'test_convite.png'));
    const { data: rec, error } = await supabaseAdmin.from('projects').insert({
        type: 'infantil', name: 'Teste', age: '5', date: '10/11/2026', time: '15:00', location: 'Rua Teste, 1', phrase: 'x', theme: 'jardim',
        status: 'preview', watermarked: true, assets_urls: { owner_email: 'teste@exemplo.com', gender: 'f', kit_state: 'none', regen_used: 0 },
    }).select('id').single();
    if (error) throw new Error(error.message);
    const id = rec.id;
    console.log('Projeto de teste:', id);

    await uploadPrivate(art, `projects/${id}/convite.png`);
    const pub = await uploadBuffer(await makePreview(art), `projects/${id}/preview_convite.jpg`, 'image/jpeg');
    const { data: cur } = await supabaseAdmin.from('projects').select('assets_urls').eq('id', id).single();
    await supabaseAdmin.from('projects').update({ assets_urls: { ...cur.assets_urls, priv_convite: `projects/${id}/convite.png`, preview_convite: pub, preview_t: Date.now() } }).eq('id', id);

    // Antes de pagar
    let r = await fetch(`${BASE}/generate/project/${id}`); let v = await r.json();
    ok(r.status === 200 && v.unlocked === false && v.watermarked === true, 'projeto aparece como NÃO liberado');
    ok(!JSON.stringify(v).includes('priv_') && !JSON.stringify(v).includes('teste@exemplo.com'), 'a resposta não vaza e-mail nem caminho privado');
    ok(/preview_convite/.test(v.assetsUrls.convitePreview || ''), 'a prévia entregue é a imagem marcada');
    for (const f of ['convite.png', 'convite.pdf', 'kit.zip', 'view/convite.jpg']) {
        r = await fetch(`${BASE}/downloads/${id}/${f}`);
        ok(r.status === 402, `download ${f} antes de pagar -> ${r.status} (esperado 402)`);
    }
    r = await fetch(`${BASE}/generate/kit/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(r.status === 402, `gerar kit antes de pagar -> ${r.status} (esperado 402)`);
    r = await fetch(`${BASE}/generate/regenerate/${id}`, { method: 'POST' });
    ok(r.status === 402, `nova versão antes de pagar -> ${r.status} (esperado 402)`);

    // Pagamento (simulado)
    r = await fetch(`${BASE}/payments/${id}/checkout`, { method: 'POST' }); const co = await r.json();
    console.log('checkout ->', r.status, JSON.stringify(co));
    if (co.dev) {
        r = await fetch(`${BASE}/payments/${id}/dev-approve`, { method: 'POST' });
        ok(r.status === 200, 'pagamento simulado aprovado');
        r = await fetch(`${BASE}/payments/${id}/status`); ok((await r.json()).paid === true, 'status do pagamento = pago');
        r = await fetch(`${BASE}/generate/project/${id}`); v = await r.json();
        ok(v.unlocked === true && v.regen && v.regen.left === 2, 'projeto liberado com 2 novas versões');
        r = await fetch(`${BASE}/downloads/${id}/view/convite.jpg`);
        ok(r.status === 200 && (r.headers.get('content-type') || '').includes('jpeg'), 'arte limpa disponível depois de pagar');
        r = await fetch(`${BASE}/downloads/${id}/convite.png`);
        ok(r.status === 200 && (await r.arrayBuffer()).byteLength > 50000, 'download do convite (PNG limpo) funciona');
        r = await fetch(`${BASE}/downloads/${id}/kit.zip`);
        const zip = Buffer.from(await r.arrayBuffer());
        ok(r.status === 200 && zip.slice(0, 2).toString() === 'PK', `ZIP do kit é um zip de verdade (${zip.length} bytes)`);
    } else {
        console.log('(pagamento simulado desligado: ligue ALLOW_DEV_PAYMENT=on para testar a parte paga)');
    }

    // Limpeza
    await supabaseAdmin.from('projects').delete().eq('id', id);
    console.log('Projeto de teste removido.');
})().catch(e => { console.error('ERRO NO TESTE:', e.message); process.exit(1); });
