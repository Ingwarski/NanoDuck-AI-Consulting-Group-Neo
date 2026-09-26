import { constants, closeSync, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, join, parse, resolve } from "node:path";

const owns = metadata => typeof process.getuid !== "function" || metadata.uid === process.getuid();
const windowsAclProgram = `
[Console]::Error.WriteLine('NANODUCK_PRIVATE_STAGE:script')
$ErrorActionPreference = 'Stop'
$stage = 'module'
$handle = $null
$identity = $null
try {
[Console]::Error.WriteLine('NANODUCK_PRIVATE_STAGE:module')
Import-Module ($PSHOME + '\\Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
$stage = 'compile'
[Console]::Error.WriteLine('NANODUCK_PRIVATE_STAGE:compile')
Microsoft.PowerShell.Utility\\Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
public static class NanoDuckPrivateHandle {
  [StructLayout(LayoutKind.Sequential)]
  struct FileInformation {
    public uint Attributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation information);
  [DllImport("advapi32.dll")]
  static extern uint GetSecurityInfo(SafeFileHandle handle, uint kind, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
  [DllImport("advapi32.dll")]
  static extern uint SetSecurityInfo(SafeFileHandle handle, uint kind, uint information, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("advapi32.dll")]
  static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
  [DllImport("advapi32.dll", SetLastError = true)]
  static extern bool GetSecurityDescriptorDacl(IntPtr descriptor, out bool present, out IntPtr dacl, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError = true)]
  static extern bool GetSecurityDescriptorOwner(IntPtr descriptor, out IntPtr owner, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError = true)]
  static extern bool GetTokenInformation(IntPtr token, uint kind, IntPtr information, uint length, out uint required);
  [DllImport("kernel32.dll")]
  static extern IntPtr LocalFree(IntPtr memory);
  public static SafeFileHandle Open(string path, bool directory) {
    // GENERIC_READ | READ_CONTROL | WRITE_DAC | WRITE_OWNER | FILE_READ_ATTRIBUTES.
    // Data-read access makes omission of FILE_SHARE_DELETE fence rename/delete.
    var handle = CreateFileW(path, 0x800e0080, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
    if (handle.IsInvalid) { int error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
    try {
      FileInformation info;
      if (!GetFileInformationByHandle(handle, out info)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if ((info.Attributes & 0x400) != 0 || ((info.Attributes & 0x10) != 0) != directory || (!directory && info.Links != 1)) throw new InvalidOperationException("Unsafe private path");
      return handle;
    } catch { handle.Dispose(); throw; }
  }
  public static string DefaultOwner(IntPtr token) {
    uint length;
    GetTokenInformation(token, 4, IntPtr.Zero, 0, out length);
    if (length == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr memory = Marshal.AllocHGlobal((int)length);
    try {
      if (!GetTokenInformation(token, 4, memory, length, out length)) throw new Win32Exception(Marshal.GetLastWin32Error());
      return new SecurityIdentifier(Marshal.ReadIntPtr(memory)).Value;
    } finally { Marshal.FreeHGlobal(memory); }
  }
  public static byte[] ReadSecurity(SafeFileHandle handle) {
    IntPtr owner, group, dacl, sacl, descriptor;
    uint error = GetSecurityInfo(handle, 1, 5, out owner, out group, out dacl, out sacl, out descriptor);
    if (error != 0) throw new Win32Exception((int)error);
    try { var bytes = new byte[GetSecurityDescriptorLength(descriptor)]; Marshal.Copy(descriptor, bytes, 0, bytes.Length); return bytes; }
    finally { LocalFree(descriptor); }
  }
  public static void SetPrivateDacl(SafeFileHandle handle, byte[] descriptor) {
    var pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
    try {
      bool present, defaulted; IntPtr dacl, owner;
      if (!GetSecurityDescriptorDacl(pinned.AddrOfPinnedObject(), out present, out dacl, out defaulted) || !present || dacl == IntPtr.Zero) throw new InvalidOperationException("Missing private ACL");
      if (!GetSecurityDescriptorOwner(pinned.AddrOfPinnedObject(), out owner, out defaulted) || owner == IntPtr.Zero) throw new InvalidOperationException("Missing private owner");
      uint error = SetSecurityInfo(handle, 1, 0x80000005, owner, IntPtr.Zero, dacl, IntPtr.Zero);
      if (error != 0) throw new Win32Exception((int)error);
    } finally { pinned.Free(); }
  }
}
'@
$directory = $env:NANODUCK_PRIVATE_KIND -eq 'directory'
$stage = 'open'
[Console]::Error.WriteLine('NANODUCK_PRIVATE_STAGE:open')
$handle = [NanoDuckPrivateHandle]::Open($env:NANODUCK_PRIVATE_PATH, $directory)
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User
$stage = 'read'
$existing = [System.Security.AccessControl.RawSecurityDescriptor]::new([NanoDuckPrivateHandle]::ReadSecurity($handle), 0)
$stage = 'owner'
# Elevated Windows tokens can create objects with their default owner group.
if ($existing.Owner -ne $sid -and $existing.Owner.Value -ne [NanoDuckPrivateHandle]::DefaultOwner($identity.Token)) { throw 'Unsafe private owner' }
if ($directory) {
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
} else {
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
}
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule($rule)
$stage = 'apply'
[NanoDuckPrivateHandle]::SetPrivateDacl($handle, $acl.GetSecurityDescriptorBinaryForm())
$stage = 'verify'
$actual = if ($directory) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
$actual.SetSecurityDescriptorBinaryForm([NanoDuckPrivateHandle]::ReadSecurity($handle))
if ($actual.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or -not $actual.AreAccessRulesProtected) { throw 'Private ACL not applied' }
$rules = @($actual.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { throw 'Unexpected private ACL' }
} catch {
  $failure = $_.Exception
  while ($failure.InnerException) { $failure = $failure.InnerException }
  if ($failure -is [System.ComponentModel.Win32Exception] -and $failure.NativeErrorCode -in 2, 3) { exit 3 }
  $code = if ($failure -is [System.ComponentModel.Win32Exception]) { $failure.NativeErrorCode } else { 0 }
  [Console]::Error.WriteLine('NANODUCK_PRIVATE_ERROR:' + $stage + ':' + $code)
  exit 1
} finally { if ($handle) { $handle.Dispose() }; if ($identity) { $identity.Dispose() } }
`;

function applyWindowsPrivacy(path, kind) {
  const systemDirectory = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemDirectory || !isAbsolute(systemDirectory)) throw new Error("private_permissions_unavailable");
  const executable = join(systemDirectory, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    if (!lstatSync(executable).isFile()) throw new Error("powershell_unavailable");
    execFileSync(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(windowsAclProgram, "utf16le").toString("base64")], {
      env: { ...process.env, SystemRoot: systemDirectory, WINDIR: systemDirectory, PSModulePath: join(systemDirectory, "System32", "WindowsPowerShell", "v1.0", "Modules"), NANODUCK_PRIVATE_PATH: path, NANODUCK_PRIVATE_KIND: kind },
      windowsHide: true, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    if (error.status === 3) throw Object.assign(new Error("ENOENT: private path does not exist"), { code: "ENOENT" });
    const reason = String(error.stderr ?? "").match(/NANODUCK_PRIVATE_ERROR:(module|compile|open|read|owner|apply|verify):(\d+)/u);
    const execution = typeof error.code === "string" && /^[A-Z_]+$/u.test(error.code) ? error.code : Number.isInteger(error.status) ? `exit_${error.status}` : "launch";
    const stage = [...String(error.stderr ?? "").matchAll(/NANODUCK_PRIVATE_STAGE:(script|module|compile|open)/gu)].at(-1)?.[1] ?? "bootstrap";
    throw new Error(`private_permissions_unavailable (${reason ? `${reason[1]}:${reason[2]}` : `helper_${execution}:${stage}`})`);
  }
}

function normalizedDirectory(path) {
  let absolute = resolve(path);
  // macOS exposes these OS-owned aliases. User-created symlinks remain invalid.
  if (process.platform === "darwin") {
    for (const alias of ["/tmp", "/var"]) {
      if (absolute === alias || absolute.startsWith(`${alias}/`)) {
        const canonical = realpathSync(alias);
        if (canonical !== `/private${alias}`) throw new Error("unsafe_local_data_directory");
        absolute = `${canonical}${absolute.slice(alias.length)}`;
      }
    }
  }
  return absolute;
}

export function ensurePrivateDirectory(path) {
  if (typeof path !== "string" || !path.trim()) throw new Error("unsafe_local_data_directory");
  const absolute = normalizedDirectory(path); const root = parse(absolute).root;
  let cursor = root;
  for (const component of absolute.slice(root.length).split(/[\\/]/u).filter(Boolean)) {
    cursor = join(cursor, component);
    try { if (!lstatSync(cursor).isDirectory()) throw new Error("unsafe_local_data_directory"); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      try { mkdirSync(cursor, { mode: 0o700 }); }
      catch (creationError) { if (creationError.code !== "EEXIST" || !lstatSync(cursor).isDirectory()) throw creationError; }
    }
  }
  if (process.platform === "win32") applyWindowsPrivacy(absolute, "directory");
  else {
    const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const metadata = fstatSync(descriptor);
      if (!metadata.isDirectory() || !owns(metadata)) throw new Error("unsafe_local_data_directory");
      fchmodSync(descriptor, 0o700);
    } finally { closeSync(descriptor); }
  }
  return absolute;
}

export function ensurePrivateFile(path) {
  const absolute = resolve(path);
  if (process.platform === "win32") { applyWindowsPrivacy(absolute, "file"); return absolute; }
  // Validate and protect the same file; never authorize a later pathname lookup.
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || !owns(opened)) throw new Error("unsafe_local_data_file");
    fchmodSync(descriptor, 0o600);
  } finally { closeSync(descriptor); }
  return absolute;
}
