# LearnFlow AI — Setup Instructions

I have updated the extension to use a local backend for better security and smoother performance. Here is how to get it running:

## 1. Set Up the Backend
The backend handles all AI requests and stores your API key safely.

1.  **Install Dependencies**: Open a terminal in the root folder and run:
    ```bash
    pip install -r requirements.txt
    ```
2.  **Add Your API Key**: Open `main.py` and replace `"YOUR_GEMINI_API_KEY_HERE"` with your actual Gemini API key from [Google AI Studio](https://aistudio.google.com/).
3.  **Start the Server**: Run the following command:
    ```bash
    python main.py
    ```
    The server should now be running at `http://localhost:8000`.

## 2. Using the Extension
Once the backend is running:

1.  **Reload the Extension**: Go to `chrome://extensions`, find LearnFlow AI, and click the refresh icon.
2.  **Instant Capture**: Open any YouTube video. The extension will now automatically detect when you play the video and start streaming captions into the sidepanel instantly.
3.  **Live Interaction**: You will see a "Live Learning Stream" box in the sidepanel where captions appear in real-time.
4.  **No More Keys**: You no longer need to enter your API key in the extension UI—it's all handled by the backend!

## Troubleshooting
- **Captions not appearing**: Ensure the video has closed captions (CC) enabled.
- **Backend errors**: Make sure `main.py` is running and your API key is correctly pasted.
