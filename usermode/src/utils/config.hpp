#pragma once

struct config_data_t
{
	std::string m_host = "localhost";
	uint16_t m_port = 22006;
	std::string m_endpoint = "/cs2_webradar";
	uint32_t m_update_interval_ms = 100;
	std::string m_offsets_file = "offsets.json";
	std::string m_offsets_remote_url = "";
};

namespace cfg
{
	bool setup(config_data_t& config_data);
}