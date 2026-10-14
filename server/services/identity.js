/* =============================================================================
   MERAKI — Identidade Visual da Festa (custo zero de IA)
   Deriva paleta de cores e par de fontes a partir da arte do convite aprovada,
   para que Logotipo, Brasão, Monograma, Papel Digital e as tipografias
   usem sempre as mesmas cores e fontes do convite.
   Só fontes de licença livre (Google Fonts / OFL).
   ============================================================================= */

const sharp = require('sharp');

// ---------------------------------------------------------------------------
// Pares de fontes (principal para títulos, complementar para textos)
// ---------------------------------------------------------------------------
const FONT_PAIRS = {
    playful: {
        main:          { family: 'Fredoka',            category: 'display',  weights: [500, 700] },
        complementary: { family: 'Nunito',             category: 'sans',     weights: [400, 600] },
    },
    elegant: {
        main:          { family: 'Playfair Display',   category: 'serif',    weights: [600, 700] },
        complementary: { family: 'Poppins',            category: 'sans',     weights: [400, 500] },
    },
    modern: {
        main:          { family: 'Montserrat',         category: 'sans',     weights: [600, 800] },
        complementary: { family: 'Inter',              category: 'sans',     weights: [400, 500] },
    },
    rustic: {
        main:          { family: 'Cormorant Garamond', category: 'serif',    weights: [600, 700] },
        complementary: { family: 'Lato',               category: 'sans',     weights: [400, 700] },
    },
    pixel: {
        main:          { family: 'Press Start 2P',     category: 'display',  weights: [400] },
        complementary: { family: 'VT323',              category: 'mono',     weights: [400] },
    },
};

const DEFAULT_STYLE_BY_TYPE = { infantil: 'playful', debutante: 'elegant', adulto: 'modern' };

// Paletas de reserva (as mesmas que o frontend já usava)
const FALLBACK_PALETTE = {
    infantil:  ['#69D7D1', '#F7A8C8', '#AEEDEA', '#FBE1EC', '#2B2B2B'],
    debutante: ['#F7A8C8', '#DFBA73', '#FBE1EC', '#FFFBEB', '#2B2B2B'],
    adulto:    ['#3A7D7A', '#DFBA73', '#69D7D1', '#E6F4F3', '#2B2B2B'],
};

// ---------------------------------------------------------------------------
// Utilitários de cor
// ---------------------------------------------------------------------------
const toHex = (r, g, b) =>
    '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
    }
    return { h, s, l };
}

const colorDist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

// ---------------------------------------------------------------------------
// Extração por matiz: agrupa pixels pela cor (não faz média entre cores
// diferentes, o que gerava marrons "lamacentos" com k-means)
// ---------------------------------------------------------------------------
function avgColor(list) {
    const n = list.length || 1;
    const sum = list.reduce((t, p) => [t[0] + p.r, t[1] + p.g, t[2] + p.b], [0, 0, 0]);
    return { r: sum[0] / n, g: sum[1] / n, b: sum[2] / n };
}

/**
 * Extrai 5 cores da arte: [primária, secundária, destaque, clara, escura]
 */
async function extractPalette(imageBuffer, type = 'infantil') {
    const fallback = FALLBACK_PALETTE[type] || FALLBACK_PALETTE.infantil;
    try {
        const { data, info } = await sharp(imageBuffer)
            .resize(96, 96, { fit: 'cover' })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = [];
        for (let i = 0; i < data.length; i += info.channels) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            pixels.push({ r, g, b, ...rgbToHsl(r, g, b) });
        }

        // 1) Cores de marca: pixels saturados e de luminosidade média, agrupados por matiz (12 faixas de 30°)
        const BUCKETS = 12;
        const buckets = Array.from({ length: BUCKETS }, () => []);
        for (const p of pixels) {
            if (p.s >= 0.35 && p.l >= 0.22 && p.l <= 0.8) {
                buckets[Math.floor(p.h / (360 / BUCKETS)) % BUCKETS].push(p);
            }
        }
        const ranked = buckets
            .map((list, i) => ({ i, list, score: list.length * (list.reduce((t, p) => t + p.s, 0) / (list.length || 1)) }))
            .filter(x => x.list.length >= 12)
            .sort((x, y) => y.score - x.score);

        const chosen = [];
        for (const cand of ranked) {
            if (chosen.length >= 3) break;
            // usa só a metade mais saturada da faixa: cor "de marca" viva, sem o sombreado da ilustração
            const vivid = cand.list.slice().sort((x, y) => y.s - x.s).slice(0, Math.max(8, Math.ceil(cand.list.length / 2)));
            const c = avgColor(vivid);
            // evita duas cores quase iguais
            if (chosen.every(o => colorDist(o, c) >= 70)) chosen.push(c);
        }

        // 2) Clara e escura: médias dos extremos de luminosidade (preserva o tom, ex.: azul-marinho)
        const darkPx  = pixels.filter(p => p.l < 0.28);
        const lightPx = pixels.filter(p => p.l > 0.82);
        const darkest = darkPx.length  >= 20 ? avgColor(darkPx)  : null;
        const lightest = lightPx.length >= 20 ? avgColor(lightPx) : null;

        const out = chosen.map(c => toHex(c.r, c.g, c.b));
        while (out.length < 3) out.push(fallback[out.length]);
        out.push(lightest ? toHex(lightest.r, lightest.g, lightest.b) : fallback[3]);
        out.push(darkest  ? toHex(darkest.r,  darkest.g,  darkest.b)  : fallback[4]);
        return out;
    } catch (e) {
        console.warn('[Identity] Falha ao extrair paleta, usando padrão do tipo:', e.message);
        return fallback.slice();
    }
}

/**
 * Escolhe o par de fontes a partir do DNA da referência (se houver) ou do tipo de festa.
 */
function pickFonts(type = 'infantil', dna = null) {
    const key = (dna?.typography || '').toLowerCase();
    const style = FONT_PAIRS[key] ? key : (DEFAULT_STYLE_BY_TYPE[type] || 'playful');
    const pair = FONT_PAIRS[style];

    const families = [pair.main, pair.complementary]
        .map(f => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights.join(';')}`)
        .join('&');

    return {
        style,
        main: pair.main,
        complementary: pair.complementary,
        googleFontsUrl: `https://fonts.googleapis.com/css2?${families}&display=swap`,
    };
}

// ---------------------------------------------------------------------------
// Catálogo de fontes livres (Google Fonts) para escolher a MAIS PARECIDA com o título do convite
// ---------------------------------------------------------------------------
const FONT_CATALOG = {
    main: [
        { family: 'Fredoka',            category: 'display', weights: [500, 700], desc: 'rounded, friendly, bold, playful kids' },
        { family: 'Baloo 2',            category: 'display', weights: [600, 800], desc: 'rounded bubbly cheerful kids' },
        { family: 'Lilita One',         category: 'display', weights: [400],      desc: 'chunky rounded heavy display' },
        { family: 'Titan One',          category: 'display', weights: [400],      desc: 'very fat rounded bubbly cartoon' },
        { family: 'Luckiest Guy',       category: 'display', weights: [400],      desc: 'comic-book bold chunky capitals' },
        { family: 'Bangers',            category: 'display', weights: [400],      desc: 'comic action capitals, superhero' },
        { family: 'Righteous',          category: 'display', weights: [400],      desc: 'rounded geometric retro-modern, neon' },
        { family: 'Audiowide',          category: 'display', weights: [400],      desc: 'rounded techno futuristic, neon, pop stage' },
        { family: 'Orbitron',           category: 'display', weights: [600, 800], desc: 'futuristic geometric sci-fi' },
        { family: 'Press Start 2P',     category: 'display', weights: [400],      desc: 'pixel 8-bit video game' },
        { family: 'Bebas Neue',         category: 'sans',    weights: [400],      desc: 'tall condensed bold capitals, posters' },
        { family: 'Anton',              category: 'sans',    weights: [400],      desc: 'heavy condensed headline capitals' },
        { family: 'Montserrat',         category: 'sans',    weights: [600, 800], desc: 'clean geometric sans, modern' },
        { family: 'Playfair Display',   category: 'serif',   weights: [600, 700], desc: 'elegant high-contrast serif' },
        { family: 'Cinzel',             category: 'serif',   weights: [600, 700], desc: 'classic roman capitals, regal, fantasy' },
        { family: 'Cormorant Garamond', category: 'serif',   weights: [600, 700], desc: 'refined classic serif, rustic, delicate' },
        { family: 'Great Vibes',        category: 'script',  weights: [400],      desc: 'formal calligraphy script, debutante' },
        { family: 'Pacifico',           category: 'script',  weights: [400],      desc: 'casual brush script, fun' },
        { family: 'Sacramento',         category: 'script',  weights: [400],      desc: 'thin elegant monoline script' },
    ],
    complementary: [
        { family: 'Nunito',   category: 'sans', weights: [400, 600], desc: 'rounded friendly sans' },
        { family: 'Quicksand', category: 'sans', weights: [400, 600], desc: 'soft rounded geometric sans' },
        { family: 'Poppins',  category: 'sans', weights: [400, 500], desc: 'geometric sans, neutral' },
        { family: 'Inter',    category: 'sans', weights: [400, 500], desc: 'neutral modern sans' },
        { family: 'Lato',     category: 'sans', weights: [400, 700], desc: 'humanist sans, warm' },
        { family: 'Roboto Condensed', category: 'sans', weights: [400, 700], desc: 'condensed sans, compact' },
        { family: 'VT323',    category: 'mono', weights: [400], desc: 'pixel terminal monospace' },
    ],
};

function googleFontsUrlFor(fonts) {
    const families = fonts
        .map(f => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights.join(';')}`)
        .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Escolhe, olhando a imagem do convite, as fontes do catálogo mais parecidas com
 * o título (principal) e com os textos menores (complementar). Se a análise falhar,
 * devolve o par de reserva (por tipo de festa / DNA da referência).
 */
async function pickFontsFromImage(imageBuffer, fallback) {
    if (!process.env.OPENAI_API_KEY) return fallback;
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const jpg = await sharp(imageBuffer).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
        const list = (arr) => arr.map(f => `- ${f.family}: ${f.desc}`).join('\n');
        const r = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: [
                { type: 'text', text: `Look at this party invitation. Pick the fonts from the lists that best match its typography.
MAIN: the font whose letter shapes are closest to the BIG TITLE lettering (the child's name).
COMPLEMENTARY: the font closest to the smaller secondary text (phrase, date, address).
Choose ONLY from these lists, copying the family name exactly.
MAIN options:
${list(FONT_CATALOG.main)}
COMPLEMENTARY options:
${list(FONT_CATALOG.complementary)}
Return JSON: {"main": "<family>", "complementary": "<family>"}` },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpg.toString('base64')}`, detail: 'high' } },
            ] }],
            max_tokens: 80,
            temperature: 0,
            response_format: { type: 'json_object' },
        });
        const pick = JSON.parse(r.choices[0].message.content);
        const main = FONT_CATALOG.main.find(f => f.family === pick.main);
        const comp = FONT_CATALOG.complementary.find(f => f.family === pick.complementary);
        if (!main || !comp) return fallback;
        console.log(`[Identity] Fontes escolhidas pela imagem: ${main.family} + ${comp.family}`);
        return { style: 'image', main, complementary: comp, googleFontsUrl: googleFontsUrlFor([main, comp]) };
    } catch (e) {
        console.warn('[Identity] Não foi possível escolher fontes pela imagem; usando o par padrão:', e.message);
        return fallback;
    }
}

/**
 * Monta a identidade visual completa da festa a partir da arte do convite.
 */
async function buildIdentity(project, imageBuffer, dna = null) {
    const [palette, fonts] = await Promise.all([
        extractPalette(imageBuffer, project.type),
        pickFontsFromImage(imageBuffer, pickFonts(project.type, dna)),
    ]);
    return {
        palette,                        // [primária, secundária, destaque, clara, escura]
        fonts,                          // par de fontes mais parecido com o título do convite
        initial: (project.name || '?').trim().charAt(0).toUpperCase(),
        year: (() => {
            const m = String(project.date || '').match(/(\d{4})\s*$/);
            return m ? m[1] : String(new Date().getFullYear());
        })(),
    };
}

module.exports = { buildIdentity, extractPalette, pickFonts, pickFontsFromImage, FONT_PAIRS, FONT_CATALOG };
