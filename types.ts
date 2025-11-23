
export enum CourseType {
  PDF = 'PDF',
  HTML = 'HTML',
  VIDEO = 'VIDEO',
  DOCX = 'DOCX'
}

export interface LessonContent {
  id: string;
  title: string;
  type: CourseType;
  url: string; // Blob URL or External URL
  content?: string; // For HTML
  notes?: string;
  topic?: string; // Classification by Topic
  level?: string; // Classification by Level (e.g., Beginner, Intermediate)
}

// New Recursive Structure
export interface CourseNode {
  id: string;
  title: string;
  type: 'folder' | 'file';
  children?: CourseNode[]; // Only for folders
  data?: LessonContent;    // Only for files
  isOpen?: boolean;        // UI state for folders
  isPinned?: boolean;      // Pin to top
  createdAt?: number;      // Timestamp for creation date sorting
  updatedAt?: number;      // Timestamp for modification date sorting

  // New Metadata for Folders
  topic?: string;
  level?: string;
}

// Legacy support
export interface CourseModule {
  id: string;
  name: string;
  lessons: LessonContent[];
}

// --- Vocabulary Library Types (New) ---
export interface VocabFolder {
  id: string;
  name: string;
  parentId: string | null; // null means root level
}

export interface VocabTerm {
  id: string;
  term: string;
  partOfSpeech: string; // noun, verb, adj...
  meaning: string; // Vietnamese
  definition: string; // English
  example: string;
  folderId: string;
  learned: boolean;
  createdAt: string;
}

// Legacy Vocabulary (kept for compatibility if needed, but mapped to new system)
export interface Vocabulary {
  id: string;
  word: string;
  meaning: string;
  example: string;
}

// --- Finance Types ---
export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description?: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  limit: number;
  spent: number; // Calculated dynamically usually, but stored for cache
  type: 'expense' | 'investment'; // Investment is a special budget type
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  type: 'savings' | 'investment' | 'asset';
  color?: string;
}

export interface DebtItem {
  id: string;
  personName: string;
  amount: number;
  type: 'payable' | 'receivable'; // Phải trả | Phải thu
  dueDate?: string;
  isPaid: boolean;
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
  type: 'task' | 'habit';
}

export interface Habit {
  id: string;
  name: string;
  targetPerWeek: number;
  completedDates: string[]; // Array of YYYY-MM-DD strings
  streak: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO String
  end: string;   // ISO String
  color: string; // Tailwind class like 'bg-red-500'
  description?: string;
  location?: string;
  googleEventId?: string; // Link to Google Calendar
}

export interface UserSettings {
  voiceName: string;
  userName: string;
  theme: 'light' | 'dark';
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
  sources?: { title: string; uri: string }[];
  isThinking?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface UserProfile {
  uid?: string;
  name: string;
  avatar: string;
  email?: string;
  accessToken?: string; // Google OAuth Access Token
}

// --- Speaking History ---
export interface SpeakingSession {
  id: string;
  timestamp: number;
  durationSeconds: number;
  transcript: { role: 'user' | 'model'; text: string }[];
  suggestions: any[]; // Array of SpeakingSuggestion
}