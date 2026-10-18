/* =============================================================================
   MERAKI — Provedor Google Gemini ("Nano Banana") para o convite
   - Chama a API REST (generateContent) com a foto da criança + prompt.
   - Tenta de novo quando o Google está sobrecarregado (503/500/timeout) e
     passa para o próximo modelo da lista.
   - Classifica o erro para o chamador decidir o que fazer:
       'safety'     -> filtro de conteúdo recusou (o chamador desce a escada de tentativas)
       'quota'      -> sem cota/crédito (429)           -> usar a reserva (OpenAI)
       'config'     -> chave inválida/sem permissão     -> usar a reserva (OpenAI)
       'overloaded' -> 503/500/timeout depois de tentar -> usar a reserva (OpenAI)
   ============================================================================= */

const sharp = require('sharp');

const API = 'https://generativelanguage.googleapis.com/v1beta';
const SAFETY_FINISH = /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class GeminiError extends Error {
    constructor(kind, message, status) {
        super(message);
        this.name = 'GeminiError';
        this.kind = kind;     // safety | quota | config | model | overloaded
        this.status = status;
    }
}

async function callOnce(model, parts, timeoutMs, aspectRatio) {
    const body = {
        contents: [{ parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio } },
    };

    let res;
    try {
        res = await fetch(`${API}/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
        });
    } catch (e) {
        if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new GeminiError('overloaded', `tempo esgotado em ${model}`, 504);
        throw new GeminiError('overloaded', `falha de rede em ${model}: ${e.message}`, 0);
    }

    if (!res.ok) {
        const txt = (await res.text()).slice(0, 300);
        if (res.status === 429) throw new GeminiError('quota', `cota/crédito esgotado (${txt})`, 429);
        if ([500, 502, 503, 504].includes(res.status)) throw new GeminiError('overloaded', `${res.status} em ${model}`, res.status);
        if (res.status === 404) throw new GeminiError('model', `modelo ${model} indisponível`, 404);
        if (res.status === 401 || res.status === 403) throw new GeminiError('config', `chave sem permissão (${res.status})`, res.status);
        if (res.status === 400 && /safety|blocked|prohibited/i.test(txt)) throw new GeminiError('safety', txt, 400);
        throw new GeminiError('config', `erro ${res.status}: ${txt}`, res.status);
    }

    const data = await res.json();
    const cand = data.candidates?.[0];
    const imgPart = (cand?.content?.parts || []).find(p => p.inline_data || p.inlineData);
    const inl = imgPart && (imgPart.inline_data || imgPart.inlineData);
    if (inl?.data) {
        return { dataUrl: `data:${inl.mime_type || inl.mimeType || 'image/png'};base64,${inl.data}`, usage: data.usageMetadata };
    }

    // Sem imagem: bloqueio por segurança/conteúdo (ou recusa em texto)
    const reason = data.promptFeedback?.blockReason || cand?.finishReason || 'sem imagem na resposta';
    const text = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join(' ').slice(0, 200);
    if (data.promptFeedback?.blockReason || SAFETY_FINISH.test(reason) || /nao posso|não posso|can't|cannot|unable|third-party/i.test(text)) {
        throw new GeminiError('safety', `${reason}${text ? ' — ' + text : ''}`, 400);
    }
    throw new GeminiError('overloaded', `resposta sem imagem (${reason})`, 502);
}

/**
 * @param {Object}   o
 * @param {string}   o.prompt
 * @param {Buffer}   [o.photoBuffer]  foto da criança (opcional)
 * @param {string[]} o.models         modelos em ordem de preferência
 * @param {number}   o.deadlineAt     timestamp (ms) limite: não inicia chamadas depois dele
 * @returns {Promise<{dataUrl:string, model:string, seconds:number}>}
 */
async function generateWithGemini({ prompt, photoBuffer = null, refBuffers = [], models, deadlineAt, aspectRatio = '2:3' }) {
    const parts = [{ text: prompt }];
    if (photoBuffer) {
        const jpg = await sharp(photoBuffer).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: jpg.toString('base64') } });
    }
    // Imagens de referência de tema (depois da foto): estilo, cores e roupas dos personagens
    for (const buf of refBuffers) {
        const jpg = await sharp(buf).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: jpg.toString('base64') } });
    }

    let lastErr = new GeminiError('overloaded', 'nenhum modelo configurado', 0);
    for (const model of models) {
        // Uma tentativa por modelo: se o Google está sobrecarregado, insistir no mesmo modelo só gasta tempo.
        // Passa direto para o próximo da lista (e, no fim, para a reserva da OpenAI).
        for (const wait of [0]) {
            const remaining = deadlineAt - Date.now();
            if (remaining < 8000) throw lastErr;              // sem tempo útil
            if (wait) await sleep(Math.min(wait, remaining));
            const t0 = Date.now();
            try {
                console.log(`[AI/Gemini] Gerando com "${model}"${photoBuffer ? ' (com foto)' : ''}${refBuffers.length ? ` + ${refBuffers.length} referência(s)` : ''}...`);
                // Chamada que passa muito do normal costuma estar pendurada (sobrecarga): Flash ~20-50s, Pro ~35-100s
                const perCall = /flash/i.test(model) ? 65000 : 95000;
                const r = await callOnce(model, parts, Math.min(perCall, deadlineAt - Date.now()), aspectRatio);
                const seconds = Math.round((Date.now() - t0) / 100) / 10;
                console.log(`[AI/Gemini] ✅ "${model}" em ${seconds}s | tokens ${r.usage?.promptTokenCount ?? '?'}/${r.usage?.candidatesTokenCount ?? '?'}`);
                return { dataUrl: r.dataUrl, model, seconds };
            } catch (e) {
                lastErr = e instanceof GeminiError ? e : new GeminiError('overloaded', e.message, 0);
                console.warn(`[AI/Gemini] "${model}" falhou (${lastErr.kind}): ${lastErr.message}`);
                if (['safety', 'quota', 'config'].includes(lastErr.kind)) throw lastErr; // não adianta repetir
                if (lastErr.kind === 'model') break;                                      // próximo modelo
            }
        }
    }
    throw lastErr;
}

module.exports = { generateWithGemini, GeminiError };
