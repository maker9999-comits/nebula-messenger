$dist = "node_modules/electron/dist"
$out = "NebulaMessenger"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
Copy-Item $dist $out -Recurse
# Убираем дефолтное приложение Electron, чтобы грузилось наше
Remove-Item "$out/resources/default_app.asar" -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$out/resources/app" | Out-Null
Copy-Item "main.js" "$out/resources/app/main.js"
Copy-Item "preload.js" "$out/resources/app/preload.js"
$appPkg = @{ name = "nebula-desktop"; main = "main.js"; version = "1.0.0"; description = "Nebula Messenger desktop" } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText("$out/resources/app/package.json", $appPkg, [System.Text.UTF8Encoding]::new($false))
# Переименовываем exe в красивое имя
if (Test-Path "$out/electron.exe") { Move-Item "$out/electron.exe" "$out/NebulaMessenger.exe" -Force }
Write-Host "Packaged -> $out/NebulaMessenger.exe"
