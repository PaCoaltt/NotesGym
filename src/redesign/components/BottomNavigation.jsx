import React from "react";
import { BarChart3, Home, Lightbulb, MoreHorizontal, Plus, X } from "lucide-react";

export default function BottomNavigation({ addOpen, onAdd, onClose, onUseClassic }) {
  return (
    <>
      <nav className="v2-bottom-nav" aria-label="Navigation principale V2">
        <button className="is-active" type="button" aria-current="page"><Home /><span>Accueil</span></button>
        <button type="button" aria-label="Notes, bientôt disponible"><BarChart3 /><span>Notes</span></button>
        <button className="v2-add" type="button" aria-label="Ajouter une note" aria-expanded={addOpen} onClick={onAdd}><Plus /></button>
        <button type="button" aria-label="Insights, bientôt disponible"><Lightbulb /><span>Insights</span></button>
        <button type="button" aria-label="Plus, bientôt disponible"><MoreHorizontal /><span>Plus</span></button>
      </nav>
      {addOpen && <div className="v2-sheet-backdrop" onClick={onClose} />}
      <section className={`v2-sheet ${addOpen ? "is-open" : ""}`} aria-hidden={!addOpen} aria-label="Ajouter une note">
        <div className="v2-sheet-handle" />
        <button className="v2-sheet-close" type="button" onClick={onClose} aria-label="Fermer"><X /></button>
        <p className="v2-eyebrow">Action rapide</p>
        <h2>Ajouter une nouvelle note</h2>
        <p>L’ajout V2 arrivera dans une prochaine étape. Utilise pour l’instant le formulaire existant.</p>
        <button className="v2-sheet-primary" type="button" onClick={onUseClassic}>Ouvrir le Dashboard classique</button>
      </section>
    </>
  );
}
