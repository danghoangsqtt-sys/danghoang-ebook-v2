
import React, { useState, useEffect } from 'react';
import { Habit, CalendarEvent, Task } from '../types';
import { googleCalendarService } from '../services/googleCalendar';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ComposedChart, Line
} from 'recharts';

// --- Helper Functions ---
const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generateWeekDays = (startDate: Date) => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }
  return days;
};

const COLORS = [
    { label: 'Xanh dương', value: 'bg-blue-500 border-blue-600', hex: '#3b82f6' },
    { label: 'Xanh lá', value: 'bg-green-500 border-green-600', hex: '#10b981' },
    { label: 'Vàng', value: 'bg-yellow-500 border-yellow-600', hex: '#f59e0b' },
    { label: 'Đỏ', value: 'bg-red-500 border-red-600', hex: '#ef4444' },
    { label: 'Tím', value: 'bg-purple-500 border-purple-600', hex: '#8b5cf6' },
];

const inputStyle = "w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600 transition-colors placeholder-gray-400 font-medium shadow-sm";

export const Planner: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));
  
  // Data State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // UI State
  const [isEventModalOpen, setEventModalOpen] = useState(false);
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userHasToken, setUserHasToken] = useState(false);
  
  // New Item Form State
  const [modalMode, setModalMode] = useState<'event' | 'task'>('event');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemTime, setNewItemTime] = useState('09:00');
  const [newItemColor, setNewItemColor] = useState(COLORS[0].value);
  const [syncToGoogle, setSyncToGoogle] = useState(true); // Default to true if available
  
  const [newHabitName, setNewHabitName] = useState('');

  // Load Data
  useEffect(() => {
    const savedHabits = localStorage.getItem('dh_habits');
    const savedEvents = localStorage.getItem('dh_events');
    const savedTasks = localStorage.getItem('dh_tasks');
    
    if(savedHabits) setHabits(JSON.parse(savedHabits));
    else setHabits([
        { id: '1', name: 'Tập Gym / Chạy bộ', targetPerWeek: 5, completedDates: [], streak: 0 },
        { id: '2', name: 'Đọc sách 30 phút', targetPerWeek: 7, completedDates: [], streak: 0 },
    ]);

    if(savedEvents) setEvents(JSON.parse(savedEvents));
    if(savedTasks) setTasks(JSON.parse(savedTasks));

    // Check login status for Google Sync
    const profile = localStorage.getItem('dh_user_profile');
    if (profile && JSON.parse(profile).accessToken) {
        setUserHasToken(true);
    }
  }, []);

  // Save Data
  useEffect(() => {
      localStorage.setItem('dh_habits', JSON.stringify(habits));
      localStorage.setItem('dh_events', JSON.stringify(events));
      localStorage.setItem('dh_tasks', JSON.stringify(tasks));
  }, [habits, events, tasks]);

  // --- Handlers ---
  const handleSyncGoogle = async () => {
      if (!userHasToken) return alert("Vui lòng đăng nhập Google trong phần Cài đặt để sử dụng tính năng này.");
      
      setIsSyncing(true);
      try {
          // Fetch current month + next month events range
          const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).toISOString();
          const googleEvents = await googleCalendarService.listEvents(start);
          
          // Merge: Keep local events that are NOT from google, append new google events
          const localOnly = events.filter(e => !e.googleEventId);
          
          // Optional: Check duplicates by ID if we want to update existing synced events
          const merged = [...localOnly, ...googleEvents];
          setEvents(merged);
          alert(`Đã đồng bộ thành công ${googleEvents.length} sự kiện từ Google Calendar!`);
      } catch (e) {
          console.error(e);
          alert("Lỗi đồng bộ: " + (e as any).message);
      } finally {
          setIsSyncing(false);
      }
  };

  const changeWeek = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (offset * 7));
    setCurrentDate(newDate);
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  // Habit Logic
  const toggleHabit = (habitId: string, dateStr: string) => {
      setHabits(prev => prev.map(h => {
          if(h.id !== habitId) return h;
          const exists = h.completedDates.includes(dateStr);
          let newDates;
          if(exists) newDates = h.completedDates.filter(d => d !== dateStr);
          else newDates = [...h.completedDates, dateStr];
          const streak = newDates.length; 
          return { ...h, completedDates: newDates, streak };
      }));
  };

  const addHabit = () => {
      if(!newHabitName.trim()) return;
      setHabits([...habits, { id: Date.now().toString(), name: newHabitName, targetPerWeek: 7, completedDates: [], streak: 0 }]);
      setNewHabitName('');
  };

  const deleteHabit = (id: string) => {
      if(window.confirm("Xóa thói quen này?")) setHabits(habits.filter(h => h.id !== id));
  };

  // Task & Event Logic
  const toggleTask = (id: string) => {
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteEvent = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(window.confirm('Xóa sự kiện này?')) setEvents(events.filter(ev => ev.id !== id));
  };

  const deleteTask = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTasks(tasks.filter(t => t.id !== id));
  };

  const handleSaveItem = async () => {
      if(!newItemTitle.trim()) return;

      if (modalMode === 'event') {
          const startDateTime = new Date(selectedDate);
          const [hours, mins] = newItemTime.split(':');
          startDateTime.setHours(parseInt(hours), parseInt(mins));
          const endDateTime = new Date(startDateTime.getTime() + 60*60*1000); // Default 1 hour
          
          const newItem: CalendarEvent = {
              id: Date.now().toString(),
              title: newItemTitle,
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
              color: newItemColor
          };

          // Google Sync
          if (syncToGoogle && userHasToken) {
              try {
                  const googleId = await googleCalendarService.createEvent(newItem);
                  newItem.googleEventId = googleId;
              } catch (e) {
                  console.error("Failed to sync to google", e);
                  alert("Lưu local thành công nhưng lỗi đồng bộ Google: " + (e as any).message);
              }
          }

          setEvents([...events, newItem]);
      } else {
          const newTask: Task = {
              id: Date.now().toString(),
              title: newItemTitle,
              completed: false,
              date: selectedDate,
              type: 'task'
          };
          setTasks([...tasks, newTask]);
      }
      setEventModalOpen(false);
      setNewItemTitle('');
      setNewItemTime('09:00');
  };

  // --- Stats Calculation ---
  const getWeeklyStats = () => {
      const weekStart = getStartOfWeek(currentDate);
      const days = generateWeekDays(weekStart);
      const weekDateStrings = days.map(formatDate);

      const weekTasks = tasks.filter(t => weekDateStrings.includes(t.date));
      const completedTasks = weekTasks.filter(t => t.completed).length;
      const taskRate = weekTasks.length > 0 ? Math.round((completedTasks / weekTasks.length) * 100) : 0;

      let totalTargetChecks = 0;
      let totalActualChecks = 0;
      const habitBreakdown = habits.map(h => {
          const actual = h.completedDates.filter(d => weekDateStrings.includes(d)).length;
          const target = h.targetPerWeek || 7;
          totalTargetChecks += target;
          totalActualChecks += actual;
          return { name: h.name, actual, target, percent: Math.min(100, Math.round((actual/target)*100)) };
      });

      const habitRate = totalTargetChecks > 0 ? Math.round((totalActualChecks / totalTargetChecks) * 100) : 0;

      const dailyActivityData = days.map(date => {
          const dStr = formatDate(date);
          const tDone = tasks.filter(t => t.date === dStr && t.completed).length;
          const hDone = habits.reduce((acc, h) => acc + (h.completedDates.includes(dStr) ? 1 : 0), 0);
          return {
              name: date.toLocaleDateString('vi-VN', {weekday: 'short'}),
              Tasks: tDone,
              Habits: hDone,
              Total: tDone + hDone
          };
      });

      return {
          totalTasks: weekTasks.length,
          completedTasks,
          taskRate,
          habitRate,
          habitBreakdown,
          dailyActivityData,
      };
  };

  const weekDays = generateWeekDays(getStartOfWeek(currentDate));
  const stats = getWeeklyStats();
  const todayStr = formatDate(new Date());

  // --- Components ---

  const renderMonthView = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; 
      const blanks = Array(startDayOfWeek).fill(null);
      const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      
      return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                    <div key={d} className="py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
                {blanks.map((_, i) => <div key={`b-${i}`} className="bg-gray-50/30 dark:bg-gray-900/30 min-h-[100px] border-r border-b border-gray-100 dark:border-gray-800"></div>)}
                {days.map(d => {
                    const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dayEvents = events.filter(e => e.start.startsWith(dateStr));
                    const dayTasks = tasks.filter(t => t.date === dateStr);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;

                    return (
                        <div 
                            key={d} 
                            className={`min-h-[100px] p-2 border-r border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors relative group
                                ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                                ${isSelected ? 'ring-2 ring-inset ring-blue-500' : ''}
                            `}
                            onClick={() => { setSelectedDate(dateStr); setEventModalOpen(true); }}
                        >
                            <div className="flex justify-between items-start">
                                <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>{d}</span>
                                {(dayTasks.length > 0) && <span className="text-[10px] text-gray-400">{dayTasks.filter(t=>t.completed).length}/{dayTasks.length} task</span>}
                            </div>
                            <div className="mt-2 space-y-1">
                                {dayEvents.slice(0, 3).map(ev => (
                                    <div key={ev.id} className={`text-[10px] truncate px-1.5 py-0.5 rounded text-white flex items-center gap-1 ${ev.color.split(' ')[0]}`}>
                                        {ev.googleEventId && <span className="text-[8px]">G</span>}
                                        {ev.title}
                                    </div>
                                ))}
                                {dayEvents.length > 3 && <div className="text-[10px] text-gray-400 pl-1">+ {dayEvents.length - 3} khác</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  };

  const renderWeekView = () => {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-3 h-full">
            {weekDays.map((date) => {
                const dateStr = formatDate(date);
                const isToday = dateStr === todayStr;
                const dayEvents = events.filter(e => e.start.startsWith(dateStr)).sort((a,b) => a.start.localeCompare(b.start));
                const dayTasks = tasks.filter(t => t.date === dateStr);

                return (
                    <div key={dateStr} className={`flex flex-col min-h-[300px] rounded-2xl border transition-all ${isToday ? 'bg-blue-50/30 border-blue-200 shadow-md ring-1 ring-blue-200' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                        {/* Header */}
                        <div className={`p-3 text-center border-b ${isToday ? 'border-blue-200 bg-blue-100/50 text-blue-700' : 'border-gray-100 dark:border-gray-700'}`}>
                            <p className="text-xs font-bold uppercase opacity-70">{date.toLocaleDateString('vi-VN', { weekday: 'short' })}</p>
                            <p className="text-xl font-bold">{date.getDate()}</p>
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 p-2 space-y-3 overflow-y-auto scrollbar-hide" onClick={() => { setSelectedDate(dateStr); setEventModalOpen(true); }}>
                            {/* Events Section */}
                            {dayEvents.length > 0 && (
                                <div className="space-y-1.5">
                                    {dayEvents.map(ev => (
                                        <div key={ev.id} className={`group relative p-2 rounded-lg text-white text-xs shadow-sm cursor-pointer hover:scale-[1.02] transition-transform ${ev.color.split(' ')[0]}`}>
                                            <div className="font-bold truncate flex items-center gap-1">
                                                {ev.googleEventId && <span>🌐</span>}
                                                {ev.title}
                                            </div>
                                            <div className="opacity-90 text-[10px]">{new Date(ev.start).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</div>
                                            <button onClick={(e) => deleteEvent(ev.id, e)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-white hover:text-red-200">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Tasks Section */}
                            {dayTasks.length > 0 && (
                                <div className="space-y-1">
                                    {dayTasks.map(t => (
                                        <div key={t.id} className="group flex items-start gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer">
                                            <input type="checkbox" checked={t.completed} onChange={() => toggleTask(t.id)} onClick={(e) => e.stopPropagation()} className="mt-0.5 w-3.5 h-3.5 text-blue-600 rounded border-gray-300 cursor-pointer" />
                                            <span className={`text-xs leading-tight flex-1 ${t.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`} onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>{t.title}</span>
                                            <button onClick={(e) => deleteTask(t.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {dayEvents.length === 0 && dayTasks.length === 0 && (
                                <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                    <button className="text-gray-400 text-2xl font-light">+</button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      );
  };

  return (
    <div className="pb-20 animate-fade-in space-y-6">
      {/* 1. Dashboard Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                  <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                      <span>🗓️</span> Kế Hoạch & Công Việc
                  </h1>
                  <p className="text-blue-100 mt-1 text-sm">Quản lý thời gian hiệu quả mỗi ngày.</p>
              </div>
              <div className="flex gap-3 bg-white/10 p-1 rounded-xl backdrop-blur-sm flex-wrap">
                   <button onClick={() => setViewMode('week')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'week' ? 'bg-white text-blue-600 shadow' : 'text-blue-100 hover:bg-white/10'}`}>Tuần này</button>
                   <button onClick={() => setViewMode('month')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'month' ? 'bg-white text-blue-600 shadow' : 'text-blue-100 hover:bg-white/10'}`}>Tháng</button>
                   <button onClick={handleSyncGoogle} disabled={!userHasToken || isSyncing} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${userHasToken ? 'text-blue-100 hover:bg-white/10' : 'text-white/30 cursor-not-allowed'}`}>
                       <span>{isSyncing ? '🔄' : '🌐'}</span> {isSyncing ? 'Đang Sync...' : 'Sync Google'}
                   </button>
                   <button onClick={() => setSummaryOpen(true)} className="px-4 py-2 rounded-lg text-sm font-bold text-blue-100 hover:bg-white/10 flex items-center gap-2"><span>📊</span> Báo cáo</button>
              </div>
          </div>
          
          {/* Quick Stats Today */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/20">
             <div>
                 <p className="text-xs text-blue-200 uppercase font-bold">Hôm nay</p>
                 <p className="text-2xl font-bold">{new Date().toLocaleDateString('vi-VN', {weekday:'long', day:'numeric', month:'numeric'})}</p>
             </div>
             <div>
                 <p className="text-xs text-blue-200 uppercase font-bold">Công việc</p>
                 <p className="text-2xl font-bold">{tasks.filter(t => t.date === todayStr && t.completed).length} <span className="text-sm opacity-70 font-normal">/ {tasks.filter(t => t.date === todayStr).length}</span></p>
             </div>
             <div>
                 <p className="text-xs text-blue-200 uppercase font-bold">Thói quen</p>
                 <p className="text-2xl font-bold">{habits.filter(h => h.completedDates.includes(todayStr)).length} <span className="text-sm opacity-70 font-normal">/ {habits.length}</span></p>
             </div>
             <button onClick={() => { setSelectedDate(todayStr); setEventModalOpen(true); }} className="bg-white text-blue-600 rounded-xl font-bold text-sm shadow-md hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                 <span>+</span> Tạo mới
             </button>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* 2. Habits Sidebar (Left) */}
          <div className="lg:col-span-1 space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                      <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><span>🌱</span> Thói quen</h3>
                      <div className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{Math.round(stats.habitRate)}% tuần</div>
                  </div>
                  
                  <div className="p-4 space-y-4">
                      {/* Add Habit */}
                      <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={newHabitName}
                            onChange={e => setNewHabitName(e.target.value)}
                            placeholder="Thói quen mới..."
                            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                            onKeyDown={e => e.key === 'Enter' && addHabit()}
                          />
                          <button onClick={addHabit} className="bg-green-600 hover:bg-green-700 text-white px-3 rounded-lg font-bold transition-colors shadow-sm">+</button>
                      </div>

                      {/* Habit List */}
                      <div className="space-y-3">
                          {habits.map(habit => {
                              const doneToday = habit.completedDates.includes(todayStr);
                              return (
                                  <div key={habit.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 hover:shadow-md transition-all group relative">
                                      <button onClick={() => deleteHabit(habit.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">×</button>
                                      
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate pr-4">{habit.name}</h4>
                                          <span className="text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              🔥 {habit.streak}
                                          </span>
                                      </div>
                                      
                                      <div className="flex justify-between items-center">
                                          <div className="flex gap-1">
                                              {/* Mini Week Visualization */}
                                              {weekDays.map((d, idx) => {
                                                  const dStr = formatDate(d);
                                                  const isDone = habit.completedDates.includes(dStr);
                                                  const isToday = dStr === todayStr;
                                                  return (
                                                      <div 
                                                        key={idx} 
                                                        className={`w-1.5 h-4 rounded-full transition-colors ${isDone ? 'bg-green-500' : isToday ? 'bg-gray-300 animate-pulse' : 'bg-gray-100 dark:bg-gray-700'}`}
                                                        title={d.toLocaleDateString()}
                                                      ></div>
                                                  )
                                              })}
                                          </div>
                                          <button 
                                            onClick={() => toggleHabit(habit.id, todayStr)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all transform active:scale-95 ${doneToday ? 'bg-green-500 border-green-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600 hover:border-green-500 hover:text-green-500'}`}
                                          >
                                              {doneToday ? 'Đã xong' : 'Check-in'}
                                          </button>
                                      </div>
                                  </div>
                              );
                          })}
                          {habits.length === 0 && <p className="text-center text-gray-400 text-xs italic py-4">Chưa có thói quen nào.</p>}
                      </div>
                  </div>
              </div>
          </div>

          {/* 3. Main Calendar (Right) */}
          <div className="lg:col-span-3 space-y-4">
              <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <button onClick={() => viewMode === 'week' ? changeWeek(-1) : changeMonth(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">◀</button>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white capitalize">
                      {currentDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                      {viewMode === 'week' && <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2 hidden sm:inline">
                          (Tuần {weekDays[0].getDate()} - {weekDays[6].getDate()})
                      </span>}
                  </h2>
                  <button onClick={() => viewMode === 'week' ? changeWeek(1) : changeMonth(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">▶</button>
              </div>

              {viewMode === 'week' ? renderWeekView() : renderMonthView()}
          </div>
      </div>

      {/* Add Modal */}
      {isEventModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-gray-200 dark:border-gray-700">
                   <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                      <div>
                          <h3 className="font-bold text-lg text-gray-800 dark:text-white">Thêm mới</h3>
                          <p className="text-xs text-gray-500">{new Date(selectedDate).toLocaleDateString('vi-VN', {weekday:'long', day:'numeric', month:'long'})}</p>
                      </div>
                      <button onClick={() => setEventModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
                  </div>
                  
                  <div className="p-6 space-y-5">
                      {/* Type Selector */}
                      <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                          <button onClick={() => setModalMode('event')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${modalMode === 'event' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>📅 Sự kiện</button>
                          <button onClick={() => setModalMode('task')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${modalMode === 'task' ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>✅ Công việc</button>
                      </div>

                      {/* Inputs */}
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nội dung</label>
                          <input type="text" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} className={inputStyle} placeholder="Ví dụ: Họp team, Đi siêu thị..." autoFocus />
                      </div>

                      {modalMode === 'event' && (
                          <>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Giờ bắt đầu</label>
                                      <input type="time" value={newItemTime} onChange={e => setNewItemTime(e.target.value)} className={inputStyle} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu sắc</label>
                                      <div className="flex gap-2 mt-2">
                                          {COLORS.map(c => (
                                              <button key={c.value} onClick={() => setNewItemColor(c.value)} className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${c.value.split(' ')[0]} ${newItemColor===c.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} title={c.label}></button>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                              {userHasToken && (
                                  <div className="flex items-center gap-2 pt-2">
                                      <input 
                                        type="checkbox" 
                                        id="syncGoogle" 
                                        checked={syncToGoogle} 
                                        onChange={(e) => setSyncToGoogle(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                      />
                                      <label htmlFor="syncGoogle" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                          Thêm vào Google Calendar
                                      </label>
                                  </div>
                              )}
                          </>
                      )}
                      
                      <button onClick={handleSaveItem} className={`w-full py-3 rounded-xl font-bold text-white shadow-lg mt-2 transition-transform active:scale-95 ${modalMode === 'event' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>
                          {modalMode === 'event' ? 'Lưu Sự Kiện' : 'Thêm Công Việc'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Report Modal */}
      {isSummaryOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl animate-fade-in-up border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><span>📊</span> Báo Cáo Tuần</h2>
                <button onClick={() => setSummaryOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <p className="text-xs font-bold text-blue-600 dark:text-blue-300 uppercase">Task Hoàn thành</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">{stats.completedTasks}/{stats.totalTasks}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
                        <p className="text-xs font-bold text-green-600 dark:text-green-300 uppercase">Tỷ lệ Task</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">{stats.taskRate}%</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-800">
                        <p className="text-xs font-bold text-purple-600 dark:text-purple-300 uppercase">Kỷ luật Habit</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">{stats.habitRate}%</p>
                    </div>
                </div>

                <div className="h-64 mb-8 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stats.dailyActivityData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                            <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                            <Bar dataKey="Tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                            <Line type="monotone" dataKey="Habits" stroke="#10b981" strokeWidth={3} dot={{r: 4}} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div>
                    <h3 className="font-bold text-gray-800 dark:text-white mb-4">Chi tiết thói quen</h3>
                    <div className="space-y-4">
                        {stats.habitBreakdown.map((h, idx) => (
                            <div key={idx}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{h.name}</span>
                                    <span className="font-bold text-gray-900 dark:text-white">{h.percent}%</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${h.percent >= 80 ? 'bg-green-500' : h.percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{width: `${h.percent}%`}}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
