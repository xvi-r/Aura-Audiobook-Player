// Aura Pop-out Mini Player Controller
import { player } from "./player.js";
import { getApiBase } from "./config.js";

class PopoutManager {
  constructor() {
    this.pipWindow = null;
    this.standaloneWindow = null;
    this.isSeeking = false;
  }

  isOpen() {
    return (this.pipWindow && !this.pipWindow.closed) || (this.standaloneWindow && !this.standaloneWindow.closed);
  }

  async toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      await this.open();
    }
  }

  close() {
    if (this.pipWindow && !this.pipWindow.closed) {
      try { this.pipWindow.close(); } catch (e) {}
      this.pipWindow = null;
    }
    if (this.standaloneWindow && !this.standaloneWindow.closed) {
      try { this.standaloneWindow.close(); } catch (e) {}
      this.standaloneWindow = null;
    }
  }

  async open() {
    // 1. Primary: Native Document Picture-in-Picture (Chromium Always-on-Top OS floating window)
    if (window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === "function") {
      try {
        const pip = await window.documentPictureInPicture.requestWindow({
          width: 360,
          height: 520
        });
        this.pipWindow = pip;
        this.setupPipWindow(pip);
        return;
      } catch (err) {
        console.warn("[Aura Pop-out] Document Picture-in-Picture request failed, falling back to popup window:", err);
      }
    }

    // 2. Fallback: Standalone popup window for browsers without Document PiP (e.g. Firefox)
    const w = 360;
    const h = 520;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top = Math.max(0, (window.screen.height - h) / 2);
    this.standaloneWindow = window.open(
      "/popout.html",
      "AuraPopoutPlayer",
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no`
    );
    if (this.standaloneWindow) {
      this.standaloneWindow.focus();
    }
  }

  setupPipWindow(pip) {
    const doc = pip.document;
    doc.title = "Aura Mini Player";

    // Copy all style and link tags into the PiP window head
    [...document.querySelectorAll("link[rel='stylesheet'], style")].forEach((el) => {
      doc.head.appendChild(el.cloneNode(true));
    });

    // Add popout.css link explicitly if not already present
    if (!doc.querySelector("link[href*='popout.css']")) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = "/css/popout.css";
      doc.head.appendChild(link);
    }

    // Apply exact body class
    doc.body.className = "popout-window-body";

    // Inject Pop-out HTML markup
    doc.body.innerHTML = `
      <div class="popout-player-container" id="popout-container">
        <!-- Main Content Body -->
        <main class="popout-body">
          <!-- Artwork -->
          <div class="popout-artwork-wrapper">
            <img id="popout-cover" src="assets/covers/default.png" alt="Cover" />
          </div>

          <!-- Metadata -->
          <div class="popout-meta">
            <div class="popout-track-title" id="popout-title">Untitled Book</div>
            <div class="popout-track-author" id="popout-author">Unknown Author</div>
            <div class="popout-chapter-badge">
              <span class="popout-chapter-title" id="popout-chapter">Chapter 1</span>
            </div>
          </div>

          <!-- Scrubber Timeline -->
          <div class="popout-timeline-container">
            <span class="popout-time-label" id="popout-time-elapsed">00:00</span>
            <div class="popout-timeline-slider-wrapper" id="popout-slider-wrapper">
              <input 
                type="range" 
                id="popout-timeline" 
                class="timeline-slider" 
                min="0" 
                max="100" 
                step="any"
                value="0"
                aria-label="Playback Progress"
              />
            </div>
            <span class="popout-time-label" id="popout-time-duration">00:00</span>
            <button class="popout-view-mode-btn" id="popout-view-mode-btn" title="Toggle Book / Chapter View">
              <i data-lucide="split"></i>
            </button>
          </div>

          <!-- Playback Buttons -->
          <div class="popout-controls">
            <button class="player-btn player-btn-secondary" id="popout-prev-chapter" title="Previous Chapter">
              <i data-lucide="skip-back"></i>
            </button>
            <button class="player-btn player-btn-secondary" id="popout-rewind" title="Rewind 15 seconds">
              <i data-lucide="rotate-ccw"></i>
            </button>
            <button class="player-btn player-btn-play" id="popout-play-pause" title="Play / Pause">
              <i data-lucide="play" id="popout-play-icon"></i>
            </button>
            <button class="player-btn player-btn-secondary" id="popout-forward" title="Skip forward 30 seconds">
              <i data-lucide="rotate-cw"></i>
            </button>
            <button class="player-btn player-btn-secondary" id="popout-next-chapter" title="Next Chapter">
              <i data-lucide="skip-forward"></i>
            </button>
          </div>
        </main>

        <!-- Utilities Toolbar -->
        <footer class="popout-utilities">
          <div class="popout-util-group">
            <!-- Chapters Dropdown -->
            <div class="util-btn" id="popout-chapters-btn" title="Select Chapter" role="button" tabindex="0">
              <i data-lucide="list"></i>
              <span id="popout-chapters-label">Chapters</span>
              <div class="util-popup util-popup-chapters" id="popout-chapters-popup"></div>
            </div>

            <!-- Speed Dropdown -->
            <div class="util-btn" id="popout-speed-btn" title="Playback Speed" role="button" tabindex="0">
              <i data-lucide="gauge"></i>
              <span id="popout-speed-label">1x</span>
              <div class="util-popup" id="popout-speed-popup">
                <button class="popup-item active" data-rate="1.0">1x</button>
                <button class="popup-item" data-rate="1.25">1.25x</button>
                <button class="popup-item" data-rate="1.5">1.5x</button>
                <button class="popup-item" data-rate="2.0">2x</button>
              </div>
            </div>

            <!-- Sleep Timer Dropdown -->
            <div class="util-btn" id="popout-sleep-btn" title="Sleep Timer" role="button" tabindex="0">
              <i data-lucide="timer"></i>
              <span id="popout-sleep-label">Sleep</span>
              <div class="util-popup" id="popout-sleep-popup">
                <button class="popup-item active" data-mins="0">Off</button>
                <button class="popup-item" data-mins="10">10m</button>
                <button class="popup-item" data-mins="15">15m</button>
                <button class="popup-item" data-mins="30">30m</button>
                <button class="popup-item" data-mins="45">45m</button>
                <button class="popup-item" data-mins="60">60m</button>
                <button class="popup-item" data-mins="chapter">End of Ch.</button>
              </div>
            </div>
          </div>

          <!-- Volume Controller -->
          <div class="popout-volume-container">
            <button class="popout-volume-btn" id="popout-volume-mute" title="Toggle Mute">
              <i data-lucide="volume-2" id="popout-volume-icon"></i>
            </button>
            <input 
              type="range" 
              id="popout-volume" 
              class="volume-slider" 
              min="0" 
              max="1" 
              step="any" 
              value="0.8"
              aria-label="Volume"
            />
          </div>
        </footer>
      </div>
    `;

    // Initialize Lucide icons inside PiP document
    if (window.lucide) {
      window.lucide.createIcons({ root: doc });
    }

    // Attach event listeners
    this.attachPipListeners(pip);

    // Initial UI render
    this.update();

    // Clean up when PiP window closes
    pip.addEventListener("pagehide", () => {
      this.pipWindow = null;
    });
  }

  attachPipListeners(pip) {
    const doc = pip.document;

    // Play/Pause
    doc.getElementById("popout-play-pause")?.addEventListener("click", () => {
      player.togglePlay();
    });

    // Previous & Next Chapter
    doc.getElementById("popout-prev-chapter")?.addEventListener("click", () => {
      player.prevChapter();
    });
    doc.getElementById("popout-next-chapter")?.addEventListener("click", () => {
      player.nextChapter();
    });

    // Skip Rewind & Forward
    doc.getElementById("popout-rewind")?.addEventListener("click", () => {
      player.skip(-15);
    });
    doc.getElementById("popout-forward")?.addEventListener("click", () => {
      player.skip(30);
    });

    // Timeline Scrubber
    const timeline = doc.getElementById("popout-timeline");
    const elapsedLabel = doc.getElementById("popout-time-elapsed");

    if (timeline) {
      timeline.addEventListener("input", (e) => {
        this.isSeeking = true;
        player.isUserSeeking = true;
        const val = parseFloat(e.target.value);
        const max = parseFloat(e.target.max) || 1;
        player.updateSliderFill(e.target, (val / max) * 100);

        let displayTime = player.formatTime(val);
        if (player.showTimeRemaining) {
          displayTime = `-${player.formatTime(Math.max(0, max - val))}`;
        }
        if (elapsedLabel) elapsedLabel.textContent = displayTime;
      });

      timeline.addEventListener("change", (e) => {
        const val = parseFloat(e.target.value);
        player.seek(val);
        this.isSeeking = false;
        player.isUserSeeking = false;
      });
    }

    // Toggle Time Display Mode (Elapsed vs Remaining) on time labels click
    const attachTimeToggle = (el) => {
      if (el) {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          player.toggleTimeDisplayMode();
        });
      }
    };
    attachTimeToggle(doc.getElementById("popout-time-elapsed"));
    attachTimeToggle(doc.getElementById("popout-time-duration"));

    // Timeline View Mode Toggle
    doc.getElementById("popout-view-mode-btn")?.addEventListener("click", () => {
      player.toggleTimelineMode();
    });

    // Speed Popover Toggle & Select
    const speedBtn = doc.getElementById("popout-speed-btn");
    speedBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      speedBtn.classList.toggle("active");
    });
    doc.querySelectorAll("#popout-speed-popup .popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const rate = parseFloat(item.getAttribute("data-rate"));
        player.setPlaybackSpeed(rate);
        speedBtn?.classList.remove("active");
      });
    });

    // Sleep Timer Popover Toggle & Select
    const sleepBtn = doc.getElementById("popout-sleep-btn");
    sleepBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      sleepBtn.classList.toggle("active");
    });
    doc.querySelectorAll("#popout-sleep-popup .popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const mins = item.getAttribute("data-mins");
        if (mins === "chapter") {
          player.setSleepAtEndOfChapter();
        } else {
          player.setSleepTimer(parseInt(mins, 10));
        }
        sleepBtn?.classList.remove("active");
      });
    });

    // Chapters Popover Toggle & Populate
    const chaptersBtn = doc.getElementById("popout-chapters-btn");
    chaptersBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.populatePipChapters(pip);
      chaptersBtn.classList.toggle("active");
    });

    // Volume Slider & Mute Toggle
    const volumeSlider = doc.getElementById("popout-volume");
    if (volumeSlider) {
      volumeSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        player.setVolume(val);
      });
    }
    doc.getElementById("popout-volume-mute")?.addEventListener("click", () => {
      player.toggleMute();
    });

    // Click outside to close popups
    doc.addEventListener("click", (e) => {
      if (!e.target.closest("#popout-speed-btn")) speedBtn?.classList.remove("active");
      if (!e.target.closest("#popout-sleep-btn")) sleepBtn?.classList.remove("active");
      if (!e.target.closest("#popout-chapters-btn")) chaptersBtn?.classList.remove("active");
    });
  }

  populatePipChapters(pip) {
    const doc = pip.document;
    const popup = doc.getElementById("popout-chapters-popup");
    if (!popup || !player.currentBook) return;

    const chapters = (player.currentBook.chapters && player.currentBook.chapters.length > 0)
      ? player.currentBook.chapters
      : [{ title: "Full Audiobook", startTimeMs: 0 }];

    popup.innerHTML = chapters.map((ch, idx) => {
      const isActive = idx === player.currentChapterIndex;
      const dur = player.getChapterDuration(ch, idx, chapters);
      const durStr = dur > 0 ? player.formatTime(dur) : "";

      return `
        <button class="popup-item chapter-popup-item ${isActive ? 'active' : ''}" data-idx="${idx}">
          <div class="chapter-item-info">
            <span class="chapter-title-text">${ch.title || ch.name || `Chapter ${idx + 1}`}</span>
            ${durStr ? `<span class="chapter-duration-text">${durStr}</span>` : ""}
          </div>
        </button>
      `;
    }).join("");

    popup.querySelectorAll(".chapter-popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(item.getAttribute("data-idx"), 10);
        player.playChapter(idx);
        doc.getElementById("popout-chapters-btn")?.classList.remove("active");
      });
    });
  }

  update() {
    if (!this.pipWindow || this.pipWindow.closed) return;
    const doc = this.pipWindow.document;
    const book = player.currentBook;
    if (!book) return;

    // 1. Cover Artwork
    const coverEl = doc.getElementById("popout-cover");
    if (coverEl) {
      const effectiveCover = book.cover || (typeof book.id === "number" ? `${getApiBase()}/api/audiobooks/${book.id}/cover` : "assets/covers/default.png");
      if (coverEl.src !== effectiveCover) {
        coverEl.src = effectiveCover;
        coverEl.alt = book.title || "Cover";
      }
    }

    // 2. Track Metadata
    const titleEl = doc.getElementById("popout-title");
    if (titleEl) titleEl.textContent = book.title || "Untitled Book";

    const authorEl = doc.getElementById("popout-author");
    if (authorEl) authorEl.textContent = book.author || "Unknown Author";

    const chapter = player.getCurrentChapter();
    const chapterTitleEl = doc.getElementById("popout-chapter");
    if (chapterTitleEl) chapterTitleEl.textContent = chapter ? (chapter.title || chapter.name || "Chapter 1") : "Chapter 1";

    // 3. Play / Pause button icon
    const playBtn = doc.getElementById("popout-play-pause");
    if (playBtn) {
      const iconName = player.isPlaying ? "pause" : "play";
      playBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    }

    // 5. Speed Label and Active Item
    const speedLabel = doc.getElementById("popout-speed-label");
    if (speedLabel) speedLabel.textContent = `${player.playbackSpeed}x`;
    doc.querySelectorAll("#popout-speed-popup .popup-item").forEach(item => {
      const rate = parseFloat(item.getAttribute("data-rate"));
      if (rate === player.playbackSpeed) item.classList.add("active");
      else item.classList.remove("active");
    });

    // 6. Sleep Timer Label
    const sleepLabel = doc.getElementById("popout-sleep-label");
    if (sleepLabel) {
      if (player.sleepAtEndOfChapter) {
        sleepLabel.textContent = "Ch. End";
      } else if (player.sleepTimerRemaining > 0) {
        const m = Math.floor(player.sleepTimerRemaining / 60);
        const s = player.sleepTimerRemaining % 60;
        sleepLabel.textContent = `${m}:${s < 10 ? "0" : ""}${s}`;
      } else {
        sleepLabel.textContent = "Sleep";
      }
    }

    // 7. Volume Slider & Mute Icon
    const volumeSlider = doc.getElementById("popout-volume");
    if (volumeSlider) {
      volumeSlider.value = player.volume;
      player.updateSliderFill(volumeSlider, player.volume * 100);
    }
    const volumeIcon = doc.getElementById("popout-volume-icon");
    if (volumeIcon) {
      let iconName = "volume-2";
      if (player.volume === 0) iconName = "volume-x";
      else if (player.volume < 0.3) iconName = "volume";
      else if (player.volume < 0.7) iconName = "volume-1";
      volumeIcon.setAttribute("data-lucide", iconName);
    }

    // 8. View Mode Button Icon
    const viewModeBtn = doc.getElementById("popout-view-mode-btn");
    if (viewModeBtn) {
      const isChapter = player.timelineMode === "chapter";
      viewModeBtn.innerHTML = `<i data-lucide="${isChapter ? 'split' : 'book-open'}"></i>`;
      viewModeBtn.setAttribute("title", `Toggle Book / Chapter View (${isChapter ? 'Chapter View' : 'Book View'})`);
    }

    // Update Progress Bar
    this.updateProgress();

    // Re-create icons inside PiP document
    if (window.lucide) {
      window.lucide.createIcons({ root: doc });
    }
  }

  updateProgress() {
    if (!this.pipWindow || this.pipWindow.closed || this.isSeeking) return;
    const doc = this.pipWindow.document;
    const book = player.currentBook;
    if (!book) return;

    const bookDuration = (player.audio && !isNaN(player.audio.duration) && player.audio.duration > 0)
      ? player.audio.duration
      : (book.duration || book.runtimeSeconds || 1);
    if (!bookDuration) return;

    const absoluteTime = (player.audio && !isNaN(player.audio.currentTime) && player.audio.currentTime > 0)
      ? player.audio.currentTime
      : (player.pendingTargetTime !== null && player.pendingTargetTime !== undefined ? player.pendingTargetTime : (book.position || book.progressSeconds || 0));

    let curVal = absoluteTime;
    let curMax = bookDuration;

    if (player.timelineMode === "chapter") {
      const curCh = player.getCurrentChapter();
      if (curCh) {
        const start = player.getChapterStartTime(curCh);
        const end = player.getChapterEndTime(curCh, player.currentChapterIndex);
        curMax = Math.max(1, end - start);
        curVal = Math.max(0, absoluteTime - start);
      }
    }

    const timeline = doc.getElementById("popout-timeline");
    if (timeline) {
      timeline.max = curMax;
      timeline.value = curVal;
      const percent = Math.min(100, Math.max(0, (curVal / curMax) * 100));
      player.updateSliderFill(timeline, percent);
    }

    const elapsedLabel = doc.getElementById("popout-time-elapsed");
    if (elapsedLabel) {
      let displayTime = player.formatTime(curVal);
      if (player.showTimeRemaining) {
        displayTime = `-${player.formatTime(Math.max(0, curMax - curVal))}`;
      }
      elapsedLabel.textContent = displayTime;
    }

    const durationLabel = doc.getElementById("popout-time-duration");
    if (durationLabel) {
      durationLabel.textContent = player.formatTime(curMax);
    }
  }
}

export const popoutManager = new PopoutManager();
