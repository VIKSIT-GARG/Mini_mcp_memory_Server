# MCP Server Documentation

This document explains the working of the files in the `./server` folder, which implement a simple MCP (Model Context Protocol) server for memory management. The server allows storing, retrieving, searching, and managing memories (notes with titles, content, and tags) using SQLite for persistence and full-text search.

## Overview
- **Purpose**: Provides a backend service for memory storage, accessible via MCP (for AI integrations) or HTTP (for web clients).
- **Key Features**: CRUD operations on memories, tag-based filtering, full-text search with FTS5, dual transport modes (STDIO and HTTP).
- **Dependencies**: 
  - `@modelcontextprotocol/sdk`: For MCP server and transport.
  - `express`: For HTTP server.
  - `better-sqlite3`: For SQLite database.
  - `cors`: For cross-origin HTTP requests.
  - Node.js built-ins: `crypto`, `fs`, `path`, `process`.
- **How it Affects**: Runs a server process; data is stored in `../data/mini-memory.sqlite`; supports concurrent access via WAL mode.

## File Breakdown

### index.ts
- **Purpose**: Entry point that sets up the MCP server in either STDIO or HTTP mode.
- **Important Parts**:
  - Checks `process.argv` for `--stdio` flag to decide mode.
  - STDIO mode: Uses `McpServer` and `StdioServerTransport` for CLI-based communication; handles SIGINT for exit.
  - HTTP mode: Sets up Express app with CORS and JSON parsing; listens on port 5172 (or env PORT); root endpoint returns status.
- **Why Used**: Allows flexible deployment; STDIO for tools like AI assistants, HTTP for web apps.
- **Dependencies Impact**: Imports MCP SDK for protocol handling, Express for web server.

### memory-store.ts
- **Purpose**: Business logic for memory operations (CRUD and search).
- **Important Parts**:
  - Types: `Memory` (in-memory), `MemoryRow` (DB format), `ParsedFtsQuery` (search parsing).
  - Functions: `createMemory`, `getMemory`, `updateMemory`, `deleteMemory`, `listMemories`, `searchMemories`.
  - Search: Uses FTS5 for full-text, with custom parsing for phrases and negatives.
  - Helpers: `rowToMemory`/`memoryToRow` for JSON tag serialization; `now()` for timestamps.
- **Why Used**: Abstracts data operations; ensures data integrity and search capabilities.
- **How it Affects**: Calls `getDb()` for database access; operations trigger FTS updates via DB triggers.

### db.ts
- **Purpose**: Manages SQLite database connection and schema.
- **Important Parts**:
  - Singleton `getDb()`: Lazy-loads DB, sets pragmas (WAL, foreign keys), calls `initSchema`.
  - `initSchema`: Creates `memories` table (with tags as JSON), `memories_fts` virtual table for search, and triggers for sync.
  - Paths: Data dir `../data`, DB file `mini-memory.sqlite`.
- **Why Used**: Ensures persistent storage; FTS5 enables efficient search.
- **Dependencies Impact**: Uses `better-sqlite3` for DB; `mkdirSync` ensures data folder exists.




## Important Code Parts
- **FTS Search**: In `memory-store.ts`, `searchMemories` uses FTS5 for ranking, then applies negatives; handles empty queries.
- **Triggers**: In `db.ts`, AFTER triggers keep FTS table synced automatically.
- **Mode Selection**: In `index.ts`, conditional setup based on `--stdio` flag.
- **Tag Filtering**: In `listMemories`, client-side filter for tags (since DB doesn't index arrays).

## Running the Server
- STDIO: `node index.ts --stdio`
- HTTP: `node index.ts` (listens on port 5172)

For beginners: This is a Node.js app using TypeScript; install deps with `npm install`, build if needed. Data persists in SQLite file.