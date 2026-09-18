#pragma once
#include "driver_shared.hpp"
#include <string>
#include <optional>
#include <memory>

class c_driver
{
public:
    c_driver();
    ~c_driver();

    bool init(uint32_t process_id);
    void shutdown();
    bool is_active() const;

    bool read_raw(uint64_t address, void* buffer, size_t size);

    template <typename T>
    T read(uint64_t address)
    {
        T buffer{};
        read_raw(address, &buffer, sizeof(T));
        return buffer;
    }

    std::pair<uint64_t, uint64_t> get_module_base(const std::wstring& module_name);

private:
    void* m_device_handle = (void*)-1; // INVALID_HANDLE_VALUE
    uint32_t m_process_id = 0;
    bool m_connected = false;
};

inline const std::unique_ptr<c_driver> m_driver{ new c_driver() };
