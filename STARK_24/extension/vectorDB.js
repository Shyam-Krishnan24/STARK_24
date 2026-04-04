// ============================================================
// LearnFlow AI — Vector Store + RAG Engine (vectorDB.js)
// ============================================================

class SimpleVectorStore {
  constructor() {
    this.documents = [];
    this.docFreq = {};
  }

  _tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\\s]/g, '').split(/\\s+/).filter(w => w.length > 2);
  }

  _cosineSim(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  _getTFIDFVector(words) {
    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    
    // Build a sparse vector using a hash of each word
    const vec = new Float32Array(512).fill(0);
    const N = Math.max(this.documents.length, 1);

    Object.entries(freq).forEach(([word, count]) => {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
      }
      const idx = hash % 512;
      
      const df = this.docFreq[word] || 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5)); // BM25-like IDF

      vec[idx] += (count / words.length) * idf;
    });

    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }

  addDocument(doc) {
    this.documents.push(doc);
    const words = [...new Set(this._tokenize(doc.content))];
    words.forEach(w => {
      this.docFreq[w] = (this.docFreq[w] || 0) + 1;
    });
    return this.documents.length - 1;
  }

  query(queryText, topK = 5) {
    if (this.documents.length === 0) return [];
    
    const qEmbed = this._getTFIDFVector(this._tokenize(queryText));
    const docEmbeds = this.documents.map(d => this._getTFIDFVector(this._tokenize(d.content)));

    const scores = docEmbeds.map((emb, i) => ({
      score: this._cosineSim(qEmbed, emb),
      doc: this.documents[i],
      idx: i
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).filter(s => s.score > 0.01);
  }

  clear() {
    this.documents = [];
    this.docFreq = {};
  }
}

class LearnFlowRAG {
  constructor() {
    this.vectorStore = new SimpleVectorStore();
    this.sessionId = null;
    this.concepts = [];
    this.transcriptChunks = [];
  }

  // ── Transcript Ingestion ──────────────────────────────────

  ingestTranscript(transcript, videoMeta) {
    this.sessionId = `session_${Date.now()}`;
    this.vectorStore.clear();
    this.transcriptChunks = [];

    // Chunk into ~200-word segments with overlap
    const words = transcript.split(/\s+/);
    const chunkSize = 200;
    const overlap = 40;

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length < 20) continue;

      const doc = {
        id: `chunk_${i}`,
        content: chunk,
        type: 'transcript',
        videoTitle: videoMeta?.title || 'Unknown',
        videoUrl: videoMeta?.url || '',
        timestamp: videoMeta?.timestamps?.[i] || 0,
        chunkIndex: this.transcriptChunks.length
      };

      this.vectorStore.addDocument(doc);
      this.transcriptChunks.push(doc);
    }

    // Extract concepts
    this.concepts = this._extractConcepts(transcript);
    return {
      chunkCount: this.transcriptChunks.length,
      concepts: this.concepts,
      sessionId: this.sessionId
    };
  }

  _extractConcepts(text) {
    // Heuristic: find noun phrases, capitalized terms, repeated important words
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    const wordFreq = {};
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being',
      'have','has','had','do','does','did','will','would','could','should','may','might',
      'shall','can','need','dare','ought','used','this','that','these','those','i','we',
      'you','he','she','it','they','what','which','who','whom','when','where','why','how',
      'and','or','but','if','because','as','until','while','of','at','by','for','with',
      'about','against','between','into','through','during','before','after','above',
      'below','to','from','up','down','in','out','on','off','over','under','then','once']);

    text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
      if (!stopWords.has(w) && w.length > 3) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    });

    const concepts = Object.entries(wordFreq)
      .filter(([, freq]) => freq >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);

    return concepts;
  }

  // ── Context Retrieval for Questions ──────────────────────

  getContextForConcept(concept, topK = 3) {
    const results = this.vectorStore.query(concept, topK);
    return results.map(r => r.doc.content).join('\n\n');
  }

  // ── Question Generation Prompts ───────────────────────────

  buildQuestionPrompt(difficulty, performanceHistory, concept) {
    const context = this.getContextForConcept(concept || this.concepts[0] || 'main topic', 4);
    const errorPatterns = this._analyzeErrors(performanceHistory);

    const difficultyInstructions = {
      easy: "Bloom's Taxonomy Level: Remember & Understand. Generate a straightforward factual recall question directly sourced from the text.",
      medium: "Bloom's Taxonomy Level: Apply & Analyze. Generate a comprehension question requiring relationship analysis between concepts.",
      hard: "Bloom's Taxonomy Level: Evaluate & Synthesize. Generate a complex question requiring deep reasoning and synthesis of multiple points."
    };

    const remedialSection = errorPatterns.length > 0
      ? `\\nPrevious mistakes detected on topics: ${errorPatterns.join(', ')}. Include a question that revisits one of these concepts if relevant.\\n`
      : '';

    return `You are an expert educational assessment designer. Based on the following lecture content, generate a high-quality practice question.

CONTEXT FROM LECTURE:
"""
${context}
"""

KEY CONCEPTS IN THIS LESSON: ${this.concepts.slice(0, 10).join(', ')}
${remedialSection}
DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
INSTRUCTION: ${difficultyInstructions[difficulty]}

Generate exactly ONE question in this JSON format. DO NOT include markdown formatting or conversational text outside the JSON object:
{
  "question": "The question text",
  "type": "mcq",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "Exact text of the correct option (e.g. 'A) ...')",
  "explanation": "Detailed explanation of why this is correct and the underlying concept",
  "concept_tag": "the main concept this tests",
  "difficulty": "${difficulty}",
  "hint": "A subtle hint without giving away the answer"
}

Ensure the question is a standard 4-option multiple-choice question format.
Return ONLY the JSON object.`;
  }

  buildExplanationPrompt(question, userAnswer, correctAnswer, context) {
    return `You are a patient, encouraging tutor. A student answered a question incorrectly and needs help understanding the concept.

QUESTION: ${question}
STUDENT'S ANSWER: ${userAnswer}
CORRECT ANSWER: ${correctAnswer}

RELEVANT LECTURE CONTENT:
"""
${context}
"""

Provide a warm, encouraging explanation that:
1. Acknowledges what they got right (if anything)
2. Clearly explains why the correct answer is right
3. Explains the underlying concept with a simple analogy or example
4. Gives a memory tip or mnemonic to remember this
5. Suggests what to review in the lecture

Keep response under 200 words. Be conversational and supportive, not clinical.`;
  }

  // ── Tutor Mode Prompts ────────────────────────────────────

  buildInitialGreetingPrompt() {
    const context = this.transcriptChunks.slice(0, 3).map(c => c.content).join(' ');
    return `You are an expert, encouraging AI learning tutor. Introduce yourself briefly and welcome the user. 
Based on the beginning of the video transcript: "${context.substring(0, 500)}...", briefly summarize what they are about to learn and suggest 2 or 3 topics they can ask you about. Keep it conversational and under 100 words.`;
  }

  buildTeachingPrompt(userMessage, chatHistory) {
    // Attempt to extract keywords from user's message to fetch context
    const words = userMessage.split(/\\s+/);
    const searchTerms = words.length > 2 ? words.join(' ') : (this.concepts[0] || 'main topic');
    const context = this.getContextForConcept(searchTerms, 4);

    return `You are a patient, encouraging AI learning tutor. 
    
RELEVANT LECTURE CONTENT:
"""
${context}
"""

TUTOR HYBRID MODE INSTRUCTIONS:
Read the user's message.
1. Answer their question or explain the concept clearly and concisely using analogies where helpful. Focus on the actual lecture content provided.
2. HYBRID EXPLANATION AND TEST MODE: After your explanation, ALWAYS ask a quick "Check for Understanding" question to see if they grasp the concept. This can be a simple scenario, an open-ended thought experiment, or a multiple-choice question.
3. Keep your response conversational, encouraging, and directly related to the provided lecture content. If the information isn't in the transcript, mention that but provide reliable general knowledge to help them.

Respond directly to the user's input: "${userMessage}"`;
  }

  _analyzeErrors(history) {
    if (!history || history.length === 0) return [];
    const wrongAnswers = history.filter(h => !h.correct);
    const conceptErrors = wrongAnswers.map(h => h.conceptTag).filter(Boolean);
    const freq = {};
    conceptErrors.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([concept]) => concept);
  }
}

// Export for use in extension
if (typeof module !== 'undefined') {
  module.exports = { SimpleVectorStore, LearnFlowRAG };
}
