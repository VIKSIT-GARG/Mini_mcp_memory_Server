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

export function getDb(): Database.Database {
    if(!_db){
        _db = new Database(DB_PATH);
        _db.pragma("jounral_mode = WAL");
        _db.pragma("foreign_keys = ON");
        initSchema(_db);
    }
    return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]', -- Stored as JSON arry string, e.g. '["tag1","tag2"]'
      createdAt   TEXT NOT NULL,              -- ISO string
      updatedAt   TEXT NOT NULL               -- ISO string
    );

    -- FTS5 virtual table for full-text search on title and content
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id UNINDEXED,          -- id is stored but not indexed for search
      title,                 -- title is indexed for full-text search
      content,               -- content is indexed for full-text search
      tokenize = 'unicode61' -- Use unicode61 tokenizer for better Unicode support
    );

    -- Keep the FTS table in sync with the main memories table

    -- After a memory is inserted, add it to the FTS table
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts (id, title, content) VALUES (new.id, new.title, new.content);
    END;

    -- After a memory is updated, update the corresponding entry in the FTS table
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      DELETE FROM memories_fts WHERE id = old.id;
      INSERT INTO memories_fts (id, title, content) VALUES (new.id, new.title, new.content);
    END;

    -- After a memory is deleted, remove it from the FTS table
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      DELETE FROM memories_fts WHERE id = old.id;
    END;
  `);
}
