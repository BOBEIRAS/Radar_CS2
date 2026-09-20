# CS2 Web Radar v2.1 — Command Center

[![Release](https://img.shields.io/badge/Release-v2.1.0-emerald.svg)](https://github.com/BOBEIRAS/Radar_CS2/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20x64-blue.svg)](https://microsoft.com)
[![Game](https://img.shields.io/badge/Target-Counter--Strike%202-orange.svg)](https://store.steampowered.com/app/730/CounterStrike_2/)
[![License](https://img.shields.io/badge/License-GPL--3.0-purple.svg)](LICENSE)

An ultra-modern, high-performance, real-time tactical web radar and in-game HUD for Counter-Strike 2. Features a standalone C# WPF Command Center launcher, HWID-locked licensing with an integrated key generator, Discord Rich Presence integration, native Valve Game State Integration (GSI), and a responsive React web interface with zero-configuration public sharing.

---

## 🌟 Key Features

### 🖥️ Native WPF Command Center (`CS2WEBRADAR.exe`)
- **Centralized Service Orchestrator**: Manages the local web server, secure Cloudflare tunnel, memory reader engine, and GSI listener with one click.
- **Automated Lifecycle Management**: Automatic cleanup of orphaned background processes (`usermode.exe`, `cloudflared.exe`, `node.exe`) on startup, stop, and shutdown.
- **Hardware ID (HWID) Licensing**: Cryptographically signed permanent and temporary licenses (1, 7, 15, 30, 90, 365 days) with hardware fingerprint binding.
- **Built-in Admin Key Generator**: Secure key generator panel (`Ctrl + Shift + K` or `admin.key` flag) for generating and managing client keys.
- **In-Game Overlay Mode**: Window management that automatically sets `HWND_TOPMOST` to pin the radar over CS2 in Fullscreen Windowed / Borderless mode.

### 🎮 Discord Rich Presence & Game State Integration (GSI)
- **Instant Map Ingestion**: Native Valve GSI configuration with 0.1s throttle and zero-buffer transmission for immediate map change detection.
- **Complete Active Duty Map Artwork**: Automatic Rich Presence art resolution across all competitive maps (`de_dust2`, `de_mirage`, `de_inferno`, `de_nuke`, `de_ancient`, `de_anubis`, `de_vertigo`, `de_train`, `de_overpass`, `cs_office`, `cs_italy`).
- **Profile Identification**: Real-time detection of local Discord account details and avatar display directly on the launcher dashboard.
- **Fast Menu Reset**: Automatic idle state restoration within 7 seconds of leaving a match.

### 🎯 High-Precision 2D Tactical Web Radar
- **Smooth Real-Time Tracking**: 50ms entity updates with linear interpolation for fluid movement without desync or stuttering.
- **Individual Accumulated Rotation**: Per-player angle normalization preventing 360-degree model snapping and coordinate jitter across entity loops.
- **Live Utility & Grenade Tracking**: Real-time visualization of active smokes, HE grenades, molotovs/incendiaries, flashbangs, and decoys with live duration countdowns.
- **C4 & Match State**: Real-time bomb plant location, defusal feasibility indicator, defuse kit presence, and team score tracking.
- **Opaque Settings Flyout**: High-contrast configuration modal with click-outside-to-close behavior for adjusting dot size, bomb icon size, player names, health badges, and map orientation.

### 📱 Responsive Mobile & Multi-Device Sharing
- **Zero-Config Cloudflare Tunneling**: Generates an encrypted public HTTPS URL and copies it to your clipboard automatically. No router port forwarding needed.
- **Mobile-First Touch UI**: Dedicated responsive layout with interactive tab switcher (Radar Viewport vs. Team Health/Economy Cards).
- **Cross-Platform**: Accessible from any modern web browser on PC, iPhone, iPad, Android, or secondary monitors.

---

## 🏗️ Architecture Overview

```
cs2_webradar/
├── launcher/                  # .NET 8 WPF Command Center GUI
│   ├── MainWindow.xaml        # Dashboard, telemetry, logs, keygen & changelog UI
│   ├── MainWindow.xaml.cs     # Process orchestrator, HWID & top-most overlay logic
│   ├── LicenseManager.cs      # HMAC-SHA256 HWID verification & key generation
│   ├── DiscordService.cs      # Discord Local IPC named-pipe client
│   └── GsiService.cs          # Local HTTP listener for Valve Game State Integration
│
├── usermode/                  # C++17 x64 Memory Reader Engine
│   └── src/
│       ├── core/              # Process memory access & module enumeration
│       ├── features/          # Player entity iteration & packet formatting
│       ├── sdk/               # CS2 schema netvars & game classes
│       └── utils/             # Dynamic remote offset fetching & fallback loader
│
├── webapp/                    # React 18 + Vite Frontend Application
│   ├── src/
│   │   ├── components/        # Radar, player dots, grenades, bomb & settings
│   │   ├── app.jsx            # Main app, responsive tabs, WebSocket resilient client
│   │   └── app.css            # Dark tactical aesthetic styles & theme
│   └── ws/
│       └── app.js             # Node.js WebSocket relay bridge & static web server
│
├── scripts/
│   └── PackageClient.ps1      # Automated client package & release builder (.zip)
├── config.json                # Core network ports and polling frequencies
└── offsets.json               # Local offset definitions & remote update endpoint
```

---

## 🚀 Quick Start

### For End Users (Clients)
1. Extract the `CS2WebRadar_Client_*.zip` archive to any directory.
2. Run `CS2WebRadar.exe`.
3. Paste your assigned license key and click **ACTIVATE**.
4. Click **START** (or **Overlay**).
5. Open Counter-Strike 2.
6. Share the generated public link with teammates or open it in your browser.

> [!TIP]
> **For In-Game Overlay:** In Counter-Strike 2 video settings, set display mode to **Fullscreen Windowed** (*Janela em ecrã inteiro*). The overlay will stay pinned on top of the game.

---

## 🛠️ Building From Source

### Prerequisites
- **Windows 10/11 (64-bit)**
- **.NET 8.0 SDK**
- **Node.js v18+ & npm**
- **Visual Studio 2022** (Desktop development with C++)

### 1. Build the Entire Client Distribution
The included PowerShell script builds the WPF launcher, packages the React web app, bundles the C++ usermode engine, and generates the ready-to-distribute client zip:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\PackageClient.ps1
```

### 2. Manual Component Compilation

#### WPF Launcher
```powershell
dotnet publish launcher -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o launcher\publish_standalone
```

#### React Frontend
```powershell
cd webapp
npm install
npm run build
cd ws
npm install
```

#### Memory Reader Engine
1. Open `usermode\cs2_webradar.sln` in Visual Studio 2022.
2. Select **Release | x64** and compile (`Ctrl + Shift + B`).
3. Binary outputs to `usermode\release\usermode.exe`.

---

## 🔐 Licensing System & Admin Keygen

The Command Center includes an offline-capable HWID licensing system:

- **Client HWID**: Calculated from motherboard UUID, CPU processor ID, and system drive serial.
- **Admin Access**: Place an empty `admin.key` file in the root directory, launch with `--admin`, or press `Ctrl + Shift + K` to unlock the built-in generator.
- **CLI Key Generation**:
  ```powershell
  CS2WebRadar.exe --keygen <CLIENT_HWID> [DAYS]
  # Example: CS2WebRadar.exe --keygen A1B2-C3D4-E5F6-7890 30
  ```

---

## ⚙️ Configuration (`config.json`)

```json
{
  "server": {
    "host": "localhost",
    "port": 22006,
    "webPort": 5173,
    "endpoint": "/cs2_webradar"
  },
  "radar": {
    "updateIntervalMs": 100
  },
  "offsets": {
    "file": "offsets.json",
    "remoteUrl": ""
  }
}
```

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
