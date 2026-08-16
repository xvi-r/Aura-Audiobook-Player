// Book Details View Controller
import { AUDIOBOOKS } from "./data.js";
import { player } from "./player.js";
import { router } from "./router.js";
import { getApiBase, fetchWithTimeout } from "./config.js";
import { openEpubReader, uploadEpubFile, checkEpubExists, extractEpubChapters, fetchEpubBuffer } from "./epub_reader.js";

export async function renderDetails(bookId) {
  const API_BASE = getApiBase();
  const container = document.getElementById("main-content");
  container.className = "fade-in";
  container.style.overflow = "hidden";

  let book = null;
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${bookId}`);
    if (response.ok) {
      book = await response.json();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    console.warn(`Spring Boot backend offline or not found, falling back to mock database for book: ${bookId}`, err);
    book = AUDIOBOOKS.find((b) => String(b.id) === String(bookId));
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

  // Parse embedded progressResponse or fetch freshest progress
  if (book.progressResponse !== undefined) {
    if (book.progressResponse && book.progressResponse.position !== undefined && book.progressResponse.position !== null) {
      book.position = parseFloat(book.progressResponse.position);
      book.progressSeconds = parseFloat(book.progressResponse.position);
      book.completed = !!book.progressResponse.completed;
    } else {
      book.position = 0;
      book.progressSeconds = 0;
      book.completed = false;
    }
  } else if (book.position !== undefined && book.position !== null) {
    book.progressSeconds = parseFloat(book.position);
  } else {
    try {
      const progRes = await fetchWithTimeout(`${API_BASE}/api/audiobooks/${book.id}/progress`, {}, 2500);
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData && progData.position !== undefined && progData.position !== null) {
          book.position = parseFloat(progData.position);
          book.progressSeconds = parseFloat(progData.position);
          book.completed = progData.completed;
        }
      }
    } catch (e) {}
  }

  // Look up matching mock entry by ID or title
  const mockMatch = AUDIOBOOKS.find((b) => 
    String(b.id) === String(book.id) || 
    (b.title && book.title && b.title.toLowerCase().trim() === book.title.toLowerCase().trim())
  );

  // Map API entities to UI expectations
  book.progressSeconds = book.position ?? book.progressSeconds ?? 0;
  
  const savedMeta = localStorage.getItem(`aura_meta_${book.id}`);
  let customCover = null;
  if (savedMeta) {
    try {
      const overrides = JSON.parse(savedMeta);
      if (overrides.title) book.title = overrides.title;
      if (overrides.author) book.author = overrides.author;
      if (overrides.narrator) book.narrator = overrides.narrator;
      if (overrides.releaseYear) book.releaseYear = overrides.releaseYear;
      if (overrides.description) book.description = overrides.description;
      if (overrides.cover) customCover = overrides.cover;
      if (overrides.asin) book.asin = overrides.asin;
      if (overrides.publisher) book.publisher = overrides.publisher;
      if (overrides.series) book.series = overrides.series;
      if (overrides.isbn) book.isbn = overrides.isbn;
      if (overrides.language) book.language = overrides.language;
      if (overrides.copyright) book.copyright = overrides.copyright;
      if (overrides.formatType) book.formatType = overrides.formatType;
      if (overrides.genres && Array.isArray(overrides.genres)) book.genres = overrides.genres;
      if (overrides.rating) book.rating = parseFloat(overrides.rating);
      if (overrides.duration) book.duration = overrides.duration;
      if (overrides.chapters && Array.isArray(overrides.chapters) && overrides.chapters.length > 0) {
        book.chapters = overrides.chapters;
      }
    } catch (e) {
      console.warn("Failed to parse local metadata overrides", e);
    }
  }

  book.chapters = book.chapters || (mockMatch ? mockMatch.chapters : []);
  book.author = book.author || (mockMatch ? mockMatch.author : "Unknown Author");
  book.narrator = book.narrator || (mockMatch ? mockMatch.narrator : "Digital EPUB Edition");

  let coverUrl = customCover;
  if (!coverUrl) {
    if (book.cover && (book.cover.startsWith("http") || book.cover.startsWith("data:") || book.cover.startsWith("assets/"))) {
      coverUrl = book.cover;
    } else {
      const targetId = book.audioBookId ?? book.id;
      coverUrl = `${API_BASE}/api/audiobooks/${targetId}/cover`;
    }
  }
  book.cover = coverUrl;
  
  // Year: Read directly from backend payload fields without inventing fake dates
  const backendYear = book.releaseYear || book.publishedYear || book.year || book.date || (mockMatch ? (mockMatch.releaseYear || mockMatch.year) : "");
  book.releaseYear = backendYear ? String(backendYear) : "";

  // Runtime / Length
  const totalSecs = book.duration || (mockMatch ? mockMatch.runtimeSeconds : 0);
  book.runtimeStr = book.runtime || (totalSecs ? player.formatTime(totalSecs) : (mockMatch ? mockMatch.runtime : "Unabridged"));

  // Genres & Franchise Tagging
  let rawGenres = book.genres || (mockMatch ? mockMatch.genres : []);
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

  // Match against exact FRANCHISES map
  const bookText = `${book.title || ""} ${book.series || ""} ${book.description || ""}`.toLowerCase();
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

  book.rating = book.rating || (mockMatch ? mockMatch.rating : 4.8);
  book.narrator = book.narrator || (mockMatch ? mockMatch.narrator : "Narrator Unspecified");
  book.description = book.description || (mockMatch ? mockMatch.description : "No description available.");
  book.publisher = book.publisher || (mockMatch ? mockMatch.publisher : "Publisher Unknown");

  // Auto-fetch Audnex official ASIN chapters if book has an ASIN and no cached ASIN chapters exist
  if (book.asin && (!savedMeta || !JSON.parse(savedMeta).chapters)) {
    try {
      const chResp = await fetch(`https://api.audnex.us/books/${encodeURIComponent(book.asin)}/chapters?region=uk`);
      if (chResp.ok) {
        const chData = await chResp.json();
        if (chData && Array.isArray(chData.chapters) && chData.chapters.length > 0) {
          book.chapters = chData.chapters.map((ch, idx) => {
            const startSec = ch.startOffsetSec !== undefined ? ch.startOffsetSec : Math.floor((ch.startOffsetMs || 0) / 1000);
            const durSec = ch.lengthMs ? Math.floor(ch.lengthMs / 1000) : 0;
            return {
              id: idx + 1,
              title: ch.title || `Chapter ${idx + 1}`,
              startTime: startSec,
              duration: durSec
            };
          });
          // Cache in local overrides
          try {
            const existingMeta = savedMeta ? JSON.parse(savedMeta) : {};
            existingMeta.chapters = book.chapters;
            localStorage.setItem(`aura_meta_${book.id}`, JSON.stringify(existingMeta));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("[Aura Audnex] Auto-fetch chapters on render error:", e);
    }
  }

  if (!book.chapters || !Array.isArray(book.chapters) || book.chapters.length === 0) {
    if (mockMatch && mockMatch.chapters && mockMatch.chapters.length > 0) {
      book.chapters = mockMatch.chapters;
    } else {
      book.chapters = [
        { id: 1, title: book.title || "Full Audiobook", startTime: 0, duration: totalSecs || 0 }
      ];
    }
  }

  // Sort chapters in logical ascending order of start time
  book.chapters.sort((a, b) => player.getChapterStartTime(a) - player.getChapterStartTime(b));

  book.chapters.forEach((ch, idx) => {
    ch.duration = player.getChapterDuration(ch, idx, book.chapters);
  });

  // 1. Determine playback status for the primary action button
  const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
  if (isLoadedInPlayer) {
    player.currentBook = book;
  }
  const isCurrentlyPlaying = isLoadedInPlayer && player.isPlaying;
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

  // Disable automatic network check for now as requested so "Upload E-Book" button is always available
  const hasEpub = Boolean(
    localStorage.getItem(`aura_has_epub_${book.id}`) === "true" ||
    window[`aura_epub_buf_${book.id}`]
  );
  book.hasEpub = hasEpub;

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
            ${hasEpub ? `
              <!-- Read & Listen EPUB Reader Button -->
              <button class="btn-secondary" id="details-read-epub-btn" style="background: rgba(139, 92, 246, 0.15); color: #a78bfa; border-color: rgba(139, 92, 246, 0.4);" title="Read and listen to synchronized EPUB text">
                <i data-lucide="book-open"></i>
                <span>Read & Listen</span>
              </button>
            ` : ""}

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
          ${book.series ? `
            <div class="details-series-tag" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 600; color: var(--accent-primary, #a78bfa); margin-top: 6px;">
              <i data-lucide="bookmark" style="width: 14px; height: 14px;"></i>
              <span>${book.series}</span>
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
            <div class="details-meta-pill" style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.12); color: #f59e0b; font-weight: 600;">
              <i data-lucide="star" style="fill: #f59e0b; width: 14px; height: 14px;"></i>
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
          <p class="desc-text collapsed" id="details-desc-text">${book.description}</p>
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
          
          <div class="chapters-list" id="chapters-list-container">
            ${book.chapters.map((ch, idx) => {
              const isActiveChapter = isLoadedInPlayer && isCurrentlyPlaying && player.currentChapterIndex === idx;
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
        // Load current book and start play (respecting existing progress)
        player.loadBook(book, 0, book.progressSeconds || 0);
        player.play();
      }
      // Refresh page state (to update button icons and text)
      renderDetails(book.id);
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

  // Read & Listen EPUB Reader Button
  const readEpubBtn = document.getElementById("details-read-epub-btn");
  if (readEpubBtn) {
    readEpubBtn.addEventListener("click", () => {
      try {
        const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
        let targetChapterIdx = 0;

        if (isLoadedInPlayer) {
          targetChapterIdx = player.currentChapterIndex || 0;
        } else if (book.progressSeconds > 0 && book.chapters && book.chapters.length > 0) {
          let accum = 0;
          for (let i = 0; i < book.chapters.length; i++) {
            const chDur = player.getChapterDuration ? player.getChapterDuration(book.chapters[i], i, book.chapters) : 0;
            if (accum + chDur >= book.progressSeconds) {
              targetChapterIdx = i;
              break;
            }
            accum += chDur;
          }
        }

        openEpubReader(book, targetChapterIdx, false);
      } catch (err) {
        console.error("Failed to open EPUB reader from details view:", err);
      }
    });
  }

  // Reset Progress Button
  const resetBtn = document.getElementById("details-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      book.progressSeconds = 0;
      book.position = 0;
      book.completed = false;
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

  // Chapters click handlers (fully functional chapter navigation!)
  const chapterItems = container.querySelectorAll(".chapter-item");
  console.log("[Aura] Found", chapterItems.length, "chapter items in DOM");
  chapterItems.forEach(item => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.getAttribute("data-idx"), 10);
      const ch = book.chapters[idx];
      console.log("[Aura] Chapter clicked: idx=" + idx, "ch=", ch, "book.id=", book.id);
      if (!ch) {
        console.warn("[Aura] No chapter found at index", idx, "book.chapters.length=", book.chapters.length);
        return;
      }

      const startTime = player.getChapterStartTime(ch);
      console.log("[Aura] Chapter startTime=", startTime, "player.currentBook?", !!player.currentBook, "player.currentBook.id=", player.currentBook?.id);
      
      // Always use loadBook — it handles both same-book seeks and new-book loads
      player.loadBook(book, idx, startTime, true);

      // Update active row state in-place without resetting table scroll position!
      chapterItems.forEach(ci => ci.classList.remove("active"));
      item.classList.add("active");
    });
  });

  // Listen to global player updates to keep active chapters highlighted dynamically
  const timeUpdateHandler = (e) => {
    const isThisBookPlaying = player.currentBook && String(player.currentBook.id) === String(book.id) && player.isPlaying;
    if (e.detail && e.detail.bookId !== undefined && String(e.detail.bookId) === String(book.id) && isThisBookPlaying) {
      // Highlight the active chapter without full re-render for performance
      const listContainer = document.getElementById("chapters-list-container");
      if (listContainer) {
        const items = listContainer.querySelectorAll(".chapter-item");
        items.forEach((item, idx) => {
          const isActive = idx === e.detail.chapterIndex;
          const wasActive = item.classList.contains("active");
          
          if (isActive && !wasActive) {
            item.classList.add("active");
            const playStateSpan = item.querySelector(".chapter-play-state");
            if (playStateSpan) {
              playStateSpan.innerHTML = `<i data-lucide="volume-2"></i>`;
            }
          } else if (!isActive && wasActive) {
            item.classList.remove("active");
            const playStateSpan = item.querySelector(".chapter-play-state");
            if (playStateSpan) {
              playStateSpan.innerHTML = `<i data-lucide="play-circle"></i>`;
            }
          }
        });
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  const playStateChangeHandler = (e) => {
    if (e.detail && e.detail.bookId !== undefined && String(e.detail.bookId) === String(book.id)) {
      // Keep play/pause button state in sync
      const playBtn = document.getElementById("details-play-btn");
      if (playBtn) {
        const hasProgress = book.progressSeconds > 0;
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
      const listContainer = document.getElementById("chapters-list-container");
      if (listContainer) {
        const activeItem = listContainer.querySelector(".chapter-item.active");
        if (activeItem) {
          const playStateSpan = activeItem.querySelector(".chapter-play-state");
          if (playStateSpan) {
            playStateSpan.innerHTML = e.detail.isPlaying
              ? `<i data-lucide="volume-2"></i>`
              : `<i data-lucide="play-circle"></i>`;
            if (window.lucide) window.lucide.createIcons();
          }
        }
      }
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
  window.addEventListener("audiobook-play-state-change", playStateChangeHandler);
  window.addEventListener("resize", updateChaptersMaxHeight);

  // Store references on the container element so they can be cleaned up if needed
  container.cleanupDetailsListeners = () => {
    container.style.overflow = "";
    window.removeEventListener("audiobook-time-update", timeUpdateHandler);
    window.removeEventListener("audiobook-play-state-change", playStateChangeHandler);
    window.removeEventListener("resize", updateChaptersMaxHeight);
  };
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
        <div class="edit-asin-fetch-box" style="background: rgba(167, 139, 250, 0.08); border: 1px solid rgba(167, 139, 250, 0.25); padding: 14px; border-radius: 12px; margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--accent-primary, #a78bfa); margin-bottom: 8px; font-size: 0.9rem;">
            <i data-lucide="sparkles"></i> Auto-Fetch Metadata via Audible ASIN (Audnex API)
          </label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="edit-asin-input" value="${book.asin || ''}" placeholder="e.g. B00513E65Q or B0071LS8MS" style="flex: 1; font-family: monospace;" />
            <select id="edit-asin-region" style="background: rgba(255,255,255,0.08); color: var(--text-main, #fff); border: 1px solid var(--border-color, rgba(255,255,255,0.2)); border-radius: var(--radius-sm, 8px); padding: 0 10px; font-weight: 500; cursor: pointer;">
              <option value="uk" selected style="background: #1e1e24; color: #fff;">UK (United Kingdom)</option>
              <option value="us" style="background: #1e1e24; color: #fff;">US (United States)</option>
              <option value="ca" style="background: #1e1e24; color: #fff;">CA (Canada)</option>
              <option value="de" style="background: #1e1e24; color: #fff;">DE (Germany)</option>
              <option value="fr" style="background: #1e1e24; color: #fff;">FR (France)</option>
              <option value="au" style="background: #1e1e24; color: #fff;">AU (Australia)</option>
            </select>            <button type="button" class="btn-secondary" id="edit-asin-fetch-btn" style="white-space: nowrap; display: flex; align-items: center; gap: 6px; background: var(--accent-primary, #a78bfa); color: #000; font-weight: 600; border: none; padding: 0 16px;">
              <i data-lucide="search"></i>
              <span>Fetch Metadata</span>
            </button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="edit-use-asin-chapters" checked style="width: 16px; height: 16px; accent-color: var(--accent-primary, #a78bfa); cursor: pointer;" />
              <label for="edit-use-asin-chapters" style="font-size: 0.85rem; font-weight: 500; color: var(--text-main, #fff); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="list-music" style="width: 14px; height: 14px; color: var(--accent-primary, #a78bfa);"></i>
                Use Audnex ASIN Chapters (Fetch official chapter list & timestamps)
              </label>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="edit-replace-description" checked style="width: 16px; height: 16px; accent-color: var(--accent-primary, #a78bfa); cursor: pointer;" />
              <label for="edit-replace-description" style="font-size: 0.85rem; font-weight: 500; color: var(--text-main, #fff); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="file-text" style="width: 14px; height: 14px; color: var(--accent-primary, #a78bfa);"></i>
                Replace Description with Audnex Summary / Full Synopsis
              </label>
            </div>
          </div>
          <div id="edit-asin-status" style="margin-top: 8px; font-size: 0.825rem; min-height: 18px;"></div>
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
          <textarea id="edit-desc-input" rows="5">${book.description || ''}</textarea>
        </div>

        <div class="edit-modal-footer" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <button type="button" class="btn-secondary" id="edit-reset-cover-btn" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35); display: flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 0.85rem;" title="Reset cover image back to original backend cover.jpg">
            <i data-lucide="rotate-ccw"></i>
            <span>Reset Cover (cover.jpg)</span>
          </button>
          <div style="display: flex; gap: 10px;">
            <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancel</button>
            <button type="submit" class="btn-primary-play" style="width: auto; padding: 8px 20px;">
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

      // Remove custom cover override from localStorage
      try {
        const savedMeta = localStorage.getItem(`aura_meta_${book.id}`);
        if (savedMeta) {
          const overrides = JSON.parse(savedMeta);
          delete overrides.cover;
          localStorage.setItem(`aura_meta_${book.id}`, JSON.stringify(overrides));
        }
      } catch (e) {}

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

  // Audnex ASIN Query Handler
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

      statusDiv.innerHTML = `<span style="color: var(--accent-primary, #a78bfa); display: flex; align-items: center; gap: 6px;"><i data-lucide="loader-2" class="spin"></i> Querying Audnex API for ASIN ${rawAsin}...</span>`;
      if (window.lucide) window.lucide.createIcons();
      fetchBtn.disabled = true;

      try {
        const regionEl = document.getElementById("edit-asin-region");
        const region = regionEl ? regionEl.value : "uk";
        const response = await fetch(`https://api.audnex.us/books/${encodeURIComponent(rawAsin)}?region=${encodeURIComponent(region)}`);
        if (!response.ok) {
          throw new Error(`Audnex API returned HTTP ${response.status}`);
        }
        const data = await response.json();

        // Auto-fill Title
        if (data.title) {
          const titleEl = document.getElementById("edit-title-input");
          if (titleEl) titleEl.value = data.title;
        }

        // Auto-fill Authors
        if (data.authors && Array.isArray(data.authors) && data.authors.length > 0) {
          const authorEl = document.getElementById("edit-author-input");
          if (authorEl) authorEl.value = data.authors.map(a => a.name).filter(Boolean).join(", ");
        }

        // Auto-fill Narrators
        if (data.narrators && Array.isArray(data.narrators) && data.narrators.length > 0) {
          const narratorEl = document.getElementById("edit-narrator-input");
          if (narratorEl) narratorEl.value = data.narrators.map(n => n.name).filter(Boolean).join(", ");
        }

        // Auto-fill Year
        if (data.releaseDate) {
          const yearEl = document.getElementById("edit-year-input");
          const y = new Date(data.releaseDate).getFullYear();
          if (yearEl && !isNaN(y)) yearEl.value = y.toString();
        }

        // Auto-fill Description / Summary if checkbox is selected or missing
        const descEl = document.getElementById("edit-desc-input");
        const currentDesc = descEl ? descEl.value.trim() : "";
        const isMissingDesc = !currentDesc || currentDesc.toLowerCase() === "no description available.";
        const replaceDescCheckbox = document.getElementById("edit-replace-description");
        const shouldReplaceDesc = replaceDescCheckbox ? replaceDescCheckbox.checked : true;

        const rawSummary = data.summary || data.description || "";
        if (rawSummary && (shouldReplaceDesc || isMissingDesc)) {
          let formattedDesc = rawSummary
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<br\s*\/?>/gi, "\n");
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = formattedDesc;
          const cleanDesc = (tempDiv.textContent.trim() || tempDiv.innerText.trim()).replace(/\n\s*\n\s*\n+/g, "\n\n");
          if (descEl) descEl.value = cleanDesc;
          asinInput.dataset.fetchedDescription = cleanDesc;
        }

        // Fetch Official Audnex Chapters if checkbox is selected
        let chapterMsg = "";
        const useChaptersCheckbox = document.getElementById("edit-use-asin-chapters");
        if (useChaptersCheckbox && useChaptersCheckbox.checked) {
          try {
            const chResp = await fetch(`https://api.audnex.us/books/${encodeURIComponent(rawAsin)}/chapters?region=${encodeURIComponent(region)}`);
            if (chResp.ok) {
              const chData = await chResp.json();
              if (chData && Array.isArray(chData.chapters) && chData.chapters.length > 0) {
                const parsedChapters = chData.chapters.map((ch, idx) => {
                  const startSec = ch.startOffsetSec !== undefined ? ch.startOffsetSec : Math.floor((ch.startOffsetMs || 0) / 1000);
                  const durSec = ch.lengthMs ? Math.floor(ch.lengthMs / 1000) : 0;
                  return {
                    id: idx + 1,
                    title: ch.title || `Chapter ${idx + 1}`,
                    startTime: startSec,
                    duration: durSec
                  };
                });
                asinInput.dataset.fetchedChapters = JSON.stringify(parsedChapters);
                chapterMsg = ` & ${parsedChapters.length} official chapters`;
              }
            }
          } catch (chErr) {
            console.warn("[Aura Audnex] Error fetching ASIN chapters:", chErr);
          }
        }

        // Save extra fetched attributes to dataset for form submit payload
        if (data.image) asinInput.dataset.fetchedCover = data.image;
        if (data.publisherName) asinInput.dataset.fetchedPublisher = data.publisherName;
        if (data.seriesPrimary && data.seriesPrimary.name) asinInput.dataset.fetchedSeries = data.seriesPrimary.name;
        if (data.genres && Array.isArray(data.genres)) {
          asinInput.dataset.fetchedGenres = JSON.stringify(data.genres.map(g => g.name).filter(Boolean));
        }
        if (data.rating) asinInput.dataset.fetchedRating = data.rating;
        if (data.runtimeLengthMin) asinInput.dataset.fetchedRuntime = (data.runtimeLengthMin * 60).toString();
        if (data.isbn) asinInput.dataset.fetchedIsbn = data.isbn;
        if (data.language) asinInput.dataset.fetchedLanguage = data.language;
        if (data.copyright) asinInput.dataset.fetchedCopyright = data.copyright.toString();
        if (data.formatType) asinInput.dataset.fetchedFormat = data.formatType;

        statusDiv.innerHTML = `<span style="color: #22c55e; font-weight: 600; display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle-2"></i> Metadata${chapterMsg} for "${data.title}" successfully fetched from Audnex! Click Save Changes to apply.</span>`;
        if (window.lucide) window.lucide.createIcons();
      } catch (err) {
        console.warn("[Aura Audnex] Error fetching ASIN data:", err);
        statusDiv.innerHTML = `<span style="color: #ef4444; display: flex; align-items: center; gap: 4px;"><i data-lucide="alert-triangle"></i> Audnex Fetch Failed: ${err.message || "ASIN not found"}</span>`;
        if (window.lucide) window.lucide.createIcons();
      } finally {
        fetchBtn.disabled = false;
      }
    });
  }

  document.getElementById("edit-metadata-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const asinInput = document.getElementById("edit-asin-input");
    const cleanAsin = asinInput ? asinInput.value.trim().toUpperCase() : (book.asin || "");
    const regionEl = document.getElementById("edit-asin-region");
    const region = regionEl ? regionEl.value : "uk";
    const useChaptersCheckbox = document.getElementById("edit-use-asin-chapters");

    if (useChaptersCheckbox && useChaptersCheckbox.checked && cleanAsin && (!asinInput || !asinInput.dataset.fetchedChapters)) {
      try {
        const chResp = await fetch(`https://api.audnex.us/books/${encodeURIComponent(cleanAsin)}/chapters?region=${encodeURIComponent(region)}`);
        if (chResp.ok) {
          const chData = await chResp.json();
          if (chData && Array.isArray(chData.chapters) && chData.chapters.length > 0) {
            const parsedChapters = chData.chapters.map((ch, idx) => {
              const startSec = ch.startOffsetSec !== undefined ? ch.startOffsetSec : Math.floor((ch.startOffsetMs || 0) / 1000);
              const durSec = ch.lengthMs ? Math.floor(ch.lengthMs / 1000) : 0;
              return {
                id: idx + 1,
                title: ch.title || `Chapter ${idx + 1}`,
                startTime: startSec,
                duration: durSec
              };
            });
            if (asinInput) asinInput.dataset.fetchedChapters = JSON.stringify(parsedChapters);
          }
        }
      } catch (chErr) {
        console.warn("[Aura Audnex] Error fetching chapters on submit:", chErr);
      }
    }

    const isResetCover = asinInput && asinInput.dataset.resetCover === "true";
    let resolvedCover = book.cover || "";
    if (asinInput && asinInput.dataset.fetchedCover) {
      resolvedCover = asinInput.dataset.fetchedCover;
    } else if (isResetCover) {
      resolvedCover = (typeof book.id === "number" || !isNaN(Number(book.id)))
        ? `${API_BASE}/api/audiobooks/${book.id}/cover`
        : "cover.jpg";
    }

    const updated = {
      title: document.getElementById("edit-title-input").value.trim(),
      author: document.getElementById("edit-author-input").value.trim(),
      narrator: document.getElementById("edit-narrator-input").value.trim(),
      releaseYear: document.getElementById("edit-year-input").value.trim(),
      description: document.getElementById("edit-desc-input").value.trim() || (book.description || ""),
      asin: cleanAsin,
      cover: resolvedCover,
      publisher: (asinInput && asinInput.dataset.fetchedPublisher) ? asinInput.dataset.fetchedPublisher : (book.publisher || ""),
      series: (asinInput && asinInput.dataset.fetchedSeries) ? asinInput.dataset.fetchedSeries : (book.series || ""),
      genres: (asinInput && asinInput.dataset.fetchedGenres) ? JSON.parse(asinInput.dataset.fetchedGenres) : (book.genres || []),
      rating: (asinInput && asinInput.dataset.fetchedRating) ? parseFloat(asinInput.dataset.fetchedRating) : (book.rating || 4.8),
      duration: (asinInput && asinInput.dataset.fetchedRuntime) ? parseFloat(asinInput.dataset.fetchedRuntime) : (book.duration || 0),
      isbn: (asinInput && asinInput.dataset.fetchedIsbn) ? asinInput.dataset.fetchedIsbn : (book.isbn || ""),
      language: (asinInput && asinInput.dataset.fetchedLanguage) ? asinInput.dataset.fetchedLanguage : (book.language || ""),
      copyright: (asinInput && asinInput.dataset.fetchedCopyright) ? asinInput.dataset.fetchedCopyright : (book.copyright || ""),
      formatType: (asinInput && asinInput.dataset.fetchedFormat) ? asinInput.dataset.fetchedFormat : (book.formatType || ""),
      chapters: (asinInput && asinInput.dataset.fetchedChapters) ? JSON.parse(asinInput.dataset.fetchedChapters) : (book.chapters || [])
    };

    if (isResetCover) {
      delete updated.cover;
    }

    // Persist overrides locally
    localStorage.setItem(`aura_meta_${book.id}`, JSON.stringify(updated));

    // Update active book properties
    book.title = updated.title;
    book.author = updated.author;
    book.narrator = updated.narrator;
    book.releaseYear = updated.releaseYear;
    book.description = updated.description;
    book.asin = updated.asin;
    book.cover = resolvedCover;
    if (updated.publisher) book.publisher = updated.publisher;
    if (updated.series) book.series = updated.series;
    if (updated.genres && updated.genres.length > 0) book.genres = updated.genres;
    if (updated.rating) book.rating = updated.rating;
    if (updated.duration) book.duration = updated.duration;
    if (updated.isbn) book.isbn = updated.isbn;
    if (updated.language) book.language = updated.language;
    if (updated.copyright) book.copyright = updated.copyright;
    if (updated.formatType) book.formatType = updated.formatType;
    if (updated.chapters && updated.chapters.length > 0) book.chapters = updated.chapters;

    // If currently playing in player controller, update player UI dynamically
    if (player.currentBook && String(player.currentBook.id) === String(book.id)) {
      player.currentBook.title = updated.title;
      player.currentBook.author = updated.author;
      player.currentBook.narrator = updated.narrator;
      player.currentBook.cover = resolvedCover;
      player.updateUI();
    }

    // Try sending PUT to backend if endpoint exists
    try {
      const API_BASE = getApiBase();
      fetch(`${API_BASE}/api/audiobooks/${book.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch(() => {});
    } catch (err) {}

    closeModal();
    if (typeof onSaved === "function") {
      onSaved(book);
    } else {
      renderDetails(book.id);
    }
  });
}

export async function renderEbookDetails(ebookId) {
  const API_BASE = getApiBase();
  const container = document.getElementById("main-content");
  container.className = "fade-in";
  container.style.overflow = "hidden";

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

  // Load custom metadata overrides if saved
  const savedMeta = localStorage.getItem(`aura_meta_${ebook.id}`);
  let customCover = null;
  if (savedMeta) {
    try {
      const overrides = JSON.parse(savedMeta);
      if (overrides.title && !ebook.title) ebook.title = overrides.title;
      if (overrides.author && !ebook.author) ebook.author = overrides.author;
      if (overrides.description && !ebook.description) ebook.description = overrides.description;
      if (overrides.isbn && !ebook.ISBN) ebook.ISBN = overrides.isbn;
      if (overrides.cover) customCover = overrides.cover;
    } catch (e) {}
  }

  const title = ebook.title || `E-Book #${ebook.id}`;
  const isbn = ebook.ISBN || ebook.isbn || "N/A";
  const audioBookId = ebook.audioBookId;

  // Look up matching audiobook metadata strictly using audioBookId (e.g. 27), NOT E-Book ID (3)
  if (audioBookId) {
    const relatedAudiobook = AUDIOBOOKS.find((b) => String(b.id) === String(audioBookId));
    if (relatedAudiobook) {
      if (!ebook.author || ebook.author === "Unknown Author") ebook.author = relatedAudiobook.author;
      if (!ebook.description) ebook.description = relatedAudiobook.description;
    }
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


