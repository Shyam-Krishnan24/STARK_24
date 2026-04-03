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


# 🔥 MAIN
if __name__ == "__main__":

    print("Choose input type:")
    print("1 → Sample Text")
    print("2 → YouTube Video")

    choice = input("Enter choice (1 or 2): ")

    if choice == "1":
        text = """
        Python loops are used to iterate over a sequence.
        There are two types of loops: for loop and while loop.
        A for loop is used when the number of iterations is known.
        """

    elif choice == "2":
        video_id = input("Enter YouTube Video ID: ")
        text = get_youtube_text(video_id)

    else:
        print("Invalid choice ❌")
        exit()

    topics = analyze_topics(text)

    print("\n✅ FINAL TOPICS:\n")
    for t in topics:
        print(t)