#pragma once

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
