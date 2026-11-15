# auto-backup.ps1 - hands-off off-machine backup.
#
# Registered as a Windows Scheduled Task (at logon + daily). Each run:
#   1. Mirrors the user's ~/.claude config (master prompts, SITES.md, memory,
#      skills, agents, commands, plans, scheduled-tasks, settings.json) into
#      <repo>/_claude-config-backup/ so a replacement laptop restores Claude's
#      behavior. EXCLUDES the ~1 GB conversation-transcript store (*.jsonl),
#      the plugin cache, and telemetry.
#   2. git add -A, commits all working changes (if any), pushes to the private
#      GitHub remote (origin/master).
#
# Does NOT back up .env secrets (gitignored on purpose) - those are handled
# manually in a password manager. Log: tools/auto-backup.log (gitignored).

$ErrorActionPreference = 'Continue'
$repo   = 'C:\Users\mwoo7\Downloads\claude files'
$claude = 'C:\Users\mwoo7\.claude'
$dest   = Join-Path $repo '_claude-config-backup'
$log    = Join-Path $repo 'tools\auto-backup.log'

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

try {
  # 1. Mirror selected ~/.claude config into the repo
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $claude '*.md')          -Destination $dest -Force -ErrorAction SilentlyContinue
  Copy-Item -Path (Join-Path $claude 'settings.json') -Destination $dest -Force -ErrorAction SilentlyContinue

  foreach ($d in 'skills','agents','commands','plans','scheduled-tasks') {
    $src = Join-Path $claude $d
    if (Test-Path $src) {
      robocopy $src (Join-Path $dest $d) /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    }
  }
  # memory + other project config, but NOT the huge .jsonl transcripts
  robocopy (Join-Path $claude 'projects') (Join-Path $dest 'projects') /S /XF *.jsonl /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { Log "robocopy warning, code $LASTEXITCODE" }
  $global:LASTEXITCODE = 0

  # 2. Commit + push
  Set-Location $repo
  git add -A 2>&1 | Out-Null
  $changes = git status --porcelain
  if ($changes) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    git commit -q -m "chore(auto-backup): $stamp" 2>&1 | Out-Null
    git push origin master 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Log "pushed backup commit ($stamp)" }
    else { Log "push FAILED (exit $LASTEXITCODE) - commit saved locally, will retry next run" }
  } else {
    Log "no changes"
  }
} catch {
  Log "ERROR: $_"
  exit 1
}
