import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export function assertStandardBundle(files) {
  if (!files.some(file => file.name.endsWith(".js"))) throw new Error("No built JavaScript found; run npm run build first.");
  for (const file of files) {
    if (/calendar|temporal|rrule/i.test(file.name) || /calendar_open_db|google_account_status|google_connect|google_sync_now|google_sync_before_close|google_cancel_close|google_enable_sync|sync_runs/.test(file.content)) {
      throw new Error(`Standard build contains calendar code: ${file.name}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve("dist/assets");
  const names = (await readdir(root, { recursive: true })).filter(name => /\.(js|css)$/.test(name));
  const files = await Promise.all(names.map(async name => ({ name, content: await readFile(join(root, name), "utf8") })));
  assertStandardBundle(files);
  console.log("Standard bundle excludes calendar and Google sync code.");
}
