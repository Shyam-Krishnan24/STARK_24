import yt_dlp
import whisper
import os
import time


def download_audio_chunk(youtube_url, chunk_id):
    filename = f"live_chunk_{chunk_id}.%(ext)s"

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': filename,
        'quiet': True,
        'ffmpeg_location': r'C:\ffmpeg\ffmpeg-8.1-essentials_build\bin',
        'noplaylist': True
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])

    for file in os.listdir():
        if file.startswith(f"live_chunk_{chunk_id}"):
            return file
        
def live_stream_processing(youtube_url, analyze_topics):
    model = whisper.load_model("base")

    chunk_id = 1

    while True:
        print(f"\n🔴 Processing chunk {chunk_id}...")

        audio_file = download_audio_chunk(youtube_url, chunk_id)

        result = model.transcribe(audio_file)
        text = result["text"]

        topics = analyze_topics(text)

        print("\n✅ LIVE TOPICS:\n")
        for t in topics:
            print(t)

        chunk_id += 1

        time.sleep(50)  # wait 50 seconds before next chunk