"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';

export default function Display() {
  const [settings, setSettings] = useState({
    instansi_nama: 'Kecamatan Gandrungmangu',
    instansi_alamat: 'Jl. Pertiwi Nomor 1',
    running_text: 'Selamat Datang di Kecamatan Gandrungmangu',
    bell_sound_volume: '0.8'
  });
  
  const [lokets, setLokets] = useState(['Loket 1', 'Loket 2', 'Loket 3', 'Loket 4']);
  const [activeCalls, setActiveCalls] = useState({});
  const [latestCalling, setLatestCalling] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  const lastProcessedCall = useRef(null);
  const maxProcessedPanggilAt = useRef(0);

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
        const panggilTime = latest.panggil_at.toMillis();
        const callSig = `${latest.id}-${panggilTime}-${latest.panggil_ulang}`;
        
        if (panggilTime > maxProcessedPanggilAt.current) {
          maxProcessedPanggilAt.current = panggilTime;
          lastProcessedCall.current = callSig;
          speakQueue(latest.nomor_lengkap, latest.loket);
        } else if (panggilTime === maxProcessedPanggilAt.current && lastProcessedCall.current !== callSig) {
          lastProcessedCall.current = callSig;
          speakQueue(latest.nomor_lengkap, latest.loket);
        }
      }
    });

    return () => unsub();
  }, [lokets]);

  return (
    <div style={{
      backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.35), rgba(15, 23, 42, 0.45)), url('/img/bg-kecamatan.jpeg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 25px 90px 25px',
      boxSizing: 'border-box'
    }}>
      
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3" style={{
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderRadius: '20px', padding: '15px 30px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.15)',
        border: '2px solid rgba(255, 255, 255, 0.45)'
      }}>
        <div className="d-flex align-items-center gap-3">
          <img src="/img/Logo.png" alt="Logo Cilacap" style={{ height: '75px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
          <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '65px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
          <div>
            <h2 className="fw-bold m-0" style={{ color: '#ffffff', fontSize: '2.1rem', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 4px 10px rgba(0,0,0,0.7)' }}>{settings.instansi_nama}</h2>
            <p className="m-0 text-white fw-bold fs-6" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{settings.instansi_alamat}</p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-4">
          <div className="text-end">
            <div className="fw-extrabold" style={{ fontSize: '2.8rem', color: '#38bdf8', lineHeight: 1.1, fontWeight: 900, textShadow: '0 2px 0 #0284c7, 0 4px 0 #0369a1, 0 6px 12px rgba(0,0,0,0.8)' }}>
              {mounted ? currentTime.toLocaleTimeString('id-ID', { hour12: false }) : '--.--.--'}
            </div>
            <div className="text-white fw-bold small mt-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
              {mounted ? currentTime.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Memuat Tanggal...'}
            </div>
          </div>
          <div className="ps-3 border-start border-2 border-white border-opacity-25 d-flex align-items-center">
            <img src="/img/logo-semringah.png" alt="Logo Gandrung Mangu Semringah" style={{ height: '85px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
          </div>
        </div>
      </div>

      {/* 2 Main Sections Row */}
      <div className="row g-3 flex-grow-1">
        
        {/* Section 1 (Left Column): Layar Utama Panggilan Saat Ini */}
        <div className="col-lg-6 d-flex">
          <div className="w-100 rounded-4 p-4 d-flex flex-column align-items-center justify-content-between text-center shadow-lg" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35), inset 0 0 20px rgba(255, 255, 255, 0.12)'
          }}>
            <div className="w-100">
              <div className="d-inline-flex align-items-center gap-2 px-4 py-2 rounded-pill mb-2 shadow" style={{ background: '#0284c7', border: '1px solid rgba(255,255,255,0.4)' }}>
                <span className="spinner-grow spinner-grow-sm text-warning" role="status"></span>
                <span className="fw-bold text-uppercase tracking-wider text-white" style={{ fontSize: '1.3rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  PANGGILAN SAAT INI
                </span>
              </div>
              <p className="text-white fw-bold fs-5 m-0 mt-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>Nomor Antrian Yang Dipanggil</p>
            </div>

            <div className="my-auto py-2">
              <div className="fw-extrabold text-danger" style={{ 
                fontSize: '15rem', 
                lineHeight: 0.85, 
                fontWeight: 900,
                letterSpacing: '-3px',
                color: '#ff3333',
                textShadow: '0 3px 0 #dc2626, 0 6px 0 #b91c1c, 0 9px 0 #991b1b, 0 12px 0 #7f1d1d, 0 15px 30px rgba(0, 0, 0, 0.9)' 
              }}>
                {latestCalling ? latestCalling.nomor_lengkap : '---'}
              </div>
              
              <div className="mt-3 py-3 px-5 rounded-4 d-inline-block shadow-lg" style={{ background: 'rgba(255, 255, 255, 0.12)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '2px solid rgba(255, 255, 255, 0.55)', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(255, 255, 255, 0.15)' }}>
                <span className="text-white fw-extrabold text-uppercase me-3" style={{ fontSize: '2.5rem', letterSpacing: '2px', fontWeight: 900, textShadow: '0 2px 0 #000, 0 4px 10px rgba(0,0,0,0.9)' }}>MENUJU</span>
                <span className="fw-black" style={{ fontSize: '4.8rem', fontWeight: 900, lineHeight: 1, color: '#ff3333', textShadow: '0 2px 0 #dc2626, 0 4px 0 #b91c1c, 0 6px 0 #991b1b, 0 8px 15px rgba(0,0,0,0.9)' }}>
                  {latestCalling ? latestCalling.loket : '---'}
                </span>
              </div>

              {latestCalling && (
                <div className="mt-3">
                  <span className="badge bg-primary text-white fs-4 px-4 py-2 rounded-pill shadow-lg fw-bold" style={{ border: '1px solid rgba(255,255,255,0.4)', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                    {latestCalling.pelayanan_nama || 'Pelayanan Umum'}
                  </span>
                </div>
              )}
            </div>

            <div className="w-100 pt-3 border-top border-white border-opacity-25">
              <small className="text-white fw-bold fs-6" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                <i className="bi bi-info-circle me-1 text-info"></i> Silakan menuju ke loket pelayanan yang tertera di atas.
              </small>
            </div>
          </div>
        </div>

        {/* Section 2 (Right Column): Layar Antrian Berlangsung */}
        <div className="col-lg-6 d-flex">
          <div className="w-100 rounded-4 p-4 d-flex flex-column shadow-lg" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35), inset 0 0 20px rgba(255, 255, 255, 0.12)'
          }}>
            <div className="d-flex justify-content-between align-items-center border-bottom border-white border-opacity-25 pb-3 mb-3">
              <h3 className="fw-bold m-0 d-flex align-items-center gap-2" style={{ color: '#ffffff', fontSize: '1.8rem', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(56, 189, 248, 0.6)' }}>
                <i className="bi bi-card-checklist text-info"></i> ANTRIAN BERLANGSUNG
              </h3>
              <span className="badge bg-primary px-3 py-2 rounded-pill fs-6 fw-bold shadow" style={{ border: '1px solid rgba(255,255,255,0.3)', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {lokets.length} Loket Pelayanan
              </span>
            </div>

            <div className="row g-3 flex-grow-1 align-content-start overflow-y-auto">
              {lokets.map(lok => {
                const active = activeCalls[lok];
                return (
                  <div className="col-12" key={lok}>
                    <div className="d-flex align-items-center justify-content-between p-3 rounded-4 shadow" style={{
                      background: active ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      borderLeft: `12px solid ${active ? '#10b981' : '#64748b'}`,
                      border: active ? '2px solid rgba(16, 185, 129, 0.6)' : '1px solid rgba(255, 255, 255, 0.25)',
                      borderLeftWidth: '12px'
                    }}>
                      <div>
                        <h4 className="fw-bold m-0" style={{ color: '#ffffff', fontSize: '1.9rem', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{lok}</h4>
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <span className={`badge ${active ? 'bg-success text-white' : 'bg-secondary text-white'} px-3 py-1 rounded-pill fs-6 shadow`} style={{ border: '1px solid rgba(255,255,255,0.3)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                            {active ? 'MELAYANI' : 'KOSONG'}
                          </span>
                          {active && active.pelayanan_nama && (
                            <span className="text-white small fw-bold fs-6" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                              ({active.pelayanan_nama})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-end">
                        <div className="fw-extrabold" style={{ 
                          fontSize: '4.8rem', 
                          lineHeight: 1, 
                          fontWeight: 900, 
                          color: active ? '#34d399' : '#cbd5e1',
                          textShadow: active 
                            ? '0 2px 0 #047857, 0 4px 0 #065f46, 0 6px 12px rgba(0,0,0,0.9)' 
                            : '0 2px 4px rgba(0,0,0,0.9)' 
                        }}>
                          {active ? active.nomor_lengkap : '---'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Running Text Marquee Footer */}
      <div style={{
        position: 'fixed', bottom: '20px', left: '25px', right: '25px',
        background: 'rgba(255, 255, 255, 0.10)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '2px solid rgba(255, 255, 255, 0.45)', borderRadius: '14px',
        boxShadow: '0 10px 35px rgba(0, 0, 0, 0.4)', padding: '10px 0', zIndex: 1000, overflow: 'hidden'
      }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          <p style={{ display: 'inline-block', paddingLeft: '100%', margin: 0, animation: 'scroll-text 25s linear infinite', fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
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
    </div>
  );
}

