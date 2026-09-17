# CS2 Web Radar v2.0

Modern, high-performance, real-time web radar for Counter-Strike 2. Featuring a modular architecture, dynamic remote offsets, zero-config sharing via secure tunnels, and a responsive mobile-first dark interface.

---

## Key Features

- **Real-Time 2D Tactical Radar**: Displays teammates and enemies with exact map positions, health, armor, weapons, active defuse kits, and carrying status.
- **Accurate Player Facing Angles**: Corrected eye-angle calculation showing precisely where each player is aiming.
- **Live Grenades & Projectiles**: Real-time visualization of thrown smokes, HE grenades, molotovs/incendiaries, flashes, and decoys on the map.
- **Live Match Scoreboard**: Displays team scores, round phase, defusal timers, and bomb status.
- **Responsive Mobile & Tablet View**:
  - Full-screen radar on mobile devices with an interactive tab switcher between Radar and Team Cards.
  - Compact alive player counters (`T:X | CT:Y`) and dark aesthetic design.
- **One-Click Public Sharing**: Built-in Cloudflare Tunnel integration that generates a secure public link and automatically copies it to your clipboard (`Ctrl+V`). No router port-forwarding required.
- **Unified Configuration (`config.json`)**: Centralized settings for WebSocket ports, endpoints, update rates, and offset paths.
- **Dynamic Remote Offsets (`offsets.json`)**: Auto-fetches up-to-date offsets from remote sources on launch, with hardcoded fallbacks to maintain compatibility across game updates.
- **Automated Launcher (`StartRadar.bat`)**: Kills zombie processes, manages web and backend services, verifies `cs2.exe` status, and launches with proper permissions.

---

## Requirements

### For Users (Installer / Pre-Built)
- **Operating System**: Windows 10 / 11 (64-bit)
- **Counter-Strike 2**
- **No Git, Node.js, npm, or Visual Studio required**

### For Developers / Building From Source
- **Node.js**: v18+
- **Visual Studio**: Visual Studio 2022 with Desktop Development with C++
- **Inno Setup 6** *(for building the Windows installer)*
- **Cloudflared** *(optional; the installer can bundle the portable executable)*

---

## Download

Download the latest ready-to-use installer from the repository Releases page:

**[Download Latest Release](https://github.com/BOBEIRAS/Radar_CS2/releases/latest)**

Use the `CS2WebRadar_Setup_v*.exe` file from Releases. You do not need to download the source code, clone the repository, install Git, install Node.js, or build anything manually.

If Windows shows a security warning for the downloaded installer, right-click the `.exe`, open **Properties**, check **Unblock**, then run it again.

---

## Quick Start

1. Download the latest installer from [Releases](https://github.com/BOBEIRAS/Radar_CS2/releases/latest).
2. Run `CS2WebRadar_Setup_v*.exe`.
3. Open Counter-Strike 2.
4. Launch **CS2 Web Radar** from the desktop or Start Menu shortcut.
5. The launcher will:
   - Terminate any previous orphan processes.
   - Start the bundled web server and WebSocket relay.
   - Generate a public sharing link and copy it to your clipboard.
   - Wait for `cs2.exe` and start the memory reader (`usermode.exe`).
6. Access the radar:
   - **Locally**: Open [http://localhost:22006](http://localhost:22006) in your browser.
   - **For Friends / Mobile**: Paste the link copied to your clipboard into any browser.

---

## Building from Source

### 1. Frontend & Relay Server
```powershell
# Install frontend dependencies
cd webapp
npm install

# (Optional) Verify production build
npm run build

# Install WebSocket server dependencies (if any)
cd ws
npm install
```

### 2. Memory Reader (C++ Usermode)
1. Open `usermode/cs2_webradar.sln` in Visual Studio 2022.
2. Set configuration to **Release** and platform to **x64**.
3. Build the solution (`Ctrl + Shift + B`).
4. The executable will be generated at `usermode/Release/usermode.exe`.

Alternatively, build via Developer PowerShell:
```powershell
msbuild usermode\cs2_webradar.sln /p:Configuration=Release /p:Platform=x64
```

### 3. Standalone Windows Installer
```powershell
# Build the frontend once on the developer machine
cd webapp
npm install
npm run build
cd ..

# Download portable runtime files used by the installer
powershell -ExecutionPolicy Bypass -File installer\download_nodejs_portable.ps1
powershell -ExecutionPolicy Bypass -File installer\download_cloudflared_portable.ps1

# Compile installer\setup.iss with Inno Setup 6
```

The generated installer does not require users to install Git, Node.js, npm, Visual Studio, or cloudflared.

---

## Configuration (`config.json`)

The application is controlled by `config.json` located at the root of the project:

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

### Options Breakdown:
- **`server.port`**: Standalone web server and WebSocket port used by the installed app.
- **`server.webPort`**: Development-only Vite port.
- **`radar.updateIntervalMs`**: Polling and broadcast interval in milliseconds.
- **`offsets.file`**: Local fallback path for memory offsets and netvars.
- **`offsets.remoteUrl`**: Remote URL to periodically download fresh offsets after game updates.

---

## Sharing with Friends

### Method A: Cloudflare Tunnel (Automatic, Recommended)
`StartRadar.bat` automatically spawns `cloudflared` and copies the public URL to your clipboard. Share that URL with your friends or open it on your phone/tablet while on any Wi-Fi or cellular network.

### Method B: Local Network (LAN / Same Wi-Fi)
1. Check your local IP by running `ipconfig` in cmd (e.g. `192.168.1.50`).
2. Open `http://<YOUR_LOCAL_IP>:22006` on any mobile device or PC connected to the same network.

---

## Project Structure

```
cs2_webradar/
├── config.json              # Central distribution settings
├── offsets.json             # Game memory offsets & netvars
├── StartRadar.bat           # Master automated launcher
├── scripts/
│   ├── tunnel.ps1           # Cloudflare tunnel link extractor
│   └── fix_crlf.js          # Line ending validation utility
├── usermode/                # C++ memory reader
│   ├── cs2_webradar.sln     # Visual Studio solution
│   ├── Release/             # Compiled x64 binary
│   └── src/
│       ├── core/            # Interfaces and process memory handling
│       ├── features/        # Entity loop and data packing
│       ├── sdk/             # CS2 classes & structures
│       └── utils/           # Dynamic config & remote offset loader
└── webapp/                  # Modern React + Vite frontend
    ├── src/
    │   ├── components/      # Radar, player cards, scoreboard, bomb
    │   ├── app.jsx          # Main application & responsive layout
    │   └── main.css         # Dark theme aesthetic styles
    └── ws/
        └── app.js           # WebSocket distribution bridge
```

---

## License

This project is open source and distributed under the [GPL-3.0 License](LICENSE).
