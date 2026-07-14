export const FETCH_DELAY_MS = 200;

export async function fetchWithRetry(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Connection: "close",
          ...init.headers
        }
      });
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(FETCH_DELAY_MS * attempt * 3);
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
