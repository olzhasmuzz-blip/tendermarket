const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function authorizedFetch(path: string, init?: RequestInit) {
  const send = (accessToken: string | null) => fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
  });
  let response = await send(window.localStorage.getItem("tm_access_token"));
  if (response.status === 401 && !path.startsWith("/auth/") && window.localStorage.getItem("tm_refresh_token")) {
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: window.localStorage.getItem("tm_refresh_token") }) });
    if (refreshed.ok) {
      const session = await refreshed.json() as { accessToken: string; refreshToken: string };
      window.localStorage.setItem("tm_access_token", session.accessToken);
      window.localStorage.setItem("tm_refresh_token", session.refreshToken);
      response = await send(session.accessToken);
    } else {
      window.localStorage.removeItem("tm_access_token");
      window.localStorage.removeItem("tm_refresh_token");
    }
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Ошибка запроса: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function apiUpload<T>(file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<T>("/uploads", { method: "POST", body: form });
}

export async function apiDownload(id: string, fileName: string) {
  const response = await authorizedFetch(`/uploads/${encodeURIComponent(id)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? "Не удалось скачать файл.");
  }
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function saveLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null || value === undefined) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  } catch {
    return fallback;
  }
}
