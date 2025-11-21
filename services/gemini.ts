import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";

// Audio Helpers
export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Service Class
class GeminiService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor() {
    // Ưu tiên lấy key từ LocalStorage nếu người dùng đã cài đặt
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('dh_gemini_api_key') : null;

    // Ensure process is defined before accessing to prevent crash in browser
    let envKey = '';
    try {
      if (typeof process !== 'undefined' && process.env) {
        envKey = process.env.API_KEY || '';
      }
    } catch (e) {
      // Ignore process error
    }

    this.apiKey = storedKey || envKey || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  get hasKey() {
    return !!this.apiKey;
  }

  // Hàm cập nhật API Key mới từ giao diện Cài đặt
  public updateApiKey(newKey: string) {
    this.apiKey = newKey;
    if (typeof window !== 'undefined') {
      localStorage.setItem('dh_gemini_api_key', newKey);
    }
    // Re-initialize AI instance with new key
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  // 1. Chat with Tools (RAG/Google Search)
  async chat(history: { role: string, parts: { text: string }[] }[], message: string, systemInstruction: string) {
    // Guidelines: Use ai.models.generateContent for chat interactions
    // Note: googleSearch tool cannot be combined with other tools like functionDeclarations
    const result = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: systemInstruction,
        tools: [
          { googleSearch: {} }
        ]
      }
    });

    return result;
  }

  // 2. Vocabulary Generation
  async generateDailyVocabulary(level: string, topic?: string) {
    const topicInstruction = topic ? `focusing on the topic: "${topic}"` : 'on general topics';
    const prompt = `Generate 5 advanced English vocabulary words for Level ${level} ${topicInstruction}.
    Return strictly JSON:
    [
      { "term": "word", "partOfSpeech": "noun/verb", "meaning": "vietnamese meaning", "definition": "english definition", "example": "example sentence" }
    ]`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '[]';
  }

  // 3. Grading Writing
  async gradeWritingPractice(level: string, question: string, userEssay: string) {
    const prompt = `Act as an English Teacher grading a writing practice for Level ${level}.
    Question: "${question}"
    Student's Essay: "${userEssay}"

    Task:
    1. Grade the essay (Score 0-10 or Band).
    2. Provide general feedback (in Vietnamese).
    3. List specific errors and corrections.
    4. Write a MODEL ANSWER (Sample Essay).
    5. Extract 3-5 advanced vocabulary words/phrases from the MODEL ANSWER.

    Return strictly JSON:
    {
        "score": "string",
        "generalFeedback": "string",
        "corrections": [
            { "original": "string", "correction": "string", "explanation": "string" }
        ],
        "sampleEssay": "string",
        "betterVocab": [
            { "word": "string", "meaning": "string", "context": "string" }
        ]
    }`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  // 4. Grammar Quiz Generation
  async generateGrammarQuiz(level: string, topic?: string) {
    const topicInstruction = topic ? `focusing on grammar point: "${topic}"` : 'mixed grammar points';
    const prompt = `Generate 10 Grammar Questions Level ${level} ${topicInstruction}.
    Return strictly JSON:
    [
      {
        "id": 1,
        "type": "multiple-choice", 
        "question": "Question text...",
        "options": ["A", "B", "C", "D"],
        "correctAnswer": "A"
      }
    ]`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '[]';
  }

  // 5. Grade Grammar Quiz
  async gradeGrammarQuiz(level: string, questions: any[], userAnswers: any) {
    const prompt = `Grade this Grammar Quiz (Level ${level}).
    Questions: ${JSON.stringify(questions)}
    User Answers: ${JSON.stringify(userAnswers)}
    Return strictly JSON:
    {
      "score": number (0-10),
      "results": [ { "id": number, "isCorrect": boolean, "explanation": "string" } ]
    }`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  // 6. Connect Live (Realtime)
  async connectLive(
    voiceName: string,
    onAudioData: (data: ArrayBuffer) => void,
    onTranscription: (user: string, model: string) => void,
    systemInstruction: string
  ) {
    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => console.log('Live session connected'),
        onmessage: (msg: LiveServerMessage) => {
          if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            const base64 = msg.serverContent.modelTurn.parts[0].inlineData.data;
            const bytes = base64ToUint8Array(base64);
            onAudioData(bytes.buffer);
          }
        },
        onclose: () => console.log('Live session closed'),
        onerror: (err) => console.error('Live session error', err),
      },
      config: {
        systemInstruction: systemInstruction,
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Puck' } }
        }
      }
    });

    return sessionPromise;
  }

  // 7. Reading Passage Generation (New)
  async generateReadingPassage(level: string, topic: string) {
    const prompt = `Write an engaging reading passage (approx 300-400 words) for English Level ${level} about "${topic}".
    Include a title.
    Return strictly JSON:
    {
        "title": "string",
        "content": "string (paragraphs separated by \\n\\n)",
        "summary": "string (brief summary in Vietnamese)",
        "keywords": [
            { "word": "string", "meaning": "string", "type": "noun/verb/adj" }
        ]
    }`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  // 8. Quick Dictionary Lookup (New)
  async lookupDictionary(word: string, context: string) {
    const prompt = `Define the word "${word}" in this context: "${context}".
      Return strictly JSON:
      {
          "word": "${word}",
          "ipa": "string",
          "type": "noun/verb/etc",
          "meaning_vi": "Vietnamese meaning",
          "definition_en": "English definition",
          "example": "Example sentence"
      }`;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  // 9. Generate Writing Topic (New)
  async generateWritingTopic(level: string, type: 'task1' | 'task2') {
    const typeDesc = type === 'task1' ? 'Letter writing (General) or Graph description (Academic)' : 'Essay writing (Opinion, Problem-Solution, etc.)';
    const prompt = `Generate a random Writing Topic for ${typeDesc} at Level ${level}.
      Return strictly plain text (the question only).`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || '';
  }
}

export const geminiService = new GeminiService();