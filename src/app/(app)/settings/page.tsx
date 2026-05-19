'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Settings, DollarSign, Truck, Save, RefreshCw, Info, PiggyBank, ShieldCheck, Banknote, TrendingUp } from 'lucide-react'
import { getPricingRules, updatePricingRule, getSettings, updateSetting } from '@/lib/api'
import type { PricingRule, AppSetting } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { showToast } from '@/components/ui/Toast'

const WASTE_LABEL: Record<string, string> = { liquid: '💧 سائل', solid: '🪨 جاف' }

// اسم مكب البلدية يختلف حسب المسافة:
//   ≤ 7 كم → مكب خلة الشرباتي
//   > 7 كم → مكب سعير
function getDumpLabel(dump_site: string, max_distance_km: number): string {
  if (dump_site === 'municipal_dump') {
    return max_distance_km <= 7 ? 'مكب خلة الشرباتي' : 'مكب سعير'
  }
  return 'عصارة الربو المركزية'
}

export default function SettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()

  const [rules, setRules] = useState<PricingRule[]>([])
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({})
  const [savingRule, setSavingRule] = useState<string | null>(null)

  const [settings, setSettings] = useState<AppSetting[]>([])
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({})
  const [savingSetting, setSavingSetting] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/')
  }, [authLoading, isAdmin, router])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesData, settingsData] = await Promise.all([getPricingRules(), getSettings()])
      setRules(rulesData)
      setSettings(settingsData)
      // init edited values
      const priceMap: Record<string, string> = {}
      rulesData.forEach(r => { priceMap[r.id] = String(r.unit_price) })
      setEditedPrices(priceMap)
      const settMap: Record<string, string> = {}
      settingsData.forEach(s => { settMap[s.key] = s.value })
      setEditedSettings(settMap)
    } catch (e) { console.error(e); showToast('error', 'فشل تحميل الإعدادات') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!authLoading && isAdmin) loadAll()
  }, [authLoading, isAdmin, loadAll])

  async function saveRule(rule: PricingRule) {
    const newPrice = parseFloat(editedPrices[rule.id])
    if (isNaN(newPrice) || newPrice <= 0) { showToast('error', 'السعر يجب أن يكون رقماً موجباً'); return }
    setSavingRule(rule.id)
    try {
      await updatePricingRule(rule.id, newPrice)
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, unit_price: newPrice } : r))
      showToast('success', 'تم حفظ السعر ✓')
    } catch { showToast('error', 'فشل الحفظ') }
    finally { setSavingRule(null) }
  }

  async function saveSetting(key: string) {
    const val = editedSettings[key]?.trim()
    if (!val) { showToast('error', 'القيمة لا يمكن أن تكون فارغة'); return }
    setSavingSetting(key)
    try {
      await updateSetting(key, val)
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: val } : s))
      showToast('success', 'تم حفظ الإعداد ✓')
    } catch { showToast('error', 'فشل الحفظ') }
    finally { setSavingSetting(null) }
  }

  if (authLoading || !isAdmin) return null

  // Group rules by distance category
  const nearRules  = rules.filter(r => r.max_distance_km <= 7)
  const farRules   = rules.filter(r => r.max_distance_km > 7)

  const factoryContrib = parseFloat(settings.find(s => s.key === 'factory_contribution')?.value ?? '50')
  const projectBudget  = parseFloat(settings.find(s => s.key === 'project_budget')?.value ?? '0')
  const retentionPct   = parseFloat(settings.find(s => s.key === 'retention_pct')?.value ?? '10')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Settings size={22} className="text-slate-600" /> إعدادات النظام
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">تعديل جدول التسعيرة ومساهمة المصانع</p>
        </div>
        <button onClick={loadAll} disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* مساهمة المصنع */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-600" /> مساهمة المصنع
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-emerald-700">
              مساهمة المصنع هي <strong>إيراد مستقل للمشروع</strong> يُدفع عن كل نقلة.
              لا تُخصم من سعر الوحدة — بل تُضاف كرصيد منفصل يُساهم في تمويل المشروع.
            </p>
          </div>
          {settings.filter(s => s.key === 'factory_contribution').map(s => (
            <div key={s.key} className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-700 block mb-1">{s.label ?? s.key}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={editedSettings[s.key] ?? s.value}
                    onChange={e => setEditedSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                    className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    dir="ltr"
                  />
                  <span className="text-slate-500 text-sm">₪ / نقلة</span>
                </div>
              </div>
              <button
                onClick={() => saveSetting(s.key)}
                disabled={savingSetting === s.key}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                <Save size={14} /> {savingSetting === s.key ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* إجمالي التمويل */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <PiggyBank size={16} className="text-violet-600" /> إجمالي التمويل المخصص للمشروع
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-violet-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-violet-700">
              المبلغ الإجمالي المخصص لتمويل المشروع. يُستخدم لحساب نسبة الصرف والمتبقي من التمويل
              في لوحة التحكم.
            </p>
          </div>
          {settings.filter(s => s.key === 'project_budget').map(s => (
            <div key={s.key} className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  {s.label ?? 'إجمالي التمويل'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={editedSettings[s.key] ?? s.value}
                    onChange={e => setEditedSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                    className="w-44 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                    dir="ltr"
                  />
                  <span className="text-slate-500 text-sm">₪</span>
                  {projectBudget > 0 && (
                    <span className="text-violet-600 text-xs font-semibold bg-violet-50 border border-violet-100 px-2 py-1 rounded-lg">
                      {projectBudget.toLocaleString()} ₪
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => saveSetting(s.key)}
                disabled={savingSetting === s.key}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors">
                <Save size={14} /> {savingSetting === s.key ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          ))}
          {settings.filter(s => s.key === 'project_budget').length === 0 && !loading && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
              ⚠️ المفتاح غير موجود في قاعدة البيانات — شغّل ملف{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">add_project_budget.sql</code>
              {' '}في Supabase SQL Editor أولاً.
            </p>
          )}
        </CardBody>
      </Card>

      {/* نسبة حجز التأمينات */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={16} className="text-orange-600" /> نسبة حجز التأمينات (Retention)
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-orange-700">
              نسبة تُحجز تلقائياً من كل دفعة كضمان حسن التنفيذ، تُرد للمقاول عند انتهاء المشروع وتسليمه.
              النسبة الافتراضية 10%، ويمكن تعديلها لكل دفعة عند إنشائها.
            </p>
          </div>
          {settings.filter(s => s.key === 'retention_pct').map(s => (
            <div key={s.key} className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-700 block mb-1">{s.label ?? 'نسبة الحجز'}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={editedSettings[s.key] ?? s.value}
                    onChange={e => setEditedSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                    className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                    dir="ltr"
                  />
                  <span className="text-slate-500 text-sm">%</span>
                  {retentionPct > 0 && (
                    <span className="text-orange-600 text-xs font-semibold bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg">
                      {retentionPct}% من كل دفعة
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => saveSetting(s.key)}
                disabled={savingSetting === s.key}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-60 transition-colors">
                <Save size={14} /> {savingSetting === s.key ? 'جارّي الحفظ...' : 'حفظ'}
              </button>
            </div>
          ))}
          {settings.filter(s => s.key === 'retention_pct').length === 0 && !loading && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
              ⚠️ شغّل{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">add_disbursement_retention.sql</code>
              {' '}في Supabase SQL Editor أولاً.
            </p>
          )}
        </CardBody>
      </Card>

      {/* معامل التمهيد للتوقع EWMA */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <TrendingUp size={16} className="text-sky-600" /> معامل التمهيد للتوقع (EWMA)
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-sky-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-sky-700 space-y-1">
              <p>معامل α يتحكم في وزن الأشهر عند حساب التوقع — الأشهر الأحدث تأخذ وزناً أعلى.</p>
              <p className="font-mono text-xs bg-sky-100 rounded px-2 py-1 inline-block">
                α=0.6 → أحدث شهر: 60% · قبله: 24% · قبله: 9.6%
              </p>
              <p className="text-sky-600 text-xs">نطاق مقبول: 0.3 (تمهيد قوي) إلى 0.9 (تركيز على الأحدث)</p>
            </div>
          </div>
          {settings.filter(s => s.key === 'forecast_smoothing_alpha').map(s => (
            <div key={s.key} className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-700 block mb-1">معامل α</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={editedSettings[s.key] ?? s.value}
                    onChange={e => setEditedSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                    className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                    dir="ltr"
                  />
                  {(() => {
                    const a = parseFloat(editedSettings[s.key] ?? s.value)
                    if (isNaN(a)) return null
                    const w1 = Math.round(a * 100)
                    const w2 = Math.round(a * (1 - a) * 100)
                    const w3 = Math.round(a * (1 - a) ** 2 * 100)
                    return (
                      <span className="text-xs text-sky-700 bg-sky-50 border border-sky-100 px-3 py-1.5 rounded-lg font-mono">
                        شهر-1: {w1}% · شهر-2: {w2}% · شهر-3: {w3}%
                      </span>
                    )
                  })()}
                </div>
              </div>
              <button
                onClick={() => saveSetting(s.key)}
                disabled={savingSetting === s.key}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700 disabled:opacity-60 transition-colors">
                <Save size={14} /> {savingSetting === s.key ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          ))}
          {settings.filter(s => s.key === 'forecast_smoothing_alpha').length === 0 && !loading && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
              ⚠️ شغّل{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">add_forecast_settings.sql</code>
              {' '}في Supabase SQL Editor أولاً.
            </p>
          )}
        </CardBody>
      </Card>

      {/* توزيع الميزانية: احتياطي الطوارئ */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={16} className="text-red-500" /> توزيع الميزانية — احتياطي الطوارئ
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            نسبة تُحجز من الميزانية الإجمالية للطوارئ · الباقي مُقسَّم بين مشروع النقل والترحيل وصندوق الدراسة الشاملة لاحقاً
          </p>
        </CardHeader>
        <CardBody>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 mb-4">
            <ShieldCheck size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700 space-y-1">
              <p><strong>هيكل توزيع الميزانية:</strong></p>
              <p>🔒 <strong>احتياطي طوارئ</strong> = نسبة% من الميزانية الإجمالية — محجوز، لا يُحتسب في خطط الإنفاق</p>
              <p>💼 <strong>الميزانية التشغيلية</strong> = الباقي — مشتركة بين مشروع النقل (جاري) وصندوق الدراسة الشاملة (ما يتبقى بعد 2027)</p>
            </div>
          </div>
          {settings.filter(s => s.key === 'budget_contingency_pct').map(s => {
            const pct = parseFloat(editedSettings[s.key] ?? s.value)
            const budget = parseFloat(settings.find(x => x.key === 'project_budget')?.value ?? '0')
            const contingencyAmt = isNaN(pct) || isNaN(budget) ? 0 : Math.round(budget * pct / 100)
            const operationalAmt = isNaN(budget) ? 0 : Math.round(budget - contingencyAmt)
            return (
              <div key={s.key} className="flex items-start gap-4">
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">نسبة الاحتياطي</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        value={editedSettings[s.key] ?? s.value}
                        onChange={e => setEditedSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                        className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                        dir="ltr"
                      />
                      <span className="text-slate-500 text-sm">%</span>
                      {!isNaN(pct) && budget > 0 && (
                        <span className="text-xs bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg font-mono text-red-700">
                          🔒 طوارئ: {contingencyAmt.toLocaleString()} ₪ · 💼 تشغيلي: {operationalAmt.toLocaleString()} ₪
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => saveSetting(s.key)}
                  disabled={savingSetting === s.key}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-60 transition-colors mt-6">
                  <Save size={14} /> {savingSetting === s.key ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
              </div>
            )
          })}
          {settings.filter(s => s.key === 'budget_contingency_pct').length === 0 && !loading && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
              ⚠️ شغّل{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">add_budget_allocation.sql</code>
              {' '}في Supabase SQL Editor أولاً.
            </p>
          )}
        </CardBody>
      </Card>

      {/* نسبة بلدية الخليل */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Banknote size={16} className="text-violet-600" /> مبلغ بلدية الخليل
          </h2>
        </CardHeader>
        <CardBody>
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-start gap-3 mb-4">
            <Info size={16} className="text-violet-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-violet-700">
              نسبة ثابتة تُضاف إلى صافي كل دفعة لصالح بلدية الخليل. تُحسب من المبلغ
              الأساسي للدفعة قبل خصم حجز التأمينات، وتزيد المبلغ الإجمالي المحوَّل.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-violet-100 border border-violet-200 rounded-xl px-5 py-3">
              <Banknote size={20} className="text-violet-600" />
              <span className="text-2xl font-bold text-violet-800">14%</span>
              <span className="text-sm text-violet-600">من مبلغ الدفعة</span>
            </div>
            <p className="text-xs text-slate-500">
              هذه النسبة ثابتة في النظام ولا تقبل التعديل.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* جدول التسعيرة */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Truck size={16} className="text-blue-600" /> جدول التسعيرة
          </h2>
        </CardHeader>

        {loading ? (
          <CardBody><p className="text-center text-slate-400 py-8">جارٍ التحميل...</p></CardBody>
        ) : (
          <>
            {/* ≤ 7 كم */}
            <div className="px-5 pt-4 pb-1">
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-100">
                📍 مسافة النقل ≤ 7 كم
              </span>
            </div>
            <PricingTable
              rules={nearRules}
              editedPrices={editedPrices}
              savingRule={savingRule}
              factoryContrib={factoryContrib}
              onChange={(id, val) => setEditedPrices(prev => ({ ...prev, [id]: val }))}
              onSave={saveRule}
            />

            {/* > 7 كم */}
            <div className="px-5 pt-5 pb-1 border-t border-slate-100">
              <span className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full border border-orange-100">
                📍 مسافة النقل &gt; 7 كم
              </span>
            </div>
            <PricingTable
              rules={farRules}
              editedPrices={editedPrices}
              savingRule={savingRule}
              factoryContrib={factoryContrib}
              onChange={(id, val) => setEditedPrices(prev => ({ ...prev, [id]: val }))}
              onSave={saveRule}
            />
          </>
        )}
      </Card>

      {/* معلومات */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 space-y-1">
        <p>• <strong>سعر الوحدة</strong> = التكلفة الكاملة لكل نقلة (يُموَّل بالكامل من ميزانية المشروع)</p>
        <p>• <strong>مساهمة المصنع</strong> = إيراد مستقل للمشروع بقيمة {factoryContrib} ₪ عن كل نقلة — لا تُخصم من سعر الوحدة</p>
        <p>• <strong>إجمالي مساهمات المصانع</strong> = {factoryContrib} ₪ × عدد النقلات (رصيد منفصل)</p>
        <p>• <strong>إجمالي التمويل</strong> = الميزانية الكلية للمشروع ({projectBudget > 0 ? projectBudget.toLocaleString() + ' ₪' : 'غير محدد'})</p>
        <p>• <strong>حجز التأمينات (Retention)</strong> = نسبة تُحجز من كل دفعة حتى نهاية المشروع</p>
      </div>
    </div>
  )
}

// ── Sub-component: جدول التسعيرة ──────────────────────────────
function PricingTable({
  rules, editedPrices, savingRule, factoryContrib, onChange, onSave,
}: {
  rules: PricingRule[]
  editedPrices: Record<string, string>
  savingRule: string | null
  factoryContrib: number
  onChange: (id: string, val: string) => void
  onSave: (rule: PricingRule) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">نوع الربو</th>
            <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">الحجم (م³)</th>
            <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">وجهة النقل</th>
            <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">سعر الوحدة (₪)</th>
            <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">
              مساهمة المصنع
              <span className="block text-[10px] font-normal text-emerald-500">(إيراد مستقل)</span>
            </th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => {
            const currentPrice = parseFloat(editedPrices[rule.id] ?? String(rule.unit_price))
            const changed = editedPrices[rule.id] !== undefined &&
              parseFloat(editedPrices[rule.id]) !== rule.unit_price
            return (
              <tr key={rule.id} className={`border-b border-slate-50 hover:bg-slate-50 ${changed ? 'bg-amber-50/40' : ''}`}>
                <td className="px-5 py-3 font-medium text-slate-800">
                  {WASTE_LABEL[rule.waste_type]}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-xs font-mono font-bold">
                    {rule.volume_m3} م³
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {getDumpLabel(rule.dump_site, rule.max_distance_km)}
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min={1}
                    value={editedPrices[rule.id] ?? rule.unit_price}
                    onChange={e => onChange(rule.id, e.target.value)}
                    className={`w-20 text-center border rounded-lg px-2 py-1 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-400
                      ${changed ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-blue-700'}`}
                    dir="ltr"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-emerald-700 font-semibold text-sm">{factoryContrib} ₪</span>
                    <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 rounded">منفصل</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onSave(rule)}
                    disabled={savingRule === rule.id || !changed}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap">
                    <Save size={12} />
                    {savingRule === rule.id ? 'حفظ...' : 'حفظ'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
