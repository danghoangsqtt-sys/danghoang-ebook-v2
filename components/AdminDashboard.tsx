import React, { useEffect, useState } from 'react';
import { firebaseService, FirestoreUser } from '../services/firebase';
import { UserGrowthChart, SystemActivityChart } from './DashboardCharts';
import { UserTable } from './UserTable';

// Types for Activity Log
interface ActivityLog {
    id: string;
    action: string;
    user: string;
    timestamp: Date;
    type: 'info' | 'warning' | 'success';
}

export const AdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<FirestoreUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<ActivityLog[]>([
        { id: '1', action: 'System Startup', user: 'System', timestamp: new Date(), type: 'info' },
        { id: '2', action: 'Database Sync', user: 'System', timestamp: new Date(Date.now() - 100000), type: 'success' },
    ]);

    const fetchUsers = async () => {
        setLoading(true);
        const data = await firebaseService.getAllUsers();
        setUsers(data.sort((a, b) => b.lastLogin - a.lastLogin));
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const addLog = (action: string, type: 'info' | 'warning' | 'success' = 'info') => {
        const newLog: ActivityLog = {
            id: Date.now().toString(),
            action,
            user: 'Admin',
            timestamp: new Date(),
            type
        };
        setLogs(prev => [newLog, ...prev]);
    };

    const handleToggleStatus = async (uid: string, field: 'isActiveAI' | 'storageEnabled') => {
        const user = users.find(u => u.uid === uid);
        if (!user) return;
        const newValue = !user[field];

        try {
            await firebaseService.updateUserStatus(uid, { [field]: newValue });
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, [field]: newValue } : u));
            addLog(`${newValue ? 'Enabled' : 'Disabled'} ${field} for ${user.name}`, 'warning');
        } catch (e) {
            alert("Error updating status");
        }
    };

    const handleUpdateKey = async (uid: string, key: string) => {
        try {
            await firebaseService.updateUserApiKey(uid, key);
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, geminiApiKey: key, isActiveAI: !!key } : u));
            addLog(`Updated API Key for ${users.find(u => u.uid === uid)?.name}`, 'success');
        } catch (e) {
            alert("Error updating key");
        }
    };

    // KPI Calculations
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.isActiveAI).length;
    const pendingUsers = users.filter(u => !u.isActiveAI).length;
    const storageUsedGB = (totalUsers * 0.05).toFixed(2); // Mock calculation

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    return (
        <div className="space-y-6 p-2 md:p-4 animate-fade-in max-w-[1600px] mx-auto">
            {/* 1. KPI Cards Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <StatCard title="Total Users" value={totalUsers} icon="👥" color="bg-blue-500" trend="+12% this week" />
                <StatCard title="Active AI Users" value={activeUsers} icon="🤖" color="bg-green-500" trend="High Engagement" />
                <StatCard title="Storage Used" value={`${storageUsedGB} GB`} icon="💾" color="bg-purple-500" trend="20% of Quota" />
                <StatCard title="Pending Requests" value={pendingUsers} icon="⏳" color="bg-orange-500" trend="Requires Action" />
            </div>

            {/* 2. Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <UserGrowthChart />
                <SystemActivityChart />
            </div>

            {/* 3. Management & Logs Section */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[600px]">
                {/* User Table (2/3 width) */}
                <div className="xl:col-span-2 h-full min-h-[400px]">
                    <UserTable users={users} onToggleStatus={handleToggleStatus} onUpdateKey={handleUpdateKey} />
                </div>

                {/* Activity Log (1/3 width) */}
                <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <span>🛡️</span> Security & Audit Log
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {logs.map(log => (
                            <div key={log.id} className="flex gap-3 items-start text-sm">
                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                                <div>
                                    <p className="font-medium text-gray-800 dark:text-gray-200">{log.action}</p>
                                    <p className="text-xs text-gray-500">by {log.user} • {log.timestamp.toLocaleTimeString()}</p>
                                </div>
                            </div>
                        ))}
                        {logs.length === 0 && <p className="text-gray-400 text-center text-xs">No recent activity.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ title: string, value: string | number, icon: string, color: string, trend: string }> = ({ title, value, icon, color, trend }) => (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 relative overflow-hidden group hover:shadow-md transition-all">
        <div className={`absolute top-0 right-0 w-20 h-20 ${color} opacity-10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>
        <div className="flex justify-between items-start relative z-10">
            <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
                <h3 className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{value}</h3>
                <p className="text-xs font-medium mt-2 flex items-center gap-1">
                    <span className={`${trend.includes('+') ? 'text-green-500' : 'text-gray-400'}`}>{trend}</span>
                </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color} text-white shadow-lg`}>
                {icon}
            </div>
        </div>
    </div>
);