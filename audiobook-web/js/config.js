export function getApiBase() {
  let customUrl = localStorage.getItem("aura_server_url");
  if (customUrl && customUrl.trim() !== "") {
    customUrl = customUrl.trim().replace(/\/+$/, "");
    if (!customUrl.startsWith("http://") && !customUrl.startsWith("https://")) {
      customUrl = `http://${customUrl}`;
    }
    return customUrl;
  }
  if (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("file://")) {
    return window.location.origin;
  }
  const host = window.location.hostname || "localhost";
  return `http://${host}:8080`;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (response.status === 401 && !url.includes("/api/users/login") && !url.includes("/api/users/register") && !url.includes("/api/users/me")) {
      console.warn("[Aura Fetch] Unauthorized (HTTP 401). Triggering auth session reset...");
      localStorage.removeItem("aura_username");
      window.dispatchEvent(new CustomEvent("aura-unauthorized"));
    }

    if (response.status === 428 && !url.includes("/setup")) {
      console.log("[Aura Fetch] Server setup required (HTTP 428). Redirecting to /setup...");
      if (window.location.pathname !== "/setup") {
        window.location.pathname = "/setup";
      }
    }

    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
