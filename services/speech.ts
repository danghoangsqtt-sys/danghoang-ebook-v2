
export interface VoiceSettings {
    voiceURI: string;
    rate: number;
    pitch: number;
    volume: number;
    autoRead: boolean;
    style?: 'formal' | 'casual';
}

export interface VoiceCriteria {
    lang?: string;
    gender?: 'male' | 'female';
    region?: string; // e.g. US, UK
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
    voiceURI: '',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    autoRead: true,
    style: 'formal'
};

class SpeechService {
    private synthesis: SpeechSynthesis;
    private recognition: any;
    private voices: SpeechSynthesisVoice[] = [];
    private isListening: boolean = false;

    constructor() {
        this.synthesis = window.speechSynthesis;

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'vi-VN';
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;
        }
    }

    getVoices(): Promise<SpeechSynthesisVoice[]> {
        return new Promise((resolve) => {
            const load = () => {
                this.voices = this.synthesis.getVoices();
                resolve(this.voices);
            };

            if (this.synthesis.getVoices().length > 0) {
                load();
            } else {
                this.synthesis.onvoiceschanged = load;
            }
        });
    }

    findBestVoice(criteria: VoiceCriteria): SpeechSynthesisVoice | undefined {
        if (this.voices.length === 0) {
            this.voices = this.synthesis.getVoices();
        }

        let candidates = this.voices;

        // 1. Filter by Language
        if (criteria.lang) {
            const exactLang = candidates.filter(v => v.lang.toLowerCase() === criteria.lang!.toLowerCase());
            if (exactLang.length > 0) {
                candidates = exactLang;
            } else {
                candidates = candidates.filter(v => v.lang.toLowerCase().includes(criteria.lang!.toLowerCase()));
            }
        }

        // 2. Filter by Region/Name
        if (criteria.region) {
            const reg = criteria.region.toLowerCase();
            candidates = candidates.filter(v => v.name.toLowerCase().includes(reg));
        }

        // 3. Filter by Gender
        if (criteria.gender) {
            const target = criteria.gender.toLowerCase();
            const genderMatches = candidates.filter(v => {
                const name = v.name.toLowerCase();
                if (target === 'female') {
                    return name.includes('female') || name.includes('woman') || name.includes('samantha') || name.includes('zira') || name.includes('google') || name.includes('vietnamese');
                }
                if (target === 'male') {
                    return name.includes('male') || name.includes('man') || name.includes('david') || name.includes('daniel') || name.includes('mark');
                }
                return false;
            });
            if (genderMatches.length > 0) candidates = genderMatches;
        }

        // 4. Prioritize Google Vietnamese
        const googleVi = candidates.find(v => v.name.includes('Google') && v.lang.includes('vi'));
        if (googleVi) return googleVi;

        const googleVoice = candidates.find(v => v.name.toLowerCase().includes('google'));
        if (googleVoice) return googleVoice;

        return candidates[0];
    }

    cleanTextForSpeech(text: string): string {
        return text
            .replace(/[*#`_\[\]]/g, '')
            .replace(/https?:\/\/\S+/g, 'liên kết')
            .replace(/(H|h)aha+/g, 'Ha ha')
            .replace(/(H|h)ihi+/g, 'Hi hi')
            .replace(/(K|k)aka+/g, 'Ka ka')
            .replace(/\n+/g, '. ')
            .trim();
    }

    /**
     * Dynamic Prosody Analysis
     * Splits text into expressive chunks for more natural speech.
     */
    private analyzeProsody(text: string): { text: string, rateMod: number, pitchMod: number, pause: number }[] {
        // Regex to split by sentence delimiters but keep them
        // Delimiters: . ! ? ...
        const parts = text.match(/[^.!?]+([.!?]+|$)/g) || [text];

        return parts.map(s => {
            let rateMod = 0;
            let pitchMod = 0;
            let pause = 200; // Default pause 200ms
            const trimmed = s.trim();

            if (trimmed.endsWith('!')) {
                rateMod = 0.1;
                pitchMod = 0.15;
                pause = 300;
            } else if (trimmed.endsWith('?')) {
                pitchMod = 0.1;
                rateMod = 0.05;
                pause = 400;
            } else if (trimmed.includes('...')) {
                rateMod = -0.2;
                pause = 600;
            } else if (trimmed.endsWith('.')) {
                pause = 400;
            }

            return { text: s, rateMod, pitchMod, pause };
        });
    }

    speak(text: string, settings: VoiceSettings = DEFAULT_VOICE_SETTINGS) {
        this.cancel();

        if (!text) return;

        const cleanText = this.cleanTextForSpeech(text);
        const chunks = this.analyzeProsody(cleanText);

        let selectedVoice: SpeechSynthesisVoice | undefined;
        if (settings.voiceURI) {
            selectedVoice = this.voices.find(v => v.voiceURI === settings.voiceURI);
        } else {
            // Force Google Vietnamese if not specified
            selectedVoice = this.voices.find(v => v.name.includes('Google') && v.lang.includes('vi')) || this.voices.find(v => v.lang.includes('vi'));
        }

        chunks.forEach((chunk) => {
            const utterance = new SpeechSynthesisUtterance(chunk.text);

            let rate = settings.rate;
            let pitch = settings.pitch;

            if (settings.style === 'casual') {
                rate = Math.max(rate, 1.1);
            }

            // Apply dynamic modifiers
            rate += chunk.rateMod;
            pitch += chunk.pitchMod;

            utterance.rate = Math.max(0.5, Math.min(2, rate));
            utterance.pitch = Math.max(0.5, Math.min(2, pitch));
            utterance.volume = settings.volume;

            if (selectedVoice) utterance.voice = selectedVoice;

            // Web Speech API doesn't natively support 'pause' duration between queue items perfectly,
            // but it processes them sequentially.
            // Some browsers might ignore short pauses, but splitting creates natural gaps.

            this.synthesis.speak(utterance);
        });
    }

    cancel() {
        this.synthesis.cancel();
    }

    isRecognitionSupported(): boolean {
        return !!this.recognition;
    }

    startListening(
        onResult: (text: string) => void,
        onError: (error: string) => void,
        onEnd: () => void
    ) {
        if (!this.recognition) {
            onError("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Web Speech API).");
            onEnd();
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
            return;
        }

        this.recognition.onstart = () => {
            this.isListening = true;
        };

        this.recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            onResult(transcript);
        };

        this.recognition.onerror = (event: any) => {
            console.error("Speech Recognition Error", event.error);
            if (event.error === 'not-allowed') {
                onError("Vui lòng cấp quyền truy cập Micro.");
            } else {
                // Ignore no-speech or other minor errors to keep UI clean
                if (event.error !== 'no-speech') onError("Lỗi nhận diện: " + event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            onEnd();
        };

        try {
            this.recognition.start();
        } catch (e) {
            this.isListening = false;
            onEnd();
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }
}

export const speechService = new SpeechService();
