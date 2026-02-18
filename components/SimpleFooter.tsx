export function SimpleFooter() {
  return (
    <footer className="border-t border-dark-200/30 mt-8">
      <div className="container mx-auto px-4 py-6">
        {/* Links row */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-mono tracking-wide">
          <a href="/analytics" className="text-gray-500 hover:text-neon-cyan transition-colors">
            ANALYTICS
          </a>
          <span className="text-dark-200/50 hidden sm:inline">|</span>
          <a href="/leaderboard" className="text-gray-500 hover:text-neon-cyan transition-colors">
            LEADERBOARD
          </a>
          <span className="text-dark-200/50 hidden sm:inline">|</span>
          <a
            href="https://t.me/AIntivirus"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-neon-cyan transition-colors"
          >
            TELEGRAM
          </a>
          <span className="text-dark-200/50 hidden sm:inline">|</span>
          <a
            href="https://x.com/officialmcafee"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-neon-cyan transition-colors"
          >
            X / TWITTER
          </a>
          <span className="text-dark-200/50 hidden sm:inline">|</span>
          <a
            href="https://mix.aintivirus.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-neon-cyan transition-colors"
          >
            MIXER
          </a>
          <span className="text-dark-200/50 hidden sm:inline">|</span>
          <a
            href="https://bridge.aintivirus.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-neon-cyan transition-colors"
          >
            BRIDGE
          </a>
        </div>

        {/* Branding */}
        <div className="mt-4 text-center">
          <p className="text-gray-600 text-[11px] tracking-widest">
            POWERED BY{" "}
            <a
              href="https://aintivirus.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan/70 hover:text-neon-cyan transition-colors"
            >
              AINTIVIRUS
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
