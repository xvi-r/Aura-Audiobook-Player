// Collections Page Module - Custom user playlists & Auto Franchise/Genre Collections
import { player } from "./player.js";
import { router } from "./router.js";
import { AUDIOBOOKS } from "./data.js";
import { getApiBase } from "./config.js";

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

export const renderCollections = async (activeCollectionName = null) => {
  const container = document.getElementById("main-content");
  if (!container) return;

  container.className = "fade-in";

  const collections = JSON.parse(localStorage.getItem("aura_collections") || "{}");
  
  const API_BASE = getApiBase();
  
  // Fetch all books to derive Auto Genre collections
  let allBooks = [];
  try {
    const response = await fetch(`${API_BASE}/api/audiobooks`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        allBooks = data;
      } else {
        allBooks = JSON.parse(JSON.stringify(AUDIOBOOKS));
      }
    } else {
      allBooks = JSON.parse(JSON.stringify(AUDIOBOOKS));
    }
  } catch (err) {
    allBooks = JSON.parse(JSON.stringify(AUDIOBOOKS));
  }

  // Derive Auto Genre / Series / Franchise Map from books using series tags, franchises dictionary & explicit genres
  const autoGenreMap = {};

  allBooks.forEach(b => {
    b.id = b.id ?? b.bookId ?? b._id ?? b.audiobookId;

    // Merge local metadata overrides (like series tag from Audnex API or manual edits)
    const savedMeta = localStorage.getItem(`aura_meta_${b.id}`);
    if (savedMeta) {
      try {
        const overrides = JSON.parse(savedMeta);
        if (overrides.series) b.series = overrides.series;
        if (overrides.title) b.title = overrides.title;
        if (overrides.genres && Array.isArray(overrides.genres)) b.genres = overrides.genres;
      } catch (e) {}
    }

    const title = (b.title || "").toLowerCase();
    const gList = [];

    // 0. Primary Series Tag matching (e.g. Star Wars: Legends)
    if (b.series && typeof b.series === "string" && b.series.trim().length > 0) {
      const seriesName = b.series.trim();
      if (!gList.includes(seriesName)) gList.push(seriesName);
    }

    // 1. Franchise keyword matching from title
    for (const [key, genreName] of Object.entries(FRANCHISES)) {
      if (title.includes(key)) {
        if (!gList.includes(genreName)) gList.push(genreName);
      }
    }

    // 2. Explicit genres array/string attached to entity
    let explicit = b.genres || b.genre || [];
    if (typeof explicit === "string") explicit = explicit.split(/[,;/|]+/).map(s => s.trim());
    if (Array.isArray(explicit)) {
      explicit.forEach(g => {
        if (g && typeof g === "string") {
          const trimmed = g.trim();
          const lower = trimmed.toLowerCase();
          if (lower !== "audiobook" && lower !== "audiobooks") {
            if (!gList.includes(trimmed)) gList.push(trimmed);
          }
        }
      });
    }

    // Populate autoGenreMap with book IDs
    gList.forEach(g => {
      if (!autoGenreMap[g]) autoGenreMap[g] = [];
      if (!autoGenreMap[g].includes(b.id)) autoGenreMap[g].push(b.id);
    });
  });

  if (activeCollectionName) {
    // Render individual collection view (either custom or genre)
    await renderSingleCollection(activeCollectionName, collections, autoGenreMap, allBooks, container);
  } else {
    // Render collections directory list
    renderCollectionsList(collections, autoGenreMap, container);
  }
};

const renderCollectionsList = (collections, autoGenreMap, container) => {
  const customNames = Object.keys(collections);
  const genreNames = Object.keys(autoGenreMap).sort();

  // Custom Collections Grid
  let customGridHtml = "";
  if (customNames.length === 0) {
    customGridHtml = `
      <div style="text-align: center; color: var(--text-muted); padding: 32px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg); grid-column: 1 / -1;">
        <i data-lucide="folder" style="width: 32px; height: 32px; margin-bottom: 8px; color: var(--text-muted);"></i>
        <h3 style="font-size: 0.95rem; font-weight: 600;">No custom folders yet</h3>
        <p style="font-size: 0.8rem; margin-top: 4px;">Create your first custom folder below.</p>
      </div>
    `;
  } else {
    customGridHtml = customNames.map(name => {
      const bookCount = collections[name].length;
      return `
        <div class="collection-card" data-name="${name}">
          <div class="collection-card-left">
            <i data-lucide="folder-heart" class="folder-icon"></i>
            <div class="collection-meta">
              <span class="collection-name">${name}</span>
              <span class="collection-count">${bookCount} Audiobook${bookCount === 1 ? "" : "s"}</span>
            </div>
          </div>
          <button class="delete-collection-btn" data-name="${name}" title="Delete Collection">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;
    }).join("");
  }

  // Genre / Franchise Collections Grid
  let genreGridHtml = "";
  if (genreNames.length === 0) {
    genreGridHtml = `
      <div style="text-align: center; color: var(--text-muted); padding: 32px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg); grid-column: 1 / -1;">
        <i data-lucide="tags" style="width: 32px; height: 32px; margin-bottom: 8px; color: var(--text-muted);"></i>
        <h3 style="font-size: 0.95rem; font-weight: 600;">No auto genres detected</h3>
      </div>
    `;
  } else {
    genreGridHtml = genreNames.map(genre => {
      const bookCount = autoGenreMap[genre].length;
      return `
        <div class="collection-card genre-collection-card" data-name="${genre}" style="border-left: 3px solid var(--accent-primary);">
          <div class="collection-card-left">
            <i data-lucide="tags" class="folder-icon" style="color: var(--accent-primary);"></i>
            <div class="collection-meta">
              <span class="collection-name">${genre}</span>
              <span class="collection-count">${bookCount} Audiobook${bookCount === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  container.innerHTML = `
    <div class="collections-container">
      <div class="library-header" style="margin-bottom: 28px;">
        <div class="welcome-section">
          <h1>Library Collections & Franchises</h1>
          <p>Explore custom playlists or browse audiobooks auto-categorized by franchise and genre.</p>
        </div>
      </div>

      <!-- Auto Genre Collections Section -->
      <section class="shelf-section" style="margin-bottom: 36px;">
        <h2 class="shelf-title" style="font-size: 1.15rem; margin-bottom: 16px;">
          <i data-lucide="tags" style="color: var(--accent-primary);"></i>
          Auto Genre & Franchise Collections
        </h2>
        <div class="collections-directory-grid">
          ${genreGridHtml}
        </div>
      </section>

      <!-- Custom Collections Section -->
      <section class="shelf-section">
        <h2 class="shelf-title" style="font-size: 1.15rem; margin-bottom: 16px;">
          <i data-lucide="folder-heart" style="color: var(--accent-primary);"></i>
          Custom Playlist Folders
        </h2>
        <div class="collections-directory-grid">
          ${customGridHtml}
        </div>
        
        <div class="create-collection-bar" style="margin-top: 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 18px 20px; max-width: 440px;">
          <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 10px;">Create New Custom Folder</h3>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="directory-new-name" placeholder="Folder name..." style="flex-grow: 1; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; color: var(--text-main); font-size: 0.85rem;" />
            <button class="btn-primary-play" id="directory-btn-create" style="padding: 8px 16px; font-size: 0.85rem; border-radius: var(--radius-sm);">Create</button>
          </div>
        </div>
      </section>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Delegated click handler on container so clicking ANY part of a collection card opens it cleanly
  container.addEventListener("click", (e) => {
    if (e.target.closest(".delete-collection-btn") || e.target.closest("#directory-btn-create") || e.target.closest("#directory-new-name")) return;
    const card = e.target.closest(".collection-card, .genre-collection-card");
    if (card) {
      const name = card.getAttribute("data-name");
      if (name) {
        router.navigate("#collections/" + encodeURIComponent(name));
      }
    }
  });

  // Setup delete button triggers
  container.querySelectorAll(".delete-collection-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (confirm(`Are you sure you want to delete the custom collection "${name}"?`)) {
        delete collections[name];
        localStorage.setItem("aura_collections", JSON.stringify(collections));
        renderCollections(); // Re-render directory list
      }
    });
  });

  // Setup create input triggers
  const createBtn = document.getElementById("directory-btn-create");
  const newNameInput = document.getElementById("directory-new-name");

  if (createBtn && newNameInput) {
    createBtn.addEventListener("click", () => {
      const name = newNameInput.value.trim();
      if (name) {
        if (!collections[name]) {
          collections[name] = [];
          localStorage.setItem("aura_collections", JSON.stringify(collections));
        }
        renderCollections(); // Refresh
      }
    });
  }
};

const renderSingleCollection = async (collectionName, collections, autoGenreMap, allBooks, container) => {
  const API_BASE = getApiBase();

  // Helper to format duration
  const formatDuration = (totalSecs) => {
    if (isNaN(totalSecs) || totalSecs <= 0) return "0m";
    const h = Math.floor(totalSecs / 3600);
    const m = Math.round((totalSecs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  allBooks.forEach(b => {
    b.progressSeconds = b.position ?? b.progressSeconds ?? 0;
    let customCover = null;
    if (b.id) {
      try {
        const savedMeta = localStorage.getItem(`aura_meta_${b.id}`);
        if (savedMeta) {
          const overrides = JSON.parse(savedMeta);
          if (overrides.cover) customCover = overrides.cover;
        }
      } catch (e) {}
    }
    b.cover = customCover || (typeof b.id === "number" ? `${API_BASE}/api/audiobooks/${b.id}/cover` : (b.cover || "assets/covers/default.png"));
    b.narrator = b.narrator || "Unknown Narrator";
    b.runtime = formatDuration(b.duration);
  });

  // Determine books in this collection
  let books = [];
  const isCustom = collections[collectionName] !== undefined;

  if (isCustom) {
    const bookIds = collections[collectionName] || [];
    books = allBooks.filter(b => bookIds.map(String).includes(String(b.id)));
  } else if (autoGenreMap && autoGenreMap[collectionName]) {
    const bookIds = autoGenreMap[collectionName] || [];
    books = allBooks.filter(b => bookIds.map(String).includes(String(b.id)));
  } else {
    // Loose fallback match
    const targetLower = (collectionName || "").toLowerCase();
    books = allBooks.filter(b => {
      const fullText = `${b.title || ""} ${b.series || ""} ${b.author || ""} ${b.description || ""}`.toLowerCase();
      let gList = b.genres || b.genre || [];
      if (typeof gList === "string") gList = gList.split(/[,;/|]+/).map(s => s.trim());
      const hasGenre = Array.isArray(gList) && gList.some(g => g && g.toString().toLowerCase() === targetLower);
      return fullText.includes(targetLower) || hasGenre;
    });
  }

  let booksHtml = "";
  if (books.length === 0) {
    booksHtml = `
      <div style="text-align: center; color: var(--text-muted); padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg); grid-column: 1 / -1;">
        <i data-lucide="folder-open" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--text-muted);"></i>
        <h3>This collection is empty</h3>
        <p>Go to your library catalog and add some books to this folder.</p>
      </div>
    `;
  } else {
    booksHtml = books.map(book => {
      const isStarted = book.progressSeconds > 0;
      const percent = Math.round((book.progressSeconds / book.runtimeSeconds) * 100);
      const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(book.id);
      const isCurrentlyPlaying = isLoadedInPlayer && player.isPlaying;

      return `
        <div class="book-card ${isCurrentlyPlaying ? 'is-playing' : ''}" data-id="${book.id}">
          <div class="book-cover-wrapper">
            <img src="${book.cover}" alt="${book.title}" />
            <button class="book-card-play-btn" data-id="${book.id}">
              <i data-lucide="${isCurrentlyPlaying ? 'pause' : 'play'}"></i>
            </button>
          </div>
          <div class="book-info">
            <h3 class="book-title-label">${book.title}</h3>
            <span class="book-author-label">${book.author}</span>
            <span class="book-narrator-label">Narrator: ${book.narrator}</span>
          </div>
          <div class="book-card-footer" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: inline-flex; align-items: center; gap: 6px;">
              <span class="book-runtime">
                <i data-lucide="clock"></i>
                ${book.runtime}
              </span>
              ${isLoadedInPlayer ? `
                <span class="waveform-badge ${isCurrentlyPlaying ? '' : 'paused'}" title="${isCurrentlyPlaying ? 'Playing' : 'Paused'}">
                  <span class="waveform-bar"></span>
                  <span class="waveform-bar"></span>
                  <span class="waveform-bar"></span>
                </span>
              ` : ''}
            </div>
            ${
              isCustom
                ? `<button class="remove-book-btn" data-id="${book.id}" title="Remove from Collection" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; transition: var(--transition-quick); padding: 2px;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                   </button>`
                : ""
            }
          </div>
          ${
            isStarted && percent < 100
              ? `<div class="card-mini-progress" style="margin-top: 8px;">
                  <div class="card-mini-progress-fill" style="width: ${percent}%"></div>
                 </div>`
              : ""
          }
        </div>
      `;
    }).join("");
  }

  const gridDensity = localStorage.getItem("aura_grid_density") || "8";
  container.innerHTML = `
    <div class="collections-container">
      <div class="back-btn-container" style="margin-bottom: 20px;">
        <button class="back-btn" id="btn-back-collect">
          <i data-lucide="arrow-left"></i>
          Back to Collections
        </button>
      </div>

      <div class="library-header" style="margin-bottom: 24px;">
        <div class="welcome-section">
          <h1>${collectionName}</h1>
          <p>${isCustom ? "Viewing audiobooks in custom playlist folder." : "Auto-generated collection of audiobooks tagged under this genre/franchise."}</p>
        </div>
      </div>

      <div class="books-grid grid-cols-${gridDensity}">
        ${booksHtml}
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Back Button click
  document.getElementById("btn-back-collect").addEventListener("click", () => {
    router.navigate("#collections");
  });

  // Navigate to book details on card click
  container.querySelectorAll(".book-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".book-card-play-btn") || e.target.closest(".remove-book-btn")) return;
      const id = card.dataset.id;
      location.hash = `#book/${id}`;
    });
  });

  // Play button click
  container.querySelectorAll(".book-card-play-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const book = books.find(b => b.id.toString() === id.toString());
      if (book) {
        player.loadBook(book, 0, book.progressSeconds || 0, true);
      }
    });
  });

  // Remove book from collection click (if custom)
  container.querySelectorAll(".remove-book-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const bookId = parseInt(btn.dataset.id);
      const list = collections[collectionName] || [];
      const updatedList = list.filter(id => id !== bookId);
      collections[collectionName] = updatedList;
      localStorage.setItem("aura_collections", JSON.stringify(collections));
      
      // Refresh single collection view
      renderSingleCollection(collectionName, collections, autoGenreMap, allBooks, container);
    });
  });
};
