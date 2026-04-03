from utils.chunker import split_text
from utils.cleaner import clean_text
from utils.concepts import rank_topics, filter_topics

from youtube_transcript_api import YouTubeTranscriptApi


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


#  MAIN (ONLY YOUTUBE)
if __name__ == "__main__":

    video_id = input("Enter YouTube Video ID: ")

    try:
        text = get_youtube_text(video_id)
    except Exception as e:
        print("❌ Error fetching transcript:", e)
        exit()

    topics = analyze_topics(text)

    print("\n✅ FINAL TOPICS:\n")
    for t in topics:
        print(t)