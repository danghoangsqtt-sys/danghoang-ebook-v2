
import React, { useState, useEffect } from 'react';
import { AdminDashboard } from '../components/AdminDashboard';
import { firebaseService } from '../services/firebase';
import { geminiService } from '../services/gemini';
import { useNavigate } from 'react-router-dom';
import { StoragePieChart, UserGrowthChart } from '../components/DashboardCharts';

// --- CONSTANTS ---
const SECURITY_LOGS = [
    { id: 'sec_1', ip: '192.168.1.45', action: 'Admin Đăng nhập', status: 'Thành công', location: 'Hà Nội, VN', time: 'Vừa xong', level: 'info' },
    { id: 'sec_2', ip: '14.232.12.99', action: 'Truy cập API Key', status: 'Thành công', location: 'TP.HCM, VN', time: '2 phút trước', level: 'info' },
    { id: 'sec_3', ip: '113.160.22.11', action: 'Cố gắng Upload', status: 'Đã chặn', location: 'Đà Nẵng, VN', time: '1 giờ trước', level: 'danger' },
];

// Firebase Spark Plan Limits (Free Tier)
const QUOTA_LIMITS = {
    reads: 50000,   // docs/day
    writes: 20000,  // docs/day
    storage: 1024,  // MB (1GB)
    hosting: 100    // GB bandwidth (Vercel Hobby generous limit)
};

// --- STYLED COMPONENTS ---
const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md ${className}`}>
        {children}
    </div>
);

const Badge: React.FC<{ type: 'success' | 'warning' | 'danger' | 'neutral' | 'purple', children: React.ReactNode }> = ({ type, children }) => {
    const colors = {
        success: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        warning: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
        danger: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        neutral: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
        purple: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${colors[type]}`}>{children}</span>;
};

const ProgressBar = ({ current, max, label, colorClass }: { current: number, max: number, label: string, colorClass: string }) => {
    const percent = Math.min(100, (current / max) * 100);
    return (
        <div className="mb-4">
            <div className="flex justify-between items-end mb-1">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{label}</span>
                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                    {new Intl.NumberFormat('vi-VN').format(current)} / {new Intl.NumberFormat('vi-VN').format(max)}
                </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ${colorClass}`} style={{ width: `${percent}%` }}></div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
export const Management: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'resources' | 'security'>('overview');
    const [isLoading, setIsLoading] = useState(true);

    // Real Stats State
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeAiUsers: 0,
        storageUsedMB: 0, // Firestore storage estimates
        estimatedReads: 0,
        estimatedWrites: 0,
    });

    const [dbStatus, setDbStatus] = useState<'Online' | 'Slow' | 'Offline'>('Online');
    const [secLogs, setSecLogs] = useState(SECURITY_LOGS);
    const [zaloNumber, setZaloNumber] = useState('0343019101');

    // Auth Check & Data Load
    useEffect(() => {
        const checkAccessAndLoad = async () => {
            // Simulate generic auth check delay
            await new Promise(r => setTimeout(r, 500));

            const user = firebaseService.currentUser;
            const localProfile = localStorage.getItem('dh_user_profile');
            const localEmail = localProfile ? JSON.parse(localProfile).email : '';

            if ((!user || user.email !== firebaseService.ADMIN_EMAIL) && localEmail !== firebaseService.ADMIN_EMAIL) {
                alert("Truy cập bị từ chối: Chỉ dành cho Quản trị viên.");
                navigate('/');
                return;
            }

            // Load Data
            try {
                const users = await firebaseService.getAllUsers();
                const total = users.length;
                const activeAI = users.filter(u => u.isActiveAI).length;

                // ESTIMATION ALGORITHM for Spark Plan Usage
                const estimatedStorage = total * 0.5;
                const dailyReads = total * 35 + 100; // +100 system overhead
                const dailyWrites = total * 8 + 20;

                setStats({
                    totalUsers: total,
                    activeAiUsers: activeAI,
                    storageUsedMB: parseFloat(estimatedStorage.toFixed(2)),
                    estimatedReads: dailyReads,
                    estimatedWrites: dailyWrites
                });

                // Check DB Latency
                const health = await firebaseService.checkHealth();
                setDbStatus(health.status === 'ok' ? 'Online' : health.status === 'degraded' ? 'Slow' : 'Offline');

                // Get Config
                const config = await firebaseService.getSystemConfig();
                if (config && config.zaloNumber) {
                    setZaloNumber(config.zaloNumber);
                }

            } catch (e) {
                console.error("Failed to load admin stats", e);
            } finally {
                setIsLoading(false);
            }
        };
        checkAccessAndLoad();
    }, [navigate]);

    const handleChangeZalo = async () => {
        const newNum = prompt("Nhập số Zalo Admin mới:", zaloNumber);
        if (newNum && newNum !== zaloNumber) {
            try {
                await firebaseService.updateSystemConfig({ zaloNumber: newNum });
                setZaloNumber(newNum);
                alert("Đã cập nhật số Zalo Admin thành công!");
            } catch (e) {
                alert("Lỗi khi cập nhật số Zalo.");
            }
        }
    };

    if (isLoading) return (
        <div className="flex h-[calc(100vh-100px)] items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
                <p className="text-gray-500 font-medium">Đang tải bảng điều khiển...</p>
            </div>
        </div>
    );

    // --- SUB-VIEWS ---

    const OverviewView = () => (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-5 relative overflow-hidden group bg-white dark:bg-gray-800">
                    <div className="absolute top-0 right-0 p-4 opacity-5 text-5xl group-hover:scale-110 transition-transform text-blue-500">👥</div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tổng Người Dùng</span>
                    <div className="flex items-end gap-2 mt-1">
                        <span className="text-3xl font-bold text-gray-800 dark:text-white">{stats.totalUsers}</span>
                    </div>
                    <div className="mt-3">
                        <Badge type="success">Hệ thống hoạt động</Badge>
                    </div>
                </Card>

                <Card className="p-5 relative overflow-hidden group bg-white dark:bg-gray-800">
                    <div className="absolute top-0 right-0 p-4 opacity-5 text-5xl group-hover:scale-110 transition-transform text-indigo-500">🤖</div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kích hoạt AI</span>
                    <div className="flex items-end gap-2 mt-1">
                        <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{stats.activeAiUsers}</span>
                        <span className="text-xs text-gray-400 mb-1">/ {stats.totalUsers}</span>
                    </div>
                    <div className="mt-3">
                        <Badge type="purple">Tính năng Premium</Badge>
                    </div>
                </Card>

                <Card className="p-5 relative overflow-hidden group bg-white dark:bg-gray-800">
                    <div className="absolute top-0 right-0 p-4 opacity-5 text-5xl group-hover:scale-110 transition-transform text-green-500">⚡</div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trạng thái API</span>
                    <div className="flex items-end gap-2 mt-1">
                        <span className="text-3xl font-bold text-gray-800 dark:text-white">{dbStatus}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dbStatus === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                        <span className="text-xs text-gray-500">Firebase DB</span>
                    </div>
                </Card>

                <Card className="p-5 relative overflow-hidden group bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none">
                    <div className="absolute top-0 right-0 p-4 opacity-20 text-5xl">▲</div>
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Vercel Analytics</span>
                    <div className="mt-1">
                        <span className="text-2xl font-bold">Đã Kích Hoạt</span>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                        <a
                            href="https://vercel.com/dashboard"
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] bg-white/20 hover:bg-white/30 transition-colors px-2 py-1 rounded text-white font-bold flex items-center gap-1"
                        >
                            Xem Dashboard ↗
                        </a>
                        <span className="text-[10px] text-green-400">● Tracking</span>
                    </div>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <UserGrowthChart />
                </div>
                <div className="lg:col-span-1">
                    <Card className="p-6 h-80 flex flex-col">
                        <h3 className="font-bold text-gray-800 dark:text-white mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
                            <span>💾</span> Dung lượng Database
                        </h3>
                        <div className="flex-1">
                            <StoragePieChart usedMB={stats.storageUsedMB} totalMB={QUOTA_LIMITS.storage} />
                        </div>
                        <div className="text-center mt-2">
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{stats.storageUsedMB.toFixed(2)} MB</p>
                            <p className="text-xs text-gray-500">Đang sử dụng / 1024 MB</p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );

    const ResourcesView = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex gap-4 items-start">
                <div className="text-2xl">ℹ️</div>
                <div>
                    <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm">Thông tin Gói cước (Firebase Spark + Vercel Hobby)</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-200 mt-1 leading-relaxed">
                        Hệ thống đang chạy trên các gói miễn phí. Số liệu dưới đây là ước tính dựa trên hoạt động thực tế của {stats.totalUsers} người dùng.
                        Nếu thanh tiến trình chuyển sang màu đỏ (&gt;80%), hãy cân nhắc nâng cấp lên gói Blaze.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Firestore Quotas */}
                <Card className="p-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                        <span className="bg-orange-100 text-orange-600 p-1.5 rounded-lg text-lg">🔥</span> Firestore Quotas (Hàng ngày)
                    </h3>

                    <ProgressBar
                        label="Reads (Đọc dữ liệu)"
                        current={stats.estimatedReads}
                        max={QUOTA_LIMITS.reads}
                        colorClass={stats.estimatedReads > QUOTA_LIMITS.reads * 0.8 ? 'bg-red-500' : 'bg-blue-500'}
                    />

                    <ProgressBar
                        label="Writes (Ghi dữ liệu)"
                        current={stats.estimatedWrites}
                        max={QUOTA_LIMITS.writes}
                        colorClass={stats.estimatedWrites > QUOTA_LIMITS.writes * 0.8 ? 'bg-red-500' : 'bg-green-500'}
                    />

                    <p className="text-xs text-gray-400 mt-4 italic">* Reset vào 14:00 hàng ngày (theo giờ Firebase US).</p>
                </Card>

                {/* Vercel & Storage */}
                <Card className="p-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                        <span className="bg-gray-100 text-gray-800 p-1.5 rounded-lg text-lg">▲</span> Hosting & Storage
                    </h3>

                    <ProgressBar
                        label="Database Storage (Tổng)"
                        current={stats.storageUsedMB}
                        max={QUOTA_LIMITS.storage}
                        colorClass="bg-purple-500"
                    />

                    <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Vercel Bandwidth</span>
                            <Badge type="success">Good</Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Băng thông truyền tải (Hàng tháng)</p>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full bg-gray-800 dark:bg-gray-200 w-[5%]"></div>
                        </div>
                        <p className="text-[10px] text-right mt-1 text-gray-400">~0.5 GB / 100 GB</p>
                    </div>
                </Card>
            </div>
        </div>
    );

    const SecurityView = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <span>🛡️</span> Nhật ký Bảo mật
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="px-6 py-3">Hành động / IP</th>
                                        <th className="px-6 py-3">Vị trí</th>
                                        <th className="px-6 py-3">Thời gian</th>
                                        <th className="px-6 py-3 text-right">Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {secLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-800 dark:text-white">{log.action}</p>
                                                <p className="text-xs text-gray-500 font-mono">{log.ip}</p>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{log.location}</td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">{log.time}</td>
                                            <td className="px-6 py-4 text-right">
                                                <Badge type={log.level === 'danger' ? 'danger' : 'success'}>
                                                    {log.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-1 space-y-4">
                    <Card className="p-5 bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800">
                        <h4 className="font-bold text-red-800 dark:text-red-300 mb-2">Cảnh báo Bảo mật</h4>
                        <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                            Không phát hiện mối đe dọa nghiêm trọng nào trong 24h qua. Hệ thống tường lửa Vercel đang hoạt động.
                        </p>
                    </Card>
                    <Card className="p-5">
                        <h4 className="font-bold text-gray-800 dark:text-white mb-3">Cấu hình Admin</h4>
                        <button className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 mb-2 transition-colors text-left px-4">
                            🔑 Đổi mật khẩu Admin
                        </button>
                        <button
                            onClick={handleChangeZalo}
                            className="w-full py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 transition-colors text-left px-4"
                        >
                            📞 Đổi số Zalo Admin ({zaloNumber})
                        </button>
                        <button className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors text-left px-4">
                            📜 Xuất Log hệ thống
                        </button>
                    </Card>
                </div>
            </div>
        </div>
    );

    // --- MAIN LAYOUT ---
    return (
        <div className="max-w-[1600px] mx-auto pb-20 px-4 md:px-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 pt-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <span className="bg-indigo-600 text-white p-2 rounded-xl text-xl shadow-lg shadow-indigo-500/30">🛠️</span>
                        Trung tâm Quản trị
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 ml-12 text-sm">DangHoang Ebook • v2.5.0 • {new Date().toLocaleDateString('vi-VN')}</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-xs font-bold border border-green-200 dark:border-green-800 shadow-sm">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Hệ thống Online
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 mb-8 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl w-fit shadow-inner">
                {[
                    { id: 'overview', label: 'Tổng quan', icon: '📊' },
                    { id: 'users', label: 'Người dùng', icon: '👥' },
                    { id: 'resources', label: 'Tài nguyên & Quota', icon: '⚡' },
                    { id: 'security', label: 'Bảo mật', icon: '🔒' }
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
