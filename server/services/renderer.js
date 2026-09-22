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
// Cores neutras mais robustas para contraste (Dark/Light)
const COLORS = {
    infantil:  { primary: '#1A1A1A', accent: '#444444', subtitle: '#333333', divider: '#888888' },
    debutante: { primary: '#222222', accent: '#D4AF37', subtitle: '#444444', divider: '#D4AF37' },
    adulto:    { primary: '#111111', accent: '#555555', subtitle: '#333333', divider: '#888888' },
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
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);

    ctx.restore();
}

// ---------------------------------------------------------------------------
// Renderizador do Convite
// ---------------------------------------------------------------------------
async function renderConvite(project, bgSource, watermark = false, aiDna = null) {
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

    // Determina a família de fonte baseada no DNA
    let baseFont = 'sans-serif';
    if (aiDna && aiDna.typography) {
        switch(aiDna.typography.toLowerCase()) {
            case 'pixel':   baseFont = 'monospace'; break;
            case 'elegant': baseFont = 'serif'; break;
            case 'playful': baseFont = 'sans-serif'; break;
            case 'modern':  baseFont = 'sans-serif'; break;
            case 'rustic':  baseFont = 'serif'; break;
        }
    }

    // --- Overlay branco semi-transparente para garantir leitura em fundos escuros ---
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.roundRect(W * 0.1, y - 100, W * 0.8, TEXT_AREA_HEIGHT - 300, 40);
    ctx.fill();
    ctx.restore();

    // 1. Frase de abertura neutra
    drawText(ctx, 'Você está sendo convidado para a...', cx, y, `62px ${baseFont}`, '#444444');
    y += 180;

    // 2. Placa temática neutra e legível
    const themeLabel = project.theme ? `${project.theme} do(a)` : 'A Grande Festa de';
    drawPlaqueBadge(ctx, themeLabel, cx, y, Math.min(W * 0.65, 1200), 140, '#333333', '#FFFFFF');
    y += 260;

    // 3. Nome da criança em destaque monumental (lettering bold neutro)
    const nameFontSize = project.name && project.name.length > 10 ? 190 : 230;
    ctx.save();
    ctx.font = `bold ${nameFontSize}px ${baseFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Sombra pesada para descolar do fundo
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 10;

    // Preenchimento nobre e escuro
    ctx.fillStyle = c.primary;
    ctx.fillText(project.name || '', cx, y);
    ctx.restore();
    y += nameFontSize * 0.65 + 70;

    // 4. Idade em destaque com ornamentos
    if (project.age) {
        drawText(ctx, `—   ${project.age.toUpperCase()}   —`, cx, y, `bold 74px ${baseFont}`, '#555555');
        y += 150;
    }

    // Linha divisória sutil
    drawDivider(ctx, y, c.divider, W * 0.8, 3);
    y += 120;

    // 5. Bloco de informações com ícones ilustrados grandes (Data, Horário, Local)
    const iconColor = c.accent || '#444444';
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
        ctx.font = `600 64px ${baseFont}`;
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

    // Placa de rodapé legível
    drawPlaqueBadge(ctx, `"${footerPhrase}"`, cx, footerY, Math.min(W * 0.72, 1450), 130, '#FFFFFF', '#333333');



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
async function renderLembrete(project, bgSource, watermark = false, aiDna = null) {
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

    // --- Card branco sólido para garantir leitura perfeita (cobre a arte do fundo) ---
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    // Um painel central com bordas arredondadas que cobre a maior parte da área superior
    ctx.roundRect(W * 0.1, 80, W * 0.8, TEXT_AREA_HEIGHT + 150, 60);
    ctx.fill();
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

    // Determina a família de fonte
    let baseFont = 'sans-serif';
    if (aiDna && aiDna.typography) {
        switch(aiDna.typography.toLowerCase()) {
            case 'pixel':   baseFont = 'monospace'; break;
            case 'elegant': baseFont = 'serif'; break;
            case 'playful': baseFont = 'sans-serif'; break;
            case 'modern':  baseFont = 'sans-serif'; break;
            case 'rustic':  baseFont = 'serif'; break;
        }
    }

    // "LEMBRETE"
    drawText(ctx, 'LEMBRETE', cx, y, `bold 90px ${baseFont}`, c.accent);
    y += 130;

    // Linha divisória
    drawDivider(ctx, y, c.divider, W);
    y += 80;

    // Dias em destaque
    drawText(ctx, diasRestantes, cx, y, `bold 280px ${baseFont}`, c.primary);
    y += 160;

    drawText(ctx, 'DIAS', cx, y, `bold 70px ${baseFont}`, c.accent);
    y += 110;

    // Mensagem
    const msg1 = `Faltam apenas ${diasRestantes} dias para a festa de`;
    const msg2 = `${project.name} e você não pode perder!`;
    drawText(ctx, msg1, cx, y, `italic 50px ${baseFont}`, '#555555', W * 0.75);
    y += 75;
    drawText(ctx, msg2, cx, y, `italic 50px ${baseFont}`, '#555555', W * 0.75);
    y += 100;

    // Linha
    drawDivider(ctx, y, c.divider, W, 2);
    y += 70;

    // Data e horário
    const dateTime = [project.date, project.time ? `${project.time}h` : ''].filter(Boolean).join('   ·   ');
    if (dateTime.trim()) {
        drawText(ctx, dateTime, cx, y, `600 54px ${baseFont}`, c.primary);
        y += 85;
    }

    // Local
    if (project.location) {
        const localShort = project.location.split(',')[0].trim();
        drawText(ctx, localShort, cx, y, `48px ${baseFont}`, c.primary, W * 0.78);
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
