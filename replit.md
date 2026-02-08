# Telegram SMM Bot

## Overview
A Telegram bot for social media services (SMM panel) connected to two API providers (kd1s.com and amazingsmm.com). The bot allows users to browse and order social media services, manage their balance, and track orders. Includes a web admin dashboard for monitoring.

## Architecture
- **Backend**: Express.js server with PostgreSQL database (Drizzle ORM)
- **Frontend**: React + Vite web admin dashboard with shadcn/ui components
- **Bot**: node-telegram-bot-api with polling mode
- **APIs**: SMM Panel API v2 integration with kd1s.com and amazingsmm.com

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

## Bot Commands
- `/start` - Main menu
- `/admin` - Admin panel (admin only)
- `/editinsta`, `/edityoutube`, `/editfacebook`, `/edittiktok`, `/edittwitter`, `/edittelegram` - Edit category services (admin only)
- `/setnotifygroup` - Set order notification group (in group, admin only)
- `/setdepositgroup` - Set deposit approval group (in group, admin only)

## Environment Variables
- `TELEGRAM_BOT_TOKEN` - Bot token
- `KD1S_API_KEY`, `KD1S_API_URL` - kd1s.com API credentials
- `AMAZING_API_KEY`, `AMAZING_API_URL` - amazingsmm.com API credentials
- `CREATOR_TELEGRAM_ID` - Creator's Telegram ID (super admin)
- `ADMIN_USERNAME` - Admin username for user contact

## Database Tables
users, categories, services, orders, deposits, transactions, settings, payment_methods
