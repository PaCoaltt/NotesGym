# Moteur prédictif annuel : audit et hypothèses

## Audit de la PR #15

La PR était déjà fusionnée dans le main local (0ef372c). Audit réalisé contre son premier parent, sans nouvelle fusion.

Éléments conservés : périmètre annuel d’Insights, préférence d’historique activée par défaut, paramètres de simulation, générateur seedé, primitives de moyenne/compensation, métriques du Lab et panels existants.

Défauts corrigés :
- La pente entrait comme une note dans la moyenne pondérée : des notes constantes à 5 donnaient un niveau 4.5. Désormais trois niveaux sont mélangés : moyenne annuelle, moyenne récente et moyenne récente ajustée de la pente.
- L’historique comprenait toute année et les dates absentes avaient le poids maximal. Seules les années antérieures et dates d’évaluation valides sont admises dans le prior.
- Le rapprochement interannuel par libellé pouvait mélanger des matières. Identité stable explicite, ou association utilisateur conservée en localStorage ; aucune correspondance automatique entre années.
- Le walk-forward par position pouvait voir une autre note du même jour. Le cutoff est désormais strict sur le jour d’évaluation ; created_date n’est pas une preuve d’antériorité.
- La normale était écrêtée et créait des masses artificielles à 1 et 6. Échantillonnage par rejet dans [1,6], avec secours uniforme après 10000 rejets.
- La dispersion empirique pouvait devenir trop faible. Variance corrigée par effectif effectif, régularisation et plancher conservateur.
- La comparaison manquait d’erreur médiane, largeur et graphique. Ajout des six indicateurs, comparaison annuelle indépendante du semestre et avertissement pour moins de 20 cibles.

## Architecture

1. predictiveData.js sélectionne les données : notes officielles non archivées de l’année, indépendamment du semestre ; prior composé de notes admissibles d’années strictement antérieures. Les archives ne sont jamais ajoutées au bulletin.
2. buildPredictiveDistribution estime une prochaine note d’une seule matière. Les dates invalides/absentes, valeurs hors [1,6] et exclusions sont omises du modèle. Trois observations annuelles datées sont nécessaires ; autrement la simulation utilise la moyenne officielle et une dispersion de secours.
3. simulateAnnual conserve les notes officielles et ajoute uniquement le nombre d’évaluations futures choisi. weightedAverage calcule la moyenne brute pondérée ; calculateCompensation arrondit chaque moyenne matière au demi-point puis applique positifs >= 2 × négatifs. Ces règles existantes ne sont pas modifiées. simulateSemester reste un alias de compatibilité.
4. Les deux backtests utilisent ces mêmes primitives. Chaque cible possède exactement les mêmes dates antérieures, paramètres, itérations et seed dans les modèles A/B. Seul le prior historique diffère. Les cibles ne sont jamais utilisées pour estimer le niveau, la tendance ou la volatilité.

## Formules et paramètres à calibrer

Poids d’une observation : coefficient valide × 2^(-âge / demi-vie). Coefficients absents, non positifs ou non finis : secours à 1, conformément au moteur existant. Les coefficients sont une importance relative et ne représentent pas plusieurs observations indépendantes.

Effectif effectif : (somme des poids)^2 / somme des poids au carré. Moyenne récente : trois dernières évaluations, avec coefficients et récence. Tendance : pente par évaluation sur au plus huit notes annuelles, plafonnée à ±0.3 avant mélange. Le calendrier sert à la récence ; la pente n’est pas une vitesse par jour.

Le prior interannuel a au plus deux observations équivalentes de poids et une influence maximale de 25 %. Sa masse décroît aussi avec l’âge ; son influence décroît avec l’effectif annuel. Il ne gouverne pas la tendance récente. La volatilité utilise au plus dix notes annuelles ; la variance est corrigée par l’effectif effectif, régularisée vers une dispersion de 0.5 avec une force de deux observations, puis augmentée pour l’incertitude sur le niveau. Plancher de dispersion à 0.5 même dans le Playground.

À calibrer par validation chronologique sur données représentatives : demi-vie 365 jours, force et plafond du prior, fenêtres récentes, mélange des niveaux, plafond de tendance, dispersion minimale et régularisation. Aucun de ces paramètres n’est déclaré optimal. Le seuil descriptif de 20 cibles n’est pas un test de significativité.

## Limites

- Associations des anciennes matières : à confirmer explicitement dans Insights. Elles restent sur cet appareil et ne modifient pas le serveur ; les identifiants stables fournis dans les données sont prioritaires. Une association erronée reste possible si l’utilisateur la confirme.
- Changements de niveau scolaire : pas de métadonnée fiable dans le dépôt. La récence et le plafond du prior atténuent leur effet sans l’identifier.
- Dates sans ordre intrajournalier : toutes les notes du même jour sont exclues du passé d’une cible, volontairement conservateur.
- Au moins trois notes annuelles sont requises pour la comparaison équitable. Les débuts d’année sont donc hors évaluation comparative.
- Prédictions conditionnelles aux notes enregistrées et aux évaluations restantes saisies ; aucun calendrier annuel d’examens n’est disponible.
- La simulation tire les futures notes indépendamment à paramètres fixes. Elle ne modélise pas les chocs communs entre matières ni la corrélation des futures évaluations : les intervalles annuels peuvent rester trop étroits. La couverture P10–P90 (cible nominale 80 %) doit être observée conjointement à la largeur.
- La moyenne de la normale tronquée diffère de son paramètre de position près des bornes. La médiane et les quantiles proviennent des échantillons réellement bornés.
- Pas de résultat empirique sur de vrais élèves dans ce chantier. Les fixtures démontrent les invariants, pas un gain prédictif. Les observations d’un élève sont dépendantes ; aucun verdict causal ni significativité n’est revendiqué.

## Vérification

Tests Node : suite historique conservée et tests spécifiques de scope annuel, archives/GBJB, dates invalides, récence, coefficients, identités, associations explicites, échelle suisse, reproductibilité, absence de fuite et appariement A/B. Le test expérimental d’historique a été rendu explicite avec un subject_id afin de ne pas réintroduire une association automatique par nom.

Validation exécutée : 36 tests Node après les dernières finitions, ESLint ciblé sans erreur et build Vite réussi. Contrôle navigateur avec Edge headless et données synthétiques à 390 px et 1440 px : association historique, switch mémorisé, effectifs comparables malgré filtre semestriel et quatre onglets du Lab. Captures inspectées visuellement. Le script scripts/check-predictive-browser.mjs accepte en arguments le chemin du module Playwright, l’URL locale et le canal navigateur optionnel. Les captures générées restent hors commit.

Formats annuels reconnus : 2026-2027 (formulaire existant), 2026/2027 et 2026/27. Les étiquettes d’année non interprétables peuvent servir au périmètre officiel exact mais ne sont pas devinées pour sélectionner des années antérieures. Les poids sont normalisés en espace logarithmique pour éviter les débordements et sous-flux numériques.

## Correctif Gym et paramètres persistants

Les niveaux Gym1, Gym2, Gym3, Gym 4 (et Gymnase suivi d’un numéro) sont reconnus comme une séquence distincte des années calendaires. Ils étaient auparavant ignorés, y compris dans le panneau d’association. Les associations interannuelles restent explicites ; les évaluations futures restent exclues du backtesting.

Les paramètres de simulation sont enregistrés automatiquement en localStorage par compte, année et matière. Chaque plan garde les identifiants des évaluations déjà observées. À l’ajout de nouveaux identifiants dans l’année et la matière, le restant diminue une seule fois, jusqu’à zéro. Les coefficients saisis sont conservés. Une modification de note, un rechargement ou la restauration d’un identifiant connu ne consomment pas une autre évaluation. Les notes archivées d’autres années et exclues du bulletin ne consomment pas le plan annuel. Les paramètres sont immédiatement utilisés par la simulation ; le bouton de recalcul reste disponible.

La sauvegarde reste propre au navigateur et à l’appareil. L’API fournit des IDs stables ; pour les imports sans ID, created_date puis une empreinte date/note/coefficient servent de secours, moins robuste aux modifications. Les plans ne peuvent suivre les ajouts que depuis leur première création sur cet appareil.

Validation de ce correctif : 42 tests Node réussis, ESLint ciblé réussi, build réussi (avertissement habituel de taille du bundle). Edge headless à 390 et 1440 px : historique Gym2 vers Gym3 après association explicite, sauvegarde restant et coefficient au rechargement, passage de 4 à 3 après ajout, maintien à 3 après rechargement/modification/suppression de la note, isolation entre années et comptes, comparaison annuelle et onglets Lab.

## Associations automatiques et années libres (remplace les restrictions précédentes)

À la demande explicite de l’utilisateur, les anciennes matières sans identifiant stable sont désormais associées automatiquement lorsque leur nom correspond après normalisation Unicode, casse et espaces. Aucune approximation phonétique, suppression d’accent ou similarité partielle n’est utilisée. Les IDs stables restent prioritaires ; deux IDs distincts ne sont pas rapprochés par leur nom. Les choix manuels de renommage restent prioritaires et une option « Ne pas utiliser » isole une matière historique. Les associations déjà sauvegardées sont réutilisées.

Aucun format de libellé d’année n’est désormais exigé. Le texte de l’année sert uniquement au périmètre exact du bulletin. Les notes historiques portent un autre libellé et doivent être strictement antérieures à la première note datée observable de l’année analysée. La frontière est établie à partir des seules données admissibles déjà observables ; dans le backtesting, ni les dates ni les valeurs des notes futures ne peuvent la déplacer. Les cohortes qui se chevauchent sont traitées conservativement : les notes d’un autre libellé postérieures au début de l’année analysée ne sont pas considérées comme historiques. L’année active par défaut est choisie par la date d’évaluation la plus récente connue, sans classement alphabétique des libellés.

Un autre blocage est corrigé : avec une ou deux notes datées annuelles et un historique associé, le modèle ne renvoie plus null. Il conserve un plancher de dispersion de 1 et n’utilise pas de pente avant trois observations annuelles. L’influence historique reste plafonnée à 25 %. Il faut toujours au moins une note annuelle datée ; les cas sans date annuelle sont signalés explicitement. Les anciennes notes correspondantes dont la date est absente ou invalide sont comptées dans un avertissement distinct, pas dans le nombre utilisé. Le compteur d’historique déduplique les références partagées entre modèles de matières. Le backtesting comparatif conserve trois notes annuelles minimales pour que les deux modèles aient les mêmes cibles.

Le mode automatique peut associer des homonymes parmi les anciennes matières sans ID : ce choix fonctionnel est désormais autorisé par l’utilisateur et peut être corrigé dans Insights. Il ne fait pas preuve de continuité pédagogique ; la calibration et la faible influence du prior restent importantes. Les notes sans dates valides ne sont pas inventées comme anciennes.

Validation du mode automatique et des libellés libres : 50 tests Node réussis, ESLint ciblé et diff-check sans erreur, build Vite réussi avec l’avertissement de taille habituel. Edge headless / Playwright à 390 et 1440 px : association automatique sans intervention, association manuelle et opt-out avec une seule note actuelle, retour à l’historique actif, paramètres persistants, décrément 4 → 3 et Lab. Captures inspectées visuellement.
