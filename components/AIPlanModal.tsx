
import React, { useState, useEffect } from 'react';
import { AIFinancialPlan, AIFinancialAnalysis } from '../services/gemini';
import { BudgetCategory, FinancialGoal } from '../types';

interface AIPlanModalProps {
    isOpen: boolean;
    mode: 'analysis' | 'planning';
    onClose: () => void;
    onSave?: (budgets: BudgetCategory[], goals: FinancialGoal[]) => void;
    onSaveAnalysis?: () => void;
    planData?: AIFinancialPlan;
    analysisData?: AIFinancialAnalysis;
}

export const AIPlanModal: React.FC<AIPlanModalProps> = ({ isOpen, mode, onClose, onSave, onSaveAnalysis, planData, analysisData }) => {
    const [budgets, setBudgets] = useState<any[]>([]);
    const [goals, setGoals] = useState<any[]>([]);

    useEffect(() => {
        if (planData) {
            setBudgets(planData.recommendedBudgets);
            setGoals(planData.recommendedGoals);
        }
    }, [planData]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!onSave) return;

        // Convert to standard types
        const finalBudgets: BudgetCategory[] = budgets.map((b, i) => ({
            id: `ai_budget_${i}`, // Temp ID
            name: b.name,
            limit: Number(b.limit),
            spent: 0,
            type: b.type
        }));

        const finalGoals: FinancialGoal[] = goals.map((g, i) => ({
            id: `ai_goal_${i}`,
            name: g.name,
            targetAmount: Number(g.targetAmount),
            currentAmount: 0,
            type: g.type,
            deadline: g.deadline,
            color: 'bg-indigo-500'
        }));

        onSave(finalBudgets, finalGoals);
    };

    const getHealthColor = (score: number) => {
        if (score >= 80) return 'text-green-500 border-green-500';
        if (score >= 60) return 'text-yellow-500 border-yellow-500';
        return 'text-red-500 border-red-500';
    };

    // --- VIEW: ANALYSIS (Read-Only Insights) ---
    if (mode === 'analysis' && analysisData) {
        return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <span>📊</span> Phân tích Tài chính
                            </h2>
                            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
                        </div>
                        <p className="text-blue-100 text-sm mt-2 opacity-90">Đánh giá sức khỏe tài chính dựa trên lịch sử giao dịch.</p>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-8 bg-gray-50 dark:bg-gray-900">
                        {/* Health Score */}
                        <div className="flex flex-col items-center justify-center text-center p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center mb-4 ${getHealthColor(analysisData.healthScore)}`}>
                                <span className={`text-4xl font-bold ${getHealthColor(analysisData.healthScore).replace('border-', '')}`}>
                                    {analysisData.healthScore}
                                </span>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800 dark:text-white">{analysisData.healthRating}</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Điểm sức khỏe tài chính</p>
                        </div>

                        {/* Insights Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800">
                                <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">📈 Xu hướng chính</h4>
                                <ul className="space-y-2">
                                    {analysisData.keyTrends.map((trend, i) => (
                                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                                            <span className="text-blue-500">•</span> {trend}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="bg-orange-50 dark:bg-orange-900/20 p-5 rounded-xl border border-orange-100 dark:border-orange-800">
                                <h4 className="font-bold text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">⚠️ Cảnh báo & Bất thường</h4>
                                <ul className="space-y-2">
                                    {analysisData.anomalies.map((warn, i) => (
                                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                                            <span className="text-orange-500">!</span> {warn}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h4 className="font-bold text-gray-800 dark:text-white mb-3">📝 Tổng kết</h4>
                            <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">{analysisData.sentiment}</p>
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end gap-3">
                        <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-xl font-bold transition-colors">Đóng</button>
                        <button onClick={onSaveAnalysis} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-md">Lưu phân tích</button>
                    </div>
                </div>
            </div>
        );
    }

    // --- VIEW: PLANNING (Editable Budgets & Goals) ---
    if (mode === 'planning' && planData) {
        return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <span>📅</span> Lập Kế hoạch Tài chính
                            </h2>
                            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
                        </div>
                        <p className="text-purple-100 text-sm opacity-90">Đề xuất ngân sách và mục tiêu dựa trên thói quen chi tiêu.</p>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-8 bg-gray-50 dark:bg-gray-900">

                        {/* Budgets Section */}
                        <section>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                <span className="text-blue-600">📉</span> Ngân sách Đề xuất
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {budgets.map((b, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                        <div className="flex justify-between mb-2">
                                            <input
                                                value={b.name}
                                                onChange={(e) => {
                                                    const updated = [...budgets];
                                                    updated[idx].name = e.target.value;
                                                    setBudgets(updated);
                                                }}
                                                className="font-bold text-gray-700 dark:text-gray-200 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none w-full mr-2"
                                            />
                                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500 uppercase font-bold tracking-wider">{b.type}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={b.limit}
                                                onChange={(e) => {
                                                    const updated = [...budgets];
                                                    updated[idx].limit = Number(e.target.value);
                                                    setBudgets(updated);
                                                }}
                                                className="text-xl font-bold text-blue-600 bg-transparent border-b border-gray-100 focus:border-blue-500 outline-none w-32"
                                            />
                                            <span className="text-gray-400 text-sm">VNĐ</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2 italic">💡 {b.reason}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Goals Section */}
                        <section>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                <span className="text-green-600">🎯</span> Mục tiêu Tài chính
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {goals.map((g, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-bl-full -mr-8 -mt-8"></div>
                                        <div className="relative z-10">
                                            <div className="flex justify-between mb-2">
                                                <input
                                                    value={g.name}
                                                    onChange={(e) => {
                                                        const updated = [...goals];
                                                        updated[idx].name = e.target.value;
                                                        setGoals(updated);
                                                    }}
                                                    className="font-bold text-gray-700 dark:text-gray-200 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 outline-none w-full mr-2"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 mb-2">
                                                <label className="text-[10px] text-gray-400 uppercase font-bold">Target Amount</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={g.targetAmount}
                                                        onChange={(e) => {
                                                            const updated = [...goals];
                                                            updated[idx].targetAmount = Number(e.target.value);
                                                            setGoals(updated);
                                                        }}
                                                        className="text-xl font-bold text-green-600 bg-transparent border-b border-gray-100 focus:border-green-500 outline-none w-full"
                                                    />
                                                </div>
                                            </div>
                                            {g.deadline && <p className="text-xs text-gray-500">📅 Deadline: {g.deadline}</p>}
                                            <p className="text-xs text-gray-500 mt-2 italic">💡 {g.reason}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                <h4 className="font-bold text-indigo-800 dark:text-indigo-300 text-sm mb-1">💡 Cashflow Strategy</h4>
                                <p className="text-sm text-indigo-700 dark:text-indigo-200">{planData.cashflowInsight}</p>
                            </div>
                            {planData.debtStrategy && (
                                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-800">
                                    <h4 className="font-bold text-red-800 dark:text-red-300 text-sm mb-1">💸 Kế hoạch trả nợ</h4>
                                    <p className="text-sm text-red-700 dark:text-red-200">{planData.debtStrategy}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end gap-3">
                        <button onClick={onClose} className="px-6 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-bold transition-colors">Hủy bỏ</button>
                        <button onClick={handleSave} className="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-transform active:scale-95">
                            ✅ Áp dụng Kế hoạch
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
