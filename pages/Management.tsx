
import React, { useState, useEffect, useRef } from 'react';
import { AdminDashboard } from '../components/AdminDashboard';
import { firebaseService } from '../services/firebase';
import { geminiService } from '../services/gemini';
import { useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

// --- CONSTANTS ---
const TRAFFIC_POINTS = 30;
const INITIAL_TRAFFIC_DATA = Array.from({ length: TRAFFIC_POINTS }, (_, i) => ({
    time: i,
    requests: 0,
    bandwidth: 0,
    errors: 0,
    latency: 0
}));

const SECURITY_LOGS = [
    { id: 'sec_1', ip: '192.168.1.45', action: 'Admin Login', status: 'Success', location: 'Hanoi, VN', time: 'Just now', level: 'info' },
    { id: 'sec_2', ip: '14.232.12.99', action: 'API Key Access', status: 'Success', location: 'HCMC, VN', time: '2 mins ago', level: 'info' },
    { id: 'sec_3', ip: '113.160.22.11', action: 'Unauthorized Upload', status: 'Blocked', location: 'Da Nang, VN', time: '1 hour ago', level: 'danger' },
    { id: 'sec_4', ip: '42.112.98.10', action: 'SQL Injection Attempt', status: 'Blocked', location: 'Hai Phong, VN', time: '3 hours ago', level: 'danger' },
];

// Firebase Spark Plan Limits (Daily)
const QUOTAS = {
    reads: 50000,
    writes: 20000,
    bandwidthMB: 360, // 10GB/month ~ 360MB/day
    storageMB: 5120, // 5GB
    aiTokens: 1000000 // Arbitrary daily limit for safety
};

const REGIONS_DATA = [
    { name: 'Hanoi', value: 45, color: '#3B82F6' },
    { name: 'Ho Chi Minh', value: 35, color: '#8B5CF6' },
    { name: 'Da Nang', value: 12, color: '#10B981' },
    { name: 'Other', value: 8, color: '#F59E0B' },
];

// --- STYLED COMPONENTS ---
const Card: React.FC<{ children: React.ReactNode, className?: string, noPadding?: boolean }> = ({ children, className, noPadding }) => (
    <div className={`bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md ${noPadding ? '' : 'p-5 md:p-6'} ${className}`}>
        {children}
    </div>
);

const Badge: React.FC<{ type: 'success' | 'warning' | 'danger' | 'neutral' | 'info', children: React.ReactNode }> = ({ type, children }) => {
    const colors = {
        success: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
        warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
        danger: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
        neutral: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
        info: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    };
    return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border tracking-wide ${colors[type]}`}>{children}</span>;
};

const ProgressBar: React.FC<{ value: number, max: number, label: string, colorClass?: string }> = ({ value, max, label, colorClass = 'bg-blue-600' }) => {
    const percent = Math.min(100, (value / max) * 100);
    return (
        <div className="mb-4">
            <div className="flex justify-between text-xs mb-1.5 font-medium">
                <span className="text-gray-700 dark:text-gray-300">{label}</span>
                <span className="text-gray-500 dark:text-gray-400 font-mono">{new Intl.NumberFormat().format(Math.floor(value))} / {new Intl.NumberFormat().format(max)} ({percent.toFixed(1)}%)</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className={`h-2 rounded-full transition-all duration-1000 ease-out ${colorClass}`} style={{ width: `${percent}%` }}></div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
export const Management: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'resources' | 'security'>('overview');
    const [isLoading, setIsLoading] = useState(true);
    const [serverTime, setServerTime] = useState(new Date());

    // Real Data State
    const [realStats, setRealStats] = useState({
        totalUsers: 0,
        activeAiUsers: 0,
        pendingUsers: 0
    });

    // Live System Health State
    const [systemHealth, setSystemHealth] = useState({
        cpu: 15,
        ram: 42,
        uptime: '99.98%',
        activeNow: 0
    });

    // Resource State (Simulated Real-time)
    const [resourceStats, setResourceStats] = useState({
        reads: 34200,
        writes: 12450,
        bandwidth: 152.5, // MB
        storage: 850, // MB
        aiTokens: 45200
    });

    // Traffic System State
    const [trafficData, setTrafficData] = useState(INITIAL_TRAFFIC_DATA);
    const [diagnostics, setDiagnostics] = useState({
        dbLatency: 0,
        dbStatus: 'Unknown',
        apiStatus: 'Unknown',
        storageUsed: 0,
        isRunning: false,
        lastRun: null as number | null,
        logs: [] as string[]
    });

    // Security State
    const [secLogs, setSecLogs] = useState(SECURITY_LOGS);
    const [secFilter, setSecFilter] = useState<'ALL' | 'BLOCKED' | 'WARNING'>('ALL');

    // --- EFFECTS ---

    // 1. Clock
    useEffect(() => {
        const timer = setInterval(() => setServerTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. Auth Check & Initial Data Load
    useEffect(() => {
        const checkAccessAndLoad = async () => {
            await new Promise(r => setTimeout(r, 500));
            const user = firebaseService.currentUser;
            const localProfile = localStorage.getItem('dh_user_profile');
            const localEmail = localProfile ? JSON.parse(localProfile).email : '';

            if ((!user || user.email !== firebaseService.ADMIN_EMAIL) && localEmail !== firebaseService.ADMIN_EMAIL) {
                alert("Access Denied: Admin privileges required.");
                navigate('/');
                return;
            }

            setIsLoading(false);

            try {
                const users = await firebaseService.getAllUsers();
                const total = users.length;
                const activeAI = users.filter(u => u.isActiveAI).length;
                const pending = users.filter(u => !u.isActiveAI && !u.isLocked).length;

                setRealStats({ totalUsers: total, activeAiUsers: activeAI, pendingUsers: pending });
                setSystemHealth(prev => ({ ...prev, activeNow: Math.ceil(total * 0.2) })); // Initial mock active
            } catch (e) {
                console.error("Failed to load admin stats", e);
            }
        };
        checkAccessAndLoad();
    }, [navigate]);

    // 3. Live Simulation (Traffic, Health, Resources)
    useEffect(() => {
        const interval = setInterval(() => {
            // Random factors
            const loadFactor = Math.random();
            const baseUsers = Math.max(1, realStats.totalUsers);

            // Update Traffic Chart
            setTrafficData(prev => {
                const reqs = Math.floor(baseUsers * (1 + loadFactor * 2));
                const latency = Math.floor(20 + loadFactor * 50);

                const newPoint = {
                    time: prev[prev.length - 1].time + 1,
                    requests: reqs,
                    bandwidth: Number((reqs * 0.05).toFixed(2)),
                    errors: Math.random() > 0.97 ? Math.floor(Math.random() * 3) : 0,
                    latency
                };
                return [...prev.slice(1), newPoint];
            });

            // Update System Health
            setSystemHealth(prev => ({
                ...prev,
                cpu: Math.min(100, Math.max(5, Math.floor(prev.cpu + (Math.random() - 0.5) * 10))),
                ram: Math.min(100, Math.max(20, Math.floor(prev.ram + (Math.random() - 0.5) * 5))),
                activeNow: Math.max(0, Math.floor(baseUsers * 0.2 + (Math.random() - 0.5) * 5))
            }));

            // Cumulative Resource Update
            setResourceStats(prev => ({
                reads: prev.reads + Math.floor(Math.random() * 10),
                writes: prev.writes + Math.floor(Math.random() * 3),
                bandwidth: prev.bandwidth + (Math.random() * 0.1),
                storage: prev.storage + 0.0001,
                aiTokens: prev.aiTokens + Math.floor(Math.random() * 20)
            }));

        }, 2000);
        return () => clearInterval(interval);
    }, [realStats]);

    // --- HANDLERS ---
    const runDiagnostics = async () => {
        setDiagnostics(prev => ({ ...prev, isRunning: true, logs: ['> Starting system diagnostics...'] }));
        const addLog = (msg: string) => setDiagnostics(prev => ({ ...prev, logs: [...prev.logs, `> ${msg}`] }));

        await new Promise(r => setTimeout(r, 500));
        addLog("Checking Firestore connectivity...");
        const dbHealth = await firebaseService.checkHealth();
        addLog(`Firestore Latency: ${dbHealth.dbLatency}ms [${dbHealth.status.toUpperCase()}]`);

        await new Promise(r => setTimeout(r, 800));
        addLog("Validating Gemini API Gateway...");
        const apiValid = await geminiService.validateKey();
        addLog(`API Status: ${apiValid ? 'VALID' : 'INVALID'}`);

        await new Promise(r => setTimeout(r, 500));
        addLog("Calculating Local Storage usage...");
        let storageUsed = 0;
        for (const key in localStorage) if (localStorage.hasOwnProperty(key)) storageUsed += (localStorage[key].length + key.length) * 2;
        addLog(`Local Storage: ${(storageUsed / 1024).toFixed(2)} KB`);

        addLog("Diagnostics complete.");

        setDiagnostics(prev => ({
            ...prev,
            dbLatency: dbHealth.dbLatency,
            dbStatus: dbHealth.status,
            apiStatus: apiValid ? 'Valid' : 'Invalid',
            storageUsed,
            isRunning: false,
            lastRun: Date.now()
        }));
    };

    const handleBlockIP = (id: string) => {
        setSecLogs(prev => prev.map(log => log.id === id ? { ...log, status: 'Blocked', level: 'danger' } : log));
    };

    if (isLoading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    // --- SUB-VIEWS ---

    const OverviewView = () => (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Top Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Active Users Card (Pulsing) */}
                <Card className="relative overflow-hidden border-blue-100 dark:border-blue-900 bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-gray-800/50">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                                Active Now
                            </p>
                            <h3 className="text-4xl font-bold text-gray-900 dark:text-white mt-2">{systemHealth.activeNow}</h3>
                        </div>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                            👥
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 font-medium">
                        Concurrent sessions
                    </div>
                </Card>

                {/* Total Users Card */}
                <Card>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Users</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{realStats.totalUsers}</h3>
                        </div>
                        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                            👤
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-emerald-500 text-xs font-bold flex items-center gap-1">
                            ↑ 12% <span className="font-normal text-gray-400 dark:text-gray-500">this week</span>
                        </span>
                    </div>
                </Card>

                {/* Requests/Sec (Latency) */}
                <Card>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg Latency</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{trafficData[trafficData.length - 1].latency}ms</h3>
                        </div>
                        <div className={`p-3 rounded-xl ${trafficData[trafficData.length - 1].latency > 100 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'} dark:bg-opacity-20`}>
                            ⚡
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                        Global average response time
                    </div>
                </Card>

                {/* Error Rate */}
                <Card>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Error Rate</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                                {(trafficData.slice(-10).reduce((acc, curr) => acc + curr.errors, 0) / 10).toFixed(2)}%
                            </h3>
                        </div>
                        <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl text-orange-600 dark:text-orange-400">
                            ⚠️
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                        Last 10 seconds
                    </div>
                </Card>
            </div>

            {/* Main Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Traffic Chart (2/3) */}
                <div className="lg:col-span-2">
                    <Card className="h-[400px] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <span>📈</span> Live Traffic Volume
                            </h3>
                            <div className="flex gap-2">
                                <span className="text-xs font-bold px-2 py-1 bg-indigo-50 text-indigo-600 rounded border border-indigo-100">Requests</span>
                                <span className="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded border border-red-100">Errors</span>
                            </div>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trafficData}>
                                    <defs>
                                        <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.2} />
                                    <XAxis dataKey="time" hide />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.9)', border: 'none', borderRadius: '8px', color: '#F3F4F6', fontSize: '12px' }}
                                        itemStyle={{ padding: 0 }}
                                        labelStyle={{ display: 'none' }}
                                    />
                                    <Area type="monotone" dataKey="requests" stroke="#6366F1" strokeWidth={3} fill="url(#colorReq)" isAnimationActive={false} />
                                    <Area type="monotone" dataKey="errors" stroke="#EF4444" strokeWidth={2} fill="none" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>

                {/* Server Health & Geo (1/3) */}
                <div className="space-y-6">
                    {/* Health Widget */}
                    <Card>
                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <span>🖥️</span> Server Health
                        </h3>
                        <div className="space-y-4">
                            {/* CPU */}
                            <div className="flex items-center gap-4">
                                <div className="w-12 text-xs font-bold text-gray-500">CPU</div>
                                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-500 ${systemHealth.cpu > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${systemHealth.cpu}%` }}></div>
                                </div>
                                <div className="w-8 text-right text-xs font-bold">{systemHealth.cpu}%</div>
                            </div>
                            {/* RAM */}
                            <div className="flex items-center gap-4">
                                <div className="w-12 text-xs font-bold text-gray-500">RAM</div>
                                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-500 ${systemHealth.ram > 80 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${systemHealth.ram}%` }}></div>
                                </div>
                                <div className="w-8 text-right text-xs font-bold">{systemHealth.ram}%</div>
                            </div>

                            <div className="pt-4 flex justify-between items-center border-t border-gray-100 dark:border-gray-700 mt-4">
                                <span className="text-xs text-gray-500">Uptime</span>
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{systemHealth.uptime}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Geo Distribution (Mock) */}
                    <Card>
                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <span>🌍</span> User Distribution
                        </h3>
                        <div className="space-y-3">
                            {REGIONS_DATA.map((region) => (
                                <div key={region.name} className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-300 font-medium">{region.name}</span>
                                    <div className="flex items-center gap-2 w-1/2">
                                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${region.value}%`, backgroundColor: region.color }}></div>
                                        </div>
                                        <span className="text-gray-400 w-6 text-right">{region.value}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm">
                <div className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Quick Actions</div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold transition-colors flex items-center gap-2" onClick={() => alert('Cache Cleared')}>
                        🧹 Clear Cache
                    </button>
                    <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold transition-colors flex items-center gap-2" onClick={() => alert('Services Restarted')}>
                        🔄 Restart Services
                    </button>
                    <button className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold transition-colors flex items-center gap-2">
                        📢 Broadcast Msg
                    </button>
                </div>
            </div>
        </div>
    );

    const ResourcesView = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Main Quota Panel */}
            <Card className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <span>📊</span> Resource Usage (Spark Plan)
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">Reset in: 04:23:11</p>
                    </div>
                    <div className="text-right hidden md:block">
                        <p className="text-xs text-gray-400 font-mono">UID: ADMIN_MASTER</p>
                        <Badge type="success">Live Sync</Badge>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-wider">Database (Firestore)</h4>
                        <ProgressBar value={resourceStats.reads} max={QUOTAS.reads} label="Reads (Daily)" colorClass="bg-blue-500" />
                        <ProgressBar value={resourceStats.writes} max={QUOTAS.writes} label="Writes (Daily)" colorClass="bg-blue-600" />
                        <ProgressBar value={resourceStats.storage} max={QUOTAS.storageMB} label="Stored Data" colorClass="bg-orange-500" />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-wider">Hosting & Storage</h4>
                        <ProgressBar value={resourceStats.bandwidth} max={QUOTAS.bandwidthMB} label="Bandwidth (Daily)" colorClass="bg-purple-500" />
                        <ProgressBar value={2100} max={5120} label="Cloud Storage (Files)" colorClass="bg-indigo-500" />

                        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex gap-3 items-start">
                            <span className="text-xl">ℹ️</span>
                            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                                <strong>Tip:</strong> Optimize images before upload to save bandwidth. Daily quotas reset at midnight Pacific Time.
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Diagnostics Console */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">Diagnostics Console</h3>
                        <button
                            onClick={runDiagnostics}
                            disabled={diagnostics.isRunning}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 active:scale-95"
                        >
                            {diagnostics.isRunning ? <span className="animate-spin">↻</span> : '▶'} Run Full Diagnostics
                        </button>
                    </div>

                    {/* Terminal Output */}
                    <div className="bg-gray-900 text-green-400 p-4 rounded-xl font-mono text-xs h-48 overflow-y-auto border border-gray-700 shadow-inner">
                        {diagnostics.logs.length === 0 ? (
                            <span className="opacity-50">Waiting to run diagnostics...</span>
                        ) : (
                            diagnostics.logs.map((line, i) => <div key={i} className="mb-1">{line}</div>)
                        )}
                        {diagnostics.isRunning && <div className="animate-pulse">_</div>}
                    </div>
                </div>

                {/* Storage Chart */}
                <div className="space-y-6">
                    <Card className="p-6 flex flex-col items-center justify-center text-center h-40">
                        <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center text-lg font-bold mb-2 transition-colors ${!diagnostics.lastRun ? 'border-gray-200 text-gray-400' : diagnostics.dbLatency < 200 ? 'border-green-500 text-green-600' : 'border-orange-500 text-orange-600'}`}>
                            {diagnostics.lastRun ? `${diagnostics.dbLatency}ms` : '--'}
                        </div>
                        <h4 className="font-bold text-gray-800 dark:text-white text-sm">DB Latency</h4>
                        <p className="text-[10px] text-gray-400">Region: asia-southeast1</p>
                    </Card>

                    <Card className="p-6 flex flex-col">
                        <h4 className="font-bold text-gray-800 dark:text-white mb-4">Local Storage</h4>
                        <div className="flex-1 flex flex-col justify-center items-center">
                            <div className="relative w-32 h-32">
                                <svg className="w-full h-full" viewBox="0 0 36 36">
                                    <path
                                        className="text-gray-200 dark:text-gray-700"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                    />
                                    <path
                                        className="text-indigo-600"
                                        strokeDasharray={`${((diagnostics.storageUsed / 5242880) * 100)}, 100`}
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center flex-col">
                                    <span className="text-xl font-bold text-gray-800 dark:text-white">{((diagnostics.storageUsed / 5242880) * 100).toFixed(1)}%</span>
                                    <span className="text-[8px] text-gray-500 uppercase">Used</span>
                                </div>
                            </div>
                            <div className="mt-4 text-center">
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{(diagnostics.storageUsed / 1024).toFixed(1)} KB / 5 MB</p>
                                <p className="text-[10px] text-gray-500">Browser Limit</p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );

    const SecurityView = () => {
        const filteredLogs = secLogs.filter(l => {
            if (secFilter === 'ALL') return true;
            if (secFilter === 'BLOCKED') return l.status === 'Blocked';
            if (secFilter === 'WARNING') return l.level === 'danger';
            return true;
        });

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
                    {['ALL', 'BLOCKED', 'WARNING'].map(f => (
                        <button
                            key={f}
                            onClick={() => setSecFilter(f as any)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${secFilter === f ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                <Card className="overflow-hidden" noPadding>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-4">Event / IP</th>
                                <th className="px-6 py-4">Location</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-gray-800 dark:text-white">{log.action}</p>
                                        <p className="text-xs text-gray-500 font-mono">{log.ip}</p>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{log.location}</td>
                                    <td className="px-6 py-4 text-gray-500 text-xs">{log.time}</td>
                                    <td className="px-6 py-4">
                                        <Badge type={log.level === 'danger' ? 'danger' : log.status === 'Blocked' ? 'danger' : 'success'}>
                                            {log.status}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {log.status !== 'Blocked' && (
                                            <button
                                                onClick={() => handleBlockIP(log.id)}
                                                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1 rounded text-xs font-bold border border-red-200 dark:border-red-800 transition-colors"
                                            >
                                                Block IP
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            </div>
        );
    };

    // --- MAIN LAYOUT ---
    return (
        <div className="max-w-[1600px] mx-auto pb-20">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <span className="bg-indigo-600 text-white p-2 rounded-lg text-xl shadow-lg shadow-indigo-500/30">❖</span>
                        Admin Control Center
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 ml-12 text-sm">DangHoang Ebook • v2.5.0</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-gray-400 uppercase font-bold">Server Time (UTC+7)</p>
                        <p className="font-mono font-bold text-gray-700 dark:text-gray-300">{serverTime.toLocaleTimeString()}</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-xs font-bold border border-green-200 dark:border-green-800">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> System Online
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 mb-8 bg-gray-100 dark:bg-gray-800/50 p-1.5 rounded-2xl w-fit">
                {[
                    { id: 'overview', label: 'Overview', icon: '📊' },
                    { id: 'users', label: 'Users', icon: '👥' },
                    { id: 'resources', label: 'Resources & Quotas', icon: '⚡' },
                    { id: 'security', label: 'Security', icon: '🔒' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <span>{tab.icon}</span> {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[500px]">
                {activeTab === 'overview' && <OverviewView />}
                {activeTab === 'users' && (
                    <div className="animate-fade-in">
                        <AdminDashboard />
                    </div>
                )}
                {activeTab === 'resources' && <ResourcesView />}
                {activeTab === 'security' && <SecurityView />}
            </div>
        </div>
    );
};
