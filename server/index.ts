import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import express from "express";
import process from "process";
import cors from "cors";

/**
 * Main entry point for the MCP (Model Context Protocol) server.
 * Purpose: Provides a memory storage service using MCP, allowing clients to store, retrieve, and search memories.
 * Why used: Enables integration with MCP-compatible clients, like AI assistants, for memory management.
 * Dependencies: @modelcontextprotocol/sdk (for MCP server and transport), express (for HTTP server), cors (for cross-origin requests), process (Node.js built-in for args and signals).
 * How it affects: Runs a server that listens for requests; in STDIO mode, communicates via stdin/stdout; in HTTP mode, exposes REST endpoints; affects how the application interacts with clients.
 */

// Check if the server should run in STDIO mode (e.g., for command-line interaction)
const isStdio = process.argv.includes("--stdio");
// Default port for HTTP server, can be overridden by environment variable
const PORT = parseInt(process.env.PORT ?? "5172", 10);

if(isStdio) {
    // Create MCP server instance for STDIO transport
    const server = new McpServer({name: "MCP Stdio Server", version: "1.0.0"});
    // Use STDIO transport for communication (reads from stdin, writes to stdout)
    const transport = new StdioServerTransport();
    // Connect the server to the transport and start listening
    await server.connect(transport);
    // Log to stderr to indicate the server is running (avoids interfering with MCP protocol)
    process.stderr.write("MCP Stdio Server is running...\n");

    // Handle SIGINT (Ctrl+C) to gracefully exit
    process.on("SIGINT", () => process.exit(0));
} else {
    // If not STDIO, set up an HTTP server using Express
    const app = express();
    // Enable CORS for cross-origin requests (useful for web clients)
    app.use(cors());
    // Parse incoming JSON requests
    app.use(express.json());

    // Root endpoint to check if the server is running
    app.get("/", (req, res) => {
        res.status(200).json({ message: "MCP HTTP Server is running..." });
    });

    // Start the server on the specified port
    app.listen(PORT, () => {
        console.log(`MCP HTTP Server is running on port ${PORT}...`);
    });
}
