$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskBase = Read-Host 'Model API base URL (HTTPS, usually ends with /v1)'
$taskModel = Read-Host 'Exact model name from your provider'
if ($taskBase -notmatch '^https://[^\s]+$') { throw 'Use your provider official HTTPS base URL.' }
if ([string]::IsNullOrWhiteSpace($taskModel)) { throw 'Model name is required.' }
$taskSecure = Read-Host 'API Key (hidden; enter only here)' -AsSecureString
$taskBuffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
try {
 $taskKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskBuffer)
 foreach ($taskValue in @($taskBase,$taskModel,$taskKey)) { if ($taskValue -match '[\r\n"]') { throw 'Multiline values and quote characters are not supported.' } }
 if ([string]::IsNullOrWhiteSpace($taskKey)) { throw 'API Key is required.' }
 $taskLines = @(
  ('AI_BASE_URL="' + $taskBase.TrimEnd('/') + '"')
  ('AI_MODEL="' + $taskModel + '"')
  ('AI_API_KEY="' + $taskKey + '"')
  'PORT=3004'
 )
 [IO.File]::WriteAllLines((Join-Path $taskRoot '.env'),$taskLines,[Text.UTF8Encoding]::new($false))
 Write-Host 'Saved to local .env (ignored by Git). Do not send the key to chat.'
 Write-Host 'Tell Codex the setup is saved. The local preview will be restarted before real-model validation.'
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskBuffer)
 $taskKey = $null
 $taskLines = $null
}

