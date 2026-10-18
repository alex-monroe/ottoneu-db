/**
 * The post log's never-twice guarantee: claim the row, then post, and release
 * the claim if Discord refuses.
 */

const insert = jest.fn();
const del = jest.fn();
const update = jest.fn();
const calls: string[] = [];

function chain(op: string, result: unknown) {
  // Every .eq() after the write returns the same thenable chain.
  const c: Record<string, unknown> = {};
  c.eq = jest.fn(() => c);
  c.then = (resolve: (v: unknown) => void) => {
    calls.push(op);
    resolve(result);
  };
  return c;
}

const admin = {
  from: jest.fn(() => ({
    insert: (row: unknown) => {
      calls.push("insert");
      return insert(row);
    },
    delete: () => del(),
    update: (row: unknown) => update(row),
  })),
};

jest.mock("@/lib/supabase", () => ({
  supabase: {},
  fetchAllRows: jest.fn(),
  getSupabaseAdmin: jest.fn(() => admin),
}));

const postDiscordMessage = jest.fn();
jest.mock("@/lib/discord", () => ({
  ...jest.requireActual("@/lib/discord"),
  postDiscordMessage: (...args: unknown[]) => {
    calls.push("post");
    return postDiscordMessage(...args);
  },
}));

// Import AFTER mocks are registered.
import { sendFeedPost } from "@/lib/discord-feed-data";

const ID = { type: "trade_processed" as const, key: "44207" };
const MESSAGE = { embeds: [] };
const ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  process.env = { ...ENV, DISCORD_TOKEN: "tok", DISCORD_CHANNEL_ID: "chan" };
  del.mockImplementation(() => chain("delete", { error: null }));
  update.mockImplementation(() => chain("update", { error: null }));
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
  process.env = ENV;
});

describe("sendFeedPost", () => {
  it("dry run prints and touches neither Discord nor the log", async () => {
    await expect(sendFeedPost(ID, MESSAGE, { dryRun: true })).resolves.toBe("dry-run");
    expect(calls).toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("claims the log row before posting, then stores the message id", async () => {
    insert.mockResolvedValue({ error: null });
    postDiscordMessage.mockResolvedValue("msg-1");
    await expect(sendFeedPost(ID, MESSAGE, { dryRun: false })).resolves.toBe("posted");
    expect(calls).toEqual(["insert", "post", "update"]);
    expect(insert).toHaveBeenCalledWith({ league_id: expect.any(Number), post_type: "trade_processed", post_key: "44207" });
    expect(postDiscordMessage).toHaveBeenCalledWith("chan", "tok", MESSAGE);
    expect(update).toHaveBeenCalledWith({ discord_message_id: "msg-1" });
  });

  it("does not post when another run already claimed it", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await expect(sendFeedPost(ID, MESSAGE, { dryRun: false })).resolves.toBe("already-posted");
    expect(postDiscordMessage).not.toHaveBeenCalled();
  });

  it("releases the claim when Discord refuses, so the next run retries", async () => {
    insert.mockResolvedValue({ error: null });
    postDiscordMessage.mockRejectedValue(new Error("Discord rejected the post (403)"));
    await expect(sendFeedPost(ID, MESSAGE, { dryRun: false })).rejects.toThrow("403");
    expect(calls).toEqual(["insert", "post", "delete"]);
  });

  it("refuses to run without bot credentials", async () => {
    delete process.env.DISCORD_TOKEN;
    await expect(sendFeedPost(ID, MESSAGE, { dryRun: false })).rejects.toThrow("DISCORD_TOKEN");
    expect(calls).toEqual([]);
  });
});
