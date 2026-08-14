// Now Playing Page Module - Focused Immersive Player
import { player } from "./player.js";
import { getApiBase } from "./config.js";
import { openEpubReader } from "./epub_reader.js";

export const renderNowPlaying = () => {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;

  // Always force-hide the bottom player bar — it must never show on this page
  const playerBar = document.getElementById("audio-player-bar");
  if (playerBar) playerBar.style.display = "none";

  const book = player.currentBook;

  // Case 1: No audiobook selected/playing yet
  if (!book) {
    mainContent.style.overflowY = "hidden";
  mainContent.style.paddingBottom = "20px";
  mainContent.innerHTML = `
      <div class="np-placeholder-container fade-in">
        <div class="np-placeholder-icon">
          <i data-lucide="headphones"></i>
        </div>
        <h2>Ready for a story?</h2>
        <p>Choose an audiobook from your library to start your listening experience.</p>
        <a href="#library" class="np-placeholder-btn">Browse Library</a>
      </div>
    `;
    if (window.lucide) {
      window.lucide.createIcons();
    }
    return;
  }

  // Case 2: Audiobook is active. Render focused Now Playing experience.
  const activeChapter = book.chapters && book.chapters[player.currentChapterIndex] 
    ? book.chapters[player.currentChapterIndex] 
    : { title: "Chapter 1", duration: book.duration || 0 };
  
  // Hash the title string to derive a unique but consistent HSL color hue
  let hash = 0;
  const title = book.title || "";
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const color1 = `hsla(${hue}, 60%, 15%, 0.45)`;
  const color2 = `hsla(${(hue + 40) % 360}, 50%, 8%, 0.15)`;
  
  let coverUrl = book.cover;
  if (book.id) {
    try {
      const savedMeta = localStorage.getItem(`aura_meta_${book.id}`);
      if (savedMeta) {
        const overrides = JSON.parse(savedMeta);
        if (overrides.cover) coverUrl = overrides.cover;
      }
    } catch (e) {}
  }
  if (!coverUrl && typeof book.id === "number") {
    coverUrl = `${getApiBase()}/api/audiobooks/${book.id}/cover`;
  }
  if (!coverUrl) coverUrl = "assets/covers/default.png";
  const totalDuration = player.audio.duration || book.duration || 0;

  mainContent.innerHTML = `
    <div class="np-player-container fade-in">
      <div class="np-player-card">
        <!-- 1. Large Crisp Artwork -->
        <div class="np-artwork-wrapper">
          <img src="${coverUrl}" alt="${book.title}" id="np-cover" />
        </div>

        <!-- 2. Title & Creators -->
        <div class="np-info-section">
          <h1 class="np-title-label" id="np-title">${book.title}</h1>
          <p class="np-author-label" id="np-author">By ${book.author}</p>
          <div class="np-chapter-badge">
            <i data-lucide="bookmark"></i>
            <span id="np-chapter-title">${activeChapter.title}</span>
          </div>
        </div>

        <!-- 3. Playback Progress Slider -->
        <div class="np-scrubber-section">
          <div class="np-timeline-container">
            <span class="np-time-label" id="np-current-time">0:00</span>
            <div class="np-slider-wrapper">
              <input 
                type="range" 
                id="np-timeline" 
                class="timeline-slider" 
                min="0" 
                max="${totalDuration}" 
                value="${player.audio.currentTime}"
                aria-label="Audio Timeline"
              />
            </div>
            <span class="np-time-label" id="np-total-time">${player.formatTime(totalDuration)}</span>
          </div>
          <div class="np-view-mode-bar" style="display: flex; justify-content: flex-end; margin-top: 6px;">
            <button class="player-btn player-btn-secondary player-view-mode-btn" id="np-view-mode-btn" title="Toggle Book / Chapter View">
              <i data-lucide="split"></i>
              <span>${player.timelineMode === "chapter" ? "Chapter View" : "Book View"}</span>
            </button>
          </div>
        </div>

        <!-- 4. Playback Controls (tactile & clean) -->
        <div class="np-controls-section">
          <!-- Previous Chapter -->
          <button class="np-ctrl-btn" id="np-prev-ch" title="Previous Chapter">
            <i data-lucide="skip-back"></i>
          </button>

          <!-- Skip Back 15s -->
          <button class="player-btn player-btn-skip-container" id="np-skip-back" title="Rewind 15s">
            <i data-lucide="rotate-ccw"></i>
          </button>

          <!-- Master Play/Pause -->
          <button class="np-play-btn" id="np-play-pause" title="Play / Pause">
            <i data-lucide="${player.isPlaying ? 'pause' : 'play'}"></i>
          </button>

          <!-- Skip Forward 30s -->
          <button class="player-btn player-btn-skip-container" id="np-skip-fwd" title="Fast Forward 30s">
            <i data-lucide="rotate-cw"></i>
          </button>

          <!-- Next Chapter -->
          <button class="np-ctrl-btn" id="np-next-ch" title="Next Chapter">
            <i data-lucide="skip-forward"></i>
          </button>
        </div>

        <!-- 5. Secondary Utility Toolbar -->
        <div class="np-utilities-toolbar">
          <!-- Chapters Selector -->

          <!-- Chapters Selector -->
          <div class="util-btn" id="np-chapters-btn" title="Chapters List" role="button" tabindex="0">
            <i data-lucide="list-music"></i>
            <span>Chapters</span>
            <div class="util-popup np-chapters-popup" id="np-chapters-popup">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- Read eBook Button -->
          <div class="util-btn" id="np-read-epub-btn" title="Read & Listen eBook" role="button" tabindex="0" style="background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.4); color: #a78bfa;">
            <i data-lucide="book-open"></i>
            <span>Read</span>
          </div>

          <!-- Playback Speed Modifier -->
          <div class="util-btn" id="np-speed-btn" title="Playback Speed" role="button" tabindex="0">
            <i data-lucide="gauge"></i>
            <span id="np-speed-label">${player.playbackSpeed}x</span>
            <div class="util-popup" id="np-speed-popup">
              <button class="popup-item ${player.playbackSpeed === 1 ? 'active' : ''}" data-rate="1.0">1.0x Normal</button>
              <button class="popup-item ${player.playbackSpeed === 1.25 ? 'active' : ''}" data-rate="1.25">1.25x Speed</button>
              <button class="popup-item ${player.playbackSpeed === 1.5 ? 'active' : ''}" data-rate="1.5">1.5x Speed</button>
              <button class="popup-item ${player.playbackSpeed === 2.0 ? 'active' : ''}" data-rate="2.0">2.0x Fast</button>
            </div>
          </div>

          <!-- Sleep Timer Indicator -->
          <div class="util-btn" id="np-sleep-btn" title="Sleep Timer" role="button" tabindex="0">
            <i data-lucide="timer"></i>
            <span id="np-sleep-label">${player.sleepSecondsLeft > 0 ? player.formatSleepTime(player.sleepSecondsLeft) : 'Sleep'}</span>
            <div class="util-popup" id="np-sleep-popup">
              <button class="popup-item ${player.sleepSecondsLeft === 0 ? 'active' : ''}" data-mins="0">Off</button>
              <button class="popup-item" data-mins="10">10 Minutes</button>
              <button class="popup-item" data-mins="15">15 Minutes</button>
              <button class="popup-item" data-mins="30">30 Minutes</button>
              <button class="popup-item" data-mins="45">45 Minutes</button>
              <button class="popup-item" data-mins="60">60 Minutes</button>
            </div>
          </div>

          <!-- Volume Controller -->
          <div class="volume-container">
            <button class="player-btn" id="np-volume-mute" title="Mute Toggle">
              <i data-lucide="${player.isMuted ? 'volume-x' : 'volume-2'}" id="np-volume-icon"></i>
            </button>
            <input 
              type="range" 
              id="np-volume" 
              class="volume-slider" 
              min="0" 
              max="1" 
              step="any" 
              value="${player.isMuted ? 0 : player.volume}"
              aria-label="Volume Slider"
            />
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Hook up event listeners inside the Now Playing view
  setupNPEventListeners(book, coverUrl);

  // Trigger slider color progress fills
  player.updateUI();
};

const setupNPEventListeners = (book, coverUrl) => {
  const playBtn = document.getElementById("np-play-pause");
  const skipBack = document.getElementById("np-skip-back");
  const skipFwd = document.getElementById("np-skip-fwd");
  const prevCh = document.getElementById("np-prev-ch");
  const nextCh = document.getElementById("np-next-ch");
  const timeline = document.getElementById("np-timeline");
  const volume = document.getElementById("np-volume");
  const muteBtn = document.getElementById("np-volume-mute");

  const speedBtn = document.getElementById("np-speed-btn");
  const speedPopup = document.getElementById("np-speed-popup");
  const sleepBtn = document.getElementById("np-sleep-btn");
  const sleepPopup = document.getElementById("np-sleep-popup");
  const chaptersBtn = document.getElementById("np-chapters-btn");
  const chaptersPopup = document.getElementById("np-chapters-popup");
  const viewModeBtn = document.getElementById("np-view-mode-btn");
  const artworkWrapper = document.querySelector(".np-artwork-wrapper");

  const readEpubBtn = document.getElementById("np-read-epub-btn");
  if (readEpubBtn) {
    readEpubBtn.addEventListener("click", () => {
      try {
        openEpubReader(book, player.currentChapterIndex || 0);
      } catch (err) {
        console.error("Failed to open EPUB reader from Now Playing view:", err);
      }
    });
  }

  if (artworkWrapper) {
    artworkWrapper.style.cursor = "pointer";
    artworkWrapper.setAttribute("title", "View Book Details & Chapters");
    artworkWrapper.addEventListener("click", () => {
      if (player.currentBook && player.currentBook.id) {
        location.hash = `#book/${player.currentBook.id}`;
      }
    });
  }

  if (viewModeBtn) {
    viewModeBtn.addEventListener("click", () => {
      player.toggleTimelineMode();
    });
  }

  if (playBtn) {
    playBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      player.togglePlay();
    });
  }

  if (skipBack) {
    skipBack.addEventListener("click", () => player.skip(-15));
  }
  if (skipFwd) {
    skipFwd.addEventListener("click", () => player.skip(30));
  }
  if (prevCh) {
    prevCh.addEventListener("click", () => player.prevChapter());
  }
  if (nextCh) {
    nextCh.addEventListener("click", () => player.nextChapter());
  }

  if (timeline) {
    timeline.addEventListener("input", (e) => {
      player.isUserSeeking = true;
      const seconds = parseFloat(e.target.value);
      const maxVal = parseFloat(timeline.max) || 1;
      let displayTime = player.formatTime(seconds);
      if (player.showTimeRemaining) {
        displayTime = `-${player.formatTime(Math.max(0, maxVal - seconds))}`;
      }
      const npCurrent = document.getElementById("np-current-time");
      if (npCurrent) npCurrent.textContent = displayTime;
      const pct = (seconds / maxVal) * 100;
      player.updateSliderFill(timeline, pct);
    });

    timeline.addEventListener("change", (e) => {
      player.seek(parseFloat(e.target.value));
    });

    if (timeline.parentElement) {
      const wrapper = timeline.parentElement;
      let isDraggingWrapper = false;

      const handleSeekFromPointer = (e) => {
        const rect = wrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        const maxVal = parseFloat(timeline.max) || 1;
        const targetSeconds = ratio * maxVal;
        timeline.value = targetSeconds;
        player.updateSliderFill(timeline, ratio * 100);

        let displayTime = player.formatTime(targetSeconds);
        if (player.showTimeRemaining) {
          displayTime = `-${player.formatTime(Math.max(0, maxVal - targetSeconds))}`;
        }
        const npCurrent = document.getElementById("np-current-time");
        if (npCurrent) npCurrent.textContent = displayTime;
        return targetSeconds;
      };

      wrapper.addEventListener("pointerdown", (e) => {
        if (e.target === timeline) return;
        isDraggingWrapper = true;
        player.isUserSeeking = true;
        try { wrapper.setPointerCapture(e.pointerId); } catch (_) {}
        handleSeekFromPointer(e);
      });

      wrapper.addEventListener("pointermove", (e) => {
        if (!isDraggingWrapper) return;
        handleSeekFromPointer(e);
      });

      const stopWrapperDrag = (e) => {
        if (!isDraggingWrapper) return;
        isDraggingWrapper = false;
        const targetSeconds = handleSeekFromPointer(e);
        player.seek(targetSeconds);
      };

      wrapper.addEventListener("pointerup", stopWrapperDrag);
      wrapper.addEventListener("pointercancel", stopWrapperDrag);
    }
  }

  // Time remaining toggle on Now Playing time labels
  const npCurrentTime = document.getElementById("np-current-time");
  const npTotalTime = document.getElementById("np-total-time");
  [npCurrentTime, npTotalTime].forEach(el => {
    if (el) {
      el.style.cursor = "pointer";
      el.setAttribute("title", "Click to toggle Time Elapsed / Time Remaining");
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        player.toggleTimeDisplayMode();
      });
    }
  });

  if (volume) {
    volume.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      player.setVolume(val);
      const pct = val * 100;
      player.updateSliderFill(volume, pct);
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      player.toggleMute();
      const muteIcon = document.getElementById("np-volume-icon");
      if (muteIcon) {
        muteIcon.setAttribute("data-lucide", player.isMuted ? "volume-x" : "volume-2");
        if (window.lucide) window.lucide.createIcons();
      }
      if (volume) {
        const targetVal = player.isMuted ? 0 : player.volume;
        volume.value = targetVal;
        player.updateSliderFill(volume, targetVal * 100);
      }
    });
  }

  // Chapters popover list population & click handling
  if (chaptersPopup && player.currentBook && player.currentBook.chapters) {
    chaptersPopup.innerHTML = player.currentBook.chapters.map((ch, idx) => {
      const isActive = idx === player.currentChapterIndex;
      return `
        <button class="popup-item ${isActive ? 'active' : ''}" data-idx="${idx}">
          ${ch.title}
        </button>
      `;
    }).join("");

    chaptersPopup.querySelectorAll(".popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(item.dataset.idx, 10);
        player.playChapter(idx);
        renderNowPlaying();
      });
    });
  }

  if (chaptersBtn) {
    chaptersBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chaptersBtn.classList.toggle("active");
      if (speedBtn) speedBtn.classList.remove("active");
      if (sleepBtn) sleepBtn.classList.remove("active");
    });
  }

  // Playback Speed dropdown logic
  if (speedBtn && speedPopup) {
    speedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      speedBtn.classList.toggle("active");
      if (sleepBtn) sleepBtn.classList.remove("active");
      if (chaptersBtn) chaptersBtn.classList.remove("active");
    });

    speedPopup.querySelectorAll(".popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const rate = parseFloat(item.dataset.rate);
        player.setSpeed(rate);
        
        // Update labels & active status
        document.getElementById("np-speed-label").textContent = `${rate}x`;
        speedPopup.querySelectorAll(".popup-item").forEach(p => p.classList.remove("active"));
        item.classList.add("active");
        speedBtn.classList.remove("active");
      });
    });
  }

  // Sleep Timer dropdown logic
  if (sleepBtn && sleepPopup) {
    sleepBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sleepBtn.classList.toggle("active");
      if (speedBtn) speedBtn.classList.remove("active");
      if (chaptersBtn) chaptersBtn.classList.remove("active");
    });

    sleepPopup.querySelectorAll(".popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const mins = parseInt(item.dataset.mins);
        player.setSleepTimer(mins);

        sleepPopup.querySelectorAll(".popup-item").forEach(p => p.classList.remove("active"));
        item.classList.add("active");
        sleepBtn.classList.remove("active");
      });
    });
  }

  // Document listener to close popups on outside click
  document.addEventListener("click", () => {
    if (speedBtn) speedBtn.classList.remove("active");
    if (sleepBtn) sleepBtn.classList.remove("active");
    if (chaptersBtn) chaptersBtn.classList.remove("active");
  });
};
