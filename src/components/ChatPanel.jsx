import { useState, useEffect, useRef } from 'react'
import { Send, Paperclip, Smile, Clock } from 'lucide-react'
import { useSocket, API } from '../SocketContext'

export default function ChatPanel({ contact, user, onNewMessage }) {
  const { socket } = useSocket() || {}
  const [conversations, setConversations] = useState({})
  const [input, setInput]       = useState('')
  const [typingUsers, setTypingUsers] = useState({})
  const [loadingHistory, setLoadingHistory] = useState(false)
  const bottomRef  = useRef(null)
  const typingTimer = useRef(null)
  const loadedRef  = useRef({})

  const msgs = contact ? (conversations[contact.socketId] || []) : []

  // Load message history when contact changes
  useEffect(() => {
    if (!contact || !user?.token || !contact.id) return
    if (loadedRef.current[contact.id]) return
    loadedRef.current[contact.id] = true

    setLoadingHistory(true)
    fetch(`${API}/history?withId=${contact.id}`, {
      headers: { Authorization: `Bearer ${user.token}` }
    })
      .then(r => r.json())
      .then(({ messages }) => {
        if (!messages?.length) return
        const formatted = messages.map(m => ({
          id:   m.id,
          from: m.from_id === user.id ? 'me' : 'them',
          text: m.text,
          time: new Date(m.created_at * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          historical: true,
        }))
        setConversations(prev => ({
          ...prev,
          [contact.socketId]: formatted,
        }))
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [contact?.id, user?.token])

  // Socket listeners
  useEffect(() => {
    if (!socket) return

    const onReceive = (payload) => {
      setConversations(prev => {
        const key = payload.fromId
        return { ...prev, [key]: [...(prev[key] || []), { ...payload, from: 'them' }] }
      })
      onNewMessage?.(payload.fromId)
    }

    const onSent = (payload) => {
      setConversations(prev => {
        const key = payload.toSocketId
        return { ...prev, [key]: [...(prev[key] || []), { ...payload, from: 'me' }] }
      })
    }

    const onTypingStart = ({ fromId }) => setTypingUsers(p => ({ ...p, [fromId]: true }))
    const onTypingStop  = ({ fromId }) => setTypingUsers(p => ({ ...p, [fromId]: false }))

    socket.on('message:receive', onReceive)
    socket.on('message:sent',    onSent)
    socket.on('typing:start',    onTypingStart)
    socket.on('typing:stop',     onTypingStop)

    return () => {
      socket.off('message:receive', onReceive)
      socket.off('message:sent',    onSent)
      socket.off('typing:start',    onTypingStart)
      socket.off('typing:stop',     onTypingStop)
    }
  }, [socket])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, typingUsers])

  const send = () => {
    if (!input.trim() || !contact || !socket) return
    socket.emit('message:send', {
      toSocketId: contact.socketId,
      toUserId:   contact.id,
      text:       input.trim(),
    })
    socket.emit('typing:stop', { toSocketId: contact.socketId })
    setInput('')
    clearTimeout(typingTimer.current)
  }

  const onInputChange = (e) => {
    setInput(e.target.value)
    if (!contact || !socket) return
    socket.emit('typing:start', { toSocketId: contact.socketId })
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      socket.emit('typing:stop', { toSocketId: contact.socketId })
    }, 1500)
  }

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  if (!contact) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>💬</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Select someone to chat with</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick a contact or friend from the sidebar</div>
      </div>
    )
  }

  const isTyping = contact && typingUsers[contact.socketId]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 52,
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${contact.color}22`, border: `1px solid ${contact.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: contact.color, fontFamily: 'var(--font-mono)',
        }}>
          {contact.username?.[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{contact.username}</div>
          <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>● online</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loadingHistory && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            <Clock size={12} /> Loading history...
          </div>
        )}
        {!loadingHistory && msgs.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            No messages yet — say hi to {contact.username}!
          </div>
        )}
        {msgs.map((msg, i) => {
          const isMe     = msg.from === 'me'
          const prevSame = i > 0 && msgs[i - 1].from === msg.from
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
              alignItems: 'flex-end', gap: 8,
              marginTop: prevSame ? 2 : 14,
              animation: msg.historical ? 'none' : 'slide-in-up 0.15s ease',
            }}>
              {!isMe && !prevSame && (
                <div style={{
                  width: 26, height: 26, borderRadius: 5, flexShrink: 0,
                  background: `${contact.color}22`, border: `1px solid ${contact.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: contact.color, fontFamily: 'var(--font-mono)',
                }}>
                  {contact.username?.[0]?.toUpperCase()}
                </div>
              )}
              {!isMe && prevSame && <div style={{ width: 26, flexShrink: 0 }} />}
              <div style={{ maxWidth: '65%' }}>
                <div style={{
                  padding: '8px 12px',
                  background: isMe ? 'var(--cyan-dim)' : 'var(--bg-raised)',
                  border: `1px solid ${isMe ? 'var(--cyan-glow)' : 'var(--border)'}`,
                  borderRadius: isMe
                    ? (prevSame ? '10px 4px 4px 10px' : '10px 4px 10px 10px')
                    : (prevSame ? '4px 10px 10px 4px' : '4px 10px 10px 10px'),
                  color: isMe ? 'var(--cyan)' : 'var(--text-primary)',
                  fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--font-mono)', wordBreak: 'break-word',
                }}>
                  {msg.text}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)',
                  textAlign: isMe ? 'right' : 'left', paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0,
                }}>
                  {msg.time}
                </div>
              </div>
            </div>
          )
        })}

        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 5,
              background: `${contact.color}22`, border: `1px solid ${contact.color}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: contact.color, fontFamily: 'var(--font-mono)',
            }}>
              {contact.username?.[0]?.toUpperCase()}
            </div>
            <div style={{
              padding: '8px 14px', background: 'var(--bg-raised)',
              border: '1px solid var(--border)', borderRadius: '4px 10px 10px 4px',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-muted)', animation: `pulse-dot 1.2s ${i*0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-raised)', border: '1px solid var(--border-lit)',
          borderRadius: 'var(--radius)', padding: '0 4px 0 14px',
        }}>
          <input
            value={input} onChange={onInputChange} onKeyDown={onKey}
            placeholder={`Message ${contact.username}...`}
            style={{ flex: 1, padding: '10px 0', fontSize: 13, color: 'var(--text-primary)', background: 'none', fontFamily: 'var(--font-mono)' }}
          />
          <button style={{ padding: '6px 8px', color: 'var(--text-muted)' }}><Smile size={16} /></button>
          <button style={{ padding: '6px 8px', color: 'var(--text-muted)' }}><Paperclip size={16} /></button>
          <button onClick={send} style={{
            width: 34, height: 34, borderRadius: 6, flexShrink: 0,
            background: input.trim() ? 'var(--cyan)' : 'var(--bg-hover)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: input.trim() ? '#0e0f11' : 'var(--text-muted)', transition: 'all 0.15s',
          }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
