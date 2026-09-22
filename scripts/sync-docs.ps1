[CmdletBinding()]
param(
    # Sync        : commit local doc changes, take origin's commits, push.
    # Initialize  : same, but bootstraps the git dir first. Run once per machine.
    [ValidateSet('Initialize', 'Sync')][string]$Mode = 'Sync',

    # The Obsidian-synced doc folder. This stays the ONLY source of truth. The GitHub
    # mirror exists for one reason: Claude sessions on the web/phone run in a cloud
    # container that cannot see Obsidian Sync at all - only attached git repos.
    [string]$DocsRoot = 'D:\Vault_JROC\02_Dev\App\Text_Rag',

    # The git dir lives OUTSIDE the vault on purpose. A .git inside a cloud-synced
    # folder corrupted this very project once (2026-09-20: the 9/12-9/13 commits were
    # lost). Same split the Vault_AI mirror uses.
    [string]$MirrorRoot = (Join-Path $env:USERPROFILE '.ai-shared-sync'),

    [string]$Origin = 'https://github.com/J-Roc-H/text-rag-docs.git',

    # Commit locally, touch no network.
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'
$gitDir = Join-Path $MirrorRoot 'text-rag-docs.git'
$inbox  = Join-Path $DocsRoot '_mobile-inbox'

# git.exe, not git: PowerShell resolves a bare name as alias -> function -> cmdlet ->
# executable, and names are case-insensitive, so inside a function called Git the call
# `& git` finds the function again and recurses until CallDepthOverflow. The name is
# Invoke-Git AND the target is git.exe - either alone fixes it, both make it unrepeatable.
function Invoke-Git { & git.exe --git-dir=$gitDir --work-tree=$DocsRoot @args }

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'git not found on PATH.' }
if (-not (Test-Path -LiteralPath $DocsRoot)) { throw "Docs folder not found: $DocsRoot" }

# git writes ordinary progress to stderr. Under ErrorActionPreference=Stop that becomes
# a terminating NativeCommandError on PowerShell 5.1, and 7.4+ turns any nonzero exit
# into a throw - both abort a perfectly healthy sync. Every git result that matters is
# checked explicitly below instead. (Same dodge sync-ai-shared.ps1 uses.)
$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false

# --- bootstrap ---------------------------------------------------------------
$fresh = -not (Test-Path -LiteralPath (Join-Path $gitDir 'HEAD'))
if ($fresh -and $Mode -ne 'Initialize') {
    throw "No mirror at $gitDir. Run once with: .\scripts\sync-docs.ps1 -Mode Initialize"
}
if ($fresh) {
    New-Item -ItemType Directory -Force -Path $MirrorRoot | Out-Null
    Invoke-Git init -b main | Out-Null
    # Korean UTF-8 markdown written by Obsidian - never let git rewrite the bytes.
    Invoke-Git config core.autocrlf false | Out-Null
    Invoke-Git config user.name  'text-rag-docs-sync' | Out-Null
    Invoke-Git config user.email 'sync@localhost' | Out-Null
    Invoke-Git remote add origin $Origin | Out-Null
}

# Markdown only. Attachments, .obsidian state and Sync conflict copies stay out - this
# is a read surface for Claude, not a vault backup.
$exclude = Join-Path $gitDir 'info\exclude'
New-Item -ItemType Directory -Force -Path (Split-Path $exclude) | Out-Null
Set-Content -LiteralPath $exclude -Encoding ASCII -Value @('*', '!*/', '!*.md', '.obsidian/', '.trash/')

if (-not $NoPush) { Invoke-Git fetch origin main 2>$null | Out-Null }
$originHead = (& git.exe --git-dir=$gitDir rev-parse --verify --quiet origin/main)

if ($fresh -and $originHead) {
    # Another machine bootstrapped first. Continue its history instead of starting a
    # second root commit that could never be merged into it.
    Invoke-Git symbolic-ref HEAD refs/heads/main | Out-Null
    & git.exe --git-dir=$gitDir update-ref refs/heads/main $originHead.Trim() | Out-Null
    Invoke-Git reset --mixed | Out-Null
    # Paths origin has that this vault does not are almost always _mobile-inbox/ notes
    # that have not reached this machine through Obsidian Sync yet. Pull them down
    # rather than committing a deletion of someone else's note.
    Invoke-Git add -A | Out-Null
    foreach ($p in @(Invoke-Git diff --cached --name-only --diff-filter=D)) {
        Invoke-Git checkout HEAD -- $p | Out-Null
    }
}

# --- commit whatever changed in the vault ------------------------------------
Invoke-Git add -A | Out-Null
$pending = @(Invoke-Git status --porcelain)
if ($pending.Count -gt 0) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    Invoke-Git commit -q -m ("docs: vault sync {0} ({1} path(s))" -f $stamp, $pending.Count) | Out-Null
    Write-Host ("committed {0} path(s)" -f $pending.Count)
} else {
    Write-Host 'no local doc changes'
}

if ($NoPush) { Write-Host 'NoPush set - stopped before the network.'; exit 0 }

# --- take origin's commits, then publish -------------------------------------
Invoke-Git fetch origin main 2>$null | Out-Null
if (& git.exe --git-dir=$gitDir rev-parse --verify --quiet origin/main) {
    # Mobile sessions only ever write _mobile-inbox/, so this rebase is expected to be
    # conflict-free. If it is not, git stops and leaves the vault untouched - resolve
    # by hand rather than let a script guess which side of a DEVREF edit wins.
    Invoke-Git rebase origin/main
    if ($LASTEXITCODE -ne 0) {
        throw "Rebase stopped. Resolve in $DocsRoot, then run: git --git-dir=$gitDir --work-tree=$DocsRoot rebase --continue"
    }
}
Invoke-Git push -u origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed. Check network / that the repo exists and you have access.' }
Write-Host ("pushed -> {0}" -f $Origin)

# --- surface anything the phone left behind ----------------------------------
$notes = @(Get-ChildItem -LiteralPath $inbox -Filter *.md -ErrorAction SilentlyContinue)
if ($notes.Count -gt 0) {
    Write-Host ''
    Write-Host ("MOBILE INBOX: {0} note(s) waiting to be merged into the vault:" -f $notes.Count)
    $notes | ForEach-Object { Write-Host ('  ' + $_.Name) }
    Write-Host 'Merge with /wrapup-dev into the devlog / DEVREF, delete the files, then re-run this script.'
}
