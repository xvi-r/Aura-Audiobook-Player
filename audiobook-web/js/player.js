// Audiobook Playback Engine (HTML5 Media Player)
import { AUDIOBOOKS } from "./data.js";
import { getApiBase, fetchWithTimeout } from "./config.js";
import { openEpubReader } from "./epub_reader.js";

class PlayerController {
  constructor() {
    this.currentBook = null;
    this.currentChapterIndex = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.volume = 0.8;
    this.sleepTimerMinutes = 0; // 0 means off
    this.sleepTimerRemaining = 0; // seconds remaining
    this.lastSyncTime = 0;
    this.isUserSeeking = false;
    this.timelineMode = localStorage.getItem("aura_timeline_mode") || "chapter";
    this.showTimeRemaining = localStorage.getItem("aura_show_time_remaining") === "true";

    // HTML5 Audio Engine
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";
    this.timerId = null;
    this.sleepTimerId = null;

    // DOM Elements
    this.playerBar = null;
    this.coverImg = null;
    this.titleLabel = null;
    this.authorLabel = null;
    this.chapterLabel = null;
    
    this.playBtn = null;
    this.prevChapterBtn = null;
    this.nextChapterBtn = null;
    this.rewindBtn = null;
    this.forwardBtn = null;
    
    this.timelineSlider = null;
    this.timeElapsedLabel = null;
    this.timeDurationLabel = null;
    this.viewModeBtn = null;

    this.volumeSlider = null;
    this.volumeIcon = null;
    
    this.speedBtn = null;
    this.speedLabel = null;
    this.speedPopup = null;
    
    this.sleepBtn = null;
    this.sleepLabel = null;
    this.sleepPopup = null;

    // Web Audio API Equalizer Engine
    this.audioCtx = null;
    this.audioSourceNode = null;
    this.eqBands = [];
    this.masterGainNode = null;
    this.compressorNode = null;
    this.analyserNode = null;
    this.eqEnabled = localStorage.getItem("aura_eq_enabled") === "true";
    this.eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.eqGains = JSON.parse(localStorage.getItem("aura_eq_gains") || "[0,0,0,0,0,0,0,0,0,0]");
  }

  async init() {
    this.cacheDOMElements();
    this.attachEventListeners();
    this.attachAudioListeners();

    const API_BASE = getApiBase();

    // Find the most recently played book id from localStorage
    let lastPlayedId = null;
    let lastPlayedTime = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("aura_last_played_")) {
        const t = parseInt(localStorage.getItem(key), 10);
        if (t > lastPlayedTime) {
          lastPlayedTime = t;
          lastPlayedId = key.replace("aura_last_played_", "");
        }
      }
    }

    // Fetch all books from backend (or fall back to local)
    let allBooks = [];
    try {
      const response = await fetchWithTimeout(`${API_BASE}/api/audiobooks`);
      if (response.ok) allBooks = await response.json();
    } catch (err) {
      console.warn("Backend offline during player init, using local data.", err);
    }
    if (!allBooks.length) allBooks = AUDIOBOOKS;

    // Pick the last played book, or fall back to the first book
    let initialBook = null;
    if (lastPlayedId) {
      initialBook = allBooks.find(b => String(b.id) === String(lastPlayedId)) || null;
    }
    if (!initialBook && allBooks.length > 0) {
      initialBook = allBooks[0];
    }

    if (initialBook) {
      // Fetch full book details (chapters etc.) from backend
      try {
        const detailsResponse = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${initialBook.id}`);
        if (detailsResponse.ok) initialBook = await detailsResponse.json();
      } catch (err) { /* fallback is fine */ }

      // Restore at saved position, don't auto-play
      this.loadBook(initialBook, 0, null, false);
    }

    this.updateUI();
  }

  cacheDOMElements() {
    this.playerBar = document.getElementById("audio-player-bar");
    this.coverImg = document.querySelector(".player-thumbnail img");
    this.titleLabel = document.querySelector(".player-track-title");
    this.authorLabel = document.querySelector(".player-track-author");
    this.chapterLabel = document.querySelector(".player-track-chapter");

    this.playBtn = document.getElementById("p-play-pause");
    this.prevChapterBtn = document.getElementById("p-prev-chapter");
    this.nextChapterBtn = document.getElementById("p-next-chapter");
    this.rewindBtn = document.getElementById("p-rewind");
    this.forwardBtn = document.getElementById("p-forward");

    this.timelineSlider = document.getElementById("p-timeline");
    this.timeElapsedLabel = document.getElementById("p-time-elapsed");
    this.timeDurationLabel = document.getElementById("p-time-duration");
    this.viewModeBtn = document.getElementById("p-view-mode-btn");

    this.volumeSlider = document.getElementById("p-volume");

    this.speedBtn = document.getElementById("p-speed-btn");
    this.speedLabel = document.getElementById("p-speed-label");
    this.speedPopup = document.getElementById("p-speed-popup");

    this.sleepBtn = document.getElementById("p-sleep-btn");
    this.sleepLabel = document.getElementById("p-sleep-label");
    this.sleepPopup = document.getElementById("p-sleep-popup");

    this.chaptersBtn = document.getElementById("p-chapters-btn");
    this.chaptersLabel = document.getElementById("p-chapters-label");
    this.chaptersPopup = document.getElementById("p-chapters-popup");
  }

  attachEventListeners() {
    // Playback events
    this.playBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePlay();
    });
    this.prevChapterBtn.addEventListener("click", () => this.prevChapter());
    this.nextChapterBtn.addEventListener("click", () => this.nextChapter());
    this.rewindBtn.addEventListener("click", () => this.skip(-15));
    this.forwardBtn.addEventListener("click", () => this.skip(30));

    // Read eBook EPUB Reader button
    const readEpubBtn = document.getElementById("p-read-epub-btn");
    if (readEpubBtn) {
      readEpubBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (this.currentBook) {
            openEpubReader(this.currentBook, this.currentChapterIndex || 0);
          } else {
            console.warn("Read EPUB clicked but no current book loaded in player");
          }
        } catch (err) {
          console.error("Failed to open EPUB reader from player bar:", err);
        }
      });
    }

    // Timeline Scrubbing
    this.timelineSlider.addEventListener("input", (e) => {
      this.isUserSeeking = true;
      const seconds = parseFloat(e.target.value);
      const maxVal = parseFloat(e.target.max) || 1;
      const percent = (seconds / maxVal) * 100;
      this.updateSliderFill(e.target, percent);

      // Display formatted scrubbing time (respecting showTimeRemaining setting)
      let displayTime = this.formatTime(seconds);
      if (this.showTimeRemaining) {
        displayTime = `-${this.formatTime(Math.max(0, maxVal - seconds))}`;
      }
      if (this.timeElapsedLabel) this.timeElapsedLabel.textContent = displayTime;
    });

    this.timelineSlider.addEventListener("change", (e) => {
      const seconds = parseFloat(e.target.value);
      this.seek(seconds);
    });

    // Forgiving Wrapper Click & Drag-Sliding (Mouse/Touch Dragging across 18px hitbox)
    if (this.timelineSlider && this.timelineSlider.parentElement) {
      const wrapper = this.timelineSlider.parentElement;
      let isDraggingWrapper = false;

      const handleSeekFromPointer = (e) => {
        const rect = wrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        const maxVal = parseFloat(this.timelineSlider.max) || 1;
        const targetSeconds = ratio * maxVal;
        this.timelineSlider.value = targetSeconds;
        this.updateSliderFill(this.timelineSlider, ratio * 100);

        let displayTime = this.formatTime(targetSeconds);
        if (this.showTimeRemaining) {
          displayTime = `-${this.formatTime(Math.max(0, maxVal - targetSeconds))}`;
        }
        if (this.timeElapsedLabel) this.timeElapsedLabel.textContent = displayTime;
        return targetSeconds;
      };

      wrapper.addEventListener("pointerdown", (e) => {
        if (e.target === this.timelineSlider) return;
        isDraggingWrapper = true;
        this.isUserSeeking = true;
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
        this.seek(targetSeconds);
      };

      wrapper.addEventListener("pointerup", stopWrapperDrag);
      wrapper.addEventListener("pointercancel", stopWrapperDrag);
    }

    // Volume Adjustment
    this.volumeSlider.addEventListener("input", (e) => {
      this.setVolume(parseFloat(e.target.value));
    });

    // Speed Popover
    this.speedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.speedBtn.classList.toggle("active");
      this.sleepBtn.classList.remove("active");
    });

    this.speedPopup.querySelectorAll(".popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const rate = parseFloat(e.currentTarget.getAttribute("data-rate"));
        this.setPlaybackSpeed(rate);
        this.speedBtn.classList.remove("active");
      });
    });

    // Sleep Popover
    this.sleepBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.sleepBtn.classList.toggle("active");
      this.speedBtn.classList.remove("active");
    });

    this.sleepPopup.querySelectorAll(".popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const val = e.currentTarget.getAttribute("data-mins");
        if (val === "chapter") {
          this.setSleepAtEndOfChapter();
        } else {
          this.setSleepTimer(parseInt(val, 10));
        }
        this.sleepBtn.classList.remove("active");
      });
    });

    // Chapters Popover Button (#p-chapters-btn)
    if (this.chaptersBtn && this.chaptersPopup) {
      this.chaptersBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.chaptersBtn.classList.toggle("active");
        if (this.speedBtn) this.speedBtn.classList.remove("active");
        if (this.sleepBtn) this.sleepBtn.classList.remove("active");
        if (this.chaptersBtn.classList.contains("active")) {
          this.renderChaptersPopup();
        }
      });
    }

    document.addEventListener("click", () => {
      if (this.speedBtn) this.speedBtn.classList.remove("active");
      if (this.sleepBtn) this.sleepBtn.classList.remove("active");
      if (this.chaptersBtn) this.chaptersBtn.classList.remove("active");
    });

    // View Mode Toggle Button (#p-view-mode-btn on player bar)
    if (this.viewModeBtn) {
      this.viewModeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleTimelineMode();
      });
    }

    // Toggle Time Display Mode (Elapsed vs Time Remaining) when clicking time labels
    const attachTimeToggle = (el) => {
      if (el) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleTimeDisplayMode();
        });
      }
    };
    attachTimeToggle(this.timeElapsedLabel);
    attachTimeToggle(this.timeDurationLabel);

    // Close popups on click outside
    document.addEventListener("click", () => {
      this.speedBtn.classList.remove("active");
      this.sleepBtn.classList.remove("active");
    });
  }

  attachAudioListeners() {
    this.audio.addEventListener("timeupdate", () => {
      this.handleTimeUpdate();
    });
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this.updatePlayStateUI();
      this.notifyPlayStateChange();
    });
    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this.updatePlayStateUI();
      this.notifyPlayStateChange();
    });
    this.audio.addEventListener("ended", () => {
      this.handleAudioEnded();
    });
    this.audio.addEventListener("durationchange", () => {
      this.updatePlaybackProgressUI();
    });
  }

  parseSeconds(val) {
    if (val === null || val === undefined) return 0;
    let num = 0;
    if (typeof val === "number") {
      num = val;
    } else if (typeof val === "string") {
      if (val.includes(":")) {
        const parts = val.split(":").map(p => parseFloat(p));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          num = parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          num = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      } else {
        num = parseFloat(val);
      }
    }
    if (isNaN(num)) return 0;
    return num > 86400 ? num / 1000 : num;
  }

  getChapterStartTime(ch) {
    if (!ch) return 0;
    // All fields are in seconds (despite "Ms" naming)
    const val = ch.startTimeMs ?? ch.start_time_ms ?? ch.startMs ?? ch.startTime ?? ch.start ?? ch.start_time;
    return this.parseSeconds(val);
  }

  getChapterEndTime(ch, index = -1, chaptersList = null) {
    if (!ch) return Infinity;

    const list = chaptersList || (this.currentBook && Array.isArray(this.currentBook.chapters) ? this.currentBook.chapters : null);

    if (list && index >= 0 && index < list.length - 1) {
      const nextCh = list[index + 1];
      if (nextCh) {
        return this.getChapterStartTime(nextCh);
      }
    }

    // All fields are in seconds (despite "Ms" naming)
    const val = ch.endTimeMs ?? ch.end_time_ms ?? ch.endMs ?? ch.endTime ?? ch.end ?? ch.end_time;
    if (typeof val === "number" && !isNaN(val)) {
      return this.parseSeconds(val);
    }

    const start = this.getChapterStartTime(ch);
    const dur = this.getChapterDuration(ch, index, list);
    if (dur > 0) {
      return start + dur;
    }

    const totalDur = this.audio.duration || (this.currentBook ? (this.currentBook.runtimeSeconds || this.currentBook.duration) : 0);
    if (totalDur && totalDur > start) {
      return totalDur;
    }

    return Infinity;
  }

  getChapterDuration(ch, index = -1, chaptersList = null) {
    if (!ch) return 0;
    const start = this.getChapterStartTime(ch);
    const list = chaptersList || (this.currentBook && Array.isArray(this.currentBook.chapters) ? this.currentBook.chapters : null);

    // 1. Next chapter boundary difference
    if (list && index >= 0 && index < list.length - 1) {
      const nextCh = list[index + 1];
      if (nextCh) {
        const nextStart = this.getChapterStartTime(nextCh);
        if (nextStart > start) {
          return nextStart - start;
        }
      }
    }

    // 2. Explicit end time point check
    const endVal = ch.endTimeMs ?? ch.end_time_ms ?? ch.endMs ?? ch.endTime ?? ch.end ?? ch.end_time;
    if (typeof endVal === "number" && !isNaN(endVal)) {
      const parsedEnd = this.parseSeconds(endVal);
      if (parsedEnd > start) {
        return parsedEnd - start;
      }
    }

    // 3. Raw duration field check
    const durVal = ch.durationMs ?? ch.duration_ms ?? ch.duration;
    if (typeof durVal === "number" && durVal > 0) {
      const parsedDur = this.parseSeconds(durVal);
      // If duration field holds an absolute end timestamp point (> start time), calculate delta
      if (parsedDur > start && start > 0) {
        return parsedDur - start;
      }
      return parsedDur;
    }

    // 4. Total book runtime fallback minus start time
    const totalDur = this.audio.duration || (this.currentBook ? (this.currentBook.runtimeSeconds || this.currentBook.duration) : 0);
    if (totalDur && totalDur > start) {
      return totalDur - start;
    }

    return 0;
  }

  getCurrentChapterIndex() {
    if (!this.currentBook || !Array.isArray(this.currentBook.chapters) || this.currentBook.chapters.length === 0) return 0;
    const secs = this.audio.currentTime;
    for (let i = this.currentBook.chapters.length - 1; i >= 0; i--) {
      const start = this.getChapterStartTime(this.currentBook.chapters[i]);
      if (secs >= start) {
        return i;
      }
    }
    return 0;
  }

  getCurrentChapter() {
    if (!this.currentBook || !this.currentBook.chapters || this.currentBook.chapters.length === 0) return null;
    const idx = this.getCurrentChapterIndex();
    return this.currentBook.chapters[idx];
  }

  loadBook(book, chapterIndex = 0, elapsedBookSeconds = null, autoPlay = true, shouldNavigate = false) {
    this.currentBook = book;

    if (this.currentBook && this.currentBook.id) {
      const savedMeta = localStorage.getItem(`aura_meta_${this.currentBook.id}`);
      if (savedMeta) {
        try {
          const overrides = JSON.parse(savedMeta);
          if (overrides.cover) this.currentBook.cover = overrides.cover;
          if (overrides.title) this.currentBook.title = overrides.title;
          if (overrides.author) this.currentBook.author = overrides.author;
          if (overrides.narrator) this.currentBook.narrator = overrides.narrator;
          if (overrides.chapters && Array.isArray(overrides.chapters) && overrides.chapters.length > 0) {
            this.currentBook.chapters = overrides.chapters;
          }
        } catch (e) {}
      }
    }

    const nowPlayingItem = document.getElementById("sidebar-now-playing-item");
    if (nowPlayingItem) {
      nowPlayingItem.style.display = "block";
    }

    // Determine target seek time
    let targetTime = 0;
    if (elapsedBookSeconds !== null && elapsedBookSeconds !== undefined) {
      targetTime = elapsedBookSeconds;
    } else {
      const savedProgress = localStorage.getItem(`aura_progress_${book.id}`);
      if (savedProgress !== null) {
        targetTime = parseFloat(savedProgress);
      } else if (book.chapters && book.chapters[chapterIndex]) {
        targetTime = this.getChapterStartTime(book.chapters[chapterIndex]);
      }
    }

    this.currentChapterIndex = chapterIndex;

    // Determine audio source URL
    let audioSrc = "";
    if (book.audioUrl && book.audioUrl.startsWith("http") && !book.audioUrl.includes("pixabay")) {
      audioSrc = book.audioUrl;
    } else if (book.id !== undefined && book.id !== null && String(book.id).trim() !== "") {
      audioSrc = `${getApiBase()}/api/audiobooks/${book.id}/file`;
    } else {
      audioSrc = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3";
    }

    // Check if we need to change the source (compare full URLs)
    const currentSrc = this.audio.src || "";
    const needsNewSource = !currentSrc || currentSrc === window.location.href || !currentSrc.includes(audioSrc);

    // Auto-sort chapters logically in ascending order of start time
    if (book.chapters && Array.isArray(book.chapters)) {
      book.chapters.sort((a, b) => this.getChapterStartTime(a) - this.getChapterStartTime(b));
    }

    const doSeekAndPlay = () => {
      console.log("[Aura] doSeekAndPlay: targetTime=" + targetTime + ", readyState=" + this.audio.readyState + ", duration=" + this.audio.duration);
      try {
        if (targetTime >= 0 && isFinite(targetTime)) {
          this.audio.currentTime = targetTime;
        }
      } catch (e) {
        console.warn("[Aura] Seek error:", e);
      }
      this.audio.playbackRate = this.playbackSpeed;
      if (autoPlay) {
        this.play();
      }
      this.updateUI();
      this.notifyTrackChange();
      this.notifyTimeUpdate();
      this.saveProgress(true);
    };

    if (needsNewSource) {
      console.log("[Aura] loadBook: Setting new audio src:", audioSrc);
      // Remove any previous listener to prevent double-fire
      this.audio.removeEventListener("loadedmetadata", this._pendingSeek);
      this._pendingSeek = () => {
        console.log("[Aura] loadedmetadata fired, seeking to", targetTime);
        doSeekAndPlay();
      };
      this.audio.addEventListener("loadedmetadata", this._pendingSeek, { once: true });
      this.audio.src = audioSrc;
      this.audio.load();
    } else if (this.audio.readyState >= 2) {
      // Audio already loaded and ready - seek directly
      console.log("[Aura] loadBook: Audio already ready, seeking directly");
      doSeekAndPlay();
    } else {
      // Source is set but not ready yet - wait
      console.log("[Aura] loadBook: Waiting for canplay");
      this.audio.removeEventListener("canplay", this._pendingSeek);
      this._pendingSeek = () => doSeekAndPlay();
      this.audio.addEventListener("canplay", this._pendingSeek, { once: true });
    }

    if (shouldNavigate) {
      location.hash = "#now-playing";
    }
  }

  togglePlay() {
    if (!this.currentBook) return;
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  play() {
    if (!this.currentBook) return;

    if (!this.audio.src || this.audio.src === "" || this.audio.src === window.location.href) {
      if (this.currentBook.audioUrl && this.currentBook.audioUrl.startsWith("http") && !this.currentBook.audioUrl.includes("pixabay")) {
        this.audio.src = this.currentBook.audioUrl;
      } else if (this.currentBook.id !== undefined && this.currentBook.id !== null && String(this.currentBook.id).trim() !== "") {
        this.audio.src = `${getApiBase()}/api/audiobooks/${this.currentBook.id}/file`;
      } else {
        this.audio.src = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3";
      }
    }

    if (this.eqEnabled) {
      try {
        this.initAudioContext();
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          this.audioCtx.resume();
        }
      } catch (e) {
        console.warn("AudioContext setup warning:", e);
      }
    }

    const promise = this.audio.play();
    if (promise !== undefined) {
      promise.catch(err => {
        console.warn("Audio play warning:", err.message || err);
      });
    }
    this.startSleepTimerTicker();
  }

  initAudioContext() {
    if (this.audioCtx && this.audioSourceNode) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;

      // Web Audio API requires crossOrigin = anonymous to prevent media output zeroing
      try {
        this.audio.crossOrigin = "anonymous";
      } catch (e) {}

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (!this.audioSourceNode) {
        this.audioSourceNode = this.audioCtx.createMediaElementSource(this.audio);
      }

      if (this.eqBands.length === 0) {
        this.eqBands = this.eqFrequencies.map((freq, idx) => {
          const filter = this.audioCtx.createBiquadFilter();
          if (idx === 0) {
            filter.type = "lowshelf";
          } else if (idx === this.eqFrequencies.length - 1) {
            filter.type = "highshelf";
          } else {
            filter.type = "peaking";
            filter.Q.value = 1.4;
          }
          filter.frequency.value = freq;
          filter.gain.value = this.eqEnabled ? (this.eqGains[idx] || 0) : 0;
          return filter;
        });

        // Master Gain
        this.masterGainNode = this.audioCtx.createGain();
        this.masterGainNode.gain.value = 1.0;

        // Dynamics Compressor (Limiter)
        this.compressorNode = this.audioCtx.createDynamicsCompressor();
        this.compressorNode.threshold.value = -3.0;
        this.compressorNode.knee.value = 6.0;
        this.compressorNode.ratio.value = 12.0;

        // Analyser for spectrum visualizer
        this.analyserNode = this.audioCtx.createAnalyser();
        this.analyserNode.fftSize = 64;

        // Connect Chain: Source -> EQ0 -> ... -> EQ9 -> MasterGain -> Compressor -> Analyser -> Destination
        let currentNode = this.audioSourceNode;
        this.eqBands.forEach(filter => {
          currentNode.connect(filter);
          currentNode = filter;
        });
        currentNode.connect(this.masterGainNode);
        this.masterGainNode.connect(this.compressorNode);
        this.compressorNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioCtx.destination);
      }
    } catch (err) {
      console.warn("Web Audio API AudioContext initialization deferred/failed:", err);
    }
  }

  setEqGain(index, gainValue) {
    this.initAudioContext();
    this.eqGains[index] = gainValue;
    localStorage.setItem("aura_eq_gains", JSON.stringify(this.eqGains));

    if (this.eqBands[index] && this.audioCtx) {
      const targetGain = this.eqEnabled ? gainValue : 0;
      this.eqBands[index].gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.01);
    }
  }

  setEqEnabled(enabled) {
    this.initAudioContext();
    this.eqEnabled = enabled;
    localStorage.setItem("aura_eq_enabled", enabled ? "true" : "false");

    if (this.audioCtx && this.eqBands.length > 0) {
      this.eqBands.forEach((filter, idx) => {
        const targetGain = enabled ? (this.eqGains[idx] || 0) : 0;
        filter.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.01);
      });
    }
  }

  applyEqPreset(presetGains) {
    this.initAudioContext();
    this.eqGains = [...presetGains];
    localStorage.setItem("aura_eq_gains", JSON.stringify(this.eqGains));

    if (this.audioCtx && this.eqBands.length > 0) {
      this.eqBands.forEach((filter, idx) => {
        const targetGain = this.eqEnabled ? (this.eqGains[idx] || 0) : 0;
        filter.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.01);
      });
    }
  }

  pause() {
    this.audio.pause();
    this.stopSleepTimerTicker();
    this.saveProgress(true);
  }

  playChapter(index) {
    if (!this.currentBook || !Array.isArray(this.currentBook.chapters) || !this.currentBook.chapters[index]) return;
    
    const targetChapter = this.currentBook.chapters[index];
    const startTime = this.getChapterStartTime(targetChapter);

    this.loadBook(this.currentBook, index, startTime, true);
  }

  handleTimeUpdate() {
    if (!this.currentBook || this.isUserSeeking) return;
    
    // Sync current chapter index
    const newIdx = this.getCurrentChapterIndex();
    const chapterChanged = newIdx !== this.currentChapterIndex;
    if (chapterChanged) {
      // End-of-chapter sleep: pause when the chapter boundary is crossed
      if (this.sleepAtEndOfChapter) {
        this.sleepAtEndOfChapter = false;
        this.pause();
        this.updateSleepTimerUI();
        return;
      }
      this.currentChapterIndex = newIdx;
      this.notifyTrackChange();
      this.updateUI();
    }
    
    // Save progress locally
    this.saveProgress(false);
    
    // Update progress bars
    this.updatePlaybackProgressUI();
    this.notifyTimeUpdate();
  }

  handleAudioEnded() {
    this.pause();
    this.audio.currentTime = 0;
    this.saveProgress(true);
    this.updateUI();
  }

  saveProgress(force = false) {
    if (!this.currentBook) return;
    const progress = this.audio.currentTime;
    
    // Update local representation
    this.currentBook.progressSeconds = progress;

    const now = Date.now();
    // Throttle localStorage updates to once every 2 seconds, unless forced
    if (force || now - this.lastSyncTime > 2000) {
      this.lastSyncTime = now;
      localStorage.setItem(`aura_progress_${this.currentBook.id}`, progress.toString());
      localStorage.setItem(`aura_last_played_${this.currentBook.id}`, now.toString());
    }
  }

  skip(seconds) {
    if (!this.currentBook) return;
    const duration = this.audio.duration || this.currentBook.duration;
    if (!duration) return;
    
    this.audio.currentTime = Math.min(Math.max(0, this.audio.currentTime + seconds), duration);
    this.saveProgress(true);
    this.updatePlaybackProgressUI();
    this.notifyTimeUpdate();
  }

  seek(seconds) {
    if (!this.currentBook) return;
    let targetTime = seconds;
    if (this.timelineMode === "chapter") {
      const curCh = this.getCurrentChapter();
      if (curCh) {
        targetTime = this.getChapterStartTime(curCh) + seconds;
      }
    }
    const duration = this.audio.duration || this.currentBook.duration;
    if (!duration) return;
    
    // Hold user seeking guard so background timeupdate doesn't overwrite UI with old position while audio seeks
    this.isUserSeeking = true;
    this.audio.currentTime = Math.min(Math.max(0, targetTime), duration);

    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      this.isUserSeeking = false;
      this.updatePlaybackProgressUI();
    }, 250);

    this.saveProgress(true);
    this.updatePlaybackProgressUI();
    this.notifyTimeUpdate();
  }



  nextChapter() {
    if (!this.currentBook || !this.currentBook.chapters) return;
    if (this.currentChapterIndex < this.currentBook.chapters.length - 1) {
      const nextCh = this.currentBook.chapters[this.currentChapterIndex + 1];
      this.audio.currentTime = this.getChapterStartTime(nextCh);
      this.saveProgress(true);
      this.updateUI();
    }
  }

  prevChapter() {
    if (!this.currentBook || !this.currentBook.chapters) return;
    const curCh = this.currentBook.chapters[this.currentChapterIndex];
    if (!curCh) return;
    
    const startTime = this.getChapterStartTime(curCh);
    const timeInChapter = this.audio.currentTime - startTime;
    
    if (timeInChapter > 3) {
      this.audio.currentTime = startTime;
    } else if (this.currentChapterIndex > 0) {
      const prevCh = this.currentBook.chapters[this.currentChapterIndex - 1];
      this.audio.currentTime = this.getChapterStartTime(prevCh);
    }
    
    this.saveProgress(true);
    this.updateUI();
  }

  setVolume(val) {
    this.volume = val;
    this.audio.volume = val;
    
    // Bottom player volume bar
    if (this.volumeSlider) {
      this.volumeSlider.value = val;
      this.updateSliderFill(this.volumeSlider, val * 100);
    }

    // Now Playing page volume bar
    const npVolume = document.getElementById("np-volume");
    if (npVolume) {
      npVolume.value = val;
      this.updateSliderFill(npVolume, val * 100);
    }

    // Update volume icons
    let iconName = "volume-2";
    if (val === 0) iconName = "volume-x";
    else if (val < 0.3) iconName = "volume";
    else if (val < 0.7) iconName = "volume-1";

    const muteBtn = document.getElementById("p-volume-mute");
    if (muteBtn) {
      muteBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    }

    const npMuteIcon = document.getElementById("np-volume-icon");
    if (npMuteIcon) {
      npMuteIcon.setAttribute("data-lucide", val === 0 ? "volume-x" : "volume-2");
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  toggleMute() {
    if (this.volume > 0) {
      this.prevVolume = this.volume;
      this.setVolume(0);
    } else {
      this.setVolume(this.prevVolume || 0.8);
    }
  }

  setSpeed(rate) {
    this.setPlaybackSpeed(rate);
  }

  setPlaybackSpeed(rate) {
    this.playbackSpeed = rate;
    this.audio.playbackRate = rate;
    
    if (this.speedLabel) {
      this.speedLabel.textContent = `${rate}x`;
    }

    // Update labels in Now Playing if active
    const npSpeedLabel = document.getElementById("np-speed-label");
    if (npSpeedLabel) {
      npSpeedLabel.textContent = `${rate}x`;
    }

    // Update active popover list items
    const popups = [this.speedPopup, document.getElementById("np-speed-popup")];
    popups.forEach(popup => {
      if (popup) {
        popup.querySelectorAll(".popup-item").forEach(item => {
          const itemRate = parseFloat(item.getAttribute("data-rate"));
          if (itemRate === rate) item.classList.add("active");
          else item.classList.remove("active");
        });
      }
    });
  }

  setSleepTimer(mins) {
    this.sleepAtEndOfChapter = false;
    this.sleepTimerMinutes = mins;
    this.sleepTimerRemaining = mins * 60;

    this.stopSleepTimerTicker();

    if (mins > 0) {
      this.startSleepTimerTicker();
    }

    this.updateSleepTimerUI();
  }

  setSleepAtEndOfChapter() {
    this.sleepAtEndOfChapter = true;
    this.sleepTimerMinutes = 0;
    this.sleepTimerRemaining = 0;
    this.stopSleepTimerTicker();
    this.updateSleepTimerUI();
  }

  startSleepTimerTicker() {
    this.stopSleepTimerTicker();
    if (this.sleepTimerRemaining <= 0 && this.sleepAtEndOfType !== "chapter") return;
    if (this.sleepTimerRemaining <= 0) return;

    this.sleepTimerId = setInterval(() => {
      this.sleepTimerRemaining--;
      this.updateSleepTimerUI();

      if (this.sleepTimerRemaining <= 0) {
        this.pause();
        this.setSleepTimer(0);
      }
    }, 1000);
  }

  stopSleepTimerTicker() {
    if (this.sleepTimerId) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
    }
  }

  formatTime(totalSecs) {
    if (isNaN(totalSecs) || totalSecs === Infinity) return "00:00";
    const s = Math.floor(totalSecs % 60);
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);

    const pad = (num) => String(num).padStart(2, "0");

    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  }

  formatSleepTime(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = Math.floor(totalSecs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  updateSliderFill(slider, percent) {
    try {
      // If the slider is inside the EPUB reader, prefer the reader's accent variable
      const inEpub = slider && typeof slider.closest === 'function' && slider.closest('.epub-reader-container');
      const accentVar = inEpub ? 'var(--reader-accent)' : 'var(--accent-primary)';
      slider.style.background = `linear-gradient(to right, ${accentVar} 0%, ${accentVar} ${percent}%, var(--border-color) ${percent}%, var(--border-color) 100%)`;
    } catch (e) {
      slider.style.background = `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${percent}%, var(--border-color) ${percent}%, var(--border-color) 100%)`;
    }
  }

  renderChaptersPopup() {
    if (!this.currentBook || !this.chaptersPopup) return;

    const chapters = this.currentBook.chapters && this.currentBook.chapters.length > 0 
      ? this.currentBook.chapters 
      : [{ title: "Full Audiobook", startTimeMs: 0, endTimeMs: this.audio.duration || this.currentBook.duration || 0 }];

    this.chaptersPopup.innerHTML = chapters.map((ch, idx) => {
      const isActive = idx === this.currentChapterIndex;
      const durationSecs = this.getChapterDuration(ch, idx, chapters);
      const durationStr = durationSecs > 0 ? this.formatTime(durationSecs) : "";

      return `
        <button class="popup-item chapter-popup-item ${isActive ? 'active' : ''}" data-chapter-idx="${idx}">
          <div class="chapter-item-info">
            <span class="chapter-title-text">${ch.title || ch.name || `Chapter ${idx + 1}`}</span>
            ${durationStr ? `<span class="chapter-duration-text">${durationStr}</span>` : ""}
          </div>
        </button>
      `;
    }).join("");

    this.chaptersPopup.querySelectorAll(".chapter-popup-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(item.getAttribute("data-chapter-idx"), 10);
        this.playChapter(idx);
        if (this.chaptersBtn) this.chaptersBtn.classList.remove("active");
      });
    });
  }

  updateUI() {
    if (!this.currentBook) return;

    const chapter = this.getCurrentChapter();
    const chapterTitle = chapter ? chapter.title : "Chapter 1";

    // Bottom Player: Artwork and Text
    if (this.coverImg) {
      let effectiveCover = this.currentBook.cover;
      if (this.currentBook.id) {
        try {
          const savedMeta = localStorage.getItem(`aura_meta_${this.currentBook.id}`);
          if (savedMeta) {
            const overrides = JSON.parse(savedMeta);
            if (overrides.cover) effectiveCover = overrides.cover;
          }
        } catch (e) {}
      }
      if (!effectiveCover && typeof this.currentBook.id === "number") {
        effectiveCover = `${getApiBase()}/api/audiobooks/${this.currentBook.id}/cover`;
      }
      this.coverImg.src = effectiveCover || "assets/covers/default.png";
      this.coverImg.alt = this.currentBook.title;
    }
    if (this.titleLabel) this.titleLabel.textContent = this.currentBook.title;
    if (this.authorLabel) this.authorLabel.textContent = this.currentBook.author;
    if (this.chapterLabel) this.chapterLabel.textContent = chapterTitle;

    // Update Now Playing page chapter badge title
    const npChapterTitle = document.getElementById("np-chapter-title");
    if (npChapterTitle) {
      npChapterTitle.textContent = chapterTitle;
    }

    // Bottom Player track link
    const trackLink = document.querySelector(".player-track-info");
    if (trackLink) {
      trackLink.href = "#now-playing";
    }

    this.updatePlaybackProgressUI();
    this.updatePlayStateUI();
    this.updateSleepTimerUI();

    // Init volume fill
    this.setVolume(this.volume);
    this.setPlaybackSpeed(this.playbackSpeed);
  }

  toggleTimeDisplayMode() {
    this.showTimeRemaining = !this.showTimeRemaining;
    localStorage.setItem("aura_show_time_remaining", this.showTimeRemaining ? "true" : "false");
    this.updatePlaybackProgressUI();
  }

  toggleTimelineMode() {
    this.timelineMode = (this.timelineMode === "chapter") ? "book" : "chapter";
    localStorage.setItem("aura_timeline_mode", this.timelineMode);
    this.updatePlaybackProgressUI();
    this.updateTimelineModeUI();
  }

  updateTimelineModeUI() {
    const isChapter = this.timelineMode === "chapter";
    const labelText = isChapter ? "Chapter View" : "Book View";
    const iconName = isChapter ? "split" : "book-open";

    const npBtn = document.getElementById("np-view-mode-btn");
    if (npBtn) {
      npBtn.innerHTML = `<i data-lucide="${iconName}"></i><span>${isChapter ? "Chapter" : "Book"}</span>`;
      npBtn.setAttribute("title", `Toggle Book / Chapter View (${labelText})`);
    }

    if (this.viewModeBtn) {
      this.viewModeBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
      this.viewModeBtn.setAttribute("title", `Toggle Book / Chapter View (${labelText})`);
    }

    if (window.lucide) window.lucide.createIcons();
  }


  updatePlaybackProgressUI() {
    if (!this.currentBook) return;

    const bookDuration = this.audio.duration || this.currentBook.duration;
    if (!bookDuration) return;

    const absoluteTime = this.audio.currentTime;

    let curVal = absoluteTime;
    let curMax = bookDuration;

    if (this.timelineMode === "chapter") {
      const curCh = this.getCurrentChapter();
      if (curCh) {
        const start = this.getChapterStartTime(curCh);
        const end = this.getChapterEndTime(curCh, this.currentChapterIndex);
        curMax = Math.max(1, end - start);
        curVal = Math.max(0, absoluteTime - start);
      }
    }

    const percent = Math.min(100, Math.max(0, (curVal / curMax) * 100));

    let displayTimeStr = this.formatTime(curVal);
    if (this.showTimeRemaining) {
      const remaining = Math.max(0, curMax - curVal);
      displayTimeStr = `-${this.formatTime(remaining)}`;
    }
    
    // Update bottom player timeline (guarded by isUserSeeking)
    if (this.timelineSlider) {
      if (!this.isUserSeeking) {
        this.timelineSlider.max = curMax;
        this.timelineSlider.value = curVal;
        this.updateSliderFill(this.timelineSlider, percent);
      }
    }
    if (this.timeElapsedLabel) this.timeElapsedLabel.textContent = displayTimeStr;
    if (this.timeDurationLabel) this.timeDurationLabel.textContent = this.formatTime(curMax);

    // Update Now Playing timeline (guarded by isUserSeeking)
    const npTimeline = document.getElementById("np-timeline");
    if (npTimeline) {
      const npCurrent = document.getElementById("np-current-time");
      const npTotal = document.getElementById("np-total-time");
      
      if (!this.isUserSeeking) {
        npTimeline.max = curMax;
        npTimeline.value = curVal;
        this.updateSliderFill(npTimeline, percent);
      }
      
      if (npCurrent) npCurrent.textContent = displayTimeStr;
      if (npTotal) npTotal.textContent = this.formatTime(curMax);
    }

    this.updateTimelineModeUI();
  }

  updatePlayStateUI() {
    const isPaused = this.audio.paused;
    const playIconName = isPaused ? "play" : "pause";

    if (this.playBtn) {
      this.playBtn.innerHTML = `<i data-lucide="${playIconName}"></i>`;
    }
    
    // Update Now Playing play button
    const npPlayBtn = document.getElementById("np-play-pause");
    if (npPlayBtn) {
      npPlayBtn.innerHTML = `<i data-lucide="${playIconName}"></i>`;
    }

    // Waveform badge: only on the library book-card (not continue-card), inject on play, remove on pause
    const currentBookId = this.currentBook ? String(this.currentBook.id) : null;
    if (currentBookId && this.isPlaying && !isPaused) {
      document.querySelectorAll(`.book-card[data-id="${currentBookId}"] .book-card-footer`).forEach(target => {
        if (!target.querySelector(".waveform-badge")) {
          const badge = document.createElement("span");
          badge.className = "waveform-badge";
          badge.setAttribute("data-book-id", currentBookId);
          badge.style.marginLeft = "auto";
          badge.innerHTML = `<span class="waveform-bar"></span><span class="waveform-bar"></span><span class="waveform-bar"></span>`;
          target.appendChild(badge);
        }
      });
      // Tab title: Aura - Book Title
      document.title = `Aura - ${this.currentBook.title}`;
    } else {
      // Remove all badges when paused or no book loaded
      document.querySelectorAll(".waveform-badge").forEach(b => b.remove());
      // Tab title: default
      document.title = "Aura";
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  updateSleepTimerUI() {
    const timerActive = this.sleepTimerRemaining > 0;
    const label = this.sleepAtEndOfChapter ? "Chapter" : (timerActive ? this.formatSleepTime(this.sleepTimerRemaining) : "Sleep");
    
    if (this.sleepLabel) {
      this.sleepLabel.textContent = label;
    }

    // Now Playing sleep label
    const npSleepLabel = document.getElementById("np-sleep-label");
    if (npSleepLabel) {
      npSleepLabel.textContent = label;
    }

    // Update active popover items
    const popups = [this.sleepPopup, document.getElementById("np-sleep-popup")];
    popups.forEach(popup => {
      if (popup) {
        popup.querySelectorAll(".popup-item").forEach(item => {
          const val = item.getAttribute("data-mins");
          if (this.sleepAtEndOfChapter) {
            item.classList.toggle("active", val === "chapter");
          } else {
            const itemMins = parseInt(val, 10);
            item.classList.toggle("active", !isNaN(itemMins) && itemMins === this.sleepTimerMinutes);
          }
        });
      }
    });
  }

  // Decoupled communication via Event Bus
  notifyTimeUpdate() {
    const duration = this.audio.duration || this.currentBook.duration || 1;
    const event = new CustomEvent("audiobook-time-update", {
      detail: {
        bookId: this.currentBook.id,
        chapterIndex: this.currentChapterIndex,
        currentTime: this.audio.currentTime,
        percent: (this.audio.currentTime / duration) * 100,
        bookProgressSeconds: this.audio.currentTime
      }
    });
    window.dispatchEvent(event);
  }

  notifyTrackChange() {
    const event = new CustomEvent("audiobook-track-change", {
      detail: {
        bookId: this.currentBook.id,
        chapterIndex: this.currentChapterIndex,
        chapter: this.getCurrentChapter()
      }
    });
    window.dispatchEvent(event);
  }

  notifyPlayStateChange() {
    const event = new CustomEvent("audiobook-play-state-change", {
      detail: {
        isPlaying: !this.audio.paused,
        bookId: this.currentBook.id
      }
    });
    window.dispatchEvent(event);
  }

  async sendDiscordRPCUpdate() {
    if (!this.currentBook || this.currentBook.id === undefined) return;

    this.lastRpcSendTime = Date.now();

    const rawId = this.currentBook.id;
    const audiobookId = typeof rawId === "number" ? rawId : (!isNaN(parseInt(rawId, 10)) ? parseInt(rawId, 10) : rawId);
    const position = Math.max(0, this.audio.currentTime || 0);
    const playing = Boolean(this.isPlaying && !this.audio.paused);

    const payload = {
      audiobookId,
      playing,
      position
    };

    const targetUrl = this.activeRpcUrl || DISCORD_RPC_URL;

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 404 && targetUrl.includes("/api/rpc")) {
        const altUrl = targetUrl.replace("/api/rpc", "/rpc");
        const altRes = await fetch(altUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (altRes.ok) {
          this.activeRpcUrl = altUrl;
        }
      } else if (response.ok) {
        this.activeRpcUrl = targetUrl;
      }
    } catch (err) {
      // Discord RPC service is offline or not running locally; ignore silently
    }
  }

  initKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      const activeEl = document.activeElement;
      const tag = activeEl ? activeEl.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || (activeEl && activeEl.isContentEditable)) {
        return;
      }

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        this.skip(-15);
      } else if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        this.skip(15);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.setVolume(Math.min(1, this.volume + 0.05));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.setVolume(Math.max(0, this.volume - 0.05));
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        this.toggleMute();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        this.nextChapter();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        this.previousChapter();
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        this.toggleShortcutsModal();
      }
    });
  }

  toggleShortcutsModal() {
    const modal = document.getElementById("shortcuts-modal");
    if (!modal) return;
    if (modal.classList.contains("open")) {
      modal.classList.remove("open");
    } else {
      modal.classList.add("open");
    }
  }

  trackListeningTime(secondsDelta = 1) {
    const todayStr = new Date().toISOString().split("T")[0];
    const statsData = JSON.parse(localStorage.getItem("aura_daily_stats") || "{}");
    statsData[todayStr] = (statsData[todayStr] || 0) + secondsDelta;
    localStorage.setItem("aura_daily_stats", JSON.stringify(statsData));
  }
}

function itemActive(itemMins, activeMins) {
  if (itemMins === 0 && activeMins === 0) return true;
  return itemMins > 0 && activeMins === itemMins;
}

export const player = new PlayerController();