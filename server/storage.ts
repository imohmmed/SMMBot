import {
  type User, type InsertUser,
  type Category, type InsertCategory,
  type Service, type InsertService,
  type Order, type InsertOrder,
  type Deposit, type InsertDeposit,
  type Transaction, type InsertTransaction,
  type Settings,
  type PaymentMethod, type InsertPaymentMethod,
  users, categories, services, orders, deposits, transactions, settings, paymentMethods
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, count, sum } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBalance(userId: number, amount: string): Promise<void>;
  updateUserStats(userId: number, orderAmount: string): Promise<void>;
  addDeposit(userId: number, amount: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getUserCount(): Promise<number>;

  // Categories
  getCategories(): Promise<Category[]>;
  getActiveCategories(): Promise<Category[]>;
  getActiveCategoriesByType(type: string): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, data: Partial<InsertCategory>): Promise<void>;
  deleteCategory(id: number): Promise<void>;

  // Services
  getServices(): Promise<Service[]>;
  getServicesByCategory(categoryId: number): Promise<Service[]>;
  getActiveServicesByCategory(categoryId: number): Promise<Service[]>;
  getService(id: number): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: number, data: Partial<InsertService>): Promise<void>;
  deleteService(id: number): Promise<void>;
  incrementServiceStats(serviceId: number, revenue: string, profit: string): Promise<void>;

  // Orders
  getOrder(id: number): Promise<Order | undefined>;
  getOrdersByUser(userId: number): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: number, status: string, providerOrderId?: string): Promise<void>;
  getOrderStats(): Promise<{ total: number; totalAmount: string; totalProfit: string }>;
  getOrderStatsByProvider(provider: string): Promise<{ total: number; totalAmount: string; totalProfit: string }>;
  getOrderStatsByCategoryType(categoryType: string): Promise<{ total: number; totalAmount: string; totalProfit: string }>;

  // Deposits
  getDeposit(id: number): Promise<Deposit | undefined>;
  getPendingDeposits(): Promise<Deposit[]>;
  getDepositsByUser(userId: number): Promise<Deposit[]>;
  createDeposit(deposit: InsertDeposit): Promise<Deposit>;
  updateDepositStatus(id: number, status: string, approvedBy?: number): Promise<void>;

  // Transactions
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactionsByUser(userId: number): Promise<Transaction[]>;

  // Settings
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;

  // Payment Methods
  getPaymentMethods(): Promise<PaymentMethod[]>;
  getActivePaymentMethods(): Promise<PaymentMethod[]>;
  getPaymentMethod(id: number): Promise<PaymentMethod | undefined>;
  createPaymentMethod(method: InsertPaymentMethod): Promise<PaymentMethod>;
  updatePaymentMethod(id: number, data: Partial<InsertPaymentMethod>): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUserBalance(userId: number, amount: string): Promise<void> {
    await db.update(users).set({
      balance: sql`${users.balance} + ${amount}`
    }).where(eq(users.id, userId));
  }

  async updateUserStats(userId: number, orderAmount: string): Promise<void> {
    await db.update(users).set({
      totalSpent: sql`${users.totalSpent} + ${orderAmount}`,
      totalOrders: sql`${users.totalOrders} + 1`
    }).where(eq(users.id, userId));
  }

  async addDeposit(userId: number, amount: string): Promise<void> {
    await db.update(users).set({
      balance: sql`${users.balance} + ${amount}`,
      totalDeposits: sql`${users.totalDeposits} + ${amount}`
    }).where(eq(users.id, userId));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result.count;
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(categories.sortOrder);
  }

  async getActiveCategories(): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.sortOrder);
  }

  async getActiveCategoriesByType(type: string): Promise<Category[]> {
    return db.select().from(categories).where(and(eq(categories.isActive, true), eq(categories.type, type))).orderBy(categories.sortOrder);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [cat] = await db.select().from(categories).where(eq(categories.id, id));
    return cat;
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [cat] = await db.select().from(categories).where(eq(categories.slug, slug));
    return cat;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(category).returning();
    return created;
  }

  async updateCategory(id: number, data: Partial<InsertCategory>): Promise<void> {
    await db.update(categories).set(data).where(eq(categories.id, id));
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Services
  async getServices(): Promise<Service[]> {
    return db.select().from(services).orderBy(services.categoryId, services.id);
  }

  async getServicesByCategory(categoryId: number): Promise<Service[]> {
    return db.select().from(services).where(eq(services.categoryId, categoryId));
  }

  async getActiveServicesByCategory(categoryId: number): Promise<Service[]> {
    return db.select().from(services).where(
      and(eq(services.categoryId, categoryId), eq(services.isActive, true))
    );
  }

  async getService(id: number): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service;
  }

  async createService(service: InsertService): Promise<Service> {
    const [created] = await db.insert(services).values(service).returning();
    return created;
  }

  async updateService(id: number, data: Partial<InsertService>): Promise<void> {
    await db.update(services).set(data).where(eq(services.id, id));
  }

  async deleteService(id: number): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async incrementServiceStats(serviceId: number, revenue: string, profit: string): Promise<void> {
    await db.update(services).set({
      totalOrders: sql`${services.totalOrders} + 1`,
      totalRevenue: sql`${services.totalRevenue} + ${revenue}`,
      totalProfit: sql`${services.totalProfit} + ${profit}`
    }).where(eq(services.id, serviceId));
  }

  // Orders
  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrdersByUser(userId: number): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getAllOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async updateOrderStatus(id: number, status: string, providerOrderId?: string): Promise<void> {
    const data: any = { status };
    if (providerOrderId) data.providerOrderId = providerOrderId;
    await db.update(orders).set(data).where(eq(orders.id, id));
  }

  async getOrderStats(): Promise<{ total: number; totalAmount: string; totalProfit: string }> {
    const [result] = await db.select({
      total: count(),
      totalAmount: sql<string>`COALESCE(SUM(${orders.amount}::numeric), 0)::text`,
      totalProfit: sql<string>`COALESCE(SUM(${orders.profit}::numeric), 0)::text`
    }).from(orders);
    return result;
  }

  async getOrderStatsByProvider(provider: string): Promise<{ total: number; totalAmount: string; totalProfit: string }> {
    const [result] = await db.select({
      total: count(),
      totalAmount: sql<string>`COALESCE(SUM(${orders.amount}::numeric), 0)::text`,
      totalProfit: sql<string>`COALESCE(SUM(${orders.profit}::numeric), 0)::text`
    }).from(orders).where(eq(orders.provider, provider));
    return result;
  }

  async getOrderStatsByCategoryType(categoryType: string): Promise<{ total: number; totalAmount: string; totalProfit: string }> {
    const [result] = await db.select({
      total: count(),
      totalAmount: sql<string>`COALESCE(SUM(${orders.amount}::numeric), 0)::text`,
      totalProfit: sql<string>`COALESCE(SUM(${orders.profit}::numeric), 0)::text`
    }).from(orders)
      .innerJoin(services, eq(orders.serviceId, services.id))
      .innerJoin(categories, eq(services.categoryId, categories.id))
      .where(eq(categories.type, categoryType));
    return result;
  }

  // Deposits
  async getDeposit(id: number): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.id, id));
    return deposit;
  }

  async getPendingDeposits(): Promise<Deposit[]> {
    return db.select().from(deposits).where(eq(deposits.status, "pending")).orderBy(desc(deposits.createdAt));
  }

  async getDepositsByUser(userId: number): Promise<Deposit[]> {
    return db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt));
  }

  async createDeposit(deposit: InsertDeposit): Promise<Deposit> {
    const [created] = await db.insert(deposits).values(deposit).returning();
    return created;
  }

  async updateDepositStatus(id: number, status: string, approvedBy?: number): Promise<void> {
    const data: any = { status };
    if (approvedBy) data.approvedBy = approvedBy;
    await db.update(deposits).set(data).where(eq(deposits.id, id));
  }

  // Transactions
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(transaction).returning();
    return created;
  }

  async getTransactionsByUser(userId: number): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
  }

  // Settings
  async getSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(settings).values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }

  // Payment Methods
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods);
  }

  async getActivePaymentMethods(): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods).where(eq(paymentMethods.isActive, true));
  }

  async getPaymentMethod(id: number): Promise<PaymentMethod | undefined> {
    const [method] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    return method;
  }

  async createPaymentMethod(method: InsertPaymentMethod): Promise<PaymentMethod> {
    const [created] = await db.insert(paymentMethods).values(method).returning();
    return created;
  }

  async updatePaymentMethod(id: number, data: Partial<InsertPaymentMethod>): Promise<void> {
    await db.update(paymentMethods).set(data).where(eq(paymentMethods.id, id));
  }
}

export const storage = new DatabaseStorage();
