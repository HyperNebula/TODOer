use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use std::fs;
use std::path::Path;

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
fn write_tasklist_file(path: String, contents: String) -> Result<(), String> {
    atomic_write(Path::new(&path), &contents)
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
    let temp_file = temp_dir.join(format!("todolist-print-{}.html", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    fs::write(&temp_file, contents).map_err(|e| e.to_string())?;
    Ok(temp_file.to_string_lossy().to_string())
}

#[tauri::command]
fn write_temp_pdf(contents: Vec<u8>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("todolist-print-{}.pdf", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    fs::write(&temp_file, contents).map_err(|e| e.to_string())?;
    Ok(temp_file.to_string_lossy().to_string())
}

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let new_list = MenuItem::with_id(app, "new_list", "New List", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let save = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(app, "save_as", "Save As…", true, None::<&str>)?;
    let export_csv = MenuItem::with_id(app, "export_csv", "Export CSV…", true, None::<&str>)?;
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

    let open_settings = MenuItem::with_id(app, "open_settings", "Open Settings", true, Some("CmdOrCtrl+,"))?;
    let settings_menu = Submenu::with_items(
        app,
        "Settings",
        true,
        &[&open_settings],
    )?;

    Menu::with_items(app, &[&file_menu, &task_menu, &settings_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        })
        .invoke_handler(tauri::generate_handler![
            read_tasklist_file,
            write_tasklist_file,
            write_csv_file,
            open_path,
            get_tasklists_dir,
            get_last_file_path,
            set_last_file_path,
            write_temp_html,
            write_temp_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
