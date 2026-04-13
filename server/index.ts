import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import express from "express";
import process from "process";
import cors from "cors";

const isStdio = process.argv.includes("--stdio");
const PORT = parseInt(process.env.PORT ?? "5172" , 10);

if(isStdio) {
    const server = new McpServer({name : "MCP Stdio Server" , version : "1.0.0"});
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("MCP Stdio Server is running...\n");

    process.on("SIGINT", () => process.exit(0));
}
else{
    const app = express();
    app.use(cors());
    app.use(express.json()); 

    app.get("/",(req,res) =>{
        res.status(200).json({message : "MCP HTTP Server is running..."});      
    });

    app.listen(PORT, () => {
        console.log(`MCP HTTP Server is running on port ${PORT}...`);
    });
    
}
