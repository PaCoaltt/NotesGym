import { BarChart3, Lightbulb, MoreHorizontal, Plus, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { translations } from "@/components/translations";
import { statisticsTranslations } from "@/components/statistics/statisticsTranslations";

export default function MobileBottomNav({ language, navigationState, onAdd, onSearch, onMore }) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = navigationState || location.state || {};
  const lang = language || state.language || localStorage.getItem("notesgym_language") || "fr";
  const t = translations[lang] || translations.fr;
  const moreLabel = { fr: "Plus…", en: "More…", de: "Mehr…" }[lang] || "Plus…";
  const dashboardAction = (mobileAction) => navigate("/Dashboard", { state: { ...state, mobileAction } });
  const items = [
    { icon: Lightbulb, label: t.insights, active: location.pathname === "/Insights", onClick: () => navigate("/Insights", { state }) },
    { icon: BarChart3, label: (statisticsTranslations[lang] || statisticsTranslations.fr).title, active: location.pathname === "/Statistics", onClick: () => navigate("/Statistics", { state }) },
    { icon: Plus, label: t.addNote, add: true, onClick: onAdd || (() => dashboardAction("add")) },
    { icon: Search, label: t.search, onClick: onSearch || (() => dashboardAction("search")) },
    { icon: MoreHorizontal, label: moreLabel, onClick: onMore || (() => dashboardAction("main")) },
  ];

  return <nav aria-label={t.appTitle} className="mobile-bottom-nav md:hidden">
    {items.map(({ icon: Icon, label, active, add, onClick }) => <button
      key={label} type="button" onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined}
      className={`mobile-bottom-nav-item${active ? " is-active" : ""}${add ? " is-add" : ""}`}
    >
      <span className="mobile-bottom-nav-icon"><Icon aria-hidden="true" className={add ? "h-7 w-7" : "h-5 w-5"} /></span>
      {!add && <span className="mobile-bottom-nav-label">{label}</span>}
    </button>)}
  </nav>;
}
