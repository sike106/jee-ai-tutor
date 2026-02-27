import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Optional Gemini client (only constructed if key present)
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// Ollama is optional. On Vercel, you typically won't have an Ollama host unless you run it yourself.
const OLLAMA_HOST = process.env.OLLAMA_HOST;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemini-3-flash-preview:cloud";

export async function POST(req) {
  try {
    const { prompt, provider, model, stream } = await req.json();
    const modelOverride = model?.trim();

    const systemPrompt = `You are an expert JEE Tutor from a top coaching in Kota.
Explain in Hinglish with Step-by-Step solutions.
Use LaTeX for Math ($...$ for inline, $$...$$ for block).
    Question: ${prompt}`;

    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasOllama = Boolean(process.env.OLLAMA_HOST);

    const providerPref = String(provider || "").toLowerCase().trim();

    // 1) Explicit provider selection
    if (providerPref === "ollama") {
      if (!hasOllama) {
        throw new Error("OLLAMA_HOST missing. (Vercel pe localhost Ollama nahi chalega)");
      }
      if (stream) return await streamWithOllama(systemPrompt, modelOverride, req.signal);
      const text = await generateWithOllama(systemPrompt, modelOverride);
      return NextResponse.json({ text });
    }

    if (providerPref === "gemini") {
      if (!hasGemini) throw new Error("GEMINI_API_KEY missing.");
      const text = await generateWithGemini(systemPrompt, modelOverride);
      return NextResponse.json({ text });
    }

    // 2) Default selection: prefer Gemini when available (works on Vercel), otherwise Ollama.
    if (hasGemini) {
      const text = await generateWithGemini(systemPrompt, modelOverride);
      return NextResponse.json({ text });
    }

    if (hasOllama) {
      if (stream) {
        return await streamWithOllama(systemPrompt, modelOverride, req.signal);
      }
      const text = await generateWithOllama(systemPrompt, modelOverride);
      return NextResponse.json({ text });
    }

    // If neither configured, inform user clearly
    const text =
      "AI configured nahi hai: `GEMINI_API_KEY` set karo (recommended for Vercel) ya `OLLAMA_HOST` set karo (self-hosted Ollama).";
    return NextResponse.json({ text });
  } catch (error) {
    console.error("AI Route Error:", error);
    return NextResponse.json(
      { text: `Bhai, error aaya hai: ${error.message}` },
      { status: 500 }
    );
  }
}

async function generateWithGemini(prompt, overrideModel) {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY missing in .env.local");
  }
  const modelId = overrideModel || GEMINI_MODEL;
  const model = genAI.getGenerativeModel({ model: modelId });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

async function generateWithOllama(prompt, overrideModel) {
  // Ollama local HTTP API: https://github.com/ollama/ollama/blob/main/docs/api.md
  const modelId = overrideModel || OLLAMA_MODEL;
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Ollama se response nahi aaya (status ${res.status}). Model: ${modelId}. Details: ${body}`
    );
  }

  const data = await res.json();
  // Ollama returns { response: "...", done: true }
  return data.response || "Ollama se text nahi mila.";
}

async function streamWithOllama(prompt, overrideModel, signal) {
  const modelId = overrideModel || OLLAMA_MODEL;

  const upstream = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      prompt,
      stream: true,
    }),
    signal,
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    throw new Error(
      `Ollama stream start nahi hua (status ${upstream.status}). Model: ${modelId}. Details: ${body}`
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body?.getReader();
  if (!reader) {
    throw new Error("Ollama stream body missing.");
  }

  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const chunk = JSON.parse(trimmed);
          if (chunk.error) {
            throw new Error(chunk.error);
          }
          if (chunk.response) {
            controller.enqueue(encoder.encode(chunk.response));
          }
          if (chunk.done) {
            controller.close();
            return;
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancel errors
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
