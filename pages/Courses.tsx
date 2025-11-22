
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CourseNode, CourseType, LessonContent } from '../types';
import { firebaseService } from '../services/firebase';

// --- Constants ---
const LEVEL_OPTIONS = ['Cơ bản', 'Trung bình', 'Nâng cao', 'Chuyên sâu'];

// --- Helper: Smart URL Handling ---
const getDriveId = (url: string) => {
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
};

const getSmartUrl = (url: string, type: CourseType) => {
    if (!url) return '';

    // 1. Google Drive (Video / PDF / Doc) -> Preview Mode
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
        const id = getDriveId(url);
        if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }

    // 2. YouTube
    if (url.match(/(?:youtube\.com|youtu\.be)/)) {
        const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    // 3. Uploaded DOCX (Must use Viewer) or Generic PDF (Better on mobile with Viewer)
    // Note: If it's a direct link to a PDF/DOCX on Firebase Storage or other public host
    if (type === CourseType.DOCX || (type === CourseType.PDF && !url.includes('drive.google.com'))) {
        return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    }

    return url;
};

// --- Helper: Tree Operations ---
const findNode = (nodes: CourseNode[], id: string): CourseNode | null => {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

const findPath = (nodes: CourseNode[], targetId: string): CourseNode[] => {
    for (const node of nodes) {
        if (node.id === targetId) return [node];
        if (node.children) {
            const path = findPath(node.children, targetId);
            if (path.length > 0) return [node, ...path];
        }
    }
    return [];
};

const removeNode = (nodes: CourseNode[], id: string): CourseNode[] => {
    return nodes
        .filter(n => n.id !== id)
        .map(n => ({ ...n, children: n.children ? removeNode(n.children, id) : undefined }));
};

const insertNode = (nodes: CourseNode[], newNode: CourseNode, parentId: string | null): CourseNode[] => {
    if (!parentId || parentId === 'root') {
        return [...nodes, newNode];
    }
    return nodes.map(node => {
        if (node.id === parentId) {
            // If inserting into a folder, ensure it's open so user sees the new item
            return { ...node, children: [...(node.children || []), newNode], isOpen: true, updatedAt: Date.now() };
        }
        if (node.children) {
            return { ...node, children: insertNode(node.children, newNode, parentId) };
        }
        return node;
    });
};

const updateNode = (nodes: CourseNode[], id: string, updates: Partial<CourseNode>): CourseNode[] => {
    return nodes.map(node => {
        if (node.id === id) return { ...node, ...updates, updatedAt: Date.now() };
        if (node.children) return { ...node, children: updateNode(node.children, id, updates) };
        return node;
    });
};

// Check if targetId is a descendant of sourceId (to prevent circular moves)
const isDescendant = (nodes: CourseNode[], sourceId: string, targetId: string): boolean => {
    const sourceNode = findNode(nodes, sourceId);
    if (!sourceNode || !sourceNode.children) return false;
    return !!findNode(sourceNode.children, targetId);
};

const moveNode = (nodes: CourseNode[], nodeId: string, targetParentId: string): CourseNode[] => {
    // 1. Validation
    if (nodeId === targetParentId) return nodes; // Can't move to self
    if (isDescendant(nodes, nodeId, targetParentId)) {
        alert("Không thể di chuyển thư mục vào bên trong chính nó.");
        return nodes;
    }

    // 2. Find Node
    const nodeToMove = findNode(nodes, nodeId);
    if (!nodeToMove) return nodes;

    // 3. Remove from old location
    const treeWithoutNode = removeNode(nodes, nodeId);

    // 4. Insert to new location
    return insertNode(treeWithoutNode, nodeToMove, targetParentId);
};

// --- Components ---

// 1. Tree Item
interface TreeItemProps {
    node: CourseNode;
    level: number;
    selectedLessonId?: string;
    onToggleExpand: (id: string) => void;
    onSelect: (node: CourseNode) => void;
    onAction: (action: 'edit' | 'delete' | 'pin', node: CourseNode) => void;
    onMove: (draggedId: string, targetId: string) => void; // Drag & Drop handler
}

const TreeItem = React.memo<TreeItemProps>(({ node, level, selectedLessonId, onToggleExpand, onSelect, onAction, onMove }) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const isSelected = node.type === 'file' && selectedLessonId === node.data?.id;
    const isFolder = node.type === 'folder';

    const getIcon = () => {
        if (isFolder) return node.isOpen ? '📂' : '📁';
        switch (node.data?.type) {
            case CourseType.VIDEO: return '🎥';
            case CourseType.HTML: return '🌐';
            case CourseType.DOCX: return '📝';
            case CourseType.PDF: return '📄';
            default: return '📄';
        }
    };

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isFolder) {
            setIsDragOver(true);
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== node.id && isFolder) {
            onMove(draggedId, node.id);
        }
    };

    return (
        <div className="select-none relative">
            <div
                draggable
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
            group flex items-center gap-2 py-3 md:py-2 pr-2 cursor-pointer transition-all rounded-lg mx-2 mb-0.5 border border-transparent
            ${isSelected ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
            ${isDragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}
          `}
                style={{ paddingLeft: `${level * 12 + 8}px` }} // Indentation
                onClick={(e) => {
                    e.stopPropagation();
                    if (isFolder) onToggleExpand(node.id); else onSelect(node);
                }}
            >
                <span className="text-lg flex-shrink-0 w-6 text-center">{getIcon()}</span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${isFolder ? 'font-bold' : ''}`}>
                            {node.title}
                        </span>
                        {node.isPinned && <span className="text-[10px]">📌</span>}
                    </div>
                    {/* Mobile-friendly subtitle */}
                    {(node.topic) && !isFolder && (
                        <div className="text-[10px] text-gray-400 leading-none mt-0.5 truncate">{node.topic}</div>
                    )}
                </div>

                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onAction('edit', node); }} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 text-xs" title="Sửa / Di chuyển">✏️</button>
                    <button onClick={(e) => { e.stopPropagation(); onAction('delete', node); }} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 text-xs" title="Xóa">🗑️</button>
                </div>
            </div>

            {isFolder && node.isOpen && node.children && (
                <div className="relative">
                    {/* Guide Line */}
                    <div className="absolute left-[22px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" style={{ left: `${level * 12 + 19}px` }}></div>
                    {node.children.map(child => (
                        <TreeItem
                            key={child.id} node={child} level={level + 1}
                            selectedLessonId={selectedLessonId} onToggleExpand={onToggleExpand}
                            onSelect={onSelect} onAction={onAction} onMove={onMove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

// 2. Enhanced File Viewer
const FileViewer: React.FC<{ lesson: LessonContent }> = ({ lesson }) => {
    const smartUrl = getSmartUrl(lesson.url, lesson.type);

    if (lesson.type === CourseType.VIDEO) {
        return (
            <div className="w-full h-full bg-black flex items-center justify-center relative">
                <iframe
                    src={smartUrl}
                    className="w-full h-full border-none absolute inset-0"
                    allowFullScreen
                    title={lesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
            </div>
        );
    }

    if (lesson.type === CourseType.HTML) {
        return (
            <div className="w-full h-full bg-white relative">
                <iframe
                    src={smartUrl}
                    className="w-full h-full border-none"
                    title={lesson.title}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
            </div>
        );
    }

    // PDF & DOCX
    if (lesson.type === CourseType.PDF || lesson.type === CourseType.DOCX) {
        return (
            <div className="w-full h-full bg-gray-100 dark:bg-gray-900 relative flex flex-col">
                <iframe
                    src={smartUrl}
                    className="flex-1 w-full border-none bg-white"
                    title={lesson.title}
                />
                {/* Fallback Link if Viewer Fails */}
                <div className="p-2 bg-gray-100 dark:bg-gray-800 text-center text-xs border-t border-gray-200 dark:border-gray-700">
                    Không xem được? <a href={lesson.url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline">Tải xuống / Mở tab mới</a>
                </div>
            </div>
        );
    }

    return <div className="p-10 text-center text-gray-500">Định dạng không hỗ trợ.</div>;
};

// --- Main Page ---
export const Courses: React.FC = () => {
    const [courseTree, setCourseTree] = useState<CourseNode[]>([]);
    const [selectedLesson, setSelectedLesson] = useState<LessonContent | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal
    const [isModalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [activeTab, setActiveTab] = useState<'link' | 'upload' | 'folder'>('link');

    // Form
    const [editNodeId, setEditNodeId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [parentId, setParentId] = useState('');
    const [resourceLink, setResourceLink] = useState('');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [topic, setTopic] = useState('');
    const [level, setLevel] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [linkType, setLinkType] = useState<CourseType>(CourseType.VIDEO);

    useEffect(() => {
        const load = async () => {
            const cloud = await firebaseService.getCourseTree();
            if (cloud) setCourseTree(cloud);
            else {
                const saved = localStorage.getItem('dh_course_tree_v2');
                if (saved) setCourseTree(JSON.parse(saved));
                else setCourseTree([{ id: 'root', title: 'Học liệu mẫu', type: 'folder', isOpen: true, children: [] }]);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (courseTree.length > 0) {
            localStorage.setItem('dh_course_tree_v2', JSON.stringify(courseTree));
            firebaseService.saveCourseTree(courseTree);
        }
    }, [courseTree]);

    // Breadcrumbs
    const breadcrumbs = useMemo(() => {
        if (!selectedLesson) return [];
        return findPath(courseTree, selectedLesson.id);
    }, [selectedLesson, courseTree]);

    // Actions
    const resetForm = () => {
        setTitle(''); setResourceLink(''); setUploadedFile(null); setTopic(''); setLevel(''); setParentId(''); setEditNodeId(null); setLinkType(CourseType.VIDEO);
    };

    const handleAction = (action: 'edit' | 'delete' | 'pin', node: CourseNode) => {
        if (action === 'delete') {
            let warning = `Xóa "${node.title}"?`;
            if (node.type === 'folder' && node.children && node.children.length > 0) {
                warning = `CẢNH BÁO: Thư mục "${node.title}" có chứa ${node.children.length} mục bên trong.\n\nBạn có chắc chắn muốn xóa thư mục này và toàn bộ nội dung không?`;
            } else {
                warning = `Bạn có chắc muốn xóa ${node.type === 'folder' ? 'thư mục' : 'file'} "${node.title}" không?`;
            }

            if (window.confirm(warning)) {
                setCourseTree(prev => removeNode(prev, node.id));
                if (selectedLesson?.id === node.id) setSelectedLesson(null);
                // Note: This deletes from Tree structure. File on cloud/storage might still exist but is unlinked.
            }
        } else if (action === 'pin') {
            setCourseTree(prev => updateNode(prev, node.id, { isPinned: !node.isPinned }));
        } else if (action === 'edit') {
            setModalMode('edit');
            setEditNodeId(node.id);
            setTitle(node.title);
            setTopic(node.topic || node.data?.topic || '');
            setLevel(node.level || node.data?.level || '');

            // Find current parent to pre-select in dropdown
            const parent = findPath(courseTree, node.id);
            if (parent.length > 1) {
                setParentId(parent[parent.length - 2].id); // The one before self
            } else {
                setParentId('root');
            }

            if (node.type === 'folder') {
                setActiveTab('folder');
            } else {
                // Smart tab selection based on URL
                if (node.data?.url.includes('firebasestorage')) {
                    setActiveTab('upload');
                    setResourceLink(node.data.url);
                } else {
                    setActiveTab('link');
                    setResourceLink(node.data?.url || '');
                }
                setLinkType(node.data?.type || CourseType.PDF);
            }
            setModalOpen(true);
        }
    };

    const handleMoveNode = useCallback((draggedId: string, targetParentId: string) => {
        setCourseTree(prev => moveNode(prev, draggedId, targetParentId));
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            setUploadedFile(file);

            // Auto-detect type
            const name = file.name.toLowerCase();
            setTitle(name.substring(0, name.lastIndexOf('.')) || name);
            if (name.endsWith('.pdf')) setLinkType(CourseType.PDF);
            else if (name.endsWith('.docx') || name.endsWith('.doc')) setLinkType(CourseType.DOCX);
            else if (name.endsWith('.html') || name.endsWith('.htm')) setLinkType(CourseType.HTML);
        }
    };

    const handleSave = async () => {
        if (!title.trim()) return alert("Vui lòng nhập tên.");

        setIsUploading(true);
        let finalUrl = resourceLink;
        let finalType = linkType;

        try {
            if (activeTab === 'upload' && uploadedFile) {
                finalUrl = await firebaseService.uploadFile(uploadedFile);
            } else if (activeTab === 'link') {
                // Auto-detect Drive/YouTube
                if (finalUrl.includes('youtube') || finalUrl.includes('youtu.be')) finalType = CourseType.VIDEO;
                else if (finalUrl.includes('drive.google.com')) {
                    // Typically PDF or Video
                }
            }
        } catch (e) {
            alert("Upload thất bại. Vui lòng thử lại.");
            setIsUploading(false);
            return;
        }

        const newNodeData: any = {
            id: editNodeId || Date.now().toString(),
            title, topic, level,
            type: activeTab === 'folder' ? 'folder' : 'file',
            url: finalUrl,
            lessonType: finalType
        };

        if (modalMode === 'edit' && editNodeId) {
            // Update properties
            setCourseTree(prev => {
                let updated = updateNode(prev, editNodeId, {
                    title, topic, level,
                    data: activeTab !== 'folder' ? { ...newNodeData, type: finalType } as LessonContent : undefined
                });

                // Handle Move if Parent Changed
                const currentPath = findPath(updated, editNodeId);
                const currentParentId = currentPath.length > 1 ? currentPath[currentPath.length - 2].id : 'root';

                if (parentId && parentId !== currentParentId) {
                    updated = moveNode(updated, editNodeId, parentId);
                }
                return updated;
            });

            if (selectedLesson?.id === editNodeId) {
                setSelectedLesson(prev => prev ? ({ ...prev, title, url: finalUrl, type: finalType }) : null);
            }
        } else {
            // Create New
            const newNode: CourseNode = {
                id: Date.now().toString(),
                title,
                type: activeTab === 'folder' ? 'folder' : 'file',
                children: [],
                isOpen: true,
                createdAt: Date.now(),
                topic, level,
                data: activeTab !== 'folder' ? {
                    id: Date.now().toString(),
                    title, type: finalType, url: finalUrl, topic, level
                } as LessonContent : undefined
            };
            setCourseTree(prev => insertNode(prev, newNode, parentId || 'root'));
        }

        setIsUploading(false);
        setModalOpen(false);
        resetForm();
    };

    const renderFolderOptions = (nodes: CourseNode[], depth = 0): React.ReactNode[] => {
        let opts: React.ReactNode[] = [];
        nodes.forEach(n => {
            if (n.type === 'folder') {
                // Disable selecting self as parent when editing
                const disabled = editNodeId === n.id;
                opts.push(
                    <option key={n.id} value={n.id} disabled={disabled}>
                        {'\u00A0'.repeat(depth * 4)}📂 {n.title}
                    </option>
                );
                if (n.children) opts = [...opts, ...renderFolderOptions(n.children, depth + 1)];
            }
        });
        return opts;
    };

    return (
        <div className="relative h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] flex flex-col md:flex-row bg-white dark:bg-gray-900 md:rounded-2xl md:border border-gray-200 dark:border-gray-800 md:shadow-xl overflow-hidden">

            {/* --- LIST PANE (Master) --- */}
            <div className={`
         flex-col bg-gray-50 dark:bg-gray-850 border-r border-gray-200 dark:border-gray-800 w-full md:w-80 lg:w-96 shrink-0 h-full z-10 transition-all duration-300
         ${selectedLesson ? 'hidden md:flex' : 'flex'}
      `}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-20 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <h2 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                            📚 Khoá học & Tài liệu
                        </h2>
                        <button
                            onClick={() => { resetForm(); setModalOpen(true); }}
                            className="hidden md:block bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 shadow-sm text-xs font-bold"
                        >
                            + Thêm
                        </button>
                    </div>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Tìm bài học, tài liệu..."
                            className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-blue-500 dark:text-white transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2 custom-scrollbar"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; }} // Prevent root drop by default, allow only into folders or handle root specifically
                >
                    {courseTree.length > 0 ? (
                        courseTree.map(node => (
                            <TreeItem
                                key={node.id} node={node} level={0}
                                selectedLessonId={selectedLesson?.id}
                                onToggleExpand={(id) => setCourseTree(prev => updateNode(prev, id, { isOpen: !findNode(prev, id)?.isOpen }))}
                                onSelect={(node) => { if (node.data) setSelectedLesson(node.data); }}
                                onAction={handleAction}
                                onMove={handleMoveNode}
                            />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400 mt-10">
                            <span className="text-4xl mb-2 opacity-30">📭</span>
                            <p className="text-sm">Chưa có tài liệu</p>
                        </div>
                    )}
                </div>

                {/* Mobile FAB */}
                <button
                    onClick={() => { resetForm(); setModalOpen(true); }}
                    className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center text-3xl z-40 active:scale-90 transition-transform"
                >
                    +
                </button>
            </div>

            {/* --- DETAIL PANE (Viewer) --- */}
            <div className={`
          flex-col flex-1 bg-gray-100 dark:bg-black relative overflow-hidden
          ${selectedLesson ? 'fixed inset-0 z-50 bg-white dark:bg-black flex' : 'hidden md:flex'} 
          md:static md:z-auto
      `}>
                {selectedLesson ? (
                    <>
                        {/* Viewer Header */}
                        <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between shrink-0 shadow-sm z-20 gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <button
                                    onClick={() => setSelectedLesson(null)}
                                    className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                                >
                                    ←
                                </button>
                                <div className="flex flex-col min-w-0">
                                    {/* Breadcrumbs */}
                                    <div className="flex text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate gap-1">
                                        {breadcrumbs.map((n, i) => (
                                            <span key={n.id} className="flex items-center">
                                                {n.title} {i < breadcrumbs.length - 1 && <span className="mx-1 opacity-50">/</span>}
                                            </span>
                                        ))}
                                    </div>
                                    <h2 className="font-bold text-gray-800 dark:text-white truncate text-sm md:text-base leading-tight">
                                        {selectedLesson.title}
                                    </h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedLesson.topic && <span className="hidden sm:block text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 px-2 py-1 rounded font-bold uppercase">{selectedLesson.topic}</span>}
                                <button
                                    onClick={() => {
                                        const node = findNode(courseTree, selectedLesson.id);
                                        if (node) handleAction('delete', node);
                                    }}
                                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                    title="Xóa bài học này"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>

                        {/* Viewer Body */}
                        <div className="flex-1 relative overflow-hidden">
                            <FileViewer lesson={selectedLesson} />
                        </div>
                    </>
                ) : (
                    <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                        <div className="w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-3xl mb-4 shadow-inner opacity-50">
                            🎓
                        </div>
                        <p className="font-medium text-sm">Chọn một bài học để bắt đầu</p>
                    </div>
                )}
            </div>

            {/* --- MODAL --- */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

                        {/* Header */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                {modalMode === 'create' ? 'Thêm Mới' : 'Chỉnh Sửa'}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        {/* Tabs */}
                        {modalMode === 'create' && (
                            <div className="flex p-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                                <button onClick={() => setActiveTab('link')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'link' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}`}>Link / Video</button>
                                <button onClick={() => setActiveTab('upload')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'upload' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500'}`}>Upload File</button>
                                <button onClick={() => setActiveTab('folder')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'folder' ? 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm' : 'text-gray-500'}`}>Thư Mục</button>
                            </div>
                        )}

                        {/* Body */}
                        <div className="p-6 space-y-5 overflow-y-auto bg-white dark:bg-gray-800 flex-1">
                            {/* Common Name Input */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    {activeTab === 'folder' ? 'TÊN THƯ MỤC' : 'TÊN BÀI HỌC'}
                                </label>
                                <input
                                    autoFocus
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full border border-blue-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-white font-medium placeholder-gray-300"
                                    placeholder={activeTab === 'folder' ? "Ví dụ: Chương 1" : "Nhập tiêu đề..."}
                                />
                            </div>

                            {/* TAB: LINK */}
                            {activeTab === 'link' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">LINK (DRIVE / YOUTUBE / WEB)</label>
                                        <input value={resourceLink} onChange={e => setResourceLink(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm outline-none bg-white dark:bg-gray-700 dark:text-white" placeholder="https://..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">LOẠI TÀI LIỆU</label>
                                        <select value={linkType} onChange={e => setLinkType(e.target.value as CourseType)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm outline-none bg-white dark:bg-gray-700 dark:text-white">
                                            <option value={CourseType.VIDEO}>🎥 Video (Youtube / Drive)</option>
                                            <option value={CourseType.PDF}>📄 PDF / Drive Document</option>
                                            <option value={CourseType.DOCX}>📝 Word (DOCX)</option>
                                            <option value={CourseType.HTML}>🌐 Website / HTML</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* TAB: UPLOAD */}
                            {activeTab === 'upload' && (
                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors relative group cursor-pointer min-h-[160px]">
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.doc,.html,.htm"
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        onChange={handleFileSelect}
                                    />
                                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform">
                                        {uploadedFile ? '✅' : 'cloud_upload'}
                                    </div>
                                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                        {uploadedFile ? uploadedFile.name : 'Chọn file PDF, DOCX, HTML'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">Kéo thả hoặc nhấn để tải lên</p>
                                </div>
                            )}

                            {/* Common Meta */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CHỦ ĐỀ</label>
                                    <input value={topic} onChange={e => setTopic(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none bg-white dark:bg-gray-700 dark:text-white" placeholder="VD: Marketing" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">TRÌNH ĐỘ</label>
                                    <select value={level} onChange={e => setLevel(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none bg-white dark:bg-gray-700 dark:text-white">
                                        <option value="">-- Chọn --</option>
                                        {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">THƯ MỤC CHA</label>
                                <select value={parentId} onChange={e => setParentId(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm outline-none bg-white dark:bg-gray-700 dark:text-white">
                                    <option value="root">-- Thư mục gốc --</option>
                                    {renderFolderOptions(courseTree)}
                                </select>
                                {modalMode === 'edit' && <p className="text-[10px] text-gray-400 mt-1 ml-1">* Đổi thư mục cha để di chuyển vị trí.</p>}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                            <div>
                                {modalMode === 'edit' && editNodeId && (
                                    <button
                                        onClick={() => {
                                            const node = findNode(courseTree, editNodeId);
                                            if (node) { setModalOpen(false); handleAction('delete', node); }
                                        }}
                                        className="text-red-500 font-bold text-xs hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                    >
                                        🗑️ Xóa bỏ
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-500 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm">Hủy</button>
                                <button
                                    onClick={handleSave}
                                    disabled={isUploading}
                                    className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 disabled:opacity-70 text-sm"
                                >
                                    {isUploading && <span className="animate-spin">↻</span>}
                                    {modalMode === 'create' ? (activeTab === 'folder' ? 'Tạo Thư Mục' : 'Tạo Mới') : 'Lưu Thay Đổi'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
