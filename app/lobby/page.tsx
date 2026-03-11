const soloGames = [
  {
    title: "Coin Flip",
    subtitle: "Pick heads or tails",
    betRange: "1 - 100 KAS",
    status: "Live",
    href: "/coinflip",
  },
  {
    title: "Dice Roll",
    subtitle: "Fast bets, instant results",
    betRange: "1 - 50 KAS",
    status: "Live",
    href: "/dice",
  },
  {
    title: "Crash",
    subtitle: "Cash out before it crashes",
    betRange: "1 - 75 KAS",
    status: "Live",
    href: "/crash",
  },
];

const arenaGames = [
  {
    title: "Connect 4",
    subtitle: "1v1 skill battle",
    entry: "5 KAS",
    players: "12 live matches",
    href: "/connect4",
  },
  {
    title: "Chess Duel",
    subtitle: "Speed chess wagering",
    entry: "10 KAS",
    players: "6 live matches",
    href: "/chess",
  },
  {
    title: "Tic-Tac-Toe",
    subtitle: "Quick 1v1 matches",
    entry: "3 KAS",
    players: "18 live matches",
    href: "/tictactoe",
  },
];

const liveMatches = [
  {
    game: "Connect 4",
    left: "KasKing01",
    right: "TurboBetGuy",
    pot: "20 KAS",
    href: "/connect4",
  },
  {
    game: "Chess Duel",
    left: "CryptoCrush44",
    right: "LuckyDog23",
    pot: "35 KAS",
    href: "/chess",
  },
  {
    game: "Tic-Tac-Toe",
    left: "StakeLord",
    right: "FlashMove",
    pot: "8 KAS",
    href: "/tictactoe",
  },
];

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-[#050807] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,200,0.10),transparent_25%),radial-gradient(circle_at_bottom,rgba(255,200,80,0.08),transparent_22%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              KasRoyal Lobby
            </p>
            <h1 className="text-4xl font-black md:text-5xl">
              Choose your table.
            </h1>
            <p className="mt-2 max-w-2xl text-white/65">
              Jump into solo action against the house or enter the live arena for real 1v1 skill matches.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/90">
              Connect Wallet
            </button>
            <div className="rounded-xl bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
              Balance: 0.00 KAS
            </div>
          </div>
        </div>

        <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                  Solo games
                </p>
                <h2 className="text-3xl font-black">House games</h2>
              </div>
            </div>

            <div className="grid gap-5">
              {soloGames.map((game) => (
                <div
                  key={game.title}
                  className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5 transition hover:border-emerald-300/30 hover:shadow-[0_0_30px_rgba(0,255,200,0.10)]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
                      {game.status}
                    </span>
                    <span className="text-sm font-semibold text-amber-300">
                      {game.betRange}
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold">{game.title}</h3>
                  <p className="mt-2 text-white/65">{game.subtitle}</p>

                  <div className="mt-6 flex gap-3">
                    <a
                      href={game.href}
                      className="rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-bold text-black"
                    >
                      Play Now
                    </a>
                    <a
                      href={game.href}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80"
                    >
                      View Table
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                  Live arena
                </p>
                <h2 className="text-3xl font-black">1v1 skill games</h2>
              </div>
              <button className="text-sm font-semibold text-amber-300">
                Create Match
              </button>
            </div>

            <div className="grid gap-5">
              {arenaGames.map((game) => (
                <div
                  key={game.title}
                  className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5 transition hover:border-amber-300/25 hover:shadow-[0_0_30px_rgba(255,200,80,0.08)]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                      {game.players}
                    </span>
                    <span className="text-sm font-semibold text-amber-300">
                      Entry {game.entry}
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold">{game.title}</h3>
                  <p className="mt-2 text-white/65">{game.subtitle}</p>

                  <div className="mt-6 flex gap-3">
                    <a
                      href={game.href}
                      className="rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-2 text-sm font-bold text-black"
                    >
                      Join Match
                    </a>
                    <a
                      href={game.href}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80"
                    >
                      Spectate
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Now playing
              </p>
              <h2 className="text-3xl font-black">Live matches</h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {liveMatches.map((match) => (
              <div
                key={`${match.game}-${match.left}-${match.right}`}
                className="rounded-[22px] border border-white/8 bg-black/30 p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-300">
                    {match.game}
                  </span>
                  <span className="text-sm font-bold text-amber-300">
                    {match.pot}
                  </span>
                </div>

                <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between text-sm text-white/75">
                    <span>{match.left}</span>
                    <span>vs</span>
                    <span>{match.right}</span>
                  </div>

                  <a
                    href={match.href}
                    className="mt-4 block w-full rounded-xl bg-white/8 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-400/15 hover:text-emerald-300"
                  >
                    Watch Match
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}