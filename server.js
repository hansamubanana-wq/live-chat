const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Connected users
const users = new Map();

// Super Chat stats
const scStats = {
  totalAmount: 0,
  userTotals: new Map(), // name -> { name, icon, total }
};

function getScRanking() {
  return Array.from(scStats.userTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function broadcastScStats() {
  io.emit('sc-stats-update', {
    totalAmount: scStats.totalAmount,
    ranking: getScRanking(),
  });
}

io.on('connection', (socket) => {
  console.log(`[接続] ${socket.id}`);

  // User registration
  socket.on('register', (userData) => {
    const user = {
      id: socket.id,
      name: userData.name,
      icon: userData.icon,
      joinedAt: Date.now()
    };
    users.set(socket.id, user);
    
    // Notify everyone
    io.emit('user-joined', {
      user,
      onlineCount: users.size
    });
    
    // Send current user list to the new user
    socket.emit('user-list', {
      users: Array.from(users.values()),
      onlineCount: users.size
    });

    // Send current SC stats to the new user
    socket.emit('sc-stats-update', {
      totalAmount: scStats.totalAmount,
      ranking: getScRanking(),
    });
    
    console.log(`[登録] ${user.name}`);
  });

  // Chat message
  socket.on('chat-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user,
      text: data.text,
      timestamp: Date.now(),
      superChat: data.superChat || null
    };

    io.emit('chat-message', message);

    // Update SC stats if super chat
    if (data.superChat && data.superChat.amount > 0) {
      const amount = data.superChat.amount;
      scStats.totalAmount += amount;

      const existing = scStats.userTotals.get(user.name);
      if (existing) {
        existing.total += amount;
        existing.icon = user.icon; // Update icon in case it changed
      } else {
        scStats.userTotals.set(user.name, {
          name: user.name,
          icon: user.icon,
          total: amount,
        });
      }

      broadcastScStats();
    }

    console.log(`[メッセージ] ${user.name}: ${data.text}${data.superChat ? ` (SC ¥${data.superChat.amount})` : ''}`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      io.emit('user-left', {
        user,
        onlineCount: users.size
      });
      console.log(`[退出] ${user.name}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 ライブチャットサーバー起動中: http://localhost:${PORT}`);
});
