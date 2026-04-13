import { randomUUID } from "crypto";
import { getDb } from "./db.js";

export type Memory = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type MemoryRow = Omit<Memory, "tags"> & {
  tags: string;
};

type ParsedFtsQuery = {
  fts5: string;
  negatives: string[];
};

/** Converts a persisted database row into the public Memory shape.
 * The tags column is stored as JSON and parsed back into a string array. */
function rowToMemory(row: MemoryRow): Memory {
  return { ...row, tags: JSON.parse(row.tags) };
}

/** Converts an in-memory Memory object into the database row format.
 * Tags are serialized so SQLite can store them in a single text column. */
function memoryToRow(memory: Memory): MemoryRow {
  return { ...memory, tags: JSON.stringify(memory.tags) };
}

/** Returns the current timestamp in ISO-8601 format.
 * All stored dates use this format for consistent sorting and transport. */
function now(): string {
  return new Date().toISOString();
}

/** Splits the raw search text into an FTS5 query and plain negative filters.
 * Quoted phrases stay exact while bare terms are expanded as prefixes. */
function parseFtsQuery(raw: string): ParsedFtsQuery {
  const parts: string[] = [];
  const negatives: string[] = [];

  const phraseRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = phraseRegex.exec(raw)) !== null) {
    parts.push(`"${match[1].replace(/"/g, '""')}"`);
  }

  const remaining = raw.replace(phraseRegex, "").trim();

  for (const part of remaining.split(/\s+/)) {
    if (part.startsWith("-") && part.length > 1) {
      // Negative terms are applied after FTS so they can exclude partial matches too.
      negatives.push(part.slice(1).toLowerCase());
    } else {
      const clean = part.replace(/[^\w]/g, "").toLowerCase();
      if (clean) parts.push(clean + "*");
    }
  }

  return { fts5: parts.join(" "), negatives };
}

/** Inserts a new memory record and returns the created object.
 * The FTS trigger keeps the search index synchronized automatically. */
export function createMemory(title: string, content: string, tags: string[] = []): Memory {
  const db = getDb();
  const memory: Memory = { id: randomUUID(), title, content, tags, createdAt: now(), updatedAt: now() };
  const row = memoryToRow(memory);
  db.prepare(
    `INSERT INTO memories (id, title, content, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.title, row.content, row.tags, row.createdAt, row.updatedAt);
  return memory;
}

/** Looks up a single memory by its stable ID.
 * Returns null when the record does not exist. */
export function getMemory(id: string): Memory | null {
  const row = getDb().prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
  return row ? rowToMemory(row) : null;
}

/** Applies partial updates to an existing memory and refreshes its timestamp.
 * Missing fields keep their previous values. */
export function updateMemory(
  id: string,
  updates: { title?: string; content?: string; tags?: string[] },
): Memory | null {
  const memory = getMemory(id);
  if (!memory) return null;

  const title = updates.title ?? memory.title;
  const content = updates.content ?? memory.content;
  const tags = updates.tags ?? memory.tags;
  const updatedAt = now();

  const updated: Memory = { ...memory, title, content, tags, updatedAt };
  const row = memoryToRow(updated);
  getDb()
    .prepare(
      `UPDATE memories SET title = ?, content = ?, tags = ?, updatedAt = ? WHERE id = ?`,
    )
    .run(row.title, row.content, row.tags, row.updatedAt, id);

  return updated;
}

/** Deletes a memory by ID.
 * Returns true only when a row was actually removed. */
export function deleteMemory(id: string): boolean {
  return getDb().prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
}

/** Returns memories ordered by most recently updated first.
 * When tags are provided, every requested tag must be present. */
export function listMemories(tags?: string[]): Memory[] {
  const rows = getDb()
    .prepare("SELECT * FROM memories ORDER BY updatedAt DESC")
    .all() as MemoryRow[];
  let memories = rows.map(rowToMemory);

  if (tags && tags.length > 0) {
    memories = memories.filter((m) => tags.every((t) => m.tags.includes(t)));
  }
  return memories;
}

/** Searches memories using SQLite FTS5, then applies plain-text negative filters.
 * Empty queries fall back to the standard listing behavior. */
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