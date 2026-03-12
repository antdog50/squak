const Datastore = require('@seald-io/nedb')
const path      = require('path')

const dir = path.join(__dirname)

// Three collections — each is a flat file, no compilation needed
const users    = new Datastore({ filename: path.join(dir, 'users.db'),    autoload: true })
const friends  = new Datastore({ filename: path.join(dir, 'friends.db'),  autoload: true })
const messages = new Datastore({ filename: path.join(dir, 'messages.db'), autoload: true })

// Indexes
users.ensureIndex({ fieldName: 'username', unique: true })
friends.ensureIndex({ fieldName: 'pair',   unique: true })
messages.ensureIndex({ fieldName: 'createdAt' })

// ── Promisified helpers ──────────────────────────────────────────────────
const db = {
  // Users
  createUser: (username, password) => new Promise((res, rej) => {
    users.insert({ username, password, createdAt: Date.now() }, (err, doc) => err ? rej(err) : res(doc))
  }),

  findByUsername: (username) => new Promise((res, rej) => {
    users.findOne({ username: new RegExp(`^${username}$`, 'i') }, (err, doc) => err ? rej(err) : res(doc))
  }),

  findById: (id) => new Promise((res, rej) => {
    users.findOne({ _id: id }, (err, doc) => err ? rej(err) : res(doc))
  }),

  // Messages
  saveMessage: (fromId, toId, text) => new Promise((res, rej) => {
    messages.insert({ fromId, toId, text, createdAt: Date.now() }, (err, doc) => err ? rej(err) : res(doc))
  }),

  getHistory: (userId, withId) => new Promise((res, rej) => {
    messages.find({
      $or: [
        { fromId: userId, toId: withId },
        { fromId: withId, toId: userId },
      ]
    }).sort({ createdAt: 1 }).limit(100).exec((err, docs) => err ? rej(err) : res(docs))
  }),

  // Friends
  sendRequest: (userId, friendId) => new Promise((res, rej) => {
    const pair = [userId, friendId].sort().join('_')
    friends.findOne({ pair }, (err, existing) => {
      if (existing) return res(existing)
      friends.insert({ userId, friendId, pair, status: 'pending', createdAt: Date.now() },
        (err2, doc) => err2 ? rej(err2) : res(doc))
    })
  }),

  acceptRequest: (fromId, toId) => new Promise((res, rej) => {
    friends.update({ userId: fromId, friendId: toId, status: 'pending' }, { $set: { status: 'accepted' } }, {},
      (err, n) => err ? rej(err) : res(n))
  }),

  getFriends: (userId) => new Promise((res, rej) => {
    friends.find({ status: 'accepted', $or: [{ userId }, { friendId: userId }] }, async (err, docs) => {
      if (err) return rej(err)
      const ids = docs.map(d => d.userId === userId ? d.friendId : d.userId)
      users.find({ _id: { $in: ids } }, { username: 1 }, (e, us) => e ? rej(e) : res(us))
    })
  }),

  getPendingIn: (userId) => new Promise((res, rej) => {
    friends.find({ friendId: userId, status: 'pending' }, (err, docs) => {
      if (err) return rej(err)
      const ids = docs.map(d => d.userId)
      users.find({ _id: { $in: ids } }, { username: 1 }, (e, us) => e ? rej(e) : res(us))
    })
  }),

  getPendingOut: (userId) => new Promise((res, rej) => {
    friends.find({ userId, status: 'pending' }, (err, docs) => {
      if (err) return rej(err)
      const ids = docs.map(d => d.friendId)
      users.find({ _id: { $in: ids } }, { username: 1 }, (e, us) => e ? rej(e) : res(us))
    })
  }),

  removeFriend: (userId, friendId) => new Promise((res, rej) => {
    const pair = [userId, friendId].sort().join('_')
    friends.remove({ pair }, {}, (err, n) => err ? rej(err) : res(n))
  }),
}

module.exports = db
