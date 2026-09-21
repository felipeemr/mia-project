/**
 * Script de teste do renderer — gera um convite de teste sem precisar do backend completo.
 * Execute: node test-renderer.js
 * Saída: test_convite.png e test_lembrete.png na pasta server/
 */

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const { renderConvite, renderLembrete, pngToPdf } = require('./services/renderer');

const projectMock = {
    type:     'infantil',
    name:     'Helena',
    age:      '5 anos',
    date:     '12/10/2026',
    time:     '15:30',
    location: 'Buffet Jardim Secreto, Av. das Américas, 500',
    phrase:   'Venha viver essa aventura no meu Jardim Encantado!',
    theme:    'Jardim Encantado',
};

async function main() {
    console.log('Iniciando teste do renderer...');

    // Usa o fundo infantil estático como bgSource
    const bgPath   = path.join(__dirname, '..', 'assets', 'infantil_bg.jpg');
    const bgBuffer = fs.readFileSync(bgPath);

    console.log(`Fundo carregado: ${bgBuffer.length} bytes (${bgPath})`);

    // Renderiza convite
    console.log('\nRenderizando convite...');
    const convitePng = await renderConvite(projectMock, bgBuffer, true);
    fs.writeFileSync(path.join(__dirname, 'test_convite.png'), convitePng);
    console.log(`✅ test_convite.png salvo (${(convitePng.length / 1024).toFixed(0)} KB)`);

    // Renderiza lembrete
    console.log('\nRenderizando lembrete...');
    const lembretePng = await renderLembrete(projectMock, bgBuffer, false);
    fs.writeFileSync(path.join(__dirname, 'test_lembrete.png'), lembretePng);
    console.log(`✅ test_lembrete.png salvo (${(lembretePng.length / 1024).toFixed(0)} KB)`);

    // Gera PDF do convite
    const { pngToPdf } = require('./services/renderer');
    const pdfBuf = await pngToPdf(convitePng);
    fs.writeFileSync(path.join(__dirname, 'test_convite.pdf'), pdfBuf);
    console.log(`✅ test_convite.pdf salvo (${(pdfBuf.length / 1024).toFixed(0)} KB)`);

    console.log('\nAbra os arquivos gerados na pasta server/ para verificar o resultado!');
}

main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
});
