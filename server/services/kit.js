/* =============================================================================
   MERAKI — Itens do kit além do convite (coerentes com a arte aprovada)
   IA (Gemini, usando o convite como referência de estilo):
     - mascote oficial (a MESMA personagem do convite, corpo inteiro, fundo branco)
     - prancha de elementos (adesivos do tema)
     - fundo limpo (mesmo cenário, sem personagem e sem texto)
   Código (sem custo de IA):
     - elementos recortados da prancha (principais e complementares)
     - ilustrações do tema (os maiores recortes)
     - papel digital (estampa com os elementos + paleta)
   ============================================================================= */

const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { generateWithGemini } = require('./gemini');
const { verifyPosterText, formatDatePt, formatTimePt } = require('./ai');

const dataUrlToBuffer = url => Buffer.from(String(url).split(',')[1], 'base64');
const bufferToDataUrl = (buf, mime = 'image/png') => `data:${mime};base64,${buf.toString('base64')}`;

// Modelos: o mascote precisa de rosto fiel (Pro primeiro); elementos e fundo aceitam o mais barato primeiro
const PRO_FIRST   = () => (process.env.GEMINI_KIT_MASCOT_MODELS || 'gemini-3-pro-image,gemini-3.1-flash-image-preview').split(',').map(s => s.trim()).filter(Boolean);
const FLASH_FIRST = () => (process.env.GEMINI_KIT_ITEM_MODELS   || 'gemini-3.1-flash-image-preview,gemini-3-pro-image').split(',').map(s => s.trim()).filter(Boolean);
const BUDGET_MS = 150000;

// ---------------------------------------------------------------------------
// Chamadas de IA
// ---------------------------------------------------------------------------
// Provedor do kit: segue o do convite. Contexto por geração (várias gerações podem rodar ao mesmo tempo).
const { AsyncLocalStorage } = require('async_hooks');
const kitCtx = new AsyncLocalStorage();

const OPENAI_KIT_MODELS = () => [...new Set([process.env.OPENAI_EDIT_MODEL, process.env.OPENAI_POSTER_MODEL || 'chatgpt-image-latest', 'gpt-image-1'].filter(Boolean))];

/** Mesma chamada de imagem, pela OpenAI (edição com foto/convite como referência). */
async function openaiImage({ prompt, photoBuffer = null, refBuffers = [], aspectRatio = '1:1' }) {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const [w, h] = String(aspectRatio).split(':').map(Number);
    const r = (w && h) ? w / h : 1;
    const size = r > 1.2 ? '1536x1024' : r < 0.83 ? '1024x1536' : '1024x1024';
    const inputs = [photoBuffer, ...refBuffers].filter(Boolean);
    const files = await Promise.all(inputs.map(async (buf, i) => OpenAI.toFile(
        await sharp(buf).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer(), 'entrada' + (i + 1) + '.jpg', { type: 'image/jpeg' })));
    let lastErr = null;
    for (const model of OPENAI_KIT_MODELS()) {
        try {
            const quality = process.env.OPENAI_KIT_QUALITY || 'medium';
            let res;
            if (files.length) {
                const params = { model, image: files, prompt, size, quality, input_fidelity: 'high' };
                try { res = await openai.images.edit(params); }
                catch (e) {
                    if (e.status === 400 && /input_fidelity|unknown|unsupported|unrecognized/i.test(e.message || '')) { delete params.input_fidelity; res = await openai.images.edit(params); }
                    else throw e;
                }
            } else {
                res = await openai.images.generate({ model, prompt, n: 1, size, quality });
            }
            const it = res.data[0];
            const b64 = it.b64_json || it.b64;
            if (b64) return Buffer.from(b64, 'base64');
            if (it.url) return Buffer.from((await require('axios').get(it.url, { responseType: 'arraybuffer', timeout: 30000 })).data);
        } catch (e) {
            lastErr = e;
            const modelProblem = e.status === 404 || (e.status === 400 && /model|not supported|does not support/i.test(e.message || '') && !/safety|moderation/i.test(e.message || ''));
            console.warn('[Kit/OpenAI] "' + model + '" falhou: ' + e.message);
            if (!modelProblem) break;
        }
    }
    const err = new Error('OpenAI: ' + (lastErr?.message || 'sem resposta'));
    err.status = lastErr?.status;
    if (/safety|moderation|content_policy/i.test(lastErr?.message || '') || lastErr?.code === 'moderation_blocked') err.kind = 'safety';
    else if (lastErr?.status === 429 || /quota|billing|credit/i.test(lastErr?.message || '')) err.kind = 'quota';
    throw err;
}

async function geminiImage({ label, prompt, photoBuffer, refBuffers, models, aspectRatio }) {
    const t0 = Date.now();
    let r;
    try {
        r = await generateWithGemini({ prompt, photoBuffer, refBuffers, models, aspectRatio, deadlineAt: Date.now() + BUDGET_MS });
    } catch (e) {
        if (e.kind !== 'overloaded') throw e;
        // Google sobrecarregado em todos os modelos: espera um pouco e faz uma segunda rodada
        console.warn('[Kit] ' + label + ': Google sobrecarregado; nova rodada em 10s...');
        await new Promise(res => setTimeout(res, 10000));
        r = await generateWithGemini({ prompt, photoBuffer, refBuffers, models, aspectRatio, deadlineAt: Date.now() + BUDGET_MS });
    }
    console.log('[Kit] ✅ ' + label + ' (' + r.model + ') em ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    return dataUrlToBuffer(r.dataUrl);
}

/**
 * Gera uma imagem do kit seguindo o provedor do convite (ctx.provider).
 * Gemini com problema (cota, chave, sobrecarga, modelo) => OpenAI; OpenAI com problema => Gemini.
 * Recusa de segurança não troca de provedor (o chamador decide o que fazer).
 */
async function aiImage({ label, prompt, photoBuffer = null, refBuffers = [], models, aspectRatio }) {
    const ctx = kitCtx.getStore() || { provider: 'gemini' };
    const hasGemini = !!process.env.GEMINI_API_KEY, hasOpenAI = !!process.env.OPENAI_API_KEY;
    let order = ctx.provider === 'openai' ? ['openai', 'gemini'] : ['gemini', 'openai'];
    order = order.filter(p => (p === 'gemini' ? hasGemini : hasOpenAI));
    // Gemini já falhou por cota/chave nesta geração: não perde tempo tentando de novo
    if (ctx.geminiDown && order.length > 1) order = order.filter(p => p !== 'gemini');
    if (!order.length) throw Object.assign(new Error('Nenhuma API de IA configurada.'), { kind: 'config' });

    let lastErr = null;
    for (const prov of order) {
        try {
            if (prov === 'gemini') return await geminiImage({ label, prompt, photoBuffer, refBuffers, models, aspectRatio });
            const t0 = Date.now();
            const buf = await openaiImage({ prompt, photoBuffer, refBuffers, aspectRatio });
            console.log('[Kit] ✅ ' + label + ' (OpenAI) em ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
            return buf;
        } catch (e) {
            lastErr = e;
            if (e.kind === 'safety') throw e;
            if (prov === 'gemini' && (e.kind === 'quota' || e.kind === 'config')) ctx.geminiDown = true;
            if (prov !== order[order.length - 1]) console.warn('[Kit] ' + label + ': ' + prov + ' indisponível (' + (e.kind || 'erro') + '); usando o outro provedor.');
        }
    }
    throw lastErr;
}

/** Mascote: a mesma personagem do convite, corpo inteiro, fundo branco liso */
async function generateMascot({ invitation, childPhoto }) {
    const hasPhoto = !!childPhoto;
    const base = `Create the OFFICIAL MASCOT of this birthday party: the SAME illustrated character that appears in the finished party invitation${hasPhoto ? ' (the invitation is Image 2' : ' (the invitation is Image 1'}), with IDENTICAL face, hair, skin tone, outfit, colors, accessories and art style as the child shown in the invitation. ${hasPhoto ? 'Image 1 is the real photo of the child: use it only to keep the face accurate and consistent. ' : ''}Show the character FULL BODY from head to feet, standing in a friendly confident pose facing the viewer, hands empty, big warm smile, centered, on a plain solid pure white background, no shadows on the ground, no scenery, no props, no text, no logos and no other characters. Clean edges suitable for a cutout. Square 1:1 composition with generous white margins around the character.`;
    try {
        return await aiImage({ label: 'Mascote', prompt: base, photoBuffer: childPhoto, refBuffers: [invitation], models: PRO_FIRST(), aspectRatio: '1:1' });
    } catch (e) {
        if (e.kind !== 'safety' || !hasPhoto) throw e;
        // O filtro recusou usar o convite como referência junto com a foto: tenta só com a foto
        console.warn('[Kit] Mascote recusado com o convite como referência; tentando só com a foto da criança.');
        const onlyPhoto = base.replace(/\(the invitation is Image 2\)/, '').replace('Image 1 is the real photo', 'The input image is the real photo');
        return aiImage({ label: 'Mascote (só foto)', prompt: onlyPhoto, photoBuffer: childPhoto, models: PRO_FIRST(), aspectRatio: '1:1' });
    }
}

/** Logotipo: nome + idade com EXATAMENTE as mesmas letras do título do convite, fundo transparente */
async function generateLogo({ invitation, name, age }) {
    const title = String(name || '').toUpperCase().trim();
    if (!title) return null;
    const ageText = age ? `${age} ANOS` : '';
    const spelled = title.split('').map(c => (c === ' ' ? '(space)' : c)).join('-');
    const prompt = `Image 1 is the finished party invitation. Create the PARTY LOGO as a compact lock-up of the two title lines of the invitation: the child's name "${title}" (spelled letter by letter: ${spelled}) in big lettering${ageText ? `, and right below it, smaller, the age "${ageText}"` : ''}. Use EXACTLY the same lettering as the corresponding lines of the invitation: identical letter shapes and proportions, same material and texture, same colors, outline, glow and 3D effect, so that it looks like the very same title block lifted out of the invitation. You may add one or two tiny decorative theme details taken from the invitation (for example a star or a spark) touching the lettering, and nothing else. Plain solid PURE WHITE background, the logo centered and fully visible with generous white margins, no scenery, no character, no frame, no ground shadow, no other text. Horizontal 3:2 composition.`;

    const lines = [{ key: 'name', role: 'Name', text: title }];
    if (ageText) lines.push({ key: 'age', role: 'Age', text: ageText, num: String(age) });

    let best = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        const raw = await aiImage({ label: 'Logotipo', prompt, refBuffers: [invitation], models: FLASH_FIRST(), aspectRatio: '3:2' });
        best = best || raw;
        const check = await verifyPosterText(bufferToDataUrl(raw), lines);
        if (check.ok) { best = raw; break; }
        console.warn(`[Kit] Logotipo tentativa ${attempt}: ${check.missing.join(' | ')}`);
    }
    return whiteToTransparentTrim(best);
}

/** Brasão (emblema com a inicial) e monograma (selo com as iniciais), no estilo e nas letras do convite */
async function generateBadge({ invitation, kind, letters }) {
    const L = String(letters || '').toUpperCase().trim();
    if (!L) return null;
    const spelled = L.split('').join('-');
    const common = `Image 1 is the finished party invitation. The letters must use EXACTLY the same lettering as the title of the invitation (identical letter shapes, material, colors, outline, glow and 3D effect), and everything must belong to the same theme, world, color palette and art style as the invitation. The only text allowed is the letter(s) "${L}" (${spelled}); no other words, no numbers, no brand names. Plain solid PURE WHITE background, the emblem centered and fully visible with generous white margins, no scenery, no characters, no ground shadow. Square 1:1 composition.`;
    const prompt = kind === 'crest'
        ? `Create the BIRTHDAY CREST (brasão) of this party: a decorative crest / shield / badge built from the visual language of the invitation's theme (its typical shapes, symbols, textures and materials), with the single letter "${L}" big and clear in the center, framed by 2-3 small theme details. ${common}`
        : `Create the elegant MONOGRAM SEAL of this party, for stickers and envelope seals: a round seal or medallion with an ornamental ring built from the theme's materials and motifs, with the initials "${L}" large and well balanced in the center. ${common}`;
    const raw = await aiImage({ label: kind === 'crest' ? 'Brasão' : 'Monograma', prompt, refBuffers: [invitation], models: FLASH_FIRST(), aspectRatio: '1:1' });
    return whiteToTransparentTrim(raw);
}

/** Agradecimento da lembrancinha, nas mesmas letras do título do convite (fundo transparente).
 *  "Obrigado" para menino e "Obrigada" para menina: o agradecimento é de quem faz a festa. */
async function generateThanks({ invitation, gender }) {
    const text = gender === 'm' ? 'Obrigado pela sua presença' : 'Obrigada pela sua presença';
    const upper = text.toUpperCase();
    const spelled = upper.split('').map(c => (c === ' ' ? '(space)' : c)).join('-');
    const prompt = `Image 1 is the finished party invitation. Create a THANK-YOU LETTERING for a party favor: write only the text "${upper}" (in Brazilian Portuguese, with its accent: ${spelled}) in capital letters, using EXACTLY the same lettering as the big title of the invitation: identical letter shapes and proportions, same material and texture, same colors, outline, glow and 3D effect, so it looks like it was lifted from the same title. Split it into two balanced centered lines ("${gender === 'm' ? 'OBRIGADO' : 'OBRIGADA'}" on the first line and "PELA SUA PRESENÇA" on the second). You may add one or two tiny decorative theme details from the invitation (for example a star or a spark) touching the lettering, and nothing else. Plain solid PURE WHITE background, centered and fully visible with generous white margins, no scenery, no character, no frame, no ground shadow, no other text. Horizontal 3:2 composition.`;

    const lines = [{ key: 'phrase', role: 'Thanks', text }];
    let best = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        const raw = await aiImage({ label: 'Agradecimento', prompt, refBuffers: [invitation], models: FLASH_FIRST(), aspectRatio: '3:2' });
        best = best || raw;
        const check = await verifyPosterText(bufferToDataUrl(raw), lines);
        if (check.ok) { best = raw; break; }
        console.warn(`[Kit] Agradecimento tentativa ${attempt}: ${check.missing.join(' | ')}`);
    }
    return whiteToTransparentTrim(best);
}

/** Lembrancinha: fundo limpo (recorte quadrado) + logotipo + agradecimento, montados por código */
async function composeFavorTag({ background, logo, thanks, size = 2048 }) {
    if (!background || !logo || !thanks) return null;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 1) fundo: recorte quadrado central (o fundo é 2:3, com a área calma no meio)
    const bgImg = await loadImage(background);
    const side = Math.min(bgImg.width, bgImg.height);
    ctx.drawImage(bgImg, (bgImg.width - side) / 2, (bgImg.height - side) / 2, side, side, 0, 0, size, size);

    // 2) leve escurecimento atrás dos textos, para manter o contraste
    const shade = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size * 0.75);
    shade.addColorStop(0, 'rgba(0,0,0,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);

    // 3) logotipo (nome e idade) na metade de cima e agradecimento embaixo
    const place = async (buf, maxW, maxH, cy) => {
        const img = await loadImage(buf);
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, cy - h / 2, w, h);
    };
    await place(logo, size * 0.78, size * 0.36, size * 0.34);
    await place(thanks, size * 0.66, size * 0.26, size * 0.76);
    return canvas.encode('png');
}

/** Textos do lembrete: contagem regressiva (no máximo 5 dias, o momento típico do lembrete) */
function buildReminderLines(project) {
    const name = String(project.name || '').toUpperCase().trim();
    let n = 5;
    const m = String(project.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const party = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.round((party - today) / 86400000);
        n = diff <= 0 ? 0 : Math.min(5, diff);
    }
    const count = n === 0 ? 'É HOJE!' : n === 1 ? 'FALTA 1 DIA' : `FALTAM ${n} DIAS`;
    const lines = [
        { key: 'phrase', role: 'Countdown headline (biggest text, in the title lettering)', text: count },
        { key: 'phrase', role: 'Second line, smaller, below the headline', text: `para a festa de ${name}!` },
    ];
    const date = formatDatePt(project.date);
    const time = formatTimePt(project.time);
    if (date) lines.push({ key: 'date', role: 'Party date (small, bottom)', text: date });
    if (time) lines.push({ key: 'time', role: 'Party time (small, bottom, beside the date)', text: time });
    const location = String(project.location || '').trim().toUpperCase();
    if (location) lines.push({ key: 'location', role: 'Party address (small, bottom, below the date and time, with a small location pin icon)', text: location });
    return lines;
}

/** Lembrete (card de contagem para WhatsApp): arte própria no mesmo mundo e nas mesmas letras do convite */
async function generateReminder({ invitation, project }) {
    const lines = buildReminderLines(project);
    const textRules = lines.map((l, i) => `${i + 1}. ${l.role}: "${l.text}"`).join('\n');
    const prompt = `Image 1 is the finished party invitation. Create the PARTY REMINDER card (a countdown card to send by WhatsApp) in the exact same world, scenery style, color palette, art style and title lettering as the invitation, so it clearly belongs to the same kit. Show the birthday child character exactly as in the invitation (same face, hair and outfit) in a joyful dynamic pose, a bit smaller than in the invitation, hands empty, the only character in the scene.

TEXT RULES (all text in BRAZILIAN PORTUGUESE, keep every accent and number, exactly as written, character by character; do not add any other words, sound effects, signs or watermarks):
${textRules}
LAYOUT: the countdown headline is the biggest text, at the top, in the same lettering style as the invitation title; the second line right below it; the date, time and address small at the bottom on a themed banner or sign. SAFE ZONE: at least 8% empty margin on every edge, no text touching or crossing any edge. Vertical 2:3, full-bleed art.`;

    let best = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        const raw = await aiImage({ label: 'Lembrete', prompt, refBuffers: [invitation], models: FLASH_FIRST(), aspectRatio: '2:3' });
        best = best || raw;
        const check = await verifyPosterText(bufferToDataUrl(raw), lines);
        if (check.ok) { best = raw; break; }
        console.warn(`[Kit] Lembrete tentativa ${attempt}: ${check.missing.join(' | ')}`);
    }
    return best;
}

/** Torna o fundo branco transparente e recorta as margens vazias */
async function whiteToTransparentTrim(buf, pad = 16) {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    makeBackgroundTransparent(data, info.width, info.height);
    let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 <= x0 || y1 <= y0) return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
    const width = Math.min(info.width - left, x1 - x0 + 1 + pad * 2);
    const height = Math.min(info.height - top, y1 - y0 + 1 + pad * 2);
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract({ left, top, width, height }).png().toBuffer();
}

/** Prancha com ~12 elementos separados do tema, em fundo branco, para recorte */
async function generateElementsSheet({ invitation, themeText }) {
    const prompt = `Image 1 is the finished party invitation. Create an ELEMENTS SHEET in exactly the same art style, color palette and world${themeText ? ` (theme: ${themeText})` : ''}: 12 separate, individual decorative elements and props that belong to this party theme (iconic objects, symbols, decorations, patterns) - NOT people, NOT children, NOT characters or mascots. Draw each one as a standalone sticker-like illustration with a thin dark outline, arranged in a neat 4 columns x 3 rows grid on a plain solid PURE WHITE background, with generous empty white space between all elements so that none touch or overlap, each element fully visible and well inside its own cell. No text, no letters, no numbers, no logos, no frames and no shadows. Square 1:1.`;
    return aiImage({ label: 'Prancha de elementos', prompt, refBuffers: [invitation], models: FLASH_FIRST(), aspectRatio: '1:1' });
}

/** Fundo limpo: o mesmo mundo do convite, sem personagem e sem texto */
async function generateBackground({ invitation }) {
    const prompt = `Image 1 is the finished party invitation. Create the CLEAN BACKGROUND of the same world: the same scenery, color palette, lighting and art style, but with NO characters, NO people, NO child, NO text, NO lettering, NO banners, NO signs and NO plaques. Keep the composition open and balanced with a calm area in the center where text can be placed later. Vertical 2:3, full-bleed, no borders.`;
    return aiImage({ label: 'Fundo limpo', prompt, refBuffers: [invitation], models: FLASH_FIRST(), aspectRatio: '2:3' });
}

// ---------------------------------------------------------------------------
// Recorte da prancha em elementos individuais (sem IA)
// ---------------------------------------------------------------------------
async function sliceElements(sheetBuffer, { maxElements = 12 } = {}) {
    const meta = await sharp(sheetBuffer).metadata();
    const W = meta.width, H = meta.height;
    const SCALE = 4;
    const w = Math.round(W / SCALE), h = Math.round(H / SCALE);

    const { data } = await sharp(sheetBuffer).removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });

    // máscara de "tinta": pixels que não são o branco do fundo. O limiar ignora linhas finas e claras de grade
    // que a IA às vezes desenha entre as células.
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
        mask[i] = (765 - r - g - b) > 160 ? 1 : 0;
    }

    // Cortes sucessivos pelos espaços vazios (XY-cut): divide a região no maior vão horizontal ou vertical
    // até não haver mais vãos; cada pedaço restante é um elemento. Funciona com adesivos colados ou em grade.
    const MIN_GAP = 3;          // vão mínimo (em pixels reduzidos; ~12px na imagem original)
    const TOL = 1;              // até 1 pixel de ruído ainda conta como linha/coluna vazia
    const leaves = [];
    const cut = (x0, y0, x1, y1, depth) => {
        // aperta a caixa à tinta existente
        const colInk = new Int32Array(x1 - x0), rowInk = new Int32Array(y1 - y0);
        let any = false;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask[y * w + x]) { colInk[x - x0]++; rowInk[y - y0]++; any = true; }
        if (!any) return;
        let tx0 = 0, tx1 = colInk.length, ty0 = 0, ty1 = rowInk.length;
        while (tx0 < tx1 && colInk[tx0] <= TOL) tx0++;
        while (tx1 > tx0 && colInk[tx1 - 1] <= TOL) tx1--;
        while (ty0 < ty1 && rowInk[ty0] <= TOL) ty0++;
        while (ty1 > ty0 && rowInk[ty1 - 1] <= TOL) ty1--;
        if (tx1 <= tx0 || ty1 <= ty0) return;
        // maior vão (sequência de linhas/colunas sem tinta) dentro da caixa apertada
        const widestGap = (arr, from, to) => {
            let best = { len: 0, start: -1 }, run = 0, start = from;
            for (let i = from; i < to; i++) {
                if (arr[i] <= TOL) { if (run === 0) start = i; run++; if (run > best.len) best = { len: run, start }; }
                else run = 0;
            }
            return best;
        };
        const gx = widestGap(colInk, tx0, tx1);
        const gy = widestGap(rowInk, ty0, ty1);
        if (depth < 12 && (gx.len >= MIN_GAP || gy.len >= MIN_GAP)) {
            if (gy.len >= gx.len) {
                const mid = gy.start;                       // corta antes do vão e depois dele
                cut(x0, y0 + ty0, x1, y0 + mid, depth + 1);
                cut(x0, y0 + gy.start + gy.len, x1, y0 + ty1, depth + 1);
            } else {
                const mid = gx.start;
                cut(x0 + tx0, y0, x0 + mid, y1, depth + 1);
                cut(x0 + gx.start + gx.len, y0, x0 + tx1, y1, depth + 1);
            }
            return;
        }
        leaves.push({ x0: x0 + tx0, y0: y0 + ty0, x1: x0 + tx1 - 1, y1: y0 + ty1 - 1 });
    };
    cut(0, 0, w, h, 0);

    let boxes = [];
    for (const l of leaves) {
        const bw = l.x1 - l.x0 + 1, bh = l.y1 - l.y0 + 1;
        const areaRatio = (bw * bh) / (w * h);
        if (areaRatio >= 0.01 && areaRatio <= 0.3 && bw > 8 && bh > 8) boxes.push({ ...l, area: bw * bh });
    }
    boxes.sort((a, b) => b.area - a.area);

    const out = [];
    for (const b of boxes.slice(0, maxElements)) {
        const pad = 6;
        const left = Math.max(0, b.x0 * SCALE - pad), top = Math.max(0, b.y0 * SCALE - pad);
        const width = Math.min(W - left, (b.x1 - b.x0 + 1) * SCALE + pad * 2);
        const height = Math.min(H - top, (b.y1 - b.y0 + 1) * SCALE + pad * 2);
        const crop = await sharp(sheetBuffer).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        makeBackgroundTransparent(crop.data, crop.info.width, crop.info.height);
        // Descarta só retângulos quase totalmente preenchidos (blocos de fundo); cubos, baús e bandeiras são formas cheias e ficam
        let opaquePx = 0;
        for (let i = 3; i < crop.data.length; i += 4) if (crop.data[i] > 20) opaquePx++;
        if (opaquePx / (crop.info.width * crop.info.height) > 0.9) continue;
        out.push({
            png: await sharp(crop.data, { raw: { width: crop.info.width, height: crop.info.height, channels: 4 } }).png().toBuffer(),
            width: crop.info.width, height: crop.info.height, area: b.area,
        });
    }
    return out;
}

// Torna transparente o branco ligado às bordas (preserva brancos internos cercados pelo contorno)
function makeBackgroundTransparent(buf, w, h) {
    const isBg = i => buf[i] > 235 && buf[i + 1] > 235 && buf[i + 2] > 235;
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue;
        if (!isBg(p * 4)) continue;
        seen[p] = 1;
        buf[p * 4 + 3] = 0;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
    }
}

// ---------------------------------------------------------------------------
// Papel digital: estampa repetida com os elementos recortados + paleta
// ---------------------------------------------------------------------------
async function buildDigitalPaper(elements, palette, size = 2048) {
    const bg = (palette && palette[3]) || '#FFFFFF';
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const imgs = [];
    for (const e of elements.slice(0, 12)) {
        // descarta recortes que são blocos opacos (quadrados/retângulos de fundo), não ícones
        const { data, info } = await sharp(e.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        // bloco retangular: os quatro cantos (logo dentro da margem do recorte) são opacos
        const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
        const m = 10;
        const corners = [alphaAt(m, m), alphaAt(info.width - 1 - m, m), alphaAt(m, info.height - 1 - m), alphaAt(info.width - 1 - m, info.height - 1 - m)];
        // ou retângulo quase totalmente preenchido (bloco de fundo)
        let opaque = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 20) opaque++;
        if (corners.every(a => a > 200) || opaque / (info.width * info.height) > 0.9) continue;
        imgs.push(await loadImage(e.png));
    }
    if (!imgs.length) return canvas.encode('png');

    // Grade exata (tile sem emenda): cols x cols células, linhas ímpares deslocadas meia célula
    const cols = 6;
    const cell = size / cols;
    const n = imgs.length;
    // ordem embaralhada e determinística para vizinhos nunca repetirem
    const order = Array.from({ length: n }, (_, i) => (i * 5 + 3) % n);
    if (new Set(order).size !== n) for (let i = 0; i < n; i++) order[i] = i;
    let seq = 0;

    for (let row = 0; row < cols; row++) {
        for (let col = 0; col < cols; col++) {
            const k = seq++;
            const img = imgs[order[(k + Math.floor(k / n)) % n]];
            const scale = (cell * 0.68) / Math.max(img.width, img.height);
            const cx = col * cell + cell / 2 + (row % 2 ? cell / 2 : 0);
            const cy = row * cell + cell / 2;
            const rot = (((row * 7 + col * 13) % 9) - 4) * 0.07;
            const half = (Math.max(img.width, img.height) * scale) / 2 + 4;
            // desenha deslocado em +-size só quando o elemento cruza a borda (estampa contínua)
            const xs = [cx], ys = [cy];
            if (cx - half < 0) xs.push(cx + size); if (cx + half > size) xs.push(cx - size);
            if (cy - half < 0) ys.push(cy + size); if (cy + half > size) ys.push(cy - size);
            for (const x of xs) for (const y of ys) {
                ctx.save();
                ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                ctx.restore();
            }
        }
    }
    return canvas.encode('png');
}

// ---------------------------------------------------------------------------
// Orquestra: gera os itens extras a partir do convite aprovado
// ---------------------------------------------------------------------------
/**
 * @param {Object} o
 * @param {Buffer} o.invitation   arte do convite aprovada
 * @param {Buffer} [o.childPhoto] foto da criança
 * @param {string} [o.themeText]  tema (texto)
 * @param {string[]} [o.palette]  paleta da identidade
 * @returns {Promise<{mascote?:Buffer, elementosSheet?:Buffer, elementos:Array, ilustracoes:Array, fundo?:Buffer, papel?:Buffer, errors:Object}>}
 */
async function generateKitExtras({ invitation, childPhoto = null, themeText = '', palette = null, name = '', age = '', gender = 'f', project = {}, only = null, existing = {}, provider = null }) {
    return kitCtx.run({ provider: provider === 'openai' ? 'openai' : 'gemini', geminiDown: false },
        () => generateKitExtrasInner({ invitation, childPhoto, themeText, palette, name, age, gender, project, only, existing }));
}

async function generateKitExtrasInner({ invitation, childPhoto = null, themeText = '', palette = null, name = '', age = '', gender = 'f', project = {}, only = null, existing = {} }) {
    const errors = {};
    // `only`: lista de itens a (re)gerar; null = todos. `existing`: imagens já prontas (fundo, logo) usadas pela lembrancinha.
    const want = (k) => !only || only.includes(k);
    const skip = async () => null;
    const run = async (key, fn) => { try { return await fn(); } catch (e) { errors[key] = e.message; console.warn(`[Kit] ${key} falhou: ${e.message}`); return null; } };

    // Brasão usa a 1ª letra do nome
    const initial = String(name || '').trim().charAt(0);
    const needFavor = want('lembrancinha');
    const needBg   = want('fundo') || (needFavor && !existing.fundo);
    const needLogo = want('logo')  || (needFavor && !existing.logo);

    // Até 7 chamadas de IA em paralelo
    const [mascote, sheet, fundoNew, logoNew, lembrete, brasao, thanks] = await Promise.all([
        want('mascote')   ? run('mascote',  () => generateMascot({ invitation, childPhoto })) : skip(),
        want('elementos') ? run('elementos', () => generateElementsSheet({ invitation, themeText })) : skip(),
        needBg            ? run('fundo',    () => generateBackground({ invitation })) : skip(),
        needLogo          ? run('logo',     () => generateLogo({ invitation, name, age })) : skip(),
        want('lembrete')  ? run('lembrete', () => generateReminder({ invitation, project: { ...project, name } })) : skip(),
        want('brasao')    ? run('brasao',   () => generateBadge({ invitation, kind: 'crest', letters: initial })) : skip(),
        needFavor         ? run('agradecimento', () => generateThanks({ invitation, gender })) : skip(),
    ]);
    const fundo = fundoNew || existing.fundo || null;
    const logo  = logoNew  || existing.logo  || null;

    // Lembrancinha: fundo limpo (quadrado) + logotipo + agradecimento, montados por código
    const lembrancinha = (needFavor && fundo && logo && thanks)
        ? await run('lembrancinha', () => composeFavorTag({ background: fundo, logo, thanks }))
        : null;

    let elementos = [], principais = [], complementares = [], papel = null;
    if (sheet) {
        elementos = await run('recorte', () => sliceElements(sheet)) || [];
        // 12 recortes: os 4 maiores viram "principais" e o resto "complementares"
        principais = elementos.slice(0, 4);
        complementares = elementos.slice(4);
        if (elementos.length) papel = await run('papel', () => buildDigitalPaper(elementos, palette));
    }
    // Itens pedidos que não saíram (a tela avisa e oferece "tentar de novo")
    const got = { mascote, elementos: sheet && elementos.length ? sheet : null, fundo: fundoNew, logo: logoNew, lembrete, brasao, lembrancinha };
    const missing = ['mascote', 'elementos', 'fundo', 'logo', 'lembrete', 'brasao', 'lembrancinha'].filter(k => want(k) && !got[k]);
    const quota = Object.values(errors).some(m => /cota|cr[eé]dito|quota|429/i.test(String(m)));
    console.log(`[Kit] Concluído: mascote=${!!mascote} prancha=${!!sheet} elementos=${elementos.length} fundo=${!!fundo} papel=${!!papel}${missing.length ? ' | FALTARAM: ' + missing.join(', ') : ''}`);
    return { mascote, elementosSheet: sheet, elementos, principais, complementares, fundo, papel, logo, lembrete, brasao, lembrancinha, errors, missing, quota };
}

module.exports = { generateKitExtras, generateThanks, composeFavorTag, generateLogo, generateBadge, generateReminder, generateMascot, generateElementsSheet, generateBackground, sliceElements, buildDigitalPaper, bufferToDataUrl };
