declare global {
  const __NH_API_BASE_URL__: string;

  interface Window {
    chrome?: {
      runtime?: {
        lastError?: { message?: string };
      };
      storage?: {
        local?: {
          get(
            keys: string | string[] | Record<string, unknown> | null,
            callback: (items: Record<string, unknown>) => void
          ): void;
          set(items: Record<string, unknown>, callback?: () => void): void;
        };
      };
    };
  }
}

export {};
