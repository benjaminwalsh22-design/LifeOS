// Moleskine pages to LifeOS (a Zapier workflow in Benjamin's account).
// The Moleskine app backs each notebook page up to Google Drive as its own PDF
// ("<notebook>_p<page>.pdf"). Each time a file appears or changes there, this lists
// the backup folder, asks LifeOS which pages it wants (only pages inside the
// notebook's page rule, and only ones it has not seen), and hands those over.
// Nothing else leaves Drive. LifeOS promises each page to one run, so runs that
// start together do not send it twice.
import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { z } from "zod";

const sdk = createZapierSdk();

const DRIVE_APP = "GoogleDriveCLIAPI";
const DRIVE = "google_drive_personal";
const HOOK_APP = "WebHookCLIAPI";
const BACKUP_FOLDER = "1sDBN444howf8W2GTmPFuxwufoJsfOmZg"; // "Moleskine Notebooks PDF"
// LifeOS's private way in for pen pages. Treat this address as a password.
const LIFEOS = "__PEN_IN_URL__";
const MAX_PAGES_PER_RUN = 12;

const InputSchema = z.looseObject({});

type DriveFile = { id: string; name: string; md5Checksum?: string; modifiedTime?: string };
type Page = { id: string; name: string; md5: string; modified: string };

async function driveList(q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ q, pageSize: "1000", fields: "nextPageToken,files(id,name,md5Checksum,modifiedTime)" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await sdk.fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), { connection: DRIVE, method: "GET" });
    if (!res.ok) throw new Error("Google Drive returned " + res.status);
    const j = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

export default defineDurable({
  name: "moleskine-pages-to-lifeos",
  inputSchema: InputSchema,
  run: async (ctx, rawInput) => {
    InputSchema.parse(rawInput ?? {});

    const pages = await ctx.step("list-backup-pages", async () => {
      const folders = await driveList(`'${BACKUP_FOLDER}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
      const parents = [BACKUP_FOLDER, ...folders.map((f) => f.id)].slice(0, 40);
      const q = "(" + parents.map((id) => `'${id}' in parents`).join(" or ") + ") and mimeType = 'application/pdf' and trashed = false";
      const files = await driveList(q);
      const list: Page[] = files.map((f) => ({ id: f.id, name: f.name, md5: f.md5Checksum ?? "", modified: f.modifiedTime ?? "" }));
      return list;
    });
    if (!pages.length) return { skipped: true, reason: "no-pages-in-backup-folder" };

    const asked = await ctx.step("ask-lifeos-which-pages", async () =>
      sdk.runAction({
        appKey: HOOK_APP,
        actionType: "write",
        actionKey: "post",
        inputs: { url: LIFEOS, payload_type: "json", data: { manifest: JSON.stringify(pages) }, unflatten: "no", wrap_in_array: "no" },
      }),
    );
    const reply = (asked.data[0] ?? {}) as { want?: unknown; waiting?: unknown; outside_rule?: unknown; have?: unknown; on_the_way?: unknown; more?: unknown };
    const want = Array.isArray(reply.want) ? reply.want.map((x) => String(x)) : [];
    const byId = new Map(pages.map((p) => [p.id, p]));
    const mine = want.map((id) => byId.get(id)).filter((p): p is Page => !!p).slice(0, MAX_PAGES_PER_RUN);

    const results: { name: string; stored: boolean; reason: string }[] = [];
    for (const p of mine) {
      const key = p.id.slice(0, 12).toLowerCase().replace(/[^a-z0-9]/g, "x");
      const found = await ctx.step(`find-page-${key}`, async () =>
        sdk.runAction({
          appKey: DRIVE_APP,
          actionType: "search",
          actionKey: "file_or_folder_by_id",
          connection: DRIVE,
          inputs: { id: p.id },
        }),
      );
      const file = (found.data[0] as { file?: string } | undefined)?.file;
      if (!file) { results.push({ name: p.name, stored: false, reason: "drive-gave-no-file" }); continue; }
      const sent = await ctx.step({
        name: `send-page-${key}`,
        maxAttempts: 3,
        retryDelaySeconds: 20,
        run: async () =>
          sdk.runAction({
            appKey: HOOK_APP,
            actionType: "write",
            actionKey: "post",
            inputs: { url: LIFEOS, payload_type: "form", data: { id: p.id, name: p.name, md5: p.md5, modified: p.modified }, file, unflatten: "no", wrap_in_array: "no" },
          }),
      });
      const r = (sent.data[0] ?? {}) as { stored?: unknown; reason?: unknown };
      results.push({ name: p.name, stored: r.stored === true, reason: typeof r.reason === "string" ? r.reason : "" });
    }

    return {
      listed: pages.length,
      wanted: want.length,
      sent: results.filter((r) => r.stored).length,
      outside_rule: reply.outside_rule ?? null,
      already_have: reply.have ?? null,
      promised_to_another_run: reply.on_the_way ?? null,
      waiting_for_a_rule: reply.waiting ?? [],
      results,
    };
  },
});
