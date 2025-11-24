
import { GoogleGenAI, LiveServerMessage, Modality, GenerateContentResponse, Chat, Content, Type } from "@google/genai";
import { Transaction } from "../types";
import { MarketAnalysisResult } from "./financial";

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
  analysisComment: string;
  cashflowInsight: string;
}

export interface SpeakingSuggestion {
  hints: string[];
  sampleAnswer: string;
  vietnameseTranslation: string;
}

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string = '';

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
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    if (typeof window !== 'undefined') {
      localStorage.setItem('dh_gemini_api_key', apiKey);
    }
    console.log("🤖 AI Model Initialized");
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
    return !!this.ai;
  }

  async validateKey(): Promise<boolean> {
    if (!this.ai) return false;
    try {
      await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello',
      });
      return true;
    } catch (e) {
      console.error("API Key Validation Failed:", e);
      return false;
    }
  }

  async analyzeFinances(transactions: Transaction[]): Promise<AIFinancialPlan> {
    if (!this.ai) throw new Error("No API Key");

    const recentTrans = transactions.slice(0, 100).map(t => ({
      date: t.date,
      amount: t.amount,
      type: t.type,
      category: t.category,
      desc: t.description
    }));

    const prompt = `
    You are an expert Financial Advisor for a user living in **Vietnam**.
    Context: All monetary values are in VND (Vietnam Dong).
    Data: ${JSON.stringify(recentTrans)}
    
    Task:
    1. Analyze spending patterns.
    2. Suggest 3-5 Monthly Budgets.
    3. Suggest 1-2 Financial Goals.
    4. Provide a brief analysis comment and a specific cashflow insight in Vietnamese.

    Constraint: Return strictly valid JSON.
    {
        "recommendedBudgets": [
            { "name": "string", "limit": number, "type": "expense", "reason": "string" }
        ],
        "recommendedGoals": [
            { "name": "string", "targetAmount": number, "currentAmount": 0, "type": "savings", "deadline": "YYYY-MM-DD", "reason": "string" }
        ],
        "analysisComment": "string",
        "cashflowInsight": "string"
    }
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const text = response.text || '{}';
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("AI Finance Analysis Error", e);
      throw new Error("AI Analysis Failed");
    }
  }

  async analyzeMarket(prompt: string): Promise<MarketAnalysisResult> {
    if (!this.ai) throw new Error("No API Key");
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const text = response.text || '{}';
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("AI Market Analysis Error", e);
      throw new Error("AI Market Analysis Failed");
    }
  }

  async searchContent(prompt: string): Promise<string> {
    if (!this.ai) throw new Error("No API Key");
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      return response.text || "Không tìm thấy thông tin.";
    } catch (e) {
      console.error("Search Error", e);
      return "Lỗi khi tìm kiếm thông tin: " + (e as any).message;
    }
  }

  async *chatStream(
    history: { role: string, parts: { text: string }[] }[],
    message: string,
    systemInstruction: string
  ) {
    if (!this.ai) throw new Error("AI not initialized");

    const chat = this.ai.chats.create({
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

  async generateDailyVocabulary(level: string, topic?: string) {
    if (!this.ai) throw new Error("No API Key");
    const topicInstruction = topic ? `focusing on the topic: "${topic}"` : 'on general topics';
    const prompt = `Generate 5 advanced English vocabulary words for Level ${level} ${topicInstruction}. 
    Return strictly JSON array of objects with:
    - term: the word
    - ipa: IPA phonetic transcription (e.g., /həˈləʊ/)
    - partOfSpeech: noun, verb, etc.
    - meaning: Vietnamese translation
    - definition: English definition
    - example: Example sentence`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '[]';
  }

  async gradeWritingPractice(level: string, question: string, userEssay: string) {
    if (!this.ai) throw new Error("No API Key");
    const prompt = `Grade essay Level ${level}. Question: ${question}. Essay: ${userEssay}. Return JSON {score, generalFeedback, corrections: [{original, correction, explanation}], sampleEssay, betterVocab}.`;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async generateGrammarQuiz(level: string, topic?: string) {
    if (!this.ai) throw new Error("No API Key");
    const prompt = `Generate 10 Grammar Questions Level ${level} ${topic ? `about ${topic}` : ''}. Return strictly JSON array.`;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '[]';
  }

  async gradeGrammarQuiz(level: string, questions: any[], userAnswers: any) {
    if (!this.ai) throw new Error("No API Key");
    const prompt = `Grade Grammar Quiz Level ${level}. Questions: ${JSON.stringify(questions)}. User Answers: ${JSON.stringify(userAnswers)}. Return JSON {score, results: [{id, isCorrect, explanation}]}.`;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async generateReadingPassage(level: string, topic: string) {
    if (!this.ai) throw new Error("No API Key");
    const prompt = `Write reading passage Level ${level} about "${topic}". Return JSON {title, content, summary, keywords}.`;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async lookupDictionary(word: string, context: string) {
    if (!this.ai) throw new Error("No API Key");
    const prompt = `Define "${word}" in context: "${context}". Return JSON {word, ipa, type, meaning_vi, definition_en, example}.`;
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    return response.text || '{}';
  }

  async generateWritingTopic(level: string, type: 'task1' | 'task2') {
    if (!this.ai) throw new Error("No API Key");
    const prompt = `Generate Writing Topic ${type} Level ${level}. Return text only.`;
    const response = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return response.text || '';
  }

  // --- Live API with Transcription ---
  async connectLive(
    voiceName: string,
    onAudio: (data: ArrayBuffer) => void,
    onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void,
    sysInstr: string
  ) {
    if (!this.ai) throw new Error("No API Key");

    // System Instruction must be correct Content type
    const systemInstructionContent = { parts: [{ text: sysInstr }] };

    return this.ai.live.connect({
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
    if (!this.ai || !lastAIQuestion) return { hints: [], sampleAnswer: "", vietnameseTranslation: "" };

    const prompt = `
      You are an English Tutor. The AI interlocutor just said: "${lastAIQuestion}".
      
      Task: Help the user reply or answer this.
      1. Provide 3 short, useful English hints/phrases/vocabulary.
      2. Provide 1 full, natural Sample Answer (CEFR B2/C1 Level).
      3. Provide Vietnamese translation for the Sample Answer.

      Output strictly JSON:
      {
        "hints": ["hint 1", "hint 2", "hint 3"],
        "sampleAnswer": "Full text answer...",
        "vietnameseTranslation": "Dịch câu trả lời mẫu..."
      }
      `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const text = response.text || '{}';
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("Error generating speaking suggestions", e);
      return { hints: [], sampleAnswer: "Could not generate suggestions.", vietnameseTranslation: "" };
    }
  }

  // --- Monologue Hint Generation (Fixed) ---
  async generateMonologueScript(topic: string, level: string): Promise<{ script: string, translation: string }> {
    if (!this.ai) throw new Error("No API Key");

    const prompt = `
      Role: Professional English Speaking Examiner & Tutor.
      Task: Generate a model answer (Hint) for a Speaking Part 2/Part 4 Monologue.
      Topic: "${topic}"
      Target Level: ${level} (CEFR).
      
      Requirements:
      1. Length: Approximately 10 coherent sentences.
      2. Content: Concise, focused on the topic, strictly linked ideas.
      3. Vocabulary: Use high-quality vocabulary suitable for level ${level}.
      
      Output strictly valid JSON with the following structure:
      {
        "script": "The full English monologue text...",
        "translation": "The Vietnamese translation..."
      }
      `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
          // Removing strict schema object to avoid parsing errors with creative tasks
        }
      });
      const text = response.text || '{}';
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error("Error generating monologue script", e);
      return { script: "Error generating script. Please try again.", translation: "" };
    }
  }
}

export const geminiService = new GeminiService();
