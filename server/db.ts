import Database from "better-sqlite3"; 
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";


// 
const __dirname = path.dirname(fileURLToPath(import.meta.url));


// from present working directory go one up and create mini-momery.sqlite 
const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "mini-memory.sqlite");

mkdirSync(DATA_DIR, { recursive: true });
 
let _db: Database.Database | null=  null ; 
// (^ cerate one connection and eberyone uses it  )

export
