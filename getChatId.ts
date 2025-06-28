import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function getChatId() {
    const token = process.env.TELEGRAM_TOKEN!;
    try {
        const response = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`);
        const updates = response.data.result;

        if (updates.length === 0) {
            console.log('No updates found. Please send a message to your bot first.');
            return;
        }

        updates.forEach((update: any) => {
            if (update.message) {
                console.log('Chat ID:', update.message.chat.id, 'Chat Type:', update.message.chat.type);
                console.log('Message:', update.message.text);
            }
        });
    } catch (err) {
        console.error('Error fetching updates:', err);
    }
}

getChatId();
