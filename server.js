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
    
    console.log(`[登録] ${user.icon} ${user.name}`);
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
    console.log(`[メッセージ] ${user.icon} ${user.name}: ${data.text}${data.superChat ? ` (SC ¥${data.superChat.amount})` : ''}`);
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
      console.log(`[退出] ${user.icon} ${user.name}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 ライブチャットサーバー起動中: http://localhost:${PORT}`);
});
