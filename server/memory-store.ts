/**
 * @fileoverview Memory store module - business logic for managing memory records.
 * 
 * PURPOSE:
 * This module provides all the operations you can perform on memories: create, read, update, delete, search, and list.
 * It acts as the "middle layer" between the database (db.ts) and the server (index.ts).
 * 
 * WHY IT'S USED:
 * - Separates data logic from server logic (cleaner code organization)
 * - Handles data format conversions (between JSON stored in DB and objects in memory)
 * - Provides search functionality with advanced query parsing
 * - Ensures consistent behavior across all operations
 * 
 * DEPENDENCIES:
 * - Node.js crypto module: Generates unique IDs for each memory using UUID
 * - db.ts: Provides database access via getDb() function
 * 
 * HOW IT AFFECTS THE SYSTEM:
 * - All memory operations go through this module before reaching the database
 * - Search functionality enables finding memories by text content
 * - Tag filtering allows organizing and categorizing memories
 * - Timestamps track when memories were created and last changed
 */

import { randomUUID } from "crypto";
import { getDb } from "./db.js";

// ================================================================
// TYPE DEFINITIONS: Shapes of data used in this module
// ================================================================

/**
 * @typedef {Object} Memory
 * @description The public format for a memory object (used in the application)
 * @property {string} id - Unique identifier (UUID format)
 * @property {string} title - Title of the memory
 * @property {string} content - Main content/body of the memory
 * @property {string[]} tags - Array of tag strings for categorization (e.g., ["work", "important"])
 * @property {string} createdAt - ISO timestamp when memory was created
 * @property {string} updatedAt - ISO timestamp when memory was last modified
 */
export type Memory = {
  id: string;
  title: string;
  content: string;
  tags: string[];  // This is an array in memory
  createdAt: string;
  updatedAt: string;
};

/**
 * @typedef {Object} MemoryRow
 * @description The database format for a memory row (how it's stored in SQLite)
 * Note: Same as Memory but tags is a JSON string instead of an array
 * @property {string} tags - JSON string representation of tags array (e.g., '["work","important"]')
 */
type MemoryRow = Omit<Memory, "tags"> & {
  tags: string;  // This is a JSON string in the database
};

/**
 * @typedef {Object} ParsedFtsQuery
 * @description Result of parsing a search query
 * @property {string} fts5 - The formatted query string for FTS5 search
 * @property {string[]} negatives - Words to exclude from results
 */
type ParsedFtsQuery = {
  fts5: string;
  negatives: string[];
};

// ================================================================
// HELPER FUNCTIONS: Internal utilities used by main functions
// ================================================================

/**
 * Converts a database row to the application's Memory format.
 * 
 * WHAT IT DOES:
 * Takes data retrieved from SQLite (where tags is a JSON string) and converts it
 * to the Memory type (where tags is an array). This is needed because databases
 * store arrays as text, but JavaScript wants real arrays.
 * 
 * EXAMPLE:
 * Input:  { id: "123", title: "Note", content: "Hello", tags: '["tag1"]', ... }
 * Output: { id: "123", title: "Note", content: "Hello", tags: ["tag1"], ... }
 * 
 * @param {MemoryRow} row - A row returned from the database
 * @returns {Memory} The converted Memory object with tags as an array
 */
function rowToMemory(row: MemoryRow): Memory {
  return { 
    ...row,  // Copy all properties from row
    tags: JSON.parse(row.tags)  // Parse the JSON string to convert it to an array
  };
}

/**
 * Converts an application Memory to a database row format.
 * 
 * WHAT IT DOES:
 * Takes a Memory object (with tags as an array) and converts it to the format
 * needed for SQLite (with tags as a JSON string). This is the opposite of rowToMemory.
 * 
 * EXAMPLE:
 * Input:  { id: "123", title: "Note", content: "Hello", tags: ["tag1"], ... }
 * Output: { id: "123", title: "Note", content: "Hello", tags: '["tag1"]', ... }
 * 
 * @param {Memory} memory - A Memory object from the application
 * @returns {MemoryRow} The converted row ready for database storage
 */
function memoryToRow(memory: Memory): MemoryRow {
  return { 
    ...memory,  // Copy all properties from memory
    tags: JSON.stringify(memory.tags)  // Convert array to JSON string for storage
  };
}

/**
 * Gets the current timestamp in ISO 8601 format.
 * 
 * WHAT IT DOES:
 * Returns the current date and time as a standardized string that can be
 * stored in the database and sorted chronologically.
 * 
 * EXAMPLE OUTPUT:
 * "2024-01-15T10:30:45.123Z"
 * 
 * WHY USE THIS:
 * - Standardized format works everywhere (database, APIs, JavaScript)
 * - "Z" means UTC timezone, so all timestamps are in the same timezone
 * - Easy to sort chronologically (earlier dates have smaller string values)
 * 
 * @returns {string} Current timestamp in ISO 8601 format
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * Parses a search query into FTS5 format and extracts negative filters.
 * 
 * WHAT IT DOES:
 * Takes a raw search string like: "hello -world "exact phrase""
 * And converts it to: { fts5: '"exact phrase" hello*', negatives: ['world'] }
 * 
 * FEATURES SUPPORTED:
 * - Quoted phrases: "hello world" - searches for exact phrase
 * - Negative terms: -word - excludes results containing this word
 * - Prefix search: hello - searches for words starting with "hello"
 * 
 * HOW IT WORKS:
 * 1. Extracts quoted phrases and keeps them exact for the FTS query
 * 2. Splits the remaining text by spaces
 * 3. Terms starting with "-" are collected as negatives (applied separately)
 * 4. Other terms are converted to prefix searches (word means word*)
 * 
 * @param {string} raw - The raw search query string
 * @returns {ParsedFtsQuery} Object with fts5 query string and negative terms array
 */
function parseFtsQuery(raw: string): ParsedFtsQuery {
  const parts: string[] = [];
  const negatives: string[] = [];

  // Regex to find quoted phrases: matches "text here"
  const phraseRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;

  // Extract all quoted phrases and add them to parts
  while ((match = phraseRegex.exec(raw)) !== null) {
    // Escape any quotes inside the phrase by doubling them (SQLite convention)
    parts.push(`"${match[1].replace(/"/g, '""')}"`);
  }

  // Remove all quoted phrases from the raw query
  // Keep only the remaining unquoted words
  const remaining = raw.replace(phraseRegex, "").trim();

  // Split remaining text by whitespace and process each word
  for (const part of remaining.split(/\s+/)) {
    // Check if this is a negative term (starts with "-")
    if (part.startsWith("-") && part.length > 1) {
      // Remove the "-" and save as a negative term
      // Negatives are applied after FTS searching (for more flexible filtering)
      negatives.push(part.slice(1).toLowerCase());
    } else {
      // Regular search term: clean it and convert to prefix search
      // Remove any non-word characters (punctuation, etc.)
      const clean = part.replace(/[^\w]/g, "").toLowerCase();
      // Add asterisk for prefix search: "hello" becomes "hello*"
      // This matches any word starting with "hello"
      if (clean) parts.push(clean + "*");
    }
  }

  // Return both the FTS5 query string and the negative terms for separate filtering
  return { fts5: parts.join(" "), negatives };
}

// ================================================================
// PUBLIC FUNCTIONS: Main operations on memories
// ================================================================

/**
 * Creates a new memory with the given title, content, and optional tags.
 * 
 * WHAT IT DOES:
 * - Generates a unique ID for the memory
 * - Records the creation and update timestamps
 * - Inserts the memory into the database
 * - The FTS trigger automatically indexes it for searching
 * 
 * HOW TO USE:
 * const memory = createMemory("My Title", "My content here", ["tag1", "tag2"]);
 * 
 * @param {string} title - The title of the memory (required)
 * @param {string} content - The content/body of the memory (required)
 * @param {string[]} tags - Optional array of tags for categorization (defaults to empty array)
 * @returns {Memory} The newly created Memory object (includes generated id and timestamps)
 */
export function createMemory(title: string, content: string, tags: string[] = []): Memory {
  const db = getDb();
  
  // Create a new Memory object with all required properties
  const memory: Memory = {
    id: randomUUID(),  // Generate a unique ID (e.g., "550e8400-e29b-41d4-a716-446655440000")
    title,
    content,
    tags,
    createdAt: now(),  // Current timestamp
    updatedAt: now()   // Same as createdAt since it's new
  };
  
  // Convert to database format (tags to JSON string)
  const row = memoryToRow(memory);
  
  // Insert into the database
  // ? marks are placeholders for values (prevents SQL injection)
  db.prepare(
    `INSERT INTO memories (id, title, content, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.title, row.content, row.tags, row.createdAt, row.updatedAt);
  
  // Return the created memory to the caller
  return memory;
}

/**
 * Retrieves a single memory by ID.
 * 
 * WHAT IT DOES:
 * Queries the database for a memory with the given ID.
 * Returns the memory if found, or null if it doesn't exist.
 * 
 * HOW TO USE:
 * const memory = getMemory("550e8400-e29b-41d4-a716-446655440000");
 * if (memory) {
 *   console.log(memory.title);
 * } else {
 *   console.log("Memory not found");
 * }
 * 
 * @param {string} id - The unique ID of the memory to retrieve
 * @returns {Memory|null} The Memory object, or null if not found
 */
export function getMemory(id: string): Memory | null {
  // Query the database for a row with matching ID
  const row = getDb().prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
  // Convert from database format to Memory format, or return null
  return row ? rowToMemory(row) : null;
}

/**
 * Updates an existing memory with partial changes.
 * 
 * WHAT IT DOES:
 * - Finds the existing memory by ID
 * - Applies the provided updates (only fields specified are changed)
 * - Updates the "updatedAt" timestamp
 * - Saves back to database
 * - Returns the updated memory
 * 
 * FEATURES:
 * - Partial updates: only provide fields you want to change
 * - Other fields keep their previous values (nullish coalescing operator ??)
 * - Returns null if the ID doesn't exist
 * 
 * HOW TO USE:
 * const updated = updateMemory("123", { title: "New Title" });
 * // Content and tags remain unchanged
 * 
 * @param {string} id - The ID of the memory to update
 * @param {Object} updates - Partial object with fields to update
 * @param {string} [updates.title] - New title (optional)
 * @param {string} [updates.content] - New content (optional)
 * @param {string[]} [updates.tags] - New tags (optional)
 * @returns {Memory|null} The updated Memory object, or null if ID not found
 */
export function updateMemory(
  id: string,
  updates: { title?: string; content?: string; tags?: string[] },
): Memory | null {
  // First, get the existing memory
  const memory = getMemory(id);
  if (!memory) return null;  // Return null if memory doesn't exist

  // Apply updates: use provided value, or keep the existing value
  const title = updates.title ?? memory.title;
  const content = updates.content ?? memory.content;
  const tags = updates.tags ?? memory.tags;
  const updatedAt = now();  // Update the timestamp

  // Create the updated Memory object
  const updated: Memory = { ...memory, title, content, tags, updatedAt };
  const row = memoryToRow(updated);
  
  // Update the database record
  getDb()
    .prepare(
      `UPDATE memories SET title = ?, content = ?, tags = ?, updatedAt = ? WHERE id = ?`,
    )
    .run(row.title, row.content, row.tags, row.updatedAt, id);

  return updated;
}

/**
 * Deletes a memory by ID.
 * 
 * WHAT IT DOES:
 * Removes the memory and all its data from the database.
 * Returns true if a record was deleted, false if the ID didn't exist.
 * 
 * HOW TO USE:
 * const deleted = deleteMemory("550e8400-e29b-41d4-a716-446655440000");
 * if (deleted) {
 *   console.log("Memory deleted successfully");
 * }
 * 
 * @param {string} id - The ID of the memory to delete
 * @returns {boolean} true if a record was deleted, false if ID not found
 */
export function deleteMemory(id: string): boolean {
  // Execute the DELETE query and check if any rows were affected
  // .changes property tells us how many rows were modified
  return getDb().prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
}

/**
 * Lists all memories, optionally filtered by tags.
 * 
 * WHAT IT DOES:
 * - Retrieves all memories from the database
 * - Sorts them by most recent update first (descending order)
 * - Optionally filters to only memories with ALL specified tags
 * 
 * TAG FILTERING:
 * If you ask for tags ["work", "urgent"], only memories having BOTH tags are returned.
 * 
 * HOW TO USE:
 * const all = listMemories();  // All memories
 * const work = listMemories(["work"]);  // Only memories tagged "work"
 * const important = listMemories(["work", "urgent"]);  // Tagged with both
 * 
 * @param {string[]} [tags] - Optional array of tags to filter by (all must be present)
 * @returns {Memory[]} Array of Memory objects, sorted by most recent first
 */
export function listMemories(tags?: string[]): Memory[] {
  // Get all memories from database, most recently updated first
  const rows = getDb()
    .prepare("SELECT * FROM memories ORDER BY updatedAt DESC")
    .all() as MemoryRow[];
  
  // Convert from database format to Memory format
  let memories = rows.map(rowToMemory);

  // If tags filter is provided, filter the results
  if (tags && tags.length > 0) {
    // Keep only memories that have ALL specified tags
    memories = memories.filter((m) => 
      // every() returns true only if ALL tags are found
      tags.every((t) => m.tags.includes(t)));
  }
  return memories;
}

/**
 * Searches memories using SQLite FTS5, then applies plain-text negative filters.
 * Empty queries fall back to the standard listing behavior.
 */
export function searchMemories(query: string): Memory[] {
  if (!query.trim()) return listMemories();

  const db = getDb();
  const { fts5, negatives } = parseFtsQuery(query);

  if (!fts5.trim()) {
    // If the query only contains exclusions, start from the full set and filter down.
    let all = listMemories();
    for (const neg of negatives) {
      all = all.filter(
        (m) => !m.title.toLowerCase().includes(neg) && !m.content.toLowerCase().includes(neg),
      );
    }
    return all;
  }

  const ftsRows = db
    .prepare("SELECT id FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank")
    .all(fts5) as { id: string }[];

  if (ftsRows.length === 0) return [];

  const ids = ftsRows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  let memories = (
    db
      .prepare(`SELECT * FROM memories WHERE id IN (${placeholders})`)
      .all(...ids) as MemoryRow[]
  ).map(rowToMemory);

  // Preserve the rank returned by FTS because the secondary SELECT loses that ordering.
  const rankMap = new Map(ids.map((id, i) => [id, i]));
  memories.sort((a, b) => (rankMap.get(a.id) ?? 0) - (rankMap.get(b.id) ?? 0));

  for (const neg of negatives) {
    memories = memories.filter(
      (m) => !m.title.toLowerCase().includes(neg) && !m.content.toLowerCase().includes(neg),
    );
  }

  return memories;
}