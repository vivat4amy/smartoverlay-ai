"""
Быстрый тест аудио-распознавания.
Запуск: venv/Scripts/python test_audio.py
"""
import asyncio
import sys

def test_devices():
    print("\n=== Аудиоустройства ===")
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        hostapis = sd.query_hostapis()
        if not isinstance(devices, list):
            devices = list(devices)

        wasapi_idx = None
        for i, h in enumerate(hostapis):
            if "wasapi" in h.get("name", "").lower():
                wasapi_idx = i
                print(f"WASAPI host API: [{i}] {h['name']}")
                break

        if wasapi_idx is None:
            print("WASAPI не найден!")
            return False

        from app.services.audio_recognizer import _is_loopback

        print("\nВсе WASAPI input устройства:")
        loopback_found = False
        for i, d in enumerate(devices):
            if d.get("hostapi") == wasapi_idx and d.get("max_input_channels", 0) > 0:
                is_lb = _is_loopback(d.get("name", ""))
                mark = " <<< БУДЕТ ИСПОЛЬЗОВАН" if is_lb else ""
                print(f"  [{i}] {d['name']} (in={d['max_input_channels']}, sr={int(d.get('default_samplerate',0))}){mark}")
                if is_lb:
                    loopback_found = True

        if not loopback_found:
            print("\n⚠  Stereo Mix не найден.")
            print("   Параметры → Звук → Дополнительные параметры звука")
            print("   → Запись → ПКМ → 'Показать отключённые' → включи 'Стерео микшер'")
        else:
            print("\n✓ Устройство захвата системного аудио найдено!")
        return loopback_found
    except ImportError:
        print("sounddevice не установлен!")
        return False
    except Exception as e:
        print(f"Ошибка: {e}")
        return False


async def test_recognition():
    print("\n=== Тест распознавания (8 сек) ===")
    print("Убедись что сейчас играет музыка...")
    input("Нажми Enter чтобы начать запись...")

    from app.services.audio_recognizer import identify_current_music
    result = await identify_current_music(8.0)

    print(f"\nРезультат: {result}")
    if result.get("error"):
        print(f"❌ Ошибка: {result['error']}")
    else:
        print(f"✓ Найдено: {result.get('artist')} — {result.get('title')}")
        if result.get("album"):
            print(f"  Альбом: {result['album']}")
        if result.get("cover_url"):
            print(f"  Обложка: {result['cover_url'][:60]}...")


if __name__ == "__main__":
    ok = test_devices()
    if ok or "--force" in sys.argv:
        asyncio.run(test_recognition())
    else:
        print("\nПропускаю тест распознавания (нет loopback). Добавь --force чтобы попробовать всё равно.")
