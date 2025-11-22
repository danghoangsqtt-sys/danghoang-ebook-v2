
import React, { useState, useMemo } from 'react';
import { FirestoreUser } from '../services/firebase';

interface UserTableProps {
    users: FirestoreUser[];
    onToggleStatus: (uid: string, field: 'isActiveAI' | 'storageEnabled') => void;
    onUpdateKey: (uid: string, key: string) => void;
    onLock: (uid: string) => void;
    onDelete: (uid: string) => void;
    onView: (user: FirestoreUser) => void;
    onAdd: () => void;
}

export const UserTable: React.FC<UserTableProps> = ({ users, onToggleStatus, onUpdateKey, onLock, onDelete, onView, onAdd }) => {
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
                        <option value="ACTIVE">Active</option>
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
                            <th className="px-4 py-3 text-center">Features</th>
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
                                    <div className="flex justify-center gap-1">
                                        <button
                                            onClick={() => onToggleStatus(user.uid, 'isActiveAI')}
                                            disabled={user.isLocked}
                                            className={`p-1.5 rounded-lg border transition-all ${user.isActiveAI ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-white opacity-60'}`}
                                            title="Toggle AI"
                                        >
                                            🤖
                                        </button>
                                        <button
                                            onClick={() => onToggleStatus(user.uid, 'storageEnabled')}
                                            disabled={user.isLocked}
                                            className={`p-1.5 rounded-lg border transition-all ${user.storageEnabled ? 'bg-purple-50 border-purple-200 text-purple-600 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-white opacity-60'}`}
                                            title="Toggle Storage"
                                        >
                                            💾
                                        </button>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {user.isLocked ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">LOCKED</span>
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
                                        <button onClick={() => onLock(user.uid)} className={`p-1.5 rounded transition-colors ${user.isLocked ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-400 hover:text-orange-600 hover:bg-gray-50'}`} title={user.isLocked ? "Unlock" : "Lock"}>
                                            {user.isLocked ? '🔓' : '🔒'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                const key = prompt("Assign API Key for " + user.name, user.geminiApiKey || "");
                                                if (key !== null) onUpdateKey(user.uid, key);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                            title="Manage Key"
                                        >
                                            🔑
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
                                <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-xs italic">No users found.</td>
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
