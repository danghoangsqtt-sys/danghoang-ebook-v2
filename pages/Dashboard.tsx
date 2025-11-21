
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { CourseNode, VocabTerm, Transaction, Task, Habit } from '../types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// --- Types ---
interface ActivityLog {
  id: string;
  type: 'learning' | 'finance' | 'task' | 'system';
  title: string;
  subtitle?: string;
  timestamp: number;
  icon: string;
  color: string;
}

interface SystemStatus {
  online: boolean;
  storageUsed: number;
  storageTotal: number;
  hasApiKey: boolean;
  version: string;
}

// --- Helper Components ---

const QuickActionBtn = ({ icon, label, onClick, colorClass }: { icon: string, label: string, onClick: () => void, colorClass: string }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all transform active:scale-95 hover:shadow-md ${colorClass} min-w-[80px] flex-1 sm:flex-none`}
    >
        <span className="text-2xl mb-1">{icon}</span>
        <span className="text-xs font-bold">{label}</span>
    </button>
);

const StatCard = ({ title, value, subValue, icon, colorGradient }: { title: string, value: string | number, subValue: string, icon: string, colorGradient: string }) => (
    <div className={`rounded-2xl p-5 text-white shadow-lg relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 ${colorGradient}`}>
        <div className="relative z-10">
            <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
            <h3 className="text-2xl md:text-3xl font-bold">{value}</h3>
            <p className="text-[10px] md:text-xs text-white/70 mt-2 font-medium bg-white/10 w-fit px-2 py-0.5 rounded backdrop-blur-sm">
                {subValue}
            </p>
        </div>
        <span className="absolute -right-3 -bottom-5 text-8xl opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform select-none">
            {icon}
        </span>
    </div>
);

const ActivityItem = ({ item, isLast }: { item: ActivityLog, isLast: boolean }) => (
    <div className="flex gap-3 md:gap-4 relative group">
        {/* Timeline Line */}
        {!isLast && <div className="absolute left-[19px] top-10 bottom-[-12px] w-0.5 bg-gray-100 dark:bg-gray-700 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors"></div>}
        
        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm z-10 border-4 border-white dark:border-gray-800 ${item.color}`}>
            <span className="text-sm md:text-base">{item.icon}</span>
        </div>
        
        {/* Content */}
        <div className="flex-1 pb-4 md:pb-6 min-w-0">
            <div className="flex justify-between items-start">
                <p className="font-bold text-gray-800 dark:text-gray-200 text-xs md:text-sm truncate pr-2">{item.title}</p>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            {item.subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{item.subtitle}</p>}
        </div>
    </div>
);

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  
  // --- State ---
  const [greeting, setGreeting] = useState('');
  const [quote, setQuote] = useState('');
  const [stats, setStats] = useState({
    vocabCount: 0,
    pendingTasks: 0,
    financeBalance: 0,
    activeHabits: 0,
    habitStreak: 0
  });
  const [pinnedCourses, setPinnedCourses] = useState<CourseNode[]>([]);
  const [taskActivity, setTaskActivity] = useState<any[]>([]);
  const [expenseData, setExpenseData] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
      online: navigator.onLine,
      storageUsed: 0,
      storageTotal: 5 * 1024 * 1024,
      hasApiKey: false,
      version: '2.3.0'
  });

  // --- Effects ---
  useEffect(() => {
    // 1. Greeting & Quote
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) { setGreeting('Chào buổi sáng'); setQuote('Hãy bắt đầu ngày mới đầy năng lượng! ⚡'); }
    else if (hour >= 12 && hour < 18) { setGreeting('Chào buổi chiều'); setQuote('Giữ vững sự tập trung nhé! 🎯'); }
    else { setGreeting('Chào buổi tối'); setQuote('Thư giãn và tổng kết ngày dài. 🌙'); }

    // 2. Load Data
    loadDashboardData();

    // 3. Listeners
    const updateOnlineStatus = () => setSystemStatus(prev => ({ ...prev, online: navigator.onLine }));
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const loadDashboardData = () => {
    const logs: ActivityLog[] = [];

    // --- VOCAB ---
    try {
      const terms: VocabTerm[] = JSON.parse(localStorage.getItem('dh_vocab_terms') || '[]');
      setStats(prev => ({ ...prev, vocabCount: terms.length }));
      terms.slice(-5).forEach(t => {
          if(t.createdAt) logs.push({
              id: `vocab_${t.id}`, type: 'learning', title: `Học từ: ${t.term}`, subtitle: t.meaning,
              timestamp: new Date(t.createdAt).getTime(), icon: '🔤', color: 'bg-blue-100 text-blue-600'
          });
      });
    } catch {}

    // --- TASKS ---
    try {
      const tasks: Task[] = JSON.parse(localStorage.getItem('dh_tasks') || '[]');
      const pending = tasks.filter(t => !t.completed).length;
      setStats(prev => ({ ...prev, pendingTasks: pending }));
      
      // Chart
      const days = [];
      for(let i=6; i>=0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const dStr = d.toISOString().split('T')[0];
          const done = tasks.filter(t => t.date === dStr && t.completed).length;
          days.push({ name: d.toLocaleDateString('vi-VN', {weekday: 'short'}), completed: done });
      }
      setTaskActivity(days);

      tasks.filter(t=>t.completed).slice(-5).forEach(t => {
          logs.push({ id: `task_${t.id}`, type: 'task', title: `Xong task: ${t.title}`, timestamp: new Date(t.date).getTime() + 43200000, icon: '✅', color: 'bg-green-100 text-green-600' });
      });
    } catch {}

    // --- FINANCE ---
    try {
      const trans: Transaction[] = JSON.parse(localStorage.getItem('dh_fin_trans') || '[]');
      const balance = trans.reduce((acc, t) => acc + (t.type==='income'?t.amount:-t.amount), 0);
      setStats(prev => ({ ...prev, financeBalance: balance }));
      
      // Chart
      const expMap = new Map<string, number>();
      trans.filter(t => t.type === 'expense').forEach(t => expMap.set(t.category, (expMap.get(t.category)||0)+t.amount));
      setExpenseData(Array.from(expMap).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0, 5));

      trans.slice(0, 5).forEach(t => {
          logs.push({ id: `fin_${t.id}`, type: 'finance', title: `${t.type==='income'?'Thu':'Chi'}: ${formatVND(t.amount)}`, subtitle: t.category, timestamp: new Date(t.date).getTime() + 36000000, icon: t.type==='income'?'💰':'💸', color: t.type==='income'?'bg-green-100 text-green-600':'bg-red-100 text-red-600' });
      });
    } catch {}

    // --- COURSES ---
    try {
        const tree: CourseNode[] = JSON.parse(localStorage.getItem('dh_course_tree_v2') || '[]');
        const pinned: CourseNode[] = [];
        const traverse = (nodes: CourseNode[]) => {
            nodes.forEach(n => {
                if(n.isPinned) pinned.push(n);
                if(n.children) traverse(n.children);
            });
        };
        traverse(tree);
        setPinnedCourses(pinned);
    } catch {}

    // --- HABITS ---
    try {
        const habits: Habit[] = JSON.parse(localStorage.getItem('dh_habits') || '[]');
        const active = habits.length;
        const maxStreak = Math.max(...habits.map(h => h.streak), 0);
        setStats(prev => ({ ...prev, activeHabits: active, habitStreak: maxStreak }));
    } catch {}

    // Sort Logs
    logs.sort((a, b) => b.timestamp - a.timestamp);
    setActivities(logs.slice(0, 15));

    // Storage & System Check
    let total = 0;
    for(const key in localStorage) if(localStorage.hasOwnProperty(key)) total += (localStorage[key].length + key.length) * 2;
    
    // Check for API Key (Admin activated or Env)
    const localKey = localStorage.getItem('dh_gemini_api_key');
    const hasActiveKey = !!localKey || (!!process.env.API_KEY && process.env.API_KEY.length > 10);

    setSystemStatus(prev => ({ ...prev, storageUsed: total, hasApiKey: hasActiveKey }));
  };

  const formatVND = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="animate-fade-in space-y-6 pb-24 md:pb-20">
      
      {/* 1. Welcome Banner (Adaptive) */}
      <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 rounded-3xl p-6 md:p-8 text-white shadow-xl overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                  <h1 className="text-2xl md:text-4xl font-bold mb-2">{greeting}, bạn của tôi! 👋</h1>
                  <p className="text-blue-100 text-sm md:text-base font-medium max-w-lg leading-relaxed">{quote}</p>
              </div>
              <div className="hidden md:block text-right">
                  <p className="text-xs uppercase tracking-widest text-blue-200 font-bold mb-1">Hôm nay</p>
                  <p className="text-3xl font-bold">{new Date().toLocaleDateString('vi-VN', { weekday: 'long' })}</p>
                  <p className="text-sm text-blue-100">{new Date().toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
          </div>
          
          {/* Decor Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-400/20 rounded-full blur-2xl translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>
      </div>

      {/* 2. Quick Actions (Horizontal Scroll on Mobile) */}
      <div>
          <h3 className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-3 px-1">Truy cập nhanh</h3>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              <QuickActionBtn icon="📖" label="Học Từ" onClick={() => navigate('/english')} colorClass="bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-100 dark:border-blue-800 hover:bg-blue-100" />
              <QuickActionBtn icon="✅" label="Thêm Task" onClick={() => navigate('/planner')} colorClass="bg-green-50 dark:bg-green-900/20 text-green-600 border-green-100 dark:border-green-800 hover:bg-green-100" />
              <QuickActionBtn icon="💸" label="Ghi Chi Tiêu" onClick={() => navigate('/finance')} colorClass="bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-800 hover:bg-red-100" />
              <QuickActionBtn icon="📂" label="Tài Liệu" onClick={() => navigate('/courses')} colorClass="bg-purple-50 dark:bg-purple-900/20 text-purple-600 border-purple-100 dark:border-purple-800 hover:bg-purple-100" />
              <QuickActionBtn icon="🤖" label="Hỏi AI" onClick={() => document.querySelector('button[class*="fixed bottom"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))} colorClass="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100" />
          </div>
      </div>

      {/* 3. Stats Grid (Responsive) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard title="Từ vựng đã lưu" value={stats.vocabCount} subValue="Trong thư viện" icon="📚" colorGradient="bg-gradient-to-br from-blue-500 to-blue-600" />
          <StatCard title="Công việc tồn đọng" value={stats.pendingTasks} subValue="Cần hoàn thành" icon="⚡" colorGradient="bg-gradient-to-br from-orange-400 to-red-500" />
          <StatCard title="Tài chính hiện tại" value={formatVND(stats.financeBalance)} subValue="Dòng tiền ròng" icon="💰" colorGradient="bg-gradient-to-br from-emerald-500 to-green-600" />
          <StatCard title="Thói quen tích cực" value={stats.activeHabits} subValue={`Chuỗi cao nhất: ${stats.habitStreak} 🔥`} icon="🎯" colorGradient="bg-gradient-to-br from-violet-500 to-purple-600" />
      </div>

      {/* 4. Main Layout: Charts & Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Left Column: Charts (8/12) */}
          <div className="xl:col-span-8 space-y-6">
              <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                          <span>📊</span> Hiệu suất làm việc
                      </h3>
                      <select className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 dark:text-white outline-none">
                          <option>7 ngày qua</option>
                      </select>
                  </div>
                  <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={taskActivity}>
                              <defs>
                                  <linearGradient id="colorTask" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9ca3af'}} dy={10} />
                              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9ca3af'}} />
                              <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} cursor={{stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4'}} />
                              <Area type="monotone" dataKey="completed" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTask)" animationDuration={1500} />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Finance Mini Chart */}
                  <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                      <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-4 flex items-center gap-2"><span>🍰</span> Chi tiêu theo danh mục</h3>
                      <div className="h-48 flex items-center justify-center relative">
                          {expenseData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                      <Pie data={expenseData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                                          {expenseData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                      </Pie>
                                      <RechartsTooltip formatter={(value) => formatVND(Number(value))} contentStyle={{borderRadius: '8px'}} />
                                  </PieChart>
                              </ResponsiveContainer>
                          ) : (
                              <div className="text-center text-gray-400 text-xs">Chưa có dữ liệu chi tiêu</div>
                          )}
                          {expenseData.length > 0 && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <span className="text-2xl">💸</span>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Pinned Courses */}
                  <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2"><span>📌</span> Đang học</h3>
                          <Link to="/courses" className="text-[10px] text-blue-600 font-bold hover:underline">Xem tất cả</Link>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar max-h-48">
                          {pinnedCourses.length > 0 ? pinnedCourses.map(c => (
                              <Link key={c.id} to="/courses" className="block p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors group border border-transparent hover:border-blue-100 dark:hover:border-blue-800">
                                  <div className="flex items-center gap-3">
                                      <span className="text-lg">{c.type==='folder'?'📂':(c.data?.type==='VIDEO'?'🎥':'📄')}</span>
                                      <div className="min-w-0 flex-1">
                                          <p className="font-bold text-xs text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600">{c.title}</p>
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{c.topic || 'Chưa phân loại'}</p>
                                      </div>
                                  </div>
                              </Link>
                          )) : <div className="text-center text-xs text-gray-400 py-10 border-2 border-dashed border-gray-100 rounded-xl">Chưa ghim bài học nào</div>}
                      </div>
                  </div>
              </div>
          </div>

          {/* Right Column: Sidebar (4/12) */}
          <div className="xl:col-span-4 space-y-6">
              
              {/* Activity Feed */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-[400px] flex flex-col">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                      <h3 className="font-bold text-lg text-gray-800 dark:text-white">Hoạt động</h3>
                      <button onClick={loadDashboardData} className="text-gray-400 hover:text-blue-500 transition-colors">↻</button>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pl-1">
                      {activities.length > 0 ? (
                          activities.map((item, idx) => <ActivityItem key={item.id} item={item} isLast={idx === activities.length - 1} />)
                      ) : <div className="text-center py-10 text-gray-400 text-sm">Chưa có hoạt động mới.</div>}
                  </div>
              </div>

              {/* System Health Widget - Optimized */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus.online ? 'bg-green-400' : 'bg-red-400'}`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${systemStatus.online ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          </span>
                          Trạng thái hệ thống
                      </h3>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">v{systemStatus.version}</span>
                  </div>
                  
                  <div className="space-y-3">
                      {/* Connection */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 transition-colors hover:border-blue-200 dark:hover:border-blue-800">
                          <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${systemStatus.online ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600'}`}>
                                  <span className="text-lg">📶</span>
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Kết nối mạng</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{systemStatus.online ? 'Ổn định' : 'Mất kết nối'}</span>
                              </div>
                          </div>
                          <span className={`text-xs font-bold ${systemStatus.online ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{systemStatus.online ? 'Online' : 'Offline'}</span>
                      </div>

                      {/* AI Service */}
                      <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${systemStatus.hasApiKey ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-700 hover:border-blue-200' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800'}`}>
                          <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${systemStatus.hasApiKey ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-600'}`}>
                                  <span className="text-lg">🤖</span>
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Dịch vụ AI</span>
                                  <span className={`text-[10px] ${systemStatus.hasApiKey ? 'text-gray-500 dark:text-gray-400' : 'text-red-500 font-bold'}`}>
                                      {systemStatus.hasApiKey ? 'Đã kích hoạt' : 'Liên hệ Admin để mở khóa'}
                                  </span>
                              </div>
                          </div>
                          <span className={`text-xs font-bold ${systemStatus.hasApiKey ? 'text-blue-600 dark:text-blue-400' : 'text-red-600'}`}>
                              {systemStatus.hasApiKey ? 'Sẵn sàng' : 'Chưa kích hoạt'}
                          </span>
                      </div>

                      {/* Storage */}
                      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                          <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                  <span className="text-gray-500">💾</span>
                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Bộ nhớ Local</span>
                              </div>
                              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                  {Math.round(systemStatus.storageUsed / 1024)}KB / 5MB
                              </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-600 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${systemStatus.storageUsed > 4000000 ? 'bg-red-500' : 'bg-purple-500'}`} 
                                style={{width: `${Math.min(100, (systemStatus.storageUsed/systemStatus.storageTotal)*100)}%`}}
                              ></div>
                          </div>
                      </div>
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};
