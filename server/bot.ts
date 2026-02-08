import TelegramBot from "node-telegram-bot-api";
import { storage } from "./storage";
import * as smmApi from "./smm-api";
import type { User, Service, Category } from "@shared/schema";

const CREATOR_ID = process.env.CREATOR_TELEGRAM_ID || "1384026800";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "@mohmmed";

let bot: TelegramBot;
let notificationGroupId: string | null = null;
let depositGroupId: string | null = null;

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

async function sendMainMenu(chatId: number) {
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📋 الخدمات", callback_data: "services" }],
        [{ text: "👤 معلومات حسابك", callback_data: "account_info" }, { text: "💰 شحن حسابك", callback_data: "deposit" }],
        [{ text: "📦 طلباتي", callback_data: "my_orders" }],
      ],
    },
  };

  await bot.sendMessage(
    chatId,
    "🌟 *مرحباً بك في بوت خدمات السوشل ميديا*\n\nاختر من القائمة أدناه:",
    { parse_mode: "Markdown", ...keyboard }
  );
}

async function showServices(chatId: number) {
  const cats = await storage.getActiveCategories();
  if (cats.length === 0) {
    return bot.sendMessage(chatId, "❌ لا توجد خدمات متاحة حالياً.");
  }

  const buttons = cats.map((cat) => [
    { text: `${cat.name}`, callback_data: `cat_${cat.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "main_menu" }]);

  await bot.sendMessage(chatId, "📋 *اختر القسم:*", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showCategoryServices(chatId: number, categoryId: number) {
  const margin = await getProfitMargin();
  const svcs = await storage.getActiveServicesByCategory(categoryId);
  const cat = await storage.getCategory(categoryId);

  if (svcs.length === 0) {
    return bot.sendMessage(chatId, "❌ لا توجد خدمات في هذا القسم حالياً.");
  }

  const buttons = svcs.map((svc) => [
    { text: `${svc.name}`, callback_data: `svc_${svc.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع للأقسام", callback_data: "services" }]);

  await bot.sendMessage(chatId, `📂 *خدمات ${cat?.name || ""}:*`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showServiceDetail(chatId: number, serviceId: number, telegramId: string) {
  const svc = await storage.getService(serviceId);
  if (!svc) return bot.sendMessage(chatId, "❌ الخدمة غير موجودة.");

  const margin = await getProfitMargin();
  const pricePerK = parseFloat(svc.rate) * (1 + margin / 100);

  const text = `🔹 *${svc.name}*\n\n` +
    `${svc.description ? `📝 ${svc.description}\n\n` : ""}` +
    `💵 السعر لكل 1000: ${formatNumber(pricePerK)}\n` +
    `📊 الحد الأدنى: ${svc.minQuantity}\n` +
    `📊 الحد الأقصى: ${formatNumber(svc.maxQuantity)}\n` +
    `🌐 الموقع: ${svc.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n\n` +
    `لتقديم طلب، أرسل الرابط المراد:`;

  setState(telegramId, { step: "order_link", serviceId });

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `cat_${svc.categoryId}` }]],
    },
  });
}

async function showAccountInfo(chatId: number, telegramId: string) {
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

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "💸 تحويل أموال", callback_data: "transfer_money" }],
        [{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }],
      ],
    },
  });
}

async function showDepositOptions(chatId: number) {
  const methods = await storage.getActivePaymentMethods();
  if (methods.length === 0) {
    return bot.sendMessage(chatId, "❌ لا توجد طرق دفع متاحة حالياً.");
  }

  const buttons = methods.map((m) => [
    { text: `${m.name}`, callback_data: `pay_${m.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "main_menu" }]);

  await bot.sendMessage(chatId, "💰 *اختر طريقة الدفع:*", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showPaymentMethod(chatId: number, methodId: number, telegramId: string) {
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

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function promptScreenshot(chatId: number, telegramId: string, amount: number, methodId: number) {
  setState(telegramId, { step: "deposit_screenshot", amount, methodId });

  await bot.sendMessage(
    chatId,
    `✅ المبلغ: *${formatNumber(amount)} IQD*\n\nالآن أرسل *سكرين شوت* لعملية التحويل:`,
    { parse_mode: "Markdown" }
  );
}

async function showMyOrders(chatId: number, telegramId: string) {
  const user = await storage.getUserByTelegramId(telegramId);
  if (!user) return;

  const userOrders = await storage.getOrdersByUser(user.id);
  if (userOrders.length === 0) {
    return bot.sendMessage(chatId, "📦 لا توجد طلبات حالياً.", {
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]],
      },
    });
  }

  const text = "📦 *هذه جميع الطلبات التي قمت بوضعها:*";
  const buttons = userOrders.slice(0, 20).map((o) => [
    { text: `طلب #${o.id} - ${o.status}`, callback_data: `order_${o.id}` },
  ]);
  buttons.push([{ text: "🔙 القائمة الرئيسية", callback_data: "main_menu" }]);

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showOrderDetail(chatId: number, orderId: number) {
  const order = await storage.getOrder(orderId);
  if (!order) return bot.sendMessage(chatId, "❌ الطلب غير موجود.");

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
            const user = await storage.getUser(order.userId);
            if (user) {
              await storage.updateUserBalance(user.id, order.amount);
              await storage.createTransaction({
                userId: user.id,
                type: "refund",
                amount: order.amount,
                description: `استرجاع طلب #${order.id}`,
                relatedId: order.id,
              });

              await bot.sendMessage(
                parseInt(user.telegramId),
                `🔄 *تم إلغاء الطلب #${order.id}*\n\nتم إرجاع المبلغ ${formatNumber(order.amount)} IQD إلى رصيدك.`,
                { parse_mode: "Markdown" }
              );

              if (notificationGroupId) {
                await bot.sendMessage(
                  notificationGroupId,
                  `🔄 *تم إلغاء الطلب #${order.id}*\nالمستخدم: ${user.firstName || ""} (${user.telegramId})\nالمبلغ المسترجع: ${formatNumber(order.amount)} IQD`,
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

  const text = `📦 *تفاصيل الطلب #${order.id}*\n\n` +
    `📋 الخدمة: ${svc?.name || "غير معروف"}\n` +
    `🔗 الرابط: ${order.link}\n` +
    `📊 الكمية: ${formatNumber(order.quantity)}\n` +
    `💵 المبلغ: ${formatNumber(order.amount)} IQD\n` +
    `🌐 الموقع: ${order.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n` +
    `📌 الحالة: ${statusMap[providerStatus] || providerStatus}\n` +
    `${order.providerOrderId ? `🔢 رقم الطلب بالموقع: ${order.providerOrderId}\n` : ""}` +
    `📅 التاريخ: ${order.createdAt.toLocaleDateString("ar-IQ")}`;

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 رجوع للطلبات", callback_data: "my_orders" }]],
    },
  });
}

// ===== ADMIN FUNCTIONS =====

async function showAdminPanel(chatId: number) {
  const buttons = [
    [{ text: "📊 الإحصائيات", callback_data: "admin_stats" }],
    [{ text: "📂 إدارة الأقسام", callback_data: "admin_categories" }],
    [{ text: "🔧 إضافة/تعديل خدمة", callback_data: "admin_add_service" }],
    [{ text: "💹 نسبة الأرباح", callback_data: "admin_margin" }],
    [{ text: "👑 الأدمنية", callback_data: "admin_admins" }],
    [{ text: "⚙️ إعدادات الكروبات", callback_data: "admin_groups" }],
    [{ text: "💳 طرق الدفع", callback_data: "admin_payments" }],
  ];

  await bot.sendMessage(chatId, "🔐 *لوحة الإدارة*", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showAdminStats(chatId: number) {
  const userCount = await storage.getUserCount();
  const allStats = await storage.getOrderStats();
  const kd1sStats = await storage.getOrderStatsByProvider("kd1s");
  const amazingStats = await storage.getOrderStatsByProvider("amazing");

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
    `الأرباح: ${formatNumber(amazingStats.totalProfit)} IQD`;

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]],
    },
  });
}

async function showAdminCategories(chatId: number) {
  const cats = await storage.getCategories();

  let text = "📂 *إدارة الأقسام*\n\n";
  if (cats.length > 0) {
    cats.forEach((c, i) => {
      text += `${i + 1}. ${c.name} ${c.isActive ? "✅" : "❌"}\n`;
    });
  } else {
    text += "لا توجد أقسام حالياً.\n";
  }

  text += "\nلإضافة قسم جديد أرسل اسم القسم:";

  setState(chatId.toString(), { step: "admin_add_category" });

  const buttons = cats.map((c) => [
    { text: `${c.isActive ? "❌ تعطيل" : "✅ تفعيل"} ${c.name}`, callback_data: `toggle_cat_${c.id}` },
  ]);
  buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showAdminAddService(chatId: number, telegramId: string) {
  setState(telegramId, { step: "admin_select_provider" });

  await bot.sendMessage(chatId, "🔧 *إضافة خدمة جديدة*\n\nالخدمة من أي موقع؟", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "kd1s.com", callback_data: "provider_kd1s" },
          { text: "amazingsmm.com", callback_data: "provider_amazing" },
        ],
        [{ text: "🔙 رجوع", callback_data: "admin_panel" }],
      ],
    },
  });
}

async function showAdminMargin(chatId: number) {
  const margin = await getProfitMargin();

  await bot.sendMessage(
    chatId,
    `💹 *نسبة الأرباح الحالية: ${margin}%*\n\nأرسل النسبة الجديدة (رقم فقط):`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]],
      },
    }
  );

  setState(chatId.toString(), { step: "admin_set_margin" });
}

async function showAdminAdmins(chatId: number) {
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

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
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
    text += `   🌐 ${svc.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n`;
    text += `   🆔 آيدي الخدمة: ${svc.providerServiceId}\n`;
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

export function initBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set!");
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  bot = new TelegramBot(token, { polling: true });
  console.log("Telegram bot started with polling...");

  // Load group IDs from settings
  (async () => {
    notificationGroupId = (await storage.getSetting("notification_group_id")) || null;
    depositGroupId = (await storage.getSetting("deposit_group_id")) || null;
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
    const telegramId = query.from.id.toString();
    const data = query.data || "";

    await bot.answerCallbackQuery(query.id);

    try {
      // Main menu
      if (data === "main_menu") {
        clearState(telegramId);
        return sendMainMenu(chatId);
      }

      if (data === "confirm_order") {
        const oState = getState(telegramId);
        if (!oState || oState.step !== "order_confirm") return;

        try {
          const user = await storage.getUserByTelegramId(telegramId);
          if (!user) return;

          if (parseFloat(user.balance) < oState.price) {
            clearState(telegramId);
            return bot.sendMessage(chatId, "❌ رصيدك غير كافٍ. يرجى شحن حسابك أولاً.", {
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

          await bot.sendMessage(chatId, "⏳ جاري معالجة الطلب...");

          const result = await smmApi.placeOrder(
            svc.provider as "kd1s" | "amazing",
            svc.providerServiceId,
            oState.link,
            oState.quantity
          );

          if (result.error) {
            clearState(telegramId);
            return bot.sendMessage(chatId, `❌ خطأ في الطلب: ${result.error}`);
          }

          const profit = oState.price - oState.cost;

          await storage.updateUserBalance(user.id, (-oState.price).toString());
          await storage.updateUserStats(user.id, oState.price.toString());

          const order = await storage.createOrder({
            userId: user.id,
            serviceId: svc.id,
            providerOrderId: result.order || null,
            provider: svc.provider,
            link: oState.link,
            quantity: oState.quantity,
            amount: oState.price.toString(),
            cost: oState.cost.toString(),
            profit: profit.toString(),
            status: "pending",
          });

          await storage.createTransaction({
            userId: user.id,
            type: "order",
            amount: (-oState.price).toString(),
            description: `طلب #${order.id} - ${svc.name}`,
            relatedId: order.id,
          });

          await storage.incrementServiceStats(svc.id, oState.price.toString(), profit.toString());

          await bot.sendMessage(
            chatId,
            `✅ *تم الطلب بنجاح!*\n\n` +
            `📦 رقم الطلب: #${order.id}\n` +
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
            await bot.sendMessage(
              notificationGroupId,
              `📦 *طلب جديد #${order.id}*\n\n` +
              `📋 الخدمة: ${svc.name}\n` +
              `📊 الكمية: ${formatNumber(oState.quantity)}\n` +
              `💵 المبلغ: ${formatNumber(oState.price)} IQD\n` +
              `🌐 الموقع: ${svc.provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}`,
              {
                parse_mode: "Markdown",
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

      if (data === "services") {
        clearState(telegramId);
        return showServices(chatId);
      }

      if (data === "account_info") {
        clearState(telegramId);
        return showAccountInfo(chatId, telegramId);
      }

      if (data === "deposit") {
        clearState(telegramId);
        return showDepositOptions(chatId);
      }

      if (data === "my_orders") {
        clearState(telegramId);
        return showMyOrders(chatId, telegramId);
      }

      // Category services
      if (data.startsWith("cat_")) {
        const catId = parseInt(data.split("_")[1]);
        return showCategoryServices(chatId, catId);
      }

      // Service detail
      if (data.startsWith("svc_")) {
        const svcId = parseInt(data.split("_")[1]);
        return showServiceDetail(chatId, svcId, telegramId);
      }

      // Order detail
      if (data.startsWith("order_")) {
        const orderId = parseInt(data.split("_")[1]);
        return showOrderDetail(chatId, orderId);
      }

      // Payment method
      if (data.startsWith("pay_")) {
        const methodId = parseInt(data.split("_")[1]);
        return showPaymentMethod(chatId, methodId, telegramId);
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
        return bot.sendMessage(chatId, "💸 *تحويل أموال*\n\nأرسل المبلغ المراد تحويله:", {
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
          return bot.sendMessage(chatId, "❌ رصيدك غير كافٍ.");
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

        await bot.sendMessage(chatId, `✅ تم تحويل ${formatNumber(state.amount)} IQD بنجاح!`);
        await bot.sendMessage(
          parseInt(receiver.telegramId),
          `💰 تم استلام ${formatNumber(state.amount)} IQD من ${sender.firstName || sender.telegramId}!`
        );

        clearState(telegramId);
        return;
      }

      if (data === "cancel_transfer") {
        clearState(telegramId);
        return bot.sendMessage(chatId, "❌ تم إلغاء عملية التحويل.");
      }

      // ===== ADMIN CALLBACKS =====
      if (!(await isAdmin(telegramId))) return;

      if (data === "admin_panel") {
        clearState(telegramId);
        return showAdminPanel(chatId);
      }

      if (data === "admin_stats") return showAdminStats(chatId);
      if (data === "admin_categories") return showAdminCategories(chatId);
      if (data === "admin_add_service") return showAdminAddService(chatId, telegramId);
      if (data === "admin_margin") return showAdminMargin(chatId);
      if (data === "admin_admins") return showAdminAdmins(chatId);

      if (data === "admin_groups") {
        return bot.sendMessage(
          chatId,
          `⚙️ *إعدادات الكروبات*\n\n` +
          `كروب الإشعارات: ${notificationGroupId || "غير محدد"}\n` +
          `كروب الإيداعات: ${depositGroupId || "غير محدد"}\n\n` +
          `لتحديد كروب الإشعارات، أضف البوت للكروب ثم أرسل:\n` +
          `/setnotifygroup\n\n` +
          `لتحديد كروب الإيداعات أرسل:\n` +
          `/setdepositgroup`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "admin_panel" }]],
            },
          }
        );
      }

      if (data === "admin_payments") {
        const methods = await storage.getPaymentMethods();
        let text = "💳 *طرق الدفع:*\n\n";
        methods.forEach((m, i) => {
          text += `${i + 1}. ${m.name} ${m.isActive ? "✅" : "❌"}\n`;
        });
        text += "\nلإضافة طريقة جديدة أرسل: اسم_الطريقة|التعليمات";
        setState(telegramId, { step: "admin_add_payment" });

        const buttons = methods.map((m) => [
          { text: `${m.isActive ? "❌ تعطيل" : "✅ تفعيل"} ${m.name}`, callback_data: `toggle_pay_${m.id}` },
        ]);
        buttons.push([{ text: "🔙 رجوع", callback_data: "admin_panel" }]);

        return bot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      }

      // Toggle category
      if (data.startsWith("toggle_cat_")) {
        const catId = parseInt(data.split("_")[2]);
        const cat = await storage.getCategory(catId);
        if (cat) {
          await storage.updateCategory(catId, { isActive: !cat.isActive });
          await bot.sendMessage(chatId, `✅ تم ${cat.isActive ? "تعطيل" : "تفعيل"} القسم "${cat.name}"`);
          return showAdminCategories(chatId);
        }
      }

      // Toggle payment method
      if (data.startsWith("toggle_pay_")) {
        const payId = parseInt(data.split("_")[2]);
        const method = await storage.getPaymentMethod(payId);
        if (method) {
          await storage.updatePaymentMethod(payId, { isActive: !method.isActive });
          await bot.sendMessage(chatId, `✅ تم ${method.isActive ? "تعطيل" : "تفعيل"} "${method.name}"`);
        }
      }

      // Provider selection for adding service
      if (data === "provider_kd1s" || data === "provider_amazing") {
        const provider = data === "provider_kd1s" ? "kd1s" : "amazing";
        setState(telegramId, { step: "admin_service_id", provider });
        return bot.sendMessage(chatId, `✅ تم اختيار ${provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n\nأرسل آيدي الخدمة:`);
      }

      // Remove admin
      if (data.startsWith("remove_admin_")) {
        const userId = parseInt(data.split("_")[2]);
        const user = await storage.getUser(userId);
        if (user && user.telegramId !== CREATOR_ID) {
          await storage.updateUserBalance(user.id, "0"); // just to trigger update
          // Actually update isAdmin
          const { db: database } = await import("./db");
          const { users: usersTable } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          await database.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, userId));
          await bot.sendMessage(chatId, `✅ تم إزالة الأدمن ${user.firstName || user.telegramId}`);
          return showAdminAdmins(chatId);
        }
      }

      // Edit service
      if (data.startsWith("edit_svc_")) {
        const svcId = parseInt(data.split("_")[2]);
        const svc = await storage.getService(svcId);
        if (svc) {
          setState(telegramId, { step: "admin_edit_service", serviceId: svcId });
          return bot.sendMessage(
            chatId,
            `✏️ *تعديل الخدمة: ${svc.name}*\n\n` +
            `أرسل الاسم الجديد أو /skip لتخطي:`,
            { parse_mode: "Markdown" }
          );
        }
      }

      // Deposit approval
      if (data.startsWith("approve_deposit_")) {
        const depositId = parseInt(data.split("_")[2]);
        const deposit = await storage.getDeposit(depositId);
        if (deposit && deposit.status === "pending") {
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
          await bot.editMessageText(
            `✅ *تم تأكيد الإيداع #${depositId}*\nبواسطة: ${query.from.first_name}`,
            { chat_id: chatId, message_id: query.message!.message_id, parse_mode: "Markdown" }
          );
        }
      }

      if (data.startsWith("reject_deposit_")) {
        const depositId = parseInt(data.split("_")[2]);
        const deposit = await storage.getDeposit(depositId);
        if (deposit && deposit.status === "pending") {
          await storage.updateDepositStatus(depositId, "rejected");
          const user = await storage.getUser(deposit.userId);
          if (user) {
            await bot.sendMessage(
              parseInt(user.telegramId),
              `❌ *تم رفض عملية الإيداع*\n\nيرجى مراسلة الأدمن ${ADMIN_USERNAME}`,
              { parse_mode: "Markdown" }
            );
          }
          await bot.editMessageText(
            `❌ *تم رفض الإيداع #${depositId}*\nبواسطة: ${query.from.first_name}`,
            { chat_id: chatId, message_id: query.message!.message_id, parse_mode: "Markdown" }
          );
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
          provider,
          providerServiceId: serviceInfo.service,
          rate: serviceInfo.rate,
          minQuantity: parseInt(serviceInfo.min),
          maxQuantity: parseInt(serviceInfo.max),
          isActive: true,
          totalOrders: 0,
          totalRevenue: "0",
          totalProfit: "0",
        });

        clearState(telegramId);
        return bot.sendMessage(
          chatId,
          `✅ *تمت إضافة الخدمة بنجاح!*\n\n` +
          `📋 ${serviceInfo.name}\n` +
          `🌐 ${provider === "kd1s" ? "kd1s.com" : "amazingsmm.com"}\n` +
          `🆔 ${serviceInfo.service}\n` +
          `💵 السعر: ${serviceInfo.rate} (+ ${margin}% ربح)`,
          {
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
        setState(telegramId, { ...state, step: "order_quantity", link: msg.text });
        const svc = await storage.getService(state.serviceId);
        return bot.sendMessage(
          chatId,
          `🔗 الرابط: ${msg.text}\n\n📊 أرسل الكمية المطلوبة:\n(الحد الأدنى: ${svc?.minQuantity} - الحد الأقصى: ${formatNumber(svc?.maxQuantity || 0)})`
        );
      }

      // Order flow - quantity
      if (state.step === "order_quantity" && msg.text) {
        const quantity = parseInt(msg.text);
        const svc = await storage.getService(state.serviceId);
        if (!svc) return;

        if (isNaN(quantity) || quantity < svc.minQuantity || quantity > svc.maxQuantity) {
          return bot.sendMessage(chatId, `❌ الكمية غير صحيحة. يجب أن تكون بين ${svc.minQuantity} و ${formatNumber(svc.maxQuantity)}`);
        }

        const margin = await getProfitMargin();
        const price = calculatePrice(svc.rate, quantity, margin);
        const cost = (parseFloat(svc.rate) / 1000) * quantity;

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

      // Add category
      if (state.step === "admin_add_category" && msg.text) {
        const name = msg.text.trim();
        const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
        await storage.createCategory({ name, slug, sortOrder: 0, isActive: true });
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

  return bot;
}
