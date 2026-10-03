"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

const tr = {
  inbox: "Gelen Kutusu",
  all: "Tümü",
  needs_reply: "Yanıt bekleyen",
  handed_off: "Personele devredilen",
  ai_active: "AI etkin",
  mine: "Bana atanan",
  unassigned: "Atanmamış",
  loading: "Yükleniyor…",
  retry: "Tekrar dene",
  emptyList: "Bu filtrede görüşme yok.",
  select: "Bir görüşme seçin.",
  noMessages: "Henüz mesaj yok",
  noAccess: "Bu görüşmenin mesajlarına erişiminiz yok.",
  unavailable: "Veriler yüklenemedi. Lütfen tekrar deneyin.",
  missing: "Görüşme bulunamadı.",
  older: "Eski mesajları yükle",
  more: "Daha fazla görüşme",
  takeOver: "Devral",
  resume: "AI’ı devam ettir",
  resumeTitle: "AI yanıtlarını devam ettir?",
  resumeBody:
    "AI bu görüşmeye yeniden yanıt verebilir. STOP ile kapatılan otomatik mesajlar kapalı kalır.",
  confirm: "Devam ettir",
  cancel: "İptal",
  paused: "AI duraklatıldı · Personel yanıtlayabilir",
  active: "AI etkin",
  pauseFirst: "Yanıt yazmak için önce görüşmeyi devralın.",
  send: "Gönder",
  message: "Mesajınız",
  optedOut:
    "Hasta STOP gönderdi — AI duraklatıldı, otomatik mesajlar kapalı. Yine de yanıt verebilirsiniz.",
  optOutWarning:
    "Hasta STOP gönderdi. Personel mesajı gönderildi; otomatik mesajlar kapalı kalır.",
  window:
    "Son hasta mesajının üzerinden 24 saat geçti. WhatsApp bu süreden sonra onaylı şablon gerektirir; henüz şablon yapılandırılmadı.",
  channel: "WhatsApp kanalı veya kimlik bilgisi etkin değil.",
  noContact: "Bu görüşmede WhatsApp kişisi yok.",
  inactive: "Klinik hesabı etkin değil.",
  changed: "Görüşme değişti. Durumu yenileyip tekrar deneyin.",
  sendFailed: "Mesaj gönderilemedi. İçeriği korunuyor.",
  refreshState: "Gönderim koşullarını tekrar kontrol et",
  patient: "Hasta",
  ai: "AI asistanı",
  staff: "Personel",
  system: "Sistem",
  draft: "AI taslağı — gönderilmedi",
  pending: "Bekliyor",
  sent: "Gönderildi",
  delivered: "Teslim edildi",
  read: "Okundu",
  failed: "Başarısız",
  unknown: "Gönderim belirsiz",
  cancelled: "Gönderilmedi",
  received: "Alındı",
  pendingTip: "Gönderim bekleniyor; henüz teslim edilmedi.",
  sentTip: "WhatsApp mesajı kabul etti; teslim veya okuma doğrulanmadı.",
  deliveredTip: "WhatsApp teslim edildiğini bildirdi.",
  readTip: "WhatsApp okunduğunu bildirdi.",
  failedTip: "Gönderim başarısız oldu.",
  unknownTip:
    "Mesaj kabul edilmiş olabilir. Yeniden göndermeden önce WhatsApp’ı kontrol edin.",
  cancelledTip: "Mesaj gönderilmedi.",
  receivedTip: "Hastadan gelen mesaj.",
  draftTip: "Bu bir AI taslağıdır. Hastaya gönderilmedi.",
  back: "Görüşme listesine dön",
  details: "Hasta bilgileri",
  name: "Ad",
  firstName: "Ad",
  lastName: "Soyad",
  phone: "Telefon",
  email: "E-posta",
  language: "Dil",
  country: "Ülke",
  timezone: "Saat dilimi",
  stage: "Aşama",
  assignee: "Sorumlu",
  summary: "AI tarafından oluşturulan özet",
  noSummary: "Özet yok.",
  leadLink: "Hasta kaydını aç",
  save: "Değişiklikleri kaydet",
  masked: "Gizlenmiş iletişim bilgileri düzenlenemez.",
  previewHidden: "Mesaj önizlemesi kullanılamıyor.",
  unread: "Yeni mesaj / okunmamış bildirim",
  connected: "Canlı bağlantı açık",
  disconnected: "Canlı bağlantı kapalı — yeniden bağlanınca yenilenir",
  filterHelp: "Yanıt bekleyen: AI duraklatılmış, açık görüşmeler.",
  open: "Görüşmeyi aç",
  notifications: "Bildirimler",
  menu: "Menü",
  close: "Kapat",
  errorTitle: "Bir sorun oluştu",
  notFound: "Sayfa bulunamadı",
  home: "Gelen kutusuna dön",
};
const en: Record<keyof typeof tr, string> = {
  inbox: "Inbox",
  all: "All",
  needs_reply: "Needs reply",
  handed_off: "Handed off",
  ai_active: "AI active",
  mine: "Mine",
  unassigned: "Unassigned",
  loading: "Loading…",
  retry: "Retry",
  emptyList: "No conversations match this filter.",
  select: "Select a conversation.",
  noMessages: "No messages yet.",
  noAccess: "You don't have access to this conversation's messages",
  unavailable: "Could not load data. Please try again.",
  missing: "Conversation not found.",
  older: "Load older messages",
  more: "Load more conversations",
  takeOver: "Take over",
  resume: "Resume AI",
  resumeTitle: "Resume AI replies?",
  resumeBody:
    "The AI can reply to this conversation again. Automated messages disabled by STOP stay off.",
  confirm: "Resume",
  cancel: "Cancel",
  paused: "AI paused · Staff can reply",
  active: "AI active",
  pauseFirst: "Take over the conversation before writing a reply.",
  send: "Send",
  message: "Your message",
  optedOut:
    "Patient sent STOP — AI paused, automated messages are off. You can still reply.",
  optOutWarning:
    "Patient sent STOP. The staff message was sent; automated messages stay off.",
  window:
    "The last patient message is older than 24 hours. WhatsApp requires approved templates after that; none are configured yet.",
  channel: "The WhatsApp channel or its credential is not active.",
  noContact: "This conversation has no WhatsApp contact.",
  inactive: "The clinic account is inactive.",
  changed: "The conversation changed. Refresh its state and try again.",
  sendFailed: "The message could not be sent. Your text is preserved.",
  refreshState: "Check sending conditions again",
  patient: "Patient",
  ai: "AI assistant",
  staff: "Staff",
  system: "System",
  draft: "AI draft — not sent",
  pending: "Pending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  unknown: "Delivery unknown",
  cancelled: "Not sent",
  received: "Received",
  pendingTip: "Waiting to send; not yet delivered.",
  sentTip:
    "WhatsApp accepted the message; delivery or reading is not confirmed.",
  deliveredTip: "WhatsApp reported delivery.",
  readTip: "WhatsApp reported the message was read.",
  failedTip: "Delivery failed.",
  unknownTip:
    "The message may have been accepted. Check WhatsApp before resending.",
  cancelledTip: "The message was not sent.",
  receivedTip: "An incoming patient message.",
  draftTip: "This is an AI draft. It was not sent to the patient.",
  back: "Back to conversations",
  details: "Patient details",
  name: "Name",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  email: "Email",
  language: "Language",
  country: "Country",
  timezone: "Timezone",
  stage: "Stage",
  assignee: "Assignee",
  summary: "AI-generated summary",
  noSummary: "No summary available.",
  leadLink: "Open patient record",
  save: "Save changes",
  masked: "Masked contact details cannot be edited.",
  previewHidden: "Message preview unavailable.",
  unread: "New message / unread notification",
  connected: "Live connection active",
  disconnected: "Live connection offline — refreshes on reconnect",
  filterHelp: "Needs reply: open conversations with the AI paused.",
  open: "Open conversation",
  notifications: "Notifications",
  menu: "Menu",
  close: "Close",
  errorTitle: "Something went wrong",
  notFound: "Page not found",
  home: "Return to Inbox",
};
export type InboxLocale = "tr" | "en";
export type InboxString = keyof typeof tr;
export function inboxText(locale: InboxLocale, key: InboxString): string {
  return (locale === "tr" ? tr : en)[key];
}
const LocaleContext = createContext<{
  locale: InboxLocale;
  setLocale: (locale: InboxLocale) => void;
}>({ locale: "tr", setLocale: () => {} });
export function InboxLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<InboxLocale>("tr");
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
export function useInboxText() {
  const { locale, setLocale } = useContext(LocaleContext);
  const t = useCallback((key: InboxString) => inboxText(locale, key), [locale]);
  return { locale, setLocale, t };
}
