
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { marketService, MarketData } from '../services/market';
import { financialService, MarketAnalysisResult } from '../services/financial';

const COLORS = ['#FFD700', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'];

// --- UI Components ---

const TickerItem: React.FC<{ label: string, value: string, change: number, prefix?: string }> = ({ label, value, change, prefix = '' }) => {
    const isUp = change >= 0;
    return (
        <div className="flex items-center gap-3 px-4 border-r border-gray-800 min-w-max group cursor-default">
            <span className="text-[10px] font-bold text-gray-500 group-hover:text-white transition-colors">{label}</span>
            <div className="flex items-baseline gap-2">
                <span className={`text-xs font-mono font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                    {prefix}{value}
                </span>
                <span className={`text-[9px] ${isUp ? 'text-green-600' : 'text-red-600'} bg-gray-900/50 px-1 rounded`}>
                    {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                </span>
            </div>
        </div>
    );
};

const AssetCard: React.FC<{ title: string, price: string, change: number, subtext?: string, icon: string, type: string }> = ({ title, price, change, subtext, icon, type }) => {
    const isUp = change >= 0;
    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50 hover:border-gray-600 transition-all group relative overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-xl shadow-lg border border-gray-700">{icon}</div>
                    <div>
                        <h4 className="text-gray-200 font-bold text-sm group-hover:text-white transition-colors">{title}</h4>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{type}</span>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-white font-mono tracking-tight">{price}</p>
                    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${isUp ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                        <span className="text-[10px] font-bold">{isUp ? '+' : ''}{change.toFixed(2)}%</span>
                    </div>
                </div>
            </div>
            {subtext && <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-400 flex justify-between">
                <span>Status</span>
                <span className="text-white font-medium">{subtext}</span>
            </div>}
        </div>
    );
};

export const InvestmentDashboard: React.FC<{ uid?: string }> = ({ uid }) => {
    const [market, setMarket] = useState<MarketData | null>(null);
    const [aiResult, setAiResult] = useState<MarketAnalysisResult | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [viewMode, setViewMode] = useState<'terminal' | 'chart'>('terminal');

    useEffect(() => {
        const load = async () => {
            const data = await marketService.getMarketData();
            setMarket(data);
        };
        load();
        const interval = setInterval(load, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    const handleAnalyze = async () => {
        if (!uid || !market) return;
        setAnalyzing(true);
        try {
            const result = await financialService.generateMarketAnalysisAndAdvice(uid, market);
            setAiResult(result);
        } catch (e) {
            alert("Lỗi phân tích AI: " + (e as any).message);
        } finally {
            setAnalyzing(false);
        }
    };

    const formatVND = (val: number) => new Intl.NumberFormat('vi-VN').format(val);
    const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    if (!market) return <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in text-gray-100 bg-gray-900 p-4 md:p-6 rounded-2xl border border-gray-800 shadow-2xl">

            {/* 1. Financial Terminal Header (Ticker) */}
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-blue-500">⚡</span> Market Terminal
                    </h2>
                    <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                        <button onClick={() => setViewMode('terminal')} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${viewMode === 'terminal' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Terminal</button>
                        <button onClick={() => setViewMode('chart')} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${viewMode === 'chart' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Live Charts</button>
                    </div>
                </div>

                <div className="bg-black/40 rounded-lg border border-gray-800 overflow-hidden flex items-center h-10">
                    <div className="bg-blue-600 h-full px-3 flex items-center justify-center shrink-0">
                        <span className="font-bold text-[10px] text-white">LIVE</span>
                    </div>
                    <div className="flex-1 overflow-x-auto scrollbar-hide flex items-center whitespace-nowrap">
                        <TickerItem label="VN-INDEX" value={market.vnIndex.value.toString()} change={market.vnIndex.changePercent} />
                        <TickerItem label="SJC SELL" value={(market.sjcGold.sell / 1000000).toFixed(2) + 'M'} change={market.sjcGold.change} />
                        {market.items.map(item => (
                            <TickerItem
                                key={item.symbol}
                                label={item.symbol}
                                value={item.type === 'fiat' || item.type === 'gold' ? formatVND(item.price) : formatUSD(item.price)}
                                change={item.change24h}
                                prefix={item.type === 'crypto' ? '' : ''}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* 2. Main Content Area */}
            {viewMode === 'chart' ? (
                <div className="bg-white rounded-xl h-[600px] w-full overflow-hidden border border-gray-700">
                    {/* Embedding reliable external chart for Vietnam Gold as requested visually */}
                    <iframe
                        src="https://webtygia.com/api/bieu-do-gia-vang-sjc-trong-nuoc.html"
                        title="Vietnam Gold Chart"
                        className="w-full h-full border-none"
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* LEFT: Market Watch (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <AssetCard
                                title="Vàng SJC (Bán ra)"
                                price={`${formatVND(market.sjcGold.sell)} ₫`}
                                change={market.sjcGold.change}
                                subtext={`Mua vào: ${formatVND(market.sjcGold.buy)} ₫`}
                                icon="🪙"
                                type="Commodity"
                            />
                            <AssetCard
                                title="Bitcoin (BTC)"
                                price={formatUSD(market.items.find(i => i.symbol === 'BTC')?.price || 0)}
                                change={market.items.find(i => i.symbol === 'BTC')?.change24h || 0}
                                subtext="Crypto Market Cap Leader"
                                icon="₿"
                                type="Crypto"
                            />
                            <AssetCard
                                title="VN-Index"
                                price={market.vnIndex.value.toString()}
                                change={market.vnIndex.changePercent}
                                subtext="HOSE | Vietnam Stocks"
                                icon="📊"
                                type="Index"
                            />
                            <AssetCard
                                title="USD/VND"
                                price={formatVND(market.items.find(i => i.symbol === 'USD')?.price || 0)}
                                change={market.items.find(i => i.symbol === 'USD')?.change24h || 0}
                                subtext="Free Market Rate"
                                icon="💵"
                                type="Forex"
                            />
                        </div>

                        {/* Detailed Table */}
                        <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="font-bold text-white text-sm">Global Assets Overview</h3>
                                <span className="text-[10px] text-gray-500">Updated: {new Date(market.lastUpdated).toLocaleTimeString()}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-300">
                                    <thead className="text-xs text-gray-500 uppercase bg-gray-900/50 border-b border-gray-700">
                                        <tr>
                                            <th className="px-4 py-3">Asset</th>
                                            <th className="px-4 py-3 text-right">Price</th>
                                            <th className="px-4 py-3 text-right">24h Change</th>
                                            <th className="px-4 py-3 text-right hidden sm:table-cell">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700/50">
                                        {market.items.map((item) => (
                                            <tr key={item.symbol} className="hover:bg-gray-700/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white">{item.name}</span>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">{item.symbol}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-white">
                                                    {item.type === 'fiat' || item.type === 'gold' ? formatVND(item.price) : formatUSD(item.price)}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-bold ${item.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {item.change24h > 0 ? '+' : ''}{item.change24h.toFixed(2)}%
                                                </td>
                                                <td className="px-4 py-3 text-right hidden sm:table-cell">
                                                    <span className="text-[10px] text-gray-500">{item.type.toUpperCase()}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: AI Strategist (1/3) */}
                    <div className="lg:col-span-1 flex flex-col h-full">
                        <div className="bg-gradient-to-b from-indigo-900/50 to-gray-900 rounded-xl border border-indigo-500/30 p-5 flex-1 flex flex-col shadow-2xl relative overflow-hidden">
                            {/* Glow Effect */}
                            <div className="absolute -top-20 -right-20 w-60 h-60 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-indigo-500/20">
                                    <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-2xl shadow-lg shadow-indigo-900/50">🧠</div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">AI Strategist</h3>
                                        <p className="text-xs text-indigo-300">Powered by Gemini 2.5 Flash</p>
                                    </div>
                                </div>

                                {!aiResult ? (
                                    <div className="text-center py-12 space-y-6">
                                        <div className="w-20 h-20 bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                                            <span className="text-4xl opacity-50">📈</span>
                                        </div>
                                        <p className="text-sm text-gray-400 px-4">
                                            Activate AI to analyze live market data against your income profile for a personalized strategy.
                                        </p>
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={analyzing || !uid}
                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/50 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {analyzing ? <span className="animate-spin">↻ Processing...</span> : '⚡ Generate Strategy'}
                                        </button>
                                        {!uid && <p className="text-xs text-red-400 bg-red-900/20 py-1 rounded border border-red-900/50">Login required for AI features</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-6 animate-fade-in h-full flex flex-col">
                                        {/* 1. Trend Summary */}
                                        <div className="bg-black/30 rounded-lg p-3 border border-white/5 backdrop-blur-sm">
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Market Trend</p>
                                            <p className="text-xs text-gray-200 leading-relaxed">{aiResult.marketTrend}</p>
                                        </div>

                                        {/* 2. Allocation Chart */}
                                        <div className="h-48 relative">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={aiResult.recommendedAllocation}
                                                        cx="50%" cy="50%"
                                                        innerRadius={45} outerRadius={65}
                                                        paddingAngle={4}
                                                        dataKey="percentage"
                                                        stroke="none"
                                                    >
                                                        {aiResult.recommendedAllocation.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                                                        itemStyle={{ color: '#fff' }}
                                                        formatter={(val) => `${val}%`}
                                                    />
                                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#9ca3af' }} layout="vertical" verticalAlign="middle" align="right" />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -translate-x-6">
                                                <span className="text-[10px] text-gray-500 font-bold">PORTFOLIO</span>
                                            </div>
                                        </div>

                                        {/* 3. Advice & Action */}
                                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                                            <div className="p-3 bg-emerald-900/10 border border-emerald-500/20 rounded-lg">
                                                <p className="text-xs font-bold text-emerald-400 mb-1">💡 Advisor's Note</p>
                                                <p className="text-xs text-gray-300 leading-relaxed">{aiResult.investmentAdvice}</p>
                                            </div>

                                            {aiResult.actionableSteps && (
                                                <div className="space-y-2">
                                                    {aiResult.actionableSteps.map((step, i) => (
                                                        <div key={i} className="flex gap-2 text-xs text-gray-400 bg-gray-800/50 p-2 rounded border border-gray-700/50">
                                                            <span className="text-indigo-500 font-bold">{i + 1}.</span>
                                                            <span>{step}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <button onClick={() => setAiResult(null)} className="w-full py-2 text-xs font-bold text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 rounded-lg transition-colors mt-auto">
                                            Reset Analysis
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
