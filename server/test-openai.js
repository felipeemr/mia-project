/**
 * Teste de conexão com OpenAI — geração de imagem com DALL-E 3
 * Execute: node test-openai.js
 */

require('dotenv').config();
const OpenAI = require('openai');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

if (!process.env.OPENAI_API_KEY) {
    console.error('ERRO: OPENAI_API_KEY nao encontrada no .env');
    process.exit(1);
}

console.log('Conectando com OpenAI...');
console.log('Chave:', process.env.OPENAI_API_KEY.substring(0, 20) + '...');
console.log('');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prompt = [
    'delicate watercolor illustration, enchanted garden theme,',
    'woodland animals deer rabbit butterfly, pink flowers,',
    'turquoise accents, soft dreamy atmosphere, pastel colors,',
    'elegant party stationery background, portrait orientation,',
    'space for text at top center, Brazilian festa infantil style,',
    'no text no letters, high quality, soft brushstrokes'
].join(' ');

async function tryGenerate(model, size, quality) {
    const params = { model, prompt, n: 1, size };
    if (quality) params.quality = quality;

    console.log(`\nTentando modelo: ${model} (${size})...`);
    const start    = Date.now();
    const response = await openai.images.generate(params);
    const elapsed  = ((Date.now() - start) / 1000).toFixed(1);

    // Novos modelos retornam base64, DALL-E retornava URL
    const item = response.data[0];
    return { url: item.url || null, b64: item.b64_json || null, elapsed, model };
}

async function main() {
    // Lista modelos disponíveis
    console.log('Verificando modelos disponiveis na sua conta...');
    try {
        const models = await openai.models.list();
        const imgModels = models.data
            .filter(m => m.id.includes('dall') || m.id.includes('image') || m.id.includes('gpt-image'))
            .map(m => m.id);
        console.log('Modelos de imagem:', imgModels.length ? imgModels.join(', ') : 'nenhum');
    } catch (e) {
        console.warn('Nao foi possivel listar modelos:', e.message);
    }

    // Tenta na ordem: gpt-image-1 → gpt-image-2 → gpt-image-1-mini
    const candidates = [
        { model: 'gpt-image-1',      size: '1024x1536', quality: 'high'   },
        { model: 'gpt-image-2',      size: '1024x1536', quality: 'high'   },
        { model: 'gpt-image-1-mini', size: '1024x1024', quality: 'medium' },
        { model: 'dall-e-3',         size: '1024x1792', quality: 'hd'     },
        { model: 'dall-e-2',         size: '1024x1024', quality: null     },
    ];

    let result = null;
    for (const { model, size, quality } of candidates) {
        try {
            result = await tryGenerate(model, size, quality);
            break;
        } catch (e) {
            console.warn(`${model} falhou: ${e.message.substring(0, 80)}`);
        }
    }

    if (!result) {
        console.error('\nNenhum modelo funcionou. Verifique credito em: https://platform.openai.com/settings/organization/billing');
        process.exit(1);
    }

    console.log(`\nImagem gerada em ${result.elapsed}s com ${result.model}!`);

    // Salva localmente (suporta URL e base64)
    const outputPath = path.join(__dirname, 'test_ai_image.png');
    if (result.url) {
        await downloadFile(result.url, outputPath);
    } else if (result.b64) {
        fs.writeFileSync(outputPath, Buffer.from(result.b64, 'base64'));
    }

    const stat = fs.statSync(outputPath);
    console.log(`Imagem salva: test_ai_image.png (${(stat.size / 1024).toFixed(0)} KB)`);
    console.log('\nOPENAI OK! Use esse modelo no .env:');
    console.log(`   OPENAI_IMAGE_MODEL=${result.model}`);
}



function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

main().catch(err => {
    console.error('\nERRO:', err.message);
    if (err.status === 401) console.error('Chave invalida ou sem credito na conta OpenAI.');
    if (err.status === 429) console.error('Rate limit atingido. Aguarde alguns segundos.');
    if (err.status === 400) console.error('Prompt rejeitado pela politica de conteudo.');
    process.exit(1);
});
