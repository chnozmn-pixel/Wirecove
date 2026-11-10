# Read-only installed-application inventory for Wirecove.
#
# The Start Menu is the closest Windows equivalent of /Applications: it is what
# the user themselves sees as "my programs". Each .lnk is resolved to the
# executable it points at, because that path is what the traffic collector and
# the icon reader work with.
#
# Not covered yet, and therefore not reported: Store (UWP/MSIX) applications,
# which have no plain .exe path and need a package-family lookup instead.
$ErrorActionPreference = 'SilentlyContinue'

$roots = @(
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'),
    (Join-Path $env:AppData 'Microsoft\Windows\Start Menu\Programs')
) | Where-Object { $_ -and (Test-Path $_) }

# Shortcuts that point at an installer, uninstaller, help file or licence are
# not applications the user runs on the network.
$skip = '(?i)(uninstall|unins\d*|setup|install|readme|release note|licen[cs]e|help|documentation|user guide|repair|modify)'

$shell = New-Object -ComObject WScript.Shell
$seen = @{}
$apps = @()

foreach ($root in $roots) {
    foreach ($link in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -File) {
        if ($link.BaseName -match $skip) { continue }
        $shortcut = $shell.CreateShortcut($link.FullName)
        $target = "$($shortcut.TargetPath)"
        if ([string]::IsNullOrWhiteSpace($target)) { continue }
        if ([System.IO.Path]::GetExtension($target).ToLowerInvariant() -ne '.exe') { continue }
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { continue }
        $key = $target.ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $apps += [pscustomobject]@{
            name = $link.BaseName
            path = $target
        }
    }
}

[System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null

# -InputObject keeps a list a list: piping an array into ConvertTo-Json in
# PowerShell 5.1 wraps it in a {"value":...,"Count":...} envelope.
ConvertTo-Json -InputObject @($apps | Sort-Object -Property name) -Depth 3 -Compress
