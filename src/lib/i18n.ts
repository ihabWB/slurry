export type Lang = 'ar' | 'en'

export const translations = {
  // ── Sidebar ──────────────────────────────────────────────
  nav: {
    dashboard:  { ar: 'لوحة التحكم', en: 'Dashboard' },
    factories:  { ar: 'المصانع',     en: 'Factories' },
    trips:      { ar: 'النقلات',     en: 'Trips' },
    payments:   { ar: 'المدفوعات',   en: 'Payments' },
    reports:    { ar: 'التقارير',    en: 'Reports' },
    map:        { ar: 'الخريطة',     en: 'Map' },
    users:         { ar: 'المستخدمون',  en: 'Users' },
    settings:      { ar: 'الإعدادات',   en: 'Settings' },
    disbursements: { ar: 'الدفعات',      en: 'Disbursements' },
    signOut:       { ar: 'تسجيل الخروج', en: 'Sign Out' },
  },
  navGroups: {
    main:       { ar: 'الرئيسية',   en: 'Main' },
    operations: { ar: 'العمليات',   en: 'Operations' },
    analytics:  { ar: 'التحليل',    en: 'Analytics' },
    admin:      { ar: 'الإدارة',    en: 'Admin' },
  },
  roles: {
    admin:   { ar: 'مدير النظام',   en: 'System Admin' },
    manager: { ar: 'مدير مشروع',   en: 'Manager' },
    viewer:  { ar: 'مستخدم عادي',  en: 'Viewer' },
  },
  // ── Layout header ────────────────────────────────────────
  layout: {
    org:     { ar: 'سلطة المياه الفلسطينية', en: 'Palestinian Water Authority' },
    system:  { ar: 'نظام إدارة مخلفات المصانع', en: 'Factory Waste Management System' },
    online:  { ar: 'متصل', en: 'Online' },
  },
  // ── Dashboard ────────────────────────────────────────────
  dashboard: {
    title:         { ar: 'لوحة التحكم', en: 'Dashboard' },
    refresh:       { ar: 'تحديث',        en: 'Refresh' },
    todayTrips:    { ar: 'إجمالي النقلات',    en: 'Total Trips' },
    todayCollect:  { ar: 'إجمالي التحصيل',   en: 'Total Collection' },
    totalFactory:  { ar: 'إجمالي المصانع',   en: 'Total Factories' },
    overdueFactory:{ ar: 'مصانع متأخرة',     en: 'Overdue Factories' },
    trip:          { ar: 'نقلة',  en: 'trip' },
    factory:       { ar: 'مصنع',  en: 'factory' },
    alert:         { ar: 'تنبيه', en: 'Alert' },
    quickActions:  { ar: 'إجراءات سريعة', en: 'Quick Actions' },
    newTrip:       { ar: 'تسجيل نقلة جديدة', en: 'New Trip' },
    newTripSub:    { ar: 'فردي أو جماعي',     en: 'Single or bulk' },
    newPayment:    { ar: 'تسجيل دفعة',         en: 'New Payment' },
    newPaymentSub: { ar: 'تحصيل مبالغ مستحقة', en: 'Collect due amounts' },
    viewReports:   { ar: 'عرض التقارير', en: 'View Reports' },
    viewReportsSub:{ ar: 'PDF / Excel',  en: 'PDF / Excel' },
    recentTrips:   { ar: 'آخر النقلات', en: 'Recent Trips' },
    last7days:     { ar: 'آخر 7 أيام',  en: 'Last 7 days' },
    viewAll:       { ar: 'عرض الكل',    en: 'View All' },
    colFactory:    { ar: 'المصنع',   en: 'Factory' },
    colRegion:     { ar: 'المنطقة',  en: 'Region' },
    colAmount:     { ar: 'المبلغ',   en: 'Amount' },
    colStatus:     { ar: 'الحالة',   en: 'Status' },
    colDate:       { ar: 'التاريخ',  en: 'Date' },
    paid:          { ar: 'مدفوع', en: 'Paid' },
    unpaid:        { ar: 'ذمة',   en: 'Unpaid' },
    noTrips:       { ar: 'لا توجد نقلات بعد', en: 'No trips yet' },
  },
  // ── Login ─────────────────────────────────────────────────
  login: {
    welcome:      { ar: 'مرحباً بك 👋',               en: 'Welcome Back 👋' },
    subtitle:     { ar: 'أدخل بياناتك للدخول إلى النظام', en: 'Enter your credentials to sign in' },
    email:        { ar: 'البريد الإلكتروني', en: 'Email Address' },
    password:     { ar: 'كلمة المرور',       en: 'Password' },
    submit:       { ar: 'تسجيل الدخول',      en: 'Sign In' },
    loading:      { ar: 'جارٍ تسجيل الدخول...', en: 'Signing in...' },
    orgName:      { ar: 'سلطة المياه الفلسطينية', en: 'Palestinian Water Authority' },
    heroTitle1:   { ar: 'نظام إدارة',        en: 'Factory Waste' },
    heroTitle2:   { ar: 'مخلفات المصانع',   en: 'Management System' },
    heroSub:      { ar: 'متابعة النقلات والمصانع والمدفوعات\nفي مكان واحد بكل سهولة واحترافية', en: 'Track trips, factories & payments\nin one place with ease' },
    badge:        { ar: 'نظام متكامل لإدارة المخلفات', en: 'Integrated Waste Management System' },
    statsTrips:   { ar: 'النقلات',   en: 'Trips' },
    statsFactory: { ar: 'المصانع',   en: 'Factories' },
    statsCollect: { ar: 'التحصيل',   en: 'Collection' },
    copyright:    { ar: 'جميع الحقوق محفوظة', en: 'All rights reserved' },
    errInvalid:   { ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', en: 'Invalid email or password' },
    errConfirm:   { ar: 'يرجى تأكيد البريد الإلكتروني أولاً', en: 'Please confirm your email first' },
  },
} as const

export function t(key: any, lang: Lang): string {
  return key?.[lang] ?? key?.ar ?? ''
}
