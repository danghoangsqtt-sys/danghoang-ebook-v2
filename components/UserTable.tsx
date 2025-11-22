
import React, { useState, useMemo } from 'react';
import { FirestoreUser } from '../services/firebase';

interface UserTableProps {
    users: FirestoreUser[];
    onToggleStatus: (uid: string, field: 'isActiveAI' | 'storageEnabled') => void;
    onUpdateKey: (uid: string, key: string) => void;
}

export const UserTable: React.FC<UserTableProps> = ({ users, onToggleStatus, onUpdateKey }) => {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING'>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            // SAFETY CHECK: Ensure name and email exist before calling toLowerCase()
            // This prevents the crash seen in the screenshot.
            const name = u.name ? u.name.toLowerCase() : '';
            const email = u.email ? u.email.toLowerCase() : '';
            const searchTerm = search.toLowerCase();

            const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
            const matchesFilter = filter === 'ALL'
                ? true
                : filter === 'ACTIVE' ? u.isActiveAI
                    : !u.isActiveAI;
            return matchesSearch && matchesFilter;
        });
    }, [users, search, filter]);

    const totalPages = Math.ceil(filteredUsers.length / pageSize);
    const currentData = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <span>👥</span> User Management <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">{users.length}</span>
                </h3>
                <div className="flex gap-2 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48 dark:text-white"
                    />
                    <select
                        value={filter}
                        onChange={(e: any) => setFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none cursor-pointer dark:text-white"
                    >
                        <option value="ALL">All Status</option>
                        <option value="ACTIVE">Active AI</option>
                        <option value="PENDING">Pending</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold">
                        <tr>
                            <th className="px-4 py-3">User</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Permissions</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {currentData.map(user => (
                            <tr key={user.uid} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden border border-gray-300 dark:border-gray-500 flex-shrink-0">
                                            {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <span className="flex items-center justify-center h-full text-xs">?</span>}
                                        </div>
                                        <div className="min-w-0 max-w-[150px]">
                                            <div className="font-bold text-gray-800 dark:text-white truncate" title={user.name}>{user.name || 'Unknown'}</div>
                                            <div className="text-xs text-gray-500 truncate" title={user.email}>{user.email || 'No Email'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    {user.isActiveAI ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                                            Pending
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onToggleStatus(user.uid, 'isActiveAI')}
                                            className={`p-1.5 rounded-lg border transition-colors ${user.isActiveAI ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500'}`}
                                            title="Toggle AI Access"
                                        >
                                            🤖
                                        </button>
                                        <button
                                            onClick={() => onToggleStatus(user.uid, 'storageEnabled')}
                                            className={`p-1.5 rounded-lg border transition-colors ${user.storageEnabled ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-500'}`}
                                            title="Toggle Storage"
                                        >
                                            💾
                                        </button>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => {
                                            const key = prompt("Assign API Key for " + user.name, user.geminiApiKey || "");
                                            if (key !== null) onUpdateKey(user.uid, key);
                                        }}
                                        className="text-gray-400 hover:text-blue-600 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        title="Manage API Key"
                                    >
                                        🔑
                                    </button>
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
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="px-3 py-1 text-xs font-bold rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                >
                    Prev
                </button>
                <span className="text-xs font-bold self-center text-gray-700 dark:text-gray-300">Page {currentPage} of {totalPages || 1}</span>
                <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="px-3 py-1 text-xs font-bold rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                >
                    Next
                </button>
            </div>
        </div>
    );
};
