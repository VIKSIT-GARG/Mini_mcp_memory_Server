import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import express from "express";
import process from "process";
import cors from "cors";
import { memoryRouter } from "./routes.js";

const isStdio = process.argv.includes("--stdio");
const PORT = parseInt(process.env.PORT ?? "5172", 10);

if (isStdio) {
  // In MCP mode the process speaks over stdio instead of starting an HTTP server.
  const server = new McpServer({ name: "mini-memory", version: "1.0.0" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("mini-memory MCP server is running in stdio mode.\n");

  process.on("SIGINT", async () => {
    // Close the MCP server first so clients do not see an abrupt disconnect.
    process.stderr.write("Shutting down mini-memory MCP server...\n");
    await server.close();
    process.exit(0);
  });
} else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    // Lightweight health endpoint for browser checks and local debugging.
    res.status(200).json({
      status: "ok",
      message: "mini-memory MCP server is running."
    });
  });

  app.use("/api/memories", memoryRouter);

  app.listen(PORT, () => {
    console.log(`mini-memory MCP server is running on port ${PORT}`);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down mini-memory MCP server...");
    process.exit(0);
  });
}