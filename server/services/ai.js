/* =============================================================================
   MERAKI — Serviço de IA para Geração de Imagens
   Suporta Replicate (Flux.1) e OpenAI (DALL-E 3)
   O provider é detectado automaticamente pelas variáveis de ambiente.

   AJUSTE DE SANITIZAÇÃO DE COPYRIGHT (vs. versão anterior):
   - Antes: sanitizePromptForDalle() só rodava no prompt do DALL-E, e sobre o
     texto JÁ MONTADO inteiro (incluindo as instruções de texto exato do
     nome/idade — risco de o sanitizador mexer nelas). Além disso, a instrução
     do sanitizador citava só 4 exemplos fixos de IP (Spider-Man, Mickey,
     Disney, Marvel), então qualquer tema fora dessa lista passava direto.
   - Agora: sanitizeCopyrightText() roda UMA VEZ, cedo, só sobre o "tema" e
     as "childFeatures" (textos curtos e de alto risco de citar IP) — antes
     de montar qualquer prompt. O bloco de instruções de texto exato
     (nome/idade) nunca passa pelo sanitizador. Isso cobre os dois
     providers (DALL-E e fallback Flux) com uma chamada só, e a instrução
     do sanitizador passou a ser genérica (detecta qualquer franquia, não
     só uma lista fixa de exemplos).
   ============================================================================= */

const Replicate = require('replicate');
const OpenAI = require('openai');
const axios = require('axios');
const sharp = require('sharp');

// Qualidade das imagens do convite: SEMPRE 'medium' (decisão do produto, custo ~4x menor que 'high').
const POSTER_IMAGE_QUALITY = 'medium';

// Função utilitária para delay (evita rate limits)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Estilo base dinâmico por tipo de festa
// ---------------------------------------------------------------------------
function getBaseStyle(type) {
    if (type === 'infantil') return 'ultra-detailed luxury personalized party stationery, playful and vibrant illustration, high resolution, 8k, masterpiece, no text';
    if (type === 'debutante') return 'ultra-detailed luxury personalized party stationery, elegant and glamorous illustration, sophisticated aesthetic, high resolution, 8k, masterpiece, no text';
    return 'ultra-detailed luxury personalized party stationery, elegant, modern and sophisticated minimalist aesthetic, high resolution, 8k, masterpiece, no text';
}

/**
 * Gera prompts cenográficos imersivos e dinâmicos para o kit completo
 */
function getPromptsForProject(projectData, childFeatures = null, inspirationDna = null) {
    const { type, theme, notes, name } = projectData;

    // Tema padrão se o usuário não preencher
    const defaultTheme = type === 'debutante'
        ? 'Princesa Realeza'
        : type === 'adulto'
            ? 'Botânico Minimalista'
            : 'Festa Infantil';

    const activeTheme = (theme && theme.trim()) || defaultTheme;
    const baseStyle = getBaseStyle(type);

    // Elementos da inspiração (se houver análise de visão)
    const palettePrompt = inspirationDna?.palette ? `, exact color palette: ${inspirationDna.palette}` : '';
    const sceneryPrompt = inspirationDna?.scenery ? `, exact scenic elements: ${inspirationDna.scenery}` : '';
    const borderPrompt = inspirationDna?.border ? `, outer border frame style: ${inspirationDna.border}` : '';
    const animalsPrompt = inspirationDna?.animals ? `, secondary characters or elements: ${inspirationDna.animals}` : '';
    const notesExtra = notes ? `, extra details: ${notes}` : '';

    return {
        // Convite Principal: Cenário temático limpo (depende estritamente das referências)
        background: `${baseStyle}, full immersive party stationery scene for "${activeTheme}" theme${palettePrompt}${borderPrompt}${sceneryPrompt}${animalsPrompt}, composition features a beautifully designed frame or banner at the upper-middle for the party title, a clear uncluttered empty center area designed for invitation text, exquisitely rendered invitation template, empty text spaces, completely textless, no words${notesExtra}`,

        // Mascote Oficial: Personagem principal neutro, ditado pela foto da criança e referências
        mascote: `${baseStyle}, ONE SINGLE character mascot illustration for "${activeTheme}" theme${palettePrompt}, dressed in themed outfit${childFeatures ? `, matching the exact physical appearance of the child: ${childFeatures}` : ''}, standing alone in full body pose on pure white background, isolated, highly detailed, strictly ONE person only${notesExtra}`,

        // Prancha de Elementos: Cartela de adesivos temáticos destacados
        elementos: `${baseStyle}, sticker sheet collection of separate individual thematic decorative elements for "${activeTheme}"${palettePrompt}${sceneryPrompt}${animalsPrompt}, laid out neatly on clean white background, isolated elements${notesExtra}`,

        // Fundo / Wallpaper limpo
        fundo: `${baseStyle}, seamless subtle background pattern inspired by "${activeTheme}"${palettePrompt}, decorative motifs, soft textures, tileable wallpaper, no text${notesExtra}`,

        // Papel digital de scrapbook
        papel: `${baseStyle}, digital scrapbook paper with repeating pattern of "${activeTheme}" motifs${palettePrompt}${borderPrompt}, seamless repeat pattern${notesExtra}`,
    };
}



// ---------------------------------------------------------------------------
// Provider: Replicate (Flux.1)
// ---------------------------------------------------------------------------
async function generateWithReplicate(prompt, options = {}) {
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

    // Para Image-to-Image nativo de qualidade superior, usamos o SDXL padrão da Stability AI (com a hash de versão para evitar erro 404)
    const model = options.model || 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b';

    const input = {
        prompt,
        width: options.width || 1024,
        height: options.height || 1024,
        num_outputs: 1,
        disable_safety_checker: true,
        ...options.replicateInput,
    };

    // Mágica do Estilo Canva (Image-to-Image / IP-Adapter)
    if (options.referenceImageBase64) {
        input.image = `data:image/jpeg;base64,${options.referenceImageBase64}`;
        input.prompt_strength = 0.85; // 85% de liberdade para o prompt, 15% de trava estrutural exata da imagem base
        console.log(`[AI/Replicate] 🪄 Injetando imagem de referência (Image-to-Image ativado)`);
    }

    console.log(`[AI/Replicate] Gerando com modelo ${model}...`);
    try {
        const output = await replicate.run(model, { input });
        const urls = Array.isArray(output) ? output : [output];
        return urls[0];
    } catch (err) {
        if (err.message.includes('NSFW') && options.referenceImageBase64) {
            console.warn(`[AI/Replicate] NSFW detectado. Tentando gerar sem a imagem de referência...`);
            delete input.image;
            delete input.prompt_strength;
            const fallbackOutput = await replicate.run(model, { input });
            const urls = Array.isArray(fallbackOutput) ? fallbackOutput : [fallbackOutput];
            return urls[0];
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Provider: OpenAI (gpt-image-1 / DALL-E)
// ---------------------------------------------------------------------------
async function generateWithOpenAI(prompt, options = {}) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const modelsToTry = [
        process.env.OPENAI_IMAGE_MODEL,
        'gpt-image-1',
        'gpt-image-2',
        'gpt-image-1-mini',
        'dall-e-3',
        'dall-e-2',
    ].filter(Boolean);

    // Remove duplicatas mantendo a ordem
    const uniqueModels = [...new Set(modelsToTry)];

    let lastError = null;
    for (const model of uniqueModels) {
        try {
            console.log(`[AI/OpenAI] Tentando gerar com modelo "${model}"...`);
            const params = {
                model,
                prompt: prompt.substring(0, 4000),
                n: 1,
                size: options.size || (model.includes('gpt-image') ? '1024x1536' : '1024x1792'),
            };
            if (model === 'dall-e-3') {
                params.quality = options.quality || 'hd';
            }

            const response = await openai.images.generate(params);
            const item = response.data[0];

            if (item.url) return item.url;
            if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
            if (item.b64) return `data:image/png;base64,${item.b64}`;
        } catch (err) {
            console.warn(`[AI/OpenAI] Modelo "${model}" falhou:`, err.message);
            lastError = err;
        }
    }

    throw new Error(`[AI/OpenAI] Falha na geração com todos os modelos: ${lastError?.message}`);
}


// ---------------------------------------------------------------------------
// Função pública: detecta provider e gera 1 imagem
// ---------------------------------------------------------------------------
async function generateImage(prompt, options = {}) {
    if (process.env.REPLICATE_API_TOKEN) {
        return generateWithReplicate(prompt, options);
    }
    if (process.env.OPENAI_API_KEY) {
        return generateWithOpenAI(prompt, options);
    }
    throw new Error('Nenhuma API de IA configurada. Defina REPLICATE_API_TOKEN ou OPENAI_API_KEY no .env');
}

// ---------------------------------------------------------------------------
// Visão Computacional: Analisa foto da criança (GPT-4o)
// ---------------------------------------------------------------------------
async function analyzeChildPhoto(photoBuffer) {
    if (!process.env.OPENAI_API_KEY || !photoBuffer) return null;
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const b64 = photoBuffer.toString('base64');
        console.log('[AI/Vision] Analisando foto da criança com GPT-4o...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Analyze this photo of a person. Write a 1-sentence description of their facial features, hair style, hair color, and skin tone for an artist. DO NOT mention their clothing or what they are wearing. If they look like a teenager, explicitly say "teenage boy" or "teenage girl". Do not apologize or include extra text.'
                        },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
                    ]
                }
            ],
            max_tokens: 150
        });
        let desc = response.choices[0]?.message?.content?.trim();
        console.log('[AI/Vision] Características da criança (Rosto):', desc);
        if (desc && desc.toLowerCase().includes("sorry")) return null;
        // Força a roupa temática
        desc = desc + ', wearing a casual stylish outfit in the colors of the party theme';
        return desc;
    } catch (e) {
        console.warn('[AI/Vision] Falha ao analisar foto da criança:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Visão Computacional: Analisa imagem de inspiração/referência (GPT-4o)
// ---------------------------------------------------------------------------
async function analyzeReferenceInspiration(refBuffer) {
    if (!process.env.OPENAI_API_KEY || !refBuffer) return null;
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const b64 = refBuffer.toString('base64');
        console.log('[AI/Vision] Analisando referência de inspiração com GPT-4o...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze this image (party decor/theme inspiration). Extract the visual DNA in JSON format. IMPORTANT: describe ONLY colors, environment, decorative motifs, patterns and props. NEVER name or describe any character, person, costume, brand or franchise, and never write a character's name; if a character is in the image, ignore it and describe only the setting around it. Fields:
- "palette": array of 5 exact colors (e.g. ["forest green", "neon pink", "matte black", "gold foil", "cream"]).
- "scenery": array of 2-3 background/scenic elements (e.g. ["enchanted forest with glowing mushrooms", "castle silhouette"]).
- "border": string describing border or frame style (e.g. "ornate gold filigree", "pixelated with sharp corners").
- "animals": array of 2-3 secondary characters/animals if present, or themed objects.
- "theme": a 1-3 word summary of the core theme.
- "typography": string, choose exactly one category that fits the theme best: "pixel", "elegant", "playful", "modern", or "rustic".
- "uiElements": array of exactly 5 objects, each representing an icon/element for the theme. Each object must have "name" (short string in Portuguese) and "emoji" (a single Unicode emoji). Example: [{"name": "Bloco de Terra", "emoji": "🟩"}, {"name": "Espada", "emoji": "🗡️"}].
Ensure valid JSON output without markdown blocks.`
                        },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } }
                    ]
                }
            ],
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });
        const content = response.choices[0]?.message?.content?.trim();
        const dna = JSON.parse(content);
        console.log('[AI/Vision] DNA visual da referência:', dna);
        return dna;
    } catch (e) {
        console.warn('[AI/Vision] Falha ao analisar referência de inspiração:', e.message);
        return null;
    }
}

// Analisa até 3 referências e junta o DNA (arrays somam sem repetir; textos usam o 1º válido)
async function analyzeAllReferences(refs = []) {
    const buffers = refs.filter(r => r?.buffer).slice(0, 3).map(r => r.buffer);
    if (!buffers.length) return null;
    const results = (await Promise.all(buffers.map(b => analyzeReferenceInspiration(b)))).filter(Boolean);
    if (!results.length) return null;
    const merged = {};
    for (const dna of results) {
        for (const [k, v] of Object.entries(dna)) {
            if (Array.isArray(v)) {
                const cur = merged[k] || [];
                const seen = new Set(cur.map(x => JSON.stringify(x)));
                merged[k] = cur.concat(v.filter(x => !seen.has(JSON.stringify(x))));
            } else if (merged[k] == null || merged[k] === '') {
                merged[k] = v;
            }
        }
    }
    if (Array.isArray(merged.palette)) merged.palette = merged.palette.slice(0, 7);
    if (Array.isArray(merged.uiElements)) merged.uiElements = merged.uiElements.slice(0, 5);
    console.log(`[AI/Vision] DNA combinado de ${results.length} referência(s)`);
    return merged;
}

// ---------------------------------------------------------------------------
// Sanitização de Copyright — generalizada, roda cedo sobre textos curtos
// ---------------------------------------------------------------------------
// Diferente da versão anterior (sanitizePromptForDalle), esta função:
// 1) Detecta QUALQUER franquia/IP protegida, não uma lista fixa de exemplos.
// 2) É chamada sobre textos curtos (tema, características da criança) ANTES
//    de montar o prompt final — nunca sobre o prompt inteiro já pronto, o
//    que evita risco de mexer nas instruções de texto exato (nome/idade).
// 3) É chamada uma única vez por geração, cobrindo tanto o caminho DALL-E
//    quanto o fallback Flux, porque ambos reaproveitam o mesmo texto já
//    sanitizado.
async function sanitizeCopyrightText(rawText) {
    if (!process.env.OPENAI_API_KEY || !rawText) return rawText;
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a copyright-safety editor for AI image prompts. Detect ANY reference to a copyrighted or trademarked character, franchise, movie, game, brand, or logo — in any language, including misspellings or partial names. Replace it with a description of the party THEME'S ATMOSPHERE ONLY: the color scheme, the setting/environment, decorative motifs, patterns and props that evoke it. NEVER describe the protected character itself, its costume, mask, face or emblem, and never include any character in the description. Example: a web-slinging superhero theme becomes "a night city with tall skyscrapers, big white spider-web patterns in the sky and corners, a red, blue and black color scheme, comic-book action bursts"; an ice princess theme becomes "a frozen kingdom with snowflakes, ice crystals and a pastel icy-blue and white palette". Apply this to ANY property. Keep everything else in the text unchanged. Do not add commentary. Return only the edited text.`
                },
                { role: 'user', content: rawText }
            ],
            max_tokens: 400,
            temperature: 0.2
        });
        const sanitized = response.choices[0]?.message?.content?.trim();
        return sanitized || rawText;
    } catch (e) {
        console.warn('[AI/Sanitizer] Erro ao sanitizar texto:', e.message);
        return rawText;
    }
}

// ---------------------------------------------------------------------------
// Textos do convite em pt-BR + verificação por OCR
// ---------------------------------------------------------------------------
const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function formatDatePt(raw) {
    if (!raw) return '';
    let m = String(raw).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!m) { const iso = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) m = [null, iso[3], iso[2], iso[1]]; }
    if (!m) return String(raw).toUpperCase();
    const mes = MESES[parseInt(m[2], 10) - 1];
    return mes ? `${parseInt(m[1], 10)} DE ${mes}` : String(raw).toUpperCase();
}

function formatTimePt(raw) {
    if (!raw) return '';
    const m = String(raw).match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!m) return String(raw);
    return `${parseInt(m[1], 10)}H${m[2] && m[2] !== '00' ? m[2] : ''}`;
}

function buildTextLines(p) {
    const lines = [];
    const name = (p.name || '').toUpperCase().trim();
    if (name) lines.push({ role: 'Child name (title)', text: name, spell: name.split('').map(c => c === ' ' ? '(space)' : c).join('-'), key: 'name' });
    if (p.age) lines.push({ role: 'Age', text: `${p.age} ANOS`, key: 'age', num: String(p.age) });
    const date = formatDatePt(p.date);
    if (date) lines.push({ role: 'Party date', text: date, key: 'date' });
    const time = formatTimePt(p.time);
    if (time) lines.push({ role: 'Party time', text: time, key: 'time' });
    if (p.location && p.location.trim()) lines.push({ role: 'Address', text: p.location.trim().toUpperCase(), key: 'location' });
    if (p.phrase && p.phrase.trim()) lines.push({ role: 'Invitation phrase (tagline, keep the exact wording)', text: p.phrase.trim(), key: 'phrase' });
    return lines;
}

const normalizeTxt = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Lê o texto real da imagem (GPT-4o) e confere com o que o usuário digitou
async function verifyPosterText(imageUrl, textLines) {
    const total = textLines.length;
    if (!process.env.OPENAI_API_KEY || !total) return { ok: true, passed: total, total, missing: [] };
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const r = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: [
                { type: 'text', text: 'Transcribe ALL text visible in this image exactly as written (keep accents, do not correct spelling). Then check each edge of the image separately. Set "cut_off" to true if ANY text is cropped by an edge, OR if the lowest line of text (usually the address) is within roughly 4% of the bottom edge, OR the highest text is within roughly 4% of the top edge, OR text is within roughly 3% of the left/right edges. Return JSON: {"lines": ["..."], "cut_off": true|false}.' },
                { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ] }],
            max_tokens: 500,
            response_format: { type: 'json_object' },
        });
        const parsed = JSON.parse(r.choices[0].message.content);
        const read = normalizeTxt((parsed.lines || []).join(' '));
        const missing = [];
        if (parsed.cut_off === true) missing.push('TEXTO CORTADO NA BORDA');
        for (const l of textLines) {
            let ok;
            if (l.key === 'location' || l.key === 'phrase') {
                const words = normalizeTxt(l.text).split(' ').filter(w => w.length > 2 || /\d/.test(w));
                ok = words.length === 0 || words.filter(w => read.includes(w)).length / words.length >= 0.85;
            } else if (l.key === 'age') {
                ok = new RegExp(`(^| )${l.num}( |$)`).test(read) && /(^| )ANOS?( |$)/.test(read);
            } else if (l.key === 'time') {
                ok = read.includes(normalizeTxt(l.text).replace(/ /g, '')) || read.includes(normalizeTxt(l.text));
            } else {
                ok = read.includes(normalizeTxt(l.text));
            }
            if (!ok) missing.push(l.text);
        }
        return { ok: missing.length === 0, passed: Math.max(0, total - missing.length), total, missing };
    } catch (e) {
        console.warn('[AI/Verify] Não foi possível verificar o texto:', e.message);
        return { ok: true, passed: 0, total, missing: [] }; // não bloqueia se a verificação falhar
    }
}

// Versão "inspirada": quando o filtro de segurança recusa a descrição fiel,
// cria um personagem ORIGINAL que só herda o clima (cores e um motivo solto).
async function makeInspiredTheme(themeText) {
    if (!process.env.OPENAI_API_KEY || !themeText) return null;
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const r = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Rewrite the party theme as an ORIGINAL character concept that is only loosely inspired by it. Keep just the general mood and a similar color scheme; change the costume design, mask, emblem and patterns so it is clearly a different, new invented character that nobody would confuse with an existing franchise. No names of existing characters or brands. One or two sentences in English. Return only the text.' },
                { role: 'user', content: themeText },
            ],
            max_tokens: 200,
            temperature: 0.7,
        });
        return r.choices[0]?.message?.content?.trim() || null;
    } catch (e) {
        console.warn('[AI/Inspired] Erro:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Função principal: gera todas as imagens do kit para um projeto
// ---------------------------------------------------------------------------
/**
 * Gera as imagens do kit para um projeto.
 * @param {Object} projectData - Dados do projeto (name, type, theme, notes, etc.)
 * @param {Array} [childPhotos] - Fotos da criança enviadas (req.files.photos)
 * @param {Array} [inspirationRefs] - Imagens de inspiração enviadas (req.files.references)
 * @returns {Promise<Object>} Mapa de item → URL temporária da imagem gerada
 */
async function generateKitImages(projectData, childPhotos = [], inspirationRefs = []) {
    const { type, theme, notes, name } = projectData;

    // O formulário envia "10 anos"; usamos só o número para não escrever "10 anos ANOS"
    const ageDigits = String(projectData.age || '').match(/\d+/);
    projectData.age = ageDigits ? ageDigits[0] : '';

    // Análise de visão computacional em paralelo (foto da criança + referência de estilo)
    const [childFeaturesRaw, inspirationDna] = await Promise.all([
        (childPhotos && childPhotos[0]?.buffer) ? analyzeChildPhoto(childPhotos[0].buffer) : Promise.resolve(null),
        analyzeAllReferences(inspirationRefs),
    ]);

    // Se o tema não foi preenchido explicitamente mas a referência trouxe o tema, usa o da referência
    if ((!theme || !theme.trim()) && inspirationDna?.theme) {
        projectData.theme = inspirationDna.theme;
    }

    const rawThemeLabel = projectData.theme || inspirationDna?.theme || 'Padrão';

    // --- SANITIZAÇÃO CEDO, ANTES DE QUALQUER PROMPT SER MONTADO ---
    // Uma chamada só cobre tema + características da criança, e o resultado
    // é reaproveitado tanto no prompt do DALL-E quanto no fallback do Flux.
    const [activeThemeLabel, childFeatures] = await Promise.all([
        sanitizeCopyrightText(rawThemeLabel),
        sanitizeCopyrightText(childFeaturesRaw),
    ]);

    const prompts = getPromptsForProject(
        { ...projectData, theme: activeThemeLabel },
        childFeatures,
        inspirationDna
    );

    console.log(`[AI] Iniciando geração cenográfica para "${name}" - Tema: "${activeThemeLabel}"`);
    console.log(`[AI] Gerando 5 imagens cenográficas em sequência...`);

    const startTime = Date.now();

    // Converte os buffers de imagem para base64 para injeção de estilo (se o usuário enviou)
    const childB64 = (childPhotos && childPhotos[0]?.buffer) ? childPhotos[0].buffer.toString('base64') : null;
    const refB64 = (inspirationRefs && inspirationRefs[0]?.buffer) ? inspirationRefs[0].buffer.toString('base64') : null;

    // --- PÔSTER ÚNICO: arte + todos os textos em pt-BR, com verificação por OCR ---
    console.log(`[AI/GPT-Image] Gerando 1/5: Convite Pôster Integrado...`);
    let backgroundUrl = null;

    const defaultKid = projectData.age ? `a ${projectData.age}-year-old stylized character` : 'a cute stylized kid';
    const textLines = buildTextLines(projectData);
    console.log('[AI] Textos que serão escritos na arte:', textLines.map(l => `${l.key}="${l.text}"`).join(' | '));

    const buildDescriptivePart = (themeLabel, useChild = true) =>
        `Create a single, unique, spectacular illustrated party invitation poster (vertical, full-bleed art, no white margins, no white boxes). Theme: ${themeLabel}. Style: vibrant illustrated storybook-cover look with rich saturated colors and clean outlines for the scenery and lettering (NOT a 3D render, NOT photorealistic). The main character is the birthday child himself/herself, drawn as a semi-realistic children's book illustration (NOT hyper-realistic, NOT a photo, NOT a generic cartoon) with delicate, gentle hand-drawn childlike line work, and the face must look as similar as possible to the real child (NOT any existing character): keep the child's own face, hair and skin tone exactly as described, but dress the child in a party-theme outfit in the theme's colors with 1-2 theme-inspired accessories (for example a cap, a backpack, and a theme-related prop held in one hand), in a joyful dynamic action pose with an expressive happy face, seamlessly integrated into the themed scenery. Do not depict any existing character. Character appearance: ${(useChild && childFeatures) || defaultKid}. Scenery: ${JSON.stringify(inspirationDna?.scenery || 'highly detailed thematic landscape')}. Color palette: ${JSON.stringify(inspirationDna?.palette || 'vibrant colors')}.`;

    // Instruções de texto exato — NUNCA passam pelo sanitizador.
    const buildTextInstructions = () => `

        TEXT RULES (the language of ALL text in the image is BRAZILIAN PORTUGUESE, not English):
        Render ONLY the following text lines, exactly as written, character by character, keeping every accent (Á É Í Ó Ú Â Ê Ô Ã Õ Ç) and number. Do not translate, do not invent, do not misspell, do not add any other words, watermarks or signatures.
        ${textLines.map((l, i) => `${i + 1}. ${l.role}: "${l.text}"${l.spell ? ` (spelled letter by letter: ${l.spell})` : ''}`).join('\n        ')}
        LAYOUT: the child's name in massive 3D themed lettering integrated into the scene at the top/upper-middle; the age large right below it; the invitation phrase as a stylish themed ribbon/banner/speech-bubble between the character and the bottom sign, easy to read; the date, time and address together as clean, highly legible lettering on a themed decorative sign/banner/plaque that belongs to the scene, placed in the lower part of the image but ending at roughly 90% of the image height at most (never at the very bottom). SAFE ZONE (very important): keep an empty margin of at least 8% of the image height above the top of the title, at least 8% of the image height BELOW the last line of text at the bottom (the address is the lowest text: the bottom sign must end well above the bottom edge, with decorative scenery visible beneath it), and at least 8% of the image width on the left and right of every text; the child's name must span at most 75% of the image width (use smaller letters or two lines if the name is long); no text may touch or cross any edge of the image, and no letter may be cropped. Every word must be fully visible, never cut off, high contrast against its background.`;

    let editUnavailable = false; // true se a conta não tem acesso ao modelo de edição (403)
    let sendRefs = true;         // false depois de uma recusa: mantém a foto da criança, tira as referências
    const generatePoster = async (themeLabel, useChild = true) => {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // MODO FOTO: envia a foto real da criança (+ referências) ao modelo de imagem,
        // em vez de uma descrição em texto — é isso que dá semelhança fiel no rosto.
        if (useChild && !editUnavailable && childPhotos?.[0]?.buffer) {
            const prep = async (buf, name) => OpenAI.toFile(
                await sharp(buf).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer(),
                name, { type: 'image/jpeg' });
            const files = [await prep(childPhotos[0].buffer, 'crianca.jpg')];
            for (const [i, ref] of (sendRefs ? (inspirationRefs || []) : []).slice(0, 2).entries()) {
                if (ref?.buffer) files.push(await prep(ref.buffer, `referencia${i + 1}.jpg`));
            }
            const preface = `INPUT IMAGES: Image 1 is a photo of the birthday child. The character MUST be a semi-realistic children's illustration (not hyper-realistic) of this exact child, with delicate childlike drawing lines, as similar as possible to the real face (same face shape, eyes, eyebrows, nose, smile, hair color, style and texture, skin tone and apparent age) so that his/her family instantly recognizes him/her. Do NOT copy the clothing or the background of the photo. IGNORE any text, numbers, candles, logos or letters visible in ANY input image: the ONLY text allowed in the final art is the text listed in TEXT RULES below, and the age is exactly the one listed there (never any other number).${files.length > 1 ? ' The other input images are theme references: use ONLY their color palette, environment and decorative motifs, and NEVER copy any character from them.' : ''}

`;
            const prompt = preface + buildDescriptivePart(themeLabel, false) + buildTextInstructions();
            console.log(`[AI/GPT-Image] Prompt (MODO FOTO, ${files.length} imagem(ns) enviada(s)):
${prompt}`);
            // Mesmo modelo que dava a qualidade boa primeiro; gpt-image-1 só como reserva
            const editModels = [...new Set([process.env.OPENAI_EDIT_MODEL, process.env.OPENAI_POSTER_MODEL || 'chatgpt-image-latest', 'gpt-image-1'].filter(Boolean))];
            let r = null;
            let lastErr = null;
            for (const model of editModels) {
                const params = { model, image: files, prompt, size: '1024x1536', quality: POSTER_IMAGE_QUALITY, input_fidelity: 'high' };
                try {
                    console.log(`[AI/GPT-Image] Edição com foto usando o modelo "${model}"...`);
                    try {
                        r = await openai.images.edit(params);
                    } catch (e) {
                        if (e.status === 400 && /input_fidelity|unknown|unsupported|unrecognized/i.test(e.message || '')) {
                            delete params.input_fidelity;
                            r = await openai.images.edit(params);
                        } else {
                            throw e;
                        }
                    }
                    break;
                } catch (e) {
                    lastErr = e;
                    // Modelo inexistente/sem suporte a edição: tenta o próximo. Recusa de segurança ou erro de conta: repassa.
                    const modelProblem = e.status === 404 || (e.status === 400 && /model|not supported|does not support/i.test(e.message || '') && !/safety/i.test(e.message || ''));
                    console.warn(`[AI/GPT-Image] Edição com "${model}" falhou: ${e.message}`);
                    if (!modelProblem) throw e;
                }
            }
            if (!r) throw lastErr;
            const it = r.data[0];
            return it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : null);
        }
        const prompt = buildDescriptivePart(themeLabel, useChild) + buildTextInstructions();
        console.log(`[AI/GPT-Image] Prompt (tema ${themeLabel === activeThemeLabel ? 'fiel' : 'alternativo'}, foto da criança ${useChild && childFeatures ? 'SIM' : 'NÃO'}):
${prompt}`);
        const r = await openai.images.generate({
            model: process.env.OPENAI_POSTER_MODEL || 'chatgpt-image-latest',
            prompt,
            n: 1,
            size: '1024x1536',
            quality: POSTER_IMAGE_QUALITY,
        });
        const it = r.data[0];
        return it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : null) || (it.b64 ? `data:image/png;base64,${it.b64}` : null);
    };

    // Até 3 tentativas: gera -> lê o texto da imagem -> confere. Guarda a melhor.
    const MAX_ATTEMPTS = 5;
    let best = { url: null, score: -1 };
    // Escada: fiel -> original inspirado -> genérico (só avança se o filtro recusar)
    const genericTheme = `${projectData.type === 'infantil' ? 'children' : 'elegant'} party with original decorative elements`;
    let themeForPoster = activeThemeLabel;
    let refusals = 0;
    let useChildFeatures = true;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let url = null;
        try {
            url = await generatePoster(themeForPoster, useChildFeatures);
        } catch (e) {
            console.warn(`[AI/GPT-Image] Tentativa ${attempt} falhou: ${e.message}`);
            // Sem acesso ao modelo de edição (ex.: organização não verificada): segue sem enviar a foto
            if (e.status === 403 && !editUnavailable && useChildFeatures && childPhotos?.[0]?.buffer) {
                editUnavailable = true;
                console.warn('[AI/GPT-Image] Modelo de edição indisponível (403). Usando geração sem foto; verifique a organização na OpenAI para habilitar semelhança fiel.');
                continue;
            }
            // Falhas de conta/limite/autenticação não se resolvem trocando o prompt
            if ([401, 402, 403, 429].includes(e.status) || /insufficient_quota|no credits/i.test(e.message || '')) {
                throw new Error(`OpenAI indisponível (${e.status || 'erro'}): ${e.message}`);
            }
            // 1º degrau da escada: recusou com foto + referências -> tenta só com a foto (mantém o rosto)
            if (sendRefs && useChildFeatures && !editUnavailable && childPhotos?.[0]?.buffer && (inspirationRefs || []).some(r => r?.buffer)) {
                sendRefs = false;
                console.warn('[AI/GPT-Image] Recusado com referências. Refazendo só com a foto da criança (sem enviar as referências).');
                continue;
            }
            // Recusa do filtro de segurança: afasta o tema do original a cada vez
            refusals++;
            useChildFeatures = false; // descrição de aparência da criança é gatilho comum do filtro
            if (refusals === 1) {
                // 1ª recusa: mantém o tema fiel e só tira a descrição da foto (era o gatilho)
                themeForPoster = activeThemeLabel;
            } else if (refusals === 2) {
                const inspired = await makeInspiredTheme(activeThemeLabel);
                console.log('[AI/Inspired] Tema reescrito como personagem original:', inspired);
                themeForPoster = inspired || genericTheme;
            } else {
                themeForPoster = genericTheme;
            }
            continue;
        }
        if (!url) continue;
        const check = await verifyPosterText(url, textLines);
        console.log(`[AI/Verify] Tentativa ${attempt}: ${check.passed}/${check.total} textos corretos`, check.missing.length ? `— faltando/errado: ${check.missing.join(' | ')}` : '');
        if (check.passed > best.score) best = { url, score: check.passed };
        if (check.ok) break;
    }
    if (!best.url) {
        throw new Error('Não foi possível gerar o convite (a IA recusou ou falhou em todas as tentativas).');
    }
    backgroundUrl = best.url;
    console.log(`[AI/GPT-Image] ✅ Pôster gerado. Textos corretos: ${best.score}`);

    /* -- COMENTADO TEMPORARIAMENTE A PEDIDO DO USUÁRIO PARA ECONOMIZAR TEMPO E FOCO NO PÔSTER --
       Mantido aqui porque será reativado no futuro. Quando isso acontecer, os prompts
       gerados por getPromptsForProject() já estarão seguros, porque a função já recebe
       o `theme` sanitizado (activeThemeLabel) — ver chamada de getPromptsForProject()
       logo acima. Não é necessário sanitizar de novo.

    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);
    
    console.log(`[AI/Replicate] Gerando 2/5: Mascote...`);
    const mascoteRef = childB64 || refB64; // Usa a foto da criança para cartonizar, se houver
    let mascoteUrl = null;
    try {
        mascoteUrl = await generateImage(prompts.mascote, { width: 1024, height: 1024, referenceImageBase64: mascoteRef });
    } catch (e) {
        console.warn(`[AI/Replicate] Falha no Mascote:`, e.message);
    }
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);

    console.log(`[AI/Replicate] Gerando 3/5: Elementos...`);
    let elementosUrl = null;
    try {
        elementosUrl = await generateImage(prompts.elementos, { width: 1024, height: 1024 });
    } catch (e) {
        console.warn(`[AI/Replicate] Falha nos Elementos:`, e.message);
    }
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);

    console.log(`[AI/Replicate] Gerando 4/5: Fundo...`);
    let fundoUrl = null;
    try {
        fundoUrl = await generateImage(prompts.fundo, { width: 1024, height: 1024 });
    } catch (e) {
        console.warn(`[AI/Replicate] Falha no Fundo:`, e.message);
    }
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);

    console.log(`[AI/Replicate] Gerando 5/5: Papel Digital...`);
    let papelUrl = null;
    try {
        papelUrl = await generateImage(prompts.papel, { width: 1024, height: 1024 });
    } catch (e) {
        console.warn(`[AI/Replicate] Falha no Papel Digital:`, e.message);
    }

    // --- FASE EXTRA: LEMBRETE INTEGRADO VIA GPT-IMAGE ---
    console.log(`[AI/GPT-Image] Gerando Lembrete Nativo (Bônus)...`);
    let lembreteUrl = null;
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        let lembretePrompt = `Create a spectacular, professional 3D animated movie poster acting as a party reminder. Theme: ${activeThemeLabel}. The art style MUST BE highly stylized 3D cartoon animation (like Pixar or Disney, absolutely NOT photorealistic). In the center of the scene, there is a cute 3D cartoon character seamlessly integrated into the environment. The character is described as: ${childFeatures || 'a cute stylized kid matching the theme'}. The color palette is vibrant: ${JSON.stringify(inspirationDna?.palette || 'vibrant colors')}. IMPORTANT: The image MUST contain perfectly rendered massive 3D typography integrated into the scene that explicitly reads EXACTLY: "FALTAM 5 DIAS", and below it smaller typography reading: "Para a festa do ${name.toUpperCase()}!". The typography must match the theme perfectly.`;
        
        // Já não precisa sanitizar aqui — activeThemeLabel e childFeatures já vieram seguros.

        const lembreteResponse = await openai.images.generate({
            model: "chatgpt-image-latest",
            prompt: lembretePrompt,
            n: 1,
            size: "1024x1536", 
        });
        const lembreteItem = lembreteResponse.data[0];
        lembreteUrl = lembreteItem.url || (lembreteItem.b64_json ? `data:image/png;base64,${lembreteItem.b64_json}` : null) || (lembreteItem.b64 ? `data:image/png;base64,${lembreteItem.b64}` : null);
        console.log(`[AI/GPT-Image] ✅ Lembrete gerado com sucesso!`);
    } catch (e) {
        console.warn(`[AI/GPT-Image] Falha ao gerar lembrete nativo:`, e.message);
    }
    -------------------------------------------------------------------------------------- */

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AI] ✅ ${Object.keys(prompts).length} imagens cenográficas geradas em ${elapsed}s`);

    return {
        background: backgroundUrl,
        lembrete: null, // lembreteUrl temporariamente desativado
        mascote: null, // mascoteUrl temporariamente desativado
        elementos: null, // elementosUrl temporariamente desativado
        fundo: null, // fundoUrl temporariamente desativado
        papel: null, // papelUrl temporariamente desativado
        _dna: inspirationDna, // DNA usado pelo frontend para fontes e ícones dinâmicos
    };
}



module.exports = { generateImage, generateKitImages, getPromptsForProject };