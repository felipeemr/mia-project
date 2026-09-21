# ==========================================================================
# Native Windows PowerShell Web Server for Meraki Prototype Preview
# Runs on built-in .NET HttpListener - no Node/Python/IIS required.
# ==========================================================================

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Servidor Meraki Ativo no link: http://localhost:$port/" -ForegroundColor Green
    Write-Host "  Pressione CTRL+C nesta janela para fechar o servidor." -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Automatically launch the browser to the link
    Start-Process "http://localhost:$port/"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        if ($path -eq "/") { 
            $path = "/index.html" 
        }
        
        # Clean path and verify local file exists
        $localPath = $path.Replace("/", "\")
        if ($localPath.StartsWith("\")) {
            $localPath = $localPath.Substring(1)
        }
        $filePath = Join-Path $PSScriptRoot $localPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Identify content type (MIME type)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "text/html; charset=utf-8"
            
            switch ($ext) {
                ".css"  { $contentType = "text/css" }
                ".js"   { $contentType = "application/javascript" }
                ".png"  { $contentType = "image/png" }
                ".jpg"  { $contentType = "image/jpeg" }
                ".jpeg" { $contentType = "image/jpeg" }
                ".svg"  { $contentType = "image/svg+xml" }
                ".pdf"  { $contentType = "application/pdf" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado: $path")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        
        $response.OutputStream.Close()
    }
}
catch {
    Write-Error $_
}
finally {
    $listener.Stop()
}
