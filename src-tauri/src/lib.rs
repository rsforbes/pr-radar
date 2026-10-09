use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::Manager;

/// GUI apps on macOS do not inherit the shell PATH, so look in common install dirs.
fn gh_path() -> PathBuf {
    for p in ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"] {
        if PathBuf::from(p).exists() {
            return PathBuf::from(p);
        }
    }
    PathBuf::from("gh")
}

/// Run a GraphQL request through the `gh` CLI, reusing its login. `body` is the
/// JSON `{ "query": ..., "variables": ... }`. Returns the raw JSON response.
#[tauri::command]
fn gh_graphql(body: String) -> Result<String, String> {
    let mut child = Command::new(gh_path())
        .args(["api", "graphql", "--input", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run gh: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(body.as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn config_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

/// Returns the stored config JSON, or "" when none exists yet.
#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Result<String, String> {
    let path = config_file(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String> {
    fs::write(config_file(&app)?, json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![gh_graphql, load_config, save_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
