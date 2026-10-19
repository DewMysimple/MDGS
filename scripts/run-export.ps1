param(
    [string]$Blender = 'F:\Blender\blender.exe',
    [string]$Python = 'C:\Users\16033\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe',
    [switch]$RenderReferences
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    & $Blender --background --python 'scripts/audit_blender.py'
    if ($LASTEXITCODE -ne 0) { throw 'Blender audit failed.' }
    & $Blender --background --python 'scripts/inspect_procedural.py'
    if ($LASTEXITCODE -ne 0) { throw 'Procedural shader inspection failed.' }
    & $Blender --background --python 'scripts/export_blender.py'
    if ($LASTEXITCODE -ne 0) { throw 'Blender export failed.' }
    & $Python 'scripts/optimize_geometry.py'
    if ($LASTEXITCODE -ne 0) { throw 'Geometry indexing failed.' }
    & $Python 'scripts/optimize_textures.py'
    if ($LASTEXITCODE -ne 0) { throw 'Texture encoding failed.' }
    & $Python 'scripts/restore_procedural.py'
    if ($LASTEXITCODE -ne 0) { throw 'Procedural shader translation failed.' }
    & $Python 'scripts/asset_stats.py'
    if ($LASTEXITCODE -ne 0) { throw 'Asset statistics failed.' }
    if ($RenderReferences) {
        & $Blender --background --threads 8 --python 'scripts/render_reference.py' -- chapter-1 chapter-2 chapter-3 chapter-4
        if ($LASTEXITCODE -ne 0) { throw 'Reference rendering failed.' }
    }
    node 'scripts/validate-assets.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Final asset validation failed.' }
} finally {
    Pop-Location
}
