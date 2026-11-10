# Read-only DNS resolver and proxy observation for Wirecove.
#
# Nothing here changes a setting: every call is a Get-* cmdlet or a registry
# read. The output mirrors the shape the macOS scutil adapter produces so the
# interface does not need to know which platform it is showing.
$ErrorActionPreference = 'SilentlyContinue'

# The adapter carrying the default route is the one the user actually leaves
# the machine through; its resolvers are the effective ones. Everything else
# is reported as interface-scoped, exactly like scutil's scoped resolvers.
$defaultIndex = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 |
    Sort-Object -Property RouteMetric |
    Select-Object -First 1 -ExpandProperty InterfaceIndex

$adapters = @{}
foreach ($adapter in Get-NetAdapter) {
    $adapters[[int]$adapter.ifIndex] = $adapter
}

# Windows hands every interface the same three fec0:0:0:ffff:: addresses as a
# built-in placeholder. They are not configured resolvers and listing them
# would fill the page with servers that resolve nothing.
$placeholders = @('fec0:0:0:ffff::1', 'fec0:0:0:ffff::2', 'fec0:0:0:ffff::3')

$resolvers = @()
foreach ($entry in Get-DnsClientServerAddress) {
    if (-not $entry.ServerAddresses -or $entry.ServerAddresses.Count -eq 0) { continue }
    $index = [int]$entry.InterfaceIndex
    $adapter = $adapters[$index]
    # A down or disconnected interface resolves nothing right now.
    if (-not $adapter -or "$($adapter.Status)" -ne 'Up') { continue }
    $real = @($entry.ServerAddresses | Where-Object { $placeholders -notcontains $_ })
    if ($real.Count -eq 0) { continue }
    $suffix = (Get-DnsClient -InterfaceIndex $index).ConnectionSpecificSuffix
    $resolvers += [pscustomobject]@{
        number    = $index
        scoped    = ($index -ne $defaultIndex)
        domain    = if ([string]::IsNullOrWhiteSpace($suffix)) { $null } else { $suffix }
        interface = if ($adapter) { $adapter.Name } else { "Interface $index" }
        status    = if ($adapter) { "$($adapter.Status)" } else { 'Unknown' }
        family    = if ("$($entry.AddressFamily)" -eq '2') { 'IPv4' } else { 'IPv6' }
        servers   = $real
    }
}

# Effective servers: the default-route adapter, IPv4 before IPv6 so the list
# reads the way the system resolves.
$effective = @($resolvers | Where-Object { -not $_.scoped } |
    Sort-Object -Property @{ Expression = { if ($_.family -eq 'IPv4') { 0 } else { 1 } } } |
    ForEach-Object { $_.servers } | Select-Object -Unique)

# Per-user WinINET proxy (what browsers follow) and the machine-wide WinHTTP
# proxy are separate settings; both are reported.
$internet = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$proxyServer = "$($internet.ProxyServer)"
$autoConfig = "$($internet.AutoConfigURL)"
$proxyEnabled = ($internet.ProxyEnable -eq 1)

# A per-protocol proxy string looks like "http=host:1;socks=host:2"; a bare
# "host:port" applies to every protocol.
$perProtocol = $proxyServer -match '='
function Test-ProxyProtocol([string]$name) {
    if (-not $proxyEnabled) { return $false }
    if (-not $perProtocol) { return $true }
    return $proxyServer -match ("(^|;)\s*" + $name + "=")
}

$doh = @(Get-DnsClientDohServerAddress | ForEach-Object {
    [pscustomobject]@{
        server      = "$($_.ServerAddress)"
        template    = "$($_.DohTemplate)"
        autoUpgrade = [bool]$_.AutoUpgrade
    }
} | Where-Object { $_.autoUpgrade })

$winhttp = (netsh winhttp show proxy) -join ' '

[pscustomobject]@{
    servers   = $effective
    resolvers = $resolvers
    proxy     = [pscustomobject]@{
        active  = ($proxyEnabled -or -not [string]::IsNullOrWhiteSpace($autoConfig) -or ($internet.AutoDetect -eq 1))
        enabled = [pscustomobject]@{
            HTTP               = (Test-ProxyProtocol 'http')
            HTTPS              = (Test-ProxyProtocol 'https')
            SOCKS              = (Test-ProxyProtocol 'socks')
            ProxyAutoConfig    = (-not [string]::IsNullOrWhiteSpace($autoConfig))
            ProxyAutoDiscovery = ($internet.AutoDetect -eq 1)
        }
        server   = $proxyServer
        pacUrl   = $autoConfig
        winhttp  = $winhttp.Trim()
    }
    doh = $doh
} | ConvertTo-Json -Depth 6 -Compress
