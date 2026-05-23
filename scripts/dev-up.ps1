$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

$VenvScripts = Join-Path $RootDir ".venv/Scripts"
$VenvBin = Join-Path $RootDir ".venv/bin"
if (Test-Path $VenvScripts) {
    $env:PATH = "$VenvScripts$([System.IO.Path]::PathSeparator)$env:PATH"
} elseif (Test-Path $VenvBin) {
    $env:PATH = "$VenvBin$([System.IO.Path]::PathSeparator)$env:PATH"
}

if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) {
            return
        }

        $parts = $line.Split("=", 2)
        if ($parts.Count -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

if (-not $env:ENV) { $env:ENV = "dev" }
if (-not $env:LOG_LEVEL) { $env:LOG_LEVEL = "INFO" }
$env:LLM_PROVIDER = "mock"
if (-not $env:ENABLE_PERSISTENCE) { $env:ENABLE_PERSISTENCE = "false" }
if (-not $env:EXTRA_CORS_ORIGINS) { $env:EXTRA_CORS_ORIGINS = "" }
if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
if (-not $env:PORT) { $env:PORT = "8000" }
if (-not $env:WS_PATH) { $env:WS_PATH = "/ws" }
if (-not $env:REST_PREFIX) { $env:REST_PREFIX = "/debug/v1" }

$BackendUrl = "http://127.0.0.1:8000"
$FrontendUrl = "http://127.0.0.1:5173"
$backendJob = $null
$frontendJob = $null

try {
    Write-Host "Starting backend: uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
    $backendJob = Start-Job -Name "diplomacy-backend-dev" -ArgumentList $RootDir -ScriptBlock {
        param($RepoRoot)
        Set-Location $RepoRoot
        uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
    }

    Write-Host "Waiting for backend readyz at $BackendUrl/readyz ..."
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        if ($backendJob.State -ne "Running") {
            Receive-Job $backendJob
            throw "Backend job exited before readyz passed."
        }

        try {
            $response = Invoke-WebRequest -Uri "$BackendUrl/readyz" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
            continue
        }

        Start-Sleep -Milliseconds 500
    }

    if (-not $ready) {
        throw "Timed out waiting for backend readyz after 20s."
    }

    Write-Host "Backend ready: $BackendUrl"
    Write-Host "Starting frontend: npm run dev -- --host=127.0.0.1"
    $frontendJob = Start-Job -Name "diplomacy-frontend-dev" -ArgumentList $RootDir -ScriptBlock {
        param($RepoRoot)
        Set-Location $RepoRoot
        npm run dev -- --host=127.0.0.1
    }

    Write-Host "Backend URL:  $BackendUrl"
    Write-Host "Frontend URL: $FrontendUrl"
    Write-Host "Press Ctrl-C to stop both jobs."

    while ($true) {
        if ($backendJob.State -ne "Running") {
            Receive-Job $backendJob
            throw "Backend job stopped."
        }
        if ($frontendJob.State -ne "Running") {
            Receive-Job $frontendJob
            throw "Frontend job stopped."
        }
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host ""
    Write-Host "Stopping local dev jobs..."
    if ($frontendJob -ne $null) {
        Stop-Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job $frontendJob -Force -ErrorAction SilentlyContinue
    }
    if ($backendJob -ne $null) {
        Stop-Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job $backendJob -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Local dev jobs stopped."
}
