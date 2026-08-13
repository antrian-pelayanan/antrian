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
      background: `linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 50%, #bae6fd 100%)`,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 25px 90px 25px',
      boxSizing: 'border-box'
    }}>
      
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3" style={{
        background: '#ffffff',
        borderRadius: '20px', padding: '15px 30px',
        boxShadow: '0 10px 25px rgba(2, 132, 199, 0.08)',
        border: '1px solid #bae6fd'
      }}>
        <div className="d-flex align-items-center gap-3">
          <img src="/img/Logo.png" alt="Logo" style={{ height: '75px', objectFit: 'contain' }} />
          <div>
            <h2 className="fw-bold m-0" style={{ color: '#0284c7', fontSize: '2rem' }}>{settings.instansi_nama}</h2>
            <p className="m-0 text-secondary fw-semibold fs-6">{settings.instansi_alamat}</p>
          </div>
        </div>
        <div className="text-end">
          <div className="fw-bold" style={{ fontSize: '2.5rem', color: '#0284c7', lineHeight: 1.1 }}>
            {mounted ? currentTime.toLocaleTimeString('id-ID', { hour12: false }) : '--.--.--'}
          </div>
          <div className="text-secondary fw-bold small mt-1">
            {mounted ? currentTime.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Memuat Tanggal...'}
          </div>
        </div>
      </div>

      {/* 2 Main Sections Row */}
      <div className="row g-3 flex-grow-1">
        
        {/* Section 1 (Left Column): Layar Utama Panggilan Saat Ini */}
        <div className="col-lg-6 d-flex">
          <div className="w-100 rounded-4 p-4 d-flex flex-column align-items-center justify-content-between text-center shadow-lg" style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
            border: '3px solid #38bdf8',
            boxShadow: '0 15px 35px rgba(2, 132, 199, 0.12)'
          }}>
            <div className="w-100">
              <div className="d-inline-flex align-items-center gap-2 px-4 py-2 rounded-pill mb-3" style={{ background: 'rgba(2, 132, 199, 0.1)', border: '1px solid #bae6fd' }}>
                <span className="spinner-grow spinner-grow-sm text-danger" role="status"></span>
                <span className="fw-bold text-uppercase tracking-wider" style={{ color: '#0284c7', fontSize: '1.2rem' }}>
                  PANGGILAN SAAT INI
                </span>
              </div>
              <p className="text-muted fw-semibold m-0">Nomor Antrian Yang Dipanggil</p>
            </div>

            <div className="my-auto py-3">
              <div className="fw-extrabold text-danger" style={{ 
                fontSize: '9.5rem', 
                lineHeight: 0.95, 
                fontWeight: 900,
                letterSpacing: '-2px',
                textShadow: '0 10px 30px rgba(220, 38, 38, 0.2)' 
              }}>
                {latestCalling ? latestCalling.nomor_lengkap : '---'}
              </div>
              
              <div className="mt-4 py-2 px-4 rounded-4 d-inline-block" style={{ background: '#ffffff', border: '2px solid #bae6fd', boxShadow: '0 8px 20px rgba(0,0,0,0.04)' }}>
                <span className="text-secondary fw-bold text-uppercase me-2" style={{ fontSize: '1.8rem' }}>MENUJU</span>
                <span className="fw-black text-danger" style={{ fontSize: '3rem', fontWeight: 900 }}>
                  {latestCalling ? latestCalling.loket : '---'}
                </span>
              </div>

              {latestCalling && (
                <div className="mt-3">
                  <span className="badge bg-primary bg-opacity-10 text-primary fs-5 px-4 py-2 rounded-pill border border-primary border-opacity-25 fw-bold">
                    {latestCalling.pelayanan_nama || 'Pelayanan Umum'}
                  </span>
                </div>
              )}
            </div>

            <div className="w-100 pt-3 border-top border-info border-opacity-25">
              <small className="text-secondary fw-semibold">
                <i className="bi bi-info-circle me-1"></i> Silakan menuju ke loket pelayanan yang tertera di atas.
              </small>
            </div>
          </div>
        </div>

        {/* Section 2 (Right Column): Layar Antrian Berlangsung */}
        <div className="col-lg-6 d-flex">
          <div className="w-100 rounded-4 p-4 d-flex flex-column shadow-lg" style={{
            background: '#ffffff',
            border: '2px solid #bae6fd',
            boxShadow: '0 15px 35px rgba(2, 132, 199, 0.08)'
          }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <h3 className="fw-bold m-0 d-flex align-items-center gap-2" style={{ color: '#0284c7', fontSize: '1.7rem' }}>
                <i className="bi bi-card-checklist"></i> ANTRIAN BERLANGSUNG
              </h3>
              <span className="badge bg-primary px-3 py-2 rounded-pill fs-6 fw-bold">
                {lokets.length} Loket Pelayanan
              </span>
            </div>

            <div className="row g-3 flex-grow-1 align-content-start overflow-y-auto">
              {lokets.map(lok => {
                const active = activeCalls[lok];
                return (
                  <div className="col-12" key={lok}>
                    <div className="d-flex align-items-center justify-content-between p-3 rounded-4 shadow-sm" style={{
                      background: active ? 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)' : '#f8fafc',
                      borderLeft: `10px solid ${active ? '#10b981' : '#cbd5e1'}`,
                      border: '1px solid #e2e8f0',
                      borderLeftWidth: '10px'
                    }}>
                      <div>
                        <h4 className="fw-bold m-0" style={{ color: '#0284c7', fontSize: '1.8rem' }}>{lok}</h4>
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <span className={`badge ${active ? 'bg-success text-white' : 'bg-secondary text-white'} px-3 py-1 rounded-pill fs-6`}>
                            {active ? 'MELAYANI' : 'KOSONG'}
                          </span>
                          {active && active.pelayanan_nama && (
                            <span className="text-secondary small fw-semibold">
                              ({active.pelayanan_nama})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-end">
                        <div className={`fw-extrabold ${active ? 'text-success' : 'text-muted'}`} style={{ fontSize: '4.2rem', lineHeight: 1, fontWeight: 900 }}>
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
        background: '#ffffff', border: '2.5px solid #0284c7', borderRadius: '14px',
        boxShadow: '0 8px 30px rgba(2, 132, 199, 0.2)', padding: '10px 0', zIndex: 1000, overflow: 'hidden'
      }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          <p style={{ display: 'inline-block', paddingLeft: '100%', margin: 0, animation: 'scroll-text 25s linear infinite', fontSize: '1.35rem', fontWeight: 700, color: '#0369a1' }}>
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

