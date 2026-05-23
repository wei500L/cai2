$ErrorActionPreference = "Stop"

Write-Host "Starting Diplomacy backend in dev mode (CORS allows http://localhost:5173)"

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
if (-not $env:LLM_PROVIDER) { $env:LLM_PROVIDER = "mock" }
if (-not $env:ENABLE_PERSISTENCE) { $env:ENABLE_PERSISTENCE = "false" }
if (-not $env:EXTRA_CORS_ORIGINS) { $env:EXTRA_CORS_ORIGINS = "" }
if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
if (-not $env:PORT) { $env:PORT = "8000" }
if (-not $env:WS_PATH) { $env:WS_PATH = "/ws" }
if (-not $env:REST_PREFIX) { $env:REST_PREFIX = "/debug/v1" }

uvicorn app.main:app --host $env:HOST --port $env:PORT --reload --log-level info
