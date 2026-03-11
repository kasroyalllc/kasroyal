"use client"

import { ChangeEvent, useEffect, useState } from "react"

type ProfileData = {
  displayName: string
  avatarUrl: string
}

const defaultProfile: ProfileData = {
  displayName: "KasRoyal User",
  avatarUrl: "",
}

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState(defaultProfile.displayName)
  const [avatarUrl, setAvatarUrl] = useState(defaultProfile.avatarUrl)
  const [message, setMessage] = useState("Upload a profile picture and save your profile.")

  useEffect(() => {
    const stored = localStorage.getItem("kasroyal-profile")
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ProfileData
        setDisplayName(parsed.displayName || defaultProfile.displayName)
        setAvatarUrl(parsed.avatarUrl || "")
      } catch {}
    }
  }, [])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setMessage("Please upload an image file.")
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      setMessage("Image too large. Keep it under 3MB.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        setAvatarUrl(result)
        setMessage("Image selected. Save profile to apply it.")
      }
    }
    reader.readAsDataURL(file)
  }

  function saveProfile() {
    const payload: ProfileData = {
      displayName: displayName.trim() || defaultProfile.displayName,
      avatarUrl,
    }

    localStorage.setItem("kasroyal-profile", JSON.stringify(payload))
    window.dispatchEvent(new Event("kasroyal-profile-updated"))
    setMessage("Profile saved successfully.")
  }

  function resetProfile() {
    localStorage.removeItem("kasroyal-profile")
    setDisplayName(defaultProfile.displayName)
    setAvatarUrl("")
    window.dispatchEvent(new Event("kasroyal-profile-updated"))
    setMessage("Profile reset.")
  }

  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.08),transparent_26%)]" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 md:px-6 xl:px-8">
        <div className="rounded-[30px] border border-amber-300/15 bg-black/30 p-6 shadow-[0_0_60px_rgba(255,200,80,0.05)] backdrop-blur-xl md:p-8">
          <div className="mb-8">
            <div className="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              KasRoyal Profile
            </div>

            <h1 className="text-4xl font-black text-white">Customize Your Profile</h1>
            <p className="mt-3 max-w-2xl text-white/65">
              Upload any profile picture you want and set the display name that appears across KasRoyal.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,#11110f,#0a0d0c)] p-5">
              <div className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-emerald-200">
                Preview
              </div>

              <div className="mx-auto flex h-52 w-52 items-center justify-center overflow-hidden rounded-full border border-emerald-300/20 bg-black/40 shadow-[0_0_25px_rgba(0,255,200,0.10)]">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-6xl font-black text-white/70">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="mt-5 text-center">
                <div className="text-xl font-black text-white">{displayName}</div>
                <div className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                  Ready for Arena
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,#11110f,#0a0d0c)] p-5">
              <div className="grid gap-5">
                <div>
                  <label className="mb-2 block text-sm font-bold uppercase tracking-[0.14em] text-white/75">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={24}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none"
                    placeholder="Enter display name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold uppercase tracking-[0.14em] text-white/75">
                    Profile Picture
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    onChange={handleFileChange}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-400/15 file:px-4 file:py-2 file:font-bold file:text-emerald-200"
                  />
                  <p className="mt-2 text-sm text-white/45">
                    PNG, JPG, or WEBP. Max 3MB.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={saveProfile}
                    className="rounded-2xl bg-gradient-to-r from-emerald-400/30 to-emerald-300/10 px-6 py-3 text-sm font-black text-amber-100 shadow-[0_0_30px_rgba(0,255,200,0.15)] transition hover:scale-[1.02]"
                  >
                    Save Profile
                  </button>

                  <button
                    onClick={resetProfile}
                    className="rounded-2xl border border-amber-300/20 bg-black/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/5"
                  >
                    Reset
                  </button>
                </div>

                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-4 text-sm text-white/90">
                  {message}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}