<#
.SYNOPSIS
    Documentation audit script for Video Notes repository.
.DESCRIPTION
    Inspects git status, diffs, checks for undocumented files in GEMINI.md / README.md,
    and runs test/build verification gates.
#>

Write-Host "==> 1. Checking Git Status and Working Diffs..." -ForegroundColor Cyan
git status --short

Write-Host "`n==> 2. Summary of Changed Files:" -ForegroundColor Cyan
git diff --stat HEAD 2>$null

Write-Host "`n==> 3. Checking for Newly Created Files in Source Directories..." -ForegroundColor Cyan
$sourceFiles = Get-ChildItem -Path "entrypoints", "utils", "companion", "tests" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules|\.output|\.wxt|__pycache__" }

$geminiContent = Get-Content -Raw "GEMINI.md" -ErrorAction SilentlyContinue
$readmeContent = Get-Content -Raw "README.md" -ErrorAction SilentlyContinue

$missingInGemini = @()
$missingInReadme = @()

foreach ($file in $sourceFiles) {
    $baseName = $file.Name
    if ($geminiContent -and ($geminiContent -notmatch [regex]::Escape($baseName))) {
        $missingInGemini += $file.FullName.Replace((Get-Location).Path + "\", "")
    }
    if ($readmeContent -and ($readmeContent -notmatch [regex]::Escape($baseName))) {
        $missingInReadme += $file.FullName.Replace((Get-Location).Path + "\", "")
    }
}

if ($missingInGemini.Count -gt 0) {
    Write-Warning "The following files might be missing from GEMINI.md:"
    $missingInGemini | ForEach-Object { Write-Warning "  - $_" }
} else {
    Write-Host "All key source files appear in GEMINI.md." -ForegroundColor Green
}

if ($missingInReadme.Count -gt 0) {
    Write-Warning "The following files might be missing from README.md:"
    $missingInReadme | ForEach-Object { Write-Warning "  - $_" }
} else {
    Write-Host "All key source files appear in README.md." -ForegroundColor Green
}

Write-Host "`n==> 4. Running Validation Gates (Test & Build)..." -ForegroundColor Cyan
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tests failed! Ensure tests pass before finalizing documentation."
    exit $LASTEXITCODE
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed! Ensure build passes before finalizing documentation."
    exit $LASTEXITCODE
}

Write-Host "`n[OK] Documentation audit complete." -ForegroundColor Green
