using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace launcher
{
    /// <summary>
    /// Game State Integration do CS2: o próprio jogo envia (por HTTP, só para este PC)
    /// o mapa em que estás. Só pedimos o mapa - nada de score, posições ou jogadores.
    /// </summary>
    public static class GsiService
    {
        public const int Port = 22007;
        private const string CfgFileName = "gamestate_integration_cs2webradar.cfg";

        // Sem dados há mais do que isto = CS2 fechado / menu (heartbeat rápido de 2s)
        private const long StaleAfterMs = 7000;

        private static HttpListener? _listener;
        private static CancellationTokenSource? _cts;
        private static long _lastPayloadTick;
        private static string? _currentMap;
        private static readonly object _lock = new();

        /// <summary>Nome do mapa em minúsculas (ex.: "de_mirage") ou null se estiveres no menu.</summary>
        public static string? CurrentMap
        {
            get
            {
                lock (_lock)
                {
                    if (_currentMap == null) return null;
                    return Environment.TickCount64 - _lastPayloadTick > StaleAfterMs ? null : _currentMap;
                }
            }
        }

        /// <summary>Disparado quando o mapa muda (null = saíste do jogo / menu).</summary>
        public static event Action<string?>? MapChanged;

        // ─── Arranque / paragem ───────────────────────────────────────────

        /// <summary>Devolve null se correu bem, ou a mensagem de erro.</summary>
        public static string? Start()
        {
            lock (_lock)
            {
                if (_listener != null) return null;
                try
                {
                    var listener = new HttpListener();
                    listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
                    listener.Start();

                    _listener = listener;
                    _cts = new CancellationTokenSource();
                    var token = _cts.Token;
                    _ = Task.Run(() => ListenAsync(listener, token));
                    return null;
                }
                catch (Exception ex)
                {
                    return $"Could not start listener on port {Port}: {ex.Message}";
                }
            }
        }

        public static void Stop()
        {
            lock (_lock)
            {
                try { _cts?.Cancel(); } catch { }
                try { _listener?.Close(); } catch { }
                _listener = null;
            }
        }

        // ─── Servidor local ───────────────────────────────────────────────

        private static async Task ListenAsync(HttpListener listener, CancellationToken ct)
        {
            while (!ct.IsCancellationRequested && listener.IsListening)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = await listener.GetContextAsync();
                }
                catch
                {
                    break; // listener fechado
                }

                _ = Task.Run(() => HandleAsync(ctx));
            }
        }

        private static async Task HandleAsync(HttpListenerContext ctx)
        {
            string body;
            try
            {
                using var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8);
                body = await reader.ReadToEndAsync();
            }
            catch
            {
                try { ctx.Response.Abort(); } catch { }
                return;
            }

            try
            {
                ctx.Response.StatusCode = 200;
                ctx.Response.Close();
            }
            catch { }

            ProcessPayload(body);
        }

        private static void ProcessPayload(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);

                string? map = null;
                if (doc.RootElement.TryGetProperty("map", out var m) && m.ValueKind == JsonValueKind.Object &&
                    m.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String)
                {
                    map = NormalizeMapName(n.GetString());
                }

                bool changed;
                lock (_lock)
                {
                    _lastPayloadTick = Environment.TickCount64;
                    changed = !string.Equals(_currentMap, map, StringComparison.Ordinal);
                    _currentMap = map;
                }

                if (changed) MapChanged?.Invoke(map);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[GSI] Invalid payload: {ex.Message}");
            }
        }

        /// <summary>"workshop/123/de_xxx" -> "de_xxx", tudo em minúsculas.</summary>
        private static string? NormalizeMapName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            var last = name.Substring(name.LastIndexOf('/') + 1).Trim().ToLowerInvariant();
            return last.Length == 0 ? null : last;
        }

        // ─── Nome bonito do mapa ──────────────────────────────────────────

        private static readonly Dictionary<string, string> FriendlyNames = new(StringComparer.OrdinalIgnoreCase)
        {
            ["de_ancient"] = "Ancient",
            ["de_anubis"] = "Anubis",
            ["de_dust2"] = "Dust II",
            ["de_inferno"] = "Inferno",
            ["de_mirage"] = "Mirage",
            ["de_nuke"] = "Nuke",
            ["de_overpass"] = "Overpass",
            ["de_train"] = "Train",
            ["de_vertigo"] = "Vertigo",
            ["de_cache"] = "Cache",
            ["de_office"] = "Office",
            ["de_italy"] = "Italy",
            ["de_jura"] = "Jura",
            ["de_grail"] = "Grail",
            ["de_edin"] = "Edin",
            ["cs_italy"] = "Italy",
            ["cs_office"] = "Office"
        };

        public static string FriendlyName(string map)
        {
            if (FriendlyNames.TryGetValue(map, out var friendly)) return friendly;

            // Desconhecido: tira o prefixo e põe em maiúsculas iniciais (de_my_map -> My Map)
            var s = Regex.Replace(map, "^(de|cs|ar|dz|gd)_", "", RegexOptions.IgnoreCase).Replace('_', ' ').Trim();
            if (s.Length == 0) return map;
            var words = s.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < words.Length; i++)
                words[i] = char.ToUpperInvariant(words[i][0]) + words[i].Substring(1);
            return string.Join(" ", words);
        }

        // ─── Instalar o .cfg na pasta do CS2 ──────────────────────────────

        /// <summary>Cria o ficheiro de configuração no CS2. Devolve uma mensagem para o log.</summary>
        public static string InstallConfig()
        {
            try
            {
                var cfgDir = FindCs2CfgDir();
                if (cfgDir == null)
                    return "CS2 folder not found - map detection unavailable (is CS2 installed via Steam?).";

                var path = Path.Combine(cfgDir, CfgFileName);
                var content = BuildConfig();

                if (File.Exists(path) && File.ReadAllText(path) == content)
                    return "Config already installed.";

                File.WriteAllText(path, content);
                return $"Config installed in {cfgDir}. Restart CS2 if it was already open.";
            }
            catch (UnauthorizedAccessException)
            {
                return "No permission to write the CS2 config. Run the launcher as administrator once.";
            }
            catch (Exception ex)
            {
                return $"Could not install config: {ex.Message}";
            }
        }

        private static string BuildConfig()
        {
            // Envio imediato do mapa e ronda (sem buffer/atraso) para o Discord atualizar instantaneamente.
            return string.Join("\r\n", new[]
            {
                "\"CS2WebRadar\"",
                "{",
                $"    \"uri\"       \"http://127.0.0.1:{Port}/\"",
                "    \"timeout\"   \"5.0\"",
                "    \"buffer\"    \"0.0\"",
                "    \"throttle\"  \"0.1\"",
                "    \"heartbeat\" \"2.0\"",
                "    \"data\"",
                "    {",
                "        \"provider\"  \"1\"",
                "        \"map\"       \"1\"",
                "        \"round\"     \"1\"",
                "    }",
                "}",
                ""
            });
        }

        private static string? FindCs2CfgDir()
        {
            // 1) Bibliotecas do Steam
            foreach (var lib in GetSteamLibraries())
            {
                var cfg = Path.Combine(lib, "steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg");
                if (Directory.Exists(cfg)) return cfg;
            }

            // 2) Se o CS2 estiver aberto, usa o caminho do processo (...\game\bin\win64\cs2.exe)
            try
            {
                foreach (var p in Process.GetProcessesByName("cs2"))
                {
                    var exe = p.MainModule?.FileName;
                    var dir = exe == null ? null : Path.GetDirectoryName(exe);
                    var game = dir == null ? null : new DirectoryInfo(dir).Parent?.Parent;
                    if (game == null) continue;

                    var cfg = Path.Combine(game.FullName, "csgo", "cfg");
                    if (Directory.Exists(cfg)) return cfg;
                }
            }
            catch { }

            return null;
        }

        private static List<string> GetSteamLibraries()
        {
            var libs = new List<string>();

            string? steam = null;
            try { steam = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) as string; }
            catch { }

            if (string.IsNullOrWhiteSpace(steam)) return libs;

            steam = steam.Replace('/', '\\');
            libs.Add(steam);

            try
            {
                var vdf = Path.Combine(steam, "steamapps", "libraryfolders.vdf");
                if (File.Exists(vdf))
                {
                    foreach (Match m in Regex.Matches(File.ReadAllText(vdf), "\"path\"\\s+\"([^\"]+)\""))
                        libs.Add(m.Groups[1].Value.Replace("\\\\", "\\"));
                }
            }
            catch { }

            return libs;
        }
    }
}
