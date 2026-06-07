# Facebook Marketplace MCP Server

An MCP server that provides access to Facebook Marketplace via direct GraphQL API calls. No browser automation at runtime — speaks Facebook's internal protocol directly.

## How It Works

Facebook's web client makes all Marketplace requests as `POST /api/graphql/` with a `doc_id` (query hash) and `variables`. This server replays those requests using your existing Facebook session cookies from Chrome.

**Think of it like [pypush](https://github.com/JJTech0130/pypush) for iMessage — direct protocol, no browser.**

## Prerequisites

- **Google Chrome** with an active Facebook login for local cookie extraction, or exported Facebook cookies for server deployments
- **Node.js** 20+

## Installation

```bash
git clone <this-repo>
cd facebook-marketplace-mcp
npm install
npm run build
```

## Setup with Claude Code

```bash
claude mcp add facebook-marketplace -- node /path/to/facebook-marketplace-mcp/dist/index.js
```

Or add to your Claude Code config manually:

```json
{
  "mcpServers": {
    "facebook-marketplace": {
      "command": "node",
      "args": ["/path/to/facebook-marketplace-mcp/dist/index.js"],
      "env": {
        "CHROME_PROFILE": "Default"
      }
    }
  }
}
```

## Tools

### `search_listings`
Search Marketplace by query, location, and filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search term |
| `latitude` | number | yes | Latitude of search center |
| `longitude` | number | yes | Longitude of search center |
| `radius_km` | number | no | Search radius (default: 50) |
| `min_price` | number | no | Min price in dollars |
| `max_price` | number | no | Max price in dollars |
| `category` | string | no | Category ID |
| `limit` | number | no | Max results (default: 20) |

### `get_listing`
Get full details for a specific listing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `listing_id` | string | yes | Marketplace listing ID |

### `monitor_search`
Save a search as a monitor to track new listings over time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Monitor name |
| `query` | string | yes | Search term |
| `latitude` | number | yes | Search center lat |
| `longitude` | number | yes | Search center lng |
| `radius_km` | number | no | Radius (default: 50) |
| `min_price` | number | no | Min price |
| `max_price` | number | no | Max price |

### `check_monitors`
Check monitors for new listings since last check.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `monitor_name` | string | no | Check specific monitor, or omit for all |

### `list_monitors`
List all saved monitors.

### `delete_monitor`
Delete a saved monitor.

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Use `stdio` for local MCP clients or `http` for remote/Dokploy deployments |
| `PORT` | `3000` | HTTP port when `MCP_TRANSPORT=http` |
| `HOST` | `0.0.0.0` | HTTP bind host when `MCP_TRANSPORT=http` |
| `MCP_HTTP_ENDPOINT` | `/mcp` | Streamable HTTP MCP endpoint |
| `MCP_HTTP_BEARER_TOKEN` | unset | Bearer token required by HTTP MCP requests |
| `ALLOW_UNAUTHENTICATED_HTTP` | unset | Set to `true` only for local HTTP testing without a bearer token |
| `FACEBOOK_COOKIE_HEADER` | unset | Raw Facebook `Cookie` header, preferred for Docker/Dokploy |
| `FACEBOOK_COOKIE_HEADER_FILE` | unset | File containing the raw Facebook `Cookie` header |
| `FACEBOOK_COOKIES` | unset | JSON array of cookies with `name` and `value` fields |
| `FACEBOOK_COOKIES_FILE` | unset | File containing the JSON cookie array |
| `CHROME_PROFILE` | `Default` | Chrome profile directory name |
| `MAX_REQUESTS_PER_MINUTE` | `3` | Client-side Facebook request limit |
| `FB_MARKETPLACE_STORAGE_DIR` | `~/.fb-marketplace` | Directory for saved monitor state |

Cookie env vars take precedence over local Chrome extraction. This is the deployment-friendly path because Chrome profile cookies are encrypted by the source machine's OS/keychain and generally do not survive being copied into a Linux container.

## Dokploy / Docker

This repo includes a `Dockerfile` and `compose.yaml` for Dokploy compose deployments. Set these Dokploy environment variables:

```bash
MCP_HTTP_BEARER_TOKEN=<long random token>
FACEBOOK_COOKIE_HEADER='c_user=...; xs=...; fr=...; datr=...'
MAX_REQUESTS_PER_MINUTE=3
```

Deploy the compose service and point MCP clients at:

```text
https://<your-dokploy-domain>/mcp
```

Clients should send:

```text
Authorization: Bearer <MCP_HTTP_BEARER_TOKEN>
```

The service also exposes `GET /healthz` for Dokploy health checks.

### Getting Cookies

The simplest way is to open Facebook Marketplace in a logged-in browser, copy the request's raw `Cookie` header for `www.facebook.com`, and set it as `FACEBOOK_COOKIE_HEADER`. The required cookie set changes over time, but `c_user` and `xs` must be present or the server will reject the session before calling Facebook.

## Updating GraphQL Queries

Facebook rotates their `doc_id` values on deploys. If searches stop working:

```bash
npm install -D playwright
npx playwright install chromium
npm run capture-queries
```

This opens a browser, navigates Marketplace, and captures current query IDs. Update `src/facebook/queries.ts` with the new values.

## Rate Limiting

The server self-rate-limits to 3 requests/minute with random jitter to avoid detection. This means searches take a few seconds.

## Limitations

- **macOS only** for automatic cookie extraction
- **Requires Chrome** with active Facebook session
- **Facebook ToS** — automating Facebook violates their Terms of Service
- **Fragile** — `doc_id` values change on Facebook deploys
- **Rate limited** — aggressive use may trigger CAPTCHAs or account flags
- **No write operations** — search/read only, no messaging or listing creation
