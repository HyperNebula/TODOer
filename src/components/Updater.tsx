import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

export function useUpdater() {
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = async (silent: boolean = false) => {
    try {
      setIsChecking(true);
      const update = await check();
      
      if (update) {
        const yes = await ask(`Update to ${update.version} is available!\n\nRelease notes:\n${update.body || 'No release notes'}\n\nDo you want to install it now?`, {
          title: "Update Available",
          kind: "info",
        });
        
        if (yes) {
          let downloaded = 0;
          let contentLength = 0;
          
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case "Started":
                contentLength = event.data.contentLength || 0;
                console.log(`Started downloading ${event.data.contentLength} bytes`);
                break;
              case "Progress":
                downloaded += event.data.chunkLength;
                console.log(`Downloaded ${downloaded} from ${contentLength}`);
                break;
              case "Finished":
                console.log("Download finished");
                break;
            }
          });
          
          await relaunch();
        }
      } else if (!silent) {
        await message("You are on the latest version.", {
          title: "No Updates Available",
          kind: "info",
        });
      }
    } catch (error) {
      console.error(error);
      if (!silent) {
        await message(`Failed to check for updates: ${error}`, {
          title: "Error",
          kind: "error",
        });
      }
    } finally {
      setIsChecking(false);
    }
  };

  return { checkForUpdates, isChecking };
}

export function UpdaterStartupCheck() {
  const { checkForUpdates } = useUpdater();

  useEffect(() => {
    checkForUpdates(true);
  }, []);

  return null;
}
