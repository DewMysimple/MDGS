param(
    [string]$Blender = $env:MDGS_BLENDER,
    [string]$Python = $env:MDGS_PYTHON,
    [string]$Node = $env:MDGS_NODE,
    [string]$Config = $env:MDGS_ASSET_CONFIG,
    [string]$SourceRoot = $env:MDGS_SOURCE_ROOT,
    [string]$MaterialsRoot = $env:MDGS_MATERIALS_ROOT,
    [ValidateScript({ $_ -gt 0 })][Nullable[int]]$ReferenceWidth,
    [ValidateScript({ $_ -gt 0 })][Nullable[int]]$ReferenceHeight,
    [switch]$RenderReferences,
    [switch]$CheckConfig,
    [switch]$DryRun,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) {
    @'
Read-only Blender source export pipeline (original .blend files are never saved).
Run from any directory; project paths are resolved from this script's location.

  ./scripts/run-export.ps1 -SourceRoot '<source folder>' [-MaterialsRoot '<images folder>']
  ./scripts/run-export.ps1 -Config '<asset config.json>' [-RenderReferences]
  ./scripts/run-export.ps1 -CheckConfig   # Validate source configuration without Blender
  ./scripts/run-export.ps1 -DryRun        # Also validate tools; do not export or write reports

Optional tools: -Blender, -Python, -Node; otherwise use MDGS_BLENDER,
MDGS_PYTHON, MDGS_NODE or discover blender/python/node on PATH.
Source options: MDGS_SOURCE_ROOT, MDGS_MATERIALS_ROOT, MDGS_ASSET_CONFIG,
or asset-pipeline.local.json in the project root (see scripts/asset-pipeline.example.json).
CLI and environment paths are relative to the directory from which you invoke
this script. JSON paths are relative to the JSON file's directory; sources are
relative to sourceRoot. Optional -ReferenceWidth / -ReferenceHeight configure
reference output; by default the source scene dimensions are preserved.
'@
    return
}

function Find-Executable {
    param([string]$Requested, [string[]]$Candidates, [string]$Label)
    $taskNames = if ($Requested) { @($Requested) } else { $Candidates }
    foreach ($taskName in $taskNames) {
        $taskCommand = Get-Command -Name $taskName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($taskCommand) { return $taskCommand.Source }
    }
    throw "$Label executable was not found. Supply -$Label or set MDGS_$($Label.ToUpperInvariant()), or add it to PATH."
}

$taskRoot = Split-Path -Parent $PSScriptRoot
# Resolve invocation-relative arguments before changing the working directory.
foreach ($taskVariable in @('Config', 'SourceRoot', 'MaterialsRoot', 'Blender', 'Python', 'Node')) {
    $taskValue = Get-Variable -Name $taskVariable -ValueOnly
    if ($taskValue -and ($taskVariable -in @('Config', 'SourceRoot', 'MaterialsRoot') -or $taskValue -match '[/\\]')) {
        Set-Variable -Name $taskVariable -Value ($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($taskValue))
    }
}
Push-Location -LiteralPath $taskRoot
try {
    $Python = Find-Executable -Requested $Python -Candidates @('python', 'python3', 'py') -Label 'Python'
    $taskSourceArgs = @()
    if ($Config) { $taskSourceArgs += @('--config', $Config) }
    if ($SourceRoot) { $taskSourceArgs += @('--source-root', $SourceRoot) }
    if ($MaterialsRoot) { $taskSourceArgs += @('--materials-root', $MaterialsRoot) }
    if ($ReferenceWidth) { $taskSourceArgs += @('--width', [string]$ReferenceWidth) }
    if ($ReferenceHeight) { $taskSourceArgs += @('--height', [string]$ReferenceHeight) }
    & $Python 'scripts/asset_config.py' @taskSourceArgs --check-config
    if ($LASTEXITCODE -ne 0) { throw 'Asset source configuration is invalid. No source files or assets have been modified.' }
    if ($CheckConfig) { return }

    $Blender = Find-Executable -Requested $Blender -Candidates @('blender') -Label 'Blender'
    $Node = Find-Executable -Requested $Node -Candidates @('node') -Label 'Node'
    & $Python -c 'from PIL import Image'
    if ($LASTEXITCODE -ne 0) { throw 'Pillow is missing from the selected Python. Install it with that interpreter: python -m pip install Pillow.' }
    & $Blender --version
    if ($LASTEXITCODE -ne 0) { throw 'The configured Blender executable could not run.' }
    & $Node --version
    if ($LASTEXITCODE -ne 0) { throw 'The configured Node executable could not run.' }
    if ($DryRun) {
        Write-Output 'Source configuration and tools validated. Dry run finished; no export or report writes were performed.'
        return
    }

    foreach ($taskScript in @('audit_blender.py', 'inspect_procedural.py', 'export_blender.py')) {
        & $Blender --background --python-exit-code 1 --python "scripts/$taskScript" -- @taskSourceArgs
        if ($LASTEXITCODE -ne 0) { throw "Blender stage failed: $taskScript" }
    }
    foreach ($taskScript in @('optimize_geometry.py', 'optimize_textures.py', 'restore_procedural.py', 'asset_stats.py')) {
        & $Python "scripts/$taskScript"
        if ($LASTEXITCODE -ne 0) { throw "Asset processing failed: $taskScript" }
    }
    if ($RenderReferences) {
        & $Blender --background --python-exit-code 1 --python 'scripts/render_reference.py' -- @taskSourceArgs
        if ($LASTEXITCODE -ne 0) { throw 'Reference rendering failed.' }
    }
    & $Node 'scripts/validate-assets.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Final asset validation failed.' }
} finally {
    Pop-Location
}
