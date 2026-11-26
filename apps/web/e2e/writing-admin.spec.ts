import { expect, test } from "@playwright/test";
import { WritingTaskForm, writingPublishCheck, writingTaskRow } from "@prepora/shared/api/admin-writing";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M6-A1: the Writing task manager's calls through the real API (PostgREST + Storage) with real
// sessions, as the admin panel's Server Functions make them: an editor creates a Task 1 Academic
// draft from the form contract, can't publish it without its chart, uploads the chart to
// writing-images and publishes; students see it (with the image description) but can't upload or
// write tasks; a task students have answered can't be deleted, only archived.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.describe("Writing task manager API (M6-A1)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let editor: TestUser;
  let student: TestUser;
  const ids: string[] = [];
  const uploaded: string[] = [];

  test.beforeAll(async () => {
    [editor, student] = await Promise.all([createTestUser("Wes Editor", "content_editor"), createTestUser("Stu Student")]);
  });

  test.afterAll(async () => {
    const db = adminClient();
    if (ids.length) {
      await db.from("writing_submissions").delete().in("task_id", ids);
      await db.from("writing_tasks").update({ status: "archived" }).in("id", ids);
      await db.from("writing_tasks").delete().in("id", ids);
    }
    if (uploaded.length) await db.storage.from("writing-images").remove(uploaded);
    await Promise.all([deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("an editor builds and publishes a Task 1 Academic task; students read it, can't change it", async () => {
    const db = editor.client;
    const form = WritingTaskForm.parse({
      kind: "t1_academic",
      title: `E2E admin chart ${Date.now()}`,
      prompt: "The chart below shows the percentage of households with internet access in three countries between 2000 and 2020.",
    });
    const created = await db.from("writing_tasks").insert({ ...writingTaskRow(form), created_by: editor.id }).select("id, task_no, test_type, prompt, image_url, image_alt").single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    ids.push(id);

    // No chart: the checklist blocks, and so does the database.
    expect(writingPublishCheck(created.data!).blocking).toHaveLength(1);
    const early = await db.from("writing_tasks").update({ status: "published" }).eq("id", id);
    expect(early.error?.code).toBe("23514");

    // The chart: uploaded to writing-images when Storage runs, else a URL (as the form allows).
    const { url } = localSupabase();
    const storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
    if (!storageUp && process.env.CI) throw new Error("Storage is not running");
    let imageUrl = "https://cdn.example.com/internet-access.png";
    if (storageUp) {
      const path = `${id}/${crypto.randomUUID()}.png`;
      const up = await db.storage.from("writing-images").upload(path, PNG, { contentType: "image/png" });
      expect(up.error).toBeNull();
      uploaded.push(path);
      imageUrl = db.storage.from("writing-images").getPublicUrl(path).data.publicUrl;
      expect((await fetch(imageUrl)).status).toBe(200);
      const byStudent = await student.client.storage.from("writing-images").upload(`${id}/x.png`, PNG, { contentType: "image/png" });
      expect(byStudent.error).not.toBeNull();
      const svg = await db.storage.from("writing-images").upload(`${id}/x.svg`, "<svg/>", { contentType: "image/svg+xml" });
      expect(svg.error).not.toBeNull();
    }
    const withChart = writingTaskRow(WritingTaskForm.parse({ ...form, kind: "t1_academic", image_url: imageUrl, image_alt: "Line graph of internet access" }));
    expect((await db.from("writing_tasks").update(withChart).eq("id", id)).error).toBeNull();
    expect((await db.from("writing_tasks").update({ status: "published" }).eq("id", id)).error).toBeNull();

    // A student sees it, with the description; can't edit or add tasks.
    const seen = await student.client.from("writing_tasks").select("title, image_url, image_alt").eq("id", id).single();
    expect(seen.data).toMatchObject({ image_url: imageUrl, image_alt: "Line graph of internet access" });
    expect((await student.client.from("writing_tasks").update({ title: "Hacked" }).eq("id", id).select("id")).data).toEqual([]);
    expect((await student.client.from("writing_tasks").insert(writingTaskRow(WritingTaskForm.parse({ kind: "t2", title: "Mine", prompt: "x".repeat(30) })))).error?.code).toBe("42501");
  });

  test("a task with answers can't be deleted; it's archived instead", async () => {
    const db = editor.client;
    const created = await db
      .from("writing_tasks")
      .insert({ ...writingTaskRow(WritingTaskForm.parse({ kind: "t2", title: `E2E admin essay ${Date.now()}`, prompt: "Some people think that… Discuss both views." })), status: "published" })
      .select("id")
      .single();
    const id = created.data!.id;
    ids.push(id);
    // A scored answer, as score-writing saves it.
    await adminClient().from("writing_submissions").insert({
      user_id: student.id, task_id: id, input_mode: "typed", text: "My essay.", word_count: 2,
      scores: { ta: 5, cc: 5, lr: 5, gra: 5 }, band: 5, feedback: { detail: "summary", summary: "Short.", corrections_count: 0 },
    });
    expect((await db.from("writing_tasks").update({ status: "draft" }).eq("id", id)).error).toBeNull();
    const del = await db.from("writing_tasks").delete().eq("id", id);
    expect(del.error?.code).toBe("23503"); // the admin panel says: archive it instead
    expect((await db.from("writing_tasks").update({ status: "archived" }).eq("id", id)).error).toBeNull();
    expect((await student.client.from("writing_tasks").select("id").eq("id", id)).data).toEqual([]);
  });
});
