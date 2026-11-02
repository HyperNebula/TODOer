import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyGoogleRelease(env) {
  const id = env.TODOER_GOOGLE_CLIENT_ID?.trim() ?? "";
  if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new Error("Configure the production Desktop OAuth client as repository secret TODOER_GOOGLE_CLIENT_ID. See docs/google-calendar.md.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyGoogleRelease(process.env);
  console.log("Google production client configuration is present.");
}
