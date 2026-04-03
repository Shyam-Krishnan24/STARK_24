from flask import Flask, request, jsonify
from faster_whisper import WhisperModel
from flask_cors import CORS
import os
import uuid  # 🔥 IMPORTANT

app = Flask(__name__)
CORS(app)

print("⏳ Loading Whisper model...")
model = WhisperModel("base", device="cpu")
print("✅ Model loaded")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    try:
        print("🔥 Request received")

        if "audio" not in request.files:
            return jsonify({"error": "No audio file received"})

        file = request.files["audio"]

        # 🔥 UNIQUE FILE NAME
        file_id = str(uuid.uuid4())
        file_path = f"temp_{file_id}.wav"

        file.save(file_path)
        print(f"📁 File saved: {file_path}")

        segments, _ = model.transcribe(file_path)

        text = ""
        for segment in segments:
            text += segment.text + " "

        print("🧠 Transcribed:", text)

        # 🔥 SAFE DELETE
        if os.path.exists(file_path):
            os.remove(file_path)

        return jsonify({"text": text})

    except Exception as e:
        print("❌ Error:", str(e))
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)