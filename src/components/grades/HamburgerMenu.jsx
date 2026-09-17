import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Menu, X } from "lucide-react";
import { statisticsTranslations } from "@/components/statistics/statisticsTranslations";
import MenuHome from "@/components/menu/MenuHome";
import MenuPreferences from "@/components/menu/MenuPreferences";
import MenuData from "@/components/menu/MenuData";
import MenuHelp from "@/components/menu/MenuHelp";
import MenuReplay from "@/components/menu/MenuReplay";
import MenuDreamGrades from "@/components/menu/MenuDreamGrades";
import MenuSearch from "@/components/menu/MenuSearch";

export default function HamburgerMenu(props) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuView, setMenuView] = useState("main");
  const [historyDate, setHistoryDate] = useState("");
  const fileInputRef = useRef(null);
  const closeButtonRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const { language, t } = props;
  const replayT = { ...t, ...statisticsTranslations[language] };

  const closeMenu = () => {
    setIsOpen(false);
    setMenuView("main");
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const views = {
    main: <MenuHome t={t} statisticsTitle={replayT.title} onNavigate={setMenuView} onInsights={() => { closeMenu(); props.onInsights(); }} onStatistics={() => { closeMenu(); props.onStatistics(); }} />,
    search: <MenuSearch t={t} searchTerm={props.searchTerm} onSearchChange={props.onSearchChange} />,
    preferences: <MenuPreferences {...props} />,
    data: <MenuData t={t} fileInputRef={fileInputRef} onExport={() => { props.onExport(); closeMenu(); }} onImport={(file) => { props.onImport(file); closeMenu(); }} onArchive={() => { props.onArchive(); closeMenu(); }} />,
    help: <MenuHelp t={t} onRedoTutorial={() => { props.onRedoTutorial(); closeMenu(); }} />,
    replay: <MenuReplay {...props} date={historyDate} onDateChange={setHistoryDate} t={replayT} />,
    dreamGrades: <MenuDreamGrades {...props} onAddDreamNote={(subject) => { props.onAddDreamNote(subject); closeMenu(); }} />,
  };

  return <>
    <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => isOpen ? closeMenu() : setIsOpen(true)} aria-label={isOpen ? t.close : t.openOptions} aria-expanded={isOpen} className="p-3 rounded-xl transition-all" style={{ backgroundColor: "#e0e5eb", color: "#5a6a7a", boxShadow: isOpen ? "inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff" : "8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff" }}>
      {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
    </motion.button>
    <AnimatePresence>
      {isOpen && <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30" onClick={closeMenu} aria-hidden="true" />
        <motion.aside role="dialog" aria-modal="true" aria-label={t.options} initial={reduceMotion ? false : { x: "100%" }} animate={{ x: 0 }} exit={reduceMotion ? { opacity: 0 } : { x: "100%" }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="fixed right-0 top-0 z-50 flex h-[100dvh] w-80 max-w-[85vw] flex-col bg-[#e0e5eb] shadow-[-10px_0_30px_rgba(0,0,0,0.1)]">
          <header className="z-10 flex shrink-0 items-center justify-between px-5 py-4">
            <h2 className="text-2xl font-bold text-[#5a6a7a]">{t.options}</h2>
            <motion.button ref={closeButtonRef} type="button" whileTap={{ scale: 0.9 }} onClick={closeMenu} aria-label={t.close} className="rounded-lg bg-[#e0e5eb] p-2 text-[#8a9aa8] shadow-[4px_4px_8px_#b8bdc4,-4px_-4px_8px_#ffffff]"><X className="h-5 w-5" /></motion.button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={menuView} initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: reduceMotion ? 0 : 0.14 }}>
                {menuView !== "main" && <button type="button" onClick={() => setMenuView("main")} className="sticky top-0 z-10 mb-5 flex min-h-11 w-full items-center gap-2 bg-[#e0e5eb] py-2 text-left font-semibold text-[#5a6a7a]" aria-label={t.backToOptions}><ArrowLeft className="h-5 w-5" />{t.back}</button>}
                {views[menuView]}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      </>}
    </AnimatePresence>
  </>;
}
