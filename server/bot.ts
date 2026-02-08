import TelegramBot from "node-telegram-bot-api";
import { storage } from "./storage";
import * as smmApi from "./smm-api";
import type { User, Service, Category, Order } from "@shared/schema";

function getOrderDisplayId(order: Order): string {
  if (order.provider === "custom") {
    return `${order.sequentialId || order.id}`;
  }
  return order.providerOrderId || `${order.id}`;
}

const CREATOR_ID = process.env.CREATOR_TELEGRAM_ID || "1384026800";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "@mohmmed";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason instanceof Error ? reason.message : reason);
});

let bot: TelegramBot;
let botUserId: number | null = null;
let notificationGroupId: string | null = null;
let depositGroupId: string | null = null;
let subscriptionGroupId: string | null = null;

const userStates = new Map<string, any>();

function setState(telegramId: string, state: any) {
  userStates.set(telegramId, state);
}

function getState(telegramId: string) {
  return userStates.get(telegramId);
}

function clearState(telegramId: string) {
  userStates.delete(telegramId);
}

async function ensureUser(msg: TelegramBot.Message): Promise<User> {
  const telegramId = msg.from!.id.toString();
  let user = await storage.getUserByTelegramId(telegramId);
  if (!user) {
    user = await storage.createUser({
      telegramId,
      username: msg.from!.username || null,
      firstName: msg.from!.first_name || null,
      lastName: msg.from!.last_name || null,
      balance: "0",
      totalSpent: "0",
      totalDeposits: "0",
      totalOrders: 0,
      isAdmin: telegramId === CREATOR_ID,
    });
  }
  return user;
}

async function isAdmin(telegramId: string): Promise<boolean> {
  if (telegramId === CREATOR_ID) return true;
  const user = await storage.getUserByTelegramId(telegramId);
  return user?.isAdmin === true;
}

async function getProfitMargin(): Promise<number> {
  const margin = await storage.getSetting("profit_margin");
  return margin ? parseFloat(margin) : 15;
}

function formatNumber(num: string | number): string {
  const n = typeof num === "string" ? parseFloat(num) : num;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function calculatePrice(rate: string, quantity: number, margin: number): number {
  const basePrice = (parseFloat(rate) / 1000) * quantity;
  return basePrice * (1 + margin / 100);
}

async function sendMainMenu(chatId: number, messageId?: number) {
  const text = "🌟 *مرحباً بك في بوت خدمات السوشل ميديا*\n\nاختر من القائمة أدناه:";
  const keyboard = {
    inline_keyboard: [
      [{ text: "📋 الخدمات", callback_data: "services" }],
      [{ text: "👤 معلومات حسابك", callback_data: "account_info" }, { text: "💰 شحن حسابك", callback_data: "deposit" }],
      [{ text: "📦 طلباتي", callback_data: "my_orders" }],
    ],
  };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showServices(chatId: number, messageId?: number) {
  const text = "📋 *اختر نوع الخدمة:*";
  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 سوشل ميديا", callback_data: "service_type_smm" }],
      [{ text: "📺 اشتراكات", callback_data: "service_type_subscriptions" }],
      [{ text: "🔙 رجوع", callback_data: "main_menu" }],
    ],
  };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showServiceTypeCategories(chatId: number, type: string, messageId?: number) {
  const cats = await storage.getActiveCategoriesByType(type);
  if (cats.length === 0) {
    const text = "❌ لا توجد أقسام متاحة حالياً.";
    const keyboard = { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "services" }]] };
    if (messageId) {
      return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: keyboard });
    }
    return bot.sendMessage(chatId, text, { reply_markup: keyboard });
  }

  const buttons = cats.map((cat) => [
    { text: `${cat.name}`, callback_data: `cat_${cat.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "services" }]);

  const title = type === "smm" ? "📱 *أقسام سوشل ميديا:*" : "📺 *أقسام الاشتراكات:*";
  const catKeyboard = { inline_keyboard: buttons };

  if (messageId) {
    await bot.editMessageText(title, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: catKeyboard,
    });
  } else {
    await bot.sendMessage(chatId, title, {
      parse_mode: "Markdown",
      reply_markup: catKeyboard,
    });
  }
}

async function showCategoryServices(chatId: number, categoryId: number, messageId?: number) {
  const margin = await getProfitMargin();
  const svcs = await storage.getActiveServicesByCategory(categoryId);
  const cat = await storage.getCategory(categoryId);

  if (svcs.length === 0) {
    const text = "❌ لا توجد خدمات في هذا القسم حالياً.";
    if (messageId) {
      return bot.editMessageText(text, { chat_id: chatId, message_id: messageId });
    }
    return bot.sendMessage(chatId, text);
  }

  const buttons = svcs.map((svc) => [
    { text: `${svc.name}`, callback_data: `svc_${svc.id}` },
  ]);
  const backCb = cat?.type === "subscriptions" ? "service_type_subscriptions" : "service_type_smm";
  buttons.push([{ text: "🔙 رجوع للأقسام", callback_data: backCb }]);

  const text = `📂 *خدمات ${cat?.name || ""}:*`;
  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showServiceDetail(chatId: number, serviceId: number, telegramId: string, messageId?: number) {
  const svc = await storage.getService(serviceId);
  if (!svc) {
    const errText = "❌ الخدمة غير موجودة.";
    if (messageId) return bot.editMessageText(errText, { chat_id: chatId, message_id: messageId });
    return bot.sendMessage(chatId, errText);
  }

  const category = await storage.getCategory(svc.categoryId);
  const isSubscription = category?.type === "subscriptions";

  let text: string;
  let keyboard: any;

  if (isSubscription) {
    const svcPrice = parseFloat(svc.price || "0");
    text = `🔹 *${svc.name}*\n\n` +
      `${svc.description ? `📝 ${svc.description}\n\n` : ""}` +
      `💵 السعر: ${formatNumber(svcPrice)} IQD`;
    keyboard = {
      inline_keyboard: [
        [{ text: "🛒 طلب", callback_data: `order_subscription_${serviceId}` }],
        [{ text: "🔙 رجوع", callback_data: `cat_${svc.categoryId}` }],
      ],
    };
  } else if (svc.serviceType === "custom") {
    const svcPrice = parseFloat(svc.price || "0");
    text = `🔹 *${svc.name}*\n\n` +
      `${svc.description ? `📝 ${svc.description}\n\n` : ""}` +
      `💵 السعر: ${formatNumber(svcPrice)} IQD\n\n` +
      `لتقديم طلب، أرسل الرابط أو المعلومات المطلوبة:`;
    setState(telegramId, { step: "order_link", serviceId, isCustom: true });
    keyboard = { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `cat_${svc.categoryId}` }]] };
  } else {
    const margin = await getProfitMargin();
    const pricePerK = parseFloat(svc.rate || "0") * (1 + margin / 100);
    text = `🔹 *${svc.name}*\n\n` +
      `${svc.description ? `📝 ${svc.description}\n\n` : ""}` +
      `💵 السعر لكل 1000: ${formatNumber(pricePerK)}\n` +
      `📊 الحد الأدنى: ${svc.minQuantity}\n` +
      `📊 الحد الأقصى: ${formatNumber(svc.maxQuantity)}\n` +
      `🌐 الموقع: ${svc.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n\n` +
      `لتقديم طلب، أرسل الرابط المراد:`;
    setState(telegramId, { step: "order_link", serviceId, isCustom: false });
    keyboard = { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `cat_${svc.categoryId}` }]] };
  }

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showAccountInfo(chatId: number, telegramId: string, messageId?: number) {
  const user = await storage.getUserByTelegramId(telegramId);
  if (!user) return;

  const text = `👤 *معلومات حسابك*\n\n` +
    `🆔 الآيدي: \`${user.telegramId}\`\n` +
    `👤 الاسم: ${user.firstName || ""} ${user.lastName || ""}\n` +
    `📱 اليوزر: ${user.username ? "@" + user.username : "غير محدد"}\n\n` +
    `💰 الرصيد: ${formatNumber(user.balance)} IQD\n` +
    `💳 مجموع الإيداعات: ${formatNumber(user.totalDeposits)} IQD\n` +
    `🛒 مجموع المصروفات: ${formatNumber(user.totalSpent)} IQD\n` +
    `📦 عدد الطلبات: ${user.totalOrders}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "💸 تحويل أموال", callback_data: "transfer_money" }],
      [{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }],
    ],
  };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showDepositOptions(chatId: number, messageId?: number) {
  const methods = await storage.getActivePaymentMethods();
  if (methods.length === 0) {
    const text = "❌ لا توجد طرق دفع متاحة حالياً.";
    if (messageId) return bot.editMessageText(text, { chat_id: chatId, message_id: messageId });
    return bot.sendMessage(chatId, text);
  }

  const buttons = methods.map((m) => [
    { text: `${m.name}`, callback_data: `pay_${m.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "main_menu" }]);

  const text = "💰 *اختر طريقة الدفع:*";
  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showPaymentMethod(chatId: number, methodId: number, telegramId: string, messageId?: number) {
  const method = await storage.getPaymentMethod(methodId);
  if (!method) return;

  const text = `💳 *${method.name}*\n\n${method.instructions}\n\n💵 *اختر المبلغ أو اكتب المبلغ المطلوب:*`;

  const buttons = [
    [
      { text: "10,000 IQD", callback_data: `amount_${methodId}_10000` },
      { text: "20,000 IQD", callback_data: `amount_${methodId}_20000` },
    ],
    [
      { text: "50,000 IQD", callback_data: `amount_${methodId}_50000` },
      { text: "100,000 IQD", callback_data: `amount_${methodId}_100000` },
    ],
    [{ text: "🔙 رجوع", callback_data: "deposit" }],
  ];

  setState(telegramId, { step: "custom_amount", methodId });

  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function promptScreenshot(chatId: number, telegramId: string, amount: number, methodId: number) {
  setState(telegramId, { step: "deposit_screenshot", amount, methodId });

  await bot.sendMessage(
    chatId,
    `✅ المبلغ: *${formatNumber(amount)} IQD*\n\nالآن أرسل *سكرين شوت* لعملية التحويل:`,
    { parse_mode: "Markdown" }
  );
}

async function showMyOrders(chatId: number, telegramId: string, messageId?: number) {
  const user = await storage.getUserByTelegramId(telegramId);
  if (!user) return;

  const userOrders = await storage.getOrdersByUser(user.id);
  if (userOrders.length === 0) {
    const text = "📦 لا توجد طلبات حالياً.";
    const keyboard = { inline_keyboard: [[{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]] };
    if (messageId) {
      return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: keyboard });
    }
    return bot.sendMessage(chatId, text, { reply_markup: keyboard });
  }

  const text = "📦 *هذه جميع الطلبات التي قمت بوضعها:*";
  const buttons = userOrders.slice(0, 20).map((o) => [
    { text: `طلب #${getOrderDisplayId(o)} - ${o.status}`, callback_data: `order_${o.id}` },
  ]);
  buttons.push([{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]);

  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showOrderDetail(chatId: number, orderId: number, messageId?: number) {
  const order = await storage.getOrder(orderId);
  if (!order) {
    const errText = "❌ الطلب غير موجود.";
    if (messageId) return bot.editMessageText(errText, { chat_id: chatId, message_id: messageId });
    return bot.sendMessage(chatId, errText);
  }

  const svc = await storage.getService(order.serviceId);

  let providerStatus = order.status;
  if (order.providerOrderId) {
    try {
      const statusResult = await smmApi.getOrderStatus(
        order.provider as "kd1s" | "amazing",
        order.providerOrderId
      );
      if (statusResult.status) {
        providerStatus = statusResult.status;
        if (providerStatus.toLowerCase() === "canceled" || providerStatus.toLowerCase() === "cancelled" || providerStatus.toLowerCase() === "refunded") {
          if (order.status !== "cancelled" && order.status !== "refunded") {
            await storage.updateOrderStatus(order.id, "cancelled");
            const refundDisplayId = getOrderDisplayId(order);
            const user = await storage.getUser(order.userId);
            if (user) {
              await storage.updateUserBalance(user.id, order.amount);
              await storage.createTransaction({
                userId: user.id,
                type: "refund",
                amount: order.amount,
                description: `استرجاع طلب #${refundDisplayId}`,
                relatedId: order.id,
              });

              await bot.sendMessage(
                parseInt(user.telegramId),
                `🔄 *تم إلغاء الطلب #${refundDisplayId}*\n\nتم إرجاع المبلغ ${formatNumber(order.amount)} IQD إلى رصيدك.`,
                { parse_mode: "Markdown" }
              );

              if (notificationGroupId) {
                await bot.sendMessage(
                  notificationGroupId,
                  `🔄 *تم إلغاء الطلب #${refundDisplayId}*\nالمستخدم: ${user.firstName || ""} (${user.telegramId})\nالمبلغ المسترجع: ${formatNumber(order.amount)} IQD`,
                  { parse_mode: "Markdown" }
                );
              }
            }
          }
        } else if (providerStatus.toLowerCase() === "completed") {
          await storage.updateOrderStatus(order.id, "completed");
        } else if (providerStatus.toLowerCase() === "in progress" || providerStatus.toLowerCase() === "processing") {
          await storage.updateOrderStatus(order.id, "in_progress");
        }
      }
    } catch (e) {
      console.error("Error checking order status:", e);
    }
  }

  const statusMap: Record<string, string> = {
    pending: "⏳ قيد الانتظار",
    processing: "🔄 جاري المعالجة",
    in_progress: "▶️ قيد التنفيذ",
    completed: "✅ مكتمل",
    partial: "⚠️ مكتمل جزئياً",
    cancelled: "❌ ملغي",
    refunded: "💰 مسترجع",
    "Pending": "⏳ قيد الانتظار",
    "In progress": "▶️ قيد التنفيذ",
    "Processing": "🔄 جاري المعالجة",
    "Completed": "✅ مكتمل",
    "Partial": "⚠️ مكتمل جزئياً",
    "Canceled": "❌ ملغي",
    "Cancelled": "❌ ملغي",
    "Refunded": "💰 مسترجع",
  };

  const displayId = getOrderDisplayId(order);
  const providerLine = order.provider === "custom" ? "🛠 خدمة خاصة" : `🌐 الموقع: ${order.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}`;
  const text = `📦 *تفاصيل الطلب #${displayId}*\n\n` +
    `📋 الخدمة: ${svc?.name || "غير معروف"}\n` +
    `${order.link !== "اشتراك" ? `🔗 الرابط: ${order.link}\n` : ""}` +
    `📊 الكمية: ${formatNumber(order.quantity)}\n` +
    `💵 المبلغ: ${formatNumber(order.amount)} IQD\n` +
    `${providerLine}\n` +
    `📌 الحالة: ${statusMap[providerStatus] || providerStatus}\n` +
    `📅 التاريخ: ${order.createdAt.toLocaleDateString("ar-IQ")}`;

  const keyboard = { inline_keyboard: [[{ text: "🔙 رجوع للطلبات", callback_data: "my_orders" }]] };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

// ===== ADMIN FUNCTIONS =====

async function showAdminPanel(chatId: number, messageId?: number) {
  const buttons = [
    [{ text: "📊 الإحصائيات", callback_data: "admin_stats" }],
    [{ text: "📂 إدارة الأقسام", callback_data: "admin_categories" }],
    [{ text: "➕ إضافة خدمة", callback_data: "admin_add_service" }],
    [{ text: "✏️ تعديل خدمة", callback_data: "admin_edit_services" }],
    [{ text: "💹 نسبة الأرباح", callback_data: "admin_margin" }],
    [{ text: "👑 الأدمنية", callback_data: "admin_admins" }],
    [{ text: "📢 الإذاعة", callback_data: "admin_broadcast" }],
    [{ text: "⚙️ إعدادات الكروبات", callback_data: "admin_groups" }],
    [{ text: "💳 طرق الدفع", callback_data: "admin_payments" }],
  ];

  const text = "🔐 *لوحة الإدارة*";
  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function showAdminStats(chatId: number, messageId?: number) {
  const userCount = await storage.getUserCount();
  const allStats = await storage.getOrderStats();
  const kd1sStats = await storage.getOrderStatsByProvider("kd1s");
  const amazingStats = await storage.getOrderStatsByProvider("amazing");
  const customSmmStats = await storage.getOrderStatsByCategoryType("smm");
  const subscriptionStats = await storage.getOrderStatsByCategoryType("subscriptions");

  const allUsers = await storage.getAllUsers();
  const totalBalance = allUsers.reduce((sum, u) => sum + parseFloat(u.balance), 0);
  const totalDeposits = allUsers.reduce((sum, u) => sum + parseFloat(u.totalDeposits), 0);

  const text = `📊 *إحصائيات البوت*\n\n` +
    `👥 عدد الأعضاء: ${userCount}\n` +
    `💰 مجموع الأرصدة: ${formatNumber(totalBalance)} IQD\n` +
    `💳 مجموع الإيداعات: ${formatNumber(totalDeposits)} IQD\n\n` +
    `📦 *الطلبات:*\n` +
    `إجمالي الطلبات: ${allStats.total}\n` +
    `إجمالي المبالغ: ${formatNumber(allStats.totalAmount)} IQD\n` +
    `إجمالي الأرباح: ${formatNumber(allStats.totalProfit)} IQD\n\n` +
    `🌐 *kd1s.com:*\n` +
    `الطلبات: ${kd1sStats.total}\n` +
    `المبالغ: ${formatNumber(kd1sStats.totalAmount)} IQD\n` +
    `الأرباح: ${formatNumber(kd1sStats.totalProfit)} IQD\n\n` +
    `🌐 *amazingsmm.com:*\n` +
    `الطلبات: ${amazingStats.total}\n` +
    `المبالغ: ${formatNumber(amazingStats.totalAmount)} IQD\n` +
    `الأرباح: ${formatNumber(amazingStats.totalProfit)} IQD\n\n` +
    `🛠 *خدمات خاصة (سوشل ميديا):*\n` +
    `الطلبات: ${customSmmStats.total}\n` +
    `المبالغ: ${formatNumber(customSmmStats.totalAmount)} IQD\n` +
    `الأرباح: ${formatNumber(customSmmStats.totalProfit)} IQD\n\n` +
    `📺 *طلبات الاشتراكات:*\n` +
    `الطلبات: ${subscriptionStats.total}\n` +
    `المبالغ: ${formatNumber(subscriptionStats.totalAmount)} IQD\n` +
    `الأرباح: ${formatNumber(subscriptionStats.totalProfit)} IQD`;

  const keyboard = { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]] };
  if (messageId) {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showAdminCategories(chatId: number, messageId?: number) {
  const cats = await storage.getCategories();

  const smmCats = cats.filter(c => c.type === "smm");
  const subCats = cats.filter(c => c.type === "subscriptions");

  let text = "📂 *إدارة الأقسام*\n\n";

  if (smmCats.length > 0) {
    text += "📱 *سوشل ميديا:*\n";
    smmCats.forEach((c, i) => {
      text += `${i + 1}. ${c.name} ${c.isActive ? "✅" : "❌"}\n`;
    });
    text += "\n";
  }

  if (subCats.length > 0) {
    text += "📺 *اشتراكات:*\n";
    subCats.forEach((c, i) => {
      text += `${i + 1}. ${c.name} ${c.isActive ? "✅" : "❌"}\n`;
    });
    text += "\n";
  }

  if (cats.length === 0) {
    text += "لا توجد أقسام حالياً.\n\n";
  }

  text += "لإضافة قسم جديد اختر النوع:";

  const buttons = cats.map((c) => [
    { text: `${c.isActive ? "❌ تعطيل" : "✅ تفعيل"} ${c.name}`, callback_data: `toggle_cat_${c.id}` },
  ]);
  buttons.push([
    { text: "📱 إضافة قسم سوشل ميديا", callback_data: "add_cat_smm" },
  ]);
  buttons.push([
    { text: "📺 إضافة قسم اشتراكات", callback_data: "add_cat_subscriptions" },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

  const keyboard = { inline_keyboard: buttons };
  if (messageId) {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showAdminEditServices(chatId: number, messageId?: number) {
  const cats = await storage.getCategories();
  const activeCats = cats.filter(c => c.isActive);

  if (activeCats.length === 0) {
    const text = "✏️ *تعديل الخدمات*\n\nلا توجد أقسام حالياً.";
    const keyboard = { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]] };
    if (messageId) {
      return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: keyboard });
    }
    return bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }

  const smmCats = activeCats.filter(c => c.type === "smm");
  const subCats = activeCats.filter(c => c.type === "subscriptions");

  let text = "✏️ *تعديل الخدمات*\n\nاختر القسم لتعديل خدماته:";

  const buttons: any[][] = [];
  if (smmCats.length > 0) {
    smmCats.forEach(c => {
      buttons.push([{ text: `📱 ${c.name}`, callback_data: `editcat_${c.slug}` }]);
    });
  }
  if (subCats.length > 0) {
    subCats.forEach(c => {
      buttons.push([{ text: `📺 ${c.name}`, callback_data: `editcat_${c.slug}` }]);
    });
  }
  buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

  const keyboard = { inline_keyboard: buttons };
  if (messageId) {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showAdminAddService(chatId: number, telegramId: string, messageId?: number) {
  setState(telegramId, { step: "admin_select_provider" });

  const addText = "➕ *إضافة خدمة جديدة*\n\nاختر نوع الخدمة:";
  const addKeyboard = {
    inline_keyboard: [
      [
        { text: "kd1s.com", callback_data: "provider_kd1s" },
        { text: "amazingsmm.com", callback_data: "provider_amazing" },
      ],
      [{ text: "🛠 خدمة خاصة (يدوية)", callback_data: "provider_custom" }],
      [{ text: "📺 اضافة اشتراك", callback_data: "provider_subscription" }],
      [{ text: "🔙 رجوع", callback_data: "admin_panel" }],
    ],
  };

  if (messageId) {
    await bot.editMessageText(addText, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: addKeyboard });
  } else {
    await bot.sendMessage(chatId, addText, { parse_mode: "Markdown", reply_markup: addKeyboard });
  }
}

async function showAdminMargin(chatId: number, messageId?: number) {
  const margin = await getProfitMargin();

  const marginText = `💹 *نسبة الأرباح الحالية: ${margin}%*\n\nأرسل النسبة الجديدة (رقم فقط):`;
  const marginKeyboard = { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]] };

  if (messageId) {
    await bot.editMessageText(marginText, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: marginKeyboard });
  } else {
    await bot.sendMessage(chatId, marginText, { parse_mode: "Markdown", reply_markup: marginKeyboard });
  }

  setState(chatId.toString(), { step: "admin_set_margin" });
}

async function showAdminAdmins(chatId: number, messageId?: number) {
  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => u.isAdmin);

  let text = "👑 *قائمة الأدمنية:*\n\n";
  admins.forEach((a, i) => {
    text += `${i + 1}. ${a.firstName || ""} ${a.lastName || ""} (${a.telegramId})${a.telegramId === CREATOR_ID ? " 👑 المنشئ" : ""}\n`;
  });

  text += "\nلإضافة أدمن أرسل الآيدي مالته:";

  setState(chatId.toString(), { step: "admin_add_admin" });

  const removableAdmins = admins.filter((a) => a.telegramId !== CREATOR_ID);
  const buttons = removableAdmins.map((a) => [
    { text: `❌ إزالة ${a.firstName || a.telegramId}`, callback_data: `remove_admin_${a.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

  const keyboard = { inline_keyboard: buttons };
  if (messageId) {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function showEditCategory(chatId: number, slug: string, telegramId: string) {
  const cat = await storage.getCategoryBySlug(slug);
  if (!cat) {
    return bot.sendMessage(chatId, "❌ القسم غير موجود.");
  }

  const svcs = await storage.getServicesByCategory(cat.id);

  if (svcs.length === 0) {
    return bot.sendMessage(chatId, `📂 *${cat.name}*\n\nلا توجد خدمات في هذا القسم.`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]],
      },
    });
  }

  let text = `📂 *خدمات ${cat.name}:*\n\n`;
  for (const svc of svcs) {
    text += `🔹 *${svc.name}*\n`;
    if (svc.description) text += `   📝 ${svc.description}\n`;
    if (svc.serviceType === "custom") {
      text += `   🛠 خدمة خاصة\n`;
      text += `   💵 السعر: ${formatNumber(svc.price || 0)} IQD\n`;
    } else {
      text += `   🌐 ${svc.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n`;
      text += `   🆔 آيدي الخدمة: ${svc.providerServiceId}\n`;
    }
    text += `   📦 عدد الطلبات: ${svc.totalOrders}\n`;
    text += `   💰 الأرباح: ${formatNumber(svc.totalProfit)} IQD\n\n`;
  }

  const buttons = svcs.map((s) => [
    { text: `✏️ تعديل ${s.name}`, callback_data: `edit_svc_${s.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function sendToUser(
  userId: string,
  broadcastData: { text?: string; imageUrl?: string; buttonText?: string; buttonUrl?: string },
  inlineKeyboard: any,
  retries = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (broadcastData.imageUrl) {
        await bot.sendPhoto(userId, broadcastData.imageUrl, {
          caption: broadcastData.text || "",
          ...inlineKeyboard,
        });
      } else if (broadcastData.text) {
        await bot.sendMessage(userId, broadcastData.text, {
          ...inlineKeyboard,
        });
      }
      return true;
    } catch (e: any) {
      const errMsg = e?.response?.body?.description || e?.message || "";
      if (errMsg.includes("Too Many Requests") || errMsg.includes("429")) {
        const retryAfter = e?.response?.body?.parameters?.retry_after || 5;
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (errMsg.includes("bot was blocked") || errMsg.includes("user is deactivated") ||
          errMsg.includes("chat not found") || errMsg.includes("PEER_ID_INVALID")) {
        return false;
      }
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return false;
    }
  }
  return false;
}

async function sendBroadcast(
  chatId: number,
  telegramId: string,
  broadcastData: { text?: string; imageUrl?: string; buttonText?: string; buttonUrl?: string }
) {
  const users = await storage.getAllUsers();
  const totalUsers = users.length;

  const statusMsg = await bot.sendMessage(chatId,
    `📢 *جاري الإرسال...*\n\n` +
    `👥 إجمالي المستخدمين: ${totalUsers}\n` +
    `✅ تم الإرسال: 0\n` +
    `❌ فشل: 0`,
    { parse_mode: "Markdown" }
  );

  const inlineKeyboard = broadcastData.buttonText && broadcastData.buttonUrl
    ? { reply_markup: { inline_keyboard: [[{ text: broadcastData.buttonText, url: broadcastData.buttonUrl }]] } }
    : {};

  let sent = 0;
  let failed = 0;
  const BATCH_SIZE = 25;
  const DELAY_BETWEEN_MESSAGES = 35;
  const DELAY_BETWEEN_BATCHES = 1000;

  for (let i = 0; i < users.length; i++) {
    const success = await sendToUser(users[i].telegramId, broadcastData, inlineKeyboard);
    if (success) {
      sent++;
    } else {
      failed++;
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
      try {
        await bot.editMessageText(
          `📢 *جاري الإرسال...*\n\n` +
          `👥 إجمالي المستخدمين: ${totalUsers}\n` +
          `✅ تم الإرسال: ${sent}\n` +
          `❌ فشل: ${failed}\n` +
          `📊 التقدم: ${i + 1}/${totalUsers}`,
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
        );
      } catch {}
    } else {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MESSAGES));
    }
  }

  try {
    await bot.editMessageText(
      `📢 *تم الانتهاء من الإذاعة!*\n\n` +
      `👥 إجمالي المستخدمين: ${totalUsers}\n` +
      `✅ تم الإرسال: ${sent}\n` +
      `❌ فشل: ${failed}`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔙 لوحة الإدارة", callback_data: "admin_panel" }]] },
      }
    );
  } catch {}

  clearState(telegramId);
}

export function getBot(): TelegramBot {
  return bot;
}

export function initBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set!");
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  bot = new TelegramBot(token, { polling: true });
  console.log("Telegram bot started with polling...");

  bot.on("polling_error", (error) => {
    console.error("Polling error:", error.message);
  });

  // Load bot user ID and group IDs from settings
  (async () => {
    try {
      const me = await bot.getMe();
      botUserId = me.id;
    } catch (e) {
      console.error("Failed to get bot info:", e);
    }
    notificationGroupId = (await storage.getSetting("notification_group_id")) || null;
    depositGroupId = (await storage.getSetting("deposit_group_id")) || null;
    subscriptionGroupId = (await storage.getSetting("subscription_group_id")) || null;
  })();

  // /start command
  bot.onText(/\/start/, async (msg) => {
    await ensureUser(msg);
    await sendMainMenu(msg.chat.id);
  });

  // /admin command
  bot.onText(/\/admin/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) {
      return bot.sendMessage(msg.chat.id, "❌ ليس لديك صلاحية الوصول.");
    }
    await showAdminPanel(msg.chat.id);
  });

  // Edit category commands
  bot.onText(/\/editinsta/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;
    await showEditCategory(msg.chat.id, "instagram", telegramId);
  });

  bot.onText(/\/edityoutube/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;
    await showEditCategory(msg.chat.id, "youtube", telegramId);
  });

  bot.onText(/\/editfacebook/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;
    await showEditCategory(msg.chat.id, "facebook", telegramId);
  });

  bot.onText(/\/edittiktok/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;
    await showEditCategory(msg.chat.id, "tiktok", telegramId);
  });

  bot.onText(/\/edittwitter/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;
    await showEditCategory(msg.chat.id, "twitter", telegramId);
  });

  bot.onText(/\/edittelegram/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;
    await showEditCategory(msg.chat.id, "telegram", telegramId);
  });

  // Callback query handler
  bot.on("callback_query", async (query) => {
    const chatId = query.message!.chat.id;
    const messageId = query.message!.message_id;
    const telegramId = query.from.id.toString();
    const data = query.data || "";

    try { await bot.answerCallbackQuery(query.id); } catch {}

    try {
      // Main menu
      if (data === "main_menu") {
        clearState(telegramId);
        return sendMainMenu(chatId, messageId);
      }

      if (data === "confirm_order") {
        const oState = getState(telegramId);
        if (!oState || oState.step !== "order_confirm") return;

        try {
          const user = await storage.getUserByTelegramId(telegramId);
          if (!user) return;

          if (parseFloat(user.balance) < oState.price) {
            clearState(telegramId);
            return bot.editMessageText("❌ رصيدك غير كافٍ. يرجى شحن حسابك أولاً.", {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: {
                inline_keyboard: [
                  [{ text: "💰 شحن حسابك", callback_data: "deposit" }],
                  [{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }],
                ],
              },
            });
          }

          const svc = await storage.getService(oState.serviceId);
          if (!svc) return;

          await bot.editMessageText("⏳ جاري معالجة الطلب...", { chat_id: chatId, message_id: messageId });

          let providerOrderId: string | null = null;
          let orderStatus = "pending";

          if (svc.serviceType === "custom") {
            orderStatus = "pending";
          } else {
            const result = await smmApi.placeOrder(
              svc.provider as "kd1s" | "amazing",
              svc.providerServiceId!,
              oState.link,
              oState.quantity
            );

            if (result.error) {
              clearState(telegramId);
              return bot.sendMessage(chatId, `❌ خطأ في الطلب: ${result.error}`);
            }
            providerOrderId = result.order || null;
          }

          const profit = oState.price - oState.cost;

          await storage.updateUserBalance(user.id, (-oState.price).toString());
          await storage.updateUserStats(user.id, oState.price.toString());

          const order = await storage.createOrder({
            userId: user.id,
            serviceId: svc.id,
            providerOrderId,
            provider: svc.provider || "custom",
            link: oState.link,
            quantity: oState.quantity,
            amount: oState.price.toString(),
            cost: oState.cost.toString(),
            profit: profit.toString(),
            status: orderStatus,
          });

          const displayId = getOrderDisplayId(order);

          await storage.createTransaction({
            userId: user.id,
            type: "order",
            amount: (-oState.price).toString(),
            description: `طلب #${displayId} - ${svc.name}`,
            relatedId: order.id,
          });

          await storage.incrementServiceStats(svc.id, oState.price.toString(), profit.toString());

          await bot.sendMessage(
            chatId,
            `✅ *تم الطلب بنجاح!*\n\n` +
            `📦 رقم الطلب: #${displayId}\n` +
            `📋 الخدمة: ${svc.name}\n` +
            `📊 الكمية: ${formatNumber(oState.quantity)}\n` +
            `💵 المبلغ: ${formatNumber(oState.price)} IQD\n` +
            `💰 رصيدك المتبقي: ${formatNumber(parseFloat(user.balance) - oState.price)} IQD`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]],
              },
            }
          );

          if (notificationGroupId) {
            const providerLabel = svc.serviceType === "custom" ? "خدمة خاصة" : (svc.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com");
            await bot.sendMessage(
              notificationGroupId,
              `📦 طلب جديد #${displayId}\n\n` +
              `👤 الاسم: ${user.firstName || ""} ${user.lastName || ""}\n` +
              `🆔 الآيدي: ${user.telegramId}\n` +
              `📱 اليوزر: ${user.username ? "@" + user.username : "غير محدد"}\n` +
              `📋 الخدمة: ${svc.name}\n` +
              `📊 الكمية: ${formatNumber(oState.quantity)}\n` +
              `🔗 الرابط: ${oState.link}\n` +
              `💵 المبلغ: ${formatNumber(oState.price)} IQD\n` +
              `🌐 النوع: ${providerLabel}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: `👤 ${user.firstName || user.telegramId}`, url: `tg://user?id=${user.telegramId}` }],
                  ],
                },
              }
            );
          }

          clearState(telegramId);
        } catch (orderError) {
          console.error("Order error:", orderError);
          await bot.sendMessage(chatId, "❌ حدث خطأ أثناء معالجة الطلب.");
          clearState(telegramId);
        }
        return;
      }

      // Subscription order - direct order with button click
      if (data.startsWith("order_subscription_")) {
        const serviceId = parseInt(data.split("_")[2]);
        const svc = await storage.getService(serviceId);
        if (!svc) return;

        const user = await storage.getUserByTelegramId(telegramId);
        if (!user) return;

        const svcPrice = parseFloat(svc.price || "0");

        if (parseFloat(user.balance) < svcPrice) {
          return bot.editMessageText("❌ رصيدك غير كافٍ. يرجى شحن حسابك أولاً.", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [
                [{ text: "💰 شحن حسابك", callback_data: "deposit" }],
                [{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }],
              ],
            },
          });
        }

        // Remove buttons immediately to prevent double-click
        await bot.editMessageText("⏳ جاري معالجة الطلب...", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });

        await storage.updateUserBalance(user.id, (-svcPrice).toString());
        await storage.updateUserStats(user.id, svcPrice.toString());

        const order = await storage.createOrder({
          userId: user.id,
          serviceId: svc.id,
          providerOrderId: null,
          provider: "custom",
          link: "اشتراك",
          quantity: 1,
          amount: svcPrice.toString(),
          cost: "0",
          profit: svcPrice.toString(),
          status: "pending",
        });

        const displayId = getOrderDisplayId(order);

        await storage.createTransaction({
          userId: user.id,
          type: "order",
          amount: (-svcPrice).toString(),
          description: `طلب اشتراك #${displayId} - ${svc.name}`,
          relatedId: order.id,
        });

        await storage.incrementServiceStats(svc.id, svcPrice.toString(), svcPrice.toString());

        await bot.sendMessage(
          chatId,
          `✅ *تم الطلب بنجاح!*\n\n` +
          `📦 رقم الطلب: #${displayId}\n` +
          `📋 الخدمة: ${svc.name}\n` +
          `💵 المبلغ: ${formatNumber(svcPrice)} IQD\n` +
          `💰 رصيدك المتبقي: ${formatNumber(parseFloat(user.balance) - svcPrice)} IQD\n\n` +
          `سيتم تنفيذ طلبك قريباً.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]],
            },
          }
        );

        // Send to subscription group
        const targetGroup = subscriptionGroupId || notificationGroupId;
        if (targetGroup) {
          await bot.sendMessage(
            targetGroup,
            `📦 طلب اشتراك جديد #${displayId}\n\n` +
            `👤 الاسم: ${user.firstName || ""} ${user.lastName || ""}\n` +
            `🆔 الآيدي: ${user.telegramId}\n` +
            `📱 اليوزر: ${user.username ? "@" + user.username : "غير محدد"}\n` +
            `📋 الخدمة: ${svc.name}\n` +
            `${svc.description ? `📝 الوصف: ${svc.description}\n` : ""}` +
            `💵 المبلغ: ${formatNumber(svcPrice)} IQD`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: `👤 ${user.firstName || user.telegramId}`, url: `tg://user?id=${user.telegramId}` }],
                ],
              },
            }
          );
        }
        return;
      }

      if (data === "services") {
        clearState(telegramId);
        return showServices(chatId, messageId);
      }

      if (data === "service_type_smm") {
        clearState(telegramId);
        return showServiceTypeCategories(chatId, "smm", messageId);
      }

      if (data === "service_type_subscriptions") {
        clearState(telegramId);
        return showServiceTypeCategories(chatId, "subscriptions", messageId);
      }

      if (data === "account_info") {
        clearState(telegramId);
        return showAccountInfo(chatId, telegramId, messageId);
      }

      if (data === "deposit") {
        clearState(telegramId);
        return showDepositOptions(chatId, messageId);
      }

      if (data === "my_orders") {
        clearState(telegramId);
        return showMyOrders(chatId, telegramId, messageId);
      }

      // Category services
      if (data.startsWith("cat_")) {
        const catId = parseInt(data.split("_")[1]);
        return showCategoryServices(chatId, catId, messageId);
      }

      // Service detail
      if (data.startsWith("svc_")) {
        const svcId = parseInt(data.split("_")[1]);
        return showServiceDetail(chatId, svcId, telegramId, messageId);
      }

      // Order detail
      if (data.startsWith("order_")) {
        const orderId = parseInt(data.split("_")[1]);
        return showOrderDetail(chatId, orderId, messageId);
      }

      // Payment method
      if (data.startsWith("pay_")) {
        const methodId = parseInt(data.split("_")[1]);
        return showPaymentMethod(chatId, methodId, telegramId, messageId);
      }

      // Amount selection
      if (data.startsWith("amount_")) {
        const parts = data.split("_");
        const methodId = parseInt(parts[1]);
        const amount = parseInt(parts[2]);
        return promptScreenshot(chatId, telegramId, amount, methodId);
      }

      // Transfer money
      if (data === "transfer_money") {
        setState(telegramId, { step: "transfer_amount" });
        return bot.editMessageText("💸 *تحويل أموال*\n\nأرسل المبلغ المراد تحويله:", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
        });
      }

      // Transfer confirmation
      if (data === "confirm_transfer") {
        const state = getState(telegramId);
        if (!state || state.step !== "transfer_confirm") return;

        const sender = await storage.getUserByTelegramId(telegramId);
        const receiver = await storage.getUserByTelegramId(state.targetId);
        if (!sender || !receiver) return;

        if (parseFloat(sender.balance) < state.amount) {
          clearState(telegramId);
          return bot.editMessageText("❌ رصيدك غير كافٍ.", { chat_id: chatId, message_id: messageId });
        }

        await storage.updateUserBalance(sender.id, (-state.amount).toString());
        await storage.updateUserBalance(receiver.id, state.amount.toString());

        await storage.createTransaction({
          userId: sender.id,
          type: "transfer_out",
          amount: (-state.amount).toString(),
          description: `تحويل إلى ${receiver.firstName || receiver.telegramId}`,
        });

        await storage.createTransaction({
          userId: receiver.id,
          type: "transfer_in",
          amount: state.amount.toString(),
          description: `تحويل من ${sender.firstName || sender.telegramId}`,
        });

        await bot.editMessageText(`✅ تم تحويل ${formatNumber(state.amount)} IQD بنجاح!`, { chat_id: chatId, message_id: messageId });
        await bot.sendMessage(
          parseInt(receiver.telegramId),
          `💰 تم استلام ${formatNumber(state.amount)} IQD من ${sender.firstName || sender.telegramId}!`
        );

        clearState(telegramId);
        return;
      }

      if (data === "cancel_transfer") {
        clearState(telegramId);
        return bot.editMessageText("❌ تم إلغاء عملية التحويل.", { chat_id: chatId, message_id: messageId });
      }

      // ===== ADMIN CALLBACKS =====
      if (!(await isAdmin(telegramId))) return;

      if (data === "admin_panel") {
        clearState(telegramId);
        return showAdminPanel(chatId, messageId);
      }

      if (data === "admin_stats") return showAdminStats(chatId, messageId);
      if (data === "admin_categories") return showAdminCategories(chatId, messageId);
      if (data === "admin_add_service") return showAdminAddService(chatId, telegramId, messageId);
      if (data === "admin_edit_services") return showAdminEditServices(chatId, messageId);
      if (data === "admin_margin") return showAdminMargin(chatId, messageId);
      if (data === "admin_admins") return showAdminAdmins(chatId, messageId);

      if (data === "admin_broadcast") {
        const userCount = await storage.getUserCount();
        const text = `📢 *الإذاعة*\n\n` +
          `👥 عدد المستخدمين: ${userCount}\n\n` +
          `اختر نوع الإذاعة:`;
        return bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📝 نص فقط", callback_data: "broadcast_text" }],
              [{ text: "🖼 صورة + نص", callback_data: "broadcast_image" }],
              [{ text: "🔗 صورة + نص + زر", callback_data: "broadcast_image_button" }],
              [{ text: "🔙 رجوع", callback_data: "admin_panel" }],
            ],
          },
        });
      }

      if (data === "broadcast_text") {
        setState(telegramId, { step: "broadcast_text" });
        return bot.editMessageText("📝 أرسل نص الإذاعة:", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_broadcast" }]],
          },
        });
      }

      if (data === "broadcast_image") {
        setState(telegramId, { step: "broadcast_image_url", broadcastType: "image" });
        return bot.editMessageText("🖼 أرسل رابط الصورة:", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_broadcast" }]],
          },
        });
      }

      if (data === "broadcast_image_button") {
        setState(telegramId, { step: "broadcast_image_url", broadcastType: "image_button" });
        return bot.editMessageText("🖼 أرسل رابط الصورة:", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_broadcast" }]],
          },
        });
      }

      if (data === "broadcast_confirm") {
        const state = getState(telegramId);
        if (!state || !state.broadcastData) return;
        await sendBroadcast(chatId, telegramId, state.broadcastData);
        return;
      }

      if (data === "broadcast_cancel") {
        clearState(telegramId);
        return showAdminPanel(chatId, messageId);
      }

      if (data === "admin_groups") {
        const groupText = `⚙️ *إعدادات الكروبات*\n\n` +
          `كروب الإشعارات: ${notificationGroupId || "غير محدد"}\n` +
          `كروب الإيداعات: ${depositGroupId || "غير محدد"}\n` +
          `كروب الاشتراكات: ${subscriptionGroupId || "غير محدد"}\n\n` +
          `لتحديد كروب الإشعارات، أضف البوت للكروب ثم أرسل:\n` +
          `/setnotifygroup\n\n` +
          `لتحديد كروب الإيداعات أرسل:\n` +
          `/setdepositgroup\n\n` +
          `لتحديد كروب الاشتراكات أرسل:\n` +
          `/setsubscriptiongroup`;
        return bot.editMessageText(groupText, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]],
          },
        });
      }

      if (data === "admin_payments") {
        const methods = await storage.getPaymentMethods();
        let text = "💳 *طرق الدفع:*\n\n";
        methods.forEach((m, i) => {
          text += `${i + 1}. ${m.name} ${m.isActive ? "✅" : "❌"}\n`;
        });
        text += "\nلإضافة طريقة جديدة أرسل: اسم\\_الطريقة|التعليمات";
        setState(telegramId, { step: "admin_add_payment" });

        const buttons = methods.map((m) => [
          { text: `${m.isActive ? "❌ تعطيل" : "✅ تفعيل"} ${m.name}`, callback_data: `toggle_pay_${m.id}` },
        ]);
        buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

        return bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      }

      // Add category by type
      if (data === "add_cat_smm" || data === "add_cat_subscriptions") {
        const catType = data === "add_cat_smm" ? "smm" : "subscriptions";
        setState(telegramId, { step: "admin_add_category", categoryType: catType });
        const typeLabel = catType === "smm" ? "سوشل ميديا" : "اشتراكات";
        return bot.editMessageText(`📂 أرسل اسم القسم الجديد (${typeLabel}):`, { chat_id: chatId, message_id: messageId });
      }

      // Toggle category
      if (data.startsWith("toggle_cat_")) {
        const catId = parseInt(data.split("_")[2]);
        const cat = await storage.getCategory(catId);
        if (cat) {
          await storage.updateCategory(catId, { isActive: !cat.isActive });
          await bot.editMessageText(`✅ تم ${cat.isActive ? "تعطيل" : "تفعيل"} القسم "${cat.name}"`, { chat_id: chatId, message_id: messageId });
          return showAdminCategories(chatId);
        }
      }

      // Toggle payment method
      if (data.startsWith("toggle_pay_")) {
        const payId = parseInt(data.split("_")[2]);
        const method = await storage.getPaymentMethod(payId);
        if (method) {
          await storage.updatePaymentMethod(payId, { isActive: !method.isActive });
          await bot.editMessageText(`✅ تم ${method.isActive ? "تعطيل" : "تفعيل"} "${method.name}"`, { chat_id: chatId, message_id: messageId });
        }
      }

      // Provider selection for adding service
      if (data === "provider_kd1s" || data === "provider_amazing") {
        const provider = data === "provider_kd1s" ? "kd1s" : "amazing";
        setState(telegramId, { step: "admin_service_id", provider });
        return bot.editMessageText(`✅ تم اختيار ${provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n\nأرسل آيدي الخدمة:`, { chat_id: chatId, message_id: messageId });
      }

      // Custom service flow (SMM only)
      if (data === "provider_custom") {
        const cats = await storage.getCategories();
        const smmCats = cats.filter(c => c.type === "smm");
        const buttons = smmCats.map(c => [
          { text: `📱 ${c.name}`, callback_data: `custom_cat_${c.id}` },
        ]);
        buttons.push([{ text: "🔙 رجوع", callback_data: "admin_add_service" }]);
        return bot.editMessageText("🛠 *إضافة خدمة خاصة*\n\nاختر القسم:", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      }

      // Subscription service flow
      if (data === "provider_subscription") {
        const cats = await storage.getCategories();
        const subCats = cats.filter(c => c.type === "subscriptions");
        if (subCats.length === 0) {
          return bot.editMessageText("❌ لا توجد أقسام اشتراكات. أضف قسم اشتراكات أولاً من إدارة الأقسام.", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_add_service" }]] },
          });
        }
        const buttons = subCats.map(c => [
          { text: `📺 ${c.name}`, callback_data: `sub_cat_${c.id}` },
        ]);
        buttons.push([{ text: "🔙 رجوع", callback_data: "admin_add_service" }]);
        return bot.editMessageText("📺 *إضافة اشتراك*\n\nاختر القسم:", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      }

      // Subscription category selected - ask for service name
      if (data.startsWith("sub_cat_")) {
        const catId = parseInt(data.split("_")[2]);
        setState(telegramId, { step: "sub_service_name", categoryId: catId });
        return bot.editMessageText("📝 أرسل اسم الاشتراك:", { chat_id: chatId, message_id: messageId });
      }

      if (data.startsWith("custom_cat_")) {
        const catId = parseInt(data.split("_")[2]);
        setState(telegramId, { step: "custom_service_name", categoryId: catId });
        return bot.editMessageText("📝 أرسل اسم الخدمة:", { chat_id: chatId, message_id: messageId });
      }

      // Remove admin
      if (data.startsWith("remove_admin_")) {
        const userId = parseInt(data.split("_")[2]);
        const user = await storage.getUser(userId);
        if (user && user.telegramId !== CREATOR_ID) {
          await storage.updateUserBalance(user.id, "0");
          const { db: database } = await import("./db");
          const { users: usersTable } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          await database.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, userId));
          await bot.editMessageText(`✅ تم إزالة الأدمن ${user.firstName || user.telegramId}`, { chat_id: chatId, message_id: messageId });
          return showAdminAdmins(chatId);
        }
      }

      // Edit category services (from admin edit services menu)
      if (data.startsWith("editcat_")) {
        const slug = data.replace("editcat_", "");
        await showEditCategory(chatId, slug, telegramId);
        return;
      }

      // Edit service
      if (data.startsWith("edit_svc_")) {
        const svcId = parseInt(data.split("_")[2]);
        const svc = await storage.getService(svcId);
        if (svc) {
          setState(telegramId, { step: "admin_edit_service", serviceId: svcId });
          return bot.editMessageText(
            `✏️ *تعديل الخدمة: ${svc.name}*\n\n` +
            `أرسل الاسم الجديد أو /skip لتخطي:`,
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
          );
        }
      }

      // Deposit approval
      if (data.startsWith("approve_deposit_")) {
        const depositId = parseInt(data.split("_")[2]);
        const deposit = await storage.getDeposit(depositId);
        if (!deposit || deposit.status !== "pending") {
          try {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ تم معالجة هذا الإيداع مسبقاً", show_alert: true });
          } catch {}
          return;
        }
        await storage.updateDepositStatus(depositId, "approved", (await storage.getUserByTelegramId(telegramId))?.id);
        await storage.addDeposit(deposit.userId, deposit.amount);
        await storage.createTransaction({
          userId: deposit.userId,
          type: "deposit",
          amount: deposit.amount,
          description: `إيداع ${deposit.method}`,
          relatedId: deposit.id,
        });

        const user = await storage.getUser(deposit.userId);
        if (user) {
          await bot.sendMessage(
            parseInt(user.telegramId),
            `✅ *تم تأكيد الإيداع*\n\nتم إضافة ${formatNumber(deposit.amount)} IQD إلى رصيدك.\nرصيدك الحالي: ${formatNumber(parseFloat(user.balance) + parseFloat(deposit.amount))} IQD`,
            { parse_mode: "Markdown" }
          );
        }

        const adminUsername = query.from.username ? "@" + query.from.username : query.from.first_name;
        const depositUser = user || await storage.getUser(deposit.userId);
        const confirmedCaption =
          `💰 تم تأكيد إيداع جديد #${depositId}\n\n` +
          `👤 الاسم: ${depositUser?.firstName || ""} ${depositUser?.lastName || ""}\n` +
          `🆔 الآيدي: ${depositUser?.telegramId || ""}\n` +
          `📱 اليوزر: ${depositUser?.username ? "@" + depositUser.username : "غير محدد"}\n` +
          `💵 المبلغ: ${formatNumber(deposit.amount)} IQD\n` +
          `💳 الطريقة: ${deposit.method}\n\n` +
          `✅ تم التأكيد من قبل: ${adminUsername}`;

        try {
          await bot.editMessageCaption(confirmedCaption, {
            chat_id: chatId,
            message_id: messageId,
          });
        } catch {
          try {
            await bot.editMessageText(confirmedCaption, {
              chat_id: chatId,
              message_id: messageId,
            });
          } catch {}
        }
      }

      if (data.startsWith("reject_deposit_")) {
        const depositId = parseInt(data.split("_")[2]);
        const deposit = await storage.getDeposit(depositId);
        if (!deposit || deposit.status !== "pending") {
          try {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ تم معالجة هذا الإيداع مسبقاً", show_alert: true });
          } catch {}
          return;
        }
        await storage.updateDepositStatus(depositId, "rejected");
        const user = await storage.getUser(deposit.userId);
        if (user) {
          await bot.sendMessage(
            parseInt(user.telegramId),
            `❌ *تم رفض عملية الإيداع*\n\nيرجى مراسلة الأدمن ${ADMIN_USERNAME}`,
            { parse_mode: "Markdown" }
          );
        }

        const adminUsername = query.from.username ? "@" + query.from.username : query.from.first_name;
        const depositUser = user || await storage.getUser(deposit.userId);
        const rejectedCaption =
          `💰 تم رفض إيداع #${depositId}\n\n` +
          `👤 الاسم: ${depositUser?.firstName || ""} ${depositUser?.lastName || ""}\n` +
          `🆔 الآيدي: ${depositUser?.telegramId || ""}\n` +
          `📱 اليوزر: ${depositUser?.username ? "@" + depositUser.username : "غير محدد"}\n` +
          `💵 المبلغ: ${formatNumber(deposit.amount)} IQD\n` +
          `💳 الطريقة: ${deposit.method}\n\n` +
          `❌ تم الرفض من قبل: ${adminUsername}`;

        try {
          await bot.editMessageCaption(rejectedCaption, {
            chat_id: chatId,
            message_id: messageId,
          });
        } catch {
          try {
            await bot.editMessageText(rejectedCaption, {
              chat_id: chatId,
              message_id: messageId,
            });
          } catch {}
        }
      }

      // Select category for new service
      if (data.startsWith("assign_cat_")) {
        const state = getState(telegramId);
        if (!state || state.step !== "admin_select_category") return;

        const catId = parseInt(data.split("_")[2]);
        const serviceInfo = state.serviceInfo;
        const provider = state.provider;
        const margin = await getProfitMargin();

        const newService = await storage.createService({
          categoryId: catId,
          name: serviceInfo.name,
          description: `${serviceInfo.type} - الحد: ${serviceInfo.min} - ${serviceInfo.max}`,
          serviceType: "provider",
          provider,
          providerServiceId: serviceInfo.service,
          price: null,
          rate: serviceInfo.rate,
          minQuantity: parseInt(serviceInfo.min),
          maxQuantity: parseInt(serviceInfo.max),
          isActive: true,
          totalOrders: 0,
          totalRevenue: "0",
          totalProfit: "0",
        });

        clearState(telegramId);
        return bot.editMessageText(
          `✅ *تمت إضافة الخدمة بنجاح!*\n\n` +
          `📋 ${serviceInfo.name}\n` +
          `🌐 ${provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n` +
          `🆔 ${serviceInfo.service}\n` +
          `💵 السعر: ${serviceInfo.rate} (+ ${margin}% ربح)`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🔙 لوحة الإدارة", callback_data: "admin_panel" }]],
            },
          }
        );
      }
    } catch (error) {
      console.error("Callback error:", error);
    }
  });

  // Message handler for text input states
  bot.on("message", async (msg) => {
    if (!msg.text && !msg.photo) return;
    if (msg.text?.startsWith("/")) return; // Skip commands

    const chatId = msg.chat.id;
    const telegramId = msg.from!.id.toString();
    const state = getState(telegramId);

    if (!state) return;

    try {
      // Order flow - link
      if (state.step === "order_link" && msg.text) {
        const svc = await storage.getService(state.serviceId);
        if (!svc) return;

        if (state.isCustom) {
          const svcPrice = parseFloat(svc.price || "0");
          setState(telegramId, { ...state, step: "order_confirm", link: msg.text, quantity: 1, price: svcPrice, cost: 0 });

          return bot.sendMessage(
            chatId,
            `📋 *تأكيد الطلب*\n\n` +
            `🔹 الخدمة: ${svc.name}\n` +
            `🔗 المعلومات: ${msg.text}\n` +
            `💵 المبلغ: ${formatNumber(svcPrice)} IQD\n\n` +
            `هل تريد تأكيد الطلب؟`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ تأكيد", callback_data: "confirm_order" },
                    { text: "❌ إلغاء", callback_data: "main_menu" },
                  ],
                ],
              },
            }
          );
        }

        setState(telegramId, { ...state, step: "order_quantity", link: msg.text });
        return bot.sendMessage(
          chatId,
          `🔗 الرابط: ${msg.text}\n\n📊 أرسل الكمية المطلوبة:\n(الحد الأدنى: ${svc.minQuantity} - الحد الأقصى: ${formatNumber(svc.maxQuantity || 0)})`
        );
      }

      // Order flow - quantity (provider services only)
      if (state.step === "order_quantity" && msg.text) {
        const quantity = parseInt(msg.text);
        const svc = await storage.getService(state.serviceId);
        if (!svc) return;

        if (isNaN(quantity) || quantity < svc.minQuantity || quantity > svc.maxQuantity) {
          return bot.sendMessage(chatId, `❌ الكمية غير صحيحة. يجب أن تكون بين ${svc.minQuantity} و ${formatNumber(svc.maxQuantity)}`);
        }

        const margin = await getProfitMargin();
        const price = calculatePrice(svc.rate || "0", quantity, margin);
        const cost = (parseFloat(svc.rate || "0") / 1000) * quantity;

        setState(telegramId, { ...state, step: "order_confirm", quantity, price, cost });

        return bot.sendMessage(
          chatId,
          `📋 *تأكيد الطلب*\n\n` +
          `🔹 الخدمة: ${svc.name}\n` +
          `🔗 الرابط: ${state.link}\n` +
          `📊 الكمية: ${formatNumber(quantity)}\n` +
          `💵 المبلغ: ${formatNumber(price)} IQD\n\n` +
          `هل تريد تأكيد الطلب؟`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ تأكيد", callback_data: "confirm_order" },
                  { text: "❌ إلغاء", callback_data: "main_menu" },
                ],
              ],
            },
          }
        );
      }

      // Custom deposit amount
      if (state.step === "custom_amount" && msg.text) {
        const amount = parseInt(msg.text.replace(/,/g, ""));
        if (isNaN(amount) || amount < 1000) {
          return bot.sendMessage(chatId, "❌ المبلغ غير صحيح. الحد الأدنى 1,000 IQD");
        }
        return promptScreenshot(chatId, telegramId, amount, state.methodId);
      }

      // Deposit screenshot
      if (state.step === "deposit_screenshot" && msg.photo) {
        const user = await storage.getUserByTelegramId(telegramId);
        if (!user) return;

        const photo = msg.photo[msg.photo.length - 1];
        const method = await storage.getPaymentMethod(state.methodId);

        const deposit = await storage.createDeposit({
          userId: user.id,
          amount: state.amount.toString(),
          method: method?.name || "unknown",
          status: "pending",
          screenshotFileId: photo.file_id,
        });

        await bot.sendMessage(
          chatId,
          `✅ *تم إرسال طلب الإيداع بنجاح!*\n\n` +
          `المبلغ: ${formatNumber(state.amount)} IQD\n` +
          `الطريقة: ${method?.name}\n` +
          `رقم العملية: #${deposit.id}\n\n` +
          `سيتم مراجعة طلبك قريباً.`,
          { parse_mode: "Markdown" }
        );

        // Send to deposit group
        if (depositGroupId) {
          const caption = `💰 *طلب إيداع جديد #${deposit.id}*\n\n` +
            `👤 الاسم: ${user.firstName || ""} ${user.lastName || ""}\n` +
            `🆔 الآيدي: ${user.telegramId}\n` +
            `📱 اليوزر: ${user.username ? "@" + user.username : "غير محدد"}\n` +
            `💵 المبلغ: ${formatNumber(state.amount)} IQD\n` +
            `💳 الطريقة: ${method?.name}`;

          await bot.sendPhoto(depositGroupId, photo.file_id, {
            caption,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: `👤 ${user.firstName || user.telegramId}`, url: `tg://user?id=${user.telegramId}` }],
                [
                  { text: "✅ تأكيد التحويل", callback_data: `approve_deposit_${deposit.id}` },
                  { text: "❌ رفض التحويل", callback_data: `reject_deposit_${deposit.id}` },
                ],
              ],
            },
          });
        }

        clearState(telegramId);
        return;
      }

      // Transfer amount
      if (state.step === "transfer_amount" && msg.text) {
        const amount = parseFloat(msg.text.replace(/,/g, ""));
        if (isNaN(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "❌ المبلغ غير صحيح.");
        }

        const user = await storage.getUserByTelegramId(telegramId);
        if (!user || parseFloat(user.balance) < amount) {
          return bot.sendMessage(chatId, "❌ رصيدك غير كافٍ.");
        }

        setState(telegramId, { step: "transfer_target", amount });
        return bot.sendMessage(chatId, `💵 المبلغ: ${formatNumber(amount)} IQD\n\nأرسل آيدي الشخص المراد التحويل إليه:`);
      }

      // Transfer target
      if (state.step === "transfer_target" && msg.text) {
        const targetId = msg.text.trim();
        const target = await storage.getUserByTelegramId(targetId);
        if (!target) {
          return bot.sendMessage(chatId, "❌ المستخدم غير موجود.");
        }

        if (targetId === telegramId) {
          return bot.sendMessage(chatId, "❌ لا يمكنك التحويل لنفسك.");
        }

        setState(telegramId, { step: "transfer_confirm", amount: state.amount, targetId });
        return bot.sendMessage(
          chatId,
          `💸 *تأكيد التحويل*\n\n` +
          `المبلغ: ${formatNumber(state.amount)} IQD\n` +
          `إلى: ${target.firstName || ""} (${target.telegramId})\n\n` +
          `هل أنت متأكد من عملية التحويل؟`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ نعم", callback_data: "confirm_transfer" },
                  { text: "❌ لا", callback_data: "cancel_transfer" },
                ],
              ],
            },
          }
        );
      }

      // ===== ADMIN TEXT HANDLERS =====
      if (!(await isAdmin(telegramId))) return;

      // Custom service flow - name
      if (state.step === "custom_service_name" && msg.text) {
        setState(telegramId, { ...state, step: "custom_service_desc", serviceName: msg.text.trim() });
        return bot.sendMessage(chatId, "📝 أرسل وصف الخدمة (أو /skip لتخطي):");
      }

      // Custom service flow - description
      if (state.step === "custom_service_desc" && msg.text) {
        const desc = msg.text === "/skip" ? null : msg.text.trim();
        setState(telegramId, { ...state, step: "custom_service_price", serviceDescription: desc });
        return bot.sendMessage(chatId, "💵 أرسل سعر الخدمة (بالدينار العراقي):");
      }

      // Custom service flow - price
      if (state.step === "custom_service_price" && msg.text) {
        const price = parseFloat(msg.text.replace(/,/g, ""));
        if (isNaN(price) || price <= 0) {
          return bot.sendMessage(chatId, "❌ أرسل سعر صحيح.");
        }

        await storage.createService({
          categoryId: state.categoryId,
          name: state.serviceName,
          description: state.serviceDescription || null,
          serviceType: "custom",
          provider: null,
          providerServiceId: null,
          price: price.toString(),
          rate: null,
          minQuantity: 1,
          maxQuantity: 1,
          isActive: true,
          totalOrders: 0,
          totalRevenue: "0",
          totalProfit: "0",
        });

        clearState(telegramId);
        return bot.sendMessage(chatId, `✅ تم إضافة الخدمة "${state.serviceName}" بسعر ${formatNumber(price)} IQD`, {
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 لوحة الإدارة", callback_data: "admin_panel" }]],
          },
        });
      }

      // Subscription service flow - name
      if (state.step === "sub_service_name" && msg.text) {
        setState(telegramId, { ...state, step: "sub_service_desc", serviceName: msg.text.trim() });
        return bot.sendMessage(chatId, "📝 أرسل وصف الاشتراك (أو /skip لتخطي):");
      }

      // Subscription service flow - description
      if (state.step === "sub_service_desc" && msg.text) {
        const desc = msg.text === "/skip" ? null : msg.text.trim();
        setState(telegramId, { ...state, step: "sub_service_price", serviceDescription: desc });
        return bot.sendMessage(chatId, "💵 أرسل سعر الاشتراك (بالدينار العراقي):");
      }

      // Subscription service flow - price
      if (state.step === "sub_service_price" && msg.text) {
        const price = parseFloat(msg.text.replace(/,/g, ""));
        if (isNaN(price) || price <= 0) {
          return bot.sendMessage(chatId, "❌ أرسل سعر صحيح.");
        }

        await storage.createService({
          categoryId: state.categoryId,
          name: state.serviceName,
          description: state.serviceDescription || null,
          serviceType: "custom",
          provider: null,
          providerServiceId: null,
          price: price.toString(),
          rate: null,
          minQuantity: 1,
          maxQuantity: 1,
          isActive: true,
          totalOrders: 0,
          totalRevenue: "0",
          totalProfit: "0",
        });

        clearState(telegramId);
        return bot.sendMessage(chatId, `✅ تم إضافة الاشتراك "${state.serviceName}" بسعر ${formatNumber(price)} IQD`, {
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 لوحة الإدارة", callback_data: "admin_panel" }]],
          },
        });
      }

      // Broadcast - text input
      if (state.step === "broadcast_text" && msg.text) {
        const broadcastData = { text: msg.text };
        const userCount = await storage.getUserCount();
        setState(telegramId, { step: "broadcast_confirm", broadcastData });
        return bot.sendMessage(chatId,
          `📢 *معاينة الإذاعة:*\n\n` +
          `${msg.text}\n\n` +
          `━━━━━━━━━━━━━━━\n` +
          `👥 سيتم الإرسال إلى: ${userCount} مستخدم\n\n` +
          `هل تريد الإرسال؟`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ إرسال", callback_data: "broadcast_confirm" }],
                [{ text: "❌ إلغاء", callback_data: "broadcast_cancel" }],
              ],
            },
          }
        );
      }

      // Broadcast - image URL
      if (state.step === "broadcast_image_url" && msg.text) {
        const imageUrl = msg.text.trim();
        if (!imageUrl.startsWith("http")) {
          return bot.sendMessage(chatId, "❌ الرابط يجب أن يبدأ بـ http أو https");
        }
        setState(telegramId, { ...state, step: "broadcast_image_text", imageUrl });
        return bot.sendMessage(chatId, "📝 أرسل النص المرافق للصورة (أو أرسل /skip لتخطي):");
      }

      // Broadcast - image caption text
      if (state.step === "broadcast_image_text" && msg.text) {
        const text = msg.text.trim() === "/skip" ? "" : msg.text;
        if (state.broadcastType === "image_button") {
          setState(telegramId, { ...state, step: "broadcast_button_text", text });
          return bot.sendMessage(chatId, "🔗 أرسل نص الزر:");
        }
        const broadcastData = { text, imageUrl: state.imageUrl };
        const userCount = await storage.getUserCount();
        setState(telegramId, { step: "broadcast_confirm", broadcastData });

        try {
          await bot.sendPhoto(chatId, state.imageUrl, {
            caption: `📢 *معاينة الإذاعة:*\n\n${text}`,
            parse_mode: "Markdown",
          });
        } catch {
          return bot.sendMessage(chatId, "❌ رابط الصورة غير صالح. أرسل رابط صحيح:");
        }
        return bot.sendMessage(chatId,
          `👥 سيتم الإرسال إلى: ${userCount} مستخدم\n\nهل تريد الإرسال؟`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ إرسال", callback_data: "broadcast_confirm" }],
                [{ text: "❌ إلغاء", callback_data: "broadcast_cancel" }],
              ],
            },
          }
        );
      }

      // Broadcast - button text
      if (state.step === "broadcast_button_text" && msg.text) {
        setState(telegramId, { ...state, step: "broadcast_button_url", buttonText: msg.text.trim() });
        return bot.sendMessage(chatId, "🔗 أرسل رابط الزر:");
      }

      // Broadcast - button URL
      if (state.step === "broadcast_button_url" && msg.text) {
        const buttonUrl = msg.text.trim();
        if (!buttonUrl.startsWith("http")) {
          return bot.sendMessage(chatId, "❌ الرابط يجب أن يبدأ بـ http أو https");
        }
        const broadcastData = {
          text: state.text || "",
          imageUrl: state.imageUrl,
          buttonText: state.buttonText,
          buttonUrl,
        };
        const userCount = await storage.getUserCount();
        setState(telegramId, { step: "broadcast_confirm", broadcastData });

        try {
          await bot.sendPhoto(chatId, state.imageUrl, {
            caption: `📢 *معاينة الإذاعة:*\n\n${state.text || ""}`,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: state.buttonText, url: buttonUrl }]],
            },
          });
        } catch {
          return bot.sendMessage(chatId, "❌ رابط الصورة غير صالح.");
        }
        return bot.sendMessage(chatId,
          `👥 سيتم الإرسال إلى: ${userCount} مستخدم\n\nهل تريد الإرسال؟`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ إرسال", callback_data: "broadcast_confirm" }],
                [{ text: "❌ إلغاء", callback_data: "broadcast_cancel" }],
              ],
            },
          }
        );
      }

      // Add category
      if (state.step === "admin_add_category" && msg.text) {
        const name = msg.text.trim();
        const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
        const catType = state.categoryType || "smm";
        await storage.createCategory({ name, slug, type: catType, sortOrder: 0, isActive: true });
        await bot.sendMessage(chatId, `✅ تم إضافة القسم "${name}"`);
        clearState(telegramId);
        return showAdminCategories(chatId);
      }

      // Set margin
      if (state.step === "admin_set_margin" && msg.text) {
        const margin = parseFloat(msg.text);
        if (isNaN(margin) || margin < 0) {
          return bot.sendMessage(chatId, "❌ أرسل رقم صحيح.");
        }
        await storage.setSetting("profit_margin", margin.toString());
        clearState(telegramId);
        return bot.sendMessage(chatId, `✅ تم تحديث نسبة الأرباح إلى ${margin}%`, {
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 لوحة الإدارة", callback_data: "admin_panel" }]],
          },
        });
      }

      // Add admin
      if (state.step === "admin_add_admin" && msg.text) {
        const adminTgId = msg.text.trim();
        const targetUser = await storage.getUserByTelegramId(adminTgId);
        if (!targetUser) {
          return bot.sendMessage(chatId, "❌ المستخدم غير موجود. يجب أن يبدأ البوت أولاً.");
        }
        const { db: database } = await import("./db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await database.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, targetUser.id));
        clearState(telegramId);
        await bot.sendMessage(chatId, `✅ تم إضافة ${targetUser.firstName || targetUser.telegramId} كأدمن`);
        return showAdminAdmins(chatId);
      }

      // Add service - service ID
      if (state.step === "admin_service_id" && msg.text) {
        const serviceId = parseInt(msg.text.trim());
        if (isNaN(serviceId)) {
          return bot.sendMessage(chatId, "❌ أرسل رقم صحيح.");
        }

        const provider = state.provider as "kd1s" | "amazing";
        await bot.sendMessage(chatId, "⏳ جاري البحث عن الخدمة...");

        const serviceInfo = await smmApi.getServiceInfo(provider, serviceId);
        if (!serviceInfo) {
          return bot.sendMessage(chatId, "❌ الخدمة غير موجودة في هذا الموقع.");
        }

        // Select category
        const cats = await storage.getCategories();
        const buttons = cats.map((c) => [
          { text: c.name, callback_data: `assign_cat_${c.id}` },
        ]);
        buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

        setState(telegramId, { step: "admin_select_category", serviceInfo, provider });

        return bot.sendMessage(
          chatId,
          `✅ *تم العثور على الخدمة:*\n\n` +
          `📋 ${serviceInfo.name}\n` +
          `💵 السعر: ${serviceInfo.rate}\n` +
          `📊 الحد: ${serviceInfo.min} - ${serviceInfo.max}\n\n` +
          `اختر القسم:`,
          {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons },
          }
        );
      }

      // Edit service name
      if (state.step === "admin_edit_service" && msg.text) {
        const newName = msg.text.trim();
        if (newName !== "/skip") {
          await storage.updateService(state.serviceId, { name: newName });
        }
        setState(telegramId, { step: "admin_edit_service_desc", serviceId: state.serviceId });
        return bot.sendMessage(chatId, "📝 أرسل الوصف الجديد أو /skip لتخطي:");
      }

      if (state.step === "admin_edit_service_desc" && msg.text) {
        const newDesc = msg.text.trim();
        if (newDesc !== "/skip") {
          await storage.updateService(state.serviceId, { description: newDesc });
        }
        clearState(telegramId);
        return bot.sendMessage(chatId, "✅ تم تحديث الخدمة بنجاح!", {
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 لوحة الإدارة", callback_data: "admin_panel" }]],
          },
        });
      }

      // Add payment method
      if (state.step === "admin_add_payment" && msg.text) {
        const parts = msg.text.split("|");
        if (parts.length < 2) {
          return bot.sendMessage(chatId, "❌ الصيغة غير صحيحة. استخدم: اسم_الطريقة|التعليمات");
        }
        const name = parts[0].trim();
        const instructions = parts[1].trim();
        const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
        await storage.createPaymentMethod({ name, slug, instructions, isActive: true });
        clearState(telegramId);
        return bot.sendMessage(chatId, `✅ تم إضافة طريقة الدفع "${name}"`);
      }
    } catch (error) {
      console.error("Message handler error:", error);
    }
  });

  // Set notification group
  bot.onText(/\/setnotifygroup/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;

    if (msg.chat.type === "private") {
      return bot.sendMessage(msg.chat.id, "❌ يجب إرسال هذا الأمر في الكروب.");
    }

    notificationGroupId = msg.chat.id.toString();
    await storage.setSetting("notification_group_id", notificationGroupId);
    await bot.sendMessage(msg.chat.id, "✅ تم تحديد هذا الكروب لإشعارات الطلبات.");
  });

  // Set deposit group
  bot.onText(/\/setdepositgroup/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;

    if (msg.chat.type === "private") {
      return bot.sendMessage(msg.chat.id, "❌ يجب إرسال هذا الأمر في الكروب.");
    }

    depositGroupId = msg.chat.id.toString();
    await storage.setSetting("deposit_group_id", depositGroupId);
    await bot.sendMessage(msg.chat.id, "✅ تم تحديد هذا الكروب لطلبات الإيداع.");
  });

  // Set subscription group
  bot.onText(/\/setsubscriptiongroup/, async (msg) => {
    const telegramId = msg.from!.id.toString();
    if (!(await isAdmin(telegramId))) return;

    if (msg.chat.type === "private") {
      return bot.sendMessage(msg.chat.id, "❌ يجب إرسال هذا الأمر في الكروب.");
    }

    subscriptionGroupId = msg.chat.id.toString();
    await storage.setSetting("subscription_group_id", subscriptionGroupId);
    await bot.sendMessage(msg.chat.id, "✅ تم تحديد هذا الكروب لطلبات الاشتراكات.");
  });

  // Reply forwarding: when admin replies to a bot message in any group, forward the reply to the original user
  bot.on("message", async (msg) => {
    try {
      if (msg.chat.type === "private") return;
      if (!msg.reply_to_message) return;
      if (!msg.from) return;

      const senderTelegramId = msg.from.id.toString();
      if (!(await isAdmin(senderTelegramId))) return;

      const repliedMsg = msg.reply_to_message;
      if (repliedMsg.from?.id !== botUserId) return;

      const groupId = msg.chat.id.toString();
      const isAdminGroup = groupId === notificationGroupId || groupId === depositGroupId || groupId === subscriptionGroupId;
      if (!isAdminGroup) return;

      let targetTelegramId: string | null = null;

      const msgText = repliedMsg.text || repliedMsg.caption || "";
      const idMatch = msgText.match(/الآيدي:\s*(\d+)/);
      if (idMatch) {
        targetTelegramId = idMatch[1];
      }

      if (!targetTelegramId && repliedMsg.reply_markup?.inline_keyboard) {
        for (const row of repliedMsg.reply_markup.inline_keyboard) {
          for (const btn of row) {
            const urlMatch = btn.url?.match(/tg:\/\/user\?id=(\d+)/);
            if (urlMatch) {
              targetTelegramId = urlMatch[1];
              break;
            }
          }
          if (targetTelegramId) break;
        }
      }

      if (!targetTelegramId) return;

      if (msg.text) {
        await bot.sendMessage(parseInt(targetTelegramId), msg.text);
      } else if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        await bot.sendPhoto(parseInt(targetTelegramId), photo.file_id, {
          caption: msg.caption || undefined,
        });
      } else if (msg.document) {
        await bot.sendDocument(parseInt(targetTelegramId), msg.document.file_id, {
          caption: msg.caption || undefined,
        });
      } else if (msg.video) {
        await bot.sendVideo(parseInt(targetTelegramId), msg.video.file_id, {
          caption: msg.caption || undefined,
        });
      } else if (msg.voice) {
        await bot.sendVoice(parseInt(targetTelegramId), msg.voice.file_id);
      } else if (msg.sticker) {
        await bot.sendSticker(parseInt(targetTelegramId), msg.sticker.file_id);
      }
    } catch (error) {
      console.error("Reply forwarding error:", error);
    }
  });

  return bot;
}
