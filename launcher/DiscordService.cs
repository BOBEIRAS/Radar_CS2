using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;

namespace launcher
{
    public class DiscordUser
    {
        public string Id { get; set; } = "";
        public string Username { get; set; } = "";
        public string GlobalName { get; set; } = "";
        public string AvatarHash { get; set; } = "";
        public string DisplayName => !string.IsNullOrWhiteSpace(GlobalName) ? GlobalName : Username;
        public string AvatarUrl => !string.IsNullOrWhiteSpace(AvatarHash)
            ? $"https://cdn.discordapp.com/avatars/{Id}/{AvatarHash}.png?size=128"
            : "https://cdn.discordapp.com/embed/avatars/0.png";
        public BitmapImage? AvatarBitmap { get; set; }
    }

    /// <summary>Descrição do que aparece no perfil do Discord.</summary>
    public sealed record DiscordPresence
    {
        public string Details { get; init; } = "CS2 Web Radar";
        public string State { get; init; } = "";

        /// <summary>Unix timestamp (segundos) do "elapsed". Se null usa o momento em que o launcher abriu.</summary>
        public long? StartTimestamp { get; init; }

        // Chaves têm de existir em Developer Portal > Rich Presence > Art Assets
        public string LargeImageKey { get; init; } = "radar_logo";
        public string LargeImageText { get; init; } = "W3B_L4MA";
        public string? SmallImageKey { get; init; }
        public string? SmallImageText { get; init; }

        // Até 2 botões (não aparecem no teu próprio perfil, só para os outros)
        public string? Button1Label { get; init; }
        public string? Button1Url { get; init; }
        public string? Button2Label { get; init; }
        public string? Button2Url { get; init; }
    }

    /// <summary>Erro que não se resolve a tentar de novo (ex.: Client ID inválido).</summary>
    internal sealed class DiscordFatalException : Exception
    {
        public DiscordFatalException(string message) : base(message) { }
    }

    /// <summary>
    /// Discord Rich Presence via IPC (named pipe discord-ipc-0..9).
    /// Corre em background, reconecta sozinho, responde a PING e só envia quando a presença muda.
    /// </summary>
    public static class DiscordService
    {
        private const string ClientId = "1551282080330027098";

        private const int OpHandshake = 0;
        private const int OpFrame = 1;
        private const int OpClose = 2;
        private const int OpPing = 3;
        private const int OpPong = 4;

        private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };
        private static readonly object _lock = new();
        private static readonly SemaphoreSlim _writeLock = new(1, 1);
        private static readonly long _launcherStart = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        private static NamedPipeClientStream? _pipe;
        private static CancellationTokenSource? _cts;
        private static Task? _supervisor;
        private static volatile bool _isConnected;

        private static DiscordPresence _presence = new() { State = "Starting..." };
        private static DiscordPresence? _lastSent;

        public static DiscordUser? CurrentUser { get; private set; }
        public static event Action<DiscordUser>? UserLoaded;
        public static bool IsConnected => _isConnected;

        // ─── API pública ──────────────────────────────────────────────────

        /// <summary>Arranca o serviço em background. Pode ser chamado várias vezes sem problema.</summary>
        public static Task InitializeAsync()
        {
            lock (_lock)
            {
                if (_supervisor != null && !_supervisor.IsCompleted)
                    return Task.CompletedTask;

                _cts = new CancellationTokenSource();
                var token = _cts.Token;
                _supervisor = Task.Run(() => SupervisorAsync(token));
            }
            return Task.CompletedTask;
        }

        /// <summary>Atualiza a presença. Se for igual à anterior não faz nada.</summary>
        public static void UpdatePresence(DiscordPresence presence)
        {
            lock (_lock)
            {
                if (_presence.Equals(presence)) return;
                _presence = presence;
            }
            _ = Task.Run(() => SendPresenceAsync(CancellationToken.None));
        }

        /// <summary>Atalho: só muda details/state e mantém o resto.</summary>
        public static void UpdatePresence(string details, string state)
        {
            DiscordPresence current;
            lock (_lock) { current = _presence; }
            UpdatePresence(current with { Details = details, State = state });
        }

        /// <summary>Limpa a presença e fecha a ligação.</summary>
        public static void Disconnect()
        {
            try { Task.Run(ClearPresenceAsync).Wait(750); } catch { }

            lock (_lock)
            {
                try { _cts?.Cancel(); } catch { }
                _isConnected = false;
                try { _pipe?.Dispose(); } catch { }
                _pipe = null;
            }
        }

        // ─── Loop principal (reconecta sozinho) ───────────────────────────

        private static async Task SupervisorAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                NamedPipeClientStream? pipe = null;
                try
                {
                    pipe = await ConnectAnyPipeAsync(ct);
                    if (pipe == null)
                    {
                        Debug.WriteLine("[DISCORD] Discord não encontrado (está aberto?). Nova tentativa em 5s.");
                        await Task.Delay(5000, ct);
                        continue;
                    }

                    await RunSessionAsync(pipe, ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (DiscordFatalException fatal)
                {
                    Debug.WriteLine($"[DISCORD] ERRO FATAL: {fatal.Message} O Rich Presence foi desativado.");
                    break;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[DISCORD] Sessão terminou ({ex.GetType().Name}): {ex.Message}");
                }
                finally
                {
                    _isConnected = false;
                    lock (_lock)
                    {
                        if (ReferenceEquals(_pipe, pipe)) _pipe = null;
                    }
                    try { pipe?.Dispose(); } catch { }
                }

                try { await Task.Delay(3000, ct); }
                catch (OperationCanceledException) { break; }
            }
        }

        private static async Task<NamedPipeClientStream?> ConnectAnyPipeAsync(CancellationToken ct)
        {
            for (int i = 0; i < 10; i++)
            {
                ct.ThrowIfCancellationRequested();

                var pipe = new NamedPipeClientStream(".", $"discord-ipc-{i}", PipeDirection.InOut, PipeOptions.Asynchronous);
                try
                {
                    await pipe.ConnectAsync(500, ct);
                    Debug.WriteLine($"[DISCORD] Ligado ao discord-ipc-{i}");
                    return pipe;
                }
                catch (Exception) when (!ct.IsCancellationRequested)
                {
                    pipe.Dispose(); // pipe não existe ou timeout -> tenta o próximo
                }
                catch
                {
                    pipe.Dispose();
                    throw;
                }
            }
            return null;
        }

        private static async Task RunSessionAsync(NamedPipeClientStream pipe, CancellationToken ct)
        {
            lock (_lock) { _pipe = pipe; }

            // 1) Handshake
            var hello = JsonSerializer.Serialize(new { v = 1, client_id = ClientId });
            await WritePacketAsync(pipe, OpHandshake, hello, ct);

            // 2) Esperar READY (máx. 5s)
            string readyJson;
            using (var hsCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                hsCts.CancelAfter(5000);
                var (op, json) = await ReadPacketAsync(pipe, hsCts.Token);

                if (op != OpFrame || !json.Contains("READY"))
                {
                    // op 2 = Discord recusou o handshake
                    Debug.WriteLine($"[DISCORD] Handshake recusado (op={op}): {json}");

                    if (json.Contains("Invalid Client ID", StringComparison.OrdinalIgnoreCase) || json.Contains("\"code\":4000"))
                        throw new DiscordFatalException(
                            $"Client ID inválido ({ClientId}). Usa o 'Application ID' de uma aplicação que exista em " +
                            "https://discord.com/developers/applications (General Information).");

                    return;
                }
                readyJson = json;
            }

            Debug.WriteLine("[DISCORD] Handshake OK (READY recebido)");
            lock (_lock)
            {
                _lastSent = null; // nova sessão: forçar reenvio
                _isConnected = true;
            }

            // 3) Info do utilizador (não bloqueia a presença se falhar)
            _ = Task.Run(() => ParseReadyAsync(readyJson));

            // 4) Enviar presença atual
            await SendPresenceAsync(ct);

            // 5) Loop de leitura: responde a PING e regista erros
            while (!ct.IsCancellationRequested)
            {
                var (op, json) = await ReadPacketAsync(pipe, ct);
                switch (op)
                {
                    case OpPing:
                        await WritePacketAsync(pipe, OpPong, json, ct);
                        break;

                    case OpClose:
                        Debug.WriteLine($"[DISCORD] Discord fechou a ligação: {json}");
                        return;

                    case OpFrame:
                        if (json.Contains("\"evt\":\"ERROR\""))
                            Debug.WriteLine($"[DISCORD] Erro devolvido pelo Discord: {json}");
                        break;
                }
            }
        }

        // ─── Presença ─────────────────────────────────────────────────────

        private static async Task SendPresenceAsync(CancellationToken ct)
        {
            NamedPipeClientStream? pipe;
            DiscordPresence presence;

            lock (_lock)
            {
                pipe = _isConnected ? _pipe : null;
                presence = _presence;
                if (pipe == null || presence.Equals(_lastSent)) return;
                _lastSent = presence;
            }

            try
            {
                var payload = new Dictionary<string, object?>
                {
                    ["cmd"] = "SET_ACTIVITY",
                    ["args"] = new Dictionary<string, object?>
                    {
                        ["pid"] = Environment.ProcessId,
                        ["activity"] = BuildActivity(presence)
                    },
                    ["nonce"] = Guid.NewGuid().ToString()
                };

                await WritePacketAsync(pipe, OpFrame, JsonSerializer.Serialize(payload), ct);
            }
            catch (Exception ex)
            {
                lock (_lock)
                {
                    if (presence.Equals(_lastSent)) _lastSent = null;
                }
                Debug.WriteLine($"[DISCORD] Erro ao enviar presença: {ex.Message}");
            }
        }

        private static async Task ClearPresenceAsync()
        {
            NamedPipeClientStream? pipe;
            lock (_lock) { pipe = _isConnected ? _pipe : null; }
            if (pipe == null) return;

            try
            {
                using var cts = new CancellationTokenSource(500);
                var payload = new Dictionary<string, object?>
                {
                    ["cmd"] = "SET_ACTIVITY",
                    ["args"] = new Dictionary<string, object?> { ["pid"] = Environment.ProcessId },
                    ["nonce"] = Guid.NewGuid().ToString()
                };
                await WritePacketAsync(pipe, OpFrame, JsonSerializer.Serialize(payload), cts.Token);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DISCORD] Erro ao limpar presença: {ex.Message}");
            }
        }

        private static Dictionary<string, object?> BuildActivity(DiscordPresence p)
        {
            var activity = new Dictionary<string, object?>();

            var details = Clamp(p.Details);
            var state = Clamp(p.State);
            if (details != null) activity["details"] = details;
            if (state != null) activity["state"] = state;

            activity["timestamps"] = new Dictionary<string, object?>
            {
                ["start"] = p.StartTimestamp ?? _launcherStart
            };

            var assets = new Dictionary<string, object?>();
            if (!string.IsNullOrWhiteSpace(p.LargeImageKey))
            {
                assets["large_image"] = p.LargeImageKey;
                var lt = Clamp(p.LargeImageText);
                if (lt != null) assets["large_text"] = lt;
            }
            if (!string.IsNullOrWhiteSpace(p.SmallImageKey))
            {
                assets["small_image"] = p.SmallImageKey;
                var st = Clamp(p.SmallImageText);
                if (st != null) assets["small_text"] = st;
            }
            if (assets.Count > 0) activity["assets"] = assets;

            var buttons = new List<Dictionary<string, object?>>();
            AddButton(buttons, p.Button1Label, p.Button1Url);
            AddButton(buttons, p.Button2Label, p.Button2Url);
            if (buttons.Count > 0) activity["buttons"] = buttons;

            return activity;
        }

        private static void AddButton(List<Dictionary<string, object?>> list, string? label, string? url)
        {
            if (string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(url)) return;
            if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return;

            label = label.Trim();
            if (label.Length > 32) label = label.Substring(0, 32);
            list.Add(new Dictionary<string, object?> { ["label"] = label, ["url"] = url });
        }

        /// <summary>Discord exige texto entre 2 e 128 caracteres.</summary>
        private static string? Clamp(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            text = text.Trim();
            if (text.Length < 2) return null;
            return text.Length > 128 ? text.Substring(0, 128) : text;
        }

        // ─── I/O do pipe ──────────────────────────────────────────────────

        private static async Task WritePacketAsync(NamedPipeClientStream pipe, int opcode, string json, CancellationToken ct)
        {
            var payload = Encoding.UTF8.GetBytes(json);
            var buffer = new byte[8 + payload.Length];
            BitConverter.GetBytes(opcode).CopyTo(buffer, 0);
            BitConverter.GetBytes(payload.Length).CopyTo(buffer, 4);
            payload.CopyTo(buffer, 8);

            await _writeLock.WaitAsync(ct);
            try
            {
                await pipe.WriteAsync(buffer, 0, buffer.Length, ct);
                await pipe.FlushAsync(ct);
            }
            finally
            {
                _writeLock.Release();
            }
        }

        private static async Task<(int op, string json)> ReadPacketAsync(NamedPipeClientStream pipe, CancellationToken ct)
        {
            var header = new byte[8];
            await ReadExactAsync(pipe, header, ct);
            int op = BitConverter.ToInt32(header, 0);
            int len = BitConverter.ToInt32(header, 4);

            if (len < 0 || len > 1024 * 1024)
                throw new InvalidDataException($"Tamanho de pacote inválido: {len}");

            var body = new byte[len];
            if (len > 0) await ReadExactAsync(pipe, body, ct);
            return (op, Encoding.UTF8.GetString(body));
        }

        private static async Task ReadExactAsync(Stream stream, byte[] buffer, CancellationToken ct)
        {
            int read = 0;
            while (read < buffer.Length)
            {
                int n = await stream.ReadAsync(buffer, read, buffer.Length - read, ct);
                if (n == 0) throw new EndOfStreamException("Pipe fechado pelo Discord");
                read += n;
            }
        }

        // ─── Dados do utilizador ──────────────────────────────────────────

        private static async Task ParseReadyAsync(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                JsonElement user;
                if (root.TryGetProperty("data", out var data) && data.TryGetProperty("user", out var u))
                    user = u;
                else if (root.TryGetProperty("user", out var u2))
                    user = u2;
                else
                    return;

                var discordUser = new DiscordUser
                {
                    Id = GetString(user, "id"),
                    Username = GetString(user, "username"),
                    GlobalName = GetString(user, "global_name"),
                    AvatarHash = GetString(user, "avatar")
                };

                try
                {
                    var imgBytes = await Http.GetByteArrayAsync(discordUser.AvatarUrl);
                    using var ms = new MemoryStream(imgBytes);
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.StreamSource = ms;
                    bmp.EndInit();
                    bmp.Freeze();
                    discordUser.AvatarBitmap = bmp;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[DISCORD] Não foi possível carregar o avatar: {ex.Message}");
                }

                CurrentUser = discordUser;
                UserLoaded?.Invoke(discordUser);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DISCORD] Erro ao processar READY: {ex.Message}");
            }
        }

        private static string GetString(JsonElement element, string name)
        {
            return element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? ""
                : "";
        }
    }
}
