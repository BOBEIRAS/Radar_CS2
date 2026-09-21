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
        private bool _isAdmin = false;
        private string _publicUrl = "";
        private readonly string _serverPort = "22006";
        
        private const string DiscordInvite = "https://discord.gg/VqchRYRDpu";

        // Link do botão "Get a Key" no Rich Presence. Por agora abre o teu servidor;
        // podes trocar por o link de um canal específico, ex.: https://discord.com/channels/SERVER_ID/CANAL_ID
        private const string BuyKeyUrl = "https://discord.gg/VqchRYRDpu";

        // Mapas que têm imagem carregada no Developer Portal (Rich Presence > Art Assets).
        private static readonly System.Collections.Generic.HashSet<string> MapImages = new(StringComparer.OrdinalIgnoreCase)
        {
            "de_ancient", "ancient",
            "de_anubis", "anubis",
            "de_dust2", "dust2",
            "de_inferno", "inferno",
            "de_mirage", "mirage",
            "de_nuke", "nuke",
            "de_overpass", "overpass",
            "de_vertigo", "vertigo",
            "de_train", "train",
            "cs_office", "office",
            "cs_italy", "italy",
            "de_thera", "thera",
            "de_mills", "mills",
            "de_edin", "edin"
        };

        // Rich Presence
        private readonly long _launcherStartTs = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        private long? _radarStartTs;

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr CreateFile(
            string lpFileName, uint dwDesiredAccess, uint dwShareMode,
            IntPtr lpSecurityAttributes, uint dwCreationDisposition,
            uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_SHOWWINDOW = 0x0040;

        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint OPEN_EXISTING = 3;

        // ─── Constructor ──────────────────────────────────────────────────────

        public MainWindow()
        {
            InitializeComponent();
            KillOrphanProcesses();

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
            
            var usermodeCandidates = new[]
            {
                Path.Combine(_rootDir, "usermode", "release", "usermode.exe"),
                Path.Combine(_rootDir, "release", "usermode.exe"),
                Path.Combine(_rootDir, "usermode.exe"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "usermode", "release", "usermode.exe"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "release", "usermode.exe"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "usermode.exe")
            };
            _usermodeExe = usermodeCandidates.FirstOrDefault(File.Exists) ?? Path.Combine(_rootDir, "usermode", "release", "usermode.exe");

            // CLI keygenerator mode: CS2WebRadar.exe --keygen <hwid> [days]
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
            txtHwid.Text = localHwid;
            txtKeygenHwid.Text = localHwid;

            // Start Discord local IPC integration
            InitDiscord();
            _ = DiscordService.InitializeAsync();

            // Game State Integration: o CS2 diz-nos o mapa atual
            GsiService.MapChanged += m =>
            {
                AppendLog(m == null ? "[GSI] No map (menu)" : $"[GSI] Map: {m}");
                Dispatcher.Invoke(() => UpdateDiscordPresence(IsProcessRunning("cs2")));
            };
            AppendLog("[GSI] " + GsiService.InstallConfig());
            var gsiError = GsiService.Start();
            if (gsiError != null) AppendLog("[GSI] " + gsiError);

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
            _isAdmin = args.Any(a => a.Equals("--admin", StringComparison.OrdinalIgnoreCase))
                || File.Exists(Path.Combine(_rootDir, "admin.key"))
                || File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "admin.key"));

            if (_isAdmin)
            {
                navKeygenHighlight.Visibility = Visibility.Visible;
            }

            // Monitor timer for CS2, server, tunnel, kernel
            _monitorTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1.5) };
            _monitorTimer.Tick += (s, e) => UpdateTelemetry();
            _monitorTimer.Start();
        }

        // Secret shortcut: Ctrl + Shift + K — only works if admin.key is present
        private void Window_KeyDown(object sender, KeyEventArgs e)
        {
            if (_isAdmin &&
                (Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == (ModifierKeys.Control | ModifierKeys.Shift) &&
                e.Key == Key.K)
            {
                navKeygenHighlight.Visibility = Visibility.Visible;
                NavKeygen_Click(this, new RoutedEventArgs());
                AppendLog("[ADMIN] Keygen unlocked.");
            }
        }

        // ─── Discord Integration ──────────────────────────────────────────────

        
        private void InitDiscord()
        {
            // Apenas registamos o evento uma única vez
            DiscordService.UserLoaded += (user) =>
            {
                Dispatcher.Invoke(() =>
                {
                    txtDiscordName.Text = user.DisplayName;
                    txtDiscordTag.Text = $"@{user.Username}";
                    cardTxtDiscordName.Text = $"{user.DisplayName} (@{user.Username})";
                    cardTxtDiscordTag.Text = "Connected to Discord";

                    if (user.AvatarBitmap != null)
                    {
                        imgDiscordAvatar.ImageSource = user.AvatarBitmap;
                        cardImgDiscordAvatar.ImageSource = user.AvatarBitmap;
                    }
                });
            };

            // Caso o utilizador já tenha sido carregado antes da subscrição
            var existing = DiscordService.CurrentUser;
            if (existing != null)
            {
                txtDiscordName.Text = existing.DisplayName;
                txtDiscordTag.Text = $"@{existing.Username}";
                cardTxtDiscordName.Text = $"{existing.DisplayName} (@{existing.Username})";
                cardTxtDiscordTag.Text = "Connected to Discord";
                if (existing.AvatarBitmap != null)
                {
                    imgDiscordAvatar.ImageSource = existing.AvatarBitmap;
                    cardImgDiscordAvatar.ImageSource = existing.AvatarBitmap;
                }
            }
        }

        // Atualiza o Rich Presence conforme o estado do radar (só envia se mudar)
        private void UpdateDiscordPresence(bool cs2)
        {
            if (_isRunning && _radarStartTs == null)
                _radarStartTs = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            else if (!_isRunning)
                _radarStartTs = null;

            // Mapa atual (só se o CS2 estiver aberto)
            string? map = cs2 ? GsiService.CurrentMap : null;
            string mapName = map != null ? GsiService.FriendlyName(map) : "";

            string state;
            if (map != null)
                state = _isRunning ? $"Active Session - {mapName}" : $"Playing {mapName}";
            else
                state = !_isRunning
                    ? "Idle - Radar not active"
                    : (cs2 ? "Active Session - Undetected" : "Waiting for CS2...");

            // Imagem do mapa (suporta com prefixo ex: de_dust2 ou limpo ex: dust2)
            string? mapImageKey = null;
            if (map != null)
            {
                if (MapImages.Contains(map))
                    mapImageKey = map;
                else
                {
                    var clean = map.Replace("de_", "").Replace("cs_", "").Replace("ar_", "");
                    if (MapImages.Contains(clean))
                        mapImageKey = clean;
                }
            }
            bool hasMapImage = mapImageKey != null;

            DiscordService.UpdatePresence(new DiscordPresence
            {
                Details = "CS2 Web Radar",
                State = state,
                StartTimestamp = _radarStartTs ?? _launcherStartTs,
                LargeImageKey = hasMapImage ? mapImageKey! : "radar_logo",
                LargeImageText = map != null ? mapName : "CS2 Web Radar",
                SmallImageKey = hasMapImage ? "radar_logo" : null,
                SmallImageText = hasMapImage ? "CS2 Web Radar" : null,
                Button1Label = "Join Discord",
                Button1Url = DiscordInvite,
                Button2Label = "Get a Key",
                Button2Url = BuyKeyUrl
            });
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

            var typeText = info.IsPermanent ? "PERMANENT" : "TEMPORARY";
            var expiryText = info.IsPermanent ? "LIFETIME (∞)" : info.DaysLeft ?? "—";

            lblLicenseType.Text = typeText;
            lblLicenseExpiry.Text = expiryText;
            lblSessionLicType.Text = typeText;
            lblSessionExpiry.Text = expiryText;

            AppendLog("[SYSTEM] CS2 Web Radar Command Center initialized.");
            AppendLog($"[PATH] Root: {_rootDir}");
            AppendLog($"[LICENSE] {typeText} — {expiryText}");

            UpdateTelemetry();
        }

        private void BtnActivate_Click(object sender, RoutedEventArgs e)
        {
            var key = txtLicenseKey.Text.Trim();
            if (string.IsNullOrEmpty(key))
            {
                lblActivationError.Text = "Insert your license key.";
                return;
            }

            var info = LicenseManager.ValidateKey(key);
            switch (info.Status)
            {
                case LicenseStatus.Valid:
                    LicenseManager.SaveKey(key);
                    lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(255, 255, 255));
                    lblActivationError.Text = "Valid license! Loading...";
                    Task.Delay(500).ContinueWith(_ =>
                        Dispatcher.Invoke(() => ShowMainPanel(info)));
                    break;
                case LicenseStatus.Expired:
                    lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(150, 150, 150));
                    lblActivationError.Text = "This temporary license has expired. Please contact support on Discord.";
                    break;
                case LicenseStatus.Invalid:
                    lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(150, 150, 150));
                    lblActivationError.Text = "Invalid key for this computer (incorrect HWID).";
                    break;
            }
        }

        private void LicenseKey_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Return) BtnActivate_Click(sender, e);
        }

        private void BtnCopyHwid_Click(object sender, RoutedEventArgs e)
        {
            try { Clipboard.SetText(txtHwid.Text); } catch { }
        }

        private void BtnResetLicense_Click(object sender, RoutedEventArgs e)
        {
            LicenseManager.ResetLicense();
            txtLicenseKey.Text = "";
            lblActivationError.Foreground = new SolidColorBrush(Color.FromRgb(255, 255, 255));
            lblActivationError.Text = "License and key cache reset successfully! You can now enter a new key.";
            gridMain.Visibility = Visibility.Collapsed;
            gridActivation.Visibility = Visibility.Visible;
            AppendLog("[LICENSE] License and key cache reset successfully.");
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
                MessageBox.Show("Insert a valid HWID (minimum 8 characters).", "Invalid HWID",
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
            AppendLog($"[KEYGEN] Key generated for HWID {hwid}: {key}");
        }

        private void BtnCopyGeneratedKey_Click(object sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrEmpty(txtGeneratedKey.Text))
            {
                try
                {
                    Clipboard.SetText(txtGeneratedKey.Text);
                    AppendLog("[KEYGEN] Key copied to clipboard!");
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

            navRadarHighlight.Background = new SolidColorBrush(Color.FromRgb(40, 40, 40));
            navKeygenHighlight.Background = Brushes.Transparent;
            navChangelogsHighlight.Background = Brushes.Transparent;
        }

        private void NavKeygen_Click(object sender, RoutedEventArgs e)
        {
            if (!_isAdmin) return;

            panelRadar.Visibility = Visibility.Collapsed;
            panelKeygen.Visibility = Visibility.Visible;
            panelChangelogs.Visibility = Visibility.Collapsed;

            navRadarHighlight.Background = Brushes.Transparent;
            navKeygenHighlight.Background = new SolidColorBrush(Color.FromRgb(40, 40, 40));
            navChangelogsHighlight.Background = Brushes.Transparent;
        }

        private void NavChangelogs_Click(object sender, RoutedEventArgs e)
        {
            panelRadar.Visibility = Visibility.Collapsed;
            panelKeygen.Visibility = Visibility.Collapsed;
            panelChangelogs.Visibility = Visibility.Visible;

            navRadarHighlight.Background = Brushes.Transparent;
            navKeygenHighlight.Background = Brushes.Transparent;
            navChangelogsHighlight.Background = new SolidColorBrush(Color.FromRgb(40, 40, 40));
        }

        // ─── Title Bar ────────────────────────────────────────────────────────

        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed) DragMove();
        }

        private void Minimize_Click(object sender, RoutedEventArgs e) =>
            WindowState = WindowState.Minimized;

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            StopAll();
            DiscordService.Disconnect();
            Application.Current.Shutdown();
        }

        protected override void OnClosed(EventArgs e)
        {
            KillProcessesQuietly();
            GsiService.Stop();
            DiscordService.Disconnect();
            base.OnClosed(e);
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

        private static string GetDriverDevicePath()
        {
            // Must match RADAR_STR_KEY=0x5A and _radar_userdev_enc in driver_shared.hpp
            byte[] enc = { 0x06,0x06,0x74,0x06,0x09,0x2C,0x39,0x12,0x35,0x29,0x2E };
            var sb = new System.Text.StringBuilder(enc.Length);
            foreach (var b in enc) sb.Append((char)(b ^ 0x5A));
            return sb.ToString(); // "\\\\.\\SvcHost"
        }

        private bool IsKernelDriverActive()
        {
            try
            {
                var h = CreateFile(GetDriverDevicePath(), GENERIC_READ | GENERIC_WRITE,
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
            lblCs2Status.Text = cs2 ? "RUNNING" : "NOT DETECTED";
            lblCs2Status.Foreground = new SolidColorBrush(cs2
                ? Color.FromRgb(255, 255, 255) : Color.FromRgb(120, 120, 120));
            lblCs2Sub.Text = cs2 ? "ONLINE" : "OFFLINE";
            lblCs2Sub.Foreground = lblCs2Status.Foreground;

            // Server dot
            SetDot(dotServer, server);
            lblServerStatus.Text = server ? $"LIVE :{_serverPort}" : "STOPPED";
            lblServerStatus.Foreground = new SolidColorBrush(server
                ? Color.FromRgb(255, 255, 255) : Color.FromRgb(120, 120, 120));

            // Tunnel dot
            bool tunnelOnline = !string.IsNullOrEmpty(_publicUrl);
            SetDot(dotTunnel, tunnelOnline);
            lblTunnelStatus.Text = tunnelOnline ? "ONLINE" : (tunnel ? "STARTING..." : "INACTIVE");
            lblTunnelStatus.Foreground = new SolidColorBrush(tunnelOnline
                ? Color.FromRgb(255, 255, 255) : Color.FromRgb(120, 120, 120));

            // Kernel dot
            SetDot(dotKernel, driver, Color.FromRgb(200, 200, 200));
            lblKernelStatus.Text = driver ? "RING 0 ACTIVE" : "STANDBY";
            lblKernelStatus.Foreground = new SolidColorBrush(driver
                ? Color.FromRgb(255, 255, 255) : Color.FromRgb(120, 120, 120));

            // Protection shield card
            if (driver)
            {
                // Kernel active — full stealth
                borderProtection.Background  = new SolidColorBrush(Color.FromRgb(6, 16, 10));
                borderProtection.BorderBrush = new SolidColorBrush(Color.FromRgb(42, 106, 64));
                shieldIcon.Fill              = new SolidColorBrush(Color.FromRgb(26, 74, 40));
                shieldIcon.Stroke            = new SolidColorBrush(Color.FromRgb(74, 222, 128));
                lblProtectionHeader.Text     = "KERNEL PROTECTED";
                lblProtectionHeader.Foreground = new SolidColorBrush(Color.FromRgb(74, 222, 128));
                dotProtectionPulse.Fill      = new SolidColorBrush(Color.FromRgb(74, 222, 128));
                ((System.Windows.Media.Effects.DropShadowEffect)dotProtectionPulse.Effect).Color = Color.FromRgb(74, 222, 128);

                SetDot(dotProt1, true, Color.FromRgb(74, 222, 128));
                lblProt1.Text = "RING-0";  lblProt1.Foreground = new SolidColorBrush(Color.FromRgb(74, 222, 128));
                SetDot(dotProt2, true, Color.FromRgb(74, 222, 128));
                lblProt2.Text = "NONE";    lblProt2.Foreground = new SolidColorBrush(Color.FromRgb(74, 222, 128));
                SetDot(dotProt3, true, Color.FromRgb(74, 222, 128));
                lblProt3.Text = "CLEAR";   lblProt3.Foreground = new SolidColorBrush(Color.FromRgb(74, 222, 128));
            }
            else
            {
                // Fallback usermode — show warning state
                borderProtection.Background  = new SolidColorBrush(Color.FromRgb(12, 9, 6));
                borderProtection.BorderBrush = new SolidColorBrush(Color.FromRgb(40, 28, 14));
                shieldIcon.Fill              = new SolidColorBrush(Color.FromRgb(40, 28, 14));
                shieldIcon.Stroke            = new SolidColorBrush(Color.FromRgb(100, 70, 20));
                lblProtectionHeader.Text     = "USERMODE FALLBACK";
                lblProtectionHeader.Foreground = new SolidColorBrush(Color.FromRgb(180, 130, 40));
                dotProtectionPulse.Fill      = new SolidColorBrush(Color.FromRgb(180, 130, 40));
                ((System.Windows.Media.Effects.DropShadowEffect)dotProtectionPulse.Effect).Color = Color.FromRgb(180, 130, 40);

                SetDot(dotProt1, false);
                lblProt1.Text = "INACTIVE"; lblProt1.Foreground = new SolidColorBrush(Color.FromRgb(100, 100, 100));
                SetDot(dotProt2, false);
                lblProt2.Text = "EXPOSED";  lblProt2.Foreground = new SolidColorBrush(Color.FromRgb(180, 130, 40));
                SetDot(dotProt3, false);
                lblProt3.Text = "AT RISK";  lblProt3.Foreground = new SolidColorBrush(Color.FromRgb(180, 130, 40));
            }

            // Big status banner
            lblBigStatus.Text = _isRunning ? (cs2 ? "ONLINE" : "WAITING FOR CS2") : "OFFLINE";
            lblBigStatus.Foreground = new SolidColorBrush(_isRunning
                ? (cs2 ? Color.FromRgb(255, 255, 255) : Color.FromRgb(180, 180, 180))
                : Color.FromRgb(100, 100, 100));
            statusDot.Fill = lblBigStatus.Foreground;
            statusGlow.Color = _isRunning
                ? (cs2 ? Color.FromRgb(255, 255, 255) : Color.FromRgb(180, 180, 180))
                : Color.FromRgb(100, 100, 100);

            lblBigStatusSub.Text = _isRunning
                ? (cs2 ? "Radar active — open the browser!" : "Waiting for CS2 to open...")
                : "Radar is not active";

            lblSessionStatus.Text = _isRunning ? "ACTIVE" : "INACTIVE";
            lblSessionStatus.Foreground = new SolidColorBrush(_isRunning
                ? Color.FromRgb(255, 255, 255) : Color.FromRgb(100, 100, 100));

            UpdateDiscordPresence(cs2);
        }

        private static void SetDot(System.Windows.Shapes.Ellipse dot, bool active,
            Color? activeColor = null)
        {
            dot.Fill = new SolidColorBrush(active
                ? (activeColor ?? Color.FromRgb(255, 255, 255))
                : Color.FromRgb(60, 60, 60));
        }

        // ─── Start / Stop ─────────────────────────────────────────────────────

        private async void BtnMaster_Click(object sender, RoutedEventArgs e)
        {
            if (_isRunning) StopAll();
            else await StartAllAsync();
        }

        private async Task StartAllAsync()
        {
            KillOrphanProcesses();
            _isRunning = true;
            btnStart.Style = (Style)FindResource("StopBtn");
            txtMasterBtn.Text = "STOP";
            txtMasterBtnIcon.Text = "■";

            AppendLog("[1/4] Checking protection layer...");
            if (IsKernelDriverActive())
            {
                AppendLog("  [PROTECTED] Ring-0 kernel driver active. Memory access fully stealthed.");
                AppendLog("  [PROTECTED] No process handle on cs2.exe — VAC handle scan: CLEAR.");
            }
            else
                AppendLog("  [INFO] Kernel driver not loaded — using usermode fallback.");

            // Web server
            AppendLog("[2/4] Starting web server...");
            try
            {
                var wsDir = Path.Combine(_rootDir, "webapp", "ws");
                var script = Path.Combine(wsDir, "app.js");

                var nodeModules = Path.Combine(wsDir, "node_modules");
                if (!Directory.Exists(nodeModules))
                {
                    AppendLog("  [SETUP] Installing dependencies (first run)...");
                    var npmExe = Path.Combine(Path.GetDirectoryName(_nodeExe)!, "npm.cmd");
                    if (!File.Exists(npmExe)) npmExe = "npm";
                    var npmPsi = new ProcessStartInfo
                    {
                        FileName = npmExe,
                        Arguments = "install",
                        WorkingDirectory = wsDir,
                        CreateNoWindow = true, UseShellExecute = false,
                        RedirectStandardOutput = true, RedirectStandardError = true
                    };
                    using var npmProc = new Process { StartInfo = npmPsi };
                    npmProc.Start();
                    npmProc.WaitForExit(60000);
                    AppendLog(npmProc.ExitCode == 0
                        ? "  [OK] Dependencies installed."
                        : "  [AVISO] npm install failed — check Node.js installation.");
                }

                // Libertar a porta se sobrou um node.exe de uma execução anterior
                if (!await Task.Run(FreeServerPort))
                    throw new InvalidOperationException($"Port {_serverPort} is being used by another program.");

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
                _serverProcess.ErrorDataReceived += (s, ev) => { if (!string.IsNullOrEmpty(ev.Data)) AppendLog($"[WEB-ERR] {ev.Data}"); };
                _serverProcess.Exited += (s, ev) =>
                {
                    int code = -1;
                    try { code = _serverProcess?.ExitCode ?? -1; } catch { }
                    if (_isRunning)
                    {
                        AppendLog($"[WEB] Process ended unexpectedly (code {code}).");
                        Dispatcher.Invoke(UpdateTelemetry);
                    }
                };
                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();
                AppendLog("  [OK] Web server started.");
            }
            catch (Exception ex) { AppendLog($"  [ERROR] Web server: {ex.Message}"); }

            // Cloudflare tunnel
            AppendLog("[3/4] Starting Cloudflare tunnel...");
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
                            AppendLog($"  [PUBLIC URL] {_publicUrl}");
                            try { Clipboard.SetText(_publicUrl); AppendLog("  [OK] Link copied to clipboard!"); } catch { }
                        });
                    }
                };
                _tunnelProcess.Start();
                _tunnelProcess.BeginErrorReadLine();
            }
            catch (Exception ex) { AppendLog($"  [ERROR] Cloudflare: {ex.Message}"); }

            // Memory reader
            AppendLog("[4/4] Waiting for CS2...");
            _ = Task.Run(async () =>
            {
                bool waitLogged = false;
                while (_isRunning && !IsProcessRunning("cs2"))
                {
                    if (!waitLogged)
                    {
                        AppendLog("  [WAIT] CS2 not detected. Waiting for game to open...");
                        waitLogged = true;
                    }
                    await Task.Delay(2000);
                }
                if (!_isRunning) return;

                AppendLog("  [OK] CS2 detected! Starting memory reader...");
                PinOverlayTopmost();
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

        // Se a porta do servidor estiver ocupada por um node.exe órfão (ex.: parares o
        // launcher pelo botão Stop do Visual Studio), termina-o. Devolve false se a
        // porta estiver ocupada por outro programa que não devemos matar.
        private bool FreeServerPort()
        {
            if (!int.TryParse(_serverPort, out var port)) return true;

            try
            {
                var psi = new ProcessStartInfo("netstat", "-ano -p TCP")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true
                };
                using var netstat = Process.Start(psi);
                if (netstat == null) return true;
                string output = netstat.StandardOutput.ReadToEnd();
                netstat.WaitForExit(3000);

                // Linha de listener: TCP  0.0.0.0:22006  0.0.0.0:0  <estado>  <pid>
                // (não depende do idioma do Windows: ignora a coluna do estado)
                var pids = new System.Collections.Generic.HashSet<int>();
                foreach (var line in output.Split('\n'))
                {
                    var parts = line.Split(new[] { ' ', '\t', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 5 && parts[0] == "TCP"
                        && parts[1].EndsWith(":" + port) && parts[2].EndsWith(":0")
                        && int.TryParse(parts[parts.Length - 1], out var pid) && pid != Environment.ProcessId)
                    {
                        pids.Add(pid);
                    }
                }

                foreach (var pid in pids)
                {
                    try
                    {
                        using var other = Process.GetProcessById(pid);
                        if (other.ProcessName.Equals("node", StringComparison.OrdinalIgnoreCase))
                        {
                            AppendLog($"  [CLEANUP] Closing old node.exe (PID {pid}) that was using port {port}...");
                            other.Kill(true);
                            other.WaitForExit(3000);
                        }
                        else
                        {
                            AppendLog($"  [ERROR] Port {port} is in use by '{other.ProcessName}' (PID {pid}). Close it and try again.");
                            return false;
                        }
                    }
                    catch (ArgumentException) { /* já terminou */ }
                    catch (Exception ex)
                    {
                        AppendLog($"  [ERROR] Could not free port {port}: {ex.Message}");
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                AppendLog($"  [AVISO] Port check failed: {ex.Message}");
            }
            return true;
        }

        private static void KillOrphanProcesses()
        {
            try
            {
                foreach (var name in new[] { "usermode", "cloudflared" })
                {
                    foreach (var proc in Process.GetProcessesByName(name))
                    {
                        try
                        {
                            proc.Kill(true);
                            proc.WaitForExit(1000);
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        // Mata os processos filhos sem tocar na interface (usado ao fechar a janela)
        private void KillProcessesQuietly()
        {
            _isRunning = false;
            foreach (var p in new[] { _usermodeProcess, _serverProcess, _tunnelProcess })
            {
                try { if (p != null && !p.HasExited) p.Kill(true); } catch { }
            }
            KillOrphanProcesses();
        }

        private void StopAll()
        {
            _isRunning = false;
            btnStart.Style = (Style)FindResource("PrimaryBtn");
            txtMasterBtn.Text = "START";
            txtMasterBtnIcon.Text = "▶";
            _publicUrl = "";
            txtPublicUrl.Text = "Waiting for radar to start...";

            AppendLog("[STOP] Stopping processes...");

            foreach (var p in new[] { _usermodeProcess, _serverProcess, _tunnelProcess })
            {
                try { if (p != null && !p.HasExited) { p.Kill(true); p.Dispose(); } } catch { }
            }
            _usermodeProcess = null;
            _serverProcess = null;
            _tunnelProcess = null;

            KillOrphanProcesses();

            AppendLog("[OK] All processes terminated.");
            UpdateTelemetry();
        }

        // ─── Browser / Overlay / Copy / Discord ───────────────────────────────

        private void BtnOpenBrowser_Click(object sender, RoutedEventArgs e)
        {
            var url = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            try
            {
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
                AppendLog($"[BROWSER] Opened: {url}");
            }
            catch (Exception ex) { AppendLog($"[ERROR] Browser: {ex.Message}"); }
        }

        private void PinOverlayTopmost()
        {
            _ = Task.Run(async () =>
            {
                for (int attempt = 0; attempt < 25; attempt++)
                {
                    await Task.Delay(500);
                    bool pinned = false;
                    EnumWindows((hWnd, lParam) =>
                    {
                        if (!IsWindowVisible(hWnd)) return true;
                        var sb = new System.Text.StringBuilder(256);
                        GetWindowText(hWnd, sb, 256);
                        string title = sb.ToString();
                        if (title.Contains("CS2 Web Radar", StringComparison.OrdinalIgnoreCase) ||
                            title.Contains("CS2 WEBRADAR", StringComparison.OrdinalIgnoreCase) ||
                            title.Contains("22006", StringComparison.OrdinalIgnoreCase))
                        {
                            SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                            pinned = true;
                            return false;
                        }
                        return true;
                    }, IntPtr.Zero);

                    if (pinned)
                    {
                        AppendLog("  [OVERLAY] Janela fixada no topo (Always On Top)!");
                        AppendLog("  [DICA] No CS2, usa o modo 'Janela em ecrã inteiro' (Fullscreen Windowed) para o overlay ficar por cima!");
                        break;
                    }
                }
            });
        }

        private async void BtnOpenOverlay_Click(object sender, RoutedEventArgs e)
        {
            if (!_isRunning)
            {
                AppendLog("[OVERLAY] A iniciar radar primeiro...");
                await StartAllAsync();
                await Task.Delay(1200);
            }

            var baseUrl = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            var overlayUrl = $"{baseUrl}?overlay=1";
            AppendLog($"[OVERLAY] Opening HUD in {overlayUrl}...");
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
                    AppendLog($"  [OK] Overlay launched ({System.IO.Path.GetFileName(exe)}).");
                }
                else
                {
                    Process.Start(new ProcessStartInfo { FileName = overlayUrl, UseShellExecute = true });
                }

                PinOverlayTopmost();
            }
            catch (Exception ex) { AppendLog($"  [ERRO] Overlay: {ex.Message}"); }
        }

        private void BtnCopyLink_Click(object sender, RoutedEventArgs e)
        {
            var url = !string.IsNullOrEmpty(_publicUrl) ? _publicUrl : $"http://localhost:{_serverPort}";
            try { Clipboard.SetText(url); AppendLog($"[CLIPBOARD] Copied: {url}"); }
            catch (Exception ex) { AppendLog($"[ERROR] Clipboard: {ex.Message}"); }
        }

        private void BtnDiscord_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = DiscordInvite, UseShellExecute = true });
                AppendLog("[DISCORD] Opening Discord server...");
            }
            catch (Exception ex) { AppendLog($"[ERROR] Discord: {ex.Message}"); }
        }
    }
}