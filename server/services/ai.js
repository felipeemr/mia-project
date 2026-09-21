/* =============================================================================
   MERAKI — Serviço de IA para Geração de Imagens
   Suporta Replicate (Flux.1) e OpenAI (DALL-E 3)
   O provider é detectado automaticamente pelas variáveis de ambiente.
   ============================================================================= */

const Replicate = require('replicate');
const OpenAI    = require('openai');
const axios     = require('axios');

// ---------------------------------------------------------------------------
// Estilo base de papelaria de luxo (estilo "Fazendinha da Betina")
// ---------------------------------------------------------------------------
const BASE_STYLE = 'ultra-detailed luxury personalized party stationery, cute chibi doll illustration, soft dimensional 3D depth, delicate pastel watercolor and digital art, Brazilian festa infantil de luxo, high resolution, 8k, masterpiece, no text';

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
            : 'Fazendinha Delicada';

    const activeTheme = (theme && theme.trim()) || defaultTheme;

    // Elementos da inspiração (se houver análise de visão)
    const palettePrompt  = inspirationDna?.palette  ? `, color palette: ${inspirationDna.palette}` : ', soft pastel tones with gentle pinks, cream, warm wood and subtle accents';
    const sceneryPrompt  = inspirationDna?.scenery  ? `, scenic elements: ${inspirationDna.scenery}` : '';
    const borderPrompt   = inspirationDna?.border   ? `, outer border: ${inspirationDna.border}` : ', decorative pastel gingham plaid border frame with soft rounded corners';
    const animalsPrompt  = inspirationDna?.animals  ? `, cute characters: ${inspirationDna.animals}` : ', adorable baby animals with matching pastel bows along the bottom';
    const notesExtra     = notes ? `, extra details: ${notes}` : '';

    return {
        // Convite Principal: Cenário temático completo com placas para texto
        background: `${BASE_STYLE}, full immersive party stationery scene for "${activeTheme}" theme${palettePrompt}${borderPrompt}${sceneryPrompt}${animalsPrompt}, composition features a rustic wooden plaque or parchment ribbon banner at the upper-middle for the party title, a clear uncluttered soft cream center area designed for invitation text and icons, and a small wooden post sign at the bottom footer, beautiful sunny sky, flower meadows, exquisitely rendered invitation template, empty text spaces, no text${notesExtra}`,

        // Mascote Oficial: Bonequinha/personagem chibi fofo temático
        mascote: `${BASE_STYLE}, full body cute chibi character mascot for "${activeTheme}" theme, dressed in charming themed outfit with accessories${childFeatures ? `, matching child appearance: ${childFeatures}` : ', big sparkling expressive eyes, sweet gentle smile'}, standing in full body pose on pure white background, isolated${notesExtra}`,

        // Prancha de Elementos: Cartela de adesivos temáticos destacados
        elementos: `${BASE_STYLE}, sticker sheet collection of separate individual thematic decorative elements for "${activeTheme}" (baby animals with pink bows, wooden signs, themed icons, flower clusters, sun, clouds, ribbons), laid out neatly on clean white background, isolated elements${notesExtra}`,

        // Fundo / Wallpaper limpo
        fundo: `${BASE_STYLE}, seamless subtle background pattern inspired by "${activeTheme}", delicate pastel motifs, soft textures, tileable wallpaper, no text${notesExtra}`,

        // Papel digital de scrapbook
        papel: `${BASE_STYLE}, digital scrapbook paper with repeating pattern of "${activeTheme}" motifs, pastel gingham or floral repeat pattern, seamless pattern${notesExtra}`,
    };
}



// ---------------------------------------------------------------------------
// Provider: Replicate (Flux.1)
// ---------------------------------------------------------------------------
async function generateWithReplicate(prompt, options = {}) {
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

    const model = options.model || 'black-forest-labs/flux-1.1-pro';
    const input  = {
        prompt,
        width:       options.width  || 768,
        height:      options.height || 1024,
        num_outputs: 1,
        output_format: 'png',
        output_quality: 95,
        ...options.replicateInput,
    };

    console.log(`[AI/Replicate] Gerando com modelo ${model}...`);
    const output = await replicate.run(model, { input });

    // Replicate retorna array de URLs
    const urls = Array.isArray(output) ? output : [output];
    return urls[0];
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
            const item     = response.data[0];

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
                            text: 'Analyze this photo of a child. Describe physical appearance (hair style/color/pigtails/curls, skin tone, eye color, happy facial expression) in 1-2 concise sentences in English for an artist creating a cute chibi doll character illustration.' 
                        },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
                    ]
                }
            ],
            max_tokens: 150
        });
        const desc = response.choices[0]?.message?.content?.trim();
        console.log('[AI/Vision] Características da criança:', desc);
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
                            text: 'Analyze this luxury party stationery invitation design reference. Extract in JSON format:\n' +
                                  '{\n' +
                                  '  "palette": "concise list of 3-5 pastel colors (e.g. pastel pink, baby gingham, cream, soft warm wood)",\n' +
                                  '  "scenery": "key background scenery structures (e.g. pink barn, windmill, white picket fence, flower meadows)",\n' +
                                  '  "border": "outer border frame style (e.g. pink gingham plaid checkered border with rounded corners)",\n' +
                                  '  "animals": "cute sidekick characters/animals (e.g. baby sheep, calf, piglet, chicken with pink bows)",\n' +
                                  '  "theme": "the primary theme name (e.g. Fazendinha, Minecraft, Safari, Princesa)"\n' +
                                  '}\nReturn ONLY valid JSON.'
                        },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
                    ]
                }
            ],
            max_tokens: 250,
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

    // Análise de visão computacional em paralelo (foto da criança + referência de estilo)
    const [childFeatures, inspirationDna] = await Promise.all([
        (childPhotos && childPhotos[0]?.buffer) ? analyzeChildPhoto(childPhotos[0].buffer) : Promise.resolve(null),
        (inspirationRefs && inspirationRefs[0]?.buffer) ? analyzeReferenceInspiration(inspirationRefs[0].buffer) : Promise.resolve(null),
    ]);

    // Se o tema não foi preenchido explicitamente mas a referência trouxe o tema, usa o da referência
    if ((!theme || !theme.trim()) && inspirationDna?.theme) {
        projectData.theme = inspirationDna.theme;
    }

    const prompts = getPromptsForProject(projectData, childFeatures, inspirationDna);

    const activeThemeLabel = projectData.theme || inspirationDna?.theme || 'Padrão';
    console.log(`[AI] Iniciando geração cenográfica para "${name}" - Tema: "${activeThemeLabel}"`);
    console.log(`[AI] Gerando 5 imagens cenográficas em paralelo...`);

    const startTime = Date.now();

    // Gera todas as imagens em paralelo para velocidade máxima
    const [backgroundUrl, mascoteUrl, elementosUrl, fundoUrl, papelUrl] = await Promise.all([
        generateImage(prompts.background, { width: 768,  height: 1024 }),
        generateImage(prompts.mascote,    { width: 768,  height: 768  }),
        generateImage(prompts.elementos,  { width: 1024, height: 1024 }),
        generateImage(prompts.fundo,      { width: 1024, height: 1024 }),
        generateImage(prompts.papel,      { width: 1024, height: 1024 }),
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AI] ✅ ${Object.keys(prompts).length} imagens cenográficas geradas em ${elapsed}s`);

    return {
        background:   backgroundUrl,
        mascote:      mascoteUrl,
        elementos:    elementosUrl,
        fundo:        fundoUrl,
        papel:        papelUrl,
    };
}



module.exports = { generateImage, generateKitImages, getPromptsForProject };
