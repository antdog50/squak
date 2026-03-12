import { useEffect, useRef } from 'react'
import { useSocket } from '../SocketContext'

export default function NotificationSystem({ activeContact }) {
  const { socket, user } = useSocket() || {}
  const permissionRef = useRef(false)

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        permissionRef.current = p === 'granted'
      })
    } else {
      permissionRef.current = Notification.permission === 'granted'
    }
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('message:receive', (payload) => {
      // Don't notify if the sender is the active contact
      if (activeContact && activeContact.socketId === payload.fromId) return

      // Browser notification
      if (permissionRef.current && document.hidden) {
        const notif = new Notification(`💬 ${payload.from}`, {
          body: payload.text.length > 60 ? payload.text.slice(0, 60) + '...' : payload.text,
          icon: '/favicon.ico',
          tag: payload.fromId,
        })
        notif.onclick = () => { window.focus(); notif.close() }
        setTimeout(() => notif.close(), 5000)
      }

      // Play a subtle sound
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.15)
      } catch {}
    })

    return () => socket.off('message:receive')
  }, [socket, activeContact])

  return null
}
