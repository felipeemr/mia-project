/* =============================================================================
   TESTE ISOLADO — Google Gemini ("Nano Banana") para o convite
   Não faz parte do fluxo de produção. Gera o mesmo cenário do convite em cada
   modelo de imagem do Gemini e (opcional) confere o texto com o mesmo
   verificador usado hoje com a OpenAI, para comparar lado a lado.

   Pré-requisito: GEMINI_API_KEY no server/.env (chave grátis em
   https://aistudio.google.com/apikey).

   Uso:
     node test-gemini.js --photo "C:/caminho/foto_crianca.png" --ref "C:/caminho/referencia.png"
     node test-gemini.js --photo foto.png --models gemini-2.5-flash-image --verify
     node test-gemini.js --list        (só lista os modelos de imagem da sua conta)

   Opções:
     --photo   foto da criança (opcional; sem ela, gera só com texto)
     --ref     imagem de referência do tema (opcional)
     --models  lista separada por vírgula (padrão: todos os modelos de imagem encontrados)
     --verify  confere o texto da arte com o GPT-4o (usa OPENAI_API_KEY; custa alguns centavos)
     --out     pasta de saída (padrão: ./test-output-gemini)
     --edit    caminho de uma imagem já gerada para EDITAR (mantém o resto igual)
     --instruction  texto da edição (padrão: tirar luva com aparelho e lançador da mão)
   ============================================================================= */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildTextLines, verifyPosterText, analyzeChildPhoto } = require('./services/ai');

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = process.env.GEMINI_API_KEY;

// --- argumentos simples ---
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null; };

// --- cenário de teste (o mesmo do Matheus) ---
const PROJECT = {
    name: 'Matheus', type: 'infantil', age: '10',
    date: '11/10/2026', time: '15:30',
    location: 'Buffet Jardim Secreto, Av. das Américas, 500',
    phrase: 'Venha comemorar esse dia especial comigo!',
};
// Tema já na forma "atmosfera" (sem nome de personagem), como o sanitizador entrega hoje
const THEME = 'uma cidade à noite com arranha-céus altos, grandes padrões de teia branca no céu e nos cantos, uma paleta de cores vermelha, azul e preta, explosões de ação em estilo de quadrinhos';

// Descrição dos traços da criança (GPT-4o), usada junto com a foto para reforçar a semelhança
async function describeChild(photoPath) {
    if (!photoPath || !process.env.OPENAI_API_KEY) return null;
    try {
        const raw = await analyzeChildPhoto(fs.readFileSync(photoPath));
        // tira o trecho final sobre roupa que a função adiciona
        return raw ? raw.split(/,\s*(wearing|dressed)/)[0].trim() : null;
    } catch (e) {
        console.warn('Aviso: não foi possível descrever a foto:', e.message);
        return null;
    }
}

function buildPrompt(hasPhoto, hasRef, childDesc = null) {
    const lines = buildTextLines(PROJECT);

    const preface = (hasPhoto
        ? 'INPUT IMAGE: the photo of the birthday child. The main character MUST be a semi-realistic children\'s book illustration (NOT hyper-realistic, NOT a generic cartoon kid) of THIS EXACT child, so that his family instantly recognizes him. Faithfully reproduce his real face: the face shape and proportions, forehead, eyes (shape, spacing, color), eyebrows, nose, mouth and smile, cheeks, ears, jawline, skin tone, and especially the hair color, length, texture and hairstyle exactly as in the photo (do not straighten, shorten or restyle the hair). ' +
          (childDesc ? `Reference description of the child's features: ${childDesc}. ` : '') +
          'Keep any distinctive traits such as dimples, freckles or a particular smile. Do NOT copy the clothing or the background of the photo. '
        : '')
        + (hasRef ? 'The other input image is a theme reference: use ONLY its color palette, environment and decorative motifs, and NEVER copy any character from it. ' : '')
        + 'IGNORE any text, numbers, candles, logos or letters visible in the input images: the ONLY text allowed in the final art is the text listed in TEXT RULES below.\n\n';

    const scene = `Create a single, unique, spectacular, richly detailed illustrated party invitation poster (vertical 2:3, full-bleed art, no white margins, no white boxes).

THEME AND WORLD: ${THEME}. Build a rich, layered scene with a clear foreground, midground and background, dramatic lighting and depth. Fill the scene with many theme-related details: iconic props, objects, decorations, small ORIGINAL companion characters or creatures that fit the theme (invented, never existing characters), glowing effects and themed patterns in the corners. Use the theme's materials for the large title lettering (for example stone, neon, web threads, metal or wood, according to the theme) so the lettering feels part of the world.

MAIN CHARACTER: the birthday child is the clear hero of the poster, large and centered, with the face big and clearly visible (head and shoulders occupy a prominent part of the image, face turned toward the viewer, bright expressive happy smile, eyes looking at the viewer). Dress the child in a fun party-theme outfit in the theme's colors with 2-3 theme-inspired accessories (for example a cap, a backpack, gloves, goggles or a prop held in one hand), in a joyful dynamic action pose. The character is drawn with delicate, gentle, hand-drawn childlike line work and soft shading in the same illustrated style as the scenery. Do not depict any existing character, franchise, logo or emblem; every emblem and symbol must be an original invention.

STYLE: vibrant illustrated storybook-cover look with rich saturated colors, clean outlines, subtle texture and polished professional finish (NOT a 3D render, NOT photorealistic).`;

    const text = `

TEXT RULES (the language of ALL text in the image is BRAZILIAN PORTUGUESE, not English):
Render ONLY the following text lines, exactly as written, character by character, keeping every accent (Á É Í Ó Ú Â Ê Ô Ã Õ Ç) and number. Do not translate, do not invent, do not misspell, do not add any other words, sound effects, watermarks or signatures.
${lines.map((l, i) => `${i + 1}. ${l.role}: "${l.text}"${l.spell ? ` (spelled letter by letter: ${l.spell})` : ''}`).join('\n')}
LAYOUT: the child's name in massive themed lettering at the top/upper-middle; the age large right below it; the invitation phrase as a stylish themed ribbon/banner between the character and the bottom sign; the date, time and address together as clean, highly legible lettering on a themed decorative sign in the lower part of the image, with a small calendar icon beside the date and a small clock icon beside the time, ending at roughly 90% of the image height at most. SAFE ZONE: keep at least 8% empty margin above the title, at least 8% of the image height below the last line of text, and at least 8% of the width on the left and right; the child's name must span at most 75% of the image width; no text may touch or cross any edge and no letter may be cropped.`;

    return { prompt: preface + scene + text, lines };
}

const mimeOf = p => (/\.jpe?g$/i.test(p) ? 'image/jpeg' : /\.webp$/i.test(p) ? 'image/webp' : 'image/png');
const inline = p => ({ inline_data: { mime_type: mimeOf(p), data: fs.readFileSync(p).toString('base64') } });

async function listImageModels() {
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': KEY } });
    if (!res.ok) throw new Error(`Falha ao listar modelos: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return (data.models || [])
        .filter(m => /image/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
}

async function generate(model, parts) {
    const body = (withAspect) => ({
        contents: [{ parts }],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(withAspect ? { imageConfig: { aspectRatio: '2:3' } } : {}),
        },
    });
    const call = async (withAspect) => fetch(`${API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(body(withAspect)),
    });

    let res = await call(true);
    if (res.status === 400) {           // alguns modelos não aceitam imageConfig
        const err = await res.text();
        if (/imageConfig|aspectRatio|Unknown name/i.test(err)) res = await call(false);
        else throw new Error(`400: ${err.slice(0, 400)}`);
    }
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();

    const cand = data.candidates?.[0];
    const imgPart = (cand?.content?.parts || []).find(p => p.inline_data || p.inlineData);
    const inl = imgPart && (imgPart.inline_data || imgPart.inlineData);
    if (!inl) {
        const why = cand?.finishReason || data.promptFeedback?.blockReason || 'sem imagem na resposta';
        const txt = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join(' ').slice(0, 300);
        throw new Error(`Sem imagem (${why}). ${txt}`);
    }
    return { b64: inl.data, mime: inl.mime_type || inl.mimeType || 'image/png', usage: data.usageMetadata };
}

(async () => {
    if (!KEY) {
        console.error('❌ Defina GEMINI_API_KEY no server/.env (chave grátis em https://aistudio.google.com/apikey).');
        process.exit(1);
    }

    const available = await listImageModels();
    console.log('Modelos de imagem disponíveis na sua conta:\n  ' + (available.join('\n  ') || '(nenhum)'));
    if (opt('list')) return;

    const wanted = typeof opt('models') === 'string' ? opt('models').split(',').map(s => s.trim()) : available;
    const photo = typeof opt('photo') === 'string' ? opt('photo') : null;
    const ref = typeof opt('ref') === 'string' ? opt('ref') : null;
    for (const f of [photo, ref].filter(Boolean)) if (!fs.existsSync(f)) { console.error(`❌ Arquivo não encontrado: ${f}`); process.exit(1); }

    const childDesc = await describeChild(photo);
    if (childDesc) console.log(`Descrição da criança (GPT-4o): ${childDesc}`);
    const { prompt, lines } = buildPrompt(!!photo, !!ref, childDesc);
    const outDir = typeof opt('out') === 'string' ? opt('out') : path.join(__dirname, 'test-output-gemini');
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`\nTextos pedidos: ${lines.map(l => `${l.key}="${l.text}"`).join(' | ')}`);
    console.log(`Entradas: foto=${photo ? 'sim' : 'não'} | referência=${ref ? 'sim' : 'não'}\n`);

    let parts = [{ text: prompt }];
    if (photo) parts.push(inline(photo));
    if (ref) parts.push(inline(ref));

    // Modo edição: altera uma imagem já gerada, mantendo o resto igual
    const editFile = typeof opt('edit') === 'string' ? opt('edit') : null;
    if (editFile) {
        if (!fs.existsSync(editFile)) { console.error(`❌ Arquivo não encontrado: ${editFile}`); process.exit(1); }
        const instruction = typeof opt('instruction') === 'string' ? opt('instruction') :
            'Edit this invitation image. Remove the glowing gadget/gauntlet from the left fist of the character (make it a plain red-and-black costume glove like the other hand) and remove the web launcher/harpoon device from his right hand (leave a simple open hand, in a relaxed pointing pose). Keep EVERYTHING else exactly the same: the face, hair and smile, the costume, the pose and composition, the city, the webs, the explosions, the small spiders, the colors, and all text and layout exactly as written. Do not add, remove or change any text and do not add new objects.';
        parts = [{ text: instruction }, inline(editFile)];
        console.log('Modo EDIÇÃO sobre: ' + editFile);
    }

    for (const model of wanted) {
        const t0 = Date.now();
        process.stdout.write(`→ ${model} ... `);
        try {
            // Sobrecarga temporária (503/500) é comum: tenta de novo com espera crescente
            let r, lastErr;
            for (const wait of [0, 5000, 15000, 30000]) {
                if (wait) { process.stdout.write(`(aguardando ${wait / 1000}s) `); await new Promise(res => setTimeout(res, wait)); }
                try { r = await generate(model, parts); break; }
                catch (e) { lastErr = e; if (!/^(503|500|502|504)/.test(e.message)) throw e; }
            }
            if (!r) throw lastErr;
            const secs = ((Date.now() - t0) / 1000).toFixed(1);
            const file = path.join(outDir, `${model}_${Date.now()}.${r.mime.includes('jpeg') ? 'jpg' : 'png'}`);
            fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
            const u = r.usage || {};
            console.log(`OK em ${secs}s | tokens: entrada ${u.promptTokenCount ?? '?'} / saída ${u.candidatesTokenCount ?? '?'} | ${file}`);

            if (opt('verify') && process.env.OPENAI_API_KEY) {
                const check = await verifyPosterText(`data:${r.mime};base64,${r.b64}`, lines);
                console.log(`   conferência de texto: ${check.passed}/${check.total} corretos${check.missing.length ? ' — faltando/errado: ' + check.missing.join(' | ') : ''}`);
            }
        } catch (e) {
            console.log(`FALHOU: ${e.message}`);
        }
    }
    console.log(`\nImagens salvas em: ${outDir}`);
})();
