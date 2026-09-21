#pragma once
#include <cstdint>
#include <string>

// ---------------------------------------------------------------------------
// Stealth: device name decoded at runtime from XOR-encoded array.
// Must stay in sync with driver\src\driver_shared.hpp
// ---------------------------------------------------------------------------

#define RADAR_STR_KEY  0x5A

// usermode path \\\\.\\SvcHost  (11 bytes + null)
#define RADAR_USERDEV_ENC_LEN  11
static const unsigned char _radar_userdev_enc[RADAR_USERDEV_ENC_LEN + 1] = {
    0x06,0x06,0x74,0x06,            // "\\.\\"
    0x09,0x2C,0x39,0x12,0x35,0x29,0x2E,  // "SvcHost"
    0x00
};

inline std::string RadarGetDevicePath()
{
    std::string out;
    out.reserve(RADAR_USERDEV_ENC_LEN);
    for (int i = 0; i < RADAR_USERDEV_ENC_LEN; i++)
        out.push_back(static_cast<char>(_radar_userdev_enc[i] ^ RADAR_STR_KEY));
    return out;
}

// -----------------------------------------------------------------------
// IOCTL codes — must match driver exactly (obfuscated function numbers)
// -----------------------------------------------------------------------
#define RADAR_MAGIC 0x48565358  // 'HVSX'

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
struct radar_read_packet_t
{
    uint32_t process_id;
    uint64_t address;
    uint64_t buffer;
    uint64_t size;
};

struct radar_base_packet_t
{
    uint32_t process_id;
    wchar_t  module_name[260];
    uint64_t base_address;
    uint64_t module_size;
};

struct radar_ping_packet_t
{
    uint32_t magic;
    uint32_t status;
};
#pragma pack(pop)
