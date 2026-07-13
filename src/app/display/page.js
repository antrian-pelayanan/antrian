"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';

export default function Display() {
  const [settings, setSettings] = useState({
    instansi_nama: 'Kecamatan Gandrungmangu',
    instansi_alamat: 'Jl. Pertiwi Nomor 1',
    running_text: 'Selamat Datang di Kecamatan Gandrungmangu',
    display_video_url: 'https://youtu.be/FkbZshiiS-k',
    bell_sound_volume: '0.8'
  });
  
  const [lokets, setLokets] = useState(['Loket 1', 'Loket 2', 'Loket 3', 'Loket 4']);
  const [activeCalls, setActiveCalls] = useState({});
  const [latestCalling, setLatestCalling] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  const lastProcessedCall = useRef(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearInterval(timer);
  }, []);

  // Lokets Snapshot
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'loket'), (snap) => {
      if (!snap.empty) {
        const list = [];
        snap.forEach(docSnap => {
          if (docSnap.data().nama) {
            list.push(docSnap.data().nama);
          }
        });
        list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        setLokets(list);
      }
    });
    return () => unsub();
  }, []);

  // Speak Queue Voice function
  const speakQueue = (nomorLengkap, loketText) => {
    const bell = document.getElementById('bellSound');
    if (bell) {
      bell.volume = parseFloat(settings.bell_sound_volume) || 0.8;
      bell.play().catch(e => console.log("Audio prevent:", e));
    }

    setTimeout(() => {
      const parts = nomorLengkap.split('-');
      const prefix = parts[0];
      const num = parseInt(parts[1] || '1', 10);
      const text = `Nomor antrian, ${prefix}, ${num}, silakan menuju ke, ${loketText}`;
      
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=id-ID&client=tw-ob&q=${encodeURIComponent(text)}`;
      const ttsAudio = new Audio(url);
      ttsAudio.volume = 1.0;
      ttsAudio.play().catch(err => {
        console.error("Google TTS failed:", err);
        // Fallback lokal
        if (window.speechSynthesis) {
          const speech = new SpeechSynthesisUtterance(text);
          speech.lang = "id-ID";
          const voices = window.speechSynthesis.getVoices();
          const idVoices = voices.filter(v => v.lang.replace('_', '-').toLowerCase().includes('id'));
          let female = idVoices.find(v => {
            const n = v.name.toLowerCase();
            return n.includes('gadis') || n.includes('female') || n.includes('perempuan') || n.includes('google');
          });
          if (!female && idVoices.length > 1) female = idVoices[idVoices.length - 1];
          if (female) speech.voice = female;
          speech.rate = 0.85;
          window.speechSynthesis.speak(speech);
        }
      });
    }, 1800);
  };

  // Settings Snapshot
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'settings'), (snap) => {
      const s = { ...settings };
      snap.forEach(doc => { s[doc.id] = doc.data().value; });
      setSettings(s);
    });
    return () => unsub();
  }, []);

  // Queue Snapshot
  useEffect(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startOfDay = Timestamp.fromDate(now);

    const q = query(
      collection(db, 'antrian'),
      where('created_at', '>=', startOfDay),
      orderBy('created_at', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const allQueues = [];
      snap.forEach(d => allQueues.push({ id: d.id, ...d.data() }));

      let latest = null;
      const activeMap = {};

      lokets.forEach(lok => {
        // Cari yang dipanggil
        let call = allQueues.find(q => q.loket === lok && q.status === 'dipanggil');
        // Jika tidak ada, cari yang selesai
        if (!call) {
          call = allQueues.find(q => q.loket === lok && q.status === 'selesai');
        }
        if (call) {
          activeMap[lok] = call;
        }
      });

      // Cari panggilan terbaru (dipanggil) yang ada panggil_at
      const calledQueues = allQueues.filter(q => q.status === 'dipanggil' && q.panggil_at);
      calledQueues.sort((a, b) => b.panggil_at.toMillis() - a.panggil_at.toMillis());

      if (calledQueues.length > 0) {
        latest = calledQueues[0];
      } else {
        // Fallback jika tidak ada yang sedang dipanggil
        const finishedQueues = allQueues.filter(q => (q.status === 'selesai' || q.status === 'lewat') && q.panggil_at);
        finishedQueues.sort((a, b) => b.panggil_at.toMillis() - a.panggil_at.toMillis());
        if (finishedQueues.length > 0) latest = finishedQueues[0];
      }

      setActiveCalls(activeMap);
      setLatestCalling(latest);

      // Trigger Voice
      if (latest && latest.status === 'dipanggil') {
        const callSig = `${latest.id}-${latest.panggil_at.toMillis()}-${latest.panggil_ulang}`;
        if (lastProcessedCall.current !== callSig) {
          lastProcessedCall.current = callSig;
          speakQueue(latest.nomor_lengkap, latest.loket);
        }
      }
    });

    return () => unsub();
  }, [lokets]);

  const getYoutubeId = (url) => {
    try {
      if (!url) return '';
      if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0];
      if (url.includes('youtube.com/watch')) return new URL(url).searchParams.get('v');
      return '';
    } catch { return ''; }
  };

  const videoId = getYoutubeId(settings.display_video_url);

  return (
    <div style={{
      background: `linear-gradient(rgba(255, 255, 255, 0.65), rgba(245, 247, 250, 0.8)), url('/img/bg-kecamatan.jpeg') no-repeat center center fixed`,
      backgroundSize: 'cover',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '25px 30px',
      overflow: 'hidden'
    }}>
      
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4" style={{
        background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)',
        borderRadius: '16px', padding: '15px 30px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <div className="d-flex align-items-center gap-3">
          <img src="/img/Logo.png" alt="Logo" style={{ height: '70px', objectFit: 'contain' }} />
          <div>
            <h2 className="fw-bold m-0 text-dark">{settings.instansi_nama}</h2>
            <p className="m-0 text-secondary fw-semibold">{settings.instansi_alamat}</p>
          </div>
        </div>
        <div className="text-end">
          <div className="text-primary fw-bold" style={{ fontSize: '2.2rem' }}>
            {mounted ? currentTime.toLocaleTimeString('id-ID', { hour12: false }) : '--.--.--'}
          </div>
          <div className="text-secondary fw-semibold">
            {mounted ? currentTime.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Memuat Tanggal...'}
          </div>
        </div>
      </div>

      {/* Main Row */}
      <div className="row g-4 flex-grow-1" style={{ height: 'calc(100vh - 245px)' }}>
        
        {/* Video Left */}
        <div className="col-lg-7 d-flex">
          <div className="w-100 h-100 rounded-4 overflow-hidden" style={{ background: '#000', border: '2px solid rgba(255,255,255,0.4)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            {videoId && (
              <iframe 
                width="100%" height="100%" 
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`}
                frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen>
              </iframe>
            )}
          </div>
        </div>

        {/* Right Area */}
        <div className="col-lg-5 d-flex flex-column gap-3">
          
          {/* Giant Call Box */}
          <div className="text-center w-100 rounded-4" style={{
            background: 'rgba(255,255,255,0.95)', border: '2px solid rgba(13,110,253,0.25)', 
            padding: '20px 30px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
          }}>
            <h4 className="text-primary fw-bold text-uppercase mb-1">Panggilan Saat Ini</h4>
            <div className="fw-bold text-danger" style={{ fontSize: '8.5rem', lineHeight: 1, textShadow: '0 0 20px rgba(220,53,69,0.2)' }}>
              {latestCalling ? latestCalling.nomor_lengkap : '---'}
            </div>
            <div className="mt-2 fw-bold text-dark" style={{ fontSize: '1.6rem' }}>
              MENUJU <span className="text-primary">{latestCalling ? latestCalling.loket : '---'}</span>
            </div>
          </div>

          {/* Active Queues */}
          <div className="flex-grow-1 p-3 d-flex flex-column rounded-4" style={{ background: 'rgba(255,255,255,0.85)' }}>
            <h5 className="text-center fw-bold border-bottom pb-2 mb-2">ANTRIAN BERLANGSUNG</h5>
            <div className="row g-2 flex-grow-1">
              {lokets.map(lok => (
                <div className="col-12" key={lok}>
                  <div className="d-flex align-items-center justify-content-between py-3 px-4 bg-white rounded-3" style={{ borderLeft: '6px solid #0d6efd', boxShadow: '0 3px 8px rgba(0,0,0,0.02)' }}>
                    <div className="text-start">
                      <h5 className="fw-bold text-primary m-0">{lok}</h5>
                      <div className="small text-secondary fw-semibold mt-1">Status: <strong className="text-dark">{activeCalls[lok] ? 'Melayani' : 'Kosong'}</strong></div>
                    </div>
                    <div className="fw-bold text-dark" style={{ fontSize: '3.6rem', lineHeight: 1 }}>
                      {activeCalls[lok] ? activeCalls[lok].nomor_lengkap : '---'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Running Text */}
      <div style={{
        position: 'fixed', bottom: '30px', left: '30px', right: '30px',
        background: '#fff', border: '2.5px solid #0d6efd', borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)', padding: '10px 0', zIndex: 1000, overflow: 'hidden'
      }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          <p style={{ display: 'inline-block', paddingLeft: '100%', margin: 0, animation: 'scroll-text 25s linear infinite', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>
            {settings.running_text}
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll-text {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-100%, 0); }
        }
      `}} />

      <audio id="bellSound" src="/audio/bell.wav" preload="auto"></audio>
    </div>
  );
}
