import React, { useState, useEffect, useRef } from 'react';
import { useTheme, useLanguage } from '../App';
import { UserProfile } from '../types';
import { firebaseService, FirestoreUser } from '../services/firebase';
import { geminiService } from '../services/gemini';
import { speechService, VoiceSettings, DEFAULT_VOICE_SETTINGS } from '../services/speech';
import firebase from 'firebase/compat/app';

const DATA_KEYS = [
    'dh_course_tree_v2', 'dh_completed_lessons',
    'dh_vocab_folders', 'dh_vocab_terms',
    'dh_habits', 'dh_events', 'dh_tasks',
    'dh_fin_trans', 'dh_fin_budgets', 'dh_fin_goals', 'dh_fin_debts',
    'dh_user_profile', 'dh_theme', 'dh_gemini_api_key', 'dh_chat_history',
    'dh_voice_settings', 'dh_lang', 'dh_chat_sessions', 'dh_speaking_sessions'
];

const FAQ_DATA = [
    {
        category: "Tài khoản & Quyền hạn",
        items: [
            { id: 'acc1', q: 'Standard và VIP khác gì nhau?', a: 'Standard sử dụng OpenAI (GPT-4o-mini), phù hợp chat cơ bản. VIP dùng Gemini 2.5 Pro, hỗ trợ Live Voice thời gian thực, phân tích tài chính sâu và xử lý hình ảnh.' },
            { id: 'acc2', q: 'Làm sao để kích hoạt quyền AI?', a: 'Liên hệ Admin qua Zalo để được cấp quyền. Sau đó nhập API Key trong tab "Giao diện & AI".' },
            { id: 'acc3', q: 'Chế độ Khách (Guest) là gì?', a: 'Cho phép dùng app không cần đăng nhập. Dữ liệu chỉ lưu trên trình duyệt này, sẽ mất nếu xóa cache.' }
        ]
    },
    {
        category: "Dữ liệu & Riêng tư",
        items: [
            { id: 'data1', q: 'Dữ liệu lưu ở đâu?', a: 'Mặc định lưu tại LocalStorage trình duyệt (mã hóa). Nếu đăng nhập + có quyền Storage, dữ liệu đồng bộ lên Firebase Cloud.' },
            { id: 'data2', q: 'Làm sao để chuyển dữ liệu sang máy khác?', a: 'Vào tab "Quản lý dữ liệu" -> "Backup Dữ liệu" để tải file JSON. Sang máy mới chọn "Khôi phục".' }
        ]
    },
    {
        category: "Tính năng",
        items: [
            { id: 'feat1', q: 'Live Voice là gì?', a: 'Đàm thoại tiếng Anh thời gian thực với AI (giọng Nana). Yêu cầu gói VIP và đeo tai nghe để tránh vọng âm.' },
            { id: 'feat2', q: 'Pomodoro ở đâu?', a: 'Widget quả cà chua 🍅 luôn nổi ở góc phải dưới màn hình. Bấm vào để mở đồng hồ tập trung.' }
        ]
    }
];

interface ExtendedUserProfile extends UserProfile {
    aiTier?: 'standard' | 'vip';
    isActiveAI?: boolean;
    jobTitle?: string;
    phoneNumber?: string;
    location?: string;
    bio?: string;
    skills?: string[];
    website?: string;
}

interface StorageBreakdown {
    vocab: number;
    finance: number;
    learning: number;
    system: number;
    total: number;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

interface ErrorBoundaryProps {
    children?: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
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
    const { language, setLanguage, t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'account' | 'preferences' | 'voice' | 'data' | 'help'>('account');

    // User State
    const [profile, setProfile] = useState<ExtendedUserProfile>({ name: 'Khách', avatar: '👨‍💻', email: '' });
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [adminZalo, setAdminZalo] = useState('0343019101');

    // Profile Edit State
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editForm, setEditForm] = useState<Partial<ExtendedUserProfile>>({});
    const [skillInput, setSkillInput] = useState('');

    // AI Key State
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isCheckingKey, setIsCheckingKey] = useState(false);
    const [keyStatus, setKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
    const [isEditingKey, setIsEditingKey] = useState(false);

    // Voice Settings State
    const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [testText, setTestText] = useState("Xin chào! Mình là Nana, trợ lý học tập của bạn. Bạn thấy giọng mình thế nào?");
    const [isSpeakingTest, setIsSpeakingTest] = useState(false);

    // System State
    const [storageStats, setStorageStats] = useState<{ used: number, total: number, percent: number, breakdown: StorageBreakdown }>({
        used: 0, total: 5242880, percent: 0,
        breakdown: { vocab: 0, finance: 0, learning: 0, system: 0, total: 0 }
    });
    const [toast, setToast] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Help Tab State
    const [helpSearch, setHelpSearch] = useState('');
    const [openFaqIndex, setOpenFaqIndex] = useState<string | null>(null);
    const [aiHelpInput, setAiHelpInput] = useState('');
    const [aiHelpAnswer, setAiHelpAnswer] = useState('');
    const [isAskingAi, setIsAskingAi] = useState(false);

    useEffect(() => {
        const syncProfile = async (user: firebase.User | null) => {
            if (user) {
                let firestoreData: any = {};
                try {
                    const doc = await firebaseService.db.collection("users").doc(user.uid).get();
                    if (doc.exists) {
                        firestoreData = doc.data() || {};
                    }
                } catch (e) { }

                const p: ExtendedUserProfile = {
                    name: user.displayName || 'User',
                    email: user.email || '',
                    avatar: user.photoURL || '👨‍💻',
                    uid: user.uid,
                    aiTier: firestoreData.aiTier,
                    isActiveAI: firestoreData.isActiveAI,
                    jobTitle: firestoreData.jobTitle || '',
                    phoneNumber: firestoreData.phoneNumber || '',
                    location: firestoreData.location || '',
                    bio: firestoreData.bio || '',
                    skills: firestoreData.skills || [],
                    website: firestoreData.website || ''
                };
                setProfile(p);
                setEditForm(p); // Initialize edit form

                const adminCheck = user.email === firebaseService.ADMIN_EMAIL;
                setIsAdmin(adminCheck);

                const authorized = await firebaseService.isUserAuthorized();
                setIsAuthorized(authorized);

                let activeKey = localStorage.getItem('dh_gemini_api_key') || '';
                const cloudKey = await firebaseService.getMyAssignedApiKey(user.uid);

                if (cloudKey) activeKey = cloudKey;

                let isValidFormat = true;
                if (activeKey) {
                    const isOpenAI = activeKey.startsWith('sk-');
                    if (p.aiTier === 'vip' && isOpenAI) isValidFormat = false;
                    if (p.aiTier === 'standard' && !isOpenAI) isValidFormat = false;
                }

                if (activeKey && isValidFormat) {
                    geminiService.updateApiKey(activeKey);
                    setApiKey(activeKey);
                    setKeyStatus('valid');
                    localStorage.setItem('dh_gemini_api_key', activeKey);
                } else {
                    setApiKey('');
                    setKeyStatus('unknown');
                    geminiService.removeApiKey();
                }

                localStorage.setItem('dh_user_profile', JSON.stringify(p));
            } else {
                const savedProfile = localStorage.getItem('dh_user_profile');
                if (savedProfile) {
                    try {
                        const p = JSON.parse(savedProfile);
                        setProfile(p);
                        setEditForm(p);
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

        if (firebaseService.auth.currentUser) {
            syncProfile(firebaseService.auth.currentUser);
        }

        const unsub = firebaseService.auth.onAuthStateChanged(async (user) => {
            syncProfile(user);
        });

        firebaseService.getSystemConfig().then(config => {
            if (config && config.zaloNumber) {
                setAdminZalo(config.zaloNumber);
            }
        });

        calculateStorage();
        loadVoiceSettings();

        return () => {
            speechService.cancel();
            unsub();
        };
    }, []);

    const loadVoiceSettings = async () => {
        const voices = await speechService.getVoices();
        // Sort voices: Vietnamese first, then Google/Microsoft high quality
        const sortedVoices = voices.sort((a, b) => {
            const aVi = a.lang.includes('vi');
            const bVi = b.lang.includes('vi');
            if (aVi && !bVi) return -1;
            if (!aVi && bVi) return 1;
            return a.name.localeCompare(b.name);
        });
        setAvailableVoices(sortedVoices);

        const saved = localStorage.getItem('dh_voice_settings');
        if (saved) {
            setVoiceSettings(JSON.parse(saved));
        } else {
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
        if (isSpeakingTest) {
            speechService.cancel();
            setIsSpeakingTest(false);
        } else {
            setIsSpeakingTest(true);
            // Use current state for immediate feedback without saving needed
            speechService.speak(testText, voiceSettings);
            // Reset state after approximate duration (simple timeout or callback could be improved in speechService)
            setTimeout(() => setIsSpeakingTest(false), 5000);
        }
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

    // --- Profile Handlers ---
    const handleSaveProfile = async () => {
        if (!profile.uid) {
            alert("Vui lòng đăng nhập để lưu hồ sơ.");
            return;
        }
        try {
            const updates = {
                name: editForm.name,
                jobTitle: editForm.jobTitle,
                phoneNumber: editForm.phoneNumber,
                location: editForm.location,
                website: editForm.website,
                bio: editForm.bio,
                skills: editForm.skills
            };
            await firebaseService.updateUserProfile(profile.uid, updates);
            setProfile(prev => ({ ...prev, ...updates }));
            setIsEditingProfile(false);
            showToast("Cập nhật hồ sơ thành công!");
        } catch (e: any) {
            console.error(e);
            alert("Lỗi cập nhật hồ sơ: " + e.message);
        }
    };

    const addSkill = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && skillInput.trim()) {
            e.preventDefault();
            const newSkills = [...(editForm.skills || []), skillInput.trim()];
            setEditForm({ ...editForm, skills: newSkills });
            setSkillInput('');
        }
    };

    const removeSkill = (skill: string) => {
        const newSkills = (editForm.skills || []).filter(s => s !== skill);
        setEditForm({ ...editForm, skills: newSkills });
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const calculateStorage = () => {
        let breakdown: StorageBreakdown = { vocab: 0, finance: 0, learning: 0, system: 0, total: 0 };
        let total = 0;

        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                const size = ((localStorage[key].length + key.length) * 2);
                total += size;

                if (key.includes('dh_vocab')) breakdown.vocab += size;
                else if (key.includes('dh_fin_')) breakdown.finance += size;
                else if (key.includes('dh_course') || key.includes('dh_completed')) breakdown.learning += size;
                else breakdown.system += size; // Includes chat, settings, user profile, etc.
            }
        }

        breakdown.total = total;

        setStorageStats({
            used: total,
            total: 5 * 1024 * 1024,
            percent: Math.min(100, (total / (5 * 1024 * 1024)) * 100),
            breakdown
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
                calculateStorage();
                showToast(`Khôi phục ${count} mục thành công!`);
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                alert("File không hợp lệ.");
            }
        };
        reader.readAsText(file);
    };

    const handleClearCache = () => {
        if (window.confirm('Bạn có chắc muốn xóa lịch sử Chat và dữ liệu tạm thời? Dữ liệu học tập và tài chính sẽ được giữ nguyên.')) {
            localStorage.removeItem('dh_chat_history');
            localStorage.removeItem('dh_chat_sessions');
            calculateStorage();
            showToast('Đã dọn dẹp bộ nhớ đệm! 🧹');
        }
    };

    const handleFactoryReset = () => {
        if (window.confirm('⚠️ CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ dữ liệu trên thiết bị này. Bạn có chắc chắn không?')) {
            localStorage.clear();
            showToast('Đang reset hệ thống...');
            setTimeout(() => window.location.reload(), 1000);
        }
    };

    const handleAskAiHelp = async () => {
        if (!aiHelpInput.trim()) return;
        setIsAskingAi(true);
        setAiHelpAnswer('');
        try {
            // Check Key first
            if (!apiKey && !profile.isActiveAI) {
                setAiHelpAnswer("Bạn cần nhập API Key (Standard hoặc VIP) để sử dụng tính năng này.");
                setIsAskingAi(false);
                return;
            }

            const systemInstr = `Bạn là trợ lý kỹ thuật cho "DangHoang Ebook App". Trả lời ngắn gọn, vui vẻ (style Nana). Giúp user giải quyết vấn đề. Nếu không biết, bảo họ liên hệ Admin Zalo: ${adminZalo}.`;

            const stream = geminiService.chatStream([], aiHelpInput, systemInstr);
            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk.text || '';
                setAiHelpAnswer(fullText);
            }
        } catch (e: any) {
            setAiHelpAnswer("Lỗi kết nối AI: " + e.message);
        } finally {
            setIsAskingAi(false);
        }
    };

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

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const filteredFaq = React.useMemo(() => {
        if (!helpSearch) return FAQ_DATA;
        const lower = helpSearch.toLowerCase();
        return FAQ_DATA.map(cat => ({
            ...cat,
            items: cat.items.filter(item => item.q.toLowerCase().includes(lower) || item.a.toLowerCase().includes(lower))
        })).filter(cat => cat.items.length > 0);
    }, [helpSearch]);

    return (
        <ErrorBoundary>
            <div className="max-w-6xl mx-auto pb-20 animate-fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                    <span>⚙️</span> {t('settings.title')}
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
                            <TabButton id="account" label={t('settings.account')} icon="👤" />
                            <TabButton id="preferences" label={t('settings.interface')} icon="🎨" />
                            <TabButton id="voice" label={t('settings.voice')} icon="🎙️" />
                            <TabButton id="data" label={t('settings.data')} icon="💾" />
                            <TabButton id="help" label={t('settings.help')} icon="❓" />
                        </div>
                    </div>

                    <div className="flex-1">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 min-h-[600px]">

                            {activeTab === 'preferences' && (
                                <div className="space-y-10 animate-fade-in">
                                    <section>
                                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">{t('settings.interface')}</h2>

                                        {/* Theme Switcher */}
                                        <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700 rounded-xl p-5 flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-white text-sm">{t('settings.theme')}</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.theme.desc')}</p>
                                            </div>
                                            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                                <button onClick={() => toggleTheme('light')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${theme === 'light' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}>☀️ {t('settings.light')}</button>
                                                <button onClick={() => toggleTheme('dark')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${theme === 'dark' ? 'bg-gray-700 text-white' : 'text-gray-500 dark:text-gray-400'}`}>🌙 {t('settings.dark')}</button>
                                            </div>
                                        </div>

                                        {/* Language Switcher */}
                                        <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700 rounded-xl p-5 flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-white text-sm">{t('settings.lang')}</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.lang.desc')}</p>
                                            </div>
                                            <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                                <button onClick={() => setLanguage('vi')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${language === 'vi' ? 'bg-red-50 text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>🇻🇳 Tiếng Việt</button>
                                                <button onClick={() => setLanguage('en')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${language === 'en' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}>🇬🇧 English</button>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <div className="flex items-center gap-2 mb-4">
                                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">{t('settings.ai')}</h2>
                                            {keyStatus === 'valid' && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">Active</span>}
                                        </div>

                                        {isAdmin ? (
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
                                                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 dark:text-white transition-colors font-mono"
                                                                    placeholder={profile.aiTier === 'vip' ? "Dán Gemini Key (AIza...)" : "Dán OpenAI Key (sk-...)"}
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
                                            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 flex flex-col items-center text-center animate-fade-in">
                                                <div className="text-5xl mb-4">🔒</div>
                                                <h3 className="text-xl font-bold text-yellow-800 mb-2">Tính năng AI đang chờ cấp quyền</h3>
                                                <p className="text-sm text-yellow-700 mb-6 max-w-md">
                                                    Vui lòng liên hệ Admin để kích hoạt quyền sử dụng AI và mở khóa tính năng tự nhập API Key.
                                                </p>
                                                <a
                                                    href={`https://zalo.me/${adminZalo}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-bold shadow-lg transform transition-all hover:scale-105 flex items-center gap-2"
                                                >
                                                    <span>💬</span> Liên hệ Admin (Zalo)
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="space-y-6 animate-fade-in">
                                                {keyStatus !== 'valid' || isEditingKey ? (
                                                    <>
                                                        <div className={`${profile.aiTier === 'vip' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-100' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100'} border dark:border-gray-800 rounded-2xl p-6`}>
                                                            <h3 className={`font-bold ${profile.aiTier === 'vip' ? 'text-purple-800 dark:text-purple-300' : 'text-blue-800 dark:text-blue-300'} text-lg mb-4 flex items-center gap-2`}>
                                                                <span>🤖</span> Hướng dẫn lấy API Key ({profile.aiTier === 'vip' ? 'VIP: Gemini' : 'Standard: OpenAI'})
                                                            </h3>

                                                            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-gray-200 text-gray-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">1</span>
                                                                    <p>
                                                                        {profile.aiTier === 'vip' ? (
                                                                            <>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-purple-600 font-bold hover:underline">Google AI Studio</a>.</>
                                                                        ) : (
                                                                            <>Truy cập <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">OpenAI Platform</a>.</>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-gray-200 text-gray-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">2</span>
                                                                    <p>{profile.aiTier === 'vip' ? 'Bấm [Create API Key] ➝ Chọn project Google Cloud.' : 'Đăng nhập ➝ Bấm [Create new secret key].'}</p>
                                                                </div>
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-gray-200 text-gray-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">3</span>
                                                                    <p>Copy mã Key bắt đầu bằng <code>{profile.aiTier === 'vip' ? 'AIza...' : 'sk-...'}</code>.</p>
                                                                </div>
                                                                <div className="flex gap-3 items-start">
                                                                    <span className="bg-gray-200 text-gray-800 font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs">4</span>
                                                                    <p>Dán vào ô bên dưới để kích hoạt {profile.aiTier === 'vip' ? 'đầy đủ tính năng VIP' : 'tính năng Standard'}.</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <div className="relative flex flex-col sm:flex-row gap-2">
                                                                <div className="relative flex-1">
                                                                    <input
                                                                        type="text"
                                                                        value={apiKey}
                                                                        onChange={(e) => setApiKey(e.target.value)}
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 dark:text-white transition-colors font-mono"
                                                                        placeholder={profile.aiTier === 'vip' ? "Dán Gemini Key (AIza...)" : "Dán OpenAI Key (sk-...)"}
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={checkAndSaveKey}
                                                                        disabled={isCheckingKey || apiKey.length < 10}
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
                                                                * Key của bạn được lưu an toàn trên thiết bị và đồng bộ với tài khoản của riêng bạn.
                                                            </p>
                                                        </div>
                                                    </>
                                                ) : (
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
                                                        <div className="flex items-center gap-4 mt-3">
                                                            <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                                                                <span className="w-2 h-2 bg-green-500 rounded-full"></span> Đang hoạt động ({apiKey.startsWith('sk-') ? 'OpenAI' : 'Google Gemini'})
                                                            </p>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${profile.aiTier === 'vip' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                                {profile.aiTier === 'vip' ? 'Tier: VIP' : 'Tier: Standard'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}

                            {activeTab === 'voice' && (
                                <div className="space-y-8 animate-fade-in">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">{t('settings.voice')}</h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Tùy chỉnh giọng đọc và cách tương tác của trợ lý ảo Nana.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Left Col: Settings */}
                                        <div className="space-y-6">
                                            <div className="bg-gray-50 dark:bg-gray-900/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Chọn Giọng Đọc (TTS)</label>
                                                <select
                                                    value={voiceSettings.voiceURI}
                                                    onChange={(e) => updateVoiceSetting('voiceURI', e.target.value)}
                                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                                >
                                                    {availableVoices.length === 0 && <option value="">Đang tải giọng đọc...</option>}
                                                    {availableVoices.map(v => (
                                                        <option key={v.voiceURI} value={v.voiceURI} className={isRecommendedVoice(v) ? 'font-bold text-blue-600' : ''}>
                                                            {isRecommendedVoice(v) ? '⭐ ' : ''}{v.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-gray-400 mt-2 ml-1">* Khuyên dùng: "Microsoft HoaiMy" hoặc "Google Tiếng Việt"</p>
                                            </div>

                                            <div className="space-y-5 bg-white dark:bg-gray-800 p-1">
                                                <div>
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-xs font-bold text-gray-500 uppercase">Tốc độ (Speed)</label>
                                                        <span className="text-xs font-bold text-blue-600">{voiceSettings.rate}x</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0.5" max="2" step="0.1"
                                                        value={voiceSettings.rate}
                                                        onChange={(e) => updateVoiceSetting('rate', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-xs font-bold text-gray-500 uppercase">Cao độ (Pitch)</label>
                                                        <span className="text-xs font-bold text-blue-600">{voiceSettings.pitch}</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0.5" max="2" step="0.1"
                                                        value={voiceSettings.pitch}
                                                        onChange={(e) => updateVoiceSetting('pitch', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-xs font-bold text-gray-500 uppercase">Âm lượng</label>
                                                        <span className="text-xs font-bold text-blue-600">{Math.round(voiceSettings.volume * 100)}%</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0" max="1" step="0.1"
                                                        value={voiceSettings.volume}
                                                        onChange={(e) => updateVoiceSetting('volume', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-2">
                                                <button onClick={() => setVoiceSettings(DEFAULT_VOICE_SETTINGS)} className="text-xs text-gray-400 hover:text-red-500 hover:underline">
                                                    Khôi phục mặc định
                                                </button>
                                            </div>
                                        </div>

                                        {/* Right Col: Test & Preview */}
                                        <div className="flex flex-col gap-6">
                                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800 flex flex-col items-center text-center relative overflow-hidden">
                                                <div className="w-20 h-20 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center text-4xl shadow-sm mb-4 border-4 border-blue-200 dark:border-blue-700 z-10 relative">
                                                    👩‍🚀
                                                    {isSpeakingTest && <div className="absolute inset-0 rounded-full animate-ping bg-blue-400 opacity-30"></div>}
                                                </div>
                                                <h3 className="font-bold text-gray-800 dark:text-white mb-1">Nana AI</h3>
                                                <p className="text-xs text-blue-600 dark:text-blue-300 mb-4">Trợ lý học tập</p>

                                                <div className="w-full bg-white dark:bg-gray-800 p-3 rounded-xl shadow-inner mb-4 border border-gray-200 dark:border-gray-700">
                                                    <textarea
                                                        value={testText}
                                                        onChange={(e) => setTestText(e.target.value)}
                                                        className="w-full bg-transparent outline-none text-sm text-gray-600 dark:text-gray-300 text-center resize-none"
                                                        rows={2}
                                                    />
                                                </div>

                                                <button
                                                    onClick={testVoice}
                                                    className={`px-8 py-3 rounded-full font-bold text-sm shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${isSpeakingTest ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                                >
                                                    {isSpeakingTest ? <span>⏹ Dừng lại</span> : <span>🔊 Nghe thử giọng</span>}
                                                </button>
                                            </div>

                                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between shadow-sm">
                                                <div>
                                                    <h4 className="font-bold text-sm text-gray-800 dark:text-white">Auto-read Chat</h4>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Tự động đọc tin nhắn của Nana</p>
                                                </div>
                                                <button
                                                    onClick={() => updateVoiceSetting('autoRead', !voiceSettings.autoRead)}
                                                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${voiceSettings.autoRead ? 'bg-green-500 justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'}`}
                                                >
                                                    <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'account' && (
                                <div className="space-y-8 animate-fade-in">
                                    {!profile.email ? (
                                        <div className="bg-white border border-gray-200 dark:border-gray-700 p-8 rounded-2xl text-center shadow-sm max-w-md mx-auto">
                                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">👤</div>
                                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Bạn đang dùng chế độ Khách</h3>
                                            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                                                Dữ liệu chỉ được lưu trên thiết bị này. Hãy đăng nhập để đồng bộ và bảo vệ dữ liệu của bạn.
                                            </p>
                                            <button className="px-6 py-2 bg-blue-600 text-white rounded-full font-bold text-sm hover:bg-blue-700 transition-colors shadow-md">
                                                Đăng nhập ngay
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* PROFILE HEADER */}
                                            <div className="relative rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                                                {/* Cover Image */}
                                                <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

                                                <div className="px-6 pb-6">
                                                    <div className="relative flex flex-col md:flex-row items-start md:items-end -mt-12 mb-4 gap-4">
                                                        <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 bg-gray-200 overflow-hidden shadow-lg">
                                                            {profile.avatar.startsWith('http') ? (
                                                                <img src={profile.avatar} className="w-full h-full object-cover" alt="Avatar" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-3xl bg-blue-600 text-white">{profile.avatar}</div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 pt-2 md:pt-0">
                                                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.name}</h2>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{profile.jobTitle || 'Student / Learner'}</p>
                                                        </div>
                                                        <div className="flex gap-2 mt-4 md:mt-0">
                                                            {isAdmin && <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">ADMIN</span>}
                                                            {profile.aiTier === 'vip' && <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">VIP MEMBER</span>}
                                                            <button
                                                                onClick={() => setIsEditingProfile(!isEditingProfile)}
                                                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${isEditingProfile ? 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-md'}`}
                                                            >
                                                                {isEditingProfile ? 'Hủy bỏ' : 'Chỉnh sửa hồ sơ'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* EDIT MODE */}
                                                    {isEditingProfile ? (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700 animate-fade-in">
                                                            <div className="space-y-4">
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Họ và tên</label>
                                                                    <input
                                                                        value={editForm.name || ''}
                                                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Chức danh / Nghề nghiệp</label>
                                                                    <input
                                                                        value={editForm.jobTitle || ''}
                                                                        onChange={e => setEditForm({ ...editForm, jobTitle: e.target.value })}
                                                                        placeholder="VD: Software Engineer"
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số điện thoại</label>
                                                                        <input
                                                                            value={editForm.phoneNumber || ''}
                                                                            onChange={e => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                                                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Khu vực</label>
                                                                        <input
                                                                            value={editForm.location || ''}
                                                                            onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                                                                            placeholder="VD: Hanoi, VN"
                                                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Website / Link</label>
                                                                    <input
                                                                        value={editForm.website || ''}
                                                                        onChange={e => setEditForm({ ...editForm, website: e.target.value })}
                                                                        placeholder="https://..."
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-4">
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Giới thiệu bản thân (Bio)</label>
                                                                    <textarea
                                                                        value={editForm.bio || ''}
                                                                        onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                                                                        rows={4}
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                                                        placeholder="Viết vài dòng về bản thân..."
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kỹ năng (Skills)</label>
                                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                                        {editForm.skills?.map((skill, i) => (
                                                                            <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs flex items-center gap-1">
                                                                                {skill}
                                                                                <button onClick={() => removeSkill(skill)} className="hover:text-blue-900">×</button>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                    <input
                                                                        value={skillInput}
                                                                        onChange={e => setSkillInput(e.target.value)}
                                                                        onKeyDown={addSkill}
                                                                        placeholder="Nhập kỹ năng & nhấn Enter..."
                                                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                    />
                                                                </div>
                                                                <div className="pt-2 flex justify-end">
                                                                    <button onClick={handleSaveProfile} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors">
                                                                        Lưu Thay Đổi
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* VIEW MODE */
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-2">
                                                            {/* Left Col: Contact Info */}
                                                            <div className="md:col-span-1 space-y-6">
                                                                <div>
                                                                    <h4 className="font-bold text-gray-800 dark:text-white text-sm mb-3 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-1">Liên hệ</h4>
                                                                    <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                                                                        <li className="flex items-center gap-3">
                                                                            <span className="text-lg">📧</span> <span className="truncate" title={profile.email}>{profile.email}</span>
                                                                        </li>
                                                                        {profile.phoneNumber && (
                                                                            <li className="flex items-center gap-3">
                                                                                <span className="text-lg">📱</span> <span>{profile.phoneNumber}</span>
                                                                            </li>
                                                                        )}
                                                                        {profile.location && (
                                                                            <li className="flex items-center gap-3">
                                                                                <span className="text-lg">📍</span> <span>{profile.location}</span>
                                                                            </li>
                                                                        )}
                                                                        {profile.website && (
                                                                            <li className="flex items-center gap-3">
                                                                                <span className="text-lg">🌐</span> <a href={profile.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">{profile.website}</a>
                                                                            </li>
                                                                        )}
                                                                    </ul>
                                                                </div>

                                                                <div>
                                                                    <h4 className="font-bold text-gray-800 dark:text-white text-sm mb-3 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-1">Kỹ năng</h4>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {profile.skills && profile.skills.length > 0 ? profile.skills.map((skill, i) => (
                                                                            <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-600">
                                                                                {skill}
                                                                            </span>
                                                                        )) : <span className="text-xs text-gray-400 italic">Chưa cập nhật kỹ năng</span>}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Right Col: Bio */}
                                                            <div className="md:col-span-2">
                                                                <h4 className="font-bold text-gray-800 dark:text-white text-sm mb-3 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-1">Giới thiệu</h4>
                                                                {profile.bio ? (
                                                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                                                                        {profile.bio}
                                                                    </p>
                                                                ) : (
                                                                    <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-6 text-center border border-dashed border-gray-200 dark:border-gray-700">
                                                                        <p className="text-gray-400 text-sm italic mb-2">Chưa có thông tin giới thiệu.</p>
                                                                        <button onClick={() => setIsEditingProfile(true)} className="text-blue-600 text-xs font-bold hover:underline">Thêm giới thiệu ngay</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === 'data' && (
                                <div className="space-y-8 animate-fade-in">
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">{t('settings.data')}</h2>

                                    {/* Cloud Status Card */}
                                    <div className={`p-5 rounded-2xl border flex justify-between items-center ${profile.uid ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                                        <div className="flex gap-4 items-center">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${profile.uid ? 'bg-green-100 dark:bg-green-800' : 'bg-orange-100 dark:bg-orange-800'}`}>
                                                {profile.uid ? '☁️' : '🖥️'}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-sm">{profile.uid ? 'Đã đồng bộ đám mây' : 'Chế độ lưu trữ cục bộ'}</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{profile.uid ? 'Dữ liệu của bạn được sao lưu an toàn trên Firebase.' : 'Dữ liệu chỉ tồn tại trên trình duyệt này. Hãy đăng nhập để bảo vệ.'}</p>
                                            </div>
                                        </div>
                                        {profile.uid && <div className="text-xs font-bold text-green-700 dark:text-green-400 bg-green-200 dark:bg-green-900/50 px-3 py-1 rounded-full">ACTIVE</div>}
                                    </div>

                                    {/* Enhanced Storage Visualization */}
                                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                        <div className="flex justify-between items-end mb-3">
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Dung lượng sử dụng (Local Cache)</p>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatSize(storageStats.used)}</span>
                                                <span className="text-xs text-gray-400"> / 5 MB</span>
                                            </div>
                                        </div>

                                        {/* Segmented Progress Bar */}
                                        <div className="w-full h-4 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700">
                                            <div style={{ width: `${(storageStats.breakdown.vocab / storageStats.total) * 100}%` }} className="h-full bg-blue-500" title="Vocabulary"></div>
                                            <div style={{ width: `${(storageStats.breakdown.finance / storageStats.total) * 100}%` }} className="h-full bg-green-500" title="Finance"></div>
                                            <div style={{ width: `${(storageStats.breakdown.learning / storageStats.total) * 100}%` }} className="h-full bg-purple-500" title="Learning"></div>
                                            <div style={{ width: `${(storageStats.breakdown.system / storageStats.total) * 100}%` }} className="h-full bg-gray-400" title="System/Chat"></div>
                                        </div>

                                        {/* Legend / Detailed Breakdown */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                                <div className="text-xs">
                                                    <p className="font-bold text-gray-700 dark:text-gray-300">Vocab</p>
                                                    <p className="text-gray-500">{formatSize(storageStats.breakdown.vocab)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                <div className="text-xs">
                                                    <p className="font-bold text-gray-700 dark:text-gray-300">Tài chính</p>
                                                    <p className="text-gray-500">{formatSize(storageStats.breakdown.finance)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                                <div className="text-xs">
                                                    <p className="font-bold text-gray-700 dark:text-gray-300">Học tập</p>
                                                    <p className="text-gray-500">{formatSize(storageStats.breakdown.learning)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                                                <div className="text-xs">
                                                    <p className="font-bold text-gray-700 dark:text-gray-300">Chat/System</p>
                                                    <p className="text-gray-500">{formatSize(storageStats.breakdown.system)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div onClick={handleExportData} className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group flex flex-col items-center text-center">
                                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">📤</div>
                                            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Backup Dữ liệu</h3>
                                            <p className="text-xs text-gray-500 mt-1">Xuất file JSON để lưu trữ.</p>
                                        </div>

                                        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-green-400 hover:shadow-md cursor-pointer transition-all group flex flex-col items-center text-center relative">
                                            <input type="file" accept=".json" className="absolute inset-0 opacity-0 cursor-pointer z-10" ref={fileInputRef} onChange={handleImportData} />
                                            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">📥</div>
                                            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Khôi phục (Restore)</h3>
                                            <p className="text-xs text-gray-500 mt-1">Nhập dữ liệu từ file JSON.</p>
                                        </div>

                                        <div onClick={handleClearCache} className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-orange-400 hover:shadow-md cursor-pointer transition-all group flex flex-col items-center text-center">
                                            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition-transform">🧹</div>
                                            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Dọn dẹp Cache</h3>
                                            <p className="text-xs text-gray-500 mt-1">Xóa lịch sử chat để giải phóng {formatSize(storageStats.breakdown.system)}.</p>
                                        </div>
                                    </div>

                                    {/* Danger Zone */}
                                    <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                                        <h3 className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2 mb-3 text-sm">
                                            <span>⚠️</span> Vùng nguy hiểm
                                        </h3>
                                        <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                                            <div>
                                                <p className="font-bold text-red-800 dark:text-red-300 text-sm">Reset Ứng dụng (Factory Reset)</p>
                                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Hành động này sẽ xóa toàn bộ dữ liệu trên trình duyệt này.</p>
                                            </div>
                                            <button onClick={handleFactoryReset} className="px-4 py-2 bg-white dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg text-xs font-bold shadow-sm whitespace-nowrap">
                                                Xóa Tất Cả
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'help' && (
                                <div className="space-y-8 animate-fade-in">
                                    {/* Search & Header */}
                                    <div className="text-center space-y-4 max-w-2xl mx-auto">
                                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Trung tâm Trợ giúp</h2>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Tìm kiếm câu hỏi (ví dụ: 'Cách dùng live voice')..."
                                                value={helpSearch}
                                                onChange={(e) => setHelpSearch(e.target.value)}
                                                className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
                                        </div>
                                    </div>

                                    {/* AI Support Widget */}
                                    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                                        <div className="relative z-10">
                                            <div className="flex items-start gap-4 mb-4">
                                                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-3xl shadow-inner border border-white/10">👩‍🚀</div>
                                                <div>
                                                    <h3 className="font-bold text-lg">Hỏi Nana AI</h3>
                                                    <p className="text-indigo-100 text-sm opacity-90">Bạn gặp khó khăn? Hãy hỏi mình bất cứ điều gì về cách sử dụng app.</p>
                                                </div>
                                            </div>

                                            <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                                                {aiHelpAnswer ? (
                                                    <div className="space-y-3">
                                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiHelpAnswer}</p>
                                                        <button
                                                            onClick={() => setAiHelpAnswer('')}
                                                            className="text-xs font-bold text-indigo-200 hover:text-white underline"
                                                        >
                                                            Hỏi câu khác
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={aiHelpInput}
                                                            onChange={(e) => setAiHelpInput(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAskAiHelp()}
                                                            placeholder="VD: Làm sao để tạo ngân sách mới?"
                                                            className="flex-1 bg-transparent border-none outline-none text-white placeholder-indigo-200 text-sm"
                                                        />
                                                        <button
                                                            onClick={handleAskAiHelp}
                                                            disabled={isAskingAi || !aiHelpInput.trim()}
                                                            className="bg-white text-indigo-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                                                        >
                                                            {isAskingAi ? '...' : 'Gửi'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* FAQ Accordions */}
                                    <div className="grid gap-6 md:grid-cols-2">
                                        {filteredFaq.map((category) => (
                                            <div key={category.category} className="space-y-3">
                                                <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wider ml-1 border-b border-gray-100 dark:border-gray-800 pb-2 mb-3">
                                                    {category.category}
                                                </h3>
                                                <div className="space-y-2">
                                                    {category.items.map((item) => {
                                                        const isOpen = openFaqIndex === item.id;
                                                        return (
                                                            <div
                                                                key={item.id}
                                                                className={`border rounded-xl transition-all duration-200 overflow-hidden ${isOpen ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-gray-600'}`}
                                                            >
                                                                <button
                                                                    onClick={() => setOpenFaqIndex(isOpen ? null : item.id)}
                                                                    className="w-full text-left p-4 flex justify-between items-center gap-4 outline-none"
                                                                >
                                                                    <span className={`font-bold text-sm ${isOpen ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
                                                                        {item.q}
                                                                    </span>
                                                                    <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                                                                </button>

                                                                {isOpen && (
                                                                    <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed border-t border-blue-100 dark:border-blue-900/30 pt-3 animate-fade-in">
                                                                        {item.a}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Contact Footer */}
                                    <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-6 text-center border border-dashed border-gray-300 dark:border-gray-700 mt-4">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Vẫn chưa tìm thấy câu trả lời? Đội ngũ Admin luôn sẵn sàng hỗ trợ bạn.</p>
                                        <a
                                            href={`https://zalo.me/${adminZalo}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-sm shadow-md transition-all active:scale-95"
                                        >
                                            <span>💬</span> Chat với Admin (Zalo)
                                        </a>
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