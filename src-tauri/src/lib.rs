use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use std::fs;
use std::path::Path;

#[cfg(feature = "calendar")]
mod calendar;

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, contents).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_tasklist_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_tasklist_file(app: tauri::AppHandle, path: String, contents: String, max_backups: usize) -> Result<(), String> {
    let target_path = Path::new(&path);
    if target_path.exists() {
        if let Ok(docs) = app.path().document_dir() {
            let backups_dir = docs.join("TaskLists").join("backups");
            let _ = fs::create_dir_all(&backups_dir);
            
            if target_path.file_name().is_some() {
                let extension = target_path.extension().and_then(|e| e.to_str()).unwrap_or("json");
                let stem = target_path.file_stem().and_then(|s| s.to_str()).unwrap_or("list");
                
                let mut existing_backups = Vec::new();
                if let Ok(entries) = fs::read_dir(&backups_dir) {
                    for entry in entries.flatten() {
                        if let Ok(meta) = entry.metadata() {
                            if let Some(name) = entry.file_name().to_str() {
                                if name.starts_with(&format!("{}_", stem)) && name.ends_with(extension) {
                                    if let Ok(modified) = meta.modified() {
                                        existing_backups.push((entry.path(), modified));
                                    }
                                }
                            }
                        }
                    }
                }
                
                existing_backups.sort_by(|a, b| b.1.cmp(&a.1));
                
                let mut should_backup = true;
                if let Some((_, last_modified)) = existing_backups.first() {
                    if let Ok(elapsed) = last_modified.elapsed() {
                        if elapsed.as_secs() < 3600 {
                            should_backup = false;
                        }
                    }
                }
                
                if should_backup && max_backups > 0 {
                    let now = chrono::Local::now();
                    let timestamp = now.format("%Y-%m-%d_%H-%M-%S").to_string();
                    let backup_filename = format!("{}_{}.{}", stem, timestamp, extension);
                    let backup_path = backups_dir.join(backup_filename);
                    if fs::copy(target_path, &backup_path).is_ok() {
                        existing_backups.insert(0, (backup_path, std::time::SystemTime::now()));
                    }
                }
                
                if max_backups > 0 {
                    while existing_backups.len() > max_backups {
                        if let Some((path, _)) = existing_backups.pop() {
                            let _ = fs::remove_file(path);
                        }
                    }
                } else if max_backups == 0 {
                    for (path, _) in existing_backups {
                        let _ = fs::remove_file(path);
                    }
                }
            }
        }
    }
    atomic_write(target_path, &contents)
}

#[tauri::command]
fn write_csv_file(path: String, contents: String) -> Result<(), String> {
    atomic_write(Path::new(&path), &contents)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_tasklists_dir(app: tauri::AppHandle) -> Result<String, String> {
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let tasklists = docs.join("TaskLists");
    let _ = fs::create_dir_all(&tasklists);
    Ok(tasklists.to_string_lossy().to_string())
}

#[tauri::command]
fn get_last_file_path(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let last_file = data_dir.join("last_file.txt");
    fs::read_to_string(last_file).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_last_file_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let last_file = data_dir.join("last_file.txt");
    fs::write(last_file, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_temp_html(contents: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("todoer-print-{}.html", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    fs::write(&temp_file, contents).map_err(|e| e.to_string())?;
    Ok(temp_file.to_string_lossy().to_string())
}

#[tauri::command]
fn write_temp_pdf(contents: Vec<u8>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("todoer-print-{}.pdf", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    fs::write(&temp_file, contents).map_err(|e| e.to_string())?;
    Ok(temp_file.to_string_lossy().to_string())
}

#[tauri::command]
fn append_to_archive(app: tauri::AppHandle, data: String, format: String) -> Result<(), String> {
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    if format == "csv" {
        let archive_path = data_dir.join("global_archive.csv");
        let mut existing = if archive_path.exists() {
            fs::read_to_string(&archive_path).unwrap_or_default()
        } else {
            String::new()
        };
        
        if existing.is_empty() {
            existing = data;
        } else {
            if let Some(idx) = data.find('\n') {
                if data.len() > idx + 1 {
                    if !existing.ends_with('\n') {
                        existing.push('\n');
                    }
                    existing.push_str(&data[idx + 1..]);
                }
            } else {
                if !existing.ends_with('\n') {
                    existing.push('\n');
                }
                existing.push_str(&data);
            }
        }
        atomic_write(&archive_path, &existing)
    } else {
        let archive_path = data_dir.join("global_archive.json");
        let new_tasks: serde_json::Value =
            serde_json::from_str(&data).map_err(|e| e.to_string())?;
        let new_arr = new_tasks
            .as_array()
            .ok_or("data must be a JSON array")?;

        let mut existing: Vec<serde_json::Value> = if archive_path.exists() {
            let raw = fs::read_to_string(&archive_path).map_err(|e| e.to_string())?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            Vec::new()
        };

        existing.extend_from_slice(new_arr);

        let merged = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
        atomic_write(&archive_path, &merged)
    }
}

#[tauri::command]
fn read_archive(app: tauri::AppHandle, format: String) -> Result<String, String> {
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let file_name = if format == "csv" { "global_archive.csv" } else { "global_archive.json" };
    let archive_path = data_dir.join(file_name);
    if !archive_path.exists() {
        return Ok(if format == "csv" { String::new() } else { "[]".to_string() });
    }
    fs::read_to_string(archive_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_archive_path(app: tauri::AppHandle, format: String) -> Result<String, String> {
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let file_name = if format == "csv" { "global_archive.csv" } else { "global_archive.json" };
    let archive_path = data_dir.join(file_name);
    Ok(archive_path.to_string_lossy().to_string())
}

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let new_list = MenuItem::with_id(app, "new_list", "New List", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let save = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(app, "save_as", "Save As…", true, None::<&str>)?;
    let export_csv = MenuItem::with_id(app, "export_csv", "Export CSV…", true, None::<&str>)?;
    let export_taskpaper = MenuItem::with_id(app, "export_taskpaper", "Export Taskpaper…", true, None::<&str>)?;
    let import_csv = MenuItem::with_id(app, "import_csv", "Import CSV…", true, None::<&str>)?;
    let print = MenuItem::with_id(app, "print", "Print…", true, None::<&str>)?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_list,
            &open,
            &PredefinedMenuItem::separator(app)?,
            &save,
            &save_as,
            &PredefinedMenuItem::separator(app)?,
            &export_csv,
            &export_taskpaper,
            &import_csv,
            &print,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let new_task = MenuItem::with_id(app, "new_task", "New Task", true, Some("CmdOrCtrl+N"))?;
    let new_subtask = MenuItem::with_id(
        app,
        "new_subtask",
        "New Sub-task",
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?;
    let delete_task = MenuItem::with_id(app, "delete_task", "Delete Task", true, None::<&str>)?;
    let archive = MenuItem::with_id(
        app,
        "archive_completed",
        "Archive Completed",
        true,
        None::<&str>,
    )?;

    let task_menu = Submenu::with_items(
        app,
        "Task",
        true,
        &[&new_task, &new_subtask, &delete_task, &archive],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let open_settings = MenuItem::with_id(app, "open_settings", "Open Settings", true, Some("CmdOrCtrl+,"))?;
    let settings_menu = Submenu::with_items(
        app,
        "Settings",
        true,
        &[&open_settings],
    )?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &task_menu, &settings_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = build_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        });

    #[cfg(not(feature = "calendar"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        read_tasklist_file,
        write_tasklist_file,
        write_csv_file,
        open_path,
        get_tasklists_dir,
        get_last_file_path,
        set_last_file_path,
        write_temp_html,
        write_temp_pdf,
        append_to_archive,
        read_archive,
        get_archive_path
    ]);

    #[cfg(feature = "calendar")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        read_tasklist_file,
        write_tasklist_file,
        write_csv_file,
        open_path,
        get_tasklists_dir,
        get_last_file_path,
        set_last_file_path,
        write_temp_html,
        write_temp_pdf,
        append_to_archive,
        read_archive,
        get_archive_path,
        calendar::read_schedule_file,
        calendar::write_schedule_file
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
