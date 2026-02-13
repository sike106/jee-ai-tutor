import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script"; // Next.js ka special script tag
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Yahan apni website ka naam badal dijiye
export const metadata: Metadata = {
  title: "Exam Challenger AI", 
  description: "Aapka personal JEE & Coding AI Tutor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
  <Script
    async
    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6942703237637346"
    crossOrigin="anonymous" // <--- 'o' ko 'O' kar dijiye
    strategy="afterInteractive"
  />
</head>

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* 2. Asli content (children) hamesha BODY ke andar hota hai */}
        {children}
      </body>
    </html>
  );
}