// ============================================================
// LearnFlow AI — Popup Script
// ============================================================

let isCapturing = false;

document.addEventListener('DOMContentLoaded', async () => {
  await detectPage();
  await loadStats();
  setupListeners();
});

async function detectPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const title = tab?.title || 'Unknown Page';

  const siteName = document.getElementById('siteName');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  const platforms = [
    { pattern: 'youtube.com', name: 'YouTube', color: '#ef4444' },
    { pattern: 'coursera.org', name: 'Coursera', color: '#0056d2' },
    { pattern: 'udemy.com', name: 'Udemy', color: '#a435f0' },
    { pattern: 'khanacademy.org', name: 'Khan Academy', color: '#14bf96' },
    { pattern: 'edx.org', name: 'edX', color: '#02262b' },
    { pattern: 'vimeo.com', name: 'Vimeo', color: '#1ab7ea' },
  ];

  const matched = platforms.find(p => url.includes(p.pattern));

  if (matched) {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Video Detected';
    siteName.textContent = `${matched.name} — ${title.substring(0, 40)}...`;
  } else if (url.startsWith('http')) {
    statusDot.className = 'status-dot idle';
    statusText.textContent = 'Web Page';
    siteName.textContent = title.substring(0, 50);
  } else {
    statusDot.className = 'status-dot idle';
    statusText.textContent = 'No Page';
    siteName.textContent = 'Navigate to a video or course';
  }
}


async function loadStats() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const totalQuestions = sessions.reduce((s, sess) => s + (sess.questionCount || 0), 0);
  const scores = sessions.filter(s => s.score != null).map(s => s.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + '%'
    : '—';

  document.getElementById('statSessions').textContent = sessions.length;
  document.getElementById('statQuestions').textContent = totalQuestions;
  document.getElementById('statScore').textContent = avgScore;
}

function setupListeners() {
  document.getElementById('openPanelBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });

  document.getElementById('captureBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isCapturing) {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_CAPTURE' });
      isCapturing = true;
      document.getElementById('captureBtnText').textContent = 'Stop Live Capture';
      document.getElementById('captureIndicator').classList.add('active');
      await chrome.storage.local.set({ captureTabId: tab.id, isCapturing: true });
      showToast('🔴 Live capture started!');
    } else {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'STOP_CAPTURE' });
      isCapturing = false;
      document.getElementById('captureBtnText').textContent = 'Start Live Capture';
      document.getElementById('captureIndicator').classList.remove('active');
      await chrome.storage.local.set({ isCapturing: false, capturedTranscript: result?.transcript });
      showToast('✅ Capture saved! Open panel to analyze.');
    }
  });

  document.getElementById('extractBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    document.getElementById('extractBtn').disabled = true;
    document.getElementById('extractBtn').textContent = '⏳ Extracting...';

    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TRANSCRIPT' });
      if (result?.transcript) {
        await chrome.storage.local.set({ extractedTranscript: result.transcript });
        showToast(`✅ Extracted ${result.transcript.split(' ').length} words!`);
      } else {
        showToast('⚠️ No transcript found');
      }
    } catch (e) {
      showToast('❌ Could not extract — try Live Capture');
    }

    document.getElementById('extractBtn').disabled = false;
    document.getElementById('extractBtn').innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      Extract Transcript Now
    `;
  });

}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
