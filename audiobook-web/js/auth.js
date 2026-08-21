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
}

export async function logoutUser() {
  const API_BASE = getApiBase();
  try {
    await fetchWithTimeout(`${API_BASE}/api/users/logout`, { method: "POST" }, 2500);
  } catch (e) {}
  if (player && typeof player.unloadBook === "function") {
    player.unloadBook();
  }
  setAuthenticatedUser(null);
  router.navigate("#login");
}

export function updateAuthSidebarUI() {
  const accountList = document.getElementById("sidebar-account-list");
  if (!accountList) return;

  const currentUser = getAuthenticatedUser();

  if (currentUser) {
    const initial = currentUser.charAt(0).toUpperCase();
    accountList.innerHTML = `
      <div class="sidebar-user-card">
        <div class="sidebar-user-info">
          <div class="sidebar-user-avatar">${initial}</div>
          <span class="sidebar-user-name">${currentUser}</span>
        </div>
        <button class="sidebar-logout-btn" id="sidebar-logout-action" title="Sign Out">
          <i data-lucide="log-out" style="width: 16px; height: 16px;"></i>
        </button>
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

  container.className = "fade-in";
  container.style.overflowY = "auto";
  container.style.paddingBottom = "80px";

  const isLogin = activeTab === "login";

  container.innerHTML = `
    <header class="library-header" style="margin-bottom: 24px;">
      <div class="library-header-left">
        <h1 class="library-title">${isLogin ? "Sign In" : "Register"}</h1>
        <p class="library-subtitle">${isLogin ? "Sign in to sync your audiobook collection & playback progress." : "Create an account on your personal audiobook server."}</p>
      </div>
    </header>

    <div class="auth-view-wrapper">
      <div class="auth-card">
        <div class="auth-card-header">
          <div class="auth-badge-icon">
            <i data-lucide="${isLogin ? 'key-round' : 'user-plus'}"></i>
          </div>
          <h2 class="auth-card-title">${isLogin ? "Welcome Back" : "Create Account"}</h2>
          <p class="auth-card-subtitle">${isLogin ? "Enter your credentials to access your audiobooks." : "Fill out your username and password to get started."}</p>
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
    tabLogin.addEventListener("click", () => renderAuthView("login"));
  }
  if (tabRegister) {
    tabRegister.addEventListener("click", () => renderAuthView("register"));
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
            setTimeout(() => router.navigate("#library"), 600);
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
            setTimeout(() => router.navigate("#library"), 600);
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
