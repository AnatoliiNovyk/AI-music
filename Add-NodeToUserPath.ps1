<#
Adds a found Node.js installation directory to the current user's PATH (if not present).
Usage: .\Add-NodeToUserPath.ps1
Optional: .\Add-NodeToUserPath.ps1 -HintPath 'C:\Custom\NodePath'
#>

param(
  [string]$HintPath = 'C:\Program Files\nodejs'
)

function Find-NodeDir {
  param($hint)
  # Prefer obvious hint path
  if (Test-Path (Join-Path $hint 'node.exe')) {
    return (Get-Item (Join-Path $hint 'node.exe')).DirectoryName
  }

  # Common locations to check
  $candidates = @(
    'C:\Program Files\nodejs',
    'C:\Program Files (x86)\nodejs',
    "$env:USERPROFILE\AppData\Local\Programs\nodejs",
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles(x86)\nodejs"
  )

  foreach ($p in $candidates) {
    if (Test-Path (Join-Path $p 'node.exe')) { return $p }
  }

  # Limited additional search in LocalAppData and Program Files to avoid long scans
  $extraRoots = @($env:LOCALAPPDATA, $env:ProgramFiles, $env:ProgramFiles(x86))
  foreach ($root in $extraRoots) {
    if (-not $root) { continue }
    try {
      $found = Get-ChildItem -Path $root -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($found) { return $found.DirectoryName }
    } catch {
      # ignore slow / permission errors
    }
  }

  return $null
}

$nodeDir = Find-NodeDir -hint $HintPath
if (-not $nodeDir) {
  Write-Error "Не знайдено node.exe у стандартних місцях. Встановіть Node.js або запустіть скрипт з параметром -HintPath 'C:\path\to\nodejs'."
  exit 2
}

Write-Output "Знайдено node: $nodeDir"

# Get current user PATH
$userPath = [Environment]::GetEnvironmentVariable('Path','User')
if (-not $userPath) { $userPath = '' }

# Normalize (case-insensitive) and check if already present
if ($userPath -and ($userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ieq $nodeDir })) {
  Write-Output "Каталог вже присутній в USER PATH. Нічого не змінено."
  Write-Output "Щоб тимчасово використовувати node у поточному терміналі, виконайте:"
  Write-Output "`$env:Path = '$nodeDir;$env:Path'`"
  exit 0
}

# Append nodeDir to user PATH
$newUserPath = if ($userPath -eq '') { $nodeDir } else { "$userPath;$nodeDir" }
[Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')

Write-Output "Додано $nodeDir до USER PATH."
Write-Output "Закрийте і знову відкрийте всі вікна PowerShell/термінали, потім перевірте `node -v` і `npm -v`."