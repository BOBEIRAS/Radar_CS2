using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

namespace launcher
{
    public partial class MainWindow : Window
    {
        private readonly DispatcherTimer _monitorTimer;
        private readonly string _rootDir;
        private readonly string _nodeExe;
        private readonly string _cloudflaredExe;
        private readonly string _usermodeExe;

        private Process? _serverProcess;
        private Process? _tunnelProcess;
        private Process? _usermodeProcess;

        private bool _isRunning = false;
        private string _publicUrl = "";
        private readonly string _serverPort = "22006";

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr CreateFile(
            string lpFileName,
            uint dwDesiredAccess,
            uint dwShareMode,
            IntPtr lpSecurityAttributes,
            uint dwCreationDisposition,
            uint dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint OPEN_EXISTING = 3;

        public MainWindow()
        {
            InitializeComponent();

            // Locate root directory (d:\cs2_webradar or parent of launcher)
            var current = AppDomain.CurrentDomain.BaseDirectory;
            var dir = new DirectoryInfo(current);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "config.json")))
            {
                dir = dir.Parent;
            }
            _rootDir = dir?.FullName ?? @"d:\cs2_webradar";

            // Binaries
            var portableNode = Path.Combine(_rootDir, "installer", "nodejs_portable", "node.exe");
            _nodeExe = File.Exists(portableNode) ? portableNode : "node.exe";

            var bundledTunnel = Path.Combine(_rootDir, "installer", "cloudflared.exe");
            _cloudflaredExe = File.Exists(bundledTunnel) ? bundledTunnel : "cloudflared.exe";

            _usermodeExe = Path.Combine(_rootDir, "usermode", "release", "usermode.exe");

            AppendLog($"[SYSTEM] CS2 Web Radar Command Center Initialized.");
            AppendLog($"[PATH] Root: {_rootDir}");

            // Monitor Timer for process statuses
            _monitorTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(1.5)
            };
            _monitorTimer.Tick += (s, e) => UpdateTelemetry();
            _monitorTimer.Start();

            UpdateTelemetry();
        }

        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }

        private void Minimize_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            StopAll();
            Application.Current.Shutdown();
        }

        private void AppendLog(string message)
        {
            Dispatcher.Invoke(() =>
            {
                var timestamp = DateTime.Now.ToString("HH:mm:ss");
                txtLogs.AppendText($"[{timestamp}] {message}\n");
                logScroll.ScrollToEnd();
            });
        }

        private void BtnClearLogs_Click(object sender, RoutedEventArgs e)
        {
            txtLogs.Clear();
        }

        private bool IsKernelDriverActive()
        {
            try
            {
                var handle = CreateFile(@"\\.\CS2Radar", GENERIC_READ | GENERIC_WRITE, 0, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                if (handle != IntPtr.Zero && handle.ToInt64() != -1)
                {
                    CloseHandle(handle);
                    return true;
                }
            }
            catch { }
            return false;
        }

        private bool IsProcessRunning(string processName)
        {
            return Process.GetProcessesByName(processName).Length > 0;
        }

        private void UpdateTelemetry()
        {
            // CS2 status
            bool cs2Running = IsProcessRunning("cs2");
            dotCs2.Fill = new SolidColorBrush(cs2Running ? Color.FromRgb(16, 185, 129) : Color.FromRgb(100, 116, 139));
            lblCs2Status.Text = cs2Running ? "RUNNING (DETECTED)" : "NOT RUNNING";
            lblCs2Status.Foreground = new SolidColorBrush(cs2Running ? Color.FromRgb(52, 211, 153) : Color.FromRgb(148, 163, 184));

            // Kernel Driver status
            bool driverActive = IsKernelDriverActive();
            dotKernel.Fill = new SolidColorBrush(driverActive ? Color.FromRgb(56, 189, 248) : Color.FromRgb(100, 116, 139));
            lblKernelStatus.Text = driverActive ? "ACTIVE (RING 0)" : "OFFLINE / STANDBY";
            lblKernelStatus.Foreground = new SolidColorBrush(driverActive ? Color.FromRgb(56, 189, 248) : Color.FromRgb(148, 163, 184));

            // Web Server status
            bool serverRunning = _serverProcess != null && !_serverProcess.HasExited;
            dotServer.Fill = new SolidColorBrush(serverRunning ? Color.FromRgb(16, 185, 129) : Color.FromRgb(100, 116, 139));
            lblServerStatus.Text = serverRunning ? $"LIVE (PORT {_serverPort})" : "STOPPED";
            lblServerStatus.Foreground = new SolidColorBrush(serverRunning ? Color.FromRgb(52, 211, 153) : Color.FromRgb(148, 163, 184));

            // Tunnel status
            bool tunnelRunning = _tunnelProcess != null && !_tunnelProcess.HasExited;
            dotTunnel.Fill = new SolidColorBrush(tunnelRunning ? Color.FromRgb(16, 185, 129) : Color.FromRgb(100, 116, 139));
            lblTunnelStatus.Text = !string.IsNullOrEmpty(_publicUrl) ? "ONLINE" : (tunnelRunning ? "STARTING..." : "INACTIVE");
            lblTunnelStatus.Foreground = new SolidColorBrush(!string.IsNullOrEmpty(_publicUrl) ? Color.FromRgb(52, 211, 153) : Color.FromRgb(148, 163, 184));
        }

        private async void BtnMaster_Click(object sender, RoutedEventArgs e)
        {
            if (_isRunning)
            {
                StopAll();
            }
            else
            {
                await StartAllAsync();
            }
        }

        private async Task StartAllAsync()
        {
            _isRunning = true;
            btnMaster.Background = new SolidColorBrush(Color.FromRgb(220, 38, 38));
            txtMasterBtn.Text = "STOP RADAR SUITE";
            txtMasterBtnIcon.Text = "■";
            lblEngineState.Text = "RUNNING";
            lblEngineState.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));

            AppendLog("[1/4] Checking Kernel Driver state...");
            if (IsKernelDriverActive())
            {
                AppendLog("  [OK] Ring 0 Kernel Driver (\\\\.\\CS2Radar) detected and ready.");
            }
            else
            {
                AppendLog("  [INFO] Kernel driver is not active. Engine will use protected Usermode fallback.");
            }

            // Start Web Server
            AppendLog("[2/4] Starting local web server...");
            try
            {
                var serverScript = Path.Combine(_rootDir, "webapp", "ws", "app.js");
                var serverPsi = new ProcessStartInfo
                {
                    FileName = _nodeExe,
                    Arguments = $"\"{serverScript}\"",
                    WorkingDirectory = Path.Combine(_rootDir, "webapp"),
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                _serverProcess = new Process { StartInfo = serverPsi, EnableRaisingEvents = true };
                _serverProcess.OutputDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[WEB] {ev.Data}"); };
                _serverProcess.ErrorDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[WEB-ERR] {ev.Data}"); };
                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();
                AppendLog("  [OK] Web server initiated.");
            }
            catch (Exception ex)
            {
                AppendLog($"  [ERROR] Failed to start web server: {ex.Message}");
            }

            // Start Cloudflare Tunnel
            AppendLog("[3/4] Initializing Cloudflare Tunnel...");
            try
            {
                var tunnelLog = Path.Combine(Path.GetTempPath(), "cloudflared.log");
                if (File.Exists(tunnelLog)) File.Delete(tunnelLog);

                var tunnelPsi = new ProcessStartInfo
                {
                    FileName = _cloudflaredExe,
                    Arguments = $"tunnel --url http://localhost:{_serverPort}",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                _tunnelProcess = new Process { StartInfo = tunnelPsi };
                _tunnelProcess.ErrorDataReceived += (s, ev) =>
                {
                    if (string.IsNullOrEmpty(ev.Data)) return;
                    var match = Regex.Match(ev.Data, @"https://[a-zA-Z0-9-]+\.trycloudflare\.com");
                    if (match.Success && string.IsNullOrEmpty(_publicUrl))
                    {
                        _publicUrl = match.Value;
                        Dispatcher.Invoke(() =>
                        {
                            txtPublicUrl.Text = _publicUrl;
                            AppendLog($"  [PUBLIC LINK] {_publicUrl}");
                            try { Clipboard.SetText(_publicUrl); AppendLog("  [OK] Link copied to clipboard automatically!"); } catch { }
                        });
                    }
                };
                _tunnelProcess.Start();
                _tunnelProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                AppendLog($"  [WARNING] Cloudflare Tunnel disabled: {ex.Message}");
            }

            // Start Memory Reader (usermode.exe)
            AppendLog("[4/4] Launching CS2 Memory Reader...");
            _ = Task.Run(async () =>
            {
                while (_isRunning && !IsProcessRunning("cs2"))
                {
                    AppendLog("  [WAIT] Waiting for cs2.exe to launch...");
                    await Task.Delay(3000);
                }

                if (!_isRunning) return;

                AppendLog("  [OK] CS2 detected! Starting memory reader engine...");
                try
                {
                    var readerPsi = new ProcessStartInfo
                    {
                        FileName = _usermodeExe,
                        WorkingDirectory = Path.GetDirectoryName(_usermodeExe)!,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    };

                    _usermodeProcess = new Process { StartInfo = readerPsi, EnableRaisingEvents = true };
                    _usermodeProcess.OutputDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[ENGINE] {ev.Data}"); };
                    _usermodeProcess.ErrorDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[ENGINE-ERR] {ev.Data}"); };
                    _usermodeProcess.Start();
                    _usermodeProcess.BeginOutputReadLine();
                    _usermodeProcess.BeginErrorReadLine();
                }
                catch (Exception ex)
                {
                    AppendLog($"  [ERROR] Memory reader launch failed: {ex.Message}");
                }
            });
        }

        private void StopAll()
        {
            _isRunning = false;
            btnMaster.Background = new SolidColorBrush(Color.FromRgb(16, 185, 129));
            txtMasterBtn.Text = "START RADAR SUITE";
            txtMasterBtnIcon.Text = "▶";
            lblEngineState.Text = "IDLE";
            lblEngineState.Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184));
            _publicUrl = "";
            txtPublicUrl.Text = "Waiting for radar start...";

            AppendLog("[STOP] Shutting down radar processes...");

            try
            {
                if (_usermodeProcess != null && !_usermodeProcess.HasExited)
                {
                    _usermodeProcess.Kill();
                    _usermodeProcess.Dispose();
                    _usermodeProcess = null;
                }
            }
            catch { }

            try
            {
                if (_serverProcess != null && !_serverProcess.HasExited)
                {
                    _serverProcess.Kill();
                    _serverProcess.Dispose();
                    _serverProcess = null;
                }
            }
            catch { }

            try
            {
                if (_tunnelProcess != null && !_tunnelProcess.HasExited)
                {
                    _tunnelProcess.Kill();
                    _tunnelProcess.Dispose();
                    _tunnelProcess = null;
                }
            }
            catch { }

            AppendLog("[OK] All processes terminated.");
            UpdateTelemetry();
        }

        private void BtnOpenBrowser_Click(object sender, RoutedEventArgs e)
        {
            var url = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
                AppendLog($"[BROWSER] Opened radar in browser: {url}");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Could not open browser: {ex.Message}");
            }
        }

        private void BtnCopyLink_Click(object sender, RoutedEventArgs e)
        {
            var url = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            try
            {
                Clipboard.SetText(url);
                AppendLog($"[CLIPBOARD] Copied link: {url}");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Failed to copy to clipboard: {ex.Message}");
            }
        }

    }
}