#pragma once

namespace offsets
{
	bool setup(const std::string& offsets_file, const std::string& remote_url);

	// Retrieve signatures (fallback to default if not in offsets.json)
	std::string get_signature(const std::string& name, const std::string& default_sig);

	// Retrieve numeric offsets (fallback to default if not in offsets.json)
	uint32_t get_offset(const std::string& name, uint32_t default_val);
}
