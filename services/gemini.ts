
import { GoogleGenAI, LiveServerMessage, Modality, GenerateContentResponse, Chat, Content, Type } from "@google/genai";
import { Transaction } from "../types";
import { MarketAnalysisResult } from "./financial";
import { firebaseService } from "./firebase";

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

// --- Updated Interfaces ---

export interface AIFinancialAnalysis {
  healthScore: number; // 0 - 100
  healthRating: string; // e.g., "Excellent", "Needs Improvement"
  keyTrends: string[];
  anomalies: string[]; // Unusual spending
  sentiment: string; // General summary
}

export interface AIFinancialPlan {
  recommendedBudgets: {
    name: string;
    limit: number;
    type: 'expense' | 'investment';
    reason: string;
  }[];
  recommendedGoals: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    type: 'savings' | 'investment' | 'asset';
    deadline?: string;
    reason: string;
  }[];
  debtStrategy: string; // Advice on paying off debts
  cashflowInsight: string;
}

export interface SpeakingSuggestion {
  hints: string[];
  sampleAnswer: string;
  vietnameseTranslation: string;
}

type AIProvider = 'google' | 'openai';

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string = '';
  private provider: AIProvider = 'google';

  constructor() {
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('dh_gemini_api_key') : null;
    let envKey = '';
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        envKey = process.env.API_KEY;
      }
    } catch (e) { }

    const keyToUse = storedKey || envKey;
    if (keyToUse) {
      this.initializeModel(keyToUse);
    }
  }

  public initializeModel(apiKey: string) {
    if (!apiKey) return;
    this.apiKey = apiKey;

    // Intelligent Provider Detection
    if (apiKey.startsWith('sk-')) {
      this.provider = 'openai';
      this.ai = null; // OpenAI does not use the GoogleGenAI instance
      console.log("🤖 AI Model Initialized (OpenAI Provider)");
    } else {
      this.provider = 'google';
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      console.log("🤖 AI Model Initialized (Google Gemini Provider)");
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('dh_gemini_api_key', apiKey);
    }
  }

  public updateApiKey(newKey: string) {
    this.initializeModel(newKey);
  }

  public removeApiKey() {
    this.apiKey = '';
    this.ai = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dh_gemini_api_key');
    }
    console.log("🤖 AI Model Credential Removed");
  }

  public hasKey(): boolean {
    return !!this.apiKey;
  }

  async validateKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      if (this.provider === 'openai') {
        await this.callOpenAI("Hello", false);
        return true;
      } else {
        if (!this.ai) return false;
        await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: 'Hello',
        });
        return true;
      }
    } catch (e) {
      console.error("API Key Validation Failed:", e);
      return false;
    }
  }

  // --- POLICY ENFORCEMENT ---
  private async enforcePolicy() {
    const user = firebaseService.auth.currentUser;

    // Admin Bypass
    if (user && user.email === firebaseService.ADMIN_EMAIL) return;

    const specificErrorMsg = "Vui lòng liên hệ Admin để mở khóa tính năng AI và lưu trữ dữ liệu của bạn";

    // 1. Block Guests
    if (!user) {
      throw new Error(specificErrorMsg);
    }

    // 2. Block Unauthorized Users
    const isAuth = await firebaseService.isUserAuthorized();
    if (!isAuth) {
      throw new Error(specificErrorMsg);
    }

    // 3. Check API Key existence (Double check)
    if (!this.apiKey) {
      throw new Error("Vui lòng nhập API Key trong phần Cài đặt.");
    }
  }

  // --- OPENAI ADAPTER HELPER ---
  private async callOpenAI(prompt: string, jsonMode: boolean = false, systemInstruction?: string): Promise<string> {
    // Ensure system instruction exists for JSON mode to improve reliability
    const effectiveSystemInstruction = systemInstruction || (jsonMode ? "You are a helpful assistant. You must output strictly valid JSON." : undefined);

    const messages = [];
    if (effectiveSystemInstruction) messages.push({ role: "system", content: effectiveSystemInstruction });
    messages.push({ role: "user", content: prompt });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Use cost-effective model as default
        messages: messages,
        response_format: jsonMode ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "OpenAI API Error");
    }

    const data = await response.json();
    return data.choices[0].message.content || "";
  }

  // --- 1. CURRENT SITUATION ANALYSIS ---
  async analyzeFinancialSituation(transactions: Transaction[]): Promise<AIFinancialAnalysis> {
    await this.enforcePolicy();
    const recentTrans = transactions.slice(0, 100).map(t => ({
      date: t.date, amount: t.amount, type: t.type, category: t.category
    }));

    const prompt = `
      You are a strict Financial Auditor. Analyze the user's recent transaction history (Vietnam context).
      Data: ${JSON.stringify(recentTrans)}

      Task:
      1. Calculate a 'Health Score' (0-100) based purely on past behavior: income stability, expense control, and spending consistency.
      2. Identify 3 key spending trends (e.g., "Chi tiêu ăn uống tăng cao", "Thu nhập ổn định").
      3. Identify anomalies or warnings (e.g., "Giao dịch lớn bất thường", "Tần suất rút tiền cao").
      4. Provide a sentiment summary in Vietnamese evaluating the CURRENT situation (Keep it concise for a dashboard summary).

      Output strictly valid JSON object:
      {
        "healthScore": number,
        "healthRating": "Xuất sắc" | "Tốt" | "Khá" | "Cần cải thiện" | "Báo động",
        "keyTrends": ["trend 1", "trend 2", "trend 3"],
        "anomalies": ["warning 1", "warning 2"],
        "sentiment": "Vietnamese summary of current status..."
      }
      `;

    try {
      let text = '';
      if (this.provider === 'openai') {
        text = await this.callOpenAI(prompt, true);
      } else {
        const response = await this.ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        text = response.text || '{}';
      }
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("AI Analysis Error", e);
      throw e;
    }
  }

  // --- 2. PLAN BUILDER (Budget, Goals, Debt) ---
  async buildFinancialPlan(transactions: Transaction[]): Promise<AIFinancialPlan> {
    await this.enforcePolicy();

    const recentTrans = transactions.slice(0, 100).map(t => ({
      date: t.date, amount: t.amount, type: t.type, category: t.category
    }));

    const prompt = `
    You are an expert Financial Planner for a user in **Vietnam**.
    Context: All monetary values are in VND (Vietnam Dong).
    Data: ${JSON.stringify(recentTrans)}
    
    Task: Create a FUTURE plan.
    1. Suggest 3-5 Monthly Budgets based on the 50/30/20 rule and actual spending habits.
    2. Suggest 2 Financial Goals (1 short term, 1 long term) that are realistic.
    3. Suggest a specific debt repayment or savings strategy.
    4. Provide a cashflow optimization insight in Vietnamese.

    Constraint: Return strictly valid JSON object.
    {
        "recommendedBudgets": [
            { "name": "string", "limit": number, "type": "expense", "reason": "string" }
        ],
        "recommendedGoals": [
            { "name": "string", "targetAmount": number, "currentAmount": 0, "type": "savings", "deadline": "YYYY-MM-DD", "reason": "string" }
        ],
        "debtStrategy": "string (Vietnamese)",
        "cashflowInsight": "string (Vietnamese)"
    }
    `;

    try {
      let text = '';
      if (this.provider === 'openai') {
        text = await this.callOpenAI(prompt, true);
      } else {
        const response = await this.ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        text = response.text || '{}';
      }
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("AI Planning Error", e);
      throw e;
    }
  }

  // Keep this for backward compatibility if needed, but implementation routes to buildFinancialPlan
  async analyzeFinances(transactions: Transaction[]): Promise<AIFinancialPlan> {
    return this.buildFinancialPlan(transactions);
  }

  async analyzeMarket(prompt: string): Promise<MarketAnalysisResult> {
    await this.enforcePolicy();
    try {
      let text = '';
      if (this.provider === 'openai') {
        // Ensure prompt explicitly asks for JSON for OpenAI
        text = await this.callOpenAI(prompt + "\nIMPORTANT: Return strictly valid JSON object matching the schema.", true);
      } else {
        const response = await this.ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        text = response.text || '{}';
      }
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("AI Market Analysis Error", e);
      throw e;
    }
  }

  async searchContent(prompt: string): Promise<string> {
    await this.enforcePolicy();
    try {
      if (this.provider === 'openai') {
        // OpenAI does not support Google Search grounding directly. 
        // We will just ask the model (knowledge cutoff might apply).
        return await this.callOpenAI(prompt + "\n(Note: Provide best known info, indicate if data might be outdated)", false);
      } else {
        const response = await this.ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          }
        });
        return response.text || "Không tìm thấy thông tin.";
      }
    } catch (e) {
      console.error("Search Error", e);
      throw e;
    }
  }

  async *chatStream(
    history: { role: string, parts: { text: string }[] }[],
    message: string,
    systemInstruction: string
  ) {
    // Policy check inside will throw if guest
    await this.enforcePolicy();

    if (this.provider === 'openai') {
      // OpenAI Adapter for Streaming
      const messages = history.map(h => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts[0].text
      }));
      if (systemInstruction) messages.unshift({ role: "system", content: systemInstruction });
      messages.push({ role: "user", content: message });

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messages,
          stream: true
        })
      });

      if (!response.body) throw new Error("No response body from OpenAI");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const jsonStr = line.trim().slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const json = JSON.parse(jsonStr);
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                // Mimic Google GenAI response structure
                yield { text: content } as any;
              }
            } catch (e) { }
          }
        }
      }

    } else {
      // Google Gemini Implementation
      const chat = this.ai!.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
          temperature: 0.7,
        },
        history: history as Content[]
      });

      try {
        const result = await chat.sendMessageStream({ message });
        for await (const chunk of result) {
          yield chunk as GenerateContentResponse;
        }
      } catch (error) {
        console.error("Chat Stream Error:", error);
        throw error;
      }
    }
  }

  async generateDailyVocabulary(level: string, topic?: string) {
    await this.enforcePolicy();
    const topicInstruction = topic ? `focusing on the topic: "${topic}"` : 'on general topics';

    // Default Prompt
    let prompt = `Generate 5 advanced English vocabulary words for Level ${level} ${topicInstruction}. 
    Return strictly JSON array of objects with:
    - term: the word
    - ipa: IPA phonetic transcription (e.g., /həˈləʊ/)
    - partOfSpeech: noun, verb, etc.
    - meaning: Vietnamese translation
    - definition: English definition
    - example: Example sentence`;

    if (this.provider === 'openai') {
      // For OpenAI, wrap the array in an object to satisfy json_object mode
      prompt = `Generate 5 advanced English vocabulary words for Level ${level} ${topicInstruction}. 
        Return a strictly valid JSON object with a key "items" containing an array of objects.
        Structure: { "items": [{ "term": "...", "ipa": "...", "partOfSpeech": "...", "meaning": "...", "definition": "...", "example": "..." }] }`;

      const jsonStr = await this.callOpenAI(prompt, true);
      try {
        const parsed = JSON.parse(jsonStr);
        // Unwrap for the UI
        return JSON.stringify(parsed.items || []);
      } catch (e) {
        return '[]';
      }
    }

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '[]';
  }

  async gradeWritingPractice(level: string, question: string, userEssay: string) {
    await this.enforcePolicy();
    const prompt = `Grade essay Level ${level}. Question: ${question}. Essay: ${userEssay}. Return valid JSON object {score, generalFeedback, corrections: [{original, correction, explanation}], sampleEssay, betterVocab}.`;

    if (this.provider === 'openai') {
      return await this.callOpenAI(prompt, true);
    }

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async generateGrammarQuiz(level: string, topic?: string) {
    await this.enforcePolicy();

    if (this.provider === 'openai') {
      const prompt = `Generate 10 Grammar Questions Level ${level} ${topic ? `about ${topic}` : ''}. 
        Return a strictly valid JSON object with a key "questions" containing an array of objects.
        Structure: { "questions": [{ "id": 1, "question": "...", "options": ["..."], "correctAnswer": "..." }] }`;

      const jsonStr = await this.callOpenAI(prompt, true);
      try {
        const parsed = JSON.parse(jsonStr);
        return JSON.stringify(parsed.questions || []);
      } catch (e) {
        return '[]';
      }
    }

    const prompt = `Generate 10 Grammar Questions Level ${level} ${topic ? `about ${topic}` : ''}. Return strictly JSON array.`;
    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '[]';
  }

  async gradeGrammarQuiz(level: string, questions: any[], userAnswers: any) {
    await this.enforcePolicy();
    const prompt = `Grade Grammar Quiz Level ${level}. Questions: ${JSON.stringify(questions)}. User Answers: ${JSON.stringify(userAnswers)}. Return valid JSON object {score, results: [{id, isCorrect, explanation}]}.`;

    if (this.provider === 'openai') {
      return await this.callOpenAI(prompt, true);
    }

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async generateReadingPassage(level: string, topic: string) {
    await this.enforcePolicy();
    const prompt = `Write reading passage Level ${level} about "${topic}". Return valid JSON object {title, content, summary, keywords}.`;

    if (this.provider === 'openai') {
      return await this.callOpenAI(prompt, true);
    }

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async lookupDictionary(word: string, context: string) {
    await this.enforcePolicy();
    const prompt = `Define "${word}" in context: "${context}". Return valid JSON object {word, ipa, type, meaning_vi, definition_en, example}.`;

    if (this.provider === 'openai') {
      return await this.callOpenAI(prompt, true);
    }

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async generateWritingTopic(level: string, type: 'task1' | 'task2') {
    await this.enforcePolicy();
    const prompt = `Generate Writing Topic ${type} Level ${level}. Return text only.`;

    if (this.provider === 'openai') {
      return await this.callOpenAI(prompt, false);
    }

    const response = await this.ai!.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return response.text || '';
  }

  // --- Live API with Transcription ---
  async connectLive(
    voiceName: string,
    onAudio: (data: ArrayBuffer) => void,
    onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void,
    sysInstr: string
  ) {
    await this.enforcePolicy();

    if (this.provider === 'openai') {
      throw new Error("OpenAI Key detected. Live API (Realtime Audio) is currently only available with Google Gemini API Keys.");
    }

    // System Instruction must be correct Content type
    const systemInstructionContent = { parts: [{ text: sysInstr }] };

    return this.ai!.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => console.log('Live connected'),
        onmessage: (msg: LiveServerMessage) => {
          // 1. Audio Output
          if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            onAudio(base64ToUint8Array(msg.serverContent.modelTurn.parts[0].inlineData.data).buffer);
          }

          // 2. Transcription Output (Model)
          if (msg.serverContent?.outputTranscription?.text) {
            onTranscript(msg.serverContent.outputTranscription.text, false, false);
          }

          // 3. Transcription Input (User)
          if (msg.serverContent?.inputTranscription?.text) {
            onTranscript(msg.serverContent.inputTranscription.text, true, false);
          }

          // 4. Turn Complete (Signal to process full context)
          if (msg.serverContent?.turnComplete) {
            onTranscript("", false, true);
          }
        },
        onclose: () => console.log('Live closed'),
        onerror: (e) => console.error('Live error', e),
      },
      config: {
        systemInstruction: systemInstructionContent as any, // Cast if type def mismatch
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName || 'Puck'
            }
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }
    });
  }

  // --- Speaking Suggestions ---
  async generateSpeakingSuggestions(lastAIQuestion: string): Promise<SpeakingSuggestion> {
    await this.enforcePolicy();
    if (!lastAIQuestion) return { hints: [], sampleAnswer: "", vietnameseTranslation: "" };

    const prompt = `
      You are an English Tutor. The AI interlocutor just said: "${lastAIQuestion}".
      
      Task: Help the user reply or answer this.
      1. Provide 3 short, useful English hints/phrases/vocabulary.
      2. Provide 1 full, natural Sample Answer (CEFR B2/C1 Level).
      3. Provide Vietnamese translation for the Sample Answer.

      Output strictly valid JSON object:
      {
        "hints": ["hint 1", "hint 2", "hint 3"],
        "sampleAnswer": "Full text answer...",
        "vietnameseTranslation": "Dịch câu trả lời mẫu..."
      }
      `;

    try {
      let text = '';
      if (this.provider === 'openai') {
        text = await this.callOpenAI(prompt, true);
      } else {
        const response = await this.ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        text = response.text || '{}';
      }
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("Error generating speaking suggestions", e);
      return { hints: [], sampleAnswer: "Could not generate suggestions.", vietnameseTranslation: "" };
    }
  }

  // --- Monologue Hint Generation (Fixed) ---
  async generateMonologueScript(topic: string, level: string): Promise<{ script: string, translation: string }> {
    await this.enforcePolicy();

    const prompt = `
      Role: Professional English Speaking Examiner & Tutor.
      Task: Generate a model answer (Hint) for a Speaking Part 2/Part 4 Monologue.
      Topic: "${topic}"
      Target Level: ${level} (CEFR).
      
      Requirements:
      1. Length: Approximately 10 coherent sentences.
      2. Content: Concise, focused on the topic, strictly linked ideas.
      3. Vocabulary: Use high-quality vocabulary suitable for level ${level}.
      
      Output strictly valid JSON object with the following structure:
      {
        "script": "The full English monologue text...",
        "translation": "The Vietnamese translation..."
      }
      `;

    try {
      let text = '';
      if (this.provider === 'openai') {
        text = await this.callOpenAI(prompt, true);
      } else {
        const response = await this.ai!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        text = response.text || '{}';
      }
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("Error generating monologue script", e);
      return { script: "Error generating script. Please try again.", translation: "" };
    }
  }
}

export const geminiService = new GeminiService();
