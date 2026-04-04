import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
import sqlite3
import json

app = FastAPI(title="LearnFlow AI Backend")

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────
GROQ_API_KEY = "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"

# Groq SDK client
_groq_client = Groq(api_key=GROQ_API_KEY)

# youtube-transcript-api v1.x requires an instance
_yt_api = YouTubeTranscriptApi()


# ── Models ────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    prompt: str
    system_instruction: str = (
        "You are LearnFlow AI, an expert educational assessment engine."
    )

class TranslateRequest(BaseModel):
    text: str
    target_language: str

class SaveTranscriptRequest(BaseModel):
    video_id: str
    language: str
    segments: list
    plain_text: str

# ── Database ──────────────────────────────────────────────────
DB_PATH = "transcripts.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcripts (
            video_id TEXT PRIMARY KEY,
            language TEXT,
            segment_count INTEGER,
            segments TEXT,
            plain_text TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()


# ── Helper: normalise a segment to a plain dict ───────────────
def _seg(s) -> dict:
    """Works for both dict-style (v0.x) and object-style (v1.x) segments."""
    if isinstance(s, dict):
        return {
            "text": s.get("text", "").strip(),
            "start": round(float(s.get("start", 0)), 2),
            "duration": round(float(s.get("duration", 0)), 2),
        }
    return {
        "text": getattr(s, "text", "").strip(),
        "start": round(float(getattr(s, "start", 0)), 2),
        "duration": round(float(getattr(s, "duration", 0)), 2),
    }


# ── Routes ────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "online", "model": "llama-3.3-70b-versatile"}


@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        response = _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": request.system_instruction},
                {"role": "user", "content": request.prompt}
            ],
            temperature=0.7
        )
        return {"text": response.choices[0].message.content}
    except Exception as e:
        print(f"[LearnFlow] Groq error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/translate")
async def translate_text(request: TranslateRequest):
    try:
        system_prompt = f"You are a professional translator. Translate the following text directly into {request.target_language}. Respond ONLY with the completely translated text, keeping formatting exactly as it was. Do not include any explanations, greetings, or conversational filler."
        response = _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.text}
            ],
            temperature=0.3
        )
        return {"text": response.choices[0].message.content}
    except Exception as e:
        print(f"[LearnFlow] Groq translate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save_transcript")
async def save_transcript(request: SaveTranscriptRequest):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO transcripts (video_id, language, segment_count, segments, plain_text)
            VALUES (?, ?, ?, ?, ?)
        ''', (request.video_id, request.language, len(request.segments), json.dumps(request.segments), request.plain_text))
        conn.commit()
        conn.close()
        return {"status": "success", "message": f"Saved transcript for {request.video_id}"}
    except Exception as e:
        print(f"[LearnFlow] DB save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe_chunk")
async def transcribe_chunk(file: UploadFile = File(...)):
    try:
        content = await file.read()
        audio_file = ("chunk.webm", content, "audio/webm")
        response = _groq_client.audio.translations.create(
            file=audio_file,
            model="whisper-large-v3",
            response_format="json",
        )
        # Note: Groq returns an object with a 'text' property.
        return {"text": getattr(response, "text", "")}
    except Exception as e:
        print(f"[LearnFlow] Groq Whisper error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/transcript/{video_id}")
async def get_transcript(video_id: str):
    """
    Fetch an English transcript for any YouTube video.

    Strategy
    --------
    1. Native English transcript (manual or auto-generated).
    2. First translatable transcript → translated to English.
    3. Any available transcript as last resort.
    """
    # ── Check DB First ────────────────────────────────────────
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT language, segment_count, segments, plain_text FROM transcripts WHERE video_id = ?', (video_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            print(f"[LearnFlow] Serving cached transcript for {video_id} from DB")
            return {
                "video_id": video_id,
                "language": row[0],
                "segment_count": row[1],
                "segments": json.loads(row[2]),
                "plain_text": row[3],
            }
    except Exception as e:
        print(f"[LearnFlow] DB read error: {e}")

    raw_segments = None
    language_used = "en"

    # ── Strategy 1: Direct English fetch ─────────────────────
    try:
        fetched = _yt_api.fetch(
            video_id,
            languages=["en", "en-US", "en-GB", "en-IN", "en-CA", "en-AU"],
        )
        raw_segments = list(fetched)
        language_used = "en"
        print(f"[LearnFlow] Native English transcript for {video_id}")
    except Exception as e1:
        print(f"[LearnFlow] No native English: {e1}")

    # ── Strategy 2: Translate any available transcript ────────
    if not raw_segments:
        try:
            transcript_list = _yt_api.list(video_id)
            for transcript in transcript_list:
                if getattr(transcript, "is_translatable", False):
                    try:
                        translated = transcript.translate("en")
                        raw_segments = list(translated.fetch())
                        language_used = f"{transcript.language_code}→en"
                        print(f"[LearnFlow] Translated {transcript.language_code} → en for {video_id}")
                        break
                    except Exception as te:
                        print(f"[LearnFlow] Translation failed: {te}")
        except Exception as e2:
            print(f"[LearnFlow] list() failed: {e2}")

    # ── Strategy 3: Any language fallback ────────────────────
    if not raw_segments:
        try:
            transcript_list = _yt_api.list(video_id)
            for transcript in transcript_list:
                try:
                    raw_segments = list(transcript.fetch())
                    language_used = transcript.language_code
                    print(f"[LearnFlow] Fallback: {language_used} for {video_id}")
                    break
                except Exception:
                    continue
        except Exception as e3:
            print(f"[LearnFlow] All strategies failed: {e3}")

    if not raw_segments:
        raise HTTPException(
            status_code=404,
            detail="No transcript available. Try the Live Capture method instead.",
        )

    segments = [_seg(s) for s in raw_segments if _seg(s)["text"]]
    plain_text = " ".join(s["text"] for s in segments)

    # ── Save to DB ────────────────────────────────────────────
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO transcripts (video_id, language, segment_count, segments, plain_text)
            VALUES (?, ?, ?, ?, ?)
        ''', (video_id, language_used, len(segments), json.dumps(segments), plain_text))
        conn.commit()
        conn.close()
        print(f"[LearnFlow] Saved transcript for {video_id} to DB")
    except Exception as e:
        print(f"[LearnFlow] DB write error: {e}")

    return {
        "video_id": video_id,
        "language": language_used,
        "segment_count": len(segments),
        "segments": segments,
        "plain_text": plain_text,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
