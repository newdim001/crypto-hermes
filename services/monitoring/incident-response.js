// Incident Response
const axios = require('axios');
class IncidentResponse {
  async triggerKillSwitch(reason) {
    console.log('🛑 KILL SWITCH:', reason);
    try {
      await axios.post(`https://api.telegram.org/bot8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU/sendMessage`, { chat_id: '8169173316', text: `🛑 *KILL SWITCH*\nReason: ${reason}`, parse_mode: 'Markdown' });
    } catch (e) {}
    return { triggered: true, reason, timestamp: Date.now() };
  }
}
module.exports = new IncidentResponse();
