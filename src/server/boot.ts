import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import { config } from 'dotenv';
import express from 'express';
import echoModule from '../tools/echo.js';
import workoutPlanModule from '../tools/workout-plan.js';
import supplementModule from '../tools/supplement-recommendations.js';
import naverShoppingModule from '../tools/naver-shopping.js';
import kakaoLocalModule from '../tools/kakao-local.js';
import conciergeModule from '../tools/fitness-concierge.js';

type TransportMode = 'stdio' | 'http';

// Load environment variables from .env file
config();

export async function boot(mode?: TransportMode): Promise<void> {
  // Render/호스팅 환경은 "장기 실행 HTTP 서버"가 기본 기대값입니다.
  // STARTER_TRANSPORT가 명시되지 않았고 PORT/RENDER 환경이 보이면 http를 기본으로 선택합니다.
  const inferredDefault: TransportMode = process.env.STARTER_TRANSPORT
    ? (process.env.STARTER_TRANSPORT as TransportMode | undefined) ?? 'stdio'
    : process.env.RENDER || process.env.PORT
    ? 'http'
    : 'stdio';

  const transportMode = mode ?? inferredDefault;

  async function createAndRegisterServer(): Promise<McpServer> {
    const s = new McpServer({
      name: 'fitness-nutrition-mcp',
      version: '1.0.0',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        completions: {},
      },
    });

    console.error('Registering modules...');
    await echoModule.register(s);
    await workoutPlanModule.register(s);
    await supplementModule.register(s);
    await naverShoppingModule.register(s);
    await kakaoLocalModule.register(s);
    await conciergeModule.register(s);
    console.error(
      'Registration complete: tools registered (echo, generate_workout_plan, supplement_recommendations, naver_shop_search, naver_shop_price_compare, kakao_geocode, kakao_place_search, kakao_find_nearby_gyms, find_supplement_deals_and_nearby_gyms)'
    );
    return s;
  }

  console.error(`Transport mode: ${transportMode}`);

  if (transportMode === 'stdio') {
    const server = await createAndRegisterServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Fitness Nutrition MCP Server running on stdio');
    return;
  }

  // HTTP mode with SSE support
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  const allowCredentials = corsOrigin !== '*';
  app.use(
    cors({
      origin: corsOrigin,
      // 브라우저 CORS 규칙: credentials=true 인 경우 origin="*" 는 허용되지 않습니다.
      credentials: allowCredentials,
      methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'mcp-session-id',
        'Mcp-Session-Id',
        'x-mcp-session',
        'x-mcp-session-id',
        // 일부 클라이언트가 대소문자/변형을 쓰는 경우를 대비
        'X-MCP-Session',
        'X-MCP-Session-Id',
      ],
      exposedHeaders: ['mcp-session-id', 'x-mcp-session-id', 'x-mcp-session', 'Mcp-Session-Id', 'X-MCP-Session-Id'],
    })
  );

  type SessionEntry = { transport: StreamableHTTPServerTransport; server: McpServer };
  const sessions: Record<string, SessionEntry> = {};

  function getSessionIdFromHeaders(req: express.Request): string | undefined {
    // Node/Express는 기본적으로 헤더 키를 소문자로 정규화합니다.
    const h = req.headers;
    return (h['mcp-session-id'] as string | undefined) ?? (h['x-mcp-session-id'] as string | undefined) ?? (h['x-mcp-session'] as string | undefined);
  }

  // 일부 클라이언트(카카오Play 포함)가 Accept: application/json 만 보내는 경우가 있어 406이 발생할 수 있어,
  // /mcp 경로는 모든 메서드에서 Accept를 보정합니다.
  app.use('/mcp', (req, _res, next) => {
    const rawAccept = (req.headers.accept ?? '').toString();
    const acceptLower = rawAccept.toLowerCase();
    const hasJson = acceptLower.includes('application/json');
    const hasSse = acceptLower.includes('text/event-stream');

    if (!hasJson || !hasSse) {
      req.headers.accept = 'application/json, text/event-stream';
    }

    next();
  });

  // 상태 체크(일부 클라이언트가 HEAD로 online 판단)
  app.head('/mcp', (_req, res) => {
    res.status(200).end();
  });

  // POST: initialize + JSON-RPC 요청 처리
  app.post('/mcp', async (req, res) => {
    const sessionId = getSessionIdFromHeaders(req);
    let entry = sessionId ? sessions[sessionId] : undefined;

    if (!entry && !sessionId && isInitializeRequest(req.body)) {
      const server = await createAndRegisterServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions[sid] = { transport, server };
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) delete sessions[transport.sessionId];
      };

      await server.connect(transport);
      entry = { transport, server };
    }

    if (!entry) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    await entry.transport.handleRequest(req, res, req.body);
  });

  // GET/DELETE: 세션이 있어야 처리 가능 (SSE, 세션 종료 등)
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = getSessionIdFromHeaders(req);
    if (!sessionId || !sessions[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await sessions[sessionId].transport.handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  const port = Number(process.env.PORT ?? 3000);
  const httpServer = app.listen(port, () => {
    console.log(`Fitness Nutrition MCP Server (HTTP) listening on http://localhost:${String(port)}/mcp`);
    console.log(`SSE endpoint: GET http://localhost:${String(port)}/mcp`);
    console.log(`JSON-RPC endpoint: POST http://localhost:${String(port)}/mcp`);
    console.log(`CORS origin: ${corsOrigin}`);
  });

  process.on('SIGINT', () => {
    console.log('Shutting down HTTP server...');
    for (const sid of Object.keys(sessions)) {
      try {
        const entry = sessions[sid];
        if (entry) void entry.transport.close();
      } catch {
        // ignore
      }
    }
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
