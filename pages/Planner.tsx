import React, { useState, useEffect, useMemo } from 'react';
import { Habit, CalendarEvent, Task } from '../types';
import { firebaseService } from '../services/firebase';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis
} from 'recharts';

// --- Helper Functions ---
const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const COLORS = [
    { label: 'Xanh dương', value: 'bg-blue-500 border-blue-600', hex: '#3b82f6' },
    { label: 'Xanh lá', value: 'bg-green-500 border-green-600', hex: '#10b981' },
    { label: 'Vàng', value: 'bg-yellow-500 border-yellow-600', hex: '#f59e0b' },
    { label: 'Đỏ', value: 'bg-red-500 border-red-600', hex: '#ef4444' },
    { label: 'Tím', value: 'bg-purple-500 border-purple-600', hex: '#8b5cf6' },
];

const inputStyle = "w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white transition-colors placeholder-gray-400 font-medium";

export const Planner: React.FC = () => {
    // --- State ---
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDate(new Date()));

    // Data State
    const [habits, setHabits] = useState<Habit[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    // UI State
    const [isAddItemOpen, setIsAddItemOpen] = useState(false);
    const [newItemType, setNewItemType] = useState<'event' | 'task'>('task');

    // Form State
    const [itemTitle, setItemTitle] = useState('');
    const [itemTime, setItemTime] = useState('09:00');
    const [itemColor, setItemColor] = useState(COLORS[0].value);
    const [newHabitName, setNewHabitName] = useState('');

    // --- Data Loading ---
    useEffect(() => {
        const load = async () => {
            try {
                const [h, e, t] = await Promise.all([
                    firebaseService.getUserData('habits'),
                    firebaseService.getUserData('events'),
                    firebaseService.getUserData('tasks')
                ]);

                if (h) setHabits(h);
                else setHabits([{ id: '1', name: 'Tập thể dục', targetPerWeek: 5, completedDates: [], streak: 0 }]);

                if (e) setEvents(e);
                if (t) setTasks(t);
            } catch (error) {
                console.error("Failed to load planner data", error);
            } finally {
                setIsDataLoaded(true);
            }
        };
        load();
    }, []);

    // --- Auto Save ---
    useEffect(() => { if (isDataLoaded) firebaseService.saveUserData('habits', habits); }, [habits, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) firebaseService.saveUserData('events', events); }, [events, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) firebaseService.saveUserData('tasks', tasks); }, [tasks, isDataLoaded]);

    // --- Computed Data for Selected Date ---
    const dayEvents = useMemo(() =>
        events
            .filter(e => e.start.startsWith(selectedDateStr))
            .sort((a, b) => a.start.localeCompare(b.start)),
        [events, selectedDateStr]);

    const dayTasks = useMemo(() =>
        tasks.filter(t => t.date === selectedDateStr),
        [tasks, selectedDateStr]);

    const completionRate = useMemo(() => {
        const total = dayTasks.length;
        if (total === 0) return 0;
        return Math.round((dayTasks.filter(t => t.completed).length / total) * 100);
    }, [dayTasks]);

    // --- Handlers ---
    const changeMonth = (offset: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setCurrentDate(newDate);
    };

    const handleSaveItem = () => {
        if (!itemTitle.trim()) return;

        if (newItemType === 'event') {
            const startDateTime = new Date(selectedDateStr);
            const [hours, mins] = itemTime.split(':');
            startDateTime.setHours(parseInt(hours), parseInt(mins));
            const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

            const newItem: CalendarEvent = {
                id: Date.now().toString(),
                title: itemTitle,
                start: startDateTime.toISOString(),
                end: endDateTime.toISOString(),
                color: itemColor
            };
            setEvents([...events, newItem]);
        } else {
            const newTask: Task = {
                id: Date.now().toString(),
                title: itemTitle,
                completed: false,
                date: selectedDateStr,
                type: 'task'
            };
            setTasks([...tasks, newTask]);
        }
        setItemTitle('');
        setIsAddItemOpen(false);
    };

    const toggleTask = (id: string) => {
        setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    };

    const deleteItem = (id: string, type: 'event' | 'task') => {
        if (type === 'event') setEvents(events.filter(e => e.id !== id));
        else setTasks(tasks.filter(t => t.id !== id));
    };

    // Habit Handlers
    const toggleHabit = (habitId: string) => {
        const today = formatDate(new Date());
        setHabits(prev => prev.map(h => {
            if (h.id !== habitId) return h;
            const exists = h.completedDates.includes(today);
            let newDates = exists ? h.completedDates.filter(d => d !== today) : [...h.completedDates, today];
            return { ...h, completedDates: newDates, streak: newDates.length }; // Simple streak for now
        }));
    };

    const addHabit = () => {
        if (!newHabitName.trim()) return;
        setHabits([...habits, { id: Date.now().toString(), name: newHabitName, targetPerWeek: 7, completedDates: [], streak: 0 }]);
        setNewHabitName('');
    };

    const deleteHabit = (id: string) => {
        if (window.confirm("Xóa thói quen này?")) setHabits(habits.filter(h => h.id !== id));
    };

    // --- Components ---

    const CalendarGrid = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const blanks = Array(startDayOfWeek).fill(null);
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const todayStr = formatDate(new Date());

        return (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white capitalize">
                        {currentDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors">◀</button>
                        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors">▶</button>
                    </div>
                </div>

                <div className="grid grid-cols-7 mb-4">
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                        <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase">{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {blanks.map((_, i) => <div key={`b-${i}`} className="aspect-square"></div>)}
                    {days.map(d => {
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const isSelected = dateStr === selectedDateStr;
                        const isToday = dateStr === todayStr;

                        // Dots for content
                        const hasEvent = events.some(e => e.start.startsWith(dateStr));
                        const hasTask = tasks.some(t => t.date === dateStr && !t.completed);

                        return (
                            <div
                                key={d}
                                onClick={() => setSelectedDateStr(dateStr)}
                                className={`
                                aspect-square rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all relative group
                                ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105 z-10' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}
                                ${isToday && !isSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-bold border border-blue-200 dark:border-blue-800' : ''}
                            `}
                            >
                                <span className="text-sm">{d}</span>
                                <div className="flex gap-1 mt-1 h-1.5">
                                    {hasEvent && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-red-400'}`}></div>}
                                    {hasTask && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-green-400'}`}></div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const AgendaSidebar = () => {
        const selectedDate = new Date(selectedDateStr);
        const isToday = selectedDateStr === formatDate(new Date());

        return (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 h-[calc(100vh-140px)] sticky top-6 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-br from-blue-50 to-white dark:from-gray-800 dark:to-gray-900">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">
                                {isToday ? 'Hôm nay' : 'Tiêu điểm'}
                            </p>
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                                {selectedDate.getDate()} <span className="text-lg font-normal text-gray-500">tháng {selectedDate.getMonth() + 1}</span>
                            </h2>
                            <p className="text-sm text-gray-400">{selectedDate.toLocaleDateString('vi-VN', { weekday: 'long' })}</p>
                        </div>

                        {/* Mini Progress */}
                        <div className="relative w-12 h-12 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                <path className="text-gray-200 dark:text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path className="text-blue-500 transition-all duration-1000" strokeDasharray={`${completionRate}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                            </svg>
                            <span className="absolute text-[10px] font-bold text-blue-600 dark:text-blue-400">{completionRate}%</span>
                        </div>
                    </div>
                </div>

                {/* Add Item Form (Collapsible) */}
                <div className={`border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 transition-all duration-300 overflow-hidden ${isAddItemOpen ? 'max-h-60 p-4' : 'max-h-0'}`}>
                    <div className="flex gap-2 mb-3">
                        <button onClick={() => setNewItemType('task')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${newItemType === 'task' ? 'bg-white dark:bg-gray-700 text-green-600 shadow-sm' : 'text-gray-400'}`}>Công việc</button>
                        <button onClick={() => setNewItemType('event')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${newItemType === 'event' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-400'}`}>Sự kiện</button>
                    </div>
                    <input
                        value={itemTitle}
                        onChange={e => setItemTitle(e.target.value)}
                        placeholder={newItemType === 'task' ? "Nhập công việc..." : "Nhập tên sự kiện..."}
                        className={inputStyle}
                        autoFocus={isAddItemOpen}
                        onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                    />
                    {newItemType === 'event' && (
                        <div className="flex gap-2 mt-2">
                            <input type="time" value={itemTime} onChange={e => setItemTime(e.target.value)} className={`${inputStyle} w-24`} />
                            <div className="flex-1 flex items-center gap-1 justify-end">
                                {COLORS.map(c => (
                                    <button key={c.value} onClick={() => setItemColor(c.value)} className={`w-6 h-6 rounded-full ${c.value.split(' ')[0]} ${itemColor === c.value ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex gap-2 mt-3">
                        <button onClick={() => setIsAddItemOpen(false)} className="flex-1 py-2 text-xs font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                        <button onClick={handleSaveItem} className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Lưu</button>
                    </div>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    {/* Events Section */}
                    {dayEvents.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                                <span>📅</span> Lịch trình
                            </h4>
                            <div className="space-y-3 pl-2 border-l-2 border-gray-100 dark:border-gray-700 ml-1">
                                {dayEvents.map(ev => (
                                    <div key={ev.id} className="relative pl-4 group">
                                        <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${ev.color.split(' ')[0]}`}></div>
                                        <div className="bg-white dark:bg-gray-700/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold text-sm text-gray-800 dark:text-white">{ev.title}</p>
                                                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                                                        {new Date(ev.start).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} -
                                                        {new Date(ev.end).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                                <button onClick={() => deleteItem(ev.id, 'event')} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tasks Section */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                            <span>✅</span> Cần làm ({dayTasks.filter(t => !t.completed).length})
                        </h4>
                        {dayTasks.length > 0 ? (
                            <div className="space-y-2">
                                {dayTasks.map(t => (
                                    <div key={t.id} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent hover:border-gray-100 dark:hover:border-gray-700 transition-all cursor-pointer" onClick={() => toggleTask(t.id)}>
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${t.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {t.completed && <span className="text-white text-xs font-bold">✓</span>}
                                        </div>
                                        <span className={`flex-1 text-sm ${t.completed ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200 font-medium'}`}>{t.title}</span>
                                        <button onClick={(e) => { e.stopPropagation(); deleteItem(t.id, 'task'); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 px-2">×</button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-400 text-xs italic bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                Chưa có công việc nào
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Action */}
                {!isAddItemOpen && (
                    <div className="p-4 absolute bottom-4 right-4">
                        <button
                            onClick={() => setIsAddItemOpen(true)}
                            className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl shadow-blue-500/40 flex items-center justify-center text-2xl hover:scale-110 transition-transform active:scale-95"
                        >
                            +
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="pb-20 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>🗓️</span> Kế Hoạch Cá Nhân
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm">Quản lý thời gian và xây dựng thói quen tốt.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: 8 Cols */}
                <div className="lg:col-span-8 space-y-8">
                    {/* 1. Habit Tracker (Horizontal) */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <span>🔥</span> Thói quen Hàng ngày
                            </h3>
                            <div className="flex gap-2">
                                <input
                                    value={newHabitName}
                                    onChange={e => setNewHabitName(e.target.value)}
                                    placeholder="Thêm thói quen..."
                                    className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 w-40 transition-all"
                                    onKeyDown={e => e.key === 'Enter' && addHabit()}
                                />
                                <button onClick={addHabit} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100">+</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {habits.map(h => {
                                const isDoneToday = h.completedDates.includes(formatDate(new Date()));
                                return (
                                    <div
                                        key={h.id}
                                        onClick={() => toggleHabit(h.id)}
                                        className={`
                                        relative overflow-hidden p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 group select-none
                                        ${isDoneToday
                                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                                : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-200'
                                            }
                                    `}
                                    >
                                        <div className="flex items-center gap-3 relative z-10 pr-6">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 transition-colors ${isDoneToday ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                                {isDoneToday ? '✓' : ''}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className={`font-bold text-sm truncate ${isDoneToday ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}>{h.name}</h4>
                                                <p className="text-[10px] text-gray-400 mt-0.5 font-mono">Streak: {h.streak} ngày</p>
                                            </div>
                                        </div>
                                        {isDoneToday && <div className="absolute bottom-0 left-0 h-1 bg-green-500 w-full opacity-50"></div>}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteHabit(h.id); }}
                                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 transition-opacity z-20 bg-white/80 dark:bg-gray-800/80 rounded-full backdrop-blur-sm hover:bg-red-50 dark:hover:bg-red-900/30"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                            {habits.length === 0 && <p className="text-gray-400 text-xs italic col-span-full text-center py-4">Chưa có thói quen nào. Hãy thêm mới!</p>}
                        </div>
                    </div>

                    {/* 2. Calendar */}
                    <CalendarGrid />
                </div>

                {/* Right Column: 4 Cols (Agenda Sidebar) */}
                <div className="lg:col-span-4 relative">
                    <AgendaSidebar />
                </div>
            </div>
        </div>
    );
};