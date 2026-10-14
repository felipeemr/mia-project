/* Teste isolado do mascote: node test-mascot.js "<convite.png>" "<foto.jpg>" */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { generateMascot } = require('./services/kit');
(async () => {
    const [inv, photo] = process.argv.slice(2);
    const buf = await generateMascot({ invitation: fs.readFileSync(inv), childPhoto: photo ? fs.readFileSync(photo) : null });
    const out = path.join(__dirname, 'test-output-kit', `mascote_${Date.now()}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
    console.log('Mascote salvo em:', out);
})().catch(e => { console.error('❌', e.kind || '', e.message); process.exit(1); });
