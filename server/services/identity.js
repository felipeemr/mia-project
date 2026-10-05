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

/**
 * Monta a identidade visual completa da festa a partir da arte do convite.
 */
async function buildIdentity(project, imageBuffer, dna = null) {
    const [palette] = await Promise.all([extractPalette(imageBuffer, project.type)]);
    return {
        palette,                        // [primária, secundária, destaque, clara, escura]
        fonts: pickFonts(project.type, dna),
        initial: (project.name || '?').trim().charAt(0).toUpperCase(),
        year: (() => {
            const m = String(project.date || '').match(/(\d{4})\s*$/);
            return m ? m[1] : String(new Date().getFullYear());
        })(),
    };
}

module.exports = { buildIdentity, extractPalette, pickFonts, FONT_PAIRS };
