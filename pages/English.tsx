
import React, { useState, useEffect, useRef } from 'react';
import { geminiService, SpeakingSuggestion } from '../services/gemini';
import { VocabFolder, VocabTerm, SpeakingSession } from '../types';
import { Link } from 'react-router-dom';
import { firebaseService } from '../services/firebase';

// --- Constants ---
const QUESTIONS_DB = [
    "Please tell me about your family?",
    "Please tell me about yourself?",
    "Tell me about your hometown/ the place that you live?/ A famous place in your country?",
    "Tell me the best way to travel about around your country?",
    "Tell me about your friend / a member in your family",
    "What is the weather like today? /What is your favorite season?",
    "Please tell me about one of your good memories",
    "What do you like doing with your friends?",
    "What do you like doing in your free time?",
    "What did you do last night / on the weekend?",
    "Please tell me about your first school?",
    "Describe the room you are in?",
    "Describe your journey here today?",
    "What are you wearing today?",
    "When do you feel tired?",
    "Describe a typical Vietnamese meal?",
    "Describe your typical day?",
    "What do you like to do in your free time?",
    "Describe your favorite Places",
    "Tell me about the last time you talked with your mother",
    "People like sport in your country",
    "Describe the room you are in?",
    "What are you looking for in your new house?",
    "Why are you learning English?",
    "Describe Your job",
    "What is the food like in your country?",
    "When do you feel stressed?",
    "Tell me why interested in travel?",
    "Favorite book in your country?"
];

const ADVANCED_TOPICS = [
    "Describe a time you saved money to do something.",
    "Describe a historical building you have visited.",
    "Describe a journey that you remember well.",
    "Describe a book you read recently.",
    "Describe a person who has influenced you.",
    "Describe a skill you would like to learn.",
    "Describe a time you helped someone."
];

const SUGGESTED_VOCAB_TOPICS = [
    "Travel", "Technology", "Business", "Health", "Environment",
    "Education", "Food & Cuisine", "Culture", "Art & Design", "Science",
    "Politics", "Sports", "Fashion", "Media", "Psychology",
    "History", "Space Exploration", "Law & Order", "Architecture", "Economy"
];

const SUGGESTED_GRAMMAR_TOPICS = [
    "Present Simple", "Past Perfect", "Conditionals", "Passive Voice", "Relative Clauses",
    "Modal Verbs", "Reported Speech", "Gerunds & Infinitives", "Articles", "Prepositions",
    "Future Forms", "Comparatives", "Question Tags", "Inversion", "Subjunctive",
    "Causative Form", "Phrasal Verbs", "Used to / Would", "Quantifiers", "Linking Words"
];

const DAILY_VOCAB_LIMIT = 10;

// --- Types & Helpers ---
type SpeakingMode = 'basic' | 'advanced' | 'image' | 'test' | null;

interface GrammarQuestion {
    id: number;
    question: string;
    options: string[];
    correctAnswer?: string; // Hidden in real app until graded, but used for mock logic if needed
}

interface GrammarResult {
    score: number;
    results: {
        id: number;
        isCorrect: boolean;
        explanation: string;
    }[];
}

// --- SHARED COMPONENTS ---

const ExternalBrowser = ({ url, title, onClose }: { url: string, title: string, onClose: () => void }) => {
    return (
        <div className="flex flex-col h-full animate-fade-in bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-750 border-b border-gray-300 dark:border-gray-700 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={onClose} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600 text-sm font-bold transition-colors shrink-0">
                        ← <span className="hidden sm:inline">Quay lại</span>
                    </button>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-gray-800 dark:text-white truncate">{title}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px] sm:max-w-[300px]">{url}</span>
                    </div>
                </div>
                <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0">
                    <span className="hidden sm:inline">Mở tab mới</span> ↗
                </a>
            </div>
            <div className="flex-1 relative bg-white">
                <iframe
                    src={url}
                    title={title}
                    className="absolute inset-0 w-full h-full border-none"
                    allow="clipboard-read; clipboard-write"
                />
            </div>
        </div>
    );
};

// --- REUSABLE MANUAL VOCAB PANEL ---
interface ManualVocabPanelProps {
    onSave: (word: string, meaning: string, example: string) => void;
    folderLabel: string;
    className?: string;
}

const ManualVocabPanel: React.FC<ManualVocabPanelProps> = ({ onSave, folderLabel, className = "" }) => {
    const [form, setForm] = useState({ word: '', meaning: '', example: '' });
    const [recent, setRecent] = useState<{ id: number, word: string, meaning: string }[]>([]);

    const handleAdd = () => {
        if (!form.word || !form.meaning) return;
        onSave(form.word, form.meaning, form.example);
        setRecent(prev => [{ id: Date.now(), word: form.word, meaning: form.meaning }, ...prev].slice(0, 5));
        setForm({ word: '', meaning: '', example: '' });
    };

    return (
        <div className={`bg-white dark:bg-gray-800 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 flex flex-col shrink-0 shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-10 ${className}`}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-base">
                    <span>📒</span> My Vocabulary Bank
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-bold">Saving to: {folderLabel}</p>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar bg-white dark:bg-gray-900">
                <div className="space-y-3">
                    <div>
                        <input
                            value={form.word}
                            onChange={e => setForm({ ...form, word: e.target.value })}
                            className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none placeholder-gray-400 font-bold"
                            placeholder="Word / Phrase"
                        />
                    </div>
                    <div>
                        <input
                            value={form.meaning}
                            onChange={e => setForm({ ...form, meaning: e.target.value })}
                            className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none placeholder-gray-400"
                            placeholder="Meaning (VN)"
                        />
                    </div>
                    <div>
                        <textarea
                            value={form.example}
                            onChange={e => setForm({ ...form, example: e.target.value })}
                            className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white h-16 resize-none text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none placeholder-gray-400"
                            placeholder="Example (Optional)"
                        />
                    </div>
                    <button
                        onClick={handleAdd}
                        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3 rounded-lg hover:bg-black dark:hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm shadow-md"
                    >
                        + Add Word
                    </button>
                </div>

                {recent.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Recently Added</h4>
                        <div className="space-y-2">
                            {recent.map((w) => (
                                <div key={w.id} className="flex justify-between items-center p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                    <span className="font-bold text-gray-800 dark:text-white text-xs truncate max-w-[60%]">{w.word}</span>
                                    <span className="text-xs text-gray-500 truncate max-w-[35%]">{w.meaning}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- VOCAB & GRAMMAR MODULE (Preserved) ---
const VocabAndGrammarModule = ({ level, onSaveVocab }: { level: string, onSaveVocab: (w: string, m: string, c: string, targetFolderId?: string) => void }) => {
    const [subTab, setSubTab] = useState<'menu' | 'vocab_ai' | 'grammar_ai' | 'grammar_web'>('menu');
    const [grammarTopic, setGrammarTopic] = useState('');
    const [grammarQuestions, setGrammarQuestions] = useState<GrammarQuestion[]>([]);
    const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
    const [grammarResult, setGrammarResult] = useState<GrammarResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [vocabTopic, setVocabTopic] = useState('');
    const [generatedVocab, setGeneratedVocab] = useState<any[]>([]);
    const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
    const [vocabSubMode, setVocabSubMode] = useState<'generate' | 'review'>('generate');
    const [reviewTerms, setReviewTerms] = useState<VocabTerm[]>([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isCardFlipped, setIsCardFlipped] = useState(false);
    const [dailyCount, setDailyCount] = useState(0);

    const getDailyUsage = () => {
        const today = new Date().toDateString();
        const saved = localStorage.getItem('dh_vocab_limit');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.date === today) return parsed.count;
        }
        return 0;
    };

    const updateDailyUsage = (count: number) => {
        const today = new Date().toDateString();
        const current = getDailyUsage();
        localStorage.setItem('dh_vocab_limit', JSON.stringify({ date: today, count: current + count }));
    };

    useEffect(() => { setDailyCount(getDailyUsage()); }, [subTab]);

    const handleGenerateQuiz = async () => {
        if (!grammarTopic.trim()) return alert("Vui lòng nhập chủ đề ngữ pháp (VD: Present Simple)");
        setIsProcessing(true);
        setGrammarQuestions([]);
        setGrammarResult(null);
        setUserAnswers({});
        try {
            const jsonStr = await geminiService.generateGrammarQuiz(level, grammarTopic);
            const questions = JSON.parse(jsonStr.replace(/```json|```/g, '').trim());
            setGrammarQuestions(questions);
            setSubTab('grammar_ai');
        } catch (e: any) { alert(e.message || "Lỗi tạo đề thi. Vui lòng thử lại."); } finally { setIsProcessing(false); }
    };

    const handleGradeQuiz = async () => {
        if (Object.keys(userAnswers).length < grammarQuestions.length) {
            if (!window.confirm("Bạn chưa làm hết câu hỏi. Vẫn muốn nộp bài?")) return;
        }
        setIsProcessing(true);
        try {
            const jsonStr = await geminiService.gradeGrammarQuiz(level, grammarQuestions, userAnswers);
            const result = JSON.parse(jsonStr.replace(/```json|```/g, '').trim());
            setGrammarResult(result);
        } catch (e: any) { alert(e.message || "Lỗi chấm điểm."); } finally { setIsProcessing(false); }
    };

    const handleGenerateVocab = async () => {
        if (!vocabTopic.trim()) return alert("Vui lòng nhập chủ đề từ vựng");
        const usage = getDailyUsage();
        if (usage >= DAILY_VOCAB_LIMIT) { return alert(`Bạn đã đạt giới hạn ${DAILY_VOCAB_LIMIT} từ vựng cho hôm nay. Vui lòng quay lại vào ngày mai hoặc ôn tập từ cũ.`); }
        setIsProcessing(true);
        try {
            const jsonStr = await geminiService.generateDailyVocabulary(level, vocabTopic);
            const newWords = JSON.parse(jsonStr.replace(/```json|```/g, '').trim());
            setGeneratedVocab(newWords);
            updateDailyUsage(newWords.length);
            setDailyCount(prev => prev + newWords.length);
            setVocabSubMode('generate');
            setSubTab('vocab_ai');
        } catch (e: any) { alert(e.message || "Lỗi tạo từ vựng."); } finally { setIsProcessing(false); }
    };

    const loadReviewTerms = () => {
        const stored = localStorage.getItem('dh_vocab_terms');
        if (stored) {
            const terms = JSON.parse(stored);
            setReviewTerms(terms.sort(() => Math.random() - 0.5));
            setCurrentCardIndex(0);
            setIsCardFlipped(false);
        }
        setVocabSubMode('review');
    };

    const saveGeneratedWord = (v: any) => {
        onSaveVocab(v.term, v.meaning, v.example, 'folder_vocab_general');
        setSavedSet(prev => new Set(prev).add(v.term));
    };

    const renderContent = () => {
        const remaining = Math.max(0, DAILY_VOCAB_LIMIT - dailyCount);
        if (subTab === 'menu') {
            return (
                <div className="h-full overflow-y-auto p-4 md:p-8 bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-8">
                    <div className="w-full max-w-3xl text-center space-y-2">
                        <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Học Tập Thông Minh</h2>
                        <p className="text-gray-500">Chọn chế độ để bắt đầu</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-yellow-100 dark:border-yellow-900/30 flex flex-col items-center text-center hover:shadow-lg transition-all">
                            <div className="text-5xl mb-4">⚡</div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Học Từ Vựng AI</h3>
                            <p className="text-sm text-gray-500 mb-4">Tạo flashcard mới hoặc ôn tập.</p>
                            <div className="w-full mb-3">
                                <input value={vocabTopic} onChange={e => setVocabTopic(e.target.value)} placeholder="Nhập chủ đề (VD: Travel)..." className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-gray-900 font-medium shadow-sm" />
                                <div className="flex gap-2 mt-2 overflow-x-auto custom-scrollbar pb-2 justify-start md:justify-center max-w-full">
                                    {SUGGESTED_VOCAB_TOPICS.map(t => (<button key={t} onClick={() => setVocabTopic(t)} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border border-gray-200 dark:border-gray-600"> {t} </button>))}
                                </div>
                            </div>
                            <div className="w-full flex flex-col gap-2 mt-auto">
                                <button onClick={handleGenerateVocab} disabled={isProcessing || remaining === 0} className="w-full bg-yellow-500 text-white font-bold py-2.5 rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"> {isProcessing ? 'Đang tạo...' : 'Khám phá ngay'} </button>
                                <p className="text-[10px] text-gray-400 font-medium"> Giới hạn hôm nay: <span className={remaining === 0 ? 'text-red-500' : 'text-green-500'}>{dailyCount}</span>/{DAILY_VOCAB_LIMIT} từ </p>
                                <button onClick={() => { loadReviewTerms(); setSubTab('vocab_ai'); }} className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold py-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"> Ôn tập (Review) </button>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900/30 flex flex-col items-center text-center hover:shadow-lg transition-all">
                            <div className="text-5xl mb-4">🧠</div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Luyện Ngữ Pháp AI</h3>
                            <p className="text-sm text-gray-500 mb-4">Tạo đề thi và chấm điểm tự động.</p>
                            <div className="w-full mb-3">
                                <input value={grammarTopic} onChange={e => setGrammarTopic(e.target.value)} placeholder="Chủ đề (VD: Passive Voice)..." className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-gray-900 font-medium shadow-sm" />
                                <div className="flex gap-2 mt-2 overflow-x-auto custom-scrollbar pb-2 justify-start md:justify-center max-w-full">
                                    {SUGGESTED_GRAMMAR_TOPICS.map(t => (<button key={t} onClick={() => setGrammarTopic(t)} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border border-gray-200 dark:border-gray-600"> {t} </button>))}
                                </div>
                            </div>
                            <button onClick={handleGenerateQuiz} disabled={isProcessing} className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors mt-auto shadow-md active:scale-95"> {isProcessing && grammarTopic ? 'Đang tạo...' : 'Tạo đề thi'} </button>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-green-100 dark:border-green-900/30 flex flex-col items-center text-center hover:shadow-lg transition-all cursor-pointer group" onClick={() => setSubTab('grammar_web')}>
                            <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📝</div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Luyện Đề Có Sẵn</h3>
                            <p className="text-sm text-gray-500 mb-6">Kho bài tập ngữ pháp tổng hợp từ AptisKey.</p>
                            <button className="w-full bg-green-600 text-white font-bold py-2.5 rounded-lg hover:bg-green-700 transition-colors mt-auto shadow-md"> Mở thư viện </button>
                        </div>
                    </div>
                </div>
            );
        }
        if (subTab === 'grammar_web') {
            return (<div className="h-full p-4 bg-gray-100 dark:bg-gray-900"> <ExternalBrowser url="https://www.aptiskey.com/grammar_bode.html" title="Grammar Practice Library" onClose={() => setSubTab('menu')} /> </div>);
        }
        if (subTab === 'grammar_ai') {
            // ... (Keep grammar AI render code as is) ...
            return (
                <div className="h-full overflow-y-auto p-4 md:p-8 bg-gray-50 dark:bg-gray-900">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex items-center justify-between mb-6"> <button onClick={() => setSubTab('menu')} className="text-gray-500 hover:text-gray-800 font-bold">← Menu</button> <h2 className="text-2xl font-bold text-gray-800 dark:text-white text-center">Quiz: {grammarTopic}</h2> <div className="w-16"></div> </div>
                        <div className="space-y-6">
                            {grammarQuestions.map((q, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                    <p className="font-bold text-lg mb-4 text-gray-900 dark:text-white"><span className="text-indigo-500 mr-2">Q{idx + 1}.</span> {q.question}</p>
                                    <div className="space-y-2">
                                        {q.options.map((opt, i) => {
                                            const isSelected = userAnswers[q.id] === opt;
                                            let resultClass = '';
                                            if (grammarResult) {
                                                const res = grammarResult.results.find(r => r.id === q.id);
                                                if (res) {
                                                    if (isSelected && !res.isCorrect) resultClass = 'bg-red-100 border-red-300 text-red-800';
                                                    else if (isSelected && res.isCorrect) resultClass = 'bg-green-100 border-green-300 text-green-800';
                                                }
                                            }
                                            return (<div key={i} onClick={() => !grammarResult && setUserAnswers(prev => ({ ...prev, [q.id]: opt }))} className={`p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? (grammarResult ? resultClass : 'bg-indigo-50 border-indigo-500 text-indigo-700') : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}> {opt} </div>)
                                        })}
                                    </div>
                                    {grammarResult && (<div className={`mt-4 p-4 rounded-lg text-sm ${grammarResult.results.find(r => r.id === q.id)?.isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}> <p className="font-bold mb-1">{grammarResult.results.find(r => r.id === q.id)?.isCorrect ? '✅ Chính xác' : '❌ Sai rồi'}</p> <p>{grammarResult.results.find(r => r.id === q.id)?.explanation}</p> </div>)}
                                </div>
                            ))}
                        </div>
                        {!grammarResult && (<div className="mt-8 flex justify-center"> <button onClick={handleGradeQuiz} disabled={isProcessing} className="bg-indigo-600 text-white px-10 py-3 rounded-full font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all"> {isProcessing ? 'Đang chấm...' : 'Nộp Bài'} </button> </div>)}
                        {grammarResult && (<div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-xl border-t-4 border-indigo-500 text-center shadow-lg animate-slide-up"> <p className="text-gray-500 uppercase font-bold text-sm mb-2">Kết quả của bạn</p> <div className="text-5xl font-bold text-indigo-600 mb-4">{grammarResult.score}/10</div> <button onClick={() => setSubTab('menu')} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-bold transition-colors">Làm bài khác</button> </div>)}
                    </div>
                </div>
            );
        }
        if (subTab === 'vocab_ai') {
            // ... (Keep vocab AI render code as is) ...
            return (
                <div className="h-full overflow-y-auto p-4 md:p-8 bg-gray-50 dark:bg-gray-900">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between mb-6">
                            <button onClick={() => setSubTab('menu')} className="text-gray-500 hover:text-gray-800 font-bold">← Menu</button>
                            <div className="flex gap-2 bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                                <button onClick={() => setVocabSubMode('generate')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${vocabSubMode === 'generate' ? 'bg-white dark:bg-gray-600 shadow text-blue-600' : 'text-gray-500'}`}>Tạo mới AI</button>
                                <button onClick={() => { loadReviewTerms(); }} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${vocabSubMode === 'review' ? 'bg-white dark:bg-gray-600 shadow text-blue-600' : 'text-gray-500'}`}>Ôn tập</button>
                            </div>
                            <div className="w-16"></div>
                        </div>
                        {vocabSubMode === 'generate' ? (
                            <>
                                <div className="flex justify-between items-center mb-4"> <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Topic: {vocabTopic}</h2> <button onClick={handleGenerateVocab} className="text-blue-600 font-bold text-sm hover:underline">Tạo thêm</button> </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {generatedVocab.map((v, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all flex flex-col">
                                            <div className="flex justify-between items-start mb-2"> <div> <div className="flex items-baseline gap-2"> <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400">{v.term}</h3> {v.ipa && <span className="text-gray-400 text-sm font-mono">/{v.ipa.replace(/\//g, '')}/</span>} </div> <span className="text-xs text-gray-500 italic">{v.partOfSpeech}</span> </div> <button onClick={() => saveGeneratedWord(v)} disabled={savedSet.has(v.term)} className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${savedSet.has(v.term) ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}> {savedSet.has(v.term) ? '✓ Saved' : '+ Save'} </button> </div>
                                            <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">{v.meaning}</p> <p className="text-xs text-gray-500 mb-2">{v.definition}</p> <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400"> <p className="italic">"{v.example}"</p> </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[400px]">
                                {reviewTerms.length > 0 ? (
                                    <div className="w-full max-w-md">
                                        <div onClick={() => setIsCardFlipped(!isCardFlipped)} className="relative h-64 w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl cursor-pointer perspective-1000 group transition-all hover:scale-[1.02]">
                                            <div className="flex flex-col items-center justify-center h-full p-8 text-center border border-gray-200 dark:border-gray-700 rounded-2xl">
                                                {!isCardFlipped ? (<> <h3 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">{reviewTerms[currentCardIndex].term}</h3> <p className="text-gray-400 font-mono text-lg mb-4">/{reviewTerms[currentCardIndex].term}/</p> <span className="text-sm bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full text-gray-600 dark:text-gray-300">{reviewTerms[currentCardIndex].partOfSpeech}</span> <p className="absolute bottom-4 text-xs text-gray-400 animate-pulse">Click to flip</p> </>) : (<> <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-4">{reviewTerms[currentCardIndex].meaning}</h3> <p className="text-gray-600 dark:text-gray-300 italic">"{reviewTerms[currentCardIndex].example}"</p> </>)}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center mt-8"> <button onClick={() => { setCurrentCardIndex(prev => Math.max(0, prev - 1)); setIsCardFlipped(false); }} disabled={currentCardIndex === 0} className="px-6 py-3 bg-gray-200 dark:bg-gray-700 rounded-xl font-bold disabled:opacity-50"> ← Prev </button> <span className="font-bold text-gray-500">{currentCardIndex + 1} / {reviewTerms.length}</span> <button onClick={() => { setCurrentCardIndex(prev => Math.min(reviewTerms.length - 1, prev + 1)); setIsCardFlipped(false); }} disabled={currentCardIndex === reviewTerms.length - 1} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50 shadow-lg"> Next → </button> </div>
                                    </div>
                                ) : (<div className="text-center text-gray-500"> <p className="text-xl mb-2">📭</p> <p>Chưa có từ vựng nào trong thư viện để ôn tập.</p> </div>)}
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            <div className="flex-1 overflow-hidden relative"> {renderContent()} </div>
            <ManualVocabPanel onSave={(w, m, e) => onSaveVocab(w, m, e, 'folder_vocab_general')} folderLabel="General Vocab Folder" className="w-full lg:w-72 xl:w-80" />
        </div>
    );
}

// --- WRITING MODULE (Preserved) ---
const WritingModule = ({ level, onSaveVocab }: { level: string, onSaveVocab: (w: string, m: string, c: string, targetFolderId?: string) => void }) => {
    const [topic, setTopic] = useState('');
    const [essay, setEssay] = useState('');
    const [isGrading, setIsGrading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
    const [showReference, setShowReference] = useState(false);
    const [activeResultTab, setActiveResultTab] = useState<'score' | 'feedback' | 'model' | 'vocab'>('score');
    const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
    const [timer, setTimer] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerDuration, setTimerDuration] = useState(20 * 60);

    useEffect(() => {
        let interval: any;
        if (isTimerRunning && timer > 0) { interval = setInterval(() => setTimer(t => t - 1), 1000); } else if (timer === 0 && isTimerRunning) { setIsTimerRunning(false); alert("Time's up!"); }
        return () => clearInterval(interval);
    }, [isTimerRunning, timer]);

    const formatTime = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec.toString().padStart(2, '0')}`; };
    const getWordCount = (text: string) => { return text.trim().split(/\s+/).filter(w => w.length > 0).length; };

    const handleGenerateTopic = async (type: 'task1' | 'task2') => {
        setIsGeneratingTopic(true);
        try {
            const newTopic = await geminiService.generateWritingTopic(level, type);
            setTopic(newTopic);
            const duration = type === 'task1' ? 20 * 60 : 40 * 60;
            setTimerDuration(duration);
            setTimer(duration);
        } catch (e: any) { alert(e.message || "Lỗi tạo đề bài."); } finally { setIsGeneratingTopic(false); }
    };

    const handleGrade = async () => {
        if (!topic.trim() || !essay.trim()) { alert("Vui lòng nhập đề bài và bài làm."); return; }
        setIsGrading(true); setResult(null); setIsTimerRunning(false);
        try { const jsonStr = await geminiService.gradeWritingPractice(level, topic, essay); setResult(JSON.parse(jsonStr.replace(/```json|```/g, '').trim())); setActiveResultTab('score'); }
        catch (e: any) { alert(e.message || "Có lỗi khi chấm điểm."); } finally { setIsGrading(false); }
    };

    const handleSave = (word: string, mean: string, ctx: string) => { onSaveVocab(word, mean, "Writing Practice", "writing"); setSavedWords(prev => new Set(prev).add(word)); };

    return (
        <div className="flex flex-col lg:flex-row h-full animate-fade-in overflow-hidden bg-gray-50 dark:bg-gray-900">
            <div className={`${showReference ? 'w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r' : 'w-0 border-none'} h-[300px] lg:h-full border-gray-200 dark:border-gray-800 bg-white transition-all duration-300 relative shrink-0 overflow-hidden`}>
                <div className="absolute top-0 left-0 right-0 bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700 text-xs text-gray-500 font-bold uppercase tracking-wider flex justify-between z-10 items-center"> <span>Nguồn đề thi: AptisKey.com</span> <button onClick={() => setShowReference(false)} className="text-red-500 font-bold ml-2">✕ Đóng</button> </div>
                <iframe src="https://aptiskey.com/writing_bode.html" className="w-full h-full pt-8" title="Aptis Writing Topics" />
            </div>
            <div className="flex-1 h-full flex flex-col overflow-hidden relative min-w-0">
                <div className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2"> {!showReference && (<button onClick={() => setShowReference(true)} className="p-2 rounded-lg text-sm font-bold bg-gray-100 hover:bg-blue-50 text-blue-600 transition-colors"> 📑 Show Topics </button>)} <div className="h-6 w-px bg-gray-300 mx-2"></div> <button onClick={() => handleGenerateTopic('task1')} disabled={isGeneratingTopic} className="text-xs font-bold text-gray-600 hover:text-blue-600 px-2 py-1 bg-gray-100 rounded">Generate Task 1</button> <button onClick={() => handleGenerateTopic('task2')} disabled={isGeneratingTopic} className="text-xs font-bold text-gray-600 hover:text-blue-600 px-2 py-1 bg-gray-100 rounded">Generate Task 2</button> </div>
                    <div className="flex items-center gap-4"> <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700"> <span className="text-xs font-bold text-gray-500 uppercase">Words:</span> <span className="font-mono font-bold text-blue-600">{getWordCount(essay)}</span> </div> <div className={`flex items-center gap-2 px-3 py-1 rounded-full border font-mono font-bold ${timer < 60 && isTimerRunning ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}> <span>{formatTime(timer)}</span> <button onClick={() => { if (timer === 0) setTimer(timerDuration); setIsTimerRunning(!isTimerRunning); }} className="hover:text-blue-500 text-xs ml-1"> {isTimerRunning ? '⏸' : '▶'} </button> <button onClick={() => { setIsTimerRunning(false); setTimer(timerDuration); }} className="hover:text-blue-500 text-xs ml-1">↺</button> </div> </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"> <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Đề bài (Topic)</label> <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Nhập hoặc tạo đề bài ngẫu nhiên..." className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-medium text-gray-900 dark:text-white resize-none" rows={2} /> </div>
                        <textarea value={essay} onChange={e => setEssay(e.target.value)} placeholder="Start writing here..." className="w-full p-6 h-[400px] text-base md:text-lg leading-relaxed font-serif text-gray-800 dark:text-gray-200 focus:outline-none bg-white dark:bg-gray-800 resize-none" />
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end"> <button onClick={handleGrade} disabled={isGrading} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center gap-2"> {isGrading ? <span className="animate-spin">↻</span> : <span>✨ Chấm Điểm (AI Grade)</span>} </button> </div>
                    </div>
                    {result && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-blue-100 dark:border-blue-900 overflow-hidden animate-slide-up">
                            <div className="flex border-b border-gray-200 dark:border-gray-700"> {[{ id: 'score', label: 'Điểm số & Tổng quan' }, { id: 'feedback', label: 'Sửa lỗi chi tiết' }, { id: 'model', label: 'Bài mẫu' }, { id: 'vocab', label: 'Từ vựng hay' }].map(tab => (<button key={tab.id} onClick={() => setActiveResultTab(tab.id as any)} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeResultTab === tab.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}> {tab.label} </button>))} </div>
                            <div className="p-6 min-h-[300px]">
                                {activeResultTab === 'score' && (<div className="text-center space-y-6"> <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-5xl font-bold text-blue-700 dark:text-blue-300 shadow-inner"> {result.score} </div> <div className="max-w-2xl mx-auto text-left bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-100 dark:border-gray-700"> <h4 className="font-bold text-gray-800 dark:text-white mb-2 uppercase text-xs tracking-wider">Nhận xét chung</h4> <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{result.generalFeedback}</p> </div> </div>)}
                                {activeResultTab === 'feedback' && (<div className="space-y-4"> {result.corrections?.map((c: any, i: number) => (<div key={i} className="p-4 rounded-xl bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-800"> <p className="text-red-600 line-through mb-1">{c.original}</p> <p className="text-green-600 font-bold mb-2">{c.correction}</p> <p className="text-xs text-gray-500 dark:text-gray-400 italic">{c.explanation}</p> </div>))} </div>)}
                                {activeResultTab === 'model' && (<div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl"> <h4 className="font-bold text-gray-800 dark:text-white mb-4 uppercase text-xs tracking-wider">Bài mẫu (Band 8.0+)</h4> <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-serif">{result.sampleEssay}</p> </div>)}
                                {activeResultTab === 'vocab' && (<div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {result.betterVocab?.map((v: any, i: number) => (<div key={i} className="flex flex-col p-4 rounded-xl border border-blue-100 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-900/10"> <div className="flex justify-between items-start mb-2"> <span className="font-bold text-blue-700 dark:text-blue-400 text-lg">{v.word}</span> <button onClick={() => handleSave(v.word, v.meaning, v.context)} disabled={savedWords.has(v.word)} className={`text-xs font-bold px-2 py-1 rounded transition-colors ${savedWords.has(v.word) ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}> {savedWords.has(v.word) ? '✓ Saved' : '+ Save'} </button> </div> <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">{v.meaning}</p> <p className="text-xs text-gray-500 dark:text-gray-400 italic">"{v.context}"</p> </div>))} </div>)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <ManualVocabPanel onSave={(w, m, e) => onSaveVocab(w, m, `Writing Context: ${e}`, 'writing')} folderLabel="Writing Task" className="w-full lg:w-72 xl:w-80" />
        </div>
    );
}

// --- READING MODULE (Preserved) ---
const ReadingModule = ({ level, onSaveVocab }: { level: string, onSaveVocab: (w: string, m: string, c: string, targetFolderId?: string) => void }) => {
    const [readingMode, setReadingMode] = useState<'library' | 'ai_reader' | 'external_browser'>('library');
    const [currentUrl, setCurrentUrl] = useState<{ url: string, title: string } | null>(null);
    const [aiTopic, setAiTopic] = useState('');
    const [readingData, setReadingData] = useState<any>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [lookupResult, setLookupResult] = useState<any>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [textSize, setTextSize] = useState<'sm' | 'base' | 'lg'>('base');
    const [bgTheme, setBgTheme] = useState<'light' | 'sepia' | 'dark'>('light');

    const handleGenerate = async () => {
        if (!aiTopic.trim()) return alert("Nhập chủ đề muốn đọc.");
        setIsGenerating(true);
        try {
            const json = await geminiService.generateReadingPassage(level, aiTopic);
            setReadingData(JSON.parse(json.replace(/```json|```/g, '').trim()));
            setReadingMode('ai_reader');
        } catch (e: any) { alert(e.message || "Lỗi tạo bài đọc."); } finally { setIsGenerating(false); }
    };

    const handleLookup = async () => {
        const selection = window.getSelection()?.toString().trim();
        if (selection && selection.length < 30) {
            setSelectedWord(selection);
            setIsLookingUp(true);
            setLookupResult(null);
            try {
                const context = readingData?.content?.substring(0, 200) || "";
                const json = await geminiService.lookupDictionary(selection, context);
                setLookupResult(JSON.parse(json.replace(/```json|```/g, '').trim()));
            } catch (e: any) {
                if (e.message.includes('🔒')) alert(e.message);
            } finally { setIsLookingUp(false); }
        }
    };

    const ContentArea = () => {
        if (readingMode === 'external_browser' && currentUrl) { return <div className="h-full p-4"><ExternalBrowser url={currentUrl.url} title={currentUrl.title} onClose={() => setReadingMode('library')} /></div>; }
        if (readingMode === 'ai_reader' && readingData) {
            const bgClass = bgTheme === 'light' ? 'bg-white text-gray-900' : bgTheme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636]' : 'bg-[#1a1a1a] text-[#d1d1d1]';
            const textClass = textSize === 'sm' ? 'text-sm' : textSize === 'lg' ? 'text-xl' : 'text-base';
            return (
                <div className={`h-full flex flex-col ${bgClass} transition-colors`}>
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-opacity-50 backdrop-blur sticky top-0 z-10"> <button onClick={() => setReadingMode('library')} className="px-3 py-1.5 rounded-lg hover:bg-black/5 font-bold text-sm">← Thư viện</button> <div className="flex gap-2 items-center"> <div className="flex bg-black/5 rounded-lg p-1"> <button onClick={() => setTextSize('sm')} className={`w-8 h-8 rounded ${textSize === 'sm' ? 'bg-white shadow' : ''}`}>A</button> <button onClick={() => setTextSize('base')} className={`w-8 h-8 rounded ${textSize === 'base' ? 'bg-white shadow' : ''}`}>A+</button> <button onClick={() => setTextSize('lg')} className={`w-8 h-8 rounded ${textSize === 'lg' ? 'bg-white shadow' : ''}`}>A++</button> </div> <div className="flex bg-black/5 rounded-lg p-1"> <button onClick={() => setBgTheme('light')} className="w-6 h-6 rounded-full bg-white border mx-1" title="Light"></button> <button onClick={() => setBgTheme('sepia')} className="w-6 h-6 rounded-full bg-[#f4ecd8] border mx-1" title="Sepia"></button> <button onClick={() => setBgTheme('dark')} className="w-6 h-6 rounded-full bg-[#333] border mx-1" title="Dark"></button> </div> </div> </div>
                    <div className="flex-1 flex overflow-hidden relative">
                        <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto" onMouseUp={handleLookup}> <h1 className="text-3xl font-bold mb-6">{readingData.title}</h1> <div className={`${textClass} leading-loose whitespace-pre-wrap`}>{readingData.content}</div> <div className="mt-12 p-6 bg-black/5 rounded-xl"> <h3 className="font-bold mb-2 uppercase text-xs opacity-70">Tóm tắt (Vietnamese)</h3> <p className="italic">{readingData.summary}</p> </div> </div>
                        {(selectedWord || lookupResult) && (<div className="absolute right-0 top-0 bottom-0 w-80 border-l border-gray-200/50 bg-white/95 backdrop-blur shadow-xl p-4 overflow-y-auto z-20"> <div className="flex justify-between items-center mb-4"> <h3 className="font-bold text-gray-800">Tra từ nhanh</h3> <button onClick={() => { setSelectedWord(null); setLookupResult(null); }} className="text-gray-500">✕</button> </div> {isLookingUp ? (<div className="animate-pulse">Đang tra cứu "{selectedWord}"...</div>) : lookupResult ? (<div className="space-y-4"> <div> <div className="text-2xl font-bold text-blue-600">{lookupResult.word}</div> <div className="text-sm text-gray-500">{lookupResult.ipa} • {lookupResult.type}</div> </div> <div> <div className="font-bold text-sm uppercase text-gray-400">Nghĩa tiếng Việt</div> <div className="font-medium text-gray-900">{lookupResult.meaning_vi}</div> </div> <button onClick={() => { onSaveVocab(lookupResult.word, lookupResult.meaning_vi, "Reading Lookup", "reading"); alert("Đã lưu!"); }} className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700" > + Lưu vào Reading Practice </button> </div>) : null} </div>)}
                    </div>
                </div>
            );
        }
        return (
            <div className="h-full flex flex-col animate-fade-in p-4 md:p-8 overflow-y-auto">
                <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Phòng Đọc (Reading Lab)</h2> <div className="flex gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"> <input value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Nhập chủ đề (VD: Technology)..." className="bg-transparent border-none outline-none text-sm px-2 w-48 dark:text-white" onKeyDown={e => e.key === 'Enter' && handleGenerate()} /> <button onClick={handleGenerate} disabled={isGenerating} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50" > {isGenerating ? 'Đang tạo...' : '✨ Tạo bài đọc AI'} </button> </div> </div>
                <h3 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider">Tài liệu ôn thi (Aptis/IELTS)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl w-full"> {[{ url: "https://aptiskey.com/reading_question1.html", title: "Reading Part 1", icon: "🧩", name: "Sentence Comprehension", color: "blue", desc: "Điền từ vào chỗ trống trong câu." }, { url: "https://aptiskey.com/reading_question2.html", title: "Reading Part 2 & 3", icon: "📑", name: "Text Organization", color: "indigo", desc: "Sắp xếp câu thành đoạn văn hoàn chỉnh." }, { url: "https://aptiskey.com/reading_question4.html", title: "Reading Part 4", icon: "🧐", name: "Long Text Comprehension", color: "purple", desc: "Đọc hiểu văn bản dài, nối tiêu đề." }, { url: "https://aptiskey.com/reading_question5.html", title: "Reading Part 5", icon: "🕵️", name: "Short Text", color: "pink", desc: "Đọc hiểu đoạn văn ngắn." }, { url: "https://aptiskey.com/reading_bode.html", title: "Bộ đề Ôn thi", icon: "🗓️", name: "Bộ đề Tổng hợp", color: "teal", span: "md:col-span-2", desc: "Kho đề thi thử đầy đủ các phần." }].map((item, idx) => (<div key={idx} onClick={() => { setCurrentUrl({ url: item.url, title: item.title }); setReadingMode('external_browser'); }} className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-${item.color}-100 dark:border-${item.color}-900 hover:shadow-xl hover:border-${item.color}-300 transition-all cursor-pointer ${item.span || ''} group`}> <div className="flex items-start justify-between"> <div> <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">{item.icon}</div> <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">{item.name}</h3> <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p> </div> <div className={`text-${item.color}-500 bg-${item.color}-50 dark:bg-${item.color}-900/20 p-2 rounded-full`}> <span className="text-xl">↗</span> </div> </div> </div>))} </div>
            </div>
        );
    };
    return (<div className="flex flex-col lg:flex-row h-full bg-white dark:bg-gray-900 overflow-hidden"> <div className="flex-1 overflow-hidden relative"> <ContentArea /> </div> <ManualVocabPanel onSave={(w, m, e) => onSaveVocab(w, m, `Reading Context: ${e}`, 'reading')} folderLabel="Reading Practice" className="w-full lg:w-72 xl:w-80" /> </div>);
}

// --- LISTENING MODULE (Preserved) ---
const ListeningModule = ({ onSaveVocab }: { onSaveVocab: (w: string, m: string, c: string, targetFolderId?: string) => void }) => {
    const [currentUrl, setCurrentUrl] = useState<{ url: string, title: string } | null>(null);
    const [notes, setNotes] = useState("");
    const [timer, setTimer] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    useEffect(() => { let interval: any; if (isTimerRunning) { interval = setInterval(() => setTimer(t => t + 1), 1000); } return () => clearInterval(interval); }, [isTimerRunning]);
    const formatTime = (s: number) => new Date(s * 1000).toISOString().substr(11, 8);
    const Content = () => {
        if (currentUrl) return (
            <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900">
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0"> <button onClick={() => setCurrentUrl(null)} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg">← Back</button> <div className="flex items-center gap-4"> <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full font-mono text-blue-600 dark:text-blue-300 font-bold"> <span>{formatTime(timer)}</span> <button onClick={() => setIsTimerRunning(!isTimerRunning)} className="hover:text-blue-800">{isTimerRunning ? '⏸' : '▶'}</button> <button onClick={() => { setIsTimerRunning(false); setTimer(0); }} className="hover:text-blue-800">↺</button> </div> </div> </div>
                <div className="flex-1 flex overflow-hidden"> <div className="flex-1 relative"> <ExternalBrowser url={currentUrl.url} title={currentUrl.title} onClose={() => setCurrentUrl(null)} /> </div> <div className="w-1/3 min-w-[250px] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col"> <div className="p-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-700 dark:text-gray-300"> 📝 Dictation & Notes </div> <textarea className="flex-1 p-4 resize-none focus:outline-none bg-transparent text-gray-800 dark:text-gray-200 leading-relaxed" placeholder="Type what you hear (Dictation) or take notes here..." value={notes} onChange={e => setNotes(e.target.value)} /> </div> </div>
            </div>
        );
        return (
            <div className="h-full flex flex-col animate-fade-in p-4 md:p-8 overflow-y-auto bg-white dark:bg-gray-900"> <div className="mb-8"><h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-2">Listening Studio</h2></div> <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full"> {[{ url: "https://aptiskey.com/listening_question1_13.html", title: "Part 1", icon: "🎧", name: "Info Recognition", color: "cyan" }, { url: "https://aptiskey.com/listening_question14.html", title: "Part 2", icon: "🔗", name: "Matching", color: "indigo" }, { url: "https://aptiskey.com/listening_question15.html", title: "Part 3", icon: "💭", name: "Inference", color: "violet" }, { url: "https://aptiskey.com/listening_question16_17.html", title: "Part 4", icon: "📻", name: "Monologue", color: "fuchsia" }, { url: "https://aptiskey.com/listening_bode.html", title: "Bộ đề", icon: "🗓️", name: "Bộ đề Ôn thi", color: "emerald", span: "md:col-span-2" }].map((item, idx) => (<div key={idx} onClick={() => { setCurrentUrl({ url: item.url, title: item.title }); setTimer(0); setNotes(""); }} className={`bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-sm border border-${item.color}-100 dark:border-${item.color}-900 hover:shadow-xl transition-all cursor-pointer ${item.span || ''} group`}> <div className="flex justify-between"> <div className="text-5xl mb-6 group-hover:scale-110 transition-transform">{item.icon}</div> <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 px-2 py-1 h-fit rounded">External Source</span> </div> <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{item.name}</h3> <div className="mt-auto font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">Start Practice <span>→</span></div> </div>))} </div> </div>
        );
    }
    return (<div className="flex flex-col lg:flex-row h-full overflow-hidden"> <div className="flex-1 overflow-hidden relative"> <Content /> </div> <ManualVocabPanel onSave={(w, m, e) => onSaveVocab(w, m, `Listening Context: ${e}`, 'listening')} folderLabel="Listening Practice" className="w-full lg:w-72 xl:w-80" /> </div>);
}

// --- SPEAKING MODULE (Enhanced) ---

const VoiceVisualizer = ({ isActive, isUserSpeaking }: { isActive: boolean, isUserSpeaking: boolean }) => {
    if (!isActive) return <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-4xl">🎙️</div>;

    return (
        <div className="relative w-40 h-40 flex items-center justify-center">
            <div className={`absolute inset-0 rounded-full bg-blue-500 opacity-20 ${isUserSpeaking ? 'animate-ping' : ''}`} style={{ animationDuration: '1s' }}></div>
            <div className={`absolute inset-2 rounded-full bg-blue-400 opacity-20 ${isActive ? 'animate-pulse' : ''}`} style={{ animationDuration: '2s' }}></div>
            <div className={`relative w-32 h-32 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 shadow-xl flex items-center justify-center z-10 transition-transform duration-300 ${isUserSpeaking ? 'scale-110' : 'scale-100'}`}>
                <span className="text-5xl animate-bounce" style={{ animationDuration: '3s' }}>
                    {isUserSpeaking ? '🗣️' : '🎧'}
                </span>
            </div>
        </div>
    );
};

const SpeakingPractice = ({ level, onSaveVocab }: { level: string, onSaveVocab: (word: string, def: string, context: string, targetFolderId?: string) => void }) => {
    const [mode, setMode] = useState<SpeakingMode>(null);

    // Mode Specific States
    // Live
    const [isLive, setIsLive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [visualizerState, setVisualizerState] = useState({ isUserSpeaking: false });

    // New Live States for Split View
    const [transcript, setTranscript] = useState<{ role: 'user' | 'model', text: string }[]>([]);
    const [suggestion, setSuggestion] = useState<SpeakingSuggestion | null>(null);
    const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
    const [lastAIResponse, setLastAIResponse] = useState("");

    // History & Suggestions tracking
    const [allSuggestions, setAllSuggestions] = useState<SpeakingSuggestion[]>([]);
    const [startTime, setStartTime] = useState<number>(0);
    const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, session: SpeakingSession | null }>({ isOpen: false, session: null });
    const [sessionList, setSessionList] = useState<SpeakingSession[]>([]);
    const [showHistoryList, setShowHistoryList] = useState(false);

    // Image Mode (Tabs)
    const [imageModeTab, setImageModeTab] = useState(0);

    // Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef(0);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const transcriptRef = useRef<{ role: 'user' | 'model', text: string }[]>([]); // To track latest state in callback

    useEffect(() => {
        transcriptRef.current = transcript;
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);

    useEffect(() => {
        if (showHistoryList) {
            const loadHistory = async () => {
                const list = await firebaseService.getSpeakingSessions();
                setSessionList(list);
            };
            loadHistory();
        }
    }, [showHistoryList]);

    // --- Live Logic ---
    const startLiveSession = async (instruction: string) => {
        setIsConnecting(true);
        setTranscript([]);
        setSuggestion(null);
        setAllSuggestions([]);
        setLastAIResponse("");
        transcriptRef.current = [];
        setStartTime(Date.now());

        try {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }
            nextStartTimeRef.current = audioContextRef.current.currentTime + 0.5;

            // Call connectLive and AWAIT the session object
            const session = await geminiService.connectLive(
                "Kore",
                (pcmData) => playAudio(pcmData),
                (text, isUser, isFinal) => {
                    // Handle Transcript Updates
                    setTranscript(prev => {
                        const role = isUser ? 'user' : 'model';
                        const last = prev[prev.length - 1];

                        if (last && last.role === role) {
                            // Append to last message if same role
                            const newArr = [...prev];
                            newArr[newArr.length - 1] = { ...last, text: last.text + text };
                            return newArr;
                        } else {
                            // New message bubble
                            if (text) return [...prev, { role, text }];
                            return prev;
                        }
                    });

                    // Handle Turn Completion for AI Suggestions
                    if (isFinal) {
                        // If model finished speaking, trigger suggestions based on its last message
                        // We need to access the accumulated text for the model's last turn.
                        // Using ref to access latest transcript state safely
                        const currentTranscript = transcriptRef.current;
                        const lastMsg = currentTranscript[currentTranscript.length - 1];

                        if (lastMsg && lastMsg.role === 'model') {
                            // AI just finished talking
                            triggerSuggestion(lastMsg.text);
                        }
                    }
                },
                instruction
            );

            // Setup Microphone Input
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const inputCtx = new AudioContext({ sampleRate: 16000 });
            sourceRef.current = inputCtx.createMediaStreamSource(streamRef.current);
            processorRef.current = inputCtx.createScriptProcessor(4096, 1, 1);

            processorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);

                // Simple Visualizer Logic
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                if (rms > 0.02) setVisualizerState({ isUserSpeaking: true });
                else setVisualizerState({ isUserSpeaking: false });

                // Send Audio to Model
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Use session directly as it's awaited
                session.sendRealtimeInput({
                    media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
                    }
                });
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(inputCtx.destination);

            setIsLive(true);
            setIsConnecting(false);
        } catch (e: any) {
            if (e.message.includes('🔒')) {
                alert(e.message);
            } else {
                console.error(e);
                alert("Không thể kết nối Micro hoặc API. Vui lòng thử lại.");
            }
            setIsConnecting(false);
            setIsLive(false);
        }
    };

    const triggerSuggestion = async (aiText: string) => {
        if (!aiText.trim()) return;
        setIsGeneratingSuggestion(true);
        const result = await geminiService.generateSpeakingSuggestions(aiText);
        setSuggestion(result);
        setAllSuggestions(prev => [...prev, result]);
        setIsGeneratingSuggestion(false);
    };

    const stopLiveSession = async () => {
        // Save Session Data if valid
        if (isLive && transcriptRef.current.length > 0) {
            const sessionData: SpeakingSession = {
                id: Date.now().toString(),
                timestamp: startTime,
                durationSeconds: Math.floor((Date.now() - startTime) / 1000),
                transcript: transcriptRef.current,
                suggestions: allSuggestions
            };
            await firebaseService.saveSpeakingSession(sessionData);
        }

        setIsLive(false);
        streamRef.current?.getTracks().forEach(t => t.stop());
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
        setVisualizerState({ isUserSpeaking: false });
    };

    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
        const ctx = audioContextRef.current;
        const int16 = new Int16Array(arrayBuffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
        const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
        audioBuffer.copyToChannel(float32, 0);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + audioBuffer.duration;
    };

    useEffect(() => { return () => { if (isLive) stopLiveSession(); } }, []);

    // --- Main Render ---
    if (!mode) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in p-4">
                <div onClick={() => setMode('basic')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                    <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-4xl mb-6 group-hover:rotate-12 transition-transform">🎙</div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Live Conversation</h3>
                    <p className="text-gray-500 dark:text-gray-400">Luyện nói trực tiếp với AI (Split Screen + Hints).</p>
                </div>
                <div onClick={() => setMode('advanced')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-purple-100 dark:border-purple-900 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                    <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center text-4xl mb-6 group-hover:rotate-12 transition-transform">⏱️</div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Monologue Practice</h3>
                    <p className="text-gray-500 dark:text-gray-400">Luyện nói 2 phút theo chủ đề.</p>
                </div>
                <div onClick={() => setMode('image')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                    <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-4xl mb-6 group-hover:rotate-12 transition-transform">🖼</div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Describe Image</h3>
                    <p className="text-gray-500 dark:text-gray-400">Mô tả tranh và so sánh (Part 2 & 3).</p>
                </div>
            </div>
        );
    }

    // Common Header
    const renderHeader = (title: string) => (
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
            <div className="flex items-center gap-3">
                <button onClick={() => { stopLiveSession(); setMode(null); }} className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg font-bold transition-colors">← Back</button>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h2>
            </div>
            {mode === 'basic' && (
                <button onClick={() => setShowHistoryList(true)} className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                    <span>📜</span> Lịch sử luyện tập
                </button>
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col animate-fade-in bg-white dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 relative">
            {renderHeader(mode === 'basic' ? 'Live Conversation' : mode === 'advanced' ? 'Monologue Practice' : 'Describe Image')}

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                {/* PART 1: LIVE MODE */}
                {mode === 'basic' && (
                    <div className="flex-1 flex flex-col lg:flex-row h-full relative">

                        {/* LEFT: Visualizer & Controls */}
                        <div className="flex-1 lg:flex-none lg:w-1/4 xl:w-1/4 bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-6 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 relative min-h-[300px]">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
                            <VoiceVisualizer isActive={isLive} isUserSpeaking={visualizerState.isUserSpeaking} />
                            <div className="mt-8 text-center z-10">
                                {!isLive ? (
                                    <button
                                        onClick={() => startLiveSession("You are a friendly English tutor. Engage in a conversation about daily life, hobbies, or work. Correct my mistakes gently.")}
                                        disabled={isConnecting}
                                        className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-2 mx-auto disabled:opacity-50"
                                    >
                                        {isConnecting ? 'Connecting...' : '🎙 Start'}
                                    </button>
                                ) : (
                                    <div className="space-y-4">
                                        <p className="text-sm text-gray-700 dark:text-gray-200 font-medium animate-pulse">
                                            {visualizerState.isUserSpeaking ? "Listening..." : "AI Speaking..."}
                                        </p>
                                        <button onClick={stopLiveSession} className="bg-red-500 text-white px-6 py-2 rounded-full font-bold text-sm shadow-lg hover:bg-red-600 transition-all">End</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* MIDDLE: Transcript & AI Tutor Support */}
                        <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900 min-w-0 border-r border-gray-200 dark:border-gray-700">
                            {/* Real-time Transcript */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 sticky top-0 bg-gray-50/95 dark:bg-gray-900/95 py-1 z-10">Live Transcript</div>
                                {transcript.length === 0 && <p className="text-gray-400 italic text-sm text-center mt-10">Conversation will appear here...</p>}
                                {transcript.map((t, i) => (
                                    <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[90%] p-3 rounded-xl text-sm ${t.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-none shadow-sm'}`}>
                                            {t.text}
                                        </div>
                                    </div>
                                ))}
                                <div ref={transcriptEndRef} />
                            </div>

                            {/* AI Tutor Support Panel */}
                            <div className="h-1/2 min-h-[200px] max-h-[300px] border-t-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col overflow-hidden">
                                <div className="flex justify-between items-center mb-2 shrink-0">
                                    <h3 className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 text-sm">
                                        <span>🤖</span> AI Tutor Hints
                                    </h3>
                                    {isGeneratingSuggestion && <span className="text-xs text-gray-400 animate-pulse">Generating...</span>}
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {suggestion ? (
                                        <div className="space-y-4 animate-fade-in">
                                            {/* Hints */}
                                            <div>
                                                <div className="flex flex-wrap gap-2">
                                                    {suggestion.hints.map((hint, i) => (
                                                        <span key={i} className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-md text-xs font-medium border border-indigo-100 dark:border-indigo-800">
                                                            {hint}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Sample Answer */}
                                            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800">
                                                <p className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase mb-1">Sample Answer (B2)</p>
                                                <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{suggestion.sampleAnswer}</p>
                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 pt-1 border-t border-green-200 dark:border-green-800 italic">{suggestion.vietnameseTranslation}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 text-center text-xs p-4 border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-xl">
                                            Waiting for AI to finish a question... <br /> Suggestions will appear here.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Panel */}
                        <ManualVocabPanel
                            onSave={(w, m, e) => onSaveVocab(w, m, `Live Conversation - ${e}`, 'speaking')}
                            folderLabel="Live Practice"
                            className="w-full lg:w-72 xl:w-80 border-l border-gray-200 dark:border-gray-700"
                        />
                    </div>
                )}

                {/* PART 2: MONOLOGUE MODE (UPDATED - AI Generator Removed) */}
                {mode === 'advanced' && (
                    <div className="flex-1 flex flex-col lg:flex-row h-full relative">
                        {/* LEFT: Iframe View */}
                        <div className="w-full lg:w-1/2 h-full border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 bg-white relative">
                            <iframe
                                src="https://www.aptiskey.com/speaking_question4.html"
                                className="w-full h-full border-none"
                                title="Part 2 Questions"
                            />
                        </div>

                        {/* RIGHT: Manual Vocab Only */}
                        <ManualVocabPanel
                            onSave={(w, m, e) => onSaveVocab(w, m, `Monologue Practice - ${e}`, 'speaking')}
                            folderLabel="Monologue Practice"
                            className="w-full lg:w-1/2"
                        />
                    </div>
                )}

                {/* PART 3: IMAGE MODE (PRESERVED) */}
                {mode === 'image' && (
                    <div className="flex-1 flex flex-col lg:flex-row h-full relative">
                        <div className="flex-1 flex flex-col h-full">
                            <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                                {[{ id: 0, title: 'Part 2: Describe' }, { id: 1, title: 'Part 3: Compare' }].map(t => (
                                    <button key={t.id} onClick={() => setImageModeTab(t.id)} className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${imageModeTab === t.id ? 'bg-white dark:bg-gray-800 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{t.title}</button>
                                ))}
                            </div>
                            <div className="flex-1 bg-white relative">
                                <iframe
                                    src={imageModeTab === 0 ? 'https://aptiskey.com/speaking_question2.html' : 'https://aptiskey.com/speaking_question3.html'}
                                    className="w-full h-full border-none"
                                    title="Speaking Resource"
                                />
                            </div>
                        </div>
                        <ManualVocabPanel
                            onSave={(w, m, e) => onSaveVocab(w, m, `Image Description - ${e}`, 'speaking')}
                            folderLabel="Image Practice"
                            className="w-full lg:w-72 xl:w-80 border-l border-gray-200 dark:border-gray-700"
                        />
                    </div>
                )}
            </div>

            {/* History List Modal (Preserved) */}
            {showHistoryList && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Lịch sử Luyện Nói</h3>
                            <button onClick={() => setShowHistoryList(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {sessionList.map(session => (
                                <div
                                    key={session.id}
                                    onClick={() => { setHistoryModal({ isOpen: true, session }); }}
                                    className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-100 cursor-pointer transition-all group"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-gray-800 dark:text-white text-sm">Session {new Date(session.timestamp).toLocaleDateString()}</p>
                                            <p className="text-xs text-gray-500">{new Date(session.timestamp).toLocaleTimeString()} • {Math.floor(session.durationSeconds / 60)}m {session.durationSeconds % 60}s</p>
                                        </div>
                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{session.transcript.length} turns</span>
                                    </div>
                                </div>
                            ))}
                            {sessionList.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Chưa có lịch sử.</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* History Detail Modal (Preserved) */}
            {historyModal.isOpen && historyModal.session && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Chi tiết Session</h3>
                                <p className="text-xs text-gray-500">{new Date(historyModal.session.timestamp).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setHistoryModal({ isOpen: false, session: null })} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
                        </div>
                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            <div className="flex-1 overflow-y-auto p-6 border-r border-gray-100 dark:border-gray-700">
                                <h4 className="font-bold text-gray-500 uppercase text-xs mb-4">Transcript</h4>
                                <div className="space-y-4">
                                    {historyModal.session.transcript.map((t, i) => (
                                        <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[90%] p-3 rounded-xl text-sm ${t.role === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
                                                <span className="block text-[10px] font-bold opacity-50 mb-1">{t.role === 'user' ? 'You' : 'AI Tutor'}</span>
                                                {t.text}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="w-full md:w-1/3 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto p-6">
                                <h4 className="font-bold text-indigo-500 uppercase text-xs mb-4">AI Suggestions & Hints</h4>
                                {historyModal.session.suggestions && historyModal.session.suggestions.length > 0 ? (
                                    <div className="space-y-6">
                                        {historyModal.session.suggestions.map((s: SpeakingSuggestion, i: number) => (
                                            <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                                <div className="flex flex-wrap gap-1 mb-3">
                                                    {s.hints.map((h, hi) => <span key={hi} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs font-bold border border-indigo-100">{h}</span>)}
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-300 italic mb-2">"{s.sampleAnswer}"</p>
                                                <p className="text-[10px] text-gray-400">{s.vietnameseTranslation}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-gray-400 text-sm italic">Không có gợi ý nào được lưu.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Main Component ---
export const EnglishLearning: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'vocab' | 'speaking' | 'listening' | 'reading' | 'writing'>('vocab');
    const [level, setLevel] = useState('B1');
    const [showToast, setShowToast] = useState(false);

    const saveVocabulary = async (word: string, mean: string, context: string, targetFolderId?: string) => {
        // 1. Load and Prepare Folders
        let folders: VocabFolder[] = [];
        try {
            const fLocal = localStorage.getItem('dh_vocab_folders');
            if (fLocal) folders = JSON.parse(fLocal);
            else folders = [
                { id: 'root', name: 'Thư mục gốc', parentId: null },
                { id: 'folder_vocab_general', name: 'Vocab', parentId: 'root' },
                { id: 'reading', name: 'Reading Practice', parentId: 'root' },
                { id: 'speaking', name: 'Speaking Practice', parentId: 'root' },
                { id: 'writing', name: 'Writing Task', parentId: 'root' },
                { id: 'listening', name: 'Listening Practice', parentId: 'root' },
            ];
        } catch (e) { folders = []; }

        // 2. Find or Create Target Folder
        let targetFolder: VocabFolder | undefined;

        if (targetFolderId) {
            targetFolder = folders.find(f => f.id === targetFolderId);
            if (!targetFolder) {
                let folderName = "Practice";
                if (targetFolderId === 'speaking') folderName = "Speaking Practice";
                if (targetFolderId === 'listening') folderName = "Listening Practice";
                if (targetFolderId === 'reading') folderName = "Reading Practice";
                if (targetFolderId === 'writing') folderName = "Writing Task";
                if (targetFolderId === 'folder_vocab_general') folderName = "Vocab";

                targetFolder = { id: targetFolderId, name: folderName, parentId: 'root' };
                folders.push(targetFolder);
            }
        }

        if (!targetFolder) {
            targetFolder = folders.find(f => f.name === 'Vocab' || f.id === 'folder_vocab_general');
            if (!targetFolder) {
                targetFolder = { id: 'folder_vocab_general', name: 'Vocab', parentId: 'root' };
                folders.push(targetFolder);
            }
        }

        localStorage.setItem('dh_vocab_folders', JSON.stringify(folders));
        if (firebaseService.currentUser) {
            await firebaseService.saveUserData('vocab_folders', folders);
        }

        // 3. Save the term
        const saved = localStorage.getItem('dh_vocab_terms');
        const terms: VocabTerm[] = saved ? JSON.parse(saved) : [];

        if (terms.some(t => t.term.toLowerCase() === word.toLowerCase() && t.folderId === targetFolder?.id)) {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 2000);
            return;
        }

        const newTerm: VocabTerm = {
            id: Date.now().toString(),
            term: word,
            meaning: mean,
            definition: "",
            example: context,
            partOfSpeech: "Unknown",
            folderId: targetFolder!.id,
            learned: false,
            createdAt: new Date().toISOString()
        };
        terms.push(newTerm);

        localStorage.setItem('dh_vocab_terms', JSON.stringify(terms));
        if (firebaseService.currentUser) {
            await firebaseService.saveUserData('vocab_terms', terms);
        }

        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
    };

    return (
        <div className="max-w-7xl mx-auto pb-10 h-[calc(100vh-100px)] flex flex-col relative">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
                <div><h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Luyện Kỹ Năng Tiếng Anh</h1></div>
                <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300 pl-2">Trình độ:</span>
                    <select value={level} onChange={e => setLevel(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border-none rounded-md px-3 py-1.5 text-sm font-bold text-blue-700 dark:text-blue-400 outline-none"><option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option></select>
                </div>
            </div>
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto no-scrollbar shrink-0 pb-1">
                {[{ id: 'vocab', label: 'Từ vựng & Ngữ pháp', icon: '⚡' }, { id: 'speaking', label: 'Luyện Nói', icon: '🗣️' }, { id: 'listening', label: 'Luyện Nghe', icon: '🎧' }, { id: 'reading', label: 'Luyện Đọc', icon: '📖' }, { id: 'writing', label: 'Luyện Viết', icon: '✍️' }].map((t) => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`px-4 md:px-6 py-3 rounded-t-lg text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === t.id ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-b-transparent shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}><span>{t.icon}</span> {t.label}</button>
                ))}
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 flex-1 rounded-2xl overflow-hidden border border-gray-100/50 dark:border-gray-700/50 shadow-sm">
                {activeTab === 'vocab' && <VocabAndGrammarModule level={level} onSaveVocab={saveVocabulary} />}
                {activeTab === 'speaking' && <SpeakingPractice level={level} onSaveVocab={saveVocabulary} />}
                {activeTab === 'listening' && <ListeningModule onSaveVocab={saveVocabulary} />}
                {activeTab === 'reading' && <ReadingModule level={level} onSaveVocab={saveVocabulary} />}
                {activeTab === 'writing' && <WritingModule level={level} onSaveVocab={saveVocabulary} />}
            </div>

            {showToast && (
                <div className="absolute bottom-4 right-1/2 translate-x-1/2 md:right-6 md:translate-x-0 bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 animate-bounce-up z-50">
                    <span>✅</span> Đã lưu vào thư mục
                </div>
            )}
        </div>
    );
};
