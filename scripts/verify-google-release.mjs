import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyGoogleRelease(env) {
  const id = env.TODOER_GOOGLE_CLIENT_ID?.trim() ?? "";
  if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new Error("Configure the production Desktop OAuth client as TODOER_GOOGLE_CLIENT_ID. See docs/google-calendar.md.");
  }
  if (env.TODOER_GOOGLE_RELEASE_READY !== "true") {
    throw new Error("Complete the Google production setup and Windows/macOS/phone checklist in docs/google-calendar.md, then set TODOER_GOOGLE_RELEASE_READY=true.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyGoogleRelease(process.env);
  console.log("Google release configuration and manual verification acknowledgement are present.");
}
