import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useCalendarStore } from "../store/calendarStore";
import { instantMs } from "./calendarDate";
import { isTauri } from "./fileApi";

let checkInterval: number | null = null;
let serviceGeneration = 0;
const NOTIFIED_BLOCKS = new Set<string>();

export async function startNotificationService() {
  if (!isTauri()) return;
  const generation = ++serviceGeneration;

  let permissionGranted = await isPermissionGranted();
  if (generation !== serviceGeneration) return;
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }

  if (generation !== serviceGeneration) return;
  if (!permissionGranted) {
    console.warn("Notification permission not granted.");
    return;
  }

  if (checkInterval !== null) {
    clearInterval(checkInterval);
  }

  // Check every minute
  checkInterval = window.setInterval(checkUpcomingTimeblocks, 60000);
  // Also run immediately once
  checkUpcomingTimeblocks();
}

export function stopNotificationService() {
  ++serviceGeneration;
  if (checkInterval !== null) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

function checkUpcomingTimeblocks() {
  const store = useCalendarStore.getState();
  const timeblocks = store.timeblocks;
  const now = new Date();
  
  // We notify if a block starts within the next 5 minutes
  const notifyThresholdMs = 5 * 60 * 1000; 

  for (const block of timeblocks) {
    if (block.completed || block.isDeleted || block.allDay) continue;

    let startTime: Date;
    let endTime: Date;
    try {
      startTime = new Date(instantMs(block.startTime, block.timeZone || store.timeZone));
      endTime = new Date(instantMs(block.endTime, block.timeZone || store.timeZone));
    } catch {
      // A legacy floating event may fall in a skipped local hour; it has no notification instant.
      continue;
    }
    const timeUntilStart = startTime.getTime() - now.getTime();

    // If it's starting in less than 5 minutes, and we haven't notified yet
    if (timeUntilStart > 0 && timeUntilStart <= notifyThresholdMs) {
      const notifyId = `${block.id}-start`;
      if (!NOTIFIED_BLOCKS.has(notifyId)) {
        NOTIFIED_BLOCKS.add(notifyId);
        sendNotification({
          title: "Timeblock Starting Soon",
          body: block.title || "Untitled Timeblock",
        });
      }
    }

    // Optional: Notify when ending
    const timeUntilEnd = endTime.getTime() - now.getTime();
    if (timeUntilEnd > 0 && timeUntilEnd <= notifyThresholdMs) {
      const notifyId = `${block.id}-end`;
      if (!NOTIFIED_BLOCKS.has(notifyId)) {
        NOTIFIED_BLOCKS.add(notifyId);
        sendNotification({
          title: "Timeblock Ending Soon",
          body: block.title || "Untitled Timeblock",
        });
      }
    }
  }
}
