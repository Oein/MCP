const BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<unknown> {
    const url = new URL(`${BASE_URL}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) {
      const err = data as { message?: string; code?: string };
      throw new Error(
        `Notion API error ${res.status}: ${err.message ?? JSON.stringify(data)}`
      );
    }
    return data;
  }

  // Pages
  async createPage(params: {
    parent: { database_id?: string; page_id?: string };
    properties: Record<string, unknown>;
    children?: unknown[];
    icon?: unknown;
    cover?: unknown;
  }) {
    return this.request("POST", "/pages", params);
  }

  async getPage(pageId: string, filterProperties?: string[]) {
    const query: Record<string, string> = {};
    if (filterProperties?.length) {
      query.filter_properties = filterProperties.join(",");
    }
    return this.request("GET", `/pages/${pageId}`, undefined, query);
  }

  async updatePage(
    pageId: string,
    params: {
      properties?: Record<string, unknown>;
      icon?: unknown;
      cover?: unknown;
      in_trash?: boolean;
      is_archived?: boolean;
    }
  ) {
    return this.request("PATCH", `/pages/${pageId}`, params);
  }

  async getPageProperty(
    pageId: string,
    propertyId: string,
    startCursor?: string,
    pageSize?: number
  ) {
    const query: Record<string, string> = {};
    if (startCursor) query.start_cursor = startCursor;
    if (pageSize) query.page_size = String(pageSize);
    return this.request(
      "GET",
      `/pages/${pageId}/properties/${propertyId}`,
      undefined,
      query
    );
  }

  // Blocks
  async getBlock(blockId: string) {
    return this.request("GET", `/blocks/${blockId}`);
  }

  async updateBlock(blockId: string, params: Record<string, unknown>) {
    return this.request("PATCH", `/blocks/${blockId}`, params);
  }

  async deleteBlock(blockId: string) {
    return this.request("DELETE", `/blocks/${blockId}`);
  }

  async getBlockChildren(
    blockId: string,
    startCursor?: string,
    pageSize?: number
  ) {
    const query: Record<string, string> = {};
    if (startCursor) query.start_cursor = startCursor;
    if (pageSize) query.page_size = String(pageSize);
    return this.request(
      "GET",
      `/blocks/${blockId}/children`,
      undefined,
      query
    );
  }

  async appendBlockChildren(
    blockId: string,
    children: unknown[],
    after?: string
  ) {
    const body: Record<string, unknown> = { children };
    if (after) {
      body.after = after;
    }
    return this.request("PATCH", `/blocks/${blockId}/children`, body);
  }

  // Databases
  async createDatabase(params: {
    parent: { page_id?: string; database_id?: string };
    title?: unknown[];
    description?: unknown[];
    is_inline?: boolean;
    properties: Record<string, unknown>;
    icon?: unknown;
    cover?: unknown;
  }) {
    return this.request("POST", "/databases", params);
  }

  async getDatabase(databaseId: string) {
    return this.request("GET", `/databases/${databaseId}`);
  }

  async updateDatabase(
    databaseId: string,
    params: {
      title?: unknown[];
      description?: unknown[];
      properties?: Record<string, unknown>;
      is_inline?: boolean;
      icon?: unknown;
      cover?: unknown;
      in_trash?: boolean;
    }
  ) {
    return this.request("PATCH", `/databases/${databaseId}`, params);
  }

  async queryDatabase(
    databaseId: string,
    params?: {
      filter?: unknown;
      sorts?: unknown[];
      start_cursor?: string;
      page_size?: number;
    }
  ) {
    return this.request("POST", `/databases/${databaseId}/query`, params ?? {});
  }

  // Search
  async search(params?: {
    query?: string;
    filter?: { property: string; value: string };
    sort?: { timestamp: string; direction: string };
    start_cursor?: string;
    page_size?: number;
  }) {
    return this.request("POST", "/search", params ?? {});
  }

  // Users
  async listUsers(startCursor?: string, pageSize?: number) {
    const query: Record<string, string> = {};
    if (startCursor) query.start_cursor = startCursor;
    if (pageSize) query.page_size = String(pageSize);
    return this.request("GET", "/users", undefined, query);
  }

  async getUser(userId: string) {
    return this.request("GET", `/users/${userId}`);
  }

  async getMe() {
    return this.request("GET", "/users/me");
  }

  // Comments
  async createComment(params: {
    parent?: { page_id?: string; block_id?: string };
    discussion_id?: string;
    rich_text: unknown[];
  }) {
    return this.request("POST", "/comments", params);
  }

  async getComments(
    blockId: string,
    startCursor?: string,
    pageSize?: number
  ) {
    const query: Record<string, string> = { block_id: blockId };
    if (startCursor) query.start_cursor = startCursor;
    if (pageSize) query.page_size = String(pageSize);
    return this.request("GET", "/comments", undefined, query);
  }
}
