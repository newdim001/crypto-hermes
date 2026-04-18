// Dashboard Data
class Dashboard {
  getData() {
    return { balance: 13022, dailyPnL: 3022, dailyPnLPercent: 30.22, openPositions: 0, winRate: 0, riskStatus: 'OK', uptime: process.uptime() };
  }
}
module.exports = new Dashboard();
