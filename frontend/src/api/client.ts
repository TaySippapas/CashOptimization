/** Explicit mock mode never attempts a backend request or silently replaces live failures. */
export const USE_MOCK_DATA = import.meta.env.VITE_DATA_MODE === "mock";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!USE_MOCK_DATA) return init === undefined ? fetch(path) : fetch(path, init);
  if (init?.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const { mockResponse } = await import("@/mocks/frontendApi");
  if (init?.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  return mockResponse(path, init);
}
