import { storage } from "./storage";

export async function seedDatabase() {
  try {
    const existingCategories = await storage.getCategories();
    if (existingCategories.length > 0) return;

    console.log("Seeding database...");

    // Create default categories
    const categories = [
      { name: "انستاكرام", slug: "instagram", sortOrder: 1, isActive: true },
      { name: "يوتيوب", slug: "youtube", sortOrder: 2, isActive: true },
      { name: "فيسبوك", slug: "facebook", sortOrder: 3, isActive: true },
      { name: "تيك توك", slug: "tiktok", sortOrder: 4, isActive: true },
      { name: "تويتر", slug: "twitter", sortOrder: 5, isActive: true },
      { name: "تيليكرام", slug: "telegram", sortOrder: 6, isActive: true },
    ];

    for (const cat of categories) {
      await storage.createCategory(cat);
    }

    // Set default profit margin
    await storage.setSetting("profit_margin", "15");

    // Create default payment methods
    const paymentMethods = [
      { name: "USDT", slug: "usdt", instructions: "قم بالتحويل إلى العنوان التالي:\n\nTRC20: TXxxxxxxxxxxxxx\n\nبعد التحويل أرسل سكرين شوت", isActive: true },
      { name: "ماستر كارد", slug: "mastercard", instructions: "قم بالتحويل إلى الحساب التالي:\n\nرقم البطاقة: xxxx-xxxx-xxxx\n\nبعد التحويل أرسل سكرين شوت", isActive: true },
      { name: "آسياسيل", slug: "asiacell", instructions: "قم بالتحويل عبر آسياسيل موني إلى الرقم:\n\n07xxxxxxxxx\n\nبعد التحويل أرسل سكرين شوت", isActive: true },
      { name: "زين كاش", slug: "zaincash", instructions: "قم بالتحويل عبر زين كاش إلى الرقم:\n\n07xxxxxxxxx\n\nبعد التحويل أرسل سكرين شوت", isActive: true },
    ];

    for (const method of paymentMethods) {
      await storage.createPaymentMethod(method);
    }

    // Set creator as admin
    const creatorId = process.env.CREATOR_TELEGRAM_ID || "1384026800";
    const existingCreator = await storage.getUserByTelegramId(creatorId);
    if (!existingCreator) {
      await storage.createUser({
        telegramId: creatorId,
        username: "mohmmed",
        firstName: "Mohammed",
        lastName: null,
        balance: "0",
        totalSpent: "0",
        totalDeposits: "0",
        totalOrders: 0,
        isAdmin: true,
      });
    }

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
