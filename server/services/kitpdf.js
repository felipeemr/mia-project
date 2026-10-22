/* =============================================================================
   MERAKI — Kit completo em um único PDF (uma peça por página)
   Páginas: capa, convite, lembrete, mascote, prancha, elementos, fundo, lembrancinha,
   papel digital, logotipo, brasão e paleta de cores.
   ============================================================================= */

const PDFDocument = require('pdfkit');
const sharp = require('sharp');

const W = 595.28;                 // largura A4 em pontos
const A4H = 841.89;
const M = 36;                     // margem das páginas com título
const HEAD = 70;                  // altura do título

const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
/** Texto branco em cor escura, quase preto em cor clara */
const textOn = (hex) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l < 0.55 ? '#FFFFFF' : '#222222'; };

/** Opaco: JPEG (leve). Com transparência: PNG reduzido. Convite/lembrete mantêm a resolução cheia. */
async function toJpeg(buf, maxW = 2000, quality = 90) {
    return sharp(buf).rotate().resize({ width: maxW, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer();
}
async function toPng(buf, maxW = 1400) {
    return sharp(buf).rotate().resize({ width: maxW, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
}
async function size(buf) { const m = await sharp(buf).metadata(); return { w: m.width, h: m.height }; }

/**
 * @param {Object} o
 * @param {Object} o.project   { name, age, theme, date, time, location }
 * @param {string[]} o.palette  5 cores hexadecimais
 * @param {Object} o.images     { convite, lembrete, mascote, elementos, fundo, lembrancinha, papel, logo, brasao } (Buffers)
 * @param {Buffer[]} o.principais
 * @param {Buffer[]} o.complementares
 * @returns {Promise<Buffer>}
 */
async function buildKitPdf({ project, palette = [], images = {}, principais = [], complementares = [] }) {
    const dark = hexOk(palette[4]) ? palette[4] : '#333333';
    const accent = hexOk(palette[0]) ? palette[0] : '#C98FA0';
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: `Kit Digital - ${project.name}`, Author: 'Meraki Artes Digitais' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

    // Tradução simples para o Helvetica do PDF (aceita acentos do português)
    const title = (t, sub) => {
        doc.fillColor(dark).font('Helvetica-Bold').fontSize(18).text(t, M, 26, { width: W - 2 * M, lineBreak: false });
        if (sub) doc.fillColor('#777777').font('Helvetica').fontSize(9.5).text(sub, M, 50, { width: W - 2 * M, lineBreak: false });
        doc.save().rect(M, HEAD - 6, 46, 3).fill(accent).restore();
    };

    // --- Capa ---
    doc.addPage({ size: [W, A4H], margin: 0 });
    doc.rect(0, 0, W, A4H).fill(hexOk(palette[3]) ? palette[3] : '#FFF7F3');
    doc.rect(0, 0, W, 14).fill(accent);
    doc.fillColor(dark).font('Helvetica').fontSize(12).text('KIT DIGITAL DA FESTA', 0, 150, { width: W, align: 'center', characterSpacing: 3 });
    doc.font('Helvetica-Bold').fontSize(46).text(project.name || '', 40, 190, { width: W - 80, align: 'center' });
    const subline = [project.age ? `${project.age} ${String(project.age).match(/^\d+$/) ? 'anos' : ''}`.trim() : '', project.theme].filter(Boolean).join('  ·  ');
    doc.font('Helvetica').fontSize(16).fillColor(dark).text(subline, 40, doc.y + 8, { width: W - 80, align: 'center' });
    const when = [project.date, project.time].filter(Boolean).join(' às ');
    if (when) doc.fontSize(12).fillColor('#666666').text(when, 40, doc.y + 10, { width: W - 80, align: 'center' });
    if (project.location) doc.fontSize(11).fillColor('#666666').text(project.location, 60, doc.y + 4, { width: W - 120, align: 'center' });
    const hero = images.mascote || images.convite;
    if (hero) {
        const jpg = await toJpeg(hero, 1200, 88);
        doc.save().roundedRect(W / 2 - 170, 330, 340, 340, 18).clip();
        doc.image(jpg, W / 2 - 170, 330, { cover: [340, 340], align: 'center', valign: 'top' });
        doc.restore();
    }
    const items = ['Convite', 'Lembrete', 'Mascote', 'Prancha de elementos', 'Elementos do tema', 'Fundo', 'Lembrancinha', 'Papel digital', 'Logotipo', 'Brasão', 'Paleta de cores'];
    doc.fontSize(10).fillColor('#888888').text(items.join('   •   '), 50, 700, { width: W - 100, align: 'center', lineGap: 4 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent).text('Meraki Artes Digitais', 0, 780, { width: W, align: 'center' });

    // --- Convite e lembrete: tela cheia, na proporção da própria arte ---
    for (const [key, label] of [['convite', 'Convite'], ['lembrete', 'Lembrete']]) {
        if (!images[key]) continue;
        const jpg = await toJpeg(images[key], 2480, 92);
        const { w, h } = await size(jpg);
        doc.addPage({ size: [W, Math.round(W * h / w)], margin: 0 });
        doc.image(jpg, 0, 0, { width: W, height: Math.round(W * h / w) });
    }

    // --- Uma peça por página, com título ---
    const single = async (key, label, sub, { transparent = false, maxW = 2000 } = {}) => {
        if (!images[key]) return;
        const img = transparent ? await toPng(images[key]) : await toJpeg(images[key], maxW);
        doc.addPage({ size: [W, A4H], margin: 0 });
        title(label, sub);
        doc.image(img, M, HEAD + 14, { fit: [W - 2 * M, A4H - HEAD - 14 - M], align: 'center', valign: 'center' });
    };
    await single('mascote', 'Mascote oficial', 'O aniversariante como personagem do tema');
    await single('elementos', 'Prancha de elementos', 'Todos os elementos do tema reunidos');

    // --- Elementos recortados: grade 2 x 3 por página ---
    const grid = async (list, label, sub) => {
        if (!list.length) return;
        const pngs = await Promise.all(list.map(b => toPng(b, 900)));
        const cols = 2, rows = 3, gap = 14;
        const cw = (W - 2 * M - gap) / cols, ch = (A4H - HEAD - 14 - M - gap * (rows - 1)) / rows;
        for (let i = 0; i < pngs.length; i += cols * rows) {
            doc.addPage({ size: [W, A4H], margin: 0 });
            title(label, `${sub}  (${Math.min(i + cols * rows, pngs.length)} de ${pngs.length})`);
            pngs.slice(i, i + cols * rows).forEach((p, k) => {
                const x = M + (k % cols) * (cw + gap), y = HEAD + 14 + Math.floor(k / cols) * (ch + gap);
                doc.save().roundedRect(x, y, cw, ch, 8).lineWidth(0.6).strokeColor('#E3E3E3').stroke().restore();
                doc.image(p, x + 8, y + 8, { fit: [cw - 16, ch - 16], align: 'center', valign: 'center' });
            });
        }
    };
    await grid(principais, 'Elementos principais', 'PNG com fundo transparente nos arquivos separados (ZIP)');
    await grid(complementares, 'Elementos complementares', 'PNG com fundo transparente nos arquivos separados (ZIP)');

    await single('fundo', 'Fundo personalizado limpo', 'O cenário do convite, sem textos');
    await single('lembrancinha', 'Arte para lembrancinha', 'Para tags, adesivos e caixinhas');
    await single('papel', 'Papel digital estampado', 'Textura para embalagens e forrinhos');
    await single('logo', 'Logotipo da festa', 'Nome e idade com as letras do convite', { transparent: true });
    await single('brasao', 'Brasão do aniversariante', 'Emblema do tema com a inicial do nome', { transparent: true });

    // --- Paleta ---
    const colors = palette.filter(hexOk);
    if (colors.length) {
        doc.addPage({ size: [W, A4H], margin: 0 });
        title('Paleta de cores', 'Cores extraídas da arte do convite');
        const labels = ['Principal', 'Secundária', 'Destaque', 'Clara', 'Escura'];
        const bw = W - 2 * M, bh = 110, gap = 14;
        colors.forEach((c, i) => {
            const y = HEAD + 20 + i * (bh + gap);
            doc.save().roundedRect(M, y, bw, bh, 10).fill(c).restore();
            doc.save().roundedRect(M, y, bw, bh, 10).lineWidth(0.6).strokeColor('#DDDDDD').stroke().restore();
            doc.fillColor(textOn(c)).font('Helvetica-Bold').fontSize(13).text(labels[i] || `Cor ${i + 1}`, M + 18, y + bh - 44, { lineBreak: false });
            doc.font('Helvetica').fontSize(11).text(c.toUpperCase(), M + 18, y + bh - 26, { lineBreak: false });
        });
    }

    doc.end();
    return done;
}

module.exports = { buildKitPdf };
