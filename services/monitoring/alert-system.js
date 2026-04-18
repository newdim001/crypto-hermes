// CryptoEdge Alert System
const axios = require('axios');
const TelegramBot = '8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU';
const ChatId = '-1003893445582'; // Sam bot group
const TopicId = '30'; // Auto-Biz topic

class AlertSystem {
  async send(level, title, message) {
    const emoji = { CRITICAL: '🛑', WARNING: '⚠️', INFO: 'ℹ️' }[level] || '📝';
    const text = `${emoji} *${level}: ${title}*\n${message}`;
    try {
      await axios.post(`https://api.telegram.org/bot${TelegramBot}/sendMessage`, { 
        chat_id: ChatId, 
        text, 
        parse_mode: 'Markdown',
        message_thread_id: TopicId
      });
      console.log(`✅ Alert: ${level}`);
    } catch (e) { console.log('Alert failed'); }
  }
  critical(t, m) { this.send('CRITICAL', t, m); }
  warning(t, m) { this.send('WARNING', t, m); }
  info(t, m) { this.send('INFO', t, m); }
}
module.exports = new AlertSystem();
