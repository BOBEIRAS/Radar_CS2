using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

namespace launcher
{
    public partial class MainWindow : Window
    {
        // ─── Fields ───────────────────────────────────────────────────────────

        private readonly DispatcherTimer? _monitorTimer;
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

        // Discord invite link — your server community
        private const string DiscordInvite = "https://discord.gg/2YVSYK6DC";

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr CreateFile(
            string lpFileName, uint dwDesiredAccess, uint dwShareMode,
            IntPtr lpSecurityAttributes, uint dwCreationDisposition,
            uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint OPEN_EXISTING = 3;

        // ─── Constructor ──────────────────────────────────────────────────────

        public MainWindow()
        {
            InitializeComponent();

            // Locate root directory (has config.json)
            var current = AppDomain.CurrentDomain.BaseDirectory;
            var dir = new DirectoryInfo(current);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "config.json")))
                dir = dir.Parent;
            _rootDir = dir?.FullName ?? @"d:\cs2_webradar";

            // Binaries
            var portableNode = Path.Combine(_rootDir, "installer", "nodejs_portable", "node.exe");
            _nodeExe = File.Exists(portableNode) ? portableNode : "node.exe";
            var bundledTunnel = Path.Combine(_rootDir, "installer", "cloudflared.exe");
            _cloudflaredExe = File.Exists(bundledTunnel) ? bundledTunnel : "cloudflared.exe";
            _usermodeExe = Path.Combine(_rootDir, "usermode", "release", "usermode.exe");

            // CLI key generator mode: CS2WebRadar.exe --keygen <hwid> [days]
            var args = Environment.GetCommandLineArgs();
            if (args.Length >= 3 && args[1].ToLower() == "--keygen")
            {
                string hwid = args[2];
                int days = args.Length >= 4 && int.TryParse(args[3], out int d) ? d : 0;
                string key = days > 0
                    ? LicenseManager.GenerateTemporaryKey(hwid, days)
                    : LicenseManager.GeneratePermanentKey(hwid);
                Console.WriteLine(key);
                File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "keygen_output.txt"), key);
                Application.Current.Shutdown();
                return;
            }

            // Show HWID on activation screen & keygen input
            string localHwid = LicenseManager.GetHWID();
            lblHwid.Text = localHwid;
            txtKeygenHwid.Text = localHwid;

            // Start Discord local IPC integration
            InitDiscord();

            // Validate license
            var licInfo = LicenseManager.Validate();
            if (licInfo.Status == LicenseStatus.Valid)
            {
                ShowMainPanel(licInfo);
            }
            else
            {
                gridActivation.Visibility = Visibility.Visible;
                gridMain.Visibility = Visibility.Collapsed;
            }

            // Admin mode: only visible if admin.key exists or launched with --admin
            bool isAdmin = args.Any(a => a.Equals("--admin", StringComparison.OrdinalIgnoreCase))
                || File.Exists(Path.Combine(_rootDir, "admin.key"))
                || File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "admin.key"));

            if (isAdmin)
            {
                navKeygenHighlight.Visibility = Visibility.Visible;
            }

            // Monitor timer for CS2, server, tunnel, kernel
            _monitorTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1.5) };
            _monitorTimer.Tick += (s, e) => UpdateTelemetry();
            _monitorTimer.Start();
        }

        // Secret shortcut: Ctrl + Shift + K unlocks Keygen in any build
        private void Window_KeyDown(object sender, KeyEventArgs e)
        {
            if ((Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == (ModifierKeys.Control | ModifierKeys.Shift) && e.Key == Key.K)
            {
                navKeygenHighlight.Visibility = Visibility.Visible;
                NavKeygen_Click(this, new RoutedEventArgs());
                AppendLog("[ADMIN] Modo Gestor de Licenças desbloqueado por atalho secreto (Ctrl+Shift+K).");
            }
        }

        // ─── Discord Integration ──────────────────────────────────────────────

        private void InitDiscord()
        {
            DiscordService.UserLoaded += (user) =>
            {
                Dispatcher.Invoke(() =>
                {
                    txtDiscordName.Text = user.DisplayName;
                    txtDiscordTag.Text = $"@{user.Username}";
                    cardTxtDiscordName.Text = $"{user.DisplayName} (@{user.Username})";
                    cardTxtDiscordTag.Text = "Discord Conectado";

                    if (user.AvatarBitmap != null)
                    {
                        imgDiscordAvatar.ImageSource = user.AvatarBitmap;
                        cardImgDiscordAvatar.ImageSource = user.AvatarBitmap;
                    }
                });
            };

            _ = DiscordService.StartAsync();
        }

        private void DiscordProfile_Click(object sender, MouseButtonEventArgs e)
        {
            BtnDiscord_Click(sender, e);
        }

        // ─── License / Activation ─────────────────────────────────────────────

        private void ShowMainPanel(LicenseInfo info)
        {
            gridActivation.Visibility = Visibility.Collapsed;
            gridMain.Visibility = Visibility.Visible;

            var typeText = info.IsPermanent ? "PERMANENTE" : "TEMPORÁRIA";
            var expiryText = info.IsPermanent ? "LIFETIME (∞)" : info.DaysLeft ?? "—";

            lblLicenseType.Text = typeText;
            lblLicenseExpiry.Text = expiryText;
            lblSessionLicType.Text = typeText;
            lblSessionExpiry.Text = expiryText;

            AppendLog("[SYSTEM] CS2 Web Radar Command Center iniciado.");
            AppendLog($"[PATH] Root: {_rootDir}");
            AppendLog($"[LICENSE] {typeText} — {expiryText}");

            UpdateTelemetry();
        }

        private void BtnActivate_Click(object sender, RoutedEventArgs e)
        {
            var key = txtLicenseKey.Text.Trim();
            if (string.IsNullOrEmpty(key))
            {
                lblActivationError.Text = "Introduz a tua license key.";
                return;
            }

            var info = LicenseManager.ValidateKey(key);
            switch (info.Status)
            {
                case LicenseStatus.Valid:
                    LicenseManager.SaveKey(key);
                    lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(16, 185, 129));
                    lblActivationError.Text = "Licença válida! A carregar...";
                    Task.Delay(500).ContinueWith(_ =>
                        Dispatcher.Invoke(() => ShowMainPanel(info)));
                    break;
                case LicenseStatus.Expired:
                    lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(239, 68, 68));
                    lblActivationError.Text = "Esta licença temporária expirou. Fala com o suporte no Discord.";
                    break;
                case LicenseStatus.Invalid:
                    lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(239, 68, 68));
                    lblActivationError.Text = "Key inválida para este computador (HWID incorreto).";
                    break;
            }
        }

        private void LicenseKey_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Return) BtnActivate_Click(sender, e);
        }

        private void BtnCopyHwid_Click(object sender, RoutedEventArgs e)
        {
            try { Clipboard.SetText(lblHwid.Text); } catch { }
        }

        // ─── Keygen Tool (Built-in Admin Generator) ───────────────────────────

        private void RbKeyType_Changed(object sender, RoutedEventArgs e)
        {
            if (panelTempOptions != null)
            {
                panelTempOptions.Visibility = (rbTemp.IsChecked == true)
                    ? Visibility.Visible
                    : Visibility.Collapsed;
            }
        }

        private void BtnKeygenUseLocalHwid_Click(object sender, RoutedEventArgs e)
        {
            txtKeygenHwid.Text = LicenseManager.GetHWID();
        }

        private void BtnGenerateKey_Click(object sender, RoutedEventArgs e)
        {
            string hwid = txtKeygenHwid.Text.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(hwid) || hwid.Length < 8)
            {
                MessageBox.Show("Introduz um HWID válido (mínimo 8 caracteres).", "HWID Inválido",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            string key;
            if (rbPerm.IsChecked == true)
            {
                key = LicenseManager.GeneratePermanentKey(hwid);
            }
            else
            {
                int days = comboDays.SelectedIndex switch
                {
                    0 => 1,
                    1 => 7,
                    2 => 15,
                    3 => 30,
                    4 => 90,
                    5 => 365,
                    _ => 30
                };
                key = LicenseManager.GenerateTemporaryKey(hwid, days);
            }

            txtGeneratedKey.Text = key;
            AppendLog($"[KEYGEN] Chave gerada para HWID {hwid}: {key}");
        }

        private void BtnCopyGeneratedKey_Click(object sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrEmpty(txtGeneratedKey.Text))
            {
                try
                {
                    Clipboard.SetText(txtGeneratedKey.Text);
                    AppendLog("[KEYGEN] Chave copiada para a área de transferência!");
                }
                catch { }
            }
        }

        // ─── Navigation ───────────────────────────────────────────────────────

        private void NavRadar_Click(object sender, RoutedEventArgs e)
        {
            panelRadar.Visibility = Visibility.Visible;
            panelKeygen.Visibility = Visibility.Collapsed;
            panelChangelogs.Visibility = Visibility.Collapsed;

            navRadarHighlight.Background = new SolidColorBrush(Color.FromRgb(16, 24, 36));
            navKeygenHighlight.Background = Brushes.Transparent;
            navChangelogsHighlight.Background = Brushes.Transparent;
        }

        private void NavKeygen_Click(object sender, RoutedEventArgs e)
        {
            panelRadar.Visibility = Visibility.Collapsed;
            panelKeygen.Visibility = Visibility.Visible;
            panelChangelogs.Visibility = Visibility.Collapsed;

            navRadarHighlight.Background = Brushes.Transparent;
            navKeygenHighlight.Background = new SolidColorBrush(Color.FromRgb(16, 24, 36));
            navChangelogsHighlight.Background = Brushes.Transparent;
        }

        private void NavChangelogs_Click(object sender, RoutedEventArgs e)
        {
            panelRadar.Visibility = Visibility.Collapsed;
            panelKeygen.Visibility = Visibility.Collapsed;
            panelChangelogs.Visibility = Visibility.Visible;

            navRadarHighlight.Background = Brushes.Transparent;
            navKeygenHighlight.Background = Brushes.Transparent;
            navChangelogsHighlight.Background = new SolidColorBrush(Color.FromRgb(16, 24, 36));
        }

        // ─── Title Bar ────────────────────────────────────────────────────────

        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }

        private void Minimize_Click(object sender, RoutedEventArgs e) =>
            WindowState = WindowState.Minimized;

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            StopAll();
            DiscordService.Disconnect();
            Application.Current.Shutdown();
        }

        // ─── Logging ──────────────────────────────────────────────────────────

        private void AppendLog(string message)
        {
            Dispatcher.Invoke(() =>
            {
                var ts = DateTime.Now.ToString("HH:mm:ss");
                txtLogs.AppendText($"[{ts}] {message}\n");
                logScroll.ScrollToEnd();
            });
        }

        private void BtnClearLogs_Click(object sender, RoutedEventArgs e) =>
            txtLogs.Clear();

        // ─── Process Helpers ──────────────────────────────────────────────────

        private bool IsKernelDriverActive()
        {
            try
            {
                var h = CreateFile(@"\\.\CS2Radar", GENERIC_READ | GENERIC_WRITE,
                    0, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                if (h != IntPtr.Zero && h.ToInt64() != -1) { CloseHandle(h); return true; }
            }
            catch { }
            return false;
        }

        private bool IsProcessRunning(string name) =>
            Process.GetProcessesByName(name).Length > 0;

        // ─── Telemetry ────────────────────────────────────────────────────────

        private void UpdateTelemetry()
        {
            bool cs2 = IsProcessRunning("cs2");
            bool server = _serverProcess != null && !_serverProcess.HasExited;
            bool tunnel = _tunnelProcess != null && !_tunnelProcess.HasExited;
            bool driver = IsKernelDriverActive();

            // CS2 dots
            SetDot(dotCs2, cs2);
            lblCs2Status.Text = cs2 ? "A CORRER" : "NÃO DETECTADO";
            lblCs2Status.Foreground = new SolidColorBrush(cs2
                ? Color.FromRgb(52, 211, 153) : Color.FromRgb(100, 116, 139));
            lblCs2Sub.Text = cs2 ? "ONLINE" : "OFFLINE";
            lblCs2Sub.Foreground = lblCs2Status.Foreground;

            // Server dot
            SetDot(dotServer, server);
            lblServerStatus.Text = server ? $"LIVE :{_serverPort}" : "PARADO";
            lblServerStatus.Foreground = new SolidColorBrush(server
                ? Color.FromRgb(52, 211, 153) : Color.FromRgb(100, 116, 139));

            // Tunnel dot
            bool tunnelOnline = !string.IsNullOrEmpty(_publicUrl);
            SetDot(dotTunnel, tunnelOnline);
            lblTunnelStatus.Text = tunnelOnline ? "ONLINE" : (tunnel ? "A INICIAR..." : "INATIVO");
            lblTunnelStatus.Foreground = new SolidColorBrush(tunnelOnline
                ? Color.FromRgb(52, 211, 153) : Color.FromRgb(100, 116, 139));

            // Kernel dot
            SetDot(dotKernel, driver, Color.FromRgb(56, 189, 248));
            lblKernelStatus.Text = driver ? "RING 0 ATIVO" : "STANDBY";
            lblKernelStatus.Foreground = new SolidColorBrush(driver
                ? Color.FromRgb(56, 189, 248) : Color.FromRgb(100, 116, 139));

            // Big status banner
            lblBigStatus.Text = _isRunning ? (cs2 ? "ONLINE" : "A AGUARDAR CS2") : "OFFLINE";
            lblBigStatus.Foreground = new SolidColorBrush(_isRunning
                ? (cs2 ? Color.FromRgb(16, 185, 129) : Color.FromRgb(234, 179, 8))
                : Color.FromRgb(239, 68, 68));
            statusDot.Fill = lblBigStatus.Foreground;
            statusGlow.Color = _isRunning
                ? (cs2 ? Color.FromRgb(16, 185, 129) : Color.FromRgb(234, 179, 8))
                : Color.FromRgb(239, 68, 68);

            lblBigStatusSub.Text = _isRunning
                ? (cs2 ? "Radar activo — liga o browser!" : "A aguardar que o CS2 abra...")
                : "Radar não está activo";

            lblSessionStatus.Text = _isRunning ? "ATIVO" : "INATIVO";
            lblSessionStatus.Foreground = new SolidColorBrush(_isRunning
                ? Color.FromRgb(16, 185, 129) : Color.FromRgb(239, 68, 68));
        }

        private static void SetDot(System.Windows.Shapes.Ellipse dot, bool active,
            Color? activeColor = null)
        {
            dot.Fill = new SolidColorBrush(active
                ? (activeColor ?? Color.FromRgb(16, 185, 129))
                : Color.FromRgb(51, 65, 85));
        }

        // ─── Start / Stop ─────────────────────────────────────────────────────

        private async void BtnMaster_Click(object sender, RoutedEventArgs e)
        {
            if (_isRunning) StopAll();
            else await StartAllAsync();
        }

        private async Task StartAllAsync()
        {
            _isRunning = true;
            btnStart.Style = (Style)FindResource("StopBtn");
            txtMasterBtn.Text = "STOP";
            txtMasterBtnIcon.Text = "■";

            AppendLog("[1/4] A verificar kernel driver...");
            if (IsKernelDriverActive())
                AppendLog("  [OK] Ring 0 driver detectado.");
            else
                AppendLog("  [INFO] Kernel inativo — a usar modo usermode.");

            // Web server
            AppendLog("[2/4] A iniciar web server...");
            try
            {
                var script = Path.Combine(_rootDir, "webapp", "ws", "app.js");
                var psi = new ProcessStartInfo
                {
                    FileName = _nodeExe,
                    Arguments = $"\"{script}\"",
                    WorkingDirectory = Path.Combine(_rootDir, "webapp"),
                    CreateNoWindow = true, UseShellExecute = false,
                    RedirectStandardOutput = true, RedirectStandardError = true
                };
                _serverProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
                _serverProcess.OutputDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[WEB] {ev.Data}"); };
                _serverProcess.ErrorDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[WEB] {ev.Data}"); };
                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();
                AppendLog("  [OK] Web server iniciado.");
            }
            catch (Exception ex) { AppendLog($"  [ERRO] Web server: {ex.Message}"); }

            // Cloudflare tunnel
            AppendLog("[3/4] A iniciar túnel Cloudflare...");
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = _cloudflaredExe,
                    Arguments = $"tunnel --url http://localhost:{_serverPort}",
                    CreateNoWindow = true, UseShellExecute = false,
                    RedirectStandardOutput = true, RedirectStandardError = true
                };
                _tunnelProcess = new Process { StartInfo = psi };
                _tunnelProcess.ErrorDataReceived += (s, ev) =>
                {
                    if (string.IsNullOrEmpty(ev.Data)) return;
                    var m = Regex.Match(ev.Data, @"https://[a-zA-Z0-9-]+\.trycloudflare\.com");
                    if (m.Success && string.IsNullOrEmpty(_publicUrl))
                    {
                        _publicUrl = m.Value;
                        Dispatcher.Invoke(() =>
                        {
                            txtPublicUrl.Text = _publicUrl;
                            AppendLog($"  [LINK PÚBLICO] {_publicUrl}");
                            try { Clipboard.SetText(_publicUrl); AppendLog("  [OK] Link copiado para a área de transferência!"); } catch { }
                        });
                    }
                };
                _tunnelProcess.Start();
                _tunnelProcess.BeginErrorReadLine();
            }
            catch (Exception ex) { AppendLog($"  [AVISO] Cloudflare: {ex.Message}"); }

            // Memory reader
            AppendLog("[4/4] A aguardar CS2...");
            _ = Task.Run(async () =>
            {
                while (_isRunning && !IsProcessRunning("cs2"))
                {
                    AppendLog("  [WAIT] CS2 não detectado. A aguardar...");
                    await Task.Delay(3000);
                }
                if (!_isRunning) return;

                AppendLog("  [OK] CS2 detectado! A iniciar leitor de memória...");
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = _usermodeExe,
                        WorkingDirectory = Path.GetDirectoryName(_usermodeExe)!,
                        CreateNoWindow = true, UseShellExecute = false,
                        RedirectStandardOutput = true, RedirectStandardError = true
                    };
                    _usermodeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
                    _usermodeProcess.OutputDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[ENGINE] {ev.Data}"); };
                    _usermodeProcess.ErrorDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[ENGINE] {ev.Data}"); };
                    _usermodeProcess.Start();
                    _usermodeProcess.BeginOutputReadLine();
                    _usermodeProcess.BeginErrorReadLine();
                }
                catch (Exception ex) { AppendLog($"  [ERRO] Leitor de memória: {ex.Message}"); }
            });
        }

        private void StopAll()
        {
            _isRunning = false;
            btnStart.Style = (Style)FindResource("PrimaryBtn");
            txtMasterBtn.Text = "START";
            txtMasterBtnIcon.Text = "▶";
            _publicUrl = "";
            txtPublicUrl.Text = "A aguardar início do radar...";

            AppendLog("[STOP] A terminar processos...");

            foreach (var p in new[] { _usermodeProcess, _serverProcess, _tunnelProcess })
            {
                try { if (p != null && !p.HasExited) { p.Kill(); p.Dispose(); } } catch { }
            }
            _usermodeProcess = null;
            _serverProcess = null;
            _tunnelProcess = null;

            AppendLog("[OK] Todos os processos terminados.");
            UpdateTelemetry();
        }

        // ─── Browser / Overlay / Copy / Discord ───────────────────────────────

        private void BtnOpenBrowser_Click(object sender, RoutedEventArgs e)
        {
            var url = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            try
            {
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
                AppendLog($"[BROWSER] Aberto: {url}");
            }
            catch (Exception ex) { AppendLog($"[ERRO] Browser: {ex.Message}"); }
        }

        private void BtnOpenOverlay_Click(object sender, RoutedEventArgs e)
        {
            var baseUrl = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            var overlayUrl = $"{baseUrl}?overlay=1";
            AppendLog($"[OVERLAY] A abrir HUD em {overlayUrl}...");
            try
            {
                var candidates = new[]
                {
                    @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                    @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                    @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                    @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
                };
                string? exe = candidates.FirstOrDefault(File.Exists);
                if (!string.IsNullOrEmpty(exe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exe,
                        Arguments = $"--app=\"{overlayUrl}\" --window-size=680,680",
                        UseShellExecute = false
                    });
                    AppendLog($"  [OK] Overlay lançado ({System.IO.Path.GetFileName(exe)}).");
                }
                else
                {
                    Process.Start(new ProcessStartInfo { FileName = overlayUrl, UseShellExecute = true });
                }
            }
            catch (Exception ex) { AppendLog($"  [ERRO] Overlay: {ex.Message}"); }
        }

        private void BtnCopyLink_Click(object sender, RoutedEventArgs e)
        {
            var url = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            try { Clipboard.SetText(url); AppendLog($"[CLIPBOARD] Copiado: {url}"); }
            catch (Exception ex) { AppendLog($"[ERRO] Clipboard: {ex.Message}"); }
        }

        private void BtnDiscord_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = DiscordInvite, UseShellExecute = true });
                AppendLog("[DISCORD] A abrir servidor Discord...");
            }
            catch (Exception ex) { AppendLog($"[ERRO] Discord: {ex.Message}"); }
        }
    }
}