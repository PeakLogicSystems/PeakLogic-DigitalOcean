; PeakLogic MVP Suite — Windows installer (Inno Setup 6)
; Build: powershell -File scripts\build-windows-installer.ps1

#ifndef MyAppVersion
  #define MyAppVersion "2.3.7"
#endif
#ifndef StagingDir
  #define StagingDir "..\..\dist\windows-installer\staging"
#endif

#define MyAppName "PeakLogic MVP Suite"
#define MyAppPublisher "The Purple Standard"
#define MyAppExeName "PeakLogic.cmd"

[Setup]
AppId={{8F4E2A91-6C3D-4B8E-9F01-2D7E5A4B6C90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\..\dist\windows-installer
OutputBaseFilename=PeakLogic-MVP-Suite-{#MyAppVersion}-setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=no
UninstallDisplayIcon={app}\PeakLogic.cmd

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#StagingDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Stop PeakLogic"; Filename: "{app}\PeakLogic-Stop.cmd"; WorkingDir: "{app}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nRequires Node.js 18+ (nodejs.org). Projects and settings are stored under your user profile (%LOCALAPPDATA%\PeakLogic\data).
