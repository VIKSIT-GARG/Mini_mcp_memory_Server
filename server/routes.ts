import { Router } from "express";

import {
  createMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  listMemories,
  searchMemories,
} from "./memory-store.js";

export const memoryRouter = Router();

// GET /api/memories?search=foo&tags=tag1:abc,tag2:def
// if serach is provided run FTS search; otherwise list all memories optionally filtered by tags
memoryRouter.get("/", (req, res) => {
    if(typeof req.body !== "object" || req.body === null) {
        return res.status(400).json({ status: "error", message: "Request body must be a JSON object" });
    }
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const tagsParam =
    typeof req.query.tags === "string" ? req.query.tags.trim() : undefined;
  //  Parse tags from query parameter, split by comma, trim whitespace, and filter out empty tags
  const tags = tagsParam
    ? tagsParam
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : undefined;
  if (search) {
    return res.json(searchMemories(search, tags));
  } else {
    return res.json(listMemories(tags));
  }
});

// Get /api/memories/:id - get a single memory by id. (UUID )( from randomUUID() )
memoryRouter.get("/:id", (req, res) => {
    if(typeof req.body !== "object" || req.body === null) {
        return res.status(400).json({ status: "error", message: "Request body must be a JSON object" });
    }
  const memory = getMemory(req.params.id);
  if (!memory) {
    return res
      .status(404)
      .json({ status: "error", message: "Memory not found" });
  }
  res.json(memory);
});

// POST /api/memories - create a new memory. Expects JSON body with content and optional tags.
// body: { title:string , content:string, tags?: string[]       }

memoryRouter.post("/", (req, res) => {
  if (typeof req.body !== "object" || req.body === null) {
    return res
      .status(400)
      .json({ status: "error", message: "Request body must be a JSON object" });
  }
  const { title, content, tags } = req.body;
  if (typeof title !== "string" || typeof content !== "string") {
    return res
      .status(400)
      .json({
        status: "error",
        message: "Title and content are required and must be strings",
      });
  }

  const memory = createMemory(
    title.trim(),
    content.trim(),
    Array.isArray(tags) ? tags : [],
  );
});

//putput /api/memories/:id - update an existing memory by id. Expects JSON body with content and optional tags.
// body: { title?:string , content?:string, tags?: string[]       }
memoryRouter.put("/:id", (req, res) => {
    if(typeof req.body !== "object" || req.body === null) {
        return res.status(400).json({ status: "error", message: "Request body must be a JSON object" });
    }
  const { title, content, tags } = req.body;
  if (title !== undefined && typeof title !== "string") {
    return res
      .status(400)
      .json({ status: "error", message: "Title must be a string" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res
      .status(400)
      .json({ status: "error", message: "Content must be a string" });
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return res
      .status(400)
      .json({ status: "error", message: "Tags must be an array of strings" });
  }

  const updates = {
    title: title ? title.trim() : undefined,
    content: content ? content.trim() : undefined,
    tags: Array.isArray(tags) ? tags : undefined,
  };

  const updatedMemory = updateMemory(req.params.id, updates);
  if (!updatedMemory) {
    return res
      .status(404)
      .json({ status: "error", message: "Memory not found" });
  }
  res.json(updatedMemory);
});

// DELETE /api/memories/:id - delete a memory by id.
memoryRouter.delete("/:id", (req, res) => {
  if (typeof req.body !== "object" || req.body === null) {
    return res
      .status(400)
      .json({ status: "error", message: "Request body must be a JSON object" });
  }
  const success = deleteMemory(req.params.id);
  if (!success) {
    return res
      .status(404)
      .json({ status: "error", message: "Memory not found" });
  }
  res.json({ status: "success", message: "Memory deleted" });
});
