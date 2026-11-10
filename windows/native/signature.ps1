<#
  The Authenticode signature of one file, as Windows itself judges it.

  This is a local question with a local answer: Windows checks the file's
  signature against the certificate stores already on this machine. No hash
  and no file name is sent anywhere.

  Status is reported as Windows words it ("Valid", "NotSigned",
  "HashMismatch", "UnknownError"); it is never translated into a verdict
  about whether the program is safe, which is not something a signature can
  answer.
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Path)

$ErrorActionPreference = 'Stop'

try {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    [pscustomobject]@{ status = 'missing'; signer = $null } | ConvertTo-Json -Compress
    exit 0
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  $signer = $null
  if ($signature.SignerCertificate) {
    # The certificate subject is a distinguished name; the common name is the
    # part worth showing, and the rest is kept out rather than truncated.
    $subject = $signature.SignerCertificate.Subject
    if ($subject -match 'CN=(?:")?([^",]+)') { $signer = $Matches[1].Trim() }
    else { $signer = $subject }
  }
  [pscustomobject]@{
    status = $signature.Status.ToString()
    signer = $signer
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ status = 'unreadable'; signer = $null } | ConvertTo-Json -Compress
}
