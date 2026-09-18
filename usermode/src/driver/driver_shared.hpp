#pragma once
#include <cstdint>

#define DRIVER_DEVICE_NAME      L"\\Device\\CS2Radar"
#define DRIVER_DOS_DEVICE_NAME  L"\\DosDevices\\CS2Radar"
#define DRIVER_USER_DEVICE_NAME "\\\\.\\CS2Radar"

#define RADAR_MAGIC 0x52414452 // 'RADR'

#ifndef CTL_CODE
#define CTL_CODE( DeviceType, Function, Method, Access ) ( \
    ((DeviceType) << 16) | ((Access) << 14) | ((Function) << 2) | (Method) \
)
#define FILE_DEVICE_UNKNOWN             0x00000022
#define METHOD_BUFFERED                 0
#define FILE_ANY_ACCESS                 0
#endif

#define IOCTL_RADAR_PING        CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_RADAR_READ_MEMORY CTL_CODE(FILE_DEVICE_UNKNOWN, 0x801, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_RADAR_GET_BASE    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x802, METHOD_BUFFERED, FILE_ANY_ACCESS)

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
