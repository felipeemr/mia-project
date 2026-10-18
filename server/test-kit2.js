/* Teste isolado: logotipo (nome+idade), brasão, monograma e lembrete.
   Uso: node test-kit2.js "<convite.png>" "<NOME>" "<IDADE>" "<DD/MM/AAAA>" "<HH:MM>" */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { generateLogo, generateBadge, generateReminder } = require('./services/kit');
(async () => {
    const [inv, name = 'MATHEUS', age = '10', date = '12/10/2026', time = '15:30'] = process.argv.slice(2);
    const invitation = fs.readFileSync(inv);
    const words = name.trim().split(/\s+/);
    const initials = words.length >= 2 ? words[0][0] + words[1][0] : words[0][0];
    const dir = path.join(__dirname, 'test-output-kit', `kit2_${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const run = async (file, fn) => { try { const b = await fn(); fs.writeFileSync(path.join(dir, file), b); console.log('OK', file); } catch (e) { console.log('FALHOU', file, '-', e.message); } };
    await Promise.all([
        run('logotipo.png',  () => generateLogo({ invitation, name, age })),
        run('brasao.png',    () => generateBadge({ invitation, kind: 'crest', letters: words[0][0] })),
        run('monograma.png', () => generateBadge({ invitation, kind: 'monogram', letters: initials })),
        run('lembrete.png',  () => generateReminder({ invitation, project: { name, date, time } })),
    ]);
    console.log('Pasta:', dir);
})();
