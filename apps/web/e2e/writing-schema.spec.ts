import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M6-C1 through the real API (PostgREST + Storage), what the pgTAP test can't reach:
//   * published Writing tasks are readable signed out; drafts aren't; a student can't write a
//     submission (the band comes from score-writing only);
//   * writing-photos: private; a Gold student uploads to their own folder and reads it back with a
//     signed URL; nobody else can read it; Free can't upload; other folders, PDFs and files over
//     10 MB are refused (the bucket's type and size limits are enforced by Storage, not Postgres).

const { url, publishableKey } = localSupabase();
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

test.describe("Writing schema (M6-C1)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let gold: TestUser;
  let free: TestUser;
  const taskIds: string[] = [];
  const stamp = Math.random().toString(36).slice(2, 8);

  test.beforeAll(async () => {
    const db = adminClient();
    [gold, free] = await Promise.all([createTestUser("Gwen Gold"), createTestUser("Fred Free")]);
    const { error } = await db.from("profiles").update({ plan: "gold" }).eq("id", gold.id);
    if (error) throw error;
    const { data, error: tError } = await db
      .from("writing_tasks")
      .insert([
        { task_no: 2, title: `E2E essay ${stamp}`, prompt: "Some people think…", status: "published" },
        { task_no: 1, test_type: "general", title: `E2E draft letter ${stamp}`, prompt: "Write a letter…" },
      ], { defaultToNull: false })
      .select("id");
    if (tError) throw tError;
    taskIds.push(...data.map((t) => t.id));
  });

  test.afterAll(async () => {
    const db = adminClient();
    const users = [gold, free].filter(Boolean);
    for (const u of users) {
      const { data } = await db.storage.from("writing-photos").list(u.id);
      if (data?.length) await db.storage.from("writing-photos").remove(data.map((f) => `${u.id}/${f.name}`));
    }
    await Promise.all(users.map((u) => deleteTestUser(u)));
    if (taskIds.length) await db.from("writing_tasks").delete().in("id", taskIds);
  });

  test("tasks: published ones are public, drafts aren't; students can't write submissions", async () => {
    const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
    const { data, error } = await anon.from("writing_tasks").select("id, title, task_no").in("id", taskIds);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: taskIds[0], title: `E2E essay ${stamp}`, task_no: 2 }]);

    const own = await free.client.from("writing_submissions").insert({
      user_id: free.id,
      task_id: taskIds[0],
      input_mode: "typed",
      text: "My essay",
      word_count: 2,
      scores: { ta: 9, cc: 9, lr: 9, gra: 9 },
      band: 9,
    });
    expect(own.error?.code).toBe("42501");
    expect((await free.client.from("writing_submissions").select("id")).data).toEqual([]);
  });

  test("writing-photos: own folder, private, Gold only, images up to 10 MB", async () => {
    const storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
    if (!storageUp && process.env.CI) throw new Error("Storage is not running");
    test.skip(!storageUp, "Local Supabase is running without Storage");
    const bucket = (u: TestUser) => u.client.storage.from("writing-photos");
    const path = `${gold.id}/page1.jpg`;

    const up = await bucket(gold).upload(path, JPEG, { contentType: "image/jpeg", upsert: true });
    expect(up.error).toBeNull();
    const signed = await bucket(gold).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const served = await fetch(signed.data!.signedUrl);
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(JPEG)).toBe(true);

    // Private: no public URL works, and another student can't read or sign it.
    const { data: pub } = bucket(gold).getPublicUrl(path);
    expect((await fetch(pub.publicUrl)).status).toBeGreaterThanOrEqual(400);
    expect((await bucket(free).download(path)).error).not.toBeNull();
    expect((await bucket(free).createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await bucket(free).list(gold.id)).data).toEqual([]);

    // Refused: Free uploads, someone else's folder, a PDF, more than 10 MB.
    expect((await bucket(free).upload(`${free.id}/page1.jpg`, JPEG, { contentType: "image/jpeg" })).error).not.toBeNull();
    expect((await bucket(gold).upload(`${free.id}/page1.jpg`, JPEG, { contentType: "image/jpeg" })).error).not.toBeNull();
    expect((await bucket(gold).upload(`${gold.id}/essay.pdf`, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" })).error).not.toBeNull();
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    expect((await bucket(gold).upload(`${gold.id}/big.jpg`, big, { contentType: "image/jpeg" })).error).not.toBeNull();

    // A student deletes their own photo.
    expect((await bucket(gold).remove([path])).error).toBeNull();
    expect((await bucket(gold).list(gold.id)).data).toEqual([]);
  });
});
