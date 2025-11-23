
import { useState, useEffect, useCallback } from 'react';
import { firebaseService } from '../services/firebase';
import { CourseNode } from '../types';

// Define the cache structure
interface CacheData {
    items: CourseNode[];
    lastFetched: number;
}

const CACHE_KEY = 'dh_courses_feed_cache';
const CACHE_DURATION = 1000 * 60 * 60; // 1 Hour Cache validity
const PAGE_SIZE = 10;

/**
 * SECURITY RULES (Firestore):
 * 
 * match /courses/{courseId} {
 *   // 1. Public Read (Optimized for Feed)
 *   allow read: if resource.data.status == 'public';
 * 
 *   // 2. Owner Write
 *   allow write: if request.auth != null && request.auth.uid == resource.data.userId;
 * }
 */

export const useCourses = () => {
    const [courses, setCourses] = useState<CourseNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isRestoredFromCache, setIsRestoredFromCache] = useState(false);

    // --- Helper: Load Cache ---
    const loadCache = useCallback(() => {
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                const cached: CacheData = JSON.parse(cachedRaw);
                // Check expiry
                if (Date.now() - cached.lastFetched < CACHE_DURATION) {
                    setCourses(cached.items);
                    setIsRestoredFromCache(true);
                    // If cached data is not a multiple of PAGE_SIZE, we might have reached the end
                    if (cached.items.length > 0 && cached.items.length % PAGE_SIZE !== 0) {
                        setHasMore(false);
                    }
                    return true; // Cache hit
                }
            }
        } catch (e) {
            console.warn("Cache read error", e);
        }
        return false; // Cache miss/expired
    }, []);

    // --- Helper: Save Cache ---
    const saveCache = useCallback((items: CourseNode[]) => {
        try {
            const cacheData: CacheData = {
                items,
                lastFetched: Date.now()
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (e) {
            console.warn("Cache write error (Storage full?)", e);
        }
    }, []);

    // --- Core Fetch Function ---
    const fetchCourses = useCallback(async (isLoadMore = false) => {
        // 1. Optimization: If initial load and cache exists, skip network
        if (!isLoadMore && !isRestoredFromCache) {
            const hit = loadCache();
            if (hit) return;
        }

        setLoading(true);
        setError(null);

        try {
            // 2. Optimization: Use singleton DB instance
            const db = firebaseService.db;
            let query = db.collection('courses')
                .where('type', '==', 'file') // Only fetch files, not folders for the feed
                // .where('userId', '==', firebaseService.currentUser?.uid) // Uncomment to enforce ownership strictly
                .orderBy('createdAt', 'desc')
                .limit(PAGE_SIZE);

            // 3. Pagination Logic using Field Value (Timestamp)
            // This avoids needing the complex DocumentSnapshot object, enabling localStorage
            if (isLoadMore && courses.length > 0) {
                const lastCourse = courses[courses.length - 1];
                if (lastCourse.createdAt) {
                    query = query.startAfter(lastCourse.createdAt);
                }
            }

            // 4. Optimization: get() instead of onSnapshot() to save reads
            const snapshot = await query.get();

            const newCourses = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as CourseNode[];

            if (newCourses.length < PAGE_SIZE) {
                setHasMore(false);
            }

            // 5. State Update & Caching
            setCourses(prev => {
                const updated = isLoadMore ? [...prev, ...newCourses] : newCourses;
                saveCache(updated);
                return updated;
            });

        } catch (err: any) {
            console.error("Fetch error:", err);
            setError(err.message || "Failed to fetch courses");
        } finally {
            setLoading(false);
        }
    }, [courses, loadCache, saveCache, isRestoredFromCache]);

    // Initial Load
    useEffect(() => {
        fetchCourses(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Force Refresh (Manual override cache)
    const refresh = useCallback(() => {
        localStorage.removeItem(CACHE_KEY);
        setCourses([]);
        setHasMore(true);
        setIsRestoredFromCache(false);
        // We need to trigger a fetch, but state updates are async.
        // We'll rely on the effect or call fetch directly after a small timeout/state change
        setTimeout(() => fetchCourses(false), 0);
    }, [fetchCourses]);

    return {
        courses,
        loading,
        error,
        hasMore,
        loadMore: () => fetchCourses(true),
        refresh
    };
};
