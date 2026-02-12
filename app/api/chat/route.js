import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Gemini API Key ko load karo
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { prompt } = await req.json();

    // Check if API Key exists
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ text: "Error: API Key missing in .env.local!" }, { status: 500 });
    }

    // 'gemini-flash-latest' sabse stable model hai free tier ke liye
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const systemPrompt = `You are an expert JEE Tutor from a top coaching in Kota. 
    Explain in Hinglish with Step-by-Step solutions. 
    Use LaTeX for Math ($...$ for inline, $$...$$ for block).
    Question: ${prompt}`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();
    
    return NextResponse.json({ text });

  } catch (error) {
    console.error("Gemini API Error Details:", error);
    return NextResponse.json({ text: `Bhai, error aaya hai: ${error.message}` }, { status: 500 });
  }
}