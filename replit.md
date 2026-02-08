# Telegram SMM Bot

## Overview
A Telegram bot for social media services (SMM panel) connected to two API providers (kd1s.com and amazingsmm.com). The bot allows users to browse and order social media services, manage their balance, and track orders. Includes a web admin dashboard for monitoring.

## Architecture
- **Backend**: Express.js server with PostgreSQL database (Drizzle ORM)
- **Frontend**: React + Vite web admin dashboard with shadcn/ui components
- **Bot**: node-telegram-bot-api with polling mode
- **APIs**: SMM Panel API v2 integration with kd1s.com (IQD pricing) and amazingsmm.com (USD pricing, auto-converted to IQD at 1:1430)

## Service Types
- **SMM Services (سوشل ميديا)**: Provider-based services from kd1s.com/amazingsmm.com + custom support services added manually by admin
- **Subscriptions (اشتراكات)**: Manual subscription services (Netflix, Shahid, etc.) added by admin with fixed pricing
- Categories have a `type` field: "smm" or "subscriptions"
- Services have a `serviceType` field: "provider" (from API) or "custom" (manual, fixed price)
- Custom SMM services use `rate` field (price per 1000) with min/max quantity, just like provider services
- Subscription services use `price` field for fixed pricing (quantity always 1)
- Custom services don't call external APIs when ordered

## Key Files
- `server/bot.ts` - Main Telegram bot logic (commands, callbacks, message handlers)
- `server/smm-api.ts` - SMM API client for kd1s.com and amazingsmm.com
- `server/storage.ts` - Database storage layer (CRUD operations)
- `server/db.ts` - PostgreSQL connection
- `server/seed.ts` - Database seeding (categories, payment methods, admin)
- `shared/schema.ts` - Database schema (users, categories, services, orders, deposits, transactions, settings, payment_methods)
- `client/src/pages/dashboard.tsx` - Admin dashboard with stats
- `client/src/pages/users-page.tsx` - Users list
- `client/src/pages/orders-page.tsx` - Orders table
- `client/src/pages/services-page.tsx` - Services grid
- `client/src/pages/broadcast-page.tsx` - Broadcast messages to all users

## Bot Commands
- `/start` - Main menu
- `/admin` - Admin panel (admin only, includes broadcast feature)
- `/editinsta`, `/edityoutube`, `/editfacebook`, `/edittiktok`, `/edittwitter`, `/edittelegram` - Edit category services (admin only)
- `/setnotifygroup` - Set order notification group (in group, admin only)
- `/setdepositgroup` - Set deposit approval group (in group, admin only)
- `/setsubscriptiongroup` - Set subscription orders group (in group, admin only)

## Order Flow
- **SMM/Custom services**: User sends link → confirms → balance deducted → notification to orders group
- **Subscriptions**: User sees service details with "طلب" button → clicks to order → balance deducted → notification to subscriptions group
- Three groups: orders (notificationGroupId), deposits (depositGroupId), subscriptions (subscriptionGroupId)

## Order ID System
- **Custom/Subscription orders**: Sequential IDs (1, 2, 3...) stored in `sequentialId` column, displayed to users
- **API orders (kd1s/amazing)**: Display the provider's `providerOrderId` from the external API
- Helper function `getOrderDisplayId(order)` handles this logic throughout the bot
- Internal `order.id` (serial primary key) is always used for database references/relatedId

## Admin Add Service
- Three options: kd1s.com, amazingsmm.com, خدمة خاصة (يدوية), اضافة اشتراك
- "خدمة خاصة" shows only SMM categories for adding custom support services
- "اضافة اشتراك" shows only subscription categories for adding subscription services
- Both flows: select category → enter name → enter description (or /skip) → enter price

## Reply Forwarding
- When admin replies to any bot message in any of the 3 groups, the reply is forwarded to the original user
- Works with text, photos, documents, videos, voice, stickers
- Extracts user ID from the "الآيدي" field in the message or from the user button URL

## Broadcast System
- Available from both bot admin panel and web dashboard
- Three types: text only, image+text, image+text+button
- Rate limiting: 25 messages per batch, 35ms between messages, 1s between batches
- Retry logic: Up to 3 retries with exponential backoff for rate-limited (429) errors
- Auto-skip: Users who blocked the bot or deactivated accounts are skipped immediately
- Live progress: Admin sees real-time sent/failed/total counts during broadcast

## Environment Variables
- `TELEGRAM_BOT_TOKEN` - Bot token
- `KD1S_API_KEY`, `KD1S_API_URL` - kd1s.com API credentials
- `AMAZING_API_KEY`, `AMAZING_API_URL` - amazingsmm.com API credentials
- `CREATOR_TELEGRAM_ID` - Creator's Telegram ID (super admin)
- `ADMIN_USERNAME` - Admin username for user contact

## Database Tables
users, categories (with type: smm/subscriptions), services (with serviceType: provider/custom, price for custom), orders, deposits, transactions, settings, payment_methods
