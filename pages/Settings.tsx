import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../App';
import { UserProfile } from '../types';
import { firebaseService, FirestoreUser } from '../services/firebase';
import { geminiService } from '../services/gemini';

// --- Constants & Helpers ---
const DATA_KEYS = [
    'dh_course_tree_v2', 'dh_completed_lessons',
    'dh_vocab_folders', 'dh_vocab_terms',
    'dh_habits', 'dh_events', 'dh_tasks',
    'dh_fin_trans', 'dh_fin_budgets', 'dh_fin_goals', 'dh_fin_debts',
    'dh_user_profile', 'dh_theme', 'dh_gemini_api_key'
];

const AVATARS = ['👨‍💻', '👩‍💻', '🚀', '🐱', '🐶', '🌟', '🎓', '🎵', '🍕', '⚽'];
const ADMIN_EMAIL = 'danghoang.sqtt@gmail.com';

const inputStyle = "w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600 transition-colors placeholder-gray-400 font-medium shadow-sm";

export const Settings: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<'account' | 'preferences' | 'data' | 'help'>('account');

    // User State
    const [profile, setProfile] = useState<UserProfile>({ name: 'Khách', avatar: '👨‍💻', email: '' });
    const [voiceName, setVoiceName] = useState('Puck');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // AI Key State (User view)
    const [apiKey, setApiKey] = useState(''); // Local state for checking if key exists

    // Admin Panel State
    const [userList, setUserList] = useState<FirestoreUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [editingUserKey, setEditingUserKey] = useState<string | null>(null);
    const [tempKeyInput, setTempKeyInput] = useState('');

    // System State
    const [storageStats, setStorageStats] = useState({ used: 0, total: 5242880, percent: 0 });
    const [toast, setToast] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Effects ---
    useEffect(() => {
        const savedProfile = localStorage.getItem('dh_user_profile');
        if (savedProfile) {
            const p = JSON.parse(savedProfile);
            setProfile(p);
            setIsAdmin(p.email === ADMIN_EMAIL);

            // If user has UID, fetch their assigned key from Firestore
            if (p.uid && p.email !== ADMIN_EMAIL) {
                fetchAssignedKey(p.uid);
            }
        }

        const savedVoice = localStorage.getItem('dh_voice_pref');
        if (savedVoice) setVoiceName(savedVoice);

        const savedKey = localStorage.getItem('dh_gemini_api_key');
        if (savedKey) setApiKey(savedKey);

        calculateStorage();
    }, []);

    useEffect(() => {
        // If admin switches to Account tab, fetch users
        if (isAdmin && activeTab === 'preferences') {
            fetchUsers();
        }
    }, [isAdmin, activeTab]);

    // --- Logic ---
    const fetchAssignedKey = async (uid: string) => {
        const assignedKey = await firebaseService.getMyAssignedApiKey(uid);
        if (assignedKey) {
            geminiService.updateApiKey(assignedKey);
            setApiKey(assignedKey);
            // Optional: Don't show toast on every load, only if it changed? 
            // For now silent sync is better.
        }
    };

    const fetchUsers = async () => {
        setLoadingUsers(true);
        const users = await firebaseService.getAllUsers();
        setUserList(users);
        setLoadingUsers(false);
    };

    const handleAssignKey = async (uid: string) => {
        if (!tempKeyInput.trim()) return;
        try {
            await firebaseService.updateUserApiKey(uid, tempKeyInput.trim());
            showToast("Đã kích hoạt AI cho người dùng này!");
            setEditingUserKey(null);
            setTempKeyInput('');
            fetchUsers(); // Refresh list
        } catch (e) {
            alert("Lỗi khi lưu Key.");
        }
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const calculateStorage = () => {
        let total = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += ((localStorage[key].length + key.length) * 2);
            }
        }
        setStorageStats({
            used: total,
            total: 5 * 1024 * 1024,
            percent: Math.min(100, (total / (5 * 1024 * 1024)) * 100)
        });
    };

    const handleGoogleLogin = async () => {
        setIsLoggingIn(true);
        const result = await firebaseService.loginWithGoogle();
        if (result) {
            const newProfile: UserProfile = {
                uid: result.user.uid,
                name: result.user.displayName || 'Người dùng',
                email: result.user.email || '',
                avatar: result.user.photoURL || '👨‍💻',
                accessToken: result.token
            };
            setProfile(newProfile);
            localStorage.setItem('dh_user_profile', JSON.stringify(newProfile));

            const adminCheck = newProfile.email === ADMIN_EMAIL;
            setIsAdmin(adminCheck);

            if (!adminCheck) {
                fetchAssignedKey(newProfile.uid!);
            }

            showToast(`Xin chào, ${newProfile.name}! Đăng nhập thành công.`);
        }
        setIsLoggingIn(false);
    };

    const handleLogout = async () => {
        await firebaseService.logout();
        const guestProfile: UserProfile = { name: 'Khách', avatar: '👨‍💻', email: '' };
        setProfile(guestProfile);
        setIsAdmin(false);
        localStorage.setItem('dh_user_profile', JSON.stringify(guestProfile));

        // Clear sensitive key on logout
        localStorage.removeItem('dh_gemini_api_key');
        setApiKey('');
        geminiService.updateApiKey(''); // Reset service

        showToast('Đã đăng xuất.');
    };

    const handleSaveProfileLocal = () => {
        localStorage.setItem('dh_user_profile', JSON.stringify(profile));
        localStorage.setItem('dh_voice_pref', voiceName);
        showToast('Đã lưu cài đặt thành công!');
    };

    // --- Data Management ---
    const handleExportData = () => {
        const backup: Record<string, any> = {};
        DATA_KEYS.forEach(key => {
            const val = localStorage.getItem(key);
            if (val) backup[key] = JSON.parse(val);
        });

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `danghoang_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('Đã tạo file sao lưu! 📥');
    };

    const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                let count = 0;
                Object.keys(json).forEach(key => {
                    if (DATA_KEYS.includes(key)) {
                        localStorage.setItem(key, JSON.stringify(json[key]));
                        count++;
                    }
                });
                showToast(`Đã khôi phục ${count} mục dữ liệu! Vui lòng tải lại trang.`);
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                alert("File sao lưu không hợp lệ.");
            }
        };
        reader.readAsText(file);
    };

    const handleClearData = (type: 'all' | 'cache') => {
        if (type === 'all') {
            if (window.confirm("CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ dữ liệu. Bạn có chắc chắn không?")) {
                localStorage.clear();
                window.location.reload();
            }
        } else {
            showToast("Đã dọn dẹp bộ nhớ tạm.");
        }
    };

    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm md:text-base ${activeTab === id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
        >
            <span className="text-xl">{icon}</span>
            {label}
        </button>
    );

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-fade-in">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <span>⚙️</span> Cài Đặt & Hệ Thống
            </h1>

            <div className="flex flex-col lg:flex-row gap-8">

                {/* Sidebar Navigation */}
                <div className="w-full lg:w-64 shrink-0 space-y-2">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-2">
                        <TabButton id="account" label="Tài khoản" icon="👤" />
                        <TabButton id="preferences" label="Giao diện & Tiện ích" icon="🎨" />
                        <TabButton id="data" label="Dữ liệu & Sao lưu" icon="💾" />
                        <TabButton id="help" label="Trợ giúp" icon="❓" />
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Dung lượng LocalStorage</h3>
                        <div className="flex justify-between text-xs mb-1 font-medium">
                            <span className="text-gray-800 dark:text-white">{(storageStats.used / 1024).toFixed(1)} KB</span>
                            <span className="text-gray-400">/ 5MB</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${storageStats.percent > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${storageStats.percent}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 min-h-[500px]">

                        {/* TAB: ACCOUNT */}
                        {activeTab === 'account' && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">Tài khoản & Đồng bộ</h2>
                                    <p className="text-sm text-gray-500">Đăng nhập Google để đồng bộ Lịch và lưu trữ dữ liệu đám mây.</p>
                                </div>

                                {profile.email ? (
                                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6">
                                        <img src={profile.avatar} alt="Avatar" className="w-20 h-20 rounded-full border-4 border-white shadow-md" onError={(e) => (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'} />
                                        <div className="text-center md:text-left flex-1">
                                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2 justify-center md:justify-start">
                                                {profile.name}
                                                {isAdmin && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full">ADMIN</span>}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-300">{profile.email}</p>
                                            <div className="mt-2 flex flex-wrap gap-2 justify-center md:justify-start">
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg font-bold">● Đã liên kết Google</span>
                                            </div>
                                        </div>
                                        <button onClick={handleLogout} className="px-4 py-2 bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded-xl font-bold shadow-sm transition-colors">
                                            Đăng xuất
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700 p-8 rounded-2xl text-center">
                                        <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-3xl shadow-sm mx-auto mb-4">👤</div>
                                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">Bạn đang dùng chế độ Khách</h3>
                                        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Dữ liệu chỉ được lưu trên thiết bị này. Hãy đăng nhập để đồng bộ Google Calendar và bảo vệ dữ liệu.</p>

                                        <button onClick={handleGoogleLogin} disabled={isLoggingIn} className="inline-flex items-center gap-3 px-6 py-3 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-xl font-bold shadow-sm transition-all hover:shadow-md disabled:opacity-70">
                                            {isLoggingIn ? (
                                                <span>Đang kết nối...</span>
                                            ) : (
                                                <>
                                                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
                                                    <span>Đăng nhập bằng Google</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                                    <h3 className="font-bold text-gray-800 dark:text-white mb-4">Chỉnh sửa thông tin cục bộ</h3>
                                    <div className="flex flex-col md:flex-row gap-6 items-start">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-3xl border border-blue-100 shadow-sm">
                                                {profile.avatar.length < 5 ? profile.avatar : '😊'}
                                            </div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {AVATARS.map(a => (
                                                    <button key={a} onClick={() => setProfile({ ...profile, avatar: a })} className={`w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-gray-100 transition-colors ${profile.avatar === a ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}>
                                                        {a}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex-1 w-full space-y-4">
                                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên hiển thị</label><input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} className={inputStyle} /></div>
                                            <button onClick={handleSaveProfileLocal} className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-900 rounded-lg font-bold shadow-sm transition-colors text-sm">Lưu cục bộ</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: PREFERENCES (API KEY & THEME) */}
                        {activeTab === 'preferences' && (
                            <div className="space-y-8 animate-fade-in">
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Giao diện & Tiện ích</h2>

                                {/* Theme */}
                                <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div><h3 className="font-bold text-gray-800 dark:text-white">Chế độ Giao diện</h3><p className="text-xs text-gray-500">Chuyển đổi giữa Sáng và Tối</p></div>
                                    <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-600">
                                        <button onClick={() => toggleTheme('light')} className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${theme === 'light' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}>☀️ Sáng</button>
                                        <button onClick={() => toggleTheme('dark')} className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${theme === 'dark' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>🌙 Tối</button>
                                    </div>
                                </div>

                                {/* API Key Configuration (Different for Admin vs User) */}
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div className="mb-3">
                                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                            🤖 Mở khóa tính năng AI
                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Quan trọng</span>
                                        </h3>
                                    </div>

                                    {isAdmin ? (
                                        // --- ADMIN VIEW ---
                                        <div className="space-y-4">
                                            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm text-blue-800">
                                                <strong>👋 Admin Mode:</strong> Bạn có quyền quản lý và cấp API Key cho người dùng bên dưới.
                                            </div>

                                            {loadingUsers ? <div className="text-center text-gray-500">Đang tải danh sách người dùng...</div> : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="text-xs text-gray-500 uppercase bg-gray-100 dark:bg-gray-700">
                                                            <tr>
                                                                <th className="px-4 py-2">User</th>
                                                                <th className="px-4 py-2">Email</th>
                                                                <th className="px-4 py-2">Status</th>
                                                                <th className="px-4 py-2">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {userList.map(user => (
                                                                <tr key={user.uid} className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                                                    <td className="px-4 py-3 font-medium">{user.name}</td>
                                                                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                                                                    <td className="px-4 py-3">
                                                                        {user.isActiveAI ?
                                                                            <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded">Active</span> :
                                                                            <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-0.5 rounded">Inactive</span>
                                                                        }
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        {editingUserKey === user.uid ? (
                                                                            <div className="flex gap-2">
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Paste API Key"
                                                                                    className="border rounded px-2 py-1 w-32 text-xs"
                                                                                    value={tempKeyInput}
                                                                                    onChange={e => setTempKeyInput(e.target.value)}
                                                                                />
                                                                                <button onClick={() => handleAssignKey(user.uid)} className="text-green-600 font-bold">✔</button>
                                                                                <button onClick={() => { setEditingUserKey(null); setTempKeyInput('') }} className="text-red-600 font-bold">✕</button>
                                                                            </div>
                                                                        ) : (
                                                                            <button onClick={() => { setEditingUserKey(user.uid); setTempKeyInput(user.geminiApiKey || '') }} className="text-blue-600 hover:underline text-xs font-bold">
                                                                                {user.isActiveAI ? 'Edit Key' : '+ Add Key'}
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        // --- USER VIEW ---
                                        <div className="space-y-3">
                                            {apiKey ? (
                                                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                                    <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl">✨</div>
                                                    <div>
                                                        <p className="font-bold text-green-800 text-sm">AI đã được kích hoạt</p>
                                                        <p className="text-xs text-green-700">Bạn có thể sử dụng mọi tính năng thông minh.</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                                                    <div className="text-4xl mb-2">🔒</div>
                                                    <h4 className="font-bold text-gray-800 dark:text-white mb-1">Chức năng AI chưa kích hoạt</h4>
                                                    <p className="text-sm text-gray-500 mb-4">Vui lòng liên hệ Admin để mở khóa tính năng này.</p>

                                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-800 font-medium text-sm">
                                                        <span>Zalo Admin:</span>
                                                        <strong className="select-all">0343019101</strong>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Voice */}
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div className="mb-3"><h3 className="font-bold text-gray-800 dark:text-white">Giọng nói Trợ lý Nana</h3><p className="text-xs text-gray-500">Dành cho tính năng Live Voice & Speaking</p></div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {['Puck', 'Kore', 'Fenrir', 'Aoede'].map(v => (
                                            <button key={v} onClick={() => { setVoiceName(v); handleSaveProfileLocal(); }} className={`p-3 rounded-xl border text-center transition-all ${voiceName === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                                                <div className="text-2xl mb-1">{['Puck', 'Fenrir'].includes(v) ? '👨' : '👩'}</div><span className="font-bold text-sm">{v}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: DATA */}
                        {activeTab === 'data' && (
                            <div className="space-y-8 animate-fade-in">
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Quản lý Dữ liệu</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-6 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors flex flex-col items-center text-center cursor-pointer" onClick={handleExportData}>
                                        <div className="text-3xl mb-4">📤</div><h3 className="font-bold text-blue-800">Sao lưu dữ liệu (Export)</h3><p className="text-xs text-gray-500 mt-1 px-4">Tải file .json chứa toàn bộ dữ liệu về máy.</p>
                                    </div>
                                    <div className="p-6 rounded-xl border-2 border-dashed border-green-200 bg-green-50 hover:bg-green-100 transition-colors flex flex-col items-center text-center cursor-pointer relative">
                                        <input type="file" accept=".json" className="absolute inset-0 opacity-0 cursor-pointer" ref={fileInputRef} onChange={handleImportData} />
                                        <div className="text-3xl mb-4">📥</div><h3 className="font-bold text-green-800">Khôi phục dữ liệu (Import)</h3><p className="text-xs text-gray-500 mt-1 px-4">Chọn file .json để khôi phục.</p>
                                    </div>
                                </div>
                                <div className="p-6 bg-red-50 rounded-xl border border-red-100 mt-6">
                                    <h3 className="font-bold text-red-800 mb-2">⚠️ Vùng nguy hiểm</h3>
                                    <div className="flex gap-4"><button onClick={() => handleClearData('all')} className="bg-white text-red-600 border border-red-200 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-red-50 transition-colors">Xóa TOÀN BỘ dữ liệu & Reset App</button></div>
                                </div>
                            </div>
                        )}

                        {/* TAB: HELP */}
                        {activeTab === 'help' && (
                            <div className="space-y-6 animate-fade-in">
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Trợ giúp</h2>
                                <div className="space-y-4">
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <h3 className="font-bold text-sm mb-2">Q: Google Calendar không đồng bộ?</h3>
                                        {/* ĐÃ SỬA: Dùng ký tự '→' thay cho '->' */}
                                        <p className="text-sm text-gray-600">A: Đảm bảo bạn đã đăng nhập và cấp quyền truy cập lịch. Vào Settings → Account để kiểm tra.</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <h3 className="font-bold text-sm mb-2">Q: Dữ liệu lưu ở đâu?</h3>
                                        <p className="text-sm text-gray-600">A: Mặc định lưu LocalStorage. Khi đăng nhập Google, dữ liệu vẫn ưu tiên local-first nhưng hỗ trợ đồng bộ các tính năng đám mây.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-fade-in-up z-50">
                    <span className="text-green-400 text-xl">✓</span><span className="font-bold text-sm">{toast}</span>
                </div>
            )}
        </div>
    );
};