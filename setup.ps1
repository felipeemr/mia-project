# Setup Script -- Meraki Artes Digitais (Fase 2)
# Execute com: powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Meraki Artes Digitais -- Setup da Fase 2" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

# --- 1. Verifica se Node.js esta instalado ---
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "ERRO: Node.js nao encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Por favor, instale o Node.js antes de continuar:" -ForegroundColor Yellow
    Write-Host "    https://nodejs.org/en/download" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Recomendado: versao LTS (v20 ou superior)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    Apos instalar, feche e reabra o PowerShell e execute este script novamente."
    Write-Host ""
    $open = Read-Host "Deseja abrir o site de download do Node.js agora? (s/n)"
    if ($open -eq 's' -or $open -eq 'S') {
        Start-Process "https://nodejs.org/en/download"
    }
    exit 1
}

$nodeVersion = node --version
Write-Host "OK: Node.js encontrado: $nodeVersion" -ForegroundColor Green

# --- 2. Instala dependencias do backend ---
Write-Host ""
Write-Host "Instalando dependencias do backend..." -ForegroundColor Cyan

$serverPath = Join-Path $PSScriptRoot "server"
Push-Location $serverPath

npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao instalar dependencias. Verifique a conexao com a internet." -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "OK: Dependencias instaladas com sucesso!" -ForegroundColor Green
Pop-Location

# --- 3. Cria o arquivo .env se nao existir ---
$envExample = Join-Path $PSScriptRoot "server\.env.example"
$envFile    = Join-Path $PSScriptRoot "server\.env"

if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "Criando arquivo .env a partir do template..." -ForegroundColor Cyan
    Copy-Item $envExample $envFile
    Write-Host "OK: Arquivo server\.env criado!" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANTE: Edite o arquivo server\.env e preencha suas chaves:" -ForegroundColor Yellow
    Write-Host "   - SUPABASE_URL e SUPABASE_ANON_KEY  (https://supabase.com)" -ForegroundColor Gray
    Write-Host "   - REPLICATE_API_TOKEN               (https://replicate.com)" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "INFO: Arquivo server\.env ja existe -- mantido." -ForegroundColor Gray
}

# --- 4. Instrucoes para o Supabase ---
Write-Host ""
Write-Host "PROXIMO PASSO -- Configure o banco de dados Supabase:" -ForegroundColor Cyan
Write-Host "   1. Acesse https://supabase.com e crie um projeto gratuito"
Write-Host "   2. Va em 'SQL Editor' e execute: server\migrations\001_initial_schema.sql"
Write-Host "   3. Copie as chaves de Settings > API para o arquivo server\.env"
Write-Host ""

# --- 5. Instrucoes para iniciar ---
Write-Host "Para iniciar o backend apos configurar o .env:" -ForegroundColor Green
Write-Host "   cd server" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "   O backend estara em: http://localhost:3001" -ForegroundColor Cyan
Write-Host "   O frontend estara em: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Setup concluido!" -ForegroundColor Magenta
