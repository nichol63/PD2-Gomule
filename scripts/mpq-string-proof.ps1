$ErrorActionPreference = 'Stop'
# Run with 32-bit Windows PowerShell because the installed StormLib is x86.
# Only read APIs are bound; MPQ_OPEN_READ_ONLY = 0x100.
$gameRoot = Join-Path (Split-Path (Split-Path $PSScriptRoot)) 'Diablo II\ProjectD2'
$dll = Join-Path $gameRoot 'StormLib.dll'
$source = @'
using System;
using System.Runtime.InteropServices;
public static class MpqProof {
 [DllImport(@"DLLPATH", CharSet=CharSet.Ansi, SetLastError=true)] public static extern bool SFileOpenArchive(string path,uint priority,uint flags,out IntPtr archive);
 [DllImport(@"DLLPATH", CharSet=CharSet.Ansi, SetLastError=true)] public static extern bool SFileOpenFileEx(IntPtr archive,string path,uint scope,out IntPtr file);
 [DllImport(@"DLLPATH", SetLastError=true)] public static extern uint SFileGetFileSize(IntPtr file,out uint high);
 [DllImport(@"DLLPATH", SetLastError=true)] public static extern bool SFileReadFile(IntPtr file,byte[] bytes,uint size,out uint read,IntPtr overlap);
 [DllImport(@"DLLPATH")] public static extern bool SFileCloseFile(IntPtr file);
 [DllImport(@"DLLPATH")] public static extern bool SFileCloseArchive(IntPtr archive);
}
'@
Add-Type ($source.Replace('DLLPATH',$dll))
function Read-MpqBytes($archive, $entry) {
 $file = [IntPtr]::Zero
 if (![MpqProof]::SFileOpenFileEx($archive,$entry,0,[ref]$file)) { return $null }
 try {
  [uint32]$high=0; $size=[MpqProof]::SFileGetFileSize($file,[ref]$high)
  if ($high -ne 0 -or $size -gt 10000000) { throw 'Unexpected entry size' }
  $bytes=New-Object byte[] $size; [uint32]$read=0
  if (![MpqProof]::SFileReadFile($file,$bytes,$size,[ref]$read,[IntPtr]::Zero) -or $read -ne $size) { throw 'Incomplete MPQ entry read' }
  return ,$bytes
 } finally { [void][MpqProof]::SFileCloseFile($file) }
}
$keys = @('OpenWoundsItem','EaglehornRaven','ColdDamage','bloodwarplifereduction','increaseswithenergy','ModStrEnhancedDamage','increaseswithequippedeth','increaseswithmissinghp','ModStrIncSplashRadius','incsplashwithmissinghp','ModStrLifeStealCap','ofmaximumhp','MapTier')
$proof = @()
foreach ($relative in @('pd2data.mpq','patch_d2.mpq','Live\pd2data.mpq','Live\patch_d2.mpq')) {
 $path=Join-Path $gameRoot $relative; $archive=[IntPtr]::Zero
 $hashBefore=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
 if (![MpqProof]::SFileOpenArchive($path,0,0x100,[ref]$archive)) { throw "Cannot open $path : $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
 $tables=@()
 try {
  foreach ($name in @('string','expansionstring','patchstring')) {
   $entry="data\local\lng\eng\$name.tbl"; $bytes=Read-MpqBytes $archive $entry
   if ($null -eq $bytes) { $tables+=@{entry=$entry;present=$false}; continue }
   # Standard D2 TBL header: element count at 2, hash size at 4, 21-byte header, 17-byte hash records.
   $count=[BitConverter]::ToUInt16($bytes,2); $hashSize=[BitConverter]::ToUInt32($bytes,4)
   $offset=21+2*$count; $found=@()
   for ($i=0;$i -lt $hashSize;$i++) {
    $record=$offset+17*$i
    if ($bytes[$record] -ne 1) { continue }
    $keyOffset=[BitConverter]::ToUInt32($bytes,$record+7)
    $valueOffset=[BitConverter]::ToUInt32($bytes,$record+11)
    $valueLength=[BitConverter]::ToUInt16($bytes,$record+15)
    $end=$keyOffset; while ($end -lt $bytes.Length -and $bytes[$end] -ne 0) {$end++}
    $key=[Text.Encoding]::UTF8.GetString($bytes,$keyOffset,$end-$keyOffset)
    if ($keys -ccontains $key -or $key -match 'Eaglehorn|Raven') {
     $value=[Text.Encoding]::UTF8.GetString($bytes,$valueOffset,$valueLength).TrimEnd([char]0)
     # Independently check the key/value adjacency used by the GoMule TBL reader.
     if ($valueOffset -ne $end+1) { throw 'TBL key/value adjacency mismatch' }
     $valueEnd=$valueOffset; while ($valueEnd -lt $bytes.Length -and $bytes[$valueEnd] -ne 0) {$valueEnd++}
     $sequentialValue=[Text.Encoding]::UTF8.GetString($bytes,$valueOffset,$valueEnd-$valueOffset)
     if ($value -cne $sequentialValue) { throw 'TBL value length/terminator mismatch' }
     $found+=@{key=$key;value=$value;keyOffset=$keyOffset;valueOffset=$valueOffset;valueLength=$valueLength}
    }
   }
   $sha=[Security.Cryptography.SHA256]::Create()
   $tableHash=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','');$sha.Dispose()
   $tables+=@{entry=$entry;present=$true;length=$bytes.Length;sha256=$tableHash;matches=$found}
  }
  $statBytes=Read-MpqBytes $archive 'data\global\excel\ItemStatCost.txt'
  $statRows=@()
  if ($null -ne $statBytes) {
   $statText=[Text.Encoding]::UTF8.GetString($statBytes)
   $statRows=@($statText|ConvertFrom-Csv -Delimiter "`t"|Where-Object { $_.Stat -in @('deep_wounds','eaglehorn_raven') })
  }
 } finally { [void][MpqProof]::SFileCloseArchive($archive) }
 $hashAfter=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
 if ($hashBefore -ne $hashAfter) { throw 'Archive hash changed' }
 $proof+=@{archive=$path;sha256=$hashBefore;unchanged=$true;lastWriteTimeUtc=(Get-Item $path).LastWriteTimeUtc.ToString('o');tables=$tables;itemStatCostRows=$statRows}
}
$result=@{method='Installed x86 StormLib; read-only archive handles; TBL hash records; SHA256 before/after';versionNote='Archive content identified by SHA256; release version not asserted';keys=$keys;archives=$proof}
$json=$result|ConvertTo-Json -Depth 12
$outPath=Join-Path (Split-Path $PSScriptRoot) 'docs\autopilot\mpq-string-proof.json'
[IO.File]::WriteAllText($outPath,$json,[Text.UTF8Encoding]::new($false))
$json
