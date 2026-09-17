import { BarChart3, CircleHelp, Database, History, Lightbulb, Search, Settings, Sparkles } from "lucide-react";
import { MenuButton } from "./MenuPrimitives";

export default function MenuHome({ t, statisticsTitle, onNavigate, onInsights, onStatistics }) {
  return <div className="space-y-3">
    <MenuButton icon={Lightbulb} onClick={onInsights} prominent>{t.insights}</MenuButton>
    <MenuButton icon={BarChart3} onClick={onStatistics} prominent>{statisticsTitle}</MenuButton>
    <h3 className="px-1 pt-3 text-sm font-semibold uppercase tracking-wide text-[#8a9aa8]">{t.tools}</h3>
    <MenuButton icon={Search} onClick={() => onNavigate("search")}>{t.search}</MenuButton>
    <MenuButton icon={History} onClick={() => onNavigate("replay")}>{t.replay}</MenuButton>
    <MenuButton icon={Sparkles} onClick={() => onNavigate("dreamGrades")}>{t.dreamGrades}</MenuButton>
    <div className="space-y-2 border-t border-[#c8ced6] pt-4">
      <MenuButton icon={Settings} onClick={() => onNavigate("preferences")} chevron>{t.preferences}</MenuButton>
      <MenuButton icon={Database} onClick={() => onNavigate("data")} chevron>{t.data}</MenuButton>
      <MenuButton icon={CircleHelp} onClick={() => onNavigate("help")} chevron>{t.help}</MenuButton>
    </div>
  </div>;
}
