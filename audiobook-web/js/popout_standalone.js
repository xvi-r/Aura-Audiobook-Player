// Standalone Popup Window Controller for popout.html

function getPlayer() {
  if (window.opener && window.opener.player) return window.opener.player;
  if (window.player) return window.player;
  return null;
}

let p = getPlayer();

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => (n < 10 ? `0${n}` : n);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function updateSliderFill(slider, percent) {
  if (!slider) return;
  const p = Math.max(0, Math.min(100, percent));
  slider.style.background = `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${p}%, var(--border-color) ${p}%, var(--border-color) 100%)`;
}

function init() {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  p = getPlayer();
  if (!p) {
    let attempts = 0;
    const retryTimer = setInterval(() => {
      attempts++;
      p = getPlayer();
      if (p) {
        clearInterval(retryTimer);
        setupPlayer();
      } else if (attempts >= 30) {
        clearInterval(retryTimer);
        console.warn("[Aura Pop-out] Main window player reference not detected after retries.");
      }
    }, 100);
    return;
  }

  setupPlayer();
}

function setupPlayer() {

  // Play / Pause
  document.getElementById("popout-play-pause")?.addEventListener("click", () => {
    p.togglePlay();
  });

  // Previous & Next Chapter
  document.getElementById("popout-prev-chapter")?.addEventListener("click", () => {
    p.prevChapter();
  });
  document.getElementById("popout-next-chapter")?.addEventListener("click", () => {
    p.nextChapter();
  });

  // Skip Rewind & Forward
  document.getElementById("popout-rewind")?.addEventListener("click", () => {
    p.skip(-15);
  });
  document.getElementById("popout-forward")?.addEventListener("click", () => {
    p.skip(30);
  });

  // Scrubber
  const timeline = document.getElementById("popout-timeline");
  const elapsedLabel = document.getElementById("popout-time-elapsed");

  if (timeline) {
    timeline.addEventListener("input", (e) => {
      p.isUserSeeking = true;
      const val = parseFloat(e.target.value);
      const max = parseFloat(e.target.max) || 1;
      updateSliderFill(e.target, (val / max) * 100);

      let displayTime = formatTime(val);
      if (p.showTimeRemaining) {
        displayTime = `-${formatTime(Math.max(0, max - val))}`;
      }
      if (elapsedLabel) elapsedLabel.textContent = displayTime;
    });

    timeline.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      p.seek(val);
      p.isUserSeeking = false;
    });
  }

  // Toggle Time Display Mode (Elapsed vs Remaining) on time labels click
  const attachTimeToggle = (el) => {
    if (el) {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (p) p.toggleTimeDisplayMode();
      });
    }
  };
  attachTimeToggle(document.getElementById("popout-time-elapsed"));
  attachTimeToggle(document.getElementById("popout-time-duration"));

  // View Mode Button
  document.getElementById("popout-view-mode-btn")?.addEventListener("click", () => {
    p.toggleTimelineMode();
  });

  // Speed Popover
  const speedBtn = document.getElementById("popout-speed-btn");
  speedBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    speedBtn.classList.toggle("active");
  });
  document.querySelectorAll("#popout-speed-popup .popup-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const rate = parseFloat(item.getAttribute("data-rate"));
      p.setPlaybackSpeed(rate);
      speedBtn?.classList.remove("active");
    });
  });

  // Sleep Timer Popover
  const sleepBtn = document.getElementById("popout-sleep-btn");
  sleepBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    sleepBtn.classList.toggle("active");
  });
  document.querySelectorAll("#popout-sleep-popup .popup-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const mins = item.getAttribute("data-mins");
      if (mins === "chapter") {
        p.setSleepAtEndOfChapter();
      } else {
        p.setSleepTimer(parseInt(mins, 10));
      }
      sleepBtn?.classList.remove("active");
    });
  });

  // Chapters Popover
  const chaptersBtn = document.getElementById("popout-chapters-btn");
  chaptersBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    populateChapters();
    chaptersBtn.classList.toggle("active");
  });

  // Volume
  const volumeSlider = document.getElementById("popout-volume");
  if (volumeSlider) {
    volumeSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      p.setVolume(val);
    });
  }
  document.getElementById("popout-volume-mute")?.addEventListener("click", () => {
    p.toggleMute();
  });

  // Close popups on click outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#popout-speed-btn")) speedBtn?.classList.remove("active");
    if (!e.target.closest("#popout-sleep-btn")) sleepBtn?.classList.remove("active");
    if (!e.target.closest("#popout-chapters-btn")) chaptersBtn?.classList.remove("active");
  });

  // Listen to window.opener events
  try {
    window.opener.addEventListener("audiobook-time-update", () => updateProgress());
    window.opener.addEventListener("audiobook-track-change", () => update());
    window.opener.addEventListener("audiobook-play-state-change", () => update());
  } catch (err) {}

  update();
}

function populateChapters() {
  if (!p) p = getPlayer();
  const popup = document.getElementById("popout-chapters-popup");
  if (!popup || !p || !p.currentBook) return;

  const chapters = (p.currentBook.chapters && p.currentBook.chapters.length > 0)
    ? p.currentBook.chapters
    : [{ title: "Full Audiobook", startTimeMs: 0 }];

  popup.innerHTML = chapters.map((ch, idx) => {
    const isActive = idx === p.currentChapterIndex;
    const dur = p.getChapterDuration(ch, idx, chapters);
    const durStr = dur > 0 ? formatTime(dur) : "";

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
      p.playChapter(idx);
      document.getElementById("popout-chapters-btn")?.classList.remove("active");
    });
  });
}

function update() {
  if (!p) p = getPlayer();
  if (!p || !p.currentBook) return;
  const book = p.currentBook;

  // Cover
  const coverEl = document.getElementById("popout-cover");
  const placeholderEl = document.getElementById("popout-cover-placeholder");
  if (coverEl) {
    let coverSrc = book.cover || book.coverPath;
    if (!coverSrc && typeof book.id === "number") {
      coverSrc = `/api/audiobooks/${book.id}/cover`;
    }
    if (coverSrc) {
      coverEl.src = coverSrc;
      coverEl.alt = book.title || "Cover";
      coverEl.style.display = "block";
      if (placeholderEl) placeholderEl.style.display = "none";
      coverEl.onerror = () => {
        coverEl.style.display = "none";
        if (placeholderEl) placeholderEl.style.display = "flex";
      };
    } else {
      coverEl.style.display = "none";
      if (placeholderEl) placeholderEl.style.display = "flex";
    }
  }

  // Metadata
  const titleEl = document.getElementById("popout-title");
  if (titleEl) titleEl.textContent = book.title || "Untitled Book";

  const authorEl = document.getElementById("popout-author");
  if (authorEl) authorEl.textContent = book.author || "Unknown Author";

  const chapter = p.getCurrentChapter();
  const chapterTitleEl = document.getElementById("popout-chapter");
  if (chapterTitleEl) chapterTitleEl.textContent = chapter ? (chapter.title || chapter.name || "Chapter 1") : "Chapter 1";

  // Play / Pause Icon
  const playBtn = document.getElementById("popout-play-pause");
  if (playBtn) {
    const iconName = p.isPlaying ? "pause" : "play";
    playBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
  }

  // Speed
  const speedLabel = document.getElementById("popout-speed-label");
  if (speedLabel) speedLabel.textContent = `${p.playbackSpeed}x`;
  document.querySelectorAll("#popout-speed-popup .popup-item").forEach(item => {
    const rate = parseFloat(item.getAttribute("data-rate"));
    if (rate === p.playbackSpeed) item.classList.add("active");
    else item.classList.remove("active");
  });

  // Sleep
  const sleepLabel = document.getElementById("popout-sleep-label");
  if (sleepLabel) {
    if (p.sleepAtEndOfChapter) {
      sleepLabel.textContent = "Ch. End";
    } else if (p.sleepTimerRemaining > 0) {
      const m = Math.floor(p.sleepTimerRemaining / 60);
      const s = p.sleepTimerRemaining % 60;
      sleepLabel.textContent = `${m}:${s < 10 ? "0" : ""}${s}`;
    } else {
      sleepLabel.textContent = "Sleep";
    }
  }

  // Volume
  const volumeSlider = document.getElementById("popout-volume");
  if (volumeSlider) {
    volumeSlider.value = p.volume;
    updateSliderFill(volumeSlider, p.volume * 100);
  }
  const volumeIcon = document.getElementById("popout-volume-icon");
  if (volumeIcon) {
    let iconName = "volume-2";
    if (p.volume === 0) iconName = "volume-x";
    else if (p.volume < 0.3) iconName = "volume";
    else if (p.volume < 0.7) iconName = "volume-1";
    volumeIcon.setAttribute("data-lucide", iconName);
  }

  // View Mode Button
  const viewModeBtn = document.getElementById("popout-view-mode-btn");
  if (viewModeBtn) {
    const isChapter = p.timelineMode === "chapter";
    viewModeBtn.innerHTML = `<i data-lucide="${isChapter ? 'split' : 'book-open'}"></i>`;
  }

  updateProgress();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function updateProgress() {
  if (!p || !p.currentBook || p.isUserSeeking) return;
  const book = p.currentBook;

  const bookDuration = (p.audio && !isNaN(p.audio.duration) && p.audio.duration > 0)
    ? p.audio.duration
    : (book.duration || book.runtimeSeconds || 1);
  if (!bookDuration) return;

  const absoluteTime = (p.audio && !isNaN(p.audio.currentTime) && p.audio.currentTime > 0)
    ? p.audio.currentTime
    : (p.pendingTargetTime !== null && p.pendingTargetTime !== undefined ? p.pendingTargetTime : (book.position || book.progressSeconds || 0));

  let curVal = absoluteTime;
  let curMax = bookDuration;

  if (p.timelineMode === "chapter") {
    const curCh = p.getCurrentChapter();
    if (curCh) {
      const start = p.getChapterStartTime(curCh);
      const end = p.getChapterEndTime(curCh, p.currentChapterIndex);
      curMax = Math.max(1, end - start);
      curVal = Math.max(0, absoluteTime - start);
    }
  }

  const timeline = document.getElementById("popout-timeline");
  if (timeline) {
    timeline.max = curMax;
    timeline.value = curVal;
    const percent = Math.min(100, Math.max(0, (curVal / curMax) * 100));
    updateSliderFill(timeline, percent);
  }

  const elapsedLabel = document.getElementById("popout-time-elapsed");
  if (elapsedLabel) {
    let displayTime = formatTime(curVal);
    if (p.showTimeRemaining) {
      displayTime = `-${formatTime(Math.max(0, curMax - curVal))}`;
    }
    elapsedLabel.textContent = displayTime;
  }

  const durationLabel = document.getElementById("popout-time-duration");
  if (durationLabel) {
    durationLabel.textContent = formatTime(curMax);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
