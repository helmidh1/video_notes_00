<#
.SYNOPSIS
    Pre-commit verification script for Video Notes repository.
.DESCRIPTION
    Runs tests, typechecks, scans for potential sensitive keywords, and prints git status.
#>

Write-Host "==> 1. Running Unit Tests (vitest)..." -ForegroundColor Cyan
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tests failed! Aborting pre-commit check."
    exit $LASTEXITCODE
}

Write-Host "`n==> 2. Running TypeScript Typecheck (tsc)..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "TypeScript check failed! Aborting pre-commit check."
    exit $LASTEXITCODE
}

Write-Host "`n==> 3. Checking for sensitive patterns..." -ForegroundColor Cyan
$sensitiveMatches = git grep -i -E "AIzaSy[0-9A-Za-z-_]{33}|ghp_[0-9A-Za-z]{36}" -- ":(exclude)package-lock.json" 2>$null
if ($sensitiveMatches) {
    Write-Warning "Possible secret patterns detected in repository:"
    $sensitiveMatches | ForEach-Object { Write-Warning $_ }
} else {
    Write-Host "No obvious API keys detected." -ForegroundColor Green
}

Write-Host "`n==> 4. Git Working Tree Status:" -ForegroundColor Cyan
git status --short

Write-Host "`n[OK] Pre-commit checks passed cleanly." -ForegroundColor Green
