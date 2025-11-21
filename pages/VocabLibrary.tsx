
import React, { useState, useEffect, useMemo } from 'react';
import { VocabFolder, VocabTerm } from '../types';

// Default Data
const DEFAULT_FOLDERS: VocabFolder[] = [
    { id: 'root', name: 'Thư mục gốc', parentId: null },
    { id: 'reading', name: 'Reading Practice', parentId: 'root' },
    { id: 'speaking', name: 'Speaking Practice', parentId: 'root' },
    { id: 'writing', name: 'Writing Task', parentId: 'root' },
];

const POS_OPTIONS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Phrase', 'Idiom', 'Other'];

interface FolderNode extends VocabFolder {
    children: FolderNode[];
}

// Styles
const inputStyle = "w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600 transition-colors placeholder-gray-400 font-medium shadow-sm";

export const VocabLibrary: React.FC = () => {
  // --- State ---
  const [folders, setFolders] = useState<VocabFolder[]>([]);
  const [terms, setTerms] = useState<VocabTerm[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('root');
  
  // UI View State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Filters & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPos, setFilterPos] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'newest' | 'a-z'>('newest');

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['root']));
  
  // Mobile UI State
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals
  const [isTermModalOpen, setTermModalOpen] = useState(false);
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  
  // Form State
  const [newFolder, setNewFolder] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('root');
  const [currentTerm, setCurrentTerm] = useState<Partial<VocabTerm>>({
      term: '', partOfSpeech: 'Noun', meaning: '', definition: '', example: ''
  });

  // --- Load Data ---
  useEffect(() => {
      const savedFolders = localStorage.getItem('dh_vocab_folders');
      const savedTerms = localStorage.getItem('dh_vocab_terms');
      if (savedFolders) setFolders(JSON.parse(savedFolders));
      else { setFolders(DEFAULT_FOLDERS); localStorage.setItem('dh_vocab_folders', JSON.stringify(DEFAULT_FOLDERS)); }
      if (savedTerms) setTerms(JSON.parse(savedTerms));
  }, []);

  // --- Save Data ---
  useEffect(() => {
      if (folders.length > 0) localStorage.setItem('dh_vocab_folders', JSON.stringify(folders));
      if (terms.length >= 0) localStorage.setItem('dh_vocab_terms', JSON.stringify(terms)); 
  }, [folders, terms]);

  // --- Tree Logic ---
  const folderTree = useMemo(() => {
      const map: Record<string, FolderNode> = {};
      folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
      const roots: FolderNode[] = [];
      folders.forEach(f => {
          if (f.id === 'root') roots.push(map[f.id]);
          else if (f.parentId && map[f.parentId]) map[f.parentId].children.push(map[f.id]);
          else if (!f.parentId) roots.push(map[f.id]);
      });
      return roots;
  }, [folders]);

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const newSet = new Set(expandedKeys);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setExpandedKeys(newSet);
  };

  const getFolderOptions = (nodes: FolderNode[], depth = 0): React.ReactNode[] => {
      let options: React.ReactNode[] = [];
      nodes.forEach(node => {
          options.push(<option key={node.id} value={node.id}>{'\u00A0'.repeat(depth * 4)}📂 {node.name}</option>);
          if (node.children.length > 0) options = [...options, ...getFolderOptions(node.children, depth + 1)];
      });
      return options;
  };

  // --- Computed Terms ---
  const filteredTerms = useMemo(() => {
      let result = terms;

      // 1. Filter by Folder (unless searching globally)
      if (!searchQuery) {
          result = result.filter(t => t.folderId === selectedFolderId);
      }

      // 2. Search
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(t => t.term.toLowerCase().includes(q) || t.meaning.toLowerCase().includes(q));
      }

      // 3. Filter by POS
      if (filterPos !== 'ALL') {
          result = result.filter(t => t.partOfSpeech === filterPos);
      }

      // 4. Sort
      result.sort((a, b) => {
          if (sortOption === 'a-z') return a.term.localeCompare(b.term);
          // Newest
          return (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime());
      });

      return result;
  }, [terms, selectedFolderId, searchQuery, filterPos, sortOption]);

  const currentFolder = folders.find(f => f.id === selectedFolderId);

  // --- Handlers ---
  const openAddFolderModal = () => { setNewFolder(''); setNewFolderParentId(selectedFolderId || 'root'); setFolderModalOpen(true); }
  
  const handleAddFolder = () => {
      if (!newFolder.trim()) return;
      const newF: VocabFolder = { id: Date.now().toString(), name: newFolder, parentId: newFolderParentId };
      setFolders([...folders, newF]);
      setExpandedKeys(new Set(expandedKeys).add(newFolderParentId));
      setNewFolder(''); setFolderModalOpen(false);
  };
  
  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (id === 'root') return alert("Không thể xóa thư mục gốc");
      if (window.confirm("Xóa thư mục này và tất cả từ vựng bên trong?")) {
          const getDescendantIds = (rootId: string, allFolders: VocabFolder[]): string[] => {
              let ids = [rootId];
              const children = allFolders.filter(f => f.parentId === rootId);
              children.forEach(child => { ids = [...ids, ...getDescendantIds(child.id, allFolders)]; });
              return ids;
          };
          const idsToDelete = getDescendantIds(id, folders);
          setFolders(prev => prev.filter(f => !idsToDelete.includes(f.id)));
          setTerms(prev => prev.filter(t => !idsToDelete.includes(t.folderId)));
          if (idsToDelete.includes(selectedFolderId)) setSelectedFolderId('root');
      }
  };

  const handleSaveTerm = () => {
      if (!currentTerm.term || !currentTerm.meaning) return alert("Vui lòng nhập Thuật ngữ và Nghĩa tiếng Việt");
      if (currentTerm.id) { setTerms(prev => prev.map(t => t.id === currentTerm.id ? { ...t, ...currentTerm } as VocabTerm : t)); } 
      else {
          const newT: VocabTerm = { id: Date.now().toString(), term: currentTerm.term!, partOfSpeech: currentTerm.partOfSpeech || 'Noun', meaning: currentTerm.meaning!, definition: currentTerm.definition || '', example: currentTerm.example || '', folderId: selectedFolderId, learned: false, createdAt: new Date().toISOString() };
          setTerms(prev => [newT, ...prev]);
      }
      setTermModalOpen(false); setCurrentTerm({ term: '', partOfSpeech: 'Noun', meaning: '', definition: '', example: '' });
  };
  
  const handleDeleteTerm = (id: string) => { if (window.confirm("Xóa thuật ngữ này?")) setTerms(prev => prev.filter(t => t.id !== id)); };
  const handleEditTerm = (term: VocabTerm) => { setCurrentTerm(term); setTermModalOpen(true); };
  
  const toggleLearned = (id: string) => {
      setTerms(prev => prev.map(t => t.id === id ? { ...t, learned: !t.learned } : t));
  };

  const speak = (text: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
  };

  const downloadCSV = () => {
      const headers = "Term,Type,Meaning,Definition,Example,Folder\n";
      const rows = terms.map(t => { const folderName = folders.find(f => f.id === t.folderId)?.name || 'Unknown'; return `"${t.term}","${t.partOfSpeech}","${t.meaning}","${t.definition}","${t.example}","${folderName}"`; }).join("\n");
      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.setAttribute('href', url); link.setAttribute('download', 'danghoang_vocab.csv'); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string; const lines = text.split('\n'); const newTerms: VocabTerm[] = [];
          for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim(); if (!line) continue; const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
              if (matches) { const clean = matches.map(m => m.replace(/^"|"$/g, '')); if (clean.length >= 3) { newTerms.push({ id: Date.now().toString() + i, term: clean[0], partOfSpeech: clean[1] || 'Noun', meaning: clean[2], definition: clean[3] || '', example: clean[4] || '', folderId: selectedFolderId, learned: false, createdAt: new Date().toISOString() }); } }
          }
          if (newTerms.length > 0) { setTerms(prev => [...newTerms, ...prev]); alert(`Đã nhập thành công ${newTerms.length} từ vựng.`); } else alert("Không đọc được dữ liệu.");
      };
      reader.readAsText(file);
  };

  const FolderTreeItem: React.FC<{ node: FolderNode }> = ({ node }) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedKeys.has(node.id);
      const isSelected = selectedFolderId === node.id;
      
      const folderTerms = terms.filter(t => t.folderId === node.id);
      const totalCount = folderTerms.length;
      const learnedCount = folderTerms.filter(t => t.learned).length;
      
      return (
          <div className="relative">
              <div 
                  onClick={() => { setSelectedFolderId(node.id); if(hasChildren && !isExpanded) toggleExpand(node.id); if(window.innerWidth < 768) setMobileSidebarOpen(false); }} 
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all select-none border border-transparent ${isSelected ? 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
              >
                  <div className="flex items-center gap-2 truncate overflow-hidden flex-1">
                      <span 
                        onClick={(e) => hasChildren ? toggleExpand(node.id, e) : null} 
                        className={`w-5 h-5 flex items-center justify-center rounded transition-colors text-xs ${hasChildren ? 'hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer' : 'opacity-0'}`}
                      >
                          {hasChildren && (isExpanded ? '▼' : '▶')}
                      </span>
                      <span className={`text-lg transition-transform ${isSelected ? 'scale-110' : ''}`}>
                          {node.id === 'root' ? '🗃️' : (isExpanded ? '📂' : '📁')}
                      </span>
                      <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{node.name}</span>
                          {node.id !== 'root' && (
                              <div className="flex items-center gap-1 text-[10px] opacity-70">
                                  <span className={learnedCount === totalCount && totalCount > 0 ? 'text-green-600 font-bold' : ''}>
                                    {learnedCount}/{totalCount}
                                  </span>
                                  {learnedCount === totalCount && totalCount > 0 && <span>✓</span>}
                              </div>
                          )}
                      </div>
                  </div>
                  
                  {node.id !== 'root' && (
                      <button onClick={(e) => handleDeleteFolder(node.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1.5 rounded-full hover:bg-red-50">
                          ✕
                      </button>
                  )}
              </div>
              
              {hasChildren && isExpanded && (
                  <div className="flex flex-col ml-5 border-l border-gray-200 dark:border-gray-700 pl-1 mt-1 space-y-1">
                      {node.children.map(child => (<FolderTreeItem key={child.id} node={child} />))}
                  </div>
              )}
          </div>
      );
  };

  const getBadgeColor = (pos: string) => {
      switch(pos.toLowerCase()) {
          case 'noun': return 'bg-blue-100 text-blue-700 border-blue-200';
          case 'verb': return 'bg-green-100 text-green-700 border-green-200';
          case 'adjective': return 'bg-purple-100 text-purple-700 border-purple-200';
          case 'adverb': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
          case 'idiom': return 'bg-pink-100 text-pink-700 border-pink-200';
          default: return 'bg-gray-100 text-gray-700 border-gray-200';
      }
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden text-gray-900 dark:text-gray-100 font-sans border border-gray-200 dark:border-gray-800 transition-colors duration-200 relative">
        
        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
            <div className="absolute inset-0 bg-black/50 z-20 md:hidden animate-fade-in" onClick={() => setMobileSidebarOpen(false)} />
        )}

        {/* Sidebar (Responsive Drawer) */}
        <div className={`
            absolute md:relative z-30 w-72 bg-gray-50 dark:bg-gray-850 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0 transition-transform duration-300 h-full
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2"><span>📚</span> Thư viện</h2>
                <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden text-gray-500 hover:text-gray-800">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                {folderTree.map(rootNode => (<FolderTreeItem key={rootNode.id} node={rootNode} />))}
            </div>
            
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex gap-2 bg-white dark:bg-gray-900">
                <button onClick={openAddFolderModal} className="flex-1 bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-xs font-bold transition-colors border border-gray-200 dark:border-gray-700 shadow-sm flex justify-center items-center gap-1">
                    <span>📂</span> Thêm thư mục
                </button>
                <label className="bg-gray-50 dark:bg-gray-800 hover:bg-green-50 hover:text-green-600 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors text-center cursor-pointer border border-gray-200 dark:border-gray-700 shadow-sm flex justify-center items-center" title="Import CSV">
                    <span>📥</span><input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                </label>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 transition-colors duration-200 min-w-0">
            {/* Header Toolbar */}
            <div className="border-b border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900 z-10 flex flex-col gap-4 shadow-sm sticky top-0">
                <div className="flex justify-between items-start md:items-center">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden text-gray-500 p-2 -ml-2 hover:bg-gray-100 rounded-lg"><span className="text-xl">☰</span></button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate max-w-[200px] md:max-w-md">
                                    {currentFolder?.name || 'Tất cả'}
                                </h2>
                                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{filteredTerms.length}</span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden md:block">Quản lý và ôn tập từ vựng của bạn</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                         {/* View Toggle */}
                         <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mr-2 border border-gray-200 dark:border-gray-700">
                             <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Lưới">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                             </button>
                             <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Danh sách">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                             </button>
                         </div>
                         
                         <button onClick={downloadCSV} className="hidden md:flex px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors items-center gap-1 border border-gray-200 dark:border-gray-700">
                            <span>⬇️</span> CSV
                         </button>
                         <button onClick={() => { setCurrentTerm({ term: '', partOfSpeech: 'Noun', meaning: '', definition: '', example: '', folderId: selectedFolderId }); setTermModalOpen(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-500/30 transition-all transform active:scale-95 flex items-center gap-2">
                            <span className="text-lg leading-none">+</span> <span className="hidden sm:inline">Thêm từ</span>
                         </button>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm kiếm từ vựng..." className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-10 pr-8 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                        {searchQuery && (<button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>)}
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <select value={filterPos} onChange={e => setFilterPos(e.target.value)} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 outline-none focus:border-blue-500 cursor-pointer">
                            <option value="ALL">Tất cả loại</option>
                            {POS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={sortOption} onChange={e => setSortOption(e.target.value as any)} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 outline-none focus:border-blue-500 cursor-pointer">
                            <option value="newest">Mới nhất</option>
                            <option value="a-z">A-Z</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-gray-50 dark:bg-gray-900/50 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                {filteredTerms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-800/30">
                        <div className="text-5xl mb-3 opacity-50">📭</div>
                        <p className="font-medium">Chưa có từ vựng nào.</p>
                        {searchQuery && <p className="text-sm mt-1 opacity-70">Không tìm thấy kết quả cho "{searchQuery}".</p>}
                    </div>
                ) : (
                    <>
                        {/* GRID VIEW */}
                        {viewMode === 'grid' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                {filteredTerms.map(term => (
                                    <div key={term.id} className="flex flex-col p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 shadow-sm hover:shadow-md transition-all group relative">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-lg text-blue-700 dark:text-blue-400">{term.term}</h3>
                                                <button onClick={(e) => speak(term.term, e)} className="text-gray-400 hover:text-blue-500 p-1 rounded-full hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors" title="Nghe phát âm">🔊</button>
                                            </div>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${getBadgeColor(term.partOfSpeech)}`}>
                                                {term.partOfSpeech}
                                            </span>
                                        </div>

                                        <div className="mb-2">
                                            <p className="text-gray-800 dark:text-gray-200 font-semibold">{term.meaning}</p>
                                        </div>
                                        
                                        {(term.definition || term.example) && (
                                            <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1">
                                                {term.definition && <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">"{term.definition}"</p>}
                                                {term.example && <p className="text-xs text-gray-600 dark:text-gray-300 pl-2 border-l-2 border-blue-200 dark:border-blue-800 line-clamp-2">Ex: {term.example}</p>}
                                            </div>
                                        )}

                                        {/* Actions Overlay */}
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 shadow-sm rounded-lg p-0.5 border border-gray-100 dark:border-gray-700">
                                             <button onClick={() => toggleLearned(term.id)} className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${term.learned ? 'text-green-600' : 'text-gray-300'}`} title={term.learned ? 'Đã học' : 'Đánh dấu đã học'}>✓</button>
                                             <button onClick={() => handleEditTerm(term)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded transition-colors">✏️</button>
                                             <button onClick={() => handleDeleteTerm(term.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded transition-colors">🗑</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* LIST VIEW */}
                        {viewMode === 'list' && (
                            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase">
                                                <th className="p-3 font-bold w-10">#</th>
                                                <th className="p-3 font-bold min-w-[150px]">Thuật ngữ</th>
                                                <th className="p-3 font-bold">Nghĩa</th>
                                                <th className="p-3 font-bold hidden md:table-cell">Ví dụ</th>
                                                <th className="p-3 font-bold w-24 text-center">Trạng thái</th>
                                                <th className="p-3 font-bold w-20 text-center">Xử lý</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                                            {filteredTerms.map((term, idx) => (
                                                <tr key={term.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors group">
                                                    <td className="p-3 text-gray-400 text-xs">{idx + 1}</td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                                                            {term.term}
                                                            <button onClick={() => speak(term.term, {} as any)} className="text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">🔊</button>
                                                        </div>
                                                        <span className="text-[10px] text-gray-500 border border-gray-200 rounded px-1">{term.partOfSpeech}</span>
                                                    </td>
                                                    <td className="p-3 text-gray-800 dark:text-gray-200 font-medium">{term.meaning}</td>
                                                    <td className="p-3 hidden md:table-cell text-gray-500 dark:text-gray-400 italic text-xs max-w-xs truncate" title={term.example}>{term.example}</td>
                                                    <td className="p-3 text-center">
                                                        <button onClick={() => toggleLearned(term.id)} className={`px-2 py-1 rounded text-xs font-bold border ${term.learned ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-colors'}`}>
                                                            {term.learned ? 'Đã thuộc' : 'Chưa học'}
                                                        </button>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => handleEditTerm(term)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded">✏️</button>
                                                            <button onClick={() => handleDeleteTerm(term.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded">🗑</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* Modals */}
        {isFolderModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in-up">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Tạo thư mục mới</h3>
                    <div className="space-y-4">
                        <div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Tên thư mục</label><input autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Nhập tên..." className={inputStyle} /></div>
                        <div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Thư mục cha</label><select value={newFolderParentId} onChange={e => setNewFolderParentId(e.target.value)} className={inputStyle}>{getFolderOptions(folderTree)}</select></div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6"><button onClick={() => setFolderModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm font-bold transition-colors">Hủy</button><button onClick={handleAddFolder} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 text-sm shadow-lg">Tạo Thư Mục</button></div>
                </div>
            </div>
        )}
        {isTermModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in-up max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{currentTerm.id ? 'Chỉnh sửa từ vựng' : 'Thêm từ mới'}</h3>
                        <button onClick={() => setTermModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4"><div className="col-span-2"><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Thuật ngữ (Tiếng Anh)</label><input autoFocus value={currentTerm.term} onChange={e => setCurrentTerm({...currentTerm, term: e.target.value})} className={`${inputStyle} font-bold`} placeholder="Word..." /></div><div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Từ loại</label><select value={currentTerm.partOfSpeech} onChange={e => setCurrentTerm({...currentTerm, partOfSpeech: e.target.value})} className={inputStyle}>{POS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></div></div>
                        <div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Nghĩa Tiếng Việt</label><input value={currentTerm.meaning} onChange={e => setCurrentTerm({...currentTerm, meaning: e.target.value})} className={inputStyle} placeholder="Nghĩa..." /></div>
                        <div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Giải thích (Tiếng Anh)</label><textarea value={currentTerm.definition} onChange={e => setCurrentTerm({...currentTerm, definition: e.target.value})} className={`${inputStyle} h-20 resize-none`} placeholder="English definition (optional)..." /></div>
                        <div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Ví dụ</label><input value={currentTerm.example} onChange={e => setCurrentTerm({...currentTerm, example: e.target.value})} className={inputStyle} placeholder="Example sentence..." /></div>
                        <div><label className="block text-xs text-gray-500 uppercase font-bold mb-1">Lưu vào thư mục</label><select value={selectedFolderId} onChange={e => setSelectedFolderId(e.target.value)} className={inputStyle}>{getFolderOptions(folderTree)}</select></div>
                    </div>
                    <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={() => setTermModalOpen(false)} className="px-5 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl font-bold transition-colors">Hủy</button>
                        <button onClick={handleSaveTerm} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 shadow-lg transition-transform active:scale-95">{currentTerm.id ? 'Lưu thay đổi' : 'Thêm vào thư viện'}</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
