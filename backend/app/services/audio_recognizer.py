"""
Захват системного аудио (WASAPI Stereo Mix) + распознавание через AudD API.
Не требует компилируемых зависимостей — только sounddevice, numpy, aiohttp.
"""

import asyncio
import io
import wave
import logging

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
CHANNELS = 2
DURATION_SEC = 8.0

# Ключевые слова в названии устройства = захват системного аудио
_LOOPBACK_KEYWORDS = [
    "loopback",
    "stereo mix",       # English
    "стерео микшер",    # Russian Windows
    "what u hear",      # Some Realtek/Creative
    "cable output",     # VB-Audio Virtual Cable
    "virtual cable",
    "mix what",
    "sum",
]


def _is_loopback(name: str) -> bool:
    n = name.lower()
    return any(kw in n for kw in _LOOPBACK_KEYWORDS)


# ── Поиск устройства захвата ──────────────────────────────────────────────────

def _find_wasapi_loopback() -> tuple[int, int] | tuple[None, None]:
    """
    Ищет loopback-устройство через pyaudiowpatch (предпочтительно — умеет
    захватывать с любого устройства вывода включая USB/Bluetooth).
    Fallback: sounddevice WASAPI Stereo Mix.
    """
    # ── pyaudiowpatch (предпочтительный путь) ────────────────────────────────
    try:
        import pyaudiowpatch as pyaudio  # type: ignore

        p = pyaudio.PyAudio()
        try:
            wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
            default_out_idx = wasapi_info.get("defaultOutputDevice", -1)
            default_out = p.get_device_info_by_index(default_out_idx) if default_out_idx >= 0 else None
            default_name = (default_out or {}).get("name", "")

            candidates: list[tuple[int, int, str]] = []
            for i in range(p.get_device_count()):
                d = p.get_device_info_by_index(i)
                if not d.get("isLoopbackDevice"):
                    continue
                sr = int(d.get("defaultSampleRate", SAMPLE_RATE))
                name = d.get("name", "")
                candidates.append((i, sr, name))

            if not candidates:
                logger.warning("[AudioRec] pyaudiowpatch: loopback-устройства не найдены")
            else:
                # Приоритет: loopback дефолтного устройства вывода (наушники)
                def _prio(c: tuple[int, int, str]) -> int:
                    name = c[2]
                    if default_name and default_name.lower() in name.lower():
                        return 0
                    if "cable" not in name.lower() and "virtual" not in name.lower():
                        return 1
                    return 2

                candidates.sort(key=_prio)
                idx, sr, name = candidates[0]
                logger.info(f"[AudioRec] pyaudiowpatch loopback: [{idx}] {name} @ {sr}Hz")
                return idx, sr
        finally:
            p.terminate()

    except Exception as e:
        logger.debug(f"[AudioRec] pyaudiowpatch недоступен: {e}")

    # ── Fallback: sounddevice WASAPI Stereo Mix ───────────────────────────────
    try:
        import sounddevice as sd  # type: ignore

        hostapis = sd.query_hostapis()
        devices = sd.query_devices()
        if not isinstance(devices, list):
            devices = list(devices)

        wasapi_idx: int | None = None
        for i, h in enumerate(hostapis):
            if "wasapi" in h.get("name", "").lower():
                wasapi_idx = i
                break

        if wasapi_idx is not None:
            for i, d in enumerate(devices):
                if (
                    d.get("hostapi") == wasapi_idx
                    and d.get("max_input_channels", 0) > 0
                    and _is_loopback(d.get("name", ""))
                ):
                    sr = int(d.get("default_samplerate", SAMPLE_RATE))
                    logger.info(f"[AudioRec] sounddevice loopback: [{i}] {d['name']} @ {sr}Hz")
                    return i, sr

    except Exception as e:
        logger.error(f"[AudioRec] sounddevice fallback error: {e}")

    logger.warning("[AudioRec] Loopback-устройство не найдено")
    return None, None


def _list_audio_devices() -> list[dict]:
    """Список всех аудиоустройств для диагностики."""
    try:
        import sounddevice as sd  # type: ignore
        devices = sd.query_devices()
        hostapis = sd.query_hostapis()
        if not isinstance(devices, list):
            devices = list(devices)
        result = []
        for i, d in enumerate(devices):
            ha_name = hostapis[d.get("hostapi", 0)].get("name", "?")
            result.append({
                "index": i,
                "name": d.get("name", ""),
                "hostapi": ha_name,
                "in_ch": d.get("max_input_channels", 0),
                "out_ch": d.get("max_output_channels", 0),
                "samplerate": int(d.get("default_samplerate", 44100)),
                "is_loopback": _is_loopback(d.get("name", "")),
            })
        return result
    except Exception as e:
        return [{"error": str(e)}]


# ── Запись аудио ──────────────────────────────────────────────────────────────

def _record_blocking(device_idx: int, samplerate: int, duration: float):
    import numpy as np

    # ── pyaudiowpatch ─────────────────────────────────────────────────────────
    try:
        import pyaudiowpatch as pyaudio  # type: ignore

        p = pyaudio.PyAudio()
        try:
            d_info = p.get_device_info_by_index(device_idx)
            channels = min(int(d_info.get("maxInputChannels", 2)), 2) or 2
            chunk = 1024
            frames_total = int(samplerate * duration)
            stream = p.open(
                format=pyaudio.paFloat32,
                channels=channels,
                rate=samplerate,
                input=True,
                input_device_index=device_idx,
                frames_per_buffer=chunk,
            )
            buf: list[bytes] = []
            collected = 0
            while collected < frames_total:
                data = stream.read(min(chunk, frames_total - collected), exception_on_overflow=False)
                buf.append(data)
                collected += chunk
            stream.stop_stream()
            stream.close()
            raw = b"".join(buf)
            audio = np.frombuffer(raw, dtype=np.float32).reshape(-1, channels)
            rms = float(np.sqrt(np.mean(audio ** 2)))
            logger.info(f"[AudioRec] pyaudiowpatch: {len(audio)} frames, RMS={rms:.5f}")
            if rms < 1e-6:
                logger.warning("[AudioRec] Полная тишина — музыка не играет?")
            return audio
        finally:
            p.terminate()

    except Exception as e:
        logger.debug(f"[AudioRec] pyaudiowpatch запись не удалась: {e}, пробую sounddevice")

    # ── Fallback: sounddevice ─────────────────────────────────────────────────
    try:
        import sounddevice as sd  # type: ignore

        frames = int(samplerate * duration)
        audio = sd.rec(
            frames,
            samplerate=samplerate,
            channels=CHANNELS,
            device=device_idx,
            dtype="float32",
            blocking=True,
        )
        rms = float(np.sqrt(np.mean(audio ** 2)))
        logger.info(f"[AudioRec] sounddevice: {frames} frames, RMS={rms:.5f}")
        if rms < 1e-6:
            logger.warning("[AudioRec] Полная тишина — музыка не играет?")
        return audio
    except Exception as e:
        logger.error(f"[AudioRec] Ошибка записи: {e}")
        return None


def _audio_to_wav(audio, samplerate: int) -> bytes:
    """WAV PCM16: mono (N,1) или стерео (N,2)."""
    import numpy as np

    a = np.asarray(audio, dtype=np.float32)
    if a.ndim == 1:
        a = a[:, np.newaxis]
    nch = int(a.shape[1])
    nch = min(max(nch, 1), 2)
    a = a[:, :nch]
    audio_int16 = (a * 32767.0).clip(-32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(nch)
        wf.setsampwidth(2)
        wf.setframerate(samplerate)
        wf.writeframes(audio_int16.tobytes())
    return buf.getvalue()


def _stereo_to_mono_boost(audio, target_rms: float = 0.12, max_gain: float = 8.0):
    """Стерео → моно + мягкая нормализация громкости (типичный трек тише «системного» микса)."""
    import numpy as np

    x = np.asarray(audio, dtype=np.float32)
    if x.ndim == 1:
        m = x[:, np.newaxis]
    elif x.shape[1] >= 2:
        m = np.mean(x.astype(np.float64), axis=1, keepdims=True).astype(np.float32)
    else:
        m = x
    rms = float(np.sqrt(np.mean(m ** 2)))
    if rms > 1e-7:
        g = min(max_gain, target_rms / rms)
        m = np.clip(m * g, -1.0, 1.0)
    return m


async def capture_system_audio(duration_sec: float = DURATION_SEC) -> bytes | None:
    """Захватывает системное аудио. Возвращает WAV bytes или None."""
    device_idx, samplerate = _find_wasapi_loopback()
    if device_idx is None:
        return None

    loop = asyncio.get_event_loop()
    audio = await loop.run_in_executor(
        None, _record_blocking, device_idx, samplerate, duration_sec
    )
    if audio is None:
        return None

    return _audio_to_wav(audio, samplerate)


async def capture_system_audio_with_rms(
    duration_sec: float = DURATION_SEC,
    *,
    audd_friendly: bool = False,
) -> tuple[bytes | None, float, str | None]:
    """Захват + RMS + причина если не получилось.
    Возвращает (wav_bytes, rms, error_reason).

    audd_friendly: моно + нормализация громкости перед WAV — обычно лучше для AudD, чем сырой стерео loopback.
    """
    device_idx, samplerate = _find_wasapi_loopback()
    if device_idx is None:
        return None, 0.0, "no_loopback_device"

    loop = asyncio.get_event_loop()
    audio = await loop.run_in_executor(
        None, _record_blocking, device_idx, samplerate, duration_sec
    )
    if audio is None:
        return None, 0.0, "record_failed"

    try:
        import numpy as np
        rms_gate = float(np.sqrt(np.mean(audio ** 2)))
    except Exception:
        rms_gate = 0.0

    if audd_friendly:
        try:
            mono = _stereo_to_mono_boost(audio)
            return _audio_to_wav(mono, samplerate), rms_gate, None
        except Exception as e:
            logger.warning(f"[AudioRec] audd_friendly preprocess failed: {e}, fallback stereo")

    return _audio_to_wav(audio, samplerate), rms_gate, None


# ── AudD распознавание ────────────────────────────────────────────────────────

async def _recognize_audd(audio_bytes: bytes, api_token: str = "") -> dict | None:
    """
    Отправляет WAV в AudD API (https://audd.io).
    Без токена: ~10 запросов/день. С бесплатным токеном: 500/месяц.
    """
    try:
        import aiohttp  # type: ignore

        form = aiohttp.FormData()
        form.add_field(
            "file", audio_bytes,
            filename="audio.wav",
            content_type="audio/wav",
        )
        if api_token:
            form.add_field("api_token", api_token)
        # Больше метаданных + лучше сопоставление каталога у AudD
        form.add_field("return", "apple_music,spotify,deezer")

        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post("https://api.audd.io/", data=form) as resp:
                data = await resp.json(content_type=None)

        status = data.get("status")
        if status == "success":
            result = data.get("result")
            if not result:
                return None  # No match

            # Extract cover from Spotify / Deezer if available
            cover = ""
            sp = result.get("spotify") or {}
            album_images = (sp.get("album") or {}).get("images") or []
            if album_images:
                cover = album_images[0].get("url", "")
            if not cover:
                dz = result.get("deezer") or {}
                if isinstance(dz, dict):
                    al = dz.get("album") or {}
                    if isinstance(al, dict) and al.get("cover"):
                        cover = str(al.get("cover", ""))

            return {
                "artist": result.get("artist", ""),
                "title": result.get("title", ""),
                "album": result.get("album", ""),
                "cover_url": cover,
                "song_link": result.get("song_link", ""),
                "platform": "audd",
            }
        elif status == "error":
            err = data.get("error", {})
            code = err.get("error_code", 0)
            if code == 901:
                return {"error": "Лимит AudD исчерпан. Зарегистрируй бесплатный ключ на audd.io"}
            logger.warning(f"[AudioRec] AudD error: {err}")
            return None
        else:
            logger.warning(f"[AudioRec] AudD unexpected response: {data}")
            return None

    except Exception as e:
        logger.error(f"[AudioRec] AudD exception: {e}")
        return {"error": f"Ошибка запроса к AudD: {e}"}


async def recognize_music(audio_bytes: bytes, api_token: str = "") -> dict | None:
    """Распознаёт музыку из WAV bytes. Использует AudD API."""
    return await _recognize_audd(audio_bytes, api_token=api_token)


# ── Полный цикл ───────────────────────────────────────────────────────────────

async def identify_current_music(duration_sec: float = DURATION_SEC, api_token: str = "") -> dict:
    """Захватывает системное аудио и распознаёт трек. Возвращает dict с результатом."""
    try:
        import sounddevice  # noqa: F401
    except ImportError:
        return {"error": "sounddevice не установлен. Запустите: pip install sounddevice"}

    try:
        import numpy  # noqa: F401
    except ImportError:
        return {"error": "numpy не установлен. Запустите: pip install numpy"}

    audio_bytes = await capture_system_audio(duration_sec)
    if audio_bytes is None:
        devices = _list_audio_devices()
        wasapi_ok = any(
            "wasapi" in d.get("hostapi", "").lower() and d.get("is_loopback")
            for d in devices
        )
        if not wasapi_ok:
            return {
                "error": "Stereo Mix не найден. Параметры → Звук → "
                         "Дополнительные параметры звука → Запись → ПКМ → "
                         "Показать отключённые → включи Стерео микшер."
            }
        return {"error": "Не удалось захватить аудио. Убедись что музыка играет."}

    result = await recognize_music(audio_bytes, api_token=api_token)
    if result is None:
        return {"error": "Музыка не распознана — попробуй ещё раз."}

    return result
