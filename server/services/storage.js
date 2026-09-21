/* =============================================================================
   MERAKI — Serviço de Armazenamento (Supabase Storage)
   ============================================================================= */

const { supabaseAdmin } = require('./supabase');
const axios = require('axios');

const BUCKET = 'meraki-kits'; // Nome do bucket no Supabase Storage

/**
 * Faz upload de um buffer de imagem para o Supabase Storage.
 * @param {Buffer} buffer - Dados binários da imagem
 * @param {string} filePath - Caminho dentro do bucket (ex: 'projects/101/convite.png')
 * @param {string} mimeType - MIME type do arquivo
 * @returns {Promise<string>} URL pública do arquivo
 */
async function uploadBuffer(buffer, filePath, mimeType = 'image/png') {
    let { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(filePath, buffer, {
            contentType: mimeType,
            upsert: true,
        });

    if (error && (error.message?.includes('not found') || error.message?.includes('Bucket') || error.statusCode === '404')) {
        console.log(`[Storage] Criando bucket '${BUCKET}' no Supabase...`);
        try {
            await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
        } catch (_) {}
        const retry = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(filePath, buffer, {
                contentType: mimeType,
                upsert: true,
            });
        error = retry.error;
    }

    if (error) throw new Error(`[Storage] Upload falhou: ${error.message}`);

    const { data } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

    return data.publicUrl;
}


/**
 * Faz download de uma URL remota ou data URI e armazena no Supabase Storage.
 * Útil para salvar imagens geradas por APIs de IA (Replicate/OpenAI).
 * @param {string} url - URL pública ou Data URI da imagem gerada pela IA
 * @param {string} filePath - Caminho destino no bucket
 * @returns {Promise<string>} URL pública permanente no Supabase
 */
async function uploadFromUrl(url, filePath) {
    if (url.startsWith('data:')) {
        const matches = url.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            const mimeType = matches[1];
            const buffer   = Buffer.from(matches[2], 'base64');
            return uploadBuffer(buffer, filePath, mimeType);
        }
    }
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer   = Buffer.from(response.data);
    const mimeType = response.headers['content-type'] || 'image/png';
    return uploadBuffer(buffer, filePath, mimeType);
}


/**
 * Faz download de um arquivo do Supabase Storage como Buffer.
 * @param {string} filePath - Caminho dentro do bucket
 * @returns {Promise<Buffer>}
 */
async function downloadBuffer(filePath) {
    const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(filePath);

    if (error) throw new Error(`[Storage] Download falhou: ${error.message}`);

    return Buffer.from(await data.arrayBuffer());
}

/**
 * Remove um arquivo do bucket.
 * @param {string} filePath
 */
async function removeFile(filePath) {
    const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([filePath]);
    if (error) console.warn(`[Storage] Falha ao remover ${filePath}:`, error.message);
}

/**
 * Garante que o bucket existe. Chame uma vez na inicialização se necessário.
 */
async function ensureBucketExists() {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET);
    if (!exists) {
        await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
        console.log(`[Storage] Bucket '${BUCKET}' criado com sucesso.`);
    }
}

module.exports = { uploadBuffer, uploadFromUrl, downloadBuffer, removeFile, ensureBucketExists, BUCKET };
