#include "pch.hpp"

void f::run()
{
	if (!sdk::m_local_controller)
		return;

	const auto local_team = sdk::m_local_controller->m_iTeamNum();
	if (local_team == e_team::none)
		return;

	m_data = nlohmann::json{};
	m_player_data = nlohmann::json{};

	m_data["m_local_team"] = local_team;
	m_data["m_scores"] = { { "ct", m_ct_score }, { "t", m_t_score } };
	m_data["m_grenades"] = nlohmann::json::array();

	get_map();
	get_player_info();
}

void f::get_map()
{
	const auto map_name = i::m_global_vars->m_map_name();
	if (map_name.empty() || map_name.find("<empty>") != std::string::npos)
	{
		m_data["m_map"] = "invalid";

		LOG_WARNING("failed to get map name! updating m_global_vars");
		i::m_global_vars = m_memory->read_t<c_global_vars*>(m_memory->find_pattern(CLIENT_DLL, GET_GLOBAL_VARS)->rip().as<c_global_vars*>());
		return;
	}

	m_data["m_map"] = map_name;
}

void f::get_player_info()
{
	m_data["m_players"] = nlohmann::json::array();

	const auto highest_idx = 1024;
	for (int32_t idx = 0; idx < highest_idx; idx++)
	{
		const auto entity = i::m_game_entity_system->get(idx);
		if (!entity)
			continue;

		const auto entity_handle = entity->get_ref_e_handle();
		if (!entity_handle.is_valid())
			continue;

		const auto class_name = entity->get_schema_class_name();
		if (class_name.empty())
			continue;

		const auto hashed_class_name = fnv1a::hash(class_name);

		if (hashed_class_name == fnv1a::hash("CCSPlayerController"))
		{
			const auto player = i::m_game_entity_system->get<c_cs_player_controller*>(entity_handle);
			if (!player)
				continue;

			const auto player_pawn = player->get_player_pawn();
			if (!player_pawn)
				continue;

			if (!f::players::get_data(idx, player, player_pawn))
				continue;

			f::players::get_weapons(player_pawn);
			f::players::get_active_weapon(player_pawn);

			m_data["m_players"].push_back(m_player_data);
		}
		else if (hashed_class_name == fnv1a::hash("C_C4"))
		{
			const auto bomb = entity;
			f::bomb::get_carried_bomb(bomb);
		}
		else if (hashed_class_name == fnv1a::hash("C_PlantedC4"))
		{
			const auto planted_c4 = reinterpret_cast<c_planted_c4*>(entity);
			f::bomb::get_planted_bomb(planted_c4);
		}
		else if (hashed_class_name == fnv1a::hash("C_CSTeam") || hashed_class_name == fnv1a::hash("CCSTeam") || hashed_class_name == fnv1a::hash("C_Team"))
		{
			const auto team_entity = reinterpret_cast<c_cs_team*>(entity);
			const auto team_num = team_entity->m_iTeamNum();
			auto score = team_entity->m_iScore();

			if (score == 0)
			{
				const auto fh = team_entity->m_scoreFirstHalf();
				const auto sh = team_entity->m_scoreSecondHalf();
				const auto ot = team_entity->m_scoreOvertime();
				if (fh + sh + ot > 0)
					score = fh + sh + ot;
			}

			char team_name_buf[32] = {};
			m_memory->read_t(reinterpret_cast<uintptr_t>(team_entity) + 0x634, team_name_buf, sizeof(team_name_buf) - 1);
			const std::string team_name = team_name_buf;

			if (team_num == e_team::ct || team_name == "CT" || team_name.find("CT") != std::string::npos)
			{
				m_ct_score = score;
				m_data["m_scores"]["ct"] = score;
			}
			else if (team_num == e_team::t || team_name == "TERRORIST" || team_name.find("TERROR") != std::string::npos || team_name == "T")
			{
				m_t_score = score;
				m_data["m_scores"]["t"] = score;
			}
		}
		else if (hashed_class_name == fnv1a::hash("C_SmokeGrenadeProjectile"))
		{
			const auto origin = entity->get_scene_origin();
			if (!origin.is_zero())
			{
				const auto smoke = reinterpret_cast<c_smoke_grenade_projectile*>(entity);
				nlohmann::json g;
				g["m_idx"] = idx;
				g["m_type"] = "smoke";
				g["m_position"] = { { "x", origin.m_x }, { "y", origin.m_y }, { "z", origin.m_z } };
				g["m_is_detonated"] = smoke->m_bDidSmokeEffect();
				m_data["m_grenades"].push_back(g);
			}
		}
		else if (hashed_class_name == fnv1a::hash("C_MolotovProjectile") || hashed_class_name == fnv1a::hash("C_IncendiaryGrenadeProjectile"))
		{
			const auto origin = entity->get_scene_origin();
			if (!origin.is_zero())
			{
				nlohmann::json g;
				g["m_idx"] = idx;
				g["m_type"] = "molotov";
				g["m_position"] = { { "x", origin.m_x }, { "y", origin.m_y }, { "z", origin.m_z } };
				g["m_is_detonated"] = false;
				m_data["m_grenades"].push_back(g);
			}
		}
		else if (hashed_class_name == fnv1a::hash("C_Inferno"))
		{
			const auto origin = entity->get_scene_origin();
			if (!origin.is_zero())
			{
				nlohmann::json g;
				g["m_idx"] = idx;
				g["m_type"] = "inferno";
				g["m_position"] = { { "x", origin.m_x }, { "y", origin.m_y }, { "z", origin.m_z } };
				g["m_is_detonated"] = true;
				m_data["m_grenades"].push_back(g);
			}
		}
		else if (hashed_class_name == fnv1a::hash("C_FlashbangProjectile"))
		{
			const auto origin = entity->get_scene_origin();
			if (!origin.is_zero())
			{
				nlohmann::json g;
				g["m_idx"] = idx;
				g["m_type"] = "flashbang";
				g["m_position"] = { { "x", origin.m_x }, { "y", origin.m_y }, { "z", origin.m_z } };
				g["m_is_detonated"] = false;
				m_data["m_grenades"].push_back(g);
			}
		}
		else if (hashed_class_name == fnv1a::hash("C_HEGrenadeProjectile"))
		{
			const auto origin = entity->get_scene_origin();
			if (!origin.is_zero())
			{
				nlohmann::json g;
				g["m_idx"] = idx;
				g["m_type"] = "hegrenade";
				g["m_position"] = { { "x", origin.m_x }, { "y", origin.m_y }, { "z", origin.m_z } };
				g["m_is_detonated"] = false;
				m_data["m_grenades"].push_back(g);
			}
		}
		else if (hashed_class_name == fnv1a::hash("C_DecoyProjectile"))
		{
			const auto origin = entity->get_scene_origin();
			if (!origin.is_zero())
			{
				nlohmann::json g;
				g["m_idx"] = idx;
				g["m_type"] = "decoy";
				g["m_position"] = { { "x", origin.m_x }, { "y", origin.m_y }, { "z", origin.m_z } };
				g["m_is_detonated"] = false;
				m_data["m_grenades"].push_back(g);
			}
		}
	}
}