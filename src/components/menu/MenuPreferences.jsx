import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { insetShadow, raisedShadow, ViewTitle } from "./MenuPrimitives";

const languages = [{ code: "fr", name: "Français" }, { code: "en", name: "English" }, { code: "de", name: "Deutsch" }];
export default function MenuPreferences({ t, language, onLanguageChange, gradingSystem, onGradingSystemChange }) {
  const systems = [["swiss", t.swissSystem], ["french", t.frenchSystem], ["american", t.americanSystem]];
  return <><ViewTitle>{t.preferences}</ViewTitle><section className="mb-7"><h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-[#8a9aa8]"><Globe className="h-4 w-4" />{t.language}</h4><div className="grid grid-cols-3 gap-2">{languages.map((item) => <motion.button type="button" key={item.code} whileTap={{ scale: 0.95 }} onClick={() => onLanguageChange(item.code)} aria-pressed={language === item.code} className="min-h-12 rounded-xl p-2 text-sm font-medium" style={{ color: language === item.code ? "#5a6a7a" : "#8a9aa8", boxShadow: language === item.code ? insetShadow : raisedShadow }}>{item.name}</motion.button>)}</div></section><section><h4 className="mb-3 text-sm font-medium text-[#8a9aa8]">{t.gradingSystem}</h4><div className="space-y-2">{systems.map(([value, label]) => <motion.button type="button" key={value} whileTap={{ scale: 0.98 }} onClick={() => onGradingSystemChange(value)} aria-pressed={gradingSystem === value} className="min-h-12 w-full rounded-xl p-3 text-left font-medium" style={{ color: gradingSystem === value ? "#5a6a7a" : "#8a9aa8", boxShadow: gradingSystem === value ? insetShadow : raisedShadow }}>{label}</motion.button>)}</div></section></>;
}
