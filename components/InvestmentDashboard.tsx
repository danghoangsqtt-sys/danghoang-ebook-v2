
import React, { useState, useEffect, useRef } from 'react';
import { marketService, MarketData } from '../services/market';
import { financialService, MarketAnalysisResult } from '../services/financial';

// --- Helper Components ---

const GiaVangVietnamWidget = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear previous content to avoid duplicates
        containerRef.current.innerHTML = '';

        // Create the widget container div
        const widgetDiv = document.createElement('div');
        widgetDiv.id = 'gia-vang-viet-nam';
        // Combine attributes: Domestic prices + World Gold Chart
        widgetDiv.setAttribute('show-prices', 'sjc,pnj,doji,phuquy,btmc,mihong');
        widgetDiv.setAttribute('show-xauusd', 'true');
        widgetDiv.setAttribute('show-chart', 'true'); // Ensure chart is enabled if supported explicitly
        widgetDiv.style.width = '100%';

        containerRef.current.appendChild(widgetDiv);

        // Create and append the script
        const script = document.createElement('script');
        script.src = 'https://cls.giavangvietnam.com/js/widget.js';
        script.async = true;
        containerRef.current.appendChild(script);

        return () => {
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, []);

    return (
        <div className="w-full bg-white rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-md p-1">
            <div ref={containerRef} className="min-h-[500px] w-full"></div>
        </div>
    );
};

const SimpleMarkdownRenderer = ({ content }: { content: string }) => {
    if (!content) return null;
    const lines = content.split('\n');
    return (
        <div className="space-y-2 text-sm leading-relaxed text-gray-300">
            {lines.map((line, idx) => {
                const parseBold = (text: string) => {
                    const parts = text.split(/(\*\*.*?\*\*)/g);
                    return parts.map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i} className="text-yellow-400">{part.slice(2, -2)}</strong>;
                        }
                        return part;
                    });
                };

                // Headers
                if (line.trim().startsWith('#')) {
                    return <h4 key={idx} className="font-bold text-white mt-4 mb-2 text-base border-b border-gray-700 pb-1">{parseBold(line.replace(/^#+\s/, ''))}</h4>
                }

                // Lists
                if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                    return <div key={idx} className="flex gap-2 ml-1"><span className="text-indigo-400 font-bold flex-shrink-0 mt-1">•</span><span>{parseBold(line.replace(/^[\-\*]\s/, ''))}</span></div>
                }

                return <div key={idx}>{parseBold(line)}</div>;
            })}
        </div>
    );
};

// --- Main Component ---

export const InvestmentDashboard: React.FC<{ uid?: string }> = ({ uid }) => {
    const [market, setMarket] = useState<MarketData | null>(null);
    const [aiResult, setAiResult] = useState<MarketAnalysisResult | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [isStandardTier, setIsStandardTier] = useState(false);

    // News State
    const [newsContent, setNewsContent] = useState<string>("");
    const [loadingNews, setLoadingNews] = useState(false);

    useEffect(() => {
        const load = async () => {
            const data = await marketService.getMarketData();
            setMarket(data);

            // Check if using OpenAI key (Standard Tier)
            const key = localStorage.getItem('dh_gemini_api_key') || '';
            if (key.startsWith('sk-')) {
                setIsStandardTier(true);
            }
        };
        load();
    }, []);

    const handleAnalyze = async () => {
        if (!uid || !market) return;

        if (isStandardTier) {
            alert("Tính năng này chỉ dành cho tài khoản VIP (Gemini API). Vui lòng nâng cấp.");
            return;
        }

        setAnalyzing(true);
        try {
            const result = await financialService.generateWeeklyMarketAnalysis(uid, market);
            setAiResult(result);
        } catch (e) {
            alert("Lỗi phân tích AI: " + (e as any).message);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleFetchNews = async () => {
        if (!uid) return;

        if (isStandardTier) {
            // Allow restricted news fetch or just warn? 
            // Requirements say "cannot use analysis info and market news"
            // OpenAI also doesn't have Google Search grounding, so we block it.
            alert("Tính năng tin tức thị trường chỉ dành cho tài khoản VIP.");
            return;
        }

        setLoadingNews(true);
        try {
            const content = await financialService.getMarketNews();
            setNewsContent(content);
        } catch (e) {
            setNewsContent("Không thể tải tin tức lúc này.");
        } finally {
            setLoadingNews(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in text-gray-100 bg-gray-950 p-2 md:p-4 rounded-2xl border border-gray-800 shadow-2xl min-h-screen">

            {/* 1. Header */}
            <div className="flex items-center justify-between bg-gray-900 p-4 rounded-xl border border-gray-800">
                <h2 className="text-xl font-bold text-yellow-500 flex items-center gap-2">
                    <span>🥇</span> Thông tin Thị trường & Giá Vàng
                </h2>
                <span className="text-xs text-gray-400">Cập nhật thời gian thực</span>
            </div>

            {/* 2. Gold Prices & Charts (Consolidated Widget) */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 px-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        <h3 className="font-bold text-white text-sm md:text-base">Bảng Giá Vàng Trực Tuyến (SJC & Thế Giới)</h3>
                    </div>
                    <span className="text-xs text-gray-500 italic">Nguồn: giavangvietnam.com</span>
                </div>

                <GiaVangVietnamWidget />
            </div>

            {/* 3. News & Real Estate Section */}
            <div className="mt-8 bg-gray-900/50 rounded-xl border border-gray-800 p-6 shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-xl">📰</div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Tin tức Thị trường & Bất động sản</h3>
                            <p className="text-xs text-gray-400">Tổng hợp từ Google Search {isStandardTier && '(Yêu cầu VIP)'}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleFetchNews}
                        disabled={loadingNews || !uid || isStandardTier}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 disabled:bg-gray-700"
                    >
                        {loadingNews ? <span className="animate-spin">↻</span> : (isStandardTier ? '🔒' : '🔍')}
                        {loadingNews ? 'Đang tìm kiếm...' : (isStandardTier ? 'VIP Only' : 'Cập nhật Tin tức')}
                    </button>
                </div>

                <div className="bg-black/30 rounded-xl p-5 border border-gray-800 min-h-[200px]">
                    {loadingNews ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500 space-y-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <p>Đang tổng hợp tin tức mới nhất...</p>
                        </div>
                    ) : newsContent ? (
                        <div className="animate-fade-in">
                            <SimpleMarkdownRenderer content={newsContent} />
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500 italic">
                            {isStandardTier
                                ? "Tính năng Tin tức bị giới hạn ở gói Standard. Vui lòng nâng cấp lên VIP."
                                : 'Nhấn "Cập nhật Tin tức" để xem thông tin mới nhất về Tài chính và Bất động sản Việt Nam.'
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* 4. AI Weekly Analysis */}
            <div className="mt-8 bg-gradient-to-b from-indigo-900/20 to-gray-900 rounded-xl border border-indigo-500/30 p-6 shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-2xl shadow-lg shadow-indigo-900/50">🧠</div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Phân tích & Nhận định Tuần</h3>
                            <p className="text-xs text-indigo-300">Powered by Gemini 2.5 Flash {isStandardTier && '(Yêu cầu VIP)'}</p>
                        </div>
                    </div>

                    <button
                        onClick={handleAnalyze}
                        disabled={analyzing || !uid || isStandardTier}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 disabled:bg-gray-700"
                    >
                        {analyzing ? <span className="animate-spin">↻</span> : (isStandardTier ? '🔒' : '✨')}
                        {analyzing ? 'Đang phân tích...' : (isStandardTier ? 'VIP Only' : 'Tạo Báo Cáo Tuần')}
                    </button>
                </div>

                {!aiResult ? (
                    <div className="text-center py-10 border-2 border-dashed border-gray-800 rounded-xl">
                        <p className="text-gray-400 text-sm">
                            {isStandardTier
                                ? "Tính năng Phân tích thị trường bị giới hạn ở gói Standard. Vui lòng liên hệ Admin để nâng cấp VIP."
                                : "Nhấn nút trên để AI so sánh chênh lệch giá vàng nội địa/thế giới và đưa ra lời khuyên."
                            }
                        </p>
                        {!uid && <p className="text-xs text-red-400 mt-2">Yêu cầu đăng nhập để sử dụng tính năng này.</p>}
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-black/40 rounded-xl p-5 border border-white/10">
                            <h4 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-2">Phân tích Đa Thị trường (Gold, Forex, Stock, BĐS)</h4>
                            <div className="text-gray-100 leading-relaxed font-medium">
                                <SimpleMarkdownRenderer content={aiResult.marketTrend} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                                <h4 className="text-sm font-bold text-blue-400 uppercase mb-3">Dự báo Kinh tế & Rủi ro</h4>
                                <div className="text-gray-200 leading-relaxed">
                                    <SimpleMarkdownRenderer content={aiResult.economicForecast} />
                                </div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                                <h4 className="text-sm font-bold text-emerald-400 uppercase mb-3">Cơ hội Đầu tư</h4>
                                <div className="text-gray-200 leading-relaxed">
                                    <SimpleMarkdownRenderer content={aiResult.investmentAdvice} />
                                </div>
                            </div>
                        </div>

                        {aiResult.actionableSteps && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Hành động Khuyến nghị</h4>
                                {aiResult.actionableSteps.map((step, i) => (
                                    <div key={i} className="flex gap-3 text-lg text-gray-200 bg-indigo-900/20 p-4 rounded border border-indigo-500/20">
                                        <span className="text-indigo-400 font-bold">{i + 1}.</span>
                                        <span>{step}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
