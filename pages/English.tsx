
import React, { useState, useEffect, useRef } from 'react';
import { geminiService } from '../services/gemini';
import { Vocabulary, VocabTerm, VocabFolder } from '../types';
import { Link } from 'react-router-dom';

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

// --- Types & Helpers ---
type SpeakingMode = 'basic' | 'advanced' | 'image' | 'test' | null;

interface SpeakingSessionData {
  topic: string;
  question: string;
  imageKeyword?: string;
  hints: string[];
  sampleAnswer: string;
  answerStrategy?: string;
  vocabulary: {word: string, def: string}[];
}

interface SpeakingAnalysis {
    score: number;
    feedback: string;
    grammarCorrections: { original: string, correction: string, explanation: string }[];
    betterWaysToSay: string[];
}

interface BulkAnalysis {
    overallScore: number;
    generalFeedback: string;
    detailedReview: {
        questionIndex: number;
        score: number;
        feedback: string;
        correction: string;
    }[];
}

interface UserAnswer {
    question: string;
    answer: string;
}

interface GrammarQuestion {
    id: number;
    type: 'multiple-choice' | 'fill-in-blank' | 'error-correction' | 'reordering';
    question: string;
    options?: string[]; 
    correctAnswer: string;
}

interface GrammarResult {
    score: number;
    results: {
        id: number;
        isCorrect: boolean;
        explanation: string;
    }[];
}

// --- UI Helper Components ---
const SimpleMarkdownRenderer = ({ content, className = "" }: { content: string, className?: string }) => {
    if (!content) return null;
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return (
        <div className={`space-y-3 text-gray-800 dark:text-gray-200 ${className}`}>
            {lines.map((line, idx) => {
                const parseBold = (text: string) => {
                    const parts = text.split(/(\*\*.*?\*\*)/g);
                    return parts.map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <span key={i} className="font-bold text-blue-900 dark:text-blue-300">{part.slice(2, -2)}</span>;
                        }
                        return part;
                    });
                };
                const isHeader = (line.trim().startsWith('**') && line.includes(':')) || line.trim().startsWith('##');
                if (isHeader) {
                     const cleanLine = line.replace(/^#+\s/, ''); 
                     return <h4 key={idx} className="text-lg font-bold text-blue-700 dark:text-blue-400 mt-4 mb-1 border-b border-blue-100 dark:border-blue-800 pb-1">{parseBold(cleanLine)}</h4>
                }
                const isListItem = line.trim().startsWith('* ') || line.trim().startsWith('- ') || /^\d+\./.test(line.trim());
                if (isListItem) {
                    const cleanLine = line.replace(/^[\*\-]\s|\d+\.\s/, '');
                    return (
                        <div key={idx} className="flex gap-3 ml-1">
                            <span className="text-blue-500 dark:text-blue-400 font-bold mt-1 flex-shrink-0">•</span>
                            <p className="text-base leading-relaxed text-gray-700 dark:text-gray-300">{parseBold(cleanLine)}</p>
                        </div>
                    )
                }
                return <p key={idx} className="text-base leading-relaxed text-gray-700 dark:text-gray-300">{parseBold(line)}</p>;
            })}
        </div>
    );
};

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

// --- VOCAB & GRAMMAR MODULE ---
const VocabAndGrammarModule = ({ level, onSaveVocab }: { level: string, onSaveVocab: (w: string, m: string, c: string) => void }) => {
    const [subTab, setSubTab] = useState<'selection' | 'vocab' | 'grammar'>('selection');
    const [grammarMode, setGrammarMode] = useState<'selection' | 'ai' | 'external'>('selection');
    const [vocabSubMode, setVocabSubMode] = useState<'menu' | 'learn_ai' | 'review_lib' | 'challenge'>('menu');
    
    const [dailyWords, setDailyWords] = useState<VocabTerm[]>([]);
    const [flashcardIndex, setFlashcardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loadingVocab, setLoadingVocab] = useState(false);
    const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
    const [challengeIndex, setChallengeIndex] = useState(0);
    const [userInput, setUserInput] = useState('');
    const [challengeFeedback, setChallengeFeedback] = useState<'none' | 'correct' | 'incorrect'>('none');
    const [grammarQuestions, setGrammarQuestions] = useState<GrammarQuestion[]>([]);
    const [userGrammarAnswers, setUserGrammarAnswers] = useState<Record<number, string>>({});
    const [grammarResult, setGrammarResult] = useState<GrammarResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // New filters state
    const [topic, setTopic] = useState('');

    const startAILearn = async () => { setLoadingVocab(true); setDailyWords([]); setSavedSet(new Set()); try { const jsonStr = await geminiService.generateDailyVocabulary(level, topic); const terms = JSON.parse(jsonStr.replace(/```json|```/g, '').trim()); const mapped: VocabTerm[] = terms.map((t: any, i: number) => ({ id: `ai_${Date.now()}_${i}`, term: t.term, partOfSpeech: t.partOfSpeech, meaning: t.meaning, definition: t.definition, example: t.example, folderId: 'temp_ai', learned: false, createdAt: new Date().toISOString() })); setDailyWords(mapped); setFlashcardIndex(0); setIsFlipped(false); setVocabSubMode('learn_ai'); } catch (e) { alert("Lỗi khi tạo từ vựng."); } finally { setLoadingVocab(false); } };
    const startReviewLibrary = () => { const savedTermsStr = localStorage.getItem('dh_vocab_terms'); if (!savedTermsStr) { alert("Thư viện trống."); return; } const allTerms: VocabTerm[] = JSON.parse(savedTermsStr); if (allTerms.length === 0) { alert("Thư viện trống."); return; } const shuffled = [...allTerms].sort(() => 0.5 - Math.random()); setDailyWords(shuffled.slice(0, 10)); setFlashcardIndex(0); setIsFlipped(false); setVocabSubMode('review_lib'); };
    const startChallenge = () => { const savedTermsStr = localStorage.getItem('dh_vocab_terms'); if (!savedTermsStr) { alert("Thư viện trống."); return; } const allTerms: VocabTerm[] = JSON.parse(savedTermsStr); if (allTerms.length < 5) { alert("Cần ít nhất 5 từ để chơi."); return; } const shuffled = [...allTerms].sort(() => 0.5 - Math.random()); setDailyWords(shuffled.slice(0, 10)); setChallengeIndex(0); setUserInput(''); setChallengeFeedback('none'); setVocabSubMode('challenge'); };
    const checkChallenge = () => { if (userInput.toLowerCase().trim() === dailyWords[challengeIndex].term.toLowerCase().trim()) { setChallengeFeedback('correct'); } else { setChallengeFeedback('incorrect'); } };
    const nextChallenge = () => { if (challengeIndex < dailyWords.length - 1) { setChallengeIndex(prev => prev + 1); setUserInput(''); setChallengeFeedback('none'); } else { alert("Hoàn thành!"); setVocabSubMode('menu'); } };
    const handleSaveCurrentCard = () => { const current = dailyWords[flashcardIndex]; onSaveVocab(current.term, current.meaning, "Học Từ Mới (AI)"); setSavedSet(prev => new Set(prev).add(current.id)); };
    const startGrammarAI = async () => { setGrammarMode('ai'); setIsLoading(true); setGrammarQuestions([]); setGrammarResult(null); setUserGrammarAnswers({}); try { const jsonStr = await geminiService.generateGrammarQuiz(level, topic); const questions = JSON.parse(jsonStr.replace(/```json|```/g, '').trim()); setGrammarQuestions(questions); } catch (e) { alert("Lỗi tạo bài tập."); setGrammarMode('selection'); } finally { setIsLoading(false); } };
    const submitGrammar = async () => { setIsLoading(true); try { const jsonStr = await geminiService.gradeGrammarQuiz(level, grammarQuestions, userGrammarAnswers); const result = JSON.parse(jsonStr.replace(/```json|```/g, '').trim()); setGrammarResult(result); } catch (e) { alert("Lỗi chấm điểm."); } finally { setIsLoading(false); } };

    if (subTab === 'selection') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in h-full content-center py-4 md:py-10">
                <div onClick={() => setSubTab('vocab')} className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all cursor-pointer group text-center">
                    <div className="text-5xl md:text-6xl mb-4 group-hover:scale-110 transition-transform">📚</div><h3 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white mb-2">Học Từ Vựng</h3><p className="text-sm md:text-base text-gray-500 dark:text-gray-400">Học từ mới với AI, ôn tập Flashcard và Game thử thách.</p>
                </div>
                <div onClick={() => { setSubTab('grammar'); setGrammarMode('selection'); }} className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all cursor-pointer group text-center">
                    <div className="text-5xl md:text-6xl mb-4 group-hover:scale-110 transition-transform">✍️</div><h3 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white mb-2">Luyện Ngữ Pháp</h3><p className="text-sm md:text-base text-gray-500 dark:text-gray-400">Luyện tập với AI hoặc làm bộ đề thi chuẩn.</p>
                </div>
            </div>
        );
    }
    
    // ... (Vocab Sub Modes - Same as before)
     if (subTab === 'vocab') {
         if (vocabSubMode === 'menu') {
             return (
                 <div className="h-full flex flex-col animate-fade-in">
                     <button onClick={() => setSubTab('selection')} className="mb-6 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white flex items-center gap-2 w-fit">← Quay lại</button>
                     
                     <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4 items-center">
                         <span className="font-bold text-gray-700 dark:text-gray-300">Tùy chọn AI:</span>
                         <input 
                             type="text" 
                             placeholder="Nhập chủ đề (VD: Business, Travel)..." 
                             value={topic}
                             onChange={e => setTopic(e.target.value)}
                             className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                         />
                     </div>

                     <div className="flex-1 flex items-center justify-center">
                         <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-5xl">
                             <div onClick={startAILearn} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg cursor-pointer transition-all text-center group">
                                 <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🤖</div><h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Học Từ Mới (AI)</h3>
                             </div>
                             <div onClick={startReviewLibrary} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-green-100 dark:border-green-900 hover:border-green-400 dark:hover:border-green-600 hover:shadow-lg cursor-pointer transition-all text-center group">
                                 <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🗂️</div><h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Ôn Tập (Thư Viện)</h3>
                             </div>
                             <div onClick={startChallenge} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900 hover:border-orange-400 dark:hover:border-orange-600 hover:shadow-lg cursor-pointer transition-all text-center group">
                                 <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🏆</div><h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Thử Thách (Game)</h3>
                             </div>
                         </div>
                     </div>
                 </div>
             );
         }
         
         if (vocabSubMode === 'learn_ai' || vocabSubMode === 'review_lib') {
             if (loadingVocab) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
             const currentCard = dailyWords[flashcardIndex]; const isSaved = savedSet.has(currentCard.id);
             return (
                 <div className="h-full flex flex-col animate-fade-in">
                     <div className="flex justify-between mb-4"><button onClick={() => setVocabSubMode('menu')} className="text-gray-500 hover:text-gray-800 dark:hover:text-white">← Menu</button><span className="font-bold text-gray-600 dark:text-gray-400">{vocabSubMode === 'learn_ai' ? 'AI Vocabulary' : 'Library Review'}</span></div>
                     <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 md:p-6">
                          <div className="w-full max-w-md perspective-1000">
                             <div onClick={() => setIsFlipped(!isFlipped)} className="relative w-full aspect-[4/3] cursor-pointer group">
                                 <div className={`w-full h-full transition-all duration-500 transform-style-3d relative shadow-2xl rounded-2xl ${isFlipped ? 'rotate-y-180' : ''}`} style={{transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'}}>
                                     
                                     {/* Front */}
                                     <div className="absolute inset-0 backface-hidden bg-white dark:bg-gray-800 rounded-2xl flex flex-col items-center justify-center border-2 border-blue-100 dark:border-blue-900 p-8 text-center hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                                         <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{currentCard.partOfSpeech}</span>
                                         <h2 className="text-4xl font-bold text-blue-800 dark:text-blue-300 mb-2">{currentCard.term}</h2>
                                         <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-4">Tap to flip ↺</p>
                                     </div>
 
                                     {/* Back */}
                                     <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex flex-col items-center justify-center text-white p-8 text-center" style={{transform: 'rotateY(180deg)'}}>
                                         <h3 className="text-2xl font-bold mb-2">{currentCard.meaning}</h3>
                                         {currentCard.definition && <p className="text-sm text-blue-100 mb-4 italic">"{currentCard.definition}"</p>}
                                         {currentCard.example && (
                                             <div className="bg-white/10 p-3 rounded-lg text-sm w-full">
                                                 <p className="font-mono text-xs text-blue-200 mb-1">Ex:</p>
                                                 <p>"{currentCard.example}"</p>
                                             </div>
                                         )}
                                     </div>
                                 </div>
                             </div>
 
                             {/* Controls */}
                             <div className="flex justify-between items-center mt-8 px-4">
                                 <button onClick={() => { setFlashcardIndex(prev => (prev - 1 + dailyWords.length) % dailyWords.length); setIsFlipped(false); }} className="p-4 bg-white dark:bg-gray-800 rounded-full shadow hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">←</button>
                                 <div className="flex flex-col items-center gap-2">
                                     <span className="font-bold text-gray-500 dark:text-gray-400">{flashcardIndex + 1} / {dailyWords.length}</span>
                                     {vocabSubMode === 'learn_ai' && (
                                         <button onClick={handleSaveCurrentCard} disabled={isSaved} className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${isSaved ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                                             {isSaved ? '✓ Saved' : '+ Save to Library'}
                                         </button>
                                     )}
                                 </div>
                                 <button onClick={() => { setFlashcardIndex(prev => (prev + 1) % dailyWords.length); setIsFlipped(false); }} className="p-4 bg-white dark:bg-gray-800 rounded-full shadow hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">→</button>
                             </div>
                          </div>
                     </div>
                 </div>
             );
         }
         if (vocabSubMode === 'challenge') {
             return (
                 <div className="h-full flex flex-col animate-fade-in">
                     <button onClick={() => setVocabSubMode('menu')} className="mb-4 text-gray-500">← Menu</button>
                     <div className="flex-1 flex items-center justify-center">
                         <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-gray-100 dark:border-gray-700">
                             <span className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-2 block">Challenge {challengeIndex + 1}/{dailyWords.length}</span>
                             <h2 className="text-2xl font-bold mb-8 text-gray-800 dark:text-white">{dailyWords[challengeIndex].meaning}</h2>
                             
                             {challengeFeedback === 'none' ? (
                                 <>
                                     <input 
                                         value={userInput} 
                                         onChange={e=>setUserInput(e.target.value)} 
                                         onKeyDown={e => e.key === 'Enter' && checkChallenge()}
                                         className="w-full border-b-2 border-gray-300 dark:border-gray-600 text-center text-xl mb-6 bg-transparent text-gray-900 dark:text-white focus:border-blue-500 outline-none py-2" 
                                         placeholder="Type English word..." 
                                         autoFocus
                                     />
                                     <button onClick={checkChallenge} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg transition-transform active:scale-95">Check Answer</button>
                                 </>
                             ) : (
                                 <div className="animate-fade-in-up">
                                     <div className={`text-lg font-bold mb-6 p-4 rounded-xl ${challengeFeedback==='correct'?'bg-green-50 text-green-600 border border-green-200':'bg-red-50 text-red-600 border border-red-200'}`}>
                                         {challengeFeedback === 'correct' ? '🎉 Correct! Great job.' : (
                                             <div>
                                                 <p>❌ Incorrect.</p>
                                                 <p className="text-sm mt-1 text-gray-600">Answer: <span className="font-bold text-red-600">{dailyWords[challengeIndex].term}</span></p>
                                             </div>
                                         )}
                                     </div>
                                     <button onClick={nextChallenge} className="w-full bg-gray-800 dark:bg-white text-white dark:text-gray-900 py-3 rounded-xl font-bold shadow-lg transition-transform active:scale-95">Next Question →</button>
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>
              );
         }
     }

    // ... (Grammar Sub Modes - Same as before)
    if (subTab === 'grammar') {
        if (grammarMode === 'selection') {
            return (
                <div className="h-full flex flex-col animate-fade-in">
                     <button onClick={() => setSubTab('selection')} className="mb-6 text-gray-500">← Quay lại</button>
                     <div className="flex-1 flex items-center justify-center">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
                            <div onClick={startGrammarAI} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900 hover:shadow-xl cursor-pointer transition-all text-center">
                                <div className="text-6xl mb-4">🤖</div><h3 className="text-2xl font-bold text-gray-800 dark:text-white">Luyện tập với AI</h3>
                            </div>
                            <div onClick={() => setGrammarMode('external')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-teal-100 dark:border-teal-900 hover:shadow-xl cursor-pointer transition-all text-center">
                                <div className="text-6xl mb-4">📝</div><h3 className="text-2xl font-bold text-gray-800 dark:text-white">Luyện Bộ Đề (Aptis)</h3>
                            </div>
                             {/* Link to Tips */}
                            <div onClick={() => setGrammarMode('selection')} className="md:col-span-2 mt-4 text-center">
                                <a href="https://aptiskey.com/grammar_meo.html" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold">📖 Ôn tập Mẹo Ngữ Pháp (AptisKey) ↗</a>
                            </div>
                        </div>
                     </div>
                </div>
            );
        }
        if (grammarMode === 'external') return <div className="h-full p-4"><ExternalBrowser url="https://aptiskey.com/grammar_bode.html" title="Bộ đề Luyện Ngữ Pháp" onClose={() => setGrammarMode('selection')} /></div>;
        
        // AI Grammar Quiz UI
        return (
             <div className="h-full flex flex-col animate-fade-in">
                 <button onClick={() => setGrammarMode('selection')} className="mb-4 text-gray-500">← Exit</button>
                 <div className="flex justify-between items-center mb-6">
                     <div>
                         <h3 className="font-bold text-2xl text-gray-800 dark:text-white">Daily Grammar Quiz</h3>
                         <p className="text-sm text-gray-500">Level: {level}</p>
                     </div>
                     <a href="https://aptiskey.com/grammar_meo.html" target="_blank" rel="noreferrer" className="text-xs bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full border border-yellow-200 hover:bg-yellow-200 font-bold">💡 Xem Mẹo</a>
                 </div>

                 {!isLoading ? <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                    {grammarQuestions.map((q,i)=> (
                        <div key={q.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <p className="font-bold text-lg text-gray-800 dark:text-white mb-4"><span className="text-blue-500 mr-2">#{i+1}</span> {q.question}</p>
                            {q.type==='multiple-choice' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-2">
                                    {q.options?.map(o => (
                                        <label key={o} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${userGrammarAnswers[q.id]===o ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                            <input type="radio" name={`q${q.id}`} checked={userGrammarAnswers[q.id]===o} onChange={()=>setUserGrammarAnswers({...userGrammarAnswers, [q.id]:o})} className="mr-3 w-4 h-4 text-blue-600" />
                                            <span className="text-gray-700 dark:text-gray-200 font-medium">{o}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <input value={userGrammarAnswers[q.id]||''} onChange={e=>setUserGrammarAnswers({...userGrammarAnswers, [q.id]:e.target.value})} className="w-full mt-2 border border-gray-300 dark:border-gray-600 p-3 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Type your answer..." />
                            )}
                        </div>
                    ))}
                    
                    <button onClick={submitGrammar} className="bg-green-600 hover:bg-green-700 text-white text-lg px-8 py-4 rounded-xl font-bold w-full mb-10 shadow-lg shadow-green-500/30 transition-transform active:scale-95">Submit Answers ✨</button>
                 </div> : <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}

                 {grammarResult && (
                     <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                         <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                             <div className="text-center mb-6 shrink-0">
                                 <div className="text-6xl mb-2">{grammarResult.score >= 8 ? '🏆' : grammarResult.score >= 5 ? '😊' : '😅'}</div>
                                 <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Score: {grammarResult.score}/10</h2>
                             </div>
                             
                             <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                 {grammarResult.results.map(r => (
                                     <div key={r.id} className={`p-4 rounded-xl border-l-4 ${r.isCorrect ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500'}`}>
                                         <div className="flex justify-between items-start mb-1">
                                             <span className={`font-bold ${r.isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>Question {r.id}: {r.isCorrect ? 'Correct' : 'Incorrect'}</span>
                                         </div>
                                         <p className="text-sm text-gray-700 dark:text-gray-300">{r.explanation}</p>
                                     </div>
                                 ))}
                             </div>
                             
                             <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end shrink-0">
                                 <button onClick={() => setGrammarMode('selection')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg">Close & Return</button>
                             </div>
                         </div>
                     </div>
                 )}
             </div>
        );
    }
    return null;
}

// --- WRITING MODULE ---
const WritingModule = ({ level, onSaveVocab }: { level: string, onSaveVocab: (w: string, m: string, c: string) => void }) => {
    const [topic, setTopic] = useState('');
    const [essay, setEssay] = useState('');
    const [isGrading, setIsGrading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
    
    // UI State
    const [showIframe, setShowIframe] = useState(false);
    const [activeResultTab, setActiveResultTab] = useState<'score' | 'feedback' | 'model' | 'vocab'>('score');
    const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);

    // Timer & Word Count
    const [timer, setTimer] = useState(0); // Seconds
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerDuration, setTimerDuration] = useState(20 * 60); // Default 20 min

    useEffect(() => {
        let interval: any;
        if (isTimerRunning && timer > 0) {
            interval = setInterval(() => setTimer(t => t - 1), 1000);
        } else if (timer === 0 && isTimerRunning) {
            setIsTimerRunning(false);
            alert("Time's up!");
        }
        return () => clearInterval(interval);
    }, [isTimerRunning, timer]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const getWordCount = (text: string) => {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    };

    const handleGenerateTopic = async (type: 'task1' | 'task2') => {
        setIsGeneratingTopic(true);
        try {
            const newTopic = await geminiService.generateWritingTopic(level, type);
            setTopic(newTopic);
            // Auto set timer based on task
            const duration = type === 'task1' ? 20 * 60 : 40 * 60;
            setTimerDuration(duration);
            setTimer(duration);
        } catch (e) {
            alert("Lỗi tạo đề bài.");
        } finally {
            setIsGeneratingTopic(false);
        }
    };

    const handleGrade = async () => {
        if (!topic.trim() || !essay.trim()) { alert("Vui lòng nhập đề bài và bài làm."); return; }
        setIsGrading(true); setResult(null);
        setIsTimerRunning(false); // Stop timer
        try { 
            const jsonStr = await geminiService.gradeWritingPractice(level, topic, essay); 
            setResult(JSON.parse(jsonStr.replace(/```json|```/g, '').trim())); 
            setActiveResultTab('score');
        } 
        catch (e) { alert("Có lỗi khi chấm điểm."); } finally { setIsGrading(false); }
    };

    const handleSave = (word: string, mean: string, ctx: string) => { 
        onSaveVocab(word, mean, "Writing Practice"); 
        setSavedWords(prev => new Set(prev).add(word)); 
    };

    return (
        <div className="flex flex-col lg:flex-row h-full animate-fade-in overflow-hidden bg-gray-50 dark:bg-gray-900">
            {/* Left: Reference (Collapsible) */}
            <div className={`${showIframe ? 'w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r' : 'w-0 border-none'} h-[300px] lg:h-full border-gray-200 dark:border-gray-800 bg-white transition-all duration-300 relative shrink-0 overflow-hidden`}>
                <div className="absolute top-0 left-0 right-0 bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700 text-xs text-gray-500 font-bold uppercase tracking-wider flex justify-between z-10 items-center">
                    <span>Nguồn đề thi: AptisKey.com</span>
                    <div className="flex gap-2">
                        <a href="https://aptiskey.com/writing_bode.html" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Mở tab mới ↗</a>
                        <button onClick={() => setShowIframe(false)} className="text-red-500 font-bold ml-2">✕ Đóng</button>
                    </div>
                </div>
                <iframe src="https://aptiskey.com/writing_bode.html" className="w-full h-full pt-8" title="Aptis Writing Topics" />
            </div>

            {/* Right: Workbench */}
            <div className="flex-1 h-full flex flex-col overflow-hidden relative">
                 {/* Toolbar */}
                 <div className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4 shrink-0">
                     <div className="flex items-center gap-2">
                         <button onClick={() => setShowIframe(!showIframe)} className={`p-2 rounded-lg text-sm font-bold border transition-all ${showIframe ? 'bg-blue-50 text-blue-600 border-blue-200' : 'text-gray-600 hover:bg-gray-100 border-gray-200'}`}>
                             {showIframe ? 'Show Editor Only' : 'Show Reference'}
                         </button>
                         <div className="h-6 w-px bg-gray-300 mx-2"></div>
                         <button onClick={() => handleGenerateTopic('task1')} disabled={isGeneratingTopic} className="text-xs font-bold text-gray-600 hover:text-blue-600 px-2 py-1 bg-gray-100 rounded">Generate Task 1</button>
                         <button onClick={() => handleGenerateTopic('task2')} disabled={isGeneratingTopic} className="text-xs font-bold text-gray-600 hover:text-blue-600 px-2 py-1 bg-gray-100 rounded">Generate Task 2</button>
                     </div>
                     
                     <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                             <span className="text-xs font-bold text-gray-500 uppercase">Words:</span>
                             <span className="font-mono font-bold text-blue-600">{getWordCount(essay)}</span>
                         </div>
                         <div className={`flex items-center gap-2 px-3 py-1 rounded-full border font-mono font-bold ${timer < 60 && isTimerRunning ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                             <span>{formatTime(timer)}</span>
                             <button onClick={() => { if(timer === 0) setTimer(timerDuration); setIsTimerRunning(!isTimerRunning); }} className="hover:text-blue-500 text-xs ml-1">
                                 {isTimerRunning ? '⏸' : '▶'}
                             </button>
                             <button onClick={() => { setIsTimerRunning(false); setTimer(timerDuration); }} className="hover:text-blue-500 text-xs ml-1">↺</button>
                         </div>
                     </div>
                 </div>

                 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900">
                     {/* Input Area */}
                     <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                         <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Đề bài (Topic)</label>
                             <textarea 
                                value={topic} 
                                onChange={e => setTopic(e.target.value)} 
                                placeholder="Nhập hoặc tạo đề bài ngẫu nhiên..." 
                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-medium text-gray-900 dark:text-white resize-none"
                                rows={2}
                             />
                         </div>
                         <textarea 
                            value={essay} 
                            onChange={e => setEssay(e.target.value)} 
                            placeholder="Start writing here..." 
                            className="w-full p-6 h-[400px] md:h-[500px] text-base md:text-lg leading-relaxed font-serif text-gray-800 dark:text-gray-200 focus:outline-none bg-white dark:bg-gray-800 resize-none"
                         />
                         <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end">
                             <button onClick={handleGrade} disabled={isGrading} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center gap-2">
                                 {isGrading ? <span className="animate-spin">↻</span> : <span>✨ Chấm Điểm (AI Grade)</span>}
                             </button>
                         </div>
                     </div>

                     {/* Result Area */}
                     {result && (
                         <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-blue-100 dark:border-blue-900 overflow-hidden animate-slide-up">
                             <div className="flex border-b border-gray-200 dark:border-gray-700">
                                 {[
                                     {id: 'score', label: 'Điểm số & Tổng quan'}, 
                                     {id: 'feedback', label: 'Sửa lỗi chi tiết'}, 
                                     {id: 'model', label: 'Bài mẫu'}, 
                                     {id: 'vocab', label: 'Từ vựng hay'}
                                 ].map(tab => (
                                     <button 
                                        key={tab.id} 
                                        onClick={() => setActiveResultTab(tab.id as any)}
                                        className={`flex-1 py-3 text-sm font-bold transition-colors ${activeResultTab === tab.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                     >
                                         {tab.label}
                                     </button>
                                 ))}
                             </div>
                             
                             <div className="p-6 min-h-[300px]">
                                 {activeResultTab === 'score' && (
                                     <div className="text-center space-y-6">
                                         <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-5xl font-bold text-blue-700 dark:text-blue-300 shadow-inner">
                                             {result.score}
                                         </div>
                                         <div className="max-w-2xl mx-auto text-left bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-100 dark:border-gray-700">
                                             <h4 className="font-bold text-gray-800 dark:text-white mb-2 uppercase text-xs tracking-wider">Nhận xét chung</h4>
                                             <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{result.generalFeedback}</p>
                                         </div>
                                     </div>
                                 )}

                                 {activeResultTab === 'feedback' && (
                                     <div className="space-y-4">
                                         {result.corrections?.map((c: any, idx: number) => (
                                             <div key={idx} className="p-4 rounded-xl border border-red-100 bg-red-50/50 dark:bg-red-900/10 dark:border-red-900/30">
                                                 <div className="flex items-start gap-3 mb-2">
                                                     <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 mt-1">Original</span>
                                                     <p className="text-red-800 dark:text-red-300 line-through decoration-red-400 decoration-2">{c.original}</p>
                                                 </div>
                                                 <div className="flex items-start gap-3 mb-2">
                                                     <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 mt-1">Fixed</span>
                                                     <p className="text-green-800 dark:text-green-300 font-bold">{c.correction}</p>
                                                 </div>
                                                 <p className="text-sm text-gray-600 dark:text-gray-400 ml-12 italic">💡 {c.explanation}</p>
                                             </div>
                                         ))}
                                         {(!result.corrections || result.corrections.length === 0) && <p className="text-center text-gray-500 italic">Không tìm thấy lỗi sai đáng kể. Làm tốt lắm!</p>}
                                     </div>
                                 )}

                                 {activeResultTab === 'model' && (
                                     <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                                         <h3 className="font-serif font-bold text-xl mb-4 text-gray-900 dark:text-white">Model Answer</h3>
                                         <div className="prose prose-blue dark:prose-invert max-w-none">
                                             <p className="whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-200">{result.sampleEssay}</p>
                                         </div>
                                     </div>
                                 )}

                                 {activeResultTab === 'vocab' && (
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         {result.betterVocab?.map((v: any, i: number) => (
                                             <div key={i} className="flex flex-col p-4 rounded-xl border border-blue-100 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-900/10">
                                                 <div className="flex justify-between items-start mb-2">
                                                     <span className="font-bold text-blue-700 dark:text-blue-400 text-lg">{v.word}</span>
                                                     <button 
                                                        onClick={() => handleSave(v.word, v.meaning, v.context)}
                                                        disabled={savedWords.has(v.word)}
                                                        className={`text-xs font-bold px-2 py-1 rounded transition-colors ${savedWords.has(v.word) ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                                     >
                                                         {savedWords.has(v.word) ? '✓ Saved' : '+ Save'}
                                                     </button>
                                                 </div>
                                                 <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">{v.meaning}</p>
                                                 <p className="text-xs text-gray-500 dark:text-gray-400 italic">"{v.context}"</p>
                                             </div>
                                         ))}
                                     </div>
                                 )}
                             </div>
                         </div>
                     )}
                 </div>
            </div>
        </div>
    );
}

// --- READING MODULE ---
const ReadingModule = ({ level, onSaveVocab }: { level: string, onSaveVocab: (w: string, m: string, c: string) => void }) => {
    const [readingMode, setReadingMode] = useState<'library' | 'ai_reader' | 'external_browser'>('library');
    const [currentUrl, setCurrentUrl] = useState<{url: string, title: string} | null>(null);
    const [aiTopic, setAiTopic] = useState('');
    const [readingData, setReadingData] = useState<any>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [lookupResult, setLookupResult] = useState<any>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    
    // UI State for Reader
    const [textSize, setTextSize] = useState<'sm' | 'base' | 'lg'>('base');
    const [bgTheme, setBgTheme] = useState<'light' | 'sepia' | 'dark'>('light');

    const handleGenerate = async () => {
        if (!aiTopic.trim()) return alert("Nhập chủ đề muốn đọc.");
        setIsGenerating(true);
        try {
            const json = await geminiService.generateReadingPassage(level, aiTopic);
            setReadingData(JSON.parse(json.replace(/```json|```/g, '').trim()));
            setReadingMode('ai_reader');
        } catch (e) {
            alert("Lỗi tạo bài đọc.");
        } finally {
            setIsGenerating(false);
        }
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
            } catch(e) {
                // ignore
            } finally {
                setIsLookingUp(false);
            }
        }
    };

    if (readingMode === 'external_browser' && currentUrl) {
        return <div className="h-full p-4"><ExternalBrowser url={currentUrl.url} title={currentUrl.title} onClose={() => setReadingMode('library')} /></div>;
    }

    if (readingMode === 'ai_reader' && readingData) {
        const bgClass = bgTheme === 'light' ? 'bg-white text-gray-900' : bgTheme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636]' : 'bg-[#1a1a1a] text-[#d1d1d1]';
        const textClass = textSize === 'sm' ? 'text-sm' : textSize === 'lg' ? 'text-xl' : 'text-base';

        return (
            <div className={`h-full flex flex-col ${bgClass} transition-colors`}>
                {/* Toolbar */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-opacity-50 backdrop-blur sticky top-0 z-10">
                    <button onClick={() => setReadingMode('library')} className="px-3 py-1.5 rounded-lg hover:bg-black/5 font-bold text-sm">← Thư viện</button>
                    <div className="flex gap-2 items-center">
                        <div className="flex bg-black/5 rounded-lg p-1">
                            <button onClick={() => setTextSize('sm')} className={`w-8 h-8 rounded ${textSize==='sm'?'bg-white shadow':''}`}>A</button>
                            <button onClick={() => setTextSize('base')} className={`w-8 h-8 rounded ${textSize==='base'?'bg-white shadow':''}`}>A+</button>
                            <button onClick={() => setTextSize('lg')} className={`w-8 h-8 rounded ${textSize==='lg'?'bg-white shadow':''}`}>A++</button>
                        </div>
                        <div className="flex bg-black/5 rounded-lg p-1">
                            <button onClick={() => setBgTheme('light')} className="w-6 h-6 rounded-full bg-white border mx-1" title="Light"></button>
                            <button onClick={() => setBgTheme('sepia')} className="w-6 h-6 rounded-full bg-[#f4ecd8] border mx-1" title="Sepia"></button>
                            <button onClick={() => setBgTheme('dark')} className="w-6 h-6 rounded-full bg-[#333] border mx-1" title="Dark"></button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto" onMouseUp={handleLookup}>
                        <h1 className="text-3xl font-bold mb-6">{readingData.title}</h1>
                        <div className={`${textClass} leading-loose whitespace-pre-wrap`}>{readingData.content}</div>
                        <div className="mt-12 p-6 bg-black/5 rounded-xl">
                            <h3 className="font-bold mb-2 uppercase text-xs opacity-70">Tóm tắt (Vietnamese)</h3>
                            <p className="italic">{readingData.summary}</p>
                        </div>
                    </div>

                    {/* Sidebar for Lookup */}
                    {(selectedWord || lookupResult) && (
                        <div className="w-80 border-l border-gray-200/50 bg-black/5 p-4 overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold">Tra từ nhanh</h3>
                                <button onClick={() => { setSelectedWord(null); setLookupResult(null); }} className="text-gray-500">✕</button>
                            </div>
                            {isLookingUp ? (
                                <div className="animate-pulse">Đang tra cứu "{selectedWord}"...</div>
                            ) : lookupResult ? (
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-2xl font-bold text-blue-600">{lookupResult.word}</div>
                                        <div className="text-sm text-gray-500">{lookupResult.ipa} • {lookupResult.type}</div>
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm uppercase text-gray-400">Nghĩa tiếng Việt</div>
                                        <div className="font-medium">{lookupResult.meaning_vi}</div>
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm uppercase text-gray-400">Định nghĩa</div>
                                        <div className="text-sm">{lookupResult.definition_en}</div>
                                    </div>
                                    <button 
                                        onClick={() => { onSaveVocab(lookupResult.word, lookupResult.meaning_vi, "Reading Mode"); alert("Đã lưu!"); }}
                                        className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700"
                                    >
                                        + Lưu vào Thư viện
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Library Mode
    return (
        <div className="h-full flex flex-col animate-fade-in p-4 md:p-8 overflow-y-auto">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Phòng Đọc (Reading Lab)</h2>
                
                <div className="flex gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <input 
                        value={aiTopic} 
                        onChange={e => setAiTopic(e.target.value)} 
                        placeholder="Nhập chủ đề (VD: Technology)..." 
                        className="bg-transparent border-none outline-none text-sm px-2 w-48 dark:text-white"
                        onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                    />
                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isGenerating ? 'Đang tạo...' : '✨ Tạo bài đọc AI'}
                    </button>
                </div>
            </div>

            <h3 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider">Tài liệu ôn thi (Aptis/IELTS)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl w-full">
                {[
                    {url: "https://aptiskey.com/reading_question1.html", title: "Reading Part 1", icon: "🧩", name: "Sentence Comprehension", color: "blue", desc: "Điền từ vào chỗ trống trong câu."},
                    {url: "https://aptiskey.com/reading_question2.html", title: "Reading Part 2 & 3", icon: "📑", name: "Text Organization", color: "indigo", desc: "Sắp xếp câu thành đoạn văn hoàn chỉnh."},
                    {url: "https://aptiskey.com/reading_question4.html", title: "Reading Part 4", icon: "🧐", name: "Long Text Comprehension", color: "purple", desc: "Đọc hiểu văn bản dài, nối tiêu đề."},
                    {url: "https://aptiskey.com/reading_question5.html", title: "Reading Part 5", icon: "🕵️", name: "Short Text", color: "pink", desc: "Đọc hiểu đoạn văn ngắn."},
                    {url: "https://aptiskey.com/reading_bode.html", title: "Bộ đề Ôn thi", icon: "🗓️", name: "Bộ đề Tổng hợp", color: "teal", span: "md:col-span-2", desc: "Kho đề thi thử đầy đủ các phần."}
                ].map((item, idx) => (
                    <div key={idx} onClick={() => { setCurrentUrl({ url: item.url, title: item.title }); setReadingMode('external_browser'); }} className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-${item.color}-100 dark:border-${item.color}-900 hover:shadow-xl hover:border-${item.color}-300 transition-all cursor-pointer ${item.span || ''} group`}>
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">{item.icon}</div>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">{item.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
                            </div>
                            <div className={`text-${item.color}-500 bg-${item.color}-50 dark:bg-${item.color}-900/20 p-2 rounded-full`}>
                                <span className="text-xl">↗</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- LISTENING MODULE ---
const ListeningModule = () => {
     const [currentUrl, setCurrentUrl] = useState<{url: string, title: string} | null>(null);
     const [notes, setNotes] = useState("");
     const [timer, setTimer] = useState(0);
     const [isTimerRunning, setIsTimerRunning] = useState(false);

     // Timer Logic
     useEffect(() => {
         let interval: any;
         if (isTimerRunning) {
             interval = setInterval(() => setTimer(t => t + 1), 1000);
         }
         return () => clearInterval(interval);
     }, [isTimerRunning]);

     const formatTime = (s: number) => new Date(s * 1000).toISOString().substr(11, 8);

     if (currentUrl) return (
         <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900">
             {/* Toolbar */}
             <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
                 <button onClick={() => setCurrentUrl(null)} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg">← Back</button>
                 <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full font-mono text-blue-600 dark:text-blue-300 font-bold">
                         <span>{formatTime(timer)}</span>
                         <button onClick={() => setIsTimerRunning(!isTimerRunning)} className="hover:text-blue-800">{isTimerRunning ? '⏸' : '▶'}</button>
                         <button onClick={() => { setIsTimerRunning(false); setTimer(0); }} className="hover:text-blue-800">↺</button>
                     </div>
                 </div>
             </div>
             
             <div className="flex-1 flex overflow-hidden">
                 {/* Iframe Container */}
                 <div className="flex-1 relative">
                    <ExternalBrowser url={currentUrl.url} title={currentUrl.title} onClose={() => setCurrentUrl(null)} />
                 </div>
                 
                 {/* Dictation/Note Panel */}
                 <div className="w-1/3 min-w-[300px] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
                     <div className="p-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-700 dark:text-gray-300">
                         📝 Dictation & Notes
                     </div>
                     <textarea 
                        className="flex-1 p-4 resize-none focus:outline-none bg-transparent text-gray-800 dark:text-gray-200 leading-relaxed"
                        placeholder="Type what you hear (Dictation) or take notes here..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                     />
                 </div>
             </div>
         </div>
     );

     return (
        <div className="h-full flex flex-col animate-fade-in p-4 md:p-8 overflow-y-auto">
            <div className="mb-8"><h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-2">Listening Studio</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
                 {[
                    {url: "https://aptiskey.com/listening_question1_13.html", title: "Part 1", icon: "🎧", name: "Info Recognition", color: "cyan"},
                    {url: "https://aptiskey.com/listening_question14.html", title: "Part 2", icon: "🔗", name: "Matching", color: "indigo"},
                    {url: "https://aptiskey.com/listening_question15.html", title: "Part 3", icon: "💭", name: "Inference", color: "violet"},
                    {url: "https://aptiskey.com/listening_question16_17.html", title: "Part 4", icon: "📻", name: "Monologue", color: "fuchsia"},
                    {url: "https://aptiskey.com/listening_bode.html", title: "Bộ đề", icon: "🗓️", name: "Bộ đề Ôn thi", color: "emerald", span: "md:col-span-2"}
                ].map((item, idx) => (
                    <div key={idx} onClick={() => { setCurrentUrl({ url: item.url, title: item.title }); setTimer(0); setNotes(""); }} className={`bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-sm border border-${item.color}-100 dark:border-${item.color}-900 hover:shadow-xl transition-all cursor-pointer ${item.span || ''} group`}>
                        <div className="flex justify-between">
                            <div className="text-5xl mb-6 group-hover:scale-110 transition-transform">{item.icon}</div>
                            <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 px-2 py-1 h-fit rounded">External Source</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{item.name}</h3>
                        <div className="mt-auto font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">Start Practice <span>→</span></div>
                    </div>
                ))}
            </div>
        </div>
     );
}

// --- SPEAKING MODULE ---

const VoiceVisualizer = ({ isActive, isUserSpeaking }: { isActive: boolean, isUserSpeaking: boolean }) => {
    if (!isActive) return <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-4xl">🎙️</div>;

    return (
        <div className="relative w-40 h-40 flex items-center justify-center">
             {/* Outer Pulse Rings */}
             <div className={`absolute inset-0 rounded-full bg-blue-500 opacity-20 ${isUserSpeaking ? 'animate-ping' : ''}`} style={{animationDuration: '1s'}}></div>
             <div className={`absolute inset-2 rounded-full bg-blue-400 opacity-20 ${isActive ? 'animate-pulse' : ''}`} style={{animationDuration: '2s'}}></div>
             
             {/* Core */}
             <div className={`relative w-32 h-32 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 shadow-xl flex items-center justify-center z-10 transition-transform duration-300 ${isUserSpeaking ? 'scale-110' : 'scale-100'}`}>
                 <span className="text-5xl animate-bounce" style={{animationDuration: '3s'}}>
                     {isUserSpeaking ? '🗣️' : '🎧'}
                 </span>
             </div>
        </div>
    );
};

const SpeakingPractice = ({ level, onSaveVocab }: { level: string, onSaveVocab: (word: string, def: string, context: string) => void }) => {
    const [mode, setMode] = useState<SpeakingMode>(null);
    const [activeWebUrl, setActiveWebUrl] = useState<string | null>(null);

    // Live Session State
    const [isLive, setIsLive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);
    const [visualizerState, setVisualizerState] = useState({ isUserSpeaking: false });
    
    // Part 2 State
    const [part2Topic, setPart2Topic] = useState<string | null>(null);
    const [timer, setTimer] = useState(0); // seconds
    const [timerStatus, setTimerStatus] = useState<'idle' | 'prep' | 'speak'>('idle');

    // Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef(0);

    // --- Live Logic ---
    const startLiveSession = async (instruction: string) => {
        setIsConnecting(true);
        try {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            nextStartTimeRef.current = audioContextRef.current.currentTime + 0.5;

            const session = await geminiService.connectLive(
                "Kore", 
                (pcmData) => playAudio(pcmData),
                (userTrans, modelTrans) => {
                    // Handle transcript updates if available from service
                },
                instruction
            );

            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const inputCtx = new AudioContext({ sampleRate: 16000 });
            sourceRef.current = inputCtx.createMediaStreamSource(streamRef.current);
            processorRef.current = inputCtx.createScriptProcessor(4096, 1, 1);

            processorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Simple VAD (Voice Activity Detection) Visualization
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                if (rms > 0.02) setVisualizerState({ isUserSpeaking: true });
                else setVisualizerState({ isUserSpeaking: false });

                // Send to Gemini
                // Note: Needs helper from gemini service to convert float to 16bit PCM
                // Using a simple mock or assuming service helper is available
                // For this demo, we rely on the service handles it or valid raw data
                 const pcm16 = new Int16Array(inputData.length);
                 for (let i = 0; i < inputData.length; i++) {
                     const s = Math.max(-1, Math.min(1, inputData[i]));
                     pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                 }

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
        } catch (e) {
            console.error(e);
            alert("Không thể kết nối Micro hoặc API.");
            setIsConnecting(false);
            setIsLive(false);
        }
    };

    const stopLiveSession = () => {
        setIsLive(false);
        streamRef.current?.getTracks().forEach(t => t.stop());
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        audioContextRef.current?.close();
        setVisualizerState({ isUserSpeaking: false });
    };

    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!audioContextRef.current) return;
        const ctx = audioContextRef.current;
        const int16 = new Int16Array(arrayBuffer);
        const float32 = new Float32Array(int16.length);
        for(let i=0; i<int16.length; i++) float32[i] = int16[i] / 32768.0;
        const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
        audioBuffer.copyToChannel(float32, 0);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + audioBuffer.duration;
    };

    useEffect(() => {
        return () => stopLiveSession();
    }, []);

    // --- Part 2 Timer Logic ---
    useEffect(() => {
        let interval: any;
        if (timerStatus !== 'idle' && timer > 0) {
            interval = setInterval(() => setTimer(t => t - 1), 1000);
        } else if (timer === 0 && timerStatus !== 'idle') {
            if (timerStatus === 'prep') {
                setTimerStatus('speak');
                setTimer(120); // 2 mins speak
                // Play beep
            } else {
                setTimerStatus('idle');
                alert("Time's up!");
            }
        }
        return () => clearInterval(interval);
    }, [timer, timerStatus]);

    const startPart2 = () => {
        const randomTopic = ADVANCED_TOPICS[Math.floor(Math.random() * ADVANCED_TOPICS.length)];
        setPart2Topic(randomTopic);
        setTimer(60); // 1 min prep
        setTimerStatus('prep');
    };

    // --- Render ---
    if (!mode) {
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in p-4">
            <div onClick={() => setMode('basic')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-4xl mb-6 group-hover:rotate-12 transition-transform">🎙</div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Live Conversation</h3>
                <p className="text-gray-500 dark:text-gray-400">Luyện nói trực tiếp với AI về các chủ đề hàng ngày.</p>
            </div>
            <div onClick={() => setMode('advanced')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-purple-100 dark:border-purple-900 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center text-4xl mb-6 group-hover:rotate-12 transition-transform">⏱️</div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Part 2: Monologue</h3>
                <p className="text-gray-500 dark:text-gray-400">Luyện nói 2 phút theo chủ đề với đồng hồ đếm ngược.</p>
            </div>
            <div onClick={() => setMode('image')} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-4xl mb-6 group-hover:rotate-12 transition-transform">🖼</div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Describe Image</h3>
                <p className="text-gray-500 dark:text-gray-400">Mô tả tranh và so sánh (Part 2 & 3).</p>
            </div>
          </div>
        );
    }

    // MODE: BASIC (Live Conversation)
    if (mode === 'basic') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800">
                    <button onClick={() => { stopLiveSession(); setMode(null); }} className="text-gray-500 hover:text-gray-800 font-bold">← Exit Room</button>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{isLive ? 'Live Connected' : 'Ready'}</span>
                    </div>
                </div>
                
                <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 relative overflow-hidden">
                     {/* Background Ambient */}
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl"></div>
                     
                     <VoiceVisualizer isActive={isLive} isUserSpeaking={visualizerState.isUserSpeaking} />
                     
                     <div className="mt-12 text-center z-10 px-4">
                         {!isLive ? (
                             <>
                                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Ready to practice?</h2>
                                <button 
                                    onClick={() => startLiveSession("You are a friendly English tutor. Engage in a conversation about daily life, hobbies, or work. Correct my mistakes gently.")}
                                    disabled={isConnecting}
                                    className="bg-blue-600 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-2 mx-auto disabled:opacity-50"
                                >
                                    {isConnecting ? 'Connecting...' : '🎙 Start Conversation'}
                                </button>
                             </>
                         ) : (
                             <>
                                <p className="text-xl text-gray-700 dark:text-gray-200 font-medium mb-8 animate-pulse">Listening...</p>
                                <button 
                                    onClick={stopLiveSession}
                                    className="bg-red-500 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-red-600 transition-all"
                                >
                                    End Session
                                </button>
                             </>
                         )}
                     </div>
                </div>
            </div>
        );
    }

    // MODE: ADVANCED (Part 2 Timer)
    if (mode === 'advanced') {
        return (
            <div className="h-full flex flex-col animate-fade-in p-6 md:p-10 overflow-y-auto">
                <button onClick={() => { setMode(null); setTimerStatus('idle'); }} className="mb-6 text-gray-500 hover:text-gray-800 w-fit">← Back</button>
                
                <div className="max-w-3xl mx-auto w-full">
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Part 2: Monologue Practice</h2>
                    
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 text-center">
                        {!part2Topic ? (
                            <div className="py-10">
                                <div className="text-6xl mb-6">🃏</div>
                                <p className="text-gray-500 mb-8">Generate a random topic card and start the timer.</p>
                                <button onClick={startPart2} className="bg-purple-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:bg-purple-700 transition-transform active:scale-95">
                                    Generate Topic
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-xl border-2 border-yellow-200 dark:border-yellow-700/50 text-left">
                                    <p className="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase tracking-widest mb-2">Topic Card</p>
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-relaxed">{part2Topic}</h3>
                                    <ul className="mt-4 space-y-2 text-gray-600 dark:text-gray-300 text-sm list-disc pl-5">
                                        <li>You should say:</li>
                                        <li>What it is</li>
                                        <li>When/Where it happened</li>
                                        <li>Why it is important</li>
                                    </ul>
                                </div>

                                <div>
                                    <div className={`text-6xl font-mono font-bold tabular-nums transition-colors ${timer < 10 ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>
                                        {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                                    </div>
                                    <p className={`text-sm font-bold uppercase mt-2 tracking-widest ${timerStatus === 'prep' ? 'text-blue-500' : 'text-green-500'}`}>
                                        {timerStatus === 'prep' ? 'Preparation Time' : 'Speaking Time'}
                                    </p>
                                </div>

                                <div className="flex justify-center gap-4">
                                    {timerStatus === 'speak' && (
                                        <div className="w-full max-w-xs bg-gray-100 h-2 rounded-full overflow-hidden">
                                            <div className="bg-green-500 h-full transition-all duration-1000 ease-linear" style={{width: `${(timer/120)*100}%`}}></div>
                                        </div>
                                    )}
                                </div>

                                <button onClick={() => { setPart2Topic(null); setTimerStatus('idle'); }} className="text-gray-400 hover:text-gray-600 underline">Reset</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // MODE: IMAGE
    if (mode === 'image') {
          return (
              <div className="animate-fade-in h-full flex flex-col">
                  {!activeWebUrl ? (
                    <>
                        <button onClick={() => setMode(null)} className="mb-6 text-gray-500 p-4 w-fit">← Quay lại</button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                            <div onClick={() => setActiveWebUrl("https://aptiskey.com/speaking_question2.html")} className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer hover:shadow-xl transition-all">
                                <span className="text-4xl block mb-4">🏞</span>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white">Part 2: Picture Description</h3>
                                <p className="text-sm text-gray-500 mt-2">Describe a picture in 45 seconds.</p>
                            </div>
                            <div onClick={() => setActiveWebUrl("https://aptiskey.com/speaking_question3.html")} className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer hover:shadow-xl transition-all">
                                <span className="text-4xl block mb-4">⚖️</span>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white">Part 3: Comparison</h3>
                                <p className="text-sm text-gray-500 mt-2">Compare two pictures and answer questions.</p>
                            </div>
                        </div>
                    </>
                  ) : <ExternalBrowser url={activeWebUrl} title="Aptis Speaking" onClose={() => setActiveWebUrl(null)} />}
              </div>
          );
    }
    return null;
}

// --- Main Component ---
export const EnglishLearning: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'vocab' | 'speaking' | 'listening' | 'reading' | 'writing'>('vocab');
  const [level, setLevel] = useState('B1');
  const saveVocabulary = (word: string, mean: string, context: string) => {
      const saved = localStorage.getItem('dh_vocab_terms');
      const terms: VocabTerm[] = saved ? JSON.parse(saved) : [];
      const newTerm: VocabTerm = {
          id: Date.now().toString(),
          term: word,
          meaning: mean,
          definition: "",
          example: context,
          partOfSpeech: "Unknown",
          folderId: "root", // Default to root or specific "Saved from Reading" folder
          learned: false,
          createdAt: new Date().toISOString()
      };
      terms.push(newTerm);
      localStorage.setItem('dh_vocab_terms', JSON.stringify(terms));
  };

  return (
    <div className="max-w-7xl mx-auto pb-10 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
        <div><h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Luyện Kỹ Năng Tiếng Anh</h1></div>
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 pl-2">Trình độ:</span>
            <select value={level} onChange={e => setLevel(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border-none rounded-md px-3 py-1.5 text-sm font-bold text-blue-700 dark:text-blue-400 outline-none"><option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option></select>
        </div>
      </div>
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto no-scrollbar shrink-0 pb-1">
        {[{id: 'vocab', label: 'Từ vựng & Ngữ pháp', icon: '⚡'}, {id: 'speaking', label: 'Luyện Nói', icon: '🗣️'}, {id: 'listening', label: 'Luyện Nghe', icon: '🎧'}, {id: 'reading', label: 'Luyện Đọc', icon: '📖'}, {id: 'writing', label: 'Luyện Viết', icon: '✍️'}].map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`px-4 md:px-6 py-3 rounded-t-lg text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === t.id ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-b-transparent shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}><span>{t.icon}</span> {t.label}</button>
        ))}
      </div>
      <div className="bg-white/50 dark:bg-gray-800/50 flex-1 rounded-2xl overflow-hidden border border-gray-100/50 dark:border-gray-700/50 shadow-sm">
        {activeTab === 'vocab' && <VocabAndGrammarModule level={level} onSaveVocab={saveVocabulary} />}
        {activeTab === 'speaking' && <SpeakingPractice level={level} onSaveVocab={saveVocabulary} />}
        {activeTab === 'listening' && <ListeningModule />}
        {activeTab === 'reading' && <ReadingModule level={level} onSaveVocab={saveVocabulary} />}
        {activeTab === 'writing' && <WritingModule level={level} onSaveVocab={saveVocabulary} />}
      </div>
    </div>
  );
};
