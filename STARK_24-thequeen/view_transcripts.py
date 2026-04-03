import sqlite3
import json
import sys

def view_data(video_id=None):
    try:
        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()
        
        if video_id:
            # View full detail for a specific video
            cursor.execute("SELECT video_id, language, plain_text, segments, created_at FROM transcript WHERE video_id = ?", (video_id,))
            row = cursor.fetchone()
            if row:
                print(f"\n📄 --- FULL TRANSCRIPT FOR {row[0]} ---")
                print(f"Language: {row[1]}")
                print(f"Saved At: {row[4]}")
                print("-" * 50)
                print("TEXT SNIPPET (First 500 chars):")
                print(f"{row[2][:500]}...")
                print("-" * 50)
                
                segments = json.loads(row[3])
                print(f"SEGMENTS: {len(segments)} total segments found.")
                print("First 3 segments:")
                for s in segments[:3]:
                    print(f"  [{s.get('start', 0):>6.2f}s] {s.get('text', '')}")
                print("-" * 50)
            else:
                print(f"❌ Video ID '{video_id}' not found in database.")
        else:
            # List all videos with snippets
            cursor.execute("SELECT video_id, language, length(plain_text), substr(plain_text, 1, 60), created_at FROM transcript")
            rows = cursor.fetchall()
            
            if not rows:
                print("📭 No transcripts found in the database yet.")
            else:
                print("\n📊 --- STORED TRANSCRIPTS ---")
                print(f"{'Video ID':<15} | {'Lang':<5} | {'Bytes':<10} | {'Snippet'}")
                print("-" * 80)
                for row in rows:
                    snippet = row[3].replace("\n", " ").strip()
                    print(f"{row[0]:<15} | {row[1]:<5} | {row[2]:<10} | {snippet}...")
                print("-" * 80)
                print(f"Total: {len(rows)} videos cached.")
                print("\n💡 TIP: Run 'python view_transcripts.py [VIDEO_ID]' to see full text.")

        conn.close()
    except Exception as e:
        print(f"Error reading database: {e}")

if __name__ == "__main__":
    vid = sys.argv[1] if len(sys.argv) > 1 else None
    view_data(vid)
