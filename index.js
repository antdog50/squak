const { createServer } = require('http')
const { Server } = require('socket.io')

const PORT = 3001
const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

// Track connected users: { socketId -> { username, id } }
const connectedUsers = new Map()

console.log(`\n🚀 CommsApp server starting on port ${PORT}...\n`)

io.on('connection', (socket) => {

  // ── User registers their username on connect ──────────────────────────
  socket.on('user:register', (username) => {
    const user = { username, id: socket.id }
    connectedUsers.set(socket.id, user)

    console.log(`✅ ${username} connected  (${socket.id})`)

    // Send this user the current online list
    const onlineList = Array.from(connectedUsers.values())
    socket.emit('users:list', onlineList)

    // Tell everyone else this user came online
    socket.broadcast.emit('user:joined', user)
  })

  // ── Direct message ────────────────────────────────────────────────────
  socket.on('message:send', ({ toSocketId, text }) => {
    const from = connectedUsers.get(socket.id)
    if (!from) return

    const payload = {
      id:       Date.now(),
      from:     from.username,
      fromId:   socket.id,
      text,
      time:     new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }

    // Send to recipient
    io.to(toSocketId).emit('message:receive', payload)

    // Echo back to sender so it shows in their own chat
    socket.emit('message:sent', { ...payload, toSocketId })

    console.log(`💬 ${from.username} → ${connectedUsers.get(toSocketId)?.username ?? '?'}: ${text}`)
  })

  // ── Typing indicator ──────────────────────────────────────────────────
  socket.on('typing:start', ({ toSocketId }) => {
    const from = connectedUsers.get(socket.id)
    if (from) io.to(toSocketId).emit('typing:start', { fromId: socket.id, username: from.username })
  })

  socket.on('typing:stop', ({ toSocketId }) => {
    io.to(toSocketId).emit('typing:stop', { fromId: socket.id })
  })

  // ── Disconnect ────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id)
    if (user) {
      console.log(`❌ ${user.username} disconnected`)
      connectedUsers.delete(socket.id)
      io.emit('user:left', { id: socket.id, username: user.username })
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`✅ Server live at http://localhost:${PORT}`)
  console.log(`   Waiting for clients to connect...\n`)
})
