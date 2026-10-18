/* Teste isolado do logotipo: node test-logo.js "<convite.png>" "<NOME>" */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { generateLogo } = require('./services/kit');
(async () => {
    const [inv, name] = process.argv.slice(2);
    const buf = await generateLogo({ invitation: fs.readFileSync(inv), name });
    const out = path.join(__dirname, 'test-output-kit', `logo_${Date.now()}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
    console.log('Logotipo salvo em:', out);
})().catch(e => { console.error('❌', e.kind || '', e.message); process.exit(1); });
