/* Teste isolado da lembrancinha: node test-favor.js "<convite.png>" "<fundo.png>" "<logotipo.png>" */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { generateThanks, composeFavorTag } = require('./services/kit');
(async () => {
    const [inv, fundo, logo] = process.argv.slice(2);
    const invitation = fs.readFileSync(inv);
    const dir = path.join(__dirname, 'test-output-kit', `favor_${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    await Promise.all(['f', 'm'].map(async (g) => {
        try {
            const thanks = await generateThanks({ invitation, gender: g });
            fs.writeFileSync(path.join(dir, `agradecimento_${g}.png`), thanks);
            const tag = await composeFavorTag({ background: fs.readFileSync(fundo), logo: fs.readFileSync(logo), thanks });
            fs.writeFileSync(path.join(dir, `lembrancinha_${g}.png`), tag);
            console.log('OK', g);
        } catch (e) { console.log('FALHOU', g, e.message); }
    }));
    console.log('Pasta:', dir);
})();
