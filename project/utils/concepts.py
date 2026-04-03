import spacy
from collections import defaultdict

# Load spaCy model
nlp = spacy.load("en_core_web_sm")


def extract_topics_from_chunk(text):
    doc = nlp(text)

    # Extract noun phrases (best simple topics)
    topics = [chunk.text for chunk in doc.noun_chunks]

    return list(set(topics))


def rank_topics(chunks):
    topic_freq = defaultdict(int)
    topic_presence = defaultdict(set)

    for i, chunk in enumerate(chunks):
        topics = extract_topics_from_chunk(chunk)

        for t in topics:
            topic_freq[t] += 1
            topic_presence[t].add(i)

    scored_topics = []

    for topic in topic_freq:
        freq = topic_freq[topic]
        spread = len(topic_presence[topic])

        score = (0.7 * freq) + (0.3 * spread)

        scored_topics.append((topic, score))

    scored_topics.sort(key=lambda x: x[1], reverse=True)

    return scored_topics


def filter_topics(scored_topics):
    stop_topics = ["video", "lecture", "today", "thing", "stuff"]
    
    final = []

    for topic, score in scored_topics:
        if topic not in stop_topics and len(topic) > 2:
            final.append({
                "name": topic,
                "importance": round(score, 2)
            })

    return final[:10]

def filter_topics(scored_topics):
    stop_words = [
        "you", "this", "that", "anything", "something",
        "thing", "stuff", "one", "your", "their"
    ]

    final = []

    for topic, score in scored_topics:
        topic_clean = topic.lower().strip()

        if topic_clean not in stop_words and len(topic_clean) > 3:
            final.append({
                "name": topic_clean,
                "importance": round(score, 2)
            })

    return final[:10]