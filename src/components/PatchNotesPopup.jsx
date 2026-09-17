import { useEffect, useState } from "react";
import { Check, Menu, RotateCcw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PATCH_ID = "navigation-ux-update";
const getPatchStorageKey = (userId) => `notesgym_patch_${PATCH_ID}_${userId}`;

const copy = {
  fr: {
    title: "Nouveautés NotesGym",
    subtitle: "Navigation et améliorations",
    button: "Compris",
    items: [
      ["Menu repensé", "Le menu Options a été réorganisé pour être plus clair et plus compact. Les outils, préférences et fonctions de gestion sont maintenant mieux regroupés et plus faciles à retrouver."],
      ["Suppression annulable", "Une note supprimée par erreur ? Vous avez maintenant 10 secondes pour la restaurer directement après sa suppression."],
      ["Quelques finitions", "Plusieurs petits ajustements améliorent l’expérience générale de NotesGym, notamment une navigation plus cohérente et quelques détails visuels supplémentaires."],
    ],
  },
  en: {
    title: "What's new in NotesGym",
    subtitle: "Navigation and improvements",
    button: "Got it",
    items: [
      ["Redesigned menu", "The Options menu has been reorganized to be clearer and more compact. Tools, preferences and data-management features are now grouped logically and easier to find."],
      ["Undo deletions", "Deleted a grade by mistake? You now have 10 seconds to restore it immediately after deletion."],
      ["Finishing touches", "Several small adjustments improve the overall NotesGym experience, including more consistent navigation and a few additional visual details."],
    ],
  },
  de: {
    title: "Neu in NotesGym",
    subtitle: "Navigation und Verbesserungen",
    button: "Verstanden",
    items: [
      ["Neu gestaltetes Menü", "Das Optionsmenü wurde übersichtlicher und kompakter gestaltet. Werkzeuge, Einstellungen und Funktionen zur Datenverwaltung sind jetzt sinnvoll gruppiert und leichter zu finden."],
      ["Löschen rückgängig machen", "Eine Note versehentlich gelöscht? Du hast jetzt 10 Sekunden Zeit, sie direkt nach dem Löschen wiederherzustellen."],
      ["Feinschliff", "Mehrere kleine Anpassungen verbessern das Nutzungserlebnis in NotesGym, darunter eine einheitlichere Navigation und einige zusätzliche visuelle Details."],
    ],
  },
};

const icons = [Menu, RotateCcw, Sparkles];

export default function PatchNotesPopup({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const language = localStorage.getItem("notesgym_language") || "fr";
  const t = copy[language] || copy.fr;

  useEffect(() => {
    if (!user?.id) return;
    const key = getPatchStorageKey(user.id);
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setIsOpen(true);
  }, [user?.id]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="!z-[80] max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto border-0 bg-[#e0e5eb] p-0 text-slate-600 shadow-[18px_18px_40px_#aeb4bc,-18px_-18px_40px_#ffffff] sm:rounded-3xl">
        <div className="rounded-t-3xl bg-gradient-to-br from-slate-600 to-slate-800 px-6 py-7 text-white sm:px-8">
          <DialogHeader>
            <DialogTitle className="text-2xl text-white sm:text-3xl">{t.title}</DialogTitle>
            <DialogDescription className="text-slate-300">{t.subtitle}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 py-7 sm:px-8">
          {t.items.map(([title, description], index) => {
            const Icon = icons[index];
            return (
              <section className="flex gap-4" key={title}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[4px_4px_8px_#b8bdc4,-4px_-4px_8px_#ffffff]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-700">{title}</h3>
                  <p className="text-sm leading-relaxed">{description}</p>
                </div>
              </section>
            );
          })}
          <DialogFooter>
            <button type="button" onClick={() => setIsOpen(false)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-3 font-semibold text-white hover:bg-slate-800 focus-visible:ring-2 sm:w-auto">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t.button}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
