import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)
from google.api_core import exceptions as google_exceptions

app = FastAPI(title="LearnFlow AI Backend")

# Enable CORS for Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# CONFIGURATION
# ============================================================
GEMINI_API_KEY = "AIzaSyD-Zj_sPvAVVWXHZOMqZjp_NiSOHpBYycE"

if GEMINI_API_KEY != "YOUR_GEMINI_API_KEY_HERE":
    genai.configure(api_key=GEMINI_API_KEY)


class ChatRequest(BaseModel):
    prompt: str
    system_instruction: str = "You are LearnFlow AI, an expert educational assessment engine."


@app.get("/")
async def root():
    return {"status": "online", "model": "gemini-2.0-flash"}


@app.get("/transcript/{video_id}")
async def get_transcript(video_id: str):
    """
    Fetches the transcript for a YouTube video and ALWAYS returns it in English.

    Priority:
      1. Manually created English transcript
      2. Auto-generated English transcript
      3. Translate the best available non-English transcript → English
    """
    try:
        # NOTE: v1.x API uses .list(), not .list_transcripts()
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)

        transcript = None
        source_language = "English"
        was_translated = False

        english_codes = ["en", "en-US", "en-GB", "en-CA", "en-AU", "en-IN"]

        # ── Step 1: Manual English ───────────────────────────────────
        try:
            transcript = transcript_list.find_manually_created_transcript(english_codes)
            source_language = transcript.language
        except NoTranscriptFound:
            pass

        # ── Step 2: Auto-generated English ──────────────────────────
        if not transcript:
            try:
                transcript = transcript_list.find_generated_transcript(english_codes)
                source_language = transcript.language
            except NoTranscriptFound:
                pass

        # ── Step 3: Translate best available → English ───────────────
        if not transcript:
            was_translated = True
            best = None

            # Prefer manual transcripts (higher quality source)
            try:
                all_codes = [t.language_code for t in transcript_list]
                non_english = [c for c in all_codes if not c.startswith("en")]
                if non_english:
                    best = transcript_list.find_manually_created_transcript(non_english)
            except (NoTranscriptFound, Exception):
                pass

            # Fall back to any transcript that is translatable
            if not best:
                for t in transcript_list:
                    if t.is_translatable:
                        best = t
                        break

            # Last resort: grab literally any transcript
            if not best:
                for t in transcript_list:
                    best = t
                    break

            if best:
                source_language = best.language
                if best.is_translatable:
                    transcript = best.translate("en")
                else:
                    # Can't translate — return as-is
                    transcript = best
                    was_translated = False
            else:
                raise HTTPException(
                    status_code=404,
                    detail="No transcripts of any kind found for this video."
                )

        data = transcript.fetch()

        # Normalise: FetchedTranscript may be a list of snippet objects
        # or a list of dicts depending on version. Ensure JSON-serialisable list.
        segments = []
        for item in data:
            if isinstance(item, dict):
                segments.append(item)
            else:
                segments.append({
                    "text": item.text,
                    "start": item.start,
                    "duration": item.duration,
                })

        return {
            "video_id": video_id,
            "transcript": segments,
            "language": "English",
            "source_language": source_language,
            "was_translated": was_translated,
        }

    except HTTPException:
        raise
    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Subtitles are disabled for this video.")
    except VideoUnavailable:
        raise HTTPException(status_code=404, detail="This video is unavailable or private.")
    except Exception as e:
        print(f"Transcript Error for {video_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(request: ChatRequest):
    if GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        raise HTTPException(status_code=400, detail="Please set your API key in main.py")
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=request.system_instruction,
        )
        response = model.generate_content(request.prompt)
        return {"text": response.text}
    except google_exceptions.ResourceExhausted as e:
        print(f"Quota Error: {e}")
        raise HTTPException(
            status_code=429,
            detail="Gemini API Quota Exceeded. Please check your billing or try again in a minute."
        )
    except Exception as e:
        print(f"Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
