import { test } from "node:test";
import assert from "node:assert/strict";
import { assertStandardBundle } from "./check-standard-bundle.mjs";
import { verifyGoogleRelease } from "./verify-google-release.mjs";

test("standard build check rejects missing output and leaked lazy calendar code", () => {
  assert.throws(() => assertStandardBundle([]), /No built JavaScript/);
  assert.doesNotThrow(() => assertStandardBundle([{ name: "index-test.js", content: 'console.log("tasks")' }]));
  assert.throws(() => assertStandardBundle([{ name: "CalendarRuntime-test.js", content: "" }]), /calendar code/);
  assert.throws(() => assertStandardBundle([{ name: "index-test.js", content: 'invoke("google_sync_now")' }]), /calendar code/);
});

test("public releases require a valid client ID without an additional readiness flag", () => {
  assert.throws(() => verifyGoogleRelease({}), /Desktop OAuth client/);
  assert.throws(() => verifyGoogleRelease({ TODOER_GOOGLE_CLIENT_ID: "placeholder" }), /Desktop OAuth client/);
  const configured = { TODOER_GOOGLE_CLIENT_ID: "123456-test.apps.googleusercontent.com" };
  assert.doesNotThrow(() => verifyGoogleRelease(configured));
});
