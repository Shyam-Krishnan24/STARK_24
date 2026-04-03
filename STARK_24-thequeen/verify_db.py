import requests
import time

BASE_URL = "http://127.0.0.1:8000"
VIDEO_ID = "dQw4w9WgXcQ"  # Never gonna give you up

def test_transcript_flow():
    print(f"--- Fetching transcript for {VIDEO_ID} ---")
    start_time = time.time()
    response = requests.get(f"{BASE_URL}/transcript/{VIDEO_ID}")
    duration = time.time() - start_time
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Language: {data['language']}, Cached: {data['cached']}")
        print(f"Time taken: {duration:.2f}s")
        
        # Second call should be cached
        print(f"\n--- Fetching AGAIN (should be cached) ---")
        start_time = time.time()
        response2 = requests.get(f"{BASE_URL}/transcript/{VIDEO_ID}")
        duration2 = time.time() - start_time
        
        if response2.status_code == 200:
            data2 = response2.json()
            print(f"Success! Cached: {data2['cached']}")
            print(f"Time taken: {duration2:.2f}s")
            
            if data2['cached']:
                print("\n✅ VERIFICATION SUCCESSFUL: SQL caching is working!")
            else:
                print("\n❌ VERIFICATION FAILED: Second call was not cached.")
        else:
            print(f"Error on second call: {response2.status_code}")
    else:
        print(f"Error on first call: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_transcript_flow()
