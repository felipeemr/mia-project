/* =============================================================================
   MERAKI — Prévia com marca d'água (feita no servidor)
   A prévia que o cliente vê é uma imagem JÁ marcada e em tamanho reduzido.
   A arte limpa nunca sai do servidor antes do pagamento.
   ============================================================================= */

const sharp = require('sharp');

const PREVIEW_WIDTH = 1000;

/** SVG com o texto da marca repetido na diagonal; legível em fundo claro e escuro (branco com contorno escuro) */
function watermarkSvg(w, h) {
    const label = 'MERAKI ARTES DIGITAIS';
    const fontSize = Math.round(w * 0.042);
    const stepX = Math.round(w * 0.95);
    const stepY = Math.round(w * 0.19);
    const items = [];
    let row = 0;
    for (let y = -h; y < h * 2; y += stepY, row++) {
        for (let x = -w + (row % 2 ? stepX / 2 : 0); x < w * 2; x += stepX) {
            items.push(`<text x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})">${label}</text>`);
        }
    }
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle"
     fill="#ffffff" fill-opacity="0.42" stroke="#000000" stroke-opacity="0.22" stroke-width="${Math.max(1, Math.round(fontSize / 22))}">
    ${items.join('\n    ')}
  </g>
</svg>`);
}

/**
 * Gera a prévia: reduz a imagem, aplica a marca d'água e devolve um JPEG.
 * @param {Buffer} input arte limpa
 * @returns {Promise<Buffer>} JPEG marcado
 */
async function makePreview(input) {
    const base = await sharp(input).rotate().resize({ width: PREVIEW_WIDTH, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    const { width, height } = base.info;
    return sharp(base.data)
        .composite([{ input: watermarkSvg(width, height), top: 0, left: 0 }])
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
}

/** Versão reduzida SEM marca (só para o cliente que já pagou ver na tela) */
async function makeCleanView(input) {
    return sharp(input).rotate().resize({ width: 1100, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

module.exports = { makePreview, makeCleanView };
