import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Globe2,
  Handshake,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { kazakhstanCities } from "./data";
import { apiRequest, readLocal } from "./lib/api";
import { Footer, PortalHeader, PortalSidebar, SiteHeader } from "./App";
import type { LocalContractor, SubcontractRecord } from "./types";
import { money } from "./DealSubcontractSection";

export function SubcontractsPage() {
  const [tab, setTab] = useState<"market" | "my" | "contractors">("market");
  const [openSubcontracts, setOpenSubcontracts] = useState<SubcontractRecord[]>([]);
  const [mySubs, setMySubs] = useState<SubcontractRecord[]>([]);
  const [contractorsList, setContractorsList] = useState<LocalContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCity, setSelectedCity] = useState("Все регионы");
  const [searchQuery, setSearchQuery] = useState("");

  // Bid modal state
  const [bidModalSub, setBidModalSub] = useState<SubcontractRecord | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidDays, setBidDays] = useState("3");
  const [bidComment, setBidComment] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidToast, setBidToast] = useState("");

  const userRole = readLocal<string>("tm_user_role", "");
  const hasToken = Boolean(readLocal("tm_access_token", ""));

  const loadMarket = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedCity !== "Все регионы") params.set("region", selectedCity);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const queryStr = params.toString() ? `?${params.toString()}` : "";

      const subs = await apiRequest<SubcontractRecord[]>(`/subcontracts${queryStr}`);
      setOpenSubcontracts(subs);

      if (hasToken) {
        try {
          const mine = await apiRequest<SubcontractRecord[]>("/subcontracts/mine");
          setMySubs(mine);
        } catch {
          setMySubs([]);
        }
      }

      const contractors = await apiRequest<LocalContractor[]>(`/subcontracts/contractors${queryStr}`);
      setContractorsList(contractors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные биржи субподрядов.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMarket();
  }, [selectedCity, searchQuery]);

  const submitBid = async (e: FormEvent) => {
    e.preventDefault();
    if (!bidModalSub) return;
    if (!hasToken) {
      setError("Пожалуйста, войдите в аккаунт поставщика, чтобы откликнуться на субподряд.");
      return;
    }
    setSubmittingBid(true);
    try {
      await apiRequest(`/subcontracts/${bidModalSub.id}/bids`, {
        method: "POST",
        body: JSON.stringify({
          price: Number(bidAmount),
          proposedDate: new Date(Date.now() + Number(bidDays) * 86400000).toISOString(),
          note: bidComment,
        }),
      });
      setBidToast("Ваш отклик на субподряд успешно отправлен генеральному поставщику!");
      setBidModalSub(null);
      setBidAmount("");
      setBidComment("");
      void loadMarket();
      window.setTimeout(() => setBidToast(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при отправке отклика");
    } finally {
      setSubmittingBid(false);
    }
  };

  const content = (
    <main className="subcontracts-main">
      <div className="subcontracts-welcome">
        <div>
          <span className="section-eyebrow">Межрегиональное сотрудничество</span>
          <h1>Биржа субподрядов и локальное исполнение</h1>
          <p>
            Выиграли подряд в другом городе? Передайте исполнение проверенным местным компаниям (например, из Актау в Өскемен / Усть-Каменогорск) или находите прибыльные субподряды в своём регионе.
          </p>
        </div>
        <div className="subcontracts-tabs-pill">
          <button
            type="button"
            className={tab === "market" ? "active" : ""}
            onClick={() => setTab("market")}
          >
            <Globe2 size={16} /> Открытые субподряды ({openSubcontracts.length})
          </button>
          {hasToken && (
            <button
              type="button"
              className={tab === "my" ? "active" : ""}
              onClick={() => setTab("my")}
            >
              <Handshake size={16} /> Мои субподряды ({mySubs.length})
            </button>
          )}
          <button
            type="button"
            className={tab === "contractors" ? "active" : ""}
            onClick={() => setTab("contractors")}
          >
            <Building2 size={16} /> Местные исполнители ({contractorsList.length})
          </button>
        </div>
      </div>

      <div className="subcontracts-filters-bar">
        <div className="subcontracts-search-input">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию субподряда, работам или компании…"
          />
        </div>
        <div className="subcontracts-city-filter">
          <MapPin size={16} />
          <select value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
            <option value="Все регионы">Все регионы Казахстана</option>
            {kazakhstanCities.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {bidToast && (
        <div className="inline-notice success-notice" role="status" style={{ marginBottom: 16 }}>
          {bidToast}
        </div>
      )}
      {error && (
        <div className="inline-notice" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Загружаем данные субподрядов…</div>
      ) : tab === "market" ? (
        openSubcontracts.length === 0 ? (
          <div className="empty-state">
            <Handshake size={32} />
            <strong>Открытых субподрядов пока нет</strong>
            <span>
              В выбранном регионе нет открытых заявок на субподряд. Вы можете первыми разместить субподряд из своей активной сделки.
            </span>
          </div>
        ) : (
          <div className="subcontract-grid">
            {openSubcontracts.map(sub => (
              <article key={sub.id} className="subcontract-market-card">
                <div className="market-card-top">
                  <span className="pill-region">
                    <MapPin size={11} /> {sub.targetRegion}
                  </span>
                  <span className="status-chip status-work">SP-{sub.number}</span>
                </div>
                <h3>{sub.title}</h3>
                {sub.description && <p className="market-card-desc">{sub.description}</p>}
                <div className="market-card-meta">
                  <div className="meta-item">
                    <small>Генподрядчик</small>
                    <strong>
                      {sub.generalSupplier.name} ({sub.generalSupplier.region || "Казахстан"})
                    </strong>
                  </div>
                  <div className="meta-item">
                    <small>Бюджет субподряда</small>
                    <b className="blue-amount">{money(Number(sub.agreedAmount))}</b>
                  </div>
                </div>
                <div className="market-card-footer">
                  <span>Откликов: {sub.bids?.length ?? 0}</span>
                  <button
                    className="button button-primary button-sm"
                    onClick={() => {
                      setBidModalSub(sub);
                      setBidAmount(String(sub.agreedAmount));
                    }}
                  >
                    Откликнуться
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : tab === "my" ? (
        mySubs.length === 0 ? (
          <div className="empty-state">
            <Handshake size={32} />
            <strong>У вас пока нет субподрядов</strong>
            <span>
              Вы можете заключить субподряд в любой выигранной сделке или откликнуться на открытый субподряд на бирже.
            </span>
          </div>
        ) : (
          <div className="subcontract-grid">
            {mySubs.map(sub => (
              <article key={sub.id} className="subcontract-market-card">
                <div className="market-card-top">
                  <span className="pill-region">
                    <MapPin size={11} /> {sub.targetRegion}
                  </span>
                  <span className="status-chip status-work">{sub.status}</span>
                </div>
                <h3>{sub.title}</h3>
                <div className="market-card-meta">
                  <div className="meta-item">
                    <small>Генподрядчик</small>
                    <strong>{sub.generalSupplier.name}</strong>
                  </div>
                  <div className="meta-item">
                    <small>Субподрядчик</small>
                    <strong>{sub.subcontractor?.name || "Не назначен (поиск)"}</strong>
                  </div>
                  <div className="meta-item">
                    <small>Сумма</small>
                    <b className="blue-amount">{money(Number(sub.agreedAmount))}</b>
                  </div>
                  <div className="meta-item">
                    <small>Откликов</small>
                    <b>{sub.bids?.length ?? 0}</b>
                  </div>
                </div>
                <div className="market-card-footer">
                  <Link to={`/deals/${sub.dealId}`} className="text-link" style={{ fontSize: 13, fontWeight: 600 }}>
                    Перейти к сделке <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )
      ) : contractorsList.length === 0 ? (
        <div className="empty-state">
          <Building2 size={32} />
          <strong>Исполнители не найдены</strong>
          <span>В выбранном городе пока нет зарегистрированных субподрядчиков.</span>
        </div>
      ) : (
        <div className="subcontract-grid">
          {contractorsList.map(c => (
            <article key={c.id} className="subcontract-market-card">
              <div className="market-card-top">
                <span className="pill-region">
                  <MapPin size={11} /> {c.region || "Казахстан"}
                </span>
                <BadgeCheck size={16} className="blue-check" />
              </div>
              <h3>{c.name}</h3>
              {c.supplierProfile?.about && <p className="market-card-desc">{c.supplierProfile.about}</p>}
              <div className="market-card-meta">
                <div className="meta-item">
                  <small>Рейтинг</small>
                  <strong>
                    ⭐ {c.supplierProfile?.averageRating ?? "5.0"} ({c.supplierProfile?.reviewCount ?? 0} отзывов)
                  </strong>
                </div>
                <div className="meta-item">
                  <small>Статус</small>
                  <b style={{ color: "#16a34a" }}>Проверенный партнёр</b>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {bidModalSub && (
        <div className="modal-overlay" onClick={() => setBidModalSub(null)}>
          <div className="subcontract-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Отклик на субподряд SP-{bidModalSub.number}</h3>
                <p>
                  {bidModalSub.title} ({bidModalSub.targetRegion})
                </p>
              </div>
              <button className="icon-button" aria-label="Закрыть" onClick={() => setBidModalSub(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitBid} className="modal-body">
              <div className="form-row-2">
                <label>
                  <span>Ваша цена за выполнение (₸)</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bidAmount}
                    onChange={e => setBidAmount(e.target.value)}
                  />
                </label>
                <label>
                  <span>Срок выполнения (дней)</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bidDays}
                    onChange={e => setBidDays(e.target.value)}
                  />
                </label>
              </div>
              <label>
                <span>Комментарий к предложению</span>
                <textarea
                  rows={3}
                  required
                  value={bidComment}
                  onChange={e => setBidComment(e.target.value)}
                  placeholder="Опишите ваши возможности в регионе: склад, транспорт, бригада монтажников, готовность оперативно передать товар заказчику"
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="button button-secondary" onClick={() => setBidModalSub(null)}>
                  Отмена
                </button>
                <button type="submit" className="button button-primary" disabled={submittingBid}>
                  {submittingBid ? "Отправка…" : "Отправить отклик"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );

  if (hasToken) {
    return (
      <div className="portal-shell">
        <PortalHeader
          title="Биржа субподрядов"
          role={userRole === "SUPPLIER" ? "Поставщик / Подрядчик" : "Участник"}
        />
        <div className="portal-layout">
          <PortalSidebar active="Субподряды" />
          {content}
        </div>
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      {content}
      <Footer />
    </>
  );
}
