#include "pch.hpp"

bool main()
{
    config_data_t config_data = {};
    INIT_STEP("config system", cfg::setup(config_data));
    INIT_STEP("offsets system", offsets::setup(config_data.m_offsets_file, config_data.m_offsets_remote_url));
    INIT_STEP("memory", m_memory->setup());
    INIT_STEP("interfaces", i::setup());
    INIT_STEP("schema", schema::setup());

    ix::initNetSystem();
    LOG_INFO("winsock initialization completed");

    const auto formatted_address = std::format("ws://{}:{}{}", config_data.m_host, config_data.m_port, config_data.m_endpoint);

    static ix::WebSocket web_socket;
    std::mutex handshake_mutex;
    std::condition_variable handshake_cv;
    bool connected = false;
    bool failed = false;

    web_socket.setUrl(formatted_address);
    web_socket.setOnMessageCallback([&](const ix::WebSocketMessagePtr& msg)
    {
        if (msg->type == ix::WebSocketMessageType::Open)
        {
            {
                std::lock_guard lock(handshake_mutex);
                connected = true;
            }
            handshake_cv.notify_one();
            LOG_INFO("connected to the web socket ('%s')", formatted_address.c_str());
        }
        else if (msg->type == ix::WebSocketMessageType::Error)
        {
            {
                std::lock_guard lock(handshake_mutex);
                failed = true;
            }
            handshake_cv.notify_one();
            LOG_ERROR("failed to connect to the web socket ('%s')", formatted_address.c_str());
        }
    });
    web_socket.start();

    {
        std::unique_lock lock(handshake_mutex);
        handshake_cv.wait(lock, [&] { return connected || failed; });
    }

    if (!connected)
    {
        std::this_thread::sleep_for(std::chrono::seconds(5));
        return {};
    }

    for (;;)
    {
        sdk::update();
        f::run();
        if (!f::m_data.empty() && !f::m_data.is_null())
            web_socket.send(f::m_data.dump());

        std::this_thread::sleep_for(std::chrono::milliseconds(config_data.m_update_interval_ms));
    }

    return true;
}