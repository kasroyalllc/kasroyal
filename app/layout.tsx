import "./globals.css"
import Navbar from "@/components/Navbar"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "KasRoyal",
  description: "Play • Bet • Win on Kaspa",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-[#050807]">
      <body className="min-h-screen overflow-x-hidden bg-[#050807] text-white antialiased">
        <div className="min-h-screen bg-[#050807]">
          <Navbar />
          {children}
        </div>
      </body>
    </html>
  )
}