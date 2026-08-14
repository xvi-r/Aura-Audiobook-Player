// Settings Page Module - Theme Configurator, Visual FX & Settings Toggles
import { router } from "./router.js";
import { getApiBase } from "./config.js";

const BASES = [
  { id: "midnight", name: "Midnight Obsidian", className: "base-midnight", previewBg: "#121212", previewText: "#edeae6" },
  { id: "oled", name: "Midnight OLED", className: "base-oled", previewBg: "#000000", previewText: "#f5f5f7" },
  { id: "cyberpunk", name: "Cyberpunk Neon", className: "base-cyberpunk", previewBg: "#090a0f", previewText: "#f0f4fc" },
  { id: "sepia", name: "Warm Sepia", className: "base-sepia", previewBg: "#14110e", previewText: "#f2ebd9" },
  { id: "amethyst", name: "Royal Amethyst", className: "base-amethyst", previewBg: "#100b18", previewText: "#f4efff" },
  { id: "emerald", name: "Emerald Forest", className: "base-emerald", previewBg: "#07140e", previewText: "#edfaf4" },
  { id: "nordic", name: "Nordic Slate (Light)", className: "base-nordic", previewBg: "#f1f5f9", previewText: "#0f172a" }
];

const ACCENTS = [
  { id: "orange", name: "Warm Orange", className: "accent-orange", color: "#f27d11" },
  { id: "gold", name: "Amber Gold", className: "accent-gold", color: "#e5a93c" },
  { id: "cyan", name: "Electric Cyan", className: "accent-cyan", color: "#00d2ff" },
  { id: "purple", name: "Royal Purple", className: "accent-purple", color: "#a855f7" },
  { id: "green", name: "Emerald Green", className: "accent-emerald", color: "#10b981" },
  { id: "rose", name: "Neon Rose", className: "accent-rose", color: "#f43f5e" }
];

export const renderSettings = () => {
  const container = document.getElementById("main-content");
  if (!container) return;

  container.className = "fade-in";
  container.style.overflowY = "auto";
  container.style.paddingBottom = "80px";
  container.style.overflowY = "auto";

  const currentBase = localStorage.getItem("aura_base_theme") || "base-midnight";
  const currentAccent = localStorage.getItem("aura_accent_color") || "accent-orange";
  const currentDensity = localStorage.getItem("aura_grid_density") || "8";

  const ambientGlow = localStorage.getItem("aura_setting_ambient_glow") !== "false";
  const animatedWaveform = localStorage.getItem("aura_setting_animated_waveform") !== "false";
  const coverTilt = localStorage.getItem("aura_setting_cover_tilt") !== "false";

  // Build Real Themes Cards HTML
  const basesHtml = BASES.map(theme => {
    const isActive = (currentBase === theme.className);
    return `
      <div class="theme-card ${isActive ? "active" : ""}" data-type="base" data-classname="${theme.className}">
        <div class="theme-color-preview" style="background-color: ${theme.previewBg}; color: ${theme.previewText}; border-bottom: 1px solid var(--border-color);">
          <span>Aa</span>
        </div>
        <div class="theme-card-info">
          <span class="theme-card-name">${theme.name}</span>
          ${isActive ? '<i data-lucide="check-circle" class="theme-check-icon"></i>' : ""}
        </div>
      </div>
    `;
  }).join("");

  // Build Accent Color Cards HTML
  const accentsHtml = ACCENTS.map(accent => {
    const isActive = (currentAccent === accent.className);
    return `
      <div class="accent-card ${isActive ? "active" : ""}" data-type="accent" data-classname="${accent.className}">
        <div class="accent-color-dot" style="background-color: ${accent.color};"></div>
        <span class="accent-card-name">${accent.name}</span>
        ${isActive ? '<i data-lucide="check" class="accent-check-icon"></i>' : ""}
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="settings-container">
      <div class="library-header" style="margin-bottom: 24px;">
        <div class="welcome-section">
          <h1>Preferences & Settings</h1>
          <p>Customize Aura player's visual themes, accents, and dynamic effects.</p>
        </div>
      </div>

      <!-- Section 1: Themes -->
      <section class="settings-section" style="margin-bottom: 28px;">
        <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="palette" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
          Base Interface Theme
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
          Select the background and text palette of the dashboard interface.
        </p>
        <div class="theme-chooser-grid">
          ${basesHtml}
        </div>
      </section>

      <!-- Section 2: Accent Colors -->
      <section class="settings-section" style="margin-bottom: 28px;">
        <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="paintbrush" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
          Accent Highlights
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
          Select the highlight color for play buttons, volume sliders, and icons.
        </p>
        <div class="accents-chooser-grid">
          ${accentsHtml}
        </div>
      </section>

      <!-- Section 3: Visual Effects & Dynamic Enhancements -->
      <section class="settings-section" style="margin-bottom: 28px;">
        <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="sparkles" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
          Visual FX & Dynamic Effects
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
          Enable or disable animated badges and cover hover elevation effects.
        </p>

        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px 20px; max-width: 520px; display: flex; flex-direction: column; gap: 14px;">
          <!-- Waveform Badge Toggle -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-main);">Animated Waveform Badges</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Show animated equalizer badge on active playing library cards</div>
            </div>
            <button class="toggle-fx-btn ${animatedWaveform ? 'active' : ''}" data-setting="aura_setting_animated_waveform" style="background: ${animatedWaveform ? 'var(--accent-primary)' : 'var(--bg-primary)'}; color: ${animatedWaveform ? 'white' : 'var(--text-muted)'}; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 14px; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: var(--transition-quick);">
              ${animatedWaveform ? 'ON' : 'OFF'}
            </button>
          </div>

          <!-- Cover Elevation Toggle -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px;">
            <div>
              <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-main);">Interactive Cover Elevation</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Enable smooth cover elevation raise & drop shadow on book cover hover</div>
            </div>
            <button class="toggle-fx-btn ${coverTilt ? 'active' : ''}" data-setting="aura_setting_cover_tilt" style="background: ${coverTilt ? 'var(--accent-primary)' : 'var(--bg-primary)'}; color: ${coverTilt ? 'white' : 'var(--text-muted)'}; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 14px; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: var(--transition-quick);">
              ${coverTilt ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </section>

      <!-- Section: Server Connection Configuration -->
      <section class="settings-section" style="margin-bottom: 28px;">
        <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="server" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
          Server Connection Settings
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
          Specify the backend API server URL (e.g. for remote network access, local IP, or Cloudflare Tunnels). Leave blank for automatic network auto-detection.
        </p>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; max-width: 520px;">
          <input 
            type="text" 
            id="server-url-input" 
            placeholder="http://192.168.1.50:8080 or https://tunnel.example.com" 
            value="${localStorage.getItem("aura_server_url") || ""}" 
            style="flex: 1; min-width: 260px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; color: var(--text-main); font-family: var(--font-family); font-size: 0.85rem; outline: none;"
          />
          <button id="save-server-url-btn" style="background: var(--accent-primary); color: white; border: none; border-radius: var(--radius-sm); padding: 8px 16px; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: var(--transition-quick);">
            Save Server URL
          </button>
        </div>
        <div id="server-url-status" style="margin-top: 8px; font-size: 0.78rem; color: var(--text-muted);">
          Current Active Backend: <code style="color: var(--accent-primary); background: var(--bg-surface); padding: 2px 6px; border-radius: 4px;">${getApiBase()}</code>
        </div>
      </section>

      <!-- Section 4: Library Grid Density (4 - 6 - 8 - 10 Books per Row) -->
      <section class="settings-section" style="margin-bottom: 28px;">
        <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="layout-grid" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
          Library Grid Density
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
          Choose how many audiobook cards display per row in your library catalog.
        </p>

        <div class="density-chooser-grid" style="display: flex; gap: 10px; max-width: 520px;">
          <div class="density-card ${currentDensity === '4' ? 'active' : ''}" data-density="4" style="flex: 1; background: var(--bg-secondary); border: 2px solid ${currentDensity === '4' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: var(--radius-md); padding: 12px 6px; cursor: pointer; text-align: center; transition: var(--transition-quick);">
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main);">4 Books</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Large</div>
          </div>
          <div class="density-card ${currentDensity === '6' ? 'active' : ''}" data-density="6" style="flex: 1; background: var(--bg-secondary); border: 2px solid ${currentDensity === '6' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: var(--radius-md); padding: 12px 6px; cursor: pointer; text-align: center; transition: var(--transition-quick);">
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main);">6 Books</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Standard</div>
          </div>
          <div class="density-card ${currentDensity === '8' ? 'active' : ''}" data-density="8" style="flex: 1; background: var(--bg-secondary); border: 2px solid ${currentDensity === '8' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: var(--radius-md); padding: 12px 6px; cursor: pointer; text-align: center; transition: var(--transition-quick);">
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main);">8 Books</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Compact</div>
          </div>
          <div class="density-card ${currentDensity === '10' ? 'active' : ''}" data-density="10" style="flex: 1; background: var(--bg-secondary); border: 2px solid ${currentDensity === '10' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: var(--radius-md); padding: 12px 6px; cursor: pointer; text-align: center; transition: var(--transition-quick);">
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main);">10 Books</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Dense</div>
          </div>
        </div>
      </section>

      <!-- Section 5: Keyboard Shortcuts Cheat Sheet -->
      <section class="settings-section">
        <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="keyboard" style="color: var(--accent-primary); width: 18px; height: 18px;"></i>
          Keyboard Shortcuts
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
          Quick hotkeys available during audio playback.
        </p>
        
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px 20px; max-width: 520px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Play / Pause</span>
            <kbd style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 8px; font-family: monospace; font-size: 0.78rem; font-weight: 600; color: var(--accent-primary);">Space</kbd>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Rewind / Fast Forward 15s</span>
            <div>
              <kbd style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 0.78rem; font-weight: 600; color: var(--accent-primary);">← / →</kbd>
              <span style="font-size: 0.75rem; color: var(--text-muted); margin: 0 2px;">or</span>
              <kbd style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 0.78rem; font-weight: 600; color: var(--accent-primary);">J / L</kbd>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Volume Up / Down</span>
            <kbd style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 0.78rem; font-weight: 600; color: var(--accent-primary);">↑ / ↓</kbd>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Mute Toggle</span>
            <kbd style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 0.78rem; font-weight: 600; color: var(--accent-primary);">M</kbd>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Next / Previous Chapter</span>
            <kbd style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 0.78rem; font-weight: 600; color: var(--accent-primary);">N / P</kbd>
          </div>
        </div>
      </section>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Setup click triggers on base theme cards
  container.querySelectorAll(".theme-card").forEach(card => {
    card.addEventListener("click", () => {
      const selectedBase = card.dataset.classname;
      localStorage.setItem("aura_base_theme", selectedBase);
      window.dispatchEvent(new CustomEvent("aura-settings-changed"));
      renderSettings();
    });
  });

  // Setup click triggers on accent color cards
  container.querySelectorAll(".accent-card").forEach(card => {
    card.addEventListener("click", () => {
      const selectedAccent = card.dataset.classname;
      localStorage.setItem("aura_accent_color", selectedAccent);
      window.dispatchEvent(new CustomEvent("aura-settings-changed"));
      renderSettings();
    });
  });

  // Setup click triggers on Visual FX toggle buttons
  container.querySelectorAll(".toggle-fx-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const settingKey = btn.dataset.setting;
      const current = localStorage.getItem(settingKey) !== "false";
      localStorage.setItem(settingKey, (!current) ? "true" : "false");
      window.dispatchEvent(new CustomEvent("aura-settings-changed"));
      renderSettings();
    });
  });

  // Setup click triggers on density cards
  container.querySelectorAll(".density-card").forEach(card => {
    card.addEventListener("click", () => {
      const density = card.dataset.density;
      localStorage.setItem("aura_grid_density", density);
      renderSettings();
    });
  });

  // Server URL save button handler
  const saveServerBtn = document.getElementById("save-server-url-btn");
  const serverInput = document.getElementById("server-url-input");
  if (saveServerBtn && serverInput) {
    saveServerBtn.addEventListener("click", () => {
      const val = serverInput.value.trim();
      if (val === "") {
        localStorage.removeItem("aura_server_url");
      } else {
        localStorage.setItem("aura_server_url", val);
      }
      renderSettings();
    });
  }
};
