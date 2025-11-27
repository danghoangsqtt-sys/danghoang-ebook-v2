
import React, { useState, useMemo } from 'react';
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

export const UserTable: React.FC<UserTableProps> = ({ users, onActivateClick, onPunishClick, onUpdateKey, onLock, onDelete, onView, onAdd, onToggleStorage }) => {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED' | 'ADMIN'>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 6;

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const name = u.name ? u.name.toLowerCase() : '';
            const email = u.email ? u.email.toLowerCase() : '';
            const searchTerm = search.toLowerCase();

            const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
            let matchesFilter = true;
            if (filter === 'ACTIVE') matchesFilter = !!u.isActiveAI;
            if (filter === 'LOCKED') matchesFilter = !!u.isLocked;
            if (filter === 'ADMIN') matchesFilter = u.role === 'admin';

            return matchesSearch && matchesFilter;
        });
    }, [users, search, filter]);

    const totalPages = Math.ceil(filteredUsers.length / pageSize);
    const currentData = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const getExpirationDisplay = (user: FirestoreUser) => {
        if (!user.isActiveAI) return null;
        if (!user.aiExpirationDate) return <span className="text-[9px] text-green-600 font-bold">∞ Lifetime</span>;

        const now = Date.now();
        const daysLeft = Math.ceil((user.aiExpirationDate - now) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) return <span className="text-[9px] text-red-600 font-bold">Expired</span>;
        if (daysLeft < 7) return <span className="text-[9px] text-orange-600 font-bold">{daysLeft} days left</span>;
        return <span className="text-[9px] text-gray-500">{new Date(user.aiExpirationDate).toLocaleDateString()}</span>;
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 whitespace-nowrap">
                        <span>👥</span> Users <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">{users.length}</span>
                    </h3>
                    <button onClick={onAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1 transition-all active:scale-95">
                        <span>+</span> Add User
                    </button>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-40 dark:text-white"
                    />
                    <select
                        value={filter}
                        onChange={(e: any) => setFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none cursor-pointer dark:text-white"
                    >
                        <option value="ALL">All</option>
                        <option value="ACTIVE">Active AI</option>
                        <option value="LOCKED">Locked</option>
                        <option value="ADMIN">Admins</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold">
                        <tr>
                            <th className="px-4 py-3">Profile</th>
                            <th className="px-4 py-3 text-center">AI Access</th>
                            <th className="px-4 py-3 text-center">Storage</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {currentData.map(user => (
                            <tr key={user.uid} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group ${user.isLocked ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-full overflow-hidden border-2 flex-shrink-0 ${user.role === 'admin' ? 'border-yellow-400' : 'border-gray-200 dark:border-gray-600'}`}>
                                            {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <span className="flex items-center justify-center h-full text-xs bg-gray-200 dark:bg-gray-700">?</span>}
                                        </div>
                                        <div className="min-w-0 max-w-[140px]">
                                            <div className="font-bold text-gray-800 dark:text-white truncate flex items-center gap-1">
                                                {user.name || 'Unknown'}
                                                {user.role === 'admin' && <span className="text-[8px] bg-yellow-100 text-yellow-800 px-1 rounded border border-yellow-200">ADM</span>}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate" title={user.email}>{user.email || 'No Email'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                        <button
                                            onClick={() => onActivateClick(user)}
                                            disabled={user.isLocked}
                                            className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 transition-all ${user.isActiveAI && user.aiTier === 'vip'
                                                    ? 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100'
                                                    : user.isActiveAI
                                                        ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                                                        : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-white hover:border-blue-300 hover:text-blue-500'
                                                }`}
                                        >
                                            {user.isActiveAI ? (user.aiTier === 'vip' ? '🌟 VIP' : '🤖 STD') : 'OFF'}
                                        </button>
                                        {getExpirationDisplay(user)}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => onToggleStorage(user)}
                                        disabled={user.isLocked}
                                        className={`p-1.5 rounded-lg transition-all ${user.storageEnabled ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                                        title={user.storageEnabled ? 'Storage Active' : 'Storage Disabled'}
                                    >
                                        {user.storageEnabled ? <span className="text-lg">☁️</span> : <span className="text-lg opacity-50 line-through">☁️</span>}
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {user.isLocked ? (
                                        <div className="flex flex-col items-center">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">LOCKED</span>
                                            {user.violationReason && <span className="text-[9px] text-red-500 max-w-[80px] truncate" title={user.violationReason}>{user.violationReason}</span>}
                                        </div>
                                    ) : user.isActiveAI ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">ACTIVE</span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">PENDING</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1 opacity-100 transition-opacity">
                                        <button onClick={() => onView(user)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Details">
                                            👁️
                                        </button>
                                        {/* Punish / Lock Button */}
                                        <button
                                            onClick={() => onPunishClick(user)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Punish / Revoke"
                                        >
                                            ⚖️
                                        </button>
                                        <button onClick={() => onDelete(user.uid)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {currentData.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-xs italic">No users found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <span className="text-xs text-gray-500 dark:text-gray-400">Showing {currentData.length} of {filteredUsers.length}</span>
                <div className="flex gap-2">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                        className="px-2 py-1 text-xs font-bold rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-white dark:hover:bg-gray-700 dark:text-white transition-colors"
                    >
                        Prev
                    </button>
                    <span className="text-xs font-bold self-center text-gray-700 dark:text-gray-300">{currentPage} / {totalPages || 1}</span>
                    <button
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                        className="px-2 py-1 text-xs font-bold rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-white dark:hover:bg-gray-700 dark:text-white transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};
