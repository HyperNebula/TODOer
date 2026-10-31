import { create } from "zustand";
import { googleAccountStatus, googleSyncStatus, googleErrorMessage, type GoogleAccount, type GoogleSyncStatus } from "../lib/googleCalendarApi";

interface GoogleSyncStore {
  databaseId: string | null;
  account: GoogleAccount | null;
  status: GoogleSyncStatus | null;
  busy: boolean;
  error: string | null;
  selectDatabase: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  accept: (status: GoogleSyncStatus) => void;
  perform: (operation: () => Promise<GoogleSyncStatus>) => Promise<void>;
}
let generation = 0;
let statusRequest = 0;

export const useGoogleCalendarSyncStore = create<GoogleSyncStore>((set, get) => ({
  databaseId: null, account: null, status: null, busy: false, error: null,
  selectDatabase: async id => {
    ++generation; ++statusRequest;
    set({ databaseId: id, status: null, error: null, busy: false });
    await get().refresh();
  },
  refresh: async () => {
    const current = generation;
    try { const account = await googleAccountStatus(); if (current === generation) set({ account }); }
    catch (error) { if (current === generation) set({ error: googleErrorMessage(error) }); }
    await get().refreshStatus();
  },
  refreshStatus: async () => {
    const id = get().databaseId;
    if (!id) return;
    const request = ++statusRequest;
    try {
      const status = await googleSyncStatus(id);
      if (request === statusRequest && get().databaseId === id) set({ status });
    } catch (error) { if (request === statusRequest && get().databaseId === id) set({ error: googleErrorMessage(error) }); }
  },
  accept: status => {
    if (status.database_id !== get().databaseId) return;
    ++statusRequest;
    set({ status });
  },
  perform: async operation => {
    const current = generation;
    set({ busy: true, error: null });
    try { const status = await operation(); if (current === generation) get().accept(status); }
    catch (error) { if (current === generation) set({ error: googleErrorMessage(error) }); }
    finally { if (current === generation) { set({ busy: false }); await get().refreshStatus(); } }
  },
}));
