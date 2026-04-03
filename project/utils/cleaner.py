import re

def clean_text(text):
    text = text.lower()

    # remove filler words
    text = re.sub(r'\b(uh|um|okay|so|guys|like)\b', '', text)

    # remove special characters
    text = re.sub(r'[^a-zA-Z0-9\s]', '', text)

    return text