using System;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace launcher
{
    public enum LicenseStatus
    {
        Valid,
        Invalid,
        Expired,
        NotFound
    }

    public class LicenseInfo
    {
        public LicenseStatus Status { get; set; }
        public bool IsPermanent { get; set; }
        public DateTime? ExpiresAt { get; set; }
        public string? DaysLeft => IsPermanent ? "Permanent" :
            ExpiresAt.HasValue ? $"{Math.Max(0, (int)(ExpiresAt.Value - DateTime.UtcNow).TotalDays)}d remaining" : null;
        public string StatusText => Status switch
        {
            LicenseStatus.Valid => IsPermanent ? "PERMANENT" : $"Expires {ExpiresAt:dd/MM/yyyy}",
            LicenseStatus.Expired => "EXPIRED",
            LicenseStatus.Invalid => "INVALID",
            _ => "NOT FOUND"
        };
    }

    public static class LicenseManager
    {
        private const string Salt = "CS2RADAR_PRIVATE_SALT_2024_X";

        private static string GetLicenseFilePath()
        {
            var p1 = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "license.key");
            if (File.Exists(p1)) return p1;
            var p2 = Path.Combine(Environment.CurrentDirectory, "license.key");
            if (File.Exists(p2)) return p2;
            return p1;
        }

        // ─── HWID Generation ──────────────────────────────────────────────────

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool GetVolumeInformation(
            string lpRootPathName, StringBuilder lpVolumeNameBuffer, uint nVolumeNameSize,
            out uint lpVolumeSerialNumber, out uint lpMaximumComponentLength,
            out uint lpFileSystemFlags, StringBuilder lpFileSystemNameBuffer, uint nFileSystemNameSize);

        public static string GetHWID()
        {
            var sb = new StringBuilder();

            // 1. Disk serial of C:\
            try
            {
                var volName = new StringBuilder(256);
                var fsName = new StringBuilder(256);
                if (GetVolumeInformation(@"C:\", volName, 256, out uint serial, out _, out _, fsName, 256))
                    sb.Append(serial.ToString("X8"));
            }
            catch { sb.Append("00000000"); }

            // 2. First active MAC address
            try
            {
                var mac = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up
                                && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    .Select(n => n.GetPhysicalAddress().ToString())
                    .FirstOrDefault(m => m?.Length >= 8) ?? "NOMAC";
                sb.Append(mac);
            }
            catch { sb.Append("NOMAC"); }

            // 3. Computer name
            sb.Append(Environment.MachineName.ToUpperInvariant());

            // Hash → compact HWID
            using var sha = SHA256.Create();
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()));
            return BitConverter.ToString(hash).Replace("-", "")[..16].ToUpperInvariant();
        }

        // ─── Key Generation (called by you to generate keys for clients) ─────

        /// <summary>
        /// Generates a PERMANENT key for the given HWID.
        /// </summary>
        public static string GeneratePermanentKey(string hwid)
        {
            var raw = ComputeHash($"PERM|{hwid}|{Salt}");
            return $"PERM-{FormatKey(raw)}";
        }

        /// <summary>
        /// Generates a TEMPORARY key valid for <paramref name="days"/> days.
        /// </summary>
        public static string GenerateTemporaryKey(string hwid, int days)
        {
            var expiry = DateTime.UtcNow.AddDays(days).ToString("yyyyMMdd");
            var raw = ComputeHash($"TEMP|{hwid}|{expiry}|{Salt}");
            return $"{expiry}-{FormatKey(raw)}";
        }

        // ─── Key Validation ───────────────────────────────────────────────────

        public static LicenseInfo Validate()
        {
            var path = GetLicenseFilePath();
            if (!File.Exists(path))
                return new LicenseInfo { Status = LicenseStatus.NotFound };

            var key = File.ReadAllText(path).Trim().ToUpperInvariant();
            return ValidateKey(key);
        }

        /// <summary>
        /// Valida uma key com base no HWID desta maquina e na data de expiracao.
        /// </summary>
        public static LicenseInfo ValidateKey(string key)
        {
            key = key.Trim().ToUpperInvariant();
            var hwid = GetHWID();

            // PERMANENT key: starts with "PERM-"
            if (key.StartsWith("PERM-"))
            {
                var expected = GeneratePermanentKey(hwid);
                if (key == expected.ToUpperInvariant())
                    return new LicenseInfo { Status = LicenseStatus.Valid, IsPermanent = true };
                return new LicenseInfo { Status = LicenseStatus.Invalid };
            }

            // TEMPORARY key: starts with yyyyMMdd-
            if (key.Length >= 9 && key[8] == '-' && DateTime.TryParseExact(
                key[..8], "yyyyMMdd", null, System.Globalization.DateTimeStyles.None, out var expiry))
            {
                var raw = ComputeHash($"TEMP|{hwid}|{key[..8]}|{Salt}");
                var expectedKey = $"{key[..8]}-{FormatKey(raw)}".ToUpperInvariant();

                if (key != expectedKey)
                    return new LicenseInfo { Status = LicenseStatus.Invalid };

                if (DateTime.UtcNow.Date > expiry.Date)
                    return new LicenseInfo { Status = LicenseStatus.Expired, IsPermanent = false, ExpiresAt = expiry };

                return new LicenseInfo { Status = LicenseStatus.Valid, IsPermanent = false, ExpiresAt = expiry };
            }

            return new LicenseInfo { Status = LicenseStatus.Invalid };
        }

        public static void SaveKey(string key)
        {
            var path = GetLicenseFilePath();
            File.WriteAllText(path, key.Trim().ToUpperInvariant());
        }

        /// <summary>
        /// Apaga a license.key local e qualquer cache ou ficheiro de chaves do utilizador (%APPDATA%\CS2WR).
        /// </summary>
        public static void ResetLicense()
        {
            try
            {
                var p1 = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "license.key");
                if (File.Exists(p1)) File.Delete(p1);
                var p2 = Path.Combine(Environment.CurrentDirectory, "license.key");
                if (File.Exists(p2)) File.Delete(p2);
            }
            catch { }

            try
            {
                var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                var dir = Path.Combine(appData, "CS2WR");
                if (Directory.Exists(dir)) Directory.Delete(dir, true);
            }
            catch { }
        }

        // ─── Helpers ──────────────────────────────────────────────────────────

        private static string FormatKey(string hash)
        {
            // Take 16 chars and format as XXXX-XXXX-XXXX-XXXX
            var h = hash.PadRight(16, '0')[..16];
            return $"{h[0..4]}-{h[4..8]}-{h[8..12]}-{h[12..16]}";
        }

        private static string ComputeHash(string input)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(bytes).Replace("-", "").ToUpperInvariant();
        }
    }
}
