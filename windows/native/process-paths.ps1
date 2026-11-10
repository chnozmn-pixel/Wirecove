# Read-only PID -> executable path map, used to find an application's icon.
# Processes whose path cannot be read (another user's, or a protected system
# process) are left out rather than guessed at.
$ErrorActionPreference = 'SilentlyContinue'
ConvertTo-Json -InputObject @(Get-Process | Where-Object { $_.Path } |
    ForEach-Object { [pscustomobject]@{ pid = $_.Id; path = $_.Path } }) -Depth 3 -Compress
