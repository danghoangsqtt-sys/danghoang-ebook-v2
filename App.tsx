
import React, { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Courses } from './pages/Courses';
import { EnglishLearning } from './pages/English';
import { Planner } from './pages/Planner';
import { Finance } from './pages/Finance';
import { Settings } from './pages/Settings';
import { VocabLibrary } from './pages/VocabLibrary';
import { Management } from './pages/Management';
import { Analytics } from "@vercel/analytics/react";

// --- I18n & Translations ---
type Language = 'vi' | 'en';

const translations = {
  vi: {
    'nav.dashboard': 'Tổng Quan',
    'nav.courses': 'Học Tập',
    'nav.english': 'Luyện Tiếng Anh',
    'nav.vocab': 'Thư viện từ vựng',
    'nav.planner': 'Kế Hoạch',
    'nav.finance': 'Tài Chính',
    'nav.settings': 'Cài Đặt',
    'nav.management': 'Quản Trị Viên',
    'settings.title': 'Cài Đặt & Hệ Thống',
    'settings.interface': 'Giao diện & Trải nghiệm',
    'settings.theme': 'Chế độ Hiển thị',
    'settings.theme.desc': 'Tùy chỉnh giao diện Sáng hoặc Tối',
    'settings.lang': 'Ngôn ngữ',
    'settings.lang.desc': 'Lựa chọn ngôn ngữ hiển thị',
    'settings.light': 'Sáng',
    'settings.dark': 'Tối',
    'settings.voice': 'Giọng nói & Giao tiếp',
    'settings.account': 'Tài khoản',
    'settings.data': 'Quản lý Dữ liệu',
    'settings.help': 'Trợ giúp',
    'settings.ai': 'Cài đặt Trợ lý Ảo (Nana AI)'
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.courses': 'Learning',
    'nav.english': 'English Practice',
    'nav.vocab': 'Vocab Library',
    'nav.planner': 'Planner',
    'nav.finance': 'Finance',
    'nav.settings': 'Settings',
    'nav.management': 'Admin',
    'settings.title': 'Settings & System',
    'settings.interface': 'Interface & Experience',
    'settings.theme': 'Display Mode',
    'settings.theme.desc': 'Customize Light or Dark mode',
    'settings.lang': 'Language',
    'settings.lang.desc': 'Select display language',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.voice': 'Voice & Chat',
    'settings.account': 'Account',
    'settings.data': 'Data Management',
    'settings.help': 'Help',
    'settings.ai': 'AI Assistant (Nana AI)'
  }
};

// --- Contexts ---
type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (t: Theme) => void;
}

interface LanguageContextType {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: string) => string;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => { },
});

export const LanguageContext = createContext<LanguageContextType>({
  language: 'vi',
  setLanguage: () => { },
  t: (key: string) => key,
});

export const useTheme = () => useContext(ThemeContext);
export const useLanguage = () => useContext(LanguageContext);

function App() {
  const [theme, setTheme] = useState<Theme>('light');
  const [language, setLanguageState] = useState<Language>('vi');

  useEffect(() => {
    // Load saved theme
    const savedTheme = localStorage.getItem('dh_theme') as Theme || 'light';
    setTheme(savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Load saved language
    const savedLang = localStorage.getItem('dh_lang') as Language || 'vi';
    setLanguageState(savedLang);
  }, []);

  const toggleTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('dh_theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    localStorage.setItem('dh_lang', l);
  };

  const t = (key: string): string => {
    const dict = translations[language] || translations['vi'];
    return (dict as any)[key] || key;
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <LanguageContext.Provider value={{ language, setLanguage, t }}>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/english" element={<EnglishLearning />} />
              <Route path="/vocab-library" element={<VocabLibrary />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/management" element={<Management />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </Router>
        <Analytics />
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
