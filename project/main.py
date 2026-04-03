from utils.chunker import split_text
from utils.cleaner import clean_text
from utils.concepts import rank_topics, filter_topics

from youtube_transcript_api import YouTubeTranscriptApi
from utils.youtube_live import live_stream_processing


def analyze_topics(text):
    print("\n[1] Cleaning text...")
    cleaned = clean_text(text)

    print("[2] Splitting into chunks...")
    chunks = split_text(cleaned)

    print("[3] Ranking topics...")
    ranked = rank_topics(chunks)

    print("[4] Filtering top topics...")
    final_topics = filter_topics(ranked)

    return final_topics


def get_youtube_text(video_id):
    api = YouTubeTranscriptApi()
    transcript = api.fetch(video_id)
    text = " ".join([t.text for t in transcript])
    return text


# MAIN (YOUTUBE + LIVE)
if __name__ == "__main__":

    print("Choose input type:")
    print("1 → YouTube Video")
    print("2 → YouTube LIVE")

    choice = input("Enter choice (1 or 2): ")

    try:
        if choice == "1":
            video_id = input("Enter YouTube Video ID: ")
            text = get_youtube_text(video_id)

        elif choice == "2":
            url = input("Enter YouTube LIVE URL: ")
            ##text = live_video_to_text(url)
            live_stream_processing(url, analyze_topics)
            exit()

        else:
            print("Invalid choice ")
            exit()

    except Exception as e:
        print(" Error:", e)
        exit()

    topics = analyze_topics(text)

    print("\n✅ FINAL TOPICS:\n")
    for t in topics:
        print(t)