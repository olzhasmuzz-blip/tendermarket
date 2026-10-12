import { useState, useEffect } from "react";
import {
  FileText, ShieldCheck, CheckCircle2, Clock, Printer,
  Download, Eye, X, BadgeCheck, AlertCircle, Sparkles, Building, QrCode
} from "lucide-react";
import { apiRequest } from "./lib/api";

export type DocumentType =
  | "CONTRACT"
  | "INVOICE"
  | "ACT_OF_COMPLETION"
  | "WAYBILL"
  | "PAYMENT_RECEIPT";

export type DocumentSignStatus =
  | "DRAFT"
  | "SIGNED_BY_SUPPLIER"
  | "SIGNED_BY_BUYER"
  | "SIGNED_BY_BOTH";

export interface DealDocumentRecord {
  id: string;
  dealId: string;
  type: DocumentType;
  number: string;
  title: string;
  content: any;
  status: DocumentSignStatus;
  supplierSignedAt: string | null;
  supplierSignIp: string | null;
  supplierSignerName: string | null;
  buyerSignedAt: string | null;
  buyerSignIp: string | null;
  buyerSignerName: string | null;
  verificationCode: string;
  createdAt: string;
  updatedAt: string;
}

interface DealDocumentsSectionProps {
  dealId: string;
  userRole?: string | null;
  isDemo?: boolean;
  onDocumentSigned?: () => void;
}

const DOCUMENT_META: Record<DocumentType, { label: string; short: string; badge: string }> = {
  CONTRACT: {
    label: "Договор (ГК РК)",
    short: "Договор",
    badge: "ст. 152, 393-397 ГК РК",
  },
  INVOICE: {
    label: "Счёт на оплату",
    short: "Счёт",
    badge: "КБе 17 · Стандарт РК",
  },
  WAYBILL: {
    label: "Накладная на отпуск (З-2)",
    short: "Накладная З-2",
    badge: "Приказ МФ РК № 562",
  },
  ACT_OF_COMPLETION: {
    label: "Акт выполненных работ (Р-1 / АВР)",
    short: "АВР Р-1",
    badge: "Приказ МФ РК № 562",
  },
  PAYMENT_RECEIPT: {
    label: "Фискальный чек / Квитанция",
    short: "Чек",
    badge: "ОФД РК · ККМ",
  },
};

export function DealDocumentsSection({
  dealId,
  userRole,
  isDemo = false,
  onDocumentSigned,
}: DealDocumentsSectionProps) {
  const [documents, setDocuments] = useState<DealDocumentRecord[]>([]);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState("");
  const [signingDoc, setSigningDoc] = useState<DealDocumentRecord | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DealDocumentRecord | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);
  const [signingSuccess, setSigningSuccess] = useState("");

  const loadDocuments = async () => {
    if (isDemo) {
      setDocuments(getDemoDocuments());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<DealDocumentRecord[]>(`/deals/${dealId}/documents`);
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить документы сделки.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, [dealId, isDemo]);

  const handleSign = async (doc: DealDocumentRecord) => {
    if (isDemo) {
      setSigningSuccess(`Документ ${doc.number} успешно подписан в демо-режиме.`);
      setSigningDoc(null);
      return;
    }
    setSigningLoading(true);
    setError("");
    try {
      const updated = await apiRequest<DealDocumentRecord>(
        `/deals/${dealId}/documents/${doc.type}/sign`,
        { method: "POST" }
      );
      setDocuments(current => current.map(d => (d.id === updated.id ? updated : d)));
      setSigningSuccess(`Документ ${doc.number} успешно подписан простой электронной подписью.`);
      setSigningDoc(null);
      if (onDocumentSigned) onDocumentSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при подписании документа.");
    } finally {
      setSigningLoading(false);
    }
  };

  const canSign = (doc: DealDocumentRecord) => {
    if (isDemo) return true;
    if (userRole === "SUPPLIER" && !doc.supplierSignedAt) return true;
    if (userRole === "CUSTOMER" && !doc.buyerSignedAt) return true;
    return false;
  };

  return (
    <section className="deal-documents-section">
      <div className="section-header-row">
        <div>
          <div className="section-eyebrow">
            <ShieldCheck size={14} className="text-emerald-600" />
            Юридически значимый документооборот РК
          </div>
          <h2>Документы сделки по стандартам Казахстана</h2>
          <p>
            Автоматическая генерация договора, счетов, накладных (З-2), актов выполненных работ (Р-1) и
            фискальных чеков. Подписание онлайн простой электронной подписью (ПЭП РК, ст. 152 ГК РК).
          </p>
        </div>
      </div>

      {signingSuccess && (
        <div className="inline-notice success-notice">
          <CheckCircle2 size={16} />
          {signingSuccess}
        </div>
      )}
      {error && (
        <div className="inline-notice" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Загружаем документы по стандартам РК…</div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <FileText size={28} />
          <strong>Документы пока не сформированы</strong>
          <span>Они формируются автоматически по мере согласования сделки.</span>
        </div>
      ) : (
        <div className="deal-documents-grid">
          {documents.map(doc => {
            const meta = DOCUMENT_META[doc.type] || {
              label: doc.title,
              short: doc.title,
              badge: "РК",
            };

            const isBothSigned = doc.status === "SIGNED_BY_BOTH";
            const isPartiallySigned =
              doc.status === "SIGNED_BY_SUPPLIER" || doc.status === "SIGNED_BY_BUYER";

            return (
              <div key={doc.id} className={`deal-doc-card ${isBothSigned ? "doc-card-complete" : ""}`}>
                <div className="doc-card-header">
                  <span className="doc-type-badge">{meta.badge}</span>
                  <span
                    className={`status-chip ${
                      isBothSigned
                        ? "status-success"
                        : isPartiallySigned
                        ? "status-work"
                        : "status-new"
                    }`}
                  >
                    {isBothSigned ? (
                      <>
                        <BadgeCheck size={13} /> Подписан обеими сторонами
                      </>
                    ) : doc.status === "SIGNED_BY_SUPPLIER" ? (
                      "Подписан поставщиком"
                    ) : doc.status === "SIGNED_BY_BUYER" ? (
                      "Подписан заказчиком"
                    ) : (
                      "Черновик"
                    )}
                  </span>
                </div>

                <div className="doc-card-body">
                  <div className="doc-title-row">
                    <FileText size={18} className="doc-icon" />
                    <div>
                      <strong>{doc.number}</strong>
                      <span className="doc-subtitle">{doc.title}</span>
                    </div>
                  </div>

                  <div className="doc-sign-details">
                    <div className="sign-party">
                      <span className="sign-party-label">Поставщик:</span>
                      {doc.supplierSignedAt ? (
                        <span className="sign-confirmed">
                          <CheckCircle2 size={13} /> {doc.supplierSignerName || "Подписано"} ·{" "}
                          {new Date(doc.supplierSignedAt).toLocaleDateString("ru-KZ")}
                        </span>
                      ) : (
                        <span className="sign-waiting">
                          <Clock size={13} /> Ожидает подписи
                        </span>
                      )}
                    </div>
                    <div className="sign-party">
                      <span className="sign-party-label">Заказчик:</span>
                      {doc.buyerSignedAt ? (
                        <span className="sign-confirmed">
                          <CheckCircle2 size={13} /> {doc.buyerSignerName || "Подписано"} ·{" "}
                          {new Date(doc.buyerSignedAt).toLocaleDateString("ru-KZ")}
                        </span>
                      ) : (
                        <span className="sign-waiting">
                          <Clock size={13} /> Ожидает подписи
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="doc-verification-info">
                    <small>Хэш верификации: {doc.verificationCode.slice(0, 12)}…</small>
                  </div>
                </div>

                <div className="doc-card-actions">
                  <button
                    type="button"
                    className="button button-secondary doc-btn"
                    onClick={() => setViewingDoc(doc)}
                  >
                    <Eye size={15} /> Просмотреть
                  </button>

                  {canSign(doc) && (
                    <button
                      type="button"
                      className="button button-primary doc-btn"
                      onClick={() => setSigningDoc(doc)}
                    >
                      <BadgeCheck size={15} /> Подписать онлайн (ПЭП)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation modal for Online E-Signing (ПЭП) */}
      {signingDoc && (
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setSigningDoc(null)}>
          <div className="request-modal doc-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Юридическая сила по ст. 152 ГК РК</span>
                <h2>Подписание документа простой электронной подписью</h2>
                <p>{signingDoc.title} ({signingDoc.number})</p>
              </div>
              <button className="icon-button" onClick={() => setSigningDoc(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>

            <div className="modal-body-content">
              <div className="legal-notice-box">
                <ShieldCheck size={20} className="text-emerald-600" />
                <div>
                  <strong>Правовое основание онлайн-подписи (ПЭП):</strong>
                  <p>
                    В соответствии с пунктом 3 статьи 152 Гражданского кодекса Республики Казахстан и Законом РК
                    «Об электронном документе и электронной цифровой подписи», соглашение, совершенное посредством
                    электронного обмена данными и авторизованное в информационной системе TenderMarket,
                    приравнивается к сделке, совершенной в письменной форме с собственноручной подписью сторон.
                  </p>
                  <ul>
                    <li>Фиксируются ваши учетные данные и ФИО</li>
                    <li>Формируется временная метка UTC+5 и сетевой адрес IP</li>
                    <li>Генерируется криптографический проверочный хэш документа</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSigningDoc(null)}
                disabled={signingLoading}
              >
                Отмена
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void handleSign(signingDoc)}
                disabled={signingLoading}
              >
                {signingLoading ? "Подписание…" : "Подтвердить и подписать (ПЭП)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Kazakhstan Printable Document View Modal */}
      {viewingDoc && (
        <div
          className="modal-backdrop"
          onMouseDown={e => e.target === e.currentTarget && setViewingDoc(null)}
        >
          <div className="request-modal doc-viewer-modal">
            <div className="modal-head doc-viewer-head">
              <div>
                <span className="eyebrow">Официальная печатная форма РК</span>
                <h2>{viewingDoc.title}</h2>
                <p>Номер: {viewingDoc.number} · Код верификации: {viewingDoc.verificationCode}</p>
              </div>
              <div className="viewer-head-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} /> Печать / PDF
                </button>
                <button
                  className="icon-button"
                  onClick={() => setViewingDoc(null)}
                  aria-label="Закрыть"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="doc-paper-container">
              <PrintableDocumentContent doc={viewingDoc} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PrintableDocumentContent({ doc }: { doc: DealDocumentRecord }) {
  const content = doc.content || {};

  if (doc.type === "CONTRACT") {
    return (
      <div className="official-document-sheet contract-sheet">
        <div className="doc-rk-header">
          <h1>{doc.title.toUpperCase()}</h1>
          <div className="doc-meta-line">
            <span>{content.city || "г. Астана"}</span>
            <span>{content.contractNumber || doc.number}</span>
            <span>{content.date || new Date(doc.createdAt).toLocaleDateString("ru-KZ")}</span>
          </div>
        </div>

        <div className="doc-body-text">
          <p className="doc-preamble">
            {content.preamble ||
              "Стороны сделки на электронной торговой площадке TenderMarket заключили настоящий Договор на следующих условиях:"}
          </p>

          <h3>1. Предмет договора</h3>
          <p>
            {content.contractType === "SERVICE"
              ? "Исполнитель обязуется по заданию Заказчика оказать услуги (выполнить работы), указанные в Спецификации, а Заказчик обязуется оплатить оказанные услуги (выполненные работы)."
              : "Поставщик обязуется передать в собственность Заказчика товары, указанные в Спецификации, а Заказчик обязуется принять и оплатить товары."}
          </p>

          <table className="official-doc-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Наименование</th>
                <th>Кол-во</th>
                <th>Ед.</th>
                <th>Цена, ₸</th>
                <th>Сумма, ₸</th>
              </tr>
            </thead>
            <tbody>
              {(content.items || []).map((item: any, idx: number) => (
                <tr key={idx}>
                  <td>{item.index || idx + 1}</td>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit || "шт."}</td>
                  <td>{new Intl.NumberFormat("ru-KZ").format(item.unitPrice)} ₸</td>
                  <td>{new Intl.NumberFormat("ru-KZ").format(item.totalPrice)} ₸</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-right">
                  <strong>ИТОГО ПО ДОГОВОРУ:</strong>
                </td>
                <td>
                  <strong>{new Intl.NumberFormat("ru-KZ").format(content.total || 0)} ₸</strong>
                </td>
              </tr>
            </tfoot>
          </table>

          <p className="sum-in-words">
            <strong>Сумма прописью:</strong> {content.totalInWords || "—"}
          </p>

          <h3>2. Порядок расчетов и сдачи-приемки</h3>
          <p>
            Расчеты производятся в безналичном порядке в национальной валюте РК (тенге). Приемка
            оформляется накладной по форме З-2 или актом выполненных работ по форме Р-1, утвержденным
            Приказом МФ РК № 562.
          </p>

          <h3>3. Разрешение споров и Арбитраж</h3>
          <p>
            {content.arbitrationClause ||
              "Все споры, возникающие из настоящего договора, подлежат разрешению в Арбитраже TenderMarket с соблюдением законодательства Республики Казахстан."}
          </p>

          <h3>4. Электронный документооборот и подписи сторон</h3>
          <p>
            Настоящий договор заключен в электронной форме с использованием простой электронной подписи
            (ПЭП) в соответствии со ст. 152 ГК РК.
          </p>

          <div className="stamp-boxes-row">
            <div className="stamp-box">
              <strong>ПОСТАВЩИК / ИСПОЛНИТЕЛЬ:</strong>
              <div>{content.supplier?.name || "Поставщик"}</div>
              <div className="pep-stamp">
                <BadgeCheck size={20} className="text-emerald-700" />
                <div className="pep-stamp-text">
                  <span>ПОДПИСАНО ЭЛЕКТРОННО (ПЭП РК)</span>
                  <small>Владелец: {doc.supplierSignerName || "Поставщик"}</small>
                  <small>
                    Дата:{" "}
                    {doc.supplierSignedAt
                      ? new Date(doc.supplierSignedAt).toLocaleString("ru-KZ")
                      : "Ожидает подписи"}
                  </small>
                  <small>IP: {doc.supplierSignIp || "127.0.0.1"}</small>
                </div>
              </div>
            </div>

            <div className="stamp-box">
              <strong>ЗАКАЗЧИК:</strong>
              <div>{content.buyer?.name || "Заказчик"}</div>
              <div className="pep-stamp">
                <BadgeCheck size={20} className="text-emerald-700" />
                <div className="pep-stamp-text">
                  <span>ПОДПИСАНО ЭЛЕКТРОННО (ПЭП РК)</span>
                  <small>Владелец: {doc.buyerSignerName || "Заказчик"}</small>
                  <small>
                    Дата:{" "}
                    {doc.buyerSignedAt
                      ? new Date(doc.buyerSignedAt).toLocaleString("ru-KZ")
                      : "Ожидает подписи"}
                  </small>
                  <small>IP: {doc.buyerSignIp || "127.0.0.1"}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (doc.type === "INVOICE") {
    return (
      <div className="official-document-sheet invoice-sheet">
        <div className="invoice-bank-card">
          <table className="bank-requisites-table">
            <tbody>
              <tr>
                <td colSpan={2}>Банк бенефициара: {content.supplier?.bank || "АО «Банк ЦентрКредит»"}</td>
                <td>БИК: {content.supplier?.bik || "KCТBKZ2A"}</td>
              </tr>
              <tr>
                <td>ИИК (IBAN): {content.supplier?.iban || "KZ129261802198421001"}</td>
                <td>КБе: 17</td>
                <td>КНП: 710</td>
              </tr>
              <tr>
                <td colSpan={2}>
                  Бенефициар: <strong>{content.supplier?.name}</strong>
                </td>
                <td>БИН/ИИН: {content.supplier?.bin || "980440001234"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="doc-rk-header">
          <h1>СЧЁТ НА ОПЛАТУ № {doc.number}</h1>
          <p>от {content.date || new Date(doc.createdAt).toLocaleDateString("ru-KZ")}</p>
        </div>

        <div className="doc-parties-info">
          <div>
            <strong>Поставщик:</strong> {content.supplier?.name}, БИН {content.supplier?.bin || "980440001234"}
          </div>
          <div>
            <strong>Покупатель:</strong> {content.buyer?.name}, БИН {content.buyer?.bin || "010340005678"}
          </div>
          <div>
            <strong>Договор:</strong> {content.contractReference || `Договор № TM-Д-${doc.number}`}
          </div>
        </div>

        <table className="official-doc-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Товары (работы, услуги)</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Цена, ₸</th>
              <th>Сумма, ₸</th>
            </tr>
          </thead>
          <tbody>
            {(content.items || []).map((item: any, idx: number) => (
              <tr key={idx}>
                <td>{item.index || idx + 1}</td>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{item.unit || "шт."}</td>
                <td>{new Intl.NumberFormat("ru-KZ").format(item.unitPrice)} ₸</td>
                <td>{new Intl.NumberFormat("ru-KZ").format(item.totalPrice)} ₸</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-right"><strong>Всего к оплате:</strong></td>
              <td><strong>{new Intl.NumberFormat("ru-KZ").format(content.total || 0)} ₸</strong></td>
            </tr>
          </tfoot>
        </table>

        <p className="sum-in-words">
          <strong>Сумма прописью:</strong> {content.totalInWords || "—"}
        </p>

        <div className="invoice-footer">
          <div>Руководитель: ________________________ (Иванов И. И.)</div>
          <div>Главный бухгалтер: ________________________ (Петрова А. А.)</div>
        </div>
      </div>
    );
  }

  if (doc.type === "WAYBILL") {
    return (
      <div className="official-document-sheet waybill-sheet">
        <div className="form-standard-tag">
          Приложение 26 к приказу Министра финансов Республики Казахстан от 20.12.2012 № 562
          <br />
          <strong>Форма З-2</strong>
        </div>

        <div className="doc-rk-header">
          <h1>НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ № {doc.number}</h1>
          <p>от {content.date || new Date().toLocaleDateString("ru-KZ")}</p>
        </div>

        <div className="doc-parties-info">
          <div><strong>Организация (отправитель):</strong> {content.sender?.name || "Поставщик"}</div>
          <div><strong>Получатель:</strong> {content.receiver?.name || "Заказчик"}</div>
          <div><strong>Основание:</strong> {content.basisDocument || `Договор TM-Д-${doc.number}`}</div>
        </div>

        <table className="official-doc-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Наименование запасов</th>
              <th>Ед. изм.</th>
              <th>Отпущено</th>
              <th>Цена, ₸</th>
              <th>Сумма без НДС, ₸</th>
            </tr>
          </thead>
          <tbody>
            {(content.items || []).map((item: any, idx: number) => (
              <tr key={idx}>
                <td>{item.index || idx + 1}</td>
                <td>{item.name}</td>
                <td>{item.unit || "шт."}</td>
                <td>{item.quantityReleased || item.quantity}</td>
                <td>{new Intl.NumberFormat("ru-KZ").format(item.unitPrice)} ₸</td>
                <td>{new Intl.NumberFormat("ru-KZ").format(item.totalPrice)} ₸</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-right"><strong>ИТОГО:</strong></td>
              <td><strong>{new Intl.NumberFormat("ru-KZ").format(content.total || 0)} ₸</strong></td>
            </tr>
          </tfoot>
        </table>

        <p className="sum-in-words">
          <strong>Всего отпущено запасов на сумму прописью:</strong> {content.totalInWords || "—"}
        </p>

        <div className="stamp-boxes-row waybill-stamps">
          <div>Отпуск разрешил: ____________________</div>
          <div>Груз получил: ____________________</div>
        </div>
      </div>
    );
  }

  if (doc.type === "ACT_OF_COMPLETION") {
    return (
      <div className="official-document-sheet act-sheet">
        <div className="form-standard-tag">
          Приложение 50 к приказу Министра финансов Республики Казахстан от 20.12.2012 № 562
          <br />
          <strong>Форма Р-1</strong>
        </div>

        <div className="doc-rk-header">
          <h1>АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) № {doc.number}</h1>
          <p>от {content.date || new Date().toLocaleDateString("ru-KZ")}</p>
        </div>

        <div className="doc-parties-info">
          <div><strong>Исполнитель:</strong> {content.executor?.name || "Исполнитель"}, БИН {content.executor?.bin || "980440001234"}</div>
          <div><strong>Заказчик:</strong> {content.customer?.name || "Заказчик"}, БИН {content.customer?.bin || "010340005678"}</div>
          <div><strong>Договор (основание):</strong> {content.basisDocument || `Договор TM-Д-${doc.number}`}</div>
        </div>

        <table className="official-doc-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Наименование выполненных работ (оказанных услуг)</th>
              <th>Дата выполнения</th>
              <th>Ед.</th>
              <th>Кол-во</th>
              <th>Цена, ₸</th>
              <th>Стоимость, ₸</th>
            </tr>
          </thead>
          <tbody>
            {(content.items || []).map((item: any, idx: number) => (
              <tr key={idx}>
                <td>{item.index || idx + 1}</td>
                <td>{item.name}</td>
                <td>{item.completionDate || new Date().toLocaleDateString("ru-KZ")}</td>
                <td>{item.unit || "усл."}</td>
                <td>{item.quantity}</td>
                <td>{new Intl.NumberFormat("ru-KZ").format(item.unitPrice)} ₸</td>
                <td>{new Intl.NumberFormat("ru-KZ").format(item.totalPrice)} ₸</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="text-right"><strong>Итого выполнено работ (услуг):</strong></td>
              <td><strong>{new Intl.NumberFormat("ru-KZ").format(content.total || 0)} ₸</strong></td>
            </tr>
          </tfoot>
        </table>

        <p className="sum-in-words">
          <strong>Сумма прописью:</strong> {content.totalInWords || "—"}
        </p>

        <p className="act-acceptance-note">
          {content.acceptanceNote ||
            "Вышеперечисленные работы (услуги) выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам оказания услуг не имеет."}
        </p>

        <div className="stamp-boxes-row">
          <div className="stamp-box">
            <strong>Работу сдал (Исполнитель):</strong>
            <div className="pep-stamp">
              <BadgeCheck size={18} className="text-emerald-700" />
              <span>{doc.supplierSignerName || "Подписано ПЭП РК"}</span>
            </div>
          </div>
          <div className="stamp-box">
            <strong>Работу принял (Заказчик):</strong>
            <div className="pep-stamp">
              <BadgeCheck size={18} className="text-emerald-700" />
              <span>{doc.buyerSignerName || "Подписано ПЭП РК"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (doc.type === "PAYMENT_RECEIPT") {
    return (
      <div className="official-document-sheet receipt-sheet">
        <div className="fiscal-receipt-box">
          <div className="receipt-header">
            <strong>{content.operator || "ТОО «TenderMarket Operations»"}</strong>
            <span>БИН: {content.bin || "230940019284"}</span>
            <span>ККМ / Терминал: {content.terminalId || "TM-POS-KZ-01"}</span>
            <span>РНМ: {content.rnm || "990100481234"} · ЗНМ: {content.znm || "FST0098231"}</span>
          </div>

          <div className="receipt-title">
            <h3>ФИСКАЛЬНЫЙ ЧЕК КАЗАХСТАНА</h3>
            <span>{content.receiptNumber || doc.number}</span>
            <small>{content.dateTime || new Date().toLocaleString("ru-KZ")}</small>
          </div>

          <div className="receipt-items-list">
            <div className="receipt-row">
              <span>Оплата по сделке {content.dealNumber || doc.number}</span>
              <b>{new Intl.NumberFormat("ru-KZ").format(content.total || 0)} ₸</b>
            </div>
            <div className="receipt-row">
              <small>Способ оплаты: {content.paymentType || "Безналичный расчет (TenderMarket Pay)"}</small>
            </div>
          </div>

          <div className="receipt-total-row">
            <span>ИТОГО К ОПЛАТЕ:</span>
            <strong>{new Intl.NumberFormat("ru-KZ").format(content.total || 0)} ₸</strong>
          </div>

          <div className="receipt-fiscal-info">
            <span>ФПД: {content.fpd || "482109418291"}</span>
            <span>ФИСКАЛЬНЫЙ ПРИЗНАК: ОФД РК ЗАРЕГИСТРИРОВАН</span>
          </div>

          <div className="receipt-qr-area">
            <div className="qr-box-mock">
              <QrCode size={64} />
            </div>
            <small>Проверка чека на портале ОФД Казахстана</small>
            <small className="receipt-url">https://consumer.oofd.kz</small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="official-document-sheet">
      <h2>{doc.title}</h2>
      <pre>{JSON.stringify(content, null, 2)}</pre>
    </div>
  );
}

function getDemoDocuments(): DealDocumentRecord[] {
  return [
    {
      id: "demo-doc-1",
      dealId: "demo",
      type: "CONTRACT",
      number: "TM-Д-0424",
      title: "Типовой договор поставки товаров (ст. 152, 393-397 ГК РК)",
      content: {
        contractNumber: "TM-Д-0424",
        city: "г. Алматы",
        date: "24 апреля 2026 г.",
        preamble: "ТОО «Альтаир» (Заказчик) и ТОО «TechnoPlus» (Поставщик) заключили настоящий договор через TenderMarket:",
        items: [
          { index: 1, name: "Ноутбук бизнес-серии 14″", quantity: 5, unit: "шт.", unitPrice: 385000, totalPrice: 1925000 },
          { index: 2, name: "Комплект офисной периферии", quantity: 5, unit: "набор", unitPrice: 42000, totalPrice: 210000 },
        ],
        total: 2135000,
        totalInWords: "Два миллиона сто тридцать пять тысяч тенге 00 тиын",
        supplier: { name: "ТОО «TechnoPlus»" },
        buyer: { name: "ТОО «Альтаир»" },
      },
      status: "SIGNED_BY_BOTH",
      supplierSignedAt: "2026-04-24T05:30:00Z",
      supplierSignIp: "95.59.102.14",
      supplierSignerName: "Аскаров Данияр (TechnoPlus)",
      buyerSignedAt: "2026-04-24T06:15:00Z",
      buyerSignIp: "178.89.214.33",
      buyerSignerName: "Султанова Анна (Альтаир)",
      verificationCode: "clyq8a9b10001kzpep9824",
      createdAt: "2026-04-24T05:00:00Z",
      updatedAt: "2026-04-24T06:15:00Z",
    },
    {
      id: "demo-doc-2",
      dealId: "demo",
      type: "INVOICE",
      number: "TM-СЧЕТ-0424",
      title: "Счёт на оплату (КБе 17, стандарт РК)",
      content: {
        date: "24.04.2026",
        supplier: { name: "ТОО «TechnoPlus»", bin: "980440001234", iban: "KZ129261802198421001", bik: "KCТBKZ2A", bank: "АО «Банк ЦентрКредит»" },
        buyer: { name: "ТОО «Альтаир»", bin: "010340005678" },
        contractReference: "Договор поставки № TM-Д-0424",
        items: [
          { index: 1, name: "Ноутбук бизнес-серии 14″", quantity: 5, unit: "шт.", unitPrice: 385000, totalPrice: 1925000 },
          { index: 2, name: "Комплект офисной периферии", quantity: 5, unit: "набор", unitPrice: 42000, totalPrice: 210000 },
        ],
        total: 2135000,
        totalInWords: "Два миллиона сто тридцать пять тысяч тенге 00 тиын",
      },
      status: "SIGNED_BY_SUPPLIER",
      supplierSignedAt: "2026-04-24T05:35:00Z",
      supplierSignIp: "95.59.102.14",
      supplierSignerName: "Аскаров Данияр (TechnoPlus)",
      buyerSignedAt: null,
      buyerSignIp: null,
      buyerSignerName: null,
      verificationCode: "clyq8b4k20002kzinv1109",
      createdAt: "2026-04-24T05:00:00Z",
      updatedAt: "2026-04-24T05:35:00Z",
    },
    {
      id: "demo-doc-3",
      dealId: "demo",
      type: "WAYBILL",
      number: "TM-З2-0424",
      title: "Накладная на отпуск запасов на сторону (Форма З-2, Приказ МФ РК № 562)",
      content: {
        date: "26.04.2026",
        sender: { name: "ТОО «TechnoPlus»" },
        receiver: { name: "ТОО «Альтаир»" },
        basisDocument: "Договор поставки № TM-Д-0424",
        items: [
          { index: 1, name: "Ноутбук бизнес-серии 14″", quantity: 5, quantityReleased: 5, unit: "шт.", unitPrice: 385000, totalPrice: 1925000 },
          { index: 2, name: "Комплект офисной периферии", quantity: 5, quantityReleased: 5, unit: "набор", unitPrice: 42000, totalPrice: 210000 },
        ],
        total: 2135000,
        totalInWords: "Два миллиона сто тридцать пять тысяч тенге 00 тиын",
      },
      status: "DRAFT",
      supplierSignedAt: null,
      supplierSignIp: null,
      supplierSignerName: null,
      buyerSignedAt: null,
      buyerSignIp: null,
      buyerSignerName: null,
      verificationCode: "clyq8c8m90003kzwb4412",
      createdAt: "2026-04-24T05:00:00Z",
      updatedAt: "2026-04-24T05:00:00Z",
    },
    {
      id: "demo-doc-4",
      dealId: "demo",
      type: "PAYMENT_RECEIPT",
      number: "TM-ЧЕК-0424",
      title: "Фискальный чек / Квитанция об оплате (РНМ/ЗНМ ОФД РК)",
      content: {
        receiptNumber: "TM-ЧЕК-0424",
        dateTime: "24.04.2026 12:45:00",
        operator: "ТОО «TenderMarket Operations»",
        bin: "230940019284",
        terminalId: "TM-POS-KZ-01",
        rnm: "990100481234",
        znm: "FST0098231",
        fpd: "482109418291",
        dealNumber: "TM-0424",
        paymentType: "Безналичный расчет (TenderMarket Escrow)",
        total: 2135000,
      },
      status: "SIGNED_BY_BOTH",
      supplierSignedAt: "2026-04-24T06:15:00Z",
      supplierSignIp: "127.0.0.1",
      supplierSignerName: "Система ОФД РК",
      buyerSignedAt: "2026-04-24T06:15:00Z",
      buyerSignIp: "127.0.0.1",
      buyerSignerName: "Система ОФД РК",
      verificationCode: "clyq8e1x00005kzrec7721",
      createdAt: "2026-04-24T06:15:00Z",
      updatedAt: "2026-04-24T06:15:00Z",
    },
  ];
}
