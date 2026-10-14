/* Teste isolado dos itens do kit (mascote, prancha, elementos, fundo, papel).
   Uso: node test-kit.js "<convite.png>" "<foto_crianca.jpg>" "[tema]" */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateKitExtras } = require('./services/kit');
const { extractPalette } = require('./services/identity');

(async () => {
    const [invPath, photoPath, theme = ''] = process.argv.slice(2);
    if (!invPath || !fs.existsSync(invPath)) { console.error('Informe o caminho do convite.'); process.exit(1); }
    const invitation = fs.readFileSync(invPath);
    const childPhoto = photoPath && fs.existsSync(photoPath) ? fs.readFileSync(photoPath) : null;
    const palette = await extractPalette(invitation, 'infantil');

    const t0 = Date.now();
    const r = await generateKitExtras({ invitation, childPhoto, themeText: theme, palette });
    console.log(`\nTempo total dos extras: ${((Date.now() - t0) / 1000).toFixed(1)}s | erros:`, JSON.stringify(r.errors));

    const dir = path.join(__dirname, 'test-output-kit', String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const save = (name, buf) => buf && fs.writeFileSync(path.join(dir, name), buf);
    save('mascote.png', r.mascote);
    save('prancha.png', r.elementosSheet);
    save('fundo.png', r.fundo);
    save('papel_digital.png', r.papel);
    r.elementos.forEach((e, i) => save(`elemento_${String(i + 1).padStart(2, '0')}.png`, e.png));
    console.log('Arquivos em:', dir);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
