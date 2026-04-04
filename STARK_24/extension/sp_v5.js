// ============================================================
// LearnFlow AI — Side Panel Controller (sidepanel.js)
// ============================================================

// ── State ────────────────────────────────────────────────────
const state = {
  apiKey: '',
  currentTab: 'home',
  transcript: '',
  videoMeta: {},
  rag: null,
  difficulty: 'easy',
  questionCount: 10,
  isCapturing: false,

  // Quiz state
  questions: [],
  currentQIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  answers: [],
  sessionId: null,

  // Concept focus
  selectedConcepts: [],

  // Auto-transcript (API-based, no CC required)
  transcriptSegments: [],
  tickerInterval: null,
  lastAutoFetchedVideoId: null,

  // Performance tracking
  history: [],
  difficultyProgress: { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } },

  // Tutor state
  tutorChatHistory: [],
  tutorInitialized: false
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  state.rag = new LearnFlowRAG();
  await loadPersistedData();
  await detectCurrentPage();
  await checkApiKey();
  setupTabNavigation();
  setupHomeView();
  setupQuizControls();
  setupTutorControls();
  updateStatsView();
  loadSessionsView();
  setupLiveTranscriptListener();
});

// ── Persistence ──────────────────────────────────────────────
async function loadPersistedData() {
  const data = await chrome.storage.local.get([
    'apiKey', 'history', 'difficultyProgress',
    'extractedTranscript', 'capturedTranscript'
  ]);

  state.apiKey = data.apiKey || '';
  state.history = data.history || [];
  state.difficultyProgress = data.difficultyProgress || state.difficultyProgress;

  // Auto-load any previously captured transcript
  const savedTranscript = data.capturedTranscript || data.extractedTranscript;
  if (savedTranscript && savedTranscript.length > 100) {
    await ingestTranscript(savedTranscript);
  }
}

async function saveHistory() {
  await chrome.storage.local.set({
    history: state.history.slice(-500),
    difficultyProgress: state.difficultyProgress
  });
}

async function checkApiKey() {
  // Key is now handled by the backend
  return true;
}

// ── Page Detection ───────────────────────────────────────────
async function detectCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    const title = tab?.title || 'Unknown';

    const platforms = [
      { pattern: 'youtube.com', name: 'YouTube', emoji: '▶️' },
      { pattern: 'coursera.org', name: 'Coursera', emoji: '🎓' },
      { pattern: 'udemy.com', name: 'Udemy', emoji: '📚' },
      { pattern: 'khanacademy.org', name: 'Khan Academy', emoji: '🏫' },
      { pattern: 'edx.org', name: 'edX', emoji: '🏛️' },
      { pattern: 'vimeo.com', name: 'Vimeo', emoji: '🎬' },
    ];

    const matched = platforms.find(p => url.includes(p.pattern));
    const platformBadge = document.getElementById('platformBadge');
    const videoTitle = document.getElementById('videoTitle');

    if (matched) {
      platformBadge.textContent = `${matched.emoji} ${matched.name}`;
      videoTitle.textContent = title.replace(/ - YouTube$| - Coursera$/, '').substring(0, 80);
      state.videoMeta = { title: title, url, platform: matched.name };

      // ── Auto-fetch transcript for YouTube (no CC required) ──
      if (matched.name === 'YouTube') {
        try {
          const params = new URLSearchParams(new URL(url).search);
          const videoId = params.get('v');
          if (videoId) autoFetchYouTubeTranscript(tab, videoId);
        } catch (_) {}
      }
    } else {
      platformBadge.textContent = '🌐 Web Page';
      videoTitle.textContent = title.substring(0, 80) || 'Navigate to a video or course';
      state.videoMeta = { title, url, platform: 'Generic' };
    }
  } catch (e) {
    console.log('Page detection failed:', e);
  }
}

// ── Tab Navigation ───────────────────────────────────────────
function setupTabNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await detectCurrentPage();
    showToast('🔄 Page refreshed', 'info');
  });
}

function switchTab(name) {
  state.currentTab = name;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));

  if (name === 'stats') updateStatsView();
  if (name === 'sessions') loadSessionsView();
  if (name === 'tutor' && !state.tutorInitialized && state.transcript.length > 50) initTutor();
}

// ── Home View Setup ──────────────────────────────────────────
function setupHomeView() {
  // Difficulty selection
  document.querySelectorAll('.diff-btn[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn[data-diff]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.difficulty = btn.dataset.diff;
    });
  });

  // Question count selection
  document.querySelectorAll('.diff-btn[data-count]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn[data-count]').forEach(b => {
        b.classList.remove('selected');
        b.style.borderColor = '';
        b.style.background = '';
        b.style.color = '';
      });
      btn.classList.add('selected');
      btn.style.borderColor = 'var(--indigo)';
      btn.style.background = 'rgba(99,102,241,0.08)';
      btn.style.color = 'var(--indigo)';
      state.questionCount = parseInt(btn.dataset.count);
    });
  });

  // Extract methods
  document.getElementById('btnExtractPage').addEventListener('click', extractFromPage);
  document.getElementById('btnYtTranscript').addEventListener('click', extractYtTranscript);
  document.getElementById('btnLiveCapture').addEventListener('click', toggleLiveCapture);
  document.getElementById('btnPasteText').addEventListener('click', () => {
    const area = document.getElementById('pasteArea');
    area.classList.toggle('hidden');
    document.getElementById('voiceArea').classList.add('hidden');
  });

  document.getElementById('btnVideoAudio').addEventListener('click', () => {
    const area = document.getElementById('audioArea');
    area.classList.toggle('hidden');
    document.getElementById('pasteArea').classList.add('hidden');
  });

  // Tab Audio Recording State
  let mediaRecorder;
  let audioContext;

  async function sendAudioToWhisper(blob) {
    try {
      const formData = new FormData();
      formData.append("file", blob, "chunk.webm");
      
      const response = await fetch("http://localhost:8000/transcribe_chunk", {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      if (data.text && data.text.trim()) {
        const streamEl = document.getElementById('liveStream');
        if (streamEl) {
          const empty = streamEl.querySelector('.stream-empty');
          if (empty) empty.remove();
          
          const span = document.createElement('span');
          span.className = 'stream-item';
          span.textContent = data.text + ' ';
          streamEl.appendChild(span);
          streamEl.scrollTop = streamEl.scrollHeight;
        }
        state.transcript += " " + data.text;
        ingestTranscript(state.transcript, true);
      }
    } catch (e) {
      console.error("Transcription error:", e);
    }
  }

  document.getElementById('btnStartAudio').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab");

      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_STREAM_ID', tabId: tab.id });
      if (response.error || !response.streamId) {
        throw new Error(response.error || "Failed to get stream ID");
      }

      const streamId = response.streamId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });

      // Route audio back to speakers so user can still hear the video
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(audioContext.destination);

      let isActive = true;

      function recordNextChunk() {
        if (!isActive) return;
        
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && isActive) {
            await sendAudioToWhisper(e.data);
          }
        };

        mediaRecorder.start();
        
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            recordNextChunk();
          }
        }, 10000);
      }

      recordNextChunk();
      
      document.getElementById('audioStatus').textContent = "🔴 Recording and analyzing tab audio live...";
      document.getElementById('btnStartAudio').disabled = true;
      document.getElementById('btnStartAudio').style.opacity = '0.5';
      document.getElementById('btnStopAudio').disabled = false;
      document.getElementById('btnStopAudio').style.opacity = '1';
      
      // Turn on Live Stream section
      document.getElementById('liveStreamSection').classList.remove('hidden');

    } catch (e) {
      console.error(e);
      document.getElementById('audioStatus').textContent = "Ready to listen to the current tab.";
      
      let msg = e.message;
      if (msg.includes("Chrome pages cannot be captured")) {
        msg = "Cannot capture audio from Chrome internal pages or the New Tab page. Please switch to a normal website like YouTube and try again.";
      } else if (msg.includes("activeTab permission")) {
        msg = "Please explicitly click the extension plugin icon in your toolbar once to grant activeTab permissions, then retry.";
      }
      
      showToast("Audio Capture Failed: " + msg, "error", 5000);
    }
  });

  document.getElementById('btnStopAudio').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
      mediaRecorder.ondataavailable = null;
    }
    if (audioContext) {
      audioContext.close();
    }
    document.getElementById('audioStatus').textContent = "Ready to listen to the current tab.";
    document.getElementById('btnStartAudio').disabled = false;
    document.getElementById('btnStartAudio').style.opacity = '1';
    document.getElementById('btnStopAudio').disabled = true;
    document.getElementById('btnStopAudio').style.opacity = '0.5';
    showToast("✅ Stopped audio capture", "success");
  });

  document.getElementById('btnTranslateText').addEventListener('click', async () => {
    const targetLang = document.getElementById('translateTargetLang').value;
    if (!targetLang) { showToast('⚠️ Please select a language', 'info'); return; }
    if (!state.transcript) { showToast('⚠️ No transcript loaded', 'error'); return; }

    const btn = document.getElementById('btnTranslateText');
    const oldContent = btn.innerHTML;
    btn.innerHTML = '⏳';
    btn.disabled = true;

    showToast(`🔄 Translating to ${targetLang}...`, 'info');

    try {
      const res = await fetch("http://localhost:8000/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: state.transcript, target_language: targetLang })
      });
      if (!res.ok) throw new Error("Translation HTTP error");
      const data = await res.json();
      if (data.text) {
        showToast(`✅ Translated to ${targetLang}!`, 'success');

        // Show the user the translated text visually!
        const streamEl = document.getElementById('liveStream');
        if (streamEl) {
          streamEl.innerHTML = '';
          const span = document.createElement('span');
          span.className = 'stream-item';
          span.textContent = data.text;
          streamEl.appendChild(span);
          streamEl.scrollTop = 0;
          document.getElementById('liveStreamSection').classList.remove('hidden');
        }

        await ingestTranscript(data.text);
      }
    } catch (e) {
      console.error(e);
      showToast(`❌ Translation failed: ${e.message}`, 'error');
    }

    btn.innerHTML = oldContent;
    btn.disabled = false;
  });

  // Generate button
  document.getElementById('generateBtn').addEventListener('click', startQuiz);
}

// ── Transcript Extraction ────────────────────────────────────
async function extractFromPage() {
  const btn = document.getElementById('btnExtractPage');
  btn.style.opacity = '0.5';
  btn.querySelector('.method-icon').textContent = '⏳';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TRANSCRIPT' });

    if (result?.transcript && result.transcript.length > 50) {
      await ingestTranscript(result.transcript);
      showToast(`✅ Extracted ${result.transcript.split(' ').length} words!`, 'success');
    } else {
      showToast('⚠️ No transcript found. Try Live Capture.', 'error');
    }
  } catch (e) {
    showToast('❌ Could not extract. Use Paste Text instead.', 'error');
  }

  btn.style.opacity = '';
  btn.querySelector('.method-icon').textContent = '📋';
}

async function extractYtTranscript() {
  const btn = document.getElementById('btnYtTranscript');
  btn.style.opacity = '0.5';
  btn.querySelector('.method-icon').textContent = '⏳';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_YT_TRANSCRIPT' });

    if (result?.transcript && result.transcript.length > 50) {
      await ingestTranscript(result.transcript);
      showToast(`✅ YT Transcript loaded!`, 'success');
    } else {
      showToast('⚠️ No transcript available. Try Auto Captions.', 'error');
    }
  } catch (e) {
    showToast('❌ YouTube transcript unavailable', 'error');
  }

  btn.style.opacity = '';
  btn.querySelector('.method-icon').textContent = '▶️';
}

async function toggleLiveCapture() {
  const btn = document.getElementById('btnLiveCapture');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!state.isCapturing) {
    // ── Strategy 1: Try the backend API (works without CC enabled) ──
    btn.querySelector('.method-icon').textContent = '⏳';
    btn.querySelector('.method-name').textContent = 'Fetching...';
    btn.style.opacity = '0.7';

    try {
      const idResult = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      if (idResult?.videoId) {
        showToast('🔍 Fetching transcript from YouTube API...', 'info');
        const data = await fetchYouTubeTranscript(idResult.videoId);
        if (data && data.segments?.length > 0) {
          state.transcriptSegments = data.segments;
          state.lastAutoFetchedVideoId = idResult.videoId;
          await ingestTranscript(data.plain_text);
          startPlaybackTicker(tab, data.segments);
          // Mark as "capturing" so Stop button works
          state.isCapturing = true;
          btn.querySelector('.method-icon').textContent = '⏹';
          btn.querySelector('.method-name').textContent = 'Stop Stream';
          btn.style.borderColor = 'var(--emerald)';
          btn.style.color = 'var(--emerald)';
          btn.style.opacity = '';
          showToast(`✅ Transcript streaming (${data.language}) — no CC needed!`, 'success');
          return;
        }
      }
    } catch (_) {}

    // ── Strategy 2: Fall back to CC screen-scraping ──
    showToast('⚠️ No API transcript — falling back to CC capture', 'info');
    await chrome.tabs.sendMessage(tab.id, { type: 'START_CAPTURE' });
    state.isCapturing = true;
    btn.querySelector('.method-icon').textContent = '⏹';
    btn.querySelector('.method-name').textContent = 'Stop Capture';
    btn.style.borderColor = 'var(--rose)';
    btn.style.color = 'var(--rose)';
    btn.style.opacity = '';
    showToast('🔴 CC capture started — enable CC on YouTube!', 'info');

    // Auto-pull CC transcript every 10 s
    state.captureInterval = setInterval(async () => {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'GET_LIVE_TRANSCRIPT' });
      if (r?.transcript && r.transcript.length > 100) {
        await ingestTranscript(r.transcript, true);
      }
    }, 10000);

  } else {
    // ── Stop everything ──
    if (state.tickerInterval) { clearInterval(state.tickerInterval); state.tickerInterval = null; }
    clearInterval(state.captureInterval);
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'STOP_CAPTURE' }).catch(() => ({}));
    state.isCapturing = false;
    btn.querySelector('.method-icon').textContent = '🔴';
    btn.querySelector('.method-name').textContent = 'Live Capture';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.opacity = '';

    if (result?.transcript && result.transcript.length > 50) {
      await ingestTranscript(result.transcript);
      showToast('✅ Capture complete!', 'success');
    }
  }
}

function startPlaybackTicker(tab, segments) {
  if (!segments || segments.length === 0) return;
  if (state.tickerInterval) clearInterval(state.tickerInterval);
  
  state.tickerInterval = setInterval(async () => {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TIME' });
      if (resp && resp.currentTime !== undefined) {
        const ct = resp.currentTime;
        const seg = segments.find(s => ct >= s.start && ct <= (s.start + s.duration));
        
        if (seg && state.lastSegmentId !== seg.start) {
          state.lastSegmentId = seg.start;
          chrome.runtime.sendMessage({
            type: 'LIVE_TRANSCRIPT_UPDATE',
            text: seg.text,
            buffer: state.transcript
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Ignore errors if tab closes
    }
  }, 1000);
}

function setupLiveTranscriptListener() {
  chrome.runtime.onMessage.addListener((msg) => {
    // ── Live stream text update (from CC scraper OR playback ticker)
    if (msg.type === 'LIVE_TRANSCRIPT_UPDATE') {
      const streamEl = document.getElementById('liveStream');
      if (streamEl) {
        const empty = streamEl.querySelector('.stream-empty');
        if (empty) empty.remove();

        const span = document.createElement('span');
        span.className = 'stream-item';
        span.textContent = msg.text + ' ';
        streamEl.appendChild(span);
        streamEl.scrollTop = streamEl.scrollHeight;
      }

      // Update internal buffer for RAG (only grow, never shrink)
      if (msg.buffer && msg.buffer.length > state.transcript.length) {
        state.transcript = msg.buffer;
        if (state.transcript.split(' ').length % 10 === 0) {
          ingestTranscript(state.transcript, true);
        }
      }
    }

    // ── YouTube SPA navigation: video changed, auto-refetch transcript
    if (msg.type === 'YT_VIDEO_CHANGED') {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (!tab) return;
        // Update UI title
        const videoTitleEl = document.getElementById('videoTitle');
        if (videoTitleEl && msg.title)
          videoTitleEl.textContent = msg.title.replace(/ - YouTube$/, '').substring(0, 80);
        state.videoMeta.url = msg.url;
        state.videoMeta.title = msg.title || state.videoMeta.title;
        // Fetch transcript for the new video
        if (msg.videoId && msg.videoId !== state.lastAutoFetchedVideoId) {
          autoFetchYouTubeTranscript(tab, msg.videoId);
        }
      });
    }
  });
}

// ── Transcript Ingestion ─────────────────────────────────────
async function ingestTranscript(text, silent = false) {
  if (!text || text.length < 50) return;

  state.transcript = text;
  // Reset concept selections whenever a new transcript is loaded
  state.selectedConcepts = [];
  const result = state.rag.ingestTranscript(text, state.videoMeta);

  // Update UI
  const statusEl = document.getElementById('transcriptStatus');
  const metaEl = document.getElementById('transcriptMeta');
  const conceptsSection = document.getElementById('conceptsSection');
  const conceptTags = document.getElementById('conceptTags');
  const hintEl = document.getElementById('selectedConceptsHint');
  const translatorEl = document.getElementById('translatorSection');

  statusEl.classList.remove('hidden');
  if (translatorEl) translatorEl.classList.remove('hidden');
  metaEl.textContent = `${text.split(' ').length.toLocaleString()} words · ${result.concepts.length} concepts · ${result.chunkCount} chunks`;

  // Show concept tags — each is clickable to narrow the quiz focus
  if (result.concepts.length > 0) {
    conceptsSection.classList.remove('hidden');
    conceptTags.innerHTML = result.concepts.slice(0, 12).map(c =>
      `<span class="concept-tag" data-concept="${c}">${c}</span>`
    ).join('');

    // Reset hint
    if (hintEl) {
      hintEl.textContent = 'Click any concept to focus the quiz on specific topics';
      hintEl.classList.remove('active');
    }

    // Attach click handlers to each tag
    conceptTags.querySelectorAll('.concept-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        tag.classList.toggle('selected');
        const concept = tag.dataset.concept;
        if (tag.classList.contains('selected')) {
          if (!state.selectedConcepts.includes(concept))
            state.selectedConcepts.push(concept);
        } else {
          state.selectedConcepts = state.selectedConcepts.filter(c => c !== concept);
        }
        // Update hint text
        if (hintEl) {
          const count = state.selectedConcepts.length;
          if (count === 0) {
            hintEl.textContent = 'Click any concept to focus the quiz on specific topics';
            hintEl.classList.remove('active');
          } else {
            hintEl.textContent = `✨ ${count} concept${count > 1 ? 's' : ''} selected — questions will focus on ${count > 1 ? 'these' : 'this'}`;
            hintEl.classList.add('active');
          }
        }
      });
    });
  }

  if (!silent) showToast(`📚 ${result.chunkCount} chunks indexed in vector store`, 'success');
}

// ── Quiz Start ───────────────────────────────────────────────
async function startQuiz() {
  // API key is handled by backend

  if (!state.transcript || state.transcript.length < 50) {
    showToast('⚠️ Please extract a transcript first', 'error');
    return;
  }

  // Switch to quiz tab
  switchTab('quiz');

  // Reset quiz state
  state.questions = [];
  state.currentQIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.answers = [];
  state.sessionId = `session_${Date.now()}`;

  // Show loading
  document.getElementById('quizLoading').classList.remove('hidden');
  document.getElementById('quizActive').classList.add('hidden');
  document.getElementById('quizResults').classList.add('hidden');

  // Generate questions progressively
  await generateQuestions();
}

async function generateQuestions() {
  const loadingText = document.getElementById('loadingText');
  const loadingSub = document.getElementById('loadingSub');

  loadingText.textContent = `Generating ${state.questionCount} questions...`;
  loadingSub.textContent = `Using RAG to find relevant context`;

  // Generate questions in batch but show progress
  const diffProgression = buildDifficultyProgression();

  // Use selected concepts if any, else fall back to all extracted concepts
  const conceptPool = state.selectedConcepts.length > 0
    ? state.selectedConcepts
    : (state.rag.concepts.length > 0 ? state.rag.concepts : ['main topic']);

  for (let i = 0; i < state.questionCount; i++) {
    loadingText.textContent = `Question ${i + 1} of ${state.questionCount}...`;
    const diff = diffProgression[i];
    // Distribute questions evenly across the concept pool
    const concept = conceptPool[i % conceptPool.length];

    try {
      const prompt = state.rag.buildQuestionPrompt(diff, state.history.slice(-20), concept);
      const response = await callGemini(prompt);
      const question = parseQuestion(response, diff);
      if (question) {
        state.questions.push(question);
      }
    } catch (e) {
      console.error('Question gen error:', e);
      // Push a fallback question
      state.questions.push(createFallbackQuestion(diff, concept));
    }
  }

  if (state.questions.length === 0) {
    showToast('❌ Failed to generate questions. Check API key.', 'error');
    switchTab('home');
    return;
  }

  // Start quiz
  document.getElementById('quizLoading').classList.add('hidden');
  document.getElementById('quizActive').classList.remove('hidden');
  renderQuestion();
}

function buildDifficultyProgression() {
  const n = state.questionCount;
  const progression = [];
  const baseDiff = state.difficulty;

  if (baseDiff === 'easy') {
    // All easy
    for (let i = 0; i < n; i++) progression.push('easy');
  } else if (baseDiff === 'medium') {
    // 3 easy → rest medium
    for (let i = 0; i < n; i++) progression.push(i < 3 ? 'easy' : 'medium');
  } else {
    // Progressive: easy → medium → hard
    for (let i = 0; i < n; i++) {
      if (i < Math.floor(n * 0.3)) progression.push('easy');
      else if (i < Math.floor(n * 0.6)) progression.push('medium');
      else progression.push('hard');
    }
  }
  return progression;
}

function parseQuestion(rawText, fallbackDiff) {
  try {
    const clean = rawText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Find JSON in the response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const q = JSON.parse(jsonMatch[0]);
    return {
      question: q.question || 'Question',
      type: q.type || 'mcq',
      options: q.options || [],
      correct_answer: q.correct_answer || '',
      explanation: q.explanation || '',
      concept_tag: q.concept_tag || 'general',
      difficulty: q.difficulty || fallbackDiff,
      hint: q.hint || ''
    };
  } catch (e) {
    return null;
  }
}

function createFallbackQuestion(diff, concept) {
  return {
    question: `What is the main idea related to "${concept}" discussed in this content?`,
    type: 'mcq',
    options: [`Key points regarding ${concept}`, `Something unrelated to ${concept}`, `An opposite perspective`, `None of the above`],
    correct_answer: `Key points regarding ${concept}`,
    explanation: `The concept of "${concept}" was a key topic in the video. Review the relevant section for more details.`,
    concept_tag: concept,
    difficulty: diff,
    hint: `Think about what was explained about ${concept}`
  };
}

// ── Quiz Rendering ───────────────────────────────────────────
function renderQuestion() {
  const q = state.questions[state.currentQIndex];
  if (!q) return;

  // Progress
  const progress = ((state.currentQIndex) / state.questions.length) * 100;
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('qNum').textContent = `Q${state.currentQIndex + 1} / ${state.questions.length}`;
  document.getElementById('scoreDisplay').textContent = `Score: ${state.score}`;

  // Difficulty chip
  const chip = document.getElementById('diffChip');
  chip.textContent = q.difficulty.toUpperCase();
  chip.className = `diff-chip ${q.difficulty}`;

  // Colour the question card border by difficulty
  const questionCard = document.querySelector('#quizActive .question-card');
  if (questionCard) {
    questionCard.className = `question-card difficulty-${q.difficulty}`;
  }

  // Question
  document.getElementById('conceptLabel').textContent = q.concept_tag;
  document.getElementById('questionText').textContent = q.question;

  // Hint
  document.getElementById('hintText').textContent = q.hint || '';
  document.getElementById('hintText').classList.remove('visible');
  document.getElementById('hintRow').style.display = q.hint ? 'flex' : 'none';

  // Options
  const optionsList = document.getElementById('optionsList');
  const shortAnswerArea = document.getElementById('shortAnswerArea');
  optionsList.innerHTML = '';
  shortAnswerArea.classList.add('hidden');

  if (q.type === 'short_answer') {
    shortAnswerArea.classList.remove('hidden');
    document.getElementById('shortAnswerInput').value = '';
  } else {
    q.options.forEach((opt, i) => {
      const letters = ['A', 'B', 'C', 'D', 'E'];
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `
        <span class="option-letter">${letters[i] || i + 1}</span>
        <span>${opt.replace(/^[A-D]\)\s*/, '')}</span>
      `;
      btn.addEventListener('click', () => selectOption(btn, opt));
      optionsList.appendChild(btn);
    });
  }

  // Reset buttons
  document.getElementById('explanationCard').className = 'explanation-card';
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('submitBtn').style.display = 'block';
  document.getElementById('nextBtn').classList.remove('visible');
  state.selectedAnswer = null;
}

function selectOption(btn, optText) {
  if (document.getElementById('submitBtn').disabled) return;
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedAnswer = optText;
}

function setupQuizControls() {
  // Hint toggle
  document.getElementById('hintRow').addEventListener('click', () => {
    document.getElementById('hintText').classList.toggle('visible');
  });

  // Submit
  document.getElementById('submitBtn').addEventListener('click', submitAnswer);

  // Next
  document.getElementById('nextBtn').addEventListener('click', () => {
    state.currentQIndex++;
    if (state.currentQIndex >= state.questions.length) {
      showResults();
    } else {
      renderQuestion();
    }
  });

  // Retry
  document.getElementById('retryBtn').addEventListener('click', () => {
    switchTab('home');
  });

  document.getElementById('reviewMistakesBtn').addEventListener('click', () => {
    switchTab('stats');
  });
}

async function submitAnswer() {
  const q = state.questions[state.currentQIndex];
  let userAnswer;

  if (q.type === 'short_answer') {
    userAnswer = document.getElementById('shortAnswerInput').value.trim();
    if (!userAnswer) { showToast('Please write an answer', 'info'); return; }
  } else {
    if (!state.selectedAnswer) { showToast('Please select an answer', 'info'); return; }
    userAnswer = state.selectedAnswer;
  }

  document.getElementById('submitBtn').disabled = true;

  // Check correctness
  const isCorrect = checkAnswer(q, userAnswer);

  // Update score/streak
  if (isCorrect) {
    state.score++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.difficultyProgress[q.difficulty].correct++;
  } else {
    state.streak = 0;
  }
  state.difficultyProgress[q.difficulty].total++;

  // Track in history
  state.history.push({
    sessionId: state.sessionId,
    question: q.question,
    userAnswer,
    correctAnswer: q.correct_answer,
    correct: isCorrect,
    difficulty: q.difficulty,
    conceptTag: q.concept_tag,
    timestamp: Date.now()
  });
  state.answers.push({ q, userAnswer, isCorrect });

  // Visual feedback on options
  if (q.type !== 'short_answer') {
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.disabled = true;
      const optText = btn.querySelector('span:last-child')?.textContent;
      const optFull = q.options.find(o => o.replace(/^[A-D]\)\s*/, '') === optText);
      const isCorrectOpt = optFull && optFull.startsWith(q.correct_answer);

      if (isCorrectOpt) btn.classList.add('correct');
      else if (optFull && optFull === userAnswer) btn.classList.add('wrong');
    });
  }

  // Show explanation
  await showExplanation(q, userAnswer, isCorrect);

  // Update score display
  document.getElementById('scoreDisplay').textContent = `Score: ${state.score}`;
  document.getElementById('nextBtn').classList.add('visible');

  await saveHistory();
}

function checkAnswer(q, userAnswer) {
  if (q.type === 'short_answer') {
    const keywords = q.correct_answer.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
    const userLower = userAnswer.toLowerCase();
    return keywords.some(kw => userLower.includes(kw));
  }

  // For MCQ/true_false
  const correctLetter = q.correct_answer.replace(/[^A-Da-dTrFale].*/, '').toUpperCase();
  const selectedLetter = userAnswer.substring(0, 1).toUpperCase();
  return correctLetter === selectedLetter || userAnswer.toLowerCase().includes(q.correct_answer.toLowerCase());
}

async function showExplanation(q, userAnswer, isCorrect) {
  const card = document.getElementById('explanationCard');
  const expIcon = document.getElementById('expIcon');
  const expTitle = document.getElementById('expTitle');
  const expText = document.getElementById('expText');

  card.className = `explanation-card ${isCorrect ? 'correct' : 'wrong'}`;

  if (isCorrect) {
    expIcon.textContent = '✅';
    expTitle.textContent = state.streak > 2 ? `🔥 ${state.streak} streak! Correct!` : 'Correct!';
    expText.innerHTML = q.explanation || 'Well done!';
  } else {
    expIcon.textContent = '❌';
    expTitle.textContent = 'Incorrect — Let\'s learn this';
    expText.textContent = 'Loading detailed explanation...';

    // Get AI-powered explanation for wrong answers
    try {
      const context = state.rag.getContextForConcept(q.concept_tag);
      const prompt = state.rag.buildExplanationPrompt(q.question, userAnswer, q.correct_answer, context);
      const explanation = await callGemini(prompt);
      expText.innerHTML = formatExplanation(explanation);
    } catch (e) {
      expText.innerHTML = `<strong>Correct Answer: ${q.correct_answer}</strong><br>${q.explanation || 'Review this concept in the video.'}`;
    }
  }
}

function formatExplanation(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// ── Results ──────────────────────────────────────────────────
async function showResults() {
  document.getElementById('quizActive').classList.add('hidden');
  document.getElementById('quizResults').classList.remove('hidden');

  const total = state.questions.length;
  const scorePercent = Math.round((state.score / total) * 100);

  document.getElementById('finalScore').textContent = scorePercent + '%';

  let emoji, sub;
  if (scorePercent >= 90) { emoji = '🏆'; sub = 'Outstanding! You\'ve mastered this material.'; }
  else if (scorePercent >= 75) { emoji = '🎉'; sub = 'Great job! A little more review and you\'ll be an expert.'; }
  else if (scorePercent >= 60) { emoji = '📚'; sub = 'Good effort! Focus on the mistakes for improvement.'; }
  else { emoji = '💪'; sub = 'Keep practicing! Every attempt makes you stronger.'; }

  document.getElementById('resultsEmoji').textContent = emoji;
  document.getElementById('resultsSub').textContent = sub;

  // Breakdown
  const wrongAnswers = state.answers.filter(a => !a.isCorrect);
  document.getElementById('resultsBreakdown').innerHTML = `
    <div class="rb-item">
      <div class="rb-num" style="color:var(--emerald)">${state.score}</div>
      <div class="rb-label">Correct</div>
    </div>
    <div class="rb-item">
      <div class="rb-num" style="color:var(--rose)">${wrongAnswers.length}</div>
      <div class="rb-label">Wrong</div>
    </div>
    <div class="rb-item">
      <div class="rb-num" style="color:var(--amber)">${state.bestStreak}</div>
      <div class="rb-label">Best Streak</div>
    </div>
  `;

  // Save session
  await chrome.storage.local.get('sessions').then(({ sessions = [] }) => {
    sessions.push({
      sessionId: state.sessionId,
      videoTitle: state.videoMeta?.title?.substring(0, 60) || 'Practice Session',
      platform: state.videoMeta?.platform || 'Generic',
      score: scorePercent,
      correct: state.score,
      total,
      difficulty: state.difficulty,
      questionCount: total,
      conceptsCovered: [...new Set(state.questions.map(q => q.concept_tag))].slice(0, 5),
      timestamp: Date.now()
    });
    return chrome.storage.local.set({ sessions: sessions.slice(-50) });
  });

  updateStatsView();
}

// ── Tutor View ───────────────────────────────────────────────
function setupTutorControls() {
  const tutorSendBtn = document.getElementById('tutorSendBtn');
  const tutorInput = document.getElementById('tutorInput');
  
  if (!tutorSendBtn || !tutorInput) return;

  tutorSendBtn.addEventListener('click', async () => {
    await sendTutorMessage();
  });

  tutorInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      await sendTutorMessage();
    }
  });
}

async function initTutor() {
  if (state.tutorInitialized) return;
  
  const chatHistory = document.getElementById('tutorChatHistory');
  const emptyState = document.getElementById('tutorEmptyState');
  if (emptyState) emptyState.remove();

  // Show thinking
  const loadingId = 'tutor-init-loading';
  chatHistory.innerHTML += `<div id="${loadingId}" class="chat-msg tutor"><em>Preparing your lesson...</em></div>`;

  try {
    const prompt = state.rag.buildInitialGreetingPrompt();
    const reply = await callGemini(prompt, "You are an encouraging AI tutor. Be concise.");
    
    document.getElementById(loadingId).remove();
    
    state.tutorChatHistory.push({ role: 'tutor', text: reply });
    renderTutorMessage('tutor', reply);
    state.tutorInitialized = true;
  } catch (e) {
    document.getElementById(loadingId).remove();
    showToast('Failed to initialize tutor', 'error');
  }
}

function renderTutorMessage(role, text) {
  const chatHistory = document.getElementById('tutorChatHistory');
  if (!chatHistory) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${role}`;
  
  if (role === 'tutor') {
    msgDiv.innerHTML = `<strong>Tutor</strong><div class="msg-content" style="margin-top:4px">${text.replace(/\n/g, '<br>')}</div>`;
  } else {
    msgDiv.innerHTML = `<div class="msg-content">${text.replace(/\n/g, '<br>')}</div>`;
  }
  
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendTutorMessage() {
  const inputEl = document.getElementById('tutorInput');
  const text = inputEl.value.trim();
  if (!text) return;

  // Clear input
  inputEl.value = '';
  inputEl.disabled = true;

  // Add user message
  state.tutorChatHistory.push({ role: 'user', text });
  renderTutorMessage('user', text);

  const chatHistory = document.getElementById('tutorChatHistory');
  const loadingId = `loading-${Date.now()}`;
  chatHistory.innerHTML += `<div id="${loadingId}" class="chat-msg tutor"><em>Thinking...</em></div>`;
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const prompt = state.rag.buildTeachingPrompt(text, state.tutorChatHistory);
    const reply = await callGemini(prompt, "You are an encouraging AI tutor. Be concise, and evaluate their understanding if they try to answer a question.");
    
    document.getElementById(loadingId).remove();
    state.tutorChatHistory.push({ role: 'tutor', text: reply });
    renderTutorMessage('tutor', reply);
  } catch (e) {
    document.getElementById(loadingId).remove();
    showToast('Failed to get response', 'error');
  }
  
  inputEl.disabled = false;
  inputEl.focus();
}

// ── Stats View ───────────────────────────────────────────────
function updateStatsView() {
  const h = state.history;
  const total = h.length;
  const correct = h.filter(i => i.correct).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statCorrect').textContent = accuracy + '%';
  document.getElementById('statStreak').textContent = state.bestStreak;

  chrome.storage.local.get('sessions').then(({ sessions = [] }) => {
    document.getElementById('statSessions').textContent = sessions.length;
  });

  // Chart bars
  ['easy', 'medium', 'hard'].forEach(diff => {
    const dp = state.difficultyProgress[diff];
    const pct = dp.total > 0 ? (dp.correct / dp.total) * 100 : 0;
    const bar = document.getElementById(`bar${diff.charAt(0).toUpperCase() + diff.slice(1)}`);
    if (bar) bar.style.height = Math.max(4, pct) + '%';
  });

  // Mistakes list
  const mistakes = h.filter(i => !i.correct).slice(-10).reverse();
  const mistakeList = document.getElementById('mistakeList');
  if (mistakes.length === 0) {
    mistakeList.innerHTML = `<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-text">No mistakes yet!</div><div class="empty-sub">Start a quiz to track your progress</div></div>`;
  } else {
    mistakeList.innerHTML = mistakes.map(m => `
      <div class="mistake-item">
        <div class="mistake-concept">${m.conceptTag || 'Unknown concept'}</div>
        <div class="mistake-q">${m.question.substring(0, 80)}...</div>
      </div>
    `).join('');
  }
}

// ── Sessions View ────────────────────────────────────────────
async function loadSessionsView() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const list = document.getElementById('sessionsList');

  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No sessions yet</div><div class="empty-sub">Complete a quiz to see your history</div></div>`;
    return;
  }

  list.innerHTML = sessions.reverse().map(s => {
    const scoreClass = s.score >= 75 ? 'high' : s.score >= 50 ? 'mid' : 'low';
    const date = new Date(s.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return `
      <div class="session-item">
        <div class="session-top">
          <div class="session-title">${s.videoTitle || 'Practice Session'}</div>
          <div class="session-score ${scoreClass}">${s.score}%</div>
        </div>
        <div class="session-meta">
          <span>📅 ${date}</span>
          <span>❓ ${s.questionCount} Qs</span>
          <span>🎯 ${s.difficulty || 'mixed'}</span>
          <span>📺 ${s.platform || 'web'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── YouTube API Transcript Helpers ───────────────────────────

/**
 * Fetch transcript segments from the local backend.
 * Returns { segments, plain_text, language } or null on failure.
 */
async function fetchYouTubeTranscript(videoId) {
  try {
    const res = await fetch(`http://localhost:8000/transcript/${videoId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.log('[LearnFlow] Transcript API unavailable:', e.message);
    return null;
  }
}

/**
 * Auto-fetch a YouTube transcript and start the playback ticker.
 * Silently skips if the same video was already loaded.
 */
async function autoFetchYouTubeTranscript(tab, videoId) {
  if (state.lastAutoFetchedVideoId === videoId) return;
  const data = await fetchYouTubeTranscript(videoId);
  if (!data || !data.segments?.length) {
    console.log('[LearnFlow] No transcript available via API for', videoId);
    return;
  }
  state.transcriptSegments = data.segments;
  state.lastAutoFetchedVideoId = videoId;
  await ingestTranscript(data.plain_text, true);
  startPlaybackTicker(tab, data.segments);
  showToast(`📡 Transcript auto-loaded (${data.language}) — CC not required`, 'success');
}

/**
 * Poll the video's currentTime every 800ms and push the matching
 * transcript segment to the Live Learning Stream.
 */
function startPlaybackTicker(tab, segments) {
  if (state.tickerInterval) clearInterval(state.tickerInterval);
  let lastSegIdx = -1;

  state.tickerInterval = setInterval(async () => {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TIME' });
      const t = res?.currentTime ?? 0;

      // Scan backwards to find the last segment whose start <= currentTime
      let segIdx = -1;
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].start <= t) { segIdx = i; break; }
      }

      if (segIdx !== -1 && segIdx !== lastSegIdx) {
        lastSegIdx = segIdx;
        const seg = segments[segIdx];
        const accumulated = segments.slice(0, segIdx + 1).map(s => s.text).join(' ');

        // Push to the Live Learning Stream UI
        chrome.runtime.sendMessage({
          type: 'LIVE_TRANSCRIPT_UPDATE',
          text: seg.text,
          buffer: accumulated
        }).catch(() => {});

        // Silently update RAG every 15 new segments
        if (segIdx > 0 && segIdx % 15 === 0 && accumulated.length > 100) {
          ingestTranscript(accumulated, true);
        }
      }
    } catch (_) { /* tab may have navigated */ }
  }, 800);
}

// ── Gemini Local Backend Call ────────────────────────────────
async function callGemini(prompt, systemPrompt = '') {
  const url = 'http://localhost:8000/chat';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      system_instruction: systemPrompt || 'You are LearnFlow AI, an expert educational assessment engine. Generate high-quality practice questions.'
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.detail || `Backend error ${response.status}`);
  }

  const data = await response.json();
  return data.text;
}

// ── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}
