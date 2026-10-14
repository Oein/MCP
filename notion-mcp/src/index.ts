#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NotionClient } from "./notion-client.js";

const token = process.env.NOTION_API_KEY;
if (!token) {
  console.error("NOTION_API_KEY environment variable is required");
  process.exit(1);
}

const notion = new NotionClient(token);

const server = new McpServer({
  name: "notion-mcp",
  version: "1.0.0",
});

const RichTextInput = z
  .array(
    z.object({
      type: z.enum(["text", "mention", "equation"]).default("text"),
      text: z
        .object({
          content: z.string(),
          link: z.object({ url: z.string() }).nullable().optional(),
        })
        .optional(),
      mention: z.record(z.string(), z.unknown()).optional(),
      equation: z.object({ expression: z.string() }).optional(),
      annotations: z
        .object({
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          strikethrough: z.boolean().optional(),
          underline: z.boolean().optional(),
          code: z.boolean().optional(),
          color: z.string().optional(),
        })
        .optional(),
    })
  )
  .describe("Rich text array");

const BlockInput: z.ZodType = z.lazy(() =>
  z.object({
    type: z.string().describe("Block type: paragraph, heading_1, heading_2, heading_3, heading_4, bulleted_list_item, numbered_list_item, to_do, toggle, quote, callout, code, equation, divider, table_of_contents, bookmark, embed, image, video, audio, file, pdf, column_list, column, table, table_row, synced_block, link_to_page, breadcrumb, tab, child_page, child_database, template"),
    paragraph: z.object({ rich_text: RichTextInput, color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    heading_1: z.object({ rich_text: RichTextInput, color: z.string().optional(), is_toggleable: z.boolean().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    heading_2: z.object({ rich_text: RichTextInput, color: z.string().optional(), is_toggleable: z.boolean().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    heading_3: z.object({ rich_text: RichTextInput, color: z.string().optional(), is_toggleable: z.boolean().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    heading_4: z.object({ rich_text: RichTextInput, color: z.string().optional(), is_toggleable: z.boolean().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    bulleted_list_item: z.object({ rich_text: RichTextInput, color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    numbered_list_item: z.object({ rich_text: RichTextInput, color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    to_do: z.object({ rich_text: RichTextInput, checked: z.boolean().optional(), color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    toggle: z.object({ rich_text: RichTextInput, color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    quote: z.object({ rich_text: RichTextInput, color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    callout: z.object({ rich_text: RichTextInput, icon: z.record(z.string(), z.unknown()).optional(), color: z.string().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    code: z.object({ rich_text: RichTextInput, language: z.string(), caption: RichTextInput.optional() }).optional(),
    equation: z.object({ expression: z.string() }).optional(),
    divider: z.object({}).optional(),
    table_of_contents: z.object({ color: z.string().optional() }).optional(),
    bookmark: z.object({ url: z.string(), caption: RichTextInput.optional() }).optional(),
    embed: z.object({ url: z.string() }).optional(),
    image: z.object({ type: z.enum(["external"]), external: z.object({ url: z.string() }) }).optional(),
    video: z.object({ type: z.enum(["external"]), external: z.object({ url: z.string() }) }).optional(),
    audio: z.object({ type: z.enum(["external"]), external: z.object({ url: z.string() }) }).optional(),
    file: z.object({ type: z.enum(["external"]), external: z.object({ url: z.string() }), name: z.string().optional() }).optional(),
    pdf: z.object({ type: z.enum(["external"]), external: z.object({ url: z.string() }) }).optional(),
    column_list: z.object({ children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    column: z.object({ children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    table: z.object({ table_width: z.number(), has_column_header: z.boolean().optional(), has_row_header: z.boolean().optional(), children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    table_row: z.object({ cells: z.array(z.array(z.record(z.string(), z.unknown()))) }).optional(),
    synced_block: z.object({ synced_from: z.object({ block_id: z.string() }).nullable() }).optional(),
    link_to_page: z.object({ page_id: z.string().optional(), database_id: z.string().optional() }).optional(),
    breadcrumb: z.object({}).optional(),
    tab: z.object({ children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
    child_page: z.object({ title: z.string() }).optional(),
    child_database: z.object({ title: z.string() }).optional(),
    template: z.object({ rich_text: RichTextInput, children: z.array(z.lazy(() => BlockInput)).optional() }).optional(),
  })
);

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ── Pages ──

server.tool(
  "create_page",
  "Create a new Notion page. Parent can be a database or another page. Supports all property types, block children, icon, and cover.",
  {
    parent: z.object({
      database_id: z.string().optional(),
      page_id: z.string().optional(),
    }).describe("Parent: database_id or page_id"),
    properties: z.record(z.string(), z.unknown()).describe("Page properties (title, rich_text, number, select, multi_select, date, people, files, checkbox, url, email, phone_number, relation, status, etc.)"),
    children: z.array(BlockInput).optional().describe("Page content blocks (max 100)"),
    icon: z.record(z.string(), z.unknown()).optional().describe("Page icon: {type:'emoji',emoji:'📝'} or {type:'external',external:{url:'...'}}"),
    cover: z.record(z.string(), z.unknown()).optional().describe("Page cover: {type:'external',external:{url:'...'}}"),
  },
  async (params) => ok(await notion.createPage(params))
);

server.tool(
  "get_page",
  "Retrieve a Notion page by ID, including its properties.",
  {
    page_id: z.string().describe("Page ID (UUID, with or without dashes)"),
    filter_properties: z.array(z.string()).optional().describe("Property IDs to filter (max 100)"),
  },
  async ({ page_id, filter_properties }) => ok(await notion.getPage(page_id, filter_properties))
);

server.tool(
  "update_page",
  "Update page properties, icon, cover, or archive/restore a page.",
  {
    page_id: z.string(),
    properties: z.record(z.string(), z.unknown()).optional().describe("Properties to update"),
    icon: z.record(z.string(), z.unknown()).optional(),
    cover: z.record(z.string(), z.unknown()).optional(),
    in_trash: z.boolean().optional().describe("Set true to trash, false to restore"),
    is_archived: z.boolean().optional(),
  },
  async ({ page_id, ...params }) => ok(await notion.updatePage(page_id, params))
);

server.tool(
  "get_page_property",
  "Retrieve a specific property value from a page. Paginated for title, rich_text, relation, people, rollup.",
  {
    page_id: z.string(),
    property_id: z.string().describe("Property ID (from the page's properties object)"),
    start_cursor: z.string().optional(),
    page_size: z.number().optional(),
  },
  async ({ page_id, property_id, start_cursor, page_size }) =>
    ok(await notion.getPageProperty(page_id, property_id, start_cursor, page_size))
);

// ── Blocks ──

server.tool(
  "get_block",
  "Retrieve a single block by ID.",
  { block_id: z.string() },
  async ({ block_id }) => ok(await notion.getBlock(block_id))
);

server.tool(
  "update_block",
  "Update a block's content. Send the block-type key with fields to change. Can also archive/unarchive.",
  {
    block_id: z.string(),
    type: z.string().optional().describe("Block type being updated (paragraph, heading_1, to_do, etc.)"),
    properties: z.record(z.string(), z.unknown()).describe("Block update payload. Use the block type as key, e.g. {paragraph: {rich_text: [...]}} or {to_do: {checked: true}}. Can also include {in_trash: false} to restore."),
  },
  async ({ block_id, properties }) => ok(await notion.updateBlock(block_id, properties))
);

server.tool(
  "delete_block",
  "Delete (trash) a block. Can be restored later via update_block with in_trash: false.",
  { block_id: z.string() },
  async ({ block_id }) => ok(await notion.deleteBlock(block_id))
);

server.tool(
  "get_block_children",
  "Retrieve children blocks of a block or page. Paginated.",
  {
    block_id: z.string().describe("Block or page ID"),
    start_cursor: z.string().optional(),
    page_size: z.number().optional().describe("Max 100"),
  },
  async ({ block_id, start_cursor, page_size }) =>
    ok(await notion.getBlockChildren(block_id, start_cursor, page_size))
);

server.tool(
  "append_block_children",
  "Append new blocks as children of a block or page. Supports all block types. Use 'after' to insert after a specific block.",
  {
    block_id: z.string().describe("Parent block or page ID"),
    children: z.array(BlockInput).describe("Array of block objects to append (max 100, up to 2 nesting levels)"),
    after: z.string().optional().describe("Block ID to insert after. Omit to append at the end."),
  },
  async ({ block_id, children, after }) =>
    ok(await notion.appendBlockChildren(block_id, children, after))
);

// ── Databases ──

server.tool(
  "create_database",
  "Create a new database. Supports all property types: title, rich_text, number, select, multi_select, status, date, people, files, checkbox, url, email, phone_number, formula, relation, rollup.",
  {
    parent: z.object({
      page_id: z.string().optional(),
      database_id: z.string().optional(),
    }),
    title: z.array(z.record(z.string(), z.unknown())).optional().describe("Database title as rich text array"),
    description: z.array(z.record(z.string(), z.unknown())).optional(),
    is_inline: z.boolean().optional().describe("True for inline database"),
    properties: z.record(z.string(), z.unknown()).describe("Property schema. Keys are property names, values define type and config. E.g. {Name:{title:{}}, Status:{select:{options:[{name:'Todo'},{name:'Done'}]}}, Priority:{number:{format:'number'}}}"),
    icon: z.record(z.string(), z.unknown()).optional(),
    cover: z.record(z.string(), z.unknown()).optional(),
  },
  async (params) => ok(await notion.createDatabase(params))
);

server.tool(
  "get_database",
  "Retrieve a database schema and metadata.",
  { database_id: z.string() },
  async ({ database_id }) => ok(await notion.getDatabase(database_id))
);

server.tool(
  "update_database",
  "Update database title, description, properties schema, icon, cover, or trash/restore.",
  {
    database_id: z.string(),
    title: z.array(z.record(z.string(), z.unknown())).optional(),
    description: z.array(z.record(z.string(), z.unknown())).optional(),
    properties: z.record(z.string(), z.unknown()).optional().describe("Property schema updates. To rename: {OldName:{name:'NewName'}}. To add: {NewProp:{number:{}}}. To remove: {PropName:null}."),
    is_inline: z.boolean().optional(),
    icon: z.record(z.string(), z.unknown()).optional(),
    cover: z.record(z.string(), z.unknown()).optional(),
    in_trash: z.boolean().optional(),
  },
  async ({ database_id, ...params }) => ok(await notion.updateDatabase(database_id, params))
);

server.tool(
  "query_database",
  "Query a database with filters and sorts. Supports compound filters (and/or), all property type filters, and multi-key sorting.",
  {
    database_id: z.string(),
    filter: z.record(z.string(), z.unknown()).optional().describe("Filter object. Single: {property:'Status',select:{equals:'Done'}}. Compound: {and:[{property:'Status',select:{equals:'Done'}},{property:'Priority',number:{greater_than:3}}]}. Supports: rich_text, number, checkbox, select, multi_select, status, date, people, files, relation, formula, rollup, timestamp filters."),
    sorts: z.array(z.record(z.string(), z.unknown())).optional().describe("Sort array. E.g. [{property:'Priority',direction:'descending'},{timestamp:'last_edited_time',direction:'ascending'}]"),
    start_cursor: z.string().optional(),
    page_size: z.number().optional().describe("Max 100"),
  },
  async ({ database_id, ...params }) => ok(await notion.queryDatabase(database_id, params))
);

// ── Search ──

server.tool(
  "search",
  "Search pages and databases accessible to the integration. Can filter by object type and sort by relevance or last_edited_time.",
  {
    query: z.string().optional().describe("Search query string. Omit to return all accessible pages/databases."),
    filter: z.object({
      property: z.string().default("object"),
      value: z.enum(["page", "database"]),
    }).optional().describe("Filter by object type"),
    sort: z.object({
      timestamp: z.enum(["last_edited_time"]).default("last_edited_time"),
      direction: z.enum(["ascending", "descending"]),
    }).optional(),
    start_cursor: z.string().optional(),
    page_size: z.number().optional(),
  },
  async (params) => ok(await notion.search(params))
);

// ── Users ──

server.tool(
  "list_users",
  "List all users in the workspace.",
  {
    start_cursor: z.string().optional(),
    page_size: z.number().optional(),
  },
  async ({ start_cursor, page_size }) => ok(await notion.listUsers(start_cursor, page_size))
);

server.tool(
  "get_user",
  "Retrieve a user by ID.",
  { user_id: z.string() },
  async ({ user_id }) => ok(await notion.getUser(user_id))
);

server.tool(
  "get_me",
  "Retrieve the bot user for this integration.",
  {},
  async () => ok(await notion.getMe())
);

// ── Comments ──

server.tool(
  "create_comment",
  "Create a comment on a page, block, or reply to a discussion thread.",
  {
    parent: z.object({
      page_id: z.string().optional(),
      block_id: z.string().optional(),
    }).optional().describe("Target: page_id or block_id"),
    discussion_id: z.string().optional().describe("Reply to an existing discussion thread"),
    rich_text: RichTextInput.describe("Comment content"),
  },
  async (params) => ok(await notion.createComment(params))
);

server.tool(
  "get_comments",
  "List comments on a page or block.",
  {
    block_id: z.string().describe("Page or block ID"),
    start_cursor: z.string().optional(),
    page_size: z.number().optional(),
  },
  async ({ block_id, start_cursor, page_size }) =>
    ok(await notion.getComments(block_id, start_cursor, page_size))
);

// ── Convenience / Composite Tools ──

server.tool(
  "get_page_content",
  "Get a page's full content: metadata + all child blocks (auto-paginated, recursively fetches nested blocks).",
  {
    page_id: z.string(),
    max_depth: z.number().optional().default(3).describe("Max nesting depth to fetch (default 3)"),
  },
  async ({ page_id, max_depth }) => {
    const page = await notion.getPage(page_id);

    async function fetchChildren(blockId: string, depth: number): Promise<unknown[]> {
      const blocks: unknown[] = [];
      let cursor: string | undefined;
      do {
        const res = (await notion.getBlockChildren(blockId, cursor, 100)) as {
          results: Array<{ id: string; has_children: boolean } & Record<string, unknown>>;
          next_cursor: string | null;
          has_more: boolean;
        };
        for (const block of res.results) {
          if (block.has_children && depth < max_depth) {
            (block as Record<string, unknown>).children = await fetchChildren(block.id, depth + 1);
          }
          blocks.push(block);
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);
      return blocks;
    }

    const children = await fetchChildren(page_id, 0);
    return ok({ page, children });
  }
);

server.tool(
  "batch_update_blocks",
  "Update multiple blocks at once. Each update specifies a block_id and the update payload.",
  {
    updates: z.array(z.object({
      block_id: z.string(),
      properties: z.record(z.string(), z.unknown()).describe("Block update payload"),
    })),
  },
  async ({ updates }) => {
    const results = [];
    for (const { block_id, properties } of updates) {
      try {
        results.push({ block_id, result: await notion.updateBlock(block_id, properties) });
      } catch (e) {
        results.push({ block_id, error: String(e) });
      }
    }
    return ok(results);
  }
);

server.tool(
  "move_block",
  "Move a block to a new position. Works for both moving to a different parent and reordering within the same parent. Note: Notion API doesn't support native move, so this creates a new block (new ID).",
  {
    block_id: z.string().describe("Block to move"),
    target_parent_id: z.string().describe("Target parent block or page ID (can be the same parent for reordering)"),
    after: z.string().optional().describe("Block ID to insert after. Omit to place at the end."),
  },
  async ({ block_id, target_parent_id, after }) => {
    if (after === block_id) {
      throw new Error("Cannot place a block after itself");
    }

    const block = (await notion.getBlock(block_id)) as Record<string, unknown>;
    const blockType = block.type as string;
    const blockData = block[blockType] as Record<string, unknown>;

    let children: unknown[] | undefined;
    if (block.has_children) {
      const allChildren: unknown[] = [];
      let cursor: string | undefined;
      do {
        const res = (await notion.getBlockChildren(block_id, cursor, 100)) as {
          results: unknown[];
          next_cursor: string | null;
          has_more: boolean;
        };
        allChildren.push(...res.results);
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);
      children = allChildren;
    }

    const newBlock: Record<string, unknown> = {
      type: blockType,
      [blockType]: { ...blockData },
    };
    if (children && blockData) {
      (newBlock[blockType] as Record<string, unknown>).children = children;
    }

    await notion.deleteBlock(block_id);
    const result = await notion.appendBlockChildren(target_parent_id, [newBlock], after);

    return ok({ moved: true, old_id: block_id, result });
  }
);

server.tool(
  "replace_block_content",
  "Replace the rich_text content of an existing block (paragraph, heading, list item, etc.).",
  {
    block_id: z.string(),
    rich_text: RichTextInput.describe("New rich text content"),
  },
  async ({ block_id, rich_text }) => {
    const block = (await notion.getBlock(block_id)) as Record<string, unknown>;
    const blockType = block.type as string;
    return ok(await notion.updateBlock(block_id, { [blockType]: { rich_text } }));
  }
);

server.tool(
  "append_text_to_block",
  "Append text to an existing block's rich_text content without replacing existing content.",
  {
    block_id: z.string(),
    rich_text: RichTextInput.describe("Rich text to append"),
  },
  async ({ block_id, rich_text }) => {
    const block = (await notion.getBlock(block_id)) as Record<string, unknown>;
    const blockType = block.type as string;
    const existing = (block[blockType] as { rich_text?: unknown[] })?.rich_text ?? [];
    return ok(
      await notion.updateBlock(block_id, {
        [blockType]: { rich_text: [...existing, ...rich_text] },
      })
    );
  }
);

server.tool(
  "database_add_item",
  "Add a new item (page) to a database with specified property values.",
  {
    database_id: z.string(),
    properties: z.record(z.string(), z.unknown()).describe("Property values. E.g. {Name:{title:[{text:{content:'Task 1'}}]}, Status:{select:{name:'Todo'}}, Priority:{number:1}, Due:{date:{start:'2024-01-01'}}}"),
    children: z.array(BlockInput).optional().describe("Page content blocks"),
    icon: z.record(z.string(), z.unknown()).optional(),
  },
  async ({ database_id, properties, children, icon }) =>
    ok(await notion.createPage({
      parent: { database_id },
      properties,
      children,
      icon,
    }))
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
