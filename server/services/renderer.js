/* =============================================================================
   MERAKI — Renderizador de Alta Resolução (@napi-rs/canvas)
   Gera convite e lembrete em 300 DPI com textos reais sobrepostos
   Preserva a regra: textos no terço superior (padding-bottom: 32%)
   ============================================================================= */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');

// Dimensões A4 retrato em 300 DPI
const A4_WIDTH  = 2480;
const A4_HEIGHT = 3508;

// Área segura para texto: 68% superior (deixa 32% para arte do rodapé)
const TEXT_AREA_HEIGHT = Math.round(A4_HEIGHT * 0.68);

// Paleta de cores por tipo
const COLORS = {
    infantil:  { primary: '#4A3728', accent: '#69D7D1', subtitle: '#E8779A', divider: '#F7A8C8' },
    debutante: { primary: '#3D2B1F', accent: '#DFBA73', subtitle: '#C48B9F', divider: '#DFBA73' },
    adulto:    { primary: '#2C3E2D', accent: '#3A7D7A', subtitle: '#7A7A6A', divider: '#3A7D7A' },
};

const DECOR = { infantil: '~ ✦ ~', debutante: '~ ♛ ~', adulto: '~ ✦ ~' };

// ---------------------------------------------------------------------------
// Utilitários de desenho
// ---------------------------------------------------------------------------

/** Desenha uma linha horizontal decorativa centralizada */
function drawDivider(ctx, y, color, width, lineWidth = 3) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(width * 0.25, y);
    ctx.lineTo(width * 0.75, y);
    ctx.stroke();
    ctx.restore();
}

/** Escreve texto centralizado com sombra suave */
function drawText(ctx, text, x, y, font, color, maxWidth) {
    ctx.save();
    ctx.font      = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Sombra suave
    ctx.shadowColor   = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    if (maxWidth) {
        ctx.fillText(text, x, y, maxWidth);
    } else {
        ctx.fillText(text, x, y);
    }
    ctx.restore();
}

/** Quebra texto longo em múltiplas linhas */
function wrapText(ctx, text, maxWidth) {
    if (!text) return [''];
    const words = text.split(' ');
    const lines  = [];
    let current  = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines;
}

// ---------------------------------------------------------------------------
// Ícones ilustrados de papelaria de luxo
// ---------------------------------------------------------------------------
function drawCalendarIcon(ctx, x, y, size = 64, color = '#E87A90') {
    ctx.save();
    ctx.translate(x, y);

    // Fundo do calendário
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-size/2, -size/2, size, size, 12);
    ctx.fill();
    ctx.stroke();

    // Topo colorido
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-size/2, -size/2, size, size * 0.32, [12, 12, 0, 0]);
    ctx.fill();

    // Coraçãozinho no centro
    ctx.fillStyle = color;
    ctx.font = `${Math.round(size * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♥', 0, size * 0.16);
    ctx.restore();
}

function drawClockIcon(ctx, x, y, size = 64, color = '#E87A90') {
    ctx.save();
    ctx.translate(x, y);

    // Círculo
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, size/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ponteiros
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size * 0.28);
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.22, 0);
    ctx.stroke();
    ctx.restore();
}

function drawHomeIcon(ctx, x, y, size = 64, color = '#E87A90') {
    ctx.save();
    ctx.translate(x, y);

    // Telhadinho
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size/2);
    ctx.lineTo(size/2 + 4, -size * 0.08);
    ctx.lineTo(-size/2 - 4, -size * 0.08);
    ctx.closePath();
    ctx.fill();

    // Casinha
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(-size * 0.36, -size * 0.08, size * 0.72, size * 0.54);
    ctx.fill();
    ctx.stroke();

    // Porta com coração
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-size * 0.14, size * 0.12, size * 0.28, size * 0.34, 4);
    ctx.fill();
    ctx.restore();
}

function drawPlaqueBadge(ctx, text, x, y, width, height, bgColor = '#DFBA73', textColor = '#5C3D21') {
    ctx.save();
    ctx.translate(x, y);

    // Sombra da placa
    ctx.shadowColor   = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetY = 6;

    // Placa de madeira / pergaminho estilizada
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(-width/2, -height/2, width, height, 16);
    ctx.fill();

    // Borda interna pontilhada ou sutil
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-width/2 + 6, -height/2 + 6, width - 12, height - 12, 10);
    ctx.stroke();

    // Texto da placa
    ctx.font = 'bold 52px serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);

    ctx.restore();
}

// ---------------------------------------------------------------------------
// Renderizador do Convite
// ---------------------------------------------------------------------------
async function renderConvite(project, bgSource, watermark = false) {
    console.log(`[Renderer] Renderizando convite de luxo para "${project.name}"...`);

    const W = A4_WIDTH;
    const H = A4_HEIGHT;
    const c = COLORS[project.type] || COLORS.infantil;

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // --- Fundo: converte buffer para data URL para compatibilidade no Windows ---
    try {
        const mimeType = bgSource[0] === 0xFF ? 'image/jpeg' : 'image/png';
        const dataUrl  = `data:${mimeType};base64,${bgSource.toString('base64')}`;
        const bgImg    = await loadImage(dataUrl);
        ctx.drawImage(bgImg, 0, 0, W, H);
        console.log(`[Renderer] Fundo carregado: ${W}x${H}`);
    } catch (bgErr) {
        console.warn('[Renderer] Falha ao carregar fundo, usando cor sólida:', bgErr.message);
        ctx.fillStyle = '#FBE1EC';
        ctx.fillRect(0, 0, W, H);
    }

    const cx = W / 2;

    let y = 480;

    // 1. Frase de abertura de luxo
    drawText(ctx, 'Você está sendo convidado para a...', cx, y, 'italic 62px serif', '#7A5843');
    y += 180;

    // 2. Placa temática de madeira entalhada (estilo "Fazendinha da", "Aventuras de")
    const themeLabel = project.theme ? `${project.theme} do(a)` : 'A Grande Festa de';
    drawPlaqueBadge(ctx, themeLabel, cx, y, Math.min(W * 0.65, 1200), 140, '#E4BE88', '#5A381E');
    y += 260;

    // 3. Nome da criança em destaque monumental de luxo (lettering 3D com contorno e sombra)
    const nameFontSize = project.name && project.name.length > 10 ? 190 : 230;
    ctx.save();
    ctx.font = `bold ${nameFontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;

    // Contorno branco volumoso
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(project.name || '', cx, y);

    // Preenchimento nobre
    ctx.fillStyle = c.primary;
    ctx.fillText(project.name || '', cx, y);
    ctx.restore();
    y += nameFontSize * 0.65 + 70;

    // 4. Idade em destaque com ornamentos
    if (project.age) {
        drawText(ctx, `~   ${project.age.toUpperCase()}   ~`, cx, y, 'bold 84px serif', '#6B4A35');
        y += 150;
    }

    // Linha divisória sutil
    drawDivider(ctx, y, 'rgba(223, 186, 115, 0.45)', W * 0.8, 3);
    y += 120;

    // 5. Bloco de informações com ícones ilustrados grandes (Data, Horário, Local)
    const iconColor = c.accent || '#E87A90';
    const blockX = cx - 360; // Ponto de início do bloco à esquerda
    const iconSize = 84;

    // Data
    if (project.date) {
        drawCalendarIcon(ctx, blockX, y, iconSize, iconColor);
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '600 68px sans-serif';
        ctx.fillStyle = '#423228';
        ctx.fillText(project.date, blockX + 80, y);
        ctx.restore();
        y += 160;
    }

    // Horário
    if (project.time) {
        drawClockIcon(ctx, blockX, y, iconSize, iconColor);
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '600 68px sans-serif';
        ctx.fillStyle = '#423228';
        ctx.fillText(`${project.time}h`, blockX + 80, y);
        ctx.restore();
        y += 160;
    }

    // Local
    if (project.location) {
        drawHomeIcon(ctx, blockX, y, iconSize, iconColor);
        const locationShort = project.location.split(',')[0].trim();
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '600 64px sans-serif';
        ctx.fillStyle = '#423228';
        ctx.fillText(locationShort, blockX + 80, y, W * 0.52);
        ctx.restore();
        y += 160;
    }

    // 6. Plaquinha de rodapé com poste de madeira (estilo placa de chão da Betina)
    const footerPhrase = project.phrase || 'Sua presença é o maior presente!';
    const footerY = 3220;

    // Poste de madeira embaixo da placa
    ctx.save();
    ctx.fillStyle = '#C89B65';
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 10;
    ctx.fillRect(cx - 24, footerY - 50, 48, 200);
    ctx.restore();

    // Placa de rodapé
    drawPlaqueBadge(ctx, `"${footerPhrase}"`, cx, footerY, Math.min(W * 0.72, 1450), 130, '#F2DEC4', '#5E3D24');



    // --- Marca d'água ---
    if (watermark) {
        applyWatermark(ctx, W, H);
    }

    console.log(`[Renderer] Convite finalizado. Ultimo y: ${y}`);
    return canvas.encode('png');
}



// ---------------------------------------------------------------------------
// Renderizador do Lembrete / RSVP
// ---------------------------------------------------------------------------
async function renderLembrete(project, bgSource, watermark = false) {
    console.log(`[Renderer] Renderizando lembrete para "${project.name}"...`);

    const W = A4_WIDTH;
    const H = A4_HEIGHT;
    const c = COLORS[project.type] || COLORS.infantil;

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // --- Fundo: converte buffer para data URL para compatibilidade no Windows ---
    try {
        const mimeType = bgSource[0] === 0xFF ? 'image/jpeg' : 'image/png';
        const dataUrl  = `data:${mimeType};base64,${bgSource.toString('base64')}`;
        const bgImg    = await loadImage(dataUrl);
        ctx.drawImage(bgImg, 0, 0, W, H);
    } catch (bgErr) {
        console.warn('[Renderer/Lembrete] Falha ao carregar fundo:', bgErr.message);
        ctx.fillStyle = '#FBE1EC';
        ctx.fillRect(0, 0, W, H);
    }

    // --- Overlay branco semi-transparente ---
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(W * 0.08, 50, W * 0.84, TEXT_AREA_HEIGHT - 80);
    ctx.restore();


    // Calcula dias restantes
    let diasRestantes = '?';
    if (project.date) {
        const parts = project.date.split('/');
        if (parts.length === 3) {
            const festDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            const diff = Math.ceil((festDate - new Date()) / (1000 * 60 * 60 * 24));
            diasRestantes = diff > 0 ? String(diff) : '0';
        }
    }

    let y = 180;
    const cx = W / 2;

    // "LEMBRETE"
    drawText(ctx, 'LEMBRETE', cx, y, `bold 90px sans-serif`, c.accent);
    y += 130;

    // Linha divisória
    drawDivider(ctx, y, c.divider, W);
    y += 80;

    // Dias em destaque
    drawText(ctx, diasRestantes, cx, y, `bold 280px serif`, c.primary);
    y += 160;

    drawText(ctx, 'DIAS', cx, y, `bold 70px sans-serif`, c.accent);
    y += 110;

    // Mensagem
    const msg1 = `Faltam apenas ${diasRestantes} dias para a festa de`;
    const msg2 = `${project.name} e você não pode perder!`;
    drawText(ctx, msg1, cx, y, `italic 50px serif`, '#777777', W * 0.75);
    y += 75;
    drawText(ctx, msg2, cx, y, `italic 50px serif`, '#777777', W * 0.75);
    y += 100;

    // Linha
    drawDivider(ctx, y, c.divider, W, 2);
    y += 70;

    // Data e horário
    const dateTime = [project.date, project.time ? `${project.time}h` : ''].filter(Boolean).join('   ·   ');
    if (dateTime.trim()) {
        drawText(ctx, dateTime, cx, y, `600 54px sans-serif`, c.primary);
        y += 85;
    }

    // Local
    if (project.location) {
        const localShort = project.location.split(',')[0].trim();
        drawText(ctx, localShort, cx, y, `48px sans-serif`, c.primary, W * 0.78);
    }

    if (watermark) {
        applyWatermark(ctx, W, H);
    }

    return canvas.encode('png');
}

// ---------------------------------------------------------------------------
// Marca d'água diagonal
// ---------------------------------------------------------------------------
function applyWatermark(ctx, W, H) {
    ctx.save();
    ctx.globalAlpha   = 0.22;
    ctx.fillStyle     = '#FFFFFF';
    ctx.font          = 'bold 55px sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';

    for (let y = -200; y < H + 200; y += 260) {
        for (let x = -200; x < W + 200; x += 700) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-35 * Math.PI / 180);
            ctx.fillText('MERAKI ARTES DIGITAIS', 0, 0);
            ctx.restore();
        }
    }
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Converte PNG Buffer em PDF A4
// ---------------------------------------------------------------------------
async function pngToPdf(pngBuffer) {
    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ size: 'A4', margin: 0 });
        const chunks = [];

        doc.on('data',  (chunk) => chunks.push(chunk));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.image(pngBuffer, 0, 0, { width: doc.page.width, height: doc.page.height });
        doc.end();
    });
}

// ---------------------------------------------------------------------------
// Thumbnail para preview rápido
// ---------------------------------------------------------------------------
async function createThumbnail(pngBuffer, width = 600) {
    return sharp(pngBuffer)
        .resize(width, null, { fit: 'inside' })
        .jpeg({ quality: 75 })
        .toBuffer();
}

module.exports = {
    renderConvite,
    renderLembrete,
    pngToPdf,
    createThumbnail,
    A4_WIDTH,
    A4_HEIGHT,
};
