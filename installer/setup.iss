; ===================================================================
;  CS2 Web Radar - Standalone Installer Script
;  Built with Inno Setup 6 (https://jrsoftware.org/isinfo.php)
; ===================================================================

#define AppName    "CS2 Web Radar"
#define AppVersion "2.0"
#define AppPublisher "CS2 Web Radar"
#define AppURL     "https://github.com/BOBEIRAS/Radar_CS2"
#define AppExeName "StartRadar.bat"

[Setup]
AppId={{A4B3C2D1-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
AppPublisher={#AppPublisher}

DefaultDirName={localappdata}\CS2WebRadar
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

OutputDir=.\output
OutputBaseFilename=CS2WebRadar_Setup_v{#AppVersion}
SetupIconFile=.\icon.ico

Compression=lzma2/ultra64
SolidCompression=yes
LZMANumBlockThreads=4

WizardStyle=modern
WizardSizePercent=120

PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\installer\icon.ico
CreateUninstallRegKey=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
; Core launcher/config
Source: "..\StartRadar.bat";                    DestDir: "{app}";                         Flags: ignoreversion
Source: "..\config.json";                       DestDir: "{app}";                         Flags: ignoreversion
Source: "..\offsets.json";                      DestDir: "{app}";                         Flags: ignoreversion

; Scripts
Source: "..\scripts\tunnel.ps1";                DestDir: "{app}\scripts";                 Flags: ignoreversion

; Memory reader (pre-built)
Source: "..\usermode\release\usermode.exe";    DestDir: "{app}\usermode\release";        Flags: ignoreversion

; Portable runtimes. Run download_nodejs_portable.ps1 before compiling the installer.
Source: ".\nodejs_portable\*";                  DestDir: "{app}\installer\nodejs_portable"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".\cloudflared.exe";                    DestDir: "{app}\installer";               Flags: ignoreversion skipifsourcedoesntexist

; Web runtime. The frontend must already be built into webapp\dist.
Source: "..\webapp\package.json";               DestDir: "{app}\webapp";                  Flags: ignoreversion
Source: "..\webapp\dist\*";                     DestDir: "{app}\webapp\dist";             Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\webapp\ws\*";                       DestDir: "{app}\webapp\ws";               Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\webapp\node_modules\ws\*";          DestDir: "{app}\webapp\node_modules\ws";  Flags: ignoreversion recursesubdirs createallsubdirs

; Icon for shortcuts
Source: ".\icon.ico";                           DestDir: "{app}\installer";               Flags: ignoreversion

[Icons]
Name: "{userdesktop}\CS2 Web Radar";            Filename: "{app}\StartRadar.bat";          WorkingDir: "{app}"; IconFilename: "{app}\installer\icon.ico"; Comment: "Launch CS2 Web Radar"; Tasks: desktopicon
Name: "{group}\CS2 Web Radar";                  Filename: "{app}\StartRadar.bat";          WorkingDir: "{app}"; IconFilename: "{app}\installer\icon.ico"; Comment: "Launch CS2 Web Radar"
Name: "{group}\Uninstall CS2 Web Radar";        Filename: "{uninstallexe}"

[Run]
Filename: "{app}\StartRadar.bat"; \
  WorkingDir: "{app}"; \
  Description: "Launch CS2 Web Radar now"; \
  Flags: postinstall nowait skipifsilent unchecked

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'This will install CS2 Web Radar v2.0 on your computer.' + #13#10 + #13#10 +
    'CS2 Web Radar lets you view a live tactical map of your' + #13#10 +
    'Counter-Strike 2 match in any browser, including on' + #13#10 +
    'your phone or your friends'' devices.' + #13#10 + #13#10 +
    'No Git, Node.js, npm, or Visual Studio installation is required.' + #13#10 + #13#10 +
    'Requirement:' + #13#10 +
    '  - Counter-Strike 2' + #13#10 + #13#10 +
    'Click Next to continue.';
end;
