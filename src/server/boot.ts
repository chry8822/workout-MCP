import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import { config } from 'dotenv';
import express from 'express';
import echoModule from '../tools/echo.js';
import workoutPlanModule from '../tools/workout-plan.js';

type TransportMode = 'stdio' | 'http';

// Load environment variables from .env file
config();

export async function boot(mode?: TransportMode): Promise<void> {
  const transportMode = mode ?? (process.env.STARTER_TRANSPORT as TransportMode | undefined) ?? 'stdio';
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
  console.error('Registration complete: 2 tools registered (echo, generate_workout_plan)');

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
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
      allowedHeaders: ['Content-Type', 'x-mcp-session', 'x-mcp-session-id'],
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
