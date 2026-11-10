# Windows Firewall rules for one application, through the firewall Windows
# already has.
#
# Wirecove does not filter packets itself and does not install a driver to do
# it. Blocking an application here writes an ordinary Windows Firewall rule,
# the same object the built-in interface writes, and every rule it writes
# carries the group name Wirecove. That matters in both directions: the rules
# are visible and removable in Windows' own tools even if this application is
# never opened again, and nothing outside that group is ever touched, so a
# rule the user or their workplace put there is safe.
[CmdletBinding()]
param(
  [ValidateSet('status', 'block', 'unblock')]
  [string]$Action = 'status',
  [string]$Program = '',
  [string]$Label = ''
)

$ErrorActionPreference = 'Stop'
$group = 'Wirecove'

function Get-WirecoveRules {
  $rules = @()
  foreach ($rule in (Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue)) {
    $filter = $rule | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
    $rules += [pscustomobject]@{
      id        = $rule.Name
      label     = $rule.DisplayName
      direction = [string]$rule.Direction
      action    = [string]$rule.Action
      enabled   = [bool]($rule.Enabled -eq 'True' -or $rule.Enabled -eq $true)
      program   = if ($filter) { [string]$filter.Program } else { $null }
    }
  }
  return $rules
}

function Get-Status {
  $profiles = @()
  foreach ($item in (Get-NetFirewallProfile -ErrorAction SilentlyContinue)) {
    $profiles += [pscustomobject]@{
      name    = [string]$item.Name
      enabled = [bool]($item.Enabled -eq 'True' -or $item.Enabled -eq $true)
    }
  }
  return [pscustomobject]@{
    profiles = $profiles
    rules    = Get-WirecoveRules
  }
}

if ($Action -eq 'status') {
  Get-Status | ConvertTo-Json -Depth 5 -Compress
  exit 0
}

if (-not $Program) { throw 'A program path is required' }
if (-not (Test-Path -LiteralPath $Program -PathType Leaf)) {
  throw "No such program: $Program"
}
$resolved = (Resolve-Path -LiteralPath $Program).ProviderPath

# Removing first is what makes both actions repeatable: blocking an already
# blocked program must not leave two rules behind, and unblocking something
# that was never blocked must not fail.
foreach ($rule in (Get-WirecoveRules)) {
  if ($rule.program -and $rule.program.ToLowerInvariant() -eq $resolved.ToLowerInvariant()) {
    Remove-NetFirewallRule -Name $rule.id -ErrorAction SilentlyContinue
  }
}

if ($Action -eq 'block') {
  $name = if ($Label) { $Label } else { Split-Path -Leaf $resolved }
  # Both directions, because an application that may not be reached is as
  # blocked as one that may not reach out, and a half block would leave the
  # switch claiming more than it did.
  foreach ($direction in @('Outbound', 'Inbound')) {
    New-NetFirewallRule -DisplayName "Wirecove: $name ($direction)" `
      -Group $group -Direction $direction -Program $resolved `
      -Action Block -Profile Any -Enabled True | Out-Null
  }
}

Get-Status | ConvertTo-Json -Depth 5 -Compress
exit 0
