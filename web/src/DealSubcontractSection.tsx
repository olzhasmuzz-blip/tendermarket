import { FormEvent, useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Globe2,
  Handshake,
  MapPin,
  Plus,
  Star,
  Truck,
  X,
} from "lucide-react";
import { apiRequest } from "./lib/api";
import type { LocalContractor, SubcontractRecord } from "./types";
import type { DealMessage, DealRecord } from "./App";

export const money = (amount: number) =>
  `${new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(amount)} ₸`;

export function DealSubcontractSection({
  deal,
  subcontracts,
  setSubcontracts,
  userRole,
  isDemo,
  dealId,
  supplierName,
  setMessages,
}: {
  deal: DealRecord;
  subcontracts: SubcontractRecord[];
  setSubcontracts: React.Dispatch<React.SetStateAction<SubcontractRecord[]>>;
  userRole: string;
  isDemo: boolean;
  dealId: string;
  supplierName: string;
  setMessages: React.Dispatch<React.SetStateAction<DealMessage[]>>;
}) {
  const isSupplier = userRole === "SUPPLIER" || isDemo;
  const deliveryRegion = deal.offer.request.region || "Өскемен";
  const supplierRegion = deal.offer.supplier.region || "Актау";
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"contractors" | "open">("contractors");
  const [contractors, setContractors] = useState<LocalContractor[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [title, setTitle] = useState(`Локальное исполнение: ${deal.offer.request.title}`);
  const [targetRegion, setTargetRegion] = useState(deliveryRegion);
  const dealAmount = Number(deal.agreedTotal) || 1200000;
  const [agreedAmount, setAgreedAmount] = useState(() => Math.round(dealAmount * 0.8));
  const [description, setDescription] = useState(
    `Передача поставки, сборки и передачи товаров местному субподрядчику в г. ${deliveryRegion}`
  );
  const [deadline, setDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const marginKzt = Math.max(0, dealAmount - Number(agreedAmount));
  const marginPct = dealAmount > 0 ? Math.round((marginKzt / dealAmount) * 100) : 0;

  useEffect(() => {
    if (!modalOpen) return;
    setLoadingContractors(true);
    apiRequest<LocalContractor[]>(`/subcontracts/contractors?region=${encodeURIComponent(targetRegion)}`)
      .then(items => {
        setContractors(items);
        if (items.length && !selectedContractorId) {
          setSelectedContractorId(items[0].id);
        }
      })
      .catch(() => {
        setContractors([
          {
            id: "contr-demo-1",
            name: `ТОО «Восток-Снаб ${targetRegion}»`,
            region: targetRegion,
            supplierProfile: {
              publicName: `Восток-Снаб ${targetRegion}`,
              about: `Локальный склад и служба доставки в г. ${targetRegion}. Своевременная передача заказов.`,
              averageRating: 4.9,
              reviewCount: 38,
              deliveryRegions: [targetRegion],
              categories: [],
            },
          },
          {
            id: "contr-demo-2",
            name: `ИП Алтай-Логистик`,
            region: targetRegion,
            supplierProfile: {
              publicName: "Алтай-Логистик",
              about: "Оперативная выдача, приёмка и экспедирование грузов на объектах заказчика.",
              averageRating: 4.8,
              reviewCount: 19,
              deliveryRegions: [targetRegion],
              categories: [],
            },
          },
        ]);
        setSelectedContractorId("contr-demo-1");
      })
      .finally(() => setLoadingContractors(false));
  }, [modalOpen, targetRegion]);

  const handleCreateSubcontract = async (e: FormEvent) => {
    e.preventDefault();
    setActionError("");
    setSubmitting(true);
    try {
      if (isDemo) {
        const dummyContractor = contractors.find(c => c.id === selectedContractorId);
        const newSub: SubcontractRecord = {
          id: `sub-${Date.now()}`,
          number: subcontracts.length + 1,
          dealId,
          title,
          targetRegion,
          description,
          agreedAmount: Number(agreedAmount),
          currency: "KZT",
          deadline: deadline || null,
          status: selectedContractorId ? "AGREED" : "SEARCHING",
          contractTerms: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
          generalSupplier: { id: "supp-1", name: supplierName, region: supplierRegion },
          subcontractor: dummyContractor
            ? {
                id: dummyContractor.id,
                name: dummyContractor.name,
                region: dummyContractor.region,
                supplierProfile: dummyContractor.supplierProfile,
              }
            : null,
          bids: [],
        };
        setSubcontracts(prev => [newSub, ...prev]);
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            body: selectedContractorId
              ? `🤝 Генеральный поставщик заключил субподряд SP-${newSub.number} с локальным исполнителем ${dummyContractor?.name} (${targetRegion}) на сумму ${money(Number(agreedAmount))}.`
              : `📢 Генеральный поставщик разместил субподряд SP-${newSub.number} на бирже для локальных исполнителей в г. ${targetRegion}.`,
            authorId: null,
            systemEvent: true,
            createdAt: new Date().toISOString(),
          },
        ]);
        setModalOpen(false);
        return;
      }

      const res = await apiRequest<SubcontractRecord>(`/deals/${dealId}/subcontracts`, {
        method: "POST",
        body: JSON.stringify({
          title,
          targetRegion,
          description,
          agreedAmount: Number(agreedAmount),
          deadline: deadline || undefined,
          subcontractorOrgId: modalTab === "contractors" ? selectedContractorId || undefined : undefined,
        }),
      });
      setSubcontracts(prev => [res, ...prev]);
      const updatedMessages = await apiRequest<DealMessage[]>(`/deals/${dealId}/messages`);
      setMessages(updatedMessages);
      setModalOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось заключить субподряд");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptBid = async (subcontractId: string, bidId: string) => {
    setActionError("");
    try {
      if (isDemo) {
        setSubcontracts(prev =>
          prev.map(sub => {
            if (sub.id !== subcontractId) return sub;
            return { ...sub, status: "AGREED" };
          })
        );
        return;
      }
      const updated = await apiRequest<SubcontractRecord>(`/subcontracts/${subcontractId}/accept-bid`, {
        method: "POST",
        body: JSON.stringify({ bidId }),
      });
      setSubcontracts(prev => prev.map(s => (s.id === subcontractId ? updated : s)));
      const updatedMessages = await apiRequest<DealMessage[]>(`/deals/${dealId}/messages`);
      setMessages(updatedMessages);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось утвердить отклик");
    }
  };

  const handleUpdateStatus = async (subcontractId: string, newStatus: "IN_PROGRESS" | "COMPLETED") => {
    setActionError("");
    try {
      if (isDemo) {
        setSubcontracts(prev =>
          prev.map(sub => (sub.id === subcontractId ? { ...sub, status: newStatus } : sub))
        );
        return;
      }
      const updated = await apiRequest<SubcontractRecord>(`/subcontracts/${subcontractId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus }),
      });
      setSubcontracts(prev => prev.map(s => (s.id === subcontractId ? updated : s)));
      const updatedMessages = await apiRequest<DealMessage[]>(`/deals/${dealId}/messages`);
      setMessages(updatedMessages);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось обновить статус");
    }
  };

  return (
    <section className="deal-subcontract-box" aria-label="Субподряд и региональное исполнение">
      <div className="subcontract-box-head">
        <div className="subcontract-title-wrap">
          <div className="subcontract-icon-badge">
            <Handshake size={22} />
          </div>
          <div>
            <h3>Локальный субподряд и исполнение</h3>
            <p>Привлечение местных исполнителей в регионе доставки ({deliveryRegion})</p>
          </div>
        </div>
        {isSupplier && (
          <button className="button button-primary button-sm" onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Найти субподрядчика в {deliveryRegion}
          </button>
        )}
      </div>

      <div className="subcontract-location-notice">
        <Truck size={18} style={{ flexShrink: 0, marginTop: 2, color: "#2563eb" }} />
        <div>
          <strong>Межрегиональная логистика:</strong> Заказчик ожидает поставку в г. <b>{deliveryRegion}</b>, а генеральный поставщик находится в г. <b>{supplierRegion}</b>.
          <br />
          {isSupplier
            ? `Вы можете заключить субподряд с проверенным исполнителем прямо в г. ${deliveryRegion} для оперативной приёмки, монтажа или передачи заказчику, сохранив генеральную маржу.`
            : `Поставщик может организовать исполнение заказа через локального субподрядчика в г. ${deliveryRegion} для гарантии соблюдения сроков на месте.`}
        </div>
      </div>

      {actionError && <div className="inline-notice" role="alert" style={{ marginBottom: 14 }}>{actionError}</div>}

      {subcontracts.length === 0 ? (
        <div className="subcontract-empty-card">
          <Handshake size={32} className="empty-sub-icon" />
          <strong>Субподрядчики пока не подключены</strong>
          <span>
            {isSupplier
              ? `Если вы находитесь в другом городе (${supplierRegion}), нажмите «Найти субподрядчика в ${deliveryRegion}», чтобы передать локальную часть заказа местной компании.`
              : `Генеральный поставщик выполняет заказ своими силами либо подключит местного партнёра в г. ${deliveryRegion}.`}
          </span>
          {isSupplier && (
            <button className="button button-secondary button-sm" onClick={() => setModalOpen(true)}>
              Выбрать субподрядчика в г. {deliveryRegion}
            </button>
          )}
        </div>
      ) : (
        <div className="subcontract-list">
          {subcontracts.map(sub => {
            const statusLabels: Record<string, string> = {
              SEARCHING: "Поиск исполнителя (биржа)",
              AGREED: "Субподряд заключён",
              IN_PROGRESS: "В работе у субподрядчика",
              COMPLETED: "Субподряд выполнен",
              CANCELLED: "Отменён",
            };
            const subAmount = Number(sub.agreedAmount);
            const subMargin = Math.max(0, dealAmount - subAmount);
            const subMarginPct = dealAmount > 0 ? Math.round((subMargin / dealAmount) * 100) : 0;

            return (
              <article key={sub.id} className="subcontract-card">
                <div className="subcontract-card-header">
                  <div>
                    <div className="subcontract-kicker">
                      <span>Субподряд SP-{sub.number}</span>
                      <span className="pill-region"><MapPin size={11} /> {sub.targetRegion}</span>
                    </div>
                    <h4>{sub.title}</h4>
                    {sub.description && <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>{sub.description}</p>}
                  </div>
                  <span className={`status-chip ${sub.status === "COMPLETED" ? "status-sent" : "status-work"}`}>
                    {statusLabels[sub.status] || sub.status}
                  </span>
                </div>

                {isSupplier && (
                  <div className="subcontract-financials">
                    <div className="finance-col">
                      <small>Сумма сделки</small>
                      <b>{money(dealAmount)}</b>
                    </div>
                    <span className="finance-divider">−</span>
                    <div className="finance-col">
                      <small>Субподрядчику</small>
                      <b className="blue-amount">{money(subAmount)}</b>
                    </div>
                    <span className="finance-divider">=</span>
                    <div className="finance-col">
                      <small>Ваша маржа</small>
                      <b className="margin-amount">+{money(subMargin)} ({subMarginPct}%)</b>
                    </div>
                  </div>
                )}

                {sub.subcontractor ? (
                  <div className="subcontractor-partner-card">
                    <div className="partner-avatar">
                      <Building2 size={18} />
                    </div>
                    <div className="partner-info">
                      <div className="partner-head">
                        <strong>{sub.subcontractor.name}</strong>
                        <span className="partner-city"><MapPin size={11} /> {sub.subcontractor.region || sub.targetRegion}</span>
                        {sub.subcontractor.supplierProfile?.averageRating ? (
                          <span className="partner-rating"><Star size={12} fill="currentColor" /> {sub.subcontractor.supplierProfile.averageRating}</span>
                        ) : null}
                      </div>
                      <small>Назначенный локальный субподрядчик в г. {sub.targetRegion}</small>
                    </div>

                    {isSupplier && sub.status === "AGREED" && (
                      <button className="button button-primary button-sm" onClick={() => handleUpdateStatus(sub.id, "IN_PROGRESS")}>
                        Отметить начало работ
                      </button>
                    )}
                    {isSupplier && sub.status === "IN_PROGRESS" && (
                      <button className="button button-primary button-sm" onClick={() => handleUpdateStatus(sub.id, "COMPLETED")}>
                        <Check size={14} /> Подтвердить выполнение
                      </button>
                    )}
                    {sub.status === "COMPLETED" && (
                      <span className="badge-done"><CheckCircle2 size={14} /> Выполнен</span>
                    )}
                  </div>
                ) : (
                  <div className="subcontract-bids-section">
                    <div className="bids-section-title">
                      <h5>Отклики местных компаний ({sub.bids?.length ?? 0}):</h5>
                    </div>
                    {!sub.bids?.length ? (
                      <div className="bids-empty">
                        <Clock3 size={15} />
                        <span>Субподряд размещён на бирже. Ожидаем предложений от местных компаний в г. {sub.targetRegion}.</span>
                      </div>
                    ) : (
                      <div className="bids-list">
                        {sub.bids.map(bid => (
                          <div key={bid.id} className="sub-bid-row">
                            <div className="bid-company">
                              <strong>{bid.contractor.name}</strong>
                              <span><MapPin size={11} /> {bid.contractor.region || sub.targetRegion} · Срок: {bid.proposedDate ? new Date(bid.proposedDate).toLocaleDateString("ru-KZ") : "По согласованию"}</span>
                              {bid.note && <p className="bid-note">«{bid.note}»</p>}
                            </div>
                            <div className="bid-price-action">
                              <span className="bid-price">{money(Number(bid.price))}</span>
                              {isSupplier && (
                                <button className="button button-primary button-sm" onClick={() => handleAcceptBid(sub.id, bid.id)}>
                                  Утвердить и заключить
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="subcontract-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Заключение субподряда в г. {targetRegion}</h3>
                <p>Передайте локальное выполнение заказа проверенной компании в регионе заказчика</p>
              </div>
              <button className="icon-button" aria-label="Закрыть" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-tabs">
              <button
                type="button"
                className={modalTab === "contractors" ? "active" : ""}
                onClick={() => setModalTab("contractors")}
              >
                <Building2 size={16} /> Проверенные исполнители в г. {targetRegion}
              </button>
              <button
                type="button"
                className={modalTab === "open" ? "active" : ""}
                onClick={() => setModalTab("open")}
              >
                <Globe2 size={16} /> Опубликовать на биржу субподрядов
              </button>
            </div>

            <form onSubmit={handleCreateSubcontract} className="modal-body">
              <div className="form-row-2">
                <label>
                  <span>Город исполнения</span>
                  <input
                    value={targetRegion}
                    onChange={e => setTargetRegion(e.target.value)}
                    required
                    placeholder="Например, Өскемен или Усть-Каменогорск"
                  />
                </label>
                <label>
                  <span>Срок выполнения</span>
                  <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                  />
                </label>
              </div>

              <div className="form-row-2">
                <label>
                  <span>Сумма сделки (заказчик платит вам)</span>
                  <input
                    type="text"
                    disabled
                    value={money(dealAmount)}
                    style={{ background: "#f8fafc", color: "#64748b" }}
                  />
                </label>
                <label>
                  <span>Бюджет субподряда (₸)</span>
                  <input
                    type="number"
                    min="1"
                    max={dealAmount}
                    required
                    value={agreedAmount}
                    onChange={e => setAgreedAmount(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="subcontract-financials" style={{ margin: "0" }}>
                <div className="finance-col">
                  <small>Сумма сделки</small>
                  <b>{money(dealAmount)}</b>
                </div>
                <span className="finance-divider">−</span>
                <div className="finance-col">
                  <small>Оплата субподрядчику</small>
                  <b className="blue-amount">{money(agreedAmount)}</b>
                </div>
                <span className="finance-divider">=</span>
                <div className="finance-col">
                  <small>Ваша чистая маржа</small>
                  <b className="margin-amount">+{money(marginKzt)} ({marginPct}%)</b>
                </div>
              </div>

              <label>
                <span>Название субподряда</span>
                <input
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Например, Локальная поставка и передача товаров заказчику"
                />
              </label>

              <label>
                <span>Описание работ и требования</span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Опишите, что требуется сделать местному партнеру: доставка до дверей, разгрузка, сборка, оформление накладных"
                />
              </label>

              {modalTab === "contractors" ? (
                <div>
                  <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                    Выберите местного субподрядчика ({contractors.length}):
                  </label>
                  {loadingContractors ? (
                    <div className="empty-state" style={{ padding: 16 }}>Ищем исполнителей в г. {targetRegion}…</div>
                  ) : contractors.length === 0 ? (
                    <div className="empty-state" style={{ padding: 16 }}>
                      <span>В г. {targetRegion} пока нет зарегистрированных субподрядчиков. Выберите вкладку «Опубликовать на биржу», и местные компании смогут откликнуться.</span>
                    </div>
                  ) : (
                    <div className="contractors-scroll">
                      {contractors.map(c => {
                        const isSelected = selectedContractorId === c.id;
                        return (
                          <div
                            key={c.id}
                            className={`contractor-item ${isSelected ? "selected" : ""}`}
                            onClick={() => setSelectedContractorId(c.id)}
                          >
                            <div className="contractor-main-info">
                              <div className="contractor-name-row">
                                <strong>{c.name}</strong>
                                <BadgeCheck size={15} className="blue-check" />
                              </div>
                              <div className="contractor-meta">
                                <span className="partner-city"><MapPin size={11} /> {c.region || targetRegion}</span>
                                {c.supplierProfile?.averageRating ? (
                                  <span className="partner-rating"><Star size={11} fill="currentColor" /> {c.supplierProfile.averageRating} ({c.supplierProfile.reviewCount} отзывов)</span>
                                ) : null}
                              </div>
                              {c.supplierProfile?.about && (
                                <p className="contractor-about">{c.supplierProfile.about}</p>
                              )}
                            </div>
                            <input
                              type="radio"
                              name="contractor"
                              checked={isSelected}
                              onChange={() => setSelectedContractorId(c.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="subcontract-location-notice">
                  <Globe2 size={18} style={{ flexShrink: 0, marginTop: 2, color: "#2563eb" }} />
                  <div>
                    Субподряд будет опубликован на открытой <b>Бирже субподрядов TenderMarket</b>. Компании из г. <b>{targetRegion}</b> смогут присылать свои коммерческие отклики и сроки, а вы выберете лучшее предложение.
                  </div>
                </div>
              )}

              {actionError && <div className="inline-notice" role="alert">{actionError}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button type="button" className="button button-secondary" onClick={() => setModalOpen(false)}>
                  Отмена
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submitting || (modalTab === "contractors" && !selectedContractorId)}
                >
                  {submitting
                    ? "Сохранение…"
                    : modalTab === "contractors"
                    ? "Заключить прямой субподряд"
                    : "Опубликовать на биржу"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
