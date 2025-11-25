
import React, { useEffect, useState } from 'react';
import { firebaseService, FirestoreUser } from '../services/firebase';
import { UserTable } from './UserTable';

// Types for Activity Log
interface ActivityLog {
    id: string;
    action: string;
    user: string;
    timestamp: Date;
    type: 'info' | 'warning' | 'success' | 'danger';
}

export const AdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<FirestoreUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<ActivityLog[]>([
        { id: '1', action: 'Hệ thống khởi động', user: 'System', timestamp: new Date(), type: 'info' },
        { id: '2', action: 'Đồng bộ Database', user: 'System', timestamp: new Date(Date.now() - 100000), type: 'success' },
    ]);

    // Modal States
    const [showAddModal, setShowAddModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewTab, setViewTab] = useState<'profile' | 'settings' | 'activity'>('profile');
    const [selectedUser, setSelectedUser] = useState<FirestoreUser | null>(null);
    const [newUser, setNewUser] = useState({ name: '', email: '', role: 'user' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await firebaseService.getAllUsers();
            setUsers(data.sort((a, b) => b.lastLogin - a.lastLogin));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const addLog = (action: string, type: 'info' | 'warning' | 'success' | 'danger' = 'info') => {
        const newLog: ActivityLog = {
            id: Date.now().toString(),
            action,
            user: 'Admin',
            timestamp: new Date(),
            type
        };
        setLogs(prev => [newLog, ...prev]);
    };

    // --- HANDLERS ---

    const handleToggleStatus = async (uid: string, field: 'isActiveAI' | 'storageEnabled') => {
        const user = users.find(u => u.uid === uid);
        if (!user) return;

        let updateData: Partial<FirestoreUser> = {};
        let logMsg = '';

        if (field === 'isActiveAI') {
            // Cycle: Standard (true) -> VIP (true) -> Off (false) -> Standard (true)
            // Wait, logic:
            // If !active -> Standard
            // If active & standard -> VIP
            // If active & vip -> Off

            if (!user.isActiveAI) {
                updateData = { isActiveAI: true, aiTier: 'standard' };
                logMsg = `Kích hoạt AI (Standard) cho ${user.name}`;
            } else if (user.aiTier === 'standard') {
                updateData = { isActiveAI: true, aiTier: 'vip' };
                logMsg = `Nâng cấp AI (VIP) cho ${user.name}`;
            } else {
                updateData = { isActiveAI: false, aiTier: undefined }; // undefined or stay previous but inactive
                logMsg = `Tắt AI cho ${user.name}`;
            }
        } else {
            // Storage is simple boolean
            updateData = { storageEnabled: !user.storageEnabled };
            logMsg = `${!user.storageEnabled ? 'Bật' : 'Tắt'} Cloud Storage cho ${user.name}`;
        }

        try {
            await firebaseService.updateUserStatus(uid, updateData);
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...updateData } : u));
            addLog(logMsg, 'warning');
        } catch (e) {
            alert("Lỗi cập nhật trạng thái");
        }
    };

    const handleUpdateKey = async (uid: string, key: string) => {
        try {
            await firebaseService.updateUserApiKey(uid, key);
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, geminiApiKey: key, isActiveAI: !!key } : u));
            addLog(`Cập nhật API Key cho ${users.find(u => u.uid === uid)?.name}`, 'success');
        } catch (e) {
            alert("Lỗi cập nhật key");
        }
    };

    const handleLockUser = async (uid: string) => {
        const user = users.find(u => u.uid === uid);
        if (!user) return;
        if (user.role === 'admin') return alert("Không thể khóa Admin.");

        const newLockState = !user.isLocked;
        if (window.confirm(`${newLockState ? 'Khóa' : 'Mở khóa'} tài khoản ${user.name}?`)) {
            try {
                await firebaseService.updateUserStatus(uid, { isLocked: newLockState });
                setUsers(prev => prev.map(u => u.uid === uid ? { ...u, isLocked: newLockState } : u));
                addLog(`${newLockState ? 'Đã khóa' : 'Đã mở khóa'} user ${user.name}`, 'danger');
            } catch (e) {
                alert("Lỗi khóa/mở khóa user.");
            }
        }
    };

    const handleDeleteUser = async (uid: string) => {
        const user = users.find(u => u.uid === uid);
        if (!user) return;
        if (user.role === 'admin') return alert("Không thể xóa Admin.");

        if (window.confirm(`⚠️ NGUY HIỂM: Bạn có chắc muốn XÓA VĨNH VIỄN ${user.name}? Hành động này không thể hoàn tác và sẽ xóa toàn bộ dữ liệu Firestore.`)) {
            try {
                await firebaseService.deleteUserDocument(uid);
                setUsers(prev => prev.filter(u => u.uid !== uid));
                addLog(`Đã xóa user ${user.name} (${user.email})`, 'danger');
                if (showViewModal) setShowViewModal(false);
            } catch (e) {
                alert("Lỗi xóa user.");
            }
        }
    };

    const handleAddUser = async () => {
        if (!newUser.name || !newUser.email) return alert("Cần nhập Tên và Email.");
        setIsSubmitting(true);
        try {
            await firebaseService.createUserProfile({
                name: newUser.name,
                email: newUser.email,
                role: newUser.role as 'admin' | 'user',
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=random`,
                isActiveAI: true,
                aiTier: 'standard' // Default new users to standard
            });
            addLog(`Tạo profile mới: ${newUser.name}`, 'success');
            setShowAddModal(false);
            setNewUser({ name: '', email: '', role: 'user' });
            fetchUsers(); // Reload list
        } catch (e) {
            alert("Lỗi tạo user profile.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleViewUser = (user: FirestoreUser) => {
        setSelectedUser(user);
        setViewTab('profile');
        setShowViewModal(true);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Management & Logs Section */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[600px]">
                {/* User Table (2/3 width) */}
                <div className="xl:col-span-2 h-full min-h-[400px]">
                    <UserTable
                        users={users}
                        onToggleStatus={handleToggleStatus}
                        onUpdateKey={handleUpdateKey}
                        onLock={handleLockUser}
                        onDelete={handleDeleteUser}
                        onView={handleViewUser}
                        onAdd={() => setShowAddModal(true)}
                    />
                </div>

                {/* Activity Log (1/3 width) */}
                <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <span>🛡️</span> Nhật ký hoạt động
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {logs.map(log => (
                            <div key={log.id} className="flex gap-3 items-start text-sm animate-fade-in">
                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-orange-500' : log.type === 'danger' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                <div>
                                    <p className="font-medium text-gray-800 dark:text-gray-200">{log.action}</p>
                                    <p className="text-xs text-gray-500">bởi {log.user} • {log.timestamp.toLocaleTimeString()}</p>
                                </div>
                            </div>
                        ))}
                        {logs.length === 0 && <p className="text-gray-400 text-center text-xs">Chưa có hoạt động nào.</p>}
                    </div>
                </div>
            </div>

            {/* ADD USER MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Tạo User Profile</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Họ Tên</label>
                                <input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nguyễn Văn A" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                <input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="email@example.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vai trò</label>
                                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 dark:text-white outline-none">
                                    <option value="user">User thường</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                ℹ️ Lưu ý: Hành động này tạo profile trên Firestore. Người dùng vẫn cần đăng nhập bằng Google Email này để liên kết.
                            </div>
                            <button onClick={handleAddUser} disabled={isSubmitting} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                                {isSubmitting ? <span className="animate-spin">↻</span> : 'Tạo Profile'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW USER MODAL */}
            {showViewModal && selectedUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start bg-gray-50 dark:bg-gray-900">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-white dark:border-gray-700 shadow-sm bg-gray-200">
                                    {selectedUser.avatar ? <img src={selectedUser.avatar} className="w-full h-full object-cover" alt="" /> : <span className="flex items-center justify-center h-full text-2xl">👤</span>}
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center gap-2">
                                        {selectedUser.name}
                                        {selectedUser.isLocked && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200">ĐÃ KHÓA</span>}
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
                                    <div className="flex gap-2 mt-2">
                                        <span className="text-[10px] bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 font-mono">{selectedUser.uid}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${selectedUser.role === 'admin' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-50 text-blue-600'}`}>{selectedUser.role || 'USER'}</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowViewModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-100 dark:border-gray-700 px-6">
                            <button onClick={() => setViewTab('profile')} className={`py-3 text-sm font-bold mr-6 border-b-2 transition-colors ${viewTab === 'profile' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>Thông tin</button>
                            <button onClick={() => setViewTab('settings')} className={`py-3 text-sm font-bold mr-6 border-b-2 transition-colors ${viewTab === 'settings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>Cài đặt & Key</button>
                            <button onClick={() => setViewTab('activity')} className={`py-3 text-sm font-bold border-b-2 transition-colors ${viewTab === 'activity' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>Hoạt động</button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto bg-white dark:bg-gray-800 flex-1">
                            {viewTab === 'profile' && (
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày tạo</label>
                                        <div className="font-medium dark:text-white">{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'Unknown'}</div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Đăng nhập lần cuối</label>
                                        <div className="font-medium dark:text-white">{selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : 'Chưa bao giờ'}</div>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Trạng thái tài khoản</label>
                                        <div className="flex gap-3 mt-1">
                                            <Badge active={selectedUser.isActiveAI} label={`AI: ${selectedUser.aiTier?.toUpperCase() || 'OFF'}`} color={selectedUser.aiTier === 'vip' ? 'purple' : 'green'} />
                                            <Badge active={selectedUser.storageEnabled} label="Cloud Storage" />
                                            <Badge active={!selectedUser.isLocked} label="Account Active" color="purple" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {viewTab === 'settings' && (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Gemini API Key (Riêng)</label>
                                            {selectedUser.geminiApiKey ? <span className="text-green-600 text-xs font-bold">Đã cấu hình</span> : <span className="text-gray-400 text-xs">Chưa thiết lập</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="password"
                                                value={selectedUser.geminiApiKey || ''}
                                                readOnly
                                                className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-500"
                                                placeholder="Chưa có key"
                                            />
                                            <button
                                                onClick={() => {
                                                    const k = prompt("Nhập API Key mới:", selectedUser.geminiApiKey || "");
                                                    if (k !== null) handleUpdateKey(selectedUser.uid, k);
                                                }}
                                                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                                            >
                                                Cập nhật
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">Key này sẽ được ưu tiên sử dụng thay vì key hệ thống.</p>
                                    </div>
                                </div>
                            )}

                            {viewTab === 'activity' && (
                                <div className="space-y-3">
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-2">Sự kiện gần đây (Mô phỏng)</p>
                                    {[
                                        { action: 'Đăng nhập', time: '2 giờ trước', icon: '🔑' },
                                        { action: 'Tạo bài viết AI', time: '5 giờ trước', icon: '📝' },
                                        { action: 'Cập nhật Profile', time: '1 ngày trước', icon: '⚙️' },
                                        { action: 'Đăng ký', time: '3 ngày trước', icon: '✨' },
                                    ].map((act, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
                                            <span className="text-xl">{act.icon}</span>
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{act.action}</p>
                                                <p className="text-xs text-gray-500">{act.time}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-center">
                            <button onClick={() => handleDeleteUser(selectedUser.uid)} className="text-red-600 hover:text-red-700 text-sm font-bold hover:underline">Xóa Vĩnh Viễn</button>
                            <button onClick={() => setShowViewModal(false)} className="px-5 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-600 dark:text-white shadow-sm">Đóng</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Badge = ({ active, label, color = 'green' }: { active?: boolean, label: string, color?: 'green' | 'red' | 'purple' }) => {
    const colors = {
        green: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        red: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        purple: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
        gray: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
    };
    const style = active ? colors[color] : colors.gray;
    return <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase tracking-wider ${style}`}>{label}</span>
};
