
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { CourseNode } from "../types";

// Cấu hình Firebase (Lấy từ hình ảnh Project Settings của bạn)
const firebaseConfig = {
    apiKey: "AIzaSyDqwU5EKw91pc6So2ggVGcL2WrLfR_mZFg",
    authDomain: "e-book-for-me.firebaseapp.com",
    projectId: "e-book-for-me",
    storageBucket: "e-book-for-me.firebasestorage.app",
    messagingSenderId: "380456713229",
    appId: "1:380456713229:web:4d920884462625ad23a944"
};

// Internal state
let db: any = null;
let storage: any = null;
let auth: any = null;
let isConfigured = false;

// Safe Initialization Logic
const initializeFirebaseSafe = () => {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        storage = getStorage(app);
        auth = getAuth(app);
        isConfigured = true;
        console.log("✅ Firebase Initialized Successfully");
    } catch (error) {
        console.error("❌ Firebase Initialization Failed:", error);
        isConfigured = false;
    }
};

// Run initialization
initializeFirebaseSafe();

export interface FirestoreUser {
    uid: string;
    name: string;
    email: string;
    avatar: string;
    lastLogin: number;
    geminiApiKey?: string; // Field for Admin to set
    isActiveAI?: boolean;
    storageEnabled?: boolean; // New flag for Cloud Storage Authorization
}

class FirebaseService {
    // Cache authorization status to avoid Firestore read spam
    private _authCache: { uid: string, value: boolean } | null = null;

    // --- AUTHENTICATION ---
    async loginWithGoogle(): Promise<{ user: User, token?: string } | null> {
        if (!isConfigured || !auth) {
            alert("Chưa cấu hình Firebase. Vui lòng kiểm tra source code.");
            return null;
        }

        const provider = new GoogleAuthProvider();
        // Yêu cầu quyền truy cập Google Calendar
        provider.addScope('https://www.googleapis.com/auth/calendar');

        try {
            const result = await signInWithPopup(auth, provider);
            // Lấy Access Token của Google (quan trọng để gọi Google Calendar API)
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken;

            // Sync user info to Firestore for Admin to see
            await this.syncUserToFirestore(result.user);

            // Reset auth cache on login
            this._authCache = null;

            return { user: result.user, token };
        } catch (error) {
            console.error("Login Failed", error);
            alert("Đăng nhập thất bại: " + (error as any).message);
            return null;
        }
    }

    async logout() {
        if (auth) await signOut(auth);
        this._authCache = null;
    }

    get currentUser() {
        return auth?.currentUser;
    }

    // --- USER MANAGEMENT (ADMIN & SYNC) ---
    private async syncUserToFirestore(user: User) {
        if (!isConfigured || !db) return;
        try {
            const userRef = doc(db, "users", user.uid);
            // Use setDoc with merge to avoid overwriting existing flags like storageEnabled
            await setDoc(userRef, {
                uid: user.uid,
                name: user.displayName || 'No Name',
                email: user.email || 'No Email',
                avatar: user.photoURL || '',
                lastLogin: Date.now()
            }, { merge: true });
        } catch (e) {
            console.error("Error syncing user to DB", e);
        }
    }

    // Admin Only: Get all users
    async getAllUsers(): Promise<FirestoreUser[]> {
        if (!isConfigured || !db) return [];
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            const users: FirestoreUser[] = [];
            querySnapshot.forEach((doc) => {
                users.push(doc.data() as FirestoreUser);
            });
            return users;
        } catch (e) {
            console.error("Error fetching users", e);
            return [];
        }
    }

    // Admin Only: Set API Key for a user
    async updateUserApiKey(targetUid: string, apiKey: string) {
        if (!isConfigured || !db) return;
        try {
            const userRef = doc(db, "users", targetUid);
            await updateDoc(userRef, {
                geminiApiKey: apiKey,
                isActiveAI: !!apiKey
            });
        } catch (e) {
            console.error("Error updating user API key", e);
            throw e;
        }
    }

    // User: Fetch my assigned API Key
    async getMyAssignedApiKey(uid: string): Promise<string | null> {
        if (!isConfigured || !db) return null;
        try {
            const userRef = doc(db, "users", uid);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                return data.geminiApiKey || null;
            }
        } catch (e) {
            console.error("Error fetching assigned key", e);
        }
        return null;
    }

    // --- HYBRID STORAGE STRATEGY ---

    /**
     * Check if current user is authorized for Cloud Storage
     * Authorization: Admin email OR storageEnabled flag in Firestore
     */
    async isUserAuthorized(): Promise<boolean> {
        if (!auth || !auth.currentUser) return false;
        const user = auth.currentUser;

        // Check Cache first
        if (this._authCache && this._authCache.uid === user.uid) {
            return this._authCache.value;
        }

        // 1. Admin Check (Hardcoded for safety/fallback)
        if (user.email === 'danghoang.sqtt@gmail.com') {
            this._authCache = { uid: user.uid, value: true };
            return true;
        }

        // 2. Firestore Profile Check
        if (isConfigured && db) {
            try {
                const userRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(userRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const isAuth = data.storageEnabled === true || data.isActiveAI === true; // Support both flags
                    this._authCache = { uid: user.uid, value: isAuth };
                    return isAuth;
                }
            } catch (e) {
                console.warn("Authorization check failed", e);
            }
        }

        this._authCache = { uid: user.uid, value: false };
        return false;
    }

    /**
     * Load data for a module.
     * Strategy: Cloud First (if authorized) -> Local Fallback -> Null
     */
    async getUserData(moduleName: string): Promise<any> {
        const localKey = `dh_${moduleName}`;

        // 1. Try Cloud Read if Authorized
        if (isConfigured && db && this.currentUser) {
            const authorized = await this.isUserAuthorized();
            if (authorized) {
                try {
                    // Path: users/{uid}/modules/{moduleName}
                    const docRef = doc(db, "users", this.currentUser.uid, "modules", moduleName);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        // console.log(`[Cloud] Loaded ${moduleName}`);
                        const cloudData = docSnap.data().data;
                        // Update local cache to keep them in sync
                        localStorage.setItem(localKey, JSON.stringify(cloudData));
                        return cloudData;
                    } else {
                        console.log(`[Cloud] No data for ${moduleName}, falling back to local...`);
                    }
                } catch (e) {
                    console.error(`[Cloud] Load error for ${moduleName}`, e);
                }
            }
        }

        // 2. Local Fallback (Guest or Offline or Cloud Empty)
        const localData = localStorage.getItem(localKey);
        return localData ? JSON.parse(localData) : null;
    }

    /**
     * Save data for a module.
     * Strategy: Cloud Write (if authorized) AND Local Write (always, for offline/speed)
     */
    async saveUserData(moduleName: string, data: any) {
        const localKey = `dh_${moduleName}`;

        // Always save local for offline resilience and speed
        localStorage.setItem(localKey, JSON.stringify(data));

        // Try Cloud Write if Authorized
        if (isConfigured && db && this.currentUser) {
            const authorized = await this.isUserAuthorized();
            if (authorized) {
                try {
                    const docRef = doc(db, "users", this.currentUser.uid, "modules", moduleName);
                    await setDoc(docRef, {
                        data,
                        updatedAt: Date.now(),
                        module: moduleName
                    }, { merge: true });
                    // console.log(`[Cloud] Saved ${moduleName}`);
                } catch (e) {
                    console.error(`[Cloud] Save error for ${moduleName}`, e);
                }
            }
        }
    }

    // --- STORAGE (FILES) ---
    async uploadFile(file: File, path: string = 'courses'): Promise<string> {
        if (!isConfigured || !storage) {
            console.log("ℹ️ [Local Mode] File converted to Data URL (not uploaded to cloud)");
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        try {
            const fileId = Date.now().toString(36);
            const storageRef = ref(storage, `${path}/${fileId}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("Error uploading file to Firebase:", error);
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
    }

    // --- FIRESTORE (Public Course Tree) ---
    async saveCourseTree(tree: CourseNode[]) {
        try {
            localStorage.setItem('dh_course_tree_v2', JSON.stringify(tree));
        } catch (e) {
            console.warn("LocalStorage full or error", e);
        }

        if (!isConfigured || !db) return;

        try {
            await setDoc(doc(db, "data", "courseTree"), { tree });
        } catch (error) {
            console.error("Error saving course tree to Firestore:", error);
        }
    }

    async getCourseTree(): Promise<CourseNode[] | null> {
        if (isConfigured && db) {
            try {
                const docRef = doc(db, "data", "courseTree");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    return docSnap.data().tree as CourseNode[];
                }
            } catch (error) {
                console.error("Error fetching course tree from Firestore:", error);
            }
        }
        const localData = localStorage.getItem('dh_course_tree_v2');
        if (localData) {
            return JSON.parse(localData);
        }
        return null;
    }
}

export const firebaseService = new FirebaseService();
