/* =============================================================================
   MERAKI ARTES DIGITAIS — BACKEND API (Fase 2)
   Servidor Express principal
   ============================================================================= */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

// --- Rotas ---
const authRoutes      = require('./routes/auth');
const projectsRoutes  = require('./routes/projects');
const generateRoutes  = require('./routes/generate');
const downloadsRoutes = require('./routes/downloads');
const paymentsRoutes  = require('./routes/payments');

const app  = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Middlewares globais
// ---------------------------------------------------------------------------
app.use(cors({
    origin: [
        'http://localhost:3000',  // frontend em desenvolvimento
        'http://127.0.0.1:3000',
        'http://localhost:3001',
    ],
    credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve SÓ o frontend público. Nunca a pasta raiz inteira: ela contém server/.env (chaves de API),
// o código do servidor, a pasta .git e arquivos de teste com fotos.
const frontendPath = path.join(__dirname, '..');
const sendPublic = (file) => (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendPath, file));
};
app.get('/', sendPublic('index.html'));
app.get('/index.html', sendPublic('index.html'));
app.get('/app.js', sendPublic('app.js'));
app.get('/styles.css', sendPublic('styles.css'));
app.use('/assets', express.static(path.join(frontendPath, 'assets'), {
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// ---------------------------------------------------------------------------
// Health check (útil para deployment)
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
    });
});

// ---------------------------------------------------------------------------
// Rotas da API
// ---------------------------------------------------------------------------
app.use('/api/auth',      authRoutes);
app.use('/api/projects',  projectsRoutes);
app.use('/api/generate',  generateRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/payments',  paymentsRoutes);

// ---------------------------------------------------------------------------
// Fallback: retorna o index.html para navegação SPA
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------------------------------------------------------------------------
// Tratamento global de erros
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
    console.error('[ERROR]', err.message || err);
    res.status(err.status || 500).json({
        error: err.message || 'Erro interno do servidor',
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    });
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
const { ensureBucketExists } = require('./services/storage');

app.listen(PORT, async () => {
    console.log(`\n🌸 Meraki Artes Digitais — Backend API`);
    console.log(`✅ Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📁 Frontend servido de: ${frontendPath}`);
    console.log(`🔑 Supabase: ${process.env.SUPABASE_URL ? 'Configurado' : '⚠️  NÃO configurado'}`);
    console.log(`🤖 IA (Gemini): ${process.env.GEMINI_API_KEY ? 'Configurado (principal)' : 'Não configurado'}`);
    console.log(`🤖 IA (OpenAI): ${process.env.OPENAI_API_KEY ? 'Configurado (visão, conferência e reserva)' : 'Não configurado'}`);

    if (process.env.SUPABASE_URL) {
        ensureBucketExists().catch(() => {});
    }

    console.log(`\nAcesse: http://localhost:${PORT}/\n`);
});


module.exports = app;
