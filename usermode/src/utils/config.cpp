#include "pch.hpp"
#include <filesystem>

bool cfg::setup(config_data_t& config_data)
{
	const std::vector<std::string> search_paths = {
		"config.json",
		"../config.json",
		"../../config.json",
		"../../../config.json"
	};

	std::string found_path = "";
	for (const auto& path : search_paths)
	{
		if (std::filesystem::exists(path))
		{
			found_path = path;
			break;
		}
	}

	if (found_path.empty())
	{
		LOG_WARNING("cannot find 'config.json', using default settings");
		return true;
	}

	std::ifstream file(found_path);
	if (!file.is_open())
	{
		LOG_WARNING("cannot open file '%s', using default settings", found_path.c_str());
		return true;
	}

	try
	{
		const auto j = nlohmann::json::parse(file);
		if (j.contains("server"))
		{
			const auto& s = j["server"];
			if (s.contains("host")) config_data.m_host = s["host"].get<std::string>();
			if (s.contains("port")) config_data.m_port = s["port"].get<uint16_t>();
			if (s.contains("endpoint")) config_data.m_endpoint = s["endpoint"].get<std::string>();
		}
		// Fallback for legacy format {"m_ip": "..."}
		else if (j.contains("m_ip"))
		{
			config_data.m_host = j["m_ip"].get<std::string>();
		}

		if (j.contains("radar"))
		{
			const auto& r = j["radar"];
			if (r.contains("updateIntervalMs")) config_data.m_update_interval_ms = r["updateIntervalMs"].get<uint32_t>();
		}

		if (j.contains("offsets"))
		{
			const auto& o = j["offsets"];
			if (o.contains("file")) config_data.m_offsets_file = o["file"].get<std::string>();
			if (o.contains("remoteUrl")) config_data.m_offsets_remote_url = o["remoteUrl"].get<std::string>();
		}

		LOG_INFO("config loaded successfully from '%s'", found_path.c_str());
	}
	catch (const std::exception& e)
	{
		LOG_WARNING("error parsing '%s' (%s), using defaults", found_path.c_str(), e.what());
	}

	return true;
}