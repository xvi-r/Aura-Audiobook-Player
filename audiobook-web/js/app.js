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
import { renderAuthView, renderWhosListeningView, updateAuthSidebarUI, getAuthenticatedUser, checkAuthSession, syncShellUI } from "./auth.js";
import { renderSetupView } from "./setup.js";
import { getApiBase, fetchWithTimeout } from "./config.js";

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

const initApp = async () => {
  // Apply saved visual theme and accent highlight on startup
  applyThemeAndAccent();
  window.addEventListener("aura-settings-changed", applyThemeAndAccent);

  // Setup global hotkeys
  setupKeyboardShortcuts();

  // Initial Lucide icon render for static shell and mobile navigation bar
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 1. Initialize Player Controllers
  player.init();

  const syncBottomPlayerBar = (hideForNowPlaying = false) => {
    const playerBar = document.getElementById("audio-player-bar");
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.getElementById("main-content");
    if (!playerBar) return;
    let isSessionActive = false;
    try { isSessionActive = sessionStorage.getItem("aura_playbar_active") === "true"; } catch (e) {}

    const shouldHide = hideForNowPlaying || !player.currentBook || player.isPlayerHiddenByLogout || !isSessionActive;

    document.body.classList.toggle("has-mini-player", !shouldHide);
    document.body.classList.toggle("on-now-playing", hideForNowPlaying);

    if (shouldHide) {
      playerBar.style.display = "none";
      if (sidebar) sidebar.style.paddingBottom = "20px";
      if (mainContent && window.innerWidth > 768) mainContent.style.paddingBottom = "32px";
    } else {
      playerBar.style.display = "grid";
      if (sidebar) sidebar.style.paddingBottom = "110px";
      if (mainContent && window.innerWidth > 768) mainContent.style.paddingBottom = "110px";
    }
  };

  // Automatically show the player bar when playback begins/switches tracks
  window.addEventListener("audiobook-track-change", () => {
    const isNowPlaying = window.location.pathname === "/now-playing" || window.location.hash === "#now-playing";
    syncBottomPlayerBar(isNowPlaying);
  });
  window.addEventListener("audiobook-play-state-change", () => {
    const isNowPlaying = window.location.pathname === "/now-playing" || window.location.hash === "#now-playing";
    syncBottomPlayerBar(isNowPlaying);
  });

  // Handle Unauthorized (401) global session expirations
  window.addEventListener("aura-unauthorized", () => {
    if (player && typeof player.unloadBook === "function") {
      player.unloadBook();
    }
    syncShellUI("/login");
    router.navigate("/login");
  });

  // Route Authentication & Access Guard
  router.setGuard((targetPath) => {
    const publicRoutes = ["/login", "/register", "/setup"];
    const isPublic = publicRoutes.some(p => targetPath === p || targetPath.startsWith(p + "/"));
    const user = getAuthenticatedUser();

    if (!user) {
      if (!isPublic) {
        console.log(`[Aura Guard] Unauthenticated access to ${targetPath}. Redirecting to /login...`);
        return "/login";
      }
    } else {
      if (targetPath === "/login" || targetPath === "/register") {
        return "/library";
      }
    }
    return null;
  });

  // 2. Setup Routes
  router.addRoute("/library", async () => {
    cleanupPreviousView();
    await renderLibrary();
    updateActiveSidebar("/library");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/recently-played", async () => {
    cleanupPreviousView();
    await renderLibrary("", true);
    updateActiveSidebar("/recently-played");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/favorites", async () => {
    cleanupPreviousView();
    await renderFavorites();
    updateActiveSidebar("/favorites");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/collections", async (activeCollectionName = null) => {
    cleanupPreviousView();
    await renderCollections(activeCollectionName);
    updateActiveSidebar("/collections");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/equalizer", () => {
    cleanupPreviousView();
    renderEqualizer();
    updateActiveSidebar("/equalizer");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/settings", () => {
    cleanupPreviousView();
    renderSettings();
    updateActiveSidebar("/settings");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/upload", () => {
    cleanupPreviousView();
    renderUpload();
    updateActiveSidebar("/upload");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/book", async (bookId) => {
    cleanupPreviousView();
    try {
      console.log("[Aura Router] Navigating to /book with bookId:", bookId);
      await renderDetails(bookId);
    } catch (err) {
      console.error("[Aura Router] Error rendering book details:", bookId, err);
      const container = document.getElementById("main-content");
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px; color: #ef4444;">
            <h2>Error Loading Book Details</h2>
            <p style="margin-top: 8px; color: var(--text-muted); font-size: 0.85rem;">${err.message || err}</p>
            <button class="back-btn" onclick="router.navigate('/library')" style="margin-top: 16px;">Return to Library</button>
          </div>
        `;
      }
    }
    updateActiveSidebar(""); // Deselect primary sidebar links
    syncBottomPlayerBar(false);
  });

  router.addRoute("/ebook", async (ebookId) => {
    cleanupPreviousView();
    try {
      console.log("[Aura Router] Navigating to /ebook with ebookId:", ebookId);
      await renderEbookDetails(ebookId);
    } catch (err) {
      console.error("[Aura Router] Error rendering ebook details:", ebookId, err);
      const container = document.getElementById("main-content");
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px; color: #ef4444;">
            <h2>Error Loading E-Book Details</h2>
            <p style="margin-top: 8px; color: var(--text-muted); font-size: 0.85rem;">${err.message || err}</p>
            <button class="back-btn" onclick="router.navigate('/library')" style="margin-top: 16px;">Return to Library</button>
          </div>
        `;
      }
    }
    updateActiveSidebar("");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/now-playing", () => {
    cleanupPreviousView();
    renderNowPlaying();
    updateActiveSidebar("/now-playing");
    syncBottomPlayerBar(true); // Hide bottom player when viewing Now Playing
  });

  router.addRoute("/login", () => {
    cleanupPreviousView();
    renderAuthView("login");
    updateActiveSidebar("/login");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/register", () => {
    cleanupPreviousView();
    renderAuthView("register");
    updateActiveSidebar("/register");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/whos-listening", () => {
    cleanupPreviousView();
    renderWhosListeningView();
    updateActiveSidebar("");
    syncBottomPlayerBar(false);
  });

  router.addRoute("/setup", () => {
    cleanupPreviousView();
    renderSetupView();
    updateActiveSidebar("");
    syncBottomPlayerBar(false);
  });

  // 3. Verify server session & setup status
  try {
    await checkAuthSession();
  } catch (e) {}

  syncShellUI(window.location.pathname);
  updateAuthSidebarUI();

  try {
    const API_BASE = getApiBase();
    const res = await fetchWithTimeout(`${API_BASE}/setup/status`, {}, 2500);
    if (res.ok) {
      const data = await res.json();
      if (data.setupCompleted === false && window.location.pathname !== "/setup") {
        console.log("[Aura App] Server setup required. Redirecting to /setup...");
        router.navigate("/setup");
      }
    }
  } catch (e) {}

  // 4. Initialize Router
  router.init();

  // 5. Hook up sidebar navigation click triggers
  setupSidebarNavigation();

  // 6. Smooth Curtain Reveal (dismiss splash screen overlay once initial render completes)
  dismissSplashScreen();

  // 7. Register Service Worker for PWA (iOS standalone / Android)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => {
          console.log("[Aura PWA] Service Worker registered:", reg.scope);
          reg.update();
        })
        .catch((err) => console.warn("[Aura PWA] Service Worker registration failed:", err));
    });
  }
};

function dismissSplashScreen() {
  const splash = document.getElementById("app-splash-screen");
  if (splash) {
    setTimeout(() => {
      splash.classList.add("splash-hidden");
      setTimeout(() => {
        try { splash.remove(); } catch (e) {}
      }, 500);
    }, 150);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function cleanupPreviousView() {
  const container = document.getElementById("main-content");
  syncShellUI(window.location.pathname);
  if (container) {
    container.style.overflowY = "";
    if (getAuthenticatedUser()) {
      container.style.padding = "";
      container.style.maxWidth = "";
      container.style.margin = "";
    }
  }
  if (container && container.cleanupDetailsListeners) {
    container.cleanupDetailsListeners();
    delete container.cleanupDetailsListeners;
  }
}

function updateActiveSidebar(path) {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    const link = item.querySelector("a");
    if (link && link.getAttribute("href") === path) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  const mobileItems = document.querySelectorAll(".mobile-nav-item");
  mobileItems.forEach((item) => {
    const href = item.getAttribute("href");
    if (href === path || (path && path.startsWith(href) && href !== "/" && href !== "/library")) {
      item.classList.add("active");
    } else if (href === "/library" && (path === "/library" || path === "/" || path.startsWith("/book/"))) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

function setupSidebarNavigation() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href");
      if (href && href.startsWith("/") && !href.startsWith("/api/")) {
        e.preventDefault();
        router.navigate(href);
      }
    }
  });
}
