import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot,
  writeBatch,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  Send,
  X,
  Calendar as CalendarIcon,
  Settings,
  Trash2,
  Lock,
  RefreshCcw,
  Save,
  CheckCircle2,
  User,
  Quote
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'mercy-church-prayer';

// Helper: Format 24h string to 12h
const format12h = (time24) => {
  if (!time24) return '';
  const [hourStr, min] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  return `${hour}:${min} ${ampm}`;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signups, setSignups] = useState({});
  const [settings, setSettings] = useState({
    startDate: '2026-03-22',
    endDate: '2026-04-22',
    startTime: '09:00',
    endTime: '21:00',
    duration: 30,
    prayerTopic: 'Pray for future location of Mercy Church'
  });

  // UI State
  const [userName, setUserName] = useState(''); 
  const [pendingSlots, setPendingSlots] = useState([]); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [mobileDate, setMobileDate] = useState(new Date(2026, 2, 22));
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Admin State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [adminView, setAdminView] = useState('settings'); // 'settings' or 'reservations'
  const [tempSettings, setTempSettings] = useState(null);

  const gridRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching (Settings + Slots)
  useEffect(() => {
    if (!user) return;

    // Fetch Config
    const configDoc = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
    const unsubConfig = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({...prev, ...data}));
        if (data.startDate) {
          setMobileDate(new Date(data.startDate + "T00:00:00"));
        }
      }
    });

    // Fetch Slots
    const signupCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prayer_slots');
    const unsubSlots = onSnapshot(signupCollection, (snapshot) => {
      const data = {};
      snapshot.forEach(doc => { data[doc.id] = doc.data(); });
      setSignups(data);
      setLoading(false);
    }, (error) => { console.error("Firestore error:", error); setLoading(false); });

    return () => { unsubConfig(); unsubSlots(); };
  }, [user]);

  // Derived Values from Settings
  const dateRange = useMemo(() => {
    const dates = [];
    let current = new Date(settings.startDate + "T00:00:00");
    const end = new Date(settings.endDate + "T00:00:00");
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [settings]);

  const timeSlots = useMemo(() => {
    const slots = [];
    const [startH, startM] = settings.startTime.split(':').map(Number);
    const [endH, endM] = settings.endTime.split(':').map(Number);
    const dur = parseInt(settings.duration);

    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (currentMinutes < endMinutes) {
      const h = Math.floor(currentMinutes / 60);
      const m = currentMinutes % 60;
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      currentMinutes += dur;
    }
    return slots;
  }, [settings]);

  const formatDateId = (date) => date.toISOString().split('T')[0];

  // Logic: Sign-up
  const handleCellClick = (e, date, time) => {
    if (isAdmin) return; 
    const id = `${formatDateId(date)}_${time}`;
    if (signups[id]) return;

    if (isMobile) {
      setActiveMenu({ date, time, id, isMobile: true });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setActiveMenu({ 
        date, time, id, 
        top: rect.top + window.scrollY, 
        left: rect.left + window.scrollX, 
        isMobile: false 
      });
    }
  };

  const addSlots = (type) => {
    if (!activeMenu) return;
    const { date: baseDate, time } = activeMenu;
    const newPending = [...pendingSlots];
    const campaignEnd = new Date(settings.endDate + "T00:00:00");
    
    const addIfAvailable = (d) => {
      const dId = formatDateId(d);
      const sId = `${dId}_${time}`;
      if (!signups[sId] && !newPending.some(s => s.id === sId)) {
        newPending.push({ id: sId, date: dId, time, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
      }
    };

    if (type === 'once') {
      addIfAvailable(baseDate);
    } else if (type === 'daily') {
      let curr = new Date(baseDate);
      while (curr <= campaignEnd) {
        addIfAvailable(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
    } else if (type === 'weekly') {
      let curr = new Date(baseDate);
      while (curr <= campaignEnd) {
        addIfAvailable(new Date(curr));
        curr.setDate(curr.getDate() + 7);
      }
    }
    setPendingSlots(newPending);
    setActiveMenu(null);
  };

  const submitSignups = async () => {
    if (!userName.trim() || pendingSlots.length === 0 || !user) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      pendingSlots.forEach(slot => {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'prayer_slots', slot.id);
        batch.set(docRef, { name: userName.trim(), timestamp: Date.now(), userId: user.uid, date: slot.date, time: slot.time });
      });
      await batch.commit();
      setPendingSlots([]);
      setUserName('');
    } catch (err) { console.error(err); } 
    finally { setIsSubmitting(false); }
  };

  // Logic: Admin Actions
  const handleAdminLogin = () => {
    if (passcodeInput === 'mercyadmin') {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setTempSettings({...settings});
    } else {
      alert("Invalid Passcode");
    }
  };

  const saveSettings = async () => {
    try {
      const configDoc = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
      await setDoc(configDoc, tempSettings);
      alert("Settings Updated!");
    } catch (err) { console.error(err); }
  };

  const deleteReservation = async (id) => {
    if (!confirm("Are you sure you want to remove this reservation?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'prayer_slots', id));
    } catch (err) { console.error(err); }
  };

  const resetAllReservations = async () => {
    if (!confirm("WARNING: This will delete ALL reservations. This cannot be undone. Proceed?")) return;
    try {
      const signupCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prayer_slots');
      const snapshot = await getDocs(signupCollection);
      const batch = writeBatch(db);
      snapshot.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      alert("All reservations cleared.");
    } catch (err) { console.error(err); }
  };

  const changeMobileDate = (days) => {
    const next = new Date(mobileDate);
    next.setDate(next.getDate() + days);
    const start = new Date(settings.startDate + "T00:00:00");
    const end = new Date(settings.endDate + "T00:00:00");
    if (next >= start && next <= end) setMobileDate(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className={`p-4 md:p-6 shadow-md border-b sticky top-0 z-50 transition-colors ${isAdmin ? 'bg-indigo-900 text-white border-indigo-700' : 'bg-slate-900 text-white border-slate-700'}`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              {isAdmin ? "Admin Dashboard" : "Mercy Church Prayer"}
            </h1>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
              <Quote size={12} className="text-indigo-400" />
              <p className="text-indigo-200 text-xs font-bold italic tracking-wide">{settings.prayerTopic}</p>
            </div>
          </div>
          
          {!isAdmin ? (
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="bg-slate-800 p-2 rounded-xl border border-slate-700 flex-1 sm:flex-none">
                <label className="text-[10px] uppercase font-bold text-slate-500 block px-2">First Name & Initial</label>
                <input 
                  type="text"
                  placeholder="Your Name"
                  className="bg-transparent text-white focus:outline-none font-medium placeholder:text-slate-600 px-2 w-full sm:w-40"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
              {pendingSlots.length > 0 && (
                <button 
                  onClick={submitSignups}
                  disabled={!userName.trim() || isSubmitting}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  {isSubmitting ? '...' : `Confirm ${pendingSlots.length}`}
                  <Send size={16} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setAdminView('settings')} 
                className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${adminView === 'settings' ? 'bg-white text-indigo-900' : 'hover:bg-white/10'}`}
              >
                <Settings size={16} /> Settings
              </button>
              <button 
                onClick={() => setAdminView('reservations')} 
                className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${adminView === 'reservations' ? 'bg-white text-indigo-900' : 'hover:bg-white/10'}`}
              >
                <User size={16} /> Reservations
              </button>
              <button onClick={() => setIsAdmin(false)} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm">Exit Admin</button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
          </div>
        ) : isAdmin ? (
          /* ADMIN VIEWS */
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
            <div className="max-w-4xl mx-auto">
              {adminView === 'settings' ? (
                <div className="bg-white rounded-3xl shadow-xl p-8 space-y-8">
                  <div className="border-b pb-4"><h2 className="text-2xl font-black">Campaign Settings</h2></div>
                  
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Prayer Topic (Header Text)</label>
                      <input 
                        type="text" 
                        className="w-full p-4 bg-slate-50 border rounded-2xl font-bold text-indigo-900" 
                        value={tempSettings.prayerTopic} 
                        placeholder="e.g. Pray for future location of Mercy Church"
                        onChange={(e) => setTempSettings({...tempSettings, prayerTopic: e.target.value})} 
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Start Date</label>
                        <input type="date" className="w-full p-3 bg-slate-50 border rounded-xl" value={tempSettings.startDate} onChange={(e) => setTempSettings({...tempSettings, startDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">End Date</label>
                        <input type="date" className="w-full p-3 bg-slate-50 border rounded-xl" value={tempSettings.endDate} onChange={(e) => setTempSettings({...tempSettings, endDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Daily Start Time</label>
                        <input type="time" className="w-full p-3 bg-slate-50 border rounded-xl" value={tempSettings.startTime} onChange={(e) => setTempSettings({...tempSettings, startTime: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Daily End Time</label>
                        <input type="time" className="w-full p-3 bg-slate-50 border rounded-xl" value={tempSettings.endTime} onChange={(e) => setTempSettings({...tempSettings, endTime: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Slot Duration (Minutes)</label>
                        <select className="w-full p-3 bg-slate-50 border rounded-xl" value={tempSettings.duration} onChange={(e) => setTempSettings({...tempSettings, duration: e.target.value})}>
                          <option value="15">15 Minutes</option>
                          <option value="30">30 Minutes</option>
                          <option value="60">1 Hour</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 flex flex-col sm:flex-row gap-4">
                    <button onClick={saveSettings} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"><Save size={20}/> Save All Settings</button>
                    <button onClick={resetAllReservations} className="bg-red-50 text-red-600 px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 border border-red-200 hover:bg-red-100 transition-colors"><RefreshCcw size={20}/> Reset Schedule</button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <h2 className="text-xl font-bold">Manage Reservations</h2>
                    <span className="text-sm font-medium text-slate-500">{Object.keys(signups).length} spots claimed</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                          <th className="p-4">Date</th>
                          <th className="p-4">Time</th>
                          <th className="p-4">Member Name</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(signups).sort().map(([id, data]) => (
                          <tr key={id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-sm font-medium">{data.date}</td>
                            <td className="p-4 text-sm font-bold text-indigo-600">{format12h(data.time)}</td>
                            <td className="p-4 text-sm font-bold">{data.name}</td>
                            <td className="p-4 text-right">
                              <button onClick={() => deleteReservation(id)} className="p-2 text-red-400 hover:text-red-600 transition-colors"><Trash2 size={18}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isMobile ? (
          /* MOBILE VIEW */
          <div className="flex-1 overflow-y-auto pb-20">
            <div className="flex items-center justify-between bg-white p-4 shadow-sm border-b sticky top-0 z-40">
              <button onClick={() => changeMobileDate(-1)} disabled={mobileDate <= new Date(settings.startDate + "T00:00:00")} className="p-2 disabled:opacity-20"><ChevronLeft /></button>
              <div className="text-center">
                <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{mobileDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                <div className="font-bold">{mobileDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
              <button onClick={() => changeMobileDate(1)} disabled={mobileDate >= new Date(settings.endDate + "T00:00:00")} className="p-2 disabled:opacity-20"><ChevronRight /></button>
            </div>
            <div className="p-4 space-y-3">
              {timeSlots.map(time => {
                const dId = formatDateId(mobileDate);
                const sId = `${dId}_${time}`;
                const taken = signups[sId];
                const isPending = pendingSlots.some(s => s.id === sId);
                const isMySlot = taken && taken.userId === user?.uid;
                return (
                  <button key={time} disabled={!!taken && !isMySlot} onClick={(e) => handleCellClick(e, mobileDate, time)} className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${taken ? isMySlot ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-100 border-slate-100 opacity-60' : isPending ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-white shadow-sm'}`}>
                    <div className="flex items-center gap-3">
                      <Clock size={16} className={isPending ? 'text-indigo-200' : 'text-slate-400'} />
                      <span className="font-bold">{format12h(time)}</span>
                    </div>
                    <div className="text-right">
                      {taken ? <div className="flex flex-col items-end"><span className={`text-sm font-bold ${isMySlot ? 'text-indigo-700' : 'text-slate-500'}`}>{taken.name}</span>{isMySlot && <span className="text-[8px] font-black text-indigo-500 uppercase">Your Commitment</span>}</div> : isPending ? <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); setPendingSlots(p => p.filter(s => s.id !== sId)); }}><span className="text-xs font-bold uppercase">Selected</span><X size={14} /></div> : <span className="text-xs font-bold text-indigo-500 uppercase">Available</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* DESKTOP GRID VIEW */
          <div className="flex-1 overflow-auto bg-slate-50" ref={gridRef}>
            <table className="border-separate border-spacing-0 w-full min-w-[2000px]">
              <thead className="sticky top-0 z-30">
                <tr>
                  <th className="sticky left-0 z-40 bg-slate-900 text-white p-4 border-r border-b border-slate-700 text-left min-w-[140px]">Time Slot</th>
                  {dateRange.map((date) => (
                    <th key={date.toISOString()} className="bg-slate-100 p-4 border-r border-b border-slate-200 text-sm font-bold min-w-[140px] text-center">
                      <div className="text-slate-500 text-[10px] uppercase tracking-wider">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="text-slate-900">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((time) => (
                  <tr key={time}>
                    <td className="sticky left-0 z-20 bg-white border-r border-b border-slate-200 p-4 font-bold text-slate-600 flex items-center gap-2">
                      <Clock size={14} className="text-slate-300" />
                      {format12h(time)}
                    </td>
                    {dateRange.map((date) => {
                      const dId = formatDateId(date);
                      const sId = `${dId}_${time}`;
                      const taken = signups[sId];
                      const isPending = pendingSlots.some(s => s.id === sId);
                      const isMyPersistentSlot = taken && taken.userId === user?.uid;
                      return (
                        <td key={sId} onClick={(e) => handleCellClick(e, date, time)} className={`border-r border-b border-slate-200 p-2 h-16 transition-all relative ${taken ? isMyPersistentSlot ? 'bg-indigo-50' : 'bg-slate-100/50' : isPending ? 'bg-indigo-600 text-white cursor-pointer' : 'bg-white hover:bg-indigo-50/50 cursor-pointer'}`}>
                          {taken ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                              <span className={`text-xs font-bold leading-tight truncate w-full px-1 ${isMyPersistentSlot ? 'text-indigo-700' : 'text-slate-500'}`}>{taken.name}</span>
                              {isMyPersistentSlot && <span className="text-[8px] font-black uppercase text-indigo-400 mt-0.5">Your Slot</span>}
                            </div>
                          ) : isPending ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                              <span className="text-[10px] font-black uppercase">Selected</span>
                              <button onClick={(e) => { e.stopPropagation(); setPendingSlots(p => p.filter(s => s.id !== sId)); }} className="mt-1 opacity-60 hover:opacity-100"><X size={12} /></button>
                            </div>
                          ) : <div className="flex items-center justify-center h-full opacity-0 hover:opacity-100 transition-opacity"><span className="text-[10px] font-black uppercase text-indigo-400">Add</span></div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Floating Choice Menu */}
        {activeMenu && (
          <div className={`${activeMenu.isMobile ? 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6' : 'fixed z-50 animate-in zoom-in-95 duration-150'}`} style={!activeMenu.isMobile ? { top: Math.min(activeMenu.top - 120, window.innerHeight - 150), left: Math.min(activeMenu.left, window.innerWidth - 150) } : {}}>
            <div className="bg-slate-900 text-white rounded-3xl shadow-2xl p-4 border border-slate-700 flex flex-col gap-2 w-full max-w-[280px]">
              <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-800">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sign up for</span>
                  <span className="text-xs font-bold text-indigo-400">{format12h(activeMenu.time)}</span>
                </div>
                <button onClick={() => setActiveMenu(null)} className="text-slate-500 hover:text-white p-2"><X size={18}/></button>
              </div>
              <button onClick={() => addSlots('once')} className="py-3 text-sm font-bold bg-white/5 hover:bg-indigo-600 rounded-xl transition-colors">Once (This Date)</button>
              <button onClick={() => addSlots('daily')} className="py-3 text-sm font-bold bg-white/5 hover:bg-indigo-600 rounded-xl transition-colors">Daily (Rest of month)</button>
              <button onClick={() => addSlots('weekly')} className="py-3 text-sm font-bold bg-white/5 hover:bg-indigo-600 rounded-xl transition-colors">Weekly (Same day)</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Admin Entry */}
      <footer className="bg-white border-t p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 md:gap-6 justify-center text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-white border border-slate-300 rounded"></div><span>Available</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-600 rounded"></div><span>Selected</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-200 rounded"></div><span>Taken</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-50 border border-indigo-200 rounded"></div><span>Yours</span></div>
        </div>

        {!isAdmin && (
          <button 
            onClick={() => setShowAdminLogin(true)} 
            className="text-slate-300 hover:text-slate-600 p-2 flex items-center gap-2 text-xs font-bold uppercase transition-colors"
          >
            <Lock size={12}/> Admin Panel
          </button>
        )}
      </footer>

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-[40px] shadow-2xl w-full max-w-sm border border-slate-100 flex flex-col items-center">
            <div className="bg-indigo-100 p-4 rounded-full text-indigo-600 mb-6"><Lock size={32} /></div>
            <h2 className="text-2xl font-black mb-2">Admin Access</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Enter Passcode to Continue</p>
            <input 
              autoFocus
              type="password"
              placeholder="••••••••"
              className="w-full bg-slate-100 border-none p-4 rounded-2xl text-center text-xl font-bold mb-4 focus:ring-4 focus:ring-indigo-100"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            />
            <div className="flex gap-2 w-full">
              <button onClick={handleAdminLogin} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-200">Unlock</button>
              <button onClick={() => setShowAdminLogin(false)} className="px-6 bg-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
