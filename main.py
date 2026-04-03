import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os

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
# PASTE YOUR GEMINI API KEY HERE
GEMINI_API_KEY = "AIzaSyAxX_mArGfprGtLkl6_JMb5v9GRcTtwVEY"

if GEMINI_API_KEY != "YOUR_GEMINI_API_KEY_HERE":
    genai.configure(api_key=GEMINI_API_KEY)

class ChatRequest(BaseModel):
    prompt: str
    system_instruction: str = "You are LearnFlow AI, an expert educational assessment engine."

@app.get("/")
async def root():
    return {"status": "online", "model": "gemini-2.0-flash"}

@app.post("/chat")
async def chat(request: ChatRequest):
    if GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        raise HTTPException(status_code=400, detail="Please set your API key in main.py")

    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=request.system_instruction
        )
        
        response = model.generate_content(request.prompt)
        return {"text": response.text}
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
