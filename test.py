from faster_whisper import WhisperModel

# Force CPU usage
model = WhisperModel("base", device="cpu")

segments, _ = model.transcribe("test.wav")

for segment in segments:
    print(segment.text)