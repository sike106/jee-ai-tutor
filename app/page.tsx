"use client";
import React, { useState, useEffect } from 'react';
// Dhyan rakhein: Ye imports aapke firebase.js ki location ke hisaab se hone chahiye
import { auth, db, googleProvider } from '../lib/firebase'; 
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, getDocs, getDoc, doc, setDoc, updateDoc, 
  query, where, writeBatch, increment, orderBy, limit, addDoc 
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const ADMIN_EMAIL = "aapka-email@gmail.com"; // Yahan apna email dalein

export default function JEEChallengerUltimate() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({ name: '', target: 'JEE 2026', photo: '' });
  const [screen, setScreen] = useState('auth'); 
  const [tab, setTab] = useState('pyq');
  const [menuOpen, setMenuOpen] = useState(false); 
  const [openKebab, setOpenKebab] = useState<string | null>(null);

  const [tests, setTests] = useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any[]>([]);
  const [currIdx, setCurrIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [aiReview, setAiReview] = useState('');
  const [chat, setChat] = useState([{ role: 'ai', text: 'Namaste! Taiyar ho rank phodne ke liye?' }]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  // 1. AUTH & PROFILE SYNC
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

  // 2. CORE ACTIONS
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

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-[#00e676] selection:text-black">
      {/* Navigation & Container Logic */}
      <div className="max-w-md mx-auto px-4 pb-20">
        
        {/* SCREEN: AUTH */}
        {screen === 'auth' && (
          <div className="mt-20 p-8 bg-[#111] rounded-[40px] border border-[#222] text-center shadow-2xl">
            <h1 className="text-4xl font-black text-[#00e676] mb-8 italic tracking-tighter">JEE CHALLENGER</h1>
            <div className="space-y-4">
              <input className="w-full p-4 bg-black border border-[#222] rounded-2xl outline-none focus:border-[#00e676]" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input className="w-full p-4 bg-black border border-[#222] rounded-2xl outline-none focus:border-[#00e676]" type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} />
              <button onClick={handleEmailAuth} className="w-full bg-[#00e676] text-black font-black py-4 rounded-2xl">{isLoginMode ? 'Login' : 'Signup'}</button>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-4 rounded-2xl mt-4">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" className="w-5" /> Google Login
              </button>
              <p onClick={() => setIsLoginMode(!isLoginMode)} className="text-xs text-gray-500 mt-4 cursor-pointer">
                {isLoginMode ? "Create Account" : "Back to Login"}
              </p>
            </div>
          </div>
        )}

        {/* SCREEN: DASHBOARD */}
        {screen === 'app' && (
          <div className="pt-10">
            <div className="flex gap-2 mb-8 bg-[#111] p-1 rounded-2xl border border-[#222]">
              {['pyq', 'chapter', 'ai'].map(t => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 rounded-xl text-[10px] font-black transition ${tab === t ? 'bg-[#00e676] text-black' : 'text-gray-500'}`}>{t.toUpperCase()}</button>
              ))}
            </div>

            {tab !== 'ai' ? (
              <div className="space-y-4">
                {loading && <p className="text-center text-xs text-gray-500">Loading tests...</p>}
                {tests.map((ex, i) => (
                  <div key={i} onClick={() => startQuiz(ex)} className="bg-[#111] p-5 rounded-3xl border border-transparent hover:border-[#00e676] flex justify-between items-center cursor-pointer transition-all">
                    <span className="font-bold">{ex}</span>
                    <button className="text-gray-600"><i className="fas fa-play"></i></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[60vh] flex flex-col bg-[#111] rounded-3xl border border-[#222] p-4">
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {chat.map((m, i) => (
                    <div key={i} className={`p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[#222] ml-8' : 'bg-[#00e67611] mr-8'}`}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 bg-black p-4 rounded-xl outline-none text-sm" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask JEE Doubts..." />
                  <button onClick={askAI} disabled={loading} className="bg-[#00e676] text-black px-6 rounded-xl font-black">{loading ? '...' : 'ASK'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* QUIZ SCREEN */}
        {screen === 'quiz' && (
          <div className="mt-10 bg-[#111] p-8 rounded-[40px] border border-[#222]">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[#00e676] font-black">Q{currIdx+1}</span>
              <span className="font-mono">{Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2,'0')}</span>
            </div>
            <div className="text-lg mb-8">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{activeQuiz[currIdx]?.text}</ReactMarkdown>
            </div>
            <input 
              className="w-full bg-black border-2 border-[#222] p-6 rounded-3xl text-center text-3xl font-mono text-[#00e676]" 
              placeholder="Your Answer"
              value={activeQuiz[currIdx]?.userAns || ""}
              onChange={(e) => { const q = [...activeQuiz]; q[currIdx].userAns = e.target.value; setActiveQuiz(q); }}
            />
            <div className="mt-8 flex gap-4">
              <button onClick={() => setCurrIdx(currIdx-1)} disabled={currIdx === 0} className="flex-1 py-4 bg-[#222] rounded-2xl">PREV</button>
              <button onClick={() => currIdx === activeQuiz.length-1 ? finishQuiz() : setCurrIdx(currIdx+1)} className="flex-2 py-4 bg-[#00e676] text-black font-black rounded-2xl">
                {submittingQuiz ? 'SUBMITTING...' : currIdx === activeQuiz.length-1 ? 'FINISH' : 'NEXT'}
              </button>
            </div>
          </div>
        )}

        {/* RESULT SCREEN */}
        {screen === 'result' && (
          <div className="mt-20 text-center">
            <h2 className="text-4xl font-black mb-4">Score: {score}</h2>
            <div className="bg-[#111] p-6 rounded-3xl text-left border border-[#222]">
              <h3 className="text-[#00e676] font-bold mb-4">AI Analysis:</h3>
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{aiReview}</ReactMarkdown>
            </div>
            <button onClick={() => setScreen('app')} className="mt-8 bg-[#00e676] text-black px-10 py-4 rounded-2xl font-black">BACK TO HOME</button>
          </div>
        )}

      </div>
    </main>
  );
}