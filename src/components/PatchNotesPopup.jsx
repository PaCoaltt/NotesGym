import { useEffect, useState } from "react";
import { BarChart3, Check, FlaskConical, Sparkles, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PATCH_ID = "september-launch";

const getPatchStorageKey = (userId) => `notesgym_patch_${PATCH_ID}_${userId}`;

export default function PatchNotesPopup({ user }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = getPatchStorageKey(user.id);
    if (localStorage.getItem(storageKey)) return;

    // The patch note is considered seen as soon as it is displayed, so a refresh
    // cannot show it twice to the same signed-in user.
    localStorage.setItem(storageKey, "1");
    setIsOpen(true);
  }, [user?.id]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="!z-[80] max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto border-0 bg-[#e0e5eb] p-0 text-slate-600 shadow-[18px_18px_40px_#aeb4bc,-18px_-18px_40px_#ffffff] sm:rounded-3xl">
        <div className="overflow-hidden rounded-t-3xl bg-gradient-to-br from-slate-600 to-slate-800 px-6 py-7 text-white sm:px-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              Nouveautés
            </p>
            <DialogTitle className="text-2xl leading-tight text-white sm:text-3xl">
              Notes de patch - September Launch
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-300">
              Découvrez ce qui change dans cette nouvelle version de NotesGym.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-7 px-6 py-7 sm:px-8">
          <section aria-labelledby="major-changes-title">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e0e5eb] shadow-[4px_4px_8px_#b8bdc4,-4px_-4px_8px_#ffffff]">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 id="major-changes-title" className="font-bold text-slate-700">
                  Modifications majeures
                </h3>
                <p className="text-sm font-semibold text-slate-500">Insights et ML !</p>
              </div>
            </div>

            <div className="space-y-4 border-l-2 border-slate-400/40 pl-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              <p>
                NotesGym devient plus intelligent avec l’arrivée des <strong>Insights</strong>, un
                nouveau moteur d’analyse entièrement local et sans IA.
              </p>
              <p>
                Il analyse vos résultats pour détecter les <strong>tendances, progressions,
                baisses, variations inhabituelles et matières à surveiller</strong>, tout en
                identifiant les résultats ayant le plus d’impact sur votre moyenne et votre
                compensation.
              </p>
              <div className="flex gap-3 rounded-2xl bg-slate-700/5 p-4">
                <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
                <p>
                  Une nouvelle <strong>Simulation du semestre</strong>, basée sur la méthode de
                  Monte-Carlo, génère 10 000 scénarios à partir de vos résultats pour estimer
                  votre moyenne future, votre probabilité de compensation et les principaux
                  risques par matière.
                </p>
              </div>
              <p>
                Les estimations s’adaptent automatiquement à vos nouvelles notes et indiquent
                leur niveau de confiance lorsque peu de données sont disponibles.
              </p>
            </div>
          </section>

          <section aria-labelledby="minor-changes-title">
            <div className="mb-3 flex items-center gap-3">
              <Trash2 className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <h3 id="minor-changes-title" className="font-bold text-slate-700">
                Modifications mineures
              </h3>
            </div>
            <ul className="space-y-2 pl-8 text-sm text-slate-600 sm:text-base">
              <li className="list-disc">Suppression de la fonctionnalité « Rapport PDF »</li>
              <li className="list-disc">Suppression du bouton inutile « Auto-héberger »</li>
            </ul>
          </section>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 sm:w-auto"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              J’ai compris
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
