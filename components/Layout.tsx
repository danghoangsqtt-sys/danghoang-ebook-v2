
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChatWidget } from './ChatWidget';
import { firebaseService } from '../services/firebase';

// Icons (Using Text/Emoji for simplicity or SVG paths)
const Icons = {
  Dashboard: () => <span>🏠</span>,
  Courses: () => <span>📚</span>,
  English: () => <span>🎓</span>,
  Vocab: () => <span>🗂️</span>,
  Planner: () => <span>📅</span>,
  Finance: () => <span>💰</span>,
  Settings: () => <span>⚙️</span>,
  Management: () => <span>🛡️</span>,
  Menu: () => <span className="text-2xl">☰</span>
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = () => {
      // Check local storage first for instant UI feedback
      const profile = localStorage.getItem('dh_user_profile');
      if (profile) {
        const p = JSON.parse(profile);
        if (p.email === firebaseService.ADMIN_EMAIL) {
          setIsAdmin(true);
          return;
        }
      }

      // Fallback/Confirm with Firebase Auth
      if (firebaseService.currentUser?.email === firebaseService.ADMIN_EMAIL) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    };

    // Listen for auth changes
    const unsub = firebaseService.auth.onAuthStateChanged((user) => {
      if (user?.email === firebaseService.ADMIN_EMAIL) setIsAdmin(true);
      else setIsAdmin(false);
    });

    checkAdmin();
    return () => unsub();
  }, []);

  const navItems = [
    { path: '/', label: 'Tổng Quan', icon: Icons.Dashboard },
    { path: '/courses', label: 'Học Tập', icon: Icons.Courses },
    { path: '/english', label: 'Luyện Tiếng Anh', icon: Icons.English },
    { path: '/vocab-library', label: 'Thư viện từ vựng', icon: Icons.Vocab },
    { path: '/planner', label: 'Kế Hoạch', icon: Icons.Planner },
    { path: '/finance', label: 'Tài Chính', icon: Icons.Finance },
    { path: '/settings', label: 'Cài Đặt', icon: Icons.Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden relative font-sans transition-colors duration-200">
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 lg:w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col justify-between
      `}>
        <div>
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/30">DH</div>
              <div>
                <h1 className="text-lg font-bold text-gray-800 dark:text-white leading-tight">DangHoang</h1>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">E-Learning System</p>
              </div>
            </div>
            {/* Close button for mobile */}
            <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">✕</button>
          </div>
          <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-150px)] scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group ${location.pathname === item.path
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 shadow-sm translate-x-1'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 hover:translate-x-1'
                  }`}
              >
                <span className="mr-3 text-xl group-hover:scale-110 transition-transform">{item.icon()}</span>
                {item.label}
              </Link>
            ))}

            {/* Admin Link */}
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Administration</p>
                <Link
                  to="/management"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group ${location.pathname === '/management'
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 shadow-sm translate-x-1'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-300 hover:translate-x-1'
                    }`}
                >
                  <span className="mr-3 text-xl group-hover:scale-110 transition-transform"><Icons.Management /></span>
                  Quản Trị Viên
                </Link>
              </div>
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <p className="text-xs text-blue-800 dark:text-blue-300 font-bold mb-1 flex items-center gap-1">💡 Mẹo học tập</p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed opacity-90">Sử dụng Pomodoro ở góc phải để tập trung tốt hơn!</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-950 transition-colors duration-200 relative">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 h-16 flex items-center justify-between shadow-sm z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="text-gray-600 dark:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-all">
              <Icons.Menu />
            </button>
            <span className="font-bold text-gray-800 dark:text-white text-lg truncate">DangHoang Ebook</span>
          </div>
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-bold border border-blue-200 dark:border-blue-700">
            DH
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 no-scrollbar scroll-smooth w-full max-w-full">
          <div className="max-w-7xl mx-auto h-full pb-20 lg:pb-0">
            {children}
          </div>
        </div>
      </main>

      {/* Floating Chat Widget & Pomodoro */}
      <ChatWidget />
    </div>
  );
};
