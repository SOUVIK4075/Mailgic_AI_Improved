import type { ErrorBody, ErrorDetail } from '../types';

/** Every non-2xx response from the server becomes one of these. */
export class ApiError extends Error {
  status: number;
  code: string;
  details: ErrorDetail[];

  constructor(status: number, code: string, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown; // a plain object is sent as JSON, a FormData is sent as multipart
  headers?: Record<string, string>;
  signal?: AbortSignal; // lets the caller cancel the request (AbortController)
};

// AuthContext registers a callback here so the API layer can say "the session is gone"
// without importing React code.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    // Do not set Content-Type: the browser adds it with the multipart boundary.
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  return fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
    credentials: 'include', // send the httpOnly auth cookies
  });
}

/** Turn an error response into an ApiError, even if the body is not JSON. */
async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as ErrorBody;
    const { code, message, details } = data.error;
    return new ApiError(res.status, code, message, details ?? []);
  } catch {
    return new ApiError(res.status, 'UNKNOWN_ERROR', `Request failed (${res.status})`);
  }
}

// Shared promise so that if several requests get TOKEN_EXPIRED at the same moment,
// only ONE /auth/refresh call is made and all of them wait for it.
let refreshPromise: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null; // allow a new refresh the next time the token expires
      });
  }
  return refreshPromise;
}

/**
 * Sends a request and returns the response if it is 2xx, otherwise throws an ApiError.
 * On 401 TOKEN_EXPIRED it refreshes the session once and sends the request again.
 */
async function sendWithRefresh(path: string, options: RequestOptions): Promise<Response> {
  let res = await send(path, options);
  if (res.ok) return res;

  const error = await toApiError(res);
  if (error.status !== 401 || error.code !== 'TOKEN_EXPIRED') throw error;

  // Access token expired: refresh once, then retry the original request once.
  const refreshed = await refreshSession();
  if (!refreshed) {
    onSessionExpired?.();
    throw error;
  }
  res = await send(path, options);
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await sendWithRefresh(path, options);
  if (res.status === 204) return undefined as T; // No Content (e.g. DELETE)
  return (await res.json()) as T;
}

// ---- Server-Sent Events ----

export type SseMessage = { event: string; data: unknown };

/**
 * Parses one SSE message, i.e. the lines between two blank lines:
 *   event: draft
 *   data: {"subject":"Hi","body":"..."}
 * Returns null for keep-alive comments (lines starting with ":") or messages without data.
 */
export function parseSseMessage(block: string): SseMessage | null {
  let event = 'message'; // SSE's default name when there is no "event:" line
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null; // not JSON — our server never sends this, so just skip it
  }
}

type StreamOptions = {
  signal?: AbortSignal;
  idempotencyKey: string;
  onEvent: (event: string, data: unknown) => void;
};

/**
 * POSTs JSON to an SSE endpoint and calls onEvent for every event until the stream ends.
 * Errors found before streaming starts are normal JSON errors, so they are thrown as ApiError
 * (with the same TOKEN_EXPIRED refresh-and-retry rule as api()).
 * We use fetch + a stream reader instead of EventSource because EventSource can only do GET.
 */
export async function apiStream(path: string, body: unknown, { signal, idempotencyKey, onEvent }: StreamOptions): Promise<void> {
  const res = await sendWithRefresh(path, { method: 'POST', body, signal, headers: { 'Idempotency-Key': idempotencyKey } });

  if (!res.headers.get('Content-Type')?.includes('text/event-stream') || !res.body) {
    throw new ApiError(res.status, 'UNEXPECTED_RESPONSE', 'The server sent something unexpected. Please try again.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read(); // rejects with AbortError if the signal is aborted
    if (done) break;
    // Drop "\r" so "\r\n" line endings work too (JSON never contains a raw "\r").
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

    // A chunk can end in the middle of a message, so keep the unfinished last part for next time.
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const message = parseSseMessage(block);
      if (message) onEvent(message.event, message.data);
    }
  }

  const last = parseSseMessage(buffer); // in case the stream ended without a final blank line
  if (last) onEvent(last.event, last.data);
}

/** True when a fetch failed because we called AbortController.abort() (e.g. the Stop button). */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** A human-friendly message for any error thrown by api(). */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'DAILY_QUOTA_EXCEEDED':
        return "You've used all of today's generations. Your quota resets tomorrow.";
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a few seconds and try again.';
      case 'AI_UPSTREAM_ERROR':
      case 'AI_INVALID_RESPONSE':
        return 'The AI service had a problem. Please try again.';
      case 'REQUEST_IN_PROGRESS':
        return 'That draft is still being written. Give it a few seconds.';
    }
    if (err.details.length > 0) {
      return err.details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join(' · ');
    }
    return err.message;
  }
  if (err instanceof TypeError) return 'Network error. Is the server running?';
  return 'Something went wrong. Please try again.';
}
