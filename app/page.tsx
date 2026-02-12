"use client";
import { useState, useEffect } from 'react';
import { db, auth, googleProvider } from '@/lib/firebase';
import { 
  signInWithPopup, onAuthStateChanged, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, getDocs, query, where, doc, updateDoc, 
  increment, setDoc, getDoc, writeBatch, addDoc, orderBy, limit 
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const ADMIN_EMAIL = "hrishikeshyadav990@gmail.com";

export default function JEEChallengerUltimate() {
  // --- UI STATES ---
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({ name: '', target: 'JEE 2026', photo: '' });
  const [screen, setScreen] = useState('auth'); 
  const [tab, setTab] = useState('pyq');
  const [menuOpen, setMenuOpen] = useState(false); 
  const [openKebab, setOpenKebab] = useState<string | null>(null);

  // --- DATA STATES ---
  const [tests, setTests] = useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any[]>([]);
  const [currIdx, setCurrIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  
  // --- AUTH & AI STATES ---
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [aiReview, setAiReview] = useState('');
  const [chat, setChat] = useState([{ role: 'ai', text: 'Namaste! Taiyar ho rank phodne ke liye?' }]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  // --- 1. AUTH & PROFILE SYNC ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const uRef = doc(db, "users", u.uid);
        const uDoc = await getDoc(uRef);
        let gPhoto = u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        
        if (uDoc.exists()) {
          const d = uDoc.data();
          if (!d.photo && u.photoURL) await updateDoc(uRef, { photo: u.photoURL });
          setProfile({ ...d, photo: d.photo || gPhoto } as any);
        } else {
          const newP = { name: u.displayName || 'Student', target: 'JEE 2026', photo: gPhoto };
          await setDoc(uRef, { ...newP, totalScore: 0 });
          setProfile(newP as any);
        }
        setScreen('app');
        fetchTests();
      } else { setScreen('auth'); }
    });
    return unsub;
  }, []);

  // Timer Logic
  useEffect(() => {
    let t: any;
    if (screen === 'quiz' && timeLeft > 0) t = setInterval(() => setTimeLeft(p => p - 1), 1000);
    else if (timeLeft === 0 && screen === 'quiz') finishQuiz();
    return () => clearInterval(t);
  }, [timeLeft, screen]);

  // --- 2. CORE ACTIONS ---
  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (e: any) { alert(e.message); }
  };

  const handleEmailAuth = async () => {
    try {
      if (isLoginMode) await signInWithEmailAndPassword(auth, email, pass);
      else await createUserWithEmailAndPassword(auth, email, pass);
    } catch (e: any) { alert(e.message); }
  };

  const fetchTests = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "questions"));
      setTests([...new Set(snap.docs.map(d => d.data().exam))]);
    } catch (error: any) {
      alert(error.message || 'Tests load nahi ho paaye.');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (name: string) => {
    setLoading(true);
    try {
      const q = query(collection(db, "questions"), where("exam", "==", name));
      const snap = await getDocs(q);
      const qs = snap.docs.map(d => ({ id: d.id, ...d.data(), userAns: '' }));
      setActiveQuiz(qs);
      setCurrIdx(0);
      setScore(0);
      setTimeLeft(1800);
      setScreen('quiz');
    } catch (error: any) {
      alert(error.message || 'Quiz start nahi ho paaya.');
    } finally {
      setLoading(false);
    }
  };

  const finishQuiz = async () => {
    if (submittingQuiz || !user) return;
    setSubmittingQuiz(true);
    setLoading(true);
    try {
      let s = 0;
      const batch = writeBatch(db);
      activeQuiz.forEach(q => {
        const correct = q.userAns?.toString().trim().toLowerCase() === q.answer?.toString().trim().toLowerCase();
        if (correct) s += 4;
        else if (q.userAns) {
          const mRef = doc(collection(db, "mistakes"));
          batch.set(mRef, { userId: user.uid, question: q.text, correct: q.answer, userAns: q.userAns, exam: q.exam });
        }
      });
      await batch.commit();
      setScore(s);
      await updateDoc(doc(db, "users", user.uid), { totalScore: increment(s) });
      setScreen('result');
      
      const wrong = activeQuiz.filter(q => q.userAns?.toString().trim().toLowerCase() !== q.answer?.toString().trim().toLowerCase());
      const prompt = `Student scored ${s}. Mistakes: ${JSON.stringify(wrong)}. Explain in Hinglish with LaTeX.`;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      setAiReview(data.text || 'AI review abhi generate nahi ho paaya.');
    } catch (error: any) {
      alert(error.message || 'Quiz submit karte waqt error aa gaya.');
    } finally {
      setLoading(false);
      setSubmittingQuiz(false);
    }
  };

  const deleteTest = async (name: string) => {
    if (!confirm(`Bhai, kya tum pakka "${name}" delete karna chahte ho?`)) return;
    const q = query(collection(db, "questions"), where("exam", "==", name));
    const snap = await getDocs(q);
    const b = writeBatch(db);
    snap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    fetchTests();
  };

  const uploadData = async () => {
    try {
      const data = JSON.parse(jsonInput);
      const batch = writeBatch(db);
      data.forEach((item: any) => {
        const ref = doc(collection(db, "questions"));
        batch.set(ref, item);
      });
      await batch.commit();
      alert("Uploaded!"); setJsonInput(''); fetchTests();
    } catch (e) { alert("JSON format galat hai!"); }
  };

  const askAI = async () => {
    if (!chatInput.trim() || loading) return;
    const newChat = [...chat, { role: 'user', text: chatInput }];
    setChat(newChat);
    setChatInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: chatInput })
      });
      const data = await res.json();
      setChat([...newChat, { role: 'ai', text: data.text || 'AI se response nahi aaya. Try again.' }]);
    } catch {
      setChat([...newChat, { role: 'ai', text: 'Bhai network issue lag raha hai, thodi der baad try kar.' }]);
    } finally {
      setLoading(false);
    }
  };

  // Sidebar Loaders
  const loadLeaderboard = async () => {
    setLoading(true);
    const q = query(collection(db, "users"), orderBy("totalScore", "desc"), limit(10));
    const s = await getDocs(q);
    setLeaderboard(s.docs.map(d => d.data()));
    setScreen('leaderboard'); setMenuOpen(false); setLoading(false);
  };

  const loadMistakes = async () => {
    setLoading(true);
    const q = query(collection(db, "mistakes"), where("userId", "==", user.uid));
    const s = await getDocs(q);
    setMistakes(s.docs.map(d => d.data()));
    setScreen('mistakes'); setMenuOpen(false); setLoading(false);
  };

  const loadBookmarks = async () => {
    setLoading(true);
    const q = query(collection(db, "bookmarks"), where("userId", "==", user.uid));
    const s = await getDocs(q);
    setBookmarks(s.docs.map(d => d.data()));
    setScreen('bookmarks'); setMenuOpen(false); setLoading(false);
  };

  // --- 3. UI RENDERING ---
  return (
    <main className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden selection:bg-[#00e676] selection:text-black">
      
      {/* SIDEBAR */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0d0d0d] border-r border-[#222] transform transition-transform duration-300 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <h2 className="text-[#00e676] font-black italic mb-10 text-xl tracking-tighter">JEE CHALLENGER</h2>
          <div className="space-y-2">
            <button onClick={() => {setScreen('app'); setMenuOpen(false)}} className="w-full text-left p-4 hover:bg-[#1a1a1a] rounded-2xl flex items-center gap-4 transition"><i className="fas fa-home text-[#00e676]"></i> Dashboard</button>
            <button onClick={loadLeaderboard} className="w-full text-left p-4 hover:bg-[#1a1a1a] rounded-2xl flex items-center gap-4 transition"><i className="fas fa-trophy text-[#00e676]"></i> Leaderboard</button>
            <button onClick={loadMistakes} className="w-full text-left p-4 hover:bg-[#1a1a1a] rounded-2xl flex items-center gap-4 transition"><i className="fas fa-book text-[#00e676]"></i> Mistakes</button>
            <button onClick={loadBookmarks} className="w-full text-left p-4 hover:bg-[#1a1a1a] rounded-2xl flex items-center gap-4 transition"><i className="fas fa-bookmark text-[#00e676]"></i> Bookmarks</button>
            <div className="h-px bg-[#222] my-6"></div>
            <button onClick={() => signOut(auth)} className="w-full text-left p-4 text-red-500 flex items-center gap-4 transition hover:bg-red-500/5 rounded-2xl"><i className="fas fa-sign-out-alt"></i> Logout</button>
          </div>
        </div>
      </div>
      {menuOpen && <div onClick={() => setMenuOpen(false)} className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"></div>}

      {/* TOP HEADER */}
      {screen !== 'auth' && (
        <header className="flex justify-between items-center p-4 bg-[#0d0d0d]/80 backdrop-blur-md border-b border-[#222] sticky top-0 z-30">
          <button onClick={() => setMenuOpen(true)} className="w-10 h-10 flex items-center justify-center bg-[#1a1a1a] rounded-xl text-[#00e676] hover:scale-105 active:scale-95 transition">☰</button>
          <img onClick={() => setScreen('profile')} src={profile.photo} className="w-10 h-10 rounded-full border-2 border-[#00e676] cursor-pointer object-cover hover:scale-110 transition" />
        </header>
      )}

      <div className="p-4 max-w-2xl mx-auto min-h-[90vh]">
        
        {/* 🟢 SCREEN: AUTH */}
        {screen === 'auth' && (
          <div className="mt-20 p-8 bg-[#111] rounded-[40px] border border-[#222] text-center shadow-2xl">
            <h1 className="text-4xl font-black text-[#00e676] mb-8 italic tracking-tighter">JEE CHALLENGER</h1>
            <div className="space-y-4">
              <input className="w-full p-4 bg-black border border-[#222] rounded-2xl outline-none focus:border-[#00e676] transition" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input className="w-full p-4 bg-black border border-[#222] rounded-2xl outline-none focus:border-[#00e676] transition" type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} />
              <button onClick={handleEmailAuth} className="w-full bg-[#00e676] text-black font-black py-4 rounded-2xl shadow-lg shadow-[#00e67622] hover:brightness-110 transition">{isLoginMode ? 'Login' : 'Signup'}</button>
              <p onClick={() => setIsLoginMode(!isLoginMode)} className="text-xs text-gray-500 cursor-pointer hover:text-white transition underline underline-offset-4">{isLoginMode ? "Create Account" : "Back to Login"}</p>
              <div className="flex items-center gap-4 my-6"><div className="flex-1 h-px bg-[#222]"></div><span className="text-gray-600 text-[10px] uppercase">Or</span><div className="flex-1 h-px bg-[#222]"></div></div>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-4 rounded-2xl hover:bg-gray-200 transition"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" className="w-5" /> Continue with Google</button>
            </div>
          </div>
        )}

        {/* 🟢 SCREEN: DASHBOARD */}
        {screen === 'app' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex gap-2 mb-8 bg-black p-1 rounded-2xl border border-[#222]">
              {['pyq', 'chapter', 'ai'].map(t => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 rounded-xl text-[10px] font-black transition ${tab === t ? 'bg-[#00e676] text-black shadow-lg shadow-[#00e67633]' : 'text-gray-500 hover:text-white'}`}>{t.toUpperCase()}</button>
              ))}
            </div>

            {tab !== 'ai' ? (
              <div className="space-y-4">
                {loading && <p className="text-center text-xs text-gray-500 uppercase tracking-wider">Loading tests...</p>}
                {tests.filter(ex => {
                  const isPYQ = ex.includes('20') || ex.toLowerCase().includes('jee');
                  return tab === 'pyq' ? isPYQ : !isPYQ;
                }).map((ex, i) => (
                  <div 
                    key={i} 
                    onClick={() => startQuiz(ex)}
                    className="relative bg-[#111] p-5 rounded-3xl border border-transparent hover:border-[#00e676] flex justify-between items-center group cursor-pointer transition-all active:scale-95 shadow-md"
                  >
                    <div className="flex-1 font-bold">
                      <span className={`text-[8px] mr-3 px-2 py-0.5 rounded uppercase tracking-tighter ${tab === 'pyq' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                        {tab === 'pyq' ? 'PYQ' : 'UNIT'}
                      </span>
                      {ex}
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); setOpenKebab(openKebab === ex ? null : ex); }} 
                      disabled={loading}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#222] transition text-gray-600"
                    >
                      <i className="fas fa-ellipsis-v"></i>
                    </button>

                    {openKebab === ex && (
                      <div className="absolute right-6 top-14 w-44 bg-[#0a0a0a] border border-[#222] rounded-2xl shadow-2xl z-40 overflow-hidden animate-in zoom-in-95 duration-200">
                        <button onClick={() => startQuiz(ex)} className="w-full text-left px-5 py-4 text-xs hover:bg-[#111] flex items-center gap-3 text-[#00e676] font-black"><i className="fas fa-play"></i> START TEST</button>
                        {user?.email === ADMIN_EMAIL && <button onClick={(e) => { e.stopPropagation(); deleteTest(ex); }} className="w-full text-left px-5 py-4 text-xs hover:bg-[#111] flex items-center gap-3 text-red-500 border-t border-[#222] font-black"><i className="fas fa-trash"></i> DELETE</button>}
                      </div>
                    )}
                  </div>
                ))}

                {!loading && tests.length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-10 bg-[#111] border border-[#222] rounded-3xl">
                    Abhi koi test available nahi hai.
                  </div>
                )}
                
                {user?.email === ADMIN_EMAIL && (
                  <div className="mt-12 p-5 bg-black border-2 border-dashed border-yellow-600/30 rounded-3xl">
                    <h3 className="text-yellow-600 text-xs font-black mb-3 uppercase tracking-widest">Admin Panel</h3>
                    <textarea className="w-full bg-[#111] p-3 text-[10px] rounded-xl border border-[#222] h-24 font-mono text-gray-500" placeholder="Paste JSON Question Array..." value={jsonInput} onChange={e => setJsonInput(e.target.value)} />
                    <button onClick={uploadData} className="w-full mt-3 bg-yellow-600 text-black py-3 rounded-xl font-black text-sm hover:brightness-110 transition">PUSH TO FIRESTORE</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[65vh] flex flex-col bg-black rounded-3xl border border-[#222] p-4">
                 <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar">
                   {chat.map((m, i) => (
                     <div key={i} className={`p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[#1a1a1a] ml-12 text-right border border-[#333]' : 'bg-[#00e67608] border border-[#00e67622] mr-12'}`}>
                       <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
                     </div>
                   ))}
                 </div>
                 <div className="flex gap-2 bg-[#111] p-1 rounded-2xl border border-[#333]">
                   <input className="flex-1 bg-transparent p-4 rounded-xl outline-none text-sm" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && askAI()} placeholder="Ask anything about JEE..." />
                   <button onClick={askAI} disabled={loading} className="bg-[#00e676] text-black px-6 rounded-xl font-black text-xs disabled:opacity-60">{loading ? '...' : 'ASK'}</button>
                 </div>
              </div>
            )}
          </div>
        )}

        {/* 🟢 SCREEN: QUIZ PLAYER (NUMERICAL FIXED) */}
        {screen === 'quiz' && (
          <div className="animate-in zoom-in-95 duration-300 bg-[#0d0d0d] p-8 rounded-[40px] border border-[#222] shadow-2xl">
             <div className="flex justify-between items-center mb-10 pb-6 border-b border-[#222]">
                <span className="text-[#00e676] font-black tracking-tighter text-xl uppercase">Question {currIdx+1}</span>
                <div className="flex gap-3">
                  <button onClick={async () => {
                    await addDoc(collection(db, "bookmarks"), { userId: user.uid, ...activeQuiz[currIdx] }); 
                    alert("Bookmarked! 🔖 Check Sidebar.");
                  }} disabled={submittingQuiz} className="w-10 h-10 bg-[#1a1a1a] rounded-full text-blue-500 hover:bg-blue-500 hover:text-white transition disabled:opacity-50"><i className="fas fa-bookmark"></i></button>
                  <span className="px-4 py-2 bg-[#1a1a1a] rounded-full font-mono text-[#00e676] border border-[#333] text-sm">{Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2,'0')}</span>
                </div>
             </div>

             <div className="text-lg leading-relaxed mb-12 prose prose-invert max-w-none">
               <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{activeQuiz[currIdx]?.text}</ReactMarkdown>
             </div>

             {/* NUMERICAL vs MCQ LOGIC */}
             <div className="space-y-4">
                {activeQuiz[currIdx]?.options && activeQuiz[currIdx].options.length > 0 ? (
                  activeQuiz[currIdx].options.map((o: any) => (
                    <button 
                      key={o} 
                      onClick={() => { const q = [...activeQuiz]; q[currIdx].userAns = o; setActiveQuiz(q); }} 
                      className={`w-full text-left p-6 rounded-3xl border-2 transition-all duration-200 ${activeQuiz[currIdx].userAns === o ? 'bg-[#00e676] text-black border-[#00e676] font-bold' : 'bg-black border-[#222] hover:border-[#444]'}`}
                    >
                      {o}
                    </button>
                  ))
                ) : (
                  // 🟢 FIXED NUMERICAL INPUT AREA
                  <div className="animate-in fade-in duration-500">
                    <p className="text-center text-gray-600 text-[10px] uppercase mb-4 tracking-widest">Numerical Type: Enter Value Below</p>
                    <input 
                      type="text" 
                      className="w-full bg-black border-2 border-[#222] p-8 rounded-3xl text-center text-5xl font-mono text-[#00e676] focus:border-[#00e676] outline-none shadow-2xl" 
                      placeholder="0.00" 
                      value={activeQuiz[currIdx]?.userAns || ""} 
                      onChange={(e) => { const q = [...activeQuiz]; q[currIdx].userAns = e.target.value; setActiveQuiz(q); }} 
                    />
                  </div>
                )}
             </div>

             <div className="mt-12 flex gap-4">
                {currIdx > 0 && <button onClick={() => setCurrIdx(currIdx-1)} disabled={submittingQuiz} className="flex-1 py-5 rounded-3xl bg-[#1a1a1a] font-bold text-gray-400 disabled:opacity-50">PREV</button>}
                <button 
                  disabled={submittingQuiz}
                  onClick={() => currIdx === activeQuiz.length-1 ? finishQuiz() : setCurrIdx(currIdx+1)} 
                  className="flex-[2] py-5 rounded-3xl bg-[#00e676] text-black font-black shadow-lg shadow-[#00e67622] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60"
                >
                  {submittingQuiz ? 'SUBMITTING...' : currIdx === activeQuiz.length-1 ? 'FINISH & SUBMIT' : 'NEXT QUESTION'}
                </button>
             </div>
          </div>
        )}

        {/* 🟢 SCREEN: LEADERBOARD */}
        {screen === 'leaderboard' && (
          <div className="animate-in slide-in-from-right duration-300">
            <h2 className="text-2xl font-black text-[#00e676] mb-8 flex items-center gap-3 italic"><i className="fas fa-crown text-yellow-500"></i> LEADERBOARD</h2>
            <div className="space-y-3">
              {leaderboard.map((u, i) => (
                <div key={i} className={`p-5 rounded-3xl border flex items-center gap-4 ${i === 0 ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-[#111] border-[#222]'}`}>
                  <span className={`text-xl font-black w-8 ${i < 3 ? 'text-yellow-500' : 'text-gray-600'}`}>#{i+1}</span>
                  <img src={u.photo} className="w-12 h-12 rounded-full border-2 border-[#222] object-cover" />
                  <div className="flex-1">
                    <p className="font-black text-sm">{u.name}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-tighter">{u.target}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#00e676] font-mono font-bold">{u.totalScore}</p>
                    <p className="text-[8px] text-gray-600 uppercase">XP</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setScreen('app')} className="w-full mt-10 py-5 bg-[#111] rounded-3xl border border-[#222] font-black tracking-widest uppercase text-xs">Back to Dashboard</button>
          </div>
        )}

        {/* 🟢 SCREEN: RESULT & AI SOLUTIONS */}
        {screen === 'result' && (
          <div className="text-center animate-in zoom-in duration-500 space-y-6">
             <div className="bg-[#111] p-12 rounded-[50px] border border-[#222] shadow-2xl">
                <h1 className="text-9xl font-black text-[#00e676] tracking-tighter">{score}</h1>
                <p className="text-gray-500 uppercase tracking-[0.4em] text-[10px] mt-4 font-bold">Total XP Gained</p>
             </div>
             
             <div className="bg-[#111] p-8 rounded-[40px] border border-[#222] text-left">
                <h3 className="text-[#00e676] font-black italic mb-6 border-l-4 border-[#00e676] pl-4 uppercase text-xs">🤖 AI Solution & Review</h3>
                <div className="prose prose-invert text-sm max-w-none leading-relaxed prose-strong:text-[#00e676]">
                   <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{aiReview || 'AI Kota Faculty is analyzing your performance... ⏳'}</ReactMarkdown>
                </div>
                <button onClick={() => setScreen('app')} className="w-full mt-10 py-5 bg-[#00e676] text-black rounded-3xl font-black shadow-lg shadow-[#00e67622] hover:scale-[1.02] transition">CONTINUE TO PREP</button>
             </div>
          </div>
        )}

        {/* 🟢 SCREEN: PROFILE */}
        {screen === 'profile' && (
          <div className="mt-10 bg-[#111] p-10 rounded-[50px] border border-[#222] text-center shadow-2xl animate-in fade-in zoom-in-95">
            <button onClick={() => setScreen('app')} className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mb-10 hover:text-white transition">← Return</button>
            <div className="flex flex-col items-center gap-8">
              <div className="relative group">
                <img src={profile.photo} className="w-32 h-32 rounded-full border-4 border-[#00e676] object-cover shadow-2xl" />
                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] font-black">EDIT PIC</div>
              </div>
              <div className="w-full space-y-4">
                <div className="text-left"><label className="text-[10px] text-gray-500 uppercase ml-2 mb-1">Full Name</label><input className="w-full bg-black border border-[#222] p-4 rounded-2xl outline-none focus:border-[#00e676]" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} /></div>
                <div className="text-left"><label className="text-[10px] text-gray-500 uppercase ml-2 mb-1">Target Exam</label><input className="w-full bg-black border border-[#222] p-4 rounded-2xl outline-none focus:border-[#00e676]" value={profile.target} onChange={e => setProfile({...profile, target: e.target.value})} /></div>
                <div className="text-left"><label className="text-[10px] text-gray-500 uppercase ml-2 mb-1">Photo URL (External)</label><input className="w-full bg-black border border-[#222] p-4 rounded-2xl outline-none focus:border-[#00e676]" value={profile.photo} onChange={e => setProfile({...profile, photo: e.target.value})} /></div>
                <button onClick={async () => { await updateDoc(doc(db, "users", user.uid), profile); alert("Profile Updated! 🚀"); setScreen('app'); }} className="w-full bg-[#00e676] text-black font-black py-5 rounded-3xl mt-6">SAVE CHANGES</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
