/* Teste manual REAL do fluxo completo (GASTA CRÉDITO DE IA, ~US$ 1):
   prévia (convite + lembrete) -> pagamento simulado -> kit completo -> downloads.
   Precisa do servidor rodando e de ALLOW_DEV_PAYMENT=on no .env.
   Uso: node test-flow-real.js [foto.jpg] */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001/api';
const ok = (c, msg) => { console.log(`${c ? '✅' : '❌'} ${msg}`); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const photoPath = process.argv[2] || path.join(__dirname, '..', 'assets', 'girl_1.jpg');
    const fd = new FormData();
    const fields = { type: 'infantil', name: 'Aurora', age: '4', gender: 'f', date: '15/11/2026', time: '15:00', location: 'Rua das Flores, 100 - Centro', theme: 'Safari', notes: '', email: `teste+${Date.now()}@exemplo.com` };
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('photos', new Blob([fs.readFileSync(photoPath)], { type: 'image/jpeg' }), 'foto.jpg');

    console.log('1) Prévia (convite + lembrete)...');
    const t0 = Date.now();
    let r = await fetch(`${BASE}/generate`, { method: 'POST', body: fd });
    let v = await r.json();
    console.log(`   -> ${r.status} em ${((Date.now() - t0) / 1000).toFixed(0)}s`, r.ok ? '' : JSON.stringify(v));
    if (!r.ok) process.exit(1);
    const id = v.projectId;
    ok(v.unlocked === false && v.attempts && v.attempts.used === 1, `prévia criada, tentativa ${v.attempts?.used} de ${v.attempts?.allowed}`);
    ok(!!v.assetsUrls.convitePreview, 'tem prévia do convite (marcada)');
    ok(!!v.assetsUrls.lembretePreview, 'tem prévia do lembrete (marcada)');
    ok(!v.assetsUrls.mascote, 'kit completo NÃO foi gerado antes de pagar');
    console.log('   convite:', v.assetsUrls.convitePreview);

    console.log('2) Pagamento simulado...');
    r = await fetch(`${BASE}/payments/${id}/dev-approve`, { method: 'POST' });
    ok(r.status === 200, 'pagamento aprovado (simulado)');

    console.log('3) Kit completo (segundo plano)...');
    const t1 = Date.now();
    r = await fetch(`${BASE}/generate/kit/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(r.status === 202, `geração do kit iniciada (${r.status})`);
    let st = 'generating';
    while (st === 'generating' && Date.now() - t1 < 12 * 60 * 1000) {
        await sleep(8000);
        v = await (await fetch(`${BASE}/generate/kit/${id}/status`)).json();
        st = v.kit.state;
        process.stdout.write(`   estado: ${st} (${((Date.now() - t1) / 1000).toFixed(0)}s)\r`);
    }
    console.log(`\n   -> estado final: ${st}  faltando: ${JSON.stringify(v.kit.missing)}`);
    const a = v.assetsUrls;
    for (const k of ['mascote', 'elementos', 'fundo', 'papel', 'logo', 'brasao', 'lembrancinha']) ok(!!a[k], `item ${k}`);
    ok((v.kit.files?.principais?.length || 0) > 0, `elementos recortados: ${v.kit.files?.principais?.length || 0} principais, ${v.kit.files?.complementares?.length || 0} complementares`);
    ok(Array.isArray(v.identity?.palette) && v.identity.palette.length >= 5, 'paleta de cores');

    console.log('4) Downloads...');
    r = await fetch(`${BASE}/downloads/${id}/kit.zip`);
    const zip = Buffer.from(await r.arrayBuffer());
    const out = path.join(__dirname, 'test-output-kit', `fluxo_real_${id}.zip`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zip);
    ok(r.status === 200 && zip.slice(0, 2).toString() === 'PK', `ZIP ok (${(zip.length / 1e6).toFixed(1)} MB) salvo em ${out}`);
    console.log(`\nProjeto ${id} mantido no banco para você olhar. (apague pelo painel do Supabase quando quiser)`);
})().catch(e => { console.error('ERRO NO TESTE:', e.message); process.exit(1); });
