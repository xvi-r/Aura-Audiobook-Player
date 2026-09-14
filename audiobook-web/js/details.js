// Book Details View Controller
import { AUDIOBOOKS } from "./data.js";
import { player } from "./player.js";
import { router } from "./router.js";
import { getApiBase, fetchWithTimeout } from "./config.js";
import { openEpubReader, uploadEpubFile, checkEpubExists, extractEpubChapters, fetchEpubBuffer } from "./epub_reader.js";

let activeDetailsCleanup = null;

export async function renderDetails(bookId) {
  if (typeof activeDetailsCleanup === "function") {
    activeDetailsCleanup();
    activeDetailsCleanup = null;
  }
  const API_BASE = getApiBase();
  const container = document.getElementById("main-content");
  container.className = "fade-in";
  container.style.overflowY = "auto";

  let book = null;
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${bookId}`);
    if (response.ok) {
      book = await response.json();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    console.warn(`Spring Boot backend notice for book: ${bookId}`, err);
  }

  if (!book && player.currentBook && String(player.currentBook.id) === String(bookId)) {
    book = player.currentBook;
  }

  if (!book) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--text-muted);">
        <h2>Book not found</h2>
        <button class="back-btn" onclick="location.hash='#library'" style="margin-top: 16px;">Go Back</button>
      </div>
    `;
    return;
  }

  book.id = book.id ?? book.bookId ?? book._id ?? book.audiobookId ?? bookId;

  // Parse progress safely from localStorage, embedded progressResponse, object properties, or DB
  let localPos = 0;
  try {
    const stored = localStorage.getItem(`aura_progress_${book.id}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.position === "number" && parsed.position > 0) {
        localPos = parsed.position;
      }
    }
  } catch (e) {}

  let objPos = 0;
  if (book.progressResponse && book.progressResponse.position !== undefined && book.progressResponse.position !== null) {
    objPos = parseFloat(book.progressResponse.position);
    book.completed = !!book.progressResponse.completed;
  } else if (book.position !== undefined && book.position !== null) {
    objPos = parseFloat(book.position);
  } else if (book.progressSeconds !== undefined && book.progressSeconds !== null) {
    objPos = parseFloat(book.progressSeconds);
  }

  let bestPos = Math.max(localPos, objPos);

  if (bestPos === 0 && book.id) {
    try {
      const progRes = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${book.id}/progress`, {}, 2500);
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData && progData.position !== undefined && progData.position !== null) {
          bestPos = Math.max(bestPos, parseFloat(progData.position));
          book.completed = progData.completed;
        }
      }
    } catch (e) {}
  }

  // Map API entities to UI expectations
  book.position = bestPos;
  book.progressSeconds = bestPos;
  
  book.chapters = book.chapters || [];
  book.author = book.author || "Unknown Author";
  book.narrator = book.narrator || "Digital EPUB Edition";

  let coverUrl = null;
  if (book.cover && (book.cover.startsWith("http") || book.cover.startsWith("data:") || book.cover.startsWith("assets/"))) {
    coverUrl = book.cover;
  } else if (book.coverPath && (book.coverPath.startsWith("http") || book.coverPath.startsWith("data:") || book.coverPath.startsWith("assets/"))) {
    coverUrl = book.coverPath;
  } else {
    const targetId = book.audioBookId ?? book.id;
    coverUrl = `${API_BASE}/api/audiobooks/${targetId}/cover`;
  }
  book.cover = coverUrl;
  
  // Year: Read directly from backend payload fields without inventing fake dates
  const backendYear = book.releaseYear || book.publishedYear || book.year || book.date || "";
  book.releaseYear = backendYear ? String(backendYear) : "";

  // Runtime / Length
  const totalSecs = book.duration || 0;
  book.runtimeStr = book.runtime || (totalSecs ? player.formatTime(totalSecs) : "Unabridged");

  // Genres & Franchise Tagging
  let rawGenres = book.genres || [];
  if (typeof rawGenres === "string") {
    rawGenres = rawGenres.split(",").map(g => g.trim());
  }
  book.genres = Array.isArray(rawGenres) ? [...rawGenres] : [];

  const FRANCHISES = {
    "star wars": "Star Wars",
    "star trek": "Star Trek",
    "a court of": "ACOTAR",
    "lord of the rings": "Lord of the Rings",
    "harry potter": "Harry Potter",
    "marvel": "Marvel",
    "dc comics": "DC Comics",
    "dune": "Dune"
  };

  // Parse series name safely (String or Object { id, asin, name })
  const getSeriesName = (s) => {
    if (!s) return "";
    if (typeof s === "string") return s.trim();
    if (typeof s === "object" && s.name) return s.name.trim();
    return "";
  };
  book.seriesName = getSeriesName(book.series);

  // Match against exact FRANCHISES map
  const bookText = `${book.title || ""} ${book.seriesName} ${book.description || ""}`.toLowerCase();
  Object.keys(FRANCHISES).forEach(key => {
    if (bookText.includes(key.toLowerCase())) {
      const tagName = FRANCHISES[key];
      if (!book.genres.some(g => g.toLowerCase() === tagName.toLowerCase())) {
        book.genres.unshift(tagName);
      }
    }
  });

  if (book.genres.length === 0) {
    book.genres = ["Audiobook"];
  }

  book.rating = book.rating || 4.8;
  book.narrator = book.narrator || "Narrator Unspecified";
  book.description = book.description || "No description available.";
  book.publisher = book.publisher || "Publisher Unknown";

  if (!book.chapters || !Array.isArray(book.chapters) || book.chapters.length === 0) {
    book.chapters = [
      { id: 1, title: book.title || "Full Audiobook", startTimeMs: 0, duration: totalSecs || 0 }
    ];
  }

  // Sort chapters in logical ascending order of start time
  if (player && typeof player.sortChapters === "function") {
    player.sortChapters(book.chapters);
  } else {
    book.chapters.sort((a, b) => player.getChapterStartTime(a) - player.getChapterStartTime(b));
  }

  book.chapters.forEach((ch, idx) => {
    ch.duration = player.getChapterDuration(ch, idx, book.chapters);
  });

  // 1. Determine playback status for the primary action button
  const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
  if (isLoadedInPlayer) {
    player.currentBook = book;
  }
  const isCurrentlyPlaying = isLoadedInPlayer && player.isPlaying;
  const currentActiveIdx = isLoadedInPlayer ? player.currentChapterIndex : -1;
  const hasProgress = book.progressSeconds > 0;

  let mainPlayLabel = "Play from Start";
  let mainPlayIcon = "play";
  
  if (isCurrentlyPlaying) {
    mainPlayLabel = "Pause Playback";
    mainPlayIcon = "pause";
  } else if (hasProgress) {
    mainPlayLabel = "Resume Listening";
    mainPlayIcon = "play-circle";
  }

  // Calculate rating stars HTML
  const ratingStars = Array.from({ length: 5 }, (_, i) => {
    const starVal = i + 1;
    const isFilled = starVal <= Math.floor(book.rating);
    const isHalf = !isFilled && starVal - 0.5 <= book.rating;
    
    if (isFilled) return `<i data-lucide="star" style="fill: var(--rating-star);"></i>`;
    if (isHalf) return `<i data-lucide="star-half" style="fill: var(--rating-star);"></i>`;
    return `<i data-lucide="star"></i>`;
  }).join("");

  // Favorites state check
  const favorites = JSON.parse(localStorage.getItem("aura_favorites") || "[]");
  const isFavorited = favorites.includes(book.id);

  // Build the details panel
  let html = `
    <!-- Top Bar: Back Button Left, Minimalist Icon Buttons Right -->
    <div class="back-btn-container" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; width: 100%;">
      <button class="back-btn" id="btn-back-lib">
        <i data-lucide="arrow-left"></i>
        Back to Library
      </button>

      <div class="details-top-icon-actions" style="display: flex; gap: 10px; align-items: center;">
        <!-- Favorite Heart Icon Button -->
        <button class="top-icon-btn" id="details-fav-btn" title="${isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: ${isFavorited ? '#ef4444' : 'var(--text-muted)'}; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
          <i data-lucide="heart" style="${isFavorited ? 'fill: #ef4444; color: #ef4444; width: 18px; height: 18px;' : 'width: 18px; height: 18px;'}"></i>
        </button>

        <!-- Edit Details Pencil Icon Button -->
        <button class="top-icon-btn" id="details-edit-btn" title="Edit Metadata & Audnex ASIN" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: var(--text-muted); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
          <i data-lucide="pencil" style="width: 18px; height: 18px;"></i>
        </button>

        <!-- Delete Audiobook Trash Icon Button -->
        <button class="top-icon-btn" id="details-delete-btn" title="Delete Audiobook" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
          <i data-lucide="trash-2" style="width: 18px; height: 18px; color: #ef4444;"></i>
        </button>
      </div>
    </div>

    <!-- Details Grid -->
    <div class="details-grid" style="padding-bottom: 40px;">
      <!-- Left Column: Artwork and Quick Actions -->
      <div class="details-artwork-col">
        <div class="details-cover">
          <img src="${book.cover}" alt="${book.title}" onerror="this.onerror=null; this.src='assets/covers/default.jpg';" />
        </div>
        
        <div class="details-actions">
          <!-- Primary Play/Pause/Resume Button -->
          <button class="btn-primary-play" id="details-play-btn">
            <i data-lucide="${mainPlayIcon}"></i>
            <span>${mainPlayLabel}</span>
          </button>

          <div class="details-secondary-actions">
            <!-- Reset Progress (only show if has progress) -->
            <button class="btn-secondary" id="details-reset-btn" ${!hasProgress ? "disabled style='opacity:0.5; cursor:default;'" : ""}>
              <i data-lucide="rotate-ccw"></i>
              <span>Restart</span>
            </button>

            <!-- Download Button -->
            <button class="btn-secondary" id="details-download-btn">
              <i data-lucide="download"></i>
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Right Column: Content and Metadata -->
      <div class="details-content-col">
        <div class="details-title-section">
          <h1 class="details-title">${book.title}</h1>
          ${book.seriesName ? `
            <div class="details-series-tag" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 600; color: var(--accent-primary, #a78bfa); margin-top: 6px;">
              <i data-lucide="bookmark" style="width: 14px; height: 14px;"></i>
              <span>${book.seriesName}</span>
            </div>
          ` : ""}
          <div class="details-creators" style="margin-top: 8px;">
            <span class="details-author">Written by <span>${book.author}</span></span>
            <span class="details-narrator">Narrated by <span>${book.narrator}</span></span>
          </div>
        </div>

        <!-- Meta Grid Info -->
        <div class="details-meta-row">
          ${(book.asin && book.rating) ? `
            <div class="details-meta-pill" style="border-color: rgba(242, 125, 17, 0.35); background: rgba(242, 125, 17, 0.12); color: var(--accent-primary); font-weight: 600;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--accent-primary);">
                <path d="M12 2.5l2.75 6.6 7.15.55-5.4 4.7 1.65 7.05L12 17.65l-6.15 3.75 1.65-7.05-5.4-4.7 7.15-.55L12 2.5z"/>
              </svg>
              <span>${book.rating} Rating</span>
            </div>
          ` : ""}

          ${book.publisher && book.publisher !== "Publisher Unknown" ? `
            <div class="details-meta-pill">
              <i data-lucide="building"></i>
              <span>${book.publisher}</span>
            </div>
          ` : ""}

          ${book.releaseYear ? `
            <div class="details-meta-pill">
              <i data-lucide="calendar"></i>
              <span>${book.releaseYear}</span>
            </div>
          ` : ""}

          <div class="details-meta-pill">
            <i data-lucide="clock"></i>
            <span>${book.runtimeStr}</span>
          </div>
        </div>

        <!-- Genres -->
        <div class="genre-tags">
          ${book.genres.map(genre => `<span class="genre-tag">${genre}</span>`).join("")}
        </div>

        <!-- Description -->
        <div class="details-description" id="details-desc-box">
          <h3>Description</h3>
          <div class="desc-text collapsed" id="details-desc-text">${book.description}</div>
          ${book.description && book.description.length > 180 ? `
            <button type="button" class="desc-toggle-btn" id="desc-toggle-btn">
              <span>Read More</span>
              <i data-lucide="chevron-down"></i>
            </button>
          ` : ""}
        </div>

        <!-- Chapters List -->
        <div class="chapters-section">
          <div class="chapters-header-row">
            <h3>
              <i data-lucide="list-music"></i>
              Chapters Table
            </h3>
            <span class="chapters-count">${book.chapters.length} Chapters</span>
          </div>
          
          <div class="chapters-list" id="chapters-list-container" data-book-id="${book.id}">
            ${book.chapters.map((ch, idx) => {
              const isActiveChapter = (idx === currentActiveIdx);
              const chTitle = ch.title || ch.name || `Chapter ${idx + 1}`;
              const dur = player.getChapterDuration(ch, idx, book.chapters);
              const durationStr = dur > 0 ? player.formatTime(dur) : "--:--";
              
              return `
                <div class="chapter-item ${isActiveChapter ? "active" : ""}" data-idx="${idx}">
                  <div class="chapter-item-left">
                    <span class="chapter-play-state">
                      ${
                        isActiveChapter && isCurrentlyPlaying
                          ? `<i data-lucide="volume-2" class="pulse-icon"></i>`
                          : `<i data-lucide="play-circle"></i>`
                      }
                    </span>
                    <span class="chapter-title">${chTitle}</span>
                  </div>
                  <span class="chapter-duration">${durationStr}</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  setupDetailsEvents(book, container);
}

function setupDetailsEvents(book, container) {
  // Back to Library
  const backBtn = document.getElementById("btn-back-lib");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      router.navigate("#library");
    });
  }

  // Favorite Heart Button Event Handler
  const favBtn = document.getElementById("details-fav-btn");
  if (favBtn) {
    favBtn.addEventListener("click", () => {
      let favs = JSON.parse(localStorage.getItem("aura_favorites") || "[]");
      const idx = favs.indexOf(book.id);
      if (idx >= 0) {
        favs.splice(idx, 1);
      } else {
        favs.push(book.id);
      }
      localStorage.setItem("aura_favorites", JSON.stringify(favs));
      renderDetails(book.id);
    });
  }

  // Edit Metadata Modal Event Handler
  const editBtn = document.getElementById("details-edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      openEditModal(book, () => renderDetails(book.id));
    });
  }

  // Play/Pause main button
  const playBtn = document.getElementById("details-play-btn");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
      if (isLoadedInPlayer) {
        player.togglePlay();
      } else {
        // Load current book and start play (null elapsedBookSeconds means resume latest progress)
        const resumeTime = (book.progressSeconds > 0 ? book.progressSeconds : (book.position > 0 ? book.position : null));
        player.loadBook(book, 0, resumeTime, true);
      }
    });
  }

  // Read More / Read Less Toggle Handler for Book Description
  const descToggleBtn = document.getElementById("desc-toggle-btn");
  const descTextEl = document.getElementById("details-desc-text");
  if (descToggleBtn && descTextEl) {
    descToggleBtn.addEventListener("click", () => {
      const isExpanded = descTextEl.classList.contains("expanded");
      if (isExpanded) {
        descTextEl.classList.remove("expanded");
        descTextEl.classList.add("collapsed");
        descToggleBtn.innerHTML = `<span>Read More</span><i data-lucide="chevron-down"></i>`;
      } else {
        descTextEl.classList.remove("collapsed");
        descTextEl.classList.add("expanded");
        descToggleBtn.innerHTML = `<span>Read Less</span><i data-lucide="chevron-up"></i>`;
      }
      if (window.lucide) window.lucide.createIcons();
    });
  }

  // Reset Progress Button
  const resetBtn = document.getElementById("details-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      book.progressSeconds = 0;
      book.position = 0;
      book.completed = false;
      book.isExplicitReset = true;
      try {
        localStorage.removeItem(`aura_progress_${book.id}`);
      } catch (e) {}
      const API_BASE = getApiBase();
      try {
        await fetchWithTimeout(`${API_BASE}/api/audiobooks/${book.id}/progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: 0, completed: false })
        }, 4000);
      } catch (err) {
        console.warn("Backend reset progress notice:", err);
      }
      const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
      if (isLoadedInPlayer) {
        player.loadBook(book, 0, 0);
      }
      renderDetails(book.id);
    });
  }

  // Delete Audiobook Button Listener
  const deleteBtn = document.getElementById("details-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmDelete = confirm(`Are you sure you want to permanently delete "${book.title}"?\n\nThis will remove the audiobook entity and all stored media files from the server.`);
      if (!confirmDelete) return;

      try {
        deleteBtn.disabled = true;
        const API_BASE = getApiBase();
        const response = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${book.id}`, {
          method: "DELETE"
        }, 10000);

        if (response.ok || response.status === 204) {
          // If currently loaded in player, stop playback
          if (player.currentBook && String(player.currentBook.id) === String(book.id)) {
            player.pause();
            player.currentBook = null;
          }
          router.navigate("#library");
        } else {
          alert(`Failed to delete audiobook. Server returned HTTP ${response.status}`);
        }
      } catch (err) {
        console.error("[Aura Delete] Error deleting audiobook:", err);
        alert(`Error deleting audiobook: ${err.message || "Network error"}`);
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  // Mock Download Button with dynamic state interaction
  const downloadBtn = document.getElementById("details-download-btn");
  let downloadState = "idle"; // idle, downloading, completed
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (downloadState === "idle") {
        downloadState = "downloading";
        downloadBtn.innerHTML = `<i class="spinner-icon" data-lucide="loader"></i><span>Downloading...</span>`;
        if (window.lucide) window.lucide.createIcons();

        // Simulate download time
        setTimeout(() => {
          downloadState = "completed";
          downloadBtn.className = "btn-secondary downloaded";
          downloadBtn.innerHTML = `<i data-lucide="check-circle"></i><span>Downloaded</span>`;
          if (window.lucide) window.lucide.createIcons();
        }, 1500);
      }
    });
  }

  // Centralized updater for chapters table active state and play/pause icon
  const updateActiveChapterUI = (activeIdx, isPlaying) => {
    const listContainer = document.getElementById("chapters-list-container");
    if (!listContainer) return;
    if (listContainer.getAttribute("data-book-id") !== String(book.id)) return;

    const isThisBookLoaded = player.currentBook && String(player.currentBook.id) === String(book.id);
    const targetIdx = isThisBookLoaded ? activeIdx : -1;
    const targetPlaying = isThisBookLoaded && isPlaying;

    const items = listContainer.querySelectorAll(".chapter-item");
    items.forEach((item) => {
      const idx = parseInt(item.getAttribute("data-idx"), 10);
      const isActive = (idx === targetIdx);
      const playStateSpan = item.querySelector(".chapter-play-state");

      if (isActive) {
        if (!item.classList.contains("active")) {
          item.classList.add("active");
        }
        if (playStateSpan) {
          playStateSpan.innerHTML = targetPlaying
            ? `<i data-lucide="volume-2" class="pulse-icon"></i>`
            : `<i data-lucide="play-circle"></i>`;
        }
      } else {
        if (item.classList.contains("active")) {
          item.classList.remove("active");
        }
        if (playStateSpan) {
          playStateSpan.innerHTML = `<i data-lucide="play-circle"></i>`;
        }
      }
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  };

  // Chapters click handlers (fully functional chapter navigation!)
  const chapterItems = container.querySelectorAll(".chapter-item");
  chapterItems.forEach(item => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.getAttribute("data-idx"), 10);
      const ch = book.chapters[idx];
      if (!ch) return;

      const startTime = player.getChapterStartTime(ch);
      player.loadBook(book, idx, startTime, true);

      // Immediately highlight the clicked chapter with volume-2 sound icon
      updateActiveChapterUI(idx, true);
    });
  });

  // Listen to global player updates to keep active chapters highlighted dynamically
  const timeUpdateHandler = (e) => {
    if (!e.detail || String(e.detail.bookId) !== String(book.id)) return;
    const isThisBookPlaying = player.currentBook && String(player.currentBook.id) === String(book.id) && player.isPlaying;
    const activeIdx = (e.detail.chapterIndex !== undefined && e.detail.chapterIndex !== null)
      ? e.detail.chapterIndex
      : player.currentChapterIndex;
    updateActiveChapterUI(activeIdx, isThisBookPlaying);
  };

  const trackChangeHandler = (e) => {
    if (!e.detail || String(e.detail.bookId) !== String(book.id)) return;
    const isThisBookPlaying = player.currentBook && String(player.currentBook.id) === String(book.id) && player.isPlaying;
    const activeIdx = (e.detail.chapterIndex !== undefined && e.detail.chapterIndex !== null)
      ? e.detail.chapterIndex
      : player.currentChapterIndex;
    updateActiveChapterUI(activeIdx, isThisBookPlaying);
  };

  const playStateChangeHandler = (e) => {
    if (!e.detail || String(e.detail.bookId) !== String(book.id)) return;

    // Keep play/pause button state in sync
    const playBtn = document.getElementById("details-play-btn");
    if (playBtn) {
      const hasProgress = (book.progressSeconds > 0 || book.position > 0);
      let labelText, iconName;
      if (e.detail.isPlaying) {
        labelText = "Pause Playback";
        iconName = "pause";
      } else {
        labelText = hasProgress ? "Resume Listening" : "Play from Start";
        iconName = hasProgress ? "play-circle" : "play";
      }
      playBtn.innerHTML = `<i data-lucide="${iconName}"></i><span>${labelText}</span>`;
      if (window.lucide) window.lucide.createIcons();
    }

    // Keep active chapter volume indicator in sync
    const isThisBookLoaded = player.currentBook && String(player.currentBook.id) === String(book.id);
    if (isThisBookLoaded) {
      updateActiveChapterUI(player.currentChapterIndex, e.detail.isPlaying);
    }
  };

  // Dynamic chapters table height calculation:
  // Ensures max-height never exceeds 320px, but automatically shrinks so there is always a clear gap
  // between the bottom of the chapters table section and the bottom audio player bar.
  const updateChaptersMaxHeight = () => {
    const chaptersList = document.getElementById("chapters-list-container");
    if (!chaptersList) return;
    const playerBar = document.getElementById("audio-player-bar");
    const playerBarHeight = (playerBar && getComputedStyle(playerBar).display !== "none") ? playerBar.offsetHeight : 0;
    const rect = chaptersList.getBoundingClientRect();
    
    // Exactly +2px longer (253px max-height cap)
    const availableHeight = window.innerHeight - rect.top - playerBarHeight - 82;
    const targetHeight = Math.max(130, Math.min(253, Math.floor(availableHeight)));
    chaptersList.style.maxHeight = `${targetHeight}px`;
    chaptersList.style.overflowY = "auto";
  };

  updateChaptersMaxHeight();
  requestAnimationFrame(updateChaptersMaxHeight);
  setTimeout(updateChaptersMaxHeight, 50);
  setTimeout(updateChaptersMaxHeight, 150);
  setTimeout(updateChaptersMaxHeight, 350);
  setTimeout(updateChaptersMaxHeight, 700);

  const coverImg = container.querySelector(".details-cover img");
  if (coverImg) {
    if (coverImg.complete) {
      updateChaptersMaxHeight();
    } else {
      coverImg.addEventListener("load", updateChaptersMaxHeight);
    }
  }

  // Bind to window event listeners
  window.addEventListener("audiobook-time-update", timeUpdateHandler);
  window.addEventListener("audiobook-track-change", trackChangeHandler);
  window.addEventListener("audiobook-play-state-change", playStateChangeHandler);
  window.addEventListener("resize", updateChaptersMaxHeight);

  // Store references on the container element so they can be cleaned up if needed
  const cleanup = () => {
    container.style.overflow = "";
    window.removeEventListener("audiobook-time-update", timeUpdateHandler);
    window.removeEventListener("audiobook-track-change", trackChangeHandler);
    window.removeEventListener("audiobook-play-state-change", playStateChangeHandler);
    window.removeEventListener("resize", updateChaptersMaxHeight);
    activeDetailsCleanup = null;
  };
  activeDetailsCleanup = cleanup;
  container.cleanupDetailsListeners = cleanup;
}

export function openEditModal(book, onSaved) {
  if (!book) return;
  const API_BASE = getApiBase();

  const existingModal = document.getElementById("edit-metadata-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.className = "edit-modal-overlay fade-in";
  modal.id = "edit-metadata-modal";
  modal.innerHTML = `
    <div class="edit-modal-card" style="max-width: 600px;">
      <div class="edit-modal-header">
        <h3><i data-lucide="pencil"></i> Edit Audiobook Metadata</h3>
        <button class="edit-modal-close" id="edit-modal-close"><i data-lucide="x"></i></button>
      </div>
      
      <form id="edit-metadata-form" class="edit-modal-body">
        <!-- Audnex ASIN Auto-Fetch Section -->
        <div class="edit-asin-fetch-box" style="background: var(--bg-surface, #212121); border: 1px solid var(--border-color, #292929); padding: 14px; border-radius: var(--radius-md, 6px); margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: var(--accent-primary, #f27d11); margin-bottom: 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">
            Auto-Fetch Metadata via Audible ASIN (Audnex API)
          </label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="edit-asin-input" value="${book.asin || ''}" placeholder="e.g. B00513E65Q or B0071LS8MS" style="flex: 1; font-family: monospace; background: var(--bg-primary, #121212); color: var(--text-main, #edeae6); border: 1px solid var(--border-color, #292929); border-radius: var(--radius-sm, 4px); padding: 8px 12px; font-size: 0.85rem;" />
            <select id="edit-asin-region" style="background: var(--bg-primary, #121212); color: var(--text-main, #edeae6); border: 1px solid var(--border-color, #292929); border-radius: var(--radius-sm, 4px); padding: 0 10px; font-weight: 500; cursor: pointer; font-size: 0.85rem;">
              <option value="uk" selected style="background: var(--bg-surface, #212121); color: var(--text-main, #edeae6);">UK (United Kingdom)</option>
              <option value="us" style="background: var(--bg-surface, #212121); color: var(--text-main, #edeae6);">US (United States)</option>
              <option value="ca" style="background: var(--bg-surface, #212121); color: var(--text-main, #edeae6);">CA (Canada)</option>
              <option value="de" style="background: var(--bg-surface, #212121); color: var(--text-main, #edeae6);">DE (Germany)</option>
              <option value="fr" style="background: var(--bg-surface, #212121); color: var(--text-main, #edeae6);">FR (France)</option>
              <option value="au" style="background: var(--bg-surface, #212121); color: var(--text-main, #edeae6);">AU (Australia)</option>
            </select>
            <button type="button" class="btn-primary-play" id="edit-asin-fetch-btn" style="white-space: nowrap; padding: 0 14px; font-size: 0.8rem;">
              <i data-lucide="search"></i>
              <span>Fetch</span>
            </button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="edit-use-asin-chapters" checked style="width: 15px; height: 15px; accent-color: var(--accent-primary, #f27d11); cursor: pointer;" />
              <label for="edit-use-asin-chapters" style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary, #b8b5b0); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="list-music" style="width: 14px; height: 14px; color: var(--accent-primary, #f27d11);"></i>
                Use Audnex ASIN Chapters (Fetch official chapter list & timestamps)
              </label>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="edit-replace-description" checked style="width: 15px; height: 15px; accent-color: var(--accent-primary, #f27d11); cursor: pointer;" />
              <label for="edit-replace-description" style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary, #b8b5b0); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="file-text" style="width: 14px; height: 14px; color: var(--accent-primary, #f27d11);"></i>
                Replace Description with Audnex Summary / Full Synopsis
              </label>
            </div>
          </div>
          <div id="edit-asin-status" style="margin-top: 8px; font-size: 0.8rem; min-height: 18px;"></div>
        </div>

        <div class="edit-field">
          <label>Audiobook Title</label>
          <input type="text" id="edit-title-input" value="${book.title || ''}" required />
        </div>

        <div class="edit-field-row">
          <div class="edit-field">
            <label>Author(s)</label>
            <input type="text" id="edit-author-input" value="${book.author || ''}" required />
          </div>
          <div class="edit-field">
            <label>Narrator(s)</label>
            <input type="text" id="edit-narrator-input" value="${book.narrator || ''}" required />
          </div>
        </div>

        <div class="edit-field">
          <label>Publication Year / Release Date</label>
          <input type="text" id="edit-year-input" value="${book.releaseYear || book.date || ''}" placeholder="e.g. 2012" />
        </div>

        <div class="edit-field">
          <label>Description / Synopsis</label>
          <textarea id="edit-desc-input" rows="4">${book.description || ''}</textarea>
        </div>

        <div class="edit-modal-footer">
          <button type="button" class="btn-secondary" id="edit-reset-cover-btn" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.8rem;" title="Reset cover image back to original backend cover.jpg">
            <i data-lucide="rotate-ccw"></i>
            <span>Reset Cover</span>
          </button>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancel</button>
            <button type="submit" class="btn-primary-play" style="width: auto; padding: 6px 16px;">
              <i data-lucide="check"></i>
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const closeModal = () => modal.remove();
  document.getElementById("edit-modal-close").addEventListener("click", closeModal);
  document.getElementById("edit-modal-cancel").addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Reset Cover Button Handler
  const resetCoverBtn = document.getElementById("edit-reset-cover-btn");
  if (resetCoverBtn) {
    resetCoverBtn.addEventListener("click", () => {
      const backendCoverUrl = (typeof book.id === "number" || !isNaN(Number(book.id)))
        ? `${API_BASE}/api/audiobooks/${book.id}/cover`
        : "cover.jpg";

      // Clear any fetched ASIN cover override from dataset and flag reset
      const asinInputEl = document.getElementById("edit-asin-input");
      if (asinInputEl) {
        delete asinInputEl.dataset.fetchedCover;
        asinInputEl.dataset.resetCover = "true";
      }

      // Update active book object
      book.cover = backendCoverUrl;

      // Update active Player UI if loaded
      if (player.currentBook && String(player.currentBook.id) === String(book.id)) {
        player.currentBook.cover = backendCoverUrl;
        player.updateUI();
      }

      const statusDivEl = document.getElementById("edit-asin-status");
      if (statusDivEl) {
        statusDivEl.innerHTML = `<span style="color: #38bdf8; font-weight: 600; display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle"></i> Cover reset to original backend cover (${backendCoverUrl})!</span>`;
        if (window.lucide) window.lucide.createIcons();
      }

      // Re-render hero image in details view
      const detailCoverImg = document.querySelector(".details-hero-cover img");
      if (detailCoverImg) {
        detailCoverImg.src = backendCoverUrl;
      }
    });
  }

  // Audnex ASIN Query Handler (Backend Server-Side Enrichment)
  const fetchBtn = document.getElementById("edit-asin-fetch-btn");
  const asinInput = document.getElementById("edit-asin-input");
  const statusDiv = document.getElementById("edit-asin-status");

  if (fetchBtn) {
    fetchBtn.addEventListener("click", async () => {
      const rawAsin = asinInput.value.trim().toUpperCase();
      if (!rawAsin) {
        statusDiv.innerHTML = `<span style="color: #ef4444; display: flex; align-items: center; gap: 4px;"><i data-lucide="alert-circle"></i> Please enter a valid Audible ASIN (e.g. B0071LS8MS).</span>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      statusDiv.innerHTML = `<span style="color: var(--accent-primary, #f27d11); display: flex; align-items: center; gap: 6px;"><i data-lucide="loader-2" class="spin"></i> Enriching backend database for ASIN ${rawAsin}...</span>`;
      if (window.lucide) window.lucide.createIcons();
      fetchBtn.disabled = true;

      try {
        const regionEl = document.getElementById("edit-asin-region");
        const region = regionEl ? regionEl.value : "us";
        const chaptersCb = document.getElementById("edit-use-asin-chapters");
        const fetchChapters = chaptersCb ? chaptersCb.checked : true;
        const API_BASE = getApiBase();

        const response = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${book.id}/asin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asin: rawAsin, country: region, fetchChapters: fetchChapters })
        }, 10000);

        if (response.ok) {
          statusDiv.innerHTML = `<span style="color: #22c55e; font-weight: 600; display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle-2"></i> Metadata for "${rawAsin}" successfully enriched in PostgreSQL database! Click Save Changes to refresh.</span>`;
        } else {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }
      } catch (err) {
        console.warn("[Aura Backend ASIN] Error:", err);
        statusDiv.innerHTML = `<span style="color: #ef4444; display: flex; align-items: center; gap: 4px;"><i data-lucide="alert-triangle"></i> Backend ASIN Enrichment Failed: ${err.message || "ASIN query failed"}</span>`;
      } finally {
        if (window.lucide) window.lucide.createIcons();
        fetchBtn.disabled = false;
      }
    });
  }

  document.getElementById("edit-metadata-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const asinInput = document.getElementById("edit-asin-input");
    const cleanAsin = asinInput ? asinInput.value.trim().toUpperCase() : (book.asin || "");
    const regionEl = document.getElementById("edit-asin-region");
    const region = regionEl ? regionEl.value : "us";
    const chaptersCb = document.getElementById("edit-use-asin-chapters");
    const fetchChapters = chaptersCb ? chaptersCb.checked : true;

    // Submit ASIN payload { asin, country, fetchChapters } to Spring Boot backend PUT /api/audiobooks/{id}/asin
    if (cleanAsin) {
      try {
        const API_BASE = getApiBase();
        await fetchWithTimeout(`${API_BASE}/api/audiobooks/${book.id}/asin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asin: cleanAsin, country: region, fetchChapters: fetchChapters })
        }, 10000);
      } catch (aErr) {
        console.warn("[Aura Backend ASIN Submit] Notice:", aErr);
      }
    }

    closeModal();
    if (typeof onSaved === "function") {
      onSaved(book);
    } else {
      renderDetails(book.id);
    }
  });
}

export async function renderEbookDetails(ebookId) {
  if (typeof activeDetailsCleanup === "function") {
    activeDetailsCleanup();
    activeDetailsCleanup = null;
  }
  const API_BASE = getApiBase();
  const container = document.getElementById("main-content");
  container.className = "fade-in";
  container.style.overflowY = "auto";

  let ebook = null;
  try {
    let response = await fetchWithTimeout(`${API_BASE}/api/Ebooks/${ebookId}`);
    if (!response.ok) {
      response = await fetchWithTimeout(`${API_BASE}/api/ebooks/${ebookId}`);
    }
    if (!response.ok) {
      response = await fetchWithTimeout(`${API_BASE}/api/epub/${ebookId}`);
    }
    if (response.ok) {
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("json")) {
        ebook = await response.json();
      }
    }
  } catch (err) {
    console.warn(`[Aura Ebook] Error fetching /api/Ebooks/${ebookId}:`, err);
  }

  // If specific ID fetch didn't return, check list from /api/Ebooks
  if (!ebook) {
    try {
      let response = await fetchWithTimeout(`${API_BASE}/api/Ebooks`);
      if (!response.ok) {
        response = await fetchWithTimeout(`${API_BASE}/api/ebooks`);
      }
      if (response.ok) {
        const list = await response.json();
        if (Array.isArray(list)) {
          ebook = list.find(b => String(b.id) === String(ebookId));
        }
      }
    } catch (e) {}
  }

  if (!ebook) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--text-muted);">
        <h2>E-Book Not Found</h2>
        <p style="margin-top: 8px;">No e-book found matching ID ${ebookId}.</p>
        <button class="back-btn" onclick="location.hash='#library'" style="margin-top: 16px;">Return to Library</button>
      </div>
    `;
    return;
  }

  ebook.id = ebook.id ?? ebookId;

  const title = ebook.title || `E-Book #${ebook.id}`;
  const isbn = ebook.ISBN || ebook.isbn || "N/A";
  const audioBookId = ebook.audioBookId;

  // Look up matching audiobook metadata if loaded in player
  if (audioBookId && player.currentBook && String(player.currentBook.id) === String(audioBookId)) {
    if (!ebook.author || ebook.author === "Unknown Author") ebook.author = player.currentBook.author;
    if (!ebook.description) ebook.description = player.currentBook.description;
  }

  let coverUrl = `${API_BASE}/api/EBooks/${ebook.id}/cover`;
  if (customCover && !customCover.includes("media-amazon.com")) {
    coverUrl = customCover;
  }

  let html = `
    <!-- Top Bar: Back Button Left -->
    <div class="back-btn-container" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; width: 100%;">
      <button class="back-btn" id="btn-back-lib">
        <i data-lucide="arrow-left"></i>
        Back to E-Books Library
      </button>

      <div class="details-top-icon-actions" style="display: flex; gap: 10px; align-items: center;">
        <button class="top-icon-btn" id="btn-edit-ebook-meta" title="Edit E-Book Metadata" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: var(--text-muted); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
          <i data-lucide="pencil" style="width: 18px; height: 18px;"></i>
        </button>
      </div>
    </div>

    <!-- Details Grid -->
    <div class="details-grid is-ebook-details" style="padding-bottom: 40px;">
      <!-- Left Column: Artwork and Quick Actions -->
      <div class="details-artwork-col">
        <div class="details-cover is-ebook-cover">
          <img src="${coverUrl}" alt="${title}" onerror="this.onerror=null; this.src='assets/covers/default.jpg';" />
        </div>
        
        <div class="details-actions">
          <!-- Primary Read EPUB Button -->
          <button class="btn-primary-play" id="ebook-details-read-btn" style="background: linear-gradient(135deg, #0284c7, #6366f1); border-color: rgba(56, 189, 248, 0.4);">
            <i data-lucide="book-open"></i>
            <span>Read EPUB E-Book</span>
          </button>

          ${audioBookId ? `
            <div class="details-secondary-actions">
              <!-- View Linked Audiobook Button -->
              <button class="btn-secondary" id="ebook-details-audiobook-btn" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border-color: rgba(56, 189, 248, 0.35);" title="View matching Audiobook entry">
                <i data-lucide="headphones"></i>
                <span>View Audiobook</span>
              </button>
            </div>
          ` : ""}
        </div>
      </div>

      <!-- Right Column: Content and Metadata -->
      <div class="details-content-col">
        <div class="details-title-section">
          <h1 class="details-title">${title}</h1>
          <p class="details-author">By ${ebook.author || "Unknown Author"}</p>
        </div>

        <!-- Description -->
        <div class="details-description">
          <h3>Description</h3>
          <p class="desc-text">${ebook.description || "Digital EPUB e-book. Includes synchronized text formatting and SMIL Media Overlay support for audio sync."}</p>
        </div>

        <!-- E-Book Chapters Table / Info Section -->
        <div class="chapters-section" style="margin-top: 24px;">
          <div class="chapters-header-row">
            <h3>
              <i data-lucide="book-open"></i>
              E-Book Structure & Chapters
            </h3>
            <span class="chapters-count" id="ebook-chapters-badge">Extracting...</span>
          </div>

          <div id="ebook-chapters-status" style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
            <i data-lucide="loader-2" class="spin" style="width: 24px; height: 24px; color: #38bdf8; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;"></i>
            Extracting EPUB structure, TOC chapters, and SMIL overlays...
          </div>

          <div class="chapters-list" id="ebook-chapters-list-container" style="display: none;"></div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();

  // Live extract EPUB structure and render chapters list
  (async () => {
    try {
      const arrayBuf = await fetchEpubBuffer(ebook);
      if (!arrayBuf) {
        const statusBox = document.getElementById("ebook-chapters-status");
        if (statusBox) {
          statusBox.innerHTML = `
            <i data-lucide="info" style="width: 20px; height: 20px; color: #38bdf8; margin-bottom: 6px; display: block; margin-left: auto; margin-right: auto;"></i>
            EPUB document ready. Click <strong>Read EPUB E-Book</strong> to open in reader.
          `;
          if (window.lucide) window.lucide.createIcons();
        }
        const badge = document.getElementById("ebook-chapters-badge");
        if (badge) badge.textContent = "Extracted on Read";
        return;
      }

      const extractedChapters = await extractEpubChapters(arrayBuf);
      if (extractedChapters && extractedChapters.length > 0) {
        const badge = document.getElementById("ebook-chapters-badge");
        const statusBox = document.getElementById("ebook-chapters-status");
        const listContainer = document.getElementById("ebook-chapters-list-container");

        if (badge) badge.textContent = `${extractedChapters.length} Chapters Extracted`;
        if (statusBox) statusBox.style.display = "none";

        if (listContainer) {
          listContainer.style.display = "flex";
          let currentStartPage = 1;

          listContainer.innerHTML = extractedChapters.map((ch, idx) => {
            const chTitle = ch.title || `Chapter ${idx + 1}`;
            const pCount = ch.pageCount || (ch.paragraphs && ch.paragraphs.length > 0 ? ch.paragraphs.length : 1);
            const startPage = currentStartPage;
            currentStartPage += pCount;

            const hasSmil = ch.smilOverlay && ch.smilOverlay.length > 0;

            return `
              <div class="chapter-item ebook-extracted-chapter-item" data-idx="${idx}">
                <div class="chapter-item-left">
                  <span class="chapter-play-state">
                    <i data-lucide="book-open"></i>
                  </span>
                  <span class="chapter-title">${chTitle}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  ${hasSmil ? `<span style="color: #a78bfa; background: rgba(167, 139, 250, 0.15); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(167,139,250,0.3); font-size: 0.75rem;"><i data-lucide="headphones" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>Audio Sync</span>` : ''}
                  <span class="chapter-duration">Page ${startPage}</span>
                </div>
              </div>
            `;
          }).join("");

          if (badge) badge.textContent = `${extractedChapters.length} Chapters • ${currentStartPage - 1} Total Pages`;

          if (window.lucide) window.lucide.createIcons();

          listContainer.querySelectorAll(".ebook-extracted-chapter-item").forEach(item => {
            item.addEventListener("click", () => {
              const chIdx = parseInt(item.getAttribute("data-idx"), 10);
              openEpubReader(ebook, chIdx, true);
            });
          });
        }
      } else {
        const badge = document.getElementById("ebook-chapters-badge");
        if (badge) badge.textContent = "0 Chapters";
      }
    } catch (e) {
      console.warn("[Aura EPUB] Could not live extract structure:", e);
      const badge = document.getElementById("ebook-chapters-badge");
      if (badge) badge.textContent = "Extracted on Read";
    }
  })();

  // Event Listeners
  document.getElementById("btn-back-lib")?.addEventListener("click", () => {
    localStorage.setItem("aura_library_tab", "ebooks");
    router.navigate("#library");
  });

  document.getElementById("btn-edit-ebook-meta")?.addEventListener("click", () => {
    openEditModal(ebook, () => renderEbookDetails(ebook.id));
  });

  document.getElementById("ebook-details-read-btn")?.addEventListener("click", () => {
    openEpubReader(ebook, 0, true);
  });

  document.getElementById("ebook-details-read-btn")?.addEventListener("click", () => {
    openEpubReader(ebook, 0, true);
  });

  document.getElementById("ebook-details-audiobook-btn")?.addEventListener("click", () => {
    if (audioBookId) {
      router.navigate(`#book/${audioBookId}`);
    }
  });
}

export function openUploadEpubModal(initialAudiobookId = "", initialFile = null, onSuccess = null) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop fade-in";
  modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;";

  const formattedInitialId = (initialAudiobookId !== undefined && initialAudiobookId !== null) ? String(initialAudiobookId) : "";

  modal.innerHTML = `
    <div class="modal-card" style="background: var(--bg-card, #12131a); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; width: 100%; max-width: 480px; padding: 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); color: var(--text-primary, #fff);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="font-size: 1.2rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 10px; color: #38bdf8;">
          <i data-lucide="upload-cloud" style="width: 22px; height: 22px;"></i>
          Upload EPUB E-Book
        </h2>
        <button id="upload-modal-close" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;">
          <i data-lucide="x" style="width: 20px; height: 20px;"></i>
        </button>
      </div>

      <form id="upload-epub-modal-form" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">
            Target Audiobook ID
          </label>
          <input type="text" id="modal-audiobook-id-input" value="${formattedInitialId}" placeholder="e.g. 45 (or leave blank)" style="width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #fff; font-size: 0.95rem;" />
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px;">
            Posts to <code style="color: #38bdf8;">POST /api/uploadEpub/{id}</code>. Enter target Audiobook ID or leave blank if unlinked.
          </span>
        </div>

        <div>
          <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">
            Select .EPUB File
          </label>
          <input type="file" id="modal-epub-file-input" accept=".epub" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.05); border: 1px dashed rgba(56,189,248,0.4); border-radius: 8px; color: #fff; font-size: 0.85rem;" />
        </div>

        <div id="modal-upload-status" style="font-size: 0.85rem; margin-top: 4px;"></div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px;">
          <button type="button" id="modal-upload-cancel" class="btn-secondary">Cancel</button>
          <button type="submit" id="modal-upload-submit" class="btn-primary-play" style="width: auto; padding: 8px 24px; background: linear-gradient(135deg, #0284c7, #6366f1); border-color: rgba(56,189,248,0.4);">
            <i data-lucide="upload"></i>
            <span>Upload E-Book</span>
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const closeModal = () => modal.remove();
  document.getElementById("upload-modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-upload-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  const fileInput = document.getElementById("modal-epub-file-input");
  if (initialFile) {
    const status = document.getElementById("modal-upload-status");
    status.innerHTML = `<span style="color: #38bdf8;">File selected: ${initialFile.name}</span>`;
  }

  document.getElementById("upload-epub-modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawIdInput = document.getElementById("modal-audiobook-id-input").value.trim();
    const targetAudiobookId = rawIdInput ? rawIdInput : "0";
    const selectedFile = (fileInput.files && fileInput.files[0]) ? fileInput.files[0] : initialFile;

    if (!selectedFile) {
      const status = document.getElementById("modal-upload-status");
      status.innerHTML = `<span style="color: #ef4444;">Please select an .epub file to upload.</span>`;
      return;
    }

    const submitBtn = document.getElementById("modal-upload-submit");
    const status = document.getElementById("modal-upload-status");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> <span>Uploading...</span>`;
    status.innerHTML = `<span style="color: #a78bfa;">Uploading ${selectedFile.name} to /api/uploadEpub/${targetAudiobookId}...</span>`;
    if (window.lucide) window.lucide.createIcons();

    try {
      await uploadEpubFile(targetAudiobookId, selectedFile);
      status.innerHTML = `<span style="color: #22c55e;">Upload successful!</span>`;
      setTimeout(() => {
        closeModal();
        if (typeof onSuccess === "function") {
          onSuccess(targetAudiobookId, selectedFile);
        }
      }, 500);
    } catch (err) {
      console.error("[Upload Modal Error]", err);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="upload"></i> <span>Retry Upload</span>`;
      status.innerHTML = `<span style="color: #ef4444;">Upload failed: ${err.message}</span>`;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}


