#!/usr/bin/env bash
# Sobe o WarBit numa VM Ubuntu (Oracle Cloud Always Free ou qualquer VPS).
# Uso, dentro da VM:  curl -fsSL https://raw.githubusercontent.com/Patrickx7/Warbit/main/deploy/oracle-setup.sh | bash
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y docker.io git curl
sudo systemctl enable --now docker

if [ -d "$HOME/warbit/.git" ]; then git -C "$HOME/warbit" pull; else git clone https://github.com/Patrickx7/Warbit.git "$HOME/warbit"; fi
cd "$HOME/warbit"

sudo docker build -t warbit .
sudo docker rm -f warbit 2>/dev/null || true
# porta 80 do mundo -> 8080 do jogo; volume guarda o banco (cash e XP) entre reinícios
sudo docker run -d --name warbit --restart unless-stopped -p 80:8080 -v warbit-data:/data warbit

# a imagem Ubuntu da Oracle bloqueia portas no firewall da própria VM
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

echo
echo "Pronto! Abra: http://$(curl -s ifconfig.me)"
echo "(se não abrir, falta liberar a porta 80 na Security List da VCN, no painel da Oracle)"
