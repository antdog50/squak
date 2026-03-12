const { createServer } = require('http')
const { Server }       = require('socket.io')
const { AccessToken }  = require('livekit-server-sdk')
const jwt              = require('jsonwebtoken')
const bcrypt           = require('bcryptjs')

const PORT             = 3001
const JWT_SECRET       = 'commsapp_jwt_secret_changeme_2024'
const LK_API_KEY       = 'devkey'
const LK_API_SECRET    = 'devsecret_commsapp_localdev_key123'
const LK_HOST          = 'ws://157.245.0.170:7880'
const MAX_FILE_SIZE    = 100 * 1024 * 1024

let db = null
try {
  db = require('./db')
  console.log('✅ Database loaded')
} catch (e) {
  console.warn('⚠️  Database not available:', e.message)
}

// ── HTTP ──────────────────────────────────────────────────────────────────
const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // Register
  if (req.method === 'POST' && url.pathname === '/auth/register') {
    const { username, password } = JSON.parse(await readBody(req))
    if (!username || !password || username.length < 2 || password.length < 4)
      return json(res, 400, { error: 'Username min 2 chars, password min 4 chars' })
    if (!db) return json(res, 503, { error: 'Database not available' })
    try {
      const hash = bcrypt.hashSync(password, 10)
      const user = await db.createUser(username.trim(), hash)
      const token = signToken({ id: user._id, username: user.username })
      return json(res, 200, { token, username: user.username, id: user._id })
    } catch { return json(res, 409, { error: 'Username already taken' }) }
  }

  // Login
  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const { username, password } = JSON.parse(await readBody(req))
    if (!db) return json(res, 503, { error: 'Database not available' })
    const user = await db.findByUsername(username)
    if (!user || !bcrypt.compareSync(password, user.password))
      return json(res, 401, { error: 'Invalid username or password' })
    const token = signToken({ id: user._id, username: user.username })
    return json(res, 200, { token, username: user.username, id: user._id })
  }

  // Livekit token
  if (url.pathname === '/livekit-token') {
    const user = authFromHeader(req)
    if (!user) return json(res, 401, { error: 'Unauthorized' })
    const room = url.searchParams.get('room')
    if (!room) return json(res, 400, { error: 'Missing room' })
    const lkToken = new AccessToken(LK_API_KEY, LK_API_SECRET, { identity: user.username, ttl: '4h' })
    lkToken.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true })
    return json(res, 200, { token: await lkToken.toJwt(), url: LK_HOST })
  }

  // Message history
  if (url.pathname === '/history') {
    const user = authFromHeader(req)
    if (!user) return json(res, 401, { error: 'Unauthorized' })
    if (!db) return json(res, 200, { messages: [] })
    const withId = url.searchParams.get('withId')
    if (!withId) return json(res, 400, { error: 'Missing withId' })
    const msgs = await db.getHistory(user.id, withId)
    return json(res, 200, { messages: msgs })
  }

  // Get friends
  if (req.method === 'GET' && url.pathname === '/friends') {
    const user = authFromHeader(req)
    if (!user || !db) return json(res, 401, { error: 'Unauthorized' })
    const [friends, pendingIn, pendingOut] = await Promise.all([
      db.getFriends(user.id),
      db.getPendingIn(user.id),
      db.getPendingOut(user.id),
    ])
    return json(res, 200, { friends, pendingIn, pendingOut })
  }

  // Add friend
  if (req.method === 'POST' && url.pathname === '/friends/add') {
    const user = authFromHeader(req)
    if (!user || !db) return json(res, 401, { error: 'Unauthorized' })
    const { username } = JSON.parse(await readBody(req))
    const target = await db.findByUsername(username)
    if (!target) return json(res, 404, { error: 'User not found' })
    if (target._id === user.id) return json(res, 400, { error: "Can't add yourself" })
    await db.sendRequest(user.id, target._id)
    return json(res, 200, { message: 'Request sent', target: { id: target._id, username: target.username } })
  }

  // Accept friend
  if (req.method === 'POST' && url.pathname === '/friends/accept') {
    const user = authFromHeader(req)
    if (!user || !db) return json(res, 401, { error: 'Unauthorized' })
    const { fromId } = JSON.parse(await readBody(req))
    await db.acceptRequest(fromId, user.id)
    // Create reverse so both sides show as friends
    await db.sendRequest(user.id, fromId)
    await db.acceptRequest(user.id, fromId)
    return json(res, 200, { message: 'Accepted' })
  }

  // Remove friend
  if (req.method === 'POST' && url.pathname === '/friends/remove') {
    const user = authFromHeader(req)
    if (!user || !db) return json(res, 401, { error: 'Unauthorized' })
    const { friendId } = JSON.parse(await readBody(req))
    await db.removeFriend(user.id, friendId)
    return json(res, 200, { message: 'Removed' })
  }

  res.writeHead(404); res.end('Not found')
})

// ── Socket.io ─────────────────────────────────────────────────────────────
const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 128 * 1024 })
const connectedUsers = new Map()

console.log('\n🚀 CommsApp server starting...\n')

io.on('connection', (socket) => {
  socket.on('user:register', ({ username, token, userId }) => {
    let uid = userId, uname = username
    if (token) {
      try { const d = jwt.verify(token, JWT_SECRET); uid = d.id; uname = d.username } catch {}
    }
    connectedUsers.set(socket.id, { username: uname, id: uid, socketId: socket.id })
    console.log(`✅ ${uname} connected`)
    socket.emit('users:list', Array.from(connectedUsers.values()))
    socket.broadcast.emit('user:joined', { username: uname, id: uid, socketId: socket.id })
  })

  socket.on('message:send', async ({ toSocketId, toUserId, text }) => {
    const from = connectedUsers.get(socket.id)
    if (!from) return
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const payload = { id: Date.now(), from: from.username, fromId: socket.id, fromUserId: from.id, text, time }
    if (db && from.id && toUserId) {
      try { await db.saveMessage(from.id, toUserId, text) } catch {}
    }
    io.to(toSocketId).emit('message:receive', payload)
    socket.emit('message:sent', { ...payload, toSocketId })
    console.log(`💬 ${from.username} → ${connectedUsers.get(toSocketId)?.username ?? '?'}: ${text}`)
  })

  socket.on('typing:start', ({ toSocketId }) => {
    const from = connectedUsers.get(socket.id)
    if (from) io.to(toSocketId).emit('typing:start', { fromId: socket.id })
  })
  socket.on('typing:stop', ({ toSocketId }) => io.to(toSocketId).emit('typing:stop', { fromId: socket.id }))

  socket.on('file:offer',  ({ toSocketId, fileId, name, size, mimeType }) => {
    const from = connectedUsers.get(socket.id)
    if (!from) return
    if (size > MAX_FILE_SIZE) { socket.emit('file:error', { fileId, message: 'File exceeds 100MB' }); return }
    io.to(toSocketId).emit('file:offer', { fileId, name, size, mimeType, fromId: socket.id, fromUsername: from.username })
  })
  socket.on('file:accept', ({ fileId, toSocketId }) => io.to(toSocketId).emit('file:accepted', { fileId }))
  socket.on('file:chunk',  ({ toSocketId, fileId, chunk, chunkIndex, totalChunks }) => io.to(toSocketId).emit('file:chunk', { fileId, chunk, chunkIndex, totalChunks }))
  socket.on('file:done',   ({ toSocketId, fileId }) => { io.to(toSocketId).emit('file:done', { fileId }); console.log(`✅ File done: ${fileId}`) })
  socket.on('file:error',  ({ toSocketId, fileId, message }) => io.to(toSocketId).emit('file:error', { fileId, message }))

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id)
    if (user) {
      console.log(`❌ ${user.username} disconnected`)
      connectedUsers.delete(socket.id)
      io.emit('user:left', { id: socket.id })
    }
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────
function signToken(p) { return jwt.sign(p, JWT_SECRET, { expiresIn: '30d' }) }
function authFromHeader(req) {
  try { return jwt.verify((req.headers['authorization'] || '').replace('Bearer ', ''), JWT_SECRET) } catch { return null }
}
function readBody(req) {
  return new Promise((res, rej) => { let d = ''; req.on('data', c => d += c); req.on('end', () => res(d)); req.on('error', rej) })
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }

httpServer.listen(PORT, () => {
  console.log(`✅ Server → http://localhost:${PORT}\n`)
})
