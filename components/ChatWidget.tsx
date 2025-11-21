
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { geminiService, floatTo16BitPCM } from '../services/gemini';

// --- Audio Helper (No external assets needed) ---
const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Pleasant "Ding" sound sequence
    const now = ctx.currentTime;
    
    // First tone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1); // C6
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.start(now);
    osc.stop(now + 0.5);

    // Second tone (delayed)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, now + 0.15); // C6
    gain2.gain.setValueAtTime(0.1, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc2.start(now + 0.15);
    osc2.stop(now + 0.8);

  } catch (e) {
    console.error("Audio play failed", e);
  }
};

// --- Notification Helper ---
const showBrowserNotification = (title: string, body: string) => {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
        new Notification(title, { body, icon: '/favicon.ico' }); // Uses default icon if not found
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification(title, { body, icon: '/favicon.ico' });
            }
        });
    }
};

// --- Configuration Type ---
interface PomoConfig {
  work: number;
  shortBreak: number;
  longBreak: number;
  autoStart: boolean;
  sound: boolean;
}

const PomodoroTimer = () => {
  // Timer State
  const [mode, setMode] = useState<'work' | 'short' | 'long'>('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<PomoConfig>({ work: 25, shortBreak: 5, longBreak: 15, autoStart: false, sound: true });
  
  // UI State
  const [isMini, setIsMini] = useState(true); // Default to Mini
  const [showSettings, setShowSettings] = useState(false);
  
  // Dragging State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const timerRef = useRef<HTMLDivElement>(null);

  // Load saved config & position
  useEffect(() => {
      const savedPos = localStorage.getItem('dh_pomodoro_pos');
      const savedConfig = localStorage.getItem('dh_pomodoro_config');
      
      // Position Logic
      if (savedPos) {
          try {
              const parsed = JSON.parse(savedPos);
              // Ensure it's visible on screen
              const x = Math.min(Math.max(0, parsed.x), window.innerWidth - 50);
              const y = Math.min(Math.max(0, parsed.y), window.innerHeight - 50);
              setPosition({ x, y });
          } catch {
              setDefaultPosition();
          }
      } else {
          setDefaultPosition();
      }

      if (savedConfig) {
          try {
              const parsed = JSON.parse(savedConfig);
              setConfig(parsed);
              if (!isActive) setTimeLeft(parsed.work * 60); 
          } catch {}
      }
      
      // Request notification permission on mount
      if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
          Notification.requestPermission();
      }
  }, []);

  const setDefaultPosition = () => {
      // Default: Bottom Right, to the left of ChatWidget
      const w = window.innerWidth;
      const h = window.innerHeight;
      const widgetW = 300;
      const x = w - widgetW - 100; // 100px from right
      const y = h - 90; // 90px from bottom
      setPosition({ x: Math.max(20, x), y: Math.max(20, y) });
  };

  // Save Config
  useEffect(() => {
      localStorage.setItem('dh_pomodoro_config', JSON.stringify(config));
  }, [config]);

  // Dragging Cursor Effect
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => { 
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Format Helpers
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Update Page Title
  useEffect(() => {
      if (isActive) {
          document.title = `(${formatTime(timeLeft)}) Focus - DangHoang`;
      } else {
          document.title = 'DangHoang Ebook';
      }
  }, [isActive, timeLeft]);

  // Timer Logic
  useEffect(() => {
    let interval: any;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      if (config.sound) playNotificationSound();
      
      // Auto switch logic
      let nextMode: 'work' | 'short' | 'long' = 'work';
      if (mode === 'work') {
          nextMode = 'short'; 
          showBrowserNotification("Hoàn thành!", "Bạn đã hoàn thành phiên làm việc. Hãy nghỉ ngơi chút nhé! ☕");
      } else {
          nextMode = 'work';
          showBrowserNotification("Hết giờ nghỉ!", "Quay lại làm việc nào! 💪");
      }
      
      setMode(nextMode);
      setTimeLeft(config[nextMode === 'work' ? 'work' : nextMode === 'short' ? 'shortBreak' : 'longBreak'] * 60);
      if (config.autoStart) setIsActive(true);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode, config]);

  // --- Interaction Handlers ---

  const handleStart = (clientX: number, clientY: number, target: HTMLElement) => {
      // Prevent dragging if clicking on interactive elements
      if (['BUTTON', 'INPUT', 'LABEL', 'SELECT'].includes(target.tagName) || target.closest('button') || target.closest('input')) return;
      
      setIsDragging(true);
      if (timerRef.current) {
          const rect = timerRef.current.getBoundingClientRect();
          dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top };
      }
  };

  const handleMove = useCallback((clientX: number, clientY: number) => {
      if (isDragging) {
          const newX = clientX - dragOffset.current.x;
          const newY = clientY - dragOffset.current.y;
          const width = timerRef.current?.offsetWidth || 288;
          const height = timerRef.current?.offsetHeight || 300;
          
          const maxX = window.innerWidth - width;
          const maxY = window.innerHeight - height;
          
          // Constrain to viewport with small buffer
          setPosition({ 
              x: Math.min(Math.max(0, newX), maxX), 
              y: Math.min(Math.max(0, newY), maxY) 
          });
      }
  }, [isDragging]);

  const handleEnd = useCallback(() => {
      if (isDragging) {
          setIsDragging(false);
          localStorage.setItem('dh_pomodoro_pos', JSON.stringify(position));
      }
  }, [isDragging, position]);

  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY, e.target as HTMLElement);
  const onTouchStart = (e: React.TouchEvent) => {
      const target = e.target as HTMLElement;
      handleStart(e.touches[0].clientX, e.touches[0].clientY, target);
  };

  useEffect(() => {
      const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
      const onMouseUp = () => handleEnd();
      const onTouchMove = (e: TouchEvent) => {
          if (isDragging && e.cancelable) e.preventDefault();
          handleMove(e.touches[0].clientX, e.touches[0].clientY);
      };
      const onTouchEnd = () => handleEnd();

      if (isDragging) {
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
          window.addEventListener('touchmove', onTouchMove, { passive: false });
          window.addEventListener('touchend', onTouchEnd);
      }
      return () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
      };
  }, [isDragging, handleMove, handleEnd]);

  // Smart Expansion Logic
  const toggleSize = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      
      if (isMini) {
          // EXPANDING: Check boundaries to grow "inwards" (Up/Left) if near edges
          const approxWidth = 300; // Width of full view
          const approxHeight = 500; // Max height estimation with settings open

          let nextX = position.x;
          let nextY = position.y;

          // Right Edge Check
          if (nextX + approxWidth > window.innerWidth) {
              nextX = Math.max(20, window.innerWidth - approxWidth - 20);
          }

          // Bottom Edge Check (Grow Upwards)
          if (nextY + approxHeight > window.innerHeight) {
              nextY = Math.max(20, window.innerHeight - approxHeight - 20);
          }

          setPosition({ x: nextX, y: nextY });
          setIsMini(false);
      } else {
          // COLLAPSING
          setIsMini(true);
          setShowSettings(false); // Auto-close settings to keep mini view clean
      }
  };

  const modeColors = {
      work: 'text-red-500 stroke-red-500 from-red-500 to-pink-500',
      short: 'text-emerald-500 stroke-emerald-500 from-emerald-500 to-teal-500',
      long: 'text-blue-500 stroke-blue-500 from-blue-500 to-cyan-500',
  };

  // --- RENDER ---
  // Don't render until position is initialized
  if (position.x === 0 && position.y === 0 && typeof window !== 'undefined') return null;

  return (
    <div 
        ref={timerRef}
        style={{ left: position.x, top: position.y }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className={`fixed z-[60] transition-all duration-300 ease-out touch-none ${isDragging ? 'cursor-grabbing scale-105 shadow-2xl' : 'cursor-grab'}`}
    >
      <div className={`relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-white/20 dark:border-gray-700 shadow-xl shadow-black/10 overflow-hidden select-none ring-1 ring-black/5 transition-all duration-300 ${isMini ? 'rounded-full' : 'rounded-[2rem]'}`}>
          
          {/* MINI MODE */}
          {isMini && (
              <div 
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors pr-3"
                title="Kéo để di chuyển"
              >
                  {/* Status Dot */}
                  <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br ${modeColors[mode].split(' ').slice(2).join(' ')} ${isActive ? 'animate-pulse' : ''}`}></div>
                  
                  {/* Time Display */}
                  <span className={`font-mono font-bold text-xl tracking-tight min-w-[60px] text-center ${modeColors[mode].split(' ')[0]}`}>{formatTime(timeLeft)}</span>
                  
                  {/* Controls Container */}
                  <div className="flex items-center gap-1 ml-1 border-l border-gray-200 dark:border-gray-700 pl-2">
                      {/* Play/Pause */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsActive(!isActive); }} 
                        className="text-base hover:scale-110 transition-transform active:scale-90 p-1.5 flex items-center justify-center rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300"
                        title={isActive ? "Tạm dừng" : "Bắt đầu"}
                      >
                          {isActive ? '⏸' : '▶'}
                      </button>

                      {/* Expand Button */}
                      <button 
                        onClick={toggleSize} 
                        className="text-base hover:scale-110 transition-transform active:scale-90 p-1.5 flex items-center justify-center rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400"
                        title="Mở rộng"
                      >
                          ⤢
                      </button>
                  </div>
              </div>
          )}

          {/* FULL MODE */}
          {!isMini && !showSettings && (
              <div className="p-6 flex flex-col items-center w-72">
                  {/* Header / Drag Handle */}
                  <div className="flex justify-between w-full items-center mb-4 px-1">
                      {/* Drag Indicator */}
                      <div className="flex gap-1 opacity-20 hover:opacity-50 cursor-grab active:cursor-grabbing px-2 py-1">
                          <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                          <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                          <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                      </div>

                      <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-full mx-auto">
                          {['work', 'short', 'long'].map((m) => (
                              <button 
                                key={m}
                                onClick={() => { setMode(m as any); setTimeLeft(config[m === 'work' ? 'work' : m === 'short' ? 'shortBreak' : 'longBreak'] * 60); setIsActive(false); }}
                                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${mode === m ? `bg-gradient-to-br ${modeColors[m as any].split(' ').slice(2).join(' ')} scale-125 shadow-sm` : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'}`}
                                title={m}
                              />
                          ))}
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">⚙️</button>
                          <button onClick={toggleSize} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">⤢</button>
                      </div>
                  </div>

                  {/* Timer Display */}
                  <div className="flex flex-col items-center justify-center mb-8 py-4 w-full cursor-default">
                      <span className={`text-7xl font-mono font-bold block tracking-tighter transition-colors duration-300 drop-shadow-sm ${modeColors[mode].split(' ')[0]}`}>
                          {formatTime(timeLeft)}
                      </span>
                      <span className="text-xs uppercase tracking-[0.4em] text-gray-400 font-bold mt-2 block opacity-60">
                          {mode === 'work' ? 'FOCUS' : mode === 'short' ? 'BREAK' : 'REST'}
                      </span>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-6 w-full justify-center">
                      <button 
                        onClick={() => { setIsActive(false); setTimeLeft(config[mode === 'work' ? 'work' : mode === 'short' ? 'shortBreak' : 'longBreak'] * 60); }} 
                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full active:scale-90"
                        title="Reset"
                      >
                          ↺
                      </button>
                      <button 
                        onClick={() => setIsActive(!isActive)} 
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-white shadow-xl shadow-blue-500/20 hover:shadow-2xl transition-all hover:scale-105 active:scale-95 bg-gradient-to-br ${modeColors[mode].split(' ').slice(2).join(' ')}`}
                      >
                          {isActive ? '⏸' : '▶'}
                      </button>
                      <button 
                        onClick={() => {
                            const nextMode = mode === 'work' ? 'short' : 'work';
                            setMode(nextMode);
                            setTimeLeft(config[nextMode === 'work' ? 'work' : 'shortBreak'] * 60);
                            setIsActive(false);
                        }} 
                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full active:scale-90"
                        title="Skip"
                      >
                          ⏭
                      </button>
                  </div>
              </div>
          )}

          {/* SETTINGS PANEL */}
          {!isMini && showSettings && (
              <div className="p-6 w-72 animate-fade-in">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                      <h3 className="font-bold text-lg text-gray-800 dark:text-white">Cài đặt Timer</h3>
                      <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 p-1 rounded-full">✕</button>
                  </div>
                  
                  <div className="space-y-5">
                      <div className="space-y-1">
                          <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                              <span>Focus (phút)</span>
                              <span className="text-red-500 font-bold">{config.work}</span>
                          </div>
                          <input type="range" min="15" max="60" step="5" value={config.work} onChange={(e) => setConfig({...config, work: Number(e.target.value)})} className="w-full accent-red-500 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                      </div>
                      <div className="space-y-1">
                          <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                              <span>Short Break (phút)</span>
                              <span className="text-emerald-500 font-bold">{config.shortBreak}</span>
                          </div>
                          <input type="range" min="3" max="15" step="1" value={config.shortBreak} onChange={(e) => setConfig({...config, shortBreak: Number(e.target.value)})} className="w-full accent-emerald-500 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                      </div>
                      <div className="space-y-1">
                          <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                              <span>Long Break (phút)</span>
                              <span className="text-blue-500 font-bold">{config.longBreak}</span>
                          </div>
                          <input type="range" min="10" max="45" step="5" value={config.longBreak} onChange={(e) => setConfig({...config, longBreak: Number(e.target.value)})} className="w-full accent-blue-500 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                      </div>
                      
                      <div className="pt-4 space-y-3 border-t border-gray-100 dark:border-gray-800">
                          <label className="flex items-center justify-between cursor-pointer group">
                              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium flex items-center gap-2">
                                  🔔 Âm thanh
                              </span>
                              <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${config.sound ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                  <input type="checkbox" checked={config.sound} onChange={e => setConfig({...config, sound: e.target.checked})} className="hidden" />
                                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${config.sound ? 'translate-x-5' : 'translate-x-0'}`}></div>
                              </div>
                          </label>
                          <label className="flex items-center justify-between cursor-pointer group">
                              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium flex items-center gap-2">
                                  🔄 Tự động chạy tiếp
                              </span>
                              <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${config.autoStart ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                  <input type="checkbox" checked={config.autoStart} onChange={e => setConfig({...config, autoStart: e.target.checked})} className="hidden" />
                                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${config.autoStart ? 'translate-x-5' : 'translate-x-0'}`}></div>
                              </div>
                          </label>
                      </div>
                  </div>
                  
                  <div className="mt-6 pt-2">
                      <button onClick={() => setShowSettings(false)} className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm transition-colors">
                          Đóng cài đặt
                      </button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'chat' | 'live'>('chat');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string}[]>([
    { role: 'model', text: "Chào bạn! Mình là Nana, trợ lý học tập của bạn. Bạn cần giúp gì hôm nay?" }
  ]);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live API Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

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
        "Bạn là Nana, một trợ lý ảo thân thiện, vui vẻ, hỗ trợ học tập cho hệ thống DangHoang Ebook. Bạn có thể tra cứu Google Search, quản lý lịch."
      );
      
      const text = result.text || "";
      setMessages(prev => [...prev, { role: 'model', text }]);
      
      if (result.candidates?.[0]?.groundingMetadata?.groundingChunks) {
         const chunks = result.candidates[0].groundingMetadata.groundingChunks;
         const links = chunks.map((c:any) => c.web?.uri).filter(Boolean);
         if(links.length > 0) {
             const linkText = links.map((l: string) => `- ${l}`).join('\n');
             setMessages(prev => [...prev, { role: 'model', text: `🌐 Nguồn tham khảo:\n${linkText}` }]);
         }
      }

    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: "Xin lỗi, Nana đang gặp sự cố kết nối." }]);
    } finally {
      setLoading(false);
    }
  };

  const startLive = async () => {
    try {
      setIsLiveConnected(true);
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextStartTimeRef.current = audioContextRef.current.currentTime + 0.5;

      const session = await geminiService.connectLive(
        "Puck", 
        (pcmData) => playAudio(pcmData),
        (userTrans, modelTrans) => {},
        "Bạn tên là Nana. Hãy nói chuyện tự nhiên, ngắn gọn và vui vẻ bằng tiếng Việt. Bạn là trợ lý học tập."
      );

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      sourceRef.current = inputCtx.createMediaStreamSource(streamRef.current);
      processorRef.current = inputCtx.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
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
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
    }
  };

  const playAudio = async (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
    const ctx = audioContextRef.current;
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
    <>
        <PomodoroTimer />

        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end pointer-events-none">
          <div className="flex items-center pointer-events-auto mb-4">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`w-12 h-12 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 border-2 relative overflow-hidden group ${isOpen ? 'bg-gray-800 border-gray-700' : 'bg-blue-600 border-blue-400'}`}
            >
               <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              {isOpen ? (
                  <span className="text-xl md:text-2xl text-white transition-transform transform rotate-90 group-hover:rotate-0">✕</span>
              ) : (
                  <span className="text-2xl md:text-4xl text-white transform transition-transform group-hover:scale-110">👩‍🚀</span>
              )}
            </button>
          </div>

          {isOpen && (
            <div className="pointer-events-auto w-[90vw] md:w-[380px] max-w-[380px] h-[500px] md:h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up origin-bottom-right">
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-3 md:p-4 text-white flex justify-between items-center shrink-0 shadow-md">
                    <div>
                        <div className="font-bold text-base md:text-lg flex items-center gap-2">
                            Trợ Lý Nana
                            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full border border-white/30 font-mono">AI</span>
                        </div>
                        <p className="text-xs text-blue-100 opacity-80">Luôn sẵn sàng hỗ trợ bạn</p>
                    </div>
                    <div className="flex bg-blue-900/30 rounded-lg p-1 text-xs backdrop-blur-sm border border-white/10">
                        <button onClick={() => { if(mode !== 'chat') { stopLive(); setMode('chat'); } }} className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md transition-all font-medium ${mode === 'chat' ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-100 hover:bg-white/10'}`}>Chat</button>
                        <button onClick={() => setMode('live')} className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md transition-all font-medium ${mode === 'live' ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-100 hover:bg-white/10'}`}>Live</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50">
                    {mode === 'chat' ? (
                        <div className="space-y-4">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                    <div className={`max-w-[85%] p-2.5 md:p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}>
                                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-bl-none shadow-sm flex gap-1">
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                                    </div>
                                </div>
                            )}
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
                                <p className="text-xs md:text-sm text-gray-500">{isLiveConnected ? "Nana đang nghe bạn nói. Hãy thử hỏi: 'Nana ơi, giúp tôi bài tập này'." : 'Nhấn nút bên dưới để trò chuyện trực tiếp với Nana mà không cần gõ phím.'}</p>
                            </div>
                            {!isLiveConnected ? (
                                <button onClick={startLive} className="bg-blue-600 text-white px-6 md:px-8 py-3 rounded-full text-sm font-bold hover:bg-blue-700 shadow-lg hover:shadow-xl transform transition hover:-translate-y-1 active:translate-y-0">Bắt đầu cuộc gọi</button>
                            ) : (
                                <button onClick={stopLive} className="bg-red-50 text-red-600 border border-red-200 px-6 md:px-8 py-3 rounded-full text-sm font-bold hover:bg-red-100 shadow-sm transform transition active:scale-95">Kết thúc</button>
                            )}
                        </div>
                    )}
                </div>

                {mode === 'chat' && (
                    <div className="p-3 bg-white border-t border-gray-100 shrink-0">
                        <div className="relative">
                            <input type="text" className="w-full border border-gray-300 rounded-full pl-4 pr-12 py-2 md:py-3 text-sm focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 transition-all focus:outline-none shadow-inner" placeholder="Nhập tin nhắn..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
                            <button onClick={handleSend} disabled={loading || !input.trim()} className="absolute right-1 top-1 bg-blue-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full hover:bg-blue-700 flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-90">➤</button>
                        </div>
                    </div>
                )}
            </div>
          )}
        </div>
    </>
  );
};
