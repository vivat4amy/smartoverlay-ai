use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::sync::Mutex;
use xcap::Monitor;

static LAST_HASH: Mutex<Option<String>> = Mutex::new(None);

pub struct CaptureResult {
    pub image_base64: String,
    pub width: u32,
    pub height: u32,
    pub is_duplicate: bool,
}

fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

pub fn capture_primary_screen() -> Result<CaptureResult, String> {
    let monitors = Monitor::all().map_err(|e| format!("Не удалось получить мониторы: {e}"))?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or("Монитор не найден")?;

    let img = monitor
        .capture_image()
        .map_err(|e| format!("Ошибка захвата экрана: {e}"))?;

    let width = img.width();
    let height = img.height();

    let mut png_buf = Cursor::new(Vec::new());
    img.write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("Ошибка кодирования PNG: {e}"))?;
    let png_bytes = png_buf.into_inner();

    let hash = compute_hash(&png_bytes);

    let is_duplicate = {
        let mut last = LAST_HASH.lock().unwrap();
        let dup = last.as_ref() == Some(&hash);
        *last = Some(hash);
        dup
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    Ok(CaptureResult {
        image_base64: b64,
        width,
        height,
        is_duplicate,
    })
}

pub fn capture_region(x: i32, y: i32, w: u32, h: u32) -> Result<CaptureResult, String> {
    let monitors = Monitor::all().map_err(|e| format!("Не удалось получить мониторы: {e}"))?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or("Монитор не найден")?;

    let full_img = monitor
        .capture_image()
        .map_err(|e| format!("Ошибка захвата экрана: {e}"))?;

    let x = x.max(0) as u32;
    let y = y.max(0) as u32;
    let w = w.min(full_img.width().saturating_sub(x));
    let h = h.min(full_img.height().saturating_sub(y));

    let cropped = image::imageops::crop_imm(&full_img, x, y, w, h).to_image();

    let mut png_buf = Cursor::new(Vec::new());
    cropped
        .write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("Ошибка кодирования PNG: {e}"))?;
    let png_bytes = png_buf.into_inner();

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    Ok(CaptureResult {
        image_base64: b64,
        width: w,
        height: h,
        is_duplicate: false,
    })
}
