// Equalizer & Audio DSP Studio Module
import { player } from "./player.js";

let animFrameId = null;

export const renderEqualizer = () => {
  const container = document.getElementById("main-content");
  if (!container) return;

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  container.className = "fade-in";
  container.style.overflowY = "auto";

  const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const freqLabels = ["32Hz", "64Hz", "125Hz", "250Hz", "500Hz", "1kHz", "2kHz", "4kHz", "8kHz", "16kHz"];
  const subLabels = ["Sub-Bass", "Bass", "Upper Bass", "Warmth", "Midrange", "Vocal Clarity", "Speech", "Treble", "Brilliance", "Air"];

  const presets = [
    { id: "vocal", name: "Vocal Boost", gains: [-2, -1, 0, 1, 2, 4, 4, 3, 1, 0] },
    { id: "flat", name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: "bass", name: "Bass Boost", gains: [6, 5, 4, 2, 0, -1, 0, 1, 1, 0] },
    { id: "podcast", name: "Spoken Word", gains: [-4, -3, -1, 1, 3, 4, 3, 2, 0, -1] },
    { id: "treble", name: "Treble Detail", gains: [-2, -1, 0, 0, 1, 2, 3, 5, 4, 3] },
    { id: "night", name: "Late Night", gains: [2, 2, 1, 0, -1, -2, -2, -3, -4, -5] }
  ];

  const currentGains = player.eqGains || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const isEnabled = player.eqEnabled;

  // Build Presets Cards HTML
  const presetsHtml = presets.map(p => {
    return `
      <button class="eq-preset-btn" data-id="${p.id}" data-gains='${JSON.stringify(p.gains)}'>
        ${p.name}
      </button>
    `;
  }).join("");

  // Build 10-Band Sliders HTML
  const slidersHtml = frequencies.map((freq, idx) => {
    const gainVal = currentGains[idx] || 0;
    const formattedVal = gainVal > 0 ? `+${gainVal} dB` : `${gainVal} dB`;
    return `
      <div class="eq-band-col">
        <span class="eq-val-badge" id="eq-val-${idx}">${formattedVal}</span>
        <div class="eq-slider-wrapper">
          <input 
            type="range" 
            class="eq-slider-vertical" 
            data-idx="${idx}" 
            min="-12" 
            max="12" 
            step="1" 
            value="${gainVal}"
          />
        </div>
        <span class="eq-freq-label">${freqLabels[idx]}</span>
        <span class="eq-sub-label">${subLabels[idx]}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="equalizer-container">
      <!-- Header -->
      <div class="library-header" style="margin-bottom: 24px;">
        <div class="welcome-section">
          <h1>Equalizer & Audio DSP Studio</h1>
          <p>Fine-tune frequency bands for maximum vocal clarity, rich bass, and speech presence.</p>
        </div>
        
        <div class="eq-master-toggle-box">
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Equalizer Engine</span>
          <button class="eq-power-btn ${isEnabled ? 'active' : ''}" id="eq-power-btn">
            <i data-lucide="power"></i>
            <span id="eq-power-label">${isEnabled ? 'Enabled' : 'Disabled'}</span>
          </button>
        </div>
      </div>

      <!-- Live Spectrum Visualizer Canvas -->
      <div class="eq-visualizer-card">
        <canvas id="eq-spectrum-canvas" width="800" height="100"></canvas>
      </div>

      <!-- Presets Section -->
      <div class="eq-presets-section">
        <h3 class="eq-section-title">
          <i data-lucide="sliders"></i>
          Audio Presets
        </h3>
        <div class="eq-presets-grid">
          ${presetsHtml}
          <button class="eq-preset-btn" id="eq-reset-btn">
            Reset (0 dB)
          </button>
        </div>
      </div>

      <!-- 10-Band Faders -->
      <div class="eq-faders-card">
        <div class="eq-bands-flex">
          ${slidersHtml}
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
  setupEqualizerEvents(container);
  startSpectrumVisualizer();
};

const setupEqualizerEvents = (container) => {
  // Power Toggle
  const powerBtn = document.getElementById("eq-power-btn");
  const powerLabel = document.getElementById("eq-power-label");
  if (powerBtn) {
    powerBtn.addEventListener("click", () => {
      const newState = !player.eqEnabled;
      player.setEqEnabled(newState);
      powerBtn.classList.toggle("active", newState);
      if (powerLabel) powerLabel.textContent = newState ? "Enabled" : "Disabled";
    });
  }

  // Sliders
  container.querySelectorAll(".eq-slider-vertical").forEach(slider => {
    slider.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const val = parseInt(e.target.value);
      player.setEqGain(idx, val);

      const valBadge = document.getElementById(`eq-val-${idx}`);
      if (valBadge) {
        valBadge.textContent = val > 0 ? `+${val} dB` : `${val} dB`;
      }
    });
  });

  // Presets
  container.querySelectorAll(".eq-preset-btn[data-gains]").forEach(btn => {
    btn.addEventListener("click", () => {
      try {
        const gains = JSON.parse(btn.dataset.gains);
        player.applyEqPreset(gains);

        // Update Slider UI
        gains.forEach((val, idx) => {
          const slider = container.querySelector(`.eq-slider-vertical[data-idx="${idx}"]`);
          if (slider) slider.value = val;
          const valBadge = document.getElementById(`eq-val-${idx}`);
          if (valBadge) valBadge.textContent = val > 0 ? `+${val} dB` : `${val} dB`;
        });

        // Highlight active preset
        container.querySelectorAll(".eq-preset-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      } catch (err) {
        console.error("Failed to parse preset gains:", err);
      }
    });
  });

  // Reset Button
  const resetBtn = document.getElementById("eq-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const flatGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      player.applyEqPreset(flatGains);
      flatGains.forEach((val, idx) => {
        const slider = container.querySelector(`.eq-slider-vertical[data-idx="${idx}"]`);
        if (slider) slider.value = val;
        const valBadge = document.getElementById(`eq-val-${idx}`);
        if (valBadge) valBadge.textContent = "0 dB";
      });
      container.querySelectorAll(".eq-preset-btn").forEach(b => b.classList.remove("active"));
    });
  }
};

const startSpectrumVisualizer = () => {
  const canvas = document.getElementById("eq-spectrum-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const renderFrame = () => {
    animFrameId = requestAnimationFrame(renderFrame);

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Dark canvas background
    ctx.fillStyle = "#161618";
    ctx.fillRect(0, 0, width, height);

    let dataArray = null;
    if (player.analyserNode && player.isPlaying) {
      const bufferLength = player.analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      player.analyserNode.getByteFrequencyData(dataArray);
    }

    const barCount = 32;
    const barWidth = (width / barCount) - 4;
    
    for (let i = 0; i < barCount; i++) {
      let value = 0;
      if (dataArray && dataArray.length > 0) {
        const dataIdx = Math.floor((i / barCount) * dataArray.length);
        value = dataArray[dataIdx] || 0;
      } else {
        // Idle ambient pulse
        value = Math.sin(Date.now() * 0.003 + i * 0.2) * 6 + 6;
      }

      const barHeight = Math.max(4, (value / 255) * (height - 16));
      const x = i * (barWidth + 4) + 2;
      const y = height - barHeight - 8;

      // Dynamic Gradient
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      gradient.addColorStop(1, player.eqEnabled ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.4)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      ctx.fill();
    }
  };

  renderFrame();
};

