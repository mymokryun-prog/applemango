# USB로 연결된 Android 폰에서 http://localhost:3000 접속 (GPS 허용에 유리)
$ErrorActionPreference = "Stop"
$port = 3000

function Find-Adb {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $searchRoots = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools",
        "$env:USERPROFILE\platform-tools",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
    )
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            $found = Get-ChildItem -Path $root -Filter "adb.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { return $found.FullName }
        }
    }
    return $null
}

$adb = Find-Adb
if (-not $adb) {
    Write-Host ""
    Write-Host "adb를 찾을 수 없습니다. 먼저 Android Platform-Tools를 설치하세요:" -ForegroundColor Yellow
    Write-Host "  winget install --id Google.PlatformTools -e --source winget"
    Write-Host ""
    Write-Host "또는 ZIP 수동 설치:" -ForegroundColor Yellow
    Write-Host "  1) https://developer.android.com/tools/releases/platform-tools"
    Write-Host "  2) 압축 해제 후 platform-tools 폴더를 C:\platform-tools 에 복사"
    Write-Host "  3) 이 스크립트를 다시 실행"
    Write-Host ""
    exit 1
}

Write-Host "Using: $adb" -ForegroundColor Cyan

& $adb devices
& $adb reverse tcp:$port tcp:$port

Write-Host ""
Write-Host "OK! 폰 Chrome에서 접속:" -ForegroundColor Green
Write-Host "  http://localhost:$port"
Write-Host ""
Write-Host "PC에서 서버가 켜져 있어야 합니다: npm run dev" -ForegroundColor Gray
