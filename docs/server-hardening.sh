#!/bin/bash
# Server Hardening Script for CryptoBot
# Run as: sudo ./server-hardening.sh

set -e

echo "🔒 CryptoBot Server Hardening"
echo "=============================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}Warning: Not running as root. Some features may not work.${NC}"
fi

# 1. Update system
echo -e "\n📦 Updating system packages..."
if command -v apt-get &> /dev/null; then
    apt-get update && apt-get upgrade -y
elif command -v brew &> /dev/null; then
    brew update && brew upgrade
fi

# 2. Install fail2ban
echo -e "\n🛡️ Installing fail2ban..."
if command -v apt-get &> /dev/null; then
    apt-get install -y fail2ban
    cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
    systemctl enable fail2ban
    systemctl start fail2ban
elif command -v brew &> /dev/null; then
    brew install fail2ban 2>/dev/null || echo "fail2ban not available on macOS"
fi

# 3. Configure firewall (UFW)
echo -e "\n🔥 Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp   # HTTP
    ufw allow 443/tcp  # HTTPS
    ufw allow 18789    # OpenClaw
    ufw status
fi

# 4. Setup automatic security updates
echo -e "\n🔄 Setting up automatic security updates..."
if command -v apt-get &> /dev/null; then
    apt-get install -y unattended-upgrades
    dpkg-reconfigure -plow unattended-upgrades
fi

# 5. Create crypto-bot user (if not exists)
echo -e "\n👤 Creating dedicated user for crypto-bot..."
if id "cryptobot" &>/dev/null; then
    echo "User cryptobot already exists"
else
    useradd -m -s /bin/bash -G sudo cryptobot
    echo "cryptobot:cryptobot123" | chpasswd  # Change this!
    echo "Created user cryptobot - CHANGE THE PASSWORD!"
fi

# 6. Setup log rotation
echo -e "\n📝 Configuring log rotation..."
cat > /etc/logrotate.d/crypto-bot <<EOF
/Users/suren/.openclaw/workspace/crypto-bot/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 suren staff
}
EOF

# 7. Setup intrusion detection hints
echo -e "\n👁️ Setting up basic intrusion detection..."
if command -v apt-get &> /dev/null; then
    apt-get install -y auditd
fi

# 8. Configure SSH hardening
echo -e "\n🔑 Hardening SSH configuration..."
if [ -f /etc/ssh/sshd_config ]; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
    
    # Apply SSH hardening
    sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
    sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
    sed -i 's/^#*MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
    
    # Restart SSH
    systemctl reload sshd
fi

# 9. Setup monitoring cron
echo -e "\n⏰ Setting up monitoring cron..."
CRON_SCRIPT="/usr/local/bin/crypto-bot-monitor.sh"
cat > $CRON_SCRIPT <<'EOF'
#!/bin/bash
# CryptoBot Health Monitor

# Check if OpenClaw is running
if ! pgrep -x "openclaw" > /dev/null; then
    echo "OpenClaw not running!" | mail -s "Alert" admin@example.com
fi

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "Disk usage at ${DISK_USAGE}%!" | mail -s "Alert" admin@example.com
fi

# Check memory
MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo "Memory usage at ${MEM_USAGE}%!" | mail -s "Alert" admin@example.com
fi
EOF

chmod +x $CRON_SCRIPT
(crontab -l 2>/dev/null || true; echo "*/5 * * * * $CRON_SCRIPT") | crontab -

# 10. Create backup script
echo -e "\n💾 Creating automated backup script..."
BACKUP_SCRIPT="/usr/local/bin/crypto-bot-backup.sh"
cat > $BACKUP_SCRIPT <<'EOF'
#!/bin/bash
BACKUP_DIR="/backup/crypto-bot"
SOURCE_DIR="/Users/suren/.openclaw/workspace/crypto-bot/data"

mkdir -p $BACKUP_DIR

# Daily incremental
tar -czf $BACKUP_DIR/daily-$(date +%Y%m%d).tar.gz $SOURCE_DIR

# Keep only last 7 daily backups
find $BACKUP_DIR -name "daily-*.tar.gz" -mtime +7 -delete
EOF

chmod +x $BACKUP_SCRIPT
(crontab -l 2>/dev/null || true; echo "0 2 * * * $BACKUP_SCRIPT") | crontab -

# Summary
echo -e "\n${GREEN}✅ Server Hardening Complete!${NC}"
echo ""
echo "Summary of changes:"
echo "  - System packages updated"
echo "  - Fail2ban installed and configured"
echo "  - Firewall configured (UFW)"
echo "  - Automatic security updates enabled"
echo "  - SSH hardened"
echo "  - Log rotation configured"
echo "  - Monitoring cron setup (every 5 min)"
echo "  - Backup cron setup (daily at 2 AM)"
echo ""
echo "Next steps:"
echo "  1. Change the cryptobot user password!"
echo "  2. Add your SSH public key to ~/.ssh/authorized_keys"
echo "  3. Test fail2ban: sudo fail2ban-client status"
echo "  4. Check firewall: sudo ufw status verbose"
