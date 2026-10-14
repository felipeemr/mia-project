/* Teste isolado do lembrete: node test-reminder.js "<convite.png>" "<NOME>" "<DD/MM/AAAA>" "<HH:MM>" "<endereço>" */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { generateReminder } = require('./services/kit');
(async () => {
    const [inv, name = 'MATHEUS', date = '12/10/2026', time = '15:30', location = 'Buffet Jardim Secreto, Av. das Américas, 500'] = process.argv.slice(2);
    const b = await generateReminder({ invitation: fs.readFileSync(inv), project: { name, date, time, location } });
    const out = path.join(__dirname, 'test-output-kit', `lembrete_${Date.now()}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, b);
    console.log('Lembrete salvo em:', out);
})().catch(e => { console.error('❌', e.kind || '', e.message); process.exit(1); });
