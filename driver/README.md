# CS2 Web Radar — Kernel Driver (Ring 0)

## Overview
This kernel-mode driver exposes an IOCTL interface to read virtual memory from `cs2.exe` via `MmCopyVirtualMemory` and retrieve module base addresses by parsing the target process's PEB Loader data (`PEB->Ldr`).

### Benefits
- **No Usermode Process Handle**: `usermode.exe` never calls `OpenProcess(PROCESS_VM_READ, ...)` on `cs2.exe`. Anti-cheats scanning for open handles to game processes will see zero handles.
- **Ring-0 Memory Access**: Memory reading is executed within kernel mode context.
- **Automatic Fallback**: If the driver is not loaded, `usermode.exe` will seamlessly fall back to standard usermode memory reading without crashing.

---

## Building the Driver
### Prerequisites
1. Visual Studio 2022 (with "Desktop development with C++" workload).
2. Windows Driver Kit (WDK) 10/11 installed.

### Build via Visual Studio
Open `driver.vcxproj` in Visual Studio, set configuration to **Release / x64**, and click **Build Solution**. The compiled driver `cs2_radar_driver.sys` will be generated in `driver\bin\Release\`.

---

## Loading Methods

### Method 1: Manual Mapping via KDMapper (Recommended)
Manual mapping exploits a vulnerable signed driver (e.g. `iqvw64e.sys`) to inject `cs2_radar_driver.sys` directly into kernel non-paged pool memory without requiring Windows Test Signing mode and without creating a registered service.

1. Download or build [kdmapper](https://github.com/TheCruenz/kdmapper).
2. Run as Administrator:
```cmd
kdmapper.exe cs2_radar_driver.sys
```
3. Once loaded, launch `StartRadar.bat` or `usermode.exe`. The console will display:
```
[INFO] Kernel driver connected successfully! Ring 0 memory access active (OpenProcess bypassed).
```

---

### Method 2: Test-Signing Mode (Development / Testing)
1. Enable test signing in an Administrator command prompt:
```cmd
bcdedit /set testsigning on
```
*(Reboot your PC for test signing to activate)*

2. Register and start the driver service:
```cmd
sc create CS2Radar type= kernel binPath= "%cd%\bin\Release\cs2_radar_driver.sys"
sc start CS2Radar
```

3. To stop and delete the driver service:
```cmd
sc stop CS2Radar
sc delete CS2Radar
```
