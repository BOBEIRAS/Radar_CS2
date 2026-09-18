param(
    [string]$Hwid = "",
    [int]$Days = 0
)

Add-Type -TypeDefinition @"
using System;
using System.Security.Cryptography;
using System.Text;

public static class AdminKeygen
{
    private const string Salt = "CS2RADAR_PRIVATE_SALT_2024_X";

    private static string ComputeHash(string input)
    {
        using (SHA256 sha = SHA256.Create())
        {
            byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(bytes).Replace("-", "").ToUpperInvariant();
        }
    }

    private static string FormatKey(string hash)
    {
        string h = hash.PadRight(16, '0').Substring(0, 16);
        return string.Format("{0}-{1}-{2}-{3}", h.Substring(0, 4), h.Substring(4, 4), h.Substring(8, 4), h.Substring(12, 4));
    }

    public static string GeneratePermanentKey(string hwid)
    {
        string raw = ComputeHash("PERM|" + hwid.Trim().ToUpperInvariant() + "|" + Salt);
        return "PERM-" + FormatKey(raw);
    }

    public static string GenerateTemporaryKey(string hwid, int days)
    {
        string expiry = DateTime.UtcNow.AddDays(days).ToString("yyyyMMdd");
        string raw = ComputeHash("TEMP|" + hwid.Trim().ToUpperInvariant() + "|" + expiry + "|" + Salt);
        return expiry + "-" + FormatKey(raw);
    }
}
"@

if ($PSBoundParameters.Count -eq 0) {
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "   CS2 WEB RADAR - GERADOR DE LICENCAS   " -ForegroundColor Yellow
    Write-Host "=========================================" -ForegroundColor Cyan
    $Hwid = Read-Host "Cola o HWID do cliente"
    if ([string]::IsNullOrWhiteSpace($Hwid)) {
        Write-Host "HWID nao pode estar vazio!" -ForegroundColor Red
        exit
    }

    Write-Host ""
    Write-Host "Opcoes de Licenca:" -ForegroundColor Green
    Write-Host "  [0] Permanente / Lifetime"
    Write-Host "  [1] 1 Dia (Teste)"
    Write-Host "  [7] 7 Dias (Semana)"
    Write-Host "  [15] 15 Dias"
    Write-Host "  [30] 30 Dias (Mes)"
    Write-Host "  [90] 90 Dias (3 Meses)"
    Write-Host "  [365] 365 Dias (1 Ano)"
    $inputDays = Read-Host "Escolhe os dias (Pressiona Enter para Lifetime [0])"
    if (-not [string]::IsNullOrWhiteSpace($inputDays)) {
        $Days = [int]$inputDays
    }
}

$key = ""
if ($Days -le 0) {
    $key = [AdminKeygen]::GeneratePermanentKey($Hwid)
    $tipo = "PERMANENTE (LIFETIME)"
} else {
    $key = [AdminKeygen]::GenerateTemporaryKey($Hwid, $Days)
    $tipo = "TEMPORARIA ($Days dias)"
}

Write-Host ""
Write-Host "-----------------------------------------" -ForegroundColor DarkGray
Write-Host "Tipo: $tipo" -ForegroundColor Cyan
Write-Host "HWID: $Hwid" -ForegroundColor White
Write-Host "KEY : $key" -ForegroundColor Green -BackgroundColor Black
Write-Host "-----------------------------------------" -ForegroundColor DarkGray

try {
    Set-Clipboard -Value $key
    Write-Host ">> Chave copiada para o Clipboard automaticamente!" -ForegroundColor Yellow
} catch {}

Write-Host ""
if ($PSBoundParameters.Count -eq 0) {
    pause
}
