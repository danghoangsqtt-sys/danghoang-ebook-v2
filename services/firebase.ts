
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { CourseNode } from "../types";

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
    storageEnabled?: boolean;
    isLocked?: boolean;
    role?: 'admin' | 'user';
    createdAt?: number;
    metadata?: any;
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
    private sanitizeForFirestore(obj: any): any {
        if (obj === undefined) return null;
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return obj;

        if (Array.isArray(obj)) {
            return obj.map(v => this.sanitizeForFirestore(v));
        }

        const newObj: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const val = this.sanitizeForFirestore(obj[key]);
                newObj[key] = val;
            }
        }
        return newObj;
    }

    async loginWithGoogle(): Promise<{ user: firebase.User, token?: string, apiKey?: string } | null> {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar');

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
                    const data = docSnap.data();
                    storedApiKey = data?.geminiApiKey || '';
                    // Check if locked
                    if (data?.isLocked) {
                        await this.auth.signOut();
                        throw new Error("Account Locked");
                    }
                }
            } catch (e) {
                if ((e as any).message === "Account Locked") throw e;
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
            await this.db.collection("users").doc(user.uid).set({
                uid: user.uid,
                name: user.displayName || 'No Name',
                email: user.email || 'No Email',
                avatar: user.photoURL || '',
                lastLogin: Date.now(),
                ...(isSysAdmin ? { isActiveAI: true, storageEnabled: true, role: 'admin' } : {})
            }, { merge: true });
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
                // IMPORTANT: Map doc.id to uid to ensure delete operations target the correct document
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
        if (await this.isUserAuthorized()) {
            try {
                await this.db.collection("users").doc(targetUid).set({
                    geminiApiKey: apiKey,
                    isActiveAI: !!apiKey
                }, { merge: true });
            } catch (e) {
                console.error("Error updating user API key", e);
            }
        }
    }

    async updateUserStatus(uid: string, data: Partial<FirestoreUser>) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) return;
        try {
            await this.db.collection("users").doc(uid).set(data, { merge: true });
        } catch (e) {
            console.error("Error updating user status", e);
            throw e;
        }
    }

    // New method to delete user profile (Firestore only)
    async deleteUserDocument(uid: string) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) throw new Error("Unauthorized");
        try {
            // Delete main doc
            await this.db.collection("users").doc(uid).delete();
            console.log(`Deleted user doc ${uid}`);
        } catch (e) {
            console.error("Error deleting user", e);
            throw e;
        }
    }

    // New method to manually create a user profile
    async createUserProfile(data: Partial<FirestoreUser>) {
        if (this.currentUser?.email !== this.ADMIN_EMAIL) throw new Error("Unauthorized");

        // Use provided UID or generate one
        const uid = data.uid || `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        try {
            await this.db.collection("users").doc(uid).set({
                ...data,
                uid,
                createdAt: Date.now(),
                lastLogin: 0,
                isActiveAI: data.isActiveAI || false,
                storageEnabled: data.storageEnabled || false,
                isLocked: false,
                role: 'user'
            });
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
                return data?.geminiApiKey || null;
            }
        } catch (e) {
            console.error("Error fetching assigned key", e);
        }
        return null;
    }

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
                const data = docSnap.data();
                if (data) {
                    if (data.isLocked) return false;
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

    async getUserData(moduleName: string): Promise<any> {
        const localKey = `dh_${moduleName}`;
        if (this.currentUser) {
            const isAuth = await this.isUserAuthorized();
            if (isAuth) {
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
        const sanitizedData = this.sanitizeForFirestore(data);
        localStorage.setItem(localKey, JSON.stringify(sanitizedData));

        if (this.currentUser) {
            const isAuth = await this.isUserAuthorized();
            if (isAuth) {
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

    async uploadFile(file: File, folder: string = 'courses'): Promise<string> {
        const isAuth = await this.isUserAuthorized();
        if (isAuth && this.auth.currentUser) {
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
        const sanitizedTree = this.sanitizeForFirestore(tree);
        try {
            localStorage.setItem('dh_course_tree_v2', JSON.stringify(sanitizedTree));
        } catch (e) { }

        if (this.auth.currentUser) {
            try {
                await this.db.collection("users").doc(this.auth.currentUser.uid).collection("modules").doc("course_tree").set({
                    data: sanitizedTree,
                    updatedAt: Date.now()
                }, { merge: true });
            } catch (error) { }
        }
    }

    async getCourseTree(): Promise<CourseNode[] | null> {
        if (this.auth.currentUser) {
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
}

export const firebaseService = new FirebaseService();
