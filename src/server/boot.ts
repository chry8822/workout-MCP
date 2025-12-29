import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
  const server = new McpServer({
    name: 'fitness-nutrition-mcp',
    version: '1.0.0',
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      completions: {},
    },
  });

  // await autoRegisterModules(server); // ← 주석 처리하고 아래로 교체

  // 직접 등록
  console.error('Registering modules...');
  await echoModule.register(server);
  await workoutPlanModule.register(server);
  await supplementModule.register(server);
  await naverShoppingModule.register(server);
  await kakaoLocalModule.register(server);
  await conciergeModule.register(server);
  console.error(
    'Registration complete: tools registered (echo, generate_workout_plan, supplement_recommendations, naver_shop_search, naver_shop_price_compare, kakao_geocode, kakao_place_search, kakao_find_nearby_gyms, find_supplement_deals_and_nearby_gyms)'
  );
  console.error(`Transport mode: ${transportMode}`);

  if (transportMode === 'stdio') {
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
        'x-mcp-session',
        'x-mcp-session-id',
        // 일부 클라이언트가 대소문자/변형을 쓰는 경우를 대비
        'X-MCP-Session',
        'X-MCP-Session-Id',
      ],
      exposedHeaders: ['x-mcp-session-id'],
    })
  );

  // Create transport with session support
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await server.connect(transport);

  // Handle all MCP requests (GET for SSE, POST for JSON-RPC, DELETE for cleanup)
  app.all('/mcp', (req, res) => {
    // StreamableHTTPServerTransport는 client의 Accept 헤더가
    // "application/json" 과 "text/event-stream" 을 모두 포함하길 요구합니다.
    // 일부 웹 클라이언트(카카오Play 포함)가 application/json 만 보내는 경우가 있어 406이 발생할 수 있어,
    // GET/POST/DELETE 모두에서 Accept 헤더를 보정해 호환성을 높입니다.
    // (정보 불러오기/상태 체크가 GET으로 들어오는 클라이언트도 있어 POST만 보정하면 여전히 실패할 수 있음)
    const rawAccept = (req.headers.accept ?? '').toString();
    const acceptLower = rawAccept.toLowerCase();
    const hasJson = acceptLower.includes('application/json');
    const hasSse = acceptLower.includes('text/event-stream');

    if (!hasJson || !hasSse) {
      const parts: string[] = [];
      parts.push('application/json');
      parts.push('text/event-stream');
      if (rawAccept.trim().length > 0) parts.push(rawAccept);
      else parts.push('*/*');
      req.headers.accept = parts.join(', ');
    }
    void transport.handleRequest(req, res, req.body);
  });

  const port = Number(process.env.PORT ?? 3000);
  const httpServer = app.listen(port, () => {
    console.log(`Fitness Nutrition MCP Server (HTTP) listening on http://localhost:${String(port)}/mcp`);
    console.log(`SSE endpoint: GET http://localhost:${String(port)}/mcp`);
    console.log(`JSON-RPC endpoint: POST http://localhost:${String(port)}/mcp`);
    console.log(`CORS origin: ${corsOrigin}`);
  });

  process.on('SIGINT', () => {
    console.log('Shutting down HTTP server...');
    void transport.close();
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
