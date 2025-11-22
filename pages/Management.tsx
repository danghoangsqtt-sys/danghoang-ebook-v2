
import React, { useState, useEffect, useRef } from 'react';
import { AdminDashboard } from '../components/AdminDashboard';
import { firebaseService } from '../services/firebase';
import { geminiService } from '../services/gemini';
import { useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// --- CONSTANTS ---
const TRAFFIC_POINTS = 30;
const INITIAL_TRAFFIC_DATA = Array.from({ length: TRAFFIC_POINTS }, (_, i) => ({
    time: i,
    requests: 0,
    errors: 0
}));

const SECURITY_LOGS = [
    { id: 'sec_1', ip: '192.168.1.45', action: 'Admin Login', status: 'Success', location: 'Hanoi, VN', time: 'Just now', level: 'info' },
    { id: 'sec_2', ip: '14.232.12.99', action: 'API Key Access', status: 'Success', location: 'HCMC, VN', time: '2 mins ago', level: 'info' },
    { id: 'sec_3', ip: '113.160.22.11', action: 'Unauthorized Upload', status: 'Blocked', location: 'Da Nang, VN', time: '1 hour ago', level: 'danger' },
];

// --- STYLED COMPONENTS ---
const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
        {children}
    </div>
);

const Badge: React.FC<{ type: 'success' | 'warning' | 'danger' | 'neutral', children: React.ReactNode }> = ({ type, children }) => {
    const colors = {
        success: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        warning: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
        danger: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        neutral: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${colors[type]}`}>{children}</span>;
};

// --- MAIN COMPONENT ---
export const Management: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'system' | 'security'>('overview');
    const [isLoading, setIsLoading] = useState(true);

    // Real Data State
    const [realStats, setRealStats] = useState({
        totalUsers: 0,
        activeAiUsers: 0,
        estimatedStorage: 0,
        pendingUsers: 0
    });

    // System State
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

    // Auth Check & Data Load
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

            // Load Real Stats for Overview
            try {
                const users = await firebaseService.getAllUsers();
                const total = users.length;
                const activeAI = users.filter(u => u.isActiveAI).length;
                const pending = users.filter(u => !u.isActiveAI && !u.isLocked).length;
                // Est. 5MB per user based on localStorage limit typical usage
                const storage = total * 0.02; // GB approx (20MB per user hypothetical)

                setRealStats({
                    totalUsers: total,
                    activeAiUsers: activeAI,
                    estimatedStorage: storage,
                    pendingUsers: pending
                });

                // Adjust traffic simulation based on real user count
                setTrafficData(prev => prev.map(p => ({
                    ...p,
                    requests: Math.max(0, Math.floor(Math.random() * total * 2)) // Approx 2 req/sec per user
                })));

            } catch (e) {
                console.error("Failed to load admin stats", e);
            }
        };
        checkAccessAndLoad();
    }, [navigate]);

    // Traffic Simulation (Live)
    useEffect(() => {
        if (activeTab !== 'overview') return;
        const interval = setInterval(() => {
            setTrafficData(prev => {
                const baseLoad = realStats.totalUsers * 2;
                const newPoint = {
                    time: prev[prev.length - 1].time + 1,
                    requests: Math.max(0, baseLoad + Math.floor(Math.random() * baseLoad) - (baseLoad / 2)),
                    errors: Math.random() > 0.95 ? 1 : 0
                };
                return [...prev.slice(1), newPoint];
            });
        }, 2000);
        return () => clearInterval(interval);
    }, [activeTab, realStats.totalUsers]);

    // Handlers
    const runDiagnostics = async () => {
        setDiagnostics(prev => ({ ...prev, isRunning: true, logs: ['> Starting system diagnostics...'] }));

        const addLog = (msg: string) => setDiagnostics(prev => ({ ...prev, logs: [...prev.logs, `> ${msg}`] }));

        await new Promise(r => setTimeout(r, 500));
        addLog("Checking Firestore connectivity...");
        const dbHealth = await firebaseService.checkHealth();
        addLog(`Firestore Latency: ${dbHealth.dbLatency}ms [${dbHealth.status.toUpperCase()}]`);

        await new Promise(r => setTimeout(r, 500));
        addLog("Validating Gemini API Gateway...");
        const apiValid = await geminiService.validateKey();
        addLog(`API Status: ${apiValid ? 'VALID' : 'INVALID'}`);

        await new Promise(r => setTimeout(r, 500));
        addLog("Calculating Local Storage usage...");
        let storageUsed = 0;
        for (const key in localStorage) if (localStorage.hasOwnProperty(key)) storageUsed += (localStorage[key].length + key.length) * 2;
        addLog(`Local Storage: ${(storageUsed / 1024).toFixed(2)} KB`);

        addLog("Diagnostics complete.");

        setDiagnostics({
            dbLatency: dbHealth.dbLatency,
            dbStatus: dbHealth.status,
            apiStatus: apiValid ? 'Valid' : 'Invalid',
            storageUsed,
            isRunning: false,
            lastRun: Date.now(),
            logs: [...diagnostics.logs, "> Starting system diagnostics...", "Checking Firestore connectivity...", `Firestore Latency: ${dbHealth.dbLatency}ms [${dbHealth.status.toUpperCase()}]`, "Validating Gemini API Gateway...", `API Status: ${apiValid ? 'VALID' : 'INVALID'}`, "Calculating Local Storage usage...", `Local Storage: ${(storageUsed / 1024).toFixed(2)} KB`, "Diagnostics complete."]
        });
    };

    const handleBlockIP = (id: string) => {
        setSecLogs(prev => prev.map(log => log.id === id ? { ...log, status: 'Blocked', level: 'danger' } : log));
    };

    if (isLoading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    // --- SUB-VIEWS ---

    const OverviewView = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-5 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 text-6xl group-hover:scale-110 transition-transform">👥</div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Users</span>
                    <span className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{realStats.totalUsers}</span>
                    <div className="mt-auto pt-2">
                        <Badge type="success">{realStats.pendingUsers > 0 ? `${realStats.pendingUsers} Pending` : 'All Active'}</Badge>
                    </div>
                </Card>
                <Card className="p-5 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 text-6xl group-hover:scale-110 transition-transform">🤖</div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Active AI Users</span>
                    <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{realStats.activeAiUsers}</span>
                    <div className="mt-auto pt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Enabled Feature</span>
                    </div>
                </Card>
                <Card className="p-5 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 text-6xl group-hover:scale-110 transition-transform">💾</div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Storage (Est.)</span>
                    <span className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{realStats.estimatedStorage.toFixed(2)} GB</span>
                    <div className="mt-auto pt-2">
                        {diagnostics.lastRun ? (
                            <Badge type={diagnostics.dbLatency < 200 ? 'success' : 'warning'}>{diagnostics.dbStatus}</Badge>
                        ) : (
                            <span className="text-xs text-gray-400">Run diagnostics to update</span>
                        )}
                    </div>
                </Card>
                <Card className="p-5 flex flex-col relative overflow-hidden group bg-gradient-to-br from-indigo-600 to-purple-700 border-none text-white">
                    <div className="absolute top-0 right-0 p-3 opacity-20 text-6xl">💎</div>
                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">Server Status</span>
                    <span className="text-2xl font-bold mt-1">Operational</span>
                    <div className="mt-auto pt-3">
                        <button onClick={() => setActiveTab('system')} className="bg-white/20 hover:bg-white/30 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 w-fit">
                            Diagnostics →
                        </button>
                    </div>
                </Card>
            </div>

            {/* Real-time Traffic Chart */}
            <Card className="p-6 h-[400px]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Real-time Traffic
                        </h3>
                        <p className="text-xs text-gray-500">Scaled to {realStats.totalUsers} active users</p>
                    </div>
                    <div className="flex gap-4 text-xs font-bold">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-500 rounded-sm"></span> Valid Req</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm"></span> Errors</span>
                    </div>
                </div>
                <div className="h-[300px] w-full">
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
                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#F3F4F6' }}
                                itemStyle={{ color: '#F3F4F6' }}
                                labelStyle={{ display: 'none' }}
                            />
                            <Area type="monotone" dataKey="requests" stroke="#6366F1" strokeWidth={2} fill="url(#colorReq)" isAnimationActive={false} />
                            <Area type="monotone" dataKey="errors" stroke="#EF4444" strokeWidth={2} fill="none" isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>
        </div>
    );

    const SystemHealthView = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    <div className="bg-gray-900 text-green-400 p-4 rounded-xl font-mono text-xs h-64 overflow-y-auto border border-gray-700 shadow-inner">
                        {diagnostics.logs.length === 0 ? (
                            <span className="opacity-50">Waiting to run diagnostics...</span>
                        ) : (
                            diagnostics.logs.map((line, i) => <div key={i} className="mb-1">{line}</div>)
                        )}
                        {diagnostics.isRunning && <div className="animate-pulse">_</div>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* DB Latency */}
                        <Card className="p-6 flex flex-col items-center justify-center text-center">
                            <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center text-lg font-bold mb-2 transition-colors ${!diagnostics.lastRun ? 'border-gray-200 text-gray-400' : diagnostics.dbLatency < 200 ? 'border-green-500 text-green-600' : 'border-orange-500 text-orange-600'}`}>
                                {diagnostics.lastRun ? `${diagnostics.dbLatency}ms` : '--'}
                            </div>
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm">DB Latency</h4>
                        </Card>

                        {/* API Status */}
                        <Card className="p-6 flex flex-col items-center justify-center text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-2 transition-all ${!diagnostics.lastRun ? 'bg-gray-100 text-gray-400' : diagnostics.apiStatus === 'Valid' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {diagnostics.lastRun ? (diagnostics.apiStatus === 'Valid' ? '✓' : '✕') : '?'}
                            </div>
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm">API Gateway</h4>
                        </Card>
                    </div>
                </div>

                {/* Storage Panel */}
                <Card className="p-6 flex flex-col">
                    <h4 className="font-bold text-gray-800 dark:text-white mb-4">Storage Usage</h4>
                    <div className="flex-1 flex flex-col justify-center items-center">
                        <div className="relative w-40 h-40">
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
                                <span className="text-2xl font-bold text-gray-800 dark:text-white">{((diagnostics.storageUsed / 5242880) * 100).toFixed(1)}%</span>
                                <span className="text-[10px] text-gray-500 uppercase">Used</span>
                            </div>
                        </div>
                        <div className="mt-6 text-center">
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{(diagnostics.storageUsed / 1024).toFixed(1)} KB / 5 MB</p>
                            <p className="text-xs text-gray-500 mt-1">Local Storage Limit</p>
                        </div>
                    </div>
                </Card>
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

                <Card className="overflow-hidden">
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
    }

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
                    <p className="text-gray-500 dark:text-gray-400 mt-1 ml-12 text-sm">DangHoang Ebook • v2.5.0 • {new Date().toLocaleDateString()}</p>
                </div>
                <div className="flex gap-3">
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
                    { id: 'system', label: 'System Health', icon: '⚡' },
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
                {activeTab === 'system' && <SystemHealthView />}
                {activeTab === 'security' && <SecurityView />}
            </div>
        </div>
    );
};
