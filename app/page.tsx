"use client";
import React, { useState, useEffect, useRef } from 'react';
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
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || ADMIN_EMAIL)
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export default function JEEChallengerUltimate() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({ name: '', target: 'JEE 2026', photo: '' });
  const [screen, setScreen] = useState('auth'); 
  const [tab, setTab] = useState('pyq');
  const [menuOpen, setMenuOpen] = useState(false); 
  const [openKebab, setOpenKebab] = useState<string | null>(null);

  const [pyqTests, setPyqTests] = useState<string[]>([]);
  const [chapterTests, setChapterTests] = useState<string[]>([]);
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
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<'pyq' | 'chapter'>('pyq');
  const [jsonInput, setJsonInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const userEmail = String(
    user?.email ||
      user?.providerData?.find((p: any) => p?.email)?.email ||
      ''
  )
    .trim()
    .toLowerCase();

  const isAdmin = Boolean(userEmail && ADMIN_EMAILS.includes(userEmail));

  useEffect(() => {
    if (tab === 'admin' && !isAdmin) setTab('pyq');
  }, [tab, isAdmin]);

  const looksLikePyqExamName = (exam: string) => {
    const s = String(exam || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s) return false;
    const keywords = [
      'jee main',
      'jee mains',
      'jee advanced',
      'jee advance',
      'jee adv',
      'neet',
      'bitsat',
      'viteee',
      'wbjee',
      'kcet',
      'comedk',
      'mht cet',
      'nta',
      'pyq',
      'previous year',
    ];
    return keywords.some(k => s.includes(k));
  };

  const isChapterQuestion = (q: any) => {
    const tag = String(q?.type || q?.mode || q?.category || '').toLowerCase();
    if (tag === 'chapter') return true;
    if (tag === 'pyq') return false;

    if (Boolean(q?.chapter) || Boolean(q?.topic)) return true;

    // If only `exam` is present, treat non-exam-looking labels as chapter tests (e.g., "Quadratic Equation").
    const exam = String(q?.exam || '').trim();
    if (exam && !looksLikePyqExamName(exam)) return true;

    return false;
  };

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
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      // Silent exit if user closes the popup themselves
      if (e?.code === "auth/popup-closed-by-user") return;
      alert(e.message || "Google login fail ho gaya, phir try karo.");
    }
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
      const pyq = new Set<string>();
      const chapter = new Set<string>();

      snap.docs.forEach(docSnap => {
        const data: any = docSnap.data();
        const exam = String(data?.exam || '').trim();
        if (!exam) return;
        if (isChapterQuestion(data)) chapter.add(exam);
        else pyq.add(exam);
      });

      setPyqTests([...pyq].sort((a, b) => a.localeCompare(b)));
      setChapterTests([...chapter].sort((a, b) => a.localeCompare(b)));
    } catch (error: any) {
      alert(error.message || 'Tests load nahi ho paaye.');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (name: string, kind: 'pyq' | 'chapter') => {
    setLoading(true);
    try {
      const q = query(collection(db, "questions"), where("exam", "==", name));
      const snap = await getDocs(q);
      const qs = snap.docs
        .map(d => ({ id: d.id, ...d.data(), userAns: '' }))
        .filter(item => (kind === 'chapter' ? isChapterQuestion(item) : !isChapterQuestion(item)));

      if (!qs.length) {
        alert(kind === 'chapter' ? 'Is chapter test me questions nahi mile.' : 'Is PYQ test me questions nahi mile.');
        return;
      }

      setActiveQuiz(qs as any);
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

  const deleteTest = async (name: string, kind: 'pyq' | 'chapter') => {
    if (!isAdmin) return;
    const ok = confirm(`Delete ${kind.toUpperCase()} test "${name}"? Ye saare questions delete kar dega.`);
    if (!ok) return;

    const key = `${kind}:${name}`;
    setDeletingKey(key);
    setLoading(true);
    try {
      const q = query(collection(db, "questions"), where("exam", "==", name));
      const snap = await getDocs(q);

      const docsToDelete = snap.docs.filter(d => {
        const data: any = d.data();
        return kind === 'chapter' ? isChapterQuestion(data) : !isChapterQuestion(data);
      });

      if (!docsToDelete.length) {
        alert("Is test me delete karne ke liye questions nahi mile.");
        return;
      }

      const chunkSize = 450; // Firestore batch hard limit is 500 ops
      for (let i = 0; i < docsToDelete.length; i += chunkSize) {
        const batch = writeBatch(db);
        docsToDelete.slice(i, i + chunkSize).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      alert(`Deleted ${docsToDelete.length} question(s) from "${name}".`);
      fetchTests();
    } catch (e: any) {
      alert(e?.message || "Delete failed.");
    } finally {
      setDeletingKey(null);
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
    const baseChat = [...chat, { role: 'user', text: chatInput }, { role: 'ai', text: '' }];
    const aiIndex = baseChat.length - 1;
    setChat(baseChat);
    setChatInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: chatInput,
          stream: true,
        })
      });

      const isStream = (res.headers.get('content-type') || '').includes('text/plain');
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (isStream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let lastPaint = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          fullText += decoder.decode(value, { stream: true });
          const now = Date.now();
          if (now - lastPaint > 40) {
            lastPaint = now;
            setChat(prev => {
              if (!prev[aiIndex]) return prev;
              const next = [...prev];
              next[aiIndex] = { ...next[aiIndex], text: fullText };
              return next;
            });
          }
        }

        setChat(prev => {
          if (!prev[aiIndex]) return prev;
          const next = [...prev];
          next[aiIndex] = { ...next[aiIndex], text: fullText || 'AI se response nahi aaya. Try again.' };
          return next;
        });
      } else {
        const data = await res.json();
        setChat(prev => {
          if (!prev[aiIndex]) return prev;
          const next = [...prev];
          next[aiIndex] = { ...next[aiIndex], text: data.text || 'AI se response nahi aaya. Try again.' };
          return next;
        });
      }
    } catch {
      setChat(prev => {
        if (!prev[aiIndex]) return prev;
        const next = [...prev];
        next[aiIndex] = { ...next[aiIndex], text: 'Bhai network issue lag raha hai, thodi der baad try kar.' };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (screen !== 'app' || tab !== 'ai') return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, screen, tab]);

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
    if (!isAdmin) {
      alert("Admin only!");
      return;
    }
    if (!jsonInput.trim()) {
      alert("JSON paste karo.");
      return;
    }
    if (uploading) return;

    setUploading(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const chunkSize = 450; // Firestore batch hard limit is 500 ops

      for (let i = 0; i < items.length; i += chunkSize) {
        const batch = writeBatch(db);
        items.slice(i, i + chunkSize).forEach((raw: any) => {
          if (!raw || typeof raw !== 'object') return;

          const { id, ...rest } = raw;
          const inferred = String(rest?.type || rest?.mode || rest?.category || '').toLowerCase().trim();
          const normalizedType = inferred === 'chapter' || inferred === 'pyq' ? inferred : uploadKind;
          const ref = typeof id === 'string' && id.trim()
            ? doc(db, "questions", id.trim())
            : doc(collection(db, "questions"));

          batch.set(ref, { ...rest, type: normalizedType });
        });
        await batch.commit();
      }

      alert(`Uploaded ${items.length} question(s)!`);
      setJsonInput('');
      fetchTests();
    } catch (e: any) {
      alert(e?.message ? `JSON error: ${e.message}` : "JSON format galat hai!");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="h-[100dvh] overflow-hidden bg-black text-white font-sans selection:bg-[#00e676] selection:text-black">
      {/* Navigation & Container Logic */}
      <div className="h-full w-full max-w-md md:max-w-2xl xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="h-full overflow-y-auto pb-20">
        
        {/* SCREEN: AUTH */}
        {screen === 'auth' && (
          <div className="mt-10 sm:mt-20 p-6 sm:p-8 bg-[#111] rounded-[40px] border border-[#222] text-center shadow-2xl">
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
          <div className="pt-6 sm:pt-10">
            <div className="flex gap-2 mb-8 bg-[#111] p-1 rounded-2xl border border-[#222]">
              {['pyq', 'chapter', 'ai', ...(isAdmin ? ['admin'] : [])].map(t => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 rounded-xl text-[10px] font-black transition ${tab === t ? 'bg-[#00e676] text-black' : 'text-gray-500'}`}>{t.toUpperCase()}</button>
              ))}
            </div>

            {tab === 'ai' ? (
              <div className="h-[min(60dvh,560px)] sm:h-[min(65dvh,640px)] flex flex-col bg-[#111] rounded-3xl border border-[#222] p-4">
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {chat.map((m, i) => (
                    <div key={i} className={`p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[#222] ml-8' : 'bg-[#00e67611] mr-8'}`}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 bg-black p-4 rounded-xl outline-none text-sm" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask JEE Doubts..." />
                  <button onClick={askAI} disabled={loading} className="bg-[#00e676] text-black px-6 rounded-xl font-black">{loading ? '...' : 'ASK'}</button>
                </div>
              </div>
            ) : tab === 'admin' ? (
              <div className="bg-[#111] rounded-[40px] border border-[#222] p-6 sm:p-8 shadow-2xl">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-xl sm:text-2xl font-black text-[#00e676] tracking-tight">ADMIN UPLOAD</h2>
                  <span className="text-[10px] px-3 py-2 rounded-full bg-black border border-[#222] text-gray-400">
                    {userEmail || "no-email"}
                  </span>
                </div>

                <p className="text-xs text-gray-400 mb-4">
                  Paste JSON (array ya single object). Firestore collection: <span className="text-gray-200">questions</span>. Selected type auto add ho jayega.
                </p>

                <div className="flex gap-2 mb-4 bg-black p-1 rounded-2xl border border-[#222]">
                  {(['pyq', 'chapter'] as const).map(k => (
                    <button
                      key={k}
                      onClick={() => setUploadKind(k)}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black transition ${uploadKind === k ? 'bg-[#00e676] text-black' : 'text-gray-500'}`}
                    >
                      {k === 'pyq' ? 'PYQ' : 'CHAPTER'}
                    </button>
                  ))}
                </div>

                <textarea
                  className="w-full min-h-[240px] sm:min-h-[320px] bg-black border border-[#222] rounded-3xl p-4 font-mono text-xs outline-none focus:border-[#00e676]"
                  placeholder={
                    uploadKind === 'chapter'
                      ? 'Example: [{"exam":"Quadratic Equation","chapter":"Quadratic Equation","text":"...","answer":"..."}]'
                      : 'Example: [{"exam":"JEE Main 2024","text":"...","answer":"..."}]'
                  }
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                />

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={uploadData}
                    disabled={uploading}
                    className="flex-1 bg-[#00e676] text-black font-black py-4 rounded-2xl disabled:opacity-60"
                  >
                    {uploading ? "UPLOADING..." : "UPLOAD"}
                  </button>
                  <button
                    onClick={() => setJsonInput('')}
                    disabled={uploading}
                    className="px-6 bg-[#222] text-white font-black py-4 rounded-2xl disabled:opacity-60"
                  >
                    CLEAR
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {loading && <p className="text-center text-xs text-gray-500">Loading tests...</p>}
                {(tab === 'chapter' ? chapterTests : pyqTests).map((ex, i) => (
                  <div key={i} onClick={() => startQuiz(ex, tab === 'chapter' ? 'chapter' : 'pyq')} className="bg-[#111] p-5 rounded-3xl border border-transparent hover:border-[#00e676] flex justify-between items-center cursor-pointer transition-all">
                    <span className="font-bold">{ex}</span>
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTest(ex, tab === 'chapter' ? 'chapter' : 'pyq');
                          }}
                          disabled={deletingKey === `${tab === 'chapter' ? 'chapter' : 'pyq'}:${ex}`}
                          className="text-xs font-black px-3 py-2 rounded-xl bg-black border border-[#222] text-red-400 disabled:opacity-60"
                          title="Delete test (admin only)"
                        >
                          {deletingKey === `${tab === 'chapter' ? 'chapter' : 'pyq'}:${ex}` ? '...' : 'DEL'}
                        </button>
                      )}
                      <button className="text-gray-600"><i className="fas fa-play"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QUIZ SCREEN */}
        {screen === 'quiz' && (
          <div className="mt-6 sm:mt-10 bg-[#111] p-6 sm:p-8 rounded-[40px] border border-[#222]">
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
          <div className="mt-10 sm:mt-20 text-center">
            <h2 className="text-4xl font-black mb-4">Score: {score}</h2>
            <div className="bg-[#111] p-6 rounded-3xl text-left border border-[#222]">
              <h3 className="text-[#00e676] font-bold mb-4">AI Analysis:</h3>
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{aiReview}</ReactMarkdown>
            </div>
            <button onClick={() => setScreen('app')} className="mt-8 bg-[#00e676] text-black px-10 py-4 rounded-2xl font-black">BACK TO HOME</button>
          </div>
        )}

      </div>
      </div>
    </main>
  );
}
