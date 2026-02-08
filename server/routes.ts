import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initBot, getBot } from "./bot";

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
      const customSmmStats = await storage.getOrderStatsByCategoryType("smm");
      const subscriptionStats = await storage.getOrderStatsByCategoryType("subscriptions");
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
        customSmm: customSmmStats,
        subscriptions: subscriptionStats,
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

  app.post("/api/broadcast", async (req, res) => {
    try {
      const { message, imageUrl, buttonText, buttonUrl } = req.body;

      if (!message && !imageUrl) {
        return res.status(400).json({ message: "يجب إدخال نص أو صورة على الأقل" });
      }

      if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
        return res.status(400).json({ message: "يجب إدخال نص الزر والرابط معاً" });
      }

      if (buttonUrl && !buttonUrl.startsWith("http")) {
        return res.status(400).json({ message: "الرابط يجب أن يبدأ بـ http أو https" });
      }

      const bot = getBot();
      if (!bot) {
        return res.status(500).json({ message: "البوت غير متاح حالياً" });
      }

      const users = await storage.getAllUsers();
      let sent = 0;
      let failed = 0;

      const inlineKeyboard = buttonText && buttonUrl
        ? { reply_markup: { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] } }
        : {};

      const BATCH_SIZE = 25;

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (imageUrl) {
              await bot.sendPhoto(user.telegramId, imageUrl, {
                caption: message || "",
                ...inlineKeyboard,
              });
            } else {
              await bot.sendMessage(user.telegramId, message, {
                ...inlineKeyboard,
              });
            }
            success = true;
            break;
          } catch (e: any) {
            const errMsg = e?.response?.body?.description || e?.message || "";
            if (errMsg.includes("Too Many Requests") || errMsg.includes("429")) {
              const retryAfter = e?.response?.body?.parameters?.retry_after || 5;
              await new Promise(r => setTimeout(r, retryAfter * 1000));
              continue;
            }
            if (errMsg.includes("bot was blocked") || errMsg.includes("user is deactivated") ||
                errMsg.includes("chat not found") || errMsg.includes("PEER_ID_INVALID")) {
              break;
            }
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
          }
        }
        if (success) sent++; else failed++;

        if ((i + 1) % BATCH_SIZE === 0) {
          await new Promise(r => setTimeout(r, 1000));
        } else {
          await new Promise(r => setTimeout(r, 35));
        }
      }

      res.json({ sent, failed, total: users.length });
    } catch (error) {
      console.error("Broadcast error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء الإرسال" });
    }
  });

  return httpServer;
}
