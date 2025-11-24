
import React, { useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Transaction, BudgetCategory, FinancialGoal, DebtItem } from '../types';
import { financialService } from '../services/financial';
import { geminiService, AIFinancialPlan } from '../services/gemini';
import { AIPlanModal } from '../components/AIPlanModal';
import { MoneyInput } from '../components/MoneyInput';
import { TransactionList } from '../components/TransactionList';
import { InvestmentDashboard } from '../components/InvestmentDashboard';
import firebase from 'firebase/compat/app';

// --- Helpers ---
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const getCategoryIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('ăn') || lower.includes('food') || lower.includes('coffee') || lower.includes('cafe')) return '🍔';
    if (lower.includes('đi') || lower.includes('xăng') || lower.includes('xe') || lower.includes('travel')) return '🛵';
    if (lower.includes('nhà') || lower.includes('bill') || lower.includes('điện') || lower.includes('nước')) return '🏠';
    if (lower.includes('sắm') || lower.includes('mua') || lower.includes('shopping')) return '🛍️';
    if (lower.includes('đầu tư') || lower.includes('tiết kiệm') || lower.includes('vàng') || lower.includes('chứng khoán')) return '💎';
    if (lower.includes('học') || lower.includes('sách') || lower.includes('course')) return '📚';
    if (lower.includes('y tế') || lower.includes('thuốc') || lower.includes('khám')) return '💊';
    if (lower.includes('giải trí') || lower.includes('game') || lower.includes('phim')) return '🎬';
    if (lower.includes('lương') || lower.includes('salary')) return '💰';
    if (lower.includes('thưởng') || lower.includes('bonus')) return '🎁';
    return '💸';
};

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];
const COMMON_CATEGORIES_EXPENSE = ['Ăn uống', 'Đi lại', 'Nhà cửa', 'Mua sắm', 'Giải trí', 'Y tế', 'Giáo dục', 'Tiện ích'];
const COMMON_CATEGORIES_INCOME = ['Lương', 'Thưởng', 'Kinh doanh', 'Đầu tư', 'Được tặng', 'Khác'];

// Extended list for Budget Creation
const PREDEFINED_BUDGET_CATEGORIES = [
    "Ăn uống", "Đi lại", "Nhà cửa", "Điện nước & Net",
    "Mua sắm", "Giải trí", "Y tế", "Giáo dục",
    "Làm đẹp", "Du lịch", "Trả góp", "Bảo hiểm",
    "Tiết kiệm", "Đầu tư", "Khác"
];

const inputStyle = "w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600 transition-colors placeholder-gray-400 font-medium shadow-sm";

export const Finance: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'overview' | 'budget' | 'goals' | 'debt' | 'invest'>('overview');

    // --- State ---
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [budgets, setBudgets] = useState<BudgetCategory[]>([]);
    const [goals, setGoals] = useState<FinancialGoal[]>([]);
    const [debts, setDebts] = useState<DebtItem[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<firebase.User | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // To reload history list

    // --- Filter State ---
    const [filterDate, setFilterDate] = useState(new Date());
    const [statsMode, setStatsMode] = useState<'month' | 'year'>('month');
    const [aiMetadata, setAiMetadata] = useState<{ analysisComment?: string, cashflowInsight?: string }>({});

    // --- Modal States ---
    const [isTransModalOpen, setTransModalOpen] = useState(false);
    const [newTrans, setNewTrans] = useState<Partial<Transaction>>({ type: 'expense', date: new Date().toISOString().split('T')[0], category: '', amount: 0 });

    // AI States
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiPlan, setAiPlan] = useState<AIFinancialPlan | null>(null);

    // --- Data Fetching Logic ---
    const fetchData = async (user: firebase.User) => {
        setIsLoading(true);
        try {
            // Authenticated: Fetch Once (Reduce Reads)
            const [transData, budgetsData, goalsData, debtsData] = await Promise.all([
                financialService.fetchTransactions(user.uid),
                financialService.fetchBudgets(user.uid),
                financialService.fetchGoals(user.uid),
                financialService.fetchDebts(user.uid)
            ]);

            setTransactions(transData);
            setBudgets(budgetsData);
            setGoals(goalsData);
            setDebts(debtsData);

            // Fetch metadata once
            firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    setAiMetadata(doc.data()?.finance_metadata || {});
                }
            });
        } catch (error) {
            console.error("Failed to fetch finance data", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = () => {
        if (currentUser) {
            fetchData(currentUser);
            setRefreshTrigger(prev => prev + 1);
        }
    };

    // --- Authentication & Initial Load ---
    useEffect(() => {
        const unsubscribeAuth = firebase.auth().onAuthStateChanged(async (user) => {
            setCurrentUser(user);
            setIsLoading(true);

            if (user) {
                // Initial Fetch
                fetchData(user);
            } else {
                // Guest Mode: Load from LocalStorage
                const t = localStorage.getItem('dh_fin_trans');
                const b = localStorage.getItem('dh_fin_budgets');
                const g = localStorage.getItem('dh_fin_goals');
                const d = localStorage.getItem('dh_fin_debts');

                if (t) setTransactions(JSON.parse(t));
                if (b) setBudgets(JSON.parse(b));
                else setBudgets([
                    { id: '1', name: 'Ăn uống', limit: 3000000, spent: 0, type: 'expense' },
                    { id: '2', name: 'Đi lại', limit: 500000, spent: 0, type: 'expense' },
                ]);
                if (g) setGoals(JSON.parse(g));
                if (d) setDebts(JSON.parse(d));

                setIsLoading(false);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // --- Sync to LocalStorage (Guest Only) ---
    useEffect(() => {
        if (!currentUser && !isLoading) {
            localStorage.setItem('dh_fin_trans', JSON.stringify(transactions));
        }
    }, [transactions, currentUser, isLoading]);

    useEffect(() => {
        if (!currentUser && !isLoading) localStorage.setItem('dh_fin_budgets', JSON.stringify(budgets));
    }, [budgets, currentUser, isLoading]);

    useEffect(() => {
        if (!currentUser && !isLoading) localStorage.setItem('dh_fin_goals', JSON.stringify(goals));
    }, [goals, currentUser, isLoading]);

    useEffect(() => {
        if (!currentUser && !isLoading) localStorage.setItem('dh_fin_debts', JSON.stringify(debts));
    }, [debts, currentUser, isLoading]);


    // --- CRUD Actions (Hybrid: Firestore vs Local) ---
    const addTransaction = async () => {
        if (!newTrans.amount || !newTrans.category) return;

        if (currentUser) {
            await financialService.addTransaction(currentUser.uid, {
                date: newTrans.date!,
                amount: Number(newTrans.amount),
                type: newTrans.type as 'income' | 'expense',
                category: newTrans.category!,
                description: newTrans.description || ''
            });
            // Trigger refresh manually to update UI without waiting for full reload
            handleRefresh();
        } else {
            const item: Transaction = {
                id: Date.now().toString(),
                date: newTrans.date!,
                amount: Number(newTrans.amount),
                type: newTrans.type as 'income' | 'expense',
                category: newTrans.category!,
                description: newTrans.description || ''
            };
            setTransactions(prev => [item, ...prev]);
        }

        setTransModalOpen(false);
        setNewTrans({ type: 'expense', date: new Date().toISOString().split('T')[0], category: '', amount: 0, description: '' });
    };

    const deleteTransaction = async (id: string) => {
        if (!window.confirm("Xóa giao dịch này?")) return;
        if (currentUser) {
            await financialService.deleteTransaction(currentUser.uid, id);
            setRefreshTrigger(prev => prev + 1); // Update list component
            handleRefresh(); // Update charts
        }
        else setTransactions(prev => prev.filter(t => t.id !== id));
    };

    // --- AI Analysis Workflow ---
    const handleAIAnalysis = async () => {
        if (!currentUser) return alert("Vui lòng đăng nhập để sử dụng AI Financial Advisor.");
        if (!geminiService.hasKey()) return alert("Vui lòng nhập API Key trong Cài Đặt.");

        setIsAnalyzing(true);
        try {
            const plan = await geminiService.analyzeFinances(transactions);
            setAiPlan(plan);
        } catch (e: any) {
            // Check for policy enforcement message
            if (e.message.includes('🔒')) {
                alert(e.message);
            } else {
                alert("Lỗi phân tích AI: " + e.message);
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSaveAIPlan = async (newBudgets: BudgetCategory[], newGoals: FinancialGoal[]) => {
        if (!currentUser || !aiPlan) return;
        try {
            await financialService.batchSaveFinancialPlan(
                currentUser.uid,
                newBudgets,
                newGoals,
                {
                    analysisComment: aiPlan.analysisComment,
                    cashflowInsight: aiPlan.cashflowInsight
                }
            );
            setAiMetadata({ analysisComment: aiPlan.analysisComment, cashflowInsight: aiPlan.cashflowInsight });
            setAiPlan(null);
            alert("Đã áp dụng kế hoạch tài chính mới!");
            handleRefresh(); // Refresh to show new budgets/goals
        } catch (e: any) {
            alert("Lỗi khi lưu kế hoạch: " + e.message);
        }
    };

    // --- Calculators ---
    const getFilteredTransactions = () => {
        return transactions.filter(t => {
            const tDate = new Date(t.date);
            const matchesYear = tDate.getFullYear() === filterDate.getFullYear();
            if (statsMode === 'year') return matchesYear;
            return matchesYear && tDate.getMonth() === filterDate.getMonth();
        });
    };

    const filteredTransactions = getFilteredTransactions();
    const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    const calculateBudgetSpent = (categoryName: string) => {
        const refDate = statsMode === 'month' ? filterDate : new Date();
        return transactions
            .filter(t => {
                const d = new Date(t.date);
                const transCat = t.category.toLowerCase().trim();
                const budgetCat = categoryName.toLowerCase().trim();
                return t.type === 'expense' && transCat === budgetCat && d.getMonth() === refDate.getMonth() && d.getFullYear() === refDate.getFullYear();
            })
            .reduce((sum, t) => sum + t.amount, 0);
    };

    // --- Rollover Calculation Logic ---
    const calculateRollover = (categoryName: string) => {
        if (statsMode !== 'month') return 0;

        const startOfCurrentMonth = new Date(filterDate.getFullYear(), filterDate.getMonth(), 1);

        const historyTrans = transactions.filter(t =>
            t.category.toLowerCase().trim() === categoryName.toLowerCase().trim() &&
            t.type === 'expense' &&
            new Date(t.date) < startOfCurrentMonth
        );

        if (historyTrans.length === 0) return 0;

        const timestamps = historyTrans.map(t => new Date(t.date).getTime());
        const firstTransDate = new Date(Math.min(...timestamps));
        const startMonth = new Date(firstTransDate.getFullYear(), firstTransDate.getMonth(), 1);

        const monthsPassed = (startOfCurrentMonth.getFullYear() - startMonth.getFullYear()) * 12 + (startOfCurrentMonth.getMonth() - startMonth.getMonth());

        if (monthsPassed <= 0) return 0;

        const budget = budgets.find(b => b.name.toLowerCase().trim() === categoryName.toLowerCase().trim());
        if (!budget) return 0;

        const totalAllocated = monthsPassed * budget.limit;
        const totalSpent = historyTrans.reduce((sum, t) => sum + t.amount, 0);

        return totalAllocated - totalSpent;
    };

    // --- Helpers for Transaction Modal ---
    const getAvailableCategories = () => {
        if (newTrans.type === 'income') return COMMON_CATEGORIES_INCOME;
        const budgetNames = budgets
            .filter(b => b.type === 'expense')
            .map(b => b.name);
        return Array.from(new Set([...budgetNames, ...COMMON_CATEGORIES_EXPENSE]));
    };

    const getSelectedBudgetPreview = () => {
        if (newTrans.type !== 'expense' || !newTrans.category) return null;

        const budget = budgets.find(b => b.name.toLowerCase().trim() === newTrans.category?.toLowerCase().trim());
        if (!budget) return null;

        const transDate = newTrans.date ? new Date(newTrans.date) : new Date();

        const currentSpent = transactions
            .filter(t => {
                const d = new Date(t.date);
                const transCat = t.category.toLowerCase().trim();
                const budgetCat = budget.name.toLowerCase().trim();
                return t.type === 'expense' &&
                    transCat === budgetCat &&
                    d.getMonth() === transDate.getMonth() &&
                    d.getFullYear() === transDate.getFullYear();
            })
            .reduce((sum, t) => sum + t.amount, 0);

        const addingAmount = Number(newTrans.amount) || 0;
        const newTotal = currentSpent + addingAmount;
        const percent = Math.min(100, (newTotal / budget.limit) * 100);
        const isOver = newTotal > budget.limit;

        return {
            name: budget.name,
            limit: budget.limit,
            currentSpent,
            newTotal,
            percent,
            isOver,
            remaining: budget.limit - newTotal
        };
    };

    const budgetPreview = getSelectedBudgetPreview();

    // --- Charts ---
    const getBarChartData = () => {
        if (statsMode === 'month') {
            const year = filterDate.getFullYear();
            const month = filterDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const data = [];
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const dayTrans = filteredTransactions.filter(t => t.date === dateStr);
                const inc = dayTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                const exp = dayTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                if (inc > 0 || exp > 0) data.push({ name: `${i}`, income: inc, expense: exp });
            }
            return data;
        } else {
            const data = [];
            for (let i = 0; i < 12; i++) {
                const monthTrans = filteredTransactions.filter(t => new Date(t.date).getMonth() === i);
                const inc = monthTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                const exp = monthTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                data.push({ name: `T${i + 1}`, income: inc, expense: exp });
            }
            return data;
        }
    };

    const getPieChartData = () => {
        const map = new Map<string, number>();
        filteredTransactions.filter(t => t.type === 'expense').forEach(t => {
            map.set(t.category, (map.get(t.category) || 0) + t.amount);
        });
        return Array.from(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };

    const navigateDate = (direction: number) => {
        const newDate = new Date(filterDate);
        if (statsMode === 'month') {
            newDate.setMonth(newDate.getMonth() + direction);
        } else {
            newDate.setFullYear(newDate.getFullYear() + direction);
        }
        setFilterDate(newDate);
    };

    // --- SUB COMPONENTS ---
    const OverviewTab = () => {
        const totalBudgetLimit = budgets.filter(b => b.type === 'expense').reduce((sum, b) => sum + b.limit, 0);
        const budgetedSpent = budgets.filter(b => b.type === 'expense').reduce((sum, b) => {
            return sum + calculateBudgetSpent(b.name);
        }, 0);
        const budgetHealthPercent = totalBudgetLimit > 0 ? (budgetedSpent / totalBudgetLimit) * 100 : 0;

        const pieChartData = getPieChartData();
        const totalPieValue = pieChartData.reduce((acc, item) => acc + item.value, 0);

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <button onClick={() => navigateDate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">◀</button>
                        <div className="text-center min-w-[160px]">
                            <p className="text-[10px] text-gray-400 uppercase font-bold">Thời gian</p>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                                {statsMode === 'month' ? `Tháng ${filterDate.getMonth() + 1}, ${filterDate.getFullYear()}` : `Năm ${filterDate.getFullYear()}`}
                            </h2>
                        </div>
                        <button onClick={() => navigateDate(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">▶</button>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                            <button onClick={() => setStatsMode('month')} className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${statsMode === 'month' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Tháng</button>
                            <button onClick={() => setStatsMode('year')} className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${statsMode === 'year' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Năm</button>
                        </div>
                        <button
                            onClick={handleAIAnalysis}
                            disabled={isAnalyzing}
                            className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 disabled:opacity-70"
                        >
                            {isAnalyzing ? <span className="animate-spin">↻</span> : <span>🤖</span>}
                            <span className="hidden sm:inline">AI Advisor</span>
                        </button>
                    </div>
                </div>

                {/* AI Insight Card */}
                {aiMetadata.analysisComment && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 p-4 rounded-xl flex gap-3 items-start animate-fade-in-up">
                        <div className="text-2xl">💡</div>
                        <div>
                            <h4 className="font-bold text-indigo-900 dark:text-indigo-200 text-sm">Nhận định từ AI</h4>
                            <p className="text-sm text-indigo-800 dark:text-indigo-300 mt-1 leading-relaxed">{aiMetadata.analysisComment}</p>
                            {aiMetadata.cashflowInsight && (
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-medium italic">"{aiMetadata.cashflowInsight}"</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Net Cashflow Card */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 md:p-8 rounded-2xl shadow-lg text-white relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                        <div>
                            <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Dòng tiền ròng (Net Cashflow)</p>
                            <h2 className="text-4xl font-bold">{formatCurrency(totalIncome - totalExpense)}</h2>
                        </div>
                        <div className="flex gap-8">
                            <div>
                                <p className="text-blue-200 text-xs uppercase">Tổng thu</p>
                                <p className="text-xl font-bold text-green-300">+{formatCurrency(totalIncome)}</p>
                            </div>
                            <div>
                                <p className="text-blue-200 text-xs uppercase">Tổng chi</p>
                                <p className="text-xl font-bold text-red-300">-{formatCurrency(totalExpense)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Budget Health Summary (Only in Month View) */}
                {statsMode === 'month' && totalBudgetLimit > 0 && (
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between animate-fade-in">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Tiến độ Ngân sách (Tất cả)</p>
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white">{formatCurrency(budgetedSpent)}</h3>
                                <span className="text-xs text-gray-400">/ {formatCurrency(totalBudgetLimit)} (Gốc)</span>
                            </div>
                        </div>
                        <div className="flex-1 mx-4 max-w-xs">
                            <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${budgetHealthPercent > 100 ? 'bg-red-500' : budgetHealthPercent > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, budgetHealthPercent)}%` }}></div>
                            </div>
                            <p className="text-[10px] text-right mt-1 text-gray-500">{budgetHealthPercent.toFixed(1)}%</p>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => { setNewTrans({ ...newTrans, type: 'income', amount: 0, category: '' }); setTransModalOpen(true); }}
                        className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-400 py-3 rounded-xl border border-green-200 dark:border-green-800 font-bold transition-all shadow-sm active:scale-95"
                    >
                        <span className="text-xl">➕</span> Thêm Thu Nhập
                    </button>
                    <button
                        onClick={() => { setNewTrans({ ...newTrans, type: 'expense', amount: 0, category: '' }); setTransModalOpen(true); }}
                        className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 py-3 rounded-xl border border-red-200 dark:border-red-800 font-bold transition-all shadow-sm active:scale-95"
                    >
                        <span className="text-xl">➖</span> Thêm Chi Tiêu
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Bar Chart */}
                    <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-800 dark:text-white mb-6 text-lg flex items-center gap-2">
                            <span>📊</span> Biến động thu chi
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={getBarChartData()} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" opacity={0.2} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={10} />
                                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${val / 1000}k`} />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(Number(value))}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        cursor={{ fill: '#f9fafb', opacity: 0.1 }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar dataKey="income" name="Thu nhập" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Bar dataKey="expense" name="Chi tiêu" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Pie Chart */}
                    <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-800 dark:text-white mb-6 text-lg flex items-center gap-2">
                            <span>🍰</span> Cơ cấu chi tiêu
                        </h3>
                        <div className="h-64">
                            {pieChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieChartData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {pieChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    const percent = totalPieValue > 0 ? (data.value / totalPieValue) * 100 : 0;
                                                    return (
                                                        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.fill }}></div>
                                                                <p className="font-bold text-gray-800 dark:text-white text-xs">{data.name}</p>
                                                            </div>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{formatCurrency(data.value)}</span>
                                                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                                                    {percent.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50 dark:bg-gray-900/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                    <span className="text-4xl mb-2">📉</span>
                                    <span className="text-sm font-medium">Chưa có dữ liệu chi tiêu</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <TransactionList
                    uid={currentUser?.uid}
                    refreshTrigger={refreshTrigger}
                    onDelete={deleteTransaction}
                />
            </div>
        );
    };

    const BudgetTab = () => {
        const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
        const [editingBudget, setEditingBudget] = useState<BudgetCategory | null>(null);
        const [budgetName, setBudgetName] = useState('');
        const [budgetLimit, setBudgetLimit] = useState(0);
        const [budgetType, setBudgetType] = useState<'expense' | 'investment'>('expense');

        const resetForm = () => { setBudgetName(''); setBudgetLimit(0); setBudgetType('expense'); setEditingBudget(null); };

        const handleSaveBudget = async () => {
            if (!budgetName || !budgetLimit) return;
            const newBudget: BudgetCategory = {
                id: editingBudget ? editingBudget.id : Date.now().toString(),
                name: budgetName,
                limit: budgetLimit,
                spent: 0,
                type: budgetType
            };

            if (currentUser) {
                await financialService.saveBudget(currentUser.uid, newBudget);
                handleRefresh(); // Manual refresh logic
            }
            else {
                if (editingBudget) setBudgets(prev => prev.map(b => b.id === editingBudget.id ? newBudget : b));
                else setBudgets(prev => [...prev, newBudget]);
            }
            setBudgetModalOpen(false); resetForm();
        };

        const deleteBudget = async (id: string) => {
            if (!window.confirm("Xóa ngân sách này?")) return;
            if (currentUser) {
                await financialService.deleteBudget(currentUser.uid, id);
                handleRefresh();
            }
            else setBudgets(prev => prev.filter(b => b.id !== id));
        };

        // Calculate effective budget metrics
        const budgetMetrics = budgets.map(b => {
            const rollover = calculateRollover(b.name);
            const effectiveLimit = b.limit + rollover;
            const spent = calculateBudgetSpent(b.name);
            return {
                ...b,
                rollover,
                effectiveLimit,
                spent
            };
        });

        const totalEffectiveBudget = budgetMetrics.reduce((acc, b) => acc + (b.effectiveLimit > 0 ? b.effectiveLimit : 0), 0);
        const totalSpent = budgetMetrics.reduce((acc, b) => acc + b.spent, 0);
        const overallPercent = totalEffectiveBudget > 0 ? Math.min(100, (totalSpent / totalEffectiveBudget) * 100) : 0;

        return (
            <div className="space-y-6 animate-fade-in">
                {/* Summary Card */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                        <div>
                            <p className="text-blue-100 font-bold uppercase text-xs tracking-wider mb-1">Tổng Hạn Mức Thực Tế (Tháng này)</p>
                            <h2 className="text-3xl md:text-4xl font-bold">{formatCurrency(Math.max(0, totalEffectiveBudget - totalSpent))}</h2>
                            <p className="text-xs text-blue-200 mt-2">Đã bao gồm cộng dồn từ tháng trước</p>
                        </div>
                        <div className="w-full md:w-1/2 bg-black/20 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                            <div className="flex justify-between text-sm font-bold mb-2"><span>Tiến độ chi tiêu</span><span>{overallPercent.toFixed(1)}%</span></div>
                            <div className="w-full bg-white/20 h-3 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${overallPercent > 90 ? 'bg-red-400' : overallPercent > 70 ? 'bg-yellow-400' : 'bg-green-400'}`} style={{ width: `${overallPercent}%` }}></div>
                            </div>
                            <div className="flex justify-between text-xs text-blue-100 mt-2"><span>Đã dùng: {formatCurrency(totalSpent)}</span><span>Tổng: {formatCurrency(totalEffectiveBudget)}</span></div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800 dark:text-white text-lg">Danh sách ngân sách</h3>
                        <div className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-1 rounded flex items-center gap-1">
                            <span>ℹ️</span> <span>Có cộng dồn</span>
                        </div>
                    </div>
                    <button onClick={() => { resetForm(); setBudgetModalOpen(true); }} className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-50 dark:hover:bg-gray-700 shadow-sm transition-all flex items-center gap-2"><span>+</span> Tạo ngân sách</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {budgetMetrics.map(b => {
                        const { spent, limit, rollover, effectiveLimit } = b;

                        const percent = effectiveLimit > 0 ? Math.min((spent / effectiveLimit) * 100, 100) : 100;
                        const isOver = spent > effectiveLimit;
                        const isDeficit = effectiveLimit <= 0;

                        return (
                            <div key={b.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${b.type === 'investment' ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>{getCategoryIcon(b.name)}</div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 dark:text-white">{b.name}</h4>
                                            <div className="flex flex-col">
                                                <p className="text-[10px] text-gray-400">Gốc: {formatCurrency(limit)}</p>
                                                {rollover !== 0 && (
                                                    <p className={`text-[10px] font-bold ${rollover > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {rollover > 0 ? '+' : ''}{formatCurrency(rollover)} (Trước)
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setBudgetName(b.name); setBudgetLimit(b.limit); setBudgetType(b.type); setEditingBudget(b); setBudgetModalOpen(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">✏️</button>
                                        <button onClick={() => deleteBudget(b.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded text-gray-500">🗑</button>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="flex items-end gap-1 mb-1">
                                        <span className={`text-2xl font-bold ${isOver || isDeficit ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>{formatCurrency(spent)}</span>
                                        <span className="text-xs text-gray-400 font-medium mb-1.5">
                                            / {isDeficit ? '0đ (Âm vốn)' : formatCurrency(effectiveLimit)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden relative">
                                        <div className={`h-full rounded-full transition-all duration-500 ${percent > 90 || isDeficit ? 'bg-red-500' : percent > 75 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${percent}%` }}></div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center text-xs font-medium">
                                    <span className={`${(isOver || isDeficit) ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700'} px-2 py-1 rounded`}>
                                        {isDeficit
                                            ? `Thiếu hụt ${formatCurrency(Math.abs(effectiveLimit) + spent)}`
                                            : isOver
                                                ? `Vượt ${formatCurrency(spent - effectiveLimit)}`
                                                : `Còn ${formatCurrency(effectiveLimit - spent)}`
                                        }
                                    </span>
                                    <span className="text-gray-400">{isDeficit ? '>100%' : `${percent.toFixed(0)}%`}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {isBudgetModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up border border-gray-200 dark:border-gray-700">
                            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                                <h3 className="font-bold text-lg text-gray-800 dark:text-white">{editingBudget ? 'Chỉnh sửa' : 'Tạo mới'}</h3>
                                <button onClick={() => setBudgetModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên danh mục</label>
                                    {/* Quick Select Dropdown */}
                                    <select
                                        className="w-full mb-2 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 outline-none"
                                        onChange={(e) => { if (e.target.value) setBudgetName(e.target.value); }}
                                        value=""
                                    >
                                        <option value="" disabled>-- Chọn danh mục mẫu --</option>
                                        {PREDEFINED_BUDGET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input
                                        type="text"
                                        value={budgetName}
                                        onChange={e => setBudgetName(e.target.value)}
                                        className={inputStyle}
                                        placeholder="Hoặc tự nhập tên..."
                                    />
                                </div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hạn mức gốc/tháng (VNĐ)</label><MoneyInput value={budgetLimit} onChange={setBudgetLimit} className={inputStyle} /></div>
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setBudgetType('expense')} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${budgetType === 'expense' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500'}`}>Chi tiêu</button>
                                    <button type="button" onClick={() => setBudgetType('investment')} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${budgetType === 'investment' ? 'bg-purple-50 border-purple-200 text-purple-600' : 'border-gray-200 text-gray-500'}`}>Đầu tư</button>
                                </div>
                                <button onClick={handleSaveBudget} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg mt-2">Lưu</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const GoalsTabFull = () => {
        const [isGoalModalOpen, setGoalModalOpen] = useState(false);
        const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
        const [depositModal, setDepositModal] = useState<{ isOpen: boolean, goalId: string | null }>({ isOpen: false, goalId: null });
        const [depositAmount, setDepositAmount] = useState(0);

        const [name, setName] = useState('');
        const [target, setTarget] = useState(0);
        const [current, setCurrent] = useState(0);
        const [deadline, setDeadline] = useState('');
        const [goalType, setGoalType] = useState<'savings' | 'investment' | 'asset'>('savings');
        const [color, setColor] = useState('bg-blue-500');

        const resetForm = () => { setName(''); setTarget(0); setCurrent(0); setDeadline(''); setGoalType('savings'); setColor('bg-blue-500'); setEditingGoal(null); };

        const handleSaveGoal = async () => {
            if (!name || !target) return;
            const newGoal: FinancialGoal = {
                id: editingGoal ? editingGoal.id : Date.now().toString(),
                name,
                targetAmount: Number(target),
                currentAmount: Number(current) || 0,
                type: goalType,
                deadline: deadline || undefined,
                color
            };

            if (currentUser) {
                await financialService.saveGoal(currentUser.uid, newGoal);
                handleRefresh();
            }
            else {
                if (editingGoal) setGoals(prev => prev.map(g => g.id === editingGoal.id ? newGoal : g));
                else setGoals(prev => [...prev, newGoal]);
            }
            setGoalModalOpen(false); resetForm();
        };

        const handleDeposit = async () => {
            if (!depositModal.goalId || !depositAmount) return;
            const goal = goals.find(g => g.id === depositModal.goalId);
            if (goal) {
                const updatedGoal = { ...goal, currentAmount: goal.currentAmount + Number(depositAmount) };
                if (currentUser) {
                    await financialService.saveGoal(currentUser.uid, updatedGoal);
                    handleRefresh();
                }
                else setGoals(prev => prev.map(g => g.id === goal.id ? updatedGoal : g));
            }
            setDepositModal({ isOpen: false, goalId: null }); setDepositAmount(0);
        };

        const deleteGoal = async (id: string) => {
            if (!window.confirm("Xóa mục tiêu này?")) return;
            if (currentUser) {
                await financialService.deleteGoal(currentUser.uid, id);
                handleRefresh();
            }
            else setGoals(prev => prev.filter(g => g.id !== id));
        };

        const totalSaved = goals.reduce((acc, g) => acc + g.currentAmount, 0);
        const totalTarget = goals.reduce((acc, g) => acc + g.targetAmount, 0);
        const totalProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-emerald-100 font-bold uppercase text-xs tracking-wider mb-1">Tổng Tài Sản Tích Lũy</p>
                            <h2 className="text-3xl md:text-4xl font-bold">{formatCurrency(totalSaved)}</h2>
                            <p className="text-sm text-emerald-200 mt-1">Đạt {totalProgress.toFixed(1)}% mục tiêu</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 dark:text-white text-lg">Mục tiêu của bạn</h3>
                    <button onClick={() => { resetForm(); setGoalModalOpen(true); }} className="bg-white dark:bg-gray-800 text-emerald-600 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-2"><span>+</span> Thêm</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {goals.map(g => {
                        const pct = Math.min((g.currentAmount / g.targetAmount) * 100, 100);
                        return (
                            <div key={g.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 relative group hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm ${g.color || 'bg-blue-500'}`}>
                                        {g.type === 'savings' ? '🐷' : g.type === 'investment' ? '📈' : '🏠'}
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button onClick={() => { setName(g.name); setTarget(g.targetAmount); setCurrent(g.currentAmount); setDeadline(g.deadline || ''); setGoalType(g.type); setColor(g.color || 'bg-blue-500'); setEditingGoal(g); setGoalModalOpen(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-500">✏️</button>
                                        <button onClick={() => deleteGoal(g.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-500">🗑️</button>
                                    </div>
                                </div>
                                <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-1 truncate">{g.name}</h3>
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
                                    <span>Đích: {formatCurrency(g.targetAmount)}</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 mb-2 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-1000 ${g.color || 'bg-blue-500'}`} style={{ width: `${pct}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center mb-5">
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{formatCurrency(g.currentAmount)}</span>
                                    <span className="text-xs font-bold text-gray-400">{pct.toFixed(1)}%</span>
                                </div>
                                <button onClick={() => { setDepositModal({ isOpen: true, goalId: g.id }); }} className="w-full py-2 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-600 dark:text-gray-300 hover:text-emerald-600 font-bold text-sm border border-gray-200 dark:border-gray-600 transition-colors flex items-center justify-center gap-2"><span>➕</span> Nạp tiền</button>
                            </div>
                        )
                    })}
                </div>

                {isGoalModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-gray-200 dark:border-gray-700">
                            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900"><h3 className="font-bold text-lg text-gray-800 dark:text-white">{editingGoal ? 'Sửa mục tiêu' : 'Mục tiêu mới'}</h3><button onClick={() => setGoalModalOpen(false)} className="text-gray-400">✕</button></div>
                            <div className="p-6 space-y-4">
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên mục tiêu</label><input value={name} onChange={e => setName(e.target.value)} className={inputStyle} /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số tiền đích</label><MoneyInput value={target} onChange={setTarget} className={inputStyle} /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hiện có</label><MoneyInput value={current} onChange={setCurrent} className={inputStyle} /></div>
                                </div>
                                <button onClick={handleSaveGoal} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg mt-2">Lưu</button>
                            </div>
                        </div>
                    </div>
                )}

                {depositModal.isOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-fade-in-up border border-gray-200 dark:border-gray-700">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 text-center bg-gray-50 dark:bg-gray-900"><h3 className="font-bold text-lg text-gray-800 dark:text-white">Nạp thêm tiền</h3></div>
                            <div className="p-6 space-y-4">
                                <MoneyInput value={depositAmount} onChange={setDepositAmount} className={`${inputStyle} text-center text-xl font-bold`} placeholder="Số tiền" autoFocus />
                                <button onClick={handleDeposit} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg">Xác nhận</button>
                                <button onClick={() => { setDepositModal({ isOpen: false, goalId: null }); setDepositAmount(0); }} className="w-full text-gray-500 text-sm font-medium hover:text-gray-800 dark:hover:text-white">Hủy bỏ</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const DebtTabFull = () => {
        const [isDebtModalOpen, setDebtModalOpen] = useState(false);
        const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null);
        const [filterStatus, setFilterStatus] = useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'PAID'>('ALL');

        const [dName, setDName] = useState('');
        const [dAmount, setDAmount] = useState(0);
        const [dType, setDType] = useState<'payable' | 'receivable'>('receivable');
        const [dDueDate, setDDueDate] = useState('');
        const [dNote, setDNote] = useState('');

        const resetForm = () => { setDName(''); setDAmount(0); setDType('receivable'); setDDueDate(''); setDNote(''); setEditingDebt(null); };

        const handleSaveDebt = async () => {
            if (!dName || !dAmount) return;
            const newItem: DebtItem = {
                id: editingDebt ? editingDebt.id : Date.now().toString(),
                personName: dName,
                amount: Number(dAmount),
                type: dType,
                dueDate: dDueDate || undefined,
                note: dNote || undefined,
                isPaid: editingDebt ? editingDebt.isPaid : false
            };

            if (currentUser) {
                await financialService.saveDebt(currentUser.uid, newItem);
                handleRefresh();
            }
            else {
                if (editingDebt) setDebts(prev => prev.map(d => d.id === editingDebt.id ? newItem : d));
                else setDebts(prev => [newItem, ...prev]);
            }
            setDebtModalOpen(false); resetForm();
        };

        const deleteDebt = async (id: string) => {
            if (!window.confirm("Xóa khoản này?")) return;
            if (currentUser) {
                await financialService.deleteDebt(currentUser.uid, id);
                handleRefresh();
            }
            else setDebts(prev => prev.filter(d => d.id !== id));
        };

        const togglePaid = async (d: DebtItem) => {
            const updated = { ...d, isPaid: !d.isPaid };
            if (currentUser) {
                await financialService.saveDebt(currentUser.uid, updated);
                handleRefresh();
            }
            else setDebts(prev => prev.map(item => item.id === d.id ? updated : item));
        };

        const filteredDebts = debts.filter(d => {
            if (filterStatus === 'ALL') return true;
            if (filterStatus === 'PAID') return d.isPaid;
            if (filterStatus === 'RECEIVABLE') return d.type === 'receivable' && !d.isPaid;
            if (filterStatus === 'PAYABLE') return d.type === 'payable' && !d.isPaid;
            return true;
        });

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        {[{ id: 'ALL', l: 'Tất cả' }, { id: 'RECEIVABLE', l: 'Phải thu' }, { id: 'PAYABLE', l: 'Phải trả' }, { id: 'PAID', l: 'Đã xong' }].map(f => (
                            <button key={f.id} onClick={() => setFilterStatus(f.id as any)} className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${filterStatus === f.id ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'}`}>{f.l}</button>
                        ))}
                    </div>
                    <button onClick={() => { resetForm(); setDebtModalOpen(true); }} className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 flex items-center justify-center gap-2"><span>+</span> Thêm</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredDebts.map(d => (
                        <div key={d.id} className={`relative bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 hover:shadow-md transition-all group ${d.type === 'receivable' ? 'border-l-green-500' : 'border-l-red-500'} ${d.isPaid ? 'opacity-70 bg-gray-50 dark:bg-gray-900' : ''}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className={`font-bold text-lg ${d.isPaid ? 'text-gray-500 line-through' : 'text-gray-800 dark:text-white'}`}>{d.personName}</h4>
                                        {d.isPaid && <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded font-bold">Đã xong</span>}
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded mt-1 inline-block ${d.type === 'receivable' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                                        {d.type === 'receivable' ? 'Phải thu 📥' : 'Phải trả 📤'}
                                    </span>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded">
                                    <button onClick={() => { setDName(d.personName); setDAmount(d.amount); setDType(d.type); setDDueDate(d.dueDate || ''); setDNote(d.note || ''); setEditingDebt(d); setDebtModalOpen(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-blue-500">✏️</button>
                                    <button onClick={() => deleteDebt(d.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-red-500">🗑</button>
                                </div>
                            </div>
                            <div className="flex items-end gap-1 mb-3"><span className={`text-2xl font-bold ${d.type === 'receivable' ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(d.amount)}</span></div>
                            <button onClick={() => togglePaid(d)} className={`w-full mt-4 py-2 rounded-lg text-xs font-bold border transition-colors ${d.isPaid ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600' : 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-gray-600'}`}>{d.isPaid ? 'Hoàn tác' : 'Đánh dấu đã xong ✅'}</button>
                        </div>
                    ))}
                </div>

                {isDebtModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-gray-200 dark:border-gray-700">
                            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900"><h3 className="font-bold text-lg text-gray-800 dark:text-white">{editingDebt ? 'Chỉnh sửa' : 'Thêm khoản nợ'}</h3><button onClick={() => setDebtModalOpen(false)} className="text-gray-400">✕</button></div>
                            <div className="p-6 space-y-4">
                                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl"><button onClick={() => setDType('receivable')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${dType === 'receivable' ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Phải Thu</button><button onClick={() => setDType('payable')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${dType === 'payable' ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Phải Trả</button></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên người / Đơn vị</label><input value={dName} onChange={e => setDName(e.target.value)} className={inputStyle} autoFocus /></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số tiền</label><MoneyInput value={dAmount} onChange={setDAmount} className={inputStyle} /></div>
                                <button onClick={handleSaveDebt} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg mt-2">Lưu</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-medium animate-pulse">Đang đồng bộ dữ liệu tài chính...</p>
            </div>
        );
    }

    return (
        <div className="pb-24 md:pb-20">
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        Tài Chính
                        {currentUser && (
                            <button
                                onClick={handleRefresh}
                                className="ml-2 p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400 transition-colors shadow-sm text-sm"
                                title="Làm mới dữ liệu"
                            >
                                ↻
                            </button>
                        )}
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm">Quản lý dòng tiền {currentUser ? '(Cloud Save)' : '(Chế độ Khách)'}</p>
                </div>
            </div>
            <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-full overflow-x-auto no-scrollbar">
                {[{ id: 'overview', label: 'Tổng Quan' }, { id: 'budget', label: 'Ngân Sách' }, { id: 'goals', label: 'Mục Tiêu' }, { id: 'debt', label: 'Sổ Nợ' }, { id: 'invest', label: 'Thông tin Thị trường & Vàng' }].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition-all ${activeTab === t.id ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>{t.label}</button>
                ))}
            </div>
            <div className="min-h-[500px]">
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'budget' && <BudgetTab />}
                {activeTab === 'goals' && <GoalsTabFull />}
                {activeTab === 'debt' && <DebtTabFull />}
                {activeTab === 'invest' && <InvestmentDashboard uid={currentUser?.uid} />}
            </div>
            {isTransModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md animate-fade-in-up border border-gray-200 dark:border-gray-700">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900"><h3 className="font-bold text-lg text-gray-800 dark:text-white">Thêm Giao Dịch</h3><button onClick={() => setTransModalOpen(false)} className="text-gray-500">✕</button></div>
                        <div className="p-4 md:p-6 space-y-4">
                            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl"><button onClick={() => setNewTrans({ ...newTrans, type: 'income', category: '' })} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${newTrans.type === 'income' ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Thu Nhập</button><button onClick={() => setNewTrans({ ...newTrans, type: 'expense', category: '' })} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${newTrans.type === 'expense' ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Chi Tiêu</button></div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số tiền</label>
                                <MoneyInput value={newTrans.amount || 0} onChange={(val) => setNewTrans({ ...newTrans, amount: val })} className={inputStyle} placeholder="0" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Danh mục</label>
                                <select value={newTrans.category} onChange={e => setNewTrans({ ...newTrans, category: e.target.value })} className={inputStyle}>
                                    <option value="" disabled>-- Chọn danh mục --</option>
                                    {getAvailableCategories().map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Budget Preview Box */}
                            {budgetPreview && (
                                <div className={`rounded-lg p-3 text-xs border ${budgetPreview.isOver ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'}`}>
                                    <div className="flex justify-between font-bold mb-1">
                                        <span>Ngân sách: {budgetPreview.name}</span>
                                        <span>{budgetPreview.percent.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-white/50 h-1.5 rounded-full overflow-hidden mb-1">
                                        <div className={`h-full rounded-full ${budgetPreview.isOver ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${budgetPreview.percent}%` }}></div>
                                    </div>
                                    <div className="flex justify-between opacity-80">
                                        <span>Đã dùng (kể cả đơn này): {formatCurrency(budgetPreview.newTotal)}</span>
                                        <span>Hạn mức: {formatCurrency(budgetPreview.limit)}</span>
                                    </div>
                                    {budgetPreview.newTotal > budgetPreview.limit && (
                                        <p className="text-red-600 font-bold mt-1">⚠️ Bạn sẽ vượt ngân sách {formatCurrency(Math.abs(budgetPreview.remaining))}</p>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày</label><input type="date" value={newTrans.date} onChange={e => setNewTrans({ ...newTrans, date: e.target.value })} className={inputStyle} /></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ghi chú</label><input type="text" value={newTrans.description} onChange={e => setNewTrans({ ...newTrans, description: e.target.value })} className={inputStyle} placeholder="Chi tiết..." /></div>
                            </div>
                            <button onClick={addTransaction} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 mt-2">Lưu Giao Dịch</button>
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'overview' && (
                <button onClick={() => setTransModalOpen(true)} className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center text-3xl hover:bg-blue-700 hover:scale-110 transition-transform z-40 md:bottom-10">
                    +
                </button>
            )}

            {/* AI Plan Modal */}
            {aiPlan && (
                <AIPlanModal
                    isOpen={!!aiPlan}
                    onClose={() => setAiPlan(null)}
                    onSave={handleSaveAIPlan}
                    plan={aiPlan}
                />
            )}
        </div>
    );
};
