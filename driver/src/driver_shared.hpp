#pragma once

// ---------------------------------------------------------------------------
// Stealth: device name is XOR-obfuscated so no plain string scanner finds it.
// Both the kernel driver and usermode decode with the same key at runtime.
// The key and encoded array are the ONLY place the name is defined.
// ---------------------------------------------------------------------------

// XOR key (single byte, change to re-encode on each build if desired)
#define RADAR_STR_KEY  0x5A

// "\Device\" encoded (8 wchar_t prefix: L"\Device\"):
//   Each wchar_t low byte XOR'd with 0x5A: 0x5C->0x06,0x44->0x1E,0x65->0x3F,
//   0x76->0x2C,0x69->0x33,0x63->0x39,0x65->0x3F,0x5C->0x06
// "SvcHost" (7 chars, replaces "CS2Radar") encoded:
//   S=0x53,v=0x76,c=0x63,H=0x48,o=0x6F,s=0x73,t=0x74
//   XOR'd: 0x09,0x2C,0x39,0x12,0x35,0x29,0x2E

// Full kernel device name L"\Device\SvcHost"
// Encoded as an array of USHORT (wchar_t), terminated by 0:
//   L'\\' ^ 0x5A = 0x5C^0x5A=0x06   L'D'^0x5A=0x1E   L'e'^0x5A=0x3F
//   L'v'^0x5A=0x2C  L'i'^0x5A=0x33  L'c'^0x5A=0x39   L'e'^0x5A=0x3F
//   L'\\'^0x5A=0x06  L'S'^0x5A=0x09  L'v'^0x5A=0x2C   L'c'^0x5A=0x39
//   L'H'^0x5A=0x12  L'o'^0x5A=0x35  L's'^0x5A=0x29   L't'^0x5A=0x2E  0
#define RADAR_DEVICE_ENC_LEN   15
static const unsigned short _radar_dev_enc[RADAR_DEVICE_ENC_LEN + 1] = {
    0x06,0x1E,0x3F,0x2C,0x33,0x39,0x3F,0x06,  // \Device\
    0x09,0x2C,0x39,0x12,0x35,0x29,0x2E,       // SvcHost
    0x00
};

// Full DOS name L"\DosDevices\SvcHost"
//   \DosDevices\ encoded:
//   \=0x06 D=0x1E o=0x35 s=0x29 D=0x1E e=0x3F v=0x2C i=0x33 c=0x39 e=0x3F s=0x29 \=0x06
#define RADAR_DOSDEV_ENC_LEN   19
static const unsigned short _radar_dos_enc[RADAR_DOSDEV_ENC_LEN + 1] = {
    0x06,0x1E,0x35,0x29,0x1E,0x3F,0x2C,0x33,0x39,0x3F,0x29,0x06,  // \DosDevices\
    0x09,0x2C,0x39,0x12,0x35,0x29,0x2E,                             // SvcHost
    0x00
};

// usermode CreateFile path: "\\\\.\\SvcHost"
// \\.\  = 0x5C 0x5C 0x2E 0x5C -> XOR: 0x06 0x06 0x74 0x06
// S v c H o s t -> 0x09 0x2C 0x39 0x12 0x35 0x29 0x2E
#define RADAR_USERDEV_ENC_LEN  11
static const unsigned char _radar_userdev_enc[RADAR_USERDEV_ENC_LEN + 1] = {
    0x06,0x06,0x74,0x06,   // "\\.\\"
    0x09,0x2C,0x39,0x12,0x35,0x29,0x2E,  // "SvcHost"
    0x00
};

// -----------------------------------------------------------------------
// IOCTL codes: function numbers obfuscated (0x800->0xC3B, 0x801->0xC3C, 0x802->0xC3D)
// so the numeric pattern differs from common cheat IOCTL ranges.
// -----------------------------------------------------------------------
#define RADAR_MAGIC 0x48565358  // 'HVSX' (not 'RADR')

#ifndef CTL_CODE
#define CTL_CODE( DeviceType, Function, Method, Access ) ( \
    ((DeviceType) << 16) | ((Access) << 14) | ((Function) << 2) | (Method) \
)
#define FILE_DEVICE_UNKNOWN             0x00000022
#define METHOD_BUFFERED                 0
#define FILE_ANY_ACCESS                 0
#endif

#define IOCTL_RADAR_PING        CTL_CODE(FILE_DEVICE_UNKNOWN, 0xC3B, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_RADAR_READ_MEMORY CTL_CODE(FILE_DEVICE_UNKNOWN, 0xC3C, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_RADAR_GET_BASE    CTL_CODE(FILE_DEVICE_UNKNOWN, 0xC3D, METHOD_BUFFERED, FILE_ANY_ACCESS)

#pragma pack(push, 1)
typedef struct _radar_read_packet_t
{
    unsigned long  process_id;
    unsigned __int64 address;
    unsigned __int64 buffer;
    unsigned __int64 size;
} radar_read_packet_t;

typedef struct _radar_base_packet_t
{
    unsigned long  process_id;
    wchar_t        module_name[260];
    unsigned __int64 base_address;
    unsigned __int64 module_size;
} radar_base_packet_t;

typedef struct _radar_ping_packet_t
{
    unsigned long magic;
    unsigned long status;
} radar_ping_packet_t;
#pragma pack(pop)
