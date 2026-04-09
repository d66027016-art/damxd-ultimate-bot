from telethon import TelegramClient, events
import asyncio
import re

# ================== YOUR DETAILS ==================
api_id = 34763987
api_hash = '00b17f808adb1dc30f30ff73ec797314'
bot_token = '8658573860:AAGUQvI1xJMUjP1d-fKlMejW5P-Do9T6558'

# Target Group (where formatted messages will be sent)
TARGET_GROUP = -1003981062787

YOUR_USERNAME = "@damxd89"

client = TelegramClient('forwarder', api_id, api_hash)

# Pattern to detect your format
pattern = re.compile(r'#APPROVED\(CHARGED\)', re.IGNORECASE)

@client.on(events.NewMessage())
async def handler(event):
    # Ignore messages from the target group itself to prevent infinite loops
    if event.chat_id == TARGET_GROUP:
        return
        
    msg = event.message.message
    if not msg:
        return
        
    promo_msg = f"""
✨ **NEW UPDATE DETECTED!** ✨

{msg}

────────────────────
💖 **Want More Success Like This?**

Upgrade to **Premium Plan** and get:
• Unlimited Approved Charges
• Higher Limits (Up to $500+)
• Private VIP Signals
• Instant Updates
• Priority Support

**Pricing:**
• Monthly Plan → ₹999

Just message @damxd89 and say "Upgrade" 

Let's make you earn more together! 💰

Made with ❤️ by @damxd89
"""
    try:
        await client.send_message(TARGET_GROUP, promo_msg.strip())
        print(f"✅ Forwarded message from {event.chat_id} successfully!")
    except Exception as e:
            print(f"Error: {e}")

async def main():
    await client.start(bot_token=bot_token)
    print("🤖 Bot is LIVE and Monitoring #APPROVED(CHARGED) messages...")
    await client.run_until_disconnected()

asyncio.run(main())