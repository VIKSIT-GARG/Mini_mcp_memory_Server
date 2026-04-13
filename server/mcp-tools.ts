import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z}  from "zod"; 
import {
    type Memory, 
    createMemory, 
    getMemory, 
    updateMemory, 
    deleteMemory, 
    listMemories,
    searchMemories
} from "./memory-store.js"; 
import { ModelHintSchema } from "@modelcontextprotocol/sdk/types";
import { text } from "node:stream/consumers";


// caveman language - helps in reducing tokens 

const COMPRESS_RULE = "IMPORTANT - wrote content in compressed shorthand, skip articles and conjuctions and use abbreviations where possible ."+
"use symbols(-> for leads to, & for and, | for or, ! for not) and numbers(2 for to/too, 4 for for, b/w for between) where possible. "+
"Use short forms for common words (e.g. 'info' for 'information', 'req' for 'request', 'resp' for 'response', 'mem' for 'memory', 'ctx' for 'context'). "+
"Keep sentences concise and to the point, focusing on key details and omitting unnecessary words. "+
"Use bullet points or numbered lists to organize information when appropriate. "+
"Example: Instead of saying 'The user requested information about the weather forecast for tomorrow,' say 'User req weather forecast 4 tomorrow.'"+
"Remember to maintain clarity while compressing the language, ensuring that the essential meaning is preserved."+
"Use this compression rule for all content that is stored in memory or included in the context of interactions with the model. "+
"Do not apply this compression rule to the instructions or prompts given to the model, only to the content that is being stored or included in the context."+
"Always apply this compression rule consistently to ensure that the content is uniformly compressed and easily understandable."+
"Use this compression rule as a standard practice for all interactions with the model to optimize token usage and improve efficiency."+
"Remember that the goal of this compression rule is to reduce token usage while still conveying the necessary information clearly and effectively."+
"By following this compression rule, you can help ensure that your interactions with the model are efficient and effective, while still maintaining clarity and understanding."+
"Always keep in mind the importance of clear communication, even when using compressed language, to ensure that your interactions with the model are successful and productive."+
"Use this compression rule as a guideline for all interactions with the model, and feel free to adapt it as needed to suit your specific use case or requirements."+
"Remember that the key to effective communication with the model is to be clear and concise, while still providing enough information for the model to understand and respond appropriately."+
"By following this compression rule, you can help ensure that your interactions with the model are efficient, effective, and successful."+
"Always strive to find the right balance between compression and clarity in your interactions with the model, and don't hesitate to adjust your approach as needed to achieve the best results."+
"Use this compression rule as a tool to optimize your interactions with the model, and remember that clear communication is always the ultimate goal."+
"By applying this compression rule consistently and effectively, you can help ensure that your interactions with the model are efficient, productive, and successful."+
"Remember to always prioritize clarity and understanding in your interactions with the model, even when using compressed language, to achieve the best possible outcomes."+
"Use this compression rule as a standard practice for all interactions with the model, and feel free to share it with others who may benefit from it as well."+
"By following this compression rule, you can help optimize your interactions with the model and achieve better results while still maintaining clear communication."+
"Always keep in mind the importance of clear communication when interacting with the model, and use this compression rule as a tool to help you achieve that goal effectively."+
"By applying this compression rule consistently and thoughtfully, you can help ensure that your interactions with the model are efficient, effective, and successful while still maintaining clarity and understanding."+ "keep under 100 words per memoryu"; 

// registers mcp toold related to memory manahement , 
// this is called from indexedDB.ts for both stdio and hhtp ModelHintSchema, 
export function registerMemoryTools(server: McpServer):void  {
    // list all memories
    server.registerTool("memory_List",{
        description :"list all saved memories, return forst . optionally filter by tags eg tag1 :abs , tag2: def , tag3,ghi,,, call this at start of every sessoim before doing any work to get context of past interactions ",
    })
    inputSchema : z.object({
        tags : z.array(z.string()).optional() 
        .optional()
        .describe("optional array of tags to filter memories, if not provided , returns all memories")
    })
    async ({ tags } )=> {
        const memories = listMemories(tags); 
        return{
            content : [
                {
                    type:"text", 
                    text : JSON.stringify(memories)
                }
            ]
        }
    }
}; 