const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const output = document.getElementById("output");

let mediaRecorder;
let audioChunks = [];
let interval;

startBtn.onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    audioChunks = [];

    const formData = new FormData();
    formData.append("audio", blob);

    const res = await fetch("http://localhost:5000/transcribe", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    output.innerText += data.text + "\n";
  };

  mediaRecorder.start();

  // record every 5 seconds
  interval = setInterval(() => {
    mediaRecorder.stop();
    mediaRecorder.start();
  }, 5000);
};

stopBtn.onclick = () => {
  clearInterval(interval);
  mediaRecorder.stop();
};