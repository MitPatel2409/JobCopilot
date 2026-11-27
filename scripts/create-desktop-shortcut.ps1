# Puts a "Job-Copilot" shortcut on the desktop and in the Start menu that runs "Start Job-Copilot.cmd".
# Run once from the project folder:  npm run shortcut
# (or: powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1)
# To pin it to the taskbar, right-click either shortcut and choose "Pin to taskbar"
# (Windows does not let a script pin it).

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "Start Job-Copilot.cmd"
$icon = Join-Path $PSScriptRoot "job-copilot.ico"
$folders = @(
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs")
)

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $folders) {
  $path = Join-Path $folder "Job-Copilot.lnk"
  $shortcut = $shell.CreateShortcut($path)
  # Windows only offers "Pin to taskbar" for shortcuts to programs, not to a .cmd,
  # so the shortcut runs cmd.exe with the launcher as its argument.
  $shortcut.TargetPath = Join-Path $env:SystemRoot "System32\cmd.exe"
  $shortcut.Arguments = "/c `"$launcher`""
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = "$icon,0"
  $shortcut.Description = "Start Job-Copilot (server and client) and open it in the browser"
  $shortcut.Save()
  Write-Host "Created $path"
}
