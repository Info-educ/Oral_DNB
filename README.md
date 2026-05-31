# Gestion de l'Oral du DNB

Outil de gestion de l'oral du Diplôme National du Brevet — Collège Joliot Curie, Bagneux.
Application web statique, sans serveur, sans installation. Fonctionne entièrement dans le navigateur.

---

## Prérequis

- Chrome ou Edge (Windows)
- Connexion internet au premier chargement (pour SheetJS, bibliothèque d'import Excel)
- Hébergement : GitHub Pages ou simple dossier local

---

## Structure des fichiers

```
index.html          — Page principale, toute l'interface
css/style.css       — Styles de l'application
js/data.js          — Modèle de données, import/export Excel et JSON
js/ui.js            — Interface, formulaires, drag & drop
js/affectation.js   — Moteur d'affectation automatique
js/print.js         — Génération des documents imprimables
```

---

## Utilisation — flux standard

**1. Paramètres** (s'ouvre automatiquement au premier lancement)
Renseigner la plage horaire, les durées de passage, les pauses, le nom de l'établissement, la date de l'épreuve.

**2. Import Excel**
Cliquer sur **📥 Importer Excel** dans la barre latérale et sélectionner le fichier DNB_Oral.
Le fichier doit contenir deux feuilles : `Élèves` et `Jurys`.
Un modèle vierge est téléchargeable via **📋 Modèle Excel vierge**.

**3. Vérification**
Contrôler les onglets **Jurys** et **Élèves**. Des ajouts ou corrections manuelles sont possibles via les boutons `+` et `✏`.

**4. Affectation**
Aller dans l'onglet **Affectation** et cliquer sur **⚡ Lancer l'affectation**.
L'algorithme respecte la langue vivante, les binômes, les aménagements (tiers-temps), les passages prioritaires et les pauses.
Les créneaux sont ensuite déplaçables à la main par glisser-déposer ou via le bouton ⇄.

**5. Impressions**
Aller dans l'onglet **Impressions** et choisir le document souhaité.

| Document | Format | Usage |
|---|---|---|
| Convocations élèves | A4 | Une page par candidat, avec heure et consignes |
| Convocations jurys | A4 | Planning complet par jury |
| Récapitulatif candidats | A4 | Tous les élèves par jury |
| Feuille d'émargement | A4 | Tableau de signatures par jury |
| Consignes jury | A4 | Rappels réglementaires et déroulement |
| Listing alphabétique | A3 | Affichage dans le hall |
| Affiches portes de salle | A4 paysage | Numéro jury et salle en très grand |

**6. Sauvegarde**
Cliquer sur **💾 Sauvegarder** pour exporter la session en JSON.
Ce fichier permet de restaurer la session l'année suivante via **📂 Restaurer**.

---

## Contraintes d'affectation

- Un élève avec une langue vivante est affecté uniquement à un jury de même langue.
- Un élève sans langue peut être affecté à n'importe quel jury.
- Les binômes passent ensemble, dans le même créneau, chez le même jury.
- Les aménagements tiers-temps allongent la durée : `durée × 4/3`, arrondie au multiple de 5 minutes supérieur.
- Les passages prioritaires sont placés en premiers créneaux.

---

## Paramètres configurables

| Paramètre | Défaut |
|---|---|
| Durée solo | 25 min |
| Durée binôme | 35 min |
| Marge entre passages | 0 min |
| Convocation avant passage | 15 min |
| Pause 1 (matin) | 10h00, 15 min |
| Pause 2 (méridienne) | 12h00, 60 min |
| Pause 3 (après-midi) | désactivée |

---

## Paramètres d'impression

Accessibles via **🎨 Paramètres d'impression** dans l'onglet Impressions.
Permettent de configurer : logo de l'établissement, signataire et sa signature, colonnes affichées dans chaque document, consignes personnalisées.
Ces paramètres sont sauvegardés dans la session JSON.

---

## Conformité RGPD

Aucune donnée ne quitte le navigateur. Pas de serveur, pas d'API externe, pas de cookie.
La seule connexion réseau est le chargement de la bibliothèque SheetJS depuis `cdn.sheetjs.com` au démarrage.
Le fichier JSON de session peut contenir une image de signature — conserver ce fichier dans un endroit sûr.

---

## Versions

| Version | Fichiers | Changements principaux |
|---|---|---|
| Rev.11 | Actuelle | Suppression des logs de debug, nettoyage du code mort, tri des créneaux après DnD, modal paramètres conditionnelle au démarrage, avertissement export JSON avec signature |
| Rev.10 | — | Bandeau de garde en première page d'impression |
| Rev.9 | — | Correction page blanche Chrome/Edge à l'impression |
| Rev.8 | — | Corrections bugs suppression jury/élève, DnD capacité, éditeur consignes |

---

## Développement

Outil développé par la direction du Collège Joliot Curie (Bagneux, académie de Versailles).
Stack : HTML + CSS + JavaScript vanilla, sans framework, sans build.
Stockage : import/export fichier JSON. Impression via `window.open()` et CSS `@media print`.
Hébergement : GitHub Pages via interface navigateur (pas de CLI nécessaire).
