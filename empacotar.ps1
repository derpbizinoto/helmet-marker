# empacotar.ps1 - gera o pacote .ccx do Helmet Marker
#
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\empacotar.ps1
#
# Resultado: dist\HelmetMarker-<versao>.ccx (um .ccx e um .zip com o conteudo da pasta plugin\,
# com o manifest.json na raiz) e dist\HelmetMarker-<versao>.zip (o .ccx + LICENSE + READMEs).
# O caminho oficial da Adobe para gerar o .ccx e o UXP Developer Tool (menu ... > Package);
# este script faz o mesmo sem abrir o programa. Ver README.
# Para com erro se:
#   - os testes automaticos falharem;
#   - as versoes nao baterem (manifest.json x core\version.js);
#   - encontrar certificado/chave no que seria empacotado.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$plugin = Join-Path $root "plugin"

# --- testes ----------------------------------------------------------------------------
& node (Join-Path $root "tests\run-tests.js")
if ($LASTEXITCODE -ne 0) { throw "Os testes falharam; nada foi empacotado." }

# --- versao ----------------------------------------------------------------------------
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $plugin "manifest.json") | ConvertFrom-Json
$version = $manifest.version
$m = Select-String -Path (Join-Path $plugin "core\version.js") -Pattern 'HM_VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
$coreVersion = if ($m) { $m.Matches[0].Groups[1].Value } else { "" }
if ($coreVersion -ne $version) { throw "Versoes diferentes: manifest.json = $version, core\version.js = '$coreVersion'" }

# --- monta ------------------------------------------------------------------------------
$dist = Join-Path $root "dist"
$stage = Join-Path $dist "stage-$version"
$ccx = Join-Path $dist "HelmetMarker-$version.ccx"
$zip = Join-Path $dist "HelmetMarker-$version.zip"
New-Item -ItemType Directory -Force $dist | Out-Null
foreach ($p in @($stage, $ccx, $zip)) { if (Test-Path $p) { Remove-Item -Recurse -Force $p } }

Copy-Item -Recurse $plugin $stage
$junk = @("*.tmp", "*.log", "*.bak", "Thumbs.db", "desktop.ini", ".DS_Store")
Get-ChildItem -Recurse -Force $stage -Include $junk | Remove-Item -Recurse -Force

$secrets = Get-ChildItem -Recurse -Force $stage -Include @("*.p12", "*.pfx", "*.key", "*.pem", "*.crt", "*.cer")
if ($secrets) {
    Remove-Item -Recurse -Force $stage
    throw ("Encontrei certificado/chave no pacote (nada foi gerado): " + ($secrets.FullName -join ", "))
}

# ZipFile (e nao Compress-Archive): o Compress-Archive do Windows PowerShell grava os caminhos com
# barra invertida, e o .ccx precisa de "/" para o Creative Cloud achar as subpastas.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($ccx, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $base = (Resolve-Path $stage).Path.TrimEnd('\') + '\'
    Get-ChildItem -Recurse -File $stage | ForEach-Object {
        $entry = $_.FullName.Substring($base.Length).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $archive.Dispose()
}
Remove-Item -Recurse -Force $stage

# zip de distribuicao: .ccx + licenca + leia-me
$bundle = Join-Path $dist "bundle-$version"
New-Item -ItemType Directory -Force $bundle | Out-Null
Copy-Item $ccx $bundle
foreach ($f in @("README.md", "README.pt-BR.md", "LICENSE", "CHANGELOG.md")) {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src $bundle } else { Write-Host "Aviso: $f nao existe, ficou de fora." }
}
Compress-Archive -Path (Join-Path $bundle "*") -DestinationPath $zip
Remove-Item -Recurse -Force $bundle

Write-Host "Pronto: $ccx"
Write-Host "        $zip"
