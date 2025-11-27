
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FirestoreUser } from '../services/firebase';

interface UserTableProps {
    users: FirestoreUser[];
    onActivateClick: (user: FirestoreUser) => void;
    onPunishClick: (user: FirestoreUser) => void;
    onUpdateKey: (uid: string, key: string) => void;
    onLock: (uid: string) => void;
    onDelete: (uid: string) => void;
    onView: (user: FirestoreUser) => void;
    onAdd: () => void;
    onToggleStorage: (user: FirestoreUser) => void;
}

// --- Helper Components ---

const StatCard = ({ label, value, icon, color }: { label: string, value: number, icon: string, color: string }) => (
    <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4 flex-1 min-w-[140px] transition-transform hover:-translate-y-1 duration-300`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${color} shadow-inner`}>
            {icon}
        </div>
        <div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-white leading-none">{value}</p>
        </div>
    </div>
);

const FilterTab = ({ active, label, count, onClick, colorClass }: { active: boolean, label: string, count: number, onClick: () => void, colorClass: string }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 border ${active
                ? `${colorClass} shadow-md transform scale-105`
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
    >
        {label}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${active ? 'bg-white/30 text-inherit' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {count}
        </span>
    </button>
);

const TimeAgo = ({ timestamp }: { timestamp: number }) => {
    if (!timestamp) return <span className="text-gray-400 italic text-xs">Chưa đăng nhập</span>;

    const getRelativeTime = (ts: number) => {
        const diff = Date.now() - ts;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (diff < 60000) return 'Vừa xong';
        if (minutes < 60) return `${minutes} phút trước`;
        if (hours < 24) return `${hours} giờ trước`;
        if (days < 7) return `${days} ngày trước`;
        return new Date(ts).toLocaleDateString('vi-VN');
    };

    const rel = getRelativeTime(timestamp);
    const isRecent = Date.now() - timestamp < 24 * 60 * 60 * 1000; // < 24h

    return (
        <div className="flex flex-col">
            <span className={`text-sm font-medium ${isRecent ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {rel}
            </span>
            <span className="text-[10px] text-gray-400">
                {new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
    );
};

// --- Dropdown Menu Component ---
const ActionMenu = ({ isOpen, onClose, actions }: { isOpen: boolean, onClose: () => void, actions: any[] }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden animate-fade-in origin-top-right">
            {actions.map((action, idx) => (
                <button
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); action.onClick(); onClose(); }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${action.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200'}`}
                >
                    <span className="text-lg">{action.icon}</span> {action.label}
                </button>
            ))}
        </div>
    );
};

export const UserTable: React.FC<UserTableProps> = ({ users, onActivateClick, onPunishClick, onUpdateKey, onLock, onDelete, onView, onAdd, onToggleStorage }) => {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'VIP' | 'STANDARD' | 'LOCKED' | 'ADMIN'>('ALL');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'lastLogin', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const pageSize = 5;

    const filteredUsers = useMemo(() => {
        let result = users.filter(u => {
            const name = u.name ? u.name.toLowerCase() : '';
            const email = u.email ? u.email.toLowerCase() : '';
            const searchTerm = search.toLowerCase();
            const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);

            let matchesFilter = true;
            if (filter === 'VIP') matchesFilter = u.isActiveAI && u.aiTier === 'vip' && !u.isLocked;
            if (filter === 'STANDARD') matchesFilter = u.isActiveAI && u.aiTier !== 'vip' && !u.isLocked;
            if (filter === 'LOCKED') matchesFilter = !!u.isLocked;
            if (filter === 'ADMIN') matchesFilter = u.role === 'admin';

            return matchesSearch && matchesFilter;
        });

        result.sort((a: any, b: any) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];
            if (valA === undefined || valA === null) valA = 0;
            if (valB === undefined || valB === null) valB = 0;
            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [users, search, filter, sortConfig]);

    const totalPages = Math.ceil(filteredUsers.length / pageSize);
    const currentData = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <span className="opacity-20 ml-1">⇅</span>;
        return sortConfig.direction === 'asc' ? <span className="ml-1 text-blue-500">↑</span> : <span className="ml-1 text-blue-500">↓</span>;
    };

    const stats = useMemo(() => ({
        total: users.length,
        vip: users.filter(u => u.isActiveAI && u.aiTier === 'vip' && !u.isLocked).length,
        standard: users.filter(u => u.isActiveAI && u.aiTier !== 'vip' && !u.isLocked).length,
        locked: users.filter(u => u.isLocked).length,
        admin: users.filter(u => u.role === 'admin').length
    }), [users]);

    return (
        <div className="flex flex-col h-full gap-6">

            {/* 1. Quick Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Tổng User" value={stats.total} icon="👥" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
                <StatCard label="VIP Active" value={stats.vip} icon="🌟" color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
                <StatCard label="Bị Khóa" value={stats.locked} icon="🔒" color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
                <StatCard label="Admin" value={stats.admin} icon="🛡️" color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 relative">

                {/* 2. Toolbar & Filter */}
                <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col space-y-4 bg-white dark:bg-gray-800 sticky top-0 z-20">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 w-full md:w-auto">
                            <FilterTab active={filter === 'ALL'} label="Tất cả" count={users.length} onClick={() => setFilter('ALL')} colorClass="bg-gray-100 text-gray-700 border-gray-300" />
                            <FilterTab active={filter === 'VIP'} label="VIP" count={stats.vip} onClick={() => setFilter('VIP')} colorClass="bg-amber-50 text-amber-700 border-amber-200" />
                            <FilterTab active={filter === 'STANDARD'} label="Standard" count={stats.standard} onClick={() => setFilter('STANDARD')} colorClass="bg-blue-50 text-blue-700 border-blue-200" />
                            <FilterTab active={filter === 'LOCKED'} label="Bị Khóa" count={stats.locked} onClick={() => setFilter('LOCKED')} colorClass="bg-red-50 text-red-700 border-red-200" />
                            <FilterTab active={filter === 'ADMIN'} label="Admin" count={stats.admin} onClick={() => setFilter('ADMIN')} colorClass="bg-indigo-50 text-indigo-700 border-indigo-200" />
                        </div>

                        <div className="relative w-full md:w-64">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                            <input
                                type="text"
                                placeholder="Tìm kiếm..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-full text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Table */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-900/80 text-gray-500 dark:text-gray-400 uppercase text-[11px] font-bold tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('name')}>User Info {getSortIcon('name')}</th>
                                <th className="px-6 py-4 cursor-pointer hover:text-blue-600 transition-colors text-center" onClick={() => handleSort('aiTier')}>Status / Tier {getSortIcon('aiTier')}</th>
                                <th className="px-6 py-4 text-center">Storage</th>
                                <th className="px-6 py-4 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('lastLogin')}>Activity {getSortIcon('lastLogin')}</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {currentData.map(user => {
                                // Expiration Logic
                                let expLabel = 'No AI';
                                let expColor = 'text-gray-400';
                                if (user.isActiveAI) {
                                    if (user.aiExpirationDate) {
                                        const days = Math.ceil((user.aiExpirationDate - Date.now()) / (1000 * 60 * 60 * 24));
                                        if (days < 0) { expLabel = 'Expired'; expColor = 'text-red-500'; }
                                        else { expLabel = `${days} days left`; expColor = 'text-green-600'; }
                                    } else {
                                        expLabel = 'Lifetime'; expColor = 'text-purple-600 font-bold';
                                    }
                                }

                                return (
                                    <tr key={user.uid} className={`group hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors ${user.isLocked ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="relative shrink-0">
                                                    <div className={`w-11 h-11 rounded-full overflow-hidden border-2 ${user.role === 'admin' ? 'border-yellow-400 shadow-md' : 'border-gray-200 dark:border-gray-700'}`}>
                                                        {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-gray-100 flex items-center justify-center">👤</div>}
                                                    </div>
                                                    {user.isLocked && <div className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-gray-800">🔒</div>}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-gray-900 dark:text-white text-sm truncate max-w-[180px]">{user.name}</p>
                                                        {user.role === 'admin' && <span className="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-yellow-200">ADM</span>}
                                                    </div>
                                                    <p className="text-xs text-gray-500 truncate max-w-[200px]" title={user.email}>{user.email}</p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center gap-1.5">
                                                {user.isLocked ? (
                                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">LOCKED</span>
                                                ) : user.isActiveAI ? (
                                                    user.aiTier === 'vip'
                                                        ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200 shadow-sm flex items-center gap-1"><span>🌟</span> VIP</span>
                                                        : <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">Standard</span>
                                                ) : (
                                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200">OFF</span>
                                                )}
                                                <span className={`text-[10px] ${expColor}`}>{expLabel}</span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center">
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={!!user.storageEnabled}
                                                        onChange={() => onToggleStorage(user)}
                                                        disabled={user.isLocked || user.role === 'admin'}
                                                    />
                                                    <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 ${user.storageEnabled ? 'opacity-100' : 'opacity-50 grayscale'}`}></div>
                                                </label>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">{user.storageEnabled ? 'Enabled' : 'Pending'}</p>
                                        </td>

                                        <td className="px-6 py-4">
                                            <TimeAgo timestamp={user.lastLogin} />
                                        </td>

                                        <td className="px-6 py-4 text-right relative">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => onView(user)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"
                                                    title="Xem chi tiết"
                                                >
                                                    👁️
                                                </button>

                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === user.uid ? null : user.uid); }}
                                                        className={`p-2 rounded-lg transition-colors ${openMenuId === user.uid ? 'bg-gray-200 dark:bg-gray-700 text-gray-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'}`}
                                                    >
                                                        ⋮
                                                    </button>

                                                    <ActionMenu
                                                        isOpen={openMenuId === user.uid}
                                                        onClose={() => setOpenMenuId(null)}
                                                        actions={[
                                                            { label: 'Kích hoạt AI / Gia hạn', icon: '⚡', onClick: () => onActivateClick(user) },
                                                            { label: user.isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản', icon: user.isLocked ? '🔓' : '🔒', onClick: () => onLock(user.uid) },
                                                            { label: 'Cập nhật API Key', icon: '🔑', onClick: () => { const k = prompt("Nhập API Key mới:"); if (k) onUpdateKey(user.uid, k); } },
                                                            { label: 'Phạt / Cảnh cáo', icon: '⚠️', onClick: () => onPunishClick(user), danger: true },
                                                            { label: 'Xóa người dùng', icon: '🗑️', onClick: () => onDelete(user.uid), danger: true },
                                                        ]}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {currentData.length === 0 && (
                        <div className="p-10 text-center text-gray-400">
                            <div className="text-4xl mb-2">🕵️</div>
                            <p>Không tìm thấy người dùng phù hợp.</p>
                        </div>
                    )}
                </div>

                {/* 4. Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
                        <span className="text-sm text-gray-500">Showing {currentData.length} of {filteredUsers.length}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-bold disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Prev
                            </button>
                            <span className="px-3 py-1.5 text-sm font-bold">{currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-bold disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
