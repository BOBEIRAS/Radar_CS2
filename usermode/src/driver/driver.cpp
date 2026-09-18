#include "pch.hpp"
#include "driver.hpp"

c_driver::c_driver() : m_device_handle(INVALID_HANDLE_VALUE), m_process_id(0), m_connected(false)
{
}

c_driver::~c_driver()
{
    shutdown();
}

bool c_driver::init(uint32_t process_id)
{
    shutdown();

    m_process_id = process_id;

    m_device_handle = CreateFileA(
        DRIVER_USER_DEVICE_NAME,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr
    );

    if (m_device_handle == INVALID_HANDLE_VALUE)
    {
        m_connected = false;
        return false;
    }

    // Ping driver to verify responsiveness
    radar_ping_packet_t ping{};
    ping.magic = RADAR_MAGIC;
    ping.status = 0;

    DWORD bytes_returned = 0;
    const BOOL ok = DeviceIoControl(
        m_device_handle,
        IOCTL_RADAR_PING,
        &ping,
        sizeof(ping),
        &ping,
        sizeof(ping),
        &bytes_returned,
        nullptr
    );

    if (!ok || ping.status != RADAR_MAGIC)
    {
        CloseHandle(m_device_handle);
        m_device_handle = INVALID_HANDLE_VALUE;
        m_connected = false;
        return false;
    }

    m_connected = true;
    return true;
}

void c_driver::shutdown()
{
    if (m_device_handle != INVALID_HANDLE_VALUE && m_device_handle != nullptr)
    {
        CloseHandle(m_device_handle);
        m_device_handle = INVALID_HANDLE_VALUE;
    }
    m_connected = false;
}

bool c_driver::is_active() const
{
    return m_connected && m_device_handle != INVALID_HANDLE_VALUE;
}

bool c_driver::read_raw(uint64_t address, void* buffer, size_t size)
{
    if (!is_active() || !address || !buffer || !size)
        return false;

    radar_read_packet_t packet{};
    packet.process_id = m_process_id;
    packet.address = address;
    packet.buffer = reinterpret_cast<uint64_t>(buffer);
    packet.size = size;

    DWORD bytes_returned = 0;
    const BOOL ok = DeviceIoControl(
        m_device_handle,
        IOCTL_RADAR_READ_MEMORY,
        &packet,
        sizeof(packet),
        &packet,
        sizeof(packet),
        &bytes_returned,
        nullptr
    );

    return ok && bytes_returned == sizeof(packet);
}

std::pair<uint64_t, uint64_t> c_driver::get_module_base(const std::wstring& module_name)
{
    if (!is_active())
        return { 0, 0 };

    radar_base_packet_t packet{};
    packet.process_id = m_process_id;
    wcsncpy_s(packet.module_name, module_name.c_str(), _TRUNCATE);
    packet.base_address = 0;
    packet.module_size = 0;

    DWORD bytes_returned = 0;
    const BOOL ok = DeviceIoControl(
        m_device_handle,
        IOCTL_RADAR_GET_BASE,
        &packet,
        sizeof(packet),
        &packet,
        sizeof(packet),
        &bytes_returned,
        nullptr
    );

    if (ok)
        return { packet.base_address, packet.module_size };

    return { 0, 0 };
}
