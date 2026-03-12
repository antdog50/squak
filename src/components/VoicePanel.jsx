import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Hash, Loader, Video, VideoOff } from 'lucide-react'
import { Room, RoomEvent, Track, createLocalAudioTrack, createLocalVideoTrack } from 'livekit-client'
import { API } from '../SocketContext'

const CHANNELS = [
  { id: 'lobby',   name: 'Lobby'   },
  { id: 'gaming',  name: 'Gaming'  },
  { id: 'afk',     name: 'AFK'     },
  { id: 'private', name: 'Private' },
]

function nameToColor(name) {
  const colors = ['#00d4ff','#00ff88','#ffaa00','#c084fc','#ff6b9d','#4ade80','#f59e0b','#60a5fa']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function VoicePanel({ user }) {
  const username = user?.username
  const token    = user?.token

  const [activeChannel, setActiveChannel] = useState(null)
  const [muted, setMuted]       = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [videoOn, setVideoOn]   = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [participants, setParticipants] = useState([])
  const [speaking, setSpeaking] = useState({})
  const roomRef      = useRef(null)
  const audioRefs    = useRef({})
  const videoRefs    = useRef({})
  const myVideoRef   = useRef(null)
  const localVideoTrackRef = useRef(null)

  const updateParticipants = useCallback((room) => {
    const parts = []
    room.remoteParticipants.forEach(p => parts.push({ identity: p.identity, sid: p.sid }))
    setParticipants(parts)
  }, [])

  const joinChannel = async (channelId) => {
    if (roomRef.current) await leaveChannel()
    setConnecting(true)
    try {
      const res = await fetch(`${API}/livekit-token?room=${channelId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const { token: lkToken, url } = await res.json()

      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      room.on(RoomEvent.ParticipantConnected,    () => updateParticipants(room))
      room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room))

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.autoplay = true
          document.body.appendChild(el)
          audioRefs.current[participant.sid] = el
        }
        if (track.kind === Track.Kind.Video) {
          videoRefs.current[participant.identity] = track
          setParticipants(prev => [...prev])
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = audioRefs.current[participant.sid]
          if (el) { el.remove(); delete audioRefs.current[participant.sid] }
        }
        if (track.kind === Track.Kind.Video) {
          delete videoRefs.current[participant.identity]
          setParticipants(prev => [...prev])
        }
      })

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const map = {}
        speakers.forEach(s => { map[s.identity] = true })
        setSpeaking(map)
      })

      room.on(RoomEvent.Disconnected, () => {
        setActiveChannel(null); setParticipants([]); setSpeaking({})
        roomRef.current = null
      })

      await room.connect(url, lkToken)
      const audioTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true })
      await room.localParticipant.publishTrack(audioTrack)

      updateParticipants(room)
      setActiveChannel(channelId)
    } catch (err) {
      console.error(err)
      alert(`Could not connect to voice.\n\nMake sure livekit-server.exe is running.\n\n${err.message}`)
      roomRef.current = null
    } finally {
      setConnecting(false)
    }
  }

  const leaveChannel = async () => {
    if (localVideoTrackRef.current) { localVideoTrackRef.current.stop(); localVideoTrackRef.current = null }
    if (roomRef.current) { await roomRef.current.disconnect(); roomRef.current = null }
    Object.values(audioRefs.current).forEach(el => el.remove())
    audioRefs.current = {}; videoRefs.current = {}
    setActiveChannel(null); setParticipants([]); setSpeaking({})
    setMuted(false); setDeafened(false); setVideoOn(false)
  }

  const toggleMute = async () => {
    if (!roomRef.current) return
    await roomRef.current.localParticipant.setMicrophoneEnabled(muted)
    setMuted(m => !m)
  }

  const toggleDeafen = () => {
    Object.values(audioRefs.current).forEach(el => { el.muted = !deafened })
    setDeafened(d => !d)
  }

  const toggleVideo = async () => {
    if (!roomRef.current) return
    if (!videoOn) {
      try {
        const track = await createLocalVideoTrack({ resolution: { width: 640, height: 480 } })
        await roomRef.current.localParticipant.publishTrack(track)
        localVideoTrackRef.current = track
        if (myVideoRef.current) track.attach(myVideoRef.current)
        setVideoOn(true)
      } catch (e) { alert('Could not access camera: ' + e.message) }
    } else {
      if (localVideoTrackRef.current) {
        await roomRef.current.localParticipant.unpublishTrack(localVideoTrackRef.current)
        localVideoTrackRef.current.stop()
        localVideoTrackRef.current = null
        if (myVideoRef.current) myVideoRef.current.srcObject = null
      }
      setVideoOn(false)
    }
  }

  useEffect(() => () => { leaveChannel() }, [])

  const allParticipants = activeChannel
    ? [{ identity: username, isMe: true }, ...participants.map(p => ({ ...p, isMe: false }))]
    : []

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Channel list */}
      <div style={{ width: 220, background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Hash size={11} /> VOICE CHANNELS
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {CHANNELS.map(ch => (
            <button key={ch.id}
              onClick={() => !connecting && (activeChannel === ch.id ? leaveChannel() : joinChannel(ch.id))}
              style={{
                width: '100%', padding: '9px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
                color: activeChannel === ch.id ? 'var(--cyan)' : 'var(--text-secondary)',
                background: activeChannel === ch.id ? 'var(--cyan-dim)' : 'transparent',
                borderLeft: activeChannel === ch.id ? '2px solid var(--cyan)' : '2px solid transparent',
                transition: 'all 0.1s',
              }}>
              <Hash size={12} color={activeChannel === ch.id ? 'var(--cyan)' : 'var(--text-muted)'} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{ch.name}</span>
              {activeChannel === ch.id && connecting && <Loader size={11} style={{ marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, overflow: 'auto' }}>
        {connecting && (
          <div style={{ textAlign: 'center' }}>
            <Loader size={32} color="var(--cyan)" style={{ animation: 'spin 1s linear infinite', marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Connecting...</div>
          </div>
        )}

        {!connecting && !activeChannel && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--bg-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Volume2 size={28} color="var(--text-muted)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Not in a channel</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Select a channel on the left to join</div>
          </div>
        )}

        {!connecting && activeChannel && (
          <>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)', letterSpacing: '0.12em', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 1.5s infinite' }} />
              CONNECTED · {CHANNELS.find(c => c.id === activeChannel)?.name.toUpperCase()}
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{allParticipants.length} participant{allParticipants.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Participant cards */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
              {allParticipants.map(p => {
                const isTalking = speaking[p.identity]
                const color = p.isMe ? 'var(--cyan)' : nameToColor(p.identity)
                const videoTrack = !p.isMe ? videoRefs.current[p.identity] : null
                return (
                  <div key={p.identity} style={{
                    width: videoTrack || (p.isMe && videoOn) ? 220 : 100,
                    padding: '12px',
                    background: isTalking ? `${color}11` : 'var(--bg-raised)',
                    border: `1px solid ${isTalking ? color : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    transition: 'all 0.2s',
                    boxShadow: isTalking ? `0 0 16px ${color}33` : 'none',
                  }}>
                    {/* Video */}
                    {p.isMe && videoOn && (
                      <video ref={myVideoRef} autoPlay muted playsInline
                        style={{ width: '100%', borderRadius: 6, background: '#000', aspectRatio: '4/3', objectFit: 'cover' }} />
                    )}
                    {videoTrack && <RemoteVideo track={videoTrack} />}

                    {/* Avatar */}
                    {!(videoTrack || (p.isMe && videoOn)) && (
                      <div style={{
                        width: 40, height: 40, borderRadius: 9,
                        background: `${color}22`, border: `2px solid ${isTalking ? color : color + '44'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 700, color, fontFamily: 'var(--font-mono)',
                      }}>
                        {p.identity[0].toUpperCase()}
                      </div>
                    )}

                    <div style={{ fontSize: 11, fontWeight: 600, color: isTalking ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'center' }}>
                      {p.isMe ? `${p.identity} (you)` : p.identity}
                      {p.isMe && muted && <span style={{ color: 'var(--red)', marginLeft: 6 }}>MUTED</span>}
                    </div>

                    {isTalking && (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 12 }}>
                        {[4,8,5,10,6].map((h, i) => (
                          <div key={i} style={{ width: 3, background: color, borderRadius: 2, height: h, animation: `pulse-dot ${0.3 + i*0.1}s infinite alternate` }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 24px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <VoiceBtn icon={muted ? MicOff : Mic}          label={muted ? 'Unmute' : 'Mute'}          active={!muted}    activeColor="var(--cyan)" onClick={toggleMute} />
              <VoiceBtn icon={deafened ? VolumeX : Volume2}  label={deafened ? 'Undeafen' : 'Deafen'}   active={!deafened} activeColor="var(--cyan)" onClick={toggleDeafen} />
              <VoiceBtn icon={videoOn ? VideoOff : Video}    label={videoOn ? 'Stop Video' : 'Camera'}  active={videoOn}   activeColor="var(--green)" onClick={toggleVideo} />
              <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
              <VoiceBtn icon={PhoneOff} label="Leave" active={false} activeColor="var(--red)" onClick={leaveChannel} danger />
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function RemoteVideo({ track }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && track) track.attach(ref.current)
    return () => { if (track) track.detach() }
  }, [track])
  return <video ref={ref} autoPlay playsInline style={{ width: '100%', borderRadius: 6, background: '#000', aspectRatio: '4/3', objectFit: 'cover' }} />
}

function VoiceBtn({ icon: Icon, label, active, activeColor, onClick, danger }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, minWidth: 56, background: danger ? (hover ? 'var(--red-dim)' : 'transparent') : (hover ? 'var(--bg-hover)' : 'transparent'), transition: 'all 0.15s' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: danger ? 'var(--red-dim)' : active ? `${activeColor}22` : 'var(--bg-hover)',
        border: `1px solid ${danger ? 'var(--red)' : active ? activeColor : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? 'var(--red)' : active ? activeColor : 'var(--text-muted)', transition: 'all 0.15s',
      }}>
        <Icon size={15} />
      </div>
      <span style={{ fontSize: 10, color: danger ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</span>
    </button>
  )
}
