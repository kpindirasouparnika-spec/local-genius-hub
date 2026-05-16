export type BridgeConfig = { url: string; token: string };

const STORAGE_KEY = "bridge-config";

export function loadBridge(): BridgeConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBridge(c: BridgeConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

export function clearBridge() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function callBridge(
  cfg: BridgeConfig,
  action: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const url = cfg.url.replace(/\/$/, "") + "/" + action;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "Invalid JSON from bridge" }));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data;
}
