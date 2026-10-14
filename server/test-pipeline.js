/* Teste ponta a ponta do fluxo de geração (sem servidor web):
   foto -> generateKitImages (Gemini/OpenAI + conferência) -> identidade visual.
   Uso: node test-pipeline.js "C:/caminho/foto.jpg" [tipo] */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateKitImages } = require('./services/ai');
const { buildIdentity } = require('./services/identity');
const { pickPhrase } = require('./services/phrases');

(async () => {
    const photoPath = process.argv[2];
    const type = process.argv[3] || 'infantil';
    const refPaths = (process.argv[4] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!photoPath || !fs.existsSync(photoPath)) { console.error('Informe o caminho da foto.'); process.exit(1); }

    const project = {
        type, name: 'Matheus', age: '10 anos', date: '11/10/2026', time: '15:30',
        location: 'Buffet Jardim Secreto, Av. das Américas, 500',
        phrase: pickPhrase(type), theme: process.argv[5] || 'Homem Aranha', notes: '',
    };
    const t0 = Date.now();
    const out = await generateKitImages(project, [{ buffer: fs.readFileSync(photoPath) }], refPaths.map(p => ({ buffer: fs.readFileSync(p) })));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    const dataUrl = out.background;
    const buf = dataUrl.startsWith('data:') ? Buffer.from(dataUrl.split(',')[1], 'base64') : null;
    const dir = path.join(__dirname, 'test-output-gemini');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `pipeline_${Date.now()}.png`);
    if (buf) fs.writeFileSync(file, buf);

    const identity = buf ? await buildIdentity(project, buf, out._dna) : null;
    console.log(`\n✅ Pipeline concluído em ${secs}s`);
    console.log('Frase sorteada:', project.phrase);
    console.log('Imagem:', buf ? file : '(URL remota)');
    console.log('Paleta:', identity?.palette?.join(' '), '| Fontes:', identity?.fonts?.main?.family, '+', identity?.fonts?.complementary?.family);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
