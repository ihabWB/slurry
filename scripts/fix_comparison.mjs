import { readFileSync, writeFileSync } from 'fs'

const p = 'c:\\Users\\SS\\slurry\\src\\app\\(app)\\reports\\page.tsx'
const lines = readFileSync(p, 'utf8').split('\n')

// before = lines[0..2099], after = lines[2365..]
const before = lines.slice(0, 2100)
const after = lines.slice(2365)

const newBlock = `              {/* ── جدول مقارنة شامل للثلاث سيناريوهات ── */}
              {cfLoaded && (cfAllScenarios.partialReady || cfAllScenarios.fullReady) && (
                <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/60 to-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-violet-100 bg-violet-50">
                    <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">⚖️ مقارنة شاملة — الثلاث سيناريوهات</h2>
                    <p className="text-xs text-slate-400 mt-0.5">جميع الأرقام محسوبة بشكل مستقل بغض النظر عن السيناريو المختار حالياً</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-right px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold w-40">المقياس</th>
                          <th className="text-center px-3 py-2.5 bg-blue-50 border-b border-blue-100 text-blue-700 font-bold">📊 الوضع الحالي</th>
                          <th className={\`text-center px-3 py-2.5 border-b font-bold \${cfAllScenarios.partialReady ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-400'}\`}>
                            🔶 سعير جزئي
                            {!cfAllScenarios.partialReady && <div className="text-xs font-normal opacity-60">أدخل البيانات</div>}
                          </th>
                          <th className={\`text-center px-3 py-2.5 border-b font-bold \${cfAllScenarios.fullReady ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'}\`}>
                            🔴 سعير كامل
                            {!cfAllScenarios.fullReady && <div className="text-xs font-normal opacity-60">أدخل البيانات</div>}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {/* التكلفة الشهرية */}
                        <tr className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 text-slate-600 font-medium">التكلفة الشهرية</td>
                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.monthly.cost.toLocaleString()} ₪</td>
                          <td className={\`text-center px-3 py-2.5 font-bold \${cfAllScenarios.partialReady ? (cfAllScenarios.partial.monthly.cost > cfAllScenarios.current.monthly.cost ? 'text-amber-700' : 'text-green-600') : 'text-slate-300'}\`}>
                            {cfAllScenarios.partialReady ? \`\${cfAllScenarios.partial.monthly.cost.toLocaleString()} ₪\` : '—'}
                            {cfAllScenarios.partialReady && cfAllScenarios.partial.monthly.cost !== cfAllScenarios.current.monthly.cost && (
                              <div className="text-xs font-normal opacity-70">{cfAllScenarios.partial.monthly.cost > cfAllScenarios.current.monthly.cost ? '+' : ''}{(cfAllScenarios.partial.monthly.cost - cfAllScenarios.current.monthly.cost).toLocaleString()}</div>
                            )}
                          </td>
                          <td className={\`text-center px-3 py-2.5 font-bold \${cfAllScenarios.fullReady ? (cfAllScenarios.full.monthly.cost > cfAllScenarios.current.monthly.cost ? 'text-rose-700' : 'text-green-600') : 'text-slate-300'}\`}>
                            {cfAllScenarios.fullReady ? \`\${cfAllScenarios.full.monthly.cost.toLocaleString()} ₪\` : '—'}
                            {cfAllScenarios.fullReady && cfAllScenarios.full.monthly.cost !== cfAllScenarios.current.monthly.cost && (
                              <div className="text-xs font-normal opacity-70">{cfAllScenarios.full.monthly.cost > cfAllScenarios.current.monthly.cost ? '+' : ''}{(cfAllScenarios.full.monthly.cost - cfAllScenarios.current.monthly.cost).toLocaleString()}</div>
                            )}
                          </td>
                        </tr>
                        {/* نقلات شهرياً */}
                        <tr className="hover:bg-slate-50/60 bg-slate-50/30">
                          <td className="px-4 py-2.5 text-slate-600 font-medium">نقلات شهرياً</td>
                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.monthly.trips}</td>
                          <td className="text-center px-3 py-2.5 font-bold text-amber-700">
                            {cfAllScenarios.partialReady ? cfAllScenarios.partial.monthly.trips : '—'}
                            {cfAllScenarios.partialReady && cfLongTripPerMonth > 0 && (
                              <div className="text-xs font-normal text-slate-400">({Math.min(cfLongTripPerMonth, cfAllScenarios.current.monthly.trips)} سعير + {cfAllScenarios.current.monthly.trips - Math.min(cfLongTripPerMonth, cfAllScenarios.current.monthly.trips)} عادي)</div>
                            )}
                          </td>
                          <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? cfAllScenarios.full.monthly.trips : '—'}</td>
                        </tr>
                        {/* متوسط تكلفة النقلة */}
                        <tr className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 text-slate-600 font-medium">متوسط تكلفة النقلة</td>
                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.costPerTrip.toLocaleString()} ₪</td>
                          <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? \`\${cfAllScenarios.partial.costPerTrip.toLocaleString()} ₪\` : '—'}</td>
                          <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? \`\${cfAllScenarios.full.costPerTrip.toLocaleString()} ₪\` : '—'}</td>
                        </tr>
                        {/* الإجمالي حتى ديسمبر 2027 */}
                        <tr className="hover:bg-slate-50/60 bg-slate-50/30">
                          <td className="px-4 py-2.5 text-slate-600 font-medium">الإجمالي حتى ديسمبر 2027</td>
                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.estimatedTotal.toLocaleString()} ₪</td>
                          <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? \`\${cfAllScenarios.partial.estimatedTotal.toLocaleString()} ₪\` : '—'}</td>
                          <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? \`\${cfAllScenarios.full.estimatedTotal.toLocaleString()} ₪\` : '—'}</td>
                        </tr>
                        {/* متبقي الميزانية نهاية 2027 */}
                        {cfBudget > 0 && (
                          <tr className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 text-slate-600 font-medium">متبقي الميزانية نهاية 2027</td>
                            <td className={\`text-center px-3 py-2.5 font-bold \${(cfAllScenarios.current.budgetRemaining2027 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}\`}>
                              {cfAllScenarios.current.budgetRemaining2027 !== null ? \`\${cfAllScenarios.current.budgetRemaining2027.toLocaleString()} ₪\` : '—'}
                            </td>
                            <td className={\`text-center px-3 py-2.5 font-bold \${!cfAllScenarios.partialReady ? 'text-slate-300' : (cfAllScenarios.partial.budgetRemaining2027 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}\`}>
                              {cfAllScenarios.partialReady && cfAllScenarios.partial.budgetRemaining2027 !== null ? \`\${cfAllScenarios.partial.budgetRemaining2027.toLocaleString()} ₪\` : '—'}
                            </td>
                            <td className={\`text-center px-3 py-2.5 font-bold \${!cfAllScenarios.fullReady ? 'text-slate-300' : (cfAllScenarios.full.budgetRemaining2027 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}\`}>
                              {cfAllScenarios.fullReady && cfAllScenarios.full.budgetRemaining2027 !== null ? \`\${cfAllScenarios.full.budgetRemaining2027.toLocaleString()} ₪\` : '—'}
                            </td>
                          </tr>
                        )}
                        {/* تاريخ نفاد الميزانية */}
                        {cfBudget > 0 && (
                          <tr className="hover:bg-slate-50/60 bg-slate-50/30">
                            <td className="px-4 py-2.5 text-slate-600 font-medium">تاريخ نفاد الميزانية</td>
                            <td className="text-center px-3 py-2.5 font-bold text-blue-700">{cfAllScenarios.current.exhaustionDate ?? 'بعد 2027'}</td>
                            <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? (cfAllScenarios.partial.exhaustionDate ?? 'بعد 2027') : '—'}</td>
                            <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? (cfAllScenarios.full.exhaustionDate ?? 'بعد 2027') : '—'}</td>
                          </tr>
                        )}
                        {/* نقلات حتى نفاد الميزانية */}
                        {cfBudget > 0 && (
                          <tr className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 text-slate-600 font-medium">نقلات حتى نفاد الميزانية</td>
                            <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.tripsToExhaust?.toLocaleString() ?? '—'}</td>
                            <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? (cfAllScenarios.partial.tripsToExhaust?.toLocaleString() ?? '—') : '—'}</td>
                            <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? (cfAllScenarios.full.tripsToExhaust?.toLocaleString() ?? '—') : '—'}</td>
                          </tr>
                        )}
                        {/* الفرق عن الوضع الحالي */}
                        <tr className="bg-amber-50/40 hover:bg-amber-50/60">
                          <td className="px-4 py-2.5 text-slate-600 font-medium">الفرق عن الوضع الحالي</td>
                          <td className="text-center px-3 py-2.5 text-slate-400">—</td>
                          <td className="text-center px-3 py-2.5 font-bold">
                            {cfAllScenarios.partialReady ? (() => {
                              const d = cfAllScenarios.partial.monthly.cost - cfAllScenarios.current.monthly.cost
                              const pc = cfAllScenarios.current.monthly.cost > 0 ? Math.round(Math.abs(d) / cfAllScenarios.current.monthly.cost * 100) : 0
                              return <span className={d > 0 ? 'text-amber-700' : 'text-green-600'}>{d > 0 ? '+' : ''}{d.toLocaleString()} ₪ ({pc}%)</span>
                            })() : '—'}
                          </td>
                          <td className="text-center px-3 py-2.5 font-bold">
                            {cfAllScenarios.fullReady ? (() => {
                              const d = cfAllScenarios.full.monthly.cost - cfAllScenarios.current.monthly.cost
                              const pc = cfAllScenarios.current.monthly.cost > 0 ? Math.round(Math.abs(d) / cfAllScenarios.current.monthly.cost * 100) : 0
                              return <span className={d > 0 ? 'text-rose-700' : 'text-green-600'}>{d > 0 ? '+' : ''}{d.toLocaleString()} ₪ ({pc}%)</span>
                            })() : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {(!cfAllScenarios.partialReady || !cfAllScenarios.fullReady) && (
                    <div className="px-4 py-2 text-xs text-slate-400 border-t border-violet-100 bg-violet-50/40 flex items-center gap-2">
                      ℹ️ <span>
                        {!cfAllScenarios.partialReady && <span>أدخل بيانات <strong>سعير جزئي</strong> لملء عموده</span>}
                        {!cfAllScenarios.partialReady && !cfAllScenarios.fullReady && ' · '}
                        {!cfAllScenarios.fullReady && <span>أدخل بيانات <strong>سعير كامل</strong> لملء عموده</span>}
                      </span>
                    </div>
                  )}
                </div>
              )}
`

const newLines = newBlock.split('\n')
// remove trailing empty element from split if last char is \n
const combined = [...before, ...newLines, ...after]
writeFileSync(p, combined.join('\n'), 'utf8')
console.log(`Done. Total lines: ${combined.length}`)
