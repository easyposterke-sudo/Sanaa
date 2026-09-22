import { Link } from 'react-router-dom';
import { useAuthStore } from './auth/authStore';

const creatorState = { openReferenceCreator: true };
const authDestination = { from: { pathname: '/poster', state: creatorState } };

export function HomePage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  return (
    <div className="min-h-screen bg-[#11150f] text-[#f8f6ed]">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 sm:gap-4 sm:px-9 sm:py-4">
        <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3" aria-label="Sanaa Studio home">
          <img src="/sanaa-studio-logo.png" alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain p-0.5 sm:h-14 sm:w-14" />
          <span className="flex flex-col leading-tight"><span className="text-base font-semibold tracking-tight sm:text-xl">Sanaa</span><span className="text-[9px] font-medium uppercase tracking-[.3em] text-[#c0b8a4] sm:text-xs">Studio</span></span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1 text-xs sm:gap-4 sm:text-sm">
          {user ? (
            <>
              <span className="hidden max-w-40 truncate text-[#c0b8a4] sm:inline" title={user.email}>{user.name || user.email}</span>
              <button type="button" onClick={logout} className="whitespace-nowrap rounded-lg px-2 py-2 text-[#c0b8a4] hover:text-white sm:px-3">Sign out</button>
              <Link to="/poster/my" className="whitespace-nowrap rounded-lg border border-white/20 px-2 py-2 hover:bg-white/10 sm:px-3">My posters</Link>
            </>
          ) : (
            <>
              <Link to="/login" state={authDestination} className="whitespace-nowrap rounded-lg px-2 py-2 text-[#ded7c5] hover:text-white sm:px-3">Log in</Link>
              <Link to="/signup" state={authDestination} className="whitespace-nowrap rounded-lg bg-[#236b45] px-3 py-2 font-semibold text-white hover:bg-[#2e8155] sm:px-4">Sign up free</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-16 pt-8 sm:px-9 sm:pb-20 sm:pt-20">
          <div className="pointer-events-none absolute -left-40 top-0 h-[30rem] w-[30rem] rounded-full bg-[#155c3b]/25 blur-[110px]" />
          <div className="pointer-events-none absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[#a48723]/15 blur-[110px]" />
          <div className="relative mx-auto max-w-6xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#346448] bg-[#183325] px-4 py-2 text-xs font-medium text-[#a9ebba] sm:mb-8 sm:text-sm"><span className="h-2 w-2 rounded-full bg-[#62ca86]" /> Reference to editable design</div>
            <h1 className="mx-auto max-w-5xl leading-[1.1] tracking-tight"><span className="block whitespace-nowrap text-[clamp(1.4rem,6.7vw,4.5rem)] font-bold">See a poster you love?</span><span className="block bg-gradient-to-r from-[#50c985] via-[#c2e185] to-[#f9dc65] bg-clip-text pb-1 font-serif text-[clamp(2.1rem,8vw,4.5rem)] font-semibold italic text-transparent">Make it yours.</span></h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#baaf9d] sm:mt-7 sm:text-xl">Upload one reference poster. Sanaa rebuilds it as editable text, shapes and image layers, ready for your own finishing touches.</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:mt-10 sm:flex-row sm:gap-3">
              <Link to="/poster" state={creatorState} className="w-full rounded-xl bg-[#236b45] px-6 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-[#092d1c] transition hover:bg-[#2d8253] sm:w-auto sm:px-8 sm:py-4 sm:text-base">Create from a reference <span aria-hidden="true">→</span></Link>
              {!user && <Link to="/signup" state={authDestination} className="w-full rounded-xl border border-[#48634f] px-6 py-3 text-center text-sm font-semibold text-[#d4e9d5] transition hover:bg-white/5 sm:w-auto sm:px-8 sm:py-4 sm:text-base">Create your free account</Link>}
            </div>
            <p className="mt-5 text-sm text-[#8e8d7b]">PNG, JPEG or WebP · Edit the result in the poster editor</p>

            <div className="mx-auto mt-20 max-w-4xl overflow-hidden rounded-2xl border border-[#4a4639] bg-[#211f19] text-left shadow-[0_30px_90px_rgba(0,0,0,.4)]">
              <div className="flex h-12 items-center justify-between border-b border-[#4a4639] px-5 text-sm text-[#a89b83]"><span><span className="mr-2 text-[#df665d]">●</span><span className="mr-2 text-[#e3bd55]">●</span><span className="mr-4 text-[#66bb85]">●</span>Sanaa Studio editor</span><span className="hidden sm:block">Editable layers · Your design</span></div>
              <div className="grid min-h-72 grid-cols-[3rem_1fr_3rem] gap-3 p-3 sm:min-h-96 sm:grid-cols-[5rem_1fr_5rem] sm:gap-6 sm:p-5">
                <div className="space-y-3 border-r border-[#4a4639] pr-2 sm:pr-4">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-8 rounded-md bg-[#383327]" />)}</div>
                <div className="relative mx-auto flex w-full max-w-sm flex-col items-center justify-center overflow-hidden rounded-lg border border-[#677253] bg-gradient-to-br from-[#183827] via-[#284c35] to-[#846b36] px-4 text-center shadow-xl">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[24px] border-[#d7be69]/20" />
                  <span className="relative mb-3 rounded-full border border-[#e8d185]/60 px-3 py-1 text-[10px] uppercase tracking-[.3em] text-[#eddcaa]">Your next idea</span>
                  <span className="relative text-3xl font-black uppercase leading-none tracking-tight text-[#fff4d7] sm:text-5xl">MAKE IT<br />YOURS.</span>
                  <span className="relative mt-4 max-w-[14rem] text-xs text-[#e4d9b5] sm:text-sm">Every word, shape and detail is ready to change.</span>
                  <span className="relative mt-6 rounded-md bg-[#f5dc83] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#24442e]">Editable poster</span>
                </div>
                <div className="space-y-3 border-l border-[#4a4639] pl-2 sm:pl-4">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-6 rounded-md bg-[#383327]" />)}</div>
              </div>
            </div>
          </div>
        </section>
        <section className="border-t border-white/10 bg-[#191a14] px-5 py-16 sm:px-9"><div className="mx-auto grid max-w-6xl gap-7 sm:grid-cols-3">{[
          ['01', 'Upload a reference', 'Start with a single poster image that captures the layout you want.'],
          ['02', 'Generate editable layers', 'AI rebuilds text, shapes and image regions as a draft you can work with.'],
          ['03', 'Make it your own', 'Adjust the details in the editor and export your finished poster.'],
        ].map(([number, title, description]) => <div key={number} className="rounded-2xl border border-white/10 bg-[#20231b] p-7"><span className="text-sm font-bold text-[#84c694]">{number}</span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 leading-relaxed text-[#b4ad9c]">{description}</p></div>)}</div></section>
      </main>
    </div>
  );
}
