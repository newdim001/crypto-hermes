// CryptoEdge Audit Trail
class AuditLogger {
  log(event) { console.log(`📝 [${event.type}]`, event.action || ''); }
  logSignal(a,s,sc,co,r) { this.log({type:'SIGNAL',action:`${a}:${s}:${sc}`}); }
  logRiskCheck(c,p) { this.log({type:'RISK_CHECK',action:p?'PASS':'FAIL'}); }
  logTrade(t) { this.log({type:'TRADE',action:`${t.side} ${t.symbol} @ ${t.price}`}); }
  logDecision(d) { this.log({type:'DECISION',action:d.approved?'APPROVED':'REJECTED'}); }
  logError(e) { this.log({type:'ERROR',action:e.message}); }
  logSystem(e) { this.log({type:'SYSTEM',action:e.event}); }
}
module.exports = new AuditLogger();
