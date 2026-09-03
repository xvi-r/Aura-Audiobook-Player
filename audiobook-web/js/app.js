// Main Application Orchestrator
import { router } from "./router.js";
import { player } from "./player.js";
import { renderLibrary } from "./library.js";
import { renderDetails, renderEbookDetails } from "./details.js";
import { renderNowPlaying } from "./now_playing.js";
import { renderCollections } from "./collections.js";
import { renderFavorites } from "./favorites.js";
import { renderEqualizer } from "./equalizer.js";
import { renderSettings } from "./settings.js";
import { renderUpload } from "./upload.js";
import { renderAuthView, updateAuthSidebarUI } from "./auth.js";

const applyThemeAndAccent = () => {
  const baseTheme = localStorage.getItem("aura_base_theme") || "base-midnight";
  const accentColor = localStorage.getItem("aura_accent_color") || "accent-orange";
  
  // CSS rules in variables.css target body.base-... and body.accent-...
  document.body.className = `${baseTheme} ${accentColor}`;
  document.documentElement.className = `${baseTheme} ${accentColor}`;
};

const setupKeyboardShortcuts = () => {
  document.addEventListener("keydown", (e) => {
    // Ignore hotkeys when typing in input fields
    if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      return;
    }

    switch (e.code) {
      case "Space":
        e.preventDefault();
        player.togglePlay();
        break;
      case "ArrowLeft":
      case "KeyJ":
        e.preventDefault();
        player.skip(-15);
        break;
      case "ArrowRight":
      case "KeyL":
        e.preventDefault();
        player.skip(30);
        break;
      case "ArrowUp":
        e.preventDefault();
        player.setVolume(Math.min(1, player.volume + 0.1));
        break;
      case "ArrowDown":
        e.preventDefault();
        player.setVolume(Math.max(0, player.volume - 0.1));
        break;
      case "KeyM":
        e.preventDefault();
        player.toggleMute();
        break;
      case "KeyN":
        e.preventDefault();
        player.nextChapter();
        break;
      case "KeyP":
        e.preventDefault();
        player.prevChapter();
        break;
    }
  });
};

const initApp = () => {
  // Apply saved visual theme and accent highlight on startup
  applyThemeAndAccent();
  window.addEventListener("aura-settings-changed", applyThemeAndAccent);

  // Setup global hotkeys
  setupKeyboardShortcuts();

  // 1. Initialize Player Controllers
  player.init();

  const syncBottomPlayerBar = (hideForNowPlaying = false) => {
    const playerBar = document.getElementById("audio-player-bar");
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.getElementById("main-content");
    if (!playerBar) return;
    if (hideForNowPlaying || !player.currentBook || player.isPlayerHiddenByLogout) {
      playerBar.style.display = "none";
      if (sidebar) sidebar.style.paddingBottom = "20px";
      if (mainContent) mainContent.style.paddingBottom = "32px";
    } else {
      playerBar.style.display = "grid";
      if (sidebar) sidebar.style.paddingBottom = "110px";
      if (mainContent) mainContent.style.paddingBottom = "110px";
    }
  };

  // Automatically show the player bar when playback begins/switches tracks
  window.addEventListener("audiobook-track-change", () => {
    const isNowPlaying = window.location.hash === "#now-playing";
    syncBottomPlayerBar(isNowPlaying);
  });
  window.addEventListener("audiobook-play-state-change", () => {
    const isNowPlaying = window.location.hash === "#now-playing";
    syncBottomPlayerBar(isNowPlaying);
  });

  // 2. Setup Routes
  router.addRoute("#library", async () => {
    cleanupPreviousView();
    await renderLibrary();
    updateActiveSidebar("#library");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#recently-played", async () => {
    cleanupPreviousView();
    await renderLibrary("", true);
    updateActiveSidebar("#recently-played");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#favorites", async () => {
    cleanupPreviousView();
    await renderFavorites();
    updateActiveSidebar("#favorites");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#collections", async (activeCollectionName = null) => {
    cleanupPreviousView();
    await renderCollections(activeCollectionName);
    updateActiveSidebar("#collections");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#equalizer", () => {
    cleanupPreviousView();
    renderEqualizer();
    updateActiveSidebar("#equalizer");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#settings", () => {
    cleanupPreviousView();
    renderSettings();
    updateActiveSidebar("#settings");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#upload", () => {
    cleanupPreviousView();
    renderUpload();
    updateActiveSidebar("#upload");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#book", async (bookId) => {
    cleanupPreviousView();
    try {
      console.log("[Aura Router] Navigating to #book with bookId:", bookId);
      await renderDetails(bookId);
    } catch (err) {
      console.error("[Aura Router] Error rendering book details:", bookId, err);
      const container = document.getElementById("main-content");
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px; color: #ef4444;">
            <h2>Error Loading Book Details</h2>
            <p style="margin-top: 8px; color: var(--text-muted); font-size: 0.85rem;">${err.message || err}</p>
            <button class="back-btn" onclick="location.hash='#library'" style="margin-top: 16px;">Return to Library</button>
          </div>
        `;
      }
    }
    updateActiveSidebar(""); // Deselect primary sidebar links
    syncBottomPlayerBar(false);
  });

  router.addRoute("#ebook", async (ebookId) => {
    cleanupPreviousView();
    try {
      console.log("[Aura Router] Navigating to #ebook with ebookId:", ebookId);
      await renderEbookDetails(ebookId);
    } catch (err) {
      console.error("[Aura Router] Error rendering ebook details:", ebookId, err);
      const container = document.getElementById("main-content");
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px; color: #ef4444;">
            <h2>Error Loading E-Book Details</h2>
            <p style="margin-top: 8px; color: var(--text-muted); font-size: 0.85rem;">${err.message || err}</p>
            <button class="back-btn" onclick="location.hash='#library'" style="margin-top: 16px;">Return to Library</button>
          </div>
        `;
      }
    }
    updateActiveSidebar("");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#now-playing", () => {
    cleanupPreviousView();
    renderNowPlaying();
    updateActiveSidebar("#now-playing");
    syncBottomPlayerBar(true); // Hide bottom player when viewing Now Playing
  });

  router.addRoute("#login", () => {
    cleanupPreviousView();
    renderAuthView("login");
    updateActiveSidebar("#login");
    syncBottomPlayerBar(false);
  });

  router.addRoute("#register", () => {
    cleanupPreviousView();
    renderAuthView("register");
    updateActiveSidebar("#register");
    syncBottomPlayerBar(false);
  });

  // Update Auth State in Sidebar
  updateAuthSidebarUI();

  // 3. Initialize Router
  router.init();

  // 4. Hook up sidebar navigation click triggers
  setupSidebarNavigation();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function cleanupPreviousView() {
  const container = document.getElementById("main-content");
  if (container) {
    container.style.overflowY = "";
    container.style.paddingBottom = "";
  }
  // If the previous view had custom window listeners registered, clean them up to prevent leaks
  if (container && container.cleanupDetailsListeners) {
    container.cleanupDetailsListeners();
    delete container.cleanupDetailsListeners;
  }
}

function updateActiveSidebar(hash) {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    const link = item.querySelector("a");
    if (link && link.getAttribute("href") === hash) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

function setupSidebarNavigation() {
  const navLinks = document.querySelectorAll(".nav-item a");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        router.navigate(href);
      }
    });
  });
}
