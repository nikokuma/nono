#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{Builder, generate_context};
use serde::Deserialize;
use serde_json::json;
use dotenv::dotenv;
use std::fs;
use reqwest;
use tauri_plugin_fs::init as init_fs;
use tauri_plugin_dialog::init as init_dialog;
use base64::{engine::general_purpose, Engine as _};
use dirs; // add `dirs = "4"` in your Cargo.toml

#[derive(Deserialize)]
struct ChatMessage {
  role: String,
  content: String,
}

#[tauri::command]
async fn chat(messages: Vec<ChatMessage>) -> Result<String, String> {
  dotenv().ok();
  let api_key = std::env::var("OPENAI_API_KEY")
    .map_err(|_| "Missing OPENAI_API_KEY".to_string())?;
  let client = reqwest::Client::new();
  let body = json!({
    "model": "gpt-4o-mini",
    "messages": messages.iter().map(|m| {
      json!({ "role": m.role, "content": m.content })
    }).collect::<Vec<_>>(),
  });
  let resp = client
    .post("https://api.openai.com/v1/chat/completions")
    .bearer_auth(&api_key)
    .json(&body)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
  let reply = data["choices"][0]["message"]["content"]
    .as_str()
    .unwrap_or("[no content]")
    .to_string();
  Ok(reply)
}

#[tauri::command]
fn launch_apps(paths: Vec<String>) -> Result<(), String> {
  use std::process::Command;

  for p in paths {
    #[cfg(target_os = "macos")]
    {
      // build and spawn in one block so the Command lives long enough
      let mut cmd = Command::new("open");
      cmd.arg(&p);
      cmd.spawn()
         .map_err(|e| format!("Failed to launch {}: {}", p, e))?;
    }

    #[cfg(target_os = "windows")]
    {
      let mut cmd = Command::new("cmd");
      cmd.args(&["/C", "start", "", &p]);
      cmd.spawn()
         .map_err(|e| format!("Failed to launch {}: {}", p, e))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
      let mut cmd = Command::new("xdg-open");
      cmd.arg(&p);
      cmd.spawn()
         .map_err(|e| format!("Failed to launch {}: {}", p, e))?;
    }
  }

  Ok(())
}

fn config_file_path() -> Result<std::path::PathBuf, String> {
  let mut dir = dirs::config_dir()
    .ok_or("couldn’t find user config directory")?;
  dir.push("nono-app"); 
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("app_config.json"))
}

#[tauri::command]
fn load_app_config() -> Result<String, String> {
  let file = config_file_path()?;
  if file.exists() {
    fs::read_to_string(&file).map_err(|e| e.to_string())
  } else {
    Ok("[]".into())
  }
}

#[tauri::command]
fn save_app_config(cfg: String) -> Result<(), String> {
  let file = config_file_path()?;
  fs::write(&file, cfg).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_icon(path: String) -> Result<String, String> {
  let data = fs::read(&path).map_err(|e| e.to_string())?;
  let b64 = general_purpose::STANDARD.encode(data);
  let mime = if path.to_lowercase().ends_with(".png") {
    "image/png"
  } else {
    "image/jpeg"
  };
  Ok(format!("data:{};base64,{}", mime, b64))
}

fn main() {
  Builder::default()
    .plugin(init_fs())
    .plugin(init_dialog())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(
      tauri::generate_handler![
        chat,
        launch_apps,
        load_app_config,
        save_app_config,
        load_icon
      ]
    )
    .run(generate_context!())
    .expect("error while running tauri application");
}
