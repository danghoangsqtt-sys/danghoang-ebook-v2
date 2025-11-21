import React, { useState, useRef, useEffect } from 'react';
import { geminiService, floatTo16BitPCM } from '../services/gemini';

export const Assistant: React.FC = () => {
  const [mode, setMode] = useState<'chat' | 'live'>('chat');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string}[]>([
    { role: 'model', text: "Chào bạn! Mình là Nana, trợ lý học tập của bạn. Bạn cần giúp gì hôm nay?" }
  ]);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Live API Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Audio Playback Queue
  const audioQueueRef = useRef<{buffer: AudioBuffer, time: number}[]>([]);
  const nextStartTimeRef = useRef(0);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const result = await geminiService.chat(
        history, 
        input, 
        "Bạn là Nana, một trợ lý ảo thân thiện, vui vẻ, hỗ trợ học tập cho hệ thống DangHoang Ebook."
      );
      
      // Update for @google/genai: Use result.text instead of result.response.text()
      const text = result.text || "";
      setMessages(prev => [...prev, { role: 'model', text }]);
      
      // Display grounding if available
      // Update for @google/genai: Use result.candidates instead of result.response.candidates
      if (result.candidates?.[0]?.groundingMetadata?.groundingChunks) {
         const chunks = result.candidates[0].groundingMetadata.groundingChunks;
         const links = chunks.map((c:any) => c.web?.uri).filter(Boolean).join('\n');
         if(links) {
             setMessages(prev => [...prev, { role: 'model', text: `Nguồn tham khảo:\n${links}` }]);
         }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Xin lỗi, Nana đang gặp sự cố kết nối." }]);
    } finally {
      setLoading(false);
    }
  };

  // Start Live Mode
  const startLive = async () => {
    try {
      setIsLiveConnected(true);
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextStartTimeRef.current = audioContextRef.current.currentTime + 0.5;

      // Connect to Gemini
      const session = await geminiService.connectLive(
        "Puck", // Or 'Kore', 'Fenrir'
        (pcmData) => playAudio(pcmData),
        (userTrans, modelTrans) => {
           // Update UI with transcriptions if desired
           console.log(`User: ${userTrans}, Model: ${modelTrans}`);
        },
        "Bạn tên là Nana. Hãy nói chuyện tự nhiên, ngắn gọn và vui vẻ bằng tiếng Việt."
      );

      // Setup Microphone
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      sourceRef.current = inputCtx.createMediaStreamSource(streamRef.current);
      processorRef.current = inputCtx.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample logic or send as is if 16k.
        // Converting float32 to int16 PCM
        const pcm16 = floatTo16BitPCM(inputData);
        
        session.sendRealtimeInput({
            media: {
                mimeType: "audio/pcm;rate=16000",
                data: btoa(String.fromCharCode(...new Uint8Array(pcm16)))
            }
        });
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(inputCtx.destination);

    } catch (e) {
      console.error(e);
      alert("Không thể kết nối Live. Kiểm tra API Key và Micro.");
      setIsLiveConnected(false);
    }
  };

  const stopLive = () => {
    setIsLiveConnected(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioContextRef.current?.close();
  };

  // Play PCM Audio from Model
  const playAudio = async (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    // Create float32 buffer from int16 PCM
    const int16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(int16.length);
    for(let i=0; i<int16.length; i++) {
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
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center bg-blue-600 text-white">
        <h2 className="font-bold text-lg flex items-center gap-2">
            {mode === 'live' ? '🎙️ Nana Live (Voice)' : '💬 Nana Chat'}
        </h2>
        <div className="flex gap-2">
            <button 
                onClick={() => { mode === 'live' ? stopLive() : null; setMode('chat'); }}
                className={`px-3 py-1 rounded text-sm ${mode === 'chat' ? 'bg-white text-blue-600 font-bold' : 'bg-blue-700 text-blue-100'}`}
            >Chat</button>
            <button 
                onClick={() => { setMode('live'); }}
                className={`px-3 py-1 rounded text-sm ${mode === 'live' ? 'bg-white text-blue-600 font-bold' : 'bg-blue-700 text-blue-100'}`}
            >Live Voice</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {mode === 'chat' ? (
            <>
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                            m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 shadow rounded-bl-none border border-gray-200'
                        }`}>
                            <div className="whitespace-pre-wrap">{m.text}</div>
                        </div>
                    </div>
                ))}
                {loading && <div className="text-gray-400 text-xs text-center">Nana đang suy nghĩ...</div>}
            </>
        ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-6">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isLiveConnected ? 'bg-blue-100 border-4 border-blue-500 animate-pulse' : 'bg-gray-200'
                }`}>
                    <span className="text-4xl">👩‍🚀</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-700">
                    {isLiveConnected ? "Nana đang lắng nghe..." : "Sẵn sàng trò chuyện"}
                </h3>
                {!isLiveConnected ? (
                    <button onClick={startLive} className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold hover:bg-blue-700 shadow-lg transition-transform hover:scale-105">
                        Bắt đầu cuộc gọi ("Nana ơi")
                    </button>
                ) : (
                    <button onClick={stopLive} className="bg-red-500 text-white px-6 py-3 rounded-full font-bold hover:bg-red-600 shadow-lg">
                        Kết thúc
                    </button>
                )}
                <p className="text-sm text-gray-500 max-w-md text-center">
                    Chế độ Live cho phép đàm thoại trực tiếp thời gian thực. Hãy chắc chắn bạn đã đeo tai nghe để tránh tiếng vọng.
                </p>
            </div>
        )}
      </div>

      {/* Chat Input */}
      {mode === 'chat' && (
        <div className="p-4 bg-white border-t">
            <div className="flex gap-2">
                <input 
                    type="text" 
                    className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="Nhập tin nhắn hoặc tra cứu Google..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button 
                    onClick={handleSend}
                    disabled={loading}
                    className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 w-10 h-10 flex items-center justify-center"
                >
                    ➤
                </button>
            </div>
        </div>
      )}
    </div>
  );
};