mod capture;

use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

// ── Backend sidecar state ─────────────────────────────────────────────────────

/// Holds the handle to the spawned Python backend process.
/// Wrapped in Mutex<Option<…>> so we can take() it cleanly on app exit.
struct BackendProcess(Mutex<Option<CommandChild>>);

// ── Tauri commands ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ScreenshotResult {
    pub image: String,
    pub width: u32,
    pub height: u32,
    pub is_duplicate: bool,
}

#[tauri::command]
fn toggle_dashboard(app: AppHandle) {
    if let Some(win) = app.get_webview_window("dashboard") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

#[tauri::command]
fn toggle_panel(app: AppHandle) {
    if let Some(win) = app.get_webview_window("panel") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

#[tauri::command]
fn resize_panel(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("panel") {
        win.set_size(LogicalSize::new(width.max(280), height.max(320)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_indicator_clickthrough(app: AppHandle, ignore: bool) {
    if let Some(win) = app.get_webview_window("indicator") {
        let _ = win.set_ignore_cursor_events(ignore);
    }
}

#[tauri::command]
fn get_backend_url() -> String {
    "http://127.0.0.1:18321".to_string()
}

#[tauri::command]
fn capture_screen() -> Result<ScreenshotResult, String> {
    let result = capture::capture_primary_screen()?;
    Ok(ScreenshotResult {
        image: result.image_base64,
        width: result.width,
        height: result.height,
        is_duplicate: result.is_duplicate,
    })
}

#[tauri::command]
fn capture_screen_region(x: i32, y: i32, w: u32, h: u32) -> Result<ScreenshotResult, String> {
    let result = capture::capture_region(x, y, w, h)?;
    Ok(ScreenshotResult {
        image: result.image_base64,
        width: result.width,
        height: result.height,
        is_duplicate: result.is_duplicate,
    })
}

// ── Tray ──────────────────────────────────────────────────────────────────────

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_dashboard =
        MenuItem::with_id(app, "dashboard", "Открыть панель", true, None::<&str>)?;
    let show_panel =
        MenuItem::with_id(app, "panel", "Показать оверлей", true, None::<&str>)?;
    let pause_resume =
        MenuItem::with_id(app, "pause", "Пауза / возобновить", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_dashboard, &show_panel, &pause_resume, &quit],
    )?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("SmartOverlay AI")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "dashboard" => {
                if let Some(win) = app.get_webview_window("dashboard") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "panel" => {
                if let Some(win) = app.get_webview_window("panel") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "pause" => {
                let _ = app.emit("toggle-pause", ());
            }
            "quit" => {
                kill_backend_and_exit(app);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

// ── Shortcuts ─────────────────────────────────────────────────────────────────

fn register<F>(app: &AppHandle, shortcut: Shortcut, handler: F)
where
    F: Fn(&AppHandle, &Shortcut, ShortcutState) + Send + Sync + 'static,
{
    let gs = app.global_shortcut();
    if let Err(e) = gs.on_shortcut(shortcut.clone(), move |app, sc, event| {
        handler(app, sc, event.state());
    }) {
        eprintln!("[SmartOverlay] Не удалось зарегистрировать {:?}: {e}", shortcut);
    }
}

fn setup_shortcuts(app: &AppHandle) {
    // Ctrl+Alt+D — показать/скрыть дашборд
    register(
        app,
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyD),
        |app, _sc, state| {
            if state == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("dashboard") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        },
    );

    // Ctrl+Alt+P — пауза / возобновить
    register(
        app,
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP),
        |app, _sc, state| {
            if state == ShortcutState::Pressed {
                let _ = app.emit("toggle-pause", ());
            }
        },
    );

    // Ctrl+Alt+T — показать/скрыть панель-оверлей
    register(
        app,
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT),
        |app, _sc, state| {
            if state == ShortcutState::Pressed {
                toggle_panel_window(app);
            }
        },
    );

    // Ctrl+Shift+T — резервный шорткат для панели (Ctrl+Alt+T может быть занят Windows Terminal)
    register(
        app,
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyT),
        |app, _sc, state| {
            if state == ShortcutState::Pressed {
                toggle_panel_window(app);
            }
        },
    );

    // Ctrl+Alt+Q — полностью закрыть приложение
    register(
        app,
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyQ),
        |app, _sc, state| {
            if state == ShortcutState::Pressed {
                kill_backend_and_exit(app);
            }
        },
    );
}

// ── Window helpers ────────────────────────────────────────────────────────────

fn toggle_panel_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("panel") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    } else {
        eprintln!("[SmartOverlay] panel window not found!");
    }
}

fn kill_backend_and_exit(app: &AppHandle) {
    // 1. Gracefully stop the managed child process
    stop_backend(app);

    // 2. Nuclear option: taskkill by name in case the child handle is gone
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "smartoverlay-backend.exe"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW — no console flash
            .spawn();
    }

    app.exit(0);
}

// ── Backend sidecar lifecycle ─────────────────────────────────────────────────

/// `true`, если на 127.0.0.1:18321 уже что-то слушает (например `uvicorn` из dev.bat).
fn external_backend_listening() -> bool {
    let addr: SocketAddr = "127.0.0.1:18321"
        .parse()
        .expect("127.0.0.1:18321 is a valid socket address");
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(600)).is_ok()
}

fn start_backend(app: &AppHandle) {
    if external_backend_listening() {
        eprintln!(
            "[SmartOverlay] Порт 18321 уже занят — используем внешний backend (не запускаем sidecar)."
        );
        app.manage(BackendProcess(Mutex::new(None)));
        return;
    }

    match app.shell().sidecar("smartoverlay-backend") {
        Ok(cmd) => match cmd.spawn() {
            Ok((mut rx, child)) => {
                eprintln!("[SmartOverlay] Backend запущен");
                app.manage(BackendProcess(Mutex::new(Some(child))));

                // Drain stdout/stderr in a background task so the OS pipe
                // never blocks the backend process.
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                eprintln!(
                                    "[backend] {}",
                                    String::from_utf8_lossy(&line).trim_end()
                                );
                            }
                            CommandEvent::Stderr(line) => {
                                eprintln!(
                                    "[backend-err] {}",
                                    String::from_utf8_lossy(&line).trim_end()
                                );
                            }
                            CommandEvent::Error(e) => {
                                eprintln!("[backend] pipe error: {e}");
                            }
                            CommandEvent::Terminated(status) => {
                                eprintln!(
                                    "[backend] процесс завершился, код: {:?}",
                                    status.code
                                );
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }
            Err(e) => {
                eprintln!("[SmartOverlay] Не удалось запустить backend sidecar: {e}");
                app.manage(BackendProcess(Mutex::new(None)));
            }
        },
        Err(e) => {
            // Normal in dev mode when the sidecar binary hasn't been built yet.
            eprintln!("[SmartOverlay] Sidecar не найден ({e}). Ожидается внешний backend.");
            app.manage(BackendProcess(Mutex::new(None)));
        }
    }
}

fn stop_backend(app: &AppHandle) {
    if let Some(state) = app.try_state::<BackendProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                eprintln!("[SmartOverlay] Останавливаю backend...");
                let _ = child.kill();
            }
        }
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();

            setup_tray(&handle)?;

            setup_shortcuts(&handle);

            // Indicator всегда click-through.
            if let Some(win) = handle.get_webview_window("indicator") {
                let _ = win.set_ignore_cursor_events(true);
            }

            // Dashboard and panel: intercept X-button — hide instead of destroy
            // so that Ctrl+Alt+D / Ctrl+Alt+T can bring them back later.
            for label in ["dashboard", "panel"] {
                if let Some(win) = handle.get_webview_window(label) {
                    let win2 = win.clone();
                    win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win2.hide();
                        }
                    });
                }
            }

            // Launch Python backend as a bundled sidecar process.
            start_backend(&handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_dashboard,
            toggle_panel,
            resize_panel,
            set_indicator_clickthrough,
            get_backend_url,
            capture_screen,
            capture_screen_region,
        ])
        .build(tauri::generate_context!())
        .expect("Ошибка запуска SmartOverlay AI")
        .run(|app, event| {
            // Kill the Python backend whenever the app exits for any reason.
            if let tauri::RunEvent::Exit = event {
                stop_backend(app);
            }
        });
}
