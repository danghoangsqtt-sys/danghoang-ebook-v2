
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChatWidget } from './ChatWidget';
import { Pomodoro } from './Pomodoro';
import { firebaseService } from '../services/firebase';
import { UserProfile } from '../types';
import { useLanguage } from '../App';

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
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // --- User & Auth State ---
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [accountStatus, setAccountStatus] = useState<'guest' | 'pending' | 'active' | 'admin'>('guest');
  const [isProfileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Auth Listener
    const unsub = firebaseService.auth.onAuthStateChanged(async (user) => {
      if (user) {
        // 1. Set Basic Profile
        const profile: UserProfile = {
          uid: user.uid,
          name: user.displayName || 'User',
          email: user.email || '',
          avatar: user.photoURL || '👨‍💻'
        };
        setCurrentUser(profile);

        // 2. Check Admin
        const isSysAdmin = user.email === firebaseService.ADMIN_EMAIL;
        setIsAdmin(isSysAdmin);

        // 3. Check Authorization Status (Async)
        if (isSysAdmin) {
          setAccountStatus('admin');
        } else {
          const isAuth = await firebaseService.isUserAuthorized();
          setAccountStatus(isAuth ? 'active' : 'pending');
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setAccountStatus('guest');
      }
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    const result = await firebaseService.loginWithGoogle();
    if (result) {
      // State updates handled by onAuthStateChanged
      navigate('/settings'); // Optional redirect
    }
  };

  const handleLogout = async () => {
    await firebaseService.logout();
    setProfileDropdownOpen(false);
    navigate('/');
  };

  const navItems = [
    { path: '/', label: t('nav.dashboard'), icon: Icons.Dashboard },
    { path: '/courses', label: t('nav.courses'), icon: Icons.Courses },
    { path: '/english', label: t('nav.english'), icon: Icons.English },
    { path: '/vocab-library', label: t('nav.vocab'), icon: Icons.Vocab },
    { path: '/planner', label: t('nav.planner'), icon: Icons.Planner },
    { path: '/finance', label: t('nav.finance'), icon: Icons.Finance },
    { path: '/settings', label: t('nav.settings'), icon: Icons.Settings },
  ];

  // Render Status Badge
  const renderStatusBadge = () => {
    switch (accountStatus) {
      case 'admin': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">ADMIN</span>;
      case 'active': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">ĐÃ KÍCH HOẠT</span>;
      case 'pending': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">CHƯA KÍCH HOẠT</span>;
      default: return null;
    }
  };

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
                  {t('nav.management')}
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

        {/* Unified Top Bar (Desktop & Mobile) */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 h-16 flex items-center justify-between shadow-sm z-30 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden text-gray-600 dark:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-all">
              <Icons.Menu />
            </button>
            {/* Page Title (Mobile) / Breadcrumb Placeholder */}
            <span className="lg:hidden font-bold text-gray-800 dark:text-white text-lg truncate">DangHoang Ebook</span>
          </div>

          {/* Right Side: User Profile & Auth */}
          <div className="flex items-center gap-4">
            {currentUser ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center gap-3 p-1.5 pr-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-blue-100 dark:border-blue-900">
                    {currentUser.avatar.startsWith('http') ? (
                      <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white">{currentUser.avatar}</div>
                    )}
                  </div>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-xs font-bold text-gray-800 dark:text-white leading-none mb-1">{currentUser.name}</span>
                    {renderStatusBadge()}
                  </div>
                </button>

                {/* Dropdown Menu */}
                {isProfileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 animate-fade-in-up origin-top-right">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 md:hidden">
                      <p className="font-bold text-gray-800 dark:text-white">{currentUser.name}</p>
                      <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                      <div className="mt-1">{renderStatusBadge()}</div>
                    </div>

                    <Link
                      to="/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="block px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>⚙️</span> Cài đặt tài khoản
                    </Link>
                    {accountStatus === 'pending' && (
                      <Link
                        to="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="block px-4 py-2.5 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 flex items-center gap-2"
                      >
                        <span>🔑</span> Kích hoạt Key
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                    >
                      <span>🚪</span> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-bold text-sm shadow-md transition-all transform active:scale-95"
              >
                <span>G</span> <span className="hidden sm:inline">Đăng nhập</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 no-scrollbar scroll-smooth w-full max-w-full">
          <div className="max-w-7xl mx-auto h-full pb-20 lg:pb-0">
            {children}
          </div>
        </div>
      </main>

      {/* Floating Widgets */}
      <Pomodoro />
      <ChatWidget />
    </div>
  );
};
