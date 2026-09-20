import { useState, memo } from "react";

export const DEFAULT_SETTINGS = {
  dotSize: 1.0,
  bombSize: 0.8,
  showNames: false,
  showHealth: true,
  showHealthBar: true,
  mapRotation: "auto", // 0 | 90 | 180 | 270 | 'auto'
  showCards: true,
  compactCards: false,
  radarGlow: false,
  showGrenades: true,
  showGrenadeTimers: true,
  overlayMode: false,
  overlayOpacity: 70,
  bgDim: 85,
};

const SettingsModal = ({ settings, onSettingsChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("radar");

  const updateSetting = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleReset = () => {
    onSettingsChange(DEFAULT_SETTINGS);
  };

  return (
    <div className="relative z-50">
      {/* Settings Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Radar Settings"
        className={`flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          isOpen
            ? "bg-zinc-800 border-zinc-500 text-white"
            : "bg-[#121215] border-[#27272a] text-zinc-300 hover:text-white hover:border-zinc-500"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="hidden sm:inline">Settings</span>
      </button>

      {/* Preferences Flyout */}
      {isOpen && (
        <>
          {/* Backdrop click to close */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="absolute right-0 mt-2 w-[calc(100vw-32px)] max-w-xs sm:w-80 rounded-xl border border-zinc-700/80 p-4 text-zinc-200 shadow-2xl z-50"
            style={{ backgroundColor: "#141419", opacity: 1 }}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
                  Radar Settings
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 my-3 bg-[#1c1c24] p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => setActiveTab("radar")}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  activeTab === "radar"
                    ? "bg-zinc-700 text-white font-medium shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Radar
              </button>
              <button
                onClick={() => setActiveTab("interface")}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  activeTab === "interface"
                    ? "bg-zinc-700 text-white font-medium shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Display
              </button>
            </div>

          {/* Tab: Radar */}
          {activeTab === "radar" && (
            <div className="space-y-3.5 text-xs">
              {/* Map Rotation */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-zinc-300">Map Rotation</span>
                  <span className="font-mono text-sky-400 text-[11px]">
                    {settings.mapRotation === "auto" ? "Auto (Team)" : `${settings.mapRotation ?? 0}°`}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 bg-[#1c1c24] p-1 rounded-lg border border-zinc-800 text-[10px]">
                  {[0, 90, 180, 270, "auto"].map((rot) => (
                    <button
                      key={rot}
                      onClick={() => updateSetting("mapRotation", rot)}
                      className={`py-1 rounded font-mono font-medium transition-colors ${
                        (settings.mapRotation ?? "auto") === rot
                          ? "bg-sky-600 text-white shadow-sm"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      {rot === "auto" ? "Auto" : `${rot}°`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Auto: rotates 180° on T side so your spawn is oriented from the bottom.
                </p>
              </div>

              {/* Player Size */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-zinc-300">Player Size</span>
                  <span className="font-mono text-white">{settings.dotSize?.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="2.0"
                  step="0.1"
                  value={settings.dotSize ?? 1}
                  onChange={(e) => updateSetting("dotSize", parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded appearance-none cursor-pointer"
                />
              </div>

              {/* Bomb Size */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-zinc-300">Bomb Size</span>
                  <span className="font-mono text-white">{settings.bombSize?.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.1"
                  value={settings.bombSize ?? 0.8}
                  onChange={(e) => updateSetting("bombSize", parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded appearance-none cursor-pointer"
                />
              </div>

              {/* Toggles */}
              <div className="pt-2 border-t border-[#27272a] space-y-2">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-zinc-300">Show Player Names</span>
                  <input
                    type="checkbox"
                    checked={settings.showNames ?? false}
                    onChange={(e) => updateSetting("showNames", e.target.checked)}
                    className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-sky-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-zinc-300 block">Health Badges on Radar</span>
                    <span className="text-[10px] text-zinc-500">Mini health bar & number on dots</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showHealthBar ?? true}
                    onChange={(e) => updateSetting("showHealthBar", e.target.checked)}
                    className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-sky-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-zinc-300">Radar Glow Halo</span>
                  <input
                    type="checkbox"
                    checked={settings.radarGlow ?? false}
                    onChange={(e) => updateSetting("radarGlow", e.target.checked)}
                    className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-sky-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-zinc-300 block">Grenades & Utilities</span>
                    <span className="text-[10px] text-zinc-500">Smokes, molotovs, flashes, HEs</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showGrenades ?? true}
                    onChange={(e) => updateSetting("showGrenades", e.target.checked)}
                    className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-sky-500 cursor-pointer"
                  />
                </label>

                {settings.showGrenades && (
                  <label className="flex items-center justify-between cursor-pointer select-none pl-3 border-l-2 border-sky-500/40">
                    <div>
                      <span className="text-zinc-300 block">Grenade Timers</span>
                      <span className="text-[10px] text-zinc-500">Live countdown for smokes (18s) & fire (7s)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.showGrenadeTimers ?? true}
                      onChange={(e) => updateSetting("showGrenadeTimers", e.target.checked)}
                      className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-sky-500 cursor-pointer"
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Tab: Display */}
          {activeTab === "interface" && (
            <div className="space-y-3.5 text-xs">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <span className="text-white block">Overlay Mode</span>
                  <span className="text-[11px] text-zinc-500">Borderless minimal HUD for streaming/overlay</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.overlayMode ?? false}
                  onChange={(e) => updateSetting("overlayMode", e.target.checked)}
                  className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-emerald-400 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <span className="text-white block">Team Cards</span>
                  <span className="text-[11px] text-zinc-500">Show left and right panels</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showCards ?? true}
                  onChange={(e) => updateSetting("showCards", e.target.checked)}
                  className="w-4 h-4 rounded bg-[#141418] border-[#27272a] text-sky-500 cursor-pointer"
                />
              </label>

              {/* Overlay Opacity */}
              {settings.overlayMode && (
                <div className="pt-2 border-t border-[#27272a]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-zinc-300">Overlay Glass Opacity</span>
                    <span className="font-mono text-emerald-400">{settings.overlayOpacity ?? 70}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.overlayOpacity ?? 70}
                    onChange={(e) => updateSetting("overlayOpacity", parseInt(e.target.value))}
                    className="w-full h-1.5 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              )}

              {/* Background Dimming */}
              <div className="pt-2 border-t border-[#27272a]">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-zinc-300">Background Dim</span>
                  <span className="font-mono text-white">{settings.bgDim ?? 85}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={settings.bgDim ?? 85}
                  onChange={(e) => updateSetting("bgDim", parseInt(e.target.value))}
                  className="w-full h-1.5 rounded appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-2.5 border-t border-[#27272a] flex justify-between items-center text-xs">
            <button
              onClick={handleReset}
              className="text-zinc-400 hover:text-red-400 transition-colors"
            >
              Reset Defaults
            </button>
            <span className="text-[11px] text-zinc-600 font-mono">CS2 WEBRADAR</span>
          </div>
        </div>
        </>
      )}
    </div>
  );
};

export default memo(SettingsModal);
