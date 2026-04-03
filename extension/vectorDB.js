// ============================================================
// LearnFlow AI — Vector Store + RAG Engine (vectorDB.js)
// ============================================================

class SimpleVectorStore {
  constructor() {
    this.documents = [];
    this.embeddings = [];
  }

  // Lightweight TF-IDF style embedding (no external API needed)
  _embed(text) {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

    // Build a sparse vector using a hash of each word
    const vec = new Float32Array(512).fill(0);
    Object.entries(freq).forEach(([word, count]) => {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
      }
      const idx = hash % 512;
      vec[idx] += count / words.length;
    });

    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }

  _cosineSim(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  addDocument(doc) {
    const embedding = this._embed(doc.content);
    this.documents.push(doc);
    this.embeddings.push(embedding);
    return this.documents.length - 1;
  }

  query(queryText, topK = 5) {
    if (this.documents.length === 0) return [];
    const qEmbed = this._embed(queryText);
    const scores = this.embeddings.map((emb, i) => ({
      score: this._cosineSim(qEmbed, emb),
      doc: this.documents[i],
      idx: i
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).filter(s => s.score > 0.01);
  }

  clear() {
    this.documents = [];
    this.embeddings = [];
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
    const context = this.getContextForConcept(concept || this.concepts[0] || 'main topic');
    const errorPatterns = this._analyzeErrors(performanceHistory);

    const difficultyInstructions = {
      easy: 'Generate a straightforward recall or definition question. The answer should be directly stated in the context.',
      medium: 'Generate a comprehension or application question that requires understanding relationships between concepts.',
      hard: 'Generate an analysis or synthesis question requiring deep understanding, comparison, or real-world application.'
    };

    const remedialSection = errorPatterns.length > 0
      ? `\nPrevious mistakes detected on topics: ${errorPatterns.join(', ')}. Include a question that revisits one of these concepts.\n`
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

Generate exactly ONE question in this JSON format:
{
  "question": "The question text",
  "type": "mcq" | "true_false" | "short_answer",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A",
  "explanation": "Detailed explanation of why this is correct and the underlying concept",
  "concept_tag": "the main concept this tests",
  "difficulty": "${difficulty}",
  "hint": "A subtle hint without giving away the answer"
}

For true/false, options should be ["True", "False"] and correct_answer should be "True" or "False".
For short_answer, omit options and set correct_answer to the ideal answer keywords.
Return ONLY the JSON object, no other text.`;
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
