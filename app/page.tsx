// app/page.tsx
import React from 'react';

export default function Home() {
  return (
    <main style={{ 
      backgroundColor: '#020617', 
      color: 'white', 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#8b5cf6' }}>
        Exam Challenger AI
      </h1>
      <p style={{ fontSize: '1.1rem', opacity: 0.8, maxWidth: '600px' }}>
        Aapka AI Tutor taiyar hai. Ab hum JEE aur Coding ke doubts solve karenge!
      </p>

      <div style={{ 
        marginTop: '30px', 
        padding: '30px', 
        border: '1px solid #334155', 
        borderRadius: '15px',
        background: '#0f172a' 
      }}>
        <p>Chat Interface is Active</p>
      </div>
    </main>
  );
}