// Library View Controller
import { AUDIOBOOKS } from "./data.js";
import { player } from "./player.js";
import { router } from "./router.js";
import { getApiBase, fetchWithTimeout } from "./config.js";
import { openEditModal } from "./details.js";
import { openEpubReader } from "./epub_reader.js";

export async function renderLibrary(searchQuery = "") {
  const API_BASE = getApiBase();
  const container = document.getElementById("main-content");
  container.className = "fade-in library-view-active"; // Trigger entry transition
  container.style.overflowY = "auto";
  container.style.paddingBottom = "80px";

  const gridDensity = localStorage.getItem("aura_grid_density") || "8";
  const query = searchQuery.trim().toLowerCase();
  
  let books = [];
  const userEndpointUrl = `${API_BASE}/api/audiobook/getUserAudiobooks`;
  const fallbackEndpointUrl = `${API_BASE}/api/audiobooks`;

  try {
    let response = await fetchWithTimeout(userEndpointUrl, {}, 6000);
    if (!response.ok) {
      response = await fetchWithTimeout(fallbackEndpointUrl, {}, 6000);
    }
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        books = data;
      }
    }
  } catch (err) {
    console.warn(`Spring Boot backend notice:`, err);
  }

  // If backend query returned empty array for audiobooks, show fallback audiobooks
  if (books.length === 0) {
    books = JSON.parse(JSON.stringify(AUDIOBOOKS));
  }

  // Helper to format duration in seconds to "Xh Ym"
  const formatDuration = (totalSecs) => {
    if (isNaN(totalSecs) || totalSecs <= 0) return "0m";
    const h = Math.floor(totalSecs / 3600);
    const m = Math.round((totalSecs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Map API entities to UI contract
  books.forEach(b => {
    b.id = b.id ?? b.bookId ?? b._id ?? b.audioBookId;
    b.title = b.title || "Untitled Book";
    b.author = b.author || "Unknown Author";

    const savedMeta = localStorage.getItem(`aura_meta_${b.id}`);
    let customCover = null;
    if (savedMeta) {
      try {
        const overrides = JSON.parse(savedMeta);
        if (overrides.title && !b.title) b.title = overrides.title;
        if (overrides.author && !b.author) b.author = overrides.author;
        if (overrides.narrator && !b.narrator) b.narrator = overrides.narrator;
        if (overrides.releaseYear && !b.releaseYear) b.releaseYear = overrides.releaseYear;
        if (overrides.description && !b.description) b.description = overrides.description;
        if (overrides.cover) customCover = overrides.cover;
        if (overrides.asin && !b.asin) b.asin = overrides.asin;
        if (overrides.genres && Array.isArray(overrides.genres) && (!b.genres || b.genres.length === 0)) b.genres = overrides.genres;
      } catch (e) {}
    }
    const pos = (b.position !== undefined && b.position !== null)
      ? parseFloat(b.position)
      : ((b.progressResponse && b.progressResponse.position !== undefined && b.progressResponse.position !== null)
        ? parseFloat(b.progressResponse.position)
        : (b.progressSeconds || 0));
    b.position = pos;
    b.progressSeconds = pos;
    b.completed = b.completed !== undefined ? !!b.completed : (b.progressResponse ? !!b.progressResponse.completed : false);
    b.lastPlayedTimestamp = b.lastPlayedTimestamp || 0;
    b.runtimeSeconds = b.duration || 0;

    // Cover image calculation
    let coverUrl = customCover;
    if (!coverUrl) {
      if (b.cover && (b.cover.startsWith("http") || b.cover.startsWith("data:") || b.cover.startsWith("assets/"))) {
        coverUrl = b.cover;
      } else {
        coverUrl = `${API_BASE}/api/audiobooks/${b.id}/cover`;
      }
    }
    b.cover = coverUrl;

    b.narrator = b.narrator || "Unknown Narrator";
    b.genres = b.genres || ["Audiobook"];
    b.rating = b.rating || "4.8";
    b.runtime = formatDuration(b.duration);
  });
  
  // 1. Filter Books
  const filteredBooks = books.filter((book) => {
    return (
      (book.title && book.title.toLowerCase().includes(query)) ||
      (book.author && book.author.toLowerCase().includes(query)) ||
      (book.narrator && book.narrator.toLowerCase().includes(query)) ||
      (book.genres && book.genres.some(genre => genre.toLowerCase().includes(query)))
    );
  });

  // 2. Separate "Continue Listening" (audiobooks only)
  const continueListeningList = books.filter(
    (b) => b.progressSeconds > 0 && b.progressSeconds < b.runtimeSeconds
  ).sort((a, b) => (b.lastPlayedTimestamp || 0) - (a.lastPlayedTimestamp || 0));

  // Assemble HTML Content
  let html = `
    <!-- Header Block -->
    <div class="library-header">
      <div class="welcome-section">
        <h1>Your Audiobook Library</h1>
        <p>Explore your collection and continue where you left off.</p>
      </div>
      <div class="search-container">
        <input 
          type="text" 
          id="lib-search" 
          class="search-input" 
          placeholder="Search title, author, narrator..." 
          value="${searchQuery}"
        />
        <i data-lucide="search" class="search-icon"></i>
      </div>
    </div>
  `;

  // 3. Continue Listening Shelf (Only show when not searching and we have items)
  if (query === "" && continueListeningList.length > 0) {
    html += `
      <section class="shelf-section">
        <h2 class="shelf-title">
          <i data-lucide="play-circle"></i>
          Continue Listening
        </h2>
        <div class="horizontal-shelf">
          ${continueListeningList.map(book => {
            const percent = Math.round((book.progressSeconds / book.runtimeSeconds) * 100);
            const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
            const isCurrentlyPlaying = isLoadedInPlayer && player.isPlaying;
            
            // Calculate remaining hours & mins
            const remainingSecs = book.runtimeSeconds - book.progressSeconds;
            const remHrs = Math.floor(remainingSecs / 3600);
            const remMins = Math.round((remainingSecs % 3600) / 60);
            const remainingText = remHrs > 0 ? `${remHrs}h ${remMins}m left` : `${remMins}m left`;

            return `
              <div class="continue-card" data-id="${book.id}">
                <div class="continue-cover">
                  <img src="${book.cover}" alt="${book.title}" />
                </div>
                <div class="continue-info">
                  <div class="continue-meta">
                    <span class="continue-title">${book.title}</span>
                    <span class="continue-author">By ${book.author}</span>
                    <span class="continue-narrator">Narrated by ${book.narrator}</span>
                  </div>
                  <div class="continue-progress-section">
                    <div class="continue-time-left">
                      <span>${percent}% completed</span>
                      <div style="display: inline-flex; align-items: center; gap: 6px;">
                        <span>${remainingText}</span>
                      </div>
                    </div>
                    <div class="progress-bar-container">
                      <div class="progress-bar-fill" style="width: ${percent}%"></div>
                    </div>
                  </div>
                </div>
                <button class="continue-play-btn" data-id="${book.id}">
                  <i data-lucide="play"></i>
                </button>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  // 4. Main Library Grid
  html += `
    <section class="shelf-section">
      <h2 class="shelf-title">
        <i data-lucide="library"></i>
        ${query ? `Search Results (${filteredBooks.length})` : 'All Audiobooks'}
      </h2>
      
      ${
        filteredBooks.length === 0
          ? `<div style="text-align: center; color: var(--text-muted); padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg)">
              No audiobooks found matching your search.
             </div>`
          : `<div class="books-grid grid-cols-${gridDensity}">
              ${filteredBooks.map(book => {
                const isStarted = book.progressSeconds > 0;
                const percent = Math.round((book.progressSeconds / Math.max(1, book.runtimeSeconds)) * 100);
                const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
                const isCurrentlyPlaying = isLoadedInPlayer && player.isPlaying;
                
                return `
                  <div class="book-card ${isCurrentlyPlaying ? 'is-playing' : ''}" data-id="${book.id}">
                    <div class="book-cover-wrapper">
                      <img src="${book.cover}" alt="${book.title}" onerror="this.onerror=null; this.src='assets/covers/default.jpg';" />
                      <button class="book-card-play-btn" data-id="${book.id}" title="Play Audiobook">
                        <i data-lucide="${isCurrentlyPlaying ? 'pause' : 'play'}"></i>
                      </button>
                    </div>
                    <div class="book-info">
                      <h3 class="book-title-label">${book.title}</h3>
                      <span class="book-author-label">${book.author}</span>
                      <span class="book-narrator-label">Narrator: ${book.narrator}</span>
                    </div>
                    <div class="book-card-footer" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                      <span class="book-runtime">
                        <i data-lucide="clock"></i>
                        ${book.runtime}
                      </span>
                      ${isCurrentlyPlaying ? `
                        <span class="waveform-badge" data-book-id="${book.id}" style="margin-left: auto;">
                          <span class="waveform-bar"></span>
                          <span class="waveform-bar"></span>
                          <span class="waveform-bar"></span>
                        </span>
                      ` : ''}
                    </div>
                    ${
                      isStarted && percent < 100
                        ? `<div class="card-mini-progress">
                            <div class="card-mini-progress-fill" style="width: ${percent}%"></div>
                           </div>`
                        : ""
                    }
                  </div>
                `;
              }).join("")}
             </div>`
      }
    </section>
  `;

  // Inject into main container
  container.innerHTML = html;

  // Render Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Setup Event Listeners
  setupLibraryEvents(container, books, searchQuery);
}

function setupLibraryEvents(container, books, searchQuery = "") {

  // Container Event Delegation: Handles clicks on continue-card, book-card, continue-meta, book-cover-wrapper, etc.
  container.addEventListener("click", (e) => {
    // 0. Edit Metadata Button Click
    const editBtn = e.target.closest(".book-card-edit-btn");
    if (editBtn) {
      e.stopPropagation();
      const id = editBtn.getAttribute("data-id");
      const targetBook = books.find((b) => String(b.id) === String(id));
      if (targetBook) {
        openEditModal(targetBook, () => renderLibrary(searchQuery));
      }
      return;
    }

    // 1. Read EPUB Button Click
    const readBtn = e.target.closest(".book-card-read-btn");
    if (readBtn) {
      e.stopPropagation();
      const id = readBtn.getAttribute("data-id");
      const book = books.find((b) => String(b.id) === String(id));
      if (book) {
        openEpubReader(book, 0, true);
      }
      return;
    }

    // 2. Play Button Click
    const playBtn = e.target.closest(".continue-play-btn, .book-card-play-btn");
    if (playBtn) {
      e.stopPropagation();
      const id = playBtn.getAttribute("data-id");
      const book = books.find((b) => String(b.id) === String(id));
      if (book) {
        player.loadBook(book, 0, book.progressSeconds || 0, true);
      }
      return;
    }

    // 3. Card Click (Cover, Meta, Title, Info, Wrapper, etc. -> Navigate to Details Page)
    const card = e.target.closest(".continue-card, .book-card");
    if (card) {
      const id = card.getAttribute("data-id");
      if (id) {
        router.navigate(`#book/${id}`);
      }
    }
  });

  // Search Input Handler (In-DOM Filtering to preserve focus & avoid flickering)
  const searchInput = document.getElementById("lib-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      
      // Filter main grid cards
      const cards = container.querySelectorAll(".book-card");
      let visibleGridCards = 0;
      cards.forEach(card => {
        const title = card.querySelector(".book-title-label")?.textContent.toLowerCase() || "";
        const author = card.querySelector(".book-author-label")?.textContent.toLowerCase() || "";
        const narrator = card.querySelector(".book-narrator-label")?.textContent.toLowerCase() || "";
        
        if (title.includes(q) || author.includes(q) || narrator.includes(q)) {
          card.style.setProperty("display", "flex", "important");
          visibleGridCards++;
        } else {
          card.style.setProperty("display", "none", "important");
        }
      });
      
      // Filter continue listening cards
      const continueCards = container.querySelectorAll(".continue-card");
      let visibleContinueCards = 0;
      continueCards.forEach(card => {
        const title = card.querySelector(".continue-title")?.textContent.toLowerCase() || "";
        const author = card.querySelector(".continue-author")?.textContent.toLowerCase() || "";
        const narrator = card.querySelector(".continue-narrator")?.textContent.toLowerCase() || "";
        
        if (title.includes(q) || author.includes(q) || narrator.includes(q)) {
          card.style.setProperty("display", "flex", "important");
          visibleContinueCards++;
        } else {
          card.style.setProperty("display", "none", "important");
        }
      });
      
      // Toggle shelves display
      const shelves = container.querySelectorAll(".shelf-section");
      shelves.forEach((shelf, idx) => {
        const isContinueShelf = shelf.querySelector(".continue-card") !== null || shelf.querySelector(".horizontal-shelf") !== null;
        if (isContinueShelf) {
          // Hide continue shelf when searching
          shelf.style.display = (q === "" && visibleContinueCards > 0) ? "block" : "none";
        } else {
          // Main Audiobook Grid Shelf
          shelf.style.display = "block";
          
          let noResultsMsg = container.querySelector(".search-no-results");
          if (!noResultsMsg) {
            noResultsMsg = document.createElement("div");
            noResultsMsg.className = "search-no-results";
            noResultsMsg.style.cssText = "text-align: center; color: var(--text-muted); padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg); margin-top: 16px;";
            noResultsMsg.textContent = "No audiobooks found matching your search.";
            shelf.appendChild(noResultsMsg);
          }
          noResultsMsg.style.display = visibleGridCards === 0 ? "block" : "none";
          
          const grid = shelf.querySelector(".books-grid");
          if (grid) {
            grid.style.display = visibleGridCards === 0 ? "none" : "grid";
          }
        }
      });
    });
  }

  syncCardWaveforms();
};

export const syncCardWaveforms = () => {
  const currentId = player.currentBook ? String(player.currentBook.id) : null;
  const isPlaying = Boolean(player.isPlaying && !player.audio.paused);

  document.querySelectorAll(".book-card").forEach(card => {
    const cardId = String(card.dataset.id);
    const isThisPlaying = (currentId === cardId && isPlaying);

    card.classList.toggle("is-playing", isThisPlaying);

    const footer = card.querySelector(".book-card-footer");
    if (footer) {
      let spec = footer.querySelector(".player-bar-spectrum");
      if (isThisPlaying) {
        if (!spec) {
          spec = document.createElement("div");
          spec.className = "player-bar-spectrum is-playing";
          spec.innerHTML = "<span></span><span></span><span></span><span></span>";
          footer.appendChild(spec);
        }
      } else {
        if (spec) spec.remove();
      }
    }
  });
};

window.addEventListener("audiobook-play-state-change", syncCardWaveforms);
window.addEventListener("audiobook-track-change", syncCardWaveforms);

