#include "pch.hpp"
#include "offsets.hpp"
#include <filesystem>
#include <urlmon.h>
#pragma comment(lib, "urlmon.lib")

static std::unordered_map<std::string, std::string> m_signatures;
static std::unordered_map<std::string, uint32_t> m_offsets;

bool offsets::setup(const std::string& offsets_file, const std::string& remote_url)
{
	const std::string filename = offsets_file.empty() ? "offsets.json" : offsets_file;

	const std::vector<std::string> search_paths = {
		filename,
		"../" + filename,
		"../../" + filename,
		"../../../" + filename
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

	// Se existir URL remota configurada, tenta atualizar/descarregar offsets.json
	if (!remote_url.empty())
	{
		const std::string target_download_path = found_path.empty() ? filename : found_path;
		LOG_INFO("attempting to download remote offsets from '%s'...", remote_url.c_str());

		const HRESULT hr = URLDownloadToFileA(nullptr, remote_url.c_str(), target_download_path.c_str(), 0, nullptr);
		if (SUCCEEDED(hr))
		{
			found_path = target_download_path;
			LOG_INFO("remote offsets successfully downloaded to '%s'", found_path.c_str());
		}
		else
		{
			LOG_WARNING("failed to download remote offsets (HRESULT 0x%08X), using local file/fallbacks", hr);
		}
	}

	if (found_path.empty())
	{
		LOG_INFO("no 'offsets.json' found, using default compiled signatures and schema offsets");
		return true;
	}

	std::ifstream file(found_path);
	if (!file.is_open())
	{
		LOG_WARNING("cannot open offsets file '%s', using defaults", found_path.c_str());
		return true;
	}

	try
	{
		const auto j = nlohmann::json::parse(file);
		if (j.contains("signatures") && j["signatures"].is_object())
		{
			for (auto& [key, val] : j["signatures"].items())
			{
				if (val.is_string())
					m_signatures[key] = val.get<std::string>();
			}
		}

		if (j.contains("offsets") && j["offsets"].is_object())
		{
			for (auto& [key, val] : j["offsets"].items())
			{
				if (val.is_number_unsigned() || val.is_number_integer())
					m_offsets[key] = val.get<uint32_t>();
			}
		}

		LOG_INFO("offsets loaded: %zu signatures, %zu offsets from '%s'", m_signatures.size(), m_offsets.size(), found_path.c_str());
	}
	catch (const std::exception& e)
	{
		LOG_WARNING("failed to parse '%s' (%s), using defaults", found_path.c_str(), e.what());
	}

	return true;
}

std::string offsets::get_signature(const std::string& name, const std::string& default_sig)
{
	if (const auto it = m_signatures.find(name); it != m_signatures.end())
		return it->second;

	return default_sig;
}

uint32_t offsets::get_offset(const std::string& name, uint32_t default_val)
{
	if (const auto it = m_offsets.find(name); it != m_offsets.end())
		return it->second;

	return default_val;
}
