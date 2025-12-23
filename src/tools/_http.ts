type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class HttpError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly bodyText?: string;

  constructor(message: string, opts: { status: number; url: string; bodyText?: string }) {
    super(message);
    this.name = 'HttpError';
    this.status = opts.status;
    this.url = opts.url;
    this.bodyText = opts.bodyText;
  }
}

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<JsonValue> {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const contentType = res.headers.get('content-type') ?? '';
    const bodyText = await res.text();

    if (!res.ok) {
      throw new HttpError(`HTTP ${String(res.status)} 요청 실패`, { status: res.status, url, bodyText });
    }

    if (!contentType.toLowerCase().includes('application/json')) {
      // Some APIs return JSON with non-standard content-type; still try to parse.
      try {
        return JSON.parse(bodyText) as JsonValue;
      } catch {
        throw new HttpError('JSON 응답이 아닙니다', { status: res.status, url, bodyText });
      }
    }

    return JSON.parse(bodyText) as JsonValue;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  return String(v);
}
