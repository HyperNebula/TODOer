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

test("public releases need a client and explicit manual verification", () => {
  assert.throws(() => verifyGoogleRelease({}), /Desktop OAuth client/);
  assert.throws(() => verifyGoogleRelease({ TODOER_GOOGLE_CLIENT_ID: "placeholder", TODOER_GOOGLE_RELEASE_READY: "true" }), /Desktop OAuth client/);
  const configured = { TODOER_GOOGLE_CLIENT_ID: "123456-test.apps.googleusercontent.com" };
  assert.throws(() => verifyGoogleRelease(configured), /checklist/);
  assert.doesNotThrow(() => verifyGoogleRelease({ ...configured, TODOER_GOOGLE_RELEASE_READY: "true" }));
});
