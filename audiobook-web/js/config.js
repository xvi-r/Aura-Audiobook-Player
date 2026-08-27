export function getApiBase() {
  let customUrl = localStorage.getItem("aura_server_url");
  if (customUrl && customUrl.trim() !== "") {
    customUrl = customUrl.trim().replace(/\/+$/, "");
    if (!customUrl.startsWith("http://") && !customUrl.startsWith("https://")) {
      customUrl = `http://${customUrl}`;
    }
    return customUrl;
  }
  const host = window.location.hostname || "127.0.0.1";
  if (host === "tauri.localhost" || host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:8080";
  }
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
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
