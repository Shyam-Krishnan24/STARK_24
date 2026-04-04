import sqlite3
import json

def view_database():
    conn = sqlite3.connect('transcripts.db')
    cursor = conn.cursor()
    
    # Get all records from the transcripts table
    cursor.execute('SELECT video_id, language, segment_count, plain_text FROM transcripts')
    rows = cursor.fetchall()
    
    if not rows:
        print("\n📭 The database is currently empty.")
        return

    print(f"\n📚 Found {len(rows)} stored transcripts:\n")
    print("-" * 80)
    
    for row in rows:
        video_id, language, segment_count, plain_text = row
        preview = plain_text[:100].replace('\n', ' ') + "..."
        
        print(f"🎥 Video ID: {video_id}")
        print(f"🌍 Language: {language}")
        print(f"📊 Words: {segment_count} segments")
        print(f"📄 Preview: {preview}")
        print("-" * 80)
    
    conn.close()

if __name__ == "__main__":
    view_database()
