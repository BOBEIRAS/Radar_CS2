using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Net.Http;
using System.Text;
using System.Text.Json;
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

    public static class DiscordService
    {
        private const string ClientId = "383226320970055681";
        private static readonly HttpClient Http = new();
        private static NamedPipeClientStream? _pipe;
        private static bool _isConnected = false;

        public static DiscordUser? CurrentUser { get; private set; }
        public static event Action<DiscordUser>? UserLoaded;

        public static async Task StartAsync()
        {
            await Task.Run(async () =>
            {
                for (int i = 0; i < 10; i++)
                {
                    try
                    {
                        var pipeName = $"discord-ipc-{i}";
                        _pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                        await _pipe.ConnectAsync(1000);

                        // Send handshake opcode 0
                        var handshake = JsonSerializer.Serialize(new { v = 1, client_id = ClientId });
                        SendPacket(0, handshake);

                        // Read response
                        var (op, json) = ReadPacket();
                        if (op == 1 && json.Contains("\"evt\":\"READY\""))
                        {
                            ParseReady(json);
                            _isConnected = true;

                            // Update activity
                            SetActivity("CS2 Web Radar", "Active Session - Undetected");
                            return;
                        }
                    }
                    catch
                    {
                        try { _pipe?.Dispose(); } catch { }
                        _pipe = null;
                    }
                }
            });
        }

        private static void SendPacket(int opcode, string json)
        {
            if (_pipe == null || !_pipe.IsConnected) return;
            var bytes = Encoding.UTF8.GetBytes(json);
            using var writer = new BinaryWriter(_pipe, Encoding.UTF8, leaveOpen: true);
            writer.Write(opcode);
            writer.Write(bytes.Length);
            writer.Write(bytes);
            writer.Flush();
        }

        private static (int opcode, string json) ReadPacket()
        {
            if (_pipe == null || !_pipe.IsConnected) return (-1, "");
            using var reader = new BinaryReader(_pipe, Encoding.UTF8, leaveOpen: true);
            int op = reader.ReadInt32();
            int len = reader.ReadInt32();
            byte[] buf = reader.ReadBytes(len);
            return (op, Encoding.UTF8.GetString(buf));
        }

        private static void ParseReady(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (!root.TryGetProperty("data", out var data) || !data.TryGetProperty("user", out var user))
                    return;

                var id = user.GetProperty("id").GetString() ?? "";
                var username = user.GetProperty("username").GetString() ?? "";
                var globalName = user.TryGetProperty("global_name", out var gn) ? (gn.GetString() ?? "") : "";
                var avatar = user.TryGetProperty("avatar", out var av) ? (av.GetString() ?? "") : "";

                var discordUser = new DiscordUser
                {
                    Id = id,
                    Username = username,
                    GlobalName = globalName,
                    AvatarHash = avatar
                };

                // Fetch avatar image
                try
                {
                    var imgBytes = Http.GetByteArrayAsync(discordUser.AvatarUrl).GetAwaiter().GetResult();
                    var bmp = new BitmapImage();
                    using var ms = new MemoryStream(imgBytes);
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.StreamSource = ms;
                    bmp.EndInit();
                    bmp.Freeze();
                    discordUser.AvatarBitmap = bmp;
                }
                catch { }

                CurrentUser = discordUser;
                UserLoaded?.Invoke(discordUser);
            }
            catch { }
        }

        public static void SetActivity(string details, string state)
        {
            if (!_isConnected || _pipe == null) return;
            try
            {
                var payload = new
                {
                    cmd = "SET_ACTIVITY",
                    args = new
                    {
                        pid = Environment.ProcessId,
                        activity = new
                        {
                            details,
                            state,
                            assets = new
                            {
                                large_image = "cs2_logo",
                                large_text = "CS2 Web Radar"
                            }
                        }
                    },
                    nonce = Guid.NewGuid().ToString()
                };

                SendPacket(1, JsonSerializer.Serialize(payload));
            }
            catch { }
        }

        public static void Disconnect()
        {
            try
            {
                _pipe?.Dispose();
                _pipe = null;
                _isConnected = false;
            }
            catch { }
        }
    }
}
