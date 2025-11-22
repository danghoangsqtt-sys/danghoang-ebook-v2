
import React, { useState, useEffect, useRef } from 'react';

const DEFAULT_TIMES = {
    focus: 25,
    short: 5,
    long: 15
};

export const Pomodoro: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [mode, setMode] = useState<'focus' | 'short' | 'long'>('focus');
    const [times, setTimes] = useState(DEFAULT_TIMES);
    const [editTimes, setEditTimes] = useState(DEFAULT_TIMES);

    const [timeLeft, setTimeLeft] = useState(DEFAULT_TIMES.focus * 60);
    const [isActive, setIsActive] = useState(false);
    const timerRef = useRef<number | null>(null);

    // Load settings on mount
    useEffect(() => {
        const saved = localStorage.getItem('dh_pomodoro_times');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setTimes(parsed);
                setEditTimes(parsed);
                // If loading for the first time, set timeLeft based on current mode
                setTimeLeft(parsed.focus * 60);
            } catch (e) { }
        }
    }, []);

    // Request Notification Permission
    useEffect(() => {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }, []);

    // Timer Logic
    useEffect(() => {
        if (isActive && timeLeft > 0) {
            timerRef.current = window.setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && isActive) {
            setIsActive(false);
            // Play notification sound
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.play().catch(e => console.log(e));

            if (Notification.permission === 'granted') {
                new Notification("Pomodoro", { body: `${mode.toUpperCase()} finished!` });
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isActive, timeLeft, mode]);

    const toggleTimer = () => setIsActive(!isActive);

    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(times[mode] * 60);
    };

    const changeMode = (newMode: 'focus' | 'short' | 'long') => {
        setMode(newMode);
        setIsActive(false);
        setTimeLeft(times[newMode] * 60);
    };

    const handleSaveSettings = () => {
        setTimes(editTimes);
        localStorage.setItem('dh_pomodoro_times', JSON.stringify(editTimes));
        setIsSettingsOpen(false);

        // Reset timer to new setting immediately
        setIsActive(false);
        setTimeLeft(editTimes[mode] * 60);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-24 right-4 md:bottom-28 md:right-6 z-40 flex flex-col items-end pointer-events-none">
            {/* Main Panel */}
            <div className={`pointer-events-auto mb-4 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100 w-72' : 'scale-0 opacity-0 w-0 h-0'}`}>
                <div className="p-5">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-5 border-b border-gray-100 dark:border-gray-700 pb-3">
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2">
                            <span>🍅</span> Pomodoro
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                className={`text-gray-400 hover:text-blue-500 transition-colors ${isSettingsOpen ? 'text-blue-500' : ''}`}
                                title="Cài đặt thời gian"
                            >
                                ⚙️
                            </button>
                            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
                        </div>
                    </div>

                    {isSettingsOpen ? (
                        <div className="space-y-4 animate-fade-in">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Focus (phút)</label>
                                <input
                                    type="number"
                                    value={editTimes.focus}
                                    onChange={e => setEditTimes({ ...editTimes, focus: parseInt(e.target.value) || 25 })}
                                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Short Break</label>
                                    <input
                                        type="number"
                                        value={editTimes.short}
                                        onChange={e => setEditTimes({ ...editTimes, short: parseInt(e.target.value) || 5 })}
                                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Long Break</label>
                                    <input
                                        type="number"
                                        value={editTimes.long}
                                        onChange={e => setEditTimes({ ...editTimes, long: parseInt(e.target.value) || 15 })}
                                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                            </div>
                            <button onClick={handleSaveSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs shadow-sm transition-colors">
                                Lưu Cài Đặt
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Mode Switcher */}
                            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl mb-8">
                                {[
                                    { id: 'focus', label: 'Focus' },
                                    { id: 'short', label: 'Short' },
                                    { id: 'long', label: 'Long' }
                                ].map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => changeMode(m.id as any)}
                                        className={`flex-1 text-[10px] py-2 rounded-lg font-bold transition-all ${mode === m.id ? 'bg-white dark:bg-gray-600 text-red-500 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            {/* Timer Display (Text Only) */}
                            <div className="text-center mb-8">
                                <div className="text-6xl font-bold text-gray-800 dark:text-white tabular-nums tracking-tighter">
                                    {formatTime(timeLeft)}
                                </div>
                                <div className={`text-sm font-bold uppercase tracking-widest mt-2 ${isActive ? 'text-green-500 animate-pulse' : 'text-gray-400'}`}>
                                    {isActive ? 'Running' : 'Paused'}
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex gap-3">
                                <button onClick={toggleTimer} className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 ${isActive ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-500 hover:bg-red-600'}`}>
                                    {isActive ? 'Pause' : 'Start'}
                                </button>
                                <button onClick={resetTimer} className="px-5 py-3 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                    ↺
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Floating Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`pointer-events-auto w-12 h-12 md:w-14 md:h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 z-40 relative group border-2 ${isOpen ? 'bg-red-500 border-red-400 rotate-90' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
            >
                {isOpen ? (
                    <span className="text-white font-bold text-xl">✕</span>
                ) : (
                    <>
                        <span className="text-2xl group-hover:scale-125 transition-transform filter drop-shadow-sm">🍅</span>
                        {isActive && (
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 border-2 border-white dark:border-gray-800"></span>
                            </span>
                        )}
                        {/* Mini Timer Badge when closed */}
                        {isActive && !isOpen && (
                            <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xl whitespace-nowrap animate-fade-in-right">
                                {formatTime(timeLeft)}
                            </div>
                        )}
                    </>
                )}
            </button>
        </div>
    );
};
