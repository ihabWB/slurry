'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { translations as T, t } from '@/lib/i18n';
import { Loader2, Lock, Mail, Droplets, Languages } from 'lucide-react'
import { getLoginStats } from '@/lib/api'
import Image from 'next/image';

export default function LoginPage() {
  const { signIn, user, loading: authLoading } = useAuth();
  const { lang, setLang, dir } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ totalTrips: number; totalFactories: number; totalCollection: number } | null>(null);

  useEffect(() => {
    getLoginStats().then(setStats).catch(() => {})
  }, [])

  // Redirect once auth is ready and user is set
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/');
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await signIn(email, password);
    if (err) {
      setError(err);
      setLoading(false);
    }
    // if no error — wait for useEffect above to redirect
  }

  return (
    <div dir={dir} className="min-h-screen flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 bg-[#0f172a] p-12 relative overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Droplets size={18} className="text-white" />
            </div>
            <span className="text-white font-bold text-base">{t(T.login.orgName, lang)}</span>
          </div>
        </div>
        <div className="relative z-10 text-white">
          <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-3 py-1 text-xs text-blue-300 font-medium mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> {t(T.login.badge, lang)}
          </div>
          <h2 className="text-4xl font-bold leading-snug mb-4 text-white">
            {t(T.login.heroTitle1, lang)}<br/>
            <span className="text-blue-400">{t(T.login.heroTitle2, lang)}</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">{t(T.login.heroSub, lang)}</p>
          <div className="flex gap-4 mt-8">
            {[
              [t(T.login.statsTrips, lang), stats ? stats.totalTrips.toLocaleString() : '…'],
              [t(T.login.statsFactory, lang), stats ? stats.totalFactories.toLocaleString() : '…'],
              [t(T.login.statsCollect, lang), stats ? `₪ ${stats.totalCollection.toLocaleString()}` : '…'],
            ].map(([l, v]) => (
              <div key={l} className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{v}</p>
                <p className="text-slate-500 text-xs mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-slate-600 text-xs">© {new Date().getFullYear()} {t(T.login.copyright, lang)}</p>
        {/* Logos */}
        <div className="relative z-10 flex items-center justify-center gap-5 mt-4 pt-4 border-t border-white/10">
          <Image src="/PWA.png" alt="PWA" width={56} height={56} unoptimized className="object-contain opacity-90 hover:opacity-100 transition-opacity" />
          <Image src="/undp.png" alt="UNDP" width={56} height={56} unoptimized className="object-contain opacity-90 hover:opacity-100 transition-opacity" />
          <Image src="/Hebron mun.png" alt="Hebron Municipality" width={56} height={56} unoptimized className="object-contain opacity-90 hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#f8fafc] p-8">
        {/* Language toggle */}
        <div className="absolute top-4 end-4">
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-400 text-slate-600 hover:text-blue-600 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Languages size={14} />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{lang === 'ar' ? 'EN' : 'AR'}</span>
          </button>
        </div>

        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-blue-200">
              <Droplets size={26} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">{t(T.login.orgName, lang)}</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800">{t(T.login.welcome, lang)}</h2>
            <p className="text-slate-500 text-sm mt-1">{t(T.login.subtitle, lang)}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <span className="text-base">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t(T.login.email, lang)}</label>
              <div className="relative">
                <Mail size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full border border-slate-200 bg-white rounded-xl ps-9 pe-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-sm"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t(T.login.password, lang)}</label>
              <div className="relative">
                <Lock size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-200 bg-white rounded-xl ps-9 pe-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-sm"
                  dir="ltr"
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 hover:-translate-y-0.5"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> {t(T.login.loading, lang)}</>
                : t(T.login.submit, lang)
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

