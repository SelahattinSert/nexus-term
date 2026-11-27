# NexusTerm shell integration for PowerShell (generated, do not edit)
# Every marker carries a per-session secret so program output cannot forge command blocks.
$global:__nxNonce = $env:NEXUS_SHELL_NONCE
Remove-Item Env:NEXUS_SHELL_NONCE -ErrorAction SilentlyContinue
$global:__nxOriginalPrompt = $function:prompt
$global:__nxLastHistId = -1
$h0 = Get-History -Count 1
if ($h0) { $global:__nxLastHistId = $h0.Id }

function global:__nxMark([string]$value) {
  return "$([char]27)]633;$($global:__nxNonce);$value$([char]7)"
}

function global:prompt {
  $success = $?
  $exitCode = $global:LASTEXITCODE
  $out = ""
  $h = Get-History -Count 1
  if ($global:__nxNonce -and $h -and $h.Id -ne $global:__nxLastHistId) {
    $global:__nxLastHistId = $h.Id
    $cmd = (($h.CommandLine -replace '\\', '\\') -replace "`r", '' -replace "`n", '\n') -replace '[\x00-\x08\x0b-\x1f\x7f]', ''
    $code = if ($success) { 0 } elseif ($exitCode) { $exitCode } else { 1 }
    $out += (__nxMark "E;$cmd") + (__nxMark "D;$code")
  }
  if ($global:__nxNonce) {
    $p = ($PWD.Path -replace '\\', '\\') -replace '[\x00-\x1f\x7f]', ''
    $out += (__nxMark "W;$p") + (__nxMark "A")
    Write-Host -NoNewline $out
  }
  $original = if ($global:__nxOriginalPrompt) { & $global:__nxOriginalPrompt } else { "PS $($PWD.Path)> " }
  if ($global:__nxNonce) { return "$original$(__nxMark 'B')" }
  return $original
}
