#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { FacebookClient } from "./facebook/client.js";
import { searchListingsSchema, createSearchHandler } from "./tools/search.js";
import { getListingSchema, createListingHandler } from "./tools/listing.js";
import {
  searchLocationSchema,
  createLocationHandler,
} from "./tools/location.js";
import {
  monitorSearchSchema,
  checkMonitorsSchema,
  deleteMonitorSchema,
  listMonitorsSchema,
  createMonitorSearchHandler,
  createCheckMonitorsHandler,
  createDeleteMonitorHandler,
  createListMonitorsHandler,
} from "./tools/monitor.js";

function createFacebookClient() {
  return new FacebookClient({
    maxRequestsPerMinute: Number(process.env.MAX_REQUESTS_PER_MINUTE ?? 3),
    chromeProfile: process.env.CHROME_PROFILE ?? "Default",
  });
}

function createServer(client = createFacebookClient()) {
  const server = new McpServer({
    name: "facebook-marketplace",
    version: "1.0.0",
  });

  server.tool(
    "search_listings",
    "Search Facebook Marketplace listings by query, location, and filters",
    searchListingsSchema,
    createSearchHandler(client)
  );

  server.tool(
    "get_listing",
    "Get full details for a specific Facebook Marketplace listing",
    getListingSchema,
    createListingHandler(client)
  );

  server.tool(
    "search_location",
    "Look up a city/town name to get coordinates for use with search_listings",
    searchLocationSchema,
    createLocationHandler(client)
  );

  server.tool(
    "monitor_search",
    "Save a search query as a monitor to track new listings over time",
    monitorSearchSchema,
    createMonitorSearchHandler()
  );

  server.tool(
    "check_monitors",
    "Check saved monitors for new listings since last check",
    checkMonitorsSchema,
    createCheckMonitorsHandler(client)
  );

  server.tool(
    "delete_monitor",
    "Delete a saved search monitor",
    deleteMonitorSchema,
    createDeleteMonitorHandler()
  );

  server.tool(
    "list_monitors",
    "List all saved search monitors",
    listMonitorsSchema,
    createListMonitorsHandler()
  );

  return server;
}

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

function authorizeRequest(authHeader?: string) {
  const token = process.env.MCP_HTTP_BEARER_TOKEN;
  if (!token) {
    return process.env.ALLOW_UNAUTHENTICATED_HTTP === "true";
  }
  return authHeader === `Bearer ${token}`;
}

async function startHttpServer() {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? 3000);
  const endpoint = process.env.MCP_HTTP_ENDPOINT ?? "/mcp";

  if (
    !process.env.MCP_HTTP_BEARER_TOKEN &&
    process.env.ALLOW_UNAUTHENTICATED_HTTP !== "true"
  ) {
    console.error(
      "MCP_HTTP_BEARER_TOKEN is required for HTTP mode. Set ALLOW_UNAUTHENTICATED_HTTP=true only for local testing."
    );
    process.exit(1);
  }

  const app = createMcpExpressApp({ host });

  app.use(cors());
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all(endpoint, async (req, res) => {
    if (!authorizeRequest(req.headers.authorization)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessionId = req.headers["mcp-session-id"];
    let transport =
      typeof sessionId === "string" ? transports.get(sessionId) : undefined;

    if (!transport) {
      const newTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, newTransport);
        },
      });

      newTransport.onclose = () => {
        if (newTransport.sessionId) {
          transports.delete(newTransport.sessionId);
        }
      };

      transport = newTransport;
      await createServer().connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, host, () => {
    console.error(
      `facebook-marketplace MCP listening on http://${host}:${port}${endpoint}`
    );
  });
}

if (process.env.MCP_TRANSPORT === "http") {
  await startHttpServer();
} else {
  await startStdioServer();
}
