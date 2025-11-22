
import React, { useState, useRef, useEffect } from 'react';
import { geminiService, floatTo16BitPCM } from '../services/gemini';
import { CourseNode } from '../types';
import { speechService, VoiceSettings, DEFAULT_VOICE_SETTINGS } from '../services/speech';

const SimpleMarkdownRenderer = ({ content }: { content: string }) => {
    if (!content) return null;
    const lines = content.split('\n');
    return (
        <div className="space-y-1 text-sm leading-relaxed">
            {lines.map((line, idx) => {
                const parseBold = (text: string) => {
                    const parts = text.split(/(\*\*.*?\*\*)/g);
                    return parts.map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i} className="text-blue-700 dark:text-blue-300">{part.slice(2, -2)}</strong>;
                        }
                        return part;
                    });
                };

                const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                const parts = line.split(linkRegex);

                if (parts.length > 1) {
                    const elements = [];
                    let i = 0;
                    while (i < parts.length) {
                        elements.push(parseBold(parts[i]));
                        if (i + 2 < parts.length) {
                            elements.push(
                                <a key={i + 1} href={parts[i + 2]} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold mx-1">
                                    {parts[i + 1]}
                                </a>
                            );
                            i += 3;
                        } else {
                            i++;
                        }
                    }
                    return <div key={idx}>{elements}</div>;
                }

                if (line.trim().startsWith('##')) {
                    return <h4 key={idx} className="font-bold text-blue-700 dark:text-blue-300 mt-2 border-b border-gray-100 pb-1">{parseBold(line.replace(/^#+\s/, ''))}</h4>
                }

                if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                    return <div key={idx} className="flex gap-2 ml-1"><span className="text-blue-500 font-bold">•</span><span>{parseBold(line.replace(/^[\-\*]\s/, ''))}</span></div>
                }

                return <div key={idx}>{parseBold(line)}</div>;
            })}
        </div>
    );
};

interface Message {
    role: 'user' | 'model';
    text: string;
    sources?: { title: string; uri: string }[];
    isThinking?: boolean;
}

export const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<'chat' | 'live'>('chat');
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'model', text: "Hế lô! Nana đây. Hôm nay tụi mình học gì nè? 😎" }
    ]);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiKeyMissing, setApiKeyMissing] = useState(false);

    const [isSpeakingMode, setIsSpeakingMode] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const isLiveRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef(0);

    useEffect(() => {
        const savedHistory = localStorage.getItem('dh_chat_history');
        if (savedHistory) {
            try {
                setMessages(JSON.parse(savedHistory));
            } catch { }
        }
        checkKey();

        const savedSettings = localStorage.getItem('dh_voice_settings');
        if (savedSettings) {
            setVoiceSettings(JSON.parse(savedSettings));
        } else {
            speechService.getVoices().then(() => { });
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            checkKey();
            scrollToBottom();
            if (!isSpeakingMode) setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, isSpeakingMode]);

    const checkKey = () => {
        const key = localStorage.getItem('dh_gemini_api_key');
        if (key) {
            geminiService.initializeModel(key);
            setApiKeyMissing(false);
        } else {
            setApiKeyMissing(true);
        }
    }

    useEffect(() => {
        if (messages.length > 1) {
            localStorage.setItem('dh_chat_history', JSON.stringify(messages));
        }
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    const getContextString = () => {
        try {
            const treeStr = localStorage.getItem('dh_course_tree_v2');
            if (!treeStr) return "";
            const tree: CourseNode[] = JSON.parse(treeStr);
            const titles: string[] = [];
            const traverse = (nodes: CourseNode[]) => {
                nodes.forEach(n => {
                    if (n.type === 'file') titles.push(n.title);
                    if (n.children) traverse(n.children);
                });
            };
            traverse(tree);
            if (titles.length > 0) {
                return `User's Library: ${titles.slice(0, 10).join(', ')}...`;
            }
        } catch (e) { }
        return "";
    };

    const handleSend = async (textOverride?: string) => {
        const textToSend = textOverride || input;
        if (!textToSend.trim()) return;

        if (!geminiService.hasKey()) {
            checkKey();
            if (!geminiService.hasKey()) {
                setMessages(prev => [...prev, { role: 'model', text: "Vui lòng nhập API Key trong Cài Đặt để sử dụng tính năng này." }]);
                return;
            }
        }

        const userMsg: Message = { role: 'user', text: textToSend };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
            setMessages(prev => [...prev, { role: 'model', text: '', isThinking: true }]);

            const context = getContextString();

            // UPDATED SYSTEM INSTRUCTION FOR NATURAL SPEECH
            const systemInstruction = `
      You are 'Nana', the user's close best friend and witty study companion (NOT a formal assistant).
      Context: ${context}
      
      CORE VOICE RULES:
      1. **Persona**: Playful, caring, slightly sassy best friend.
      2. **Particles**: MUST use Vietnamese spoken particles naturally ('à', 'nha', 'nhé', 'đấy', 'nè', 'trời ơi', 'kaka', 'hihi', 'dạ', 'vâng').
      3. **Sentence Structure**: Short, punchy sentences. Avoid complex clauses. This helps the Text-to-Speech engine sound natural.
      4. **Punctuation**: Use '!' and '?' generously to convey emotion. Use '...' for pauses.
      5. **Voice Control**: If user asks to change voice/language, return HIDDEN command: <<<CMD: {"action": "set_voice", "params": {"lang": "en-US"}} >>>.
      
      Example: "Ui trời! Bài này dễ ợt à. Để Nana chỉ cho nha! Đợi xíu..."
      `;

            const stream = geminiService.chatStream(history, textToSend, systemInstruction);

            let rawText = '';
            let displayedText = '';
            let commandProcessed = false;
            let accumulatedSources: { title: string; uri: string }[] = [];

            for await (const chunk of stream) {
                const chunkText = chunk.text || '';
                rawText += chunkText;

                if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                    const chunks = chunk.candidates[0].groundingMetadata.groundingChunks;
                    const newSources = chunks
                        .filter((c: any) => c.web?.uri && c.web?.title)
                        .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

                    newSources.forEach(ns => {
                        if (!accumulatedSources.some(s => s.uri === ns.uri)) {
                            accumulatedSources.push(ns);
                        }
                    });
                }

                if (!commandProcessed) {
                    const cmdStart = rawText.indexOf('<<<CMD:');
                    const cmdEnd = rawText.indexOf('>>>');

                    if (cmdStart !== -1 && cmdEnd !== -1) {
                        const cmdString = rawText.substring(cmdStart, cmdEnd + 3);
                        const jsonString = rawText.substring(cmdStart + 7, cmdEnd).trim();

                        try {
                            const command = JSON.parse(jsonString);
                            if (command.action === 'set_voice' && command.params) {
                                const voice = speechService.findBestVoice(command.params);
                                if (voice) {
                                    setVoiceSettings(prev => {
                                        const next = { ...prev, voiceURI: voice.voiceURI };
                                        localStorage.setItem('dh_voice_settings', JSON.stringify(next));
                                        return next;
                                    });
                                }
                            }
                        } catch (e) { console.error("CMD Parse Error", e); }

                        commandProcessed = true;
                        displayedText = rawText.replace(cmdString, '');
                    } else if (cmdStart !== -1 && cmdEnd === -1) {
                        displayedText = rawText.substring(0, cmdStart);
                    } else {
                        displayedText = rawText;
                    }
                } else {
                    displayedText = rawText.replace(/<<<CMD:.*?>>>/s, '');
                }

                setMessages(prev => {
                    const newHistory = [...prev];
                    const lastMsg = newHistory[newHistory.length - 1];
                    lastMsg.text = displayedText;
                    lastMsg.sources = accumulatedSources.length > 0 ? accumulatedSources : undefined;
                    lastMsg.isThinking = false;
                    return newHistory;
                });
            }

            if (voiceSettings.autoRead && displayedText) {
                speechService.speak(displayedText, voiceSettings);
            }

        } catch (error) {
            console.error(error);
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last.role === 'model' && !last.text) return prev.slice(0, -1);
                return prev;
            });
            setMessages(prev => [...prev, { role: 'model', text: "Hic, Nana bị mất kết nối rùi. Thử lại nha!" }]);
        } finally {
            setLoading(false);
        }
    };

    const toggleMic = () => {
        if (isListening) {
            speechService.stopListening();
            setIsListening(false);
        } else {
            setIsListening(true);
            speechService.startListening(
                (text) => {
                    setIsListening(false);
                    handleSend(text);
                },
                (err) => {
                    setIsListening(false);
                    alert(err);
                },
                () => setIsListening(false)
            );
        }
    };

    const clearHistory = () => {
        if (window.confirm("Xóa hết tin nhắn cũ nha?")) {
            setMessages([{ role: 'model', text: "Hế lô! Nana đây. Hôm nay tụi mình học gì nè? 😎" }]);
            localStorage.removeItem('dh_chat_history');
        }
    };

    const startLive = async () => {
        if (apiKeyMissing) return alert("Vui lòng nhập API Key trong Cài Đặt.");

        try {
            setIsLiveConnected(true);
            isLiveRef.current = true;
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            nextStartTimeRef.current = audioContextRef.current.currentTime + 0.5;

            const sessionPromise = geminiService.connectLive(
                "Puck",
                (pcmData) => playAudio(pcmData),
                () => { },
                "Bạn tên là Nana. Bạn là bạn thân của người dùng. Nói chuyện tự nhiên, vui vẻ, dùng từ lóng tiếng Việt (kaka, hihi, nha, nhé)."
            );

            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const inputCtx = new AudioContext({ sampleRate: 16000 });
            sourceRef.current = inputCtx.createMediaStreamSource(streamRef.current);
            processorRef.current = inputCtx.createScriptProcessor(4096, 1, 1);

            processorRef.current.onaudioprocess = (e) => {
                if (!isLiveRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = floatTo16BitPCM(inputData);

                sessionPromise.then(session => {
                    if (isLiveRef.current) {
                        session.sendRealtimeInput({
                            media: {
                                mimeType: "audio/pcm;rate=16000",
                                data: btoa(String.fromCharCode(...new Uint8Array(pcm16)))
                            }
                        });
                    }
                });
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(inputCtx.destination);

        } catch (e) {
            console.error(e);
            alert("Lỗi kết nối Live. Kiểm tra Micro.");
            stopLive();
        }
    };

    const stopLive = () => {
        setIsLiveConnected(false);
        isLiveRef.current = false;
        streamRef.current?.getTracks().forEach(t => t.stop());
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
    };

    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
        const ctx = audioContextRef.current;
        const int16 = new Int16Array(arrayBuffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
        audioBuffer.copyToChannel(float32, 0);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + audioBuffer.duration;
    };

    useEffect(() => {
        return () => stopLive();
    }, []);

    return (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end pointer-events-none">
            <div className="flex items-center pointer-events-auto mb-4">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-12 h-12 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 border-2 relative overflow-hidden group ${isOpen ? 'bg-gray-800 border-gray-700' : 'bg-blue-600 border-blue-400'}`}
                >
                    {isOpen ? (
                        <span className="text-xl md:text-2xl text-white">✕</span>
                    ) : (
                        <span className="text-2xl md:text-4xl text-white">👩‍🚀</span>
                    )}
                </button>
            </div>

            {isOpen && (
                <div className="pointer-events-auto w-[90vw] md:w-[380px] max-w-[380px] h-[550px] md:h-[650px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up origin-bottom-right">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-3 md:p-4 text-white flex justify-between items-center shrink-0 shadow-md">
                        <div>
                            <div className="font-bold text-base md:text-lg flex items-center gap-2">
                                Nana AI
                                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full border border-white/30 font-mono">BFF</span>
                            </div>
                            <p className="text-xs text-blue-100 opacity-80">Bạn học thân thiện • Online</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex bg-blue-900/30 rounded-lg p-1 text-xs backdrop-blur-sm border border-white/10">
                                <button onClick={() => { if (mode !== 'chat') { stopLive(); setMode('chat'); } }} className={`px-2 py-1 rounded-md transition-all font-medium ${mode === 'chat' ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-100 hover:bg-white/10'}`}>Chat</button>
                                <button onClick={() => setMode('live')} className={`px-2 py-1 rounded-md transition-all font-medium ${mode === 'live' ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-100 hover:bg-white/10'}`}>Live</button>
                            </div>
                            {mode === 'chat' && (
                                <button
                                    onClick={() => setIsSpeakingMode(!isSpeakingMode)}
                                    className={`text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors ${isSpeakingMode ? 'bg-green-500 text-white border-green-400' : 'bg-blue-800 text-blue-200 border-blue-700'}`}
                                >
                                    {isSpeakingMode ? '🎤 Mic ON' : '⌨️ Text'}
                                </button>
                            )}
                        </div>
                    </div>

                    {apiKeyMissing && (
                        <div className="bg-yellow-50 p-3 text-xs text-yellow-800 text-center border-b border-yellow-100 flex items-center justify-center gap-2">
                            ⚠️ Chưa có API Key. <a href="/#/settings" className="underline font-bold" onClick={() => setIsOpen(false)}>Vào Cài Đặt</a>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50 scrollbar-thin scrollbar-thumb-gray-300 relative">
                        {mode === 'chat' ? (
                            <div className="space-y-4 pb-2">
                                {messages.length > 5 && (
                                    <div className="text-center">
                                        <button onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-red-500 underline bg-white px-2 py-1 rounded border border-gray-100 shadow-sm">
                                            🗑 Xóa lịch sử
                                        </button>
                                    </div>
                                )}
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}>
                                            {m.role === 'user' ? (
                                                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                            ) : (
                                                <>
                                                    {m.isThinking && !m.text && (
                                                        <div className="flex gap-1 items-center text-gray-400 text-xs italic">
                                                            <span>Nana đang nghĩ</span>
                                                            <span className="animate-bounce">.</span><span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span><span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
                                                        </div>
                                                    )}

                                                    <SimpleMarkdownRenderer content={m.text} />

                                                    <div className="flex items-center justify-end gap-2 mt-2 border-t border-gray-100 pt-1">
                                                        <button
                                                            onClick={() => speechService.speak(m.text, voiceSettings)}
                                                            className="text-gray-400 hover:text-blue-500 p-1 rounded hover:bg-gray-50 transition-colors"
                                                            title="Nghe lại"
                                                        >
                                                            🔊
                                                        </button>
                                                    </div>

                                                    {m.sources && m.sources.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Nguồn:</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {m.sources.map((src, idx) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={src.uri}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-[10px] bg-gray-100 hover:bg-blue-50 text-blue-600 border border-gray-200 px-2 py-1 rounded-lg truncate max-w-[150px] block transition-colors"
                                                                    >
                                                                        🔗 {src.title}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full space-y-6 md:space-y-8 bg-white/50 rounded-xl m-2 border border-white/50">
                                <div className="relative mt-4 md:mt-8">
                                    <div className={`absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping ${isLiveConnected ? 'block' : 'hidden'}`}></div>
                                    <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all duration-500 border-4 shadow-xl ${isLiveConnected ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-blue-300 scale-110' : 'bg-gray-100 border-gray-200'}`}>
                                        <span className="text-5xl md:text-6xl transform transition-transform hover:scale-110 cursor-default">🎙️</span>
                                    </div>
                                </div>
                                <div className="text-center space-y-2 px-4 md:px-6">
                                    <h3 className={`text-lg md:text-xl font-bold transition-colors ${isLiveConnected ? 'text-blue-700' : 'text-gray-700'}`}>{isLiveConnected ? "Đang lắng nghe..." : "Live Voice Mode"}</h3>
                                    <p className="text-xs text-gray-500">Đeo tai nghe để có trải nghiệm tốt nhất</p>
                                </div>
                                {!isLiveConnected ? (
                                    <button onClick={startLive} disabled={apiKeyMissing} className="bg-blue-600 text-white px-6 md:px-8 py-3 rounded-full text-sm font-bold hover:bg-blue-700 shadow-lg disabled:opacity-50">Bắt đầu Live</button>
                                ) : (
                                    <button onClick={stopLive} className="bg-red-50 text-red-600 border border-red-200 px-6 md:px-8 py-3 rounded-full text-sm font-bold hover:bg-red-100 shadow-sm">Kết thúc</button>
                                )}
                            </div>
                        )}
                    </div>

                    {mode === 'chat' && (
                        <div className="p-3 bg-white border-t border-gray-100 shrink-0">
                            {isSpeakingMode ? (
                                <div className="flex items-center justify-center py-2">
                                    <button
                                        onClick={toggleMic}
                                        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all transform active:scale-90 border-4 ${isListening
                                                ? 'bg-red-500 border-red-200 animate-pulse scale-110'
                                                : 'bg-blue-600 border-blue-200 hover:bg-blue-700'
                                            }`}
                                    >
                                        <span className="text-3xl">{isListening ? '⏹' : '🎙️'}</span>
                                    </button>
                                    {isListening && <p className="absolute bottom-14 bg-black/70 text-white text-xs px-2 py-1 rounded animate-bounce">Đang nghe...</p>}
                                </div>
                            ) : (
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        className="w-full border border-gray-300 rounded-full pl-4 pr-12 py-2 md:py-3 text-sm focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 transition-all focus:outline-none shadow-inner placeholder-gray-400"
                                        placeholder={apiKeyMissing ? "Cần nhập API Key..." : "Hỏi Nana..."}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                                        disabled={apiKeyMissing}
                                    />
                                    <button onClick={() => handleSend()} disabled={loading || !input.trim() || apiKeyMissing} className="absolute right-1.5 top-1.5 bg-blue-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full hover:bg-blue-700 flex items-center justify-center shadow-md disabled:opacity-50 transition-all transform active:scale-90">➤</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
