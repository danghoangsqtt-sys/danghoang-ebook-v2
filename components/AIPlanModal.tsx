import React, { useState } from 'react';
import { AIFinancialPlan } from '../services/gemini';
import { BudgetCategory, FinancialGoal } from '../types';

interface AIPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (budgets: BudgetCategory[], goals: FinancialGoal[]) => void;
    plan: AIFinancialPlan;
}

export const AIPlanModal: React.FC<AIPlanModalProps> = ({ isOpen, onClose, onSave, plan }) => {
    const [budgets, setBudgets] = useState(plan.recommendedBudgets);
    const [goals, setGoals] = useState(plan.recommendedGoals);

    if (!isOpen) return null;

    const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    const handleSave = () => {
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

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <span>🤖</span> Kế hoạch Tài chính AI
                        </h2>
                        <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
                    </div>
                    <p className="text-indigo-100 text-sm opacity-90 leading-relaxed">{plan.analysisComment}</p>
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

                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 flex items-start gap-3">
                        <span className="text-2xl">📊</span>
                        <div>
                            <h4 className="font-bold text-indigo-800 dark:text-indigo-300 text-sm">Cashflow Insight</h4>
                            <p className="text-sm text-indigo-700 dark:text-indigo-200 mt-1">{plan.cashflowInsight}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-bold transition-colors">Hủy bỏ</button>
                    <button onClick={handleSave} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-transform active:scale-95">
                        ✅ Áp dụng Kế hoạch
                    </button>
                </div>
            </div>
        </div>
    );
};