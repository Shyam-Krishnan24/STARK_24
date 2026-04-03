let mediaRecorder;
let chunks = [];
let interval;
let streamRef = null;
let isCapturing = false;

const output = document.getElementById("output");

// ▶ START
document.getElementById("start").onclick = () => {

  if (isCapturing) return;

  chrome.tabCapture.capture(
    { audio: true, video: false },
    (stream) => {

      if (!stream) {
        alert("Failed to capture tab audio");
        return;
      }

      streamRef = stream;
      isCapturing = true;

      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {

        if (!isCapturing) return; // 🛑 prevent restart after stop

        const blob = new Blob(chunks, { type: "audio/webm" });

        const formData = new FormData();
        formData.append("audio", blob);

        try {
          const res = await fetch("http://127.0.0.1:5000/transcribe", {
            method: "POST",
            body: formData
          });

          const text = await res.text();

          let data;
          try {
            data = JSON.parse(text);
          } catch {
            console.error("Not JSON:", text);
            return;
          }

          if (data.text) {
            output.innerText += data.text + "\n";
            output.scrollTop = output.scrollHeight;
          }

        } catch (err) {
          console.error("Fetch error:", err);
        }

        chunks = [];
      };

      mediaRecorder.start();

      interval = setInterval(() => {
        if (!isCapturing) return;
        mediaRecorder.stop();
        mediaRecorder.start();
      }, 3000);
    }
  );
};

// ⏹ STOP
document.getElementById("stop").onclick = () => {

  if (!isCapturing) return;

  isCapturing = false;

  // stop interval
  clearInterval(interval);

  // stop recorder
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  // stop audio stream completely
  if (streamRef) {
    streamRef.getTracks().forEach(track => track.stop());
  }

  console.log("🛑 Capture stopped");
};