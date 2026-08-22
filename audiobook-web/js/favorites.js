// Favorites Page Module - Filtered list of user favorited audiobooks
import { player } from "./player.js";
import { router } from "./router.js";
import { AUDIOBOOKS } from "./data.js";
import { getApiBase } from "./config.js";

export const renderFavorites = async () => {
  const API_BASE = getApiBase();
  const container = document.getElementById("main-content");
  if (!container) return;

  container.className = "fade-in";

  // Fetch books
  let allBooks = [];
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/audiobooks`);
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

  // Helper to format duration
  const formatDuration = (totalSecs) => {
    if (isNaN(totalSecs) || totalSecs <= 0) return "0m";
    const h = Math.floor(totalSecs / 3600);
    const m = Math.round((totalSecs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  allBooks.forEach(b => {
    const pos = (b.progressResponse && b.progressResponse.position !== undefined && b.progressResponse.position !== null)
      ? parseFloat(b.progressResponse.position)
      : (b.position !== undefined && b.position !== null ? parseFloat(b.position) : (b.progressSeconds || 0));
    b.position = pos;
    b.progressSeconds = pos;
    b.cover = b.cover || b.coverPath || (typeof b.id === "number" ? `${API_BASE}/api/audiobooks/${b.id}/cover` : "assets/covers/default.png");
    b.narrator = b.narrator || "Unknown Narrator";
    b.runtime = formatDuration(b.duration);
  });

  const favorites = JSON.parse(localStorage.getItem("aura_favorites") || "[]");
  const books = allBooks.filter(b => favorites.includes(b.id));

  let gridHtml = "";
  if (books.length === 0) {
    gridHtml = `
      <div style="text-align: center; color: var(--text-muted); padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg); grid-column: 1 / -1;">
        <i data-lucide="heart" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--text-muted);"></i>
        <h3>No favorites yet</h3>
        <p>Click the heart icon on any audiobook's details page to add it here.</p>
      </div>
    `;
  } else {
    gridHtml = books.map(book => {
      const isStarted = book.progressSeconds > 0;
      const percent = Math.round((book.progressSeconds / book.runtimeSeconds) * 100);

      return `
        <div class="book-card" data-id="${book.id}">
          <div class="book-cover-wrapper">
            <img src="${book.cover}" alt="${book.title}" />
            <button class="book-card-play-btn" data-id="${book.id}">
              <i data-lucide="play"></i>
            </button>
          </div>
          <div class="book-info">
            <h3 class="book-title-label">${book.title}</h3>
            <span class="book-author-label">${book.author}</span>
            <span class="book-narrator-label">Narrator: ${book.narrator}</span>
          </div>
          <div class="book-card-footer" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
            <span class="book-runtime">
              <i data-lucide="clock"></i>
              ${book.runtime}
            </span>
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
    <div class="favorites-container">
      <div class="library-header" style="margin-bottom: 24px;">
        <div class="welcome-section">
          <h1>Your Favorites</h1>
          <p>Explore your most loved books and stories.</p>
        </div>
      </div>

      <div class="books-grid grid-cols-${gridDensity}">
        ${gridHtml}
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Navigate to book details on card click
  container.querySelectorAll(".book-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".book-card-play-btn")) return;
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
};
