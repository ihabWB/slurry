'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { Lang } from '@/lib/i18n'

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  dir: 'rtl' | 'ltr'
}

const LangContext = createContext<LangContextValue>({
  lang: 'ar',
  setLang: () => {},
  dir: 'rtl',
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar')

  useEffect(() => {
    const saved = localStorage.getItem('lang') as Lang | null
    if (saved === 'en' || saved === 'ar') setLangState(saved)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('lang', l)
    document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', l)
  }

  useEffect(() => {
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  return (
    <LangContext.Provider value={{ lang, setLang, dir: lang === 'ar' ? 'rtl' : 'ltr' }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
