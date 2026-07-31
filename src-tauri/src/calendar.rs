use std::fs;
use std::path::Path;

/// Read a schedule file from disk.
#[tauri::command]
pub fn read_schedule_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write a schedule file to disk using atomic write (write to .tmp then rename).
#[tauri::command]
pub fn write_schedule_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    let parent = p.parent().ok_or("Invalid path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp_path = p.with_extension("tmp");
    fs::write(&temp_path, &contents).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, p).map_err(|e| e.to_string())?;
    Ok(())
}
