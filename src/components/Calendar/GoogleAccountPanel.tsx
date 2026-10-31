import { useEffect, useState } from "react";
import { googleAccountStatus, googleConnect, googleCancelConnect, googleDisconnect, googleErrorMessage, type GoogleAccount } from "../../lib/googleCalendarApi";
import { isTauri } from "../../lib/fileApi";

export function GoogleAccountPanel({ onChange }: { onChange?: () => void }) {
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (isTauri()) void googleAccountStatus().then(value => { if (active) setAccount(value); }).catch(error => { if (active) setError(googleErrorMessage(error)); });
    return () => { active = false; };
  }, []);
  async function run(action: () => Promise<unknown>) {
    try { setBusy(true); setError(""); await action(); setAccount(await googleAccountStatus()); }
    catch (error) { setError(googleErrorMessage(error)); }
    finally { setBusy(false); onChange?.(); }
  }
  if (!isTauri()) return <p>Google Calendar connection is available in the desktop app.</p>;
  return <div>
    <p>{account?.email || "Connect Google Calendar to TODOer."}</p>
    {account && !account.configured && <p>This build needs a Google desktop OAuth client. See the developer setup guide.</p>}
    {error && <p role="alert">{error}</p>}
    <button className="btn" disabled={busy || !account?.configured} onClick={() => void run(account?.connected ? googleDisconnect : googleConnect)}>{account?.connected ? "Disconnect account" : "Connect Google"}</button>
    {account?.connected && <button className="btn" disabled={busy} onClick={() => void run(googleConnect)}>Reconnect Google</button>}
    {busy && !account?.connected && <button className="btn" onClick={() => void googleCancelConnect()}>Cancel sign-in</button>}
  </div>;
}
