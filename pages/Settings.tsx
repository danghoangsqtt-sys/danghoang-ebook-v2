
import React, { useState, useEffect, useRef, Component } from 'react';
import { useTheme } from '../App';
import { UserProfile } from '../types';
import { firebaseService } from '../services/firebase';
import { geminiService } from '../services/gemini';
import { speechService, VoiceSettings, DEFAULT_VOICE_SETTINGS } from '../services/speech';
import firebase from 'firebase/compat/app'; // Ensure firebase types are available

const DATA_KEYS = [
    'dh_course_tree_v2', 'dh_completed_lessons',
    'dh_vocab_folders', 'dh_vocab_terms',
    'dh_habits', 'dh_events', 'dh_tasks',
    'dh_fin_trans', 'dh_fin_budgets', 'dh_fin_goals', 'dh_fin_debts',
    'dh_user_profile', 'dh_theme', 'dh_gemini_api_key', 'dh_chat_history',
    'dh_voice_settings'
];

interface ErrorBoundaryState {
    hasError: boolean;
}

interface ErrorBoundaryProps {
    children?: React.ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error("Settings Crash:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return <div className="p-6 text-center text-red-500 bg-red-50 rounded-xl m-4">Đã xảy ra lỗi trong phần Cài Đặt. Vui lòng tải lại trang.</div>;
        }
        return this.props.children;
    }
}

export const Settings: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<'account' | 'preferences' | 'voice' | 'data' | 'help'>('preferences');

    // User State
    const [profile, setProfile] = useState<UserProfile>({ name: 'Khách', avatar: '👨‍💻', email: '' });
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);

    // AI Key State
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isCheckingKey, setIsCheckingKey] = useState(false);
    const [keyStatus, setKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
    const [isEditingKey, setIsEditingKey] = useState(false); // Toggle between View/Edit mode

    // Voice Settings State
    const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

    // System State
    const [storageStats, setStorageStats] = useState({ used: 0, total: 5242880, percent: 0 });
    const [toast, setToast] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const syncProfile = async (user: firebase.User | null) => {
            if (user) {
                // 1. Construct Profile from Live Auth Data
                const p: UserProfile = {
                    name: user.displayName || 'User',
                    email: user.email || '',
                    avatar: user.photoURL || '👨‍💻',
                    uid: user.uid
                };
                setProfile(p);

                // 2. Update Admin Status
                const adminCheck = user.email === firebaseService.ADMIN_EMAIL;
                setIsAdmin(adminCheck);

                // 3. Update Authorization Status
                const authorized = await firebaseService.isUserAuthorized();
                setIsAuthorized(authorized);

                // 4. Sync Key
                const savedKey = localStorage.getItem('dh_gemini_api_key');
                if (savedKey) {
                    setApiKey(savedKey);
                    setKeyStatus('valid');
                } else {
                    const assignedKey = await firebaseService.getMyAssignedApiKey(user.uid);
                    if (assignedKey) {
                        geminiService.updateApiKey(assignedKey);
                        setApiKey(assignedKey);
                        setKeyStatus('valid');
                        localStorage.setItem('dh_gemini_api_key', assignedKey);
                    }
                }

                // Update LocalStorage cache for consistency
                localStorage.setItem('dh_user_profile', JSON.stringify(p));
            } else {
                // Fallback to Guest or LocalStorage if not logged in
                const savedProfile = localStorage.getItem('dh_user_profile');
                if (savedProfile) {
                    try {
                        const p = JSON.parse(savedProfile);
                        // Only use saved profile if it looks like a guest profile or we want offline support
                        // For now, if no auth user, we reset to Guest to avoid confusion
                        setProfile({ name: 'Khách', avatar: '👨‍💻', email: '' });
                    } catch (e) {
                        setProfile({ name: 'Khách', avatar: '👨‍💻', email: '' });
                    }
                } else {
                    setProfile({ name: 'Khách', avatar: '👨‍💻', email: '' });
                }
                setIsAdmin(false);
                setIsAuthorized(false);
            }
        };

        // Initial check
        if (firebaseService.auth.currentUser) {
            syncProfile(firebaseService.auth.currentUser);
        }

        // Listen for auth changes
        const unsub = firebaseService.auth.onAuthStateChanged(async (user) => {
            syncProfile(user);
        });

        calculateStorage();
        loadVoiceSettings();

        // Cleanup on unmount
        return () => {
            speechService.cancel();
            unsub();
        };
    }, []);

    const loadVoiceSettings = async () => {
        // Load voices
        const voices = await speechService.getVoices();
        setAvailableVoices(voices);

        // Load saved settings
        const saved = localStorage.getItem('dh_voice_settings');
        if (saved) {
            setVoiceSettings(JSON.parse(saved));
        } else {
            // Smart default using new logic (Google Tiếng Việt prioritized)
            const defaultVoice = speechService.findBestVoice({ lang: 'vi-VN' });
            if (defaultVoice) {
                setVoiceSettings(prev => ({ ...prev, voiceURI: defaultVoice.voiceURI }));
            }
        }
    };

    const updateVoiceSetting = (field: keyof VoiceSettings, value: any) => {
        const newSettings = { ...voiceSettings, [field]: value };
        setVoiceSettings(newSettings);
        localStorage.setItem('dh_voice_settings', JSON.stringify(newSettings));
    };

    const testVoice = () => {
        speechService.speak("Hế lô! Nana đây. Giọng tớ nghe ổn không nè? Mình là người Hà Nội đấy nhé!", voiceSettings);
    };

    const checkAndSaveKey = async () => {
        if (!apiKey.trim()) return;

        setIsCheckingKey(true);
        setKeyStatus('unknown');

        geminiService.updateApiKey(apiKey);

        const isValid = await geminiService.validateKey();
        setKeyStatus(isValid ? 'valid' : 'invalid');
        setIsCheckingKey(false);

        if (isValid) {
            showToast("✅ Tuyệt vời! Bạn đã kích hoạt thành công Nana AI.");
            localStorage.setItem('dh_gemini_api_key', apiKey);

            // Automatically sync key to Cloud if User is Logged In
            if (profile.uid) {
                try {
                    await firebaseService.updateUserApiKey(profile.uid, apiKey);
                    showToast("Đã đồng bộ Key lên Cloud!");
                } catch (e) {
                    console.warn("Failed to sync key to cloud", e);
                }
            }
            setIsEditingKey(false);
        } else {
            showToast("API Key không hoạt động. Vui lòng kiểm tra lại.");
        }
    };

    const handleRemoveKey = async () => {
        if (window.confirm("Bạn có chắc muốn xóa API Key này không? Nana sẽ không thể trả lời bạn nữa.")) {
            geminiService.removeApiKey();
            setApiKey('');
            setKeyStatus('unknown');
            setIsEditingKey(false);

            if (profile.uid) {
                try {
                    await firebaseService.removeUserApiKey(profile.uid);
                } catch (e) {
                    console.error(e);
                }
            }
            showToast("Đã xóa API Key.");
        }
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const calculateStorage = () => {
        let total = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key) && key.startsWith('dh_')) {
                total += ((localStorage[key].length + key.length) * 2);
            }
        }
        setStorageStats({
            used: total,
            total: 5 * 1024 * 1024,
            percent: Math.min(100, (total / (5 * 1024 * 1024)) * 100)
        });
    };

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
                showToast(`Khôi phục ${count} mục thành công!`);
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                alert("File không hợp lệ.");
            }
        };
        reader.readAsText(file);
    };

    const handleFactoryReset = () => {
        if (window.confirm('⚠️ CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ dữ liệu trên thiết bị này. Bạn có chắc chắn không?')) {
            localStorage.clear();
            showToast('Đang reset hệ thống...');
            setTimeout(() => window.location.reload(), 1000);
        }
    };

    // Helper to identify preferred Northern voices
    const isRecommendedVoice = (voice: SpeechSynthesisVoice) => {
        return voice.name.includes('Google Tiếng Việt') ||
            voice.name.includes('Google Vietnamese') ||
            voice.name.includes('Microsoft HoaiMy') ||
            voice.name.includes('Linh');
    };

    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm md:text-base ${activeTab === id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm border border-blue-100 dark:border-blue-800' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'}`}
        >
            <span className="text-xl">{icon}</span>
            {label}
        </button>
    );

    return (
        <ErrorBoundary>
            <div className="max-w-6xl mx-auto pb-20 animate-fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                    <span>⚙️</span> Cài Đặt & Hệ Thống
                </h1>

                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="w-full lg:w-72 shrink-0 space-y-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl border border-gray-200 dark:border-gray-600 overflow-hidden">
                                {profile.avatar.startsWith('http') ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : profile.avatar}
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-gray-800 dark:text-white truncate">{profile.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile.email || 'Chế độ Khách'}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-2">
                            <TabButton id="preferences" label="Giao diện & Tiện ích" icon="🎨" />
                            <TabButton id="voice" label="Giọng nói & Giao tiếp" icon="🎙️" />
                            <TabButton id="account" label="Tài khoản" icon="👤" />
                            <TabButton id="data" label="Quản lý Dữ liệu" icon="💾" />
                            <TabButton id="help" label="Trợ giúp" icon="❓" />
                        </div>
                    </div>

                    <div className="flex-1">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 min-h-[600px]">

                            {activeTab === 'preferences' && (
                                <div className="space-y-10 animate-fade-in">
                                    <section>
                                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Giao diện & Trải nghiệm</h2>
                                        <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700 rounded-xl p-5 flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-white text-sm">Chế độ Hiển thị</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tùy chỉnh giao diện Sáng hoặc Tối</p>
                                            </div>
                                            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                                <button onClick={() => toggleTheme('light')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${theme === 'light' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}>☀️ Sáng</button>
                                                <button onClick={() => toggleTheme('dark')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${theme === 'dark' ? 'bg-gray-700 text-white' : 'text-gray-500 dark:text-gray-400'}`}>🌙 Tối</button>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <div className="flex items-center gap-2 mb-4">
                                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Cài đặt Trợ lý Ảo (Nana AI)</h2>
                                            {keyStatus === 'valid' && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">Đang hoạt động</span>}
                                        </div>

                                        {isAdmin ? (
                                            // --- ADMIN VIEW ---
                                            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl p-6">
                                                <div className="mb-0">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-200 block">System-wide Gemini API Key (Admin)</label>
                                                        {keyStatus === 'valid' && !isEditingKey && (
                                                            <button onClick={() => setIsEditingKey(true)} className="text-xs text-blue-600 hover:underline font-bold">Chỉnh sửa</button>
                                                        )}
                                                    </div>

                                                    {keyStatus === 'valid' && !isEditingKey ? (
                                                        <div className="flex items-center gap-3 bg-white dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600">
                                                            <div className="flex-1 font-mono text-sm text-gray-600 dark:text-gray-300 tracking-widest">
                                                                {apiKey.substring(0, 8)}******************
                                                            </div>
                                                            <button onClick={handleRemoveKey} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500 text-sm" title="Xóa Key">🗑️</button>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <div className="relative">
                                                                <input
                                                                    type={showKey ? "text" : "password"}
                                                                    value={apiKey}
                                                                    onChange={(e) => setApiKey(e.target.value)}
                                                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-white transition-colors"
                                                                    placeholder="Paste your System API Key here..."
                                                                />
                                                                <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                                    {showKey ? '🙈' : '👁️'}
                                                                </button>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={checkAndSaveKey}
                                                                    disabled={isCheckingKey || !apiKey}
                                                                    className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm flex justify-center items-center gap-2 ${keyStatus === 'valid' && isEditingKey ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'}`}
                                                                >
                                                                    {isCheckingKey ? <span className="animate-spin">↻</span> : 'Lưu System Key'}
                                                                </button>
                                                                {isEditingKey && (
                                                                    <button onClick={() => { setIsEditingKey(false); setApiKey(localStorage.getItem('dh_gemini_api_key') || ''); }} className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-sm">Hủy</button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-gray-500 mt-2">* Key này sẽ được dùng cho toàn bộ hệ thống.</p>
                                                </div>
                                            </div>
                                        ) : !isAuthorized ? (
                                            // --- UNAUTHORIZED USER VIEW (LOCKED) ---
                                            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 flex flex-col items-center text-center animate-fade-in">
                                                <div className="text-5xl mb-4">🔒</div>
                                                <h3 className="text-xl font-bold text-yellow-800 mb-2">Tính năng AI đang khóa</h3>
                                                <p className="text-sm text-yellow-700 mb-6 max-w-md">
                                                    Vui lòng liên hệ Admin để mở khóa tính năng Trợ lý ảo Nana (Luyện nói, Chấm bài) và Lưu trữ đám mây.
                                                </p>
                                                <a
                                                    href="https://zalo.me/0343019101"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-bold shadow-lg transform transition-all hover:scale-105 flex items-center gap-2"
                                                >
                                                    <span>💬</span> Liên hệ Zalo: 0343019101
                                                </a>
                                            </div>
                                        ) : (
                                            // --- AUTHORIZED USER VIEW (GUIDE + INPUT) ---
                                            <div className="space-y-6 animate-fade-in">
                                                {keyStatus !== 'valid' || isEditingKey ? (
                                                    <>
                                                        {/* Step-by-Step Guide */}
                                                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-6">
                                                            <h3 className="font-bold text-blue-800 dark:text-blue-300 text-lg mb-4 flex items-center gap-2">
                                                                <span>🔑</span> Hướng dẫn lấy Key trong 30 giây
                                                            </h3>
                                                            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-blue-200 text-blue-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">1</span>
                                                                    <p>
                                                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">Bấm vào đây</a> để mở trang Google AI Studio.
                                                                    </p>
                                                                </div>
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-blue-200 text-blue-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">2</span>
                                                                    <p>Đăng nhập bằng Gmail của bạn ➝ Bấm nút xanh <b>[Create API key]</b>.</p>
                                                                </div>
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-blue-200 text-blue-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">3</span>
                                                                    <p>Chọn <b>[Create API key in new project]</b> ➝ Chờ một chút rồi bấm <b>[Copy]</b>.</p>
                                                                </div>
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-blue-200 text-blue-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">4</span>
                                                                    <p>Quay lại đây và dán vào ô bên dưới ⬇️</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Input Area */}
                                                        <div>
                                                            <div className="relative flex flex-col sm:flex-row gap-2">
                                                                <div className="relative flex-1">
                                                                    <input
                                                                        type="text"
                                                                        value={apiKey}
                                                                        onChange={(e) => setApiKey(e.target.value)}
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 dark:text-white transition-colors font-mono"
                                                                        placeholder="Dán mã key bắt đầu bằng AIza... vào đây"
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={checkAndSaveKey}
                                                                        disabled={isCheckingKey || apiKey.length < 20}
                                                                        className={`px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${keyStatus === 'valid' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}
                                                                    >
                                                                        {isCheckingKey ? <span className="animate-spin">↻</span> : 'Lưu & Đồng bộ'}
                                                                    </button>
                                                                    {isEditingKey && (
                                                                        <button onClick={() => { setIsEditingKey(false); setApiKey(localStorage.getItem('dh_gemini_api_key') || ''); }} className="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-sm">Hủy</button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p className="text-xs text-gray-400 mt-2 ml-1">
                                                                * Key của bạn được lưu an toàn trên thiết bị và đồng bộ với tài khoản Google của riêng bạn.
                                                            </p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    // View Mode
                                                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
                                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                                            <div>
                                                                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">API Key cá nhân</h4>
                                                                <div className="font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg text-sm tracking-wider">
                                                                    {apiKey.substring(0, 8)}******************
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => setIsEditingKey(true)} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 rounded-xl font-bold text-sm transition-colors flex items-center gap-1">
                                                                    <span>✏️</span> Sửa
                                                                </button>
                                                                <button onClick={handleRemoveKey} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-xl font-bold text-sm transition-colors flex items-center gap-1">
                                                                    <span>🗑️</span> Xóa
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-green-600 mt-3 flex items-center gap-1 font-medium">
                                                            <span className="w-2 h-2 bg-green-500 rounded-full"></span> Đang hoạt động
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}

                            {activeTab === 'voice' && (
                                <div className="space-y-8 animate-fade-in">
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">Cài đặt Giọng nói & Giao tiếp</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                        Tùy chỉnh giọng đọc của Nana trong phần Chat và Luyện nói.
                                    </p>

                                    <div className="grid gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Chọn Giọng Đọc (Browser TTS)</label>
                                            <select
                                                value={voiceSettings.voiceURI}
                                                onChange={(e) => updateVoiceSetting('voiceURI', e.target.value)}
                                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                {availableVoices.length === 0 && <option value="">Đang tải giọng đọc...</option>}
                                                {availableVoices.map(v => (
                                                    <option key={v.voiceURI} value={v.voiceURI}>
                                                        {v.name} ({v.lang})
                                                        {v.default ? ' (Mặc định)' : ''}
                                                        {isRecommendedVoice(v) ? ' ⭐ Khuyên dùng / Nữ Bắc' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1.5">
                                                * Nana nói chuẩn giọng Nữ miền Bắc với "Google Tiếng Việt" hoặc "Microsoft HoaiMy".
                                            </p>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Phong cách (Style)</label>
                                            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                                                <button
                                                    onClick={() => updateVoiceSetting('style', 'formal')}
                                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!voiceSettings.style || voiceSettings.style === 'formal' ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500'}`}
                                                >
                                                    👔 Nghiêm túc
                                                </button>
                                                <button
                                                    onClick={() => updateVoiceSetting('style', 'casual')}
                                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${voiceSettings.style === 'casual' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-gray-500'}`}
                                                >
                                                    😎 Vui vẻ (Casual)
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2 text-center">Chế độ Vui vẻ sẽ nói nhanh hơn và biểu cảm hơn.</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Tốc độ (Speed)</label>
                                                    <span className="text-xs font-bold text-blue-600">{voiceSettings.rate}x</span>
                                                </div>
                                                <input
                                                    type="range" min="0.5" max="2" step="0.1"
                                                    value={voiceSettings.rate}
                                                    onChange={(e) => updateVoiceSetting('rate', parseFloat(e.target.value))}
                                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                                />
                                            </div>

                                            <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Cao độ (Pitch)</label>
                                                    <span className="text-xs font-bold text-blue-600">{voiceSettings.pitch}</span>
                                                </div>
                                                <input
                                                    type="range" min="0.5" max="2" step="0.1"
                                                    value={voiceSettings.pitch}
                                                    onChange={(e) => updateVoiceSetting('pitch', parseFloat(e.target.value))}
                                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                                            <div>
                                                <h4 className="font-bold text-sm text-gray-800 dark:text-white">Tự động đọc tin nhắn trả lời</h4>
                                                <p className="text-xs text-gray-500 mt-1">Nana sẽ tự động đọc to câu trả lời trong Chat.</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={voiceSettings.autoRead}
                                                    onChange={(e) => updateVoiceSetting('autoRead', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>

                                        <div className="flex justify-end">
                                            <button onClick={testVoice} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2">
                                                <span>🔊</span> Nghe thử giọng
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'account' && (
                                <div className="space-y-8 animate-fade-in">
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">Thông tin Tài khoản</h2>

                                    {!profile.email ? (
                                        <div className="bg-white border border-gray-200 dark:border-gray-700 p-8 rounded-2xl text-center shadow-sm max-w-md mx-auto">
                                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">👤</div>
                                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Bạn đang dùng chế độ Khách</h3>
                                            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                                                Dữ liệu chỉ được lưu trên thiết bị này. Hãy đăng nhập ở góc trên phải màn hình để bảo vệ dữ liệu.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 p-6 rounded-2xl">
                                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                                <div className="relative">
                                                    <img src={profile.avatar} alt="Avatar" className="w-20 h-20 rounded-full border-4 border-white dark:border-gray-700 shadow-md" />
                                                    <div className={`absolute bottom-0 right-0 w-5 h-5 border-2 border-white rounded-full ${isAuthorized ? 'bg-green-500' : 'bg-orange-500'}`} title={isAuthorized ? 'Activated' : 'Pending'}></div>
                                                </div>
                                                <div className="text-center sm:text-left flex-1">
                                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">{profile.name}</h3>
                                                        {isAdmin && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold shadow-sm">ADMIN</span>}
                                                    </div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">{profile.email}</p>

                                                    <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
                                                        {isAuthorized ? (
                                                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold flex items-center gap-1">
                                                                <span>☁️</span> Trạng thái: {isAdmin ? 'Đã kích hoạt (ADMIN)' : 'Đã kích hoạt'}
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold flex items-center gap-1">
                                                                <span>⚠️</span> Chưa kích hoạt
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {!isAuthorized && !isAdmin && (
                                                <div className="mt-6 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-start gap-3">
                                                    <span className="text-2xl">⚠️</span>
                                                    <div>
                                                        <h4 className="font-bold text-orange-800 dark:text-orange-300 text-sm">Tài khoản chưa được kích hoạt</h4>
                                                        <p className="text-xs text-orange-700 dark:text-orange-400 mt-1 leading-relaxed">
                                                            Để mở khóa tính năng AI và Lưu trữ đám mây, vui lòng liên hệ Admin qua Zalo.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'data' && (
                                <div className="space-y-8 animate-fade-in">
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Quản lý Dữ liệu</h2>

                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
                                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Dung lượng sử dụng trên thiết bị</p>
                                        <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-1">
                                            <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${storageStats.percent}%` }}></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-gray-400">
                                            <span>{(storageStats.used / 1024).toFixed(1)} KB</span>
                                            <span>Giới hạn ~5 MB</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div onClick={handleExportData} className="p-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 cursor-pointer transition-all text-center group hover:border-blue-400">
                                            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-3 group-hover:scale-110 transition-transform">📤</div>
                                            <h3 className="font-bold text-blue-800 text-sm">Xuất dữ liệu (Backup)</h3>
                                            <p className="text-xs text-blue-600/70 mt-1">Tải về file .json chứa toàn bộ dữ liệu cá nhân.</p>
                                        </div>

                                        <div className="p-6 rounded-2xl border-2 border-dashed border-green-200 bg-green-50/50 hover:bg-green-50 cursor-pointer relative text-center group hover:border-green-400">
                                            <input type="file" accept=".json" className="absolute inset-0 opacity-0 cursor-pointer z-10" ref={fileInputRef} onChange={handleImportData} />
                                            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-3 group-hover:scale-110 transition-transform">📥</div>
                                            <h3 className="font-bold text-green-800 text-sm">Nhập dữ liệu (Restore)</h3>
                                            <p className="text-xs text-green-600/70 mt-1">Khôi phục dữ liệu từ file .json đã sao lưu.</p>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                                        <h3 className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2 mb-2">⚠️ Vùng nguy hiểm</h3>
                                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <p className="text-xs text-red-600/80 dark:text-red-400/70 leading-relaxed">
                                                Hành động này sẽ xóa toàn bộ dữ liệu <b>trên trình duyệt này</b> và đưa ứng dụng về trạng thái ban đầu.
                                            </p>
                                            <button onClick={handleFactoryReset} className="px-4 py-2 bg-white dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg text-xs font-bold shadow-sm whitespace-nowrap">
                                                Reset Ứng Dụng
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'help' && (
                                <div className="space-y-6 animate-fade-in">
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Trợ giúp</h2>
                                    <div className="grid gap-4">
                                        {[
                                            { q: 'Google Calendar không đồng bộ?', a: 'Đảm bảo bạn đã đăng nhập Google và cấp quyền truy cập lịch. Kiểm tra trạng thái trong tab "Tài khoản".' },
                                            { q: 'Dữ liệu của tôi lưu ở đâu?', a: 'Mặc định lưu trên trình duyệt (LocalStorage). Nếu được kích hoạt, dữ liệu sẽ đồng bộ lên Firebase Cloud.' },
                                            { q: 'Làm sao để kích hoạt AI?', a: `Vui lòng liên hệ Admin để được cấp quyền truy cập.` },
                                            { q: 'Chế độ Khách có mất dữ liệu không?', a: 'Có, nếu bạn xóa cache trình duyệt. Hãy dùng tính năng "Xuất dữ liệu" thường xuyên.' }
                                        ].map((item, i) => (
                                            <div key={i} className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                                <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2">
                                                    <span className="text-blue-500">Q.</span> {item.q}
                                                </h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-6 leading-relaxed">A: {item.a}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {toast && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl z-[60] animate-bounce-up">
                        <span className="font-bold text-sm flex items-center gap-2">{toast}</span>
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
};
