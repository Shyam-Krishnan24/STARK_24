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

  // Performance tracking
  history: [],
  difficultyProgress: { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } }
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
  const warn = document.getElementById('apiWarning');
  if (!state.apiKey) {
    warn.style.display = 'block';
    document.getElementById('inlineApiSave').addEventListener('click', async () => {
      const key = document.getElementById('inlineApiKey').value.trim();
      if (key) {
        state.apiKey = key;
        await chrome.storage.local.set({ apiKey: key });
        warn.style.display = 'none';
        showToast('🔑 API key saved!', 'success');
      }
    });
  } else {
    warn.style.display = 'none';
  }
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
  });

  document.getElementById('btnProcessPaste').addEventListener('click', () => {
    const text = document.getElementById('pasteTextarea').value.trim();
    if (text.length < 50) { showToast('⚠️ Please enter more text', 'error'); return; }
    ingestTranscript(text);
    document.getElementById('pasteArea').classList.add('hidden');
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
    await chrome.tabs.sendMessage(tab.id, { type: 'START_CAPTURE' });
    state.isCapturing = true;
    btn.querySelector('.method-icon').textContent = '⏹';
    btn.querySelector('.method-name').textContent = 'Stop Capture';
    btn.style.borderColor = 'var(--rose)';
    btn.style.color = 'var(--rose)';
    showToast('🔴 Live capture started! Watch the video.', 'info');

    // Auto-pull transcript every 10 seconds
    state.captureInterval = setInterval(async () => {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'GET_LIVE_TRANSCRIPT' });
      if (r?.transcript && r.transcript.length > 100) {
        await ingestTranscript(r.transcript, true);
      }
    }, 10000);

  } else {
    clearInterval(state.captureInterval);
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'STOP_CAPTURE' });
    state.isCapturing = false;
    btn.querySelector('.method-icon').textContent = '🔴';
    btn.querySelector('.method-name').textContent = 'Live Capture';
    btn.style.borderColor = '';
    btn.style.color = '';

    if (result?.transcript && result.transcript.length > 50) {
      await ingestTranscript(result.transcript);
      showToast('✅ Capture complete!', 'success');
    }
  }
}

function setupLiveTranscriptListener() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'LIVE_TRANSCRIPT_UPDATE' && msg.buffer) {
      // Silently update buffer
      if (msg.buffer.length > state.transcript.length) {
        state.transcript = msg.buffer;
      }
    }
  });
}

// ── Transcript Ingestion ─────────────────────────────────────
async function ingestTranscript(text, silent = false) {
  if (!text || text.length < 50) return;

  state.transcript = text;
  const result = state.rag.ingestTranscript(text, state.videoMeta);

  // Update UI
  const statusEl = document.getElementById('transcriptStatus');
  const metaEl = document.getElementById('transcriptMeta');
  const conceptsSection = document.getElementById('conceptsSection');
  const conceptTags = document.getElementById('conceptTags');

  statusEl.classList.remove('hidden');
  metaEl.textContent = `${text.split(' ').length.toLocaleString()} words · ${result.concepts.length} concepts · ${result.chunkCount} chunks`;

  // Show concept tags
  if (result.concepts.length > 0) {
    conceptsSection.classList.remove('hidden');
    conceptTags.innerHTML = result.concepts.slice(0, 12).map(c =>
      `<span class="concept-tag">${c}</span>`
    ).join('');
  }

  if (!silent) showToast(`📚 ${result.chunkCount} chunks indexed in vector store`, 'success');
}

// ── Quiz Start ───────────────────────────────────────────────
async function startQuiz() {
  if (!state.apiKey) {
    showToast('⚠️ Please add your Gemini API key first', 'error');
    document.getElementById('apiWarning').style.display = 'block';
    return;
  }

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

  for (let i = 0; i < state.questionCount; i++) {
    loadingText.textContent = `Question ${i + 1} of ${state.questionCount}...`;
    const diff = diffProgression[i];
    const concept = state.rag.concepts[i % state.rag.concepts.length] || 'main topic';

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
    type: 'short_answer',
    options: [],
    correct_answer: concept,
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

// ── Gemini API Call ──────────────────────────────────────────
async function callGemini(prompt, systemPrompt = '') {
  if (!state.apiKey) throw new Error('No API key');

  const MODEL = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${state.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: (systemPrompt || 'You are LearnFlow AI, an expert educational assessment engine. Generate high-quality practice questions.') + '\n\n' + prompt
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
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Invalid response format from Gemini API');
}

// ── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}
