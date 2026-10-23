param([string]$Target = 'reports/peony2-fidelity/browser-captures.json')
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $Target
$acl = Get-Acl -LiteralPath $file.FullName
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FidelityRmProbe {
  [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public int pid; public System.Runtime.InteropServices.ComTypes.FILETIME start; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct ProcessInfo {
    public UniqueProcess process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string application;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string service;
    public uint type, status, session;
    [MarshalAs(UnmanagedType.Bool)] public bool restartable;
  }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] public static extern int RmStartSession(out uint handle, uint flags, StringBuilder key);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] public static extern int RmRegisterResources(uint handle, uint count, string[] files, uint processes, IntPtr app, uint services, IntPtr names);
  [DllImport("rstrtmgr.dll")] public static extern int RmGetList(uint handle, out uint needed, ref uint count, [In,Out] ProcessInfo[] information, ref uint reason);
  [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint handle);
}
'@
[uint32]$handle = 0
$key = [Text.StringBuilder]::new(33)
$start = [FidelityRmProbe]::RmStartSession([ref]$handle, 0, $key)
$processes = @()
$register = $null
$listCode = $null
try {
  if ($start -ne 0) { throw "RmStartSession=$start" }
  $register = [FidelityRmProbe]::RmRegisterResources($handle, 1, @($file.FullName), 0, [IntPtr]::Zero, 0, [IntPtr]::Zero)
  [uint32]$needed = 0; [uint32]$count = 0; [uint32]$reason = 0
  $listCode = [FidelityRmProbe]::RmGetList($handle, [ref]$needed, [ref]$count, $null, [ref]$reason)
  if ($listCode -eq 234) {
    $information = New-Object FidelityRmProbe+ProcessInfo[] $needed
    $count = $needed
    $listCode = [FidelityRmProbe]::RmGetList($handle, [ref]$needed, [ref]$count, $information, [ref]$reason)
    $processes = @($information | Select-Object -First $count | ForEach-Object { [pscustomobject]@{pid=$_.process.pid;application=$_.application;service=$_.service} })
  }
} finally { if ($start -eq 0) { [void][FidelityRmProbe]::RmEndSession($handle) } }
$openTests = @()
foreach ($mode in @([IO.FileAccess]::Read, [IO.FileAccess]::ReadWrite)) {
  try {
    $stream = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, $mode, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
    $stream.Dispose()
    $openTests += [pscustomobject]@{access=$mode.ToString();passed=$true}
  } catch { $openTests += [pscustomobject]@{access=$mode.ToString();passed=$false;error=$_.Exception.Message} }
}
[pscustomobject]@{
  verifiedAt=[DateTime]::UtcNow.ToString('o'); path=$file.FullName; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  attributes=$file.Attributes.ToString(); linkType=$file.LinkType; target=$file.Target; length=$file.Length; owner=$acl.Owner; access=$acl.AccessToString
  volumeFree=(Get-PSDrive -Name $file.PSDrive.Name).Free
  restartManager=[pscustomobject]@{startCode=$start;registerCode=$register;listCode=$listCode;processes=$processes}
  openTests=$openTests
  limit='Post-failure observation only. An empty Restart Manager list cannot exclude an earlier transient filesystem/antivirus/file-watcher sharing conflict; root cause remains unconfirmed.'
} | ConvertTo-Json -Depth 5
