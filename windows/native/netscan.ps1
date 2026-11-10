# What else is on this network.
#
# Two modes, kept apart on purpose. 'neighbors' reads the table Windows
# already keeps of machines it has spoken to and sends nothing; it is what the
# page shows when it opens. 'sweep' sends one ICMP echo to each address on the
# local prefixes - traffic the user has to ask for by pressing a button, never
# something that happens because a window was opened.
#
# Only directly connected IPv4 prefixes of /22 or smaller are swept, so a
# machine on a large corporate network cannot turn this into a scan of
# thousands of hosts by accident.
[CmdletBinding()]
param(
  [ValidateSet('neighbors', 'sweep')]
  [string]$Action = 'neighbors',
  [int]$TimeoutMs = 600
)

$ErrorActionPreference = 'Stop'

function Get-LocalPrefixes {
  $prefixes = @()
  foreach ($address in (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
    if ($address.PrefixOrigin -eq 'WellKnown') { continue }   # 169.254.x.x
    if ($address.IPAddress -like '127.*') { continue }
    if ($address.PrefixLength -lt 22 -or $address.PrefixLength -gt 30) { continue }
    $prefixes += [pscustomobject]@{
      address        = $address.IPAddress
      prefixLength   = $address.PrefixLength
      interfaceIndex = $address.InterfaceIndex
      interface      = $address.InterfaceAlias
    }
  }
  return $prefixes
}

function Get-Neighbors {
  $rows = @()
  $own = @((Get-LocalPrefixes).address)
  foreach ($entry in (Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
    if ($entry.State -eq 'Unreachable' -or $entry.State -eq 'Incomplete') { continue }
    $mac = [string]$entry.LinkLayerAddress
    if (-not $mac -or $mac -eq '00-00-00-00-00-00' -or $mac -eq 'FF-FF-FF-FF-FF-FF') { continue }
    $ip = [string]$entry.IPAddress
    if ($ip -like '224.*' -or $ip -like '239.*' -or $ip -like '255.*') { continue }
    $alias = (Get-NetAdapter -InterfaceIndex $entry.InterfaceIndex -ErrorAction SilentlyContinue).Name
    $rows += [pscustomobject]@{
      address   = $ip
      mac       = $mac.ToUpperInvariant()
      state     = [string]$entry.State
      interface = [string]$alias
      self      = [bool]($own -contains $ip)
    }
  }
  return $rows
}

function Invoke-Sweep {
  # One echo per address, all in flight at once. .NET's asynchronous ping is
  # used rather than Test-Connection because 250 sequential probes would take
  # longer than anyone will wait.
  $tasks = @()
  foreach ($prefix in (Get-LocalPrefixes)) {
    $bytes = ([System.Net.IPAddress]::Parse($prefix.address)).GetAddressBytes()
    [array]::Reverse($bytes)
    $value = [System.BitConverter]::ToUInt32($bytes, 0)
    $mask = [uint32]([math]::Pow(2, 32) - [math]::Pow(2, 32 - $prefix.prefixLength))
    $network = $value -band $mask
    $broadcast = $network -bor (-bnot $mask)
    for ($candidate = $network + 1; $candidate -lt $broadcast; $candidate++) {
      $octets = [System.BitConverter]::GetBytes([uint32]$candidate)
      [array]::Reverse($octets)
      $target = ([System.Net.IPAddress]::new($octets)).ToString()
      $ping = [System.Net.NetworkInformation.Ping]::new()
      $tasks += [pscustomobject]@{ ping = $ping; task = $ping.SendPingAsync($target, $TimeoutMs) }
    }
  }
  foreach ($item in $tasks) {
    try { $item.task.Wait($TimeoutMs + 400) | Out-Null } catch { }
    try { $item.ping.Dispose() } catch { }
  }
  # The answers are not read directly: a device may refuse the echo and still
  # have answered the ARP request it arrived in, which is what fills the
  # neighbour table. That table is the result.
  Start-Sleep -Milliseconds 300
}

if ($Action -eq 'sweep') { Invoke-Sweep }

$neighbors = Get-Neighbors
# Reverse DNS for whatever answered, all at once and with a short leash: a
# name is a convenience and must not hold the page.
$lookups = @()
foreach ($row in $neighbors) {
  $lookups += [pscustomobject]@{ row = $row; task = [System.Net.Dns]::GetHostEntryAsync($row.address) }
}
$deadline = (Get-Date).AddSeconds(3)
$named = @()
foreach ($item in $lookups) {
  $left = [int]([math]::Max(0, ($deadline - (Get-Date)).TotalMilliseconds))
  $host_name = $null
  try {
    if ($item.task.Wait($left)) { $host_name = $item.task.Result.HostName }
  } catch { }
  $named += [pscustomobject]@{
    address   = $item.row.address
    mac       = $item.row.mac
    state     = $item.row.state
    interface = $item.row.interface
    self      = $item.row.self
    host      = $host_name
  }
}

[pscustomobject]@{
  scanned   = ($Action -eq 'sweep')
  prefixes  = @(Get-LocalPrefixes)
  devices   = @($named)
} | ConvertTo-Json -Depth 5 -Compress
exit 0
