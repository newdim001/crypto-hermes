#!/usr/bin/env node
/**
 * CryptoEdge Dashboard Data Updater
 * Reads real data and writes dashboard-data.json + updates dashboard.html
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LOGS_DIR = path.join(ROOT, 'logs');

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseSignalsFromLog() {
  try {
    const log = fs.readFileSync(path.join(LOGS_DIR, 'cron.log'), 'utf8');
    const lines = log.split('\n');
    
    // Find the last scan block
    let lastScanStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('Scanning') && lines[i].includes('symbols')) {
        lastScanStart = i;
        break;
      }
    }
    
    if (lastScanStart === -1) return [];
    
    const signals = [];
    const symbolRegex = /^([A-Z]+USDT):\s+(LONG|SHORT|HOLD)\s+\((\d+)%\)/;
    const rsiRegex = /RSI:\s+([\d.]+)/;
    const priceRegex = /Price:\s+\$([\d.]+)/;
    const htfRegex = /HTF:\s+(BULLISH|BEARISH)/;

    for (let i = lastScanStart; i < Math.min(lastScanStart + 40, lines.length); i++) {
      const match = lines[i].match(symbolRegex);
      if (match) {
        const [, symbol, direction, confidence] = match;
        const rsiMatch = lines[i].match(rsiRegex);
        const priceMatch = lines[i].match(priceRegex);
        const htfLine = lines[i - 1] || '';
        const htfMatch = htfLine.match(htfRegex);
        
        signals.push({
          symbol,
          direction,
          confidence: parseInt(confidence),
          rsi: rsiMatch ? parseFloat(rsiMatch[1]) : null,
          price: priceMatch ? parseFloat(priceMatch[1]) : null,
          trend: htfMatch ? htfMatch[1] : 'NEUTRAL'
        });
      }
    }
    return signals;
  } catch {
    return [];
  }
}

function parsePositionsFromLog() {
  try {
    const log = fs.readFileSync(path.join(LOGS_DIR, 'cron.log'), 'utf8');
    const lines = log.split('\n');
    
    // Find last positions block
    let lastPosStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('open position') || lines[i].includes('Position')) {
        lastPosStart = i;
        break;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function parsePnLFromLog() {
  try {
    const log = fs.readFileSync(path.join(LOGS_DIR, 'cron.log'), 'utf8');
    const lines = log.split('\n').reverse();
    
    for (const line of lines) {
      const match = line.match(/Today's P&L:\s+\$([-\d.]+)\s+\(([-\d.]+)%\)/);
      if (match) {
        return { pnl: parseFloat(match[1]), pnlPct: parseFloat(match[2]) };
      }
    }
    return { pnl: 0, pnlPct: 0 };
  } catch {
    return { pnl: 0, pnlPct: 0 };
  }
}

// Read all data sources
const state = readJson(path.join(DATA_DIR, 'state.json'), {
  balance: 10000, totalTrades: 0, totalPnl: 0, mode: 'ml-paper'
});
const journal = readJson(path.join(DATA_DIR, 'trading-journal.json'), []);
const mlModel = readJson(path.join(DATA_DIR, 'ml-model.json'), {});
const signals = parseSignalsFromLog();
const { pnl, pnlPct } = parsePnLFromLog();

// Calculate stats from journal
const completedTrades = Array.isArray(journal) ? journal.filter(t => t.pnl !== null) : [];
const wins = completedTrades.filter(t => t.pnl > 0).length;
const losses = completedTrades.filter(t => t.pnl < 0).length;
const winRate = completedTrades.length > 0 ? ((wins / completedTrades.length) * 100).toFixed(1) : 0;
const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

const dashboardData = {
  lastUpdated: new Date().toISOString(),
  portfolio: {
    balance: state.balance || 10000,
    mode: state.mode || 'ml-paper',
    totalTrades: state.totalTrades || completedTrades.length,
    totalPnl: state.totalPnl || totalPnl,
    todayPnl: pnl,
    todayPnlPct: pnlPct,
    wins,
    losses,
    winRate: parseFloat(winRate),
    totalValue: state.balance || 10000
  },
  signals: signals.slice(0, 10),
  recentTrades: completedTrades.slice(-10).reverse(),
  mlModel: {
    type: mlModel.type || 'Logistic Regression',
    features: mlModel.features || 12,
    trainingSamples: mlModel.trainingSamples || 0,
    lastTrained: mlModel.lastTrained || state.initialized
  }
};

// Write dashboard-data.json
const outPath = path.join(DATA_DIR, 'dashboard-data.json');
fs.writeFileSync(outPath, JSON.stringify(dashboardData, null, 2));
console.log('✅ dashboard-data.json updated');
console.log(`   Balance: $${dashboardData.portfolio.balance.toFixed(2)}`);
console.log(`   Trades: ${dashboardData.portfolio.totalTrades} | Win rate: ${dashboardData.portfolio.winRate}%`);
console.log(`   Signals: ${dashboardData.signals.length} symbols`);
console.log(`   Today P&L: $${dashboardData.portfolio.todayPnl} (${dashboardData.portfolio.todayPnlPct}%)`);

// Update dashboard.html - inject data loader
const dashboardPath = path.join(ROOT, 'dashboard.html');
let html;
try {
  html = fs.readFileSync(dashboardPath, 'utf8');
} catch(e) {
  console.log('⚠️ dashboard.html not found or unreadable, skipping patch:', e.message);
  html = null;
}

// Replace hardcoded JS data block with dynamic loader
const dynamicLoader = `
      // ── Dynamic Data Loader ──────────────────────────────────────
      const DASHBOARD_DATA_PATH = 'data/dashboard-data.json';
      
      async function loadDashboardData() {
        try {
          const resp = await fetch(DASHBOARD_DATA_PATH + '?t=' + Date.now());
          return await resp.json();
        } catch(e) {
          console.warn('Could not load dashboard-data.json, using fallback');
          return null;
        }
      }
      
      async function refreshDashboard() {
        const data = await loadDashboardData();
        if (!data) return;
        
        const p = data.portfolio;
        
        // Balance & portfolio
        document.getElementById('balance') && (document.getElementById('balance').textContent = '$' + p.balance.toLocaleString('en-US', {minimumFractionDigits: 2}));
        document.getElementById('mode') && (document.getElementById('mode').textContent = p.mode === 'ml-paper' ? 'Paper Trading' : 'Live Trading');
        document.getElementById('total-value') && (document.getElementById('total-value').textContent = '$' + p.totalValue.toLocaleString('en-US', {minimumFractionDigits: 2}));
        
        // P&L
        const pnlEl = document.getElementById('unrealized-pnl');
        if (pnlEl) {
          pnlEl.textContent = (p.todayPnl >= 0 ? '+' : '') + '$' + p.todayPnl.toFixed(2) + ' (' + (p.todayPnlPct >= 0 ? '+' : '') + p.todayPnlPct.toFixed(2) + '%)';
          pnlEl.className = 'card-value ' + (p.todayPnl >= 0 ? 'green' : 'red');
        }
        
        // Signals table
        const sigTable = document.getElementById('signals-body') || document.getElementById('signals-table');
        if (sigTable && data.signals.length > 0) {
          sigTable.innerHTML = data.signals.map(s => \`
            <tr>
              <td>\${s.symbol}</td>
              <td class="\${s.direction === 'LONG' ? 'green' : s.direction === 'SHORT' ? 'red' : ''}">\${s.direction}</td>
              <td>\${s.confidence}%</td>
              <td>RSI: \${s.rsi ? s.rsi.toFixed(1) : '-'} | \${s.trend}</td>
            </tr>
          \`).join('');
        }
        
        // Trades table
        const tradesEl = document.getElementById('trades-body') || document.getElementById('recent-trades');
        if (tradesEl) {
          if (data.recentTrades.length === 0) {
            tradesEl.innerHTML = '<tr><td colspan="6">No completed trades yet</td></tr>';
          } else {
            tradesEl.innerHTML = data.recentTrades.map(t => \`
              <tr>
                <td>\${t.symbol}</td>
                <td>\${t.side}</td>
                <td>$\${t.price?.toFixed(2) || '-'}</td>
                <td>\${t.quantity}</td>
                <td class="\${(t.pnl || 0) >= 0 ? 'green' : 'red'}">\${t.pnl ? (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2) : '-'}</td>
                <td>\${t.date ? new Date(t.date).toLocaleDateString() : '-'}</td>
              </tr>
            \`).join('');
          }
        }
        
        document.getElementById('last-updated') && (document.getElementById('last-updated').textContent = 'Last updated: ' + new Date(data.lastUpdated).toLocaleTimeString());
      }
      
      // Load on start + refresh every 60s
      refreshDashboard();
      setInterval(refreshDashboard, 60000);
`;

// Inject before closing </script> or append to first <script> block after <body>
if (html) {
  if (html.includes('// ── Dynamic Data Loader ──')) {
    // Already patched - update only
    console.log('✅ Dashboard already patched, data refreshed');
  } else {
    // Find the hardcoded portfolio data and replace
    html = html.replace(
      /\/\/ .*?portfolio.*?\n.*?balance:\s*[\d.]+,[\s\S]*?totalValue:[\s\S]*?\}/,
      '// Data loaded dynamically - see data/dashboard-data.json'
    );

    // Inject dynamic loader before </body>
    html = html.replace('</body>', `<script>\n${dynamicLoader}\n</script>\n</body>`);
    fs.writeFileSync(dashboardPath, html);
    console.log('✅ dashboard.html patched with dynamic data loader');
  }
}
