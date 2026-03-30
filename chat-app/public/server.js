const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });

app.use(express.static(path.join(__dirname, 'public')));

const CHANNELS = ['일반', '자유수다', '정보공유', '개발잡담', '코드리뷰', '짤방'];
const messages = {};
CHANNELS.forEach(ch => messages[ch] = []);
const channelHosts = {};
CHANNELS.forEach(ch => channelHosts[ch] = null);
const users = {};

function broadcastUsers() { io.emit('users', Object.values(users)); }
function broadcastHosts() { io.emit('hosts', { ...channelHosts }); }

function getChannelSockets(channel) {
  return [...io.sockets.sockets.values()].filter(s => s.currentChannel === channel);
}

io.on('connection', (socket) => {

  socket.on('join', ({ username, channel }) => {
    socket.username = username;
    socket.nameColor = '#' + Math.floor(Math.random()*0xAAAAAA + 0x333333).toString(16).padStart(6,'0');
    socket.currentChannel = channel || '일반';
    socket.join(socket.currentChannel);
    users[socket.id] = { username, nameColor: socket.nameColor };
    if (!channelHosts[socket.currentChannel]) channelHosts[socket.currentChannel] = username;
    broadcastUsers();
    broadcastHosts();
    socket.emit('history', { channel: socket.currentChannel, messages: messages[socket.currentChannel].slice(-100) });
    io.to(socket.currentChannel).emit('system', { channel: socket.currentChannel, text: `${username}님이 입장했습니다.` });
  });

  socket.on('switchChannel', (channel) => {
    if (socket.currentChannel) socket.leave(socket.currentChannel);
    socket.currentChannel = channel;
    socket.join(channel);
    if (!channelHosts[channel]) channelHosts[channel] = socket.username;
    broadcastHosts();
    socket.emit('history', { channel, messages: messages[channel].slice(-100) });
  });

  socket.on('message', ({ channel, text, replyTo }) => {
    const msg = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      username: socket.username,
      nameColor: socket.nameColor,
      text,
      replyTo: replyTo || null,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
      edited: false
    };
    messages[channel].push(msg);
    if (messages[channel].length > 300) messages[channel].shift();
    io.to(channel).emit('message', { channel, msg });
  });

  socket.on('image', ({ channel, dataUrl, filename, replyTo }) => {
    if (!dataUrl || dataUrl.length > 10 * 1024 * 1024) return;
    const msg = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      username: socket.username,
      nameColor: socket.nameColor,
      text: '',
      image: dataUrl,
      filename: filename || '이미지',
      replyTo: replyTo || null,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
      edited: false
    };
    messages[channel].push(msg);
    if (messages[channel].length > 300) messages[channel].shift();
    io.to(channel).emit('message', { channel, msg });
  });

  socket.on('editMessage', ({ channel, msgId, newText }) => {
    const msg = messages[channel]?.find(m => m.id === msgId);
    if (!msg || msg.username !== socket.username) return;
    msg.text = newText;
    msg.edited = true;
    io.to(channel).emit('editMessage', { channel, msgId, newText });
  });

  socket.on('deleteMessage', ({ channel, msgId }) => {
    const ch = messages[channel];
    if (!ch) return;
    const idx = ch.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    const isOwn = ch[idx].username === socket.username;
    const isHost = channelHosts[channel] === socket.username;
    if (!isOwn && !isHost) return;
    ch.splice(idx, 1);
    io.to(channel).emit('deleteMessage', { channel, msgId });
  });

  socket.on('reaction', ({ channel, msgId, emoji }) => {
    const msg = messages[channel]?.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(socket.username);
    if (idx === -1) msg.reactions[emoji].push(socket.username);
    else msg.reactions[emoji].splice(idx, 1);
    io.to(channel).emit('reaction', { channel, msgId, emoji, users: msg.reactions[emoji] });
  });

  socket.on('changeNameColor', ({ color }) => {
    socket.nameColor = color;
    if (users[socket.id]) users[socket.id].nameColor = color;
    Object.keys(messages).forEach(ch => {
      messages[ch].forEach(m => { if (m.username === socket.username) m.nameColor = color; });
    });
    broadcastUsers();
    io.emit('nameColorUpdate', { username: socket.username, color });
  });

  socket.on('kickUser', ({ username, channel }) => {
    if (channelHosts[channel] !== socket.username) return;
    const target = [...io.sockets.sockets.values()].find(s => s.username === username && s.currentChannel === channel);
    if (!target) return;
    target.emit('kicked', { channel, by: socket.username });
    target.leave(channel);
    target.currentChannel = null;
    io.to(channel).emit('system', { channel, text: `${username}님이 추방되었습니다.` });
  });

  socket.on('typing', ({ channel }) => {
    socket.to(channel).emit('typing', { username: socket.username });
  });

  socket.on('disconnect', () => {
    const username = socket.username;
    const channel = socket.currentChannel;
    delete users[socket.id];
    if (channel && channelHosts[channel] === username) {
      const nextSocket = getChannelSockets(channel).find(s => s.id !== socket.id);
      channelHosts[channel] = nextSocket ? nextSocket.username : null;
      broadcastHosts();
    }
    broadcastUsers();
    if (username && channel) {
      io.to(channel).emit('system', { channel, text: `${username}님이 퇴장했습니다.` });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
