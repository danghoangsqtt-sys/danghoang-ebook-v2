
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell, Pie, PieChart } from 'recharts';

// Dữ liệu tăng trưởng (Mô phỏng xu hướng thực tế)
const generateGrowthData = () => {
    const data = [];
    for (let i = 30; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        data.push({
            date: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
            users: Math.floor(Math.random() * 3) + 1 + (30 - i) // Xu hướng tăng nhẹ
        });
    }
    return data;
};

const resourceData = [
    { name: 'Đã dùng', value: 35, color: '#3b82f6' },
    { name: 'Còn trống', value: 65, color: '#e5e7eb' },
];

export const UserGrowthChart = () => {
    const data = generateGrowthData();
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 h-80 flex flex-col">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                <span>📈</span> Tăng trưởng Người dùng (30 ngày)
            </h3>
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                        <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            labelStyle={{ color: '#6b7280', fontSize: '12px' }}
                        />
                        <Area type="monotone" dataKey="users" name="Người dùng" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const StoragePieChart = ({ usedMB, totalMB }: { usedMB: number, totalMB: number }) => {
    const percent = (usedMB / totalMB) * 100;
    const data = [
        { name: 'Đã sử dụng', value: usedMB, color: '#8b5cf6' },
        { name: 'Khả dụng', value: Math.max(0, totalMB - usedMB), color: '#f3f4f6' }
    ];

    return (
        <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 1 && document.documentElement.classList.contains('dark') ? '#374151' : entry.color} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => `${val.toFixed(1)} MB`} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-gray-800 dark:text-white">{percent.toFixed(1)}%</span>
                <span className="text-xs text-gray-500">Dung lượng</span>
            </div>
        </div>
    );
}
