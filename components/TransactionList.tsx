
import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { financialService } from '../services/financial';

interface TransactionListProps {
    uid?: string;
    refreshTrigger: number; // Simple counter to force reload
    onDelete: (id: string) => void;
}

const PAGE_SIZE = 8;

const getCategoryIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('ăn') || lower.includes('food')) return '🍔';
    if (lower.includes('đi') || lower.includes('xăng') || lower.includes('xe')) return '🛵';
    if (lower.includes('nhà') || lower.includes('bill')) return '🏠';
    if (lower.includes('sắm')) return '🛍️';
    if (lower.includes('lương')) return '💰';
    if (lower.includes('thưởng')) return '🎁';
    return '💸';
};

const formatCurrency = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('vi-VN');

export const TransactionList: React.FC<TransactionListProps> = ({ uid, refreshTrigger, onDelete }) => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);

    // Pagination State
    const [pageIndex, setPageIndex] = useState(0);
    const [pageCursors, setPageCursors] = useState<any[]>([null]); // Stack of cursors. Index 0 is null (start)
    const [hasMore, setHasMore] = useState(true);

    // Guest Mode Data
    useEffect(() => {
        if (!uid) {
            const local = localStorage.getItem('dh_fin_trans');
            if (local) {
                const all = JSON.parse(local) as Transaction[];
                setTransactions(all.slice(0, PAGE_SIZE)); // Simple slice for guest
                setHasMore(all.length > PAGE_SIZE);
            } else {
                setTransactions([]);
            }
        } else {
            fetchPage(0);
        }
    }, [uid, refreshTrigger]);

    const fetchPage = async (index: number) => {
        if (!uid) return;
        setLoading(true);
        try {
            const cursor = pageCursors[index];
            const result = await financialService.getTransactionsPaged(uid, PAGE_SIZE, cursor);

            setTransactions(result.data);

            // Prepare cursor for next page
            if (result.lastDoc) {
                const newCursors = [...pageCursors];
                newCursors[index + 1] = result.lastDoc;
                setPageCursors(newCursors);
                setHasMore(result.data.length === PAGE_SIZE);
            } else {
                setHasMore(false);
            }

            setPageIndex(index);
        } catch (e) {
            console.error("Load error", e);
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        if (hasMore) fetchPage(pageIndex + 1);
    };

    const handlePrev = () => {
        if (pageIndex > 0) fetchPage(pageIndex - 1);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2">
                    <span>🕒</span> Lịch sử giao dịch
                </h3>
                {uid && (
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={pageIndex === 0 || loading}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                        >
                            ◀
                        </button>
                        <span className="text-xs font-bold self-center text-gray-500">Trang {pageIndex + 1}</span>
                        <button
                            onClick={handleNext}
                            disabled={!hasMore || loading}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                        >
                            ▶
                        </button>
                    </div>
                )}
            </div>

            <div className="space-y-3 min-h-[300px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-40 space-y-3">
                        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-xs text-gray-400">Đang tải...</p>
                    </div>
                ) : transactions.length > 0 ? (
                    transactions.map((t) => (
                        <div key={t.id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl border border-transparent hover:border-gray-100 dark:hover:border-gray-600 transition-all group">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${t.type === 'income' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}>
                                    {getCategoryIcon(t.category)}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">{t.category}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{t.description || formatDate(t.date)} • {formatDate(t.date)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`font-bold text-sm ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                                </span>
                                <button
                                    onClick={() => onDelete(t.id)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition-all"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 text-gray-400 text-sm italic bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                        Chưa có giao dịch nào.
                    </div>
                )}
            </div>
        </div>
    );
};
