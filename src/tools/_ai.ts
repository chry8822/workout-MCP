import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type AiAssistResult =
  | { ok: true; text: string; model?: string }
  | { ok: false; reason: 'sampling_not_supported' | 'non_text_response' | 'error'; message: string };

export function clientSupportsSampling(server: McpServer): boolean {
  const caps = server.server.getClientCapabilities?.();
  // ClientCapabilities.sampling is optional. If present, sampling is supported.
  return Boolean((caps as any)?.sampling);
}

export async function sampleText(opts: {
  server: McpServer;
  systemPrompt: string;
  userText: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AiAssistResult> {
  const { server, systemPrompt, userText, maxTokens = 900, temperature = 0 } = opts;

  if (!clientSupportsSampling(server)) {
    return {
      ok: false,
      reason: 'sampling_not_supported',
      message: '클라이언트가 LLM 샘플링(sampling/createMessage)을 지원하지 않습니다. (aiAssist=false로 사용하거나, sampling 지원 클라이언트를 사용하세요.)',
    };
  }

  try {
    const resp = await server.server.createMessage({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: userText },
        },
      ],
      temperature,
      maxTokens,
      includeContext: 'none',
    });

    if (resp.content.type !== 'text') {
      return { ok: false, reason: 'non_text_response', message: 'LLM 응답이 텍스트가 아닙니다.' };
    }

    return { ok: true, text: resp.content.text, model: resp.model };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: 'error',
      message: `LLM 샘플링 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function tryParseJson<T>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      return { ok: true, value: JSON.parse(slice) as T };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}


