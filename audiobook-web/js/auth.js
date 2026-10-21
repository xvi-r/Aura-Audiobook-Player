// Authentication & User Session Manager (JSESSIONID HttpOnly Cookies)
import { getApiBase, fetchWithTimeout } from "./config.js";
import { router } from "./router.js";
import { player } from "./player.js";

export function getAuthenticatedUser() {
  return localStorage.getItem("aura_username") || null;
}

export function setAuthenticatedUser(username) {
  if (username) {
    localStorage.setItem("aura_username", username);
  } else {
    localStorage.removeItem("aura_username");
  }
  updateAuthSidebarUI();
  window.dispatchEvent(new CustomEvent("aura-auth-changed", { detail: { username } }));
}

export async function checkAuthSession() {
  const API_BASE = getApiBase();
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/users/me`, {}, 1500);
    if (response.ok) {
      const data = await response.json();
      if (data && data.username) {
        setAuthenticatedUser(data.username);
        return data.username;
      }
    }
  } catch (err) {
    console.debug("[Aura Auth] Active session check bypassed/failed:", err);
  }
  setAuthenticatedUser(null);
  return null;
}

export function syncShellUI(activePath = window.location.pathname) {
  const isAuthenticated = !!getAuthenticatedUser();
  const cleanPath = activePath.startsWith("#") ? "/" + activePath.slice(1) : activePath;
  const isAuthPage = cleanPath === "/login" || cleanPath === "/register" || cleanPath === "/setup";
  const shouldHideAllNavigation = !isAuthenticated || isAuthPage;

  document.body.classList.toggle("auth-mode", shouldHideAllNavigation);

  const sidebar = document.getElementById("sidebar");
  const mobileNav = document.getElementById("mobile-nav-bar");
  const playerBar = document.getElementById("audio-player-bar");

  if (shouldHideAllNavigation) {
    if (sidebar) sidebar.style.display = "none";
    if (mobileNav) mobileNav.style.display = "none";
    if (playerBar) playerBar.style.display = "none";
  } else {
    if (sidebar) sidebar.style.display = "";
    if (mobileNav) mobileNav.style.display = "";
  }
}

export function clearUserSessionData() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith("aura_progress_") ||
      key.startsWith("aura_has_epub_") ||
      key === "aura_last_played_state" ||
      key === "aura_favorites" ||
      key === "aura_collections" ||
      key === "aura_daily_stats" ||
      key === "aura_library_tab"
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

export async function logoutUser() {
  const API_BASE = getApiBase();
  try {
    await fetchWithTimeout(`${API_BASE}/api/users/logout`, { method: "POST" }, 2500);
  } catch (e) {}
  if (player && typeof player.unloadBook === "function") {
    player.unloadBook();
  }
  clearUserSessionData();
  setAuthenticatedUser(null);
  syncShellUI("/login");
  router.navigate("/login");
}

export function updateAuthSidebarUI() {
  const accountList = document.getElementById("sidebar-account-list");
  if (!accountList) return;

  const currentUser = getAuthenticatedUser();

  if (currentUser) {
    const initial = currentUser.charAt(0).toUpperCase();
    accountList.innerHTML = `
      <li class="nav-item">
        <a href="#whos-listening" id="sidebar-whos-listening-link">
          <i data-lucide="users"></i>
          <span>Switch Profile</span>
        </a>
      </li>
      <div class="sidebar-user-card" style="margin-top: 8px;">
        <div class="sidebar-user-info">
          <div class="sidebar-user-avatar">${initial}</div>
          <span class="sidebar-user-name">${currentUser}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <a href="#whos-listening" class="sidebar-logout-btn" title="Switch Profile / Who's Listening">
            <i data-lucide="users" style="width: 15px; height: 15px;"></i>
          </a>
          <button class="sidebar-logout-btn" id="sidebar-logout-action" title="Sign Out">
            <i data-lucide="log-out" style="width: 15px; height: 15px;"></i>
          </button>
        </div>
      </div>
    `;
    const logoutBtn = document.getElementById("sidebar-logout-action");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logoutUser();
      });
    }
  } else {
    accountList.innerHTML = `
      <li class="nav-item">
        <a href="#login" id="sidebar-login-link">
          <i data-lucide="log-in"></i>
          <span>Sign In / Register</span>
        </a>
      </li>
    `;
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export function renderAuthView(activeTab = "login") {
  const container = document.getElementById("main-content");
  if (!container) return;

  syncShellUI(activeTab === "login" ? "/login" : "/register");

  container.className = "fade-in";
  container.style.overflowY = "auto";

  const isLogin = activeTab === "login";

  container.innerHTML = `
    <div class="auth-view-wrapper">
      <div class="auth-brand-header">
        <div class="auth-brand-logo">
          <div class="logo-icon">
            <i data-lucide="headphones"></i>
          </div>
          <span class="logo-text">AURA</span>
        </div>
        <p class="auth-brand-tagline">Personal Audiobook & E-Book Streaming</p>
      </div>

      <div class="auth-card">
        <div class="auth-card-header">
          <div class="auth-badge-icon">
            <i data-lucide="${isLogin ? 'key-round' : 'user-plus'}"></i>
          </div>
          <h2 class="auth-card-title">${isLogin ? "Welcome Back" : "Create Account"}</h2>
          <p class="auth-card-subtitle">${isLogin ? "Sign in to access your audiobook collection & playback progress." : "Fill out your username and password to get started."}</p>
        </div>

        <div class="auth-nav-tabs">
          <button class="auth-tab-btn ${isLogin ? 'active' : ''}" id="tab-auth-login">
            <i data-lucide="log-in"></i>
            <span>Sign In</span>
          </button>
          <button class="auth-tab-btn ${!isLogin ? 'active' : ''}" id="tab-auth-register">
            <i data-lucide="user-plus"></i>
            <span>Register</span>
          </button>
        </div>

        <div id="auth-alert-container"></div>

        <form class="auth-form" id="auth-form" autocomplete="on">
          <div class="auth-field-group">
            <label class="auth-label" for="auth-username-input">
              <i data-lucide="user" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
              Username
            </label>
            <div class="auth-input-wrapper">
              <i data-lucide="user" class="auth-input-icon"></i>
              <input 
                type="text" 
                id="auth-username-input" 
                class="auth-input" 
                placeholder="Enter your username" 
                required 
                autocomplete="username"
              />
            </div>
          </div>

          <div class="auth-field-group">
            <label class="auth-label" for="auth-password-input">
              <i data-lucide="lock" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
              Password
            </label>
            <div class="auth-input-wrapper">
              <i data-lucide="lock" class="auth-input-icon"></i>
              <input 
                type="password" 
                id="auth-password-input" 
                class="auth-input" 
                placeholder="${isLogin ? 'Enter your password' : 'Create a password'}" 
                required 
                autocomplete="${isLogin ? 'current-password' : 'new-password'}"
              />
              <button type="button" class="auth-toggle-pwd" id="auth-toggle-pwd" title="Toggle password visibility">
                <i data-lucide="eye" id="pwd-eye-icon"></i>
              </button>
            </div>
          </div>

          ${!isLogin ? `
            <div class="auth-field-group">
              <label class="auth-label" for="auth-confirm-password-input">
                <i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                Confirm Password
              </label>
              <div class="auth-input-wrapper">
                <i data-lucide="shield-check" class="auth-input-icon"></i>
                <input 
                  type="password" 
                  id="auth-confirm-password-input" 
                  class="auth-input" 
                  placeholder="Confirm your password" 
                  required 
                  autocomplete="new-password"
                />
              </div>
            </div>
          ` : ''}

          <button type="submit" class="auth-submit-btn" id="auth-submit-btn">
            <i data-lucide="${isLogin ? 'log-in' : 'user-plus'}"></i>
            <span>${isLogin ? 'Sign In' : 'Create Account'}</span>
          </button>
        </form>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Setup Event Handlers
  const tabLogin = document.getElementById("tab-auth-login");
  const tabRegister = document.getElementById("tab-auth-register");
  const form = document.getElementById("auth-form");
  const togglePwdBtn = document.getElementById("auth-toggle-pwd");
  const pwdInput = document.getElementById("auth-password-input");
  const alertContainer = document.getElementById("auth-alert-container");

  if (tabLogin) {
    tabLogin.addEventListener("click", () => router.navigate("/login"));
  }
  if (tabRegister) {
    tabRegister.addEventListener("click", () => router.navigate("/register"));
  }

  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener("click", () => {
      const type = pwdInput.getAttribute("type") === "password" ? "text" : "password";
      pwdInput.setAttribute("type", type);
      if (!isLogin) {
        const confirmInput = document.getElementById("auth-confirm-password-input");
        if (confirmInput) confirmInput.setAttribute("type", type);
      }
      const eyeIcon = document.getElementById("pwd-eye-icon");
      if (eyeIcon) {
        eyeIcon.setAttribute("data-lucide", type === "password" ? "eye" : "eye-off");
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById("auth-username-input");
      const submitBtn = document.getElementById("auth-submit-btn");

      const username = usernameInput ? usernameInput.value.trim() : "";
      const password = pwdInput ? pwdInput.value.trim() : "";

      if (!username || !password) {
        showAuthAlert(alertContainer, "Please enter both username and password.", "error");
        return;
      }

      if (!isLogin) {
        const confirmInput = document.getElementById("auth-confirm-password-input");
        const confirmPassword = confirmInput ? confirmInput.value.trim() : "";
        if (password !== confirmPassword) {
          showAuthAlert(alertContainer, "Passwords do not match.", "error");
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="spinner-icon"></i><span>Processing...</span>`;
      if (window.lucide) window.lucide.createIcons();

      const API_BASE = getApiBase();
      const payload = { username, password };

      try {
        if (isLogin) {
          console.log("[Aura Auth] Sending POST request to /api/users/login:", payload);
          const response = await fetchWithTimeout(`${API_BASE}/api/users/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }, 6000);

          if (response.ok) {
            setAuthenticatedUser(username);
            showAuthAlert(alertContainer, "Signed in successfully!", "success");
            setTimeout(() => {
              syncShellUI("/library");
              router.navigate("/library");
            }, 350);
          } else {
            let msg = "Invalid username or password.";
            try {
              const errData = await response.json();
              if (errData && (errData.message || errData.error)) msg = errData.message || errData.error;
            } catch (e) {}
            showAuthAlert(alertContainer, msg, "error");
          }
        } else {
          console.log("[Aura Auth] Sending POST request to /api/users/register:", payload);
          const response = await fetchWithTimeout(`${API_BASE}/api/users/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }, 6000);

          if (response.ok) {
            setAuthenticatedUser(username);
            showAuthAlert(alertContainer, "Account created successfully!", "success");
            setTimeout(() => {
              syncShellUI("/library");
              router.navigate("/library");
            }, 350);
          } else {
            let msg = "Registration failed. Username may already exist.";
            try {
              const errData = await response.json();
              if (errData && (errData.message || errData.error)) msg = errData.message || errData.error;
            } catch (e) {}
            showAuthAlert(alertContainer, msg, "error");
          }
        }
      } catch (err) {
        console.error("Auth HTTP Error:", err);
        showAuthAlert(alertContainer, "Could not connect to server. Check server connection.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="${isLogin ? 'log-in' : 'user-plus'}"></i><span>${isLogin ? 'Sign In' : 'Create Account'}</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }
}

function showAuthAlert(container, message, type = "error") {
  if (!container) return;
  const isError = type === "error";
  container.innerHTML = `
    <div class="auth-alert ${isError ? 'auth-alert-error' : 'auth-alert-success'}">
      <i data-lucide="${isError ? 'alert-circle' : 'check-circle'}" style="width: 16px; height: 16px;"></i>
      <span>${message}</span>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

export function renderWhosListeningView() {
  const container = document.getElementById("main-content");
  if (!container) return;

  container.className = "fade-in";
  container.style.overflowY = "auto";
  container.style.paddingBottom = "80px";

  const defaultProfiles = [
    { name: "Luis", color: "var(--accent-primary, #f27d11)" },
    { name: "Alex", color: "#3b82f6" },
    { name: "Jordan", color: "#10b981" },
    { name: "Sam", color: "#8b5cf6" }
  ];

  const profilesHtml = defaultProfiles.map(p => `
    <div class="profile-card" data-username="${p.name}">
      <div class="profile-avatar" style="background: ${p.color};">
        ${p.name.charAt(0).toUpperCase()}
      </div>
      <span class="profile-name">${p.name}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="whos-listening-wrapper">
      <div class="auth-card whos-listening-card">
        <div class="auth-card-header">
          <div class="auth-badge-icon">
            <i data-lucide="users"></i>
          </div>
          <h2 class="auth-card-title">Who's Listening?</h2>
          <p class="auth-card-subtitle">Select a profile to continue your audiobook journey.</p>
        </div>

        <div class="profile-grid">
          ${profilesHtml}
          <div class="profile-card profile-card-add" id="whos-listening-add-btn">
            <div class="profile-avatar profile-avatar-add">
              <i data-lucide="plus" style="width: 24px; height: 24px;"></i>
            </div>
            <span class="profile-name" style="color: var(--text-muted);">Add Profile</span>
          </div>
        </div>

        <div class="profile-actions">
          <a href="#login" class="profile-manage-btn">Log in with another account</a>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const profileCards = container.querySelectorAll(".profile-card[data-username]");
  profileCards.forEach(card => {
    card.addEventListener("click", () => {
      const username = card.getAttribute("data-username");
      if (username) {
        if (player && typeof player.unloadBook === "function") {
          player.unloadBook();
        }
        clearUserSessionData();
        setAuthenticatedUser(username);
        router.navigate("/library");
      }
    });
  });

  const addBtn = document.getElementById("whos-listening-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      router.navigate("/register");
    });
  }
}
