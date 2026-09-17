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
    std::atomic<bool> is_connected{false};

    web_socket.setUrl(formatted_address);
    web_socket.enableAutomaticReconnection();
    web_socket.setOnMessageCallback([&, formatted_address](const ix::WebSocketMessagePtr& msg)
    {
        if (msg->type == ix::WebSocketMessageType::Open)
        {
            is_connected = true;
            handshake_cv.notify_one();
            LOG_INFO("connected to the web socket ('%s')", formatted_address.c_str());
        }
        else if (msg->type == ix::WebSocketMessageType::Close)
        {
            is_connected = false;
            LOG_WARNING("disconnected from web socket, reconnecting...");
        }
        else if (msg->type == ix::WebSocketMessageType::Error)
        {
            LOG_ERROR("web socket error: %s (http status: %d)", msg->errorInfo.reason.c_str(), msg->errorInfo.http_status);
        }
    });
    web_socket.start();

    LOG_INFO("waiting for connection to '%s'...", formatted_address.c_str());
    {
        std::unique_lock lock(handshake_mutex);
        handshake_cv.wait_for(lock, std::chrono::seconds(15), [&] { return is_connected.load(); });
    }

    if (!is_connected)
    {
        LOG_WARNING("initial connection pending, will keep retrying in background...");
    }

    for (;;)
    {
        sdk::update();
        f::run();
        if (is_connected && !f::m_data.empty() && !f::m_data.is_null())
            web_socket.send(f::m_data.dump());

        std::this_thread::sleep_for(std::chrono::milliseconds(config_data.m_update_interval_ms));
    }

    return true;
}