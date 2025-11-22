
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/auth";
import { Transaction, BudgetCategory, FinancialGoal, DebtItem } from "../types";
import { geminiService } from "./gemini";
import { MarketData } from "./market";

export interface MarketAnalysisResult {
    marketTrend: string;
    economicForecast: string;
    recommendedAllocation: {
        name: string;
        percentage: number;
        color: string;
    }[];
    investmentAdvice: string;
    actionableSteps: string[];
}

class FinancialService {
    private db: firebase.firestore.Firestore;

    constructor() {
        this.db = firebase.firestore();
        this.db.enablePersistence().catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn('Persistence failed: Multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Persistence not supported by browser');
            }
        });
    }

    // --- Generic Helpers ---
    private getCollection(uid: string, collection: string) {
        return this.db.collection('users').doc(uid).collection(collection);
    }

    // --- Transactions ---
    subscribeToTransactions(uid: string, callback: (data: Transaction[]) => void) {
        return this.getCollection(uid, 'finance_transactions')
            .orderBy('date', 'desc')
            .limit(100)
            .onSnapshot((snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Transaction[];
                callback(data);
            });
    }

    async getTransactionsPaged(uid: string, limit: number, lastDoc: any = null) {
        let query = this.getCollection(uid, 'finance_transactions')
            .orderBy('date', 'desc')
            .limit(limit);

        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Transaction[];

        return {
            data,
            lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
            empty: snapshot.empty
        };
    }

    async addTransaction(uid: string, transaction: Omit<Transaction, 'id'>) {
        await this.getCollection(uid, 'finance_transactions').add({
            ...transaction,
            amount: Number(transaction.amount),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    async deleteTransaction(uid: string, id: string) {
        await this.getCollection(uid, 'finance_transactions').doc(id).delete();
    }

    // --- Budgets ---
    subscribeToBudgets(uid: string, callback: (data: BudgetCategory[]) => void) {
        return this.getCollection(uid, 'finance_budgets')
            .onSnapshot((snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as BudgetCategory[];
                callback(data);
            });
    }

    async saveBudget(uid: string, budget: BudgetCategory) {
        const docId = (budget.id && budget.id.length > 15) ? budget.id : undefined;
        const data = {
            name: budget.name,
            limit: Number(budget.limit),
            spent: Number(budget.spent || 0),
            type: budget.type,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (docId) {
            await this.getCollection(uid, 'finance_budgets').doc(docId).set(data, { merge: true });
        } else {
            await this.getCollection(uid, 'finance_budgets').add(data);
        }
    }

    async deleteBudget(uid: string, id: string) {
        await this.getCollection(uid, 'finance_budgets').doc(id).delete();
    }

    // --- Goals ---
    subscribeToGoals(uid: string, callback: (data: FinancialGoal[]) => void) {
        return this.getCollection(uid, 'finance_goals')
            .onSnapshot((snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as FinancialGoal[];
                callback(data);
            });
    }

    async saveGoal(uid: string, goal: FinancialGoal) {
        const docId = (goal.id && goal.id.length > 15) ? goal.id : undefined;
        const data = {
            name: goal.name,
            targetAmount: Number(goal.targetAmount),
            currentAmount: Number(goal.currentAmount),
            type: goal.type,
            deadline: goal.deadline || null,
            color: goal.color || 'bg-blue-500',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (docId) {
            await this.getCollection(uid, 'finance_goals').doc(docId).set(data, { merge: true });
        } else {
            await this.getCollection(uid, 'finance_goals').add(data);
        }
    }

    async deleteGoal(uid: string, id: string) {
        await this.getCollection(uid, 'finance_goals').doc(id).delete();
    }

    // --- Debts ---
    subscribeToDebts(uid: string, callback: (data: DebtItem[]) => void) {
        return this.getCollection(uid, 'finance_debts')
            .onSnapshot((snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as DebtItem[];
                callback(data);
            });
    }

    async saveDebt(uid: string, debt: DebtItem) {
        const docId = (debt.id && debt.id.length > 15) ? debt.id : undefined;
        const data = {
            personName: debt.personName,
            amount: Number(debt.amount),
            type: debt.type,
            dueDate: debt.dueDate || null,
            note: debt.note || null,
            isPaid: !!debt.isPaid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (docId) {
            await this.getCollection(uid, 'finance_debts').doc(docId).set(data, { merge: true });
        } else {
            await this.getCollection(uid, 'finance_debts').add(data);
        }
    }

    async deleteDebt(uid: string, id: string) {
        await this.getCollection(uid, 'finance_debts').doc(id).delete();
    }

    // --- AI Analysis ---
    async calculateAvgIncome(uid: string): Promise<number> {
        try {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            const snapshot = await this.getCollection(uid, 'finance_transactions')
                .where('type', '==', 'income')
                .where('date', '>=', threeMonthsAgo.toISOString().split('T')[0])
                .get();

            if (snapshot.empty) return 0;

            const totalIncome = snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            return Math.round(totalIncome / 3);
        } catch (e) {
            console.error("Error calc avg income", e);
            return 0;
        }
    }

    async generateWeeklyMarketAnalysis(uid: string, marketData: MarketData): Promise<MarketAnalysisResult> {
        const marketSummary = `
      - VN-Index: ${marketData.vnIndex.value}
      - SJC Gold: Sell ${marketData.sjcGold.sell} / Buy ${marketData.sjcGold.buy}
      - World Gold: $${marketData.items.find(i => i.symbol === 'XAU')?.price}/oz
      `;

        const prompt = `
      Role: Senior Financial Analyst for Vietnam Market.
      Context: Weekly Market Report.
      
      LIVE Data Snapshot:
      ${marketSummary}
      
      Task: 
      1. Provide a 'Weekly Market Trend' summary focusing on Gold and Macroeconomics.
      2. Analyze the gap between Vietnam SJC Gold and World Gold. Is it high or low?
      3. Provide an 'Economic Forecast' for the upcoming week.
      4. Give actionable advice for a standard investor holding Gold or Cash.

      Output JSON Schema:
      {
        "marketTrend": "Summary of the week's major trend.",
        "economicForecast": "Forecast for next week.",
        "recommendedAllocation": [], 
        "investmentAdvice": "Advice regarding Gold accumulation vs selling.",
        "actionableSteps": ["Step 1", "Step 2", "Step 3"]
      }
      `;

        return await geminiService.analyzeMarket(prompt);
    }

    async getMarketNews(): Promise<string> {
        const today = new Date().toLocaleDateString('vi-VN');
        const prompt = `
      Bạn là chuyên gia tin tức tài chính. Hãy tìm kiếm thông tin mới nhất trên internet (Google Search) về hai chủ đề sau tại Việt Nam ngày hôm nay (${today}):
      1. Thị trường Tài chính (Chứng khoán, Lãi suất, Tỷ giá).
      2. Thị trường Bất động sản (Xu hướng, Chính sách mới, Giá cả).

      Hãy tổng hợp thành một báo cáo ngắn gọn (Markdown), chia làm 2 phần rõ rệt: "💰 Tin Tài Chính" và "🏘️ Tin Bất Động Sản".
      Với mỗi tin, hãy kèm theo nguồn (nếu có) dưới dạng liên kết.
      `;
        return await geminiService.searchContent(prompt);
    }

    // --- Batch Operations ---
    async batchSaveFinancialPlan(
        uid: string,
        budgets: BudgetCategory[],
        goals: FinancialGoal[],
        metadata: { analysisComment: string, cashflowInsight: string }
    ) {
        const batch = this.db.batch();
        const budgetRef = this.getCollection(uid, 'finance_budgets');
        const goalRef = this.getCollection(uid, 'finance_goals');
        const userRef = this.db.collection('users').doc(uid);

        budgets.forEach(b => {
            const ref = budgetRef.doc();
            batch.set(ref, {
                name: b.name,
                limit: Number(b.limit),
                spent: 0,
                type: b.type,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        goals.forEach(g => {
            const ref = goalRef.doc();
            batch.set(ref, {
                name: g.name,
                targetAmount: Number(g.targetAmount),
                currentAmount: 0,
                type: g.type,
                deadline: g.deadline || null,
                color: g.color || 'bg-blue-500',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        batch.set(userRef, {
            finance_metadata: {
                lastAIAnalysis: firebase.firestore.FieldValue.serverTimestamp(),
                analysisComment: metadata.analysisComment,
                cashflowInsight: metadata.cashflowInsight
            }
        }, { merge: true });

        await batch.commit();
    }
}

export const financialService = new FinancialService();
