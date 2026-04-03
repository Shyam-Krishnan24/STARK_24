// ============================================================
// LearnFlow AI — Background Service Worker
// ============================================================

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_TRANSCRIPT') {
    handleTranscriptRequest(message, sender, sendResponse);
    return true;
  }

  if (message.type === 'GEMINI_API' || message.type === 'CLAUDE_API') {
    callGeminiAPI(message.prompt, message.systemPrompt)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_SESSION') {
    saveSession(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_SESSIONS') {
    getSessions()
      .then(sessions => sendResponse({ success: true, sessions }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_TAB_STREAM_ID') {
    chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId }, (streamId) => {
      sendResponse({ streamId, error: chrome.runtime.lastError?.message });
    });
    return true;
  }
});

async function handleTranscriptRequest(message, sender, sendResponse) {
  try {
    // Inject content script to extract transcript
    const results = await chrome.scripting.executeScript({
      target: { tabId: sender.tab?.id || message.tabId },
      func: extractTranscriptFromPage
    });
    const transcript = results?.[0]?.result;
    sendResponse({ success: true, transcript });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// This runs in the page context
function extractTranscriptFromPage() {
  // YouTube transcript extraction
  const ytCaption = document.querySelectorAll('.segment-text, .caption-window span, .ytp-caption-segment');
  if (ytCaption.length > 0) {
    return Array.from(ytCaption).map(el => el.textContent).join(' ');
  }

  // Try YouTube transcript panel
  const ytTranscriptItems = document.querySelectorAll('[class*="transcript"] [class*="segment"], ytd-transcript-segment-renderer');
  if (ytTranscriptItems.length > 0) {
    return Array.from(ytTranscriptItems).map(el => el.textContent.trim()).join(' ');
  }

  // Generic: grab all paragraph text and headings
  const contentEls = document.querySelectorAll('p, h1, h2, h3, li, [class*="transcript"], [class*="subtitle"], [class*="caption"]');
  const texts = Array.from(contentEls)
    .map(el => el.textContent.trim())
    .filter(t => t.length > 20);

  return texts.join(' ') || document.body.innerText.substring(0, 50000);
}

async function callGeminiAPI(prompt, systemPrompt = '') {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) throw new Error('No API key found');

  const MODEL = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: (systemPrompt || 'You are LearnFlow AI, an expert educational assessment engine.') + '\n\n' + prompt
        }]
      }],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Gemini API error');
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Invalid response format from Gemini API');
}

async function saveSession(data) {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const existing = sessions.findIndex(s => s.sessionId === data.sessionId);
  if (existing >= 0) {
    sessions[existing] = { ...sessions[existing], ...data, updatedAt: Date.now() };
  } else {
    sessions.push({ ...data, createdAt: Date.now(), updatedAt: Date.now() });
  }
  // Keep only last 50 sessions
  const trimmed = sessions.slice(-50);
  await chrome.storage.local.set({ sessions: trimmed });
}

async function getSessions() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}
