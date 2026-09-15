#!/usr/bin/env python3
# Локальное распознавание речи (offline, русский).
# Основной движок: faster-whisper; при сбое/ошибке — запасной vosk.
# Использование: python3 stt.py <audio_file>
# Поддержан webm/opus/ogg/wav/mp4 (декодирует pyav, ресемплит в 16k моно).
import sys
import os
import json
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, 'whisper-tiny')
VOSK_DIR = os.path.join(BASE, 'vosk-ru')


def transcribe_whisper(path):
    try:
        import faster_whisper
        model = faster_whisper.WhisperModel(MODEL_DIR, device='cpu', compute_type='int8')
        segments, info = model.transcribe(path, language='ru', beam_size=1, vad_filter=True)
        parts = [s.text.strip() for s in segments]
        return ' '.join(p for p in parts if p)
    except Exception as e:
        try:
            print('stt whisper error: %s' % e, file=sys.stderr)
        except Exception:
            pass
        return ''


def transcribe_vosk(path):
    try:
        import vosk
        import av
        if not os.path.isdir(VOSK_DIR):
            try:
                print('stt vosk model missing: %s' % VOSK_DIR, file=sys.stderr)
            except Exception:
                pass
            return ''
        with av.open(path) as c:
            src_sr = c.streams.audio[0].rate or 16000
            frames = []
            for frame in c.decode(audio=0):
                arr = frame.to_ndarray()
                if arr.ndim == 2:
                    arr = arr.mean(axis=0) if arr.shape[0] > 1 else arr[0]
                arr = np.asarray(arr)
                if arr.dtype == np.float32 or arr.dtype == np.float64:
                    arr = (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)
                else:
                    arr = arr.astype(np.int16)
                frames.append(arr)
        if not frames:
            return ''
        x = np.concatenate(frames)
        if src_sr != 16000 and len(x) > 0:
            n = int(len(x) * 16000 / src_sr)
            x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x.astype(np.float64)).astype(np.int16)
        model = vosk.Model(VOSK_DIR)
        rec = vosk.KaldiRecognizer(model, 16000)
        CHUNK = 3200  # 200 мс при 16k
        for i in range(0, len(x), CHUNK):
            rec.AcceptWaveform(x[i:i + CHUNK].tobytes())
        res = json.loads(rec.FinalResult())
        return res.get('text', '').strip()
    except Exception as e:
        try:
            print('stt vosk error: %s' % e, file=sys.stderr)
        except Exception:
            pass
        return ''


def main():
    if len(sys.argv) < 2 or not os.path.exists(sys.argv[1]):
        print('', flush=True)
        return 0
    path = sys.argv[1]
    text = transcribe_whisper(path)
    if not text:
        text = transcribe_vosk(path)
    print(text or '', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())