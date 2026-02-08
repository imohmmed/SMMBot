import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initBot } from "./bot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Initialize the Telegram bot
  try {
    initBot();
    console.log("Telegram bot initialized successfully");
  } catch (error) {
    console.error("Failed to initialize bot:", error);
  }

  // API Routes for the web dashboard

  // Stats
  app.get("/api/stats", async (req, res) => {
    try {
      const userCount = await storage.getUserCount();
      const orderStats = await storage.getOrderStats();
      const kd1sStats = await storage.getOrderStatsByProvider("kd1s");
      const amazingStats = await storage.getOrderStatsByProvider("amazing");
      const allUsers = await storage.getAllUsers();
      const totalBalance = allUsers.reduce((sum, u) => sum + parseFloat(u.balance), 0);
      const totalDeposits = allUsers.reduce((sum, u) => sum + parseFloat(u.totalDeposits), 0);
      const profitMargin = await storage.getSetting("profit_margin") || "15";

      res.json({
        userCount,
        totalBalance,
        totalDeposits,
        profitMargin,
        orders: orderStats,
        kd1s: kd1sStats,
        amazing: amazingStats,
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching stats" });
    }
  });

  // Users
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  // Categories
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Error fetching categories" });
    }
  });

  // Services
  app.get("/api/services", async (req, res) => {
    try {
      const services = await storage.getServices();
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Error fetching services" });
    }
  });

  // Orders
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Error fetching orders" });
    }
  });

  // Deposits
  app.get("/api/deposits", async (req, res) => {
    try {
      const deposits = await storage.getPendingDeposits();
      res.json(deposits);
    } catch (error) {
      res.status(500).json({ message: "Error fetching deposits" });
    }
  });

  // Payment methods
  app.get("/api/payment-methods", async (req, res) => {
    try {
      const methods = await storage.getPaymentMethods();
      res.json(methods);
    } catch (error) {
      res.status(500).json({ message: "Error fetching payment methods" });
    }
  });

  return httpServer;
}
