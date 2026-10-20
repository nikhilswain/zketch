import ZketchMark from "@/components/ZketchMark";

const NoMobile = () => {
  return (
    <div className="flex min-h-screen flex-col bg-zk-surface font-ui text-zk-text">
      <header className="zk-logo-hover flex h-16 shrink-0 items-center gap-2.5 px-6">
        <ZketchMark size={32} />
        <span className="font-display text-[20px] font-semibold">Zketch</span>
      </header>
      <main className="flex flex-1 flex-col justify-center px-6 pb-16">
        <svg viewBox="0 0 240 90" className="mb-10 w-56" aria-hidden="true">
          <rect x="4" y="10" width="132" height="76" rx="4" style={{ fill: "var(--zk-raised)" }} />
          <rect x="150" y="18" width="52" height="68" rx="4" style={{ fill: "var(--zk-raised)" }} />
          <rect x="214" y="44" width="22" height="42" rx="3" style={{ fill: "var(--zk-hover)" }} />
          <path d="M22 62 C 48 30, 74 76, 118 36" stroke="var(--zk-accent)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M160 64 C 170 44, 182 72, 192 46" stroke="var(--zk-accent)" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M209 40 L240 90" style={{ stroke: "var(--zk-disabled)" }} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <h1 className="font-display text-[34px] leading-tight font-semibold">Made for bigger screens</h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-zk-text-2">
          Zketch needs room for the canvas and your brushes, so it runs on desktops and tablets. Open it on a computer or a
          tablet to start drawing.
        </p>
        <p className="mt-6 text-[13px] text-zk-muted">PS: not supporting phones is my new time-management hack.</p>
      </main>
    </div>
  );
};

export default NoMobile;
