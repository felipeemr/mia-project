/* =============================================================================
   MERAKI — Serviço de IA para Geração de Imagens
   Suporta Replicate (Flux.1) e OpenAI (DALL-E 3)
   O provider é detectado automaticamente pelas variáveis de ambiente.
   ============================================================================= */

const Replicate = require('replicate');
const OpenAI    = require('openai');
const axios     = require('axios');

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
    const baseStyle   = getBaseStyle(type);

    // Elementos da inspiração (se houver análise de visão)
    const palettePrompt  = inspirationDna?.palette  ? `, exact color palette: ${inspirationDna.palette}` : '';
    const sceneryPrompt  = inspirationDna?.scenery  ? `, exact scenic elements: ${inspirationDna.scenery}` : '';
    const borderPrompt   = inspirationDna?.border   ? `, outer border frame style: ${inspirationDna.border}` : '';
    const animalsPrompt  = inspirationDna?.animals  ? `, secondary characters or elements: ${inspirationDna.animals}` : '';
    const notesExtra     = notes ? `, extra details: ${notes}` : '';

    return {
        // Convite Principal: Cenário temático limpo (depende estritamente das referências)
        background: `${baseStyle}, full immersive party stationery scene for "${activeTheme}" theme${palettePrompt}${borderPrompt}${sceneryPrompt}${animalsPrompt}, composition features a beautifully designed frame or banner at the upper-middle for the party title, a clear uncluttered empty center area designed for invitation text, exquisitely rendered invitation template, empty text spaces, completely textless, no words${notesExtra}`,

        // Mascote Oficial: Personagem principal neutro, ditado pela foto da criança e referências
        mascote: `${baseStyle}, full body character mascot illustration for "${activeTheme}" theme${palettePrompt}, dressed in themed outfit${childFeatures ? `, matching the exact physical appearance of the child: ${childFeatures}` : ''}, standing in full body pose on pure white background, isolated, highly detailed${notesExtra}`,

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
    
    const input  = {
        prompt,
        width:       options.width  || 1024,
        height:      options.height || 1024,
        num_outputs: 1,
        ...options.replicateInput,
    };

    // Mágica do Estilo Canva (Image-to-Image / IP-Adapter)
    if (options.referenceImageBase64) {
        input.image = `data:image/jpeg;base64,${options.referenceImageBase64}`;
        input.prompt_strength = 0.85; // 85% de liberdade para o prompt, 15% de trava estrutural exata da imagem base
        console.log(`[AI/Replicate] 🪄 Injetando imagem de referência (Image-to-Image ativado)`);
    }

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
                            text: 'Analyze this photo of a person. Describe physical appearance (hair style/color, skin tone, eye color, facial expression) in 1-2 concise sentences in English for an artist creating a stylized character illustration. Do not dictate a specific art style (like chibi or anime), focus strictly on physical traits.' 
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
                            text: `Analyze this image (party decor/theme inspiration). Extract the visual DNA in JSON format with exactly these fields:
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
    console.log(`[AI] Gerando 5 imagens cenográficas em sequência...`);

    const startTime = Date.now();

    // Converte os buffers de imagem para base64 para injeção de estilo (se o usuário enviou)
    const childB64 = (childPhotos && childPhotos[0]?.buffer) ? childPhotos[0].buffer.toString('base64') : null;
    const refB64 = (inspirationRefs && inspirationRefs[0]?.buffer) ? inspirationRefs[0].buffer.toString('base64') : null;

    // --- FASE 7: PÔSTER INTEGRADO VIA GPT-IMAGE / FLUX ---
    console.log(`[AI/GPT-Image] Gerando 1/5: Convite Pôster Integrado...`);
    let backgroundUrl = null;
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const dallePrompt = `Create a spectacular, professional 3D animated movie poster acting as a party invitation. Theme: ${activeThemeLabel}. The art style should be highly detailed 3D render (similar to Pixar/Disney or Unreal Engine 5). In the center of the scene, there is a 3D character seamlessly integrated into the environment. The character is described as: ${childFeatures || 'a cute stylized kid matching the theme'}. The character is interacting with the epic scenery (${JSON.stringify(inspirationDna?.scenery || 'highly detailed thematic landscape')}). The color palette is vibrant: ${JSON.stringify(inspirationDna?.palette || 'vibrant colors')}. IMPORTANT: The image MUST contain perfectly rendered massive 3D typography integrated into the scene (e.g. floating blocks, neon signs, or cinematic titles) that explicitly reads exactly: "${name.toUpperCase()}", and "${projectData.age ? projectData.age + ' ANOS' : ''}". Somewhere elegant in the poster, include the text: "Data: ${projectData.date || 'TBD'} às ${projectData.time ? projectData.time + 'h' : 'TBD'}". Also prominently include the location text: "${projectData.location || ''}". Finally, include the short phrase: "${projectData.phrase || ''}". The typography must match the theme perfectly.`;
        
        const dalleResponse = await openai.images.generate({
            model: "chatgpt-image-latest",
            prompt: dallePrompt,
            n: 1,
            size: "1024x1536", // Vertical poster ratio supported by GPT Image
        });
        const item = dalleResponse.data[0];
        backgroundUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null) || (item.b64 ? `data:image/png;base64,${item.b64}` : null);
        console.log(`[AI/GPT-Image] ✅ Pôster gerado com sucesso! backgroundUrl existe:`, !!backgroundUrl);
    } catch (e) {
        console.warn(`[AI/GPT-Image] Falha ao gerar pôster: ${e.message}. Acionando fallback para FLUX.1 no Replicate...`);
        // O Flux.1 é excelente em tipografia. Usamos uma narrativa rica como no Midjourney/ChatGPT.
        const fluxPrompt = `A spectacular professional 3D animated movie poster acting as a party invitation. Theme: ${activeThemeLabel}. The art style is a highly detailed 3D render (Pixar/Disney or Unreal Engine 5 style). In the center of the scene stands a 3D character seamlessly integrated into the epic environment. The character's physical traits: ${childFeatures || 'a cute stylized kid matching the theme'}. The character is interacting with the scenery (${JSON.stringify(inspirationDna?.scenery || 'highly detailed thematic landscape')}). Color palette: ${JSON.stringify(inspirationDna?.palette || 'vibrant colors')}. The image MUST contain perfectly rendered massive 3D typography integrated into the scene (like cinematic titles or carved in the environment) that explicitly reads EXACTLY: "${name.toUpperCase()}", and "${projectData.age ? projectData.age + ' ANOS' : ''}". Also include the text: "Data: ${projectData.date || 'TBD'} às ${projectData.time ? projectData.time + 'h' : 'TBD'}". Below that, write the location text: "${projectData.location || ''}". Also include the inviting phrase: "${projectData.phrase || ''}". The typography perfectly matches the theme's aesthetic. Masterpiece, 8k resolution, highly detailed.`;
        backgroundUrl = await generateWithReplicate(fluxPrompt, { 
            model: 'black-forest-labs/flux-schnell', 
            width: 1024, 
            height: 1024 
            // Flux não aceita referenceImageBase64 diretamente via API padrão, então mandamos só o prompt
        });
    }
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);
    
    console.log(`[AI/Replicate] Gerando 2/5: Mascote...`);
    // Usamos refB64 (imagem do tema) para o estilo, e NUNCA a foto da criança (childB64), 
    // pois isso faria a IA gerar uma foto real. As feições da criança já estão no texto do prompt.
    const mascoteUrl    = await generateImage(prompts.mascote,    { width: 1024, height: 1024, referenceImageBase64: refB64 });
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);

    console.log(`[AI/Replicate] Gerando 3/5: Elementos...`);
    const elementosUrl  = await generateImage(prompts.elementos,  { width: 1024, height: 1024, referenceImageBase64: refB64 });
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);

    console.log(`[AI/Replicate] Gerando 4/5: Fundo...`);
    const fundoUrl      = await generateImage(prompts.fundo,      { width: 1024, height: 1024, referenceImageBase64: refB64 });
    
    console.log(`[AI/Replicate] Pausa de 12s para esfriar o Rate Limit...`);
    await delay(12000);

    console.log(`[AI/Replicate] Gerando 5/5: Papel Digital...`);
    const papelUrl      = await generateImage(prompts.papel,      { width: 1024, height: 1024, referenceImageBase64: refB64 });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AI] ✅ ${Object.keys(prompts).length} imagens cenográficas geradas em ${elapsed}s`);

    return {
        background:   backgroundUrl,
        mascote:      mascoteUrl,
        elementos:    elementosUrl,
        fundo:        fundoUrl,
        papel:        papelUrl,
        _dna:         inspirationDna, // DNA usado pelo frontend para fontes e ícones dinâmicos
    };
}



module.exports = { generateImage, generateKitImages, getPromptsForProject };
