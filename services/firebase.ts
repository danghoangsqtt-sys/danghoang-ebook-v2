
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { CourseNode, SpeakingSession } from "../types";

// Cấu hình Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDqwU5EKw91pc6So2ggVGcL2WrLfR_mZFg",
    authDomain: "e-book-for-me.firebaseapp.com",
    projectId: "e-book-for-me",
    storageBucket: "e-book-for-me.firebasestorage.app",
    messagingSenderId: "380456713229",
    appId: "1:380456713229:web:4d920884462625ad23a944"
};

export interface FirestoreUser {
    uid: string;
    name: string;
    email: string;
    avatar: string;
    lastLogin: number;
    geminiApiKey?: string;
    isActiveAI?: boolean;
    aiTier?: 'standard' | 'vip';
    storageEnabled?: boolean;
    isLocked?: boolean;
    role?: 'admin' | 'user';
    createdAt?: number;
    metadata?: any;

    // New Fields for Time-based Access & Violations
    aiActivationDate?: number;
    aiExpirationDate?: number | null; // null means permanent
    violationReason?: string | null;

    // Profile Fields
    jobTitle?: string;
    phoneNumber?: string;
    location?: string;
    bio?: string;
    skills?: string[];
    website?: string;
}

class FirebaseService {
    public auth: firebase.auth.Auth;
    public db: firebase.firestore.Firestore;
    private storage: firebase.storage.Storage;
    private _authCache: { uid: string, value: boolean } | null = null;
    public ADMIN_EMAIL = 'danghoang.sqtt@gmail.com';

    constructor() {
        let app: firebase.app.App;
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
            initializeFirestore(app, { localCache: persistentLocalCache() });
        } else {
            app = firebase.app();
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.storage = firebase.storage();
        console.log("✅ Firebase Service Initialized (v12.6.0 Compatible)");
    }

    // --- UTILS ---
    private cleanData(data: any): any {
        if (data === undefined) return undefined;
        if (data === null) return null;
        if (typeof data === 'number' && isNaN(data)) return null; // Safety for NaN
        if (data instanceof Date) return data;

        if (Array.isArray(data)) {
            return data.map(item => this.cleanData(item)).filter(item => item !== undefined);
        }

        if (typeof data === 'object') {
            const result: any = {};
            for (const key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    const cleaned = this.cleanData(data[key]);
                    // Only keep keys that are NOT undefined
                    if (cleaned !== undefined) {
                        result[key] = cleaned;
                    }
                }
            }
            return result;
        }

        return data;
    }

    async loginWithGoogle(): Promise<{ user: firebase.User, token?: string, apiKey?: string } | null> {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');

        try {
            const result = await this.auth.signInWithPopup(provider);
            const credential = result.credential as firebase.auth.OAuthCredential;
            const token = credential?.accessToken;
            const user = result.user;

            if (!user) throw new Error("No user");

            this._authCache = null;

            let storedApiKey = '';
            try {
                const docSnap = await this.db.collection("users").doc(user.uid).get();
                if (docSnap.exists) {
                    const data = docSnap.data() as FirestoreUser;
                    storedApiKey = data?.geminiApiKey || '';

                    // Check if locked
                    if (data?.isLocked) {
                        await this.auth.signOut();
                        throw new Error(`Account Locked: ${data.violationReason || 'Violation detected'}`);
                    }

                    // Check Expiration on Login
                    if (data.isActiveAI && data.aiExpirationDate && Date.now() > data.aiExpirationDate) {
                        await this.updateUserStatus(user.uid, {
                            isActiveAI: false,
                            aiTier: undefined, // Reset tier
                            violationReason: "Subscription Expired"
                        });
                    }
                }
            } catch (e) {
                if ((e as any).message.includes("Account Locked")) throw e;
                console.error("Error fetching user data on login", e);
            }

            await this.syncUserToFirestore(user);

            return { user, token, apiKey: storedApiKey };
        } catch (error) {
            console.error("Login Failed", error);
            alert("Đăng nhập thất bại: " + (error as any).message);
            return null;
        }
    }

    async logout() {
        await this.auth.signOut();
        this._authCache = null;
    }

    get currentUser() {
        return this.auth.currentUser;
    }

    private async syncUserToFirestore(user: firebase.User) {
        try {
            const isSysAdmin = user.email === this.ADMIN_EMAIL;
            const docRef = this.db.collection("users").doc(user.uid);

            const updateData: any = {
                uid: user.uid,
                // Only update basic info if not set, to avoid overwriting profile edits? 
                // Actually we should keep email/avatar in sync with Google if they change there, 
                // but let's be careful not to wipe custom fields. merge: true handles this.
                email: user.email || 'No Email',
                // We might NOT want to overwrite 'name' if user customized it in our app.
                // But for now, let's sync it.
                lastLogin: Date.now(),
            };

            // Initial creation might need these
            if (!docRef) {
                updateData.name = user.displayName || 'User';
                updateData.avatar = user.photoURL || '';
            }

            if (isSysAdmin) {
                updateData.isActiveAI = true;
                updateData.aiTier = 'vip';
                updateData.storageEnabled = true;
                updateData.role = 'admin';
                updateData.aiExpirationDate = null; // Permanent
            }

            // We use cleanData just in case, though raw inputs here should be fine
            await docRef.set(this.cleanData(updateData), { merge: true });
        } catch (e) {
            console.error("Error syncing user to DB", e);
        }
    }

    async getAllUsers(): Promise<FirestoreUser[]> {
        if (!this.currentUser || this.currentUser.email !== this.ADMIN_EMAIL) return [];

        try {
            const querySnapshot = await this.db.collection("users").get();
            const users: FirestoreUser[] = [];
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                users.push({ ...userData, uid: doc.id } as FirestoreUser);
            });
            return users;
        } catch (e) {
            console.error("Error fetching users", e);
            return [];
        }
    }

    async updateUserApiKey(targetUid: string, apiKey: string) {
        if (this.currentUser?.uid === targetUid || await this.isUserAuthorized()) {
            try {
                await this.db.collection("users").doc(targetUid).set({
                    geminiApiKey: apiKey,
                    isActiveAI: !!apiKey
                }, { merge: true });
            } catch (e) {
                console.error("Error updating user API key", e);
                throw e;
            }
        }
    }

    async updateUserProfile(uid: string, data: Partial<FirestoreUser>) {
        if (this.currentUser?.uid !== uid) throw new Error("Unauthorized");
        try {
            await this.db.collection("users").doc(uid).set(this.cleanData(data), { merge: true });
        } catch (e) {
            console.error("Error updating profile", e);
            throw e;
        }
    }

    async removeUserApiKey(targetUid: string) {
        if (this.currentUser?.uid === targetUid || await this.isUserAuthorized()) {
            try {
                await this.db.collection("users").doc(targetUid).update({
                    geminiApiKey: firebase.firestore.FieldValue.delete(),
                });
            } catch (e) {
                console.error("Error removing user API key", e);
                throw e;
            }
        }
    }

    async updateUserStatus(uid: string, data: Partial<FirestoreUser>) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) return;
        try {
            // CRITICAL FIX: Firestore crashes on 'undefined'. 
            // cleanData() removes undefined keys while preserving nulls (for field deletion/reset).
            const safeData = this.cleanData(data);
            await this.db.collection("users").doc(uid).set(safeData, { merge: true });
        } catch (e) {
            console.error("Error updating user status", e);
            throw e;
        }
    }

    async deleteUserDocument(uid: string) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) throw new Error("Unauthorized");
        try {
            await this.db.collection("users").doc(uid).delete();
            console.log(`Deleted user doc ${uid}`);
        } catch (e) {
            console.error("Error deleting user", e);
            throw e;
        }
    }

    async createUserProfile(data: Partial<FirestoreUser>) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) throw new Error("Unauthorized");

        const uid = data.uid || `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        try {
            const safeData = this.cleanData({
                ...data,
                uid,
                createdAt: Date.now(),
                lastLogin: 0,
                isActiveAI: data.isActiveAI || false,
                aiTier: data.aiTier || 'standard',
                storageEnabled: data.storageEnabled || false,
                isLocked: false,
                role: 'user'
            });
            await this.db.collection("users").doc(uid).set(safeData);
            return uid;
        } catch (e) {
            console.error("Error creating user profile", e);
            throw e;
        }
    }

    async getMyAssignedApiKey(uid: string): Promise<string | null> {
        try {
            const docSnap = await this.db.collection("users").doc(uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                if (data?.isLocked) return null;

                // Check expiration here too
                if (data?.isActiveAI && data?.aiExpirationDate && Date.now() > data.aiExpirationDate) {
                    return null;
                }

                return data?.geminiApiKey || null;
            }
        } catch (e) {
            console.error("Error fetching assigned key", e);
        }
        return null;
    }

    // General access check (Active AI OR Storage)
    async isUserAuthorized(): Promise<boolean> {
        if (!this.auth.currentUser) return false;
        const user = this.auth.currentUser;

        if (user.email === this.ADMIN_EMAIL) {
            this._authCache = { uid: user.uid, value: true };
            return true;
        }

        if (this._authCache && this._authCache.uid === user.uid) {
            return this._authCache.value;
        }

        try {
            const docSnap = await this.db.collection("users").doc(user.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data() as FirestoreUser;
                if (data) {
                    if (data.isLocked) return false;

                    // Check Expiration
                    if (data.isActiveAI && data.aiExpirationDate && Date.now() > data.aiExpirationDate) {
                        this._authCache = { uid: user.uid, value: false };
                        return false;
                    }

                    const isAuth = data.storageEnabled === true || data.isActiveAI === true;
                    this._authCache = { uid: user.uid, value: isAuth };
                    return isAuth;
                }
            }
        } catch (e) {
            console.warn("Authorization check failed", e);
        }

        this._authCache = { uid: user.uid, value: false };
        return false;
    }

    // Specific check for Cloud Storage capability
    async isCloudStorageEnabled(): Promise<boolean> {
        if (!this.auth.currentUser) return false;
        const user = this.auth.currentUser;

        // Admin always has storage
        if (user.email === this.ADMIN_EMAIL) return true;

        try {
            const docSnap = await this.db.collection("users").doc(user.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data() as FirestoreUser;
                return data && !data.isLocked && data.storageEnabled === true;
            }
        } catch (e) {
            console.warn("Cloud storage check failed", e);
        }
        return false;
    }

    async getUserData(moduleName: string): Promise<any> {
        const localKey = `dh_${moduleName}`;
        // Always try to fetch cloud data if possible to keep sync
        if (this.currentUser) {
            // Note: We use isCloudStorageEnabled() to verify if we SHOULD pull data
            // If storage is disabled, we rely on local.
            const hasStorage = await this.isCloudStorageEnabled();
            if (hasStorage) {
                try {
                    const docSnap = await this.db.collection("users").doc(this.currentUser.uid).collection("modules").doc(moduleName).get();
                    if (docSnap.exists) {
                        const cloudData = docSnap.data()?.data;
                        if (cloudData) {
                            localStorage.setItem(localKey, JSON.stringify(cloudData));
                            return cloudData;
                        }
                    }
                } catch (e) {
                    console.warn(`[Cloud] Load error for ${moduleName}`, e);
                }
            }
        }
        const localData = localStorage.getItem(localKey);
        return localData ? JSON.parse(localData) : null;
    }

    async saveUserData(moduleName: string, data: any) {
        const localKey = `dh_${moduleName}`;
        const sanitizedData = this.cleanData(data);
        localStorage.setItem(localKey, JSON.stringify(sanitizedData));

        if (this.currentUser) {
            const hasStorage = await this.isCloudStorageEnabled();
            if (hasStorage) {
                try {
                    await this.db.collection("users").doc(this.currentUser.uid).collection("modules").doc(moduleName).set({
                        data: sanitizedData,
                        updatedAt: Date.now(),
                        module: moduleName
                    }, { merge: true });
                } catch (e) {
                    console.error(`[Cloud] Save error for ${moduleName}`, e);
                }
            }
        }
    }

    async saveSpeakingSession(session: SpeakingSession) {
        const localKey = 'dh_speaking_sessions';
        const current = JSON.parse(localStorage.getItem(localKey) || '[]');
        current.unshift(session);
        localStorage.setItem(localKey, JSON.stringify(current.slice(0, 50)));

        if (this.currentUser && await this.isCloudStorageEnabled()) {
            try {
                await this.db.collection("users").doc(this.currentUser.uid).collection("speaking_history").add(this.cleanData(session));
            } catch (e) {
                console.error("Error saving speaking session to cloud", e);
            }
        }
    }

    async getSpeakingSessions(): Promise<SpeakingSession[]> {
        if (this.currentUser && await this.isCloudStorageEnabled()) {
            try {
                const snapshot = await this.db.collection("users").doc(this.currentUser.uid)
                    .collection("speaking_history")
                    .orderBy("timestamp", "desc")
                    .limit(20)
                    .get();

                if (!snapshot.empty) {
                    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpeakingSession));
                }
            } catch (e) {
                console.error("Error fetching speaking sessions", e);
            }
        }
        const localKey = 'dh_speaking_sessions';
        return JSON.parse(localStorage.getItem(localKey) || '[]');
    }

    async uploadFile(file: File, folder: string = 'courses'): Promise<string> {
        const hasStorage = await this.isCloudStorageEnabled();

        if (hasStorage && this.auth.currentUser) {
            try {
                const fileId = Date.now().toString(36) + '_' + file.name.replace(/[^a-z0-9.]/gi, '_');
                let storagePath = `demo-uploads/${folder}/${fileId}`;
                const email = this.auth.currentUser.email;
                if (email === this.ADMIN_EMAIL && folder === 'courses') {
                    storagePath = `courses/${fileId}`;
                } else {
                    storagePath = `users/${this.auth.currentUser.uid}/${folder}/${fileId}`;
                }
                const storageRef = this.storage.ref(storagePath);
                const snapshot = await storageRef.put(file);
                return await snapshot.ref.getDownloadURL();
            } catch (error) {
                console.error("Error uploading file to cloud:", error);
                return URL.createObjectURL(file);
            }
        } else {
            return URL.createObjectURL(file);
        }
    }

    async saveCourseTree(tree: CourseNode[]) {
        const sanitizedTree = this.cleanData(tree);
        try {
            localStorage.setItem('dh_course_tree_v2', JSON.stringify(sanitizedTree));
        } catch (e) { }

        if (this.auth.currentUser && await this.isCloudStorageEnabled()) {
            try {
                await this.db.collection("users").doc(this.auth.currentUser.uid).collection("modules").doc("course_tree").set({
                    data: sanitizedTree,
                    updatedAt: Date.now()
                }, { merge: true });
            } catch (error) { }
        }
    }

    async getCourseTree(): Promise<CourseNode[] | null> {
        if (this.auth.currentUser && await this.isCloudStorageEnabled()) {
            try {
                const docSnap = await this.db.collection("users").doc(this.auth.currentUser.uid).collection("modules").doc("course_tree").get();
                if (docSnap.exists && docSnap.data()?.data) {
                    return docSnap.data()?.data as CourseNode[];
                }
            } catch (error) { }
        }
        return null;
    }

    async getGlobalStats(uid: string) {
        let financeBalance = 0;
        let vocabCount = 0;
        let pendingTasks = 0;
        let activeHabits = 0;
        let habitStreak = 0;

        try {
            // Only attempt cloud fetch if storage enabled (or just rely on local cache logic inside getTransactions/getUserData is handled)
            // However, financeService has its own logic. We should assume this method aggregates from available sources.
            // For Admin/Global stats, we might want direct DB access, but for user Dashboard, we stick to permissions.

            // Finance Service directly queries 'finance_transactions' subcollection
            // We need to verify storage access before querying subcollections
            const hasStorage = await this.isCloudStorageEnabled();

            if (hasStorage) {
                const transRef = this.db.collection('users').doc(uid).collection('finance_transactions');
                const transSnap = await transRef.get();
                if (!transSnap.empty) {
                    transSnap.forEach(doc => {
                        const d = doc.data();
                        const amt = Number(d.amount) || 0;
                        if (d.type === 'income') financeBalance += amt;
                        else if (d.type === 'expense') financeBalance -= amt;
                    });
                }

                const vDoc = await this.db.collection("users").doc(uid).collection("modules").doc("vocab_terms").get();
                if (vDoc.exists) vocabCount = (vDoc.data()?.data || []).length;

                const tDoc = await this.db.collection("users").doc(uid).collection("modules").doc("tasks").get();
                if (tDoc.exists) pendingTasks = (tDoc.data()?.data || []).filter((t: any) => !t.completed).length;

                const hDoc = await this.db.collection("users").doc(uid).collection("modules").doc("habits").get();
                if (hDoc.exists) {
                    const arr = hDoc.data()?.data || [];
                    activeHabits = arr.length;
                    habitStreak = arr.length > 0 ? Math.max(...arr.map((h: any) => h.streak || 0)) : 0;
                }
            }
        } catch (e) {
            console.error("Error aggregating global stats", e);
        }

        return { financeBalance, vocabCount, pendingTasks, activeHabits, habitStreak };
    }

    async checkHealth(): Promise<{ dbLatency: number, status: 'ok' | 'degraded' | 'offline' }> {
        const start = Date.now();
        try {
            if (!this.auth.currentUser) return { dbLatency: 0, status: 'ok' };
            await this.db.collection('users').doc(this.auth.currentUser.uid).get();
            const end = Date.now();
            const latency = end - start;
            return { dbLatency: latency, status: latency > 1000 ? 'degraded' : 'ok' };
        } catch (e) {
            return { dbLatency: 0, status: 'offline' };
        }
    }

    async getSystemConfig() {
        try {
            const doc = await this.db.collection('system').doc('public').get();
            if (doc.exists) {
                return doc.data();
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    async updateSystemConfig(data: any) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) throw new Error("Unauthorized");
        try {
            await this.db.collection('system').doc('public').set(this.cleanData(data), { merge: true });
        } catch (e) {
            console.error("Error updating system config", e);
            throw e;
        }
    }
}

export const firebaseService = new FirebaseService();
