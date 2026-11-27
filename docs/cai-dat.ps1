# Cai goi mod ModSlime cho TLauncher (Legacy) - chay trong PowerShell:
#   irm https://rxtuteam-a11y.github.io/NeoForge-ModSlime/cai-dat.ps1 | iex
# Script chi dung vao thu muc game cua TLauncher: mods / config / kubejs / defaultconfigs.
# Thu muc mods cu duoc doi ten thanh mods_cu_<ngay-gio> (khong xoa) de co the khoi phuc.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$url  = 'https://github.com/rxtuteam-a11y/NeoForge-ModSlime/releases/download/client-pack-latest/ModSlime-Client-Full.zip'
$game = Join-Path $env:APPDATA '.tlauncher\legacy\Minecraft\game'

function Say($msg, $color = 'White') { Write-Host $msg -ForegroundColor $color }

Say '=== CAI DAT GOI MOD MODSLIME CHO TLAUNCHER ===' Cyan
if (-not (Test-Path $game)) {
    Say "Khong thay thu muc game cua TLauncher: $game" Red
    Say 'Hay mo TLauncher, chon phien ban "NeoForge 1.21.1", bam Vao game 1 lan cho toi menu chinh, tat game roi chay lai lenh nay.' Yellow
    return
}

$tmp = Join-Path $env:TEMP 'modslime-pack'
$zip = Join-Path $env:TEMP 'ModSlime-Client-Full.zip'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Say '[1/4] Dang tai goi mod (~912 MB), vui long doi...' Yellow
& curl.exe -L --fail --retry 3 -o $zip $url
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip) -or (Get-Item $zip).Length -lt 800MB) {
    Say 'Tai that bai hoac file khong du dung luong. Kiem tra mang roi chay lai.' Red
    return
}

Say '[2/4] Dang giai nen...' Yellow
New-Item -ItemType Directory -Force $tmp | Out-Null
& tar.exe -xf $zip -C $tmp
if ($LASTEXITCODE -ne 0) { Expand-Archive -Path $zip -DestinationPath $tmp -Force }

Say '[3/4] Dang cai vao TLauncher...' Yellow
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$mods = Join-Path $game 'mods'
if (Test-Path $mods) { Rename-Item $mods "mods_cu_$stamp" ; Say "  Da giu mod cu tai: mods_cu_$stamp" Gray }
Copy-Item (Join-Path $tmp 'mods') $mods -Recurse -Force
foreach ($d in 'config', 'kubejs', 'defaultconfigs') {
    $src = Join-Path $tmp $d
    if (Test-Path $src) {
        New-Item -ItemType Directory -Force (Join-Path $game $d) | Out-Null
        Copy-Item (Join-Path $src '*') (Join-Path $game $d) -Recurse -Force
    }
}
# Xoa config phia may choi cu (neu con sot tu lan cai truoc) de mod tu tao ban dung phien ban
Get-ChildItem (Join-Path $game 'config') -Recurse -File -Include '*-client.toml', '*_client.toml' -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Say '[4/4] Kiem tra...' Yellow
$n = (Get-ChildItem $mods -Filter *.jar).Count
$fix = Test-Path (Join-Path $mods 'modslime-fix-1.0.0.jar')
$vb  = @(Get-ChildItem $mods -Filter 'VanillaBackport-*.jar').Count -gt 0
Say "  So mod: $n" Gray
if ($fix -and $vb -and $n -ge 270) {
    Say 'XONG! Mo TLauncher, chon "NeoForge 1.21.1", dat RAM 6-8 GB, roi vao game.' Green
} else {
    Say "Co van de: modslime-fix=$fix, VanillaBackport=$vb, so mod=$n. Chup man hinh nay gui cho admin." Red
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zip -Force -ErrorAction SilentlyContinue
